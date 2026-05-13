// postMessageBridge — comunicación cross-domain con la página padre cuando el
// booking se embebe en iframe (sky-domain.com → atolon.co/booking).
//
// La página padre debe registrar un listener tipo:
//
//   window.addEventListener("message", (e) => {
//     if (e.origin !== "https://www.atolon.co") return;
//     const msg = e.data;
//     if (!msg || msg.source !== "atolon-booking" || msg.v !== 1) return;
//     // msg.event = "view_item" | "begin_checkout" | "add_payment_info"
//     //           | "purchase" | "abandon" | "step" | "pax_change"
//     //           | "payment_error" | "page_view"
//     // window.dataLayer.push({ event: "atolon_" + msg.event, atolon: msg.payload });
//   });
//
// Solo emite si estamos embebidos. En navegación standalone no hace nada.

const SCHEMA_VERSION = 1;
const SOURCE = "atolon-booking";

export function isEmbedded() {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch (_) {
    // Cross-origin parent — error al leer window.top → estamos en iframe
    return true;
  }
}

/**
 * Emite un evento estandarizado al window padre.
 * @param {string} event   Nombre del evento (snake_case, schema cerrado)
 * @param {object} payload Datos del evento. Campos comunes:
 *   - pasadia:        "vip-pass" | "exclusive-pass" | "atolon-experience" | "after-island"
 *   - lang:           "es" | "en" | "pt"
 *   - step:           1..6 (solo para event=step)
 *   - adults, children, infants
 *   - value, currency: "COP"
 *   - transaction_id: id de reserva (solo para event=purchase)
 *   - error_code, error_message (solo para event=payment_error)
 */
export function emitToParent(event, payload = {}) {
  if (!isEmbedded()) return false;
  if (typeof window === "undefined") return false;
  try {
    const msg = {
      source: SOURCE,
      v:      SCHEMA_VERSION,
      event,
      payload,
      ts:     Date.now(),
    };
    // targetOrigin "*" — el listener parent valida origen del lado receptor.
    // No usamos parent.origin específico porque el sitio de Sky puede vivir en
    // múltiples dominios (staging, prod, preview).
    window.parent.postMessage(msg, "*");
    return true;
  } catch (err) {
    // Silencioso — no queremos romper el flujo del booking si el bridge falla
    if (typeof console !== "undefined" && console.debug) {
      console.debug("[postMessageBridge] emit failed:", err?.message);
    }
    return false;
  }
}

// Mapping de nombres internos AtolanTrack → eventos estándar exportados al parent.
// Solo los eventos en este mapa se reemiten — el resto se queda interno.
const EVENT_MAP = {
  page_view:               "page_view",
  booking_widget_visto:    "view_item",
  view_item:               "view_item",
  payment_method_selected: "add_payment_info",
  payment_attempt:         "begin_checkout",
  pax_cambio:              "pax_change",
  embudo_abandono:         "abandon",
  conversion:              "purchase",
  payment_error:           "payment_error",
};

/**
 * Helper que recibe un evento interno de AtolanTrack y lo reemite al parent
 * mapeado al schema público.
 */
export function emitFromAtolanTrackEvent(internalName, datos = {}, ctx = {}) {
  const mapped = EVENT_MAP[internalName];
  if (!mapped) return false;

  const payload = {
    pasadia: ctx.pasadia ?? datos.tipo_slug ?? datos.slug ?? null,
    lang:    ctx.lang ?? null,
  };

  // Enriquecer payload según el evento
  if (datos.adultos != null || datos.adults != null)   payload.adults   = datos.adultos ?? datos.adults;
  if (datos.ninos   != null || datos.children != null) payload.children = datos.ninos   ?? datos.children;
  if (datos.infantes != null || datos.infants != null) payload.infants  = datos.infantes ?? datos.infants;
  if (datos.monto   != null || datos.valor    != null || datos.value != null) {
    payload.value = datos.monto ?? datos.valor ?? datos.value;
    payload.currency = "COP";
  }
  if (datos.reserva_id) payload.transaction_id = datos.reserva_id;
  if (datos.fecha)      payload.fecha = datos.fecha;
  if (datos.error_code) payload.error_code = datos.error_code;
  if (datos.error_message) payload.error_message = datos.error_message;

  return emitToParent(mapped, payload);
}

/**
 * Emite explícitamente un step del funnel.
 */
export function emitStep(step, ctx = {}) {
  return emitToParent("step", {
    step,
    pasadia: ctx.pasadia ?? null,
    lang:    ctx.lang ?? null,
  });
}

export default { emitToParent, emitFromAtolanTrackEvent, emitStep, isEmbedded };
