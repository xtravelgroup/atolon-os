/**
 * update-tasa-usd
 * ───────────────
 * Fetches the live USD→COP exchange rate and stores it in configuracion.
 * Called daily via pg_cron (see supabase/update-tasa-usd.sql).
 *
 * Can also be triggered manually:
 *   POST https://<project>.supabase.co/functions/v1/update-tasa-usd
 *   Authorization: Bearer <service_role_key>
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchLiveTasa(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const cop = data?.usd?.cop;
    return cop && cop > 1000 ? Math.round(cop) : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const tasa = await fetchLiveTasa();

  if (!tasa) {
    return new Response(JSON.stringify({ ok: false, error: "No se pudo obtener la tasa" }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  await supabase
    .from("configuracion")
    .update({ tasa_usd: tasa, tasa_usd_updated_at: new Date().toISOString() })
    .eq("id", "atolon");

  console.log(`[update-tasa-usd] Tasa actualizada: ${tasa} COP/USD`);

  return new Response(JSON.stringify({ ok: true, tasa_usd: tasa, updated_at: new Date().toISOString() }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
