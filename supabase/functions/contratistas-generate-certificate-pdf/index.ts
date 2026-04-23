// Genera HTML imprimible (o redirige a URL firmada con PDF ya renderizado).
// Para MVP retornamos HTML con QR — el navegador del usuario imprime a PDF.
// Ruta útil para abrir el certificado embebible desde email o panel.
//
// GET ?codigo=ATL-CUR-YYMMDD-CEDULA-XXXX

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" };

function sb() { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const codigo = url.searchParams.get("codigo");
  if (!codigo) return new Response("codigo requerido", { status: 400 });

  const { data: cert } = await sb().from("certificados_curso").select("*").eq("codigo", codigo).maybeSingle();
  if (!cert) return new Response("certificado no encontrado", { status: 404 });

  const verifyUrl = `https://www.atolon.co/verificar/${cert.codigo}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(verifyUrl)}&size=180x180`;
  const emision = new Date(cert.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const vence = cert.expires_at ? new Date(cert.expires_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "—";
  const vigente = cert.passed && (!cert.expires_at || new Date(cert.expires_at) > new Date());

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Certificado ${cert.codigo}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Georgia', serif; background: #FAF6EE; padding: 40px 20px; }
      .cert { max-width: 820px; margin: 0 auto; background: white; padding: 60px 50px; border: 3px solid #0D1B3E; position: relative; }
      .cert::before { content: ""; position: absolute; inset: 12px; border: 1px solid #C8B99A; pointer-events: none; }
      .header { text-align: center; margin-bottom: 36px; }
      .eye-brow { font-size: 11px; color: #C8B99A; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 6px; }
      h1 { font-family: 'Arial', sans-serif; font-size: 42px; color: #0D1B3E; font-weight: 900; letter-spacing: 2px; margin-bottom: 8px; }
      .sub { font-size: 14px; color: #666; letter-spacing: 1px; text-transform: uppercase; }
      .body { text-align: center; margin: 30px 0; }
      .otorga { font-size: 13px; color: #666; font-style: italic; margin-bottom: 10px; }
      .nombre { font-family: 'Arial', sans-serif; font-size: 30px; color: #0D1B3E; font-weight: 800; border-bottom: 2px solid #C8B99A; padding-bottom: 10px; display: inline-block; min-width: 400px; }
      .detalle { font-size: 13px; color: #666; margin: 16px 0; line-height: 1.8; }
      .code-box { background: #0D1B3E; color: white; padding: 14px 24px; display: inline-block; border-radius: 6px; margin: 20px 0; font-family: monospace; font-size: 16px; letter-spacing: 1px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1fr auto 1fr; gap: 30px; margin-top: 30px; align-items: center; }
      .left, .right { font-size: 12px; color: #666; }
      .left dt, .right dt { font-weight: 700; color: #0D1B3E; margin-top: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
      .left dd, .right dd { margin-left: 0; font-size: 13px; color: #333; }
      .qr { text-align: center; }
      .qr img { border: 4px solid white; box-shadow: 0 0 0 1px #ddd; }
      .status { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 8px; }
      .status.ok { background: #DCFCE7; color: #166534; }
      .status.expired { background: #FEE2E2; color: #991B1B; }
      .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px dashed #ccc; font-size: 10px; color: #888; line-height: 1.7; }
      .no-print { text-align: center; margin-top: 20px; }
      .no-print button { padding: 10px 24px; background: #0D1B3E; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; }
      @media print { body { background: white; padding: 0; } .cert { border: 3px solid #0D1B3E; margin: 0; } .no-print { display: none !important; } @page { size: A4; margin: 12mm; } }
    </style></head><body>
    <div class="cert">
      <div class="header">
        <div class="eye-brow">Atolón · Beach Club</div>
        <h1>CERTIFICADO</h1>
        <div class="sub">Inducción en Seguridad y Salud en el Trabajo</div>
      </div>
      <div class="body">
        <div class="otorga">Se certifica que</div>
        <div class="nombre">${cert.nombre || "—"}</div>
        <div class="detalle">identificad${(cert.nombre || "").match(/a$/i) ? "a" : "o"} con C.C. <strong>${cert.cedula}</strong><br/>
        ha completado satisfactoriamente el curso obligatorio de inducción SST<br/>
        con un puntaje de <strong>${cert.score}%</strong>.</div>
        <div class="code-box">${cert.codigo}</div>
        <div>
          <span class="status ${vigente ? "ok" : "expired"}">${vigente ? "✓ Vigente" : "Expirado"}</span>
        </div>
      </div>
      <div class="grid">
        <div class="left">
          <dt>Emisión</dt><dd>${emision}</dd>
          <dt>Vigencia hasta</dt><dd>${vence}</dd>
        </div>
        <div class="qr">
          <img src="${qrUrl}" alt="QR verificación" width="180" height="180"/>
          <div style="font-size:10px;color:#888;margin-top:6px;">Verificar online</div>
        </div>
        <div class="right">
          <dt>Base legal</dt><dd style="font-size:11px;">Decreto 1072/2015 · CST Art. 34<br/>Ley 527/1999 (firma electrónica)</dd>
        </div>
      </div>
      <div class="footer">
        Emitido por Atolón Beach Club · Isla Tierra Bomba, Cartagena de Indias, Colombia<br/>
        Para verificar la autenticidad de este documento: ${verifyUrl}
      </div>
    </div>
    <div class="no-print">
      <button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
    </div>
  </body></html>`;

  return new Response(html, {
    status: 200,
    headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" },
  });
});
