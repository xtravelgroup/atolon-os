import { describe, it, expect } from "vitest";
import {
  quincenaActual, quincenaAnterior, diasDelPeriodo,
  esFestivo, esDominical, esDominicalOFestivo,
  franjasDelDia, horaAMinutos,
  calcularDia, calcularPeriodoEmpleado,
  consolidarMarcaciones, agruparMarcaciones,
  FESTIVOS_CO_2026,
} from "./nominaCalculator.js";

describe("quincenaActual", () => {
  it("Q1 si dia <= 15", () => {
    const q = quincenaActual("2026-05-10");
    expect(q.desde).toBe("2026-05-01");
    expect(q.hasta).toBe("2026-05-15");
    expect(q.etiqueta).toContain("Q1");
  });

  it("Q2 si dia > 15", () => {
    const q = quincenaActual("2026-05-20");
    expect(q.desde).toBe("2026-05-16");
    expect(q.hasta).toBe("2026-05-31");
    expect(q.etiqueta).toContain("Q2");
  });

  it("Q2 febrero termina el 28 (no bisiesto)", () => {
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
  it("devuelve días inclusivo", () => {
    expect(diasDelPeriodo("2026-05-01","2026-05-03")).toEqual([
      "2026-05-01","2026-05-02","2026-05-03"
    ]);
  });
});

describe("esDominical / esFestivo", () => {
  it("domingo se detecta", () => {
    expect(esDominical("2026-05-10")).toBe(true);  // domingo
    expect(esDominical("2026-05-11")).toBe(false); // lunes
  });

  it("1 de mayo es festivo CO", () => {
    expect(esFestivo("2026-05-01")).toBe(true);
  });

  it("dominicalOFestivo combina", () => {
    expect(esDominicalOFestivo("2026-05-10")).toBe(true);
    expect(esDominicalOFestivo("2026-05-01")).toBe(true);
    expect(esDominicalOFestivo("2026-05-11")).toBe(false);
  });
});

describe("franjasDelDia", () => {
  it("8h diurnas 06:00-14:00", () => {
    const f = franjasDelDia("06:00","14:00");
    expect(f.horasTotales).toBe(8);
    expect(f.horasDiurnas).toBe(8);
    expect(f.horasNocturnas).toBe(0);
  });

  it("8h nocturnas 22:00-06:00 (cruce medianoche)", () => {
    const f = franjasDelDia("22:00","06:00");
    expect(f.horasTotales).toBe(8);
    expect(f.horasNocturnas).toBe(8);
    expect(f.horasDiurnas).toBe(0);
  });

  it("mixto 18:00-02:00 (3h diurnas hasta 21h + 5h nocturnas)", () => {
    const f = franjasDelDia("18:00","02:00");
    expect(f.horasTotales).toBe(8);
    expect(f.horasDiurnas).toBe(3);
    expect(f.horasNocturnas).toBe(5);
  });

  it("entrada/salida null devuelve 0", () => {
    const f = franjasDelDia(null, "14:00");
    expect(f.horasTotales).toBe(0);
  });
});

describe("calcularDia — sin recargos (lunes diurno)", () => {
  it("8h diurnas un lunes = 8 × tarifa", () => {
    const r = calcularDia({ fecha: "2026-05-11", entrada: "06:00", salida: "14:00", tarifaHora: 7295 });
    expect(r.horas_totales).toBe(8);
    expect(r.horas_diurnas).toBe(8);
    expect(r.horas_extras_diurnas).toBe(0);
    expect(r.valor_ordinario).toBe(8 * 7295);
    expect(r.recargo_nocturno).toBe(0);
    expect(r.recargo_dominical).toBe(0);
    expect(r.total).toBe(8 * 7295);
  });
});

describe("calcularDia — nocturno (lunes 22-06)", () => {
  it("8h nocturnas suman ordinario + 35% nocturno", () => {
    const r = calcularDia({ fecha: "2026-05-11", entrada: "22:00", salida: "06:00", tarifaHora: 10000 });
    expect(r.horas_nocturnas).toBe(8);
    expect(r.valor_ordinario).toBe(80000);
    expect(r.recargo_nocturno).toBe(80000 * 0.35);
    expect(r.total).toBe(80000 + 28000);
  });
});

describe("calcularDia — dominical (domingo 10 may)", () => {
  it("8h diurnas un domingo suman 75% dominical encima del ordinario", () => {
    const r = calcularDia({ fecha: "2026-05-10", entrada: "06:00", salida: "14:00", tarifaHora: 10000 });
    expect(r.es_dominical).toBe(true);
    expect(r.valor_ordinario).toBe(80000);
    expect(r.recargo_dominical).toBe(80000 * 0.75);
    expect(r.total).toBe(80000 + 60000);
  });
});

describe("calcularDia — festivo (1 mayo)", () => {
  it("8h diurnas un festivo suman recargo dominical igual", () => {
    const r = calcularDia({ fecha: "2026-05-01", entrada: "06:00", salida: "14:00", tarifaHora: 10000 });
    expect(r.es_festivo).toBe(true);
    expect(r.recargo_dominical).toBe(60000);
    expect(r.total).toBe(140000);
  });
});

describe("calcularDia — horas extras", () => {
  it("10h diurnas (8 ord + 2 extras) cobra 25% extra sobre las 2", () => {
    const r = calcularDia({ fecha: "2026-05-11", entrada: "06:00", salida: "16:00", tarifaHora: 10000 });
    expect(r.horas_totales).toBe(10);
    expect(r.horas_diurnas).toBe(8);
    expect(r.horas_extras_diurnas).toBe(2);
    expect(r.valor_ordinario).toBe(80000);
    expect(r.valor_extras).toBe(2 * 10000 * 1.25); // 25000
    expect(r.total).toBe(80000 + 25000);
  });
});

describe("calcularDia — ausencia", () => {
  it("sin entrada/salida marca ausencia y total=0", () => {
    const r = calcularDia({ fecha: "2026-05-11", entrada: null, salida: null, tarifaHora: 10000 });
    expect(r.ausencia).toBe(true);
    expect(r.total).toBe(0);
    expect(r.horas_totales).toBe(0);
  });
});

describe("calcularDia — extra dominical nocturna (worst case)", () => {
  it("12h dom 22-10 — paga ord + nocturno + dominical + extras altas", () => {
    // Sat 9 → entrada 22:00, Dom 10 → salida 10:00 = 12h
    // ord 8h: ~3h diurnas + 5h nocturnas (de 22→3 = 5h noct, 3→6 = 3h noct, 6→10 = 4h diurnas… wait)
    // Actually entrada 22 → fin del bloque a las 22+12=34h = 10am dia siguiente
    // 22-06 = 8h nocturnas
    // 06-10 = 4h diurnas
    // Total 12h: 4 diurnas + 8 nocturnas
    // Ordinarias = 8h × (prop 4/12 diurna, 8/12 nocturna) = 2.67 diurna + 5.33 nocturna
    // Extras = 4h × (prop iguales) = 1.33 diurna + 2.67 nocturna
    const r = calcularDia({ fecha: "2026-05-10", entrada: "22:00", salida: "10:00", tarifaHora: 10000 });
    expect(r.horas_totales).toBe(12);
    expect(r.es_dominical).toBe(true);
    // Verificamos que tiene recargo dominical y total > base
    expect(r.recargo_dominical).toBeGreaterThan(0);
    expect(r.valor_extras).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThan(120000);  // mucho más que 12h × 10k base
  });
});

describe("consolidarMarcaciones", () => {
  it("4 marcaciones del día → primera y última", () => {
    const r = consolidarMarcaciones([
      { hora: "06:02", timestamp: "2026-05-11T06:02:00" },
      { hora: "11:30", timestamp: "2026-05-11T11:30:00" },
      { hora: "13:00", timestamp: "2026-05-11T13:00:00" },
      { hora: "14:05", timestamp: "2026-05-11T14:05:00" },
    ]);
    expect(r.entrada).toBe("06:02");
    expect(r.salida).toBe("14:05");
  });

  it("1 sola marca → entrada sin salida", () => {
    const r = consolidarMarcaciones([{ hora: "06:00", timestamp: "2026-05-11T06:00:00" }]);
    expect(r.entrada).toBe("06:00");
    expect(r.salida).toBeNull();
  });

  it("vacío → null/null", () => {
    expect(consolidarMarcaciones([])).toEqual({ entrada: null, salida: null });
  });
});

describe("agruparMarcaciones", () => {
  it("agrupa por empleado+fecha", () => {
    const map = agruparMarcaciones([
      { empleado_id: "A", fecha: "2026-05-11", hora: "06:00" },
      { empleado_id: "A", fecha: "2026-05-11", hora: "14:00" },
      { empleado_id: "A", fecha: "2026-05-12", hora: "06:00" },
      { empleado_id: "B", fecha: "2026-05-11", hora: "14:00" },
    ]);
    expect(map.get("A|2026-05-11").length).toBe(2);
    expect(map.get("A|2026-05-12").length).toBe(1);
    expect(map.get("B|2026-05-11").length).toBe(1);
  });
});

describe("calcularPeriodoEmpleado", () => {
  it("suma totales de 3 días", () => {
    const horasPorDia = new Map([
      ["2026-05-11", { entrada: "06:00", salida: "14:00" }],  // lun ord 8h
      ["2026-05-12", { entrada: "06:00", salida: "14:00" }],  // mar ord 8h
      ["2026-05-13", { entrada: null, salida: null }],         // mie ausencia
    ]);
    const r = calcularPeriodoEmpleado({
      desde: "2026-05-11", hasta: "2026-05-13",
      tarifaHora: 10000, horasPorDia,
    });
    expect(r.dias.length).toBe(3);
    expect(r.totales.dias_trabajados).toBe(2);
    expect(r.totales.dias_ausencias).toBe(1);
    expect(r.totales.horas_totales).toBe(16);
    expect(r.totales.total).toBe(160000);
  });

  it("incluye recargos dominicales en período que tiene un domingo", () => {
    const horasPorDia = new Map([
      ["2026-05-10", { entrada: "06:00", salida: "14:00" }],  // domingo
      ["2026-05-11", { entrada: "06:00", salida: "14:00" }],  // lunes
    ]);
    const r = calcularPeriodoEmpleado({
      desde: "2026-05-10", hasta: "2026-05-11",
      tarifaHora: 10000, horasPorDia,
    });
    // Domingo: 80000 + 60000 = 140000
    // Lunes:   80000
    // Total:   220000
    expect(r.totales.total).toBe(220000);
    expect(r.totales.recargo_dominical).toBe(60000);
  });
});

describe("horaAMinutos", () => {
  it("06:00 → 360", () => expect(horaAMinutos("06:00")).toBe(360));
  it("22:30 → 1350", () => expect(horaAMinutos("22:30")).toBe(22*60 + 30));
  it("null → null", () => expect(horaAMinutos(null)).toBeNull());
  it("formato HH:MM:SS soportado", () => expect(horaAMinutos("06:30:45")).toBe(390));
});

describe("FESTIVOS_CO_2026", () => {
  it("contiene 18 festivos", () => {
    expect(FESTIVOS_CO_2026.size).toBe(18);
  });
  it("Navidad y Año Nuevo presentes", () => {
    expect(FESTIVOS_CO_2026.has("2026-12-25")).toBe(true);
    expect(FESTIVOS_CO_2026.has("2026-01-01")).toBe(true);
  });
});
