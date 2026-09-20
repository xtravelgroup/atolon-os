// src/lib/ga4Ids.js
//
// Lee { client_id, session_id } del gtag que ya carga initTracking() en
// src/lib/gtm.js. Se persisten en la reserva para que el edge function
// ga4-purchase (Measurement Protocol server-side) atribuya el purchase a la
// misma sesión GA4 que abrió el widget — clave para las reservas que
// confirman por WhatsApp / Marea después del pago pendiente.

import { getGa4Id } from "./gtm.js";

const RESOLVE_TIMEOUT_MS = 1500;

export async function getGa4Ids() {
  const measurementId = getGa4Id();
  if (typeof window === "undefined" || !window.gtag || !measurementId) {
    return { client_id: null, session_id: null };
  }

  return await new Promise((resolve) => {
    let done = false;
    let clientReady = false;
    let sessionReady = false;
    const out = { client_id: null, session_id: null };

    const maybeFinish = () => {
      if (done || !(clientReady && sessionReady)) return;
      done = true;
      resolve(out);
    };
    const finishNow = () => {
      if (done) return;
      done = true;
      resolve(out);
    };

    try {
      window.gtag("get", measurementId, "client_id", (id) => {
        out.client_id = id || null;
        clientReady = true;
        maybeFinish();
      });
      window.gtag("get", measurementId, "session_id", (id) => {
        out.session_id = id ? String(id) : null;
        sessionReady = true;
        maybeFinish();
      });
    } catch {
      finishNow();
      return;
    }
    // gtag no siempre responde (cookies bloqueadas, script tarda) — timeout duro.
    setTimeout(finishNow, RESOLVE_TIMEOUT_MS);
  });
}
