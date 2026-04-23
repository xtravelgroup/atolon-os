import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

// ─── Stripe signature verification ───────────────────────────────────────────
async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = Object.fromEntries(
      sigHeader.split(",").map((p) => p.split("=") as [string, string])
    );
    const timestamp = parts["t"];
    const v1 = parts["v1"];
    if (!timestamp || !v1) return false;

    const payload = `${timestamp}.${rawBody}`;
    const keyData = new TextEncoder().encode(secret);
    const msgData = new TextEncoder().encode(payload);

    const key = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, msgData);
    const computed = new TextDecoder().decode(encode(new Uint8Array(sig)));

    return computed === v1;
  } catch {
    return false;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

  // Verify signature (skip only if secret not yet configured — for initial test)
  if (webhookSecret) {
    const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
    if (!valid) {
      console.error("Invalid Stripe signature");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const type = event.type as string;
  console.log(`Stripe event: ${type}`);

  // Only handle checkout.session.completed
  if (type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = (event.data as Record<string, unknown>)
    ?.object as Record<string, unknown>;

  const reservaId = (session.metadata as Record<string, string>)?.reserva_id;
  if (!reservaId) {
    console.error("No reserva_id in metadata", session.metadata);
    return new Response(JSON.stringify({ received: true, warning: "no reserva_id" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const paymentStatus = session.payment_status as string;
  if (paymentStatus !== "paid") {
    console.log(`Session not paid (${paymentStatus}), skipping`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Fetch reservation ───────────────────────────────────────────────────────
  const { data: reserva, error: fetchErr } = await supabase
    .from("reservas")
    .select("id, estado, total, lead_id, nombre, email, contacto")
    .eq("id", reservaId)
    .single();

  if (fetchErr || !reserva) {
    console.error(`Reserva ${reservaId} not found:`, fetchErr?.message);
    // Log to historial so the team can see missed payments
    await supabase.from("historial_acciones").insert({
      accion: "stripe_webhook_reserva_no_encontrada",
      detalle: `Stripe pagó ${reservaId} pero la reserva no existe en DB`,
      metadata: { session_id: session.id, email: session.customer_details },
      created_at: new Date().toISOString(),
    }).catch(() => {});
    return new Response(
      JSON.stringify({ received: true, warning: `Reserva ${reservaId} not found` }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // Skip if already confirmed (idempotency — webhook may fire more than once)
  if (reserva.estado === "confirmado") {
    console.log(`Reserva ${reservaId} already confirmed, skipping`);
    return new Response(JSON.stringify({ received: true, skipped: "already_confirmed" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Confirm reservation ─────────────────────────────────────────────────────
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

  const { error: updateErr } = await supabase
    .from("reservas")
    .update({
      estado: "confirmado",
      forma_pago: "stripe",
      abono: reserva.total,
      saldo: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservaId);

  if (updateErr) {
    console.error("Error updating reserva:", updateErr.message);
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`✅ Reserva ${reservaId} confirmada via webhook`);

  // ── Close lead if exists ────────────────────────────────────────────────────
  const leadId = reserva.lead_id;
  if (leadId) {
    await supabase
      .from("leads")
      .update({ stage: "Cerrado Ganado", ultimo_contacto: hoy })
      .eq("id", leadId)
      .catch(() => {});
    console.log(`✅ Lead ${leadId} cerrado`);
  }

  // ── Log to historial ────────────────────────────────────────────────────────
  await supabase.from("historial_acciones").insert({
    accion: "pago_stripe_webhook",
    detalle: `Pago Stripe confirmado via webhook para reserva ${reservaId}`,
    metadata: {
      reserva_id: reservaId,
      stripe_session_id: session.id,
      nombre: reserva.nombre,
      total: reserva.total,
    },
    created_at: new Date().toISOString(),
  }).catch(() => {});

  // ── Send confirmation email (fire-and-forget) ───────────────────────────────
  const emailDest = reserva.email || (
    typeof reserva.contacto === "string" && reserva.contacto.includes("@")
      ? reserva.contacto : null
  );
  if (emailDest) {
    const { data: fullReserva } = await supabase
      .from("reservas")
      .select("*")
      .eq("id", reservaId)
      .single();

    if (fullReserva) {
      fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-confirmation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify(fullReserva),
        }
      ).catch((e) => console.warn("send-confirmation failed:", e.message));
    }
  }

  return new Response(
    JSON.stringify({ received: true, confirmed: reservaId }),
    { headers: { "Content-Type": "application/json" } }
  );
});
