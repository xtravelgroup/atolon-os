// nominaCalculator — modelo Colombia: salario_base + novedades del período.
//
// Estructura del cálculo (ley CO):
//   DEVENGADO
//     + Salario base proporcional al período (quincena = base/2, o base × días_trabajados / 30)
//     + Auxilio de transporte (si aplica: salario ≤ 2 SMMLV)
//     + Novedades positivas: horas extras, recargos, bonos, comisiones
//   DEDUCCIONES
//     − Aportes empleado: 4% pensión + 4% salud sobre IBC
//     − Novedades negativas: faltas, anticipos, préstamos, embargos
//   = NETO A PAGAR
//
// Las novedades vienen de `empleados_loggro_novedades` con:
//   tipo (text), fecha_inicio, fecha_fin, cantidad, valor (signo indica si suma/resta)
//
// Festivos y franjas se mantienen para clasificar marcaciones cuando se quiera
// auto-generar novedades de "recargo dominical/nocturno" desde el biométrico.

// ── Constantes Colombia 2026 ─────────────────────────────────────────────────
export const SMMLV_2026          = 1423500;   // estimación con +6% sobre 2025
export const AUX_TRANSPORTE_2026 = 200000;
export const TOPE_AUX_TRANSPORTE = 2 * SMMLV_2026;   // ≤ 2 SMMLV recibe auxilio
export const APORTE_SALUD        = 0.04;      // 4% empleado
export const APORTE_PENSION      = 0.04;      // 4% empleado

// ── Festivos Colombia 2026 (Ley 51/1983 + traslado lunes Emiliani) ──────────
export const FESTIVOS_CO_2026 = new Set([
  "2026-01-01","2026-01-12","2026-03-23","2026-04-02","2026-04-03",
  "2026-05-01","2026-05-18","2026-06-08","2026-06-15","2026-06-29",
  "2026-07-20","2026-08-07","2026-08-17","2026-10-12","2026-11-02",
  "2026-11-16","2026-12-08","2026-12-25",
]);

// ── Clasificación de tipos de novedades ──────────────────────────────────────
// Cada tipo indica si suma al devengado, deduce del devengado, o solo informa.
export const NOVEDAD_TIPOS = {
  // Devengados (suma)
  "hora_extra_diurna":        { categoria: "devengado", label: "H. extra diurna",       descripcion: "Hora trabajada después de jornada ordinaria (+25%)" },
  "hora_extra_nocturna":      { categoria: "devengado", label: "H. extra nocturna",     descripcion: "Hora extra entre 21:00 y 6:00 (+75%)" },
  "recargo_nocturno":         { categoria: "devengado", label: "Recargo nocturno",      descripcion: "Trabajo en horario nocturno ordinario (+35%)" },
  "recargo_dominical":        { categoria: "devengado", label: "Recargo dom/festivo",   descripcion: "Trabajo en domingo o festivo (+75%)" },
  "bonificacion":             { categoria: "devengado", label: "Bonificación",          descripcion: "Bono extraordinario, comisión, propina" },
  "comision":                 { categoria: "devengado", label: "Comisión",              descripcion: "Comisión por ventas o productividad" },
  "aux_transporte_adicional": { categoria: "devengado", label: "Aux. transporte adic.", descripcion: "Auxilio de transporte adicional" },
  "viatico":                  { categoria: "devengado", label: "Viático",               descripcion: "Reembolso de gastos de viaje" },
  // Deducidos (resta)
  "falta":                    { categoria: "deducido",  label: "Falta",                 descripcion: "Día no trabajado sin justificación" },
  "tardanza":                 { categoria: "deducido",  label: "Tardanza",              descripcion: "Llegada tarde — proporcional" },
  "anticipo":                 { categoria: "deducido",  label: "Anticipo",              descripcion: "Pago adelantado del salario" },
  "prestamo":                 { categoria: "deducido",  label: "Préstamo",              descripcion: "Cuota de préstamo interno" },
  "libranza":                 { categoria: "deducido",  label: "Libranza",              descripcion: "Descuento autorizado por libranza" },
  "embargo":                  { categoria: "deducido",  label: "Embargo",               descripcion: "Embargo judicial" },
  "descuento_otro":           { categoria: "deducido",  label: "Otro descuento",        descripcion: "Otro descuento" },
  // Solo informativos (no afectan el cálculo de neto pero sí días)
  "incapacidad":              { categoria: "informativo", label: "Incapacidad",         descripcion: "Día con incapacidad EPS/ARL (paga EPS, no afecta neto)" },
  "vacaciones":               { categoria: "informativo", label: "Vacaciones",          descripcion: "Día disfrutado en período de vacaciones" },
  "licencia_remunerada":      { categoria: "informativo", label: "Licencia remunerada", descripcion: "Licencia con salario (luto, maternidad, etc)" },
  "licencia_no_remunerada":   { categoria: "deducido",    label: "Licencia no rem.",    descripcion: "Licencia sin goce de salario — descuenta día" },
};

