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
    const { reserva_id, total_cop, nombre, email, tipo, fecha } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
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
    const successUrl = `${origin}/pago/${reserva_id}?stripe=ok&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${origin}/pago/${reserva_id}?stripe=cancel`;

    // Convert COP → USD cents
    const totalUsd    = total_cop / tasaUsd;
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
        ? `Reserva ${reserva_id} — ${fecha} (COP ${total_cop.toLocaleString("es-CO")})`
        : `Reserva ${reserva_id}`,
      "metadata[reserva_id]":  reserva_id,
      "metadata[total_cop]":   String(total_cop),
      "metadata[tasa_usd]":    String(tasaUsd),
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
