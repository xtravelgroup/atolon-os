// concierge-turn — Loop conversacional con Claude tool-use para Atolón Concierge AI
// Entradas:
//   { tenant_id, session_id?, conversation_id?, playground?, message, history?, contact_id?, channel_id? }
// Salidas:
//   { reply, tool_calls, tokens_in, tokens_out, cost_usd }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPA_URL      = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Precio USD por 1M tokens — actualizar según Anthropic pricing
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-5-20250929": { in: 3.0,  out: 15.0 },
  "claude-opus-4-5-20250929":   { in: 15.0, out: 75.0 },
  "claude-haiku-4-5-20251001":  { in: 1.0,  out: 5.0  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(SUPA_URL, SUPA_KEY);

  try {
    const body = await req.json();
    const { tenant_id, message, history = [], conversation_id, playground, b2b_context, confirm_context } = body;
    if (!tenant_id || !message) {
      return json({ ok: false, error: "tenant_id y message requeridos" }, 400);
    }
    if (!ANTHROPIC_KEY) return json({ ok: false, error: "Falta ANTHROPIC_API_KEY" }, 500);

    // 1) Elegir agente + tools según canal
    // - B2B (b2b_context con aliado_id): AGT-ATOLON-B2B + tools B2B
    // - Confirm (confirm_context con customer_telefono): AGT-ATOLON-MAIN + tools
    //   públicos + get_customer_reservations
    // - Concierge normal (web/leads): AGT-ATOLON-MAIN + tools públicos (SIN
    //   get_customer_reservations, que solo tiene sentido si sabes el tel del
    //   contacto)
    const isB2B = !!b2b_context?.aliado_id;
    const isConfirm = !isB2B && !!confirm_context?.customer_telefono;
    const linea = isB2B ? "b2b" : isConfirm ? "confirm" : "general";
    const agentQuery = isB2B
      ? supa.from("ai_agents").select("*").eq("id", "AGT-ATOLON-B2B").maybeSingle()
      : isConfirm
      ? supa.from("ai_agents").select("*").eq("id", "AGT-ATOLON-CONFIRM").maybeSingle()
      : supa.from("ai_agents").select("*").eq("id", "AGT-ATOLON-MAIN").maybeSingle();
    const B2B_TOOL_NAMES = ["get_agency_context", "check_availability_b2b", "create_b2b_booking", "generate_payment_link_b2b", "get_recent_bookings", "redeem_points", "update_booking_price_mode", "cancel_booking"];
    const CUSTOMER_ONLY_TOOL_NAMES = ["get_customer_reservations"];
    const [{ data: agent }, { data: kb }, { data: allTools }] = await Promise.all([
      agentQuery,
      // KB filtrada por línea: entradas de esta línea + entradas 'todas' (compartidas)
      supa.from("ai_knowledge_base").select("*").eq("tenant_id", tenant_id).eq("activo", true)
        .or(`linea.eq.${linea},linea.eq.todas,linea.is.null`).limit(20),
      supa.from("ai_tools").select("*").eq("tenant_id", tenant_id).eq("activo", true),
    ]);
    if (!agent) return json({ ok: false, error: `No hay agente ${isB2B ? "B2B" : "principal"} activo` }, 400);
    const tools = (allTools || []).filter((t: any) => {
      if (isB2B) return B2B_TOOL_NAMES.includes(t.nombre);
      if (B2B_TOOL_NAMES.includes(t.nombre)) return false;
      // Customer-only tools solo se ofrecen si hay confirm_context (sabemos el tel)
      if (CUSTOMER_ONLY_TOOL_NAMES.includes(t.nombre)) return isConfirm;
      return true;
    });

    // 2) Armar system prompt
    const kbContext = (kb || []).map((k: any) => `## ${k.nombre}\n${(k.contenido || k.url || "").slice(0, 2000)}`).join("\n\n---\n\n");
    const styleHint = ({
      short: "Sé muy conciso: 1-2 líneas.",
      long: "Puedes ser detallado pero relevante.",
      default: "Sé breve pero completo.",
    } as any)[agent.message_length] || "";
    // Fecha actual en zona horaria del agente (evita que el modelo defaultee al año de entrenamiento)
    const tz = agent.idioma_default === "es" ? "America/Bogota" : "UTC";
    const hoy = new Date().toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz });
    const hoyISO = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const confirmHint = isConfirm ? [
      "\n\n=== CONTEXTO CLIENTE (canal WhatsApp Confirmaciones) ===",
      `El cliente que te escribe tiene teléfono: ${confirm_context.customer_telefono}`,
      confirm_context.customer_nombre ? `Nombre en WhatsApp: ${confirm_context.customer_nombre}` : "",
      "\nSIEMPRE al inicio de la conversación (o cuando el cliente pregunte por su reserva) llama la tool `get_customer_reservations` para conocer sus reservas activas. NO le pidas número de teléfono ni datos de la reserva antes de consultarla — el sistema ya te da esa info.",
      "\nPuedes:",
      "- Contarle detalles de sus reservas activas (fecha, hora salida, pasadía, pax, saldo, hora de llegada a la Bodeguita)",
      "- Dar información general de Atolón (horarios, ubicación, punto de encuentro, impuesto de muelle, duración trayecto, políticas — TODO viene del Knowledge Base de arriba)",
      "- Ayudar a crear una NUEVA reserva usando `check_disponibilidad_pasadia`, `get_precios_pasadias` y `crear_reserva_pendiente` (siempre confirma con el cliente ANTES de crear)",
      "\nREGLAS DURAS:",
      "- Para punto de encuentro exacto (puerta), impuesto de muelle, duración del trayecto en lancha, y cualquier otra info logística → USA EL KNOWLEDGE BASE. Nunca inventes ni asumas números.",
      "- La tool `get_customer_reservations` calcula la `hora_llegada_bodeguita` (30 min antes de la salida). Úsala tal cual.",
      "- Si el KB no tiene un dato específico, dilo claramente en vez de inventar.",
      "- Para pasadías after_island / sin embarcación Atolón, el cliente llega en su propia lancha directamente al muelle de Atolón — no pasa por la Bodeguita.",
    ].filter(Boolean).join("\n") : "";
    const system = [
      `HOY es ${hoy} (${hoyISO}). Cuando el cliente diga fechas relativas ("mañana", "el sábado", "el 15") interpreta con base en HOY. Nunca uses años pasados.\n\n`,
      agent.custom_instructions || "",
      "\n\nESTILO:", styleHint, agent.usa_emoji ? "Puedes usar emojis." : "No uses emojis.",
      agent.assistant_name ? `\nTu nombre es: ${agent.assistant_name}.` : "",
      kbContext ? "\n\n=== KNOWLEDGE BASE ===\n" + kbContext : "",
      confirmHint,
    ].join(" ").trim();

    // 3) Formatear tools para Claude
    const anthropicTools = (tools || []).map((t: any) => ({
      name: t.nombre,
      description: t.descripcion,
      input_schema: t.input_schema,
    }));

    // 4) Historial
    const messages: any[] = [
      ...history.map((m: any) => ({ role: m.rol === "user" ? "user" : "assistant", content: m.contenido })),
      { role: "user", content: message },
    ];

    // 5) Loop tool-use (max 5 iteraciones)
    let reply = "";
    const toolCalls: any[] = [];
    let usageIn = 0, usageOut = 0;

    for (let i = 0; i < 5; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: agent.model,
          max_tokens: agent.max_tokens || 1024,
          temperature: Number(agent.temperature) || 0.6,
          system,
          tools: anthropicTools.length ? anthropicTools : undefined,
          messages,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Anthropic ${res.status}: ${t.slice(0, 300)}`);
      }
      const data = await res.json();
      usageIn  += data.usage?.input_tokens  || 0;
      usageOut += data.usage?.output_tokens || 0;

      const textBlocks = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
      const toolUses   = (data.content || []).filter((c: any) => c.type === "tool_use");

      if (textBlocks) reply = textBlocks;
      if (toolUses.length === 0 || data.stop_reason === "end_turn") break;

      // Ejecutar cada tool
      const toolResults: any[] = [];
      for (const t of toolUses) {
        const toolDef = (tools || []).find((x: any) => x.nombre === t.name);
        let output: any = { error: "tool no encontrado" };
        try {
          if (toolDef?.endpoint) {
            // Para tools B2B, el endpoint es 'b2b-tools' con un router interno
            // por `action`. El nombre de la tool es la action.
            const isB2BTool = toolDef.endpoint === "b2b-tools";
            const isConfirmTool = toolDef.endpoint === "confirm-tools";
            const toolBody = isB2BTool
              ? { action: t.name, aliado_id: b2b_context?.aliado_id, ...t.input }
              : isConfirmTool
              ? { action: t.name, customer_telefono: confirm_context?.customer_telefono, customer_nombre: confirm_context?.customer_nombre, ...t.input }
              : { tenant_id, customer_telefono: confirm_context?.customer_telefono, ...t.input };
            const r = await fetch(`${SUPA_URL}/functions/v1/${toolDef.endpoint}`, {
              method: "POST",
              headers: { "content-type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
              body: JSON.stringify(toolBody),
            });
            output = r.ok ? await r.json() : { error: `HTTP ${r.status}` };
          }
        } catch (e: any) { output = { error: e.message || String(e) }; }
        toolCalls.push({ name: t.name, input: t.input, output });
        toolResults.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(output) });
      }
      messages.push({ role: "assistant", content: data.content });
      messages.push({ role: "user", content: toolResults });
    }

    // 6) Cálculo costo
    const price = PRICE[agent.model] || { in: 3.0, out: 15.0 };
    const costUsd = (usageIn * price.in + usageOut * price.out) / 1_000_000;

    // 7) Persistir SOLO el reply del asistente si hay conversation_id
    // (el mensaje del user ya lo insertó concierge-webhook-whatsapp;
    // duplicarlo aquí rompe el historial y Claude pierde contexto).
    if (!playground && conversation_id) {
      const uid = `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await supa.from("ai_messages").insert([
        { id: `${uid}-a`, conversation_id, tenant_id, rol: "assistant", contenido: reply, origen: "agent",
          tool_calls: toolCalls, usage_tokens_in: usageIn, usage_tokens_out: usageOut, usage_cost_usd: costUsd },
      ]);
      await supa.from("ai_conversations").update({
        ultimo_mensaje: reply.slice(0, 500),
        ultimo_mensaje_at: new Date().toISOString(),
        estado: "live",
      }).eq("id", conversation_id);
    }

    // 8) Sumar uso diario
    const fecha = new Date().toISOString().slice(0, 10);
    await supa.rpc("ai_usage_add", {
      p_tenant_id: tenant_id, p_fecha: fecha, p_model: agent.model,
      p_tin: usageIn, p_tout: usageOut, p_cost: costUsd,
    }).then(() => {}, () => {
      // Fallback: insertar directo
      return supa.from("ai_usage").insert({ tenant_id, fecha, model: agent.model, tokens_in: usageIn, tokens_out: usageOut, cost_usd: costUsd, messages: 1 });
    });

    return json({ ok: true, reply, tool_calls: toolCalls, tokens_in: usageIn, tokens_out: usageOut, cost_usd: costUsd });
  } catch (e: any) {
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}
