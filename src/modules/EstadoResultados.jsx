// Estado de Resultados (P&L) — Estilo ejecutivo tipo Marriott CFO
// Lee de `presupuesto_anual` (budget + actual por mes).
// Muestra: Revenue → Direct Costs → Gross Profit → Operating Expenses → EBITDA
// Con columnas: Actual | Budget | Var $ | Var % | % Revenue | YTD Actual | YTD Budget | YTD Var %

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const MESES       = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MESES_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const COP_COMPACT = (v, decimals = 2) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const n = Number(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(decimals)}B`;
  return `${sign}$${abs.toFixed(decimals)}M`;
};
const PCT = (v, decimals = 1) => (v === null || v === undefined || isNaN(v)) ? "—" : `${Number(v).toFixed(decimals)}%`;
const safeDiv = (a, b) => (b && !isNaN(a / b) ? (a / b) * 100 : null);

export default function EstadoResultados() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(new Date().getMonth()); // 0-based
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("presupuesto_anual").select("*").eq("year", year).order("orden");
      setCats(data || []);
      setLoading(false);
    })();
  }, [year]);

  // Aplicar fórmulas (igual que en Presupuesto.jsx)
  const catsFormula = useMemo(() => cats.map(c => {
    if (c.formula_pct && c.formula_source) {
      const src = cats.find(x => x.categoria === c.formula_source);
      if (src) {
        const pct = Number(c.formula_pct) / 100;
        const newBudget = (src.budget || []).map(v => Math.round((Number(v) || 0) * pct * 100) / 100);
        return { ...c, budget: newBudget, _isFormula: true };
      }
    }
    return c;
  }), [cats]);

  // Helpers
  const mAt = (row, field, m) => {
    const v = row[field]?.[m];
    return v === null || v === undefined ? null : Number(v);
  };
  const sumMonth = (rows, field, m) => rows.reduce((s, r) => s + (mAt(r, field, m) || 0), 0);
  const sumYTD   = (rows, field) => rows.reduce((s, r) => {
    for (let i = 0; i <= month; i++) s += (mAt(r, field, i) || 0);
    return s;
  }, 0);
  const anyActualMonth = (rows, m) => rows.some(r => mAt(r, "actual", m) !== null);
  const anyActualYTD   = (rows) => {
    for (let i = 0; i <= month; i++) if (rows.some(r => mAt(r, "actual", i) !== null)) return true;
    return false;
  };

  const ingresos = catsFormula.filter(c => c.tipo === "ingreso");
  const costos   = catsFormula.filter(c => c.tipo === "costo");
  const gastos   = catsFormula.filter(c => c.tipo === "gasto");

  // Totales mes
  const revenueMes       = sumMonth(ingresos, "actual", month);
  const revenueMesBudget = sumMonth(ingresos, "budget", month);
  const costosMes        = sumMonth(costos, "actual", month);
  const costosMesBudget  = sumMonth(costos, "budget", month);
  const gastosMes        = sumMonth(gastos, "actual", month);
  const gastosMesBudget  = sumMonth(gastos, "budget", month);

  const revenueMesHas = anyActualMonth(ingresos, month);
  const costosMesHas  = anyActualMonth(costos, month);
  const gastosMesHas  = anyActualMonth(gastos, month);

  const grossMes        = revenueMes - costosMes;
  const grossMesBudget  = revenueMesBudget - costosMesBudget;
  const ebitdaMes       = revenueMes - costosMes - gastosMes;
  const ebitdaMesBudget = revenueMesBudget - costosMesBudget - gastosMesBudget;

  // Totales YTD (Ene → mes seleccionado)
  const revenueYTD       = sumYTD(ingresos, "actual");
  const revenueYTDBudget = sumYTD(ingresos, "budget");
  const costosYTD        = sumYTD(costos, "actual");
  const costosYTDBudget  = sumYTD(costos, "budget");
  const gastosYTD        = sumYTD(gastos, "actual");
  const gastosYTDBudget  = sumYTD(gastos, "budget");

  const revenueYTDHas = anyActualYTD(ingresos);
  const costosYTDHas  = anyActualYTD(costos);
  const gastosYTDHas  = anyActualYTD(gastos);

  const grossYTD        = revenueYTD - costosYTD;
  const grossYTDBudget  = revenueYTDBudget - costosYTDBudget;
  const ebitdaYTD       = revenueYTD - costosYTD - gastosYTD;
  const ebitdaYTDBudget = revenueYTDBudget - costosYTDBudget - gastosYTDBudget;

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: B.sand }}>Cargando estado de resultados…</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: B.sand, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>Atolón Beach Club</div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, color: B.white, margin: 0, letterSpacing: "0.02em" }}>
            ESTADO DE RESULTADOS
          </h2>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
            Período: {MESES[month]} {year} · YTD Ene–{MESES_SHORT[month]}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            style={{ padding: "8px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none" }}>
            {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ padding: "8px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none" }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Hero KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 24 }}>
        <HeroKpi label="Total Revenue" value={revenueMes} budget={revenueMesBudget} hasActual={revenueMesHas} isIncome color={B.success} ytd={revenueYTD} ytdBudget={revenueYTDBudget} ytdHas={revenueYTDHas} />
        <HeroKpi label="Gross Profit"  value={grossMes} budget={grossMesBudget} hasActual={revenueMesHas || costosMesHas} isIncome color={B.sky}
          secondary={`Margin ${PCT(safeDiv(grossMes, revenueMes))}`} ytd={grossYTD} ytdBudget={grossYTDBudget} ytdHas={revenueYTDHas || costosYTDHas}
          secondaryYtd={`Margin ${PCT(safeDiv(grossYTD, revenueYTD))}`} />
        <HeroKpi label="EBITDA"        value={ebitdaMes} budget={ebitdaMesBudget} hasActual={revenueMesHas || costosMesHas || gastosMesHas} isIncome color={B.sand}
          secondary={`Margin ${PCT(safeDiv(ebitdaMes, revenueMes))}`} ytd={ebitdaYTD} ytdBudget={ebitdaYTDBudget} ytdHas={revenueYTDHas || costosYTDHas || gastosYTDHas}
          secondaryYtd={`Margin ${PCT(safeDiv(ebitdaYTD, revenueYTD))}`} />
      </div>

      {/* P&L Table */}
      <div style={{ background: B.navyMid, borderRadius: 12, overflow: "auto", border: `1px solid ${B.navyLight}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${B.sand}` }}>
              <th rowSpan={2} style={hCellLeft}>Concepto</th>
              <th colSpan={5} style={hCellCenterBorder}>{MESES[month]} {year}</th>
              <th colSpan={4} style={hCellCenterBorder}>YTD</th>
            </tr>
            <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
              <th style={hCellR}>Actual</th>
              <th style={hCellR}>Budget</th>
              <th style={hCellR}>Var $</th>
              <th style={hCellR}>Var %</th>
              <th style={hCellR}>% Rev</th>
              <th style={{...hCellR, borderLeft: `2px solid ${B.sand}`}}>Actual</th>
              <th style={hCellR}>Budget</th>
              <th style={hCellR}>Var $</th>
              <th style={hCellR}>% Rev</th>
            </tr>
          </thead>
          <tbody>
            {/* REVENUE */}
            <SectionHeader label="INGRESOS" color={B.success} />
            {ingresos.map(r => (
              <LineRow key={r.id} row={r} month={month} revenueMes={revenueMes} revenueYTD={revenueYTD} mAt={mAt} ytdUpTo={month} isIncome />
            ))}
            <SubtotalRow label="TOTAL INGRESOS" mes={revenueMes} mesBudget={revenueMesBudget} mesHas={revenueMesHas}
              ytd={revenueYTD} ytdBudget={revenueYTDBudget} ytdHas={revenueYTDHas}
              revenueMes={revenueMes} revenueYTD={revenueYTD} isIncome color={B.success} />

            {/* COST OF SALES */}
            {costos.length > 0 && <>
              <SectionHeader label="COSTO DE VENTAS" color={B.pink} />
              {costos.map(r => (
                <LineRow key={r.id} row={r} month={month} revenueMes={revenueMes} revenueYTD={revenueYTD} mAt={mAt} ytdUpTo={month} />
              ))}
              <SubtotalRow label="TOTAL COSTO DE VENTAS" mes={costosMes} mesBudget={costosMesBudget} mesHas={costosMesHas}
                ytd={costosYTD} ytdBudget={costosYTDBudget} ytdHas={costosYTDHas}
                revenueMes={revenueMes} revenueYTD={revenueYTD} color={B.pink} />

              <HighlightRow label="UTILIDAD BRUTA (Gross Profit)"
                mes={grossMes} mesBudget={grossMesBudget} mesHas={revenueMesHas || costosMesHas}
                ytd={grossYTD} ytdBudget={grossYTDBudget} ytdHas={revenueYTDHas || costosYTDHas}
                revenueMes={revenueMes} revenueYTD={revenueYTD} isIncome color={B.sky} />
            </>}

            {/* OPERATING EXPENSES */}
            {gastos.length > 0 && <>
              <SectionHeader label="GASTOS OPERATIVOS Y ADMINISTRATIVOS" color={B.warning} />
              {gastos.map(r => (
                <LineRow key={r.id} row={r} month={month} revenueMes={revenueMes} revenueYTD={revenueYTD} mAt={mAt} ytdUpTo={month} />
              ))}
              <SubtotalRow label="TOTAL GASTOS" mes={gastosMes} mesBudget={gastosMesBudget} mesHas={gastosMesHas}
                ytd={gastosYTD} ytdBudget={gastosYTDBudget} ytdHas={gastosYTDHas}
                revenueMes={revenueMes} revenueYTD={revenueYTD} color={B.warning} />
            </>}

            {/* EBITDA */}
            <HighlightRow label="EBITDA"
              mes={ebitdaMes} mesBudget={ebitdaMesBudget} mesHas={revenueMesHas || costosMesHas || gastosMesHas}
              ytd={ebitdaYTD} ytdBudget={ebitdaYTDBudget} ytdHas={revenueYTDHas || costosYTDHas || gastosYTDHas}
              revenueMes={revenueMes} revenueYTD={revenueYTD} isIncome color={B.sand} bold />
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 12, textAlign: "right" }}>
        Valores en millones COP · B = miles de millones · Datos: módulo Presupuesto · Generado {new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
      </div>
    </div>
  );
}

// ─── Components ─────────────────────────────────────────────────────────

function HeroKpi({ label, value, budget, hasActual, color, isIncome, secondary, ytd, ytdBudget, ytdHas, secondaryYtd }) {
  const variance = hasActual ? value - budget : null;
  const variancePct = hasActual ? safeDiv(value - budget, budget) : null;
  const favorable = variance !== null && (isIncome ? variance >= 0 : variance <= 0);
  const vColor = variance === null ? "rgba(255,255,255,0.3)" : favorable ? B.success : B.danger;
  return (
    <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 22px", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: hasActual ? B.white : "rgba(255,255,255,0.3)" }}>
        {hasActual ? COP_COMPACT(value) : "—"}
      </div>
      {secondary && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{secondary}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
        <span>Budget: {COP_COMPACT(budget)}</span>
        {variance !== null && (
          <span style={{ color: vColor, fontWeight: 700 }}>
            {variance >= 0 ? "▲" : "▼"} {COP_COMPACT(Math.abs(variance))} ({PCT(Math.abs(variancePct))})
          </span>
        )}
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
        <div>YTD Actual: <span style={{ color: ytdHas ? B.white : "rgba(255,255,255,0.3)", fontWeight: 600 }}>{ytdHas ? COP_COMPACT(ytd) : "—"}</span></div>
        <div>YTD Budget: {COP_COMPACT(ytdBudget)}</div>
        {secondaryYtd && <div style={{ color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{secondaryYtd}</div>}
      </div>
    </div>
  );
}

function SectionHeader({ label, color }) {
  return (
    <tr style={{ background: B.navy }}>
      <td colSpan={10} style={{ padding: "10px 16px", fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 800 }}>● {label}</td>
    </tr>
  );
}

function LineRow({ row, month, revenueMes, revenueYTD, mAt, ytdUpTo, isIncome }) {
  const mesActual = mAt(row, "actual", month);
  const mesBudget = mAt(row, "budget", month) || 0;
  const mesHas = mesActual !== null;
  const mesAct = mesActual || 0;
  const mesVar = mesHas ? mesAct - mesBudget : null;
  const mesVarPct = mesHas ? safeDiv(mesAct - mesBudget, mesBudget) : null;
  const mesFav = mesVar === null ? null : (isIncome ? mesVar >= 0 : mesVar <= 0);
  const mesPctRev = mesHas ? safeDiv(mesAct, revenueMes) : null;

  let ytdActualSum = 0, ytdBudgetSum = 0, ytdHas = false;
  for (let i = 0; i <= ytdUpTo; i++) {
    const a = mAt(row, "actual", i);
    const b = mAt(row, "budget", i) || 0;
    if (a !== null) { ytdActualSum += a; ytdHas = true; }
    ytdBudgetSum += b;
  }
  const ytdVar = ytdHas ? ytdActualSum - ytdBudgetSum : null;
  const ytdFav = ytdVar === null ? null : (isIncome ? ytdVar >= 0 : ytdVar <= 0);
  const ytdPctRev = ytdHas ? safeDiv(ytdActualSum, revenueYTD) : null;

  return (
    <tr style={{ borderBottom: `1px solid ${B.navyLight}40` }}>
      <td style={{ padding: "9px 16px", fontSize: 13, color: "rgba(255,255,255,0.9)" }}>
        {row.categoria}
        {row._isFormula && <span style={{ fontSize: 9, marginLeft: 6, padding: "1px 6px", borderRadius: 8, background: B.warning + "22", color: B.warning, fontWeight: 700 }}>ƒ {row.formula_pct}%</span>}
      </td>
      <td style={numCell(mesHas ? B.white : "rgba(255,255,255,0.2)")}>{mesHas ? COP_COMPACT(mesAct) : "—"}</td>
      <td style={numCell("rgba(255,255,255,0.5)")}>{COP_COMPACT(mesBudget)}</td>
      <td style={numCell(mesVar === null ? "rgba(255,255,255,0.2)" : mesFav ? B.success : B.danger)}>{mesVar === null ? "—" : COP_COMPACT(mesVar)}</td>
      <td style={numCell(mesVar === null ? "rgba(255,255,255,0.2)" : mesFav ? B.success : B.danger)}>{mesVar === null ? "—" : PCT(mesVarPct)}</td>
      <td style={numCell("rgba(255,255,255,0.4)")}>{mesPctRev === null ? "—" : PCT(mesPctRev)}</td>
      <td style={{...numCell(ytdHas ? B.white : "rgba(255,255,255,0.2)"), borderLeft: `2px solid ${B.sand}`}}>{ytdHas ? COP_COMPACT(ytdActualSum) : "—"}</td>
      <td style={numCell("rgba(255,255,255,0.5)")}>{COP_COMPACT(ytdBudgetSum)}</td>
      <td style={numCell(ytdVar === null ? "rgba(255,255,255,0.2)" : ytdFav ? B.success : B.danger)}>{ytdVar === null ? "—" : COP_COMPACT(ytdVar)}</td>
      <td style={numCell("rgba(255,255,255,0.4)")}>{ytdPctRev === null ? "—" : PCT(ytdPctRev)}</td>
    </tr>
  );
}

function SubtotalRow({ label, mes, mesBudget, mesHas, ytd, ytdBudget, ytdHas, revenueMes, revenueYTD, isIncome, color }) {
  const mesVar = mesHas ? mes - mesBudget : null;
  const mesVarPct = mesHas ? safeDiv(mes - mesBudget, mesBudget) : null;
  const mesFav = mesVar === null ? null : (isIncome ? mesVar >= 0 : mesVar <= 0);
  const mesPctRev = mesHas ? safeDiv(mes, revenueMes) : null;
  const ytdVar = ytdHas ? ytd - ytdBudget : null;
  const ytdFav = ytdVar === null ? null : (isIncome ? ytdVar >= 0 : ytdVar <= 0);
  const ytdPctRev = ytdHas ? safeDiv(ytd, revenueYTD) : null;
  return (
    <tr style={{ borderTop: `1px solid ${color}66`, background: B.navy + "60" }}>
      <td style={{ padding: "10px 16px", fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 1 }}>{label}</td>
      <td style={{...numCell(mesHas ? color : "rgba(255,255,255,0.3)"), fontWeight: 700}}>{mesHas ? COP_COMPACT(mes) : "—"}</td>
      <td style={{...numCell("rgba(255,255,255,0.6)"), fontWeight: 700}}>{COP_COMPACT(mesBudget)}</td>
      <td style={{...numCell(mesVar === null ? "rgba(255,255,255,0.3)" : mesFav ? B.success : B.danger), fontWeight: 700}}>{mesVar === null ? "—" : COP_COMPACT(mesVar)}</td>
      <td style={{...numCell(mesVar === null ? "rgba(255,255,255,0.3)" : mesFav ? B.success : B.danger), fontWeight: 700}}>{mesVar === null ? "—" : PCT(mesVarPct)}</td>
      <td style={{...numCell("rgba(255,255,255,0.5)"), fontWeight: 700}}>{mesPctRev === null ? "—" : PCT(mesPctRev)}</td>
      <td style={{...numCell(ytdHas ? color : "rgba(255,255,255,0.3)"), fontWeight: 700, borderLeft: `2px solid ${B.sand}`}}>{ytdHas ? COP_COMPACT(ytd) : "—"}</td>
      <td style={{...numCell("rgba(255,255,255,0.6)"), fontWeight: 700}}>{COP_COMPACT(ytdBudget)}</td>
      <td style={{...numCell(ytdVar === null ? "rgba(255,255,255,0.3)" : ytdFav ? B.success : B.danger), fontWeight: 700}}>{ytdVar === null ? "—" : COP_COMPACT(ytdVar)}</td>
      <td style={{...numCell("rgba(255,255,255,0.5)"), fontWeight: 700}}>{ytdPctRev === null ? "—" : PCT(ytdPctRev)}</td>
    </tr>
  );
}

function HighlightRow({ label, mes, mesBudget, mesHas, ytd, ytdBudget, ytdHas, revenueMes, revenueYTD, isIncome, color, bold }) {
  const mesVar = mesHas ? mes - mesBudget : null;
  const mesVarPct = mesHas ? safeDiv(mes - mesBudget, Math.abs(mesBudget)) : null;
  const mesFav = mesVar === null ? null : (isIncome ? mesVar >= 0 : mesVar <= 0);
  const mesPctRev = mesHas ? safeDiv(mes, revenueMes) : null;
  const ytdVar = ytdHas ? ytd - ytdBudget : null;
  const ytdFav = ytdVar === null ? null : (isIncome ? ytdVar >= 0 : ytdVar <= 0);
  const ytdPctRev = ytdHas ? safeDiv(ytd, revenueYTD) : null;
  const border = bold ? `3px solid ${color}` : `2px solid ${color}88`;
  const bg = bold ? B.navyLight + "80" : B.navyLight + "40";
  return (
    <tr style={{ borderTop: border, borderBottom: border, background: bg }}>
      <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</td>
      <td style={{...numCell(mesHas ? color : "rgba(255,255,255,0.3)"), fontWeight: 800, fontSize: 14}}>{mesHas ? COP_COMPACT(mes) : "—"}</td>
      <td style={{...numCell("rgba(255,255,255,0.6)"), fontWeight: 700}}>{COP_COMPACT(mesBudget)}</td>
      <td style={{...numCell(mesVar === null ? "rgba(255,255,255,0.3)" : mesFav ? B.success : B.danger), fontWeight: 700}}>{mesVar === null ? "—" : COP_COMPACT(mesVar)}</td>
      <td style={{...numCell(mesVar === null ? "rgba(255,255,255,0.3)" : mesFav ? B.success : B.danger), fontWeight: 700}}>{mesVar === null ? "—" : PCT(mesVarPct)}</td>
      <td style={{...numCell("rgba(255,255,255,0.6)"), fontWeight: 700}}>{mesPctRev === null ? "—" : PCT(mesPctRev)}</td>
      <td style={{...numCell(ytdHas ? color : "rgba(255,255,255,0.3)"), fontWeight: 800, fontSize: 14, borderLeft: `2px solid ${B.sand}`}}>{ytdHas ? COP_COMPACT(ytd) : "—"}</td>
      <td style={{...numCell("rgba(255,255,255,0.6)"), fontWeight: 700}}>{COP_COMPACT(ytdBudget)}</td>
      <td style={{...numCell(ytdVar === null ? "rgba(255,255,255,0.3)" : ytdFav ? B.success : B.danger), fontWeight: 700}}>{ytdVar === null ? "—" : COP_COMPACT(ytdVar)}</td>
      <td style={{...numCell("rgba(255,255,255,0.6)"), fontWeight: 700}}>{ytdPctRev === null ? "—" : PCT(ytdPctRev)}</td>
    </tr>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────
const hCellLeft = { padding: "12px 16px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, minWidth: 240 };
const hCellCenterBorder = { padding: "12px 10px", textAlign: "center", fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 800, borderLeft: `2px solid ${B.sand}`, borderBottom: `1px solid ${B.sand}` };
const hCellR = { padding: "8px 10px", textAlign: "right", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 };
const numCell = (color) => ({ padding: "9px 10px", textAlign: "right", fontSize: 13, color, fontVariantNumeric: "tabular-nums" });
