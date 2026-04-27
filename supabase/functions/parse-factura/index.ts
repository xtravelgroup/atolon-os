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

CONTEXTO EMPAQUES (CRÍTICO):
- En este sistema el inventario se cuenta SIEMPRE en UNIDADES INDIVIDUALES
- Los proveedores facturan por empaque. Ejemplos:
  · "CERVEZA CORONA 6PACK 330ML" → unidades_por_paquete = 6 (1 sixpack = 6 cervezas)
  · "CERVEZA STELLA SIXPACK"     → unidades_por_paquete = 6
  · "VINO X 12U"                  → unidades_por_paquete = 12
  · "BANDEJA X 12 UND"            → unidades_por_paquete = 12
  · "BOTELLA 750ML" (sin pack)    → unidades_por_paquete = 1
  · "RON ZACAPA 700ML"            → unidades_por_paquete = 1
- Detecta el factor del NOMBRE del producto. Patrones:
  · "6PACK", "SIXPACK", "6PK"     → 6
  · "X 12", "X12U", "X 12 UND"    → 12
  · "X 24", "X24"                 → 24
  · Sin patrón claro              → 1 (botella/unidad suelta)
- "750ML", "330CC", "207ML" son TAMAÑOS, no factor de empaque (mantener factor=1 si no hay pack)

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
