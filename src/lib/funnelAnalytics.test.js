import { describe, it, expect } from "vitest";
import {
  calcularFunnelPorOrigen, construirTimeline, calcularResumenEjecutivo,
  FUNNEL_STEPS,
} from "./funnelAnalytics.js";

const sesionesBase = [
  { id: "S1", usuario_id: "U1", origen_tipo: "web",       canal: "directo",  created_at: "2026-05-01T10:00:00Z", duracion_seg: 240, pais: "CO", ciudad: "Bogotá", dispositivo: "desktop", convertida: true },
  { id: "S2", usuario_id: "U1", origen_tipo: "whatsapp",  canal: "whatsapp", created_at: "2026-05-02T11:00:00Z", duracion_seg: 90 },
  { id: "S3", usuario_id: "U2", origen_tipo: "web",       canal: "directo",  created_at: "2026-05-03T12:00:00Z", duracion_seg: 30 },
  { id: "S4", usuario_id: "U3", origen_tipo: "marketing", canal: "sem_google",created_at: "2026-05-04T13:00:00Z", duracion_seg: 180 },
];

const embudosBase = [
  // S1 — completo
  { sesion_id: "S1", paso_1_ts: "x", paso_2_ts: "x", paso_3_ts: "x", paso_4_ts: "x", paso_5_ts: "x", paso_6_ts: "x" },
  // S2 — solo hasta paso 3
  { sesion_id: "S2", paso_1_ts: "x", paso_2_ts: "x", paso_3_ts: "x" },
  // S3 — solo vio booking
  { sesion_id: "S3", paso_1_ts: "x" },
  // S4 — completó pago
  { sesion_id: "S4", paso_1_ts: "x", paso_2_ts: "x", paso_3_ts: "x", paso_4_ts: "x", paso_5_ts: "x", paso_6_ts: "x" },
];

const reservasBase = [
  { id: "R1", canal: "WEB",   estado: "confirmado", total: 640000, pax: 2, email: "a@a.com", created_at: "2026-05-01T11:00:00Z" },
  { id: "R2", canal: "tatiana", estado: "check_in", total: 320000, pax: 1, email: "b@b.com", created_at: "2026-05-02T12:00:00Z" },
  { id: "R3", canal: "WEB",   estado: "confirmado", total: 880000, pax: 3, email: "c@c.com", created_at: "2026-05-04T14:00:00Z" },
  { id: "R4", canal: "GRUPO", estado: "confirmado", total: 5000000, pax: 15, grupo_id: "EVT-1", email: "grupo@x.com", created_at: "2026-05-05T15:00:00Z" },
];

