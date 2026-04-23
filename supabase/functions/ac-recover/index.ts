// ac-recover — Supabase Edge Function
// Maneja el recovery link del carrito abandonado.
// GET /functions/v1/ac-recover?r={token}&q={queue_id}
// Registra el intento de recovery y redirige al booking con datos pre-llenados.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BOOKING_URL   = "https://atolon.co/booking";
const FALLBACK_URL  = "https://atolon.co";

function nanoid(n = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

Deno.serve(async (req) => {
  const url     = new URL(req.url);
  const token   = url.searchParams.get("r") ?? "";
  const queueId = url.searchParams.get("q") ?? "";

  if (!token) {
    return new Response(null, { status: 302, headers: { "Location": FALLBACK_URL } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Buscar carrito por token
  const { data: cart, error } = await supabase
    .from("ac_carts")
    .select("*")
    .eq("recovery_token", token)
    .maybeSingle();

  if (error || !cart) {
    return new Response(null, { status: 302, headers: { "Location": FALLBACK_URL + "?ac_err=token_invalid" } });
  }

  // Verificar expiración del token
  if (cart.recovery_expires_at && new Date(cart.recovery_expires_at) < new Date()) {
    return new Response(null, { status: 302, headers: { "Location": BOOKING_URL + "?ac_err=expired" } });
  }

  // Verificar que no está ya recuperado/unsubscribed
  if (cart.estado === "recovered") {
    return new Response(null, { status: 302, headers: { "Location": BOOKING_URL + "?ac_msg=already_completed" } });
  }

  // Registrar evento de recovery click (solo una vez)
  if (queueId) {
    const { data: queue } = await supabase.from("ac_email_queue").select("template_id").eq("id", queueId).maybeSingle();
    await supabase.from("ac_email_events").insert({
      id: `ace_${nanoid(16)}`,
      cart_id: cart.id,
      queue_id: queueId,
      template_id: queue?.template_id ?? null,
      tipo: "clicked",
      url_clicked: "recovery_link",
      ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500),
    });

    // Marcar como clicked en el cart
    await supabase.from("ac_carts").update({
      email_clicked: true,
      email_abierto: true,
      updated_at: new Date().toISOString(),
    }).eq("id", cart.id);
  }

  // Construir URL de recovery con todos los datos del carrito pre-llenados
  const params = new URLSearchParams();
  params.set("r", token);   // El BookingPopup usará este token para pre-llenar
  if (cart.tipo_pase) params.set("tipo", cart.tipo_pase);
  if (cart.idioma)    params.set("lang", cart.idioma);

  const recoveryUrl = `${BOOKING_URL}?${params.toString()}`;

  return new Response(null, {
    status: 302,
    headers: { "Location": recoveryUrl },
  });
});
