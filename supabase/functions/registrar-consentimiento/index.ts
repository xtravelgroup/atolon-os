// Registra el consentimiento (habeas data) + IP + user-agent del cliente al momento
// de hacer la reserva en la página. Lo llama BookingPopup justo después de crear la
// reserva. La IP se toma del servidor (x-forwarded-for), no del cliente → evidencia
// confiable para chargebacks. Guarda en habeas_data_consents y en reservas.ip_reserva.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const SB = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const reservaId = String(body.reserva_id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    if (!reservaId && !email) return json({ error: "falta reserva_id o email" }, 400);

    // IP real del cliente (primer hop de x-forwarded-for).
    const xff = req.headers.get("x-forwarded-for") || "";
    const ip = (xff.split(",")[0] || "").trim() || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || null;
    const ua = (body.user_agent || req.headers.get("user-agent") || "").toString().slice(0, 500);

    // Versión de política vigente (para dejar registro de qué aceptó).
    let version = null;
    try {
      const { data: pol } = await SB.from("habeas_data_policy").select("version").order("vigente_desde", { ascending: false }).limit(1);
      version = pol?.[0]?.version || null;
    } catch { /* ignore */ }

    // 1) Guardar IP/UA en la reserva.
    if (reservaId) {
      await SB.from("reservas").update({ ip_reserva: ip, user_agent_reserva: ua }).eq("id", reservaId).then(() => {}).catch(() => {});
    }

    // 2) Registrar el consentimiento (evidencia de autorización + IP).
    let consentId = null;
    if (email) {
      const { data, error } = await SB.from("habeas_data_consents").insert({
        titular_email: email,
        titular_identif: body.identif || null,
        tipo: body.tipo || "tratamiento_datos_reserva",
        version_politica: version,
        canal_captura: body.canal || "web_booking",
        otorgado_at: new Date().toISOString(),
        ip_origen: ip,
        user_agent: ua,
      }).select("id").single();
      if (error) return json({ ok: true, ip, consent: null, warn: error.message });
      consentId = data?.id || null;
    }
    return json({ ok: true, ip, consent_id: consentId, version });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
