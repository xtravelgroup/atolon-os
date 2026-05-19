// origenClassifier — clasifica el origen de un visitante/reserva en 5 buckets
// para reportes de marketing y operación.
//
// Buckets:
//   - "grupo"     → vino de un evento/grupo (URL ?grupo=, canal=GRUPO*, grupo_id)
//   - "whatsapp"  → llegó vía WhatsApp (utm=whatsapp, referrer wa.me, bot Tatiana)
//   - "marketing" → ads (gclid/fbclid/...), redes sociales orgánicas, SEO, email
//   - "staff"     → reserva creada manualmente por personal interno en Atolon OS
//   - "web"       → SOLO booking público desde atolon.co/booking (id empieza con "WEB-")
//
// ⚠️ REGLA CRÍTICA del bucket "web":
//   Una reserva solo se cuenta como venta web si fue generada por el flujo
//   público de BookingPopup (id LIKE 'WEB-%'). Las reservas creadas por el
//   equipo comercial desde Atolon OS (id LIKE 'R-%') NUNCA son "web" — aunque
//   el operador haya marcado canal="WEB" por error, son ventas internas / manuales.
//
// Esta función es la fuente única de verdad. La usan:
//   - AtolanTrack.js (cliente, al iniciar sesión web)
//   - Analitica.jsx (reportes, al hacer roll-up de reservas)

export const ORIGEN_BUCKETS = ["grupo", "whatsapp", "marketing", "staff", "web"];

export const ORIGEN_LABELS = {
  grupo:     "👥 Grupos",
  whatsapp:  "💬 WhatsApp",
  marketing: "📢 Marketing",
  staff:     "🛎 Staff / Manual",
  web:       "🌐 Web directo",
};

const STAFF_CANALES = new Set([
  "walk-in", "walkin", "manual", "ff", "friends & family", "friends_family",
  "telefono", "teléfono", "phone", "email",
]);

const GRUPO_CANALES = new Set(["grupo", "grupo-org", "b2b", "agencia"]);

const WA_CANALES = new Set(["whatsapp", "wa", "tatiana"]);

// Slugs válidos de producto en BookingPopup. Solo URLs que matchean estos slugs
// (o /booking sin slug) cuentan como una landing web genuina.
const VALID_PRODUCT_SLUGS = new Set([
  "vip-pass", "exclusive-pass", "atolon-experience", "after-island",
]);

/**
 * Verifica que un landing_page sea una URL real del booking público.
 * Acepta:
 *   - /booking
 *   - /booking/{slug}          (clean URL)
 *   - /booking?tipo={slug}     (query param)
 *   - cualquiera de los anteriores con UTMs adicionales
 * Rechaza paths extraños, iframes, dominios desconocidos.
 */
function esLandingBookingValido(landingPage) {
  if (!landingPage) return false;
  const lp = String(landingPage).toLowerCase();
  // Extraer pathname (descartar host si lo trajo accidentalmente)
  let path = lp;
  try {
    if (lp.startsWith("http")) path = new URL(lp).pathname + new URL(lp).search;
  } catch { /* path queda igual */ }
  const [pathOnly, queryStr = ""] = path.split("?");

  // /booking exacto
  if (pathOnly === "/booking" || pathOnly === "/booking/") {
    // Si tiene tipo en query, validar slug
    const m = queryStr.match(/(?:^|&)tipo=([^&]+)/);
    if (m) return VALID_PRODUCT_SLUGS.has(decodeURIComponent(m[1]));
    return true;
  }
  // /booking/{slug}
  const m = pathOnly.match(/^\/booking\/([^/]+)\/?$/);
  if (m) return VALID_PRODUCT_SLUGS.has(m[1]);
  return false;
}

/**
 * Clasifica una sesión web o una reserva en uno de los 5 buckets.
 *
 * Para SESIÓN WEB pasar:
 *   { utms, referrer, clickIds, url }
 *
 * Para RESERVA pasar:
 *   { canal, grupo_id, vendedor, aliado_id, utms?, referrer? }
 *
 * Las prioridades de detección (de mayor a menor):
 *  1. grupo:     URL contiene ?grupo=, grupo_id IS NOT NULL, o canal grupo/b2b
 *  2. whatsapp:  utm whatsapp, referrer wa.me/whatsapp.com, canal tatiana/whatsapp
 *  3. staff:     vendedor IS NOT NULL, canal walk-in/manual
 *  4. marketing: hay clickId (gclid/fbclid/...) o utm_medium cpc/social/email
 *  5. web:       fallback
 *
 * @returns {"grupo"|"whatsapp"|"marketing"|"staff"|"web"}
 */
