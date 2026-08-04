// Webhook de WhatsApp Cloud API (Meta).
// GET  → verificación con hub.challenge
// POST → recibe mensajes entrantes, crea/actualiza conversation, invoca concierge-turn y envía respuesta
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const supa = createClient(SUPA_URL, SUPA_KEY);

  // 1) Verificación Meta
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    // Buscar canal con este verify_token
    const { data: ch } = await supa.from("ai_channels").select("id").eq("tipo", "whatsapp").filter("config->>verify_token", "eq", token).limit(1).maybeSingle();
    if (mode === "subscribe" && ch) return new Response(challenge, { status: 200 });
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok");

  try {
    const body = await req.json();
    const changes = body?.entry?.[0]?.changes?.[0];
    const wabaId = body?.entry?.[0]?.id;
    const msg = changes?.value?.messages?.[0];
    const contactMeta = changes?.value?.contacts?.[0];
    const phoneNumberId = changes?.value?.metadata?.phone_number_id;
    if (!msg || !phoneNumberId) return new Response("ignored");

    // 2) Encontrar canal + tenant
    const { data: channel } = await supa.from("ai_channels").select("*")
      .eq("tipo", "whatsapp").filter("config->>phone_number_id", "eq", phoneNumberId).limit(1).maybeSingle();
    if (!channel) return new Response("no channel");
    const tenant_id = channel.tenant_id;

    const contact_id = msg.from;
    const contact_nombre = contactMeta?.profile?.name || null;
    const texto = msg.text?.body || (msg.type === "audio" ? "[audio]" : `[${msg.type}]`);

    // 3) Upsert conversation
    const convId = `CV-${tenant_id}-${contact_id}`;
    await supa.from("ai_conversations").upsert({
      id: convId, tenant_id, channel_id: channel.id, channel_tipo: "whatsapp",
      contact_id, contact_nombre,
      estado: "live", ultimo_mensaje: texto.slice(0, 500), ultimo_mensaje_at: new Date().toISOString(),
    });

    // 4) Guardar msg entrante + dedup
    const msgId = `MSG-${msg.id}`;
    await supa.from("ai_messages").upsert({
      id: msgId, conversation_id: convId, tenant_id, rol: "user",
      contenido: texto, origen: "user", provider_msg_id: msg.id,
    }, { onConflict: "id" });

    // 5) Cargar historial reciente para contexto
    const { data: hist } = await supa.from("ai_messages").select("rol, contenido")
      .eq("conversation_id", convId).order("created_at").limit(20);

    // 6) Invocar concierge-turn
    const turnRes = await fetch(`${SUPA_URL}/functions/v1/concierge-turn`, {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({
        tenant_id, conversation_id: convId, message: texto,
        history: (hist || []).slice(0, -1), // excluir el que acabamos de meter
      }),
    });
    const turn = await turnRes.json();
    const reply = turn?.reply;
    if (!reply) return new Response("no reply");

    // 7) Enviar respuesta por WA Cloud API
    const accessToken = channel.config?.access_token;
    if (accessToken) {
      await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", to: contact_id,
          type: "text", text: { body: reply },
        }),
      });
    }

    return new Response("ok");
  } catch (e: any) {
    console.error("wa webhook error:", e);
    return new Response("err: " + e.message, { status: 500 });
  }
});
