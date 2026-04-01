import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { reserva_id, total_cop, nombre, email, tipo, fecha } = await req.json();

    // Read Stripe secret key from configuracion table
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: config } = await supabase
      .from("configuracion")
      .select("stripe_secret_key")
      .eq("id", "atolon")
      .single();

    const stripeKey = config?.stripe_secret_key;
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe no configurado" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const origin = req.headers.get("origin") || "https://atolon.co";
    const successUrl = `${origin}/pago/${reserva_id}?stripe=ok&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${origin}/pago/${reserva_id}?stripe=cancel`;

    // Build Stripe Checkout Session via REST API
    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "mode": "payment",
      "success_url": successUrl,
      "cancel_url": cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "cop",
      "line_items[0][price_data][unit_amount]": String(Math.round(total_cop * 100)),
      "line_items[0][price_data][product_data][name]": tipo || "Pasadia Atolon Beach Club",
      "line_items[0][price_data][product_data][description]": fecha
        ? `Reserva ${reserva_id} — ${fecha}`
        : `Reserva ${reserva_id}`,
      "metadata[reserva_id]": reserva_id,
    });

    if (email) params.set("customer_email", email);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
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

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
