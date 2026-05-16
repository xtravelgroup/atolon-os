import { describe, it, expect } from "vitest";
import {
  quincenaActual, quincenaAnterior, diasDelPeriodo,
  esFestivo, esDominical,
  salarioBaseProporcional, valorDiaCalendario,
  calcularAuxilioTransporte, aportesEmpleado,
  clasificarNovedades, calcularNominaEmpleado,
  ventanaNovedades, calcularHorasDia, desglosarPeriodo, tarifaHoraEmpleado,
  SMMLV_2026, AUX_TRANSPORTE_2026, FESTIVOS_CO_2026, NOVEDAD_TIPOS,
} from "./nominaCalculator.js";

describe("quincenaActual", () => {
  it("Q1 si dia <= 15", () => {
    const q = quincenaActual("2026-05-10");
    expect(q.desde).toBe("2026-05-01");
    expect(q.hasta).toBe("2026-05-15");
    expect(q.numero).toBe(1);
  });
  it("Q2 si dia > 15", () => {
    const q = quincenaActual("2026-05-20");
    expect(q.desde).toBe("2026-05-16");
    expect(q.hasta).toBe("2026-05-31");
    expect(q.numero).toBe(2);
  });
  it("Q2 febrero termina 28 (no bisiesto)", () => {
    const q = quincenaActual("2026-02-25");
    expect(q.hasta).toBe("2026-02-28");
  });
});

describe("quincenaAnterior", () => {
  it("desde Q1 va a Q2 del mes anterior", () => {
    const q = quincenaAnterior("2026-05-10");
    expect(q.desde).toBe("2026-04-16");
    expect(q.hasta).toBe("2026-04-30");
  });
  it("desde Q2 va a Q1 del mismo mes", () => {
    const q = quincenaAnterior("2026-05-20");
    expect(q.desde).toBe("2026-05-01");
    expect(q.hasta).toBe("2026-05-15");
  });
});

describe("diasDelPeriodo", () => {
  it("inclusive 3 días", () => {
    expect(diasDelPeriodo("2026-05-01","2026-05-03"))
      .toEqual(["2026-05-01","2026-05-02","2026-05-03"]);
  });
  it("Q1 mayo = 15 días", () => {
    expect(diasDelPeriodo("2026-05-01","2026-05-15").length).toBe(15);
  });
});

describe("esDominical / esFestivo", () => {
  it("10 may 2026 es domingo", () => expect(esDominical("2026-05-10")).toBe(true));
  it("1 may 2026 es festivo (Trabajo)", () => expect(esFestivo("2026-05-01")).toBe(true));
  it("11 may 2026 es lunes ordinario", () => {
    expect(esDominical("2026-05-11")).toBe(false);
    expect(esFestivo("2026-05-11")).toBe(false);
  });
});

describe("salarioBaseProporcional", () => {
  it("quincena completa = base/2", () => {
    expect(salarioBaseProporcional(1_750_905, 15, 0)).toBe(Math.round(1_750_905 / 2));
  });
  it("3 faltas descuentan base/30 × 3", () => {
    const base = 1_800_000;
    const r = salarioBaseProporcional(base, 15, 3);
    // quincena 900.000 - (60.000 × 3) = 720.000
    expect(r).toBe(720_000);
  });
  it("faltas > quincena no devuelve negativo", () => {
    expect(salarioBaseProporcional(1_000_000, 15, 99)).toBe(0);
  });
  it("salario_base 0 → 0", () => {
    expect(salarioBaseProporcional(0, 15)).toBe(0);
  });
});

describe("valorDiaCalendario", () => {
  it("base / 30", () => {
    expect(valorDiaCalendario(3_000_000)).toBe(100_000);
  });
});

describe("calcularAuxilioTransporte", () => {
  it("aplica si salario ≤ 2 SMMLV", () => {
    const r = calcularAuxilioTransporte({
      salarioBase: 1_750_905, diasTrabajados: 15, diasDelPeriodo: 15,
    });
    // 200.000 × (15/30) = 100.000
    expect(r).toBe(100_000);
  });
  it("NO aplica si salario > 2 SMMLV", () => {
    const r = calcularAuxilioTransporte({
      salarioBase: 7_000_000, diasTrabajados: 15, diasDelPeriodo: 15,
    });
    expect(r).toBe(0);
  });
  it("se prorratea por días trabajados (faltas reducen aux)", () => {
    const r = calcularAuxilioTransporte({
      salarioBase: 1_500_000, diasTrabajados: 10, diasDelPeriodo: 15,
    });
    // 200.000 × (10/30) = 66.667
    expect(r).toBeCloseTo(66_667, 0);
  });
});

