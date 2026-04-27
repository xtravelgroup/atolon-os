// parse-cotizacion — Extrae datos de una cotización de proveedor (PDF/imagen).
// Recibe imageBase64 + opcional listaItems (de la requisición). Devuelve datos
// estructurados con proveedor, validez, items con precios cotizados, total.
// Útil para comparar cotizaciones de varios proveedores antes de emitir OC.

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { imageBase64, pdfBase64, mediaType, reqItems = [] } = await req.json();
    const fileBase64 = imageBase64 || pdfBase64;
    const isPDF = !!pdfBase64 || (mediaType || "").includes("pdf");
    if (!fileBase64) {
      return new Response(JSON.stringify({ ok: false, error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemsContexto = (reqItems || []).slice(0, 50).map((it: any, i: number) =>
      `${i + 1}. ${it.item || it.nombre} (cant ${it.cant} ${it.unidad || ""})`
    ).join("\n");

    const prompt = `Eres un extractor de datos de cotizaciones de proveedor colombianas.
Analiza esta cotización y extrae los datos en JSON.

${reqItems.length > 0 ? `\nLa requisición pidió estos items (úsalos como referencia para hacer match):\n${itemsContexto}\n` : ""}

Retorna SOLO un JSON con este formato exacto:
{
  "ok": true,
  "cotizacion_numero": "COT-2026-001",
  "fecha_cotizacion": "2026-04-26",
  "validez_dias": 15,
  "fecha_vencimiento": "2026-05-11",
  "proveedor_nombre": "DISTRIBUIDORA EJEMPLO SAS",
  "proveedor_nit": "900123456-7",
  "proveedor_email": "ventas@proveedor.com",
  "proveedor_telefono": "3001234567",
  "condiciones_pago": "Crédito 30 días",
  "tiempo_entrega": "3-5 días hábiles",
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
      "match_req_idx": 0,
      "disponibilidad": "inmediata"
    }
  ],
  "notas": "Cualquier observación relevante (descuentos, mínimos, etc.)"
}

Instrucciones:
- cotizacion_numero: número o referencia de la cotización (ej. "COT-1234", "Q-001"). Si no hay, usar null.
- fecha_cotizacion: fecha de emisión en formato YYYY-MM-DD
- validez_dias: días de validez de la cotización (si dice "válida 15 días", usa 15). Si no se menciona, usa 15 por defecto.
- fecha_vencimiento: fecha cuando vence la oferta (calcula desde fecha_cotizacion + validez_dias)
- proveedor_nombre: razón social del emisor
- proveedor_nit, proveedor_email, proveedor_telefono: contactos
- condiciones_pago: ej. "Contado", "Crédito 30 días", "50% anticipo 50% contraentrega"
- tiempo_entrega: ej. "Inmediata", "3 días", "7-10 días"
- subtotal: suma de items SIN IVA
- iva: IVA total
- total: total con IVA
- items: array con cada producto cotizado
  · precio_unitario: precio antes de IVA por unidad
  · iva: IVA del renglón
  · match_req_idx: índice (0-based) en la lista de requisición que mejor coincida, o null
  · disponibilidad: "inmediata" | "limitada" | "agotado" | "—"
- Si la cotización no se puede leer claramente, retorna { "ok": false, "error": "razón" }
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
        model: "claude-sonnet-4-5",
        max_tokens: 12000,
        system: "Eres un extractor de cotizaciones. SIEMPRE respondes SOLO con un objeto JSON válido sin markdown, sin texto antes ni después.",
        messages: [{
          role: "user",
          content: [
            isPDF
              ? {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
                }
              : {
                  type: "image",
                  source: { type: "base64", media_type: mediaType || "image/jpeg", data: fileBase64 },
                },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const detail = data?.error?.message || JSON.stringify(data).slice(0, 500);
      return new Response(JSON.stringify({ ok: false, error: `Anthropic API: ${detail}`, status: res.status, raw: data }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = data.content?.[0]?.text || "";
    const stopReason = data.stop_reason || "";

    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (!cleaned.startsWith("{")) {
      const i = cleaned.indexOf("{");
      if (i >= 0) cleaned = cleaned.slice(i);
    }
    if (cleaned.startsWith("{")) {
      let depth = 0, end = -1;
      for (let i = 0; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > 0) cleaned = cleaned.slice(0, end + 1);
    }

    let parsed: any = null;
    let parseError: string | null = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e: any) {
      parseError = String(e?.message || e);
    }

    if (!parsed) {
      const reason = stopReason === "max_tokens"
        ? "El modelo se quedó sin tokens (cotización muy larga)."
        : `JSON inválido del modelo: ${parseError}`;
      return new Response(JSON.stringify({
        ok: false,
        error: reason,
        stop_reason: stopReason,
        raw_first_chars: text.slice(0, 800),
        raw_last_chars:  text.slice(-400),
        usage: data.usage || null,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
