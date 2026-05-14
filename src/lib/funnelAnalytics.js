// funnelAnalytics — helpers para calcular embudos de conversión, retención
// y journey de cliente por bucket de origen.
//
// Diseño: funciones puras que toman datos crudos (sesiones, embudos, reservas)
// y devuelven estructuras listas para renderizar. Cero side effects, totalmente
// testeable.

import { clasificarOrigenReserva, clasificarOrigen, ORIGEN_BUCKETS } from "./origenClassifier.js";

// ── Pasos del embudo (alineados con track_embudos columns paso_N_ts) ────────
export const FUNNEL_STEPS = [
  { paso: 1, key: "paso_1_ts", label: "Vio booking" },
  { paso: 2, key: "paso_2_ts", label: "Eligió fecha" },
  { paso: 3, key: "paso_3_ts", label: "Eligió paquete" },
  { paso: 4, key: "paso_4_ts", label: "Datos personales" },
  { paso: 5, key: "paso_5_ts", label: "Llegó a pago" },
  { paso: 6, key: "paso_6_ts", label: "Completó pago" },
];

/**
 * Calcula la cascada del embudo por bucket de origen.
 *
 * @param {object} opts
 * @param {Array}  opts.sesiones   - filas de track_sesiones (con origen_tipo)
 * @param {Array}  opts.embudos    - filas de track_embudos (con sesion_id y paso_N_ts)
 * @param {Array}  opts.reservas   - filas de reservas (con estado, canal, total, grupo_id...)
 * @returns {Array<{bucket, label, pasos:[{label,count,pct,dropoff}], reservas, checkIn, ingreso, convRate}>}
 */
export function calcularFunnelPorOrigen({ sesiones = [], embudos = [], reservas = [] }) {
  // Index sesiones por id para resolver origen_tipo en embudos
  const sesPorId = new Map();
  const sesPorOrigen = {};
  for (const s of sesiones) {
    sesPorId.set(s.id, s);
    const b = s.origen_tipo || clasificarOrigen({ utms: s.utms, referrer: s.referrer, canal: s.canal });
    if (!sesPorOrigen[b]) sesPorOrigen[b] = new Set();
    sesPorOrigen[b].add(s.id);
  }

  // Cada paso del embudo: contar sesiones (por origen) que lo alcanzaron
  const out = {};
  for (const b of ORIGEN_BUCKETS) {
    out[b] = {
      bucket: b,
      total_sesiones: (sesPorOrigen[b] || new Set()).size,
      pasos: FUNNEL_STEPS.map(() => 0),
      reservas: 0,
      checkIn: 0,
      ingreso: 0,
    };
  }

  for (const e of embudos) {
    const ses = sesPorId.get(e.sesion_id);
    const b = ses?.origen_tipo || clasificarOrigen({
      utms: ses?.utms, referrer: ses?.referrer, canal: ses?.canal,
    });
    if (!out[b]) continue;
    FUNNEL_STEPS.forEach((step, idx) => {
      if (e[step.key]) out[b].pasos[idx]++;
    });
  }

  // Reservas confirmadas + check_in por bucket
  for (const r of reservas) {
    const b = clasificarOrigenReserva(r);
    if (!out[b]) continue;
    if (["confirmado", "check_in", "pagado"].includes(r.estado)) {
      out[b].reservas++;
      out[b].ingreso += r.total || 0;
    }
    if (r.estado === "check_in") out[b].checkIn++;
  }

  // Construir cascada con drop-off por paso
  return ORIGEN_BUCKETS.map(b => {
    const data = out[b];
    const cascada = FUNNEL_STEPS.map((step, idx) => {
      const count = data.pasos[idx];
      const total = data.total_sesiones || 0;
      const pct = total ? (count / total) * 100 : 0;
      const prevCount = idx === 0 ? total : data.pasos[idx - 1];
      const dropoff = prevCount && prevCount > count ? ((prevCount - count) / prevCount) * 100 : 0;
      return { label: step.label, paso: step.paso, count, pct: Number(pct.toFixed(1)), dropoff: Number(dropoff.toFixed(1)) };
    });
    // Detectar mayor abandono (paso con dropoff más alto)
    const peor = cascada.slice(1).reduce((max, p) => p.dropoff > (max?.dropoff || 0) ? p : max, null);
    return {
      bucket:        b,
      total_sesiones: data.total_sesiones,
      cascada,
      mayor_abandono: peor,
      reservas:      data.reservas,
      checkIn:       data.checkIn,
      ingreso:       data.ingreso,
      convRate:      data.total_sesiones ? Number(((data.reservas / data.total_sesiones) * 100).toFixed(2)) : 0,
    };
  });
}

