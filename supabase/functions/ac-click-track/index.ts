// ac-click-track — Supabase Edge Function
// Registra clicks en links del email y redirige al destino.
// GET /functions/v1/ac-click-track?q={queue_id}&c={cart_id}&u={encoded_url}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FALLBACK_URL = "https://atolon.co";

function nanoid(n = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const queueId    = url.searchParams.get("q") ?? "";
  const cartId     = url.searchParams.get("c") ?? "";
  const targetUrl  = url.searchParams.get("u") ? decodeURIComponent(url.searchParams.get("u")!) : FALLBACK_URL;
  const ip         = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ua         = req.headers.get("user-agent") ?? "";

  if (cartId && queueId) {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Obtener template_id
    const { data: queue } = await supabase.from("ac_email_queue").select("template_id").eq("id", queueId).maybeSingle();

    // Registrar evento click
    await supabase.from("ac_email_events").insert({
      id: `ace_${nanoid(16)}`,
      cart_id: cartId,
      queue_id: queueId,
      template_id: queue?.template_id ?? null,
      tipo: "clicked",
      url_clicked: targetUrl.slice(0, 2000),
      ip: ip.slice(0, 100),
      user_agent: ua.slice(0, 500),
    });

    // Actualizar cart
    await supabase.from("ac_carts").update({
      email_clicked: true,
      email_abierto: true,
      updated_at: new Date().toISOString(),
    }).eq("id", cartId);
  }

  // Redirigir al destino
  return new Response(null, {
    status: 302,
    headers: { "Location": targetUrl },
  });
});