describe("aportesEmpleado", () => {
  it("4% salud + 4% pensión sobre devengado", () => {
    const r = aportesEmpleado(1_000_000);
    expect(r.salud).toBe(40_000);
    expect(r.pension).toBe(40_000);
    expect(r.total).toBe(80_000);
  });
  it("0 si devengado 0", () => {
    expect(aportesEmpleado(0)).toEqual({ salud: 0, pension: 0, total: 0 });
  });
});

describe("clasificarNovedades", () => {
  const base = [
    { tipo: "bonificacion",  fecha_inicio: "2026-05-05", valor: 100_000, descripcion: "Comisión venta" },
    { tipo: "hora_extra_diurna", fecha_inicio: "2026-05-06", valor: 25_000, cantidad: 2 },
    { tipo: "anticipo",      fecha_inicio: "2026-05-08", valor: 200_000 },
    { tipo: "falta",         fecha_inicio: "2026-05-09", valor: 0, cantidad: 1 },
    { tipo: "incapacidad",   fecha_inicio: "2026-05-10", valor: 0, cantidad: 1 },
  ];

  it("clasifica devengados, deducidos e informativos", () => {
    const r = clasificarNovedades(base, "2026-05-01", "2026-05-15");
    expect(r.devengado.length).toBe(2);     // bonificacion + hora_extra
    expect(r.deducido.length).toBe(2);      // anticipo + falta
    expect(r.informativo.length).toBe(1);   // incapacidad
    expect(r.total_devengado).toBe(125_000);
    expect(r.total_deducido).toBe(200_000); // falta tiene valor 0 → no suma a deducido
    expect(r.dias_no_trabajados).toBe(1);   // 1 falta
    expect(r.dias_incapacidad).toBe(1);
  });

  it("filtra novedades fuera del período", () => {
    const r = clasificarNovedades(base, "2026-06-01", "2026-06-15");
    expect(r.devengado.length).toBe(0);
    expect(r.deducido.length).toBe(0);
  });

  it("novedad con rango interseca el período", () => {
    const n = [{ tipo: "vacaciones", fecha_inicio: "2026-05-12", fecha_fin: "2026-05-18", cantidad: 7 }];
    const r = clasificarNovedades(n, "2026-05-16", "2026-05-31");
    expect(r.informativo.length).toBe(1);
    expect(r.dias_vacaciones).toBe(7);
  });
});

describe("calcularNominaEmpleado — quincena estándar sin novedades", () => {
  it("solo salario base + aux. transporte (empleado salario mínimo)", () => {
    const empleado = { salario_base: 1_750_905 };
    const r = calcularNominaEmpleado({
      empleado, periodo: { desde: "2026-05-01", hasta: "2026-05-15" },
      novedades: [],
    });
    expect(r.devengado.salario_base_periodo).toBe(Math.round(1_750_905 / 2));   // 875.453
    expect(r.devengado.auxilio_transporte).toBe(100_000);  // 200k × 15/30
    expect(r.devengado.extras_recargos_bonos).toBe(0);
    // Aportes sobre 875.453 = 8% = 70.036
    expect(r.deducciones.aporte_salud).toBe(35_018);
    expect(r.deducciones.aporte_pension).toBe(35_018);
    // Neto = 875.453 + 100.000 - 70.036 = 905.417
    expect(r.neto).toBeGreaterThan(900_000);
    expect(r.neto).toBeLessThan(910_000);
  });

  it("empleado salario alto NO recibe auxilio", () => {
    const empleado = { salario_base: 7_000_000 };
    const r = calcularNominaEmpleado({
      empleado, periodo: { desde: "2026-05-01", hasta: "2026-05-15" }, novedades: [],
    });
    expect(r.devengado.auxilio_transporte).toBe(0);
    expect(r.devengado.salario_base_periodo).toBe(3_500_000);
  });
});

