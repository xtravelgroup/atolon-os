import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Fetch live USD→COP rate from free API (no key required). */
async function fetchLiveTasa(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const cop = data?.usd?.cop;
    if (cop && cop > 1000) return Math.round(cop);
    return null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { reserva_id, nombre, email, tipo, fecha } = await req.json();

    if (!reserva_id) {
      return new Response(JSON.stringify({ error: "reserva_id requerido" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Leer reserva.total de DB (source of truth) — NO confiar en cliente ──
    const { data: reserva, error: reservaErr } = await supabase
      .from("reservas")
      .select("id, total, saldo, abono, estado")
      .eq("id", reserva_id)
      .single();

    if (reservaErr || !reserva) {
      return new Response(JSON.stringify({ error: "Reserva no encontrada" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // El cobro es por el saldo pendiente, no por el total (permite abonos parciales previos)
    const saldoPendiente = Number(reserva.saldo);
    const totalReserva   = Number(reserva.total);
    const amountToCharge = saldoPendiente > 0 ? saldoPendiente : totalReserva;

    if (!Number.isFinite(amountToCharge) || amountToCharge <= 0) {
      return new Response(JSON.stringify({ error: "Reserva sin saldo a cobrar" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: config } = await supabase
      .from("configuracion")
      .select("stripe_secret_key, tasa_usd")
      .eq("id", "atolon")
      .single();

    const stripeKey = config?.stripe_secret_key;
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe no configurado" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 1. Try live rate — 2. Fall back to DB rate — 3. Fall back to 4200
    const liveTasa = await fetchLiveTasa();
    const tasaUsd  = liveTasa ?? (Number(config?.tasa_usd) || 4200);

    // Persist live rate to DB so Configuracion shows it (fire-and-forget)
    if (liveTasa) {
      supabase.from("configuracion")
        .update({ tasa_usd: liveTasa, tasa_usd_updated_at: new Date().toISOString() })
        .eq("id", "atolon")
        .then(() => {});
    }

    const origin     = req.headers.get("origin") || "https://atolon.co";
    // success_url incluye session_id para que el cliente pueda verificar server-side,
    // pero la confirmación REAL solo ocurre via webhook (no client-side).
    const successUrl = `${origin}/pago/${reserva_id}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${origin}/pago/${reserva_id}?stripe=cancel`;

    // Convert COP → USD cents (basado en total leído de DB, no cliente)
    const totalUsd    = amountToCharge / tasaUsd;
    const amountCents = Math.round(totalUsd * 100);

    const params = new URLSearchParams({
      "payment_method_types[]":                               "card",
      "mode":                                                 "payment",
      "success_url":                                          successUrl,
      "cancel_url":                                           cancelUrl,
      "line_items[0][quantity]":                              "1",
      "line_items[0][price_data][currency]":                  "usd",
      "line_items[0][price_data][unit_amount]":               String(amountCents),
      "line_items[0][price_data][product_data][name]":        tipo || "Pasadia Atolon Beach Club",
      "line_items[0][price_data][product_data][description]": fecha
        ? `Reserva ${reserva_id} — ${fecha} (COP ${amountToCharge.toLocaleString("es-CO")})`
        : `Reserva ${reserva_id}`,
      // Metadata: el webhook usa estos campos para validar el monto cobrado
      // y detectar tampering entre crear-sesión y pago efectivo.
      "metadata[reserva_id]":     reserva_id,
      "metadata[db_total_cop]":   String(totalReserva),
      "metadata[db_saldo_cop]":   String(saldoPendiente),
      "metadata[expected_cop]":   String(amountToCharge),
      "metadata[tasa_usd]":       String(tasaUsd),
    });

    if (email) params.set("customer_email", email);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error("Stripe error:", session);
      return new Response(JSON.stringify({ error: session.error?.message || "Error Stripe" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url, tasa_usd: tasaUsd }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
