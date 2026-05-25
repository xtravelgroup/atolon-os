// translate-cotizacion — Traduce textos de cotización (es→en) usando Claude.
// POST { strings: string[] }
// Devuelve { translations: string[] } en el mismo orden.
// Optimizado para traducir items de servicios/extras/cotización: nombres de
// categorías, conceptos, descripciones de espacios/alimentos/hospedaje, etc.

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { strings } = await req.json();
    if (!Array.isArray(strings) || strings.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "strings array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ANTHROPIC_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limpiar duplicados y vacíos
    const unique = Array.from(new Set(strings.filter((s: string) => s && typeof s === "string" && s.trim())));
    if (unique.length === 0) {
      return new Response(JSON.stringify({ ok: true, translations: strings }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const numbered = unique.map((s, i) => `${i + 1}. ${s}`).join("\n");

    const prompt = `You are a professional translator for a luxury beach club's event quotations. Translate the following Spanish text items to natural, polished English suitable for international clients. Preserve currency amounts, numbers, dates, and proper nouns (brand names like "Atolon", "Suite King", "Buffet"). Keep formatting tokens (—, -, ·, parentheses) as-is.

Items to translate (numbered):
${numbered}

Return ONLY a JSON object with this exact format, no markdown, no explanation:
{"translations": ["english of #1", "english of #2", ...]}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ ok: false, error: `Anthropic API ${resp.status}: ${errText}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text || "";

    // Extraer JSON del texto (puede venir con o sin code fences)
    let parsed: { translations: string[] };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: "Failed to parse Claude response", raw: text }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(parsed.translations) || parsed.translations.length !== unique.length) {
      return new Response(JSON.stringify({ ok: false, error: "Translation count mismatch", expected: unique.length, got: parsed.translations?.length }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mapear de unique array → input array preservando orden y duplicados
    const uniqueMap: Record<string, string> = {};
    unique.forEach((s, i) => { uniqueMap[s] = parsed.translations[i]; });
    const translations = strings.map((s: string) => uniqueMap[s] || s);

    return new Response(JSON.stringify({ ok: true, translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
