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
  it("sin datos → web (sesión web del cliente, no admin)", () => {
    expect(clasificarOrigen({})).toBe("web");
  });
  it("canal Web → web (sesión web del cliente)", () => {
    expect(clasificarOrigen({ canal: "WEB" })).toBe("web");
  });
  it("referrer atoloncartagena.com (interno) → web", () => {
    expect(clasificarOrigen({ referrer: "https://www.atoloncartagena.com/booking" })).toBe("web");
  });
  it("referrer desconocido (no es marketing ni whatsapp) → web", () => {
    expect(clasificarOrigen({ referrer: "https://random-blog.com" })).toBe("web");
  });
  it("esCreadaEnAdmin=true + canal genérico → staff (NO web)", () => {
    // Reserva creada por personal en Atolon OS sin canal específico nunca es "web".
    expect(clasificarOrigen({ canal: "WEB", esCreadaEnAdmin: true })).toBe("staff");
    expect(clasificarOrigen({ esCreadaEnAdmin: true })).toBe("staff");
  });
});

describe("clasificarOrigenReserva — mapeo desde fila de BD", () => {
  it("Reserva web genuina (id WEB-…) → web", () => {
    expect(clasificarOrigenReserva({
      id: "WEB-1778719267452", canal: "WEB", grupo_id: null, vendedor: null,
    })).toBe("web");
  });
  it("Reserva admin (id R-…) con canal WEB → staff (NO web)", () => {
    // Caso real: el equipo comercial creó la reserva en Atolon OS y marcó canal=WEB
    // por error. Aunque diga WEB en el campo, no es venta web genuina.
    expect(clasificarOrigenReserva({
      id: "R-1778722916882", canal: "WEB", grupo_id: null, vendedor: null,
    })).toBe("staff");
  });
  it("Reserva admin (id R-…) sin canal → staff", () => {
    expect(clasificarOrigenReserva({ id: "R-123" })).toBe("staff");
  });
  it("Reserva admin (id R-…) con canal WhatsApp → whatsapp", () => {
    // Cliente vino por WhatsApp y admin entró la reserva manualmente. El canal real
    // sigue siendo WhatsApp aunque la haya creado el equipo comercial.
    expect(clasificarOrigenReserva({
      id: "R-1778722916882", canal: "WhatsApp",
    })).toBe("whatsapp");
  });
  it("Reserva admin (id R-…) con grupo_id → grupo", () => {
    expect(clasificarOrigenReserva({
      id: "R-456", canal: "GRUPO", grupo_id: "EVT-1",
    })).toBe("grupo");
  });
  it("Reserva B2B con grupo (id R-…)", () => {
    expect(clasificarOrigenReserva({
      id: "R-789", canal: "B2B", grupo_id: null, vendedor: "Violeta",
      aliado_id: "B2B-X",
    })).toBe("grupo");
  });
  it("Reserva Walk-in con vendedor (id R-…)", () => {
    expect(clasificarOrigenReserva({
      id: "R-111", canal: "Walk-in", vendedor: "Operador",
    })).toBe("staff");
  });
  it("Reserva canal Tatiana (id R-…)", () => {
    expect(clasificarOrigenReserva({ id: "R-222", canal: "tatiana" })).toBe("whatsapp");
  });
  it("Reserva sin id ni canal → staff (asume admin)", () => {
    // Defensa: si llega una reserva sin id, asumir admin para no inflar bucket web.
    expect(clasificarOrigenReserva({})).toBe("staff");
  });
});

describe("clasificarOrigen — validación estricta de landing_page (strictWebLanding=true)", () => {
  // Cuando strictWebLanding=true (modo reserva/sales), solo estas URLs cuentan como web:
  //   /booking, /booking/{slug}, /booking?tipo={slug}
  // Slugs válidos: vip-pass, exclusive-pass, atolon-experience, after-island.
  // Sin el flag (modo sesión), cualquier landing es aceptado como web.
  const strict = { strictWebLanding: true };

  it("landing /booking → web", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "/booking" })).toBe("web");
  });
  it("landing /booking/vip-pass → web", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "/booking/vip-pass" })).toBe("web");
  });
  it("landing /booking/exclusive-pass → web", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "/booking/exclusive-pass" })).toBe("web");
  });
  it("landing /booking/atolon-experience → web", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "/booking/atolon-experience" })).toBe("web");
  });
  it("landing /booking/after-island → web", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "/booking/after-island" })).toBe("web");
  });
  it("landing /booking?tipo=vip-pass → web", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "/booking?tipo=vip-pass" })).toBe("web");
  });
  it("landing /booking con UTMs → web (extra params no rompen)", () => {
    expect(clasificarOrigen({
      ...strict,
      landing_page: "/booking?tipo=after-island&utm_source=google",
    })).toBe("web");
  });
  it("landing /booking sin tipo + UTM → web", () => {
    expect(clasificarOrigen({
      ...strict,
      landing_page: "/booking?utm_source=newsletter",
    })).toBe("web");
  });
  it("landing /otra-pagina con strict → staff", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "/landing-page-rara" })).toBe("staff");
  });
  it("landing /booking/slug-inventado con strict → staff", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "/booking/super-pase-vip" })).toBe("staff");
  });
  it("landing externo en iframe con strict → staff", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "https://otrodominio.com/atolon-iframe" })).toBe("staff");
  });
  it("landing /booking absoluto con host → web", () => {
    expect(clasificarOrigen({ ...strict, landing_page: "https://www.atolon.co/booking" })).toBe("web");
  });
  it("landing oficial pero whatsapp UTM → whatsapp (prioridad WA gana)", () => {
    expect(clasificarOrigen({
      ...strict,
      landing_page: "/booking?tipo=vip-pass&utm_source=whatsapp",
      utms: { utm_source: "whatsapp" },
    })).toBe("whatsapp");
  });

  // Sesiones (sin strict): cualquier landing es web
  it("sesión sin strict: landing /otra-pagina → web (no aplica validación)", () => {
    expect(clasificarOrigen({ landing_page: "/landing-page-rara" })).toBe("web");
  });
  it("sesión sin strict: landing homepage / → web", () => {
    expect(clasificarOrigen({ landing_page: "/" })).toBe("web");
  });
});

describe("clasificarOrigenReserva — landing_page desde utms_capturados", () => {
  it("Reserva WEB con landing oficial → web", () => {
    expect(clasificarOrigenReserva({
      id: "WEB-1", canal: "WEB",
      utms_capturados: { landing_page: "/booking/vip-pass" },
    })).toBe("web");
  });
  it("Reserva WEB con landing oficial + utm whatsapp → whatsapp", () => {
    expect(clasificarOrigenReserva({
      id: "WEB-2", canal: "WEB",
      utms_capturados: {
        utm_source: "whatsapp",
        landing_page: "/booking?tipo=vip-pass&utm_source=whatsapp",
      },
    })).toBe("whatsapp");
  });
  it("Reserva WEB con landing inventado → staff", () => {
    // Caso defensivo: una reserva con id WEB- pero landing raro (no debería pasar
    // en condiciones normales, pero protege contra futuros bugs o embeds raros).
    expect(clasificarOrigenReserva({
      id: "WEB-3", canal: "WEB",
      utms_capturados: { landing_page: "/promo-secreto" },
    })).toBe("staff");
  });
  it("Reserva WEB sin landing_page → web (sesión legacy)", () => {
    expect(clasificarOrigenReserva({ id: "WEB-4", canal: "WEB" })).toBe("web");
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
