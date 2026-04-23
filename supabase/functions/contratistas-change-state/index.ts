// Admin cambia el estado de un contratista (aprobado/devuelto/rechazado/etc).
// Valida JWT → registra bitácora → envía email.
//
// POST { contratista_id, nuevo_estado, notas }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey" };
const SEND_URL = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/contratistas-send-notification";

const ESTADOS_VALIDOS = ["borrador","radicado","en_revision","devuelto","aprobado","rechazado","activo","cerrado","vencido"];

function sb() { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); }

function layoutEmail(content: string) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAF6EE;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 6px 30px rgba(13,27,62,0.1);">
  <div style="background:#0D1B3E;padding:28px;text-align:center;">
    <div style="font-size:11px;color:#C8B99A;letter-spacing:3px;text-transform:uppercase;">ATOLÓN · BEACH CLUB</div>
    <div style="font-size:22px;color:white;font-weight:800;margin-top:6px;">Actualización de tu registro</div>
  </div>
  <div style="padding:32px;color:#0D1B3E;font-size:14px;line-height:1.6;">${content}</div>
  <div style="background:#F5F2EA;padding:18px 28px;font-size:10px;color:#666;text-align:center;line-height:1.5;">
    Atolón Beach Club · Cartagena de Indias · Colombia
  </div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    // Auth: verify JWT
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer /, "");
    if (!jwt) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "auth inválido" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });

    const { contratista_id, nuevo_estado, notas } = await req.json();
    if (!contratista_id || !nuevo_estado || !ESTADOS_VALIDOS.includes(nuevo_estado)) {
      return new Response(JSON.stringify({ error: "datos inválidos" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const supabase = sb();
    const { data: c } = await supabase.from("contratistas").select("*").eq("id", contratista_id).maybeSingle();
    if (!c) return new Response(JSON.stringify({ error: "no encontrado" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });

    const estado_anterior = c.estado;
    const ts = new Date().toISOString();
    const update: any = { estado: nuevo_estado, updated_at: ts };
    if (nuevo_estado === "aprobado")  update.fecha_aprobacion = ts;
    if (nuevo_estado === "rechazado") update.fecha_rechazo = ts;

    // Al aprobar — vincular/crear proveedor para contabilidad
    if (nuevo_estado === "aprobado" && !c.proveedor_id) {
      try {
        const nitRaw = c.tipo === "empresa" ? c.emp_nit : c.nat_cedula;
        const nitClean = String(nitRaw || "").replace(/[^0-9]/g, "");
        let proveedor_id: string | null = null;
        if (nitClean) {
          const { data: existing } = await supabase
            .from("proveedores")
            .select("id, nit")
            .limit(100);
          const match = (existing || []).find((p: any) => String(p.nit || "").replace(/[^0-9]/g, "") === nitClean);
          if (match) proveedor_id = match.id;
        }
        if (!proveedor_id) {
          const pid = `PROV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const nombre = c.tipo === "empresa" ? (c.emp_razon_social || c.nombre_display) : (c.nat_nombre || c.nombre_display);
          // Insert mínimo con campos seguros que sabemos existen
          const nuevoProv: any = {
            id: pid,
            nombre: nombre || "Proveedor",
            nit: nitRaw || null,
            telefono: c.contacto_principal_cel || null,
            email: c.contacto_principal_email || null,
          };
          const { data: inserted, error: provErr } = await supabase.from("proveedores").insert(nuevoProv).select("id").single();
          if (!provErr && inserted) proveedor_id = inserted.id;
          else if (provErr) console.warn("prov insert err:", provErr.message);
        }
        if (proveedor_id) update.proveedor_id = proveedor_id;
      } catch (e) { console.warn("link proveedor:", e); }
    }

    await supabase.from("contratistas").update(update).eq("id", contratista_id);

    await supabase.from("contratistas_bitacora").insert({
      contratista_id,
      evento: `estado_${nuevo_estado}`,
      detalle: notas || `Cambio ${estado_anterior} → ${nuevo_estado}`,
      usuario_id: user.id,
      usuario_nombre: user.email,
      metadata: { estado_anterior, nuevo_estado, notas: notas || null },
    });

    // Email al contratista según estado
    const subject = {
      aprobado: `✅ Registro aprobado · ${c.radicado}`,
      rechazado: `Registro no autorizado · ${c.radicado}`,
      devuelto: `Observaciones en tu registro · ${c.radicado}`,
      en_revision: `Tu registro está en revisión · ${c.radicado}`,
    }[nuevo_estado];

    const htmlContent = {
      aprobado: `
        <h2 style="margin-top:0;font-family:'Barlow Condensed',Arial,sans-serif;color:#0D1B3E;">¡Registro aprobado!</h2>
        <p>Tu registro como contratista ha sido <strong style="color:#4CAF7D;">APROBADO</strong>.</p>
        <p>Radicado: <strong>${c.radicado}</strong></p>
        ${notas ? `<p><strong>Observaciones:</strong> ${notas}</p>` : ""}
        <p>Ya puedes ingresar a la propiedad en las fechas acordadas. Recuerda presentar el certificado del curso SST en el muelle.</p>
      `,
      rechazado: `
        <h2 style="margin-top:0;color:#0D1B3E;">Registro no autorizado</h2>
        <p>Lamentamos informarte que tu registro no ha sido autorizado.</p>
        <p>Radicado: <strong>${c.radicado}</strong></p>
        ${notas ? `<p><strong>Motivo:</strong> ${notas}</p>` : ""}
        <p>Si tienes dudas, responde este correo o contáctanos.</p>
      `,
      devuelto: `
        <h2 style="margin-top:0;color:#0D1B3E;">Observaciones en tu registro</h2>
        <p>Tu registro tiene observaciones que debes corregir.</p>
        <p>Radicado: <strong>${c.radicado}</strong></p>
        ${notas ? `<div style="background:#FFF4E5;border-left:4px solid #E8A020;padding:14px 18px;margin:16px 0;"><strong>Observaciones:</strong><br/>${notas}</div>` : ""}
        <p>Responde este correo con la información/documentos corregidos.</p>
      `,
      en_revision: `
        <h2 style="margin-top:0;color:#0D1B3E;">Tu registro está en revisión</h2>
        <p>Nuestro equipo SST está revisando tu registro <strong>${c.radicado}</strong>. Te avisaremos cuando tengamos una respuesta.</p>
      `,
    }[nuevo_estado];

    if (subject && htmlContent && c.contacto_principal_email) {
      await fetch(SEND_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [c.contacto_principal_email],
          kind: `estado_${nuevo_estado}`,
          contratista_id,
          subject, html: layoutEmail(htmlContent),
        }),
      }).catch(e => console.error("email failed:", e));
    }

    return new Response(JSON.stringify({ ok: true, estado: nuevo_estado }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
