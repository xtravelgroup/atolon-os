import { supabase } from "./supabase";

// Captura la IP (server-side) + consentimiento del cliente al crear una reserva en la
// página. Evidencia de autorización para responder chargebacks. Fire-and-forget: NUNCA
// debe romper ni frenar el flujo de reserva.
export function registrarConsentimientoReserva(reservaId, email, extra = {}) {
  if (!supabase || (!reservaId && !email)) return;
  try {
    supabase.functions.invoke("registrar-consentimiento", {
      body: {
        reserva_id: reservaId || null,
        email: email || null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        canal: extra.canal || "web",
        identif: extra.identif || null,
        tipo: extra.tipo || "tratamiento_datos_reserva",
      },
    }).then(() => {}).catch(() => {});
  } catch { /* noop */ }
}
