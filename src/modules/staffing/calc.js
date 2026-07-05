// Shared staffing calculation — extraído de Staffing.jsx para reusar desde
// otros módulos (ej: Horarios › Cobertura).
//
// calcStaff(totalPax, vipPax, excPax, ovrMap, config?) → { valle, pico, ... }
//
// La estructura de 9 roles + valle/pico + cruce Playa→Restaurante en
// movimiento se mantiene en código. Los UMBRALES son configurables
// desde staffing_config (JSONB) — ver setStaffingConfig() abajo.
// Si config es null, se usa DEFAULT_STAFFING_CONFIG (misma que estaba
// hardcoded antes).

export const DEFAULT_STAFFING_CONFIG = {
  apertura_minima_pax: 20,
  movimiento_max_pax: 80,
  umbrales_ocupacion: [
    { nombre: "Cerrado", hasta_pax: 0, color: "#6B7280" },
    { nombre: "Apertura", hasta_pax: 20, color: "#94A3B8" },
    { nombre: "Bajo", hasta_pax: 60, color: "#10B981" },
    { nombre: "Medio", hasta_pax: 80, color: "#F59E0B" },
    { nombre: "Alto", hasta_pax: 999, color: "#EF4444" },
  ],
  roles: {
    mesPlaya:   { label: "Mesero Playa",       orden: 1, variable: "vip_pax",       min_apertura: 1, pax_por_mesero: 20, max_valle: 3, fijo_pax_alto: 4, delta_pico_movimiento: -1 },
    mesPool:    { label: "Mesero Pool",        orden: 2, variable: "exclusive_pax", min_apertura: 1, umbrales_pax: [{hasta:10,cant:1},{hasta:30,cant:2},{hasta:999,cant:3}] },
    mesRest:    { label: "Mesero Restaurante", orden: 3, variable: "pax_total",     min_apertura: 1, umbrales_pax: [{hasta:80,cant:1},{hasta:999,cant:4}], delta_pico_movimiento: 1 },
    runnersBeb: { label: "Runner Bebidas",     orden: 4, variable: "pax_total",     umbrales_pax: [{hasta:60,cant:1},{hasta:80,cant:2},{hasta:999,cant:3}] },
    runnersCom: { label: "Runner Comida",      orden: 5, variable: "pax_total",     solo_pico: true, umbrales_pax: [{hasta:20,cant:0},{hasta:80,cant:1},{hasta:999,cant:2}] },
    bussers:    { label: "Bussers",            orden: 6, variable: "pax_total",     umbrales_pax: [{hasta:20,cant:0},{hasta:60,cant:1},{hasta:999,cant:2}] },
    bartenders: { label: "Bartenders",         orden: 7, variable: "pax_total",     umbrales_pax: [{hasta:60,cant:1},{hasta:999,cant:2}] },
    supervisor: { label: "Supervisor",         orden: 8, variable: "pax_total",     umbrales_pax: [{hasta:999,cant:1}] },
    hostess:    { label: "Hostess",            orden: 9, variable: "pax_total",     umbrales_pax: [{hasta:20,cant:0},{hasta:80,cant:1},{hasta:999,cant:2}] },
  },
};

// Cache global — se hidrata desde BD al cargar el módulo Staffing.
// Antes de la hidratación, se usa DEFAULT (mismo comportamiento que hardcoded).
let CURRENT_CONFIG = DEFAULT_STAFFING_CONFIG;
export function setStaffingConfig(cfg) {
  if (cfg && typeof cfg === "object") CURRENT_CONFIG = cfg;
}
export function getStaffingConfig() {
  return CURRENT_CONFIG;
}

// Aplicar umbrales_pax escalonados: encuentra el primer bucket cuyo `hasta` >= valor.
function umbralValor(umbrales, valor) {
  if (!Array.isArray(umbrales)) return 0;
  for (const u of umbrales) {
    if (valor <= (Number(u.hasta) || 0)) return Number(u.cant) || 0;
  }
  return Number(umbrales[umbrales.length - 1]?.cant) || 0;
}

