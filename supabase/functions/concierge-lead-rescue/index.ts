// concierge-lead-rescue — Supabase Edge Function
// Detecta leads en estado "Nuevo" con mas de 5 minutos sin contactar y
// envia un WhatsApp (via template Meta) o email (fallback) preguntando
// si necesitan ayuda. La conversacion queda abierta para el Concierge AI.
//
// pg_cron:
//   SELECT cron.schedule('concierge-lead-rescue', '*/2 * * * *',
//     'SELECT net.http_post(
//       url:=''https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/concierge-lead-rescue'',
//       headers:=''{"Content-Type":"application/json","Authorization":"Bearer {SERVICE_ROLE_KEY}"}''::jsonb,
//       body:=''{}''::jsonb)');
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   RESEND_API_KEY                       — para email fallback
//   CONCIERGE_RESCUE_TEMPLATE (opcional) — nombre del template Meta aprobado
//                                          (default: 'new_conversation', lang es_MX)
//                                          Debe tener un {{1}} en el body — ahi
//                                          va el mensaje completo del rescate.
//   CONCIERGE_RESCUE_LANG     (opcional) — lang del template (default 'es_MX')
//   CONCIERGE_RESCUE_MIN_MIN  (opcional) — minutos que debe llevar el lead
//                                          en Nuevo antes de rescatar (default 5)
//   CONCIERGE_RESCUE_LIMIT    (opcional) — max leads por ejecucion (default 20)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY") ?? "";
const TEMPLATE     = Deno.env.get("CONCIERGE_RESCUE_TEMPLATE") ?? "new_conversation";
const LANG         = Deno.env.get("CONCIERGE_RESCUE_LANG")     ?? "es_MX";
const MIN_MINUTES  = Number(Deno.env.get("CONCIERGE_RESCUE_MIN_MIN") ?? "5");
const LIMIT        = Number(Deno.env.get("CONCIERGE_RESCUE_LIMIT")   ?? "20");

function mensajeRescate(nombre: string) {
  // Meta rechaza el parametro si tiene \n, \t o mas de 4 espacios seguidos.
  // Todo el mensaje va inline. El template 'new_conversation' envuelve con
  // "Hola, espero te encuentres bien!" arriba y "Saludos" abajo.
  const primer = String(nombre || "").trim().split(" ")[0] || "";
  const saludo = primer ? `${primer}, ` : "";
  return `${saludo}soy Sofia de Atolón Beach Club 🌴 Vi que quedaste interesado en reservar. ¿Puedo ayudarte a completarla o resolver alguna duda?`;
}

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function enviarWhatsApp(nombre: string, tel: string) {
  // El template Meta debe tener un {{1}} en el body — ahi metemos el mensaje
  // completo del rescate. Default: new_conversation (es_MX), aprobado.
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      to: tel,
      template: TEMPLATE,
      lang: LANG,
      params: [mensajeRescate(nombre)],
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function enviarEmail(nombre: string, email: string, leadId: string) {
  if (!RESEND_KEY) return { ok: false, error: "resend_no_configurado" };
  const primerNombre = String(nombre || "").split(" ")[0] || "";
  const html = `
    <!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; background: #F5EDD8; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background: #FFF; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        <img src="https://www.atolon.co/atolon-logo.png" alt="Atolón" style="height: 40px; display: block; margin: 0 auto 20px;">
        <h2 style="color: #143247; font-size: 20px; margin: 0 0 12px;">Hola ${primerNombre || "👋"},</h2>
        <p style="color: #4A6577; font-size: 15px; line-height: 1.6;">
          Vimos que estabas mirando <strong>Atolón Beach Club</strong>. ¿Puedo ayudarte a completar tu reserva o resolver alguna duda?
        </p>
        <p style="color: #4A6577; font-size: 15px; line-height: 1.6;">
          Estoy aquí para ti — cuéntame qué necesitas.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="https://wa.me/573203058269?text=${encodeURIComponent("Hola, estoy interesado en Atolón Beach Club")}"
             style="display: inline-block; background: #25D366; color: #FFF; padding: 12px 28px; border-radius: 100px; text-decoration: none; font-weight: 700;">
            💬 Chatear por WhatsApp
          </a>
        </div>
        <p style="color: #8FA5B8; font-size: 12px; text-align: center; margin-top: 24px;">
          Atolón Beach Club · Cartagena · <a href="https://www.atolon.co" style="color: #1E7BA8;">atolon.co</a>
        </p>
      </div>
    </body></html>
  `;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Atolón Beach Club <hola@atolon.co>",
      to: [email],
      reply_to: "hola@atolon.co",
      subject: `${primerNombre ? primerNombre + ", " : ""}¿puedo ayudarte con tu reserva en Atolón?`,
      html,
      tags: [
        { name: "tipo", value: "lead_rescue" },
        { name: "lead_id", value: leadId.slice(0, 50) },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const cutoff = new Date(Date.now() - MIN_MINUTES * 60 * 1000).toISOString();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, nombre, email, contacto, tel, stage, created_at")
    .eq("stage", "Nuevo")
    .lt("created_at", cutoff)
    .is("concierge_rescued_at", null)
    .order("created_at", { ascending: true })
    .limit(LIMIT);

  if (error) return json({ error: error.message }, 500);
  if (!leads?.length) return json({ ok: true, processed: 0, skipped: 0, message: "no_pending_leads" });

  const results: any[] = [];
  let sentWA = 0, sentEmail = 0, skipped = 0;

  for (const lead of leads) {
    const email = String(lead.email || (String(lead.contacto || "").includes("@") ? lead.contacto : "") || "").trim();
    const tel   = String(lead.tel || "").replace(/\D/g, "");
    const nombre = String(lead.nombre || "").trim();

    // Prioridad: WA si hay tel valido (>= 7 digitos), sino email.
    let channel: string | null = null;
    let sendResult: any = null;

    if (tel.length >= 7) {
      sendResult = await enviarWhatsApp(nombre, tel);
      if (sendResult.ok) { channel = "whatsapp"; sentWA++; }
    }
    if (!channel && email.includes("@")) {
      sendResult = await enviarEmail(nombre, email, lead.id);
      if (sendResult.ok) { channel = "email"; sentEmail++; }
    }

    if (channel) {
      // Marcar como rescatado para no re-enviar. Si es WA y fallo, quizas el
      // template no existe — se intenta email y se marca con "email".
      await supabase.from("leads").update({
        concierge_rescued_at: new Date().toISOString(),
        concierge_rescue_channel: channel,
      }).eq("id", lead.id);
      results.push({ id: lead.id, channel, ok: true });
    } else {
      // Sin canal disponible o ambos fallaron. Marcamos con channel=null pero
      // NO seteamos concierge_rescued_at — asi lo reintenta en la proxima corrida
      // (util cuando el template WA no existe todavia).
      skipped++;
      results.push({ id: lead.id, channel: null, ok: false, error: sendResult?.data || "sin_canal" });
    }
  }

  return json({
    ok: true,
    processed: results.length,
    sent_wa: sentWA,
    sent_email: sentEmail,
    skipped,
    results,
  });
});
