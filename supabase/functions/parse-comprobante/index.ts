// parse-comprobante — Extrae datos del Comprobante Informe Diario (POS)
// Recibe imagen base64, devuelve cajero, comprobante#, fecha y montos por método de pago.

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
        max_tokens: 512,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 },
            },
            {
              type: "text",
              text: `Eres un extractor de datos de comprobantes de caja colombianos (Sistema POS).
Analiza esta imagen y extrae los siguientes datos.

Retorna SOLO un JSON con este formato exacto, sin texto adicional:
{
  "cajero": "NOMBRE DEL RESPONSABLE DE CAJA",
  "numero_comprobante": "1353",
  "fecha": "2026-03-31",
  "metodos": {
    "datafono":      { "venta": 0, "propina": 0 },
    "efectivo":      { "venta": 0, "propina": 0 },
    "link_pago":     { "venta": 0, "propina": 0 },
    "resort_credit": { "venta": 0, "propina": 0 },
    "transferencia": { "venta": 0, "propina": 0 },
    "otros":         { "venta": 0, "propina": 0 }
  },
  "inc_base": 0,
  "inc_impuesto": 0,
  "ok": true
}

Instrucciones de extracción:
- cajero: "Responsable de caja" en el comprobante
- numero_comprobante: "Comprobante No."
- fecha: fecha inicial del comprobante en formato YYYY-MM-DD
- metodos: usa la sección "Detalle Ventas" del comprobante
  - datafono.venta: columna "Venta" de Datafono (sin propina)
  - datafono.propina: columna "Propina" de Datafono
  - efectivo.venta: columna "Venta" de Efectivo
  - efectivo.propina: columna "Propina" de Efectivo
  - link_pago: "Link de Pago" o "Wompi"
  - resort_credit: "Resort Credit"
  - transferencia: "Transferencia"
  - otros: cualquier otro método no listado (suma si hay varios)
- inc_base: sección "Impuestos" → columna "Base" del INC (8%)
- inc_impuesto: sección "Impuestos" → columna "Imp" del INC (8%)
- Todos los montos son enteros en pesos colombianos (sin puntos ni comas, sin símbolo $)
- Si un campo no se encuentra usa "" para texto y 0 para números
- Si no puedes leer el comprobante retorna { "ok": false, "error": "descripcion" }`,
            },
          ],
        }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return new Response(JSON.stringify({ ok: false, error: "No se pudo parsear la respuesta", raw: text }), { status: 422, headers: corsHeaders });

    const result = JSON.parse(match[0]);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "content-type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders });
  }
});
