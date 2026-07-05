import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

// Timing-safe equality sobre buffers de igual length (hex strings).
// Devuelve false si las longitudes difieren.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Verifica firma Stripe respetando tolerancia de 300s.
async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const parts = Object.fromEntries(
      sigHeader.split(",").map((p) => p.split("=") as [string, string]),
    );
    const timestamp = parts["t"];
    const v1 = parts["v1"];
    if (!timestamp || !v1) return { ok: false, reason: "missing t/v1" };

    // Tolerancia 300s (estándar Stripe) — protege contra replay.
    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad timestamp" };
    if (Math.abs(Date.now() / 1000 - tsNum) > 300) return { ok: false, reason: "stale timestamp" };

    const payload = `${timestamp}.${rawBody}`;
    const keyData = new TextEncoder().encode(secret);
    const msgData = new TextEncoder().encode(payload);

    const key = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, msgData);
    const computed = new TextDecoder().decode(encode(new Uint8Array(sig)));

    return timingSafeEqualHex(computed, v1)
      ? { ok: true }
      : { ok: false, reason: "mismatch" };
  } catch (e) {
    return { ok: false, reason: `error: ${(e as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const allowUnsigned = Deno.env.get("STRIPE_ALLOW_UNSIGNED") === "true";

  // FAIL-CLOSED: sin secret configurado, rechazar todo en producción.
  if (!webhookSecret) {
    if (!allowUnsigned) {
      console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET no configurado — fail-closed por seguridad.");
      return new Response(
        JSON.stringify({ error: "webhook_misconfigured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    console.warn("[stripe-webhook] STRIPE_ALLOW_UNSIGNED=true — bypass solo para desarrollo.");
  } else {
    if (!sigHeader) {
      console.error("[stripe-webhook] Sin header stripe-signature.");
      return new Response("Unauthorized", { status: 401 });
    }
    const verdict = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
    if (!verdict.ok) {
      console.error(`[stripe-webhook] Firma inválida: ${verdict.reason}`);
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventId = (event.id as string) || "";
  const type = event.type as string;
  console.log(`Stripe event: ${type} (${eventId})`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Idempotencia: dedup por event.id antes de procesar ──
  if (eventId) {
    const { error: dedupErr } = await supabase
      .from("stripe_webhook_events")
      .insert({ event_id: eventId, event_type: type });
    if (dedupErr && dedupErr.code === "23505") {
      // Unique violation = ya procesado
      console.log(`[stripe-webhook] Evento ${eventId} ya procesado, skip.`);
      return new Response(JSON.stringify({ received: true, skipped: "duplicate" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = (event.data as Record<string, unknown>)
    ?.object as Record<string, unknown>;

  const meta = (session.metadata as Record<string, string>) || {};
  const reservaId = meta.reserva_id;
  const hotelEstanciaId = meta.hotel_estancia_id;
  if (!reservaId && !hotelEstanciaId) {
    console.error("No reserva_id ni hotel_estancia_id in metadata", meta);
    return new Response(JSON.stringify({ received: true, warning: "no target_id" }), {
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

  // ── Flujo HOTEL ESTANCIA (grupos) ────────────────────────────────────────
  if (hotelEstanciaId) {
    const { data: est, error: estErr } = await supabase
      .from("hotel_estancias")
      .select("id, total, deposito, estado, huesped_id, grupo_id")
      .eq("id", hotelEstanciaId)
      .single();
    if (estErr || !est) {
      console.error(`Estancia ${hotelEstanciaId} not found:`, estErr?.message);
      return new Response(JSON.stringify({ received: true, warning: "estancia_not_found" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    const totalUsdCents = Number(session.amount_total) || 0;
    const tasaUsd       = Number(meta.tasa_usd) || 4200;
    const cobradoCop    = Math.round((totalUsdCents / 100) * tasaUsd);
    const nuevoDeposito = Math.min(Number(est.total || 0), Number(est.deposito || 0) + cobradoCop);
    await supabase.from("hotel_estancias").update({
      pasarela_usada: "Stripe",
      pago_referencia: String(session.id),
      pagado_en: new Date().toISOString(),
      deposito: nuevoDeposito,
      updated_at: new Date().toISOString(),
    }).eq("id", est.id);
    console.log(`✓ Hotel estancia ${est.id} pagada (Stripe USD → COP ${cobradoCop})`);
    return new Response(JSON.stringify({ received: true, hotel_estancia_id: est.id, cobrado_cop: cobradoCop }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Fetch reservation ───────────────────────────────────────────────────
  const { data: reserva, error: fetchErr } = await supabase
    .from("reservas")
    .select("id, estado, total, lead_id, nombre, email, contacto")
    .eq("id", reservaId)
    .single();

  if (fetchErr || !reserva) {
    console.error(`Reserva ${reservaId} not found:`, fetchErr?.message);
    await supabase.from("historial_acciones").insert({
      accion: "stripe_webhook_reserva_no_encontrada",
      detalle: `Stripe pagó ${reservaId} pero la reserva no existe en DB`,
      metadata: { session_id: session.id, email: session.customer_details },
      created_at: new Date().toISOString(),
    }).catch(() => {});
    return new Response(
      JSON.stringify({ received: true, warning: `Reserva ${reservaId} not found` }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Validación de monto: lo cobrado debe coincidir con reserva.total ──
  // session.amount_total viene en centavos USD. Usamos la tasa que el
  // create-session guardó en metadata para reconstruir el COP esperado.
  const amountTotalUsdCents = Number(session.amount_total) || 0;
  const tasaUsd              = Number(meta.tasa_usd) || 0;
  const expectedDbTotalCop   = Number(meta.db_total_cop) || 0;
  const reservaTotal         = Number(reserva.total) || 0;
  const currency             = String(session.currency || "").toLowerCase();

  if (currency !== "usd") {
    console.error(`[stripe-webhook] Currency inesperada: ${currency}`);
    return new Response(JSON.stringify({ error: "currency_mismatch" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Si el create-session grabó db_total_cop en metadata, verificar que
  // sigue coincidiendo con reserva.total (detecta tampering entre crear-sesión y pago).
  if (expectedDbTotalCop > 0 && Math.abs(expectedDbTotalCop - reservaTotal) > 1) {
    console.error(
      `[stripe-webhook] db_total_cop en metadata (${expectedDbTotalCop}) no matchea reserva.total actual (${reservaTotal}).`,
    );
    await supabase.from("historial_acciones").insert({
      accion: "stripe_webhook_total_mismatch",
      detalle: `db_total_cop=${expectedDbTotalCop} vs reserva.total=${reservaTotal}`,
      metadata: { session_id: session.id, reserva_id: reservaId },
    }).catch(() => {});
    return new Response(JSON.stringify({ error: "total_mismatch" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Reconstruir el COP cobrado a partir de USD cents y tasa
  // Si la tasa no está en metadata (sesión vieja), se loguea pero no se bloquea.
  if (tasaUsd > 0 && amountTotalUsdCents > 0) {
    const cobradoCop = (amountTotalUsdCents / 100) * tasaUsd;
    // Tolerancia 2% por rounding de USD cents
    const tolerancia = reservaTotal * 0.02;
    if (cobradoCop + tolerancia < reservaTotal) {
      console.error(
        `[stripe-webhook] Monto cobrado (${cobradoCop.toFixed(0)} COP) < reserva.total (${reservaTotal} COP).`,
      );
      await supabase.from("historial_acciones").insert({
        accion: "stripe_webhook_undercharge",
        detalle: `Cobrado COP ${cobradoCop.toFixed(0)} vs total ${reservaTotal}`,
        metadata: { session_id: session.id, reserva_id: reservaId, tasa_usd: tasaUsd, amount_usd_cents: amountTotalUsdCents },
      }).catch(() => {});
      return new Response(JSON.stringify({ error: "undercharge" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn(`[stripe-webhook] Sesión ${session.id} sin tasa_usd o amount_total en metadata — se acepta por compatibilidad pero revisar.`);
  }

  // Skip if already confirmed (idempotencia adicional al event_id dedup)
  if (reserva.estado === "confirmado") {
    console.log(`Reserva ${reservaId} ya confirmada, skip`);
    return new Response(JSON.stringify({ received: true, skipped: "already_confirmed" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Confirm reservation ─────────────────────────────────────────────────
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

  // UPDATE condicional (estado='pendiente_pago') + .select() para detectar
  // si realmente cambiamos algo. Si entre el read de arriba y este UPDATE
  // otro proceso ya confirmo la reserva (race), el UPDATE no afecta filas y
  // NO debemos enviar email/lead-close/audit de nuevo. Sin este chequeo,
  // el TOCTOU disparaba un email duplicado en ese caso.
  const { data: updated, error: updateErr } = await supabase
    .from("reservas")
    .update({
      estado: "confirmado",
      forma_pago: "stripe",
      abono: reservaTotal,
      saldo: 0,
      referencia_pago: String(session.id || eventId),
      fecha_pago: hoy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservaId)
    .eq("estado", "pendiente_pago")
    .select("id");

  if (updateErr) {
    console.error("Error updating reserva:", updateErr.message);
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  if (!updated || updated.length === 0) {
    console.log(`[stripe-webhook] Reserva ${reservaId} ya no estaba en pendiente_pago, otro proceso la confirmo. Skip email/audit.`);
    return new Response(JSON.stringify({ received: true, skipped: "concurrent_confirm" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`✅ Reserva ${reservaId} confirmada via Stripe webhook`);

  // ── Close lead if exists ────────────────────────────────────────────────
  const leadId = reserva.lead_id;
  if (leadId) {
    await supabase
      .from("leads")
      .update({ stage: "Cerrado Ganado", ultimo_contacto: hoy })
      .eq("id", leadId)
      .catch(() => {});
    console.log(`✅ Lead ${leadId} cerrado`);
  }

  await supabase.from("historial_acciones").insert({
    accion: "pago_stripe_webhook",
    detalle: `Pago Stripe confirmado via webhook para reserva ${reservaId}`,
    metadata: {
      reserva_id: reservaId,
      stripe_session_id: session.id,
      stripe_event_id: eventId,
      nombre: reserva.nombre,
      total: reservaTotal,
      amount_usd_cents: amountTotalUsdCents,
    },
    created_at: new Date().toISOString(),
  }).catch(() => {});

  // ── Send confirmation email (fire-and-forget) ───────────────────────────
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
        },
      ).catch((e) => console.warn("send-confirmation failed:", e.message));
    }
  }

  return new Response(
    JSON.stringify({ received: true, confirmed: reservaId }),
    { headers: { "Content-Type": "application/json" } },
  );
});
