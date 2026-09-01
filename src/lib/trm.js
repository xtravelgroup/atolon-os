// TRM oficial COP/USD + tasa efectiva de cobro para Zoho/Stripe.
//
// Flujo:
//   1) Intenta leer TRM oficial cacheada del día en `configuracion` (BD).
//   2) Si no está o es de otro día, consulta datos.gov.co (SuperFinanciera).
//   3) Cachea el resultado en `configuracion.trm_oficial` + `_fecha`.
//   4) Aplica el ajuste en pesos (`trm_ajuste_pesos`, default 100) y
//      devuelve { trm_oficial, ajuste, tasa_efectiva }.
//
// Uso: siempre llamar antes de calcular monto USD para Zoho/Stripe.

import { supabase } from "./supabase";

const TRM_URL = "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC";
const TRM_TIMEOUT_MS = 4000;

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Trae la TRM oficial de datos.gov.co (SuperFinanciera).
 * @returns {Promise<number|null>} valor en COP/USD o null si falla.
 */
async function fetchTRMOficial() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TRM_TIMEOUT_MS);
    const r = await fetch(TRM_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const data = await r.json();
    const v = Number(data?.[0]?.valor);
    return Number.isFinite(v) && v > 1000 ? v : null;
  } catch (e) {
    console.warn("[trm] fetch datos.gov.co falló:", e?.message);
    return null;
  }
}

/**
 * Retorna la TRM oficial y la tasa efectiva de cobro para hoy.
 *
 * @returns {Promise<{
 *   trm_oficial: number,
 *   ajuste: number,
 *   tasa_efectiva: number,
 *   fecha: string,
 *   fuente: 'datos.gov.co' | 'cache_bd' | 'fallback_config'
 * }>}
 * @throws si no se puede obtener ninguna TRM (ni oficial, ni cache, ni fallback).
 */
export async function getTRMHoy() {
  // 1) Leer configuración actual (cache + ajuste + fallback manual)
  const { data: cfg } = await supabase
    .from("configuracion")
    .select("trm_oficial, trm_oficial_fecha, trm_ajuste_pesos, tasa_usd")
    .eq("id", "atolon")
    .single();

  const ajuste = Number(cfg?.trm_ajuste_pesos ?? 100);
  const hoy = todayISO();
  const cacheVigente =
    cfg?.trm_oficial &&
    cfg?.trm_oficial_fecha &&
    String(cfg.trm_oficial_fecha).slice(0, 10) === hoy;

  // 2) Si el cache es de hoy, usarlo (evita hits repetidos)
  if (cacheVigente) {
    const trm = Number(cfg.trm_oficial);
    return {
      trm_oficial:   trm,
      ajuste,
      tasa_efectiva: trm - ajuste,
      fecha:         hoy,
      fuente:        "cache_bd",
    };
  }

  // 3) Refrescar desde datos.gov.co
  const trmFresh = await fetchTRMOficial();
  if (trmFresh) {
    // Persistir cache (no bloqueante — no importa si falla el update)
    supabase.from("configuracion")
      .update({ trm_oficial: trmFresh, trm_oficial_fecha: hoy })
      .eq("id", "atolon")
      .then(() => {}, () => {});
    return {
      trm_oficial:   trmFresh,
      ajuste,
      tasa_efectiva: trmFresh - ajuste,
      fecha:         hoy,
      fuente:        "datos.gov.co",
    };
  }

  // 4) Fallback: cache de días anteriores o tasa_usd manual de configuración
  if (cfg?.trm_oficial) {
    const trm = Number(cfg.trm_oficial);
    return {
      trm_oficial:   trm,
      ajuste,
      tasa_efectiva: trm - ajuste,
      fecha:         String(cfg.trm_oficial_fecha || "").slice(0, 10),
      fuente:        "cache_bd",
    };
  }
  if (cfg?.tasa_usd) {
    const trm = Number(cfg.tasa_usd);
    return {
      trm_oficial:   trm,
      ajuste:        0,
      tasa_efectiva: trm,
      fecha:         hoy,
      fuente:        "fallback_config",
    };
  }

  throw new Error(
    "No se pudo obtener la TRM oficial. Verifica conexión a datos.gov.co o setea configuracion.tasa_usd."
  );
}

/**
 * Convierte COP → USD usando la tasa efectiva del día.
 * Redondea el USD hacia arriba (nunca cobrar menos).
 *
 * @returns {Promise<{ amountUSD: number, tasa_efectiva: number, trm_oficial: number, ajuste: number, fuente: string }>}
 */
export async function convertirCopAUsd(copAmount) {
  const cop = Number(copAmount);
  if (!Number.isFinite(cop) || cop <= 0) {
    throw new Error("Monto COP inválido para convertir a USD");
  }
  const trm = await getTRMHoy();
  const amountUSD = Math.ceil(cop / trm.tasa_efectiva);
  return {
    amountUSD,
    tasa_efectiva: trm.tasa_efectiva,
    trm_oficial:   trm.trm_oficial,
    ajuste:        trm.ajuste,
    fuente:        trm.fuente,
  };
}