// ── Quincena helpers ─────────────────────────────────────────────────────────
const MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function nombreMes(m) { return MESES_ES[((m % 12) + 12) % 12]; }
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Calendario de pago Atolón:
//  - "Pago 15" (se paga el 15): días trabajados 1–15 del mes; numero = 1
//  - "Pago 30" (se paga fin de mes): días trabajados 16–fin del mes; numero = 2
// La etiqueta usa el mes de los días trabajados.
export function quincenaActual(refDate = new Date()) {
  const d = typeof refDate === "string" ? new Date(refDate + "T12:00:00") : refDate;
  const y = d.getFullYear();
  const m = d.getMonth();
  if (d.getDate() <= 15) {
    return { desde: isoDate(new Date(y, m, 1)), hasta: isoDate(new Date(y, m, 15)),
             etiqueta: `Pago 15 ${nombreMes(m)} ${y}`, numero: 1, anio: y, mes: m };
  }
  return { desde: isoDate(new Date(y, m, 16)), hasta: isoDate(new Date(y, m + 1, 0)),
           etiqueta: `Pago 30 ${nombreMes(m)} ${y}`, numero: 2, anio: y, mes: m };
}

export function quincenaAnterior(refDate = new Date()) {
  const d = typeof refDate === "string" ? new Date(refDate + "T12:00:00") : refDate;
  const y = d.getFullYear();
  const m = d.getMonth();
  if (d.getDate() <= 15) {
    return { desde: isoDate(new Date(y, m - 1, 16)), hasta: isoDate(new Date(y, m, 0)),
             etiqueta: `Pago 30 ${nombreMes(m - 1)} ${m === 0 ? y - 1 : y}`, numero: 2, anio: y, mes: m - 1 };
  }
  return { desde: isoDate(new Date(y, m, 1)), hasta: isoDate(new Date(y, m, 15)),
           etiqueta: `Pago 15 ${nombreMes(m)} ${y}`, numero: 1, anio: y, mes: m };
}

/**
 * Ventana de novedades (extras/recargos/faltas/bonos/anticipos) de un período.
 * Va DESFASADA de los días trabajados, para alcanzar a recolectarlas:
 *  - Pago 15 (numero 1, mes M): novedades 26 del mes ANTERIOR → 10 del mes M
 *  - Pago 30 (numero 2, mes M): novedades 11 → 25 del mes M
 *
 * @param {object} periodo  - salida de quincenaActual/quincenaAnterior
 * @returns {{desde:string, hasta:string}}
 */
export function ventanaNovedades(periodo) {
  const y = periodo.anio;
  const m = periodo.mes; // 0-indexed
  if (periodo.numero === 1) {
    return { desde: isoDate(new Date(y, m - 1, 26)), hasta: isoDate(new Date(y, m, 10)) };
  }
  return { desde: isoDate(new Date(y, m, 11)), hasta: isoDate(new Date(y, m, 25)) };
}

export function diasDelPeriodo(desde, hasta) {
  const d0 = new Date(desde + "T12:00:00");
  const d1 = new Date(hasta + "T12:00:00");
  const out = [];
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
    out.push(isoDate(d));
  }
  return out;
}

export function esFestivo(fechaIso, festivos = FESTIVOS_CO_2026) { return festivos.has(fechaIso); }
export function esDominical(fechaIso) {
  const d = new Date(fechaIso + "T12:00:00");
  return d.getDay() === 0;
}

