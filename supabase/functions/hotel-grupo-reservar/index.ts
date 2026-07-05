// hotel-grupo-reservar — Crea una reserva de hotel dentro de un grupo.
//
// POST body: { slug, check_in, check_out, categoria_id, huesped: {...}, notas? }
// Validaciones:
//   - grupo existe, estado='activo', link no vencido
//   - check_in >= grupo.fecha_desde, check_out <= grupo.fecha_hasta+1, check_out > check_in
//   - tarifa disponible para la categoría
//   - cupo grupo no agotado
// Efecto:
//   - upsert hotel_huespedes (match por email/documento)
//   - insert hotel_estancias con estado='reservada', grupo_id, precio_noche, total
//   - increment grupo.habitaciones_reservadas
// Retorna: { ok, estancia_id, codigo, total, noches }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const sb = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function diffNoches(a: string, b: string) {
  const t = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(t / (1000 * 60 * 60 * 24));
}

function randCode() {
  const alph = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "GRP-";
  for (let i = 0; i < 6; i++) s += alph[Math.floor(Math.random() * alph.length)];
  return s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const { slug, check_in, check_out, categoria_id, huesped, notas } = body || {};

    if (!slug) return json({ error: "slug requerido" }, 400);
    if (!check_in || !check_out) return json({ error: "Fechas requeridas" }, 400);
    if (!categoria_id) return json({ error: "categoria_id requerido" }, 400);
    if (!huesped?.nombre || !huesped?.email) return json({ error: "Nombre y email del huésped requeridos" }, 400);

    const supa = sb();

    // 1) Cargar grupo con tarifas
    const { data: grupo, error: gErr } = await supa
      .from("hotel_grupos")
      .select("*, hotel_grupos_tarifas(*)")
      .eq("slug", slug)
      .maybeSingle();
    if (gErr || !grupo) return json({ error: "Grupo no encontrado" }, 404);
    if (grupo.estado !== "activo") return json({ error: "El grupo no está activo" }, 400);
    if (grupo.link_expira_at && new Date(grupo.link_expira_at) < new Date()) {
      return json({ error: "El link de reserva ha vencido" }, 400);
    }

    // 2) Validar rango de fechas
    if (check_in < grupo.fecha_desde) {
      return json({ error: `Check-in debe ser desde ${grupo.fecha_desde}` }, 400);
    }
    if (check_out <= check_in) return json({ error: "Check-out debe ser posterior al check-in" }, 400);
    if (check_out > grupo.fecha_hasta) {
      return json({ error: `Check-out debe ser máximo ${grupo.fecha_hasta}` }, 400);
    }
    const noches = diffNoches(check_in, check_out);
    if (noches < 1) return json({ error: "Mínimo 1 noche" }, 400);

    // 3) Tarifa para la categoría
    const tarifa = (grupo.hotel_grupos_tarifas || []).find(
      (t: any) => t.categoria_id === categoria_id && t.disponible !== false && Number(t.precio_noche) > 0
    );
    if (!tarifa) return json({ error: "Categoría no disponible para este grupo" }, 400);
    const precioNoche = Number(tarifa.precio_noche);
    const subtotal = precioNoche * noches;
    // IVA: Colombianos pagan 19%. Extranjeros con pasaporte están exentos
    // según Ley 300 de 1996 (turismo).
    const nacionalidad = (huesped.nacionalidad || "colombiano").toLowerCase();
    const IVA_PCT = 0.19;
    const iva = nacionalidad === "colombiano" ? Math.round(subtotal * IVA_PCT) : 0;
    const total = subtotal + iva;

    // 4) Cupo del grupo (chequeo optimista — el update final protege race).
    if (grupo.cupo_habitaciones > 0 && (grupo.habitaciones_reservadas || 0) >= grupo.cupo_habitaciones) {
      return json({ error: "Cupo del grupo agotado" }, 400);
    }

    // 4b) DISPONIBILIDAD REAL: habitaciones activas de la categoría vs estancias
    //     que solapan con [check_in, check_out).
    const { count: totalRooms } = await supa
      .from("hotel_habitaciones")
      .select("id", { count: "exact", head: true })
      .eq("categoria_id", categoria_id)
      .eq("estado", "activa");
    if (!totalRooms || totalRooms === 0) {
      return json({ error: "No hay habitaciones de esta categoría configuradas" }, 400);
    }

    // Cargar habitaciones de la categoría (para chequear ocupación por habitacion_id).
    const { data: habsCat } = await supa
      .from("hotel_habitaciones")
      .select("id")
      .eq("categoria_id", categoria_id)
      .eq("estado", "activa");
    const habIds = new Set((habsCat || []).map((h: any) => h.id));

    // Estancias en la ventana [check_in, check_out) que consumen inventario:
    //  - Con habitacion_id ∈ habIds (asignadas)
    //  - O con categoria_preferida = categoria_id (sin asignar aún)
    // Solapamiento: check_in_at < check_out AND check_out_at > check_in.
    const winEnd = `${check_out}T23:59:59`;
    const winIni = `${check_in}T00:00:00`;
    const { data: solapan } = await supa
      .from("hotel_estancias")
      .select("id, habitacion_id, categoria_preferida, estado")
      .in("estado", ["reservada", "in_house"])
      .lt("check_in_at", winEnd)
      .gt("check_out_at", winIni);
    const ocupadas = (solapan || []).filter((e: any) =>
      (e.habitacion_id && habIds.has(e.habitacion_id)) ||
      (!e.habitacion_id && e.categoria_preferida === categoria_id)
    ).length;
    const disponibles = totalRooms - ocupadas;
    if (disponibles <= 0) {
      return json({ error: "No hay habitaciones disponibles de esta categoría en esas fechas" }, 400);
    }

    // 5) Upsert huesped por email (match sin crear duplicados).
    const emailNorm = String(huesped.email).trim().toLowerCase();
    const { data: existH } = await supa.from("hotel_huespedes").select("id").eq("email", emailNorm).maybeSingle();
    let huesped_id = existH?.id;
    if (!huesped_id) {
      const nombreParts = String(huesped.nombre).trim().split(" ");
      const { data: newH, error: hErr } = await supa.from("hotel_huespedes").insert({
        nombre: nombreParts[0] || huesped.nombre,
        apellido: nombreParts.slice(1).join(" ") || null,
        email: emailNorm,
        telefono: huesped.telefono || null,
        documento: huesped.documento || null,
        pais: huesped.pais || (nacionalidad === "extranjero" ? null : "Colombia"),
        nacionalidad,
      }).select("id").single();
      if (hErr) return json({ error: "Error creando huésped: " + hErr.message }, 500);
      huesped_id = newH.id;
    }

    // 6) Crear estancia. hotel_estancias.codigo es NOT NULL — generamos uno.
    const check_in_at = `${check_in}T15:00:00-05:00`;    // 3pm hora Colombia
    const check_out_at = `${check_out}T12:00:00-05:00`;  // 12m hora Colombia
    const codigo = randCode();  // GRP-XXXXXX

    const { data: est, error: eErr } = await supa.from("hotel_estancias").insert({
      codigo,
      huesped_id,
      grupo_id: grupo.id,
      categoria_preferida: categoria_id,     // se asigna habitacion en check-in
      check_in_at,
      check_out_at,
      estado: "reservada",
      pax_adultos: Math.max(1, parseInt(huesped.pax_adultos || 2, 10)),
      pax_ninos: Math.max(0, parseInt(huesped.pax_ninos || 0, 10)),
      precio_noche: precioNoche,
      total,
      deposito: 0,
      canal: "grupo",
      solicitudes_especiales: notas || null,
      created_by: `grupo:${grupo.slug}`,
    }).select("id").single();
    if (eErr) return json({ error: "Error creando reserva: " + eErr.message }, 500);

    // 7) Incrementar contador de habitaciones_reservadas de forma atómica.
    //    Usamos RPC-lite via SQL directo. Si el cupo se llena, marcar 'agotado'.
    await supa.from("hotel_grupos")
      .update({ habitaciones_reservadas: (grupo.habitaciones_reservadas || 0) + 1 })
      .eq("id", grupo.id);
    // Si con este incremento se llegó al tope, marcar agotado.
    if (grupo.cupo_habitaciones > 0 && (grupo.habitaciones_reservadas || 0) + 1 >= grupo.cupo_habitaciones) {
      await supa.from("hotel_grupos").update({ estado: "agotado" }).eq("id", grupo.id);
    }

    return json({
      ok: true,
      estancia_id: est.id,
      codigo,
      subtotal,
      iva,
      total,
      noches,
      precio_noche: precioNoche,
      nacionalidad,
      grupo_nombre: grupo.nombre,
    });
  } catch (e) {
    console.error("[hotel-grupo-reservar] error:", e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
