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
const ZOHO_ACCOUNT_ID     = Deno.env.get("ZOHO_ACCOUNT_ID") || "874101637";
const ZOHO_API_KEY        = Deno.env.get("ZOHO_API_KEY") || "";
// Fallback OAuth (si no hay API Key)
const ZOHO_CLIENT_ID      = Deno.env.get("ZOHO_CLIENT_ID") || "";
const ZOHO_CLIENT_SECRET  = Deno.env.get("ZOHO_CLIENT_SECRET") || "";
const ZOHO_REFRESH_TOKEN  = Deno.env.get("ZOHO_REFRESH_TOKEN") || "";

// ── Obtener token (API Key directa o OAuth como fallback) ──────────────
async function getZohoAuthHeader(): Promise<string> {
  if (ZOHO_API_KEY) {
    // Método 1 — API Key directa (preferido)
    return "ZPapikey " + ZOHO_API_KEY;
  }
  // Método 2 — OAuth refresh token (fallback)
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id:     ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("No access_token: " + JSON.stringify(data));
  return "Zoho-oauthtoken " + data.access_token;
}

// ── Crear Payment Link en Zoho ──────────────────────────────────────────
async function createZohoPaymentLink(authHeader: string, body: {
  amount: number;
  currency: string;
  description: string;
}) {
  const res = await fetch(
    `https://payments.zoho.com/api/v1/paymentlinks?account_id=${ZOHO_ACCOUNT_ID}`,
    {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount:      String(Number(body.amount).toFixed(2)),
        currency:    body.currency || "USD",
        description: body.description,
      }),
    }
  );
  const data = await res.json();
  if (!data.payment_links) throw new Error("Error creando payment link: " + JSON.stringify(data));
  return data.payment_links;
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
    // HMAC se calcula sobre "t.payload" con el secret
    let tsPart = "";
    let sigPart = signature.toLowerCase();
    const m = signature.match(/t=([^,]+),\s*v=([a-f0-9]+)/i);
    if (m) {
      tsPart = m[1];
      sigPart = m[2].toLowerCase();
    }

    const message = tsPart ? `${tsPart}.${payload}` : payload;
    const key = new TextEncoder().encode(ZOHO_WEBHOOK_SECRET);
    const msgBytes = new TextEncoder().encode(message);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
    const computed = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    if (computed === sigPart) return true;

    // Fallback: probar sin timestamp (por si acaso)
    if (tsPart) {
      const sigBuffer2 = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
      const computed2 = Array.from(new Uint8Array(sigBuffer2))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
      return computed2 === sigPart;
    }
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
  // POST /create-session — crea un payment link en Zoho con descripción Atolón
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
      if (!ZOHO_API_KEY && (!ZOHO_REFRESH_TOKEN || !ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET)) {
        return new Response(JSON.stringify({ error: "Zoho no configurado en este proyecto. Faltan secretos." }), {
          status: 500, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      const authHeader = await getZohoAuthHeader();
      const finalDescription = description || `Atolon Beach Club${nombre ? " - " + nombre : ""}`;
      const link = await createZohoPaymentLink(authHeader, {
        amount: Number(amount),
        currency: currency || "USD",
        description: finalDescription,
      });

      // Guardar sesión en tracking si se proveen contexto
      if (reference) {
        const SB = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await SB.from("pagos_zoho_sessions").insert({
          payment_link_id: link.payment_link_id,
          reference,
          amount: Number(amount),
          currency: currency || "USD",
          context: context || null,
          context_id: context_id || null,
          status: "pendiente",
        }).then(() => {}).catch(() => {});
      }

      return new Response(JSON.stringify({
        payment_link_id: link.payment_link_id,
        payments_session_id: link.payment_link_id,
        payment_url: link.url,
        amount: link.amount,
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
