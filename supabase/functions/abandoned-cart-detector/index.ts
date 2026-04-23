// abandoned-cart-detector — Supabase Edge Function
// Detecta carritos abandonados y programa la secuencia de emails.
// Se ejecuta cada 15 minutos via pg_cron:
//   SELECT cron.schedule('ac-detector', '*/15 * * * *',
//     'SELECT net.http_post(url:=''https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/abandoned-cart-detector'',
//     headers:=''{\"Content-Type\":\"application/json\",\"Authorization\":\"Bearer {SERVICE_ROLE_KEY}\"}'',
//     body:=''{}''::jsonb)');

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Delays de los 4 emails (en horas)
const EMAIL_DELAYS: Record<string, number> = {
  email_1: 1,
  email_2: 6,
  email_3: 24,
  email_4: 48,
};

function nanoid(n = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

Deno.serve(async (req) => {
  // Solo aceptar POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Obtener configuración del flujo
  const { data: cfg } = await supabase.from("ac_flow_settings").select("*").eq("id", "default").single();
  if (!cfg?.activo) {
    return new Response(JSON.stringify({ ok: true, skipped: "module_inactive" }), { status: 200 });
  }

  const abandonDelay = cfg.abandono_delay_minutos ?? 60;
  const recoveryExpires = cfg.recovery_link_expires_horas ?? 72;
  const now = new Date();

  // 2. Buscar carritos en estado checkout_started que llevan más de {delay} minutos sin pagar
  //    y que no tengan email inválido
  const cutoffTime = new Date(now.getTime() - abandonDelay * 60 * 1000).toISOString();

  const { data: cartsToAbandon, error: cartErr } = await supabase
    .from("ac_carts")
    .select("*")
    .eq("estado", "checkout_started")
    .lt("checkout_started_at", cutoffTime)
    .eq("flow_pausado", false)
    .eq("unsubscribed", false)
    .limit(100);

  if (cartErr) {
    console.error("Error fetching carts:", cartErr);
    return new Response(JSON.stringify({ error: cartErr.message }), { status: 500 });
  }

  let processed = 0;
  let skipped = 0;

  for (const cart of (cartsToAbandon ?? [])) {
    // Verificar que no hay una reserva confirmada para este email en la misma fecha
    // (podría haber completado desde otro dispositivo)
    if (cart.fecha_visita) {
      const { data: existingBooking } = await supabase
        .from("reservas")
        .select("id, estado")
        .eq("email", cart.email)
        .eq("fecha", cart.fecha_visita)
        .in("estado", ["confirmado", "pagado", "checked_in"])
        .limit(1)
        .maybeSingle();

      if (existingBooking) {
        // Ya compró — marcar como recovered sin enviar emails
        await supabase.from("ac_carts").update({
          estado: "recovered",
          recovered_at: now.toISOString(),
          reserva_id: existingBooking.id,
          updated_at: now.toISOString(),
        }).eq("id", cart.id);
        skipped++;
        continue;
      }
    }

    // Generar recovery token único
    const recoveryToken = `rc_${nanoid(32)}`;
    const recoveryExpAt = new Date(now.getTime() + recoveryExpires * 60 * 60 * 1000).toISOString();

    // Actualizar cart a "abandoned"
    const { error: updateErr } = await supabase.from("ac_carts").update({
      estado: "abandoned",
      abandoned_at: now.toISOString(),
      recovery_token: recoveryToken,
      recovery_expires_at: recoveryExpAt,
      updated_at: now.toISOString(),
    }).eq("id", cart.id);

    if (updateErr) {
      console.error("Error updating cart:", cart.id, updateErr);
      continue;
    }

    // Verificar que este email no recibió emails en los últimos N días (anti-spam)
    const maxDays = cfg.max_emails_por_contacto_dias ?? 7;
    const spamCutoff = new Date(now.getTime() - maxDays * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentEmails } = await supabase
      .from("ac_email_events")
      .select("id", { count: "exact" })
      .eq("tipo", "sent")
      // buscar por email en ac_carts
      .in("cart_id",
        (await supabase.from("ac_carts").select("id").eq("email", cart.email).then(r => r.data?.map(c => c.id) ?? []))
      )
      .gte("created_at", spamCutoff);

    if ((recentEmails ?? 0) >= 4) {
      // Ya recibió suficientes emails recientemente
      await supabase.from("ac_carts").update({
        estado: "stopped",
        updated_at: now.toISOString(),
      }).eq("id", cart.id);
      skipped++;
      continue;
    }

    // Obtener templates activos
    const { data: templates } = await supabase
      .from("ac_email_templates")
      .select("id, delay_horas, activo")
      .eq("activo", true)
      .order("delay_horas");

    // Programar emails en la cola
    const abandonedAt = new Date(now);
    const queueItems = (templates ?? []).map(t => ({
      id: `acq_${nanoid(16)}`,
      cart_id: cart.id,
      template_id: t.id,
      scheduled_for: new Date(abandonedAt.getTime() + t.delay_horas * 60 * 60 * 1000).toISOString(),
      estado: "pending",
    }));

    if (queueItems.length > 0) {
      const { error: qErr } = await supabase.from("ac_email_queue").insert(queueItems);
      if (qErr) console.error("Error inserting queue:", cart.id, qErr);
    }

    processed++;
  }

  // 3. Expirar carritos con email_4 enviado hace más de 72h
  const expiryCutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  await supabase.from("ac_carts").update({
    estado: "expired",
    updated_at: now.toISOString(),
  }).eq("estado", "email_4_sent").lt("ultimo_email_at", expiryCutoff);

  return new Response(JSON.stringify({
    ok: true,
    processed,
    skipped,
    timestamp: now.toISOString(),
  }), {
    headers: { "Content-Type": "application/json" },
  });
});
