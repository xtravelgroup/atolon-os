// parse-factura — Extrae datos de factura de proveedor (PDF/imagen).
// Recibe imageBase64 + lista de items esperados de la OC. Devuelve datos
// estructurados con número factura, fecha, items con precios reales, IVA.

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { imageBase64, mediaType, ocItems = [] } = await req.json();
    if (!imageBase64) return new Response(JSON.stringify({ ok: false, error: "No image provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const itemsContexto = (ocItems || []).slice(0, 50).map((it: any, i: number) =>
      `${i + 1}. ${it.item || it.nombre} (cant ${it.cant} ${it.unidad || ""})`
    ).join("\n");

    const prompt = `Eres un extractor de datos de facturas de proveedor colombianas.
Analiza esta factura y extrae los datos en JSON.

${ocItems.length > 0 ? `\nLa Orden de Compra esperaba estos items (úsalos como referencia para hacer match):\n${itemsContexto}\n` : ""}

Retorna SOLO un JSON con este formato exacto:
{
  "ok": true,
  "factura_numero": "DL12345",
  "factura_fecha": "2026-04-26",
  "proveedor_nombre": "DISTRIBUIDORA EJEMPLO SAS",
  "proveedor_nit": "900123456-7",
  "subtotal": 100000,
  "iva": 19000,
  "total": 119000,
  "items": [
    {
      "nombre": "Cerveza Stella Artois 330ml",
      "cantidad": 48,
      "unidad": "Unidad",
      "precio_unitario": 3567,
      "subtotal": 171216,
      "iva": 32531,
      "match_oc_idx": 0
    }
  ]
}

Instrucciones:
- factura_numero: número o consecutivo de la factura (ej. "FE-1234", "DL12345")
- factura_fecha: fecha de emisión en formato YYYY-MM-DD
- proveedor_nombre: razón social del emisor
- proveedor_nit: NIT del emisor (con o sin DV)
- subtotal: suma de items SIN IVA
- iva: IVA total
- total: total con IVA (subtotal + iva)
- items: array con cada producto facturado
  · precio_unitario: precio antes de IVA por unidad
  · iva: IVA del renglón (puede ser 0 si está exento)
  · match_oc_idx: índice (0-based) en la lista de OC esperados que mejor coincida con este item, o null si no matchea
- Si la factura no se puede leer claramente, retorna { "ok": false, "error": "razón" }
- Todos los montos como números enteros sin separadores
- NO incluir comentarios ni texto fuera del JSON`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022", // Sonnet para mejor parsing de tablas
        max_tokens: 3000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 },
            },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: "Anthropic error", detail: data }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const text = data.content?.[0]?.text || "";
    // Extraer JSON del response (Claude a veces lo envuelve)
    const m = text.match(/\{[\s\S]*\}/);
    let parsed: any = null;
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: "JSON inválido del modelo", raw: text.slice(0, 500) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    if (!parsed) {
      return new Response(JSON.stringify({ ok: false, error: "No se pudo parsear", raw: text.slice(0, 500) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
