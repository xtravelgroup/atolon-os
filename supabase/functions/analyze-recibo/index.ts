// analyze-recibo — Supabase Edge Function
// Recibe una imagen de recibo en base64, usa Claude Vision para extraer
// "El total del consumo al momento es: $X" y retorna el monto.

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) return new Response(JSON.stringify({ error: "No image provided" }), { status: 400, headers: corsHeaders });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 },
            },
            {
              type: "text",
              text: `Eres un extractor de datos de recibos de restaurante colombiano.
Analiza esta imagen y extrae el monto total del consumo y la fecha.
Busca específicamente:
1. La línea que dice "El total del consumo al momento es" o similar (puede ser "Total", "Total a pagar", "Gran total", etc.)
2. La fecha del recibo (puede estar en formato DD/MM/YYYY, YYYY-MM-DD, o similar)

Retorna SOLO un JSON con este formato exacto, sin texto adicional:
{"monto": 123456, "encontrado": true, "texto": "texto exacto de la línea del total", "fecha": "2025-04-01"}
Si no puedes leer el monto con certeza, retorna:
{"monto": 0, "encontrado": false, "texto": "", "fecha": null}
El monto debe ser un número entero en pesos colombianos, sin puntos ni comas.
La fecha debe estar en formato ISO YYYY-MM-DD. Si no encuentras fecha clara, usa null.`,
            },
          ],
        }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";

    // Parse JSON from Claude response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return new Response(JSON.stringify({ error: "Could not parse response", raw: text }), { status: 422, headers: corsHeaders });

    const result = JSON.parse(match[0]);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "content-type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
