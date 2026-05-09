/**
 * whatsapp-ai — Motor de respuestas IA para WhatsApp Atolón
 *
 * Endpoints:
 *   POST /whatsapp-ai/respond — recibe { conversacion_id } y genera respuesta
 *   POST /whatsapp-ai/test    — { telefono, message } → respuesta sin guardar
 *   GET  /whatsapp-ai/system-prompt — retorna el system prompt actual
 *   GET  /whatsapp-ai/diag    — estado del motor
 *
 * Variables de entorno:
 *   ANTHROPIC_API_KEY  — clave de la API de Claude (sk-ant-...)
 *   ANTHROPIC_MODEL    — opcional, default "claude-haiku-4-5"
 *
 * Modelo default: claude-haiku-4-5 (rápido + barato, ideal para chat)
 * Para preguntas complejas se puede pasar `model: "claude-sonnet-4-5"` en el body.
 *
 * Costos aproximados (Haiku 4.5):
 *   ~$0.001 por respuesta. 1000 conversaciones/mes ≈ $1-3 USD/mes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const DEFAULT_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function jsonResp(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Sistema prompt: conocimiento de Atolón Beach Club ────────────────────
const SYSTEM_PROMPT = `Eres "Atolón Concierge", el asistente virtual de Atolón Beach Club en Cartagena de Indias, Colombia. Atiendes a clientes vía WhatsApp con calidez, profesionalismo y eficiencia.

# IDENTIDAD Y TONO
- Tono: amigable, premium pero cercano, en español caribeño natural (sin formalidades excesivas)
- Usa primera persona en plural ("nosotros", "tenemos") cuando hablas de Atolón
- Respuestas concisas (máx 3-4 párrafos cortos). WhatsApp ≠ email.
- Emojis con moderación: 🏝️ 🌴 ⛵ ☀️ 🍹 — máx 2 por mensaje
- Si no sabes algo concreto (precio exacto, disponibilidad fecha específica), NO inventes.
  Mejor: "déjame conectarte con nuestro equipo humano para que te confirme con detalle"

# QUÉ ES ATOLÓN
Atolón Beach Club es un club de playa exclusivo en una isla del archipiélago del Rosario, Cartagena de Indias.
Se llega en lancha desde el continente. Día completo de playa, comida, bebidas.

## Salida
- 📍 Muelle La Bodeguita — Puerta 1, Cartagena
- ⏰ Horario típico de salida: 9:00 AM
- ⏰ Llegar 20 minutos antes (hora de check-in)
- 🆔 Documento de identidad obligatorio
- 💵 Impuesto de muelle: COP 18.000 por persona (NO incluido en el pase, se paga en taquilla)
- 🛟 Regreso al muelle: tarde

## Tipos de Pasadía (rangos aproximados)
- VIP Pass — el más popular, incluye transporte ida/vuelta + acceso club + 1 bebida
- Exclusive Pass — incluye transporte + comida completa + zona exclusiva
- A CONSUMO — solo transporte, comida/bebida se paga aparte en la isla
- AFTER ISLAND — para llegar después por cuenta propia (sin transporte)
- Cada pase tiene variantes "Sin Transporte" si el cliente llega por su cuenta

⚠️ NO digas precios exactos. Para precios actuales, dirige al cliente a la web o al equipo humano.

## Reservas y compras
- Web oficial: https://atoloncartagena.com
- Pueden comprar online con tarjeta nacional (Wompi) o internacional (Zoho Pay)
- Tras pagar reciben WhatsApp + email con QR de embarque
- Ven su reserva en: https://atolon.co/zarpe-info?id=WEB-XXXX (si tienen el ID)

## Restricciones / políticas
- 🚫 No se permite ingresar alimentos ni bebidas externas
- 🌧️ Si hay clima adverso (mar picado, tormenta), Capitanía puede no autorizar zarpe — cliente puede reagendar
- 👶 Niños pagan según política (rangos de edad varían)
- 🦮 Mascotas: consultar con el equipo

# REGLAS CRÍTICAS DE COMPORTAMIENTO

## Cuándo escalar a humano
Marca tu respuesta con \`[ESCALAR]\` al inicio (sin espacios) en estos casos:
1. El cliente pide cancelar o reembolsar una reserva
2. Quejas o problemas (no llegó la lancha, mala experiencia, etc.)
3. Solicitudes de eventos privados / corporativos
4. Pregunta por disponibilidad de fecha específica (necesitamos verificar BD real)
5. Pregunta precio exacto (depende del día, el pase, la temporada)
6. Pide datos de pago / facturación específicos
7. El cliente lo pide explícitamente ("quiero hablar con alguien")
8. Cualquier cosa que comprometería al negocio si respondes mal

Cuando escales, además di al cliente algo como:
"Te conecto con nuestro equipo humano para que te ayuden con detalle. Te responden en breve."

## Cuándo NUNCA respondas
- 🚫 Datos sensibles (nro. tarjeta, contraseñas, datos de otros clientes)
- 🚫 Promesas de descuentos o promociones que no se hayan pre-aprobado
- 🚫 Información sobre clima futuro / mar (riesgo legal — escala si preguntan)
- 🚫 Comparaciones con competidores

## Información de contacto que SÍ puedes dar
- WhatsApp Atolón: este mismo (no des otro número)
- Web: atoloncartagena.com
- Lugar salida: Muelle La Bodeguita - Puerta 1

## Si te dan un ID de reserva
Trata de leerlo del contexto que te paso ("Customer info"). Si tienes su reserva, puedes confirmar:
- Su próxima salida (fecha + hora)
- Si está confirmada o pendiente
- Cuántas personas
NO compartas: número de tarjeta, transaction id, otro detalle financiero.

# FORMATO DE RESPUESTA
Texto plano. Sin markdown (** **, [], etc) — WhatsApp no lo renderiza bien.
Para listas usa bullets con guiones simples.
Saltos de línea naturales.
Máximo 600 caracteres normalmente. Si necesitas más, divide.

Cierra siempre con apertura: "¿Algo más en lo que te pueda ayudar? 🌴"`;

// ── Cargar contexto del cliente ───────────────────────────────────────
async function buildCustomerContext(SB: any, telefono: string) {
  const lines: string[] = [];

  // Buscar reservas asociadas al teléfono
  try {
    const { data: reservas } = await SB.from("reservas")
      .select("id, fecha, tipo, estado, pax, total, salida_id")
      .or(`telefono.eq.${telefono},contacto.eq.${telefono}`)
      .order("created_at", { ascending: false })
      .limit(3);
    if (reservas && reservas.length > 0) {
      lines.push("## Reservas conocidas del cliente:");
      for (const r of reservas) {
        lines.push(`- ${r.id}: ${r.tipo}, ${r.fecha}, ${r.pax} pax, estado: ${r.estado}`);
      }
    }
  } catch { /* silently */ }

  // Buscar lead asociado
  try {
    const { data: leads } = await SB.from("leads")
      .select("id, nombre, email, stage, ultimo_contacto, notas")
      .or(`telefono.eq.${telefono},contacto.eq.${telefono}`)
      .order("ultimo_contacto", { ascending: false })
      .limit(1);
    if (leads && leads[0]) {
      lines.push(`## Lead conocido: ${leads[0].nombre} (${leads[0].stage})`);
      if (leads[0].notas) lines.push(`Notas: ${String(leads[0].notas).slice(0, 200)}`);
    }
  } catch { /* silently */ }

  return lines.length > 0 ? lines.join("\n") : "Cliente nuevo / no identificado en sistema.";
}

