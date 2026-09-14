// supabase/functions/ga4-purchase/index.ts
//
// GA4 Measurement Protocol — envía server-side el evento "purchase" cuando
// una reserva pasa a estado "confirmado". El trigger notify_ga4_purchase
// invoca este function con { reserva_id }. Este es el complemento del
// gtmPurchase que ya dispara el navegador (src/lib/gtm.js): aquí caen las
// reservas que confirman por WhatsApp / Marea / agencias sin volver a pasar
// por el cliente.
//
// Secrets:
//   GA_API_SECRET     (obligatorio) — Admin > Data streams > MP API secrets.
//   GA_MEASUREMENT_ID (opcional)    — fallback a configuracion.ga4_id.
//   GA_DEBUG=1        (opcional)    — usa endpoint debug/mp/collect, no registra.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.

import { createClient } from "npm:@supabase/supabase-js@2";

const GA_API_SECRET = Deno.env.get("GA_API_SECRET");
const GA_MEASUREMENT_ID_ENV = Deno.env.get("GA_MEASUREMENT_ID") || "";
const DEBUG = Deno.env.get("GA_DEBUG") === "1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// client_id sintético determinístico para reservas que no vinieron del widget
// (WhatsApp, agencias). Estable por reserva → GA4 no duplica usuarios.
async function syntheticClientId(seed: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`atolon-os:${seed}`),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${parseInt(hex.slice(0, 8), 16)}.${parseInt(hex.slice(8, 16), 16)}`;
}

async function resolveMeasurementId(): Promise<string | null> {
  if (GA_MEASUREMENT_ID_ENV) return GA_MEASUREMENT_ID_ENV;
  const { data } = await supabase
    .from("configuracion")
    .select("ga4_id")
    .eq("id", "atolon")
    .maybeSingle();
  return data?.ga4_id || null;
}

Deno.serve(async (req) => {
  try {
    if (!GA_API_SECRET) {
      return new Response("GA_API_SECRET no configurado", { status: 500 });
    }

    const { reserva_id } = await req.json().catch(() => ({}));
    if (!reserva_id) {
      return new Response("reserva_id requerido", { status: 400 });
    }

    const { data: r, error } = await supabase
      .from("reservas")
      .select(
        "id, estado, total, tipo, canal, fecha, pax, created_at, " +
        "ga_client_id, ga_session_id, ga_sent_at",
      )
      .eq("id", reserva_id)
      .maybeSingle();

    if (error) {
      return new Response(`reserva lookup: ${error.message}`, { status: 500 });
    }
    if (!r) {
      return new Response("reserva no encontrada", { status: 404 });
    }
    if (r.estado !== "confirmado") {
      return new Response("no confirmada, sin envío", { status: 200 });
    }
    if (r.ga_sent_at) {
      return new Response("ya enviada", { status: 200 });
    }

    const measurementId = await resolveMeasurementId();
    if (!measurementId) {
      return new Response(
        "sin GA_MEASUREMENT_ID (env ni configuracion.ga4_id)",
        { status: 500 },
      );
    }

    // lead_time_dias entre creación y visita — dimensión útil para audiencias
    // "compra impulsiva" vs "planificada" en GA4.
    const leadTime = r.fecha
      ? Math.max(
        0,
        Math.round(
          (new Date(r.fecha).getTime() - new Date(r.created_at).getTime()) /
            86_400_000,
        ),
      )
      : undefined;

    const total = Number(r.total) || 0;
    const pax = r.pax || 1;

    const payload = {
      client_id: r.ga_client_id ?? (await syntheticClientId(String(r.id))),
      timestamp_micros: Date.now() * 1000,
      non_personalized_ads: false,
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: String(r.id),
            currency: "COP",
            value: total,
            ...(r.ga_session_id ? { session_id: r.ga_session_id } : {}),
            engagement_time_msec: 100,
            canal_origen: r.canal ?? "whatsapp",
            pax,
            lead_time_dias: leadTime,
            items: [
              {
                item_id: r.tipo || "pasadia",
                item_name: r.tipo || "Pasadía",
                item_category: "Pasadía",
                price: total / pax,
                quantity: pax,
              },
            ],
          },
        },
      ],
    };

    const endpoint = DEBUG ? "debug/mp/collect" : "mp/collect";
    const url =
      `https://www.google-analytics.com/${endpoint}` +
      `?measurement_id=${measurementId}&api_secret=${GA_API_SECRET}`;

    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("GA4 MP error", res.status, txt);
      return new Response(`GA4 ${res.status}`, { status: 502 });
    }

    if (DEBUG) {
      console.log("GA4 debug validation:", await res.text());
    } else {
      // Idempotencia: marcamos ga_sent_at para que el trigger no vuelva a
      // disparar aunque estado se re-actualice.
      await supabase
        .from("reservas")
        .update({ ga_sent_at: new Date().toISOString() })
        .eq("id", r.id);
    }

    return new Response(JSON.stringify({ ok: true, reserva_id: r.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ga4-purchase fatal:", e);
    return new Response(String(e), { status: 500 });
  }
});
