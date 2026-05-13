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

// ── Quincena helpers (Atolón) ────────────────────────────────────────────────
// Períodos NO estándar:
//   Pago del día 15 → corre del 26 (mes anterior) al 10 del mes corriente
//   Pago del día 30 → corre del 11 al 25 del mismo mes
const MESES_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function nombreMes(m) { return MESES_ES[((m % 12) + 12) % 12]; }
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Período de pago que CONTIENE la fecha de referencia.
 *  - Si día 11-25 → período "Pago día 30" del 11 al 25 (paga fin de mes)
 *  - Si día 26-31 → período "Pago día 15" del 26 al 10 mes siguiente
 *  - Si día 1-10  → período "Pago día 15" del 26 mes anterior al 10 actual
 */
export function periodoActual(refDate = new Date()) {
  const d = typeof refDate === "string" ? new Date(refDate + "T12:00:00") : refDate;
  const y = d.getFullYear();
  const m = d.getMonth();
  const dia = d.getDate();
  if (dia >= 11 && dia <= 25) {
    return {
      desde: isoDate(new Date(y, m, 11)),
      hasta: isoDate(new Date(y, m, 25)),
      etiqueta: `Pago 30 ${nombreMes(m)} ${y}`,
      pago: 30, fecha_pago: isoDate(new Date(y, m, 30)),
    };
  }
  if (dia >= 26) {
    return {
      desde: isoDate(new Date(y, m, 26)),
      hasta: isoDate(new Date(y, m + 1, 10)),
      etiqueta: `Pago 15 ${nombreMes(m + 1)} ${y}`,
      pago: 15, fecha_pago: isoDate(new Date(y, m + 1, 15)),
    };
  }
  // dia 1-10: pertenece al período que arrancó el 26 del mes anterior
  return {
    desde: isoDate(new Date(y, m - 1, 26)),
    hasta: isoDate(new Date(y, m, 10)),
    etiqueta: `Pago 15 ${nombreMes(m)} ${y}`,
    pago: 15, fecha_pago: isoDate(new Date(y, m, 15)),
  };
}

/**
 * Período inmediato anterior al actual.
 */
