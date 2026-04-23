import { useState, useEffect, useMemo } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";
import { getAyBRango, getAyBPorDia } from "../lib/loggroAyB";

// Format "2026-03" → "marzo 2026"
function fmtMes(mesStr) {
  if (!mesStr) return "—";
  const [y, m] = mesStr.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}

function pctDelta(curr, prev) {
  if (!prev) return null;
  const d = (curr - prev) / prev;
  return { val: d, label: d >= 0 ? `+${(d * 100).toFixed(1)}%` : `${(d * 100).toFixed(1)}%` };
}

// Week helpers
function getMondayOf(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}
function getSundayOf(mondayStr) {
  const d = new Date(mondayStr + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}
function fmtSemana(mondayStr) {
  if (!mondayStr) return "—";
  const from = new Date(mondayStr + "T12:00:00");
  const to   = new Date(mondayStr + "T12:00:00");
  to.setDate(to.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return `${fmt(from)} – ${fmt(to)}`;
}
function fmtDia(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

const SEL = {
  padding: "8px 14px", borderRadius: 8,
  background: B.navyMid, border: `1px solid ${B.navyLight}`,
  color: B.white, fontSize: 13, outline: "none", cursor: "pointer",
};

export default function Financiero() {
  const [reservas,      setReservas]      = useState([]);
  const [cierres,       setCierres]       = useState([]);
  // A&B oficial: viene de Loggro Restobar (/loggro-sync/cierre-caja-rango)
  //   aybLoggroPorDia: { "YYYY-MM-DD": ventas }
  //   aybLoggroPorMetodo: { "2026-04": { Datafono: n, Efectivo: m, ... } } — por mes
  //   aybLoggroTicketsPorMes: { "2026-04": tickets }
  const [aybLoggroPorDia,       setAybLoggroPorDia]       = useState({});
  const [aybLoggroPorMesMetodo, setAybLoggroPorMesMetodo] = useState({});
  const [aybLoggroTicketsPorMes, setAybLoggroTicketsPorMes] = useState({});
  const [reqsList,      setReqsList]      = useState([]);
  const [eventosData,   setEventosData]   = useState([]);
  const [b2bReservas,   setB2bReservas]   = useState([]);
  const [conveniosData, setConveniosData] = useState([]);
  const [cxcRows,       setCxcRows]       = useState([]);
  const [diaDetalle,    setDiaDetalle]    = useState(null);
  const [diaPagos,      setDiaPagos]      = useState([]);
  const [loadingDia,    setLoadingDia]    = useState(false);
  const [loading,       setLoading]       = useState(true);

  const verDia = async (fecha) => {
    if (!supabase) return;
    setDiaDetalle(fecha);
    setLoadingDia(true);
    const [pagosFecha, pagosCreated, aybLoggro, llegadas] = await Promise.all([
      supabase.from("reservas")
        .select("id, nombre, contacto, tipo, total, abono, forma_pago, fecha_pago, created_at, grupo_id, aliado_id")
        .eq("fecha_pago", fecha).gt("abono", 0).neq("estado", "cancelado"),
      supabase.from("reservas")
        .select("id, nombre, contacto, tipo, total, abono, forma_pago, fecha_pago, created_at, grupo_id, aliado_id")
        .is("fecha_pago", null)
        .gte("created_at", fecha + "T00:00:00-05:00")
        .lte("created_at", fecha + "T23:59:59-05:00")
        .gt("abono", 0).neq("estado", "cancelado"),
      // A&B desde Loggro Restobar (reemplaza cierres_caja area='ayb')
      getAyBRango(fecha, fecha),
      supabase.from("muelle_llegadas")
        .select("id, embarcacion_nombre, pax_total, total_cobrado, metodo_pago, tipo, fecha")
        .eq("fecha", fecha).gt("total_cobrado", 0),
    ]);

    const items = [];
    [...(pagosFecha.data || []), ...(pagosCreated.data || [])].forEach(r => {
      items.push({
        tipo: r.grupo_id ? "grupo" : "pasadia",
        id: r.id, nombre: r.nombre || r.contacto || "—",
        concepto: r.tipo || "Reserva", monto: r.abono || 0,
        metodo: r.forma_pago || "—", aliado: !!r.aliado_id, reservaId: r.id,
      });
    });
    const aybDiaVentas = Number(aybLoggro?.por_dia?.[fecha]?.ventas) || 0;
    if (aybDiaVentas > 0) {
      items.push({ tipo: "ayb", id: `ayb-${fecha}`, nombre: "A&B (Loggro Restobar)", concepto: "Ventas A&B del día", monto: aybDiaVentas, metodo: "Multiple" });
    }
    (llegadas.data || []).forEach(l => {
      items.push({ tipo: "llegada", id: l.id, nombre: l.embarcacion_nombre || "Embarcación", concepto: l.tipo === "after_island" ? "After Island" : l.tipo, monto: l.total_cobrado || 0, metodo: l.metodo_pago || "—" });
    });

    setDiaPagos(items.sort((a, b) => b.monto - a.monto));
    setLoadingDia(false);
  };
  const [tab,           setTab]           = useState("ingresos");
  const [granularity,   setGranularity]   = useState("mes"); // "dia" | "semana" | "mes"

  // Current Colombia date/month as default
  const nowCO = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const todayCO   = nowCO.toISOString().slice(0, 10);
  const defaultMes  = `${nowCO.getFullYear()}-${String(nowCO.getMonth() + 1).padStart(2, "0")}`;
  const defaultLunes = getMondayOf(todayCO);

  const [periodoActual,   setPeriodoActual]   = useState(defaultMes);
  const [periodoComparar, setPeriodoComparar] = useState("");

  // Change default period when granularity changes
  useEffect(() => {
    if (granularity === "mes")    { setPeriodoActual(defaultMes);   setPeriodoComparar(""); }
    if (granularity === "semana") { setPeriodoActual(defaultLunes);  setPeriodoComparar(""); }
    if (granularity === "dia")    { setPeriodoActual(todayCO);       setPeriodoComparar(""); }
  }, [granularity]);

  // Load last 13 months of data
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const desde = new Date(nowCO);
    desde.setMonth(desde.getMonth() - 12);
    const desdeStr = desde.toISOString().slice(0, 10);

    Promise.all([
      supabase.from("reservas")
        .select("fecha, created_at, total, tipo, canal, forma_pago, pax, estado, grupo_id")
        .gte("fecha", desdeStr)
        .neq("estado", "cancelado")
        .is("grupo_id", null),       // solo pasadías directas — grupos/eventos vienen de la tabla eventos
      supabase.from("cierres_caja")
        .select("fecha, total_ventas, total_general, area, metodos")
        .gte("fecha", desdeStr),
      supabase.from("requisiciones")
        .select("fecha, total, categoria, area, estado, descripcion")
        .gte("fecha", desdeStr)
        .not("estado", "in", '("rechazado","cancelado")'),
      supabase.from("eventos")
        .select("id, fecha, nombre, tipo, valor, pax, pasadias_org, servicios_contratados, categoria, stage, vendedor, contacto, pagos")
        .gte("fecha", desdeStr)
        .not("stage", "in", '("Perdido","Cancelado")')
        .in("categoria", ["grupo", "evento"]),
      supabase.from("muelle_llegadas")
        .select("id, fecha, embarcacion_nombre, pax_total, total_cobrado, metodo_pago, tipo")
        .gte("fecha", desdeStr)
        .gt("total_cobrado", 0),
      // B2B reservas para calcular comisiones
      supabase.from("reservas")
        .select("fecha, total, tipo, aliado_id, pax")
        .gte("fecha", desdeStr)
        .neq("estado", "cancelado")
        .not("aliado_id", "is", null)
        .is("grupo_id", null),
      supabase.from("b2b_convenios")
        .select("aliado_id, tipo_pasadia, tarifa_publica, tarifa_neta")
        .eq("activo", true),
    ]).then(async ([resR, cierresR, reqsR, evR, llegR, b2bResR, convR]) => {
      // A&B oficial desde Loggro Restobar (rango = últimos 13 meses → hoy)
      // Se guarda por-día, y por-mes (por_metodo) para consumo en helpers.
      try {
        const loggro = await getAyBRango(desdeStr, todayCO);
        const porDia = {};
        const porMesMetodo = {};
        const ticketsPorMes = {};
        for (const [fecha, d] of Object.entries(loggro?.por_dia || {})) {
          porDia[fecha] = Number(d?.ventas) || 0;
          const mes = fecha.slice(0, 7);
          ticketsPorMes[mes] = (ticketsPorMes[mes] || 0) + (Number(d?.tickets) || 0);
          const pm = porMesMetodo[mes] || (porMesMetodo[mes] = {});
          for (const [met, val] of Object.entries(d?.por_metodo || {})) {
            pm[met] = (pm[met] || 0) + (Number(val) || 0);
          }
        }
        setAybLoggroPorDia(porDia);
        setAybLoggroPorMesMetodo(porMesMetodo);
        setAybLoggroTicketsPorMes(ticketsPorMes);
      } catch (e) {
        console.warn("[Financiero] no se pudo cargar Loggro A&B:", e?.message);
      }
      // Merge llegadas as virtual reserva entries for P&L
      const llegadasComoReservas = (llegR.data || []).map(l => ({
        fecha: l.fecha,
        total: l.total_cobrado,
        tipo: l.tipo === "after_island" ? "After Island" : "Walk-in",
        canal: "Walk-in",
        forma_pago: l.metodo_pago === "efectivo" ? "Efectivo" : l.metodo_pago === "transferencia" ? "Transferencia" : l.metodo_pago === "datafono" ? "Datáfono" : l.metodo_pago || "Efectivo",
        pax: l.pax_total,
        estado: "check_in",
        grupo_id: null,
        _esLlegada: true,
        _embarcacion: l.embarcacion_nombre,
      }));
      setReservas([...(resR.data || []), ...llegadasComoReservas]);
      setCierres(cierresR.data || []);
      setReqsList(reqsR.data || []);
      setEventosData(evR.data || []);
      setB2bReservas(b2bResR.data || []);
      setConveniosData(convR.data || []);
      setLoading(false);
    });

  }, []);

  // ── Period range ───────────────────────────────────────────────────────────
  const periodoRange = (key) => {
    if (!key) return null;
    if (granularity === "dia")    return { from: key, to: key };
    if (granularity === "semana") return { from: key, to: getSundayOf(key) };
    // mes
    const [y, m] = key.split("-");
    const last = new Date(parseInt(y), parseInt(m), 0).getDate();
    return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
  };

  const inRange = (fecha, range) => !!range && !!fecha && fecha >= range.from && fecha <= range.to;

  const fmtPeriodo = (key) => {
    if (!key) return "—";
    if (granularity === "dia")    return fmtDia(key);
    if (granularity === "semana") return fmtSemana(key);
    return fmtMes(key);
  };

  // ── Available periods ──────────────────────────────────────────────────────
  const meses = useMemo(() => {
    const set = new Set([...(reservas || []), ...(cierres || [])].map(r => r.fecha?.slice(0, 7)).filter(Boolean));
    set.add(defaultMes);
    return Array.from(set).sort().reverse();
  }, [reservas, cierres]);

  const semanas = useMemo(() => {
    const set = new Set();
    [...(reservas || []), ...(cierres || [])].forEach(r => { if (r.fecha) set.add(getMondayOf(r.fecha)); });
    set.add(defaultLunes);
    return Array.from(set).sort().reverse();
  }, [reservas, cierres]);

  const dias = useMemo(() => {
    const set = new Set();
    [...(reservas || []), ...(cierres || [])].forEach(r => { if (r.fecha) set.add(r.fecha); });
    set.add(todayCO);
    return Array.from(set).sort().reverse();
  }, [reservas, cierres]);

  const periodos = granularity === "mes" ? meses : granularity === "semana" ? semanas : dias;

  // Set default comparison once data loads
  useEffect(() => {
    if (periodos.length > 1 && !periodoComparar) {
      const idx = periodos.indexOf(periodoActual);
      setPeriodoComparar(periodos[idx + 1] || periodos[1] || "");
    }
  }, [periodos]);

  // ── Per-period helpers ─────────────────────────────────────────────────────
  const resDePeriodo = (key) => {
    const r = periodoRange(key);
    return reservas.filter(x => inRange(x.fecha, r));
  };

  const normTipo = (t) => {
    if (!t) return "Otros";
    const s = t.trim().toLowerCase();
    if (s === "vip pass" || s === "vip-pass") return "VIP Pass";
    if (s === "exclusive pass" || s === "exclusive-pass") return "Exclusive Pass";
    if (s === "atolon experience" || s === "atolon-experience") return "Atolon Experience";
    if (s === "after island" || s === "after-island") return "After Island";
    // Capitalize first letter of each word as fallback
    return t.trim().replace(/\b\w/g, c => c.toUpperCase());
  };

  const ingresosPorTipo = (key) => {
    const groups = {};
    resDePeriodo(key).forEach(r => {
      const cat = normTipo(r.tipo);
      groups[cat] = (groups[cat] || 0) + (r.total || 0);
    });
    return Object.entries(groups).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
  };

  const normCanal = (c) => {
    if (!c) return "Directo";
    const s = c.trim().toLowerCase();
    if (s === "web" || s === "web booking") return "Web";
    if (s === "whatsapp")                   return "WhatsApp";
    if (s === "b2b")                        return "B2B";
    if (s === "telefono" || s === "teléfono") return "Teléfono";
    if (s === "walk-in" || s === "walk in" || s === "presencial") return "Walk-in";
    return c.trim();
  };

  const ingresosPorCanal = (key) => {
    const groups = {};
    resDePeriodo(key).forEach(r => {
      const c = normCanal(r.canal);
      groups[c] = (groups[c] || 0) + (r.total || 0);
    });
    return Object.entries(groups).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
  };

  const normForma = (f) => {
    if (!f) return "Pago Pendiente";
    const s = f.trim().toLowerCase();
    if (s === "wompi")            return "Wompi";
    if (s === "web" || s === "web booking") return "Web";
    if (s === "transferencia")    return "Transferencia";
    if (s === "efectivo")         return "Efectivo";
    if (s === "sky" || s === "sky bookings") return "SKY";
    if (s === "cxc")              return "CXC";
    if (s === "link_pago" || s === "link de pago" || s === "enviar link de pago") return "Link de Pago";
    return f.trim();
  };

  const ingresosPorPago = (key) => {
    const groups = {};
    resDePeriodo(key).forEach(r => {
      const p = normForma(r.forma_pago);
      groups[p] = (groups[p] || 0) + (r.total || 0);
    });
    return Object.entries(groups).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
  };

  // ── Derived numbers ────────────────────────────────────────────────────────
  const resA    = resDePeriodo(periodoActual);
  const resC    = resDePeriodo(periodoComparar);
  const tiposA  = ingresosPorTipo(periodoActual);
  const tiposC  = ingresosPorTipo(periodoComparar);
  const canalesA = ingresosPorCanal(periodoActual);
  const pagosA   = ingresosPorPago(periodoActual);

  const totalA    = tiposA.reduce((s, r) => s + r.val, 0);
  const totalC    = tiposC.reduce((s, r) => s + r.val, 0);
  const reservasA = resA.length;
  const reservasC = resC.length;
  const paxA      = resA.reduce((s, r) => s + (r.pax || 0), 0);
  const ticketA   = reservasA > 0 ? totalA / reservasA : 0;
  const ticketC   = reservasC > 0 ? totalC / reservasC : 0;

  if (loading) {
    return (
      <div style={{ padding: "60px 0", textAlign: "center", color: B.sand, fontSize: 15 }}>
        Cargando datos financieros…
      </div>
    );
  }

  const deltaIng  = pctDelta(totalA, totalC);
  const deltaRes  = pctDelta(reservasA, reservasC);
  const deltaTick = pctDelta(ticketA, ticketC);

  // ── Cierre / A&B helpers ──────────────────────────────────────────────────
  // cierres_caja se mantiene para Pasadías y otras áreas. A&B ya NO se lee de
  // cierres_caja: viene de Loggro Restobar vía /loggro-sync/cierre-caja-rango.
  const cierresDePeriodo       = (key) => { const r = periodoRange(key); return cierres.filter(c => inRange(c.fecha, r)); };
  const cierresNoAyBDePeriodo  = (key) => cierresDePeriodo(key).filter(c => c.area !== "ayb");

  // Total de cierres_caja (áreas distintas a pasadías Y distintas a A&B)
  //   — A&B se agrega aparte desde Loggro; pasadías ya se cuenta en reservas.
  const totalCierres = (key) =>
    cierresNoAyBDePeriodo(key)
      .filter(c => c.area !== "pasadias")
      .reduce((s, c) => s + (c.total_ventas || c.total_general || 0), 0);

  // A&B oficial desde Loggro Restobar — suma por fecha dentro del rango del período
  const totalAyB = (key) => {
    const r = periodoRange(key);
    if (!r) return 0;
    let sum = 0;
    for (const [fecha, v] of Object.entries(aybLoggroPorDia)) {
      if (inRange(fecha, r)) sum += Number(v) || 0;
    }
    return sum;
  };

  // Días con ventas A&B en el período (reemplaza "cantidad de cierres")
  const diasAyBConVentas = (key) => {
    const r = periodoRange(key);
    if (!r) return 0;
    let n = 0;
    for (const [fecha, v] of Object.entries(aybLoggroPorDia)) {
      if (inRange(fecha, r) && (Number(v) || 0) > 0) n++;
    }
    return n;
  };

  // A&B por método de pago desde Loggro (agrega meses que caen dentro del rango)
  //   NOTA: Loggro solo entrega granularidad mensual por método en nuestra caché;
  //   para día/semana se usa el rango de meses que toca el período.
  const aybPorMetodo = (key) => {
    const r = periodoRange(key);
    if (!r) return [];
    const mesesEnRango = new Set();
    // Inclusive: recorre cada mes entre r.from y r.to
    const from = new Date(r.from + "T12:00:00");
    const to   = new Date(r.to   + "T12:00:00");
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cursor <= to) {
      mesesEnRango.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const groups = {};
    for (const mes of mesesEnRango) {
      const met = aybLoggroPorMesMetodo[mes] || {};
      for (const [k, v] of Object.entries(met)) {
        const label = k; // Loggro ya devuelve labels humanos (Datafono, Efectivo, etc.)
        groups[label] = (groups[label] || 0) + (Number(v) || 0);
      }
    }
    // Escalar al total real del período si granularity !== mes (aproximación simple)
    const sumGroups = Object.values(groups).reduce((s, v) => s + v, 0);
    const totalPeriodo = totalAyB(key);
    if (sumGroups > 0 && totalPeriodo > 0 && Math.abs(sumGroups - totalPeriodo) / sumGroups > 0.01) {
      const factor = totalPeriodo / sumGroups;
      for (const k of Object.keys(groups)) groups[k] = groups[k] * factor;
    }
    return Object.entries(groups).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
  };

  // ── Eventos / Grupos helpers ───────────────────────────────────────────────
  const montoEvento = (e) => {
    if (e.valor > 0) return e.valor;
    return (e.pasadias_org || [])
      .filter(p => p.tipo !== "Impuesto Muelle")
      .reduce((ss, p) => ss + (Number(p.personas) || 0) * (Number(p.precio) || 0), 0);
  };
  const eventosDePeriodo = (key) => { const r = periodoRange(key); return eventosData.filter(x => inRange(x.fecha, r)); };
  const eventosConfirmados = (key) => eventosDePeriodo(key).filter(e => ["Confirmado","Realizado"].includes(e.stage));
  const totalGrupos = (key) => eventosConfirmados(key).filter(e => e.categoria === "grupo").reduce((s, e) => s + montoEvento(e), 0);
  const totalEventos = (key) => eventosConfirmados(key).filter(e => e.categoria === "evento").reduce((s, e) => s + montoEvento(e), 0);

  // totalCotizacion para el tab Eventos & Grupos (incluye servicios_contratados)
  const totalCotizacion = (e) => {
    const base     = e.valor > 0 ? e.valor : montoEvento(e);
    const servicios = (e.servicios_contratados || []).reduce((s, x) => s + (Number(x.valor) || 0), 0);
    return base + servicios;
  };

  // ── Comisiones B2B ──────────────────────────────────────────────────────────
  // Build convenio lookup: { aliado_id: { tipo_lower: { publica, neta } } }
  const convMap = {};
  conveniosData.forEach(c => {
    if (!convMap[c.aliado_id]) convMap[c.aliado_id] = {};
    convMap[c.aliado_id][c.tipo_pasadia.toLowerCase()] = { publica: c.tarifa_publica, neta: c.tarifa_neta };
  });

  const comisionesDePeriodo = (key) => {
    const r = periodoRange(key);
    // Comisiones de reservas B2B individuales
    let total = b2bReservas.filter(x => inRange(x.fecha, r)).reduce((s, res) => {
      const conv = convMap[res.aliado_id]?.[res.tipo?.toLowerCase()];
      if (!conv) return s;
      return s + (conv.publica - conv.neta) * (res.pax || 0);
    }, 0);
    // Comisiones de grupos B2B (desde eventosData)
    eventosData.filter(e => e.aliado_id && e.categoria === "grupo" && ["Confirmado","Realizado"].includes(e.stage) && inRange(e.fecha, r))
      .forEach(g => {
        (g.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF").forEach(p => {
          const conv = convMap[g.aliado_id]?.[p.tipo?.toLowerCase()];
          if (!conv) return;
          const adultos = Number(p.adultos) || 0;
          const ninos   = Number(p.ninos)   || 0;
          const personas = Number(p.personas) || 0;
          if (adultos > 0 || ninos > 0) {
            total += (conv.publica - conv.neta) * adultos;
          } else {
            total += (conv.publica - conv.neta) * personas;
          }
        });
      });
    return total;
  };

  // ── P&L helpers ───────────────────────────────────────────────────────────
  const reqsDePeriodo = (key) => { const r = periodoRange(key); return reqsList.filter(x => inRange(x.fecha, r)); };

  const totalGastos = (key) =>
    reqsDePeriodo(key).reduce((s, r) => s + (r.total || 0), 0) + comisionesDePeriodo(key);

  const gastosPorCategoria = (key) => {
    const groups = {};
    reqsDePeriodo(key).forEach(r => {
      const cat = r.categoria || "Otros";
      groups[cat] = (groups[cat] || 0) + (r.total || 0);
    });
    return Object.entries(groups).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Financiero</h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              Ingresos y costos operativos · Colombia
            </div>
          </div>
          {/* Granularity toggle */}
          <div style={{ display: "flex", background: B.navyMid, borderRadius: 8, padding: 3, gap: 2 }}>
            {[{ key: "dia", label: "Día" }, { key: "semana", label: "Semana" }, { key: "mes", label: "Mes" }].map(g => (
              <button key={g.key} onClick={() => setGranularity(g.key)} style={{
                padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                fontWeight: 600, fontSize: 12,
                background: granularity === g.key ? B.sky : "transparent",
                color: granularity === g.key ? B.navy : "rgba(255,255,255,0.5)",
                transition: "all 0.15s",
              }}>{g.label}</button>
            ))}
          </div>
        </div>
        {/* Period selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {granularity === "dia" ? (
            <input type="date" value={periodoActual} max={todayCO}
              onChange={e => setPeriodoActual(e.target.value)}
              style={{ ...SEL, colorScheme: "dark" }} />
          ) : (
            <select value={periodoActual} onChange={e => setPeriodoActual(e.target.value)} style={SEL}>
              {periodos.map(p => <option key={p} value={p}>{fmtPeriodo(p)}</option>)}
            </select>
          )}
          {tab === "ingresos" && <>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>vs</span>
            {granularity === "dia" ? (
              <input type="date" value={periodoComparar} max={todayCO}
                onChange={e => setPeriodoComparar(e.target.value)}
                style={{ ...SEL, colorScheme: "dark" }} />
            ) : (
              <select value={periodoComparar} onChange={e => setPeriodoComparar(e.target.value)} style={SEL}>
                <option value="">Sin comparar</option>
                {periodos.filter(p => p !== periodoActual).map(p => <option key={p} value={p}>{fmtPeriodo(p)}</option>)}
              </select>
            )}
          </>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: B.navyMid, borderRadius: 10, padding: 4 }}>
        {[
          { key: "ingresos", label: "📊 Ingresos" },
          { key: "pl",       label: "📈 P & L" },
          { key: "flujo",    label: "💧 Flujo de Caja" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
            fontWeight: 600, fontSize: 13,
            background: tab === t.key ? B.sky : "transparent",
            color: tab === t.key ? B.navy : "rgba(255,255,255,0.5)",
            transition: "all 0.15s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── P & L Tab ── */}
      {tab === "pl" && (() => {
        const ingPasadias = totalA;                                        // reservas sin grupo_id
        const ingGrupos   = totalGrupos(periodoActual);                    // eventos categoria=grupo
        const ingEventos  = totalEventos(periodoActual);                   // eventos categoria=evento
        const ingCierres  = totalCierres(periodoActual);                   // cierres_caja (no ayb, no pasadias)
        const ingAyB      = totalAyB(periodoActual);                       // A&B desde Loggro Restobar
        const ing   = ingPasadias + ingGrupos + ingEventos + ingCierres + ingAyB;
        const gas   = totalGastos(periodoActual);
        const util  = ing - gas;
        const margen = ing > 0 ? (util / ing) * 100 : 0;
        const cats  = gastosPorCategoria(periodoActual);
        const ingPasadiasC = totalC;
        const ingGruposC   = totalGrupos(periodoComparar || "");
        const ingEventosC  = totalEventos(periodoComparar || "");
        const ingCierresC  = totalCierres(periodoComparar || "");
        const ingAyBC      = totalAyB(periodoComparar || "");
        const ingC  = ingPasadiasC + ingGruposC + ingEventosC + ingCierresC + ingAyBC;
        const gasC  = totalGastos(periodoComparar || "");
        const utilC = ingC - gasC;

        const Row = ({ label, val, color, bold, sub, delta }) => (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: sub ? "8px 20px 8px 36px" : "13px 20px",
            borderBottom: `1px solid ${B.navyLight}`,
            background: bold ? B.navyLight + "66" : "transparent",
          }}>
            <span style={{ fontSize: sub ? 12 : 14, color: sub ? "rgba(255,255,255,0.55)" : B.white, fontWeight: bold ? 700 : 400 }}>
              {label}
            </span>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: sub ? 12 : 14, fontWeight: bold ? 700 : 500, color: color || B.white }}>
                {COP(val)}
              </div>
              {delta != null && periodoComparar && (
                <div style={{ fontSize: 10, color: delta >= 0 ? B.success : B.danger }}>
                  {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}% vs {fmtPeriodo(periodoComparar)}
                </div>
              )}
            </div>
          </div>
        );

        return (
          <div>
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Ingresos", val: COP(ing), color: B.success,  delta: ingC  ? pctDelta(ing,  ingC)  : null },
                { label: "Gastos",   val: COP(gas), color: B.danger,   delta: gasC  ? pctDelta(gas,  gasC)  : null },
                { label: "Utilidad", val: COP(util),color: util >= 0 ? B.success : B.danger, delta: utilC ? pctDelta(util, utilC) : null },
                { label: "Margen",   val: margen.toFixed(1) + "%", color: margen >= 0 ? B.warning : B.danger, delta: null },
              ].map(k => (
                <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${k.color}` }}>
                  <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: k.color }}>{k.val}</div>
                  {k.delta && periodoComparar && (
                    <div style={{ fontSize: 11, marginTop: 4, color: k.delta.val >= 0 ? B.success : B.danger }}>{k.delta.label}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Estado de Resultados */}
            <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}` }}>
                <h3 style={{ fontSize: 15, margin: 0, color: B.sand }}>Estado de Resultados — {fmtPeriodo(periodoActual)}</h3>
              </div>

              {/* Ingresos */}
              <Row label="INGRESOS" val={ing} bold color={B.success} delta={ingC ? (ing - ingC) / (ingC || 1) : null} />
              {ingPasadias > 0 && <Row label="Pasadías" val={ingPasadias} sub />}
              {ingGrupos   > 0 && <Row label="Grupos"   val={ingGrupos}   sub />}
              {ingEventos  > 0 && <Row label="Eventos"  val={ingEventos}  sub />}
              {(() => {
                const AREA_LABEL = { pasadias: "Pasadías (Caja)", after_island: "After Island", otros: "Otros" };
                const byArea = {};
                // A&B ya NO se lee de cierres_caja — se inyecta desde Loggro.
                cierresNoAyBDePeriodo(periodoActual).forEach(c => {
                  const k = c.area || "otros";
                  byArea[k] = (byArea[k] || 0) + (c.total_ventas || c.total_general || 0);
                });
                const ayb = totalAyB(periodoActual);
                const rows = [];
                if (ayb > 0) rows.push(["ayb", ayb, "Alimentos y Bebidas (Loggro)"]);
                Object.entries(byArea).forEach(([area, val]) => rows.push([area, val, AREA_LABEL[area] || area]));
                if (rows.length === 0) return null;
                return rows.map(([area, val, label]) => (
                  <Row key={area} label={label} val={val} sub />
                ));
              })()}

              {/* Costos y Gastos */}
              <div style={{ height: 1, background: B.navyLight, margin: "4px 0" }} />
              <Row label="COSTOS Y GASTOS" val={gas} bold color={B.danger} delta={gasC ? (gas - gasC) / (gasC || 1) : null} />
              {(() => { const com = comisionesDePeriodo(periodoActual); return com > 0 ? <Row label="Comisiones B2B" val={com} sub /> : null; })()}
              {cats.length === 0 && comisionesDePeriodo(periodoActual) === 0
                ? <div style={{ padding: "8px 20px 8px 36px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin gastos en este período</div>
                : cats.map(c => <Row key={c.cat} label={c.cat} val={c.val} sub />)
              }

              {/* Utilidad */}
              <div style={{ height: 1, background: B.navyLight, margin: "4px 0" }} />
              <div style={{
                padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
                background: util >= 0 ? B.success + "18" : B.danger + "18",
              }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>UTILIDAD NETA</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: util >= 0 ? B.success : B.danger, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {COP(util)}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                    Margen {margen.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Evolución P&L */}
            {meses.length > 1 && (
              <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, marginTop: 16 }}>
                <h3 style={{ fontSize: 15, color: B.sand, margin: "0 0 16px" }}>Evolución Mensual P&L</h3>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  {meses.slice(0, 6).reverse().map(mes => {
                    const i = totalCierres(mes) + totalAyB(mes);
                    const g = totalGastos(mes);
                    const u = i - g;
                    const maxVal = Math.max(...meses.slice(0, 6).map(m => totalCierres(m) + totalAyB(m)), 1);
                    const hI = Math.max((i / maxVal) * 80, i > 0 ? 3 : 0);
                    const hG = Math.max((g / maxVal) * 80, g > 0 ? 3 : 0);
                    const isSel = mes === periodoActual;
                    return (
                      <div key={mes} onClick={() => setPeriodoActual(mes)}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
                        <div style={{ fontSize: 9, color: u >= 0 ? B.success : B.danger, fontWeight: 700 }}>{COP(u)}</div>
                        <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 80 }}>
                          <div style={{ flex: 1, height: hI, borderRadius: "3px 3px 0 0", background: B.success + (isSel ? "ff" : "88") }} />
                          <div style={{ flex: 1, height: hG, borderRadius: "3px 3px 0 0", background: B.danger  + (isSel ? "ff" : "88") }} />
                        </div>
                        <div style={{ fontSize: 10, color: isSel ? B.sky : "rgba(255,255,255,0.4)", textAlign: "center" }}>
                          {new Date(mes + "-15").toLocaleDateString("es-CO", { month: "short" })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: B.success }} /> Ingresos
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: B.danger }} /> Gastos
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Ingresos Tab ── */}
      {tab === "ingresos" && <>

      {/* ── KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          {
            label: "Ingresos Totales",
            val: COP(totalA + totalAyB(periodoActual)),
            delta: deltaIng,
            color: B.success,
            sub: totalAyB(periodoActual) > 0 ? `Reservas ${COP(totalA)} · A&B ${COP(totalAyB(periodoActual))}` : null,
          },
          {
            label: "Reservas",
            val: String(reservasA),
            delta: deltaRes,
            color: B.sky,
          },
          {
            label: "Pax en el mes",
            val: String(paxA),
            delta: null,
            color: B.sand,
          },
          {
            label: "Ticket Promedio",
            val: COP(ticketA),
            delta: deltaTick,
            color: B.warning,
          },
        ].map(k => (
          <div key={k.label} style={{
            background: B.navyMid, borderRadius: 12, padding: "16px 20px",
            borderLeft: `4px solid ${k.color}`,
          }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>
              {k.val}
            </div>
            {k.delta && periodoComparar && (
              <div style={{ fontSize: 11, marginTop: 4, color: k.delta.val >= 0 ? B.success : B.danger }}>
                {k.delta.label} vs {fmtPeriodo(periodoComparar)}
              </div>
            )}
            {k.sub && (
              <div style={{ fontSize: 10, marginTop: 4, color: "rgba(255,255,255,0.35)" }}>{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* ── Ingresos por Tipo de Pasadia ── */}
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 15, color: B.success, margin: 0 }}>Por Tipo de Pasadía</h3>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{COP(totalA)}</span>
          </div>
          {tiposA.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
              Sin ventas en {fmtPeriodo(periodoActual)}
            </div>
          ) : tiposA.map((r, i) => {
            const prev = tiposC.find(c => c.cat === r.cat)?.val || 0;
            const d = pctDelta(r.val, prev);
            const pctOfTotal = totalA > 0 ? (r.val / totalA) * 100 : 0;
            return (
              <div key={r.cat} style={{
                padding: "11px 20px",
                borderBottom: i < tiposA.length - 1 ? `1px solid ${B.navyLight}` : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 13 }}>{r.cat}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{COP(r.val)}</div>
                    {d && periodoComparar && (
                      <div style={{ fontSize: 10, color: d.val >= 0 ? B.success : B.danger }}>{d.label}</div>
                    )}
                  </div>
                </div>
                <div style={{ height: 3, background: B.navy, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pctOfTotal}%`, height: "100%", background: B.success, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Ingresos por Canal ── */}
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 15, color: B.sky, margin: 0 }}>Por Canal de Venta</h3>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{reservasA} reservas</span>
          </div>
          {canalesA.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
              Sin ventas en {fmtPeriodo(periodoActual)}
            </div>
          ) : canalesA.map((r, i) => {
            const pctOfTotal = totalA > 0 ? (r.val / totalA) * 100 : 0;
            const count = resA.filter(res => (res.canal || "Directo") === r.cat).length;
            return (
              <div key={r.cat} style={{
                padding: "11px 20px",
                borderBottom: i < canalesA.length - 1 ? `1px solid ${B.navyLight}` : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div>
                    <span style={{ fontSize: 13 }}>{r.cat}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>{count} res.</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{COP(r.val)}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{pctOfTotal.toFixed(1)}%</div>
                  </div>
                </div>
                <div style={{ height: 3, background: B.navy, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pctOfTotal}%`, height: "100%", background: B.sky, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Ingresos por Método de Pago ── */}
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 15, color: B.warning, margin: 0 }}>Por Método de Pago</h3>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{pagosA.length} métodos</span>
          </div>
          {pagosA.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
              Sin ventas en {fmtPeriodo(periodoActual)}
            </div>
          ) : pagosA.map((r, i) => {
            const pctOfTotal = totalA > 0 ? (r.val / totalA) * 100 : 0;
            const count = resA.filter(res => normForma(res.forma_pago) === r.cat).length;
            return (
              <div key={r.cat} style={{
                padding: "11px 20px",
                borderBottom: i < pagosA.length - 1 ? `1px solid ${B.navyLight}` : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div>
                    <span style={{ fontSize: 13 }}>{r.cat}</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 8 }}>{count} res.</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{COP(r.val)}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{pctOfTotal.toFixed(1)}%</div>
                  </div>
                </div>
                <div style={{ height: 3, background: B.navy, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${pctOfTotal}%`, height: "100%", background: B.warning, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Ingresos A&B ── */}
      {(() => {
        const aybTotal = totalAyB(periodoActual);
        const aybMets  = aybPorMetodo(periodoActual);
        const aybDias  = diasAyBConVentas(periodoActual);
        return (
          <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", marginTop: 16 }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h3 style={{ fontSize: 15, color: "#f4a261", margin: 0 }}>🍽️ Ingresos A&B</h3>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>📊 Fuente: Loggro Restobar</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{COP(aybTotal)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{aybDias} día{aybDias !== 1 ? "s" : ""} con ventas</div>
              </div>
            </div>
            {aybMets.length === 0 ? (
              <div style={{ padding: "24px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                Sin ventas de A&B en {fmtPeriodo(periodoActual)}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 0 }}>
                {aybMets.map((r, i) => {
                  const pct = aybTotal > 0 ? (r.val / aybTotal) * 100 : 0;
                  return (
                    <div key={r.cat} style={{
                      padding: "12px 20px",
                      borderRight: `1px solid ${B.navyLight}`,
                      borderBottom: `1px solid ${B.navyLight}`,
                    }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{r.cat}</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{COP(r.val)}</div>
                      <div style={{ height: 3, background: B.navy, borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#f4a261", borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>{pct.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Evolución mensual (últimos 6 meses) ── */}
      {meses.length > 1 && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, marginTop: 16 }}>
          <h3 style={{ fontSize: 15, color: B.sand, margin: "0 0 16px" }}>Evolución Mensual</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100 }}>
            {meses.slice(0, 6).reverse().map(mes => {
              const total = resDePeriodo(mes).reduce((s, r) => s + (r.total || 0), 0);
              const maxT  = Math.max(...meses.slice(0, 6).map(m => resDePeriodo(m).reduce((s, r) => s + (r.total || 0), 0)), 1);
              const h = Math.max((total / maxT) * 80, total > 0 ? 4 : 0);
              const isSelected = mes === periodoActual;
              return (
                <div key={mes} onClick={() => setPeriodoActual(mes)}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <div style={{ fontSize: 10, color: isSelected ? B.sky : "rgba(255,255,255,0.4)", fontWeight: isSelected ? 700 : 400 }}>
                    {COP(total)}
                  </div>
                  <div style={{
                    width: "100%", height: h, borderRadius: 4,
                    background: isSelected ? B.sky : B.navyLight,
                    transition: "all 0.2s",
                    border: isSelected ? `2px solid ${B.sky}` : "none",
                  }} />
                  <div style={{ fontSize: 10, color: isSelected ? B.sky : "rgba(255,255,255,0.4)", textAlign: "center", textTransform: "capitalize" }}>
                    {new Date(mes + "-15").toLocaleDateString("es-CO", { month: "short" })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Info footer ── */}
      <div style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
        Solo ingresos de reservas confirmadas · Los gastos se registran en módulo de Requisiciones
      </div>
      </>}

      {/* ── Flujo de Caja Tab ── */}
      {tab === "flujo" && (() => {
        // For flujo de caja always show by month, iterate each day
        const [flujoMes, setFlujoMes] = [periodoActual, setPeriodoActual];
        const [y, m] = flujoMes.slice(0, 7).split("-").map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();

        // Build day-by-day data
        const days = Array.from({ length: daysInMonth }, (_, i) => {
          const d = String(i + 1).padStart(2, "0");
          const fecha = `${y}-${String(m).padStart(2, "0")}-${d}`;
          const resTotal   = reservas.filter(r => {
            const fechaPago = r.created_at
              ? new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
              : r.fecha;
            return fechaPago === fecha;
          }).reduce((s, r) => s + (r.total || 0), 0);
          // cierres_caja sin A&B (A&B viene de Loggro) + ventas A&B del día desde Loggro
          const cierreTotal = cierres.filter(c => c.fecha === fecha && c.area !== "ayb").reduce((s, c) => s + (c.total_ventas || c.total_general || 0), 0)
                            + (Number(aybLoggroPorDia[fecha]) || 0);
          // Pagos de eventos/grupos (array pagos[] con {fecha, monto})
          const eventosTotal = eventosData.reduce((s, e) => {
            return s + (e.pagos || []).filter(p => p.fecha === fecha).reduce((ss, p) => ss + (Number(p.monto) || 0), 0);
          }, 0);
          const total = resTotal + cierreTotal + eventosTotal;
          return { fecha, d: i + 1, resTotal, cierreTotal, eventosTotal, total };
        });

        const maxDay = Math.max(...days.map(d => d.total), 1);
        const totalMes = days.reduce((s, d) => s + d.total, 0);
        const diasConVentas = days.filter(d => d.total > 0).length;
        const promDia = diasConVentas > 0 ? totalMes / diasConVentas : 0;
        const mejorDia = days.reduce((best, d) => d.total > best.total ? d : best, days[0]);

        return (
          <div>
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Total del Mes",     val: COP(totalMes),   color: B.success },
                { label: "Días con ingresos", val: String(diasConVentas), color: B.sky },
                { label: "Promedio por día",  val: COP(promDia),    color: B.sand },
                { label: "Mejor día",         val: mejorDia.total > 0 ? fmtDia(mejorDia.fecha).split(",")[0] : "—", color: B.warning },
              ].map(k => (
                <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${k.color}` }}>
                  <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: k.color }}>{k.val}</div>
                </div>
              ))}
            </div>

            {/* Gráfico de barras diarias */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, color: B.sand, margin: "0 0 16px" }}>Ingresos diarios — {fmtMes(flujoMes.slice(0, 7))}</h3>
              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 120 }}>
                {days.map(day => {
                  const h = Math.max((day.total / maxDay) * 100, day.total > 0 ? 4 : 0);
                  const isToday = day.fecha === todayCO;
                  const hasData = day.total > 0;
                  return (
                    <div key={day.d} title={`${day.fecha}: ${COP(day.total)}`}
                      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "default" }}>
                      <div style={{ width: "100%", height: h, borderRadius: "3px 3px 0 0",
                        background: isToday ? B.sky : hasData ? B.success : B.navyLight,
                        transition: "height 0.2s",
                      }} />
                      <div style={{ fontSize: 9, color: isToday ? B.sky : "rgba(255,255,255,0.3)" }}>
                        {day.d}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, justifyContent: "flex-end" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: B.success }} /> Con ingresos
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: B.sky }} /> Hoy
                </div>
              </div>
            </div>

            {/* Tabla detallada */}
            <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Detalle por día</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{diasConVentas} días activos</span>
              </div>
              {days.filter(d => d.total > 0).map((day, i, arr) => {
                const pct = totalMes > 0 ? (day.total / totalMes) * 100 : 0;
                return (
                  <div key={day.fecha} onClick={() => verDia(day.fecha)}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    style={{
                      padding: "11px 20px",
                      borderBottom: i < arr.length - 1 ? `1px solid ${B.navyLight}` : "none",
                      cursor: "pointer", transition: "background 0.15s",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDia(day.fecha)}</span>
                        <div style={{ display: "flex", gap: 12, marginTop: 3 }}>
                          {day.resTotal > 0   && <span style={{ fontSize: 11, color: B.success }}>Pasadías {COP(day.resTotal)}</span>}
                          {day.eventosTotal > 0 && <span style={{ fontSize: 11, color: "#34d399" }}>Grupos/Eventos {COP(day.eventosTotal)}</span>}
                          {day.cierreTotal > 0 && <span style={{ fontSize: 11, color: "#f4a261" }}>A&B {COP(day.cierreTotal)}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{COP(day.total)}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{pct.toFixed(1)}%</div>
                      </div>
                    </div>
                    <div style={{ height: 3, background: B.navy, borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: B.success, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
              {days.filter(d => d.total > 0).length === 0 && (
                <div style={{ padding: "32px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                  Sin ingresos registrados en {fmtMes(flujoMes.slice(0, 7))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {/* ── CXC Tab — moved to its own module ── */}
      {false && (() => {
        const totalCxc = cxcRows.reduce((s, r) => s + (r.saldo || 0), 0);
        // Group by aliado vs directo
        const b2b = cxcRows.filter(r => r.aliado_id);
        const directo = cxcRows.filter(r => !r.aliado_id);
        // Compute aging
        const aging = (fechaStr) => {
          if (!fechaStr) return 0;
          const f = new Date(fechaStr + "T12:00:00");
          return Math.floor((nowCO - f) / (1000 * 60 * 60 * 24));
        };
        const agingColor = (d) => d <= 7 ? B.success : d <= 30 ? B.warning : B.danger;

        const renderRow = (r) => {
          const dias = aging(r.fecha);
          return (
            <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <td style={{ padding: "10px 12px", fontSize: 12, color: B.sky, fontFamily: "monospace" }}>{r.id}</td>
              <td style={{ padding: "10px 12px", fontSize: 13 }}>
                <div style={{ fontWeight: 700 }}>{r.nombre || "—"}</div>
                {r.contacto && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{r.contacto}</div>}
              </td>
              <td style={{ padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{r.fecha}</td>
              <td style={{ padding: "10px 12px", fontSize: 12 }}>
                <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: B.sand }}>{r.tipo}</span>
              </td>
              <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{COP(r.total)}</td>
              <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12, color: B.success }}>{COP(r.abono)}</td>
              <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, fontWeight: 800, color: B.warning }}>{COP(r.saldo)}</td>
              <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 11 }}>
                <span style={{ background: agingColor(dias) + "22", color: agingColor(dias), borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>{dias}d</span>
              </td>
              <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{r.forma_pago || "—"}</td>
            </tr>
          );
        };

        const tableHead = (
          <thead>
            <tr style={{ borderBottom: `1px solid ${B.navyLight}`, background: B.navy }}>
              {["ID", "Cliente", "Fecha", "Tipo", "Total", "Abono", "Saldo", "Días", "Forma"].map(h => (
                <th key={h} style={{ padding: "10px 12px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: ["Total","Abono","Saldo"].includes(h) ? "right" : ["Días"].includes(h) ? "center" : "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
        );

        return (
          <div>
            {/* Resumen KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
              <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${B.warning}` }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total CXC</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(totalCxc)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{cxcRows.length} {cxcRows.length === 1 ? "transacción" : "transacciones"}</div>
              </div>
              <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${B.sky}` }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>B2B / Agencias</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(b2b.reduce((s, r) => s + (r.saldo || 0), 0))}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{b2b.length} reservas</div>
              </div>
              <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${B.sand}` }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Directo / Walk-in</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(directo.reduce((s, r) => s + (r.saldo || 0), 0))}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{directo.length} reservas</div>
              </div>
            </div>

            {/* Tabla CXC */}
            {cxcRows.length === 0 ? (
              <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>Sin saldos pendientes</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Todas las reservas están al día.</div>
              </div>
            ) : (
              <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    {tableHead}
                    <tbody>
                      {cxcRows.map(renderRow)}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${B.warning}`, background: B.navy }}>
                        <td colSpan={6} style={{ padding: "12px 12px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Total CXC</td>
                        <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 16, fontWeight: 900, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(totalCxc)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
              * Días = días desde la fecha de la reserva. Verde ≤7d · Amarillo ≤30d · Rojo &gt;30d<br />
              * Excluye reservas canceladas. Incluye todas las reservas con saldo pendiente sin importar el período.
            </div>
          </div>
        );
      })()}

      {/* tab eventos removed — now in Resultados */}
      {false && (() => {
        const mes = periodoActual.slice(0, 7);
        const [y, m] = mes.split("-").map(Number);
        const fmtFechaCorta = (d) => {
          if (!d) return "—";
          const dt = new Date(d + "T12:00:00");
          return dt.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
        };

        const lista = eventosData
          .filter(e => e.fecha && e.fecha.slice(0, 7) === mes)
          .sort((a, b) => a.fecha.localeCompare(b.fecha));

        const pipelineTotal = lista.reduce((s, e) => s + totalCotizacion(e), 0);

        const STAGE_COLOR = {
          Consulta:   "rgba(255,255,255,0.3)",
          Cotizado:   "#f59e0b",
          Confirmado: "#22c55e",
          Realizado:  "#38bdf8",
          Perdido:    "#ef4444",
          Cancelado:  "#ef4444",
        };

        const TIPO_ICON = {
          grupo:  "👥",
          evento: "🎉",
        };

        const mesLabel = new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });

        return (
          <div>
            {/* Header totalizador */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>📅</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Eventos y Grupos — {mesLabel}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{lista.length} eventos en el período</div>
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>
                {COP(pipelineTotal)}
              </div>
            </div>

            {lista.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                Sin eventos ni grupos en {mesLabel}
              </div>
            ) : (
              <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
                {/* Encabezados */}
                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 130px 60px 120px 150px", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${B.navyLight}44`, fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  <span>Fecha</span>
                  <span>Nombre</span>
                  <span>Tipo</span>
                  <span>Pax</span>
                  <span>Stage</span>
                  <span style={{ textAlign: "right" }}>Monto Cotizado</span>
                </div>

                {lista.map((e, i) => {
                  const monto = totalCotizacion(e);
                  const stageColor = STAGE_COLOR[e.stage] || "rgba(255,255,255,0.3)";
                  const pax = e.categoria === "grupo"
                    ? (e.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF").reduce((s, p) => s + (Number(p.personas) || 0), 0) || e.pax || 0
                    : e.pax || 0;

                  return (
                    <div key={e.id || i} style={{ display: "grid", gridTemplateColumns: "100px 1fr 130px 60px 120px 150px", gap: 12, padding: "14px 20px", borderBottom: i < lista.length - 1 ? `1px solid ${B.navyLight}22` : "none", alignItems: "center" }}>
                      {/* Fecha */}
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{fmtFechaCorta(e.fecha)}</div>

                      {/* Nombre + contacto + vendedor */}
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{e.nombre || "—"}</div>
                        {e.contacto && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{e.contacto}</div>}
                        {e.vendedor && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>👤 {e.vendedor}</div>}
                      </div>

                      {/* Tipo */}
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{TIPO_ICON[e.categoria] || "📋"}</span>
                        <span>{e.tipo || (e.categoria === "grupo" ? "Grupo" : "Evento")}</span>
                      </div>

                      {/* Pax */}
                      <div style={{ fontSize: 14, fontWeight: 700, color: pax > 0 ? B.white : "rgba(255,255,255,0.2)" }}>
                        {pax > 0 ? pax : "—"}
                      </div>

                      {/* Stage */}
                      <div>
                        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: `1px solid ${stageColor}55`, color: stageColor, fontWeight: 700 }}>
                          {e.stage}
                        </span>
                      </div>

                      {/* Monto */}
                      <div style={{ textAlign: "right", fontSize: 16, fontWeight: 800, color: monto > 0 ? B.sand : "rgba(255,255,255,0.2)", fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {monto > 0 ? COP(monto) : "—"}
                      </div>
                    </div>
                  );
                })}

                {/* Footer total */}
                <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 130px 60px 120px 150px", gap: 12, padding: "14px 20px", background: B.navy, borderTop: `1px solid ${B.navyLight}44` }}>
                  <div style={{ gridColumn: "span 5", fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", alignSelf: "center" }}>Total Pipeline Eventos y Grupos</div>
                  <div style={{ textAlign: "right", fontSize: 20, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(pipelineTotal)}</div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Modal: Detalle de pagos del día ── */}
      {diaDetalle && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}
          onClick={e => { if (e.target === e.currentTarget) { setDiaDetalle(null); setDiaPagos([]); } }}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif" }}>💧 Pagos del día</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                  {new Date(diaDetalle + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
              </div>
              <button onClick={() => { setDiaDetalle(null); setDiaPagos([]); }}
                style={{ background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.5)", padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>
                ✕ Cerrar
              </button>
            </div>

            {loadingDia ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando...</div>
            ) : diaPagos.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Sin pagos registrados para este día.</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "Pasadías", color: B.sky,      filter: x => x.tipo === "pasadia" },
                    { label: "Grupos",   color: "#34d399",  filter: x => x.tipo === "grupo" },
                    { label: "A&B",      color: B.sand,     filter: x => x.tipo === "ayb" },
                    { label: "Llegadas", color: "#f97316",  filter: x => x.tipo === "llegada" },
                  ].map(k => {
                    const items = diaPagos.filter(k.filter);
                    if (items.length === 0) return null;
                    return (
                      <div key={k.label} style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${k.color}` }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{k.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(items.reduce((s, x) => s + x.monto, 0))}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{items.length} {items.length === 1 ? "pago" : "pagos"}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {diaPagos.map((p, i) => {
                    const tipoColor = { pasadia: B.sky, grupo: "#34d399", ayb: B.sand, llegada: "#f97316" }[p.tipo] || "#fff";
                    const tipoLabel = { pasadia: "Pasadía", grupo: "Grupo", ayb: "A&B", llegada: "Llegada" }[p.tipo] || p.tipo;
                    const canOpen = p.reservaId && (p.tipo === "pasadia" || p.tipo === "grupo");
                    const openReserva = () => {
                      if (!canOpen) return;
                      window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "reservas", reservaId: p.reservaId } }));
                    };
                    return (
                      <div key={p.id + "-" + i} onClick={openReserva}
                        style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${tipoColor}`,
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                          cursor: canOpen ? "pointer" : "default", transition: "background 0.15s" }}
                        onMouseEnter={e => { if (canOpen) e.currentTarget.style.background = B.navyLight; }}
                        onMouseLeave={e => { if (canOpen) e.currentTarget.style.background = B.navy; }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: B.white }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ color: tipoColor, fontWeight: 700 }}>{tipoLabel}</span>
                            <span>{p.concepto}</span>
                            {p.aliado && <span style={{ color: B.sky }}>B2B</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: tipoColor, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(p.monto)}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{p.metodo}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 16, padding: "12px 16px", background: B.navy, borderRadius: 10, borderTop: `2px solid ${B.sky}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Total del día</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(diaPagos.reduce((s, p) => s + p.monto, 0))}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
