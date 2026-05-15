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

// ── Marcaciones (entrada/salida) → horas + recargos ──────────────────────────
// Modelo CO. Constantes ajustables si cambia la ley o la convención interna.
export const JORNADA_ORDINARIA_HORAS = 8;     // jornada legal diaria
export const NOCTURNO_INICIO_H       = 21;    // 21:00 inicia franja nocturna
export const NOCTURNO_FIN_H          = 6;     // 06:00 termina franja nocturna
export const REC_NOCTURNO            = 0.35;  // +35% recargo nocturno
export const REC_DOM_FESTIVO         = 0.75;  // +75% recargo dom/festivo
export const FACTOR_EXTRA_DIURNA     = 0.25;  // hora extra diurna = tarifa × 1.25
export const FACTOR_EXTRA_NOCTURNA   = 0.75;  // hora extra nocturna = tarifa × 1.75

function hhmmAMin(s) {
  if (!s) return null;
  const [h, m] = String(s).split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number(m) || 0);
}

// Minutos del intervalo [ini,fin) (en min absolutos, fin puede pasar de 1440)
// que caen dentro de la franja nocturna [21:00,24:00) ∪ [00:00,06:00).
function minutosNocturnos(ini, fin) {
  let noct = 0;
  for (let t = ini; t < fin; t++) {
    const hod = ((t % 1440) + 1440) % 1440;     // minuto del día
    const h = Math.floor(hod / 60);
    if (h >= NOCTURNO_INICIO_H || h < NOCTURNO_FIN_H) noct++;
  }
  return noct;
}

/**
 * Calcula horas y recargos de UN día a partir de entrada/salida.
 * Soporta turnos que cruzan medianoche (salida ≤ entrada → +24h).
 *
 * @param {object} o
 * @param {string} o.fecha       - "YYYY-MM-DD"
 * @param {string} o.entrada     - "HH:MM"
 * @param {string} o.salida      - "HH:MM"
 * @param {number} o.tarifaHora  - valor hora ordinaria diurna
 * @param {Set}    [o.festivos]
 * @returns {object} desglose del día
 */
export function calcularHorasDia({ fecha, entrada, salida, tarifaHora, festivos = FESTIVOS_CO_2026 }) {
  const tarifa = Number(tarifaHora || 0);
  const vacio = {
    fecha, horas: 0, ordinarias: 0, extra: 0, horas_nocturnas: 0,
    es_dom_festivo: false, valor_ordinario: 0, recargo_nocturno: 0,
    recargo_dom_festivo: 0, valor_extra: 0, valor: 0,
  };
  const ini = hhmmAMin(entrada);
  let fin = hhmmAMin(salida);
  if (ini == null || fin == null) return vacio;
  if (fin <= ini) fin += 1440;                          // turno cruza medianoche
  const totalMin = fin - ini;
  if (totalMin <= 0) return vacio;

  const jornadaMin = JORNADA_ORDINARIA_HORAS * 60;
  const ordMin   = Math.min(totalMin, jornadaMin);
  const extraMin = Math.max(0, totalMin - jornadaMin);
  const noctMin  = minutosNocturnos(ini, fin);
  const noctOrdMin   = Math.min(noctMin, ordMin);
  const noctExtraMin = Math.max(0, noctMin - noctOrdMin);
  const esDF = esDominical(fecha) || (festivos?.has?.(fecha) ?? false);

  const h = (min) => min / 60;
  const valorOrdinario   = h(ordMin) * tarifa;
  const recargoNocturno  = h(noctOrdMin) * tarifa * REC_NOCTURNO;
  const recargoDomFest   = esDF ? h(ordMin) * tarifa * REC_DOM_FESTIVO : 0;
  const extraDiurnaMin   = extraMin - noctExtraMin;
  const valorExtra       = h(extraDiurnaMin) * tarifa * (1 + FACTOR_EXTRA_DIURNA)
                         + h(noctExtraMin)   * tarifa * (1 + FACTOR_EXTRA_NOCTURNA);
  const valor = Math.round(valorOrdinario + recargoNocturno + recargoDomFest + valorExtra);

  return {
    fecha,
    horas: +(h(totalMin)).toFixed(2),
    ordinarias: +(h(ordMin)).toFixed(2),
    extra: +(h(extraMin)).toFixed(2),
    horas_nocturnas: +(h(noctMin)).toFixed(2),
    es_dom_festivo: esDF,
    valor_ordinario: Math.round(valorOrdinario),
    recargo_nocturno: Math.round(recargoNocturno),
    recargo_dom_festivo: Math.round(recargoDomFest),
    valor_extra: Math.round(valorExtra),
    valor,
  };
}

/**
 * Agrega las marcaciones de un empleado en el período.
 * @param {Array}  marcaciones - [{ fecha, entrada, salida }]
 * @param {number} tarifaHora
 * @param {Set}    [festivos]
 */
export function resumenMarcaciones(marcaciones = [], tarifaHora = 0, festivos = FESTIVOS_CO_2026) {
  const porDia = marcaciones
    .filter(m => m.entrada && m.salida)
    .map(m => calcularHorasDia({ ...m, tarifaHora, festivos }));
  const acc = (k) => porDia.reduce((s, d) => s + (d[k] || 0), 0);
  return {
    dias_trabajados: porDia.filter(d => d.horas > 0).length,
    horas: +acc("horas").toFixed(2),
    ordinarias: +acc("ordinarias").toFixed(2),
    extra: +acc("extra").toFixed(2),
    horas_nocturnas: +acc("horas_nocturnas").toFixed(2),
    valor_ordinario: acc("valor_ordinario"),
    recargo_nocturno: acc("recargo_nocturno"),
    recargo_dom_festivo: acc("recargo_dom_festivo"),
    valor_extra: acc("valor_extra"),
    valor_total: acc("valor"),
    por_dia: porDia,
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
export function tarifaHoraEmpleado(empleado) {
  const t = Number(empleado?.tarifa_hora || 0);
  if (t > 0) return t;
  return Math.round(Number(empleado?.salario_base || 0) / 240); // 8h × 30d
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

  let resumen = null;
  let devengadoBase;       // valor del tiempo trabajado (sin aux ni novedades)
  let diasTrabajados;
  if (usarHoras) {
    resumen = resumenMarcaciones(marcaciones, tarifaHora, festivos);
    devengadoBase = resumen.valor_total;
    diasTrabajados = resumen.dias_trabajados;
  } else {
    devengadoBase = salarioBaseProporcional(salarioBase, dias, claves.dias_no_trabajados);
    diasTrabajados = Math.max(0, dias - claves.dias_no_trabajados);
  }

  const auxTransporte = calcularAuxilioTransporte({
    salarioBase, diasTrabajados, diasDelPeriodo: dias,
  });

  const devengadoTotal = devengadoBase + auxTransporte + claves.total_devengado;
  // Aportes obligatorios sobre devengado base (no incluye aux. transporte)
  const aportes = aportesEmpleado(devengadoBase + claves.total_devengado);
  // Neto = devengado total - aportes - novedades deducidas
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
    marcaciones: resumen,
    devengado: {
      salario_base_periodo: devengadoBase,
      auxilio_transporte: auxTransporte,
      extras_recargos_bonos: claves.total_devengado,
      recargo_nocturno: resumen?.recargo_nocturno || 0,
      recargo_dom_festivo: resumen?.recargo_dom_festivo || 0,
      valor_extra: resumen?.valor_extra || 0,
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
