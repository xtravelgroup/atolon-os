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
  // Validar formato de cada email antes de mandar a Resend. Sin esto, un
  // email malformado entre los recipients hacia que Resend rechazara la
  // request entera y NINGUNO recibia el mensaje.
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const invalidos = to.filter((e: unknown) => typeof e !== "string" || !emailRegex.test(e));
  if (invalidos.length > 0) {
    return new Response(
      JSON.stringify({ error: "invalid_recipients", invalidos: invalidos.slice(0, 5) }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
  if (!subject) return new Response(JSON.stringify({ error: "`subject` required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  if (!html)    return new Response(JSON.stringify({ error: "`html` required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

  // Timeout 15s para no colgar la function si Resend está lento.
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
  } catch (e) {
    const isAbort = e instanceof Error && e.name === "AbortError";
    return new Response(
      JSON.stringify({ error: isAbort ? "resend_timeout" : "resend_network_error" }),
      { status: 504, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : res.status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
