import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { checkin, checkout, adultos = 2, ninos = 0 } = await req.json();
    const supa = createClient(SUPA_URL, SUPA_KEY);
    const [{ data: habs }, { data: reservas }, { data: tarifas }] = await Promise.all([
      supa.from("hotel_habitaciones").select("id, nombre, capacidad, tipo_id").eq("activa", true),
      supa.from("hotel_reservas").select("habitacion_id, checkin, checkout").in("estado", ["confirmada","checkin"]),
      supa.from("hotel_tarifas").select("*"),
    ]);
    const ocupadas = new Set(
      (reservas || []).filter((r: any) => r.checkin < checkout && r.checkout > checkin).map((r: any) => r.habitacion_id)
    );
    const libres = (habs || []).filter((h: any) => !ocupadas.has(h.id) && h.capacidad >= (adultos + ninos));
    return json({
      checkin, checkout, adultos, ninos,
      disponibles: libres.length,
      opciones: libres.slice(0, 5).map((h: any) => ({
        nombre: h.nombre, capacidad: h.capacidad,
        tarifa_noche: tarifas?.find((t: any) => t.tipo_id === h.tipo_id)?.precio_base || null,
      })),
    });
  } catch (e: any) { return json({ error: e.message }, 500); }
});
function json(b: any, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
