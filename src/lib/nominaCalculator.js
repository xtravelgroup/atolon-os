// nominaCalculator — cálculo de nómina basado en horas reales con recargos de
// ley Colombia. Funciones puras, testeables, sin dependencias de Supabase.
//
// Reglas Ley Colombia (Decreto 1072/2015 + reforma laboral 2025):
//   - Jornada ordinaria: 7am – 9pm (diurna desde 2026, antes era hasta 10pm)
//   - Recargo nocturno:           +35% sobre tarifa_hora ordinaria
//   - Recargo dominical/festivo:  +75% sobre tarifa_hora ordinaria
//   - Hora extra diurna:          +25% sobre tarifa_hora ordinaria
//   - Hora extra nocturna:        +75% sobre tarifa_hora ordinaria (25 + 50 = 75)
//   - Extra dominical diurna:    +100% (75 + 25)
//   - Extra dominical nocturna:  +150% (75 + 75)
//
// Jornada estándar: 8h/día, 47.5h semanales (reforma 2025). Para MVP usamos
// 8h diarias como threshold de extras — el exceso es hora extra.

// ── Festivos Colombia 2026 (Ley 51 de 1983) ──────────────────────────────────
// Lista incluye festivos trasladados al lunes (Ley Emiliani).
export const FESTIVOS_CO_2026 = new Set([
  "2026-01-01", // Año Nuevo
  "2026-01-12", // Reyes Magos (lunes)
  "2026-03-23", // San José (lunes)
  "2026-04-02", // Jueves Santo
  "2026-04-03", // Viernes Santo
  "2026-05-01", // Día del Trabajo
  "2026-05-18", // Ascensión (lunes)
  "2026-06-08", // Corpus Christi (lunes)
  "2026-06-15", // Sagrado Corazón (lunes)
  "2026-06-29", // San Pedro y San Pablo (lunes)
  "2026-07-20", // Independencia
  "2026-08-07", // Batalla de Boyacá
  "2026-08-17", // Asunción (lunes)
  "2026-10-12", // Día de la Raza (lunes)
  "2026-11-02", // Todos los Santos (lunes)
  "2026-11-16", // Independencia Cartagena (lunes)
  "2026-12-08", // Inmaculada
  "2026-12-25", // Navidad
]);

// ── Hora corte diurna/nocturna ───────────────────────────────────────────────
// Diurna: 06:00 – 21:00 (15h). Nocturna: 21:00 – 06:00 (9h).
// Reforma 2025 — antes de jul/25 era 06:00–22:00 (diurna 16h).
const DIURNA_INICIO = 6 * 60;   // minutos desde medianoche
const DIURNA_FIN    = 21 * 60;

const JORNADA_ORDINARIA_HORAS = 8;
const RECARGO_NOCTURNO        = 0.35;
const RECARGO_DOMINICAL       = 0.75;
const RECARGO_EXTRA_DIURNA    = 0.25;
const RECARGO_EXTRA_NOCTURNA  = 0.75; // 25% extra + 50% nocturno

// ── Quincena helpers ─────────────────────────────────────────────────────────
export function quincenaActual(refDate = new Date()) {
  const d = typeof refDate === "string" ? new Date(refDate + "T12:00:00") : refDate;
  const y = d.getFullYear();
  const m = d.getMonth();
  const dia = d.getDate();
  if (dia <= 15) {
    return {
      desde: isoDate(new Date(y, m, 1)),
      hasta: isoDate(new Date(y, m, 15)),
      etiqueta: `Q1 ${nombreMes(m)} ${y}`,
    };
  }
  return {
    desde: isoDate(new Date(y, m, 16)),
    hasta: isoDate(new Date(y, m + 1, 0)),   // último día del mes
    etiqueta: `Q2 ${nombreMes(m)} ${y}`,
  };
}

export function quincenaAnterior(refDate = new Date()) {
  const d = typeof refDate === "string" ? new Date(refDate + "T12:00:00") : refDate;
  const y = d.getFullYear();
  const m = d.getMonth();
  const dia = d.getDate();
  if (dia <= 15) {
    // Q2 del mes anterior
    return {
      desde: isoDate(new Date(y, m - 1, 16)),
      hasta: isoDate(new Date(y, m, 0)),
      etiqueta: `Q2 ${nombreMes(m - 1)} ${y}`,
    };
  }
  // Q1 del mes actual
  return {
    desde: isoDate(new Date(y, m, 1)),
    hasta: isoDate(new Date(y, m, 15)),
    etiqueta: `Q1 ${nombreMes(m)} ${y}`,
  };
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function nombreMes(m) { return MESES_ES[((m % 12) + 12) % 12]; }

// ── Días entre fechas (inclusive) ────────────────────────────────────────────
export function diasDelPeriodo(desde, hasta) {
  const d0 = new Date(desde + "T12:00:00");
  const d1 = new Date(hasta + "T12:00:00");
  const out = [];
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
    out.push(isoDate(d));
  }
  return out;
}

