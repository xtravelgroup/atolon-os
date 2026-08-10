// concierge-send-manual — Envía una respuesta manual del staff al cliente
// por el canal correcto (WhatsApp Meta Cloud API), y la registra en
// ai_messages con origen='human'.
//
// Entrada: { conversation_id, contenido, autor_email? }
// Salida:  { ok, provider_msg_id?, error? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    const { conversation_id, contenido, autor_email } = await req.json();
    if (!conversation_id || !contenido?.trim()) {
      return json({ ok: false, error: "conversation_id y contenido requeridos" }, 400);
    }
    const supa = createClient(SUPA_URL, SUPA_KEY);

    const { data: conv, error: convErr } = await supa.from("ai_conversations")
      .select("id, tenant_id, channel_id, channel_tipo, contact_id")
      .eq("id", conversation_id).maybeSingle();
    if (convErr || !conv) return json({ ok: false, error: `Conversación no encontrada: ${convErr?.message || ""}` }, 404);

    let providerMsgId: string | null = null;
    let sendError: string | null = null;

    if (conv.channel_tipo === "whatsapp") {
      const { data: ch } = await supa.from("ai_channels").select("config")
        .eq("id", conv.channel_id).maybeSingle();
      const phoneNumberId = ch?.config?.phone_number_id;
      const accessToken = ch?.config?.access_token || Deno.env.get("META_WHATSAPP_TOKEN") || "";
      if (!phoneNumberId) sendError = "Canal sin phone_number_id configurado";
      else if (!accessToken) sendError = "Sin access_token (canal y env vacíos)";
      else {
        try {
          const r = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "content-type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: conv.contact_id,
              type: "text",
              text: { body: contenido },
            }),
          });
          const jr = await r.json();
          if (!r.ok || jr?.error) {
            sendError = jr?.error?.message || `HTTP ${r.status}`;
          } else {
            providerMsgId = jr?.messages?.[0]?.id || null;
          }
        } catch (e: any) {
          sendError = e.message || String(e);
        }
      }
    } else {
      sendError = `Canal ${conv.channel_tipo} no soportado aún (solo whatsapp)`;
    }

    // Siempre registrar el mensaje — si falló el envío, guardamos el error visible
    const msgId = `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const contenidoFinal = sendError ? `${contenido}\n\n[⚠ ENVÍO FALLÓ: ${sendError}]` : contenido;
    await supa.from("ai_messages").insert({
      id: msgId,
      conversation_id,
      tenant_id: conv.tenant_id,
      rol: "assistant",
      contenido: contenidoFinal,
      origen: "human",
      autor_email: autor_email || null,
      provider_msg_id: providerMsgId,
    });
    await supa.from("ai_conversations").update({
      estado: "live",
      ultimo_mensaje: contenido.slice(0, 500),
      ultimo_mensaje_at: new Date().toISOString(),
    }).eq("id", conversation_id);

    // SIEMPRE 200: si devolvemos 502, supabase.functions.invoke() del cliente
    // pierde el body y solo ve "non-2xx". Con 200 + ok:false el UI lee la
    // razón exacta.
    if (sendError) return json({ ok: false, error: sendError, saved_locally: true });
    return json({ ok: true, provider_msg_id: providerMsgId });
  } catch (e: any) {
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
});
