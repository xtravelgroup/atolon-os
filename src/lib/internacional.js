// Internacional — Capa unificada de pagos con tarjeta internacional
// Decide dinámicamente entre Stripe y Zoho Pay según configuracion.merchant_internacional
//
// Uso desde cualquier módulo:
//   import { crearSesionPago } from "../lib/internacional";
//   const { url } = await crearSesionPago({
//     amount: 120,
//     currency: "USD",
//     reference: "RES-1234",
//     description: "Pasadía VIP",
//     email: "cliente@ejemplo.com",
//     context: "reserva",         // 'pedido' | 'reserva' | 'evento' | 'estancia'
//     context_id: "uuid-del-recurso",
//   });
//   window.location.href = url;

import { supabase } from "./supabase";

let _cachedConfig = null;
let _cachedAt = 0;
const CACHE_MS = 60_000; // 1 min

async function loadConfig() {
  const now = Date.now();
  if (_cachedConfig && now - _cachedAt < CACHE_MS) return _cachedConfig;
  if (!supabase) return {};
  const { data } = await supabase
    .from("configuracion")
    .select("merchant_internacional, zoho_pay_merchant_name, stripe_pub_key, zoho_pay_client_id, zoho_pay_currency")
    .eq("id", "atolon")
    .single();
  _cachedConfig = data || {};
  _cachedAt = now;
  return _cachedConfig;
}

/**
 * Retorna qué merchant está activo y está configurado
 * @returns { activo: "stripe" | "zoho_pay" | "ninguno", nombre_cargo: string }
 */
export async function getMerchantInternacional() {
  const cfg = await loadConfig();
  // Política: SIEMPRE usar Zoho Pay para pagos internacionales.
  // Stripe queda deshabilitado globalmente.
  const zohoOk = !!cfg.zoho_pay_client_id;
  const activo = zohoOk ? "zoho_pay" : "ninguno";
  return {
    activo,
    nombre_cargo: activo === "zoho_pay" ? (cfg.zoho_pay_merchant_name || "X Travel Group") : null,
    moneda_default: "USD",
  };
}

/**
 * Retorna true si el merchant activo para pagos internacionales requiere mostrar
 * un aviso del nombre del cargo (ej: Zoho Pay → "X Travel Group")
 */
export async function avisoCargoMerchant() {
  const m = await getMerchantInternacional();
  return m.nombre_cargo; // null si no hace falta aviso
}

/**
 * Crea una sesión de pago en el merchant activo y retorna la URL de checkout.
 * @param {Object} opts
 * @param {number} opts.amount       — monto en la moneda indicada (números, no cents)
 * @param {string} opts.currency     — "USD" | "EUR" | "COP" | ...
 * @param {string} opts.reference    — referencia única (ej: código de reserva/pedido)
 * @param {string} opts.description  — texto corto mostrado al cliente
 * @param {string} [opts.email]      — email del cliente (opcional)
 * @param {string} [opts.context]    — 'pedido' | 'reserva' | 'evento' | 'estancia'
 * @param {string} [opts.context_id] — id del recurso para actualizar al pagar
 * @returns {Promise<{ url: string, provider: string, session_id: string }>}
 */
export async function crearSesionPago(opts) {
  // Política: siempre Zoho Pay
  return crearSesionZoho(opts);
}

// Zoho Payments — usa la función propia de Atolón. Antes había un fallback a
// minivac, pero esa función cambió a la API de Payment Sessions (embebida) que
// no devuelve URL de checkout, así que rompía el flujo. Ahora si el atolon
// function falla, devolvemos el error directo para diagnóstico.
const ATOLON_FN = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zoho-payments/create-session`;

async function crearSesionZoho(opts) {
  const payloadAtolon = {
    amount: Number(opts.amount),
    currency: opts.currency || "USD",
    reference: opts.reference || `ATOLON-${Date.now()}`,
    description: opts.description || `Atolon Beach Club${opts.nombre ? ` - ${opts.nombre}` : ""}`,
    nombre: opts.nombre || "",
    email: opts.email || undefined,
    context: opts.context || null,
    context_id: opts.context_id || null,
  };

  let res, data;
  try {
    res = await fetch(ATOLON_FN(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payloadAtolon),
    });
    data = await res.json();
  } catch (err) {
    throw new Error("No se pudo conectar a Zoho Pay: " + (err?.message || err));
  }

  if (data.payment_url) {
    return {
      url: data.payment_url,
      provider: "zoho_pay",
      session_id: data.payment_link_id || data.payments_session_id || "",
    };
  }

  // Mostrar el error real al cliente (sin fallback que enmascara el problema)
  const errMsg = data.error || JSON.stringify(data);
  throw new Error("Zoho Pay: " + errMsg);
}

async function crearSesionStripe(opts) {
  // Reusa la Edge Function de Stripe existente (create-stripe-session)
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-stripe-session`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      reserva_id: opts.reference,
      total_cop: Number(opts.amount),  // Stripe function expects COP
      nombre: opts.nombre || "",
      email: opts.email || "",
      tipo: opts.description || "Atolón Beach Club",
      fecha: opts.fecha || null,
    }),
  });
  const data = await res.json();
  if (!data.url) {
    throw new Error("Error Stripe: " + (data.error || JSON.stringify(data)));
  }
  return {
    url: data.url,
    provider: "stripe",
    session_id: data.session_id || "",
  };
}

/**
 * Invalida el cache — llamar después de cambiar el merchant en Configuración
 */
export function invalidarCacheMerchant() {
  _cachedConfig = null;
  _cachedAt = 0;
}
