// barcode-search — busca códigos EAN-13 por nombre de producto en múltiples fuentes:
//   - Open Food Facts (API pública, global)
//   - Éxito Colombia (búsqueda HTML pública)
//   - Jumbo Colombia (si responde)
//
// GET /barcode-search?q=ron+medellin&limit=10
//
// Devuelve: { ok, results: [{ source, name, brand, size, barcode, image, url }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

// ── Open Food Facts ─────────────────────────────────────────────────────────
async function searchOpenFoodFacts(q: string, limit: number) {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${limit}`;
    const res = await fetch(url, { headers: { "User-Agent": "AtolonOS-Inventory/1.0" } });
    if (!res.ok) return [];
    const data = await res.json();
    const products = data.products || [];
    return products
      .filter((p: any) => p.code && p.code.length >= 8)
      .map((p: any) => ({
        source: "Open Food Facts",
        name: p.product_name || p.product_name_es || p.generic_name || "—",
        brand: (p.brands || "").split(",")[0].trim(),
        size: p.quantity || p.packaging || "",
        barcode: p.code,
        image: p.image_small_url || p.image_url || null,
        url: `https://world.openfoodfacts.org/product/${p.code}`,
      }));
  } catch (e) {
    console.warn("OFF error:", e);
    return [];
  }
}

// ── VTEX catalog search (Éxito, Jumbo, Carulla usan la misma API) ──────────
async function searchVTEX(baseUrl: string, sourceName: string, q: string, limit: number) {
  try {
    const url = `${baseUrl}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(q)}&_from=0&_to=${limit - 1}`;
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const out: any[] = [];
    for (const p of data) {
      const items = p.items || [];
      for (const it of items) {
        if (!it.ean || String(it.ean).length < 8) continue;
        out.push({
          source: sourceName,
          name: p.productName || it.name || "—",
          brand: p.brand || "",
          size: it.measurementUnit || "",
          barcode: String(it.ean),
          image: it.images?.[0]?.imageUrl || null,
          url: p.linkText ? `${baseUrl}/${p.linkText}/p` : null,
        });
      }
    }
    return out.slice(0, limit);
  } catch (e) {
    console.warn(sourceName, "error:", e);
    return [];
  }
}

const searchExito  = (q: string, lim: number) => searchVTEX("https://www.exito.com",       "Éxito",  q, lim);
const searchJumbo  = (q: string, lim: number) => searchVTEX("https://www.tiendasjumbo.co", "Jumbo",  q, lim);
const searchCarulla = (q: string, lim: number) => searchVTEX("https://www.carulla.com",    "Carulla", q, lim);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || "";
    const limit = Math.min(20, Number(url.searchParams.get("limit")) || 10);
    if (q.trim().length < 2) return json({ ok: false, error: "q requerido (min 2 chars)" }, 400);

    // Consultar las 4 fuentes en paralelo
    const [off, exito, jumbo, carulla] = await Promise.all([
      searchOpenFoodFacts(q, limit),
      searchExito(q, limit),
      searchJumbo(q, limit),
      searchCarulla(q, limit),
    ]);

    // Dedupe por barcode manteniendo el primer source encontrado (prioridad: Éxito > Carulla > Jumbo > OFF)
    const seen = new Set<string>();
    const combined = [...exito, ...carulla, ...jumbo, ...off]
      .filter(r => r.barcode && !seen.has(r.barcode) && (seen.add(r.barcode) || true));

    return json({
      ok: true,
      query: q,
      total: combined.length,
      por_fuente: { "Open Food Facts": off.length, "Éxito": exito.length, "Jumbo": jumbo.length, "Carulla": carulla.length },
      results: combined,
    });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
