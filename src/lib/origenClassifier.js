// origenClassifier — clasifica el origen de un visitante/reserva en 5 buckets
// para reportes de marketing y operación.
//
// Buckets:
//   - "grupo"     → vino de un evento/grupo (URL ?grupo=, canal=GRUPO*, grupo_id)
//   - "whatsapp"  → llegó vía WhatsApp (utm=whatsapp, referrer wa.me, bot Tatiana)
//   - "marketing" → ads (gclid/fbclid/...), redes sociales orgánicas, SEO, email
//   - "staff"     → reserva creada manualmente por personal interno
//   - "web"       → atoloncartagena.com directo o referido genérico (todo lo demás)
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
  } = input;

  const canalLower = String(canal || "").trim().toLowerCase();
  const refLower   = String(referrer || "").toLowerCase();
  const src        = String(utms?.utm_source || "").toLowerCase();
  const med        = String(utms?.utm_medium || "").toLowerCase();
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

  // ── 5. Web (fallback) ──────────────────────────────────────────────────────
  return "web";
}

/**
 * Helper para usar desde AtolanTrack: clasifica con los datos del browser.
 */
export function clasificarOrigenWeb({ utms, referrer, clickIds }) {
  return clasificarOrigen({
    utms, referrer, clickIds,
    url: typeof window !== "undefined" ? window.location.search : "",
  });
}

/**
 * Helper para usar desde reportes: clasifica una reserva del BD.
 */
export function clasificarOrigenReserva(reserva = {}) {
  return clasificarOrigen({
    canal:     reserva.canal,
    grupo_id:  reserva.grupo_id,
    vendedor:  reserva.vendedor,
    aliado_id: reserva.aliado_id,
    utms:      reserva.utms_capturados || reserva.utms,
    referrer:  reserva.referrer,
  });
}
