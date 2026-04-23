// scan-productos — endpoint público para el app /escanear-productos
// Permite leer el catálogo y actualizar ÚNICAMENTE el campo `codigo` de un ítem.
// No requiere auth del usuario; usa service role para bypass RLS.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^\/scan-productos/, "").replace(/\/+$/, "");

    // GET /scan-productos/items — lista catálogo (solo campos necesarios)
    if (req.method === "GET" && pathname === "/items") {
      const { data, error } = await sb.from("items_catalogo")
        .select("id, nombre, codigo, categoria, unidad")
        .eq("activo", true)
        .order("nombre");
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, items: data || [] });
    }

    // POST /scan-productos/save-code  body: { item_id, codigo }
    if (req.method === "POST" && pathname === "/save-code") {
      const body = await req.json().catch(() => ({}));
      if (!body.item_id || !body.codigo) return json({ ok: false, error: "item_id y codigo requeridos" }, 400);

      const { data, error } = await sb.from("items_catalogo")
        .update({ codigo: String(body.codigo).trim(), updated_at: new Date().toISOString() })
        .eq("id", body.item_id)
        .select("id, nombre, codigo")
        .single();
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true, item: data });
    }

    return json({ ok: false, error: "Ruta no encontrada", pathname }, 404);
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
