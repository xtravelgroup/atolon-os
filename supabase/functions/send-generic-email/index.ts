// Generic email sender via Resend — útil para correos ad-hoc (correcciones, reportes manuales, etc.)
// POST JSON: { to: string[], subject: string, html: string, from?: string, replyTo?: string }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const DEFAULT_FROM = "Atolón Beach Club <reservas@atolon.co>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: CORS });

  const body = await req.json().catch(() => ({}));
  const { to, subject, html, from = DEFAULT_FROM, replyTo } = body;

  if (!Array.isArray(to) || to.length === 0) {
    return new Response(JSON.stringify({ error: "`to` (array) required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  if (!subject) return new Response(JSON.stringify({ error: "`subject` required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  if (!html)    return new Response(JSON.stringify({ error: "`html` required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : res.status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
