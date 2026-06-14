// zoho-payments (Atolon OS)
// Webhook: recibe eventos de Zoho Pay y actualiza reservas / pedidos automáticamente
// cuando se aprueba o rechaza el pago.
//
// Variables de entorno necesarias:
//   ZOHO_WEBHOOK_SECRET — signing key del webhook (hmac-sha256)
//   SUPABASE_URL        — auto
//   SUPABASE_SERVICE_ROLE_KEY — auto

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Lee de env vars; loadWebhookSecret() abajo agrega la opción de leer de BD
const ZOHO_WEBHOOK_SECRET_ENV = Deno.env.get("ZOHO_WEBHOOK_SECRET") || Deno.env.get("ZOHO_SIGNING_KEY") || "";

// Carga el webhook secret priorizando la BD para que el usuario pueda
// rotarlo desde la UI sin tocar Supabase secrets.
async function loadWebhookSecret(): Promise<string> {
  try {
    const SB = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await SB
      .from("configuracion")
      .select("zoho_pay_webhook_secret")
      .eq("id", "atolon")
      .single();
    if (data?.zoho_pay_webhook_secret) return data.zoho_pay_webhook_secret;
  } catch { /* fallback to env */ }
  return ZOHO_WEBHOOK_SECRET_ENV;
}

// ── Lee credenciales: primero env vars, luego DB (configuracion) ─────────
// Esto permite que el usuario configure desde la UI sin tener acceso a
// supabase secrets. Se re-lee en cada request para reflejar cambios.
type ZohoCreds = {
  api_key: string;
  client_id: string;
  client_secret: string;
  refresh_token: string;
  account_id: string;
};

async function loadZohoCreds(): Promise<ZohoCreds> {
  // 1) Leer de la tabla `configuracion` PRIMERO — los cambios del UI siempre ganan
  const dbCreds: Partial<ZohoCreds> = {};
  try {
    const SB = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await SB
      .from("configuracion")
      .select("zoho_pay_api_key, zoho_pay_client_id, zoho_pay_client_secret, zoho_pay_refresh_token, zoho_pay_account_id")
      .eq("id", "atolon")
      .single();
    if (data) {
      dbCreds.api_key       = data.zoho_pay_api_key       || "";
      dbCreds.client_id     = data.zoho_pay_client_id     || "";
      dbCreds.client_secret = data.zoho_pay_client_secret || "";
      dbCreds.refresh_token = data.zoho_pay_refresh_token || "";
      dbCreds.account_id    = data.zoho_pay_account_id    || "";
    }
  } catch (err) {
    console.warn("loadZohoCreds: no se pudo leer configuracion table:", err);
  }

  // 2) Env vars como fallback cuando el campo de DB esté vacío
  return {
    api_key:       dbCreds.api_key       || Deno.env.get("ZOHO_API_KEY")       || "",
    client_id:     dbCreds.client_id     || Deno.env.get("ZOHO_CLIENT_ID")     || "",
    client_secret: dbCreds.client_secret || Deno.env.get("ZOHO_CLIENT_SECRET") || "",
    refresh_token: dbCreds.refresh_token || Deno.env.get("ZOHO_REFRESH_TOKEN") || "",
    account_id:    dbCreds.account_id    || Deno.env.get("ZOHO_ACCOUNT_ID")    || "874101637",
  };
}

// ── Obtener token (API Key directa o OAuth como fallback) ──────────────
async function getZohoAuthHeader(creds: ZohoCreds): Promise<string> {
  if (creds.api_key) {
    // Método 1 — API Key directa (preferido)
    return "ZPapikey " + creds.api_key;
  }
  if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
    throw new Error("Zoho no configurado: falta API_KEY o (CLIENT_ID + CLIENT_SECRET + REFRESH_TOKEN). Genera un API Key en https://payments.zoho.com → API Keys y guárdalo como ZOHO_API_KEY (en supabase secrets) o como zoho_pay_api_key en la tabla configuracion.");
  }
  // Método 2 — OAuth refresh token (fallback)
  // Scope necesario al generar el refresh_token: ZohoPay.payments.CREATE,ZohoPay.account.READ
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: creds.refresh_token,
      client_id:     creds.client_id,
      client_secret: creds.client_secret,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("No access_token: " + JSON.stringify(data));
  return "Zoho-oauthtoken " + data.access_token;
}