describe("calcularNominaEmpleado — con novedades positivas y negativas", () => {
  it("bono + hora extra suman; anticipo resta", () => {
    const empleado = { salario_base: 2_000_000 };
    const novedades = [
      { tipo: "bonificacion", fecha_inicio: "2026-05-05", valor: 200_000 },
      { tipo: "hora_extra_diurna", fecha_inicio: "2026-05-06", valor: 50_000, cantidad: 4 },
      { tipo: "anticipo", fecha_inicio: "2026-05-10", valor: 300_000 },
    ];
    const r = calcularNominaEmpleado({
      empleado, periodo: { desde: "2026-05-01", hasta: "2026-05-15" }, novedades,
    });
    expect(r.devengado.extras_recargos_bonos).toBe(250_000);
    expect(r.deducciones.otros_descuentos).toBe(300_000);
    // devengado base = 1.000.000 (quincena) + 250.000 = 1.250.000
    // aportes 8% sobre 1.250.000 = 100.000
    // aux. transporte 200k × 15/30 = 100.000 (salario 2M ≤ 2 SMMLV ~2.85M → aplica)
    // neto = 1.000.000 + 100.000 + 250.000 - 100.000 - 300.000 = 950.000
    expect(r.neto).toBe(950_000);
  });

  it("3 faltas descuentan base + reducen aux. transporte", () => {
    const empleado = { salario_base: 1_800_000 };
    const novedades = [
      { tipo: "falta", fecha_inicio: "2026-05-03", cantidad: 3 },
    ];
    const r = calcularNominaEmpleado({
      empleado, periodo: { desde: "2026-05-01", hasta: "2026-05-15" }, novedades,
    });
    expect(r.dias_no_trabajados).toBe(3);
    expect(r.dias_trabajados).toBe(12);
    // base = 900.000 - (60.000 × 3) = 720.000
    expect(r.devengado.salario_base_periodo).toBe(720_000);
    // aux = 200.000 × 12/30 = 80.000
    expect(r.devengado.auxilio_transporte).toBe(80_000);
  });
});

describe("etiquetas Pago 15 / Pago 30", () => {
  it("dia <= 15 → Pago 15", () => {
    expect(quincenaActual("2026-05-10").etiqueta).toBe("Pago 15 May 2026");
  });
  it("dia > 15 → Pago 30", () => {
    expect(quincenaActual("2026-05-20").etiqueta).toBe("Pago 30 May 2026");
  });
});

describe("ventanaNovedades — desfasada de los días trabajados", () => {
  it("Pago 15 mayo: novedades 26 abr → 10 may", () => {
    const v = ventanaNovedades(quincenaActual("2026-05-10"));
    expect(v).toEqual({ desde: "2026-04-26", hasta: "2026-05-10" });
  });
  it("Pago 30 mayo: novedades 11 → 25 may", () => {
    const v = ventanaNovedades(quincenaActual("2026-05-20"));
    expect(v).toEqual({ desde: "2026-05-11", hasta: "2026-05-25" });
  });
  it("Pago 15 enero: novedades cruzan al año anterior (26 dic → 10 ene)", () => {
    const v = ventanaNovedades(quincenaActual("2026-01-08"));
    expect(v).toEqual({ desde: "2025-12-26", hasta: "2026-01-10" });
  });
});

describe("calcularHorasDia (solo horas, informativo)", () => {
  it("8h diurnas → horas/nocturnas/festivo", () => {
    const r = calcularHorasDia({ fecha: "2026-05-11", entrada: "08:00", salida: "16:00" });
    expect(r.horas).toBe(8);
    expect(r.horas_nocturnas).toBe(0);
    expect(r.es_festivo).toBe(false);
  });
  it("turno nocturno 22:00→06:00 = 8h nocturnas", () => {
    const r = calcularHorasDia({ fecha: "2026-05-11", entrada: "22:00", salida: "06:00" });
    expect(r.horas).toBe(8);
    expect(r.horas_nocturnas).toBe(8);
  });
  it("festivo marcado, domingo NO", () => {
    expect(calcularHorasDia({ fecha: "2026-05-01", entrada: "08:00", salida: "16:00" }).es_festivo).toBe(true);
    expect(calcularHorasDia({ fecha: "2026-05-10", entrada: "08:00", salida: "16:00" }).es_festivo).toBe(false);
  });
  it("entrada/salida vacías = 0", () => {
    expect(calcularHorasDia({ fecha: "2026-05-11", entrada: "", salida: "" }).horas).toBe(0);
  });
  it("almuerzo se descuenta de horas DIURNAS + comida extra por >4h extra", () => {
    // 12:00→03:00 = 15h. Almuerzo base 1h (de diurno) → net 14h → extra del
    // día = 6h (>4) → +0.5h comida del FINAL del turno (02:30–03:00, noche).
    // net 13.5h; la noche baja de 8h a 7.5h.
    const r = calcularHorasDia({ fecha: "2026-05-09", entrada: "12:00", salida: "03:00", almuerzoHoras: 1 });
    expect(r.horas).toBe(13.5);
    expect(r.horas_nocturnas).toBe(7.5);
  });
  it("comida extra acumulativa: ≥8h extra → almuerzo ×2.5 (L=1)", () => {
    // 03:00→21:00 = 18h. base 1h → net 17h → extra 9h (≥8) → +0.5+1 →
    // comida total 2.5h → net 15.5h.
    const r = calcularHorasDia({ fecha: "2026-05-11", entrada: "03:00", salida: "21:00", almuerzoHoras: 1 });
    expect(r.horas).toBe(15.5);
  });
  it("extra del día ≤4: solo almuerzo base", () => {
    // 06:00→19:00 = 13h. base 1h → net 12h → extra 4h (no >4) → comida 1h.
    const r = calcularHorasDia({ fecha: "2026-05-11", entrada: "06:00", salida: "19:00", almuerzoHoras: 1 });
    expect(r.horas).toBe(12);
  });
});

