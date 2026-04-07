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
 */
export async function sendWhatsApp(to, template, params = []) {
  if (!to || !template) return { error: "to and template required" };

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON}`,
        "apikey":        SUPABASE_ANON,
      },
      body: JSON.stringify({ to, template, params }),
    });
    return res.json();
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return { error: String(err) };
  }
}

// ── Helpers por tipo de mensaje ──────────────────────────────────────────────

/**
 * Confirmación de reserva (se llama al confirmar pago)
 */
export async function waSendConfirmacion(reserva, salida) {
  const telefono = reserva.telefono || reserva.contacto;
  if (!telefono || !telefono.match(/\d{7,}/)) return;

  const nombre = reserva.nombre?.split(" ")[0] || reserva.nombre;
  const fecha  = new Date(reserva.fecha + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });

  // Calcular hora llegada muelle (20 min antes)
  let llegada = "";
  if (salida?.hora) {
    const [h, m] = salida.hora.split(":").map(Number);
    const total  = h * 60 + m - 20;
    const norm   = ((total % 1440) + 1440) % 1440;
    llegada = `${String(Math.floor(norm / 60)).padStart(2,"0")}:${String(norm % 60).padStart(2,"0")}`;
  }

  const zarpeUrl = `https://atolon.co/zarpe-info?id=${reserva.id}`;

  return sendWhatsApp(telefono, "confirmacion_reserva", [
    nombre,
    fecha,
    reserva.tipo || "Pasadía",
    String(reserva.pax || 1),
    llegada || salida?.hora || "Ver confirmación",
    salida?.hora || "Ver confirmación",
    zarpeUrl,
  ]);
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