export function clasificarOrigen(input = {}) {
  const {
    utms = {}, referrer = "", clickIds = {}, url = "",
    canal = "", grupo_id = null, vendedor = null, aliado_id = null,
    // esCreadaEnAdmin = true  → reserva creada por personal en Atolon OS (id LIKE 'R-%').
    //                           NUNCA puede caer en bucket "web"; si no califica en otro
    //                           bucket, va a "staff".
    // esCreadaEnAdmin = false → sesión web del cliente o reserva generada por BookingPopup
    //                           (id LIKE 'WEB-%'). Puede caer en "web" como fallback.
    esCreadaEnAdmin = false,
    // landing_page → URL donde aterrizó la reserva (path + query). Solo se valida
    //                cuando strictWebLanding=true (reservas para sales attribution).
    landing_page = "",
    // strictWebLanding = true → exige que landing_page matchee /booking | /booking/{slug}
    //                            | /booking?tipo={slug}. Para reservas (clasificarOrigenReserva).
    // strictWebLanding = false → cualquier path en atolon.co cuenta como web (sesiones
    //                             desde homepage, blog, etc. son tráfico web legítimo).
    strictWebLanding = false,
  } = input;

  const canalLower = String(canal || "").trim().toLowerCase();
  const refLower   = String(referrer || "").toLowerCase();
  // Aceptar typos comunes sin guion bajo (utmsource/utmmedium) — la IA
  // de WhatsApp generaba links así y se perdía la atribución.
  const src        = String(utms?.utm_source || utms?.utmsource || "").toLowerCase();
  const med        = String(utms?.utm_medium || utms?.utmmedium || "").toLowerCase();
  const urlLower   = String(url || "").toLowerCase();

  // ── 1. Grupo (highest priority) ────────────────────────────────────────────
  if (grupo_id) return "grupo";
  if (GRUPO_CANALES.has(canalLower)) return "grupo";
  if (urlLower.includes("?grupo=") || urlLower.includes("&grupo=")) return "grupo";
  if (aliado_id && (canalLower === "" || canalLower === "web")) return "grupo";

  // ── 2. WhatsApp ────────────────────────────────────────────────────────────
  if (WA_CANALES.has(canalLower)) return "whatsapp";
  if (src === "whatsapp" || med === "whatsapp") return "whatsapp";
  if (refLower.includes("whatsapp.com") || refLower.includes("wa.me")) return "whatsapp";

  // ── 3. Staff / Manual ──────────────────────────────────────────────────────
  if (vendedor) return "staff";
  if (STAFF_CANALES.has(canalLower)) return "staff";

  // ── 4. Marketing (ads / social / SEO) ──────────────────────────────────────
  if (clickIds?.gclid || clickIds?.fbclid || clickIds?.msclkid || clickIds?.ttclid) {
    return "marketing";
  }
  if (med === "cpc" || med === "ppc" || med === "paid_social" || med === "social" ||
      med === "email" || med === "display" || med === "video") {
    return "marketing";
  }
  if (src === "google" || src === "bing" || src === "yahoo" ||
      src === "facebook" || src === "instagram" || src === "meta" ||
      src === "tiktok" || src === "twitter" || src === "x" ||
      src === "youtube" || src === "linkedin" || src === "email" ||
      src === "mailchimp" || src === "newsletter") {
    return "marketing";
  }
  if (refLower.includes("google.") || refLower.includes("bing.") ||
      refLower.includes("yahoo.") || refLower.includes("duckduckgo.") ||
      refLower.includes("facebook.com") || refLower.includes("instagram.com") ||
      refLower.includes("tiktok.com") || refLower.includes("youtube.com") ||
      refLower.includes("t.co") || refLower.includes("twitter.com")) {
    return "marketing";
  }

  // ── 5. Fallback ────────────────────────────────────────────────────────────
  // Si la reserva fue creada en Atolon OS (admin) y no calificó en grupo/wa/staff/marketing,
  // no puede ser "web": cae en "staff" (entrada manual del equipo comercial).
  if (esCreadaEnAdmin) return "staff";
  // Validación estricta solo para reservas (sales attribution):
  // cuentan como "web" únicamente las generadas desde las URLs oficiales del
  // BookingPopup público:
  //   /booking
  //   /booking/{vip-pass | exclusive-pass | atolon-experience | after-island}
  //   /booking?tipo={slug}
  // Si trae landing_page diferente, es algo raro (iframe, embed, link manipulado)
  // → staff. Sesiones (strictWebLanding=false) aceptan cualquier path de atolon.co.
  if (strictWebLanding && landing_page && !esLandingBookingValido(landing_page)) return "staff";
  return "web";
}

/**
 * Helper para usar desde AtolanTrack: clasifica con los datos del browser.
 * Toma el landing_page de window.location para que la validación estricta del
 * bucket "web" (solo URLs oficiales del booking) funcione también para sesiones.
 */
export function clasificarOrigenWeb({ utms, referrer, clickIds }) {
  const hasWin = typeof window !== "undefined";
  return clasificarOrigen({
    utms, referrer, clickIds,
    url:          hasWin ? window.location.search : "",
    landing_page: hasWin ? (window.location.pathname + window.location.search) : "",
  });
}

/**
 * Helper para usar desde reportes: clasifica una reserva del BD.
 *
 * Importante: el id de la reserva determina si pudo haber sido "web":
 *   - WEB-{timestamp} → la generó BookingPopup (atolon.co/booking).
 *   - R-{timestamp}   → la creó el equipo comercial desde Atolon OS — NUNCA es "web".
 */
export function clasificarOrigenReserva(reserva = {}) {
  const id = String(reserva.id || "");
  const esCreadaEnAdmin = !id.startsWith("WEB-");
  const utms = reserva.utms_capturados || reserva.utms || {};
  return clasificarOrigen({
    canal:           reserva.canal,
    grupo_id:        reserva.grupo_id,
    vendedor:        reserva.vendedor,
    aliado_id:       reserva.aliado_id,
    utms,
    referrer:        reserva.referrer || utms.referrer,
    landing_page:    reserva.landing_page || utms.landing_page,
    esCreadaEnAdmin,
    strictWebLanding: true,   // reservas: solo URLs oficiales cuentan como "web"
  });
}