describe("calcularFunnelPorOrigen", () => {
  it("devuelve un objeto por cada bucket (5 buckets)", () => {
    const r = calcularFunnelPorOrigen({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    expect(r.length).toBe(5);
  });

  it("cuenta sesiones correctamente por bucket", () => {
    const r = calcularFunnelPorOrigen({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    const web = r.find(x => x.bucket === "web");
    expect(web.total_sesiones).toBe(2);   // S1 + S3
    const wa = r.find(x => x.bucket === "whatsapp");
    expect(wa.total_sesiones).toBe(1);    // S2
    const mkt = r.find(x => x.bucket === "marketing");
    expect(mkt.total_sesiones).toBe(1);   // S4
  });

  it("cascada: cada paso tiene count y dropoff", () => {
    const r = calcularFunnelPorOrigen({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    const web = r.find(x => x.bucket === "web");
    // web: S1 hizo todo (6 pasos), S3 solo paso 1 → cascada [2,1,1,1,1,1]
    expect(web.cascada[0].count).toBe(2);
    expect(web.cascada[1].count).toBe(1);
    expect(web.cascada[5].count).toBe(1);
    // Dropoff paso 1→2 = (2-1)/2 = 50%
    expect(web.cascada[1].dropoff).toBe(50);
  });

  it("identifica mayor abandono", () => {
    const r = calcularFunnelPorOrigen({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    const web = r.find(x => x.bucket === "web");
    expect(web.mayor_abandono).toBeTruthy();
    expect(web.mayor_abandono.dropoff).toBeGreaterThan(0);
  });

  it("cuenta reservas confirmadas por bucket", () => {
    const r = calcularFunnelPorOrigen({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    const web = r.find(x => x.bucket === "web");
    expect(web.reservas).toBe(2);  // R1 + R3
    const grupo = r.find(x => x.bucket === "grupo");
    expect(grupo.reservas).toBe(1);  // R4
    const wa = r.find(x => x.bucket === "whatsapp");
    expect(wa.reservas).toBe(1);   // R2 (check_in cuenta como confirmada)
  });

  it("cuenta check_in separado", () => {
    const r = calcularFunnelPorOrigen({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    const wa = r.find(x => x.bucket === "whatsapp");
    expect(wa.checkIn).toBe(1);
    const web = r.find(x => x.bucket === "web");
    expect(web.checkIn).toBe(0);
  });

  it("convRate calculado", () => {
    const r = calcularFunnelPorOrigen({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    const web = r.find(x => x.bucket === "web");
    // 2 reservas / 2 sesiones = 100% (escenario sintético)
    expect(web.convRate).toBe(100);
  });
});

describe("construirTimeline", () => {
  it("ordena items cronológicamente", () => {
    const t = construirTimeline({
      sesiones: sesionesBase.slice(0, 2),
      eventos: [],
      reservas: [reservasBase[1]],   // R2 reserva tatiana 2 may
    });
    expect(t.length).toBeGreaterThanOrEqual(3);
    // Primera entrada debe ser la sesión más antigua (1 may)
    expect(t[0].ts).toBe("2026-05-01T10:00:00Z");
  });

  it("incluye sesiones con descripción rica", () => {
    const t = construirTimeline({ sesiones: [sesionesBase[0]], eventos: [], reservas: [] });
    expect(t[0].tipo).toBe("sesion");
    expect(t[0].descripcion).toContain("Bogotá");
    expect(t[0].descripcion).toContain("4 min");
    expect(t[0].descripcion).toContain("convirtió");
  });

  it("incluye reservas + confirmación + check-in", () => {
    const t = construirTimeline({
      sesiones: [],
      eventos: [],
      reservas: [{ ...reservasBase[1], fecha: "2026-05-08" }],
    });
    const tipos = t.map(i => i.tipo);
    expect(tipos).toContain("reserva");
    expect(tipos).toContain("confirmacion");
    expect(tipos).toContain("checkin");
  });

  it("incluye cancelaciones", () => {
    const t = construirTimeline({
      sesiones: [], eventos: [],
      reservas: [{ id: "R-X", canal: "WEB", estado: "cancelado", total: 0, pax: 1, updated_at: "2026-05-10" }],
    });
    expect(t.find(i => i.tipo === "cancelacion")).toBeTruthy();
  });

  it("filtra eventos por tipos importantes", () => {
    const t = construirTimeline({
      sesiones: [], reservas: [],
      eventos: [
        { tipo: "payment_attempt", ts: "2026-05-01", datos: { metodo: "wompi", monto: 320000 } },
        { tipo: "page_view",       ts: "2026-05-01", datos: {} },   // NO importante
        { tipo: "exit_intent",     ts: "2026-05-01", datos: { paso_actual: 4 } },
      ],
    });
    const tipos = t.map(i => i.titulo);
    expect(tipos.some(s => s.includes("Intentó pagar"))).toBe(true);
    expect(tipos.some(s => s.includes("Quiso salir"))).toBe(true);
    expect(tipos.some(s => s.includes("page_view"))).toBe(false);
  });

  it("agrupa WhatsApp messages por conversación", () => {
    const t = construirTimeline({
      sesiones: [], eventos: [], reservas: [],
      waMensajes: [
        { conversacion_id: "C1", contenido: "Hola", timestamp: "2026-05-01T10:00:00Z" },
        { conversacion_id: "C1", contenido: "Quería reservar", timestamp: "2026-05-01T10:01:00Z" },
        { conversacion_id: "C2", contenido: "Aparte", timestamp: "2026-05-03T12:00:00Z" },
      ],
    });
    const waItems = t.filter(i => i.tipo === "whatsapp");
    expect(waItems.length).toBe(2);  // 2 conversaciones distintas
    expect(waItems[0].payload.count).toBe(2);  // C1 tiene 2 mensajes
  });
});

describe("calcularResumenEjecutivo", () => {
  it("devuelve KPIs por bucket", () => {
    const r = calcularResumenEjecutivo({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    expect(r.length).toBe(5);
    const web = r.find(x => x.bucket === "web");
    expect(web.sesiones).toBe(2);
    expect(web.reservas).toBe(2);
    expect(web.ingresoTotal).toBe(640000 + 880000);
  });

  it("avgTicket calculado", () => {
    const r = calcularResumenEjecutivo({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    const web = r.find(x => x.bucket === "web");
    expect(web.avgTicket).toBe(Math.round((640000 + 880000) / 2));
  });

  it("repeatRate cuenta clientes con 2+ reservas", () => {
    const reservas = [
      { canal: "WEB", estado: "confirmado", total: 100, email: "x@x.com" },
      { canal: "WEB", estado: "confirmado", total: 100, email: "x@x.com" },   // repeat
      { canal: "WEB", estado: "confirmado", total: 100, email: "y@y.com" },
    ];
    const r = calcularResumenEjecutivo({ sesiones: [], embudos: [], reservas });
    const web = r.find(x => x.bucket === "web");
    // 2 emails únicos en web, 1 con 2 reservas → repeatRate = 50%
    expect(web.repeatRate).toBe(50);
  });

  it("topDropoff disponible", () => {
    const r = calcularResumenEjecutivo({ sesiones: sesionesBase, embudos: embudosBase, reservas: reservasBase });
    const web = r.find(x => x.bucket === "web");
    expect(web.topDropoff).toBeTruthy();
    expect(web.topDropoff.label).toBeTruthy();
  });

  it("0 sesiones → KPIs en 0 sin crash", () => {
    const r = calcularResumenEjecutivo({ sesiones: [], embudos: [], reservas: [] });
    expect(r.length).toBe(5);
    for (const b of r) {
      expect(b.sesiones).toBe(0);
      expect(b.reservas).toBe(0);
    }
  });
});

describe("FUNNEL_STEPS", () => {
  it("expone 6 pasos del embudo", () => {
    expect(FUNNEL_STEPS.length).toBe(6);
    expect(FUNNEL_STEPS[0].label).toBe("Vio booking");
    expect(FUNNEL_STEPS[5].label).toBe("Completó pago");
  });
});
