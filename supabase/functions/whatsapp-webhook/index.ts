/**
 * whatsapp-webhook — Recibe webhooks de Meta WhatsApp Cloud API
 *
 * Endpoints:
 *   GET  /whatsapp-webhook  — verificación de subscripción (hub.challenge)
 *   POST /whatsapp-webhook  — recibe eventos (messages, statuses)
 *
 * Configurar en Meta:
 *   1. https://developers.facebook.com/apps/1303045501712141/whatsapp-business/
 *      → Configuration → Webhook → Edit
 *   2. Callback URL: https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/whatsapp-webhook
 *   3. Verify token: META_WHATSAPP_VERIFY_TOKEN (env var, secret aleatorio)
 *   4. Subscribe to fields: messages, message_statuses
 *
 * Variables de entorno:
 *   META_WHATSAPP_VERIFY_TOKEN  — string aleatorio que tú escoges
 *   SUPABASE_URL                — auto
 *   SUPABASE_SERVICE_ROLE_KEY   — auto
 *
 * Fase 1 (actual): solo loguea mensajes entrantes, no responde.
 * Fase 2: invoca Claude API + responde automáticamente si ai_enabled=true.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") || "atolon-wa-verify-2026";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResp(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Normalizar teléfono a E.164
function normalizePhone(raw: string): string {
  const num = String(raw || "").replace(/\D/g, "");
  return num ? "+" + num : "";
}

// Upsert conversación por teléfono
async function upsertConversacion(SB: any, telefono: string, waId: string, nombre?: string) {
  // Intentar obtener existente
  const { data: existing } = await SB
    .from("wa_conversaciones")
    .select("id, ai_enabled, taken_over_by")
    .eq("telefono", telefono)
    .maybeSingle();
  if (existing) return existing;

  // Crear nueva
  const { data: nueva } = await SB
    .from("wa_conversaciones")
    .insert({ telefono, wa_id: waId, nombre: nombre || null })
    .select("id, ai_enabled, taken_over_by")
    .single();
  return nueva;
}

// Disparar respuesta de IA (best-effort, no bloquea)
async function triggerAI(conversacion_id: string) {
  try {
    await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-ai/respond`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        },
        body: JSON.stringify({ conversacion_id }),
      }
    );
  } catch (e) {
    console.warn("[webhook → AI] failed:", (e as Error).message);
  }
}

// Procesar mensaje individual de Meta
async function processIncomingMessage(SB: any, msg: any, contact: any) {
  const waId       = msg.from || contact?.wa_id || "";
  const telefono   = normalizePhone(waId);
  const profileNm  = contact?.profile?.name || null;

  if (!telefono) return { skipped: "no telefono" };

  const conv = await upsertConversacion(SB, telefono, waId, profileNm || undefined);
  if (!conv?.id) return { error: "no conv" };

  // Extraer contenido según tipo
  const tipo = msg.type || "unknown";
  let content = "";
  let mediaUrl = "";
  switch (tipo) {
    case "text":      content = msg.text?.body || ""; break;
    case "image":     content = msg.image?.caption || "[imagen]"; mediaUrl = msg.image?.id || ""; break;
    case "audio":     content = "[audio]"; mediaUrl = msg.audio?.id || ""; break;
    case "video":     content = msg.video?.caption || "[video]"; mediaUrl = msg.video?.id || ""; break;
    case "document":  content = msg.document?.filename || "[documento]"; mediaUrl = msg.document?.id || ""; break;
    case "location":  content = `[ubicación] ${msg.location?.latitude},${msg.location?.longitude}`; break;
    case "interactive": content = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "[respuesta]"; break;
    case "button":    content = msg.button?.text || "[botón]"; break;
    case "reaction":  content = `[reacción ${msg.reaction?.emoji || ""}] a ${msg.reaction?.message_id}`; break;
    default:          content = `[${tipo}]`;
  }

  await SB.from("wa_mensajes").insert({
    conversacion_id: conv.id,
    wa_message_id:   msg.id || null,
    direction:       "in",
    type:            tipo,
    content,
    media_url:       mediaUrl || null,
    raw:             msg,
    sender:          "customer",
    status:          "received",
  });

  // Disparar IA si está activa para esta conversación (no bloqueante)
  if (conv.ai_enabled && !conv.taken_over_by && tipo !== "reaction") {
    // No await — fire and forget para no bloquear el ack a Meta
    triggerAI(conv.id);
  }

  return { ok: true, conv_id: conv.id, ai_enabled: conv.ai_enabled };
}

// Procesar status update (delivered/read/failed)
async function processStatus(SB: any, status: any) {
  const waId = status.id;
  if (!waId) return;
  await SB.from("wa_mensajes")
    .update({ status: status.status, error: status.errors?.[0]?.message || null })
    .eq("wa_message_id", waId);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);

  // ── GET: verificación de subscripción Meta ─────────────────────────
  if (req.method === "GET") {
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[whatsapp-webhook] Verificación OK");
      return new Response(challenge || "ok", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    if (mode === "subscribe") {
      console.warn("[whatsapp-webhook] Verify token inválido");
      return new Response("Forbidden", { status: 403 });
    }

    // GET sin params: status público
    return jsonResp({
      ok: true,
      service: "whatsapp-webhook",
      verify_token_configured: !!VERIFY_TOKEN,
    });
  }

  // ── POST: evento de WhatsApp ────────────────────────────────────────
  if (req.method !== "POST") return jsonResp({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const SB = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Estructura típica: { object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages: [...], statuses: [...], contacts: [...] }}]}]}
    let processed = 0;
    let statuses_seen = 0;
    let messages_seen = 0;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        const value = change.value || {};
        const contacts = value.contacts || [];

        // Mensajes entrantes (cliente → atolón)
        for (const msg of (value.messages || [])) {
          messages_seen++;
          const contact = contacts.find((c: any) => c.wa_id === msg.from) || contacts[0];
          await processIncomingMessage(SB, msg, contact);
          processed++;
        }

        // Statuses (delivered/read/failed para mensajes outbound)
        for (const st of (value.statuses || [])) {
          statuses_seen++;
          await processStatus(SB, st);
        }
      }
    }

    return jsonResp({ received: true, messages_seen, statuses_seen, processed });
  } catch (err) {
    console.error("[whatsapp-webhook] error:", err);
    // Retornar 200 para que Meta no reintente infinitamente
    return jsonResp({ received: true, error: String((err as Error).message || err) }, 200);
  }
});
