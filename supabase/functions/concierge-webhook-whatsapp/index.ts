// Webhook de WhatsApp Cloud API (Meta).
// GET  → verificación con hub.challenge
// POST → recibe mensajes entrantes, crea/actualiza conversation, invoca concierge-turn y envía respuesta
//
// Router B2B: si el channel tiene config.canal_tipo === 'b2b', se verifica
// que el número emisor esté registrado como agencia (aliados_b2b). Si no,
// se responde con mensaje "unauthorized" sin gastar tokens de Claude.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const UNAUTHORIZED_MSG = "Bienvenidos a Atolón Beach Club 🌴\nPara información de pasadías visita www.atoloncartagena.com o escríbenos por WhatsApp al +57 300 319 4215\n\nEste canal es exclusivo para agencias asociadas a Atolón. El número desde el que nos escribes no está registrado.\n\n¿Eres una agencia registrada o quieres registrarte con nosotros?";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const supa = createClient(SUPA_URL, SUPA_KEY);

  // 1) Verificación Meta
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const { data: ch } = await supa.from("ai_channels").select("id").eq("tipo", "whatsapp").filter("config->>verify_token", "eq", token).limit(1).maybeSingle();
    if (mode === "subscribe" && ch) return new Response(challenge, { status: 200 });
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok");

  try {
    const body = await req.json();
    const changes = body?.entry?.[0]?.changes?.[0];
    const msg = changes?.value?.messages?.[0];
    const contactMeta = changes?.value?.contacts?.[0];
    const phoneNumberId = changes?.value?.metadata?.phone_number_id;
    if (!msg || !phoneNumberId) return new Response("ignored");

    // 2) Encontrar canal + tenant
    const { data: channel } = await supa.from("ai_channels").select("*")
      .eq("tipo", "whatsapp").filter("config->>phone_number_id", "eq", phoneNumberId).limit(1).maybeSingle();
    if (!channel) return new Response("no channel");
    const tenant_id = channel.tenant_id;
    const isB2B = channel.config?.canal_tipo === "b2b";
    const accessToken = channel.config?.access_token;

    const contact_id = msg.from;
    const contact_nombre = contactMeta?.profile?.name || null;
    const texto = msg.text?.body || (msg.type === "audio" ? "[audio]" : `[${msg.type}]`);

    // ── ROUTER B2B: verificar que el emisor sea agencia registrada ──
    let aliado: any = null;
    if (isB2B) {
      const { data: al } = await supa.rpc("find_aliado_by_tel", { p_tel: contact_id });
      aliado = Array.isArray(al) && al.length > 0 ? al[0] : null;

      if (!aliado) {
        // Emisor no autorizado. Responder texto fijo y NO llamar a Claude.
        if (accessToken) {
          await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}`, "content-type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp", to: contact_id,
              type: "text", text: { body: UNAUTHORIZED_MSG },
            }),
          });
        }
        // Log para auditoría (que el user vea intentos de non-agencia)
        await supa.from("b2b_wa_mensajes").insert({
          role: "user",
          content: { text: texto, unauthorized_from: contact_id, contact_name: contact_nombre },
          wa_message_id: msg.id,
        });
        return new Response("unauthorized");
      }

      // Upsert sesión B2B
      await supa.from("b2b_wa_sesiones").upsert({
        telefono_e164: contact_id,
        aliado_id: aliado.aliado_id,
        contacto_nombre: aliado.contacto_nombre || contact_nombre,
        contacto_fuente: aliado.source,
        ultimo_mensaje_at: new Date().toISOString(),
      }, { onConflict: "telefono_e164" });
    }

    // 3) Upsert conversation (compartido concierge + b2b)
    const convId = `CV-${tenant_id}-${contact_id}`;
    await supa.from("ai_conversations").upsert({
      id: convId, tenant_id, channel_id: channel.id, channel_tipo: "whatsapp",
      contact_id, contact_nombre,
      estado: "live", ultimo_mensaje: texto.slice(0, 500), ultimo_mensaje_at: new Date().toISOString(),
      // Metadata B2B para que concierge-turn use el agente B2B y pase aliado_id a las tools
      metadata: isB2B && aliado ? { canal_tipo: "b2b", aliado_id: aliado.aliado_id, aliado_nombre: aliado.aliado_nombre } : null,
    });

    // 4) Guardar msg entrante + dedup
    // Doble dedup: por msg.id (Meta idempotencia) Y por contenido reciente
    // (algunas veces Meta envía mismo texto con distintos msg.id — el segundo
    // rompe el contexto porque Claude ve el texto duplicado).
    const msgId = `MSG-${msg.id}`;
    const { data: yaExiste } = await supa.from("ai_messages")
      .select("id, contenido, created_at")
      .eq("conversation_id", convId)
      .eq("rol", "user")
      .gte("created_at", new Date(Date.now() - 30 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(3);
    const duplicado = (yaExiste || []).some((m: any) =>
      String(m.contenido).trim() === texto.trim() && m.id !== msgId
    );
    if (duplicado) {
      console.log("[webhook] Mensaje duplicado detectado, saltando:", texto.slice(0, 50));
      return new Response("dup");
    }
    await supa.from("ai_messages").upsert({
      id: msgId, conversation_id: convId, tenant_id, rol: "user",
      contenido: texto, origen: "user", provider_msg_id: msg.id,
    }, { onConflict: "id" });

    // 5) Cargar historial reciente para contexto
    const { data: hist } = await supa.from("ai_messages").select("rol, contenido")
      .eq("conversation_id", convId).order("created_at").limit(20);

    // 6) Invocar concierge-turn con contexto B2B si aplica
    const turnRes = await fetch(`${SUPA_URL}/functions/v1/concierge-turn`, {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({
        tenant_id, conversation_id: convId, message: texto,
        history: (hist || []).slice(0, -1),
        // El concierge-turn debe honrar esta pista para elegir el agente correcto
        // y agregar aliado_id al payload de las tool_use B2B.
        b2b_context: isB2B && aliado ? {
          aliado_id: aliado.aliado_id,
          aliado_nombre: aliado.aliado_nombre,
          contacto_nombre: aliado.contacto_nombre,
        } : null,
      }),
    });
    const turn = await turnRes.json();
    const reply = turn?.reply;
    if (!reply) return new Response("no reply");

    // 7) Enviar respuesta por WA Cloud API
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
