// Procesa el registro al terminar el wizard:
// - Regenera radicado vía RPC generate_radicado (server-side, único)
// - Asegura curso_token para cada trabajador
// - Envía 3 correos (contratista, SST interno, cada trabajador con link de curso)
// - Registra en bitácora
//
// POST { contratista_id }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SEND_URL = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/contratistas-send-notification";
// TODO: cambiar a sst@atolon.co cuando exista
const INTERNAL_SST = "eric@atoloncartagena.com";
const PORTAL_BASE = "https://www.atolon.co";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" };

function sb() { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); }

async function sendEmail(payload: any) {
  return fetch(SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(r => r.json()).catch(e => ({ error: e.message }));
}

function layoutEmail(content: string) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAF6EE;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 6px 30px rgba(13,27,62,0.1);">
  <div style="background:#0D1B3E;padding:28px;text-align:center;">
    <div style="font-size:11px;color:#C8B99A;letter-spacing:3px;text-transform:uppercase;">ATOLÓN · BEACH CLUB</div>
    <div style="font-size:22px;color:white;font-weight:800;margin-top:6px;">Portal de Contratistas</div>
  </div>
  <div style="padding:32px;color:#0D1B3E;font-size:14px;line-height:1.6;">${content}</div>
  <div style="background:#F5F2EA;padding:18px 28px;font-size:10px;color:#666;text-align:center;line-height:1.5;">
    Marco legal: Decreto 1072/2015 · CST Art. 34 · Decreto 723/2013 · Ley 527/1999<br/>
    Atolón Beach Club · Cartagena de Indias · Colombia
  </div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const { contratista_id } = await req.json();
    if (!contratista_id) return new Response(JSON.stringify({ error: "contratista_id requerido" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const supabase = sb();
    const { data: c } = await supabase.from("contratistas").select("*").eq("id", contratista_id).maybeSingle();
    if (!c) return new Response(JSON.stringify({ error: "contratista no encontrado" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });

    let radicado = c.radicado;
    // Si el radicado parece temporal (generado cliente-side) o no existe, regenerar server-side
    if (!radicado || radicado.startsWith("ATL-TMP-")) {
      const { data: r } = await supabase.rpc("generate_radicado", { p_tipo: c.tipo });
      if (r) radicado = r;
    }

    // Estado: pasar a "radicado" si sigue en borrador
    const update: any = { fecha_radicado: new Date().toISOString() };
    if (radicado !== c.radicado) update.radicado = radicado;
    if (c.estado === "borrador") update.estado = "radicado";
    await supabase.from("contratistas").update(update).eq("id", contratista_id);

    // Asegurar curso_token por trabajador
    const { data: trabajadores } = await supabase.from("contratistas_trabajadores")
      .select("id, nombre, cedula, correo, curso_token, curso_completado").eq("contratista_id", contratista_id);
    for (const t of trabajadores || []) {
      if (!t.curso_token) {
        const { data: tok } = await supabase.rpc("generate_curso_token");
        if (tok) await supabase.from("contratistas_trabajadores").update({ curso_token: tok }).eq("id", t.id);
      }
    }

    // Refrescar trabajadores con tokens
    const { data: trabajadoresConToken } = await supabase.from("contratistas_trabajadores")
      .select("id, nombre, cedula, correo, curso_token, curso_completado").eq("contratista_id", contratista_id);

    // Email al contratista
    await sendEmail({
      to: [c.contacto_principal_email],
      kind: "registro_recibido",
      contratista_id,
      subject: `Hemos recibido tu registro · ${radicado}`,
      html: layoutEmail(`
        <h2 style="margin-top:0;font-family:'Barlow Condensed',Arial,sans-serif;color:#0D1B3E;">¡Gracias por tu registro!</h2>
        <p>Hola <strong>${c.nombre_display}</strong>,</p>
        <p>Hemos recibido tu registro como contratista. Tu número de radicado es:</p>
        <div style="background:#F5F2EA;padding:16px 22px;border-left:4px solid #C8B99A;margin:20px 0;font-family:monospace;font-size:18px;font-weight:800;color:#0D1B3E;">${radicado}</div>
        <p><strong>Próximos pasos:</strong></p>
        <ol>
          <li>Nuestro equipo SST revisará tu registro y documentos (24-48h)</li>
          <li>${c.tipo === "empresa" ? "Cada trabajador deberá completar el curso de inducción SST" : "Deberás completar el curso de inducción SST"} (aprox. 15 min)</li>
          <li>Si todo está en orden, recibirás la autorización de ingreso</li>
        </ol>
        <p>Si tienes dudas, responde este correo.</p>
      `),
    });

    // Email al SST interno
    await sendEmail({
      to: [INTERNAL_SST],
      kind: "registro_interno",
      contratista_id,
      subject: `🆕 Nuevo registro radicado · ${radicado}`,
      html: layoutEmail(`
        <h2 style="margin-top:0;color:#0D1B3E;">Nuevo contratista radicado</h2>
        <p><strong>Radicado:</strong> ${radicado}<br/>
        <strong>Tipo:</strong> ${c.tipo === "empresa" ? "Empresa" : "Persona Natural"}<br/>
        <strong>Nombre:</strong> ${c.nombre_display}<br/>
        <strong>Email:</strong> ${c.contacto_principal_email}<br/>
        <strong>Celular:</strong> ${c.contacto_principal_cel}<br/>
        <strong>Servicio:</strong> ${c.servicio_tipo || "—"}<br/>
        <strong>Fecha inicio:</strong> ${c.fecha_inicio || "—"}<br/>
        <strong>Trabajadores:</strong> ${(trabajadoresConToken || []).length}</p>
        <div style="margin:20px 0;">
          <a href="https://www.atolon.co/" style="display:inline-block;background:#0D1B3E;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;">Abrir panel SST</a>
        </div>
      `),
    });

    // Email a cada trabajador con link al curso
    for (const t of trabajadoresConToken || []) {
      if (!t.correo || t.curso_completado) continue;
      const url = `${PORTAL_BASE}/contratistas/curso/${t.curso_token}`;
      await sendEmail({
        to: [t.correo],
        kind: "enlace_curso",
        contratista_id,
        trabajador_id: t.id,
        subject: `Curso de inducción SST · Atolón Beach Club`,
        html: layoutEmail(`
          <h2 style="margin-top:0;color:#0D1B3E;">Curso de Inducción Obligatorio</h2>
          <p>Hola <strong>${t.nombre}</strong>,</p>
          <p>Antes de ingresar a Atolón Beach Club debes completar el curso de inducción SST. Dura aproximadamente 15 minutos.</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${url}" style="display:inline-block;background:#C8B99A;color:#0D1B3E;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:800;letter-spacing:0.5px;">🎓 Iniciar curso</a>
          </div>
          <p style="font-size:12px;color:#666;">O abre este enlace: ${url}</p>
          <p style="font-size:11px;color:#999;">Al aprobar recibirás un certificado con código único que deberás mostrar al ingresar al muelle.</p>
        `),
      });
    }

    // Bitácora
    await supabase.from("contratistas_bitacora").insert({
      contratista_id, evento: "radicado",
      detalle: `Registro radicado: ${radicado}`,
      metadata: { trabajadores_count: (trabajadoresConToken || []).length },
    });

    return new Response(JSON.stringify({ ok: true, radicado, trabajadores: (trabajadoresConToken || []).length }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
