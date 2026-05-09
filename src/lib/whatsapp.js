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
 * Templates disponibles:
 * - "vip_pass_confirmacion" (es) — 6 variables {{1}}..{{6}}: nombre, fecha,
 *   pax, hora_salida, total_pagado, reserva_id. Botón URL "Ver confirmación".
 *   Estado: PENDING → cuando Meta lo apruebe (1-24h) será el preferido.
 * - "confirmacionvip" (es_CO) — sin variables, fallback aprobado.
 *
 * Si la primera template falla (no aprobada aún), se reintenta con la
 * segunda (sin params). Devuelve { template_used, ...meta_response }.
 */
export async function waSendConfirmacion(reserva, salida) {
  const telefono = reserva.telefono || reserva.contacto;
  if (!telefono || !telefono.match(/\d{7,}/)) return;

  const nombre = reserva.nombre?.split(" ")[0] || reserva.nombre;
  const fecha  = new Date(reserva.fecha + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });

  // Total pagado COP formateado
  const totalCOP = `$${Number(reserva.total || 0).toLocaleString("es-CO")} COP`;

  // Hora de salida del muelle
  const horaSalida = salida?.hora || "Ver confirmación";

  // Intento 1 — template con variables (vip_pass_confirmacion)
  const r1 = await sendWhatsApp(telefono, "vip_pass_confirmacion", [
    nombre,
    fecha,
    String(reserva.pax || 1),
    horaSalida,
    totalCOP,
    reserva.id,
  ], "es");
  if (!r1?.error) return { template_used: "vip_pass_confirmacion", ...r1 };

  // Fallback — template aprobada sin variables
  const r2 = await sendWhatsApp(telefono, "confirmacionvip", [], "es_CO");
  return { template_used: "confirmacionvip", first_attempt_error: r1?.error, ...r2 };
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
