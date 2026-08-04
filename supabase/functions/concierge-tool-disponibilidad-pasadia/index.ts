// Herramienta del Concierge: consulta disponibilidad y precios de pasadías
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { fecha, pax_adultos = 2, pax_ninos = 0 } = await req.json();
    if (!fecha) return json({ error: "fecha requerida (YYYY-MM-DD)" }, 400);
    const supa = createClient(SUPA_URL, SUPA_KEY);
    const [{ data: precios }, { data: reservas }, { data: config }] = await Promise.all([
      supa.from("pasadias_precios").select("*"),
      supa.from("reservas").select("pax").eq("fecha", fecha).neq("estado", "cancelado"),
      supa.from("config").select("*").eq("clave", "cupo_isla").maybeSingle(),
    ]);
    const cupo = Number(config?.valor || 100);
    const ocupado = (reservas || []).reduce((s: number, r: any) => s + (Number(r.pax) || 0), 0);
    const disponibles = Math.max(0, cupo - ocupado);
    const pax_total = pax_adultos + pax_ninos;
    return json({
      fecha, cupo, ocupado, disponibles,
      hay_disponibilidad: disponibles >= pax_total,
      pax_solicitados: pax_total,
      opciones: (precios || []).map((p: any) => ({
        tipo: p.tipo, precio_adulto: p.precio_adulto, precio_nino: p.precio_nino,
        subtotal: (Number(p.precio_adulto) * pax_adultos) + (Number(p.precio_nino) * pax_ninos),
      })),
    });
  } catch (e: any) { return json({ error: e.message }, 500); }
});
function json(b: any, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
