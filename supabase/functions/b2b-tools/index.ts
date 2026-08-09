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
    codigo: al.codigo,
    saldo_puntos: saldoPuntos,
    reservas_mes: paxMes,
    revenue_mes: revenueMes,
    cupo_credito: Number(al.cupo_credito) || 0,
    credito_dias: al.credito_dias,
    nota: "IMPORTANTE: Los precios NETOS son valores FIJOS en BD (no calculados con comisión). Cuando el aliado pregunte por precios netos o públicos, SIEMPRE llama check_availability_b2b para obtener los valores reales — NUNCA calcules ni inventes.",
  };
}

async function checkAvailability(supa: any, aliado_id: string, params: any) {
  const { fecha, pax } = params;
  if (!fecha) throw new Error("fecha_required");
  const paxNum = Math.max(1, Number(pax) || 1);

  // Cupos por salida + cierres + config real de BD + aliado + pases reales
  const [{ data: reservas }, { data: cierres }, { data: aliado }, { data: salidasCfg }, { data: pasadias }] = await Promise.all([
    supa.from("reservas").select("salida_id, pax")
      .eq("fecha", fecha)
      .in("estado", ["confirmado", "pendiente", "pendiente_pago", "check_in"]),
    supa.from("cierres_fecha").select("tipo, salida_id").eq("fecha", fecha),
    supa.from("aliados_b2b").select("comision").eq("id", aliado_id).maybeSingle(),
    supa.from("salidas").select("id, hora, hora_regreso, capacidad_total, activo, auto_apertura, auto_umbral, orden").eq("activo", true).order("orden"),
    supa.from("pasadias").select("nombre, precio, precio_neto_agencia, precio_nino, precio_neto_nino, sin_embarcacion")
      .eq("activo", true).eq("web_publica", true).eq("sin_embarcacion", false).order("orden"),
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

  // Precios REALES desde tabla pasadias — con precio_publico y precio_neto_agencia
  // FIJOS por pasadía (NO calculados con % comisión). El campo comision del aliado
  // solo aplica cuando no hay precio_neto_agencia configurado.
  const pases = (pasadias || []).map((p: any) => {
    const publico = Number(p.precio) || 0;
    const netoFijo = Number(p.precio_neto_agencia) || 0;
    const netoAgencia = netoFijo > 0 ? netoFijo : Math.round(publico * (1 - comision / 100));
    return {
      tipo: p.nombre,
      precio_publico: publico,
      precio_neto_agencia: netoAgencia,
    };
  }).filter((p: any) =>
    p.precio_publico > 0
    && !/impuesto|muelle|transporte|staff|hu[eé]sped|inspecci[oó]n|blue apple|mesa|nairo|flamante|consumo|cama de playa|coctail/i.test(p.tipo)
  );

  return {
    disponible_para_pax: salidas_abiertas.length > 0,
    fecha,
    pax_solicitado: paxNum,
    salidas_abiertas,
    pases,
    comision_pct: comision,
    nota: "REGLAS: (1) Usa EXACTAMENTE los valores hora_salida y hora_regreso — NO inventes. (2) NO menciones cupos numéricos. (3) Por default muestra SOLO precio_publico — NUNCA menciones neto ni comisión. Al final pregunta: '¿Quieres que te comparta también los precios netos para tu agencia?' Solo si dicen sí muestras precio_neto_agencia.",
  };
}

async function createBooking(supa: any, aliado_id: string, params: any) {
  const { nombre, telefono, email, fecha, salida_id, tipo, pax, notas,
          modo_precio, // 'publico' | 'neto' — cómo se factura la reserva
          forma_pago,  // 'transferencia' | 'link_pago' — cómo se cobra
        } = params;
  if (!nombre)    throw new Error("nombre_required");
  if (!fecha)     throw new Error("fecha_required");
  if (!salida_id) throw new Error("salida_id_required");
  if (!tipo)      throw new Error("tipo_required");
  if (!pax)       throw new Error("pax_required");
  if (!modo_precio) throw new Error("modo_precio_required (pregunta al aliado: publico o neto)");
  if (!forma_pago)  throw new Error("forma_pago_required (pregunta al aliado: transferencia o link_pago)");

  const { data: al } = await supa.from("aliados_b2b")
    .select("nombre, comision").eq("id", aliado_id).maybeSingle();
  if (!al) throw new Error("aliado_not_found");

  // Buscar pasadía por nombre (case-insensitive, contiene)
  const tipoNorm = String(tipo || "").toUpperCase().trim();
  const { data: pases } = await supa.from("pasadias")
    .select("nombre, precio, precio_neto_agencia")
    .eq("activo", true).eq("web_publica", true);
  const pas = (pases || []).find((p: any) => {
    const n = String(p.nombre).toUpperCase();
    return n === tipoNorm
        || n.includes(tipoNorm)
        || tipoNorm.includes(n)
        || (tipoNorm.includes("VIP") && n.includes("VIP") && !n.includes("SIN") && !n.includes("DISCOUNT") && !n.includes("BEBIDA"))
        || (tipoNorm.includes("EXCLUSIVE") && n.includes("EXCLUSIVE") && !n.includes("SIN"))
        || (tipoNorm.includes("ATOLON") && n.includes("ATOLON") && n.includes("EXPERIENCE"));
  });
  if (!pas) throw new Error(`tipo_invalido: no encontre "${tipo}" en pasadias`);

  const publico = Number(pas.precio) || 0;
  const neto = Number(pas.precio_neto_agencia) || Math.round(publico * (1 - (Number(al.comision) || 0) / 100));
  const modoNorm = String(modo_precio).toLowerCase();
  const precioU = modoNorm === "neto" ? neto : publico;
  const total = precioU * Number(pax);

  const formaNorm = String(forma_pago).toLowerCase();
  const esLink = formaNorm.includes("link") || formaNorm.includes("wompi");
  const estado = esLink ? "pendiente_pago" : "pendiente";

  const reservaId = `WEB-${Date.now()}`;
  const { error } = await supa.from("reservas").insert({
    id: reservaId,
    fecha, salida_id, tipo: pas.nombre, canal: "B2B",
    nombre, contacto: email || telefono || "", email: email || null, telefono: telefono || null,
    pax: Number(pax), pax_a: Number(pax), pax_n: 0,
    precio_u: precioU, precio_neto: neto, precio_publico: publico,
    total, abono: 0, saldo: total,
    estado,
    forma_pago: esLink ? "link_pago" : "Transferencia",
    aliado_id, vendedor: null,
    notas: `[BOT WA B2B] ${notas || ""} — Modo precio: ${modoNorm} — Forma pago: ${esLink ? "link_pago" : "Transferencia"}`.trim(),
    link_expira_at: esLink ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
    idioma: "es",
  });
  if (error) throw new Error(`insert_reserva: ${error.message}`);

  return {
    ok: true,
    reserva_id: reservaId,
    tipo: pas.nombre,
    modo_precio: modoNorm,
    forma_pago: esLink ? "link_pago" : "Transferencia",
    precio_unitario: precioU,
    total,
    aliado: al.nombre,
    proximo_paso: esLink
      ? "Usa generate_payment_link_b2b para obtener el URL Wompi para enviar al cliente."
      : "Reserva creada. Se enviará info por transferencia al aliado.",
  };
}

async function generatePaymentLink(supa: any, aliado_id: string, params: any) {
  const { reserva_id } = params;
  if (!reserva_id) throw new Error("reserva_id_required");

  const { data: r } = await supa.from("reservas")
    .select("id, total, saldo, estado, aliado_id, nombre, email").eq("id", reserva_id).maybeSingle();
  if (!r) throw new Error("reserva_not_found");
  if (r.aliado_id !== aliado_id) throw new Error("reserva_no_pertenece_a_aliado");
  if (!["pendiente", "pendiente_pago"].includes(r.estado)) throw new Error(`estado_${r.estado}_no_permite_link`);

  const monto = Number(r.saldo) || Number(r.total) || 0;
  if (monto <= 0) throw new Error("monto_invalido");

  // Regenerar vigencia 24h
  const expira = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supa.from("reservas").update({
    link_expira_at: expira,
    estado: "pendiente_pago",
  }).eq("id", reserva_id);

  // Wompi checkout hosted URL con signature de integridad
  const WOMPI_PUB_KEY = "pub_prod_j2kColsiNhfHj27SWbi62nQpUTNFPZc1";
  const WOMPI_INTEGRITY_KEY = Deno.env.get("WOMPI_INTEGRITY_KEY") ?? "";
  const amountCentavos = Math.round(monto * 100).toString();
  const currency = "COP";
  let signature = "";
  if (WOMPI_INTEGRITY_KEY) {
    const raw = `${reserva_id}${amountCentavos}${currency}${WOMPI_INTEGRITY_KEY}`;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    signature = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const parts = [
    `public-key=${WOMPI_PUB_KEY}`,
    `currency=${currency}`,
    `amount-in-cents=${amountCentavos}`,
    `reference=${reserva_id}`,
  ];
  if (signature) parts.push(`signature:integrity=${signature}`);
  if (r.email)   parts.push(`customer-data:email=${encodeURIComponent(r.email)}`);
  parts.push(`redirect-url=${encodeURIComponent(`https://www.atolon.co/pago-ok?ref=${reserva_id}`)}`);

  const url = `https://checkout.wompi.co/p/?${parts.join("&")}`;
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
