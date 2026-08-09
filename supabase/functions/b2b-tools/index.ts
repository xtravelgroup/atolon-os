// b2b-tools — endpoints usados por el bot WhatsApp B2B (via tool_use de Claude).
// Router interno por `action`. Cada action recibe { aliado_id, ...params } y
// retorna JSON. Se invoca desde concierge-turn cuando el agente B2B llama a
// una tool.
//
// Actions:
//   - get_agency_context      → info del aliado (saldo puntos, cupo, comisión, ranking)
//   - check_availability      → disponibilidad + precios NETOS B2B para una fecha
//   - create_booking          → crea reserva B2B con canal=B2B y aliado_id
//   - generate_payment_link   → link Wompi para reserva pendiente
//   - get_recent_bookings     → últimas N reservas del aliado
//   - redeem_points           → canjear puntos B2B en una reserva
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")   return json({ error: "method_not_allowed" }, 405);

  const supa = createClient(SUPA_URL, SUPA_KEY);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const { action, aliado_id, ...params } = body;
  if (!action)    return json({ error: "action_required" }, 400);
  if (!aliado_id) return json({ error: "aliado_id_required" }, 400);

  try {
    switch (action) {
      case "get_agency_context":         return json(await getAgencyContext(supa, aliado_id));
      case "check_availability":
      case "check_availability_b2b":     return json(await checkAvailability(supa, aliado_id, params));
      case "create_booking":
      case "create_b2b_booking":         return json(await createBooking(supa, aliado_id, params));
      case "generate_payment_link":
      case "generate_payment_link_b2b":  return json(await generatePaymentLink(supa, aliado_id, params));
      case "get_recent_bookings":        return json(await getRecentBookings(supa, aliado_id, params));
      case "redeem_points":              return json(await redeemPoints(supa, aliado_id, params));
      default: return json({ error: `unknown_action: ${action}` }, 400);
    }
  } catch (e: any) {
    console.error(`[b2b-tools/${action}]`, e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

// ── Tools ──────────────────────────────────────────────────────────────

async function getAgencyContext(supa: any, aliado_id: string) {
  const { data: al } = await supa.from("aliados_b2b")
    .select("id, nombre, tipo, contacto, tel, email, comision, cupo_credito, credito_monto, credito_dias, estado, codigo, precio_vista_admin, precio_vista_vendedor")
    .eq("id", aliado_id).maybeSingle();
  if (!al) throw new Error("aliado_not_found");

  // Saldo de puntos actual (suma otorgados − redimidos)
  const [{ data: puntosData }, { data: reservasMes }] = await Promise.all([
    supa.from("puntos_b2b").select("cantidad, tipo").eq("aliado_id", aliado_id),
    supa.from("reservas").select("id, total, fecha, estado")
      .eq("aliado_id", aliado_id)
      .gte("fecha", firstDayOfMonth())
      .in("estado", ["confirmado", "check_in", "no_show"]),
  ]);
  const saldoPuntos = (puntosData || []).reduce((s: number, p: any) => {
    return s + (p.tipo === "otorgado" ? Number(p.cantidad) : -Number(p.cantidad));
  }, 0);

  const paxMes = (reservasMes || []).length;
  const revenueMes = (reservasMes || []).reduce((s: number, r: any) => s + (Number(r.total) || 0), 0);

  return {
    aliado_id: al.id,
    nombre: al.nombre,
    tipo: al.tipo,
    contacto: al.contacto,
    email: al.email,
    comision_pct: Number(al.comision) || 0,
    codigo: al.codigo,
    saldo_puntos: saldoPuntos,
    reservas_mes: paxMes,
    revenue_mes: revenueMes,
    cupo_credito: Number(al.cupo_credito) || 0,
    credito_dias: al.credito_dias,
    modalidad_precio: al.precio_vista_admin || "publico_menos_comision",
  };
}

async function checkAvailability(supa: any, aliado_id: string, params: any) {
  const { fecha, pax } = params;
  if (!fecha) throw new Error("fecha_required");
  const paxNum = Math.max(1, Number(pax) || 1);

  // Cupos por salida + cierres + config real de BD + aliado
  const [{ data: reservas }, { data: cierres }, { data: aliado }, { data: salidasCfg }] = await Promise.all([
    supa.from("reservas").select("salida_id, pax")
      .eq("fecha", fecha)
      .in("estado", ["confirmado", "pendiente", "pendiente_pago", "check_in"]),
    supa.from("cierres_fecha").select("tipo, salida_id").eq("fecha", fecha),
    supa.from("aliados_b2b").select("comision").eq("id", aliado_id).maybeSingle(),
    supa.from("salidas").select("id, hora, hora_regreso, capacidad_total, activo, auto_apertura, auto_umbral, orden").eq("activo", true).order("orden"),
  ]);

  const cierreTotal = (cierres || []).some((c: any) => c.tipo === "total");
  if (cierreTotal) return { disponible_para_pax: false, fecha, pax_solicitado: paxNum, motivo: "fecha_cerrada", salidas_abiertas: [] };

  const comision = Number(aliado?.comision) || 0;
  const cerradasSalida = new Set((cierres || []).filter((c: any) => c.salida_id).map((c: any) => c.salida_id));
  const paxPorSalida: Record<string, number> = {};
  for (const r of (reservas || [])) {
    if (r.salida_id) paxPorSalida[r.salida_id] = (paxPorSalida[r.salida_id] || 0) + (Number(r.pax) || 0);
  }

  // Auto-apertura: una salida "auto" solo se muestra si la ANTERIOR llegó a su umbral
  const cfg = salidasCfg || [];
  const salidasVisibles = cfg.filter((s: any, i: number) => {
    if (cerradasSalida.has(s.id)) return false;
    if (!s.auto_apertura) return true;
    const prev = cfg[i - 1];
    if (!prev) return true;
    const pct = (paxPorSalida[prev.id] || 0) / (prev.capacidad_total || 1);
    return pct >= (prev.auto_umbral || 75) / 100;
  });

  // Formato de salidas: SOLO indicamos si caben las N personas, no exponemos cupos
  const fmtHora = (h: string) => {
    if (!h) return "";
    const [hh, mm] = h.split(":");
    const hi = parseInt(hh, 10);
    const suf = hi >= 12 ? "PM" : "AM";
    const h12 = hi === 0 ? 12 : hi > 12 ? hi - 12 : hi;
    return `${h12}:${mm} ${suf}`;
  };
  const salidas_abiertas = salidasVisibles.map((s: any) => {
    const disponibles = Math.max(0, s.capacidad_total - (paxPorSalida[s.id] || 0));
    return {
      id: s.id,
      hora_salida: fmtHora(s.hora),
      hora_regreso: fmtHora(s.hora_regreso),
      caben_las_personas: disponibles >= paxNum,
    };
  }).filter((s: any) => s.caben_las_personas);

  // Precios netos (público × (1 - comisión))
  const pases = [
    { tipo: "VIP Pass",          precio_publico: 320000 },
    { tipo: "Exclusive Pass",    precio_publico: 590000 },
    { tipo: "Atolon Experience", precio_publico: 1100000 },
  ].map(p => ({ tipo: p.tipo, precio_neto: Math.round(p.precio_publico * (1 - comision / 100)) }));

  return {
    disponible_para_pax: salidas_abiertas.length > 0,
    fecha,
    pax_solicitado: paxNum,
    salidas_abiertas,
    pases,
    comision_pct: comision,
    nota: "USA EXACTAMENTE los valores hora_salida y hora_regreso de cada salida. NO inventes horarios. NO menciones cupos numéricos.",
  };
}

async function createBooking(supa: any, aliado_id: string, params: any) {
  const { nombre, telefono, email, fecha, salida_id, tipo, pax, notas } = params;
  if (!nombre)    throw new Error("nombre_required");
  if (!fecha)     throw new Error("fecha_required");
  if (!salida_id) throw new Error("salida_id_required");
  if (!tipo)      throw new Error("tipo_required");
  if (!pax)       throw new Error("pax_required");

  const { data: al } = await supa.from("aliados_b2b")
    .select("nombre, comision").eq("id", aliado_id).maybeSingle();
  if (!al) throw new Error("aliado_not_found");

  const precioPublico = ({ "VIP Pass": 320000, "Exclusive Pass": 590000, "Atolon Experience": 1100000 } as any)[tipo];
  if (!precioPublico) throw new Error("tipo_invalido");
  const comision = Number(al.comision) || 0;
  const precioNeto = Math.round(precioPublico * (1 - comision / 100));
  const total = precioNeto * Number(pax);

  const reservaId = `WEB-${Date.now()}`;
  const { error } = await supa.from("reservas").insert({
    id: reservaId,
    fecha, salida_id, tipo, canal: "B2B",
    nombre, contacto: email || telefono || "", email: email || null, telefono: telefono || null,
    pax: Number(pax), pax_a: Number(pax), pax_n: 0,
    precio_u: precioNeto, precio_neto: precioNeto, precio_publico: precioPublico,
    total, abono: 0, saldo: total,
    estado: "pendiente_pago",
    forma_pago: "link_pago",
    aliado_id, vendedor: null,
    notas: `[BOT WA B2B] ${notas || ""} — Comisión: ${comision}%`,
    link_expira_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    idioma: "es",
  });
  if (error) throw new Error(`insert_reserva: ${error.message}`);

  // Sumar contador en sesión B2B (si existe)
  await supa.rpc("noop_ok").catch(() => {}); // ignore if rpc noop no existe
  await supa.from("b2b_wa_sesiones")
    .update({ reservas_creadas: 1 })
    .eq("aliado_id", aliado_id)
    .catch(() => {});

  return { ok: true, reserva_id: reservaId, precio_neto: precioNeto, total, aliado: al.nombre };
}

async function generatePaymentLink(supa: any, aliado_id: string, params: any) {
  const { reserva_id } = params;
  if (!reserva_id) throw new Error("reserva_id_required");

  const { data: r } = await supa.from("reservas")
    .select("id, total, saldo, estado, aliado_id, nombre").eq("id", reserva_id).maybeSingle();
  if (!r) throw new Error("reserva_not_found");
  if (r.aliado_id !== aliado_id) throw new Error("reserva_no_pertenece_a_aliado");
  if (!["pendiente", "pendiente_pago"].includes(r.estado)) throw new Error(`estado_${r.estado}_no_permite_link`);

  const monto = Number(r.saldo) || Number(r.total) || 0;
  if (monto <= 0) throw new Error("monto_invalido");

  // Regenerar link con vigencia 24h
  const expira = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supa.from("reservas").update({
    link_expira_at: expira,
    estado: "pendiente_pago",
  }).eq("id", reserva_id);

  // El link real lo compone el cliente app o el edge wompi. Retornamos base URL.
  const url = `https://www.atolon.co/pago?ref=${reserva_id}`;
  return { ok: true, url, monto, vigencia_horas: 24, reserva_id };
}

async function getRecentBookings(supa: any, aliado_id: string, params: any) {
  const limit = Math.min(20, Math.max(1, Number(params?.limit) || 10));
  const { data } = await supa.from("reservas")
    .select("id, nombre, fecha, tipo, pax, total, estado, saldo, created_at")
    .eq("aliado_id", aliado_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { ok: true, reservas: data || [] };
}

async function redeemPoints(supa: any, aliado_id: string, params: any) {
  const { reserva_id, puntos } = params;
  if (!reserva_id) throw new Error("reserva_id_required");
  if (!puntos || Number(puntos) <= 0) throw new Error("puntos_invalidos");

  // Verificar reserva
  const { data: r } = await supa.from("reservas")
    .select("id, total, saldo, aliado_id, estado").eq("id", reserva_id).maybeSingle();
  if (!r || r.aliado_id !== aliado_id) throw new Error("reserva_no_pertenece");

  // Verificar saldo puntos actual
  const { data: puntosData } = await supa.from("puntos_b2b").select("cantidad, tipo").eq("aliado_id", aliado_id);
  const saldo = (puntosData || []).reduce((s: number, p: any) => {
    return s + (p.tipo === "otorgado" ? Number(p.cantidad) : -Number(p.cantidad));
  }, 0);

  if (saldo < Number(puntos)) throw new Error(`saldo_insuficiente (tienes ${saldo}, pides ${puntos})`);

  // Registrar redención
  await supa.from("puntos_b2b").insert({
    aliado_id, tipo: "redimido", cantidad: Number(puntos),
    reserva_id, motivo: `Redención vía bot WA — reserva ${reserva_id}`,
  });

  return { ok: true, puntos_redimidos: Number(puntos), saldo_nuevo: saldo - Number(puntos), reserva_id };
}

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
