// meta-capi — Meta Conversions API (server-side Purchase)
//
// Recibe { reserva_id, value, currency?, email?, phone? } y envía el evento
// Purchase a Meta Graph API usando meta_pixel_id + meta_capi_token de la
// tabla `configuracion` (leídos con service role; el token NUNCA se expone
// al cliente). Se deduplica con el pixel del navegador usando
// event_id = reserva_id (gtm.js manda el mismo eventID).
//
// Llamado fire-and-forget desde wompi-webhook y zoho-payments al confirmar
// pago. Nunca lanza de forma que rompa el flujo de pago: ante cualquier
// problema responde 200 con ok:false.
//
// Env (auto): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// config.toml: verify_jwt = false

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v19.0";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const normEmail = (e: string) => e.trim().toLowerCase();
const normPhone = (p: string) => p.replace(/[^0-9]/g, "");

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const reservaId = String(body.reserva_id || "").trim();
    const value = Number(body.value || 0);
    const currency = String(body.currency || "COP");
    if (!reservaId || value <= 0) return json({ ok: false, skipped: "bad_input" });

    const SB = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await SB
      .from("configuracion")
      .select("meta_pixel_id, meta_capi_token")
      .eq("id", "atolon")
      .single();

    const pixelId = (cfg?.meta_pixel_id || "").toString().trim();
    const token = (cfg?.meta_capi_token || "").toString().trim();
    if (!pixelId || !token) return json({ ok: false, skipped: "no_config" });

    // Señales de la sesión (best-effort): reserva → track_ingresos.sesion_id
    // → track_sesiones (fbclid + url de entrada). Mejora el match quality.
    let fbc: string | null = null;
    let eventSourceUrl = "https://www.atolon.co/booking";
    try {
      const { data: ing } = await SB
        .from("track_ingresos")
        .select("sesion_id")
        .eq("reserva_id", reservaId)
        .limit(1);
      const sesId = ing?.[0]?.sesion_id;
      if (sesId) {
        const { data: ses } = await SB
          .from("track_sesiones")
          .select("fbclid, entrada_url")
          .eq("id", sesId)
          .limit(1);
        const s = ses?.[0];
        if (s?.entrada_url) eventSourceUrl = s.entrada_url;
        if (s?.fbclid) fbc = `fb.1.${Date.now()}.${s.fbclid}`;
      }
    } catch (_) { /* señales opcionales */ }

    const userData: Record<string, unknown> = {};
    const email = (body.email || "").toString();
    const phone = (body.phone || "").toString();
    if (email.includes("@")) userData.em = [await sha256(normEmail(email))];
    if (normPhone(phone).length >= 7) userData.ph = [await sha256(normPhone(phone))];
    if (fbc) userData.fbc = fbc;

    const payload = {
      data: [{
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: reservaId, // dedup con el pixel del navegador
        action_source: "website",
        event_source_url: eventSourceUrl,
        user_data: userData,
        custom_data: { value, currency },
      }],
    };

    const url =
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      const out = await resp.json().catch(() => ({}));
      return json({ ok: resp.ok, status: resp.status, fb: out });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // Nunca romper el flujo de pago: el caller hace fire-and-forget.
    return json({ ok: false, error: (e as Error).message });
  }
});
