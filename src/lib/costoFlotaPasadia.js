// costoFlotaPasadia.js — calculo del costo REAL por pasadía para un mes dado.
// Replica exactamente la fórmula de CostosFlotaTab.jsx (la que muestra
// Naturalle en su bitácora) para garantizar consistencia 1:1 entre módulos.
//
// Costo por pasadía = costos_totales / pax_que_llegaron
//   costos_totales = combustible + mantenimiento + marina + capitanes + reserva_motores
//   pax = solo pax_a + pax_n de muelle_llegadas (sin staff, sin boca_chica)
//
// Filtro lanchas: por default solo pasadía (tipo_uso !== "servicio") — así
// Castillete (servicio interno staff/insumos) no contamina el costo.

import { supabase } from "./supabase";

const TIPOS_MANT = ["mantenimiento", "reparacion", "inspeccion", "limpieza"];
const normN = (s) => (s || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/(.)\1+/g, "$1").trim();
const sumH = (h) => Number(h?.babor || 0) + Number(h?.estribor || 0) + Number(h?.centro || 0);

/**
 * @param {string} mes — "YYYY-MM"
 * @param {object} opts
 * @param {boolean} [opts.soloPasadia=true] — excluir lanchas tipo_uso=servicio
 * @returns {Promise<{ costoPorPasadia: number, costoTotal: number, pax: number, breakdown: object, mes: string, sinDatos: boolean }>}
 */
export async function calcCostoPasadiaMes(mes, opts = {}) {
  const { soloPasadia = true } = opts;
  if (!supabase) return _empty(mes);

  // Fetch lanchas + datos del mes en paralelo. Calcular último día REAL del
  // mes (no usar "31" hardcoded — Postgres rechaza "2026-04-31" como
  // out_of_range, lo que dejaba data=null y todos los cálculos en 0).
  const [yearStr, monthStr] = mes.split("-");
  const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate(); // 28/29/30/31
  const desdeMes = `${mes}-01`;
  const hastaMes = `${mes}-${String(lastDay).padStart(2, "0")}`;
  const [
    { data: lanchas },
    { data: bitacora },
    { data: zarpes },
    { data: llegadas },
    { data: capitanes },
  ] = await Promise.all([
    supabase.from("lanchas").select("*").eq("activo", true),
    supabase.from("lancha_bitacora")
      .select("lancha_id, fecha, tipo, costo_total, galones")
      .gte("fecha", desdeMes).lte("fecha", hastaMes).limit(2000),
    supabase.from("muelle_zarpes_flota")
      .select("fecha, hora_zarpe, embarcacion, pax_a, pax_n, motores_horas, boca_chica")
      .gte("fecha", desdeMes).lte("fecha", hastaMes).limit(2000),
    supabase.from("muelle_llegadas")
      .select("fecha, hora_llegada, embarcacion_nombre, tipo, pax_a, pax_n, motores_horas, boca_chica")
      .gte("fecha", desdeMes).lte("fecha", hastaMes)
      .in("tipo", ["lancha_atolon", "lanchas_atolon"])
      .limit(2000),
    supabase.from("capitanes_flota").select("*").eq("activo", true),
  ]);

  // Filtro: solo lanchas de pasadía (excluye Castillete = servicio)
  const lanchasFiltradas = (lanchas || []).filter(l => !soloPasadia || l.tipo_uso !== "servicio");
  const lanchaIds = new Set(lanchasFiltradas.map(l => l.id));
  const nombresNorm = new Set(lanchasFiltradas.map(l => normN(l.nombre)));

  // Filtrar datos solo a lanchas de pasadía
  const bMes = (bitacora || []).filter(b => lanchaIds.has(b.lancha_id));
  const zMes = (zarpes || []).filter(z => nombresNorm.has(normN(z.embarcacion)) && !z.boca_chica);
  const lMes = (llegadas || []).filter(l => nombresNorm.has(normN(l.embarcacion_nombre)) && !l.boca_chica);
  const capsFiltrados = (capitanes || []).filter(c => lanchaIds.has(c.lancha_id));

  // ── Costos del mes ────────────────────────────────────────────────
  const costoComb        = bMes.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.costo_total || 0), 0);
  const galones          = bMes.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.galones || 0), 0);
  const costoMant        = bMes.filter(b => TIPOS_MANT.includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
  const costoMarina      = bMes.filter(b => b.tipo === "marina").reduce((s, b) => s + Number(b.costo_total || 0), 0);
  const costoCapTerceros = bMes.filter(b => b.tipo === "capitanes").reduce((s, b) => s + Number(b.costo_total || 0), 0);
  const costoCapNomina   = capsFiltrados.filter(c => c.tipo === "nomina").reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
  const costoCapitanes   = costoCapTerceros + costoCapNomina;

  // Reserva motores: horas de uso del mes × tarifa por hora de cada lancha
  // (incluye boca_chica para horas-motor — el motor sí se gastó)
  const zMesAll = (zarpes || []).filter(z => nombresNorm.has(normN(z.embarcacion)));
  const lMesAll = (llegadas || []).filter(l => nombresNorm.has(normN(l.embarcacion_nombre)));
  const horasUsoPorLancha = {};
  lanchasFiltradas.forEach(l => {
    const target = normN(l.nombre);
    const reads = [
      ...zMesAll.filter(z => z.motores_horas && normN(z.embarcacion) === target)
            .map(z => ({ fecha: z.fecha, hora: z.hora_zarpe, motores_horas: z.motores_horas })),
      ...lMesAll.filter(x => x.motores_horas && normN(x.embarcacion_nombre) === target)
            .map(x => ({ fecha: x.fecha, hora: x.hora_llegada, motores_horas: x.motores_horas })),
    ].sort((a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || "")));
    if (reads.length < 2) { horasUsoPorLancha[l.id] = 0; return; }
    const first = sumH(reads[0].motores_horas);
    const last  = sumH(reads[reads.length - 1].motores_horas);
    horasUsoPorLancha[l.id] = Math.max(0, last - first);
  });
  const reservaMotores = lanchasFiltradas.reduce((s, l) =>
    s + (horasUsoPorLancha[l.id] || 0) * Number(l.motor_reserva_por_hora || 0), 0);

  const costoTotal = costoComb + costoMant + costoMarina + costoCapitanes + reservaMotores;
  // PAX: solo llegadas (sin staff, sin boca_chica) — misma regla que Lancha
  const pax = lMes.reduce((s, l) => s + Number(l.pax_a || 0) + Number(l.pax_n || 0), 0);
  const costoPorPasadia = pax > 0 ? costoTotal / pax : 0;
  const sinDatos = costoTotal === 0 && pax === 0;

  return {
    costoPorPasadia,
    costoTotal,
    pax,
    mes,
    sinDatos,
    breakdown: { costoComb, galones, costoMant, costoMarina, costoCapitanes, reservaMotores },
  };
}

