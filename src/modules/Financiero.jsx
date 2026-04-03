import { useState, useEffect, useMemo } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

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
  const [reqsList,      setReqsList]      = useState([]);
  const [loading,       setLoading]       = useState(true);
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
        .select("fecha, total, tipo, canal, forma_pago, pax, estado")
        .gte("fecha", desdeStr)
        .eq("estado", "confirmado"),
      supabase.from("cierres_caja")
        .select("fecha, total_ventas, total_general, area, metodos")
        .gte("fecha", desdeStr),
      supabase.from("requisiciones")
        .select("fecha, total, categoria, area, estado, descripcion")
        .gte("fecha", desdeStr)
        .not("estado", "in", '("rechazado","cancelado")'),
    ]).then(([resR, cierresR, reqsR]) => {
      setReservas(resR.data || []);
      setCierres(cierresR.data || []);
      setReqsList(reqsR.data || []);
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

  const ingresosPorTipo = (key) => {
    const groups = {};
    resDePeriodo(key).forEach(r => {
      const cat = r.tipo || "Otros";
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
  const cierresDePeriodo    = (key) => { const r = periodoRange(key); return cierres.filter(c => inRange(c.fecha, r)); };
  const cierresAyBDePeriodo = (key) => cierresDePeriodo(key).filter(c => c.area === "ayb");

  const totalCierres = (key) =>
    cierresDePeriodo(key).reduce((s, c) => s + (c.total_ventas || c.total_general || 0), 0);

  const totalAyB = (key) =>
    cierresAyBDePeriodo(key).reduce((s, c) => s + (c.total_ventas || c.total_general || 0), 0);

  const aybPorMetodo = (key) => {
    const groups = {};
    cierresAyBDePeriodo(key).forEach(c => {
      const metodos = c.metodos || {};
      Object.entries(metodos).forEach(([k, val]) => {
        const v = typeof val === "object" ? (val.venta || 0) : (val || 0);
        if (v > 0) {
          const label = { datafono: "Datáfono", efectivo: "Efectivo", link_pago: "Link de Pago",
            resort_credit: "Resort Credit", transferencia: "Transferencia", otros: "Otros" }[k] || k;
          groups[label] = (groups[label] || 0) + v;
        }
      });
    });
    return Object.entries(groups).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
  };

  // ── P&L helpers ───────────────────────────────────────────────────────────
  const reqsDePeriodo = (key) => { const r = periodoRange(key); return reqsList.filter(x => inRange(x.fecha, r)); };

  const totalGastos = (key) =>
    reqsDePeriodo(key).reduce((s, r) => s + (r.total || 0), 0);

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
        const ing   = totalCierres(periodoActual);
        const gas   = totalGastos(periodoActual);
        const util  = ing - gas;
        const margen = ing > 0 ? (util / ing) * 100 : 0;
        const cats  = gastosPorCategoria(periodoActual);
        const ingC  = totalCierres(periodoComparar || "");
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
              {cierresDePeriodo(periodoActual).length === 0
                ? <div style={{ padding: "8px 20px 8px 36px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin cierres de caja registrados</div>
                : <Row label={`Cierres de Caja (${cierresDePeriodo(periodoActual).length})`} val={ing} sub />
              }

              {/* Gastos */}
              <div style={{ height: 1, background: B.navyLight, margin: "4px 0" }} />
              <Row label="GASTOS" val={gas} bold color={B.danger} delta={gasC ? (gas - gasC) / (gasC || 1) : null} />
              {cats.length === 0
                ? <div style={{ padding: "8px 20px 8px 36px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin requisiciones en este mes</div>
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
                    const i = totalCierres(mes);
                    const g = totalGastos(mes);
                    const u = i - g;
                    const maxVal = Math.max(...meses.slice(0, 6).map(m => totalCierres(m)), 1);
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
        const aybc     = cierresAyBDePeriodo(periodoActual);
        return (
          <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", marginTop: 16 }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 15, color: "#f4a261", margin: 0 }}>🍽️ Ingresos A&B</h3>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{COP(aybTotal)}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{aybc.length} cierre{aybc.length !== 1 ? "s" : ""} de caja</div>
              </div>
            </div>
            {aybMets.length === 0 ? (
              <div style={{ padding: "24px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                Sin cierres de A&B en {fmtPeriodo(periodoActual)}
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
    </div>
  );
}