// ── Marcaciones (entrada/salida) → horas + recargos de ley ───────────────────
// Modelo CO 2026 (jornada 44 h/sem, Ley 2101). Constantes ajustables.
export const HORAS_QUINCENA_LEGAL = 95.33333333;          // h ordinarias/quincena
export const HORAS_MES_LEGAL      = 190.66666667;         // = 95.3333 × 2
export const JORNADA_SEMANAL_HORAS = 44;                  // tope ordinario semanal
export const NOCTURNO_INICIO_H    = 21;                   // 21:00 inicia nocturno
export const NOCTURNO_FIN_H       = 6;                    // 06:00 termina nocturno
// Recargos sobre la hora ordinaria (aditivos: la hora base ya está en el salario).
export const REC_NOCTURNO          = 0.35;  // recargo nocturno
export const REC_FESTIVO           = 0.75;  // recargo festivo (domingos NO)
export const REC_NOCTURNO_FESTIVO  = 1.10;  // nocturno + festivo (0.35 + 0.75)
// Horas extra: multiplicador total (no están cubiertas por el salario).
export const EXTRA_DIURNA          = 1.25;  // hora extra diurna
export const EXTRA_NOCTURNA        = 1.75;  // hora extra nocturna
export const EXTRA_FESTIVA_DIURNA  = 2.00;  // hora extra festiva diurna
export const EXTRA_FESTIVA_NOCTURNA = 2.50; // hora extra festiva nocturna

function hhmmAMin(s) {
  if (!s) return null;
  const [h, m] = String(s).split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number(m) || 0);
}