export function periodoAnterior(refDate = new Date()) {
  const actual = periodoActual(refDate);
  // El período anterior empieza el día siguiente al "hasta" de su anterior.
  // Tomamos el día previo al "desde" del actual y devolvemos su periodoActual.
  const d = new Date(actual.desde + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return periodoActual(d);
}

// Aliases retro-compatibilidad (mantenemos los nombres anteriores que
// ya importa la UI mientras refactorizamos)
export const quincenaActual   = periodoActual;
export const quincenaAnterior = periodoAnterior;

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

// ── Horas: clasificación diurna/nocturna y cálculo por día ───────────────────
// Diurna 06:00–21:00 (reforma laboral CO 2025). Nocturna 21:00–06:00.
const DIURNA_INICIO = 6 * 60;
const DIURNA_FIN    = 21 * 60;
const JORNADA_ORDINARIA_HORAS = 8;

export function horaAMinutos(h) {
  if (!h) return null;
  const [hh, mm] = String(h).split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  return hh * 60 + mm;
}
function redondear(n) { return Math.round(n * 100) / 100; }

/**
 * Divide horas trabajadas entre franja diurna y nocturna. Soporta cruce de
 * medianoche (salida < entrada → asumimos día siguiente).
 */
export function franjasDelDia(entrada, salida) {
  const ini = horaAMinutos(entrada);
  let fin = horaAMinutos(salida);
  if (ini == null || fin == null) {
    return { horasDiurnas: 0, horasNocturnas: 0, horasTotales: 0 };
  }
  if (fin <= ini) fin += 24 * 60;
  let diurnas = 0, nocturnas = 0;
  for (let t = ini; t < fin; t++) {
    const tDia = t % (24 * 60);
    if (tDia >= DIURNA_INICIO && tDia < DIURNA_FIN) diurnas++;
    else nocturnas++;
  }
  return {
    horasDiurnas:   redondear(diurnas / 60),
    horasNocturnas: redondear(nocturnas / 60),
    horasTotales:   redondear((fin - ini) / 60),
  };
}

/**
 * Calcula el desglose de horas para UN día.
 * Devuelve cantidades y valores SIN aplicar al neto — solo se usan para
 * auto-generar novedades correspondientes.
 */
export function calcularHorasDia({ fecha, entrada, salida, tarifaHora, festivos = FESTIVOS_CO_2026 }) {
  const out = {
    fecha,
    es_dominical: esDominical(fecha),
    es_festivo:   esFestivo(fecha, festivos),
    horas_diurnas: 0, horas_nocturnas: 0,
    horas_extras_diurnas: 0, horas_extras_nocturnas: 0,
    horas_totales: 0,
    valor_extras_diurnas: 0,
    valor_extras_nocturnas: 0,
    valor_recargo_nocturno: 0,
    valor_recargo_dominical: 0,
    ausencia: false,
  };
  if (!entrada || !salida) { out.ausencia = true; return out; }

  const f = franjasDelDia(entrada, salida);
  out.horas_totales = f.horasTotales;

  const horasOrd = Math.min(f.horasTotales, JORNADA_ORDINARIA_HORAS);
  const horasExtra = Math.max(0, f.horasTotales - JORNADA_ORDINARIA_HORAS);
  const propDiurna = f.horasTotales > 0 ? f.horasDiurnas / f.horasTotales : 1;
  const propNoct   = 1 - propDiurna;

  out.horas_diurnas         = redondear(horasOrd * propDiurna);
  out.horas_nocturnas       = redondear(horasOrd * propNoct);
  out.horas_extras_diurnas   = redondear(horasExtra * propDiurna);
  out.horas_extras_nocturnas = redondear(horasExtra * propNoct);

  const tarifa = Number(tarifaHora || 0);
  const esDomFes = out.es_dominical || out.es_festivo;

  // Recargos
  out.valor_recargo_nocturno = Math.round(out.horas_nocturnas * tarifa * 0.35);
  if (esDomFes) {
    out.valor_recargo_dominical = Math.round(
      (out.horas_diurnas + out.horas_nocturnas) * tarifa * 0.75
    );
  }
  // Extras (incluyen base + recargo)
  const recExtraDiurna   = 1.25 + (esDomFes ? 0.75 : 0);   // +25% diurna + dom
  const recExtraNocturna = 1.75 + (esDomFes ? 0.75 : 0);   // +75% nocturna + dom
  out.valor_extras_diurnas   = Math.round(out.horas_extras_diurnas * tarifa * recExtraDiurna);
  out.valor_extras_nocturnas = Math.round(out.horas_extras_nocturnas * tarifa * recExtraNocturna);

  return out;
}

/**
 * Convierte un mapa de marcaciones por día en un arreglo de novedades
 * automáticas para insertar en empleados_loggro_novedades. Solo emite filas
 * para los recargos/extras DISTINTAS DE CERO.
 *
 * @param {object} opts
 * @param {string} opts.empleadoId
 * @param {number} opts.tarifaHora
 * @param {Map<string, {entrada, salida}>} opts.horasPorDia
 * @returns {Array<object>} novedades listas para insert
 */
export function derivarNovedadesDeMarcaciones({ empleadoId, tarifaHora, horasPorDia }) {
  const out = [];
  for (const [fecha, { entrada, salida }] of horasPorDia) {
    if (!entrada || !salida) continue;
    const c = calcularHorasDia({ fecha, entrada, salida, tarifaHora });
    if (c.valor_extras_diurnas > 0) {
      out.push({ empleado_loggro_id: empleadoId, tipo: "hora_extra_diurna",
                 fecha_inicio: fecha, cantidad: c.horas_extras_diurnas,
                 valor: c.valor_extras_diurnas, descripcion: "Auto: hora extra diurna" });
    }
    if (c.valor_extras_nocturnas > 0) {
      out.push({ empleado_loggro_id: empleadoId, tipo: "hora_extra_nocturna",
                 fecha_inicio: fecha, cantidad: c.horas_extras_nocturnas,
                 valor: c.valor_extras_nocturnas, descripcion: "Auto: hora extra nocturna" });
    }
    if (c.valor_recargo_nocturno > 0) {
      out.push({ empleado_loggro_id: empleadoId, tipo: "recargo_nocturno",
                 fecha_inicio: fecha, cantidad: c.horas_nocturnas,
                 valor: c.valor_recargo_nocturno, descripcion: "Auto: recargo nocturno (+35%)" });
    }
    if (c.valor_recargo_dominical > 0) {
      out.push({ empleado_loggro_id: empleadoId, tipo: "recargo_dominical",
                 fecha_inicio: fecha, cantidad: c.horas_totales,
                 valor: c.valor_recargo_dominical, descripcion: c.es_festivo ? "Auto: recargo festivo (+75%)" : "Auto: recargo dominical (+75%)" });
    }
  }
  return out;
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