// ── Cargar historial de conversación (últimos N mensajes) ────────────────
async function buildConversationHistory(SB: any, conversacion_id: string, limit = 10) {
  const { data } = await SB.from("wa_mensajes")
    .select("direction, content, type, sent_at")
    .eq("conversacion_id", conversacion_id)
    .order("sent_at", { ascending: false })
    .limit(limit);
  return (data || []).reverse(); // Cronológico
}

// ── Llamar a Claude ────────────────────────────────────────────────────
async function callClaude(systemPrompt: string, messages: any[], model = DEFAULT_MODEL) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Claude API error: ${JSON.stringify(data)}`);
  const text = data?.content?.[0]?.text || "";
  return { text, usage: data?.usage, model: data?.model };
}

// ── Enviar mensaje vía WhatsApp ────────────────────────────────────────
async function sendWhatsAppText(to: string, body: string) {
  const r = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp/send-text`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({ to, body }),
    }
  );
  return await r.json().catch(() => ({}));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/whatsapp-ai/, "");

  // ── GET /system-prompt ─────────────────────────────────────
  if (req.method === "GET" && path === "/system-prompt") {
    return jsonResp({ system_prompt: SYSTEM_PROMPT, model: DEFAULT_MODEL });
  }

  // ── GET /diag ──────────────────────────────────────────────
  if (req.method === "GET" && (path === "/diag" || path === "")) {
    return jsonResp({
      ok: true,
      service: "whatsapp-ai",
      anthropic_key_configured: !!ANTHROPIC_KEY,
      default_model: DEFAULT_MODEL,
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== "POST") return jsonResp({ error: "method not allowed" }, 405);

  // ── POST /test ─────────────────────────────────────────────
  // body: { telefono, message } → respuesta sin guardar nada
  if (path === "/test") {
    try {
      if (!ANTHROPIC_KEY) return jsonResp({ error: "ANTHROPIC_API_KEY no configurado" }, 500);
      const { telefono, message, model } = await req.json();
      if (!message) return jsonResp({ error: "message requerido" }, 400);

      const SB = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const customerCtx = telefono ? await buildCustomerContext(SB, telefono) : "Test mode";

      const result = await callClaude(
        SYSTEM_PROMPT + "\n\n# CONTEXTO DEL CLIENTE\n" + customerCtx,
        [{ role: "user", content: message }],
        model || DEFAULT_MODEL,
      );
      return jsonResp(result);
    } catch (err) {
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }

  // ── POST /respond ──────────────────────────────────────────
  // body: { conversacion_id } → genera respuesta + envía + guarda en BD
  if (path === "/respond") {
    try {
      if (!ANTHROPIC_KEY) return jsonResp({ error: "ANTHROPIC_API_KEY no configurado" }, 500);
      const { conversacion_id, model } = await req.json();
      if (!conversacion_id) return jsonResp({ error: "conversacion_id requerido" }, 400);

      const SB = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Cargar conversación
      const { data: conv } = await SB.from("wa_conversaciones")
        .select("id, telefono, nombre, ai_enabled, taken_over_by, ai_paused_until")
        .eq("id", conversacion_id)
        .single();
      if (!conv) return jsonResp({ error: "conversación no existe" }, 404);

      // Verificar si IA debe responder
      if (!conv.ai_enabled) return jsonResp({ skipped: "ai_disabled" });
      if (conv.taken_over_by) return jsonResp({ skipped: "human_takeover", by: conv.taken_over_by });
      if (conv.ai_paused_until && new Date(conv.ai_paused_until) > new Date()) {
        return jsonResp({ skipped: "paused", until: conv.ai_paused_until });
      }

      // Construir contexto + historial
      const customerCtx = await buildCustomerContext(SB, conv.telefono);
      const history = await buildConversationHistory(SB, conv.id, 10);

      // Mapear a formato Claude
      const claudeMessages = history
        .filter(m => m.content && m.type !== "reaction")
        .map(m => ({
          role: m.direction === "in" ? "user" : "assistant",
          content: m.content,
        }));

      if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== "user") {
        return jsonResp({ skipped: "no_pending_user_message" });
      }

      const result = await callClaude(
        SYSTEM_PROMPT + "\n\n# CONTEXTO DEL CLIENTE\n" + customerCtx,
        claudeMessages,
        model || DEFAULT_MODEL,
      );

      // Detectar escalación
      const escalate = result.text.startsWith("[ESCALAR]");
      const cleanText = escalate ? result.text.replace(/^\[ESCALAR\]\s*/i, "") : result.text;

      // Si escala: pausar IA por 2h y notificar
      if (escalate) {
        await SB.from("wa_conversaciones").update({
          ai_paused_until: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          tags: ["escalar"],
          updated_at: new Date().toISOString(),
        }).eq("id", conv.id);
      }

      // Enviar respuesta vía WhatsApp
      const sendResult = await sendWhatsAppText(conv.telefono, cleanText);
      const messageId = sendResult?.messages?.[0]?.id || null;

      // Guardar en BD
      await SB.from("wa_mensajes").insert({
        conversacion_id: conv.id,
        wa_message_id:   messageId,
        direction:       "out",
        type:            "text",
        content:         cleanText,
        sender:          "ai",
        status:          messageId ? "sent" : "error",
        raw:             { ai_usage: result.usage, ai_model: result.model, escalate, send_response: sendResult },
      });

      return jsonResp({
        ok: true,
        conversacion_id: conv.id,
        telefono: conv.telefono,
        response: cleanText,
        escalated: escalate,
        usage: result.usage,
        message_id: messageId,
      });
    } catch (err) {
      console.error("[whatsapp-ai/respond] error:", err);
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }

  return jsonResp({ error: "endpoint not found", path }, 404);
});
