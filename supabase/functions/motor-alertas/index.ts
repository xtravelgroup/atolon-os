// motor-alertas — recorre motores con estado vencido/critico y manda email
// a gerencia. Idempotente: no envía dos veces el mismo motor/tipo/día.
//
// Trigger:
//   GET  /motor-alertas/run                 — invocación manual
//   POST /motor-alertas/run                 — invocación manual
//   (configurar pg_cron diario 8am Bogotá si se quiere automático)
//
// Variables de entorno:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY                          — para enviar mails
//   ALERTAS_DESTINATARIOS                   — coma-separado de emails (default: gerencia)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "Atolón OS <alertas@atolon.co>";
const DEFAULT_DESTINATARIOS = (Deno.env.get("ALERTAS_DESTINATARIOS") || "eric@atoloncartagena.com,direccion@atoloncartagena.com").split(",").map(s => s.trim()).filter(Boolean);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function sendEmail({ to, subject, html }: { to: string[]; subject: string; html: string }) {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY no configurada" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const data = await res.json();
  return { ok: res.ok, id: data.id, raw: data };
}

function htmlAlerta(motores: any[]) {
  const filas = motores.map(m => {
    const ult100 = Number(m.horas_ult_mant_100) || 0;
    const horas = Number(m.horas_actuales) || 0;
    const exceso = horas - (ult100 + 100);
    const color = m.estado === "vencido_critico" ? "#dc2626" : "#f97316";
    return `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:10px;font-weight:700">${m.codigo || m.id}</td>
        <td style="padding:10px;color:#6b7280">${m.lancha_id}</td>
        <td style="padding:10px;text-align:right">${horas.toFixed(1)} h</td>
        <td style="padding:10px;text-align:right;font-weight:700;color:${color}">
          ${m.estado === "vencido_critico" ? "🚨 CRÍTICO" : "⚠️ VENCIDO"}
        </td>
        <td style="padding:10px;text-align:right;color:${color}">+${exceso.toFixed(0)}h</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><body style="font-family:Inter,sans-serif;background:#f9fafb;padding:20px">
  <div style="max-width:640px;margin:auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:#0D1B3E;color:white;padding:24px">
      <div style="font-size:22px;font-weight:800">⚠️ Mantenimiento de motores</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:4px">Atolón Beach Club · ${new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}</div>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 14px;color:#1f2937">Los siguientes motores requieren atención de mantenimiento:</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase">Motor</th>
            <th style="padding:10px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase">Lancha</th>
            <th style="padding:10px;text-align:right;color:#6b7280;font-size:11px;text-transform:uppercase">Horas</th>
            <th style="padding:10px;text-align:right;color:#6b7280;font-size:11px;text-transform:uppercase">Estado</th>
            <th style="padding:10px;text-align:right;color:#6b7280;font-size:11px;text-transform:uppercase">Exceso</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <div style="margin-top:18px;padding:12px;background:#fef3c7;border-radius:8px;font-size:12px;color:#92400e">
        <strong>Acción recomendada:</strong> Crear orden de mantenimiento desde Lancha → Motores → 🔧 Orden de mantenimiento.
        Los motores en estado <strong>CRÍTICO</strong> no deben operar sin autorización gerencial.
      </div>
      <a href="https://www.atolon.co/login" style="display:inline-block;margin-top:16px;background:#38bdf8;color:#0D1B3E;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700">Ver en Atolón OS →</a>
    </div>
    <div style="padding:14px 24px;background:#f9fafb;color:#9ca3af;font-size:11px">
      Este correo se envía automáticamente cuando se detecta mantenimiento vencido o crítico. No responder.
    </div>
  </div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/motor-alertas/, "");
  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    if (path === "/run" || path === "" || path === "/") {
      const supa = sb();
      const today = new Date().toISOString().slice(0, 10);

      // Buscar motores en estado problemático
      const { data: motores, error: mErr } = await supa.from("lancha_motores")
        .select("id, codigo, lancha_id, marca, modelo, horas_actuales, horas_ult_mant_100, estado")
        .eq("activo", true)
        .in("estado", ["vencido", "vencido_critico"]);
      if (mErr) throw mErr;

      // Filtrar los que ya recibieron alerta hoy
      const motoresPendientes: any[] = [];
      for (const m of (motores || [])) {
        const { data: ya } = await supa.from("motor_alertas_enviadas")
          .select("id")
          .eq("motor_id", m.id)
          .eq("fecha", today)
          .eq("tipo", m.estado);
        if (!ya || ya.length === 0) motoresPendientes.push(m);
      }

      if (motoresPendientes.length === 0) {
        return json({ ok: true, enviadas: 0, mensaje: "Sin motores nuevos para alertar" });
      }

      // Destinatarios: del env + super_admin/gerentes activos en usuarios
      const { data: us } = await supa.from("usuarios")
        .select("email, rol_id")
        .eq("activo", true)
        .or("rol_id.like.%admin%,rol_id.like.%gerente%,rol_id.like.%super%");
      const dynamicEmails = (us || []).map(u => u.email).filter(Boolean);
      const destinatarios = [...new Set([...DEFAULT_DESTINATARIOS, ...dynamicEmails])];

      const subject = `🚨 ${motoresPendientes.length} motor${motoresPendientes.length !== 1 ? "es" : ""} con mantenimiento ${motoresPendientes.some(m => m.estado === "vencido_critico") ? "crítico" : "vencido"}`;
      const html = htmlAlerta(motoresPendientes);

      const send = await sendEmail({ to: destinatarios, subject, html });

      // Registrar idempotencia
      for (const m of motoresPendientes) {
        await supa.from("motor_alertas_enviadas").insert({
          id: `ALT-${m.id}-${today}-${m.estado}`,
          motor_id: m.id,
          fecha: today,
          tipo: m.estado,
          destinatarios,
          asunto: subject,
          resend_id: send.id || null,
        });
      }

      return json({
        ok: send.ok,
        enviadas: motoresPendientes.length,
        destinatarios,
        resend: send,
      });
    }

    return json({ error: "Ruta no encontrada", path }, 404);
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) }, 500);
  }
});
