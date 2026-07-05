// hotel-cleanup-expiradas — Cron: cancela reservas de grupo sin pagar
// que superaron el TTL de 30 min (expira_en < now, pagado_en IS NULL).
//
// Al cancelar:
//   - Estancia → estado='cancelada', expira_en=null, updated_at=now
//   - Grupo asociado → decrementa habitaciones_reservadas.
//     Si el grupo estaba 'agotado' y se libera cupo → volver a 'activo'.
//
// Uso: llamar cada ~2 min (Supabase cron o cron externo).
//   POST https://<project>.supabase.co/functions/v1/hotel-cleanup-expiradas
//   Header: Authorization: Bearer <SERVICE_ROLE_KEY> (para bypass RLS)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const nowIso = new Date().toISOString();

  // 1) Buscar estancias expiradas sin pagar.
  const { data: expiradas, error: eErr } = await supa
    .from("hotel_estancias")
    .select("id, grupo_id, estado")
    .lt("expira_en", nowIso)
    .is("pagado_en", null)
    .in("estado", ["reservada"]);
  if (eErr) return json({ error: eErr.message }, 500);

  if (!expiradas || expiradas.length === 0) {
    return json({ ok: true, cancelled: 0, released: {} });
  }

  const ids = expiradas.map((e: any) => e.id);
  // 2) Cancelar todas de un solo update.
  const { error: uErr } = await supa
    .from("hotel_estancias")
    .update({
      estado: "cancelada",
      expira_en: null,
      updated_at: nowIso,
      solicitudes_especiales: "Cancelada automáticamente por falta de pago (30 min).",
    })
    .in("id", ids);
  if (uErr) return json({ error: uErr.message }, 500);

  // 3) Decrementar habitaciones_reservadas por grupo.
  const porGrupo: Record<string, number> = {};
  expiradas.forEach((e: any) => {
    if (e.grupo_id) porGrupo[e.grupo_id] = (porGrupo[e.grupo_id] || 0) + 1;
  });

  for (const [grupoId, cnt] of Object.entries(porGrupo)) {
    const { data: g } = await supa
      .from("hotel_grupos")
      .select("habitaciones_reservadas, cupo_habitaciones, estado")
      .eq("id", grupoId)
      .maybeSingle();
    if (!g) continue;
    const nuevo = Math.max(0, (g.habitaciones_reservadas || 0) - cnt);
    // Si estaba agotado y ahora vuelve a haber cupo → reactivar.
    const nuevoEstado = (g.estado === "agotado" && g.cupo_habitaciones > 0 && nuevo < g.cupo_habitaciones)
      ? "activo" : g.estado;
    await supa.from("hotel_grupos").update({
      habitaciones_reservadas: nuevo,
      estado: nuevoEstado,
    }).eq("id", grupoId);
  }

  return json({
    ok: true,
    cancelled: ids.length,
    released: porGrupo,
    at: nowIso,
  });
});
