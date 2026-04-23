/**
 * send-whatsapp — Supabase Edge Function
 * Envía mensajes de WhatsApp via Meta Cloud API
 *
 * POST body:
 *   { to, template, params }
 *   to       = "+573001234567"
 *   template = "confirmacion_reserva" | "recordatorio_visita" | "recordatorio_muelle"
 *   params   = string[]   (variables {{1}}, {{2}}, ...)
 */

const PHONE_NUMBER_ID = "555249284336728";
const META_TOKEN      = Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const API_URL         = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

// ── Template variable counts (for validation) ────────────────────────────────
const TEMPLATE_PARAMS: Record<string, number> = {
  confirmacion_reserva: 7,   // nombre, fecha, paquete, personas, llegada, salida, zarpe_url
  recordatorio_visita:  6,   // nombre, fecha, paquete, personas, llegada, salida
  recordatorio_muelle:  3,   // nombre, llegada, salida
};

// ── Normalize phone number to E.164 ─────────────────────────────────────────
function normalizePhone(raw: string): string {
  // Remove spaces, dashes, parens
  let num = raw.replace(/[\s\-\(\)]/g, "");
  // Colombia: add +57 if starts with 3 and is 10 digits
  if (/^3\d{9}$/.test(num)) num = "+57" + num;
  // Add + if missing
  if (!num.startsWith("+")) num = "+" + num;
  return num;
}

// ── Build Meta API payload ───────────────────────────────────────────────────
function buildPayload(to: string, template: string, params: string[]) {
  return {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type: "template",
    template: {
      name:     template,
      language: { code: "es" },
      components: params.length > 0
        ? [{
            type:       "body",
            parameters: params.map(p => ({ type: "text", text: String(p) })),
          }]
        : [],
    },
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { to, template, params = [] } = await req.json();

    if (!to || !template) {
      return new Response(JSON.stringify({ error: "to and template are required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    if (!META_TOKEN) {
      return new Response(JSON.stringify({ error: "META_WHATSAPP_TOKEN not configured" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const phone   = normalizePhone(to);
    const payload = buildPayload(phone, template, params);

    const res = await fetch(API_URL, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${META_TOKEN}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    // Log to Supabase (optional — only if table exists)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && supabaseKey) {
        await fetch(`${supabaseUrl}/rest/v1/whatsapp_logs`, {
          method: "POST",
          headers: {
            "apikey":        supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal",
          },
          body: JSON.stringify({
            id:         data.messages?.[0]?.id ?? `LOG-${Date.now()}`,
            to:         phone,
            template,
            params,
            status:     res.ok ? "sent" : "error",
            meta_response: data,
            created_at: new Date().toISOString(),
          }),
        });
      }
    } catch { /* logging is optional */ }

    return new Response(JSON.stringify(data), {
      status:  res.ok ? 200 : 400,
      headers: {
        "Content-Type":                "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
