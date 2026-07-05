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
    mesPlaya:   { label: "Mesero Playa",       orden: 1, variable: "vip_pax",       min_apertura: 1, umbrales_pax: [{hasta:16,cant:1},{hasta:49,cant:2},{hasta:60,cant:3}], escalar_despues: {desde_pax:60,cada_pax:20,suma_cantidad:1} },
    mesPool:    { label: "Mesero Piscina",     orden: 2, variable: "exclusive_pax", min_apertura: 1, umbrales_pax: [{hasta:10,cant:1},{hasta:23,cant:2},{hasta:36,cant:3}], escalar_despues: {desde_pax:36,cada_pax:12,suma_cantidad:1} },
    mesRest:    { label: "Mesero Restaurante", orden: 3, variable: "pax_total",     min_apertura: 1, umbrales_pax: [{hasta:999,cant:1}], delta_pico_movimiento: 1 },
    runnersBeb: { label: "Runners",            orden: 4, variable: "pax_total",     umbrales_pax: [{hasta:19,cant:0},{hasta:39,cant:1},{hasta:79,cant:2},{hasta:130,cant:3}], escalar_despues: {desde_pax:130,cada_pax:50,suma_cantidad:1} },
    bussers:    { label: "Bussers",            orden: 6, variable: "pax_total",     umbrales_pax: [{hasta:20,cant:0},{hasta:60,cant:1},{hasta:999,cant:2}] },
    bartenders: { label: "Bartenders",         orden: 7, variable: "pax_total",     umbrales_pax: [{hasta:39,cant:1},{hasta:90,cant:2}], escalar_despues: {desde_pax:90,cada_pax:50,suma_cantidad:1} },
    supervisor: { label: "Supervisor",         orden: 8, variable: "pax_total",     umbrales_pax: [{hasta:999,cant:1}] },
    hostess:    { label: "Hostess",            orden: 9, variable: "pax_total",     umbrales_pax: [{hasta:20,cant:0},{hasta:80,cant:1},{hasta:999,cant:2}] },
  },
  // Auto-horarios servicio — regla dirección 2026-07-04.
  // Entrada = f(primer pasadía del día); salida = f(último pasadía del día).
  // Aplica a Playa, Piscina y Restaurante (este último SOLO si no hay huéspedes).
  // El Gerente de Servicio puede overridear en un turno específico.
  turnos_servicio: {
    entrada_por_primer_pasadia: [
      { primer_pasadia: "08:30", entrada: "07:30" },
      { primer_pasadia: "10:00", entrada: "09:00" },
      { primer_pasadia: "11:30", entrada: "10:00" },
    ],
    salida_por_ultimo_pasadia: [
      { ultimo_pasadia: "08:30", salida: "16:30" },
      { ultimo_pasadia: "10:00", salida: "17:30" },
      { ultimo_pasadia: "11:30", salida: "18:30" },
    ],
    restaurante_usa_horario_pasadias: true, // solo aplica si no hay huéspedes
  },
  // Mínimo diario garantizado — auto-scheduler debe cumplir aunque calcStaff dé menor.
  minimo_diario: {
    mesPlaya: 1,
    mesPool: 1,
    mesRest: 1,
    bartenders: 1,
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
// Si el rol define `escalar_despues`, aplica una fórmula continua después del
// último umbral (ej. mesPlaya: hasta 60 usa umbrales; después de 60 suma 1
// mesero cada 20 pax → 80→4, 100→5, 120→6, etc.).
function umbralValor(umbrales, valor, escalarDespues) {
  if (!Array.isArray(umbrales) || umbrales.length === 0) return 0;
  for (const u of umbrales) {
    if (valor <= (Number(u.hasta) || 0)) return Number(u.cant) || 0;
  }
  const ultimo = umbrales[umbrales.length - 1];
  const baseCant = Number(ultimo.cant) || 0;
  if (escalarDespues && escalarDespues.cada_pax > 0) {
    const desde = Number(escalarDespues.desde_pax) || Number(ultimo.hasta) || 0;
    const excedente = valor - desde;
    if (excedente > 0) {
      const suma = Math.ceil(excedente / Number(escalarDespues.cada_pax)) * (Number(escalarDespues.suma_cantidad) || 1);
      return baseCant + suma;
    }
  }
  return baseCant;
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
  // Fórmula legacy mesPlaya (backward compat): min(max_valle, ceil(vip/pax_por_mesero)) hasta 80, luego fijo_pax_alto.
  if (r.pax_por_mesero) {
    if (pax > (cfg.movimiento_max_pax || 80)) return r.fijo_pax_alto || 4;
    return Math.min(r.max_valle || 3, Math.ceil(variable / r.pax_por_mesero));
  }
  // Umbrales escalonados por variable (+ opcional escalar_despues para escala continua).
  return umbralValor(r.umbrales_pax || [], variable, r.escalar_despues);
}

// Devuelve el horario de entrada según primer pasadía del día (HH:MM).
// Busca match exacto; si no, el primer tier cuyo `primer_pasadia` >= input.
export function entradaParaPrimerPasadia(primerPasadiaHHMM, cfg = null) {
  const C = cfg || CURRENT_CONFIG;
  const rules = C?.turnos_servicio?.entrada_por_primer_pasadia || [];
  if (rules.length === 0 || !primerPasadiaHHMM) return null;
  for (const r of rules) {
    if (String(r.primer_pasadia) >= String(primerPasadiaHHMM)) return r.entrada;
  }
  return rules[rules.length - 1].entrada;
}

// Devuelve el horario de salida según último pasadía del día (HH:MM).
export function salidaParaUltimoPasadia(ultimoPasadiaHHMM, cfg = null) {
  const C = cfg || CURRENT_CONFIG;
  const rules = C?.turnos_servicio?.salida_por_ultimo_pasadia || [];
  if (rules.length === 0 || !ultimoPasadiaHHMM) return null;
  for (const r of rules) {
    if (String(r.ultimo_pasadia) >= String(ultimoPasadiaHHMM)) return r.salida;
  }
  return rules[rules.length - 1].salida;
}

// Aplica minimo_diario a los roles del resultado de calcStaff.
export function aplicarMinimoDiario(applied, cfg = null) {
  const C = cfg || CURRENT_CONFIG;
  const min = C?.minimo_diario || {};
  const out = { ...applied };
  Object.keys(min).forEach(k => {
    const m = Number(min[k]) || 0;
    if ((out[k] || 0) < m) out[k] = m;
  });
  return out;
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

  // Aplicar mínimo diario si el club está operando (totalPax > 0 o hay override).
  const clubOpera = totalPax > 0 || Object.keys(ovrMap).length > 0;
  const min = (C.minimo_diario || {});
  if (clubOpera) {
    Object.keys(min).forEach(k => {
      const m = Number(min[k]) || 0;
      if ((valle[k] || 0) < m) valle[k] = m;
      if ((pico[k] || 0) < m) pico[k] = m;
    });
  }

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
