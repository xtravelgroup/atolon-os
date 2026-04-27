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

CONTEXTO EMPAQUES (CRÍTICO — LEE ATENTAMENTE):

REGLA #1: cantidad_paquete = EL NÚMERO TAL CUAL SALE EN LA COLUMNA "UND" DE LA FACTURA.
NO LO MULTIPLIQUES. Si la factura dice "UND: 8", entonces cantidad_paquete = 8. Punto.

REGLA #2: unidades_por_paquete = factor que detectas del NOMBRE del producto (NO de la columna UND).
- "6PACK", "SIXPACK", "6PK"     → 6
- "X 12", "X12", "X 12U", "X 12 UND" → 12
- "BANDEJA X 12"                → 12
- "X 24", "X24", "X 6"          → 24, 6
- Sin keyword de pack en el nombre → 1
- "750ML", "330CC", "330ML", "207ML", "0.7L" son TAMAÑOS DE ENVASE, NO empaques → factor 1 si no hay pack explícito

REGLA #3: cantidad_individual_total = cantidad_paquete × unidades_por_paquete (multiplica TÚ).

EJEMPLOS REALES (sigue este patrón):

Caso A: "CERVEZA CORONA BOT BNR 6PACK 330ML" — columna UND: 24
  → cantidad_paquete: 24      ← respeta lo que dice UND
  → unidades_por_paquete: 6   ← porque dice "6PACK"
  → cantidad_individual_total: 144

Caso B: "CERVEZA STELLA ARTOIS SIXPACK BNR 300 1N" — columna UND: 8
  → cantidad_paquete: 8       ← respeta lo que dice UND
  → unidades_por_paquete: 6   ← porque dice "SIXPACK"
  → cantidad_individual_total: 48

Caso C: "MIL976 PINK BANDEJA X 12 UND" — columna UND: 2
  → cantidad_paquete: 2       ← respeta lo que dice UND
  → unidades_por_paquete: 12  ← porque dice "BANDEJA X 12"
  → cantidad_individual_total: 24

Caso D: "RESERVA DE DON JULIO BLANCO 0.7L" — columna UND: 12
  → cantidad_paquete: 12      ← respeta lo que dice UND
  → unidades_por_paquete: 1   ← "0.7L" es tamaño, no pack
  → cantidad_individual_total: 12

Caso E: "RON ZACAPA CENTENARIO 23 0.7L" — columna UND: 2
  → cantidad_paquete: 2
  → unidades_por_paquete: 1   ← no hay keyword de pack
  → cantidad_individual_total: 2

ANTI-EJEMPLOS (NUNCA HAGAS ESTO):
❌ Stella UND:8 SIXPACK → Pack:48, ×Unid:1   (NO multipliques antes de poner en Pack)
❌ Corona UND:24 6PACK → Pack:144, ×Unid:1   (NO colapses la multiplicación)
❌ MIL976 UND:2 X 12 UND → Pack:12, ×Unid:1  (NO ignores el factor X12)

REGLA #4 (PRECIOS): NUNCA pongas $0 en precio_costo_pack si la factura tiene precio.
La columna "P. UNIT ANTES IMPTO" o "P. BASE UNIT" es el precio_base_pack del paquete.
La suma base + ICO + ICL + ADV es precio_costo_pack.

CONTEXTO BONIFICACIONES Y COMBOS:
- Una BONIFICACIÓN/REGALO/OBSEQUIO es un item con precio $0 o cercano a 0,
  o cuando el nombre contiene: "bonificacion", "obsequio", "regalo", "gratis",
  "GTS" (en algunas facturas), "promocion sin costo".
  → marca es_bonificacion = true
