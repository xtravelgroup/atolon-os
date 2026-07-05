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
    const { reserva_id, hotel_estancia_id, nombre, email, tipo, fecha, back_url } = await req.json();

    if (!reserva_id && !hotel_estancia_id) {
      return new Response(JSON.stringify({ error: "reserva_id o hotel_estancia_id requerido" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Modo hotel_estancia: cobrar el total de la estancia (incluye IVA si aplica).
    let saldoPendiente: number;
    let totalReserva: number;
    let amountToCharge: number;

    if (hotel_estancia_id) {
      const { data: est, error: estErr } = await supabase
        .from("hotel_estancias")
        .select("id, total, deposito, estado")
        .eq("id", hotel_estancia_id)
        .single();
      if (estErr || !est) {
        return new Response(JSON.stringify({ error: "Estancia no encontrada" }), {
          status: 404, headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      totalReserva = Number(est.total || 0);
      const depositoPagado = Number(est.deposito || 0);
      saldoPendiente = Math.max(0, totalReserva - depositoPagado);
      amountToCharge = saldoPendiente > 0 ? saldoPendiente : totalReserva;
    } else {
      // Flujo legacy — reserva de pasadía.
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
      saldoPendiente = Number(reserva.saldo);
      totalReserva   = Number(reserva.total);
      amountToCharge = saldoPendiente > 0 ? saldoPendiente : totalReserva;
    }

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
    const successUrl = hotel_estancia_id
      ? `${back_url || origin}?paid_stripe={CHECKOUT_SESSION_ID}`
      : `${origin}/pago/${reserva_id}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = hotel_estancia_id
      ? `${back_url || origin}?stripe=cancel`
      : `${origin}/pago/${reserva_id}?stripe=cancel`;

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
      "line_items[0][price_data][product_data][name]":        tipo || (hotel_estancia_id ? "Reserva Hotel Atolon" : "Pasadia Atolon Beach Club"),
      "line_items[0][price_data][product_data][description]": fecha
        ? `${hotel_estancia_id ? "Estancia" : "Reserva"} ${(hotel_estancia_id || reserva_id).toString().slice(0, 8)} — ${fecha} (COP ${amountToCharge.toLocaleString("es-CO")})`
        : `${hotel_estancia_id ? "Estancia" : "Reserva"} ${(hotel_estancia_id || reserva_id).toString().slice(0, 8)}`,
      // Metadata: el webhook usa estos campos para validar el monto cobrado
      // y detectar tampering entre crear-sesión y pago efectivo.
      "metadata[db_total_cop]":   String(totalReserva),
      "metadata[db_saldo_cop]":   String(saldoPendiente),
      "metadata[expected_cop]":   String(amountToCharge),
      "metadata[tasa_usd]":       String(tasaUsd),
    });
    if (reserva_id)        params.set("metadata[reserva_id]",        reserva_id);
    if (hotel_estancia_id) params.set("metadata[hotel_estancia_id]", hotel_estancia_id);

    if (email) params.set("customer_email", email);

    // Timeout 15s en la llamada a Stripe. Sin AbortController, un Stripe lento
    // colgaba toda la edge function hasta el timeout global (~150s) y el
    // booking engine devolvia un error generico al cliente despues de minutos.
    const stripeCtrl = new AbortController();
    const stripeTimer = setTimeout(() => stripeCtrl.abort(), 15_000);
    let stripeRes: Response;
    try {
      stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        signal: stripeCtrl.signal,
        headers: {
          "Authorization": `Bearer ${stripeKey}`,
          "Content-Type":  "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
    } catch (e) {
      clearTimeout(stripeTimer);
      const isAbort = e instanceof Error && e.name === "AbortError";
      console.error(isAbort ? "Stripe timeout (15s)" : "Stripe fetch error:", e);
      return new Response(JSON.stringify({ error: isAbort ? "Stripe timeout — intenta de nuevo." : "Error de red con Stripe." }), {
        status: 504, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    clearTimeout(stripeTimer);

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
