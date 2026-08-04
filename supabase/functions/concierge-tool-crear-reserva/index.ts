// Crea una reserva pendiente y retorna link de pago (Zoho/Wompi)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { tipo, fecha, pax_a = 1, pax_n = 0, nombre, telefono, email } = await req.json();
    if (!tipo || !fecha || !nombre || !telefono) return json({ error: "faltan datos" }, 400);
    const supa = createClient(SUPA_URL, SUPA_KEY);
    const { data: precios } = await supa.from("pasadias_precios").select("*").eq("tipo", tipo).maybeSingle();
    if (!precios) return json({ error: "tipo no encontrado" }, 400);
    const total = pax_a * Number(precios.precio_adulto || 0) + pax_n * Number(precios.precio_nino || 0);
    const id = `WEB-${Date.now()}`;
    await supa.from("reservas").insert({
      id, nombre, telefono, email, fecha, tipo, pax: pax_a + pax_n, pax_a, pax_n,
      total, abono: 0, saldo: total, estado: "pendiente", canal: "concierge_ai", source: "concierge",
    });
    // Link pago Zoho placeholder — reemplazar con edge fn real de pagos
    const link_pago = `${SUPA_URL.replace(".supabase.co","")}/pay/${id}`;
    return json({ ok: true, reserva_id: id, total, link_pago, mensaje: `Reserva creada. Puedes pagar aquí: ${link_pago}` });
  } catch (e: any) { return json({ error: e.message }, 500); }
});
function json(b: any, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
