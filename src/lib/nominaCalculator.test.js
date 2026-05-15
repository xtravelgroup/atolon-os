import { describe, it, expect } from "vitest";
import {
  quincenaActual, quincenaAnterior, diasDelPeriodo,
  esFestivo, esDominical,
  salarioBaseProporcional, valorDiaCalendario,
  calcularAuxilioTransporte, aportesEmpleado,
  clasificarNovedades, calcularNominaEmpleado,
  ventanaNovedades, calcularHorasDia, resumenMarcaciones, tarifaHoraEmpleado,
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

describe("calcularHorasDia", () => {
  const tarifa = 10_000;
  it("8h diurnas día ordinario = base sin recargos", () => {
    const r = calcularHorasDia({ fecha: "2026-05-11", entrada: "08:00", salida: "16:00", tarifaHora: tarifa });
    expect(r.ordinarias).toBe(8);
    expect(r.extra).toBe(0);
    expect(r.recargo_nocturno).toBe(0);
    expect(r.recargo_dom_festivo).toBe(0);
    expect(r.valor).toBe(80_000);
  });
  it("turno nocturno 22:00→06:00 aplica recargo nocturno 35%", () => {
    const r = calcularHorasDia({ fecha: "2026-05-11", entrada: "22:00", salida: "06:00", tarifaHora: tarifa });
    expect(r.horas).toBe(8);
    expect(r.recargo_nocturno).toBe(28_000); // 8 × 10.000 × 0.35
    expect(r.valor).toBe(108_000);
  });
  it("domingo aplica recargo dom/festivo 75%", () => {
    const r = calcularHorasDia({ fecha: "2026-05-10", entrada: "08:00", salida: "16:00", tarifaHora: tarifa });
    expect(r.es_dom_festivo).toBe(true);
    expect(r.recargo_dom_festivo).toBe(60_000); // 8 × 10.000 × 0.75
    expect(r.valor).toBe(140_000);
  });
  it("10h diurnas = 8 ordinarias + 2 extra diurnas (×1.25)", () => {
    const r = calcularHorasDia({ fecha: "2026-05-11", entrada: "08:00", salida: "18:00", tarifaHora: tarifa });
    expect(r.ordinarias).toBe(8);
    expect(r.extra).toBe(2);
    expect(r.valor_extra).toBe(25_000); // 2 × 10.000 × 1.25
    expect(r.valor).toBe(105_000);
  });
  it("entrada/salida vacías = 0", () => {
    expect(calcularHorasDia({ fecha: "2026-05-11", entrada: "", salida: "", tarifaHora: tarifa }).valor).toBe(0);
  });
});

describe("resumenMarcaciones", () => {
  it("agrega días e ignora filas sin entrada/salida", () => {
    const r = resumenMarcaciones([
      { fecha: "2026-05-11", entrada: "08:00", salida: "16:00" },
      { fecha: "2026-05-12", entrada: "08:00", salida: "16:00" },
      { fecha: "2026-05-13", entrada: "", salida: "" },
    ], 10_000);
    expect(r.dias_trabajados).toBe(2);
    expect(r.valor_total).toBe(160_000);
  });
});

describe("tarifaHoraEmpleado", () => {
  it("usa tarifa_hora si existe", () => {
    expect(tarifaHoraEmpleado({ tarifa_hora: 12_345, salario_base: 9_000_000 })).toBe(12_345);
  });
  it("default = salario_base / 240", () => {
    expect(tarifaHoraEmpleado({ salario_base: 2_400_000 })).toBe(10_000);
  });
});

describe("calcularNominaEmpleado — modo horas_reales (marcaciones)", () => {
  it("base = valor del tiempo trabajado, no salario_base/2", () => {
    const empleado = { salario_base: 2_400_000, tarifa_hora: 10_000 };
    const r = calcularNominaEmpleado({
      empleado,
      periodo: quincenaActual("2026-05-10"),
      marcaciones: [
        { fecha: "2026-05-11", entrada: "08:00", salida: "16:00" },
        { fecha: "2026-05-12", entrada: "08:00", salida: "16:00" },
      ],
      novedades: [],
      ventana: ventanaNovedades(quincenaActual("2026-05-10")),
    });
    expect(r.modalidad).toBe("horas_reales");
    expect(r.dias_trabajados).toBe(2);
    expect(r.devengado.salario_base_periodo).toBe(160_000);
    expect(r.marcaciones.valor_total).toBe(160_000);
    expect(r.neto).toBeGreaterThan(0);
  });

  it("novedades se filtran por la ventana desfasada, no por la quincena", () => {
    const empleado = { salario_base: 2_400_000, tarifa_hora: 10_000 };
    const periodo = quincenaActual("2026-05-10");      // Pago 15 → días 1–15 may
    const ventana = ventanaNovedades(periodo);          // 26 abr → 10 may
    const r = calcularNominaEmpleado({
      empleado, periodo, ventana,
      marcaciones: [{ fecha: "2026-05-05", entrada: "08:00", salida: "16:00" }],
      novedades: [
        { tipo: "bonificacion", fecha_inicio: "2026-04-28", valor: 50_000 }, // dentro de ventana
        { tipo: "bonificacion", fecha_inicio: "2026-05-14", valor: 99_000 }, // fuera de ventana (>10 may)
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
    expect(r.devengado.salario_base_periodo).toBe(1_000_000);
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