/**
 * Construye el timeline ordenado de un cliente desde múltiples fuentes.
 *
 * @param {object} opts
 * @param {Array} opts.sesiones    - de track_sesiones
 * @param {Array} opts.eventos     - de track_eventos (top eventos importantes)
 * @param {Array} opts.reservas    - de reservas
 * @param {Array} opts.waMensajes  - de wa_mensajes (opcional)
 * @returns {Array<{tipo, ts, titulo, descripcion, color, icon, payload}>}
 */
export function construirTimeline({ sesiones = [], eventos = [], reservas = [], waMensajes = [] }) {
  const items = [];

  // Sesiones web
  for (const s of sesiones) {
    items.push({
      tipo: "sesion",
      ts: s.created_at,
      titulo: `Visita web · ${nombreOrigen(s.origen_tipo || "web")}`,
      descripcion: [
        s.pais && s.ciudad ? `${s.ciudad}, ${s.pais}` : null,
        s.dispositivo,
        s.duracion_seg ? `${Math.round(s.duracion_seg / 60)} min` : null,
        s.convertida ? "✅ convirtió" : null,
      ].filter(Boolean).join(" · "),
      icon: "🌐",
      color: s.convertida ? "success" : "info",
      payload: s,
    });
  }

  // Eventos importantes (filtramos los relevantes para timeline)
  const EVENTOS_IMPORTANTES = new Set([
    "payment_attempt", "payment_error", "booking_widget_visto",
    "exit_intent", "abandono", "click_whatsapp", "scroll_90",
  ]);
  for (const e of eventos) {
    if (!EVENTOS_IMPORTANTES.has(e.tipo)) continue;
    items.push({
      tipo: "evento",
      ts: e.ts,
      titulo: nombreEvento(e.tipo),
      descripcion: resumenEvento(e),
      icon: iconoEvento(e.tipo),
      color: e.tipo.includes("error") || e.tipo.includes("abandono") ? "warning" : "info",
      payload: e,
    });
  }

  // Reservas + cambios de estado
  for (const r of reservas) {
    items.push({
      tipo: "reserva",
      ts: r.created_at,
      titulo: `Reserva ${r.id} creada`,
      descripcion: `${r.tipo || "—"} · ${r.pax} pax · $${(r.total || 0).toLocaleString("es-CO")} · ${r.canal || "—"}`,
      icon: "📅",
      color: "success",
      payload: r,
    });
    if (r.estado === "confirmado" || r.estado === "check_in") {
      items.push({
        tipo: "confirmacion",
        ts: r.fecha_pago || r.updated_at || r.created_at,
        titulo: `Reserva confirmada`,
        descripcion: `${r.id} · ${r.forma_pago || "—"} · abono $${(r.abono || 0).toLocaleString("es-CO")}`,
        icon: "✅",
        color: "success",
        payload: r,
      });
    }
    if (r.estado === "check_in") {
      items.push({
        tipo: "checkin",
        ts: r.updated_at || r.fecha,
        titulo: "Check-in en muelle",
        descripcion: `${r.id} · ${r.pax} pax · día de visita ${r.fecha}`,
        icon: "🏖️",
        color: "success",
        payload: r,
      });
    }
    if (r.estado === "cancelado") {
      items.push({
        tipo: "cancelacion",
        ts: r.updated_at || r.created_at,
        titulo: "Reserva cancelada",
        descripcion: r.id,
        icon: "❌",
        color: "warning",
        payload: r,
      });
    }
  }

  // WhatsApp messages — agrupar por conversación, mostrar primera + última
  if (waMensajes.length > 0) {
    const porConv = {};
    for (const m of waMensajes) {
      const k = m.conversacion_id || m.telefono || "default";
      if (!porConv[k]) porConv[k] = [];
      porConv[k].push(m);
    }
    for (const [convId, msgs] of Object.entries(porConv)) {
      const ordenados = msgs.sort((a, b) => (a.timestamp || a.created_at || "").localeCompare(b.timestamp || b.created_at || ""));
      const primer = ordenados[0];
      items.push({
        tipo: "whatsapp",
        ts: primer.timestamp || primer.created_at,
        titulo: `Conversación WhatsApp (${msgs.length} mensajes)`,
        descripcion: (primer.contenido || primer.body || "").slice(0, 120),
        icon: "💬",
        color: "info",
        payload: { conversacion_id: convId, count: msgs.length, primer },
      });
    }
  }

  // Ordenar cronológicamente (filtrar items sin timestamp)
  return items
    .filter(i => i.ts)
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

// ── Resumen ejecutivo ────────────────────────────────────────────────────────

/**
 * Calcula KPIs comparativos entre buckets de origen.
 *
 * @returns {Array<{bucket, sesiones, reservas, repeatRate, avgTicket, timeToBook,
 *                  topDropoff, ingresoTotal}>}
 */
export function calcularResumenEjecutivo({ sesiones = [], embudos = [], reservas = [] }) {
  // Index sesiones por usuario_id para detectar visitas únicas
  const sesPorUsuario = {};
  for (const s of sesiones) {
    if (!s.usuario_id) continue;
    if (!sesPorUsuario[s.usuario_id]) sesPorUsuario[s.usuario_id] = [];
    sesPorUsuario[s.usuario_id].push(s);
  }

  // Reservas por bucket
  const reservasPorBucket = {};
  for (const r of reservas) {
    const b = clasificarOrigenReserva(r);
    if (!reservasPorBucket[b]) reservasPorBucket[b] = [];
    reservasPorBucket[b].push(r);
  }

  // Sesiones por bucket
  const sesPorBucket = {};
  for (const s of sesiones) {
    const b = s.origen_tipo || clasificarOrigen({ utms: s.utms, referrer: s.referrer, canal: s.canal });
    if (!sesPorBucket[b]) sesPorBucket[b] = [];
    sesPorBucket[b].push(s);
  }

  // Calcular funnel por bucket para top drop-off
  const funnel = calcularFunnelPorOrigen({ sesiones, embudos, reservas });
  const funnelPorBucket = {};
  for (const f of funnel) funnelPorBucket[f.bucket] = f;

  // Email → reservas (para detectar repeat customers)
  const reservasPorEmail = {};
  for (const r of reservas) {
    const email = (r.email || r.contacto || "").toLowerCase();
    if (!email || !email.includes("@")) continue;
    if (!reservasPorEmail[email]) reservasPorEmail[email] = [];
    reservasPorEmail[email].push(r);
  }

  return ORIGEN_BUCKETS.map(b => {
    const ses = sesPorBucket[b] || [];
    const res = (reservasPorBucket[b] || []).filter(r => ["confirmado","check_in","pagado"].includes(r.estado));
    const ingresoTotal = res.reduce((sum, r) => sum + (r.total || 0), 0);
    const avgTicket = res.length ? Math.round(ingresoTotal / res.length) : 0;

    // Repeat rate: porcentaje de emails con 2+ reservas en este bucket
    const emails = new Set(res.map(r => (r.email || r.contacto || "").toLowerCase()).filter(e => e.includes("@")));
    let repeat = 0;
    for (const email of emails) {
      const todasSusReservas = reservasPorEmail[email] || [];
      if (todasSusReservas.length >= 2) repeat++;
    }
    const repeatRate = emails.size ? Number(((repeat / emails.size) * 100).toFixed(1)) : 0;

    return {
      bucket:       b,
      sesiones:     ses.length,
      reservas:     res.length,
      repeatRate,
      avgTicket,
      ingresoTotal,
      topDropoff:   funnelPorBucket[b]?.mayor_abandono || null,
    };
  });
}

// ── Helpers de presentación ──────────────────────────────────────────────────

function nombreOrigen(b) {
  const map = { grupo: "Grupo", whatsapp: "WhatsApp", marketing: "Marketing", staff: "Staff", web: "Web directo" };
  return map[b] || b;
}
function nombreEvento(tipo) {
  const map = {
    payment_attempt:    "Intentó pagar",
    payment_error:      "Error en pago",
    booking_widget_visto: "Vio booking widget",
    exit_intent:        "Quiso salir (exit intent)",
    abandono:           "Abandonó sesión",
    click_whatsapp:     "Click WhatsApp",
    scroll_90:          "Scroll 90%",
  };
  return map[tipo] || tipo;
}
function iconoEvento(tipo) {
  if (tipo.includes("payment")) return "💳";
  if (tipo.includes("whatsapp")) return "💬";
  if (tipo.includes("abandono") || tipo.includes("exit")) return "🚪";
  if (tipo.includes("scroll")) return "📏";
  return "•";
}
function resumenEvento(e) {
  if (e.datos?.metodo)   return `vía ${e.datos.metodo}${e.datos.monto ? ` · $${e.datos.monto.toLocaleString("es-CO")}` : ""}`;
  if (e.datos?.paso_actual) return `en paso ${e.datos.paso_actual} del embudo`;
  if (e.datos?.source) return `desde ${e.datos.source}`;
  return "";
}