// Calcular raw para un rol dado según su config.
function calcRolRaw(cfg, roleKey, totalPax, vipPax, excPax) {
  const r = cfg.roles?.[roleKey];
  if (!r) return 0;
  const pax = Math.max(totalPax, cfg.apertura_minima_pax || 20);
  const isApertura = totalPax === 0;
  const variable = r.variable === "vip_pax" ? vipPax : r.variable === "exclusive_pax" ? excPax : pax;
  // Apertura: si hay min_apertura y no hay demanda de la variable, aplica el min.
  if (isApertura) {
    if (r.min_apertura != null) return r.min_apertura;
  }
  // Si la variable específica es 0 y hay min_apertura → 0 (no hay demanda de ese rol).
  if (r.variable && r.variable !== "pax_total" && variable === 0 && !isApertura) return 0;
  // Fórmula especial mesPlaya: min(max_valle, ceil(vip/pax_por_mesero)) hasta 80, luego fijo_pax_alto.
  if (r.pax_por_mesero) {
    if (pax > (cfg.movimiento_max_pax || 80)) return r.fijo_pax_alto || 4;
    return Math.min(r.max_valle || 3, Math.ceil(variable / r.pax_por_mesero));
  }
  // Umbrales escalonados por variable.
  return umbralValor(r.umbrales_pax || [], variable);
}

export function calcStaff(totalPax, vipPax, excPax, ovrMap = {}, cfg = null) {
  const C = cfg || CURRENT_CONFIG;
  const pax = Math.max(totalPax, C.apertura_minima_pax || 20);
  const raw = {};
  Object.keys(C.roles || {}).forEach(k => {
    raw[k] = calcRolRaw(C, k, totalPax, vipPax, excPax);
  });

  const applied = {};
  Object.keys(raw).forEach(k => {
    applied[k] = ovrMap[k] !== undefined ? ovrMap[k] : raw[k];
  });

  const hayMovimiento = pax <= (C.movimiento_max_pax || 80) && totalPax > 0;

  // Valle: cantidad base. Si un rol tiene solo_pico=true, en valle es 0.
  const valle = {};
  const pico = {};
  Object.keys(C.roles || {}).forEach(k => {
    const r = C.roles[k];
    const base = applied[k];
    valle[k] = r.solo_pico ? 0 : base;
    // Pico: aplicar delta_pico_movimiento si hayMovimiento; si no, mantiene base.
    const delta = r.delta_pico_movimiento || 0;
    pico[k] = hayMovimiento ? Math.max(0, base + delta) : base;
  });

  const totalValle = Object.values(valle).reduce((s, v) => s + v, 0);
  const totalPico  = Object.values(pico).reduce((s, v) => s + v, 0);

  return { valle, pico, totalValle, totalPico, hayMovimiento, raw, applied };
}

// Fetch reservas + overrides para una fecha, correr calcStaff, devolver todo.
// Retorna: { totalPax, vipPax, excPax, overrides, valle, pico, hayMovimiento,
//   totalValle, totalPico, raw, applied }
export async function fetchStaffingForDate(supabase, dateISO) {
  if (!supabase || !dateISO) {
    return { totalPax: 0, vipPax: 0, excPax: 0, overrides: [], valle: {}, pico: {}, hayMovimiento: false, totalValle: 0, totalPico: 0, raw: {}, applied: {} };
  }
  const [resR, ovrR, proyR] = await Promise.all([
    supabase.from("reservas")
      .select("tipo, pax, estado")
      .eq("fecha", dateISO)
      .in("estado", ["confirmado", "pendiente"]),
    supabase.from("staffing_overrides").select("*").eq("date", dateISO),
    supabase.from("staffing_proyecciones").select("*").eq("date", dateISO).maybeSingle(),
  ]);

  const reservas = resR.data || [];
  const overrides = ovrR.data || [];

  const totalPaxReal = reservas.reduce((s, r) => s + (r.pax || 0), 0);
  const vipPaxReal = reservas
    .filter(r => ["VIP Pass", "Atolon Experience"].includes(r.tipo))
    .reduce((s, r) => s + (r.pax || 0), 0);
  const excPaxReal = reservas
    .filter(r => r.tipo === "Exclusive Pass")
    .reduce((s, r) => s + (r.pax || 0), 0);

  const proyHoy = proyR.data?.pax_proyectado || 0;
  const totalPax = Math.max(totalPaxReal, proyHoy);
  const usaProy = proyHoy > totalPaxReal && proyHoy > 0;
  const projVipSplit = usaProy ? Math.round(totalPax * 0.8) : vipPaxReal;
  const projExcSplit = usaProy ? totalPax - projVipSplit : excPaxReal;
  const vipPax = Math.max(vipPaxReal, projVipSplit);
  const excPax = Math.max(excPaxReal, projExcSplit);

  const ovrMap = {};
  overrides.forEach(o => { ovrMap[o.role] = o.quantity_override; });

  const staff = calcStaff(totalPax, vipPax, excPax, ovrMap);
  return { totalPax, vipPax, excPax, overrides, ...staff };
}
