import { describe, it, expect } from "vitest";
import {
  clasificarOrigen, clasificarOrigenWeb, clasificarOrigenReserva,
  ORIGEN_BUCKETS, ORIGEN_LABELS,
} from "./origenClassifier.js";

describe("clasificarOrigen — Grupo (prioridad 1)", () => {
  it("grupo_id presente → grupo", () => {
    expect(clasificarOrigen({ grupo_id: "EVT-123" })).toBe("grupo");
  });
  it("canal GRUPO → grupo (case insensitive)", () => {
    expect(clasificarOrigen({ canal: "GRUPO" })).toBe("grupo");
    expect(clasificarOrigen({ canal: "grupo-org" })).toBe("grupo");
    expect(clasificarOrigen({ canal: "B2B" })).toBe("grupo");
  });
  it("URL con ?grupo= → grupo", () => {
    expect(clasificarOrigen({ url: "?grupo=EVT-456&otra=x" })).toBe("grupo");
  });
  it("aliado_id + canal vacío → grupo (reserva B2B sin etiqueta)", () => {
    expect(clasificarOrigen({ aliado_id: "B2B-123", canal: "" })).toBe("grupo");
  });
  it("aliado_id pero canal=WhatsApp → respeta WhatsApp", () => {
    expect(clasificarOrigen({ aliado_id: "B2B-123", canal: "WhatsApp" })).toBe("whatsapp");
  });
});

describe("clasificarOrigen — WhatsApp (prioridad 2)", () => {
  it("canal WhatsApp/Tatiana → whatsapp", () => {
    expect(clasificarOrigen({ canal: "WhatsApp" })).toBe("whatsapp");
    expect(clasificarOrigen({ canal: "tatiana" })).toBe("whatsapp");
    expect(clasificarOrigen({ canal: "wa" })).toBe("whatsapp");
  });
  it("utm_source whatsapp → whatsapp", () => {
    expect(clasificarOrigen({ utms: { utm_source: "whatsapp" } })).toBe("whatsapp");
  });
  it("referrer wa.me → whatsapp", () => {
    expect(clasificarOrigen({ referrer: "https://wa.me/+573001234567" })).toBe("whatsapp");
  });
  it("referrer whatsapp.com → whatsapp", () => {
    expect(clasificarOrigen({ referrer: "https://web.whatsapp.com/" })).toBe("whatsapp");
  });
});

describe("clasificarOrigen — Staff/Manual (prioridad 3)", () => {
  it("vendedor presente → staff", () => {
    expect(clasificarOrigen({ vendedor: "Violeta Simancas" })).toBe("staff");
  });
  it("canal Walk-in → staff", () => {
    expect(clasificarOrigen({ canal: "Walk-in" })).toBe("staff");
    expect(clasificarOrigen({ canal: "walkin" })).toBe("staff");
  });
  it("canal Teléfono → staff", () => {
    expect(clasificarOrigen({ canal: "Teléfono" })).toBe("staff");
  });
  it("vendedor + grupo_id → grupo (grupo gana)", () => {
    expect(clasificarOrigen({ vendedor: "X", grupo_id: "EVT-1" })).toBe("grupo");
  });
});

describe("clasificarOrigen — Marketing (prioridad 4)", () => {
  it("gclid → marketing (Google Ads)", () => {
    expect(clasificarOrigen({ clickIds: { gclid: "abc" } })).toBe("marketing");
  });
  it("fbclid → marketing (Meta Ads)", () => {
    expect(clasificarOrigen({ clickIds: { fbclid: "xyz" } })).toBe("marketing");
  });
  it("utm_medium cpc → marketing", () => {
    expect(clasificarOrigen({ utms: { utm_medium: "cpc" } })).toBe("marketing");
  });
  it("utm_source instagram (orgánico) → marketing", () => {
    expect(clasificarOrigen({ utms: { utm_source: "instagram" } })).toBe("marketing");
  });
  it("referrer google.com → marketing (SEO)", () => {
    expect(clasificarOrigen({ referrer: "https://www.google.com/" })).toBe("marketing");
  });
  it("referrer facebook.com → marketing", () => {
    expect(clasificarOrigen({ referrer: "https://www.facebook.com/" })).toBe("marketing");
  });
});

describe("clasificarOrigen — Web (fallback)", () => {
  it("sin datos → web", () => {
    expect(clasificarOrigen({})).toBe("web");
  });
  it("canal Web → web", () => {
    expect(clasificarOrigen({ canal: "WEB" })).toBe("web");
  });
  it("referrer atoloncartagena.com (interno) → web", () => {
    expect(clasificarOrigen({ referrer: "https://www.atoloncartagena.com/booking" })).toBe("web");
  });
  it("referrer desconocido (no es marketing ni whatsapp) → web", () => {
    expect(clasificarOrigen({ referrer: "https://random-blog.com" })).toBe("web");
  });
});

describe("clasificarOrigenReserva — mapeo desde fila de BD", () => {
  it("Reserva web normal", () => {
    expect(clasificarOrigenReserva({
      canal: "WEB", grupo_id: null, vendedor: null,
    })).toBe("web");
  });
  it("Reserva B2B con grupo", () => {
    expect(clasificarOrigenReserva({
      canal: "B2B", grupo_id: null, vendedor: "Violeta",
      aliado_id: "B2B-X",
    })).toBe("grupo");   // canal=B2B se considera grupo aunque tenga vendedor
  });
  it("Reserva Walk-in con vendedor", () => {
    expect(clasificarOrigenReserva({
      canal: "Walk-in", vendedor: "Operador",
    })).toBe("staff");
  });
  it("Reserva canal Tatiana", () => {
    expect(clasificarOrigenReserva({ canal: "tatiana" })).toBe("whatsapp");
  });
});

describe("clasificarOrigenWeb — desde browser context", () => {
  it("usa utms + referrer + clickIds sin url propio", () => {
    expect(clasificarOrigenWeb({
      utms: {}, referrer: "https://wa.me/x", clickIds: {},
    })).toBe("whatsapp");
  });
});

describe("constantes exportadas", () => {
  it("5 buckets", () => expect(ORIGEN_BUCKETS.length).toBe(5));
  it("labels para cada bucket", () => {
    for (const b of ORIGEN_BUCKETS) expect(ORIGEN_LABELS[b]).toBeTruthy();
  });
});
