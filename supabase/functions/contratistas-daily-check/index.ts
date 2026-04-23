// Cron diario: detecta contratistas con documentos vencidos y los marca `vencido`.
// Corre vía pg_cron. Sin auth (disparado por servidor).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*" };
const SEND_URL = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/contratistas-send-notification";
// TODO: sst@atolon.co cuando exista
const INTERNAL_SST = "eric@atoloncartagena.com";

function sb() { return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); }

const daysAgo = (d: string | null, days: number) => {
  if (!d) return false;
  const dt = new Date(d);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return dt < cutoff;
};

serve(async (_req) => {
  const supabase = sb();
  // Buscar contratistas activos o aprobados
  const { data: rows } = await supabase.from("contratistas")
    .select("id, radicado, estado, nombre_display, contacto_principal_email, emp_fecha_pila")
    .in("estado", ["aprobado", "activo"]);

  const vencidos: any[] = [];
  for (const c of rows || []) {
    // PILA vigente 30 días
    if (daysAgo(c.emp_fecha_pila, 30)) {
      vencidos.push(c);
    }
  }

  for (const c of vencidos) {
    await supabase.from("contratistas").update({
      estado: "vencido",
      updated_at: new Date().toISOString(),
    }).eq("id", c.id);

    await supabase.from("contratistas_bitacora").insert({
      contratista_id: c.id,
      evento: "estado_vencido",
      detalle: "Documentos vencidos: PILA > 30 días",
      metadata: { auto: true },
    });

    // Aviso al contratista
    if (c.contacto_principal_email) {
      fetch(SEND_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [c.contacto_principal_email],
          kind: "documentos_vencidos",
          contratista_id: c.id,
          subject: `⚠️ Documentos vencidos · ${c.radicado}`,
          html: `<p>Tus documentos (PILA) han vencido. Por favor renuévalos y envía la evidencia actualizada para mantener tu autorización vigente.</p><p>Radicado: <strong>${c.radicado}</strong></p>`,
        }),
      }).catch(() => {});
    }
  }

  // Resumen al SST
  if (vencidos.length > 0) {
    fetch(SEND_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: [INTERNAL_SST],
        kind: "cron_vencimientos",
        subject: `⚠️ ${vencidos.length} contratista(s) vencido(s) hoy`,
        html: `<h3>Contratistas marcados como vencidos</h3><ul>${vencidos.map(v => `<li>${v.radicado} — ${v.nombre_display}</li>`).join("")}</ul>`,
      }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ ok: true, vencidos: vencidos.length, total_revisados: (rows || []).length }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
