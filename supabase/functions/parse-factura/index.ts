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
    const { imageBase64, pdfBase64, mediaType, ocItems = [] } = await req.json();
    const fileBase64 = imageBase64 || pdfBase64;
    const isPDF = !!pdfBase64 || (mediaType || "").includes("pdf");
    if (!fileBase64) return new Response(JSON.stringify({ ok: false, error: "No file provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const itemsContexto = (ocItems || []).slice(0, 50).map((it: any, i: number) =>
      `${i + 1}. ${it.item || it.nombre} (cant ${it.cant} ${it.unidad || ""})`
    ).join("\n");

    const prompt = `Eres un extractor experto de facturas electrónicas colombianas (DIAN).
Analiza TODAS las páginas de esta factura y extrae los datos en JSON.

CONTEXTO TRIBUTARIO COLOMBIA:
- IVA es DEDUCIBLE → se separa del costo del producto
- ICO (Impuesto al Consumo, cervezas/refajos), ICL (Impuesto Consumo Licores)
  y ADV (Ad Valorem) son NO DEDUCIBLES → forman parte del COSTO real del producto
- precio_costo_unit = precio_base + ico_unit + icl_unit + adv_unit (sin IVA)
- precio_final_unit = precio_costo_unit + iva_unit

${ocItems.length > 0 ? `\nLa Orden de Compra esperaba estos items (úsalos como referencia para match):\n${itemsContexto}\n` : ""}

Retorna SOLO un JSON con este formato exacto:
{
  "ok": true,
  "factura_numero": "02FE266813",
  "factura_fecha": "2026-04-17",
  "fecha_vencimiento": "2026-04-20",
  "forma_pago": "Contado · Efectivo",
  "proveedor_nombre": "DISTRIBUIDORA DE VINOS Y LICORES SAS",
  "proveedor_nit": "890916575-4",
  "no_pedido": "PWD 01347708",
  "no_remision": "REV-00521365",
  "subtotal_base": 13496868,
  "iva_total": 919929,
  "ico_total": 0,
  "icl_total": 3024675,
  "adv_total": 1638475,
  "consumo_total": 4663150,
  "descuentos_total": 0,
  "total": 19616928,
  "items": [
    {
      "codigo_barras": "7702004111548",
      "referencia_proveedor": "370080",
      "nombre": "CERVEZA CORONA BOT BNR 6PACK 330ML",
      "cantidad": 24,
      "unidad": "UND",
      "precio_base_unit": 18024,
      "descuento_pct": 0,
      "iva_pct": 19,
      "iva_valor_unit": 1170,
      "ico_valor_unit": 5400,
      "icl_valor_unit": 0,
      "adv_valor_unit": 0,
      "precio_costo_unit": 23424,
      "precio_final_unit": 24594,
      "subtotal_renglon": 565213,
      "match_oc_idx": 0
    }
  ]
}

Instrucciones detalladas:
- factura_numero: número de la factura electrónica (ej. "02FE266813", "FV2-12345")
- factura_fecha: fecha de emisión YYYY-MM-DD
- fecha_vencimiento: fecha de vencimiento de pago YYYY-MM-DD (si dice "Fecha Vencimiento")
- forma_pago: ej. "Contado · Efectivo", "Crédito 30 días"
- proveedor_nombre: razón social del emisor
- proveedor_nit: NIT (con o sin DV)
- no_pedido / no_remision: si aparecen en la factura, capturarlos
- subtotal_base: suma de bases (sin descuentos, sin impuestos)
- iva_total, ico_total, icl_total, adv_total: totales por tipo de impuesto. Si no aparece desglosado por tipo, pon 0 y ponlos en consumo_total.
- consumo_total: SUMA de todos los impuestos NO DEDUCIBLES (ICO + ICL + ADV)
- descuentos_total: suma de descuentos aplicados
- total: total a pagar (lo que dice "TOTAL A PAGAR" o "Total Bruto + Total Imptos")
- items: array con TODOS los productos facturados (procesa TODAS las páginas)
  · codigo_barras: el código EAN/barras (suele tener 13 dígitos, empieza por 770... en Colombia)
  · referencia_proveedor: la "referencia interna" del proveedor (NO el código de barras)
  · nombre: descripción del artículo tal como aparece
  · cantidad: unidades (UND, columna "UND" o similar)
  · unidad: "UND", "BOT", "ML", "KG" según corresponda
  · precio_base_unit: precio base por unidad SIN ningún impuesto ni descuento
  · descuento_pct: porcentaje de descuento aplicado al renglón (0 si no hay)
  · iva_pct: % de IVA del renglón (0, 5, 19)
  · iva_valor_unit: valor del IVA por unidad (deducible)
  · ico_valor_unit: valor del Impuesto al Consumo por unidad (NO deducible). Si no se desglosa, calcula desde % consumo
  · icl_valor_unit: valor del Impuesto Consumo Licores por unidad (NO deducible)
  · adv_valor_unit: valor Ad Valorem por unidad (NO deducible)
  · precio_costo_unit: COSTO REAL por unidad = precio_base + ico + icl + adv (sin IVA, lo que va al inventario)
  · precio_final_unit: precio final con todos los impuestos incluidos
  · subtotal_renglon: cantidad × precio_final_unit (o el "VLR NETO FINAL" del renglón)
  · match_oc_idx: índice (0-based) en la lista de OC esperados que mejor coincida (por nombre), o null
- Si la factura no se puede leer claramente, retorna { "ok": false, "error": "razón" }
- Todos los montos como números ENTEROS sin separadores ni signo $ (ej. 18024 no "$18.024")
- NO inventes datos. Si un campo no aparece en la factura, usa 0 o null
- NO incluir comentarios ni texto fuera del JSON
- IMPORTANTE: procesa TODAS las páginas del documento, no solo la primera`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        ...(isPDF ? { "anthropic-beta": "pdfs-2024-09-25" } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022", // Sonnet para mejor parsing de tablas
        max_tokens: 8000,
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
