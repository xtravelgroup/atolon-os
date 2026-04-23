// ac-open-pixel — Supabase Edge Function
// Pixel de tracking de apertura de emails (1x1 GIF transparente)
// GET /functions/v1/ac-open-pixel?q={queue_id}&c={cart_id}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// 1x1 transparent GIF
const PIXEL_GIF = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x01,0x00,0x00,0x00,
  0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3b,
]);

function nanoid(n = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const queueId  = url.searchParams.get("q") ?? "";
  const cartId   = url.searchParams.get("c") ?? "";

  // Siempre devolver el pixel (no bloquear si no hay IDs)
  const pixelResponse = new Response(PIXEL_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });

  if (!queueId || !cartId) return pixelResponse;

  // Registrar apertura de forma asíncrona (no bloqueamos la respuesta)
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "";
  const ua = req.headers.get("user-agent") ?? "";

  // Evitar doble registro en la misma sesión (basado en queue_id)
  const { count } = await supabase
    .from("ac_email_events")
    .select("id", { count: "exact" })
    .eq("queue_id", queueId)
    .eq("tipo", "opened");

  if ((count ?? 0) === 0) {
    // Obtener template_id del queue
    const { data: queue } = await supabase.from("ac_email_queue").select("template_id").eq("id", queueId).single();

    await supabase.from("ac_email_events").insert({
      id: `ace_${nanoid(16)}`,
      cart_id: cartId,
      queue_id: queueId,
      template_id: queue?.template_id ?? null,
      tipo: "opened",
      ip: ip.split(",")[0].trim(),
      user_agent: ua.slice(0, 500),
    });

    // Actualizar cart: marcar como abierto
    await supabase.from("ac_carts").update({
      email_abierto: true,
      updated_at: new Date().toISOString(),
    }).eq("id", cartId);
  }

  return pixelResponse;
});
