/**
 * whatsapp.js — Helper para enviar mensajes de WhatsApp via send-whatsapp Edge Function
 */

import { supabase } from "./supabase";

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON    = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Envía un template de WhatsApp
 * @param {string} to       - Teléfono: "+573001234567" o "3001234567"
 * @param {string} template - Nombre del template en Meta
 * @param {string[]} params - Variables {{1}}, {{2}}, ...
 * @param {string} lang     - Código de idioma (default "es", usa "es_CO" para colombia)
 */
export async function sendWhatsApp(to, template, params = [], lang = "es") {
  if (!to || !template) return { error: "to and template required" };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp/send`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON}`,
        "apikey":        SUPABASE_ANON,
      },
      body: JSON.stringify({ to, template, params, lang }),
    });
    return res.json();
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return { error: String(err) };
  }
}

// ── Helpers por tipo de mensaje ──────────────────────────────────────────────

/**
 * Confirmación de reserva (se llama al confirmar pago).
 *
 * Templates en orden de preferencia (cascade fallback):
 * 1. "confirmacion_pasadia_atolon" (es) — 7 vars genérica para cualquier tipo de
 *    pasadía (VIP, Exclusive, etc.). Botones: URL "Ver confirmación" +
 *    teléfono Atolón. Variable button: {{1}} = reserva_id.
 * 2. "vip_pass_confirmacion" (es) — 6 vars, específica VIP Pass.
 * 3. "confirmacionvip" (es_CO) — sin variables, fallback aprobado.
 */
export async function waSendConfirmacion(reserva, salida) {
  const telefono = reserva.telefono || reserva.contacto;
  if (!telefono || !telefono.match(/\d{7,}/)) return;

  const nombre = reserva.nombre?.split(" ")[0] || reserva.nombre;
  const fecha  = new Date(reserva.fecha + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });

  const totalCOP   = `$${Number(reserva.total || 0).toLocaleString("es-CO")} COP`;
  const horaSalida = salida?.hora || "Ver confirmación";
  const tipo       = reserva.tipo || "Pasadía";

  // Intento 1 — confirmacion_pasadia_atolon (genérica con tipo)
  const r1 = await sendWhatsApp(telefono, "confirmacion_pasadia_atolon", [
    nombre,
    tipo,
    fecha,
    String(reserva.pax || 1),
    horaSalida,
    totalCOP,
    reserva.id,
  ], "es");
  if (!r1?.error) return { template_used: "confirmacion_pasadia_atolon", ...r1 };

  // Intento 2 — vip_pass_confirmacion
  const r2 = await sendWhatsApp(telefono, "vip_pass_confirmacion", [
    nombre, fecha, String(reserva.pax || 1), horaSalida, totalCOP, reserva.id,
  ], "es");
  if (!r2?.error) return { template_used: "vip_pass_confirmacion", ...r2 };

  // Fallback — confirmacionvip (sin variables, ya aprobada)
  const r3 = await sendWhatsApp(telefono, "confirmacionvip", [], "es_CO");
  return { template_used: "confirmacionvip", first_attempts: [r1?.error, r2?.error], ...r3 };
}

/**
 * Notificación interna al equipo (nueva reserva web)
 */
export async function waSendNuevaReservaEquipo(reserva, waEquipo) {
  if (!waEquipo) return;
  // Mensaje libre (dentro de ventana de sesión) — no requiere template
  // Solo disponible si el equipo ha enviado un mensaje previo al número business
  // Para mensajes outbound sin sesión activa, se necesita template UTILITY/MARKETING
  console.log("Nueva reserva:", reserva.id, "— notificación equipo pendiente");
}