describe("desglosarPeriodo — recargos de ley", () => {
  const T = 10_000;
  it("día ordinario diurno: sin adicionales", () => {
    const d = desglosarPeriodo([{ fecha: "2026-05-11", entrada: "08:00", salida: "16:00" }], T);
    expect(d.total_adicional).toBe(0);
    expect(d.horas_ordinarias).toBe(8);
    expect(d.horas_extra).toBe(0);
  });
  it("domingo NO paga recargo", () => {
    const d = desglosarPeriodo([{ fecha: "2026-05-10", entrada: "08:00", salida: "16:00" }], T);
    expect(d.total_adicional).toBe(0);
  });
  it("nocturno 22:00→06:00 = recargo nocturno +35%", () => {
    const d = desglosarPeriodo([{ fecha: "2026-05-11", entrada: "22:00", salida: "06:00" }], T);
    expect(d.recargo_nocturno).toBe(Math.round(8 * T * 0.35)); // 28.000
    expect(d.total_adicional).toBe(28_000);
  });
  it("festivo diurno = recargo festivo +80%", () => {
    const d = desglosarPeriodo([{ fecha: "2026-05-01", entrada: "08:00", salida: "16:00" }], T);
    expect(d.recargo_festivo).toBe(Math.round(8 * T * 0.80)); // 64.000
  });
  it("ningún día > 8h: aunque la semana pase de 44h NO hay extra", () => {
    // 6 días × 8h = 48h (>44h) pero ningún día supera 8h → 0 extra.
    const sem = ["2026-05-11","2026-05-12","2026-05-13","2026-05-14","2026-05-15","2026-05-16"]
      .map(f => ({ fecha: f, entrada: "08:00", salida: "16:00" }));
    const d = desglosarPeriodo(sem, T);
    expect(d.horas).toBe(48);
    expect(d.horas_extra).toBe(0);
    expect(d.horas_ordinarias).toBe(48);
  });
  it("día > 8h en semana ≤ 44h: sigue ordinario (gate apagado)", () => {
    const d = desglosarPeriodo([{ fecha: "2026-05-11", entrada: "08:00", salida: "20:00" }], T);
    expect(d.horas).toBe(12);
    expect(d.horas_extra).toBe(0);          // semana = 12h ≤ 44 → sin extra
  });
  it("≤95.33h en la quincena: SIN extra (ni diurna ni nocturna)", () => {
    // Solo 53.5h trabajadas (< 95.33) → no hay extra; el recargo nocturno
    // de horas ordinarias de noche SÍ se mantiene (no es "hora extra").
    const sem = [
      ["2026-05-04","08:00","17:00"],["2026-05-06","08:00","17:00"],
      ["2026-05-07","08:00","17:00"],["2026-05-08","08:00","17:00"],
      ["2026-05-09","12:00","03:00"],["2026-05-10","08:00","17:00"],
    ].map(([fecha, entrada, salida]) => ({ fecha, entrada, salida }));
    const d = desglosarPeriodo(sem, T, undefined, 1);
    expect(d.h_extra_diurna).toBe(0);
    expect(d.h_extra_nocturna).toBe(0);
    expect(d.horas_ordinarias).toBe(d.horas);          // todo ordinario
    expect(d.h_recargo_nocturno).toBe(2);              // recargo noct se mantiene
    expect(d.recargo_nocturno).toBe(Math.round(2 * T * 0.35));
  });
  it("extra diurna = trabajadas − extra nocturna − 95.33h (residuo quincenal)", () => {
    // Quincena Meris: 13 días 08:00–17:00 + 9 may 12:00→03:00, almuerzo 1h.
    const M = [
      "2026-04-26","2026-04-27","2026-04-28","2026-04-29","2026-04-30",
      "2026-05-01","2026-05-02","2026-05-03","2026-05-04","2026-05-06",
      "2026-05-07","2026-05-08","2026-05-10",
    ].map(f => ({ fecha: f, entrada: "08:00", salida: "17:00" }));
    M.splice(12, 0, { fecha: "2026-05-09", entrada: "12:00", salida: "03:00" });
    const d = desglosarPeriodo(M, T, undefined, 1);
    expect(d.horas).toBe(117.5);
    expect(d.horas_ordinarias).toBe(95.33);
    expect(d.h_extra_nocturna).toBe(5.5);
    // 117.5 − 5.5 − 95.3333 = 16.67
    expect(d.h_extra_diurna).toBeCloseTo(16.67, 1);
  });
});

