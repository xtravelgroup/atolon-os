// Wrapper de Resend para notificaciones del módulo Contratistas.
// POST { to: string[], subject, html, kind, contratista_id? }
// Registra en contratistas_notificaciones.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
// TODO: cambiar a sst@atolon.co / contratistas@atolon.co cuando existan
const FROM = "Atolón · Contratistas <reservas@atolon.co>";
const REPLY_TO = "eric@atoloncartagena.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function sb() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const body = await req.json().catch(() => ({}));
  const { to, subject, html, kind, contratista_id, trabajador_id } = body;
  if (!Array.isArray(to) || to.length === 0 || !subject || !html) {
    return new Response(JSON.stringify({ error: "to[], subject, html requeridos" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: REPLY_TO }),
  });
  const data = await res.json();

  // Registrar notificación
  try {
    await sb().from("contratistas_notificaciones").insert({
      contratista_id: contratista_id || null,
      trabajador_id: trabajador_id || null,
      canal: "email",
      tipo: kind || "otro",
      destinatario: to.join(", "),
      asunto: subject,
      cuerpo: html,
      enviado: res.ok,
      enviado_at: res.ok ? new Date().toISOString() : null,
      error: res.ok ? null : JSON.stringify(data).slice(0, 500),
      metadata: { resend_id: data?.id || null },
    });
  } catch (e) {
    console.error("log notif failed:", e);
  }

  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : res.status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