// ── Clasificación día/hora ───────────────────────────────────────────────────
export function esFestivo(fechaIso, festivos = FESTIVOS_CO_2026) {
  return festivos.has(fechaIso);
}

export function esDominical(fechaIso) {
  const d = new Date(fechaIso + "T12:00:00");
  return d.getDay() === 0;
}

export function esDominicalOFestivo(fechaIso, festivos = FESTIVOS_CO_2026) {
  return esDominical(fechaIso) || esFestivo(fechaIso, festivos);
}

// ── Cálculo de un día ────────────────────────────────────────────────────────
/**
 * Convierte "HH:MM" o "HH:MM:SS" a minutos desde medianoche.
 */
export function horaAMinutos(h) {
  if (!h) return null;
  const [hh, mm] = String(h).split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  return hh * 60 + mm;
}

/**
 * Calcula horas trabajadas en un día, separadas en franjas (diurna / nocturna).
 * Permite cruce de medianoche: si salida < entrada, se asume que cruzó a día siguiente.
 *
 * @param {string} entrada  - "HH:MM"
 * @param {string} salida   - "HH:MM"
 * @returns {{horasDiurnas: number, horasNocturnas: number, horasTotales: number}}
 */
export function franjasDelDia(entrada, salida) {
  const ini = horaAMinutos(entrada);
  let fin = horaAMinutos(salida);
  if (ini == null || fin == null) {
    return { horasDiurnas: 0, horasNocturnas: 0, horasTotales: 0 };
  }
  // Cruce medianoche
  if (fin <= ini) fin += 24 * 60;

  let diurnas = 0, nocturnas = 0;
  // Iteramos por bloques de 1 min — más simple y exacto que casework
  for (let t = ini; t < fin; t++) {
    const tDelDia = t % (24 * 60);
    if (tDelDia >= DIURNA_INICIO && tDelDia < DIURNA_FIN) diurnas++;
    else nocturnas++;
  }
  return {
    horasDiurnas:   redondear(diurnas / 60),
    horasNocturnas: redondear(nocturnas / 60),
    horasTotales:   redondear((fin - ini) / 60),
  };
}

function redondear(n) { return Math.round(n * 100) / 100; }

/**
 * Calcula la nómina de UN DÍA para un empleado.
 *
 * @param {object} opts
 * @param {string} opts.fecha           - "YYYY-MM-DD"
 * @param {string|null} opts.entrada    - "HH:MM" o null si faltó
 * @param {string|null} opts.salida     - "HH:MM" o null si faltó
 * @param {number} opts.tarifaHora      - valor de la hora ordinaria diurna
 * @param {Set<string>} [opts.festivos] - default FESTIVOS_CO_2026
 * @returns {object} desglose y total
 */
export function calcularDia({ fecha, entrada, salida, tarifaHora, festivos = FESTIVOS_CO_2026 }) {
  const out = {
    fecha,
    es_dominical: esDominical(fecha),
    es_festivo:   esFestivo(fecha, festivos),
    horas_diurnas: 0,
    horas_nocturnas: 0,
    horas_extras_diurnas: 0,
    horas_extras_nocturnas: 0,
    horas_totales: 0,
    valor_ordinario: 0,
    recargo_nocturno: 0,
    recargo_dominical: 0,
    valor_extras: 0,
    total: 0,
    ausencia: false,
  };

  if (!entrada || !salida) {
    out.ausencia = true;
    return out;
  }

  const franjas = franjasDelDia(entrada, salida);
  out.horas_totales = franjas.horasTotales;

  // Separar ordinarias vs extras (>8h)
  const horasOrd = Math.min(franjas.horasTotales, JORNADA_ORDINARIA_HORAS);
  const horasExtraTotales = Math.max(0, franjas.horasTotales - JORNADA_ORDINARIA_HORAS);

  // Distribución proporcional entre franjas para extras
  const propD = franjas.horasTotales > 0 ? franjas.horasDiurnas / franjas.horasTotales : 1;
  const propN = 1 - propD;
  out.horas_diurnas       = redondear(horasOrd * propD);
  out.horas_nocturnas     = redondear(horasOrd * propN);
  out.horas_extras_diurnas   = redondear(horasExtraTotales * propD);
  out.horas_extras_nocturnas = redondear(horasExtraTotales * propN);

  const esDomFes = out.es_dominical || out.es_festivo;
  const tarifa = Number(tarifaHora || 0);

  // Valor ordinario = todas las horas ordinarias × tarifa base
  out.valor_ordinario = redondearCop((out.horas_diurnas + out.horas_nocturnas) * tarifa);

  // Recargo nocturno = horas_nocturnas (ordinarias) × tarifa × 35%
  out.recargo_nocturno = redondearCop(out.horas_nocturnas * tarifa * RECARGO_NOCTURNO);

  // Recargo dominical/festivo = todas las horas ordinarias × tarifa × 75%
  if (esDomFes) {
    out.recargo_dominical = redondearCop((out.horas_diurnas + out.horas_nocturnas) * tarifa * RECARGO_DOMINICAL);
  }

  // Extras: cada hora extra paga tarifa × (1 + recargo aplicable)
  // Si es dominical, suma 75% al recargo de la extra
  const recExtraDiurna   = RECARGO_EXTRA_DIURNA   + (esDomFes ? RECARGO_DOMINICAL : 0);
  const recExtraNocturna = RECARGO_EXTRA_NOCTURNA + (esDomFes ? RECARGO_DOMINICAL : 0);
  out.valor_extras = redondearCop(
    out.horas_extras_diurnas   * tarifa * (1 + recExtraDiurna) +
    out.horas_extras_nocturnas * tarifa * (1 + recExtraNocturna)
  );

  out.total = redondearCop(
    out.valor_ordinario + out.recargo_nocturno + out.recargo_dominical + out.valor_extras
  );

  return out;
}

