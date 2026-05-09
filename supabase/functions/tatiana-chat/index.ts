/**
 * tatiana-chat — Conserje Virtual de Atolón Beach Club
 *
 * Endpoint para Visito.AI o cualquier cliente externo que necesite chat
 * con Tatiana (incluye tool calling: verificar disponibilidad, crear
 * reserva, generar link de pago unificado).
 *
 * Endpoints:
 *   POST /tatiana-chat        — chat con tool loop (body: {messages})
 *   POST /tatiana-chat/chat   — alias
 *   GET  /tatiana-chat/diag   — estado del motor
 *   GET  /tatiana-chat/system-prompt — devuelve el system prompt actual
 *   POST /tatiana-chat/tools/verificar-disponibilidad — tool standalone
 *
 * Variables:
 *   ANTHROPIC_API_KEY   — clave Claude
 *   ANTHROPIC_MODEL     — opcional, default sonnet-4-5
 *
 * Configuración rotable desde BD (configuracion.tatiana_*):
 *   tatiana_system_prompt — sobrescribe el prompt base si está set
 *   tatiana_model         — sobrescribe el modelo
 *   tatiana_enabled       — kill switch global
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TATIANA_SYSTEM_PROMPT } from "./system-prompt.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const DEFAULT_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";

const TIEMPO_BLOQUEO_MIN = 30;
const CAPACIDAD_HORARIO = 40;
const TRM_USD_COP = 4000;
const TASA_PORTUARIA_COP = 18000;

const PRECIOS_COP: Record<string, number> = {
  vip:           320000,
  exclusive:     540000,
  experience:   1100000,
  "after-island": 170000,
};

// Mapeo producto→tipo (match strings ya existentes en reservas.tipo)
const PRODUCTO_A_TIPO: Record<string, string> = {
  vip:            "VIP Pass",
  exclusive:      "EXCLUSIVE PASS",
  experience:     "Atolón Experience",
  "after-island": "AFTER ISLAND",
};

const HORARIOS = ["08:30", "10:00", "11:30"];

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-api-key",
};

function jsonResp(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Helpers BD ──────────────────────────────────────────────────────────
function getSB() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function loadConfig() {
  const SB = getSB();
  try {
    const { data } = await SB.from("configuracion")
      .select("tatiana_system_prompt, tatiana_model, tatiana_enabled")
      .eq("id", "atolon").single();
    return {
      systemPrompt: data?.tatiana_system_prompt?.trim() || TATIANA_SYSTEM_PROMPT,
      model:        data?.tatiana_model || DEFAULT_MODEL,
      enabled:      data?.tatiana_enabled !== false,
    };
  } catch {
    return { systemPrompt: TATIANA_SYSTEM_PROMPT, model: DEFAULT_MODEL, enabled: true };
  }
}

// Inyecta la fecha actual al system prompt para que Tatiana sepa SIEMPRE
// qué día es hoy y nunca asuma fechas en el pasado.
function withCurrentDate(systemPrompt: string): string {
  const now = new Date();
  // En formato Bogotá (UTC-5)
  const bogota = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const fechaIso = bogota.toISOString().slice(0, 10);
  const fechaLarga = bogota.toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return systemPrompt + `\n\n## FECHA ACTUAL (NO INVENTAR)\nHoy es: **${fechaLarga}** (${fechaIso} en Bogotá UTC-5).\nUsa esta fecha como referencia para interpretar "mañana", "este sábado", "el 25 de mayo", etc.\n`;
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL 1 — verificar_disponibilidad_pasadia
// ═══════════════════════════════════════════════════════════════════════
async function verificarDisponibilidadPasadia(input: {
  fecha: string;
  num_personas: number;
}) {
  const SB = getSB();
  const { fecha, num_personas } = input;

  // Cuenta pax de TODAS las reservas activas del día (cualquier tipo)
  const { data: reservasDia } = await SB.from("reservas")
    .select("pax, salida_id")
    .eq("fecha", fecha)
    .in("estado", ["confirmado", "pendiente_pago", "check_in"]);

  // Agrupar por horario de salida (lookup salidas)
  const { data: salidas } = await SB.from("salidas").select("id, hora").eq("activo", true);
  const salidaIdToHora: Record<string, string> = {};
  for (const s of (salidas || [])) salidaIdToHora[s.id] = s.hora;

  const ocupacion: Record<string, number> = {};
  HORARIOS.forEach(h => { ocupacion[h] = 0; });
  for (const r of (reservasDia || [])) {
    const hora = salidaIdToHora[r.salida_id] || "";
    if (HORARIOS.includes(hora)) {
      ocupacion[hora] = (ocupacion[hora] || 0) + (r.pax || 0);
    }
  }

  const horarios = HORARIOS.map(h => ({
    horario: h,
    cupos_restantes: Math.max(0, CAPACIDAD_HORARIO - ocupacion[h]),
    suficiente: (CAPACIDAD_HORARIO - ocupacion[h]) >= num_personas,
  }));

  return {
    fecha,
    num_personas,
    horarios,
    hay_disponibilidad: horarios.some(h => h.suficiente),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL 2 — crear_reserva_pasadia
// ═══════════════════════════════════════════════════════════════════════
async function crearReservaPasadia(input: {
  fecha: string;
  horario: string;
  producto: "vip" | "exclusive" | "experience" | "after-island";
  num_personas: number;
  num_adultos?: number;
  num_ninos?: number;
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email: string;
  idioma?: string;
}) {
  const SB = getSB();

  if (!HORARIOS.includes(input.horario)) {
    throw new Error(`Horario inválido: ${input.horario}. Usa: ${HORARIOS.join(", ")}`);
  }
  if (!PRECIOS_COP[input.producto]) {
    throw new Error(`Producto inválido: ${input.producto}`);
  }

  // Re-verificar cupo
  const disp = await verificarDisponibilidadPasadia({
    fecha: input.fecha, num_personas: input.num_personas,
  });
  const slot = disp.horarios.find(h => h.horario === input.horario);
  if (!slot?.suficiente) {
    return {
      ok: false,
      error: "no_disponible",
      cupos_restantes: slot?.cupos_restantes || 0,
      mensaje: `No hay ${input.num_personas} cupos en ${input.horario}. Restantes: ${slot?.cupos_restantes || 0}`,
      alternativas: disp.horarios.filter(h => h.horario !== input.horario && h.suficiente),
    };
  }

  // Lookup salida_id (necesario para PagoCliente.jsx)
  const { data: salidas } = await SB.from("salidas").select("id, hora").eq("hora", input.horario).eq("activo", true).limit(1);
  const salidaId = salidas?.[0]?.id || null;

  const precioU = PRECIOS_COP[input.producto];
  const totalCop = precioU * input.num_personas;
  const reservaId = `WEB-${Date.now()}`;
  const expira = new Date(Date.now() + TIEMPO_BLOQUEO_MIN * 60 * 1000).toISOString();
  const tipo = PRODUCTO_A_TIPO[input.producto] || input.producto;

  // Insertar en reservas (tabla existente que PagoCliente.jsx ya usa)
  const { error } = await SB.from("reservas").insert({
    id:                  reservaId,
    fecha:               input.fecha,
    tipo,
    canal:               "tatiana",
    nombre:              input.cliente_nombre,
    pax:                 input.num_personas,
    precio_u:            precioU,
    total:               totalCop,
    factura_electronica: false,
    estado:              "pendiente_pago",
    email:               input.cliente_email,
    telefono:            input.cliente_telefono,
    contacto:            input.cliente_email,
    salida_id:           salidaId,
    link_expira_at:      expira,
    notas:               `Reserva creada por Tatiana (idioma: ${input.idioma || "es"}). ${input.num_ninos ? `Niños: ${input.num_ninos}` : ""}`,
  });

  if (error) throw new Error(`Error creando reserva: ${error.message}`);

  return {
    ok: true,
    reserva_id: reservaId,
    total_cop: totalCop,
    total_usd_aprox: Math.ceil(totalCop / TRM_USD_COP),
    tasa_portuaria_total_cop: TASA_PORTUARIA_COP * input.num_personas,
    expira_en: expira,
    bloqueado_minutos: TIEMPO_BLOQUEO_MIN,
    link_pago: `https://www.atolon.co/pago/${reservaId}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL 3 — generar_link_pago
// Crea links Wompi + Zoho Pay en paralelo, devuelve link unificado
// ═══════════════════════════════════════════════════════════════════════
// Reusa el flow EXISTENTE de Atolón OS:
// - PagoCliente.jsx en /pago/{id} ya muestra Wompi (COP) + Zoho Pay (USD)
// - Webhooks Wompi/Zoho ya confirman reservas automáticamente
// - Email + WhatsApp ya se disparan al confirmar
async function generarLinkPago(input: { reserva_id: string }) {
  const SB = getSB();
  const { data: reserva, error } = await SB.from("reservas")
    .select("id, estado, total, nombre, email")
    .eq("id", input.reserva_id).single();
  if (error || !reserva) throw new Error("Reserva no encontrada");
  if (reserva.estado === "cancelado") {
    return { ok: false, error: "reserva_cancelada" };
  }

  const linkPago = `https://www.atolon.co/pago/${reserva.id}`;
  return {
    ok: true,
    link_pago: linkPago,
    monto_cop: reserva.total,
    monto_usd_aprox: Math.ceil(reserva.total / TRM_USD_COP),
    nota: "El cliente elige en la página: Wompi (tarjeta nacional, COP) o Zoho Pay (tarjeta internacional, USD).",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS para Anthropic API
// ═══════════════════════════════════════════════════════════════════════
const TOOLS = [
  {
    name: "verificar_disponibilidad_pasadia",
    description: "Verifica cupos disponibles para una fecha en cada horario de salida (08:30, 10:00, 11:30). Llama esta tool antes de crear cualquier reserva.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Fecha de la pasadía en formato YYYY-MM-DD" },
        num_personas: { type: "integer", description: "Cantidad total de personas (adultos + niños)" },
      },
      required: ["fecha", "num_personas"],
    },
  },
  {
    name: "crear_reserva_pasadia",
    description: "Crea una reserva de pasadía en estado pendiente_pago. Bloquea el cupo por 30 minutos. Requiere haber verificado disponibilidad primero.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "YYYY-MM-DD" },
        horario: { type: "string", enum: ["08:30", "10:00", "11:30"] },
        producto: { type: "string", enum: ["vip", "exclusive", "experience", "after-island"] },
        num_personas: { type: "integer" },
        num_adultos: { type: "integer" },
        num_ninos: { type: "integer" },
        cliente_nombre: { type: "string" },
        cliente_telefono: { type: "string", description: "Con código país, ej +573001234567" },
        cliente_email: { type: "string" },
        idioma: { type: "string", enum: ["es", "en", "pt", "fr", "it", "de"], description: "Default: es" },
      },
      required: ["fecha", "horario", "producto", "num_personas", "cliente_nombre", "cliente_telefono", "cliente_email"],
    },
  },
  {
    name: "generar_link_pago",
    description: "Genera el link unificado de pago (https://atolon.co/pagar/{reserva_id}) que muestra ambas opciones COP/USD. Llamar después de crear_reserva_pasadia.",
    input_schema: {
      type: "object",
      properties: {
        reserva_id: { type: "string" },
      },
      required: ["reserva_id"],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════
// Loop de tool calling con Claude
// ═══════════════════════════════════════════════════════════════════════
async function callClaude(systemPrompt: string, messages: any[], model: string) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Claude API: ${JSON.stringify(data)}`);
  return data;
}

async function executeTool(name: string, input: any): Promise<any> {
  switch (name) {
    case "verificar_disponibilidad_pasadia":
      return await verificarDisponibilidadPasadia(input);
    case "crear_reserva_pasadia":
      return await crearReservaPasadia(input);
    case "generar_link_pago":
      return await generarLinkPago(input);
    default:
      throw new Error(`Tool desconocida: ${name}`);
  }
}

async function chatConTatiana(messages: any[]) {
  const cfg = await loadConfig();
  if (!cfg.enabled) {
    return {
      respuesta: "Lo siento, en este momento no puedo atenderte. Por favor escribe a Paola Mangones al +57 318 034 1155.",
      mensajes_actualizados: messages,
      escalated: true,
    };
  }
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY no configurado");

  let mensajes = [...messages];
  let intentos = 0;

  while (intentos < 5) {
    intentos++;
    const response = await callClaude(withCurrentDate(cfg.systemPrompt), mensajes, cfg.model);

    // Si respondió texto sin tools, terminamos
    const toolUses = (response.content || []).filter((b: any) => b.type === "tool_use");
    const texts    = (response.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");

    // Agregar respuesta del assistant al historial
    mensajes.push({ role: "assistant", content: response.content });

    if (toolUses.length === 0) {
      // Texto final
      return { respuesta: texts || "", mensajes_actualizados: mensajes, escalated: /\[ESCALAR_A_HUMANO\]/i.test(texts) };
    }

    // Ejecutar tools y agregar resultados
    const toolResults: any[] = [];
    for (const tu of toolUses) {
      try {
        const result = await executeTool(tu.name, tu.input);
        toolResults.push({
          type:         "tool_result",
          tool_use_id:  tu.id,
          content:      JSON.stringify(result),
        });
      } catch (err) {
        toolResults.push({
          type:         "tool_result",
          tool_use_id:  tu.id,
          content:      JSON.stringify({ error: String((err as Error).message || err) }),
          is_error:     true,
        });
      }
    }
    mensajes.push({ role: "user", content: toolResults });
  }

  return {
    respuesta: "Disculpa, tuve un problema procesando tu solicitud. Te conecto con nuestro equipo humano.",
    mensajes_actualizados: mensajes,
    escalated: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Handler HTTP
// ═══════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/tatiana-chat/, "");

  // GET /diag
  if (req.method === "GET" && (path === "/diag" || path === "")) {
    const cfg = await loadConfig();
    return jsonResp({
      ok: true,
      service: "tatiana-chat",
      anthropic_key_configured: !!ANTHROPIC_KEY,
      model: cfg.model,
      enabled: cfg.enabled,
      tools: TOOLS.map(t => t.name),
      system_prompt_chars: cfg.systemPrompt.length,
    });
  }

  // GET /system-prompt
  if (req.method === "GET" && path === "/system-prompt") {
    const cfg = await loadConfig();
    return jsonResp({ system_prompt: cfg.systemPrompt, model: cfg.model });
  }

  // POST chat (path "" o "/chat")
  if (req.method === "POST" && (path === "" || path === "/chat")) {
    try {
      const body = await req.json();
      const messages = body.messages || [];
      if (!Array.isArray(messages) || messages.length === 0) {
        return jsonResp({ error: "messages array requerido" }, 400);
      }
      const result = await chatConTatiana(messages);
      return jsonResp(result);
    } catch (err) {
      console.error("tatiana-chat error:", err);
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }

  // ── POST /respond-to-conversation ─────────────────────────
  // Invocada desde whatsapp-webhook: carga historial de wa_mensajes,
  // genera respuesta de Tatiana, envía vía WhatsApp y guarda en BD.
  if (req.method === "POST" && path === "/respond-to-conversation") {
    try {
      const { conversacion_id } = await req.json();
      if (!conversacion_id) return jsonResp({ error: "conversacion_id requerido" }, 400);

      const SB = getSB();

      // Cargar conversación
      const { data: conv } = await SB.from("wa_conversaciones")
        .select("id, telefono, nombre, ai_enabled, taken_over_by, ai_paused_until")
        .eq("id", conversacion_id).single();
      if (!conv) return jsonResp({ error: "conversación no existe" }, 404);

      if (!conv.ai_enabled) return jsonResp({ skipped: "ai_disabled" });
      if (conv.taken_over_by) return jsonResp({ skipped: "human_takeover", by: conv.taken_over_by });
      if (conv.ai_paused_until && new Date(conv.ai_paused_until) > new Date()) {
        return jsonResp({ skipped: "paused", until: conv.ai_paused_until });
      }

      // Cargar últimos 12 mensajes
      const { data: history } = await SB.from("wa_mensajes")
        .select("direction, content, type, sender, sent_at")
        .eq("conversacion_id", conv.id)
        .order("sent_at", { ascending: false })
        .limit(12);
      const ordered = (history || []).reverse();

      // Mapear a formato Claude
      const claudeMessages = ordered
        .filter(m => m.content && m.type !== "reaction")
        .map(m => ({
          role: m.direction === "in" ? "user" as const : "assistant" as const,
          content: m.content,
        }));

      if (claudeMessages.length === 0 || claudeMessages[claudeMessages.length - 1].role !== "user") {
        return jsonResp({ skipped: "no_pending_user_message" });
      }

      // Enriquecer último mensaje del user con context: telefono y nombre
      // (Tatiana pide nombre+email+tel — si ya los sabemos del WhatsApp profile,
      // puede saltarse esa pregunta)
      const ctxNote = `\n\n[CONTEXTO INTERNO — no menciones esto al cliente]\n` +
        `Teléfono del cliente (ya conocido): ${conv.telefono}\n` +
        (conv.nombre ? `Nombre del perfil de WhatsApp: ${conv.nombre}\n` : "") +
        `Si el cliente quiere reservar, ya tienes su teléfono — solo pídele nombre completo y email si no los ha dado.`;
      const lastUser = claudeMessages[claudeMessages.length - 1];
      lastUser.content = lastUser.content + ctxNote;

      // Llamar Tatiana con tools
      const result = await chatConTatiana(claudeMessages);

      // Detectar escalación
      const escalate = /\[ESCALAR_A_HUMANO\]/i.test(result.respuesta);
      const cleanText = escalate ? result.respuesta.replace(/\[ESCALAR_A_HUMANO\][\s\S]*?(?=\n\n|$)/g, "").trim() : result.respuesta;

      if (escalate) {
        await SB.from("wa_conversaciones").update({
          ai_paused_until: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          tags: ["escalar"],
          updated_at: new Date().toISOString(),
        }).eq("id", conv.id);
      }

      // Enviar vía WhatsApp
      const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
      let messageId = null;
      if (cleanText.trim().length > 0) {
        const sendRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp/send-text`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ANON}`,
              "apikey": ANON,
            },
            body: JSON.stringify({ to: conv.telefono, body: cleanText }),
          }
        );
        const sendData = await sendRes.json().catch(() => ({}));
        messageId = sendData?.messages?.[0]?.id || null;

        await SB.from("wa_mensajes").insert({
          conversacion_id: conv.id,
          wa_message_id:   messageId,
          direction:       "out",
          type:            "text",
          content:         cleanText,
          sender:          "ai",
          status:          messageId ? "sent" : "error",
          raw:             { engine: "tatiana", escalate, send_response: sendData },
        });
      }

      return jsonResp({
        ok: true,
        conversacion_id: conv.id,
        telefono: conv.telefono,
        response: cleanText,
        escalated: escalate,
        message_id: messageId,
      });
    } catch (err) {
      console.error("[tatiana-chat/respond-to-conversation] error:", err);
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }

  // POST tools standalone (debug)
  if (req.method === "POST" && path === "/tools/verificar-disponibilidad") {
    try {
      const input = await req.json();
      return jsonResp(await verificarDisponibilidadPasadia(input));
    } catch (err) {
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }
  if (req.method === "POST" && path === "/tools/crear-reserva") {
    try {
      const input = await req.json();
      return jsonResp(await crearReservaPasadia(input));
    } catch (err) {
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }
  if (req.method === "POST" && path === "/tools/generar-link-pago") {
    try {
      const input = await req.json();
      return jsonResp(await generarLinkPago(input));
    } catch (err) {
      return jsonResp({ error: String((err as Error).message || err) }, 500);
    }
  }

  return jsonResp({ error: "endpoint not found", path }, 404);
});
