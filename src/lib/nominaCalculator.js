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

export function quincenaActual(refDate = new Date()) {
  const d = typeof refDate === "string" ? new Date(refDate + "T12:00:00") : refDate;
  const y = d.getFullYear();
  const m = d.getMonth();
  if (d.getDate() <= 15) {
    return { desde: isoDate(new Date(y, m, 1)), hasta: isoDate(new Date(y, m, 15)),
             etiqueta: `Q1 ${nombreMes(m)} ${y}`, numero: 1, anio: y, mes: m };
  }
  return { desde: isoDate(new Date(y, m, 16)), hasta: isoDate(new Date(y, m + 1, 0)),
           etiqueta: `Q2 ${nombreMes(m)} ${y}`, numero: 2, anio: y, mes: m };
}

export function quincenaAnterior(refDate = new Date()) {
  const d = typeof refDate === "string" ? new Date(refDate + "T12:00:00") : refDate;
  const y = d.getFullYear();
  const m = d.getMonth();
  if (d.getDate() <= 15) {
    return { desde: isoDate(new Date(y, m - 1, 16)), hasta: isoDate(new Date(y, m, 0)),
             etiqueta: `Q2 ${nombreMes(m - 1)} ${y}`, numero: 2, anio: y, mes: m - 1 };
  }
  return { desde: isoDate(new Date(y, m, 1)), hasta: isoDate(new Date(y, m, 15)),
           etiqueta: `Q1 ${nombreMes(m)} ${y}`, numero: 1, anio: y, mes: m };
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
/**
 * Calcula la nómina completa de UN empleado para el período.
 *
 * @param {object} opts
 * @param {object} opts.empleado          - { salario_base, ... }
 * @param {object} opts.periodo           - { desde, hasta }
 * @param {Array}  opts.novedades         - filas de empleados_loggro_novedades del empleado
 * @returns {object} estructura completa con devengado + deducciones + neto
 */
export function calcularNominaEmpleado({ empleado, periodo, novedades = [] }) {
  const dias = diasDelPeriodo(periodo.desde, periodo.hasta).length;
  const claves = clasificarNovedades(novedades, periodo.desde, periodo.hasta);

  const salarioBase = Number(empleado?.salario_base || 0);
  const salarioPeriodo = salarioBaseProporcional(salarioBase, dias, claves.dias_no_trabajados);
  const diasTrabajados = Math.max(0, dias - claves.dias_no_trabajados);

  const auxTransporte = calcularAuxilioTransporte({
    salarioBase, diasTrabajados, diasDelPeriodo: dias,
  });

  // Devengado total = base + auxilio + extras/bonos
  const devengadoBase = salarioPeriodo;                     // base prorrateada
  const devengadoTotal = devengadoBase + auxTransporte + claves.total_devengado;

  // Aportes obligatorios sobre devengado base (no incluye aux. transporte)
  const aportes = aportesEmpleado(devengadoBase + claves.total_devengado);

  // Neto = devengado total - aportes - novedades deducidas
  const neto = devengadoTotal - aportes.total - claves.total_deducido;

  return {
    empleado,
    periodo,
    dias_del_periodo: dias,
    dias_no_trabajados: claves.dias_no_trabajados,
    dias_trabajados: diasTrabajados,
    dias_incapacidad: claves.dias_incapacidad,
    dias_vacaciones: claves.dias_vacaciones,
    devengado: {
      salario_base_periodo: salarioPeriodo,
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
