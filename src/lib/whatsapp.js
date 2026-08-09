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
 * Confirmación de reserva. Se llama al confirmar pago (webhooks) o al
 * cambiar el estado a 'confirmado' desde staff (módulo Reservas).
 *
 * Idempotencia: consulta whatsapp_logs y skip si ya se envió confirmación
 * para esta reserva (evita duplicados en múltiples ediciones).
 *
 * Precio: NUNCA se muestra el total pagado — política definida por Eric.
 * En {{5}} va "—" en lugar del monto para no revelar precios reales
 * (importante para reservas B2B/Agencia donde el neto ≠ precio público).
 *
 * Templates en orden de preferencia (cascade fallback):
 * 1. "confirmacion_pasadia_atolon" (es) — 7 vars genérica.
 * 2. "vip_pass_confirmacion" (es) — 6 vars, específica VIP Pass.
 * 3. "confirmacionvip" (es_CO) — sin variables, fallback aprobado.
 */
export async function waSendConfirmacion(reserva, salida) {
  const telefono = reserva.telefono || reserva.contacto;
  if (!telefono || !telefono.match(/\d{7,}/)) return { skipped: "sin_telefono" };

  // Idempotencia: si ya se envió un template de confirmación para esta reserva
  // (status = sent), NO reenviar. Evita duplicados al editar la reserva.
  if (reserva.id && supabase) {
    try {
      const { data: prev } = await supabase
        .from("whatsapp_logs")
        .select("id, template")
        .eq("reserva_id", reserva.id)
        .in("template", [
          "confirmacion_pasadia_atolon",
          "vip_pass_confirmacion",
          "confirmacionvip",
          "confirmacion_pasadia_atolon_en",
          "vip_pass_confirmacion_en",
        ])
        .eq("status", "sent")
        .limit(1);
      if (prev && prev.length > 0) {
        return { skipped: "ya_enviado", template_used: prev[0].template };
      }
    } catch (e) {
      // Si el query falla no bloqueamos el envío — mejor duplicar que perder.
      console.warn("[waSendConfirmacion] idempotency check failed:", e);
    }
  }

  const nombre = reserva.nombre?.split(" ")[0] || reserva.nombre || "";
  const fecha  = new Date(reserva.fecha + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });

  // Precio SIEMPRE oculto — política. Meta rechaza params vacíos, usamos "—".
  const totalCOP   = "—";
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
  if (!r1?.error) {
    await logConfirmToConcierge(reserva, telefono, `Confirmación enviada — ${tipo} · ${fecha} · ${horaSalida} · ${reserva.pax || 1}p`, "confirmacion_pasadia_atolon");
    return { template_used: "confirmacion_pasadia_atolon", ...r1 };
  }

  // Intento 2 — vip_pass_confirmacion
  const r2 = await sendWhatsApp(telefono, "vip_pass_confirmacion", [
    nombre, fecha, String(reserva.pax || 1), horaSalida, totalCOP, reserva.id,
  ], "es");
  if (!r2?.error) {
    await logConfirmToConcierge(reserva, telefono, `Confirmación VIP enviada — ${fecha} · ${horaSalida} · ${reserva.pax || 1}p`, "vip_pass_confirmacion");
    return { template_used: "vip_pass_confirmacion", ...r2 };
  }

  // Fallback — confirmacionvip (sin variables, ya aprobada)
  const r3 = await sendWhatsApp(telefono, "confirmacionvip", [], "es_CO");
  if (!r3?.error) {
    await logConfirmToConcierge(reserva, telefono, "Confirmación enviada (fallback)", "confirmacionvip");
  }
  return { template_used: "confirmacionvip", first_attempts: [r1?.error, r2?.error], ...r3 };
}

/**
 * Registrar la confirmación saliente en ai_conversations + ai_messages para
 * que aparezca en el módulo Conversaciones del Concierge. Cuando el cliente
 * responda al WA, el webhook agregará la respuesta a la misma conversación.
 * Fire-and-forget: nunca bloquea el flujo principal.
 */
async function logConfirmToConcierge(reserva, telefono, resumen, template) {
  if (!supabase) return;
  try {
    const tenantId = "T-ATOLON";
    const contactId = String(telefono).replace(/\D/g, ""); // sin "+", como Meta manda
    if (!contactId) return;
    const convId = `CV-${tenantId}-${contactId}`;
    await supabase.from("ai_conversations").upsert({
      id: convId,
      tenant_id: tenantId,
      channel_id: "CH-ATOLON-CONFIRM-WA",
      channel_tipo: "whatsapp",
      contact_id: contactId,
      contact_nombre: reserva.nombre || null,
      estado: "live",
      ultimo_mensaje: resumen.slice(0, 500),
      ultimo_mensaje_at: new Date().toISOString(),
      metadata: { canal_tipo: "confirm", reserva_id: reserva.id || null, template },
    });
    const msgId = `MSG-${convId}-conf-${reserva.id || Date.now()}`;
    await supabase.from("ai_messages").upsert({
      id: msgId,
      conversation_id: convId,
      tenant_id: tenantId,
      rol: "assistant",
      contenido: resumen,
      origen: "system",
    }, { onConflict: "id", ignoreDuplicates: true });
  } catch (e) {
    console.warn("[waSendConfirmacion → concierge log] failed:", e?.message || e);
  }
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
