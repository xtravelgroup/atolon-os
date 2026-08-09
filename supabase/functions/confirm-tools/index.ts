// confirm-tools — Tools para el agente Confirm (clientes finales que responden
// al WA principal). Actualmente:
//   - get_customer_reservations: busca reservas del teléfono del cliente
//
// El agente Confirm también usa tools ya existentes del Concierge normal:
//   check_disponibilidad_pasadia, get_precios_pasadias, crear_reserva_pendiente
// (esos viven en sus propios endpoints).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", ...corsHeaders },
  });
}

// Normaliza a los últimos 10 dígitos para matching flexible (Meta manda con y sin CC)
function tel10(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(SUPA_URL, SUPA_KEY);

  try {
    const body = await req.json();
    const { action, customer_telefono, ...args } = body;

    if (action === "get_customer_reservations") {
      const tel = tel10(customer_telefono || args.telefono || "");
      if (!tel || tel.length < 7) {
        return json({ ok: false, error: "customer_telefono requerido (mínimo 7 dígitos)", reservas: [] });
      }
      // Buscar reservas donde el teléfono termine en esos 10 dígitos, no canceladas
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supa.from("reservas")
        .select("id, nombre, fecha, tipo, canal, salida_id, hora_llegada, nombre_embarcacion, pax, pax_a, pax_n, total, abono, saldo, estado, forma_pago, notas_club, aliado_id")
        .neq("estado", "cancelado")
        .gte("fecha", today)
        .or(`telefono.ilike.%${tel},contacto.ilike.%${tel}`)
        .order("fecha", { ascending: true })
        .limit(20);
      if (error) return json({ ok: false, error: error.message, reservas: [] });

      // Enriquecer con hora de salida
      const salidaIds = [...new Set((data || []).map(r => r.salida_id).filter(Boolean))];
      const { data: salidas } = salidaIds.length
        ? await supa.from("salidas").select("id, hora, nombre").in("id", salidaIds)
        : { data: [] };
      const salMap = new Map((salidas || []).map(s => [s.id, s]));

      const reservas = (data || []).map(r => ({
        id: r.id,
        nombre: r.nombre,
        fecha: r.fecha,
        tipo: r.tipo,
        pax: r.pax,
        pax_adultos: r.pax_a,
        pax_ninos: r.pax_n,
        hora_salida: r.salida_id ? (salMap.get(r.salida_id)?.hora || "—") : (r.hora_llegada || null),
        embarcacion: r.nombre_embarcacion || (r.salida_id ? salMap.get(r.salida_id)?.nombre : null),
        estado: r.estado,
        forma_pago: r.forma_pago,
        total: r.total,
        abono: r.abono,
        saldo: r.saldo,
        notas: r.notas_club,
        canal_origen: r.canal,
      }));

      return json({ ok: true, count: reservas.length, reservas });
    }

    return json({ ok: false, error: `action desconocida: ${action}` }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
});
