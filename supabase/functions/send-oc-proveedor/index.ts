// send-oc-proveedor — Envía la OC al proveedor por email con PDF adjunto.
// POST JSON: { to: string[], cc?: string[], oc: {...}, pdfBase64?: string, replyTo?: string }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const DEFAULT_FROM = "Atolón Compras <compras@atolon.co>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const fmtCOP = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CO");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const body = await req.json();
    const { to, cc = [], oc, pdfBase64, replyTo, customMessage } = body;

    if (!Array.isArray(to) || to.length === 0) {
      return jsonResp({ error: "`to` (array) required" }, 400);
    }
    if (!oc?.codigo) return jsonResp({ error: "`oc` con codigo es requerido" }, 400);

    // ── HTML del cuerpo ──────────────────────────────────────────────────
    // Solo se envían CANTIDADES al proveedor — los precios los pone él en
    // su cotización-respuesta. Esto evita anclar precios viejos y permite
    // al proveedor cotizar libremente.
    const items = Array.isArray(oc.items) ? oc.items : [];
    const itemsRows = items.map((it: any, i: number) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 6px;font-size:12px;color:#374151;">${i + 1}</td>
        <td style="padding:8px 6px;font-size:12px;color:#111827;">${escapeHtml(it.item || it.nombre || "—")}</td>
        <td style="padding:8px 6px;font-size:13px;color:#111827;text-align:right;font-weight:700;">${it.cant || 0}</td>
        <td style="padding:8px 6px;font-size:12px;color:#374151;">${escapeHtml(it.unidad || "")}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px;color:#111827;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#0D1B3E;color:#C8B99A;padding:24px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:0.7;">Interop Colombia SAS</div>
      <div style="font-size:24px;font-weight:800;margin-top:6px;">Orden de Compra ${escapeHtml(oc.codigo)}</div>
      <div style="font-size:13px;margin-top:4px;opacity:0.85;">Fecha emisión: ${escapeHtml(oc.fecha_emision || "")}</div>
    </div>

    <div style="padding:24px;">
      <p style="font-size:14px;margin:0 0 12px 0;">Hola${oc.proveedor_nombre ? " <strong>" + escapeHtml(oc.proveedor_nombre) + "</strong>" : ""},</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;">
        ${customMessage ? escapeHtml(customMessage) : "Te enviamos a continuación nuestra orden de compra. Por favor confirma recepción y disponibilidad de los items solicitados."}
      </p>

      <div style="background:#F5F2EA;border-radius:8px;padding:14px 16px;margin:16px 0;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:700;">Proveedor</div>
        <div style="font-size:15px;font-weight:700;color:#111827;margin-top:2px;">${escapeHtml(oc.proveedor_nombre || "—")}</div>
        ${oc.proveedor_nit ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">NIT: ${escapeHtml(oc.proveedor_nit)}</div>` : ""}
        ${oc.proveedor_email ? `<div style="font-size:12px;color:#6b7280;">${escapeHtml(oc.proveedor_email)}</div>` : ""}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        <thead>
          <tr style="background:#0D1B3E;color:#fff;">
            <th style="padding:10px 6px;font-size:11px;text-align:left;">#</th>
            <th style="padding:10px 6px;font-size:11px;text-align:left;">Ítem</th>
            <th style="padding:10px 6px;font-size:11px;text-align:right;">Cantidad</th>
            <th style="padding:10px 6px;font-size:11px;text-align:left;">Unidad</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <div style="margin-top:18px;padding:14px 16px;background:#F5F2EA;border-left:4px solid #C8B99A;border-radius:6px;font-size:13px;color:#111827;">
        <strong>Por favor confirme disponibilidad y envíe cotización con sus precios.</strong>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Una vez recibida la cotización aprobaremos y emitiremos la OC final.</div>
      </div>

      ${oc.notas ? `<div style="margin-top:16px;padding:12px;background:#FEF3C7;border-radius:6px;font-size:12px;"><strong>Notas:</strong> ${escapeHtml(oc.notas)}</div>` : ""}

      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
        <p style="margin:0 0 6px 0;"><strong>Entrega:</strong> Bodeguita (Cartagena). Coordinar con equipo de muelle antes de despachar.</p>
        <p style="margin:0;"><strong>Cualquier duda</strong> respondes a este correo. Gracias por tu servicio.</p>
      </div>
    </div>

    <div style="background:#F5F2EA;color:#6b7280;padding:14px;text-align:center;font-size:11px;">
      Interop Colombia SAS · Cartagena, Colombia
    </div>
  </div>
</body></html>`;

    // ── Adjuntar PDF si viene ────────────────────────────────────────────
    const attachments = pdfBase64
      ? [{ filename: `OC-${oc.codigo}.pdf`, content: pdfBase64 }]
      : undefined;

    const resendBody: any = {
      from: DEFAULT_FROM,
      to,
      subject: `Orden de Compra ${oc.codigo} · Atolón`,
      html,
    };
    if (cc.length) resendBody.cc = cc;
    if (replyTo) resendBody.reply_to = replyTo;
    if (attachments) resendBody.attachments = attachments;

    // Timeout 15s en fetch a Resend. Sin esto, un Resend lento dejaba la
    // funcion esperando hasta el timeout global y el usuario veia "Enviando..."
    // por minutos sin feedback.
    const sendCtrl = new AbortController();
    const sendTimer = setTimeout(() => sendCtrl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: sendCtrl.signal,
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(resendBody),
      });
    } catch (e: any) {
      clearTimeout(sendTimer);
      const isAbort = e?.name === "AbortError";
      return jsonResp({ ok: false, error: isAbort ? "Resend timeout (15s)" : "Resend network error", detail: String(e?.message || e) }, 504);
    }
    clearTimeout(sendTimer);
    const data = await res.json();
    if (!res.ok) return jsonResp({ ok: false, error: "Resend error", detail: data }, res.status);

    return jsonResp({ ok: true, id: data.id });
  } catch (e: any) {
    return jsonResp({ ok: false, error: String(e?.message || e) }, 500);
  }
});

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"} as any)[c]);
}

function jsonResp(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
