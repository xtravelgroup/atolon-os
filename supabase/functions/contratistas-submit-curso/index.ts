// Procesa la entrega del curso:
// - Valida token de trabajador
// - Puntúa respuestas contra el banco de preguntas
// - Si pasa (≥ 70%): genera certificado + vigencia 1 año + envía email con QR
//
// POST { token, answers: [{ qid, option }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Banco de preguntas del curso de inducción SST (alineado con curso_induccion.html)
// correct es índice 0-based de la respuesta correcta
// Alineado con cursoContent.js en el frontend
const QUESTIONS = [
  { id: "q1",  correct: 1 },  // ¿Cómo se llega a Atolon? → lancha
  { id: "q2",  correct: 2 },  // chaleco salvavidas
  { id: "q3",  correct: 2 },  // huésped pregunta → cortés + anfitrión
  { id: "q4",  correct: 2 },  // fotos → no sin autorización escrita
  { id: "q5",  correct: 2 },  // redes sociales → no sin autorización
  { id: "q6",  correct: 2 },  // tarea peligrosa → parar y consultar
  { id: "q7",  correct: 3 },  // alcohol → no bajo ninguna circunstancia
  { id: "q8",  correct: 1 },  // ARL → obligatoria
  { id: "q9",  correct: 2 },  // accidente pequeño → poner a salvo + avisar
  { id: "q10", correct: 2 },  // zonas restringidas → cocina, habitaciones, etc.
  { id: "q11", correct: 2 },  // residuos → llevárselos
  { id: "q12", correct: 2 },  // trabajadores adicionales → registrados previamente
  { id: "q13", correct: 1 },  // ruido → horario acordado fuera de operación
  { id: "q14", correct: 2 },  // zona restringida sin autorización → falta grave
  { id: "q15", correct: 1 },  // no reportar → se pierde oportunidad de prevenir
];

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" };
const SEND_URL = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/contratistas-send-notification";
const PORTAL_BASE = "https://www.atolon.co";

function sb() { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); }

function layoutEmail(content: string) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAF6EE;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 6px 30px rgba(13,27,62,0.1);">
  <div style="background:#0D1B3E;padding:28px;text-align:center;">
    <div style="font-size:11px;color:#C8B99A;letter-spacing:3px;text-transform:uppercase;">ATOLÓN · BEACH CLUB</div>
    <div style="font-size:22px;color:white;font-weight:800;margin-top:6px;">Certificado SST</div>
  </div>
  <div style="padding:32px;color:#0D1B3E;font-size:14px;line-height:1.6;">${content}</div>
  <div style="background:#F5F2EA;padding:18px 28px;font-size:10px;color:#666;text-align:center;line-height:1.5;">
    Atolón Beach Club · Cartagena de Indias · Colombia<br/>
    Certificado válido por 12 meses desde su emisión.
  </div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { token, answers } = await req.json();
    if (!token) return new Response(JSON.stringify({ error: "token requerido" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const supabase = sb();
    const { data: t } = await supabase.from("contratistas_trabajadores")
      .select("id, nombre, cedula, correo, contratista_id, curso_completado").eq("curso_token", token).maybeSingle();
    if (!t) return new Response(JSON.stringify({ error: "Token inválido" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });

    // Puntuar
    const ans = Array.isArray(answers) ? answers : [];
    const total = QUESTIONS.length;
    let correct = 0;
    QUESTIONS.forEach(q => {
      const user = ans.find((a: any) => a.qid === q.id);
      if (user && user.option === q.correct) correct++;
    });
    const score = Math.round((correct / total) * 100);
    const passed = score >= 70;

    // Generar código de certificado
    let codigo: string | null = null;
    if (passed) {
      const { data: code } = await supabase.rpc("generate_cert_code", { p_cedula: t.cedula });
      codigo = code;
      const expiresAt = new Date(); expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      await supabase.from("certificados_curso").insert({
        trabajador_id: t.id, codigo,
        cedula: t.cedula, nombre: t.nombre,
        passed: true, score,
        answers: ans,
        expires_at: expiresAt.toISOString(),
      });
      await supabase.from("contratistas_trabajadores").update({
        curso_completado: true,
        curso_fecha: new Date().toISOString(),
        curso_score: score,
        curso_codigo: codigo,
      }).eq("id", t.id);

      // Bitácora
      await supabase.from("contratistas_bitacora").insert({
        contratista_id: t.contratista_id,
        evento: "curso_aprobado",
        detalle: `${t.nombre} aprobó el curso (${score}%)`,
        metadata: { trabajador_id: t.id, codigo, score },
      });

      // Email al trabajador
      if (t.correo) {
        const verifyUrl = `${PORTAL_BASE}/verificar/${codigo}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(verifyUrl)}&size=200x200`;
        await fetch(SEND_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [t.correo],
            kind: "certificado",
            contratista_id: t.contratista_id,
            trabajador_id: t.id,
            subject: `✅ ¡Curso aprobado! · Certificado SST Atolón`,
            html: layoutEmail(`
              <h2 style="margin-top:0;font-family:'Barlow Condensed',Arial,sans-serif;color:#0D1B3E;">¡Felicitaciones, ${t.nombre}!</h2>
              <p>Aprobaste el curso de inducción SST con un puntaje de <strong>${score}%</strong>.</p>
              <div style="background:#F5F2EA;padding:20px;text-align:center;border-radius:10px;margin:24px 0;">
                <div style="font-size:10px;color:#666;letter-spacing:2px;text-transform:uppercase;">Código de certificado</div>
                <div style="font-family:monospace;font-size:18px;font-weight:800;color:#0D1B3E;margin:8px 0;">${codigo}</div>
                <img src="${qrUrl}" alt="QR" style="margin:10px 0;" />
                <div style="font-size:11px;color:#666;margin-top:6px;">Verificación: <a href="${verifyUrl}">${verifyUrl}</a></div>
              </div>
              <p><strong>Vigencia:</strong> ${new Date(expiresAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</p>
              <p style="font-size:12px;color:#666;">Guarda este correo o el código QR. Deberás presentarlo al ingresar al muelle de Atolón Beach Club.</p>
            `),
          }),
        }).catch(e => console.error("email send failed:", e));
      }
    }

    return new Response(JSON.stringify({ ok: true, passed, score, codigo, total_questions: total, correct_answers: correct }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
