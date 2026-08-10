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
    const isConfirm = channel.config?.canal_tipo === "confirm";
    const accessToken = channel.config?.access_token;

    const contact_id = msg.from;
    const contact_nombre = contactMeta?.profile?.name || null;
    // Media (imagen/documento): probablemente comprobante de pago en flujo B2B.
    // Descargamos el archivo de Meta y lo subimos al bucket 'comprobantes'
    // para que el staff lo vea desde el módulo Concierge.
    let texto = msg.text?.body;
    let mediaUrl: string | null = null;
    if (!texto) {
      const mediaId  = msg.image?.id || msg.document?.id || msg.audio?.id || msg.video?.id;
      const mimeType = msg.image?.mime_type || msg.document?.mime_type || msg.audio?.mime_type || msg.video?.mime_type || "";
      const filename = msg.document?.filename || null;
      const tipoStr  = msg.type;

      if (mediaId && accessToken) {
        try {
          // 1) Obtener URL de descarga desde Meta Graph API
          const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const metaJson = await metaRes.json();
          const downloadUrl = metaJson?.url;
          if (downloadUrl) {
            // 2) Descargar el archivo
            const fileRes = await fetch(downloadUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (fileRes.ok) {
              const bytes = new Uint8Array(await fileRes.arrayBuffer());
              // 3) Path: b2b/{aliado_id or unknown}/{msg_id}.{ext}
              const extFromMime = (mimeType.split("/")[1] || "bin").split(";")[0].replace("jpeg", "jpg");
              const owner = isB2B && aliado ? aliado.aliado_id : "concierge";
              const path = `wa/${owner}/${msg.id}.${extFromMime}`;
              const { error: upErr } = await supa.storage.from("comprobantes").upload(path, bytes, {
                contentType: mimeType || "application/octet-stream",
                upsert: true,
              });
              if (!upErr) {
                const { data: pub } = supa.storage.from("comprobantes").getPublicUrl(path);
                mediaUrl = pub?.publicUrl || null;
              } else {
                console.warn("[webhook] upload storage error:", upErr.message);
              }
            }
          }
        } catch (e: any) {
          console.warn("[webhook] media download err:", e.message);
        }
      }

      const urlNota = mediaUrl ? ` — VER: ${mediaUrl}` : "";
      if (tipoStr === "image")    texto = `[IMAGEN recibida${urlNota}]`;
      else if (tipoStr === "document") texto = `[DOCUMENTO ${filename || "sin nombre"}${urlNota}]`;
      else if (tipoStr === "audio") texto = `[AUDIO WhatsApp${urlNota}]`;
      else if (tipoStr === "video") texto = `[VIDEO${urlNota}]`;
      else texto = `[${tipoStr}]`;
    }

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

    // 3) Upsert conversation — un contacto puede tener conversaciones separadas
    // en B2B, Confirm y Concierge normal. El convId incluye el canal_tipo para
    // que no se mezclen (sin sufijo = concierge web/legacy).
    const canalSuffix = isB2B ? "-b2b" : isConfirm ? "-confirm" : "";
    const convId = `CV-${tenant_id}-${contact_id}${canalSuffix}`;
    await supa.from("ai_conversations").upsert({
      id: convId, tenant_id, channel_id: channel.id, channel_tipo: "whatsapp",
      contact_id, contact_nombre,
      estado: "live",
      ultimo_mensaje: texto.slice(0, 500), ultimo_mensaje_at: new Date().toISOString(),
      metadata: isB2B && aliado
        ? { canal_tipo: "b2b", aliado_id: aliado.aliado_id, aliado_nombre: aliado.aliado_nombre }
        : isConfirm
        ? { canal_tipo: "confirm" }
        : null,
    });

    // 4) Guardar msg entrante — dedup POR CONTENIDO (no por msg.id)
    // Meta a veces envía el mismo texto con distintos msg.id en <15s. Si
    // usamos msg.id como PK el upsert crea dos filas. Usando un ID
    // determinístico basado en (conv + texto + bucket 15s) forzamos que
    // ambas requests colisionen en el mismo id → upsert dedup natural.
    const bucket = Math.floor(Date.now() / 15000);
    const textoSlug = texto.trim().slice(0, 60).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const msgId = `MSG-${convId}-${bucket}-${textoSlug}`;
    const { error: insErr } = await supa.from("ai_messages").upsert({
      id: msgId, conversation_id: convId, tenant_id, rol: "user",
      contenido: texto, origen: "user", provider_msg_id: msg.id,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (insErr) {
      console.warn("[webhook] insert err (probable dedup):", insErr.message);
      return new Response("dup");
    }

    // 5) Cargar historial reciente para contexto
    const { data: hist } = await supa.from("ai_messages").select("rol, contenido")
      .eq("conversation_id", convId).order("created_at").limit(20);

    // 6) Invocar concierge-turn con el contexto adecuado según canal
    const turnRes = await fetch(`${SUPA_URL}/functions/v1/concierge-turn`, {
      method: "POST",
      headers: { "content-type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({
        tenant_id, conversation_id: convId, message: texto,
        history: (hist || []).slice(0, -1),
        b2b_context: isB2B && aliado ? {
          aliado_id: aliado.aliado_id,
          aliado_nombre: aliado.aliado_nombre,
          contacto_nombre: aliado.contacto_nombre,
        } : null,
        confirm_context: isConfirm ? {
          customer_telefono: contact_id,
          customer_nombre: contact_nombre,
        } : null,
      }),
    });
    const turn = await turnRes.json();
    const reply = turn?.reply;
    if (!reply) return new Response("no reply");

    // Safety net: si el bot dice "asesor/escalar/equipo" pero NO llamó
    // request_handoff (la conversación sigue 'live'), forzamos handoff.
    // Evita perder cancelaciones/quejas cuando Claude solo lo verbaliza.
    const yaEsHandoff = (turn.tool_calls || []).some((t: any) => t.name === "request_handoff");
    if (!yaEsHandoff && /\b(asesor|escalar|equipo humano|equipo|escalo|pasar tu caso|te contactará[nr]?)\b/i.test(reply)) {
      await supa.from("ai_conversations").update({
        estado: "handoff",
        metadata: {
          ...(isB2B && aliado ? { canal_tipo: "b2b", aliado_id: aliado.aliado_id, aliado_nombre: aliado.aliado_nombre } : (isConfirm ? { canal_tipo: "confirm" } : {})),
          handoff: {
            motivo: "auto-detectado: bot mencionó asesor/escalación",
            tema: "otro",
            solicitado_at: new Date().toISOString(),
            fuente: "safety_net",
          },
        },
      }).eq("id", convId);
    }

    // 7) Enviar respuesta por WA Cloud API — usa token del canal; si no hay,
    // busca en otro canal activo de la misma WABA (comparten token de Meta);
    // último recurso, el env.
    let sendToken: string = accessToken || "";
    if (!sendToken && channel.config?.waba_id) {
      const { data: sib } = await supa.from("ai_channels")
        .select("config").eq("tipo", "whatsapp").eq("activo", true)
        .filter("config->>waba_id", "eq", channel.config.waba_id)
        .not("config->>access_token", "is", null)
        .limit(1).maybeSingle();
      if (sib?.config?.access_token) sendToken = sib.config.access_token;
    }
    if (!sendToken) sendToken = Deno.env.get("META_WHATSAPP_TOKEN") || "";
    if (sendToken) {
      await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${sendToken}`, "content-type": "application/json" },
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