function isoAddDays(fechaIso, n) {
  const d = new Date(fechaIso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

// Lunes de la semana (clave para el tope semanal de 44 h).
function lunesDeSemana(fechaIso) {
  const d = new Date(fechaIso + "T12:00:00");
  const dow = d.getDay();                 // 0=dom … 6=sáb
  const diff = dow === 0 ? -6 : 1 - dow;  // retrocede al lunes
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

/**
 * Horas trabajadas de UN día (solo informativo para la grilla).
 * El dinero se calcula a nivel período en desglosarPeriodo (la hora
 * extra depende del acumulado SEMANAL, no del día).
 */
export function calcularHorasDia({ fecha, entrada, salida, festivos = FESTIVOS_CO_2026 }) {
  const ini = hhmmAMin(entrada);
  let fin = hhmmAMin(salida);
  if (ini == null || fin == null) return { fecha, horas: 0, horas_nocturnas: 0, es_festivo: false };
  if (fin <= ini) fin += 1440;
  const totalMin = fin - ini;
  if (totalMin <= 0) return { fecha, horas: 0, horas_nocturnas: 0, es_festivo: false };
  let noct = 0;
  for (let t = ini; t < fin; t++) {
    const h = Math.floor((((t % 1440) + 1440) % 1440) / 60);
    if (h >= NOCTURNO_INICIO_H || h < NOCTURNO_FIN_H) noct++;
  }
  return {
    fecha,
    horas: +(totalMin / 60).toFixed(2),
    horas_nocturnas: +(noct / 60).toFixed(2),
    es_festivo: festivos?.has?.(fecha) ?? false,
  };
}

/**
 * Desglose legal del período a partir de las marcaciones.
 * Las primeras 44 h de CADA semana son ordinarias; lo demás es extra.
 * Las horas ordinarias solo suman su RECARGO (la hora base ya está en
 * el salario). Las horas extra se pagan completas × su factor.
 *
 * @param {Array}  marcaciones - [{ fecha, entrada, salida }]
 * @param {number} tarifaHora  - salario_base / 190.6667
 * @param {Set}    [festivos]
 */
export function desglosarPeriodo(marcaciones = [], tarifaHora = 0, festivos = FESTIVOS_CO_2026) {
  const tarifa = Number(tarifaHora || 0);
  const filas = marcaciones
    .filter(m => m.entrada && m.salida)
    .map(m => ({ fecha: m.fecha, _ini: hhmmAMin(m.entrada), _fin: hhmmAMin(m.salida) }))
    .filter(m => m._ini != null && m._fin != null)
    .sort((a, b) => (a.fecha === b.fecha ? a._ini - b._ini : (a.fecha < b.fecha ? -1 : 1)));

  const semanas = new Map();      // lunes → [maskPorMinuto] en orden cronológico
  const diasSet = new Set();
  let totalMin = 0, noctMinTot = 0;
  for (const m of filas) {
    let fin = m._fin;
    if (fin <= m._ini) fin += 1440;
    const dur = fin - m._ini;
    if (dur <= 0) continue;
    diasSet.add(m.fecha);
    totalMin += dur;
    for (let t = m._ini; t < fin; t++) {
      const off = Math.floor(t / 1440);
      const fechaReal = off ? isoAddDays(m.fecha, off) : m.fecha;
      const hh = Math.floor((((t % 1440) + 1440) % 1440) / 60);
      const night = hh >= NOCTURNO_INICIO_H || hh < NOCTURNO_FIN_H;
      const fest = festivos?.has?.(fechaReal) ?? false;
      if (night) noctMinTot++;
      const wk = lunesDeSemana(fechaReal);
      if (!semanas.has(wk)) semanas.set(wk, []);
      semanas.get(wk).push((night ? 1 : 0) | (fest ? 2 : 0));
    }
  }

  const capMin = JORNADA_SEMANAL_HORAS * 60;
  let ordNoct = 0, ordFest = 0, ordFestNoct = 0;
  let exDiu = 0, exNoc = 0, exFestDiu = 0, exFestNoc = 0;
  for (const arr of semanas.values()) {
    arr.forEach((mask, idx) => {
      const night = !!(mask & 1), fest = !!(mask & 2);
      if (idx < capMin) {                     // ORDINARIA (solo recargo)
        if (fest && night) ordFestNoct++;
        else if (fest)     ordFest++;
        else if (night)    ordNoct++;
      } else {                                // EXTRA (pago completo)
        if (fest && night) exFestNoc++;
        else if (fest)     exFestDiu++;
        else if (night)    exNoc++;
        else               exDiu++;
      }
    });
  }
  const H = (min) => +(min / 60).toFixed(2);
  const recargo_nocturno         = Math.round((ordNoct / 60)     * tarifa * REC_NOCTURNO);
  const recargo_festivo          = Math.round((ordFest / 60)     * tarifa * REC_FESTIVO);
  const recargo_nocturno_festivo = Math.round((ordFestNoct / 60) * tarifa * REC_NOCTURNO_FESTIVO);
  const extra_diurna             = Math.round((exDiu / 60)     * tarifa * EXTRA_DIURNA);
  const extra_nocturna           = Math.round((exNoc / 60)     * tarifa * EXTRA_NOCTURNA);
  const extra_festiva_diurna     = Math.round((exFestDiu / 60) * tarifa * EXTRA_FESTIVA_DIURNA);
  const extra_festiva_nocturna   = Math.round((exFestNoc / 60) * tarifa * EXTRA_FESTIVA_NOCTURNA);
  const total_recargos = recargo_nocturno + recargo_festivo + recargo_nocturno_festivo;
  const total_extras   = extra_diurna + extra_nocturna + extra_festiva_diurna + extra_festiva_nocturna;
  const extraMin = exDiu + exNoc + exFestDiu + exFestNoc;

  return {
    dias_trabajados: diasSet.size,
    horas: H(totalMin),
    horas_ordinarias: H(totalMin - extraMin),
    horas_extra: H(extraMin),
    horas_nocturnas: H(noctMinTot),
    // horas por concepto (para mostrar el desglose)
    h_recargo_nocturno: H(ordNoct),
    h_recargo_festivo: H(ordFest),
    h_recargo_nocturno_festivo: H(ordFestNoct),
    h_extra_diurna: H(exDiu),
    h_extra_nocturna: H(exNoc),
    h_extra_festiva_diurna: H(exFestDiu),
    h_extra_festiva_nocturna: H(exFestNoc),
    // valores $ por concepto
    recargo_nocturno, recargo_festivo, recargo_nocturno_festivo,
    extra_diurna, extra_nocturna, extra_festiva_diurna, extra_festiva_nocturna,
    total_recargos, total_extras,
    total_adicional: total_recargos + total_extras,
  };
}

// ── Cálculo de salario base proporcional ─────────────────────────────────────
/**
 * Salario base prorrateado para el período.
 *
 * Convención CO:
 *  - Quincena estándar (1-15 / 16-fin) = salario_base / 2, independiente del nº de días.
 *  - Si el empleado ingresó/salió a mitad del período, prorratear por días efectivos.
 *
 * @param {number} salarioBaseMensual
 * @param {number} diasDelPeriodo      — días calendario del período (15 o 16)
 * @param {number} [diasNoTrabajados]  — faltas/licencias no remuneradas
 * @returns {number}
 */
export function salarioBaseProporcional(salarioBaseMensual, diasDelPeriodo, diasNoTrabajados = 0) {
  const base = Number(salarioBaseMensual || 0);
  if (base <= 0) return 0;
  // Convención: la "quincena legal" siempre vale base/2 (ley 30 días/mes para nómina).
  // Si hay faltas, se descuenta proporcional al día con valor base/30.
  const quincena = base / 2;
  const valorDia = base / 30;
  const descuento = Math.max(0, diasNoTrabajados) * valorDia;
  return Math.max(0, Math.round(quincena - descuento));
}

export function valorDiaCalendario(salarioBaseMensual) {
  return Math.round(Number(salarioBaseMensual || 0) / 30);
}

// ── Auxilio de transporte ────────────────────────────────────────────────────
/**
 * Devuelve el auxilio aplicable al período según ley CO 2026.
 * Aplica solo si salario ≤ 2 SMMLV. Se prorratea por días trabajados.
 */
export function calcularAuxilioTransporte({ salarioBase, diasTrabajados, diasDelPeriodo,
                                            smmlv = SMMLV_2026, aux = AUX_TRANSPORTE_2026 }) {
  if (Number(salarioBase || 0) > (2 * smmlv)) return 0;
  if (!diasTrabajados || !diasDelPeriodo) return 0;
  const prop = diasTrabajados / 30;  // base 30 días mes
  return Math.round(aux * prop);
}

// ── Aportes empleado ─────────────────────────────────────────────────────────
/**
 * Calcula los aportes obligatorios del empleado (4% pensión + 4% salud).
 * Se calculan sobre el devengado base (sin auxilio de transporte).
 */
export function aportesEmpleado(devengadoBase) {
  const base = Math.max(0, Number(devengadoBase || 0));
  const salud   = Math.round(base * APORTE_SALUD);
  const pension = Math.round(base * APORTE_PENSION);
  return { salud, pension, total: salud + pension };
}

// ── Clasificación de novedades por período ───────────────────────────────────
/**
 * Toma un arreglo de novedades de `empleados_loggro_novedades` y las clasifica:
 *  - devengado: tipos que suman al neto (recargos, extras, bonos, comisiones)
 *  - deducido: tipos que restan (faltas, anticipos, préstamos)
 *  - informativo: solo para reporte (incapacidad, vacaciones)
 *
 * Filtra solo las novedades dentro del período [desde, hasta] (intersección
 * con fecha_inicio/fecha_fin).
 */
export function clasificarNovedades(novedades = [], desde, hasta) {
  const dentro = (n) => {
    const ini = n.fecha_inicio || desde;
    const fin = n.fecha_fin || ini || hasta;
    return !(fin < desde || ini > hasta);
  };
  const out = {
    devengado:   [],
    deducido:    [],
    informativo: [],
    total_devengado: 0,
    total_deducido:  0,
    dias_no_trabajados: 0,    // suma de cantidad para tipos falta/licencia_no_remunerada
    dias_incapacidad:   0,
    dias_vacaciones:    0,
  };
  for (const n of novedades) {
    if (!dentro(n)) continue;
    const tipoMeta = NOVEDAD_TIPOS[n.tipo] || { categoria: "devengado", label: n.tipo };
    const valor = Number(n.valor || 0);
    const cant  = Number(n.cantidad || 0);
    if (tipoMeta.categoria === "devengado") {
      out.devengado.push({ ...n, label: tipoMeta.label });
      out.total_devengado += Math.abs(valor);
    } else if (tipoMeta.categoria === "deducido") {
      out.deducido.push({ ...n, label: tipoMeta.label });
      out.total_deducido += Math.abs(valor);
      if (n.tipo === "falta" || n.tipo === "licencia_no_remunerada") {
        out.dias_no_trabajados += cant || 1;
      }
    } else {
      out.informativo.push({ ...n, label: tipoMeta.label });
      if (n.tipo === "incapacidad") out.dias_incapacidad += cant || 0;
      if (n.tipo === "vacaciones")  out.dias_vacaciones  += cant || 0;
    }
  }
  return out;
}

// ── Cálculo consolidado por empleado ─────────────────────────────────────────
// Valor hora ordinaria = salario_base / 190.6667 (95.3333 h/quincena × 2).
export function tarifaHoraEmpleado(empleado) {
  const base = Number(empleado?.salario_base || 0);
  if (base > 0) return Math.round(base / HORAS_MES_LEGAL);
  return Number(empleado?.tarifa_hora || 0);
}

/**
 * Calcula la nómina completa de UN empleado para el período.
 *
 * Días trabajados se valoran desde las MARCACIONES (entrada/salida por día)
 * de la quincena. Las NOVEDADES (extras manuales, bonos, anticipos, faltas)
 * se toman de su propia ventana desfasada (ver ventanaNovedades).
 *
 * @param {object} opts
 * @param {object} opts.empleado     - { salario_base, tarifa_hora, modalidad_calculo, ... }
 * @param {object} opts.periodo      - quincena de días trabajados { desde, hasta }
 * @param {Array}  opts.marcaciones  - [{ fecha, entrada, salida }] de la quincena
 * @param {Array}  opts.novedades    - filas de empleados_loggro_novedades
 * @param {object} [opts.ventana]    - ventana de novedades { desde, hasta }; default = periodo
 * @returns {object} estructura completa con devengado + deducciones + neto
 */
export function calcularNominaEmpleado({ empleado, periodo, novedades = [], marcaciones = [], ventana = null, festivos = FESTIVOS_CO_2026 }) {
  const dias = diasDelPeriodo(periodo.desde, periodo.hasta).length;
  const vNov = ventana || { desde: periodo.desde, hasta: periodo.hasta };
  const claves = clasificarNovedades(novedades, vNov.desde, vNov.hasta);

  const salarioBase = Number(empleado?.salario_base || 0);
  const tarifaHora  = tarifaHoraEmpleado(empleado);
  const tieneMarcaciones = Array.isArray(marcaciones) && marcaciones.some(m => m.entrada && m.salida);
  const modalidad = empleado?.modalidad_calculo || (tieneMarcaciones ? "horas_reales" : "salario_fijo");
  const usarHoras = modalidad !== "salario_fijo" && tieneMarcaciones;

  // Salario ordinario quincenal = las 95.3333 h obligatorias (base/2,
  // menos faltas). Los recargos/extras son ADICIONALES sobre esto.
  const salarioOrdinario = salarioBaseProporcional(salarioBase, dias, claves.dias_no_trabajados);

  let desg = null;
  let diasTrabajados;
  if (usarHoras) {
    desg = desglosarPeriodo(marcaciones, tarifaHora, festivos);
    diasTrabajados = desg.dias_trabajados;
  } else {
    diasTrabajados = Math.max(0, dias - claves.dias_no_trabajados);
  }
  const totalAdicional = desg?.total_adicional || 0;

  const auxTransporte = calcularAuxilioTransporte({
    salarioBase, diasTrabajados, diasDelPeriodo: dias,
  });

  // Base para aportes (IBC): salario ordinario + recargos + extras + bonos.
  const baseAportes = salarioOrdinario + totalAdicional + claves.total_devengado;
  const devengadoTotal = baseAportes + auxTransporte;
  const aportes = aportesEmpleado(baseAportes);
  const neto = devengadoTotal - aportes.total - claves.total_deducido;

  return {
    empleado,
    periodo,
    ventana_novedades: vNov,
    modalidad,
    tarifa_hora: tarifaHora,
    dias_del_periodo: dias,
    dias_no_trabajados: claves.dias_no_trabajados,
    dias_trabajados: diasTrabajados,
    dias_incapacidad: claves.dias_incapacidad,
    dias_vacaciones: claves.dias_vacaciones,
    marcaciones: desg,
    devengado: {
      salario_ordinario: salarioOrdinario,
      salario_base_periodo: salarioOrdinario,   // alias compat
      horas_ordinarias: desg?.horas_ordinarias || 0,
      horas_extra: desg?.horas_extra || 0,
      // recargos de ley (solo el % adicional sobre la hora ordinaria)
      recargo_nocturno: desg?.recargo_nocturno || 0,
      recargo_festivo: desg?.recargo_festivo || 0,
      recargo_nocturno_festivo: desg?.recargo_nocturno_festivo || 0,
      // horas extra (pago completo × factor)
      extra_diurna: desg?.extra_diurna || 0,
      extra_nocturna: desg?.extra_nocturna || 0,
      extra_festiva_diurna: desg?.extra_festiva_diurna || 0,
      extra_festiva_nocturna: desg?.extra_festiva_nocturna || 0,
      total_recargos: desg?.total_recargos || 0,
      total_extras: desg?.total_extras || 0,
      auxilio_transporte: auxTransporte,
      extras_recargos_bonos: claves.total_devengado,
      items: claves.devengado,
      subtotal: devengadoTotal,
    },
    deducciones: {
      aporte_salud: aportes.salud,
      aporte_pension: aportes.pension,
      otros_descuentos: claves.total_deducido,
      items: claves.deducido,
      subtotal: aportes.total + claves.total_deducido,
    },
    informativo: claves.informativo,
    neto: Math.max(0, Math.round(neto)),
  };
}
