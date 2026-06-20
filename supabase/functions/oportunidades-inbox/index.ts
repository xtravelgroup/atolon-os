// oportunidades-inbox — Webhook para recibir CVs por email.
// ──────────────────────────────────────────────────────────────────
// Cuando alguien envía un CV a oportunidades@atolon.co, el proveedor de
// email entrante (Mailgun routes / Cloudflare Email Workers / Postmark
// inbound) llama a este webhook con el contenido parseado.
//
// Acepta varios formatos de payload (Mailgun-style, JSON simple, etc) y
// extrae: from, subject, body, attachments. Sube los attachments al
// bucket cv-postulaciones e inserta una fila en rh_postulaciones con
// fuente='email' y vacante_id=NULL (queda en el inbox).
//
// Setup en DNS / Mailgun:
// 1. MX records de atolon.co apuntando a mxa.mailgun.org
// 2. Mailgun Routes: si recipient = oportunidades@atolon.co → forward a
//    https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/oportunidades-inbox
// 3. Función desplegada con --no-verify-jwt (anon allowed).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" };

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } }); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Parsear body — puede venir como JSON o multipart/form-data
  let payload: any = {};
  const ctype = req.headers.get("content-type") || "";
  try {
    if (ctype.includes("application/json")) {
      payload = await req.json();
    } else if (ctype.includes("multipart/form-data") || ctype.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      payload = Object.fromEntries(form.entries());
      // Mailgun manda attachments como attachment-1, attachment-2, etc.
      const attachments: any[] = [];
      for (const [k, v] of form.entries()) {
        if (k.startsWith("attachment-") && v instanceof File) attachments.push(v);
      }
      payload._attachments = attachments;
    } else {
      payload = JSON.parse(await req.text());
    }
  } catch (e) {
    return json({ error: "Body inválido", detail: (e as Error).message }, 400);
  }

  // Normalizar campos (Mailgun y otros)
  const from        = payload.from || payload.From || payload.sender || "";
  const subject     = payload.subject || payload.Subject || "(sin asunto)";
  const bodyPlain   = payload["body-plain"] || payload.text || payload.TextBody || "";
  const bodyHtml    = payload["body-html"] || payload.html || payload.HtmlBody || "";
  const messageId   = payload["Message-Id"] || payload.message_id || payload.MessageID || crypto.randomUUID();

  // Email del remitente
  const emailMatch = String(from).match(/<([^>]+)>/);
  const senderEmail = (emailMatch ? emailMatch[1] : from).toLowerCase().trim();
  const senderName  = String(from).replace(/<[^>]*>/, "").trim() || senderEmail.split("@")[0];

  if (!senderEmail || !senderEmail.includes("@")) {
    return json({ error: "Email de remitente inválido" }, 400);
  }

  // Verificar duplicados por message_id (timeout 10s — antes podia colgar)
  const lookup = await fetch(`${SUPABASE_URL}/rest/v1/rh_postulaciones?email_message_id=eq.${encodeURIComponent(messageId)}&select=id`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    signal: AbortSignal.timeout(10_000),
  }).then(r => r.json()).catch(() => []);
  if (Array.isArray(lookup) && lookup.length > 0) {
    return json({ ok: true, skipped: "duplicado", id: lookup[0].id });
  }

  // Subir attachments al bucket
  const attachmentsList: any[] = [];
  let cvUrl: string | null = null;
  let cvNombre: string | null = null;
  const files: File[] = payload._attachments || [];
  for (const f of files) {
    try {
      const ext = (f.name.split(".").pop() || "bin").toLowerCase();
      const path = `inbox/${Date.now()}-${crypto.randomUUID().slice(0, 6)}.${ext}`;
      const buf = await f.arrayBuffer();
      // Timeout 30s en upload — un attachment lento bloqueaba la edge
      // function entera.
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/cv-postulaciones/${path}`, {
        method: "POST",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": f.type || "application/octet-stream" },
        body: buf,
        signal: AbortSignal.timeout(30_000),
      });
      if (up.ok) {
        attachmentsList.push({ nombre: f.name, url: path, mime: f.type, size: f.size });
        // Si es PDF o DOC, asumir que es el CV
        if (!cvUrl && /\.(pdf|doc|docx)$/i.test(f.name)) {
          cvUrl = path;
          cvNombre = f.name;
        }
      }
    } catch (e) {
      console.warn("[inbox] attachment upload failed:", (e as Error).message);
    }
  }

  // Insertar postulación al inbox
  const codigo = `INBOX-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/rh_postulaciones`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      codigo,
      vacante_id: null,
      nombre: senderName,
      email: senderEmail,
      cv_url: cvUrl,
      cv_nombre: cvNombre,
      adjuntos: attachmentsList,
      fuente: "email",
      estado: "recibida",
      email_subject: String(subject).slice(0, 500),
      email_body_text: String(bodyPlain).slice(0, 50000),
      email_body_html: String(bodyHtml).slice(0, 200000),
      email_message_id: String(messageId),
      email_received_at: new Date().toISOString(),
      email_raw: payload._attachments ? null : payload, // si hay attachments el payload tiene Files que no serializan
    }),
  });

  if (!ins.ok) {
    const errBody = await ins.text();
    return json({ error: "Insert falló", detail: errBody.slice(0, 500) }, 500);
  }
  const inserted = await ins.json();
  return json({ ok: true, id: inserted[0]?.id, codigo, attachments: attachmentsList.length });
});