// ── Crear Payment Session en Zoho (para widget embebido) ────────────────
// Endpoint: POST /api/v1/paymentsessions?account_id=XXX
// Auth: Zoho-oauthtoken (NO ZPapikey — esa key es para el widget en frontend)
// Returns: { payments_session: { payments_session_id, ... } }
async function createZohoPaymentSession(authHeader: string, accountId: string, body: {
  amount: number;
  currency: string;
  description: string;
  invoice_number?: string;
  reference?: string;
}) {
  const payload: Record<string, unknown> = {
    amount:      Number(Number(body.amount).toFixed(2)),
    currency:    body.currency || "USD",
    description: (body.description || "Atolon").slice(0, 500),
    // expires_in lo dejamos por default (Zoho rechazaba 3600). Default es 30 min.
  };
  if (body.invoice_number) payload.invoice_number = body.invoice_number;
  if (body.reference)      payload.reference_number = body.reference;

  const res = await fetch(
    `https://payments.zoho.com/api/v1/paymentsessions?account_id=${accountId}`,
    {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  const data = await res.json();
  if (!data.payments_session?.payments_session_id) {
    let hint = "";
    const msg = JSON.stringify(data);
    if (/invalid scope|not.*authorized/i.test(msg)) {
      hint = " · Necesitas un OAuth refresh_token con scope ZohoPay.payments.CREATE,ZohoPay.account.READ. Genera uno en api-console.zoho.com (Self-Client app) y guárdalo como ZOHO_REFRESH_TOKEN secret en Supabase (junto con ZOHO_CLIENT_ID y ZOHO_CLIENT_SECRET).";
    }
    throw new Error("Error creando payment session: " + msg + hint);
  }
  return data.payments_session;
}

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-zoho-signature",
};

// ── Verificar firma HMAC-SHA256 del webhook ──────────────────────────────
async function verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
  const SECRET = await loadWebhookSecret();
  if (!signature || !SECRET) return false;
  try {
    // Formato Zoho: "t=TIMESTAMP,v=HMAC_HEX" (stripe-style)
    let tsPart = "";
    let sigPart = signature.toLowerCase();
    const m = signature.match(/t=([^,]+),\s*v=([a-f0-9]+)/i);
    if (m) {
      tsPart = m[1];
      sigPart = m[2].toLowerCase();
    }
    const message = tsPart ? `${tsPart}.${payload}` : payload;
    const msgBytes = new TextEncoder().encode(message);
    const msgBytesNoTs = new TextEncoder().encode(payload);

    // Probamos varios formatos de secret porque Zoho no documenta claramente
    // si entrega el signing key como string raw o como hex.
    const secretRaw = new TextEncoder().encode(SECRET);
    const isHex = /^[0-9a-fA-F]+$/.test(SECRET) && SECRET.length % 2 === 0;
    const secretHex = isHex
      ? new Uint8Array(SECRET.match(/.{2}/g)!.map(h => parseInt(h, 16)))
      : null;

    const candidates: Array<[string, Uint8Array, Uint8Array]> = [
      ["raw+ts.payload",   secretRaw, msgBytes],
      ["raw+payload",      secretRaw, msgBytesNoTs],
    ];
    if (secretHex) {
      candidates.push(["hex+ts.payload", secretHex, msgBytes]);
      candidates.push(["hex+payload",    secretHex, msgBytesNoTs]);
    }

    // Timing-safe compare sobre hex strings de igual length.
    const timingSafeEqualHex = (a: string, b: string) => {
      if (a.length !== b.length) return false;
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return diff === 0;
    };

    for (const [label, key, msg] of candidates) {
      const cryptoKey = await crypto.subtle.importKey(
        "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msg);
      const computed = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
      if (timingSafeEqualHex(computed, sigPart)) {
        console.log(`[zoho-webhook] firma valida con formato: ${label}`);
        return true;
      }
    }
    // Si nada matchea, log de debug para identificar el formato correcto
    const previewSecret = SECRET.length > 12
      ? SECRET.slice(0, 6) + "..." + SECRET.slice(-4)
      : "***";
    console.warn(`[zoho-webhook] firma INVÁLIDA. expected=${sigPart.slice(0, 16)}... ts=${tsPart} secret_preview=${previewSecret} secret_len=${SECRET.length} is_hex=${isHex} payload_len=${payload.length}`);
    return false;
  } catch (err) {
    console.error("verifyWebhookSignature error:", err);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/zoho-payments/, "");

  // ══════════════════════════════════════════════════════════════════════
  // POST /create-session — crea Payment Session para el widget embebido de Zoho.
  // El frontend usa el `payments_session_id` retornado + la widget API key
  // para abrir el checkout con `instance.requestPaymentMethod()`.
  // ══════════════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "/create-session") {
    try {
      const body = await req.json();
      const { amount, currency, reference, description, nombre, email, context, context_id } = body;
      if (!amount) {
        return new Response(JSON.stringify({ error: "amount es requerido" }), {
          status: 400, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const creds = await loadZohoCreds();
      // Para crear sessions necesitamos OAuth (no la widget api_key — esa solo
      // sirve para el frontend con `new ZPayments({ otherOptions: {api_key} })`).
      if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
        return new Response(JSON.stringify({
          error: "Zoho OAuth no configurado. Necesitas ZOHO_CLIENT_ID + ZOHO_CLIENT_SECRET + ZOHO_REFRESH_TOKEN (con scope ZohoPay.payments.CREATE,ZohoPay.account.READ) como secrets en Supabase. Genera el refresh_token en https://api-console.zoho.com → Self-Client app."
        }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      // Forzar OAuth (no api_key) para la creación de sessions
      const authHeader = await getZohoAuthHeader({ ...creds, api_key: "" });
      const finalDescription = description || `Atolon Beach Club${nombre ? " - " + nombre : ""}`;
      const session = await createZohoPaymentSession(authHeader, creds.account_id, {
        amount: Number(amount),
        currency: currency || "USD",
        description: finalDescription,
        invoice_number: reference,
        reference,
      });

      // Guardar sesión en tracking — crítico para que el poll-recent y el
      // webhook puedan matchear el pago con la reserva original.
      if (reference) {
        const SB = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { error: sessErr } = await SB.from("pagos_zoho_sessions").insert({
          payment_link_id: session.payments_session_id,
          reference,
          amount: Number(amount),
          currency: currency || "USD",
          context: context || null,
          context_id: context_id || null,
          status: "pendiente",
        });
        if (sessErr) {
          console.error("[create-session] No se pudo guardar pagos_zoho_sessions:", sessErr.message, "reference:", reference);
        }
      }

      // Retornar config completa para el widget — el frontend la usa para
      // inicializar `new ZPayments({ account_id, domain, otherOptions: { api_key } })`
      // y luego llamar `instance.requestPaymentMethod({ payments_session_id, ... })`.
      return new Response(JSON.stringify({
        payments_session_id: session.payments_session_id,
        amount:              session.amount,
        currency:            session.currency,
        expiry_time:         session.expiry_time,
        // Config del widget para el frontend
        widget: {
          account_id: creds.account_id,
          api_key:    creds.api_key || "", // widget key (frontend)
          domain:     "US", // Atolón está en account US
        },
      }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("create-session error:", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // GET /webhook — Zoho hace un GET ping cuando registras el webhook
  // para verificar que la URL responde 200. Si responde 404/500 marca
  // el webhook como "failed" y eventualmente lo desactiva.
  // ══════════════════════════════════════════════════════════════════════
  if (req.method === "GET" && path === "/webhook") {
    return new Response(JSON.stringify({
      ok: true,
      service: "atolon-zoho-webhook",
      message: "Endpoint vivo. Manda POST con eventos de Zoho Pay.",
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // POST /webhook — recibe eventos de Zoho Pay
  // ══════════════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "/webhook") {
    try {
      const payload = await req.text();
      // Zoho puede mandar la firma en distintos headers según la versión
      const signature =
        req.headers.get("x-zoho-signature") ||
        req.headers.get("x-zoho-webhook-signature") ||
        req.headers.get("zoho-signature") ||
        req.headers.get("zoho-webhook-signature") ||
        req.headers.get("x-signature") ||
        "";
      // Log all headers for debugging
      const allHeaders: Record<string, string> = {};
      req.headers.forEach((v, k) => { allHeaders[k] = v; });

      // Parse event ANTES de validar firma (para loguear siempre)
      let event: Record<string, unknown> = {};
      try { event = JSON.parse(payload); } catch { event = { _raw: payload.slice(0, 500) }; }
      const type = (event.event_type || event.type || "") as string;
      const payment = (event as any).event_object?.payment || (event as any).data?.payment || (event as any).payment || (event as any).data || {};
      // Extraer referencia: primero del campo reference_number, luego parseando "· Ref: XXX" de la description
      let ref = payment.reference_number || payment.reference || "";
      if (!ref && payment.description) {
        const match = String(payment.description).match(/·\s*Ref:\s*([\w-]+)/i);
        if (match) ref = match[1];
      }
      const pid = payment.payment_id || payment.id || "";
      const amount = payment.amount || 0;
      const last4 = payment.payment_method?.card?.last_four_digits || payment.card?.last4 || null;
      const brand = payment.payment_method?.card?.brand || payment.card?.brand || null;

      const SB = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Guardar evento en log SIEMPRE (antes de validar firma, para debugging).
      // Capturamos el id de la fila para hacer updates scoped a esta entrada
      // (impide que un evento valido posterior flipee firma_valida=true en
      // intentos forjados previos con mismo payment_id).
      const { data: logRow } = await SB.from("pagos_zoho_log").insert({
        event_type: type,
        reference: ref,
        payment_id: pid,
        raw: { event, _debug_headers: allHeaders, _debug_sig: signature },
        firma_valida: false,
      }).select("id").maybeSingle();
      const logRowId = logRow?.id;

      // FAIL-CLOSED: firma obligatoria. Sin secret configurado o signature
      // ausente, rechazamos con 401. Bypass solo con ZOHO_ALLOW_UNSIGNED=true.
      const SECRET_FOR_VERIFY = await loadWebhookSecret();
      const allowUnsigned = Deno.env.get("ZOHO_ALLOW_UNSIGNED") === "true";

      if (!SECRET_FOR_VERIFY) {
        if (!allowUnsigned) {
          console.error("[zoho-webhook] webhook secret no configurado — fail-closed");
          return new Response(JSON.stringify({ error: "webhook_misconfigured" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
        console.warn("[zoho-webhook] ZOHO_ALLOW_UNSIGNED=true — solo dev");
      } else {
        if (!signature) {
          console.error("[zoho-webhook] sin header de firma — rechazado");
          return new Response(JSON.stringify({ error: "missing_signature" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        const valid = await verifyWebhookSignature(payload, signature);
        if (!valid) {
          console.error("Firma invalida. sig:", signature.slice(0, 20), "secret len:", SECRET_FOR_VERIFY.length);
          return new Response(JSON.stringify({ error: "invalid_signature" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        if (logRowId) {
          await SB.from("pagos_zoho_log").update({ firma_valida: true }).eq("id", logRowId).then(() => {}).catch(() => {});
        }
      }

      // Idempotencia: si este payment_id ya fue procesado antes (processed_at
      // NOT NULL), devolver 200 sin reprocesar. Evita duplicar emails/WhatsApp
      // y reescribir fecha_pago/pagado_en con timestamps tardios.
      if (pid) {
        const { data: prevProc } = await SB.from("pagos_zoho_log")
          .select("id")
          .eq("payment_id", pid)
          .not("processed_at", "is", null)
          .limit(1)
          .maybeSingle();
        if (prevProc) {
          console.log(`[zoho-webhook] payment_id ${pid} ya procesado, skip.`);
          return new Response(JSON.stringify({ received: true, skipped: "already_processed" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
      }

      // Pago exitoso — Zoho usa varios nombres de evento según versión
      // del API. También aceptamos cualquier evento que tenga
      // payment.status === "succeeded" / "captured" como fallback.
      const isSuccess =
        type === "payment.success" ||
        type === "payment.succeeded" ||
        type === "payment_success" ||
        type === "payment.captured" ||
        type === "paymentsession.captured" ||
        type === "payment_captured" ||
        payment.status === "succeeded" ||
        payment.status === "captured" ||
        payment.status === "success";
      if (isSuccess) {
        // 1aa) Juicy & Cream event reservations (prefix JC-)
        if (ref && ref.startsWith("JC-")) {
          const { data: jc } = await SB.from("juicy_cream_reservas")
            .select("id, total, estado, nombre, email, telefono, tipo, categoria").eq("id", ref).limit(1);
          if (jc && jc[0]) {
            const reservaJC = jc[0];
            await SB.from("juicy_cream_reservas").update({
              estado: "confirmado",
              forma_pago: "tarjeta_internacional",
              abono: reservaJC.total,
              notas: `Pago Zoho Pay — Payment ${pid}`,
              updated_at: new Date().toISOString(),
            }).eq("id", reservaJC.id);
            console.log(`✓ Juicy & Cream ${reservaJC.id} confirmada (Zoho Pay)`);
            // Update lead en Comercial → Cerrado Ganado
            await SB.from("leads").update({
              stage: "Cerrado Ganado",
              fecha_pago: new Date().toISOString().slice(0, 10),
              ultimo_contacto: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            }).eq("id", `LEAD-${reservaJC.id}`).then(() => {}).catch((e: any) =>
              console.warn("[juicy/lead-update-zoho] failed:", e?.message));
            await notificarJuicyPagoConfirmado(reservaJC, Number(reservaJC.total) || 0, "Zoho Pay", pid).catch(e =>
              console.warn("[juicy/email-confirmado-zoho] failed:", (e as Error).message));
            if (logRowId) {
              await SB.from("pagos_zoho_log").update({ processed_at: new Date().toISOString() }).eq("id", logRowId).then(() => {}).catch(() => {});
            }
            return new Response(JSON.stringify({ received: true, processed: true, action: "juicy_confirmed", reserva_id: reservaJC.id }), {
              status: 200, headers: { "Content-Type": "application/json" },
            });
          }
        }

        // 1a) Buscar primero en reservas_pasadia (Tatiana / Visito.AI)
        if (ref) {
          const { data: rp } = await SB.from("reservas_pasadia")
            .select("id, total_cop, estado, cliente_nombre, cliente_telefono, cliente_email, fecha, num_personas, producto, idioma, horario_salida")
            .eq("id", ref).limit(1);
          if (rp && rp[0]) {
            const reservaP = rp[0];
            await SB.from("reservas_pasadia").update({
              estado:          "confirmada",
              pasarela_usada:  "Zoho Pay",
              moneda_pagada:   "USD",
              pago_referencia: pid,
              pagado_en:       new Date().toISOString(),
              updated_at:      new Date().toISOString(),
            }).eq("id", reservaP.id);
            console.log(`✓ Reserva pasadía ${reservaP.id} confirmada (Zoho Pay)`);
            // Enviar confirmación
            await enviarConfirmacionPasadia(reservaP).catch(e =>
              console.warn(`[zoho/pasadia] confirmacion failed: ${(e as Error).message}`));
            if (logRowId) {
              await SB.from("pagos_zoho_log").update({ processed_at: new Date().toISOString() }).eq("id", logRowId).then(() => {}).catch(() => {});
            }
            return new Response(JSON.stringify({ received: true, processed: true, action: "pasadia_confirmed", reserva_id: reservaP.id }), {
              status: 200, headers: { "Content-Type": "application/json" },
            });
          }
        }

        // 1b) Reservas web (legacy)
        if (ref) {
          const { data: reservas } = await SB.from("reservas")
            .select("id, estado, total, lead_id, nombre, telefono, contacto, email, fecha, pax, tipo, salida_id")
            .eq("id", ref)
            .limit(1);
          const reserva = reservas?.[0];
          if (reserva) {
            await SB.from("reservas").update({
              estado: "confirmado",
              forma_pago: "zoho_pay",
              abono: reserva.total,
              saldo: 0,
              fecha_pago: new Date().toISOString().slice(0, 10),
              updated_at: new Date().toISOString(),
            }).eq("id", reserva.id);

            // Confirmar track_ingreso correspondiente — AtolonTrack lo dejó en 'pendiente'
            // al click "Pagar"; ahora que Zoho confirmó, es venta real.
            await SB.from("track_ingresos").update({
              estado_pago: "confirmado",
            }).eq("reserva_id", reserva.id).then(() => {}).catch(() => {});

            // Marcar la sesión asociada como convertida (venta real)
            const { data: ings } = await SB.from("track_ingresos")
              .select("sesion_id, monto")
              .eq("reserva_id", reserva.id);
            if (ings && ings.length > 0) {
              const sesIds = ings.map((i: any) => i.sesion_id).filter(Boolean);
              if (sesIds.length > 0) {
                await SB.from("track_sesiones").update({
                  convertida: true,
                  ingreso: ings[0].monto || reserva.total,
                }).in("id", sesIds).then(() => {}).catch(() => {});
              }
            }

            // Cerrar lead asociado si existe
            if (reserva.lead_id) {
              await SB.from("leads").update({
                stage: "Cerrado Ganado",
                ultimo_contacto: new Date().toISOString().slice(0, 10),
              }).eq("id", reserva.lead_id).then(() => {}).catch(() => {});
            }

            // Marcar carrito como recuperado
            await SB.from("ac_carts").update({
              estado: "recovered",
              recovered_at: new Date().toISOString(),
              reserva_id: reserva.id,
              updated_at: new Date().toISOString(),
            }).eq("reserva_id", reserva.id).then(() => {}).catch(() => {});

            console.log("Reserva confirmada vía webhook Zoho:", reserva.id);

            // Meta Conversions API (server-side, dedup con pixel del navegador)
            enviarMetaCapi(reserva, Number(reserva.total || 0)).catch(() => {});

            // Enviar email + WhatsApp en paralelo (best-effort)
            await Promise.all([
              enviarEmailConfirmacion(reserva).catch(e =>
                console.warn(`[zoho] Email send failed: ${(e as Error).message}`)),
              enviarWhatsAppConfirmacion(SB, reserva).catch(e =>
                console.warn(`[zoho] WhatsApp send failed: ${(e as Error).message}`)),
            ]);
          }
        }

        // 2) Intentar actualizar pedido de room service
        if (ref) {
          const { data: pedidos } = await SB.from("hotel_room_service_pedidos")
            .select("id")
            .or(`id.eq.${ref},codigo.eq.${ref}`)
            .limit(1);
          const pedido = pedidos?.[0];
          if (pedido) {
            await SB.from("hotel_room_service_pedidos").update({
              pago_estado: "pagado",
              pos_sync: { provider: "zoho_pay", payment_id: pid, paid_at: new Date().toISOString() },
              updated_at: new Date().toISOString(),
            }).eq("id", pedido.id);
            console.log("Pedido room service pagado vía webhook Zoho:", pedido.id);
          }
        }

        // 3) Intentar actualizar sesión tracking si existe
        if (ref) {
          await SB.from("pagos_zoho_sessions").update({
            status: "pagado",
            payment_id: pid,
            pagado_at: new Date().toISOString(),
            last4, brand, raw: event,
          }).eq("reference", ref).then(() => {}).catch(() => {});
        }

        // Marcar evento como procesado (idempotencia)
        if (logRowId) {
          await SB.from("pagos_zoho_log").update({ processed_at: new Date().toISOString() }).eq("id", logRowId).then(() => {}).catch(() => {});
        }
      }

      // Pago fallido — múltiples variantes
      const isFailed =
        type === "payment.failed" ||
        type === "payment_failed" ||
        type === "payment.failure" ||
        payment.status === "failed" ||
        payment.status === "declined";
      if (isFailed) {
        if (ref) {
          await SB.from("reservas").update({
            notas: `Pago con tarjeta internacional rechazado — ${new Date().toISOString().slice(0, 16)}`,
            updated_at: new Date().toISOString(),
          }).eq("id", ref).then(() => {}).catch(() => {});
          await SB.from("pagos_zoho_sessions").update({
            status: "fallido",
            raw: event,
          }).eq("reference", ref).then(() => {}).catch(() => {});
        }
      }

      return new Response(JSON.stringify({ received: true, event_type: type }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("webhook error:", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // GET /webhook/test — endpoint de diagnóstico (sin auth)
  // ══════════════════════════════════════════════════════════════════════
  if (req.method === "GET" && path === "/webhook/test") {
    const wSecret = await loadWebhookSecret();
    return new Response(JSON.stringify({
      ok: true,
      message: "Atolon Zoho webhook está en línea",
      secret_configured: !!wSecret,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // GET /diag — diagnóstico (requiere header x-atolon-cron-secret)
  // Muestra: estado del secret, últimos eventos, sesiones pendientes.
  // ══════════════════════════════════════════════════════════════════════
  if (req.method === "GET" && path === "/diag") {
    const cronSecret = req.headers.get("x-atolon-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET") || "";
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    try {
      const SB = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const creds = await loadZohoCreds();
      const { data: ultimosEventos } = await SB
        .from("pagos_zoho_log")
        .select("event_type, reference, payment_id, firma_valida, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      const { data: sesionesPendientes } = await SB
        .from("pagos_zoho_sessions")
        .select("payment_link_id, reference, amount, status, created_at")
        .neq("status", "pagado")
        .order("created_at", { ascending: false })
        .limit(5);
      const { count: totalEventos } = await SB
        .from("pagos_zoho_log")
        .select("*", { count: "exact", head: true });

      const diagSecret = await loadWebhookSecret();
      return new Response(JSON.stringify({
        ok: true,
        timestamp: new Date().toISOString(),
        webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/zoho-payments/webhook`,
        config: {
          secret_configured: !!diagSecret,
          secret_length: diagSecret.length,
          secret_source: diagSecret === ZOHO_WEBHOOK_SECRET_ENV ? "env" : "db",
          oauth_configured: !!(creds.client_id && creds.client_secret && creds.refresh_token),
          api_key_configured: !!creds.api_key,
          // account_id ofuscado — solo primeros 4 chars
          account_id_preview: creds.account_id ? `${String(creds.account_id).slice(0, 4)}...` : null,
        },
        stats: {
          total_eventos_recibidos: totalEventos || 0,
          sesiones_pendientes: (sesionesPendientes || []).length,
        },
        ultimos_eventos: ultimosEventos || [],
        sesiones_pendientes: sesionesPendientes || [],
      }, null, 2), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // POST /poll-recent — safety net mientras webhook no llega
  // Consulta los pagos exitosos de las últimas N horas en Zoho Pay y
  // marca las reservas como confirmadas si encuentra match por reference.
  // Llamado por Vercel cron cada 5 min.
  // ══════════════════════════════════════════════════════════════════════
  if (req.method === "POST" && path === "/poll-recent") {
    const cronSecret = req.headers.get("x-atolon-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET") || "";
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    try {
      const body = await req.json().catch(() => ({}));
      // Cap a 48h
      const horasAtras = Math.min(Math.max(Number(body?.hours) || 2, 1), 48);

      const creds = await loadZohoCreds();
      if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
        return new Response(JSON.stringify({ ok: false, error: "OAuth no configurado" }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const authHeader = await getZohoAuthHeader({ ...creds, api_key: "" });

      const SB = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Estrategia: en lugar de listar TODOS los pagos (endpoint que no
      // siempre funciona en Zoho Pay), iteramos sobre las sesiones que
      // NOSOTROS creamos y están pendientes en pagos_zoho_sessions, y
      // consultamos el estado de cada una.
      const desdeStr = new Date(Date.now() - horasAtras * 3600 * 1000).toISOString();
      const { data: sesionesPend } = await SB.from("pagos_zoho_sessions")
        .select("payment_link_id, reference, amount, currency, context_id, status, created_at")
        .gte("created_at", desdeStr)
        .neq("status", "pagado")
        .order("created_at", { ascending: false });

      let matched = 0, alreadyOk = 0, noMatch = 0, errCount = 0;
      const procesados: any[] = [];

      for (const s of (sesionesPend || [])) {
        try {
          // GET status de la sesión en Zoho
          const sRes = await fetch(
            `https://payments.zoho.com/api/v1/paymentsessions/${s.payment_link_id}?account_id=${creds.account_id}`,
            { headers: { Authorization: authHeader } }
          );
          const sData = await sRes.json();
          const sess = sData?.payments_session || sData?.payment_session || sData;
          const sessStatus = sess?.status || sess?.payment_status || "";
          // Buscar el payment_id si la sesión tiene pagos asociados
          const payment = sess?.payments?.[0] || sess?.payment || null;
          const pid = payment?.payment_id || payment?.id || sess?.payment_id || "";
          const captured = sessStatus === "captured" || sessStatus === "succeeded" || payment?.status === "succeeded";

          if (!captured) { continue; }

          // Match con reserva
          const ref = s.reference;
          const { data: reservas } = await SB.from("reservas")
            .select("id, estado, total, lead_id")
            .eq("id", ref).limit(1);
          const reserva = reservas?.[0];

          if (!reserva) { noMatch++; continue; }
          if (reserva.estado === "confirmado" && Number(reserva.total) === 0) { alreadyOk++; continue; }

          // Marcar pagada
          await SB.from("reservas").update({
            estado: "confirmado",
            forma_pago: "zoho_pay",
            abono: reserva.total,
            saldo: 0,
            fecha_pago: new Date().toISOString().slice(0, 10),
            updated_at: new Date().toISOString(),
          }).eq("id", reserva.id);

          if (reserva.lead_id) {
            await SB.from("leads").update({
              stage: "Cerrado Ganado",
              ultimo_contacto: new Date().toISOString().slice(0, 10),
            }).eq("id", reserva.lead_id).then(() => {}).catch(() => {});
          }

          // Actualizar sesión
          await SB.from("pagos_zoho_sessions").update({
            status: "pagado",
            payment_id: pid,
            pagado_at: new Date().toISOString(),
            raw: sess,
          }).eq("payment_link_id", s.payment_link_id);

          // Log
          await SB.from("pagos_zoho_log").insert({
            event_type: "payment.succeeded.poll",
            reference: ref,
            payment_id: pid,
            raw: { sess, _origen: "poll-recent" },
            firma_valida: true,
          }).then(() => {}).catch(() => {});

          matched++;
          procesados.push({ ref, pid, sessionId: s.payment_link_id });
        } catch (e) {
          errCount++;
          console.warn("[poll-recent] error en sesión", s.payment_link_id, ":", (e as Error).message);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        sesiones_revisadas: (sesionesPend || []).length,
        matched, alreadyOk, noMatch, errCount,
        procesados,
      }), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
    } catch (err) {
      console.error("poll-recent error:", err);
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // GET /webhooks-list — lista webhooks registrados en Zoho Pay
  // Endpoint confirmado: /api/v1/webhooks (auth con Zoho-oauthtoken)
  // ══════════════════════════════════════════════════════════════════════
  if (req.method === "GET" && path === "/webhooks-list") {
    try {
      const creds = await loadZohoCreds();
      if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
        return new Response(JSON.stringify({ ok: false, error: "OAuth no configurado" }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const authHeader = await getZohoAuthHeader({ ...creds, api_key: "" });
      const r = await fetch(
        `https://payments.zoho.com/api/v1/webhooks?account_id=${creds.account_id}`,
        { headers: { Authorization: authHeader } }
      );
      const text = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { parsed = { _raw: text.slice(0, 1500) }; }

      return new Response(JSON.stringify({
        ok: r.ok,
        account_id: creds.account_id,
        status: r.status,
        respuesta: parsed,
      }, null, 2), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // GET/POST /webhooks-register — registra el webhook vía Zoho API
  // Acepta GET (más fácil de invocar desde browser) y POST.
  // ══════════════════════════════════════════════════════════════════════
  if ((req.method === "POST" || req.method === "GET") && path === "/webhooks-register") {
    const cronSecret = req.headers.get("x-atolon-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET") || "";
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    try {
      let webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/zoho-payments/webhook`;
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (body?.webhook_url) webhookUrl = body.webhook_url;
      } else {
        const qUrl = url.searchParams.get("webhook_url");
        if (qUrl) webhookUrl = qUrl;
      }
      const creds = await loadZohoCreds();
      if (!creds.refresh_token || !creds.client_id || !creds.client_secret) {
        return new Response(JSON.stringify({ ok: false, error: "OAuth no configurado" }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const authHeader = await getZohoAuthHeader({ ...creds, api_key: "" });

      // Body que probaremos. Algunas versiones de Zoho Pay esperan campos
      // distintos — incluimos varias formas.
      const events = [
        "payment.success",
        "payment.succeeded",
        "payment.captured",
        "payment.failed",
        "paymentsession.captured",
      ];
      const payloadVariants = [
        { url: webhookUrl, events },
        { url: webhookUrl, events, name: "Atolon OS" },
        { url: webhookUrl, events, name: "Atolon OS", is_active: true },
        { webhook_url: webhookUrl, events },
        { notify_url: webhookUrl, events },
        { url: webhookUrl, event_types: events },
        { url: webhookUrl, subscribed_events: events },
        { url: webhookUrl, events, application_name: "atolon-os" },
        { url: webhookUrl, event_list: events },
        // Algunos APIs de Zoho usan estructura anidada
        { webhook: { url: webhookUrl, events } },
        { data: { url: webhookUrl, events } },
        // Sin events (default = todos)
        { url: webhookUrl },
        { url: webhookUrl, name: "Atolon OS Webhook" },
      ];

      // Solo el endpoint que sabemos funciona (los otros dan 404)
      const endpoints = [
        `https://payments.zoho.com/api/v1/webhooks?account_id=${creds.account_id}`,
      ];

      const intentos: any[] = [];
      for (const ep of endpoints) {
        for (const payload of payloadVariants) {
          try {
            const r = await fetch(ep, {
              method: "POST",
              headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json",
                "X-com-zoho-payments-organizationid": creds.account_id,
                "X-Zoho-Account-Id": creds.account_id,
              },
              body: JSON.stringify(payload),
            });
            const text = await r.text();
            const isHtml = text.trim().startsWith("<");
            intentos.push({
              endpoint: ep,
              payload_keys: Object.keys(payload),
              status: r.status,
              isHtml,
              body: isHtml ? "[HTML login redirect]" : text.slice(0, 800),
            });
            // Éxito = 2xx + JSON válido (no HTML de login)
            if (r.status >= 200 && r.status < 300 && !isHtml) {
              return new Response(JSON.stringify({
                ok: true,
                mensaje: "Webhook registrado",
                webhook_url: webhookUrl,
                endpoint_que_funcionó: ep,
                payload_que_funcionó: payload,
                respuesta: text.slice(0, 2000),
              }, null, 2), {
                status: 200, headers: { ...CORS, "Content-Type": "application/json" },
              });
            }
          } catch (e) {
            intentos.push({ endpoint: ep, payload_keys: Object.keys(payload), error: String(e) });
          }
        }
      }

      return new Response(JSON.stringify({
        ok: false,
        mensaje: "Zoho Pay no expone API pública para registrar webhooks. Hay que crearlo desde el dashboard de Zoho Pay → Settings → Webhooks → Add Endpoint.",
        webhook_url_para_pegar: webhookUrl,
        intentos,
      }, null, 2), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not found", { status: 404 });
});

// ── Enviar email de confirmación (Resend via /send-confirmation) ───────────
// ── Meta Conversions API (server-side Purchase) ────────────────────────────
// Fire-and-forget hacia meta-capi. Best-effort: nunca afecta el flujo de pago.
async function enviarMetaCapi(reserva: any, monto: number): Promise<void> {
  try {
    await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-capi`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        },
        body: JSON.stringify({
          reserva_id: reserva.id,
          value:      Number(monto || reserva.total || 0),
          currency:   "COP",
          email:      reserva.email || reserva.contacto || "",
          phone:      reserva.telefono || "",
        }),
      },
    );
  } catch (_) { /* CAPI best-effort */ }
}

// send-confirmation espera reserva.contacto como destinatario. Si solo está
// reserva.email (campo dedicado), lo copiamos a contacto antes de enviar.
async function enviarEmailConfirmacion(reserva: any): Promise<void> {
  const email = (reserva?.email || reserva?.contacto || "").toString();
  if (!email.includes("@")) return;

  const payload = { ...reserva, contacto: email };

  await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-confirmation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify(payload),
    }
  );
}

// ── Enviar confirmación para reservas_pasadia (Tatiana) ────────────────────
async function enviarConfirmacionPasadia(reserva: any): Promise<void> {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") || ""}`,
    "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
  };

  if (reserva.cliente_email) {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-confirmation`, {
      method: "POST", headers,
      body: JSON.stringify({
        id: reserva.id, contacto: reserva.cliente_email, nombre: reserva.cliente_nombre,
        tipo: reserva.producto, fecha: reserva.fecha, pax: reserva.num_personas,
        total: reserva.total_cop, telefono: reserva.cliente_telefono,
        idioma: reserva.idioma || "es", _source: "tatiana_pasadia",
      }),
    }).catch(() => {});
  }

  if (reserva.cliente_telefono) {
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp/send`, {
      method: "POST", headers,
      body: JSON.stringify({
        to: reserva.cliente_telefono, template: "confirmacion_pasadia_atolon",
        params: [
          (reserva.cliente_nombre || "").split(" ")[0] || reserva.cliente_nombre || "Cliente",
          reserva.producto, reserva.fecha, String(reserva.num_personas),
          reserva.horario_salida + " AM",
          `$${Number(reserva.total_cop || 0).toLocaleString("es-CO")} COP`,
          reserva.id,
        ],
        lang: "es", reserva_id: reserva.id,
      }),
    }).catch(() => {});
  }
}

// ── Enviar confirmación de reserva por WhatsApp ────────────────────────────
// Cascade por idioma:
//   - reserva.idioma === "en": *_en aprobados → fallback ES + nota EN texto libre (24h window)
//   - reserva.idioma === "es" (default): cascade existente
async function enviarWhatsAppConfirmacion(SB: any, reserva: any): Promise<void> {
  const telefono = reserva?.telefono || reserva?.contacto;
  if (!telefono || !/\d{7,}/.test(telefono)) return;

  const lang: "es" | "en" = reserva?.idioma === "en" ? "en" : "es";
  const locale = lang === "en" ? "en-US" : "es-CO";

  let horaSalida = lang === "en" ? "See confirmation" : "Ver confirmación";
  if (reserva.salida_id) {
    try {
      const { data: salida } = await SB.from("salidas")
        .select("hora").eq("id", reserva.salida_id).single();
      if (salida?.hora) horaSalida = salida.hora;
    } catch { /* ignore */ }
  }

  const nombre = (reserva.nombre || "").split(" ")[0] || reserva.nombre || (lang === "en" ? "Guest" : "Cliente");
  const fecha = reserva.fecha
    ? new Date(reserva.fecha + "T12:00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })
    : "";
  const totalCOP = `$${Number(reserva.total || 0).toLocaleString(locale)} COP`;
  const tipo = reserva.tipo || (lang === "en" ? "Day pass" : "Pasadía");

  const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp/send`;
  const sendTextUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp/send-text`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  };

  const trySend = async (template: string, params: string[], tplLang: string) => {
    const r = await fetch(sendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ to: telefono, template, params, lang: tplLang, reserva_id: reserva.id }),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok && !d?.error;
  };

  if (lang === "en") {
    if (await trySend("confirmacion_pasadia_atolon_en", [nombre, tipo, fecha, String(reserva.pax || 1), horaSalida, totalCOP, reserva.id], "en")) return;
    if (await trySend("vip_pass_confirmacion_en",       [nombre, fecha, String(reserva.pax || 1), horaSalida, totalCOP, reserva.id], "en")) return;
    const esOk = await trySend("vip_pass_confirmacion", [nombre, fecha, String(reserva.pax || 1), horaSalida, totalCOP, reserva.id], "es");
    if (esOk) {
      const enNote = `Hi ${nombre}! Your booking is confirmed for ${fecha} · ${reserva.pax || 1} guest(s) · departure ${horaSalida}. Total paid: ${totalCOP}. Booking ID: ${reserva.id}. Arrive 20 minutes before departure at La Bodeguita Pier — Gate 1. Pier tax COP 18,000 per person (not included in the day pass). See full details: https://www.atoloncartagena.com/zarpe-info?id=${reserva.id}&lang=en`;
      await fetch(sendTextUrl, { method: "POST", headers, body: JSON.stringify({ to: telefono, body: enNote, reserva_id: reserva.id }) }).catch(() => {});
    }
    return;
  }

  // ES flow (default)
  if (await trySend("confirmacion_pasadia_atolon", [nombre, tipo, fecha, String(reserva.pax || 1), horaSalida, totalCOP, reserva.id], "es")) return;
  if (await trySend("vip_pass_confirmacion",       [nombre, fecha, String(reserva.pax || 1), horaSalida, totalCOP, reserva.id], "es")) return;
  await trySend("confirmacionvip", [], "es_CO");
}

// ── Notificación email admin: pago Juicy & Cream confirmado vía Zoho ──
async function notificarJuicyPagoConfirmado(jc: any, monto: number, pasarela: string, pid: string) {
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
  if (!RESEND_KEY) {
    console.warn("[juicy/email] RESEND_API_KEY no configurada — skip");
    return;
  }
  const tipoLabel = jc.tipo === "ticket" ? `🎟 Ticket — ${jc.categoria}` : `🛋 Mesa — ${jc.categoria}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0a0a0a;">
      <div style="background: #16A34A; color: #fff; padding: 18px 22px; border-radius: 8px 8px 0 0;">
        <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.04em;">JUICY &amp; CREAM</div>
        <div style="font-size: 12px; letter-spacing: 0.2em; margin-top: 4px;">✅ PAGO CONFIRMADO</div>
      </div>
      <div style="background: #fff; border: 1px solid #ccc; border-top: none; padding: 22px; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #666;">Reserva ID</td><td style="padding: 6px 0; font-weight: 700;">${jc.id}</td></tr>
          <tr><td style="padding: 6px 0; color: #666;">Tipo</td><td style="padding: 6px 0; font-weight: 700;">${tipoLabel}</td></tr>
          <tr><td style="padding: 6px 0; color: #666;">Total pagado</td><td style="padding: 6px 0; font-weight: 800; color: #16A34A; font-size: 18px;">$${Math.round(monto).toLocaleString("es-CO")}</td></tr>
          <tr><td style="padding: 6px 0; color: #666;">Pasarela</td><td style="padding: 6px 0;">${pasarela} — Payment ${pid}</td></tr>
          <tr><td colspan="2" style="padding: 12px 0 6px; border-top: 1px solid #eee; font-weight: 700;">Cliente</td></tr>
          <tr><td style="padding: 4px 0; color: #666;">Nombre</td><td style="padding: 4px 0;">${jc.nombre || "—"}</td></tr>
          <tr><td style="padding: 4px 0; color: #666;">Teléfono</td><td style="padding: 4px 0;">${jc.telefono || "—"}</td></tr>
          ${jc.email ? `<tr><td style="padding: 4px 0; color: #666;">Email</td><td style="padding: 4px 0;">${jc.email}</td></tr>` : ""}
        </table>
        <div style="margin-top: 18px; padding: 10px 14px; background: #DCFCE7; border: 1px solid #16A34A; border-radius: 6px; font-size: 12px; color: #166534;">
          ✅ Esta venta ya está confirmada y aparecerá en tu portal de organizador y en Grupos del día.
        </div>
        <div style="margin-top: 16px; font-size: 11px; color: #888;">
          Portal organizador: <a href="https://www.atolon.co/juicy-organizador" style="color: #16A34A;">/juicy-organizador</a> · 7 jun 2026 · Atolón Beach Club
        </div>
      </div>
    </div>
  `;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Juicy & Cream <reservas@atolon.co>",
      to: ["eric@atoloncartagena.com"],
      subject: `✅ Venta confirmada Juicy & Cream — ${tipoLabel} · $${Math.round(monto).toLocaleString("es-CO")}`,
      html,
    }),
  });
}
