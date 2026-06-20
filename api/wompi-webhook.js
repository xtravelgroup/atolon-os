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
  const allowUnsigned = process.env.WOMPI_ALLOW_UNSIGNED === "true";

  const body = req.body;

  // ── FAIL-CLOSED: sin secret no procesar ────────────────────────────────
  if (!eventsSecret) {
    if (!allowUnsigned) {
      console.error("[wompi-webhook] WOMPI_EVENTS_SECRET no configurado — fail-closed");
      return res.status(500).json({ error: "webhook_misconfigured" });
    }
    console.warn("[wompi-webhook] WOMPI_ALLOW_UNSIGNED=true — bypass solo para dev");
  } else {
    // Si hay secret pero no signature, rechazar.
    if (!body?.signature?.checksum || !Array.isArray(body?.signature?.properties)) {
      console.error("[wompi-webhook] Sin firma en payload — rechazado");
      return res.status(401).json({ error: "missing_signature" });
    }
    try {
      const props = body.signature.properties;
      const tx = body?.data?.transaction || {};
      const propValues = props.map((p) => {
        const key = p.replace("transaction.", "");
        return tx[key] !== undefined ? String(tx[key]) : "";
      });
      const raw = propValues.join("") + body.timestamp + eventsSecret;
      const expected = crypto.createHash("sha256").update(raw).digest("hex");

      // Timing-safe compare (buffers de igual length)
      const expBuf = Buffer.from(expected, "hex");
      const gotBuf = Buffer.from(String(body.signature.checksum), "hex");
      const valid = expBuf.length === gotBuf.length && crypto.timingSafeEqual(expBuf, gotBuf);

      if (!valid) {
        console.error("[wompi-webhook] Firma inválida — rechazado");
        return res.status(401).json({ error: "invalid_signature" });
      }
    } catch (sigErr) {
      // No exponer sigErr.message al cliente — puede revelar detalles de la
      // implementación (longitud de buffers, nombres de campos esperados, etc).
      console.error("[wompi-webhook] Error validando firma:", sigErr.message);
      return res.status(400).json({ error: "signature_error" });
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
  const reservaTotal = Number(reserva.total) || 0;
  const currency = String(tx.currency || "").toUpperCase();

  // Validación de currency
  if (currency && currency !== "COP") {
    console.error(`[wompi-webhook] Currency inesperada: ${currency}`);
    return res.status(400).json({ error: "currency_mismatch", currency });
  }

  // Validación de undercharge: monto cobrado >= reserva.total - 1% tolerancia
  if (reservaTotal > 0 && totalCOP < reservaTotal - Math.max(100, reservaTotal * 0.01)) {
    console.error(`[wompi-webhook] Undercharge: cobrado=${totalCOP} vs total=${reservaTotal} (tx ${txId})`);
    return res.status(400).json({ error: "undercharge", totalCOP, reservaTotal });
  }

  // ── Confirmar reserva ───────────────────────────────────────────────────
  // PATCH condicional con estado=eq.pendiente_pago para evitar TOCTOU + no
  // pisar reservas ya confirmadas por otro canal (Supabase webhook).
  // abono = monto REAL cobrado, no reserva.total (importa cuando hay abonos parciales).
  const patchRes = await fetch(
    `${sbUrl}/rest/v1/reservas?id=eq.${encodeURIComponent(reference)}&estado=eq.pendiente_pago`,
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
        abono: totalCOP,
        saldo: Math.max(0, reservaTotal - totalCOP),
        forma_pago: "wompi",
        fecha_pago: new Date().toISOString().slice(0, 10),
        referencia_pago: txId,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (!patchRes.ok) {
    console.error("[wompi-webhook] Error actualizando reserva:", await patchRes.text());
    return res.status(500).json({ ok: false, reason: "db_error_patch" });
  }

  // ── Log Wompi-específico en historial_acciones ──────────────────────────
  // El cambio de estado/abono ya lo captura el trigger trg_reservas_audit_update.
  // Aquí registramos info propia del webhook que el trigger no tiene: tx_id,
  // medio de pago real (PSE/tarjeta) y referencia.
  const medio = tx.payment_method_type || tx.payment_method?.type || "wompi";
  const histRes = await fetch(`${sbUrl}/rest/v1/historial_acciones`, {
    method: "POST",
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: `LOG-WOMPI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      usuario_email: "wompi@webhook",
      modulo: "reservas",
      accion: "registrar_pago",
      tabla: "reservas",
      registro_id: reference,
      datos_antes: { estado: reserva.estado, abono: reserva.abono || 0 },
      datos_despues: { estado: "confirmado", forma_pago: "wompi", tx_id: txId, medio },
      notas: `✅ Pago Wompi aprobado · ${medio.toUpperCase()} · TX ${txId} · ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(totalCOP)}`,
    }),
  });
  if (!histRes.ok) {
    console.error("[wompi-webhook] Error escribiendo historial:", await histRes.text());
  }

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

  // ── Forward server-side a partners suscritos (Sky Agency, etc.) ──────────
  // No bloqueante: si falla, la confirmación de la reserva ya está hecha.
  try {
    await forwardToPartners({
      sbUrl, sbKey,
      reserva,
      reference,
      txId,
      totalCOP,
      clientIp:  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.headers["x-real-ip"] || null,
    });
  } catch (e) {
    console.warn("[wompi-webhook] forwardToPartners error:", e.message);
  }

  console.log(`[wompi-webhook] ✅ Reserva ${reference} confirmada | txId=${txId}`);
  return res.status(200).json({ ok: true, reference, txId, status: "confirmed" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner webhook forwarding (server-side conversions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reenvía el evento de conversión a cada partner activo suscrito a "purchase".
 * Firma con HMAC-SHA256 (header X-Atolon-Signature: t=<ts>,v1=<hex>).
 */
async function forwardToPartners({ sbUrl, sbKey, reserva, reference, txId, totalCOP, clientIp }) {
  // 1. Cargar partners activos suscritos al evento purchase
  const partnersRes = await fetch(
    `${sbUrl}/rest/v1/partner_webhooks?active=eq.true&events=cs.{purchase}&select=id,partner_name,webhook_url,secret`,
    { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
  );

  if (!partnersRes.ok) {
    console.warn("[partner-fwd] Error cargando partners:", await partnersRes.text());
    return;
  }

  const partners = await partnersRes.json();
  if (!partners?.length) return; // sin partners, no hay nada que hacer

  // 2. Cargar abandoned cart asociado a la reserva (UTMs + click_ids + landing)
  let attribution = {};
  let userAgent   = null;
  try {
    const cartRes = await fetch(
      `${sbUrl}/rest/v1/ac_carts?reserva_id=eq.${encodeURIComponent(reference)}&select=*&limit=1`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    );
    if (cartRes.ok) {
      const carts = await cartRes.json();
      const cart  = carts?.[0];
      if (cart) {
        attribution = {
          fbclid:       cart.fbclid       ?? null,
          gclid:        cart.gclid        ?? null,
          wbraid:       cart.wbraid       ?? null,
          gbraid:       cart.gbraid       ?? null,
          ttclid:       cart.ttclid       ?? null,
          msclkid:      cart.msclkid      ?? null,
          li_fat_id:    cart.li_fat_id    ?? null,
          utm_source:   cart.utm_source   ?? null,
          utm_medium:   cart.utm_medium   ?? null,
          utm_campaign: cart.utm_campaign ?? null,
          utm_content:  cart.utm_content  ?? null,
          utm_term:     cart.utm_term     ?? null,
          landing_url:  cart.landing_page ?? null,
        };
        userAgent = cart.user_agent ?? null;
      }
    }
  } catch (e) {
    console.warn("[partner-fwd] No se pudo cargar ac_cart:", e.message);
  }

  // 3. Construir payload (PII en SHA-256 listo para Meta CAPI / GA4 user_data)
  const sha256Hex = (s) => s ? crypto.createHash("sha256").update(String(s).toLowerCase().trim()).digest("hex") : null;
  const normalizePhone = (p) => p ? String(p).replace(/[^\d+]/g, "") : null;

  const slugFromTipo = (tipo) => {
    if (!tipo) return null;
    const t = String(tipo).toLowerCase();
    if (t.includes("vip"))         return "vip-pass";
    if (t.includes("exclusive"))   return "exclusive-pass";
    if (t.includes("experience"))  return "atolon-experience";
    if (t.includes("after"))       return "after-island";
    return null;
  };

  const payload = {
    event:       "purchase",
    version:     1,
    reserva_id:  reference,
    wompi_transaction_id: txId,
    status:      "APPROVED",
    pasadia:     slugFromTipo(reserva.tipo),
    value:       totalCOP,
    currency:    "COP",
    adults:      reserva.pax_a   ?? null,
    children:    reserva.pax_n   ?? null,
    fecha_visita: reserva.fecha  ?? null,
    client: {
      email_hash:      sha256Hex(reserva.email),
      phone_hash:      sha256Hex(normalizePhone(reserva.telefono)),
      first_name_hash: sha256Hex((reserva.nombre || "").split(" ")[0]),
      country:         "CO",
    },
    attribution: {
      ...attribution,
      client_ip:  clientIp,
      user_agent: userAgent,
    },
    ts: Date.now(),
  };

  const body = JSON.stringify(payload);
  const ts   = Math.floor(Date.now() / 1000);

  // 4. POST con HMAC-SHA256 a cada partner. Errores se loguean pero no blocan.
  await Promise.all(partners.map(async (partner) => {
    const deliveryId = `dlv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const signed     = `${ts}.${body}`;
    const signature  = crypto.createHmac("sha256", partner.secret).update(signed).digest("hex");

    const headers = {
      "Content-Type":         "application/json",
      "X-Atolon-Signature":   `t=${ts},v1=${signature}`,
      "X-Atolon-Event":       "purchase",
      "X-Atolon-Delivery":    deliveryId,
      "User-Agent":           "AtolonOS-Webhook/1.0",
    };

    const t0 = Date.now();
    let resStatus = 0;
    let resBody   = "";
    let errorMsg  = null;

    try {
      const r = await fetch(partner.webhook_url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      });
      resStatus = r.status;
      resBody   = await r.text().catch(() => "");
      if (!r.ok) errorMsg = `HTTP ${r.status}`;
    } catch (e) {
      errorMsg = e.message || "fetch_error";
    }

    const durationMs = Date.now() - t0;
    const isOk = resStatus >= 200 && resStatus < 300;

    // Log delivery
    fetch(`${sbUrl}/rest/v1/partner_webhook_log`, {
      method: "POST",
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        partner_id:      partner.id,
        delivery_id:     deliveryId,
        event:           "purchase",
        reserva_id:      reference,
        payload,
        request_headers: { "X-Atolon-Event": "purchase", "X-Atolon-Delivery": deliveryId },
        response_status: resStatus || null,
        response_body:   resBody?.slice(0, 2000) || null,
        duration_ms:     durationMs,
        attempt:         1,
        error:           errorMsg,
      }),
    }).catch(() => {});

    // Update counters/last_*
    fetch(`${sbUrl}/rest/v1/partner_webhooks?id=eq.${partner.id}`, {
      method: "PATCH",
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(
        isOk
          ? { last_success_at: new Date().toISOString(), total_sent: (partner.total_sent || 0) + 1 }
          : { last_error_at: new Date().toISOString(), last_error_msg: errorMsg?.slice(0, 500), total_failed: (partner.total_failed || 0) + 1 }
      ),
    }).catch(() => {});

    console.log(`[partner-fwd] ${partner.partner_name} → ${resStatus || "ERR"} (${durationMs}ms)${errorMsg ? " — " + errorMsg : ""}`);
  }));
}