/**
 * Mes calendario anterior en hora Colombia (UTC-5).
 * @returns {{ ym: string, label: string }}
 */
export function mesAnteriorBogotaYM() {
  const ahora  = new Date();
  const bogota = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const ultimoMesAnt = new Date(bogota.getFullYear(), bogota.getMonth(), 0);
  const ym = `${ultimoMesAnt.getFullYear()}-${String(ultimoMesAnt.getMonth() + 1).padStart(2, "0")}`;
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return { ym, label: `${meses[ultimoMesAnt.getMonth()]} ${ultimoMesAnt.getFullYear()}` };
}

/**
 * Costo por pasadía del mes anterior, con fallback a meses previos si está vacío.
 * Devuelve también qué mes específicamente se usó.
 */
export async function calcCostoPasadiaMesAnterior(opts = {}) {
  const { ym, label } = mesAnteriorBogotaYM();
  let res = await calcCostoPasadiaMes(ym, opts);
  res.mesLabel = label;
  res.fallback = false;

  // Fallback: si no hay datos, retroceder hasta 3 meses
  if (res.sinDatos) {
    for (let i = 2; i <= 4; i++) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const ymPrev = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
      const labelPrev = `${meses[d.getMonth()]} ${d.getFullYear()}`;
      const r = await calcCostoPasadiaMes(ymPrev, opts);
      if (!r.sinDatos) {
        res = { ...r, mesLabel: labelPrev, fallback: true };
        break;
      }
    }
  }
  return res;
}

function _empty(mes) {
  return {
    costoPorPasadia: 0, costoTotal: 0, pax: 0, mes, sinDatos: true,
    breakdown: { costoComb: 0, galones: 0, costoMant: 0, costoMarina: 0, costoCapitanes: 0, reservaMotores: 0 },
  };
}
