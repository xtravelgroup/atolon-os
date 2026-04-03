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

  // Current Colombia month as default
  const nowCO = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const defaultMes = `${nowCO.getFullYear()}-${String(nowCO.getMonth() + 1).padStart(2, "0")}`;

  const [mesActual,   setMesActual]   = useState(defaultMes);
  const [mesComparar, setMesComparar] = useState("");

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

  // Available months derived from data (+ current month always present)
  const meses = useMemo(() => {
    const set = new Set((reservas || []).map(r => r.fecha?.slice(0, 7)).filter(Boolean));
    set.add(defaultMes);
    return Array.from(set).sort().reverse();
  }, [reservas]);

  // Set default comparison to previous month once data loads
  useEffect(() => {
    if (meses.length > 1 && !mesComparar) {
      const idx = meses.indexOf(mesActual);
      setMesComparar(meses[idx + 1] || meses[1]);
    }
  }, [meses]);

  // ── Per-month helpers ──────────────────────────────────────────────────────
  const resDeMes = (mes) => reservas.filter(r => r.fecha?.startsWith(mes));

  const ingresosPorTipo = (mes) => {
    const groups = {};
    resDeMes(mes).forEach(r => {
      const cat = r.tipo || "Otros";
      groups[cat] = (groups[cat] || 0) + (r.total || 0);
    });
    return Object.entries(groups)
      .map(([cat, val]) => ({ cat, val }))
      .sort((a, b) => b.val - a.val);
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

  const ingresosPorCanal = (mes) => {
    const groups = {};
    resDeMes(mes).forEach(r => {
      const c = normCanal(r.canal);
      groups[c] = (groups[c] || 0) + (r.total || 0);
    });
    return Object.entries(groups)
      .map(([cat, val]) => ({ cat, val }))
      .sort((a, b) => b.val - a.val);
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

  const ingresosPorPago = (mes) => {
    const groups = {};
    resDeMes(mes).forEach(r => {
      const p = normForma(r.forma_pago);
      groups[p] = (groups[p] || 0) + (r.total || 0);
    });
    return Object.entries(groups)
      .map(([cat, val]) => ({ cat, val }))
      .sort((a, b) => b.val - a.val);
  };

  // ── Derived numbers ────────────────────────────────────────────────────────
  const resA = resDeMes(mesActual);
  const resC = resDeMes(mesComparar);
  const tiposA = ingresosPorTipo(mesActual);
  const tiposC = ingresosPorTipo(mesComparar);
  const canalesA = ingresosPorCanal(mesActual);
  const pagosA   = ingresosPorPago(mesActual);

  const totalA     = tiposA.reduce((s, r) => s + r.val, 0);
  const totalC     = tiposC.reduce((s, r) => s + r.val, 0);
  const reservasA  = resA.length;
  const reservasC  = resC.length;
  const paxA       = resA.reduce((s, r) => s + (r.pax || 0), 0);
  const ticketA    = reservasA > 0 ? totalA / reservasA : 0;
  const ticketC    = reservasC > 0 ? totalC / reservasC : 0;

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

  // ── P&L helpers ───────────────────────────────────────────────────────────
  const cierresDeMes = (mes) => cierres.filter(c => c.fecha?.startsWith(mes));
  const reqsDeMes    = (mes) => reqsList.filter(r => r.fecha?.startsWith(mes));

  const totalCierres = (mes) =>
    cierresDeMes(mes).reduce((s, c) => s + (c.total_ventas || c.total_general || 0), 0);

  const totalGastos  = (mes) =>
    reqsDeMes(mes).reduce((s, r) => s + (r.total || 0), 0);

  const gastosPorCategoria = (mes) => {
    const groups = {};
    reqsDeMes(mes).forEach(r => {
      const cat = r.categoria || "Otros";
      groups[cat] = (groups[cat] || 0) + (r.total || 0);
    });
    return Object.entries(groups).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Financiero</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Ingresos y costos operativos · Colombia
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select value={mesActual} onChange={e => setMesActual(e.target.value)} style={SEL}>
            {meses.map(m => <option key={m} value={m}>{fmtMes(m)}</option>)}
          </select>
          {tab === "ingresos" && <>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>vs</span>
            <select value={mesComparar} onChange={e => setMesComparar(e.target.value)} style={SEL}>
              <option value="">Sin comparar</option>
              {meses.filter(m => m !== mesActual).map(m => <option key={m} value={m}>{fmtMes(m)}</option>)}
            </select>
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
        const ing   = totalCierres(mesActual);
        const gas   = totalGastos(mesActual);
        const util  = ing - gas;
        const margen = ing > 0 ? (util / ing) * 100 : 0;
        const cats  = gastosPorCategoria(mesActual);
        const ingC  = totalCierres(mesComparar || "");
        const gasC  = totalGastos(mesComparar || "");
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
              {delta != null && mesComparar && (
                <div style={{ fontSize: 10, color: delta >= 0 ? B.success : B.danger }}>
                  {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}% vs {fmtMes(mesComparar)}
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
                  {k.delta && mesComparar && (
                    <div style={{ fontSize: 11, marginTop: 4, color: k.delta.val >= 0 ? B.success : B.danger }}>{k.delta.label}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Estado de Resultados */}
            <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}` }}>
                <h3 style={{ fontSize: 15, margin: 0, color: B.sand }}>Estado de Resultados — {fmtMes(mesActual)}</h3>
              </div>

              {/* Ingresos */}
              <Row label="INGRESOS" val={ing} bold color={B.success} delta={ingC ? (ing - ingC) / (ingC || 1) : null} />
              {cierresDeMes(mesActual).length === 0
                ? <div style={{ padding: "8px 20px 8px 36px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin cierres de caja registrados</div>
                : <Row label={`Cierres de Caja (${cierresDeMes(mesActual).length})`} val={ing} sub />
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
                    const isSel = mes === mesActual;
                    return (
                      <div key={mes} onClick={() => setMesActual(mes)}
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
            val: COP(totalA),
            delta: deltaIng,
            color: B.success,
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
            {k.delta && mesComparar && (
              <div style={{ fontSize: 11, marginTop: 4, color: k.delta.val >= 0 ? B.success : B.danger }}>
                {k.delta.label} vs {fmtMes(mesComparar)}
              </div>
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
              Sin ventas en {fmtMes(mesActual)}
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
                    {d && mesComparar && (
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
              Sin ventas en {fmtMes(mesActual)}
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
              Sin ventas en {fmtMes(mesActual)}
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

      {/* ── Evolución mensual (últimos 6 meses) ── */}
      {meses.length > 1 && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, marginTop: 16 }}>
          <h3 style={{ fontSize: 15, color: B.sand, margin: "0 0 16px" }}>Evolución Mensual</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100 }}>
            {meses.slice(0, 6).reverse().map(mes => {
              const total = resDeMes(mes).reduce((s, r) => s + (r.total || 0), 0);
              const maxT  = Math.max(...meses.slice(0, 6).map(m => resDeMes(m).reduce((s, r) => s + (r.total || 0), 0)), 1);
              const h = Math.max((total / maxT) * 80, total > 0 ? 4 : 0);
              const isSelected = mes === mesActual;
              return (
                <div key={mes} onClick={() => setMesActual(mes)}
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
