/**
 * Vercel API Route: Wompi Webhook Handler
 * URL: https://www.atolon.co/api/wompi-webhook
 *
 * Wompi envía un POST cada vez que una transacción cambia de estado.
 * Si el pago queda APPROVED → confirma la reserva automáticamente.
 *
 * Config en Wompi Dashboard:
 *   Desarrolladores → Webhooks → Agregar URL:
 *   https://www.atolon.co/api/wompi-webhook
 *
 * Env vars necesarios (Vercel):
 *   WOMPI_EVENTS_SECRET   — Secret del webhook en Wompi Dashboard
 *   SUPABASE_URL          — https://ncdyttgxuicyruathkxd.supabase.co
 *   SUPABASE_ANON_KEY     — anon key de Supabase
 *   SUPABASE_SERVICE_KEY  — service role key (para bypass RLS en confirmación)
 */

import crypto from "crypto";

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  // Preferir service key para writes, caer en anon si no está configurada
  const sbKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;

  const body = req.body;

  // ── Validar firma Wompi ──────────────────────────────────────────────────
  // Wompi firma: SHA256( propValues.join("") + timestamp + events_secret )
  // Campos firmados vienen en signature.properties
  if (eventsSecret && body?.signature?.checksum) {
    try {
      const props = body.signature.properties || [];
      const tx = body?.data?.transaction || {};

      // Resolver cada propiedad del path "transaction.xxx"
      const propValues = props.map((p) => {
        const key = p.replace("transaction.", "");
        return tx[key] !== undefined ? String(tx[key]) : "";
      });

      const raw = propValues.join("") + body.timestamp + eventsSecret;
      const expected = crypto.createHash("sha256").update(raw).digest("hex");

      if (expected !== body.signature.checksum) {
        console.warn("[wompi-webhook] ⚠️ Firma inválida — ignorando evento");
        // Responder 200 para que Wompi no reintente, pero no procesar
        return res.status(200).json({ ok: false, reason: "invalid_signature" });
      }
    } catch (sigErr) {
      console.error("[wompi-webhook] Error validando firma:", sigErr.message);
    }
  }

  // ── Solo procesar transacciones actualizadas ─────────────────────────────
  const event = body?.event;
  if (event !== "transaction.updated") {
    return res.status(200).json({ ok: true, skipped: true, event });
  }

  const tx = body?.data?.transaction;
  if (!tx) {
    return res.status(200).json({ ok: false, reason: "no_transaction" });
  }

  const { reference, status, amount_in_cents, id: txId } = tx;

  console.log(`[wompi-webhook] ${event} | ref=${reference} | status=${status} | txId=${txId}`);

  // Solo confirmar si APPROVED
  if (status !== "APPROVED") {
    return res.status(200).json({ ok: true, skipped: true, status });
  }

  if (!reference) {
    return res.status(200).json({ ok: false, reason: "no_reference" });
  }

  // ── Buscar reserva por reference ─────────────────────────────────────────
  const getRes = await fetch(
    `${sbUrl}/rest/v1/reservas?id=eq.${encodeURIComponent(reference)}&select=*`,
    {
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
      },
    }
  );

  if (!getRes.ok) {
    console.error("[wompi-webhook] Error buscando reserva:", await getRes.text());
    return res.status(500).json({ ok: false, reason: "db_error_get" });
  }

  const rows = await getRes.json();
  const reserva = rows?.[0];

  if (!reserva) {
    console.warn(`[wompi-webhook] Reserva no encontrada para ref=${reference}`);
    return res.status(200).json({ ok: false, reason: "reserva_not_found", reference });
  }

  // Si ya está confirmada, no hacer nada
  if (reserva.estado === "confirmado") {
    console.log(`[wompi-webhook] Reserva ${reference} ya estaba confirmada`);
    return res.status(200).json({ ok: true, skipped: true, reason: "already_confirmed" });
  }

  const totalCentavos = amount_in_cents || 0;
  const totalCOP = Math.round(totalCentavos / 100);

  // ── Confirmar reserva ────────────────────────────────────────────────────
  const patchRes = await fetch(
    `${sbUrl}/rest/v1/reservas?id=eq.${encodeURIComponent(reference)}`,
    {
      method: "PATCH",
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        estado: "confirmado",
        abono: reserva.total || totalCOP,
        saldo: 0,
        forma_pago: "wompi",
        fecha_pago: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!patchRes.ok) {
    console.error("[wompi-webhook] Error actualizando reserva:", await patchRes.text());
    return res.status(500).json({ ok: false, reason: "db_error_patch" });
  }

  // ── Log en historial ─────────────────────────────────────────────────────
  await fetch(`${sbUrl}/rest/v1/reservas_historial`, {
    method: "POST",
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: `H-WOMPI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reserva_id: reference,
      accion: "pago_registrado",
      descripcion: `✅ Pago Wompi confirmado automáticamente · Transacción ${txId} · ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(totalCOP)} · Wompi webhook`,
      valor_anterior: { estado: reserva.estado },
      valor_nuevo: { estado: "confirmado", forma_pago: "wompi", tx_id: txId },
      usuario: "wompi_webhook",
    }),
  }).catch(() => {});

  // ── Enviar email de confirmación ─────────────────────────────────────────
  if (reserva.contacto?.includes("@") || reserva.email?.includes("@")) {
    const emailPayload = { ...reserva, estado: "confirmado", forma_pago: "wompi" };
    fetch(`${sbUrl}/functions/v1/send-confirmation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sbKey}`,
      },
      body: JSON.stringify(emailPayload),
    }).catch((e) => console.warn("[wompi-webhook] send-confirmation error:", e.message));
  }

  console.log(`[wompi-webhook] ✅ Reserva ${reference} confirmada | txId=${txId}`);
  return res.status(200).json({ ok: true, reference, txId, status: "confirmed" });
}