describe("tarifaHoraEmpleado", () => {
  it("salario_base / 190.6667 (95.33 h/quincena)", () => {
    expect(tarifaHoraEmpleado({ salario_base: 1_906_667 })).toBe(10_000);
  });
});

describe("calcularNominaEmpleado — modo horas_reales", () => {
  it("base = salario ordinario (base/2); días de 8h no generan extra", () => {
    const empleado = { salario_base: 1_906_667 };
    const sem = ["2026-05-11","2026-05-12","2026-05-13","2026-05-14","2026-05-15","2026-05-16"]
      .map(f => ({ fecha: f, entrada: "08:00", salida: "16:00" }));
    const periodo = quincenaActual("2026-05-12");
    const r = calcularNominaEmpleado({
      empleado, periodo, marcaciones: sem, novedades: [],
      ventana: ventanaNovedades(periodo),
    });
    expect(r.modalidad).toBe("horas_reales");
    expect(r.devengado.salario_ordinario).toBe(Math.round(1_906_667 / 2));
    expect(r.devengado.total_extras).toBe(0);   // ningún día > 8h
    expect(r.devengado.horas_extra).toBe(0);
    expect(r.neto).toBeGreaterThan(0);
  });

  it("novedades se filtran por la ventana desfasada", () => {
    const empleado = { salario_base: 1_906_667 };
    const periodo = quincenaActual("2026-05-10");
    const ventana = ventanaNovedades(periodo);          // 26 abr → 10 may
    const r = calcularNominaEmpleado({
      empleado, periodo, ventana,
      marcaciones: [{ fecha: "2026-05-05", entrada: "08:00", salida: "16:00" }],
      novedades: [
        { tipo: "bonificacion", fecha_inicio: "2026-04-28", valor: 50_000 },
        { tipo: "bonificacion", fecha_inicio: "2026-05-14", valor: 99_000 },
      ],
    });
    expect(r.devengado.extras_recargos_bonos).toBe(50_000);
  });

  it("salario_fijo ignora marcaciones y usa base/2", () => {
    const empleado = { salario_base: 2_000_000, modalidad_calculo: "salario_fijo" };
    const r = calcularNominaEmpleado({
      empleado, periodo: quincenaActual("2026-05-10"),
      marcaciones: [{ fecha: "2026-05-11", entrada: "08:00", salida: "16:00" }],
      novedades: [],
    });
    expect(r.modalidad).toBe("salario_fijo");
    expect(r.devengado.salario_ordinario).toBe(1_000_000);
  });
});

describe("constantes Colombia 2026", () => {
  it("SMMLV 2026 definido", () => expect(SMMLV_2026).toBeGreaterThan(1_400_000));
  it("AUX_TRANSPORTE definido", () => expect(AUX_TRANSPORTE_2026).toBeGreaterThan(150_000));
  it("18 festivos CO 2026", () => expect(FESTIVOS_CO_2026.size).toBe(18));
  it("NOVEDAD_TIPOS expone categorías", () => {
    expect(NOVEDAD_TIPOS.bonificacion.categoria).toBe("devengado");
    expect(NOVEDAD_TIPOS.falta.categoria).toBe("deducido");
    expect(NOVEDAD_TIPOS.incapacidad.categoria).toBe("informativo");
  });
});
