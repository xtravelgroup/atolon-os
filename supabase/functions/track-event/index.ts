// track-event — Server-side event ingestion (adblocker-resistant)
// POST /functions/v1/track-event
// Body: { tipo, categoria, datos, sesion_id, usuario_id, url, ts }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { tipo, categoria, datos, sesion_id, usuario_id, url, ts } = body;

    if (!tipo || !sesion_id) {
      return new Response(JSON.stringify({ error: "tipo and sesion_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const id = crypto.randomUUID();

    // Compute idempotency key
    const raw     = `${sesion_id}:${tipo}:${JSON.stringify(datos || {})}`;
    const msgBuf  = new TextEncoder().encode(raw);
    const hashBuf = await crypto.subtle.digest("SHA-256", msgBuf);
    const idKey   = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

    const { error } = await supabase.from("track_eventos").upsert({
      id,
      sesion_id,
      usuario_id:       usuario_id || null,
      tipo,
      categoria:        categoria  || null,
      datos:            datos      || {},
      url:              url        || null,
      ts:               ts         || new Date().toISOString(),
      idempotency_key:  idKey,
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
