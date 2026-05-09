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

// ═══════════════════════════════════════════════════════════════════════
// TOOL 1 — verificar_disponibilidad_pasadia
// ═══════════════════════════════════════════════════════════════════════
async function verificarDisponibilidadPasadia(input: {
  fecha: string;
  num_personas: number;
}) {
  const SB = getSB();
  const { fecha, num_personas } = input;

  const { data: reservasDia } = await SB.from("reservas_pasadia")
    .select("horario_salida, num_personas")
    .eq("fecha", fecha)
    .neq("estado", "cancelada");

  const ocupacion: Record<string, number> = {};
  HORARIOS.forEach(h => { ocupacion[h] = 0; });
  for (const r of (reservasDia || [])) {
    ocupacion[r.horario_salida] = (ocupacion[r.horario_salida] || 0) + (r.num_personas || 0);
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

  // Validaciones
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
    };
  }

  const totalCop = PRECIOS_COP[input.producto] * input.num_personas;
  const expira = new Date(Date.now() + TIEMPO_BLOQUEO_MIN * 60 * 1000).toISOString();

  const { data: nueva, error } = await SB.from("reservas_pasadia").insert({
    fecha:           input.fecha,
    horario_salida:  input.horario,
    producto:        input.producto,
    num_personas:    input.num_personas,
    num_adultos:     input.num_adultos ?? input.num_personas,
    num_ninos:       input.num_ninos ?? 0,
    cliente_nombre:  input.cliente_nombre,
    cliente_telefono: input.cliente_telefono,
    cliente_email:   input.cliente_email,
    idioma:          input.idioma || "es",
    total_cop:       totalCop,
    expira_en:       expira,
    fuente:          "visito_ai",
  }).select().single();

  if (error) throw new Error(`Error creando reserva: ${error.message}`);

  return {
    ok: true,
    reserva_id: nueva.id,
    total_cop: totalCop,
    total_usd_aprox: Math.ceil(totalCop / TRM_USD_COP),
    tasa_portuaria_total_cop: TASA_PORTUARIA_COP * input.num_personas,
    expira_en: expira,
    bloqueado_minutos: TIEMPO_BLOQUEO_MIN,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TOOL 3 — generar_link_pago
// Crea links Wompi + Zoho Pay en paralelo, devuelve link unificado
// ═══════════════════════════════════════════════════════════════════════
async function generarLinkWompi(reserva: any): Promise<string | null> {
  // Wompi widget URL: integration vía /pagar/{id} que cargará el widget
  // con la public_key y la integrity_key. No generamos un link directo.
  // Retornamos un placeholder que el frontend reconoce.
  return `wompi://${reserva.id}`;
}

async function generarLinkZohoPay(reserva: any): Promise<string | null> {
  try {
    // Llama al endpoint create-session de zoho-payments
    const totalUsd = Math.ceil(Number(reserva.total_cop) / TRM_USD_COP);
    const r = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/zoho-payments/create-session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
          "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
        },
        body: JSON.stringify({
          amount:      totalUsd,
          currency:    "USD",
          reference:   reserva.id,
          description: `Atolón Beach Club · ${reserva.cliente_nombre} · ${reserva.fecha}`,
          nombre:      reserva.cliente_nombre,
          email:       reserva.cliente_email,
          context:     "reservas_pasadia",
          context_id:  reserva.id,
        }),
      }
    );
    const data = await r.json();
    return data?.payments_session_id ? `zoho://${data.payments_session_id}` : null;
  } catch (e) {
    console.warn("[generarLinkZohoPay] failed:", (e as Error).message);
    return null;
  }
}

async function generarLinkPago(input: { reserva_id: string }) {
  const SB = getSB();
  const { data: reserva, error } = await SB.from("reservas_pasadia")
    .select("*").eq("id", input.reserva_id).single();
  if (error || !reserva) throw new Error("Reserva no encontrada");
  if (reserva.estado === "cancelada") {
    return { ok: false, error: "reserva_cancelada" };
  }

  // Crear ambos links en paralelo (degradación elegante)
  const [linkWompi, linkZoho] = await Promise.all([
    generarLinkWompi(reserva).catch(() => null),
    generarLinkZohoPay(reserva).catch(() => null),
  ]);

  // Construir link unificado (página /pagar/{id} en frontend)
  const baseUrl = "https://atolon.co";
  const linkPago = `${baseUrl}/pagar/${reserva.id}`;

  // Persistir links en BD
  await SB.from("reservas_pasadia").update({
    link_pago:  linkPago,
    link_wompi: linkWompi,
    link_zoho:  linkZoho,
    updated_at: new Date().toISOString(),
  }).eq("id", reserva.id);

  return {
    ok: true,
    link_pago: linkPago,
    moneda_disponible: {
      cop_via_wompi: !!linkWompi,
      usd_via_zoho:  !!linkZoho,
    },
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
    const response = await callClaude(cfg.systemPrompt, mensajes, cfg.model);

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