- Un COMBO es un item donde la descripción mezcla cantidades distintas, ej:
  "MIL976 OCEAN 207X24 GTS 4PK", "TEQUILA JC ESP 750 X12 GTS 3 JC ESP 375"
  → marca requiere_revision = true para que el humano lo capture a mano

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
      "cantidad_paquete": 24,
      "unidad_compra": "SIXPACK",
      "unidades_por_paquete": 6,
      "unidad_individual": "BOTELLA",
      "cantidad_individual_total": 144,
      "precio_base_pack": 18024,
      "descuento_pct": 0,
      "iva_pct": 19,
      "iva_valor_pack": 1170,
      "ico_valor_pack": 5400,
      "icl_valor_pack": 0,
      "adv_valor_pack": 0,
      "precio_costo_pack": 23424,
      "precio_costo_unit_individual": 3904,
      "precio_final_pack": 24594,
      "subtotal_renglon": 565213,
      "es_bonificacion": false,
      "requiere_revision": false,
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
  · codigo_barras: el código EAN/barras (13 dígitos, empieza por 770... en Colombia)
  · referencia_proveedor: la "referencia interna" del proveedor (NO el código de barras)
  · nombre: descripción del artículo tal como aparece
  · cantidad_paquete: cuántos PAQUETES facturó el proveedor (la columna UND de la factura)
  · unidad_compra: "SIXPACK", "BANDEJA X 12", "UND" según el nombre
  · unidades_por_paquete: factor de conversión detectado (6, 12, 24, 1...)
  · unidad_individual: "BOTELLA", "LATA", "UNIDAD" — cómo se cuenta el inventario individual
  · cantidad_individual_total: cantidad_paquete × unidades_por_paquete (lo que entra al inventario)
  · precio_base_pack: precio base POR PAQUETE sin impuestos ni descuento
  · descuento_pct: % de descuento aplicado al renglón
  · iva_pct: % de IVA (0, 5, 19)
  · iva_valor_pack: IVA POR PAQUETE (deducible)
  · ico_valor_pack: ICO POR PAQUETE (no deducible)
  · icl_valor_pack: ICL POR PAQUETE (no deducible)
  · adv_valor_pack: Ad Valorem POR PAQUETE (no deducible)
  · precio_costo_pack: costo POR PAQUETE = base + ico + icl + adv (sin IVA)
  · precio_costo_unit_individual: precio_costo_pack ÷ unidades_por_paquete (lo que va al precio_compra del catálogo)
  · precio_final_pack: precio final POR PAQUETE con todos los impuestos
  · subtotal_renglon: cantidad_paquete × precio_final_pack (o "VLR NETO FINAL")
  · es_bonificacion: true si el item viene gratis/regalo/obsequio (precio 0 o keyword)
  · requiere_revision: true si es un combo o estructura ambigua que el humano debe revisar
  · match_oc_idx: índice (0-based) en la lista de OC esperados que mejor coincida, o null
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
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 16000,
        system: "Eres un extractor de facturas electrónicas colombianas. Lee TODAS las páginas del documento. Llama a la herramienta extraer_factura con los datos. NUNCA pre-multipliques cantidad_paquete por unidades_por_paquete — son campos independientes.",
        tools: [{
          name: "extraer_factura",
          description: "Extrae los datos estructurados de una factura electrónica colombiana DIAN.",
          input_schema: {
            type: "object",
            required: ["factura_numero", "factura_fecha", "proveedor_nombre", "total", "items"],
            properties: {
              factura_numero:    { type: "string", description: "Ej: 02FE266813" },
              factura_fecha:     { type: "string", description: "YYYY-MM-DD" },
              fecha_vencimiento: { type: "string", description: "YYYY-MM-DD del vencimiento de pago" },
              forma_pago:        { type: "string" },
              no_pedido:         { type: "string" },
              no_remision:       { type: "string" },
              proveedor_nombre:  { type: "string" },
              proveedor_nit:     { type: "string" },
              subtotal_base:     { type: "number" },
              iva_total:         { type: "number" },
              consumo_total:     { type: "number", description: "ICO + ICL + ADV (no deducibles)" },
              descuentos_total:  { type: "number" },
              total:             { type: "number", description: "TOTAL A PAGAR" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  required: ["nombre", "cantidad_paquete", "unidades_por_paquete", "precio_costo_pack"],
                  properties: {
                    codigo_barras:        { type: "string" },
                    referencia_proveedor: { type: "string" },
                    nombre:               { type: "string" },
                    cantidad_paquete: {
                      type: "integer",
                      description: "EL NÚMERO TAL CUAL en la columna UND/Cant de la factura. NO multiplicar por unidades_por_paquete.",
                    },
                    unidad_compra: { type: "string", description: "SIXPACK, BANDEJA X 12, UND" },
                    unidades_por_paquete: {
                      type: "integer",
                      description: "Factor del NOMBRE: SIXPACK/6PACK→6, X 12/X12→12, X 24→24, sin pack→1. NUNCA pongas 1 si el nombre dice SIXPACK.",
                      minimum: 1,
                    },
                    unidad_individual: { type: "string", description: "BOTELLA, LATA, UNIDAD" },
                    precio_base_pack:  { type: "number", description: "Precio base por PAQUETE sin impuestos" },
                    descuento_pct:     { type: "number" },
                    iva_pct:           { type: "number" },
                    iva_valor_pack:    { type: "number", description: "IVA por PAQUETE (deducible)" },
                    ico_valor_pack:    { type: "number" },
                    icl_valor_pack:    { type: "number" },
                    adv_valor_pack:    { type: "number" },
                    precio_costo_pack: { type: "number", description: "base + ICO + ICL + ADV (sin IVA) por PAQUETE" },
                    precio_final_pack: { type: "number", description: "Precio final con todos los impuestos por PAQUETE" },
                    subtotal_renglon:  { type: "number", description: "VLR NETO FINAL del renglón" },
                    es_bonificacion:   { type: "boolean", description: "true si el item es regalo/obsequio (precio 0 o keyword GTS, gratis, regalo, obsequio)" },
                    requiere_revision: { type: "boolean", description: "true para combos ambiguos (ej: 'X12 GTS 3 X 375')" },
                    match_oc_idx:      { type: "integer", description: "Índice 0-based en la lista de OC esperados, o null" },
                  },
                },
              },
            },
          },
        }],
        tool_choice: { type: "tool", name: "extraer_factura" },
        messages: [{
          role: "user",
          content: [
            isPDF
              ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
              : { type: "image",    source: { type: "base64", media_type: mediaType || "image/jpeg", data: fileBase64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      // Devolver el mensaje real de Anthropic para diagnóstico
      const detail = data?.error?.message || JSON.stringify(data).slice(0, 500);
      return new Response(JSON.stringify({ ok: false, error: `Anthropic API: ${detail}`, status: res.status, raw: data }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const stopReason = data.stop_reason || "";

    // Con tool_use, la respuesta viene en content[].input del bloque tool_use
    const toolUseBlock = (data.content || []).find((c: any) => c.type === "tool_use");
    let parsed: any = toolUseBlock?.input || null;

    // Fallback: si por alguna razón vino como texto, intentamos parsearlo
    if (!parsed) {
      const textBlock = (data.content || []).find((c: any) => c.type === "text");
      const text = textBlock?.text || "";
      let cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!cleaned.startsWith("{")) {
        const i = cleaned.indexOf("{");
        if (i >= 0) cleaned = cleaned.slice(i);
      }
      try { parsed = JSON.parse(cleaned); } catch (_e) { /* ignore */ }
    }

    if (!parsed) {
      const reason = stopReason === "max_tokens"
        ? "El modelo se quedó sin tokens (factura muy larga). Procesa por páginas."
        : "El modelo no devolvió tool_use ni JSON parseable.";
      return new Response(JSON.stringify({
        ok: false,
        error: reason,
        stop_reason: stopReason,
        raw_content: (data.content || []).slice(0, 3),
        usage: data.usage || null,
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    parsed.ok = true;
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
