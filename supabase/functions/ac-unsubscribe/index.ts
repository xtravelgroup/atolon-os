// ac-unsubscribe — Supabase Edge Function
// Procesa el unsubscribe desde el footer de los emails.
// GET /functions/v1/ac-unsubscribe?c={cart_id}&t={recovery_token}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function nanoid(n = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

Deno.serve(async (req) => {
  const url    = new URL(req.url);
  const cartId = url.searchParams.get("c") ?? "";
  const token  = url.searchParams.get("t") ?? "";   // recovery_token como validación

  if (!cartId || !token) {
    return htmlResponse("❌ Link inválido", "No pudimos procesar tu solicitud. El link no es válido.");
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Verificar que el cart_id y token coinciden (seguridad básica)
  const { data: cart } = await supabase
    .from("ac_carts")
    .select("id, email, estado, recovery_token")
    .eq("id", cartId)
    .eq("recovery_token", token)
    .maybeSingle();

  if (!cart) {
    return htmlResponse("❌ Solicitud inválida", "No encontramos tu solicitud. Puede que el link haya expirado.");
  }

  if (cart.unsubscribed || cart.estado === "unsubscribed") {
    return htmlResponse("✅ Ya estás dado de baja", `El email ${cart.email} ya no recibe emails de Atolón.`);
  }

  // Marcar como unsubscribed
  await supabase.from("ac_carts").update({
    unsubscribed: true,
    estado: "unsubscribed",
    flow_pausado: true,
    updated_at: new Date().toISOString(),
  }).eq("id", cartId);

  // Cancelar emails pendientes en la cola
  await supabase.from("ac_email_queue").update({
    estado: "cancelled",
  }).eq("cart_id", cartId).eq("estado", "pending");

  // Registrar evento
  await supabase.from("ac_email_events").insert({
    id: `ace_${nanoid(16)}`,
    cart_id: cartId,
    tipo: "unsubscribed",
  });

  return htmlResponse(
    "✅ Dado de baja exitosamente",
    `El email <strong>${cart.email}</strong> no recibirá más correos de Atolón Beach Club.<br><br>Si esto fue un error, puedes volver a reservar en <a href="https://atolon.co" style="color:#0D1B3E;">atolon.co</a>`
  );
});

function htmlResponse(title: string, message: string) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — Atolón Beach Club</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ed;font-family:'Helvetica Neue',Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
<div style="max-width:480px;margin:40px 20px;background:#ffffff;border-radius:20px;padding:48px 40px;text-align:center;box-shadow:0 8px 40px rgba(13,27,62,0.10);">
  <img src="https://atolon.co/atolon-peces.png" alt="Atolón" width="100" style="margin-bottom:28px;display:block;margin-left:auto;margin-right:auto;" />
  <h1 style="font-size:22px;font-weight:800;color:#0D1B3E;margin:0 0 16px;">${title}</h1>
  <p style="font-size:15px;color:#475569;line-height:1.6;margin:0;">${message}</p>
</div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