function redondearCop(n) { return Math.round(n); }

/**
 * Consolida múltiples marcaciones biométricas de un día en un par entrada/salida.
 * Toma la PRIMERA marca como entrada y la ÚLTIMA como salida.
 *
 * @param {Array<{timestamp: string, hora: string, tipo_marca?: string}>} marcaciones
 * @returns {{entrada: string|null, salida: string|null}}
 */
export function consolidarMarcaciones(marcaciones) {
  if (!Array.isArray(marcaciones) || marcaciones.length === 0) {
    return { entrada: null, salida: null };
  }
  const orden = [...marcaciones].sort((a, b) => {
    const ta = a.timestamp || a.hora || "";
    const tb = b.timestamp || b.hora || "";
    return ta.localeCompare(tb);
  });
  const firstHora = (orden[0].hora || orden[0].timestamp?.slice(11, 16)) || null;
  const lastHora  = (orden[orden.length - 1].hora || orden[orden.length - 1].timestamp?.slice(11, 16)) || null;
  // Si solo hay 1 marcación no podemos saber entrada vs salida — registrar como entrada sin salida
  if (orden.length === 1) {
    return { entrada: firstHora, salida: null };
  }
  return { entrada: firstHora, salida: lastHora };
}

/**
 * Agrupa marcaciones por (empleado_id, fecha).
 *
 * @param {Array<{empleado_id, fecha, hora, timestamp}>} marcaciones
 * @returns {Map<string, Array>} key = "empleado_id|fecha"
 */
export function agruparMarcaciones(marcaciones) {
  const map = new Map();
  for (const m of marcaciones || []) {
    const key = `${m.empleado_id || m.zk_user_id || "?"}|${m.fecha || (m.timestamp || "").slice(0, 10)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return map;
}

/**
 * Calcula la nómina de un empleado para todo el período.
 *
 * @param {object} opts
 * @param {string} opts.desde
 * @param {string} opts.hasta
 * @param {number} opts.tarifaHora
 * @param {Map<string, {entrada, salida}>} opts.horasPorDia - key = "YYYY-MM-DD"
 * @returns {{dias: Array, totales: object}}
 */
export function calcularPeriodoEmpleado({ desde, hasta, tarifaHora, horasPorDia = new Map(), festivos }) {
  const dias = [];
  const tot = {
    horas_diurnas: 0, horas_nocturnas: 0,
    horas_extras_diurnas: 0, horas_extras_nocturnas: 0,
    horas_totales: 0,
    valor_ordinario: 0, recargo_nocturno: 0,
    recargo_dominical: 0, valor_extras: 0,
    total: 0, dias_trabajados: 0, dias_ausencias: 0,
  };
  for (const fecha of diasDelPeriodo(desde, hasta)) {
    const { entrada = null, salida = null } = horasPorDia.get(fecha) || {};
    const dia = calcularDia({ fecha, entrada, salida, tarifaHora, festivos });
    dias.push(dia);
    if (dia.ausencia) tot.dias_ausencias++;
    else tot.dias_trabajados++;
    tot.horas_diurnas       += dia.horas_diurnas;
    tot.horas_nocturnas     += dia.horas_nocturnas;
    tot.horas_extras_diurnas   += dia.horas_extras_diurnas;
    tot.horas_extras_nocturnas += dia.horas_extras_nocturnas;
    tot.horas_totales       += dia.horas_totales;
    tot.valor_ordinario     += dia.valor_ordinario;
    tot.recargo_nocturno    += dia.recargo_nocturno;
    tot.recargo_dominical   += dia.recargo_dominical;
    tot.valor_extras        += dia.valor_extras;
    tot.total               += dia.total;
  }
  // Redondeo de horas totales
  for (const k of ["horas_diurnas","horas_nocturnas","horas_extras_diurnas","horas_extras_nocturnas","horas_totales"]) {
    tot[k] = redondear(tot[k]);
  }
  return { dias, totales: tot };
}
