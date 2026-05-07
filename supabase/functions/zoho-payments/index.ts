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

const ZOHO_WEBHOOK_SECRET = Deno.env.get("ZOHO_WEBHOOK_SECRET") || Deno.env.get("ZOHO_SIGNING_KEY") || "";

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
  if (!signature || !ZOHO_WEBHOOK_SECRET) return false;
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
    const secretRaw = new TextEncoder().encode(ZOHO_WEBHOOK_SECRET);
    const isHex = /^[0-9a-fA-F]+$/.test(ZOHO_WEBHOOK_SECRET) && ZOHO_WEBHOOK_SECRET.length % 2 === 0;
    const secretHex = isHex
      ? new Uint8Array(ZOHO_WEBHOOK_SECRET.match(/.{2}/g)!.map(h => parseInt(h, 16)))
      : null;

    const candidates: Array<[string, Uint8Array, Uint8Array]> = [
      ["raw+ts.payload",   secretRaw, msgBytes],
      ["raw+payload",      secretRaw, msgBytesNoTs],
    ];
    if (secretHex) {
      candidates.push(["hex+ts.payload", secretHex, msgBytes]);
      candidates.push(["hex+payload",    secretHex, msgBytesNoTs]);
    }

    for (const [label, key, msg] of candidates) {
      const cryptoKey = await crypto.subtle.importKey(
        "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msg);
      const computed = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
      if (computed === sigPart) {
        console.log(`[zoho-webhook] firma válida con formato: ${label}`);
        return true;
      }
    }
    // Si nada matchea, log de debug para identificar el formato correcto
    const previewSecret = ZOHO_WEBHOOK_SECRET.length > 12
      ? ZOHO_WEBHOOK_SECRET.slice(0, 6) + "..." + ZOHO_WEBHOOK_SECRET.slice(-4)
      : "***";
    console.warn(`[zoho-webhook] firma INVÁLIDA. expected=${sigPart.slice(0, 16)}... ts=${tsPart} secret_preview=${previewSecret} secret_len=${ZOHO_WEBHOOK_SECRET.length} is_hex=${isHex} payload_len=${payload.length}`);
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

      // Guardar sesión en tracking si se proveen contexto
      if (reference) {
        const SB = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await SB.from("pagos_zoho_sessions").insert({
          payment_link_id: session.payments_session_id, // reusa columna
          reference,
          amount: Number(amount),
          currency: currency || "USD",
          context: context || null,
          context_id: context_id || null,
          status: "pendiente",
        }).then(() => {}).catch(() => {});
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

      // Guardar evento en log SIEMPRE (antes de validar firma, para debugging)
      await SB.from("pagos_zoho_log").insert({
        event_type: type,
        reference: ref,
        payment_id: pid,
        raw: { event, _debug_headers: allHeaders, _debug_sig: signature },
        firma_valida: false, // se actualiza abajo si pasa
      }).then(() => {}).catch(() => {});

      // Validación de firma (después de loguear para debugging)
      if (ZOHO_WEBHOOK_SECRET && signature) {
        const valid = await verifyWebhookSignature(payload, signature);
        if (!valid) {
          console.error("Firma inválida. sig:", signature.slice(0, 20), "secret len:", ZOHO_WEBHOOK_SECRET.length);
          // Retornar 200 para que Zoho no reintente, pero no procesar el evento
          return new Response(JSON.stringify({ received: true, firma: "invalid", event_type: type }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
        // Marcar firma válida en el log
        if (pid) {
          await SB.from("pagos_zoho_log").update({ firma_valida: true }).eq("payment_id", pid).then(() => {}).catch(() => {});
        }
      }

      // Pago exitoso
      if (type === "payment.success" || type === "payment.succeeded" || type === "payment_success") {
        // 1) Intentar actualizar reserva
        if (ref) {
          const { data: reservas } = await SB.from("reservas")
            .select("id, estado, total, lead_id")
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
      }

      // Pago fallido
      if (type === "payment.failed" || type === "payment_failed") {
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
    return new Response(JSON.stringify({
      ok: true,
      message: "Atolon Zoho webhook está en línea",
      secret_configured: !!ZOHO_WEBHOOK_SECRET,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response("Not found", { status: 404 });
});
