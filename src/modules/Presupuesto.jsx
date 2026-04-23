import React, { useState, useEffect, useMemo } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";
import PresupuestoSimulador from "./PresupuestoSimulador";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CURRENT_MONTH = new Date().getMonth(); // 0-based

// Formatear con máximo 2 decimales (pero sin decimales si es entero)
const fmt = (v) => {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (isNaN(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

function EditableCell({ value, onChange, color, align = "right" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = () => {
    setEditing(false);
    let n = draft === "" || draft === null ? null : Number(draft);
    if (n !== null && !isNaN(n)) n = Math.round(n * 100) / 100; // 2 decimales máx
    if (n !== value) onChange(n);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step="0.01"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
        style={{
          width: 60, padding: "4px 4px", background: B.navy, border: `1px solid ${B.sky}`,
          borderRadius: 4, color: B.white, fontSize: 12, textAlign: align, outline: "none",
        }}
      />
    );
  }
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <span onClick={() => setEditing(true)}
      style={{ cursor: "pointer", color: hasValue ? color : "rgba(255,255,255,0.15)", padding: "2px 4px", borderRadius: 3, display: "inline-block", minWidth: 32, fontWeight: hasValue && value !== 0 ? 600 : 400 }}
      title="Click para editar">
      {hasValue ? `${fmt(value)}M` : "·"}
    </span>
  );
}

function SumCell({ values, color }) {
  const hasAny = values.some(v => v !== null && v !== undefined);
  if (!hasAny) return <span style={{ color: "rgba(255,255,255,0.15)" }}></span>;
  const sum = values.reduce((s, v) => s + (Number(v) || 0), 0);
  return <span style={{ color, fontWeight: 700 }}>{fmt(sum)}M</span>;
}

const VM_MES = {
  label: "Mes",
  buckets: [[0],[1],[2],[3],[4],[5],[6],[7],[8],[9],[10],[11]],
  labels:  ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],
};

export default function Presupuesto() {
  const [year, setYear] = useState(2026);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const [newCat, setNewCat] = useState({ categoria: "", tipo: "ingreso" });
  const vm = VM_MES;
  const view = "mes";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("presupuesto_anual").select("*").eq("year", year).order("orden").order("categoria");
    setCats(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year]);

  const updateCell = async (id, field, monthIdx, newVal) => {
    const row = cats.find(c => c.id === id);
    if (!row) return;
    const arr = [...(row[field] || [])];
    while (arr.length < 12) arr.push(field === "actual" ? null : 0);
    arr[monthIdx] = newVal;
    setCats(cs => cs.map(c => c.id === id ? { ...c, [field]: arr } : c));
    await supabase.from("presupuesto_anual").update({ [field]: arr, updated_at: new Date().toISOString() }).eq("id", id);
  };

  const agregarCategoria = async () => {
    if (!newCat.categoria.trim()) return;
    const orden = Math.max(0, ...cats.filter(c => c.tipo === newCat.tipo).map(c => c.orden || 0)) + 10;
    const { data, error } = await supabase.from("presupuesto_anual").insert({
      year, categoria: newCat.categoria.trim(), tipo: newCat.tipo,
      es_ingreso: newCat.tipo === "ingreso", orden,
    }).select().single();
    if (error) return alert(error.message);
    setCats(cs => [...cs, data]);
    setNewCat({ categoria: "", tipo: "ingreso" });
    setShowNew(false);
  };

  const eliminarCategoria = async (id, nombre) => {
    if (!confirm(`¿Eliminar categoría "${nombre}" del presupuesto ${year}?`)) return;
    await supabase.from("presupuesto_anual").delete().eq("id", id);
    setCats(cs => cs.filter(c => c.id !== id));
  };

  // Aplicar fórmulas: si una categoría tiene formula_pct + formula_source,
  // su budget se calcula a partir del budget de la categoría fuente.
  const catsConFormulas = useMemo(() => {
    return cats.map(c => {
      if (c.formula_pct && c.formula_source) {
        const src = cats.find(x => x.categoria === c.formula_source);
        if (src) {
          const pct = Number(c.formula_pct) / 100;
          const newBudget = (src.budget || []).map(v => Math.round((Number(v) || 0) * pct * 100) / 100);
          return { ...c, budget: newBudget, _isFormula: true };
        }
      }
      return c;
    });
  }, [cats]);

  const ingresos = useMemo(() => catsConFormulas.filter(c => c.tipo === "ingreso"), [catsConFormulas]);
  const costos   = useMemo(() => catsConFormulas.filter(c => c.tipo === "costo"), [catsConFormulas]);
  const gastos   = useMemo(() => catsConFormulas.filter(c => c.tipo === "gasto"), [catsConFormulas]);

  const sumAllMonths = (rows, field, monthIdx) => rows.reduce((s, r) => s + (Number(r[field]?.[monthIdx]) || 0), 0);
  const hasAnyActual = (rows, monthIdx) => rows.some(r => r.actual?.[monthIdx] !== null && r.actual?.[monthIdx] !== undefined);

  if (loading) return <div style={{ padding: 40, color: B.sand, textAlign: "center" }}>Cargando presupuesto…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Presupuesto</h2>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ padding: "6px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, outline: "none" }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ padding: "4px 10px", borderRadius: 12, background: B.sky + "33", color: B.sky }}>Presupuesto</span>
          <span style={{ padding: "4px 10px", borderRadius: 12, background: B.sand + "33", color: B.sand }}>Real</span>
          <span style={{ padding: "4px 10px", borderRadius: 12, background: B.success + "33", color: B.success }}>Favorable</span>
          <span style={{ padding: "4px 10px", borderRadius: 12, background: B.danger + "33", color: B.danger }}>Desfavorable</span>
          <button onClick={() => setShowSim(true)}
            style={{ marginLeft: 8, padding: "6px 14px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            🎯 Planificar mes
          </button>
          <button onClick={() => setShowNew(true)}
            style={{ padding: "6px 14px", background: B.sky, color: B.navy, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            + Categoría
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
        💡 Click en cualquier celda para editar · valores en millones (M) · Enter para guardar, Esc para cancelar
      </div>

      <div style={{ background: B.navyMid, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${B.navyLight}` }}>
              <th style={{ padding: "14px 16px", textAlign: "left", fontSize: 12, color: B.sand, textTransform: "uppercase", position: "sticky", left: 0, background: B.navyMid, zIndex: 1, minWidth: 160 }}>Categoría</th>
              {vm.labels.map((lbl, i) => {
                const isCurrent = vm.buckets[i].includes(CURRENT_MONTH);
                return (
                  <th key={lbl} colSpan={2} style={{ padding: "14px 8px", textAlign: "center", fontSize: 12, color: isCurrent ? B.sand : "rgba(200,185,154,0.7)", textTransform: "uppercase", borderLeft: `1px solid ${B.navyLight}`, background: isCurrent ? B.navyLight + "80" : "transparent" }}>{lbl}</th>
                );
              })}
              {view !== "ano" && (
                <th colSpan={2} style={{ padding: "14px 8px", textAlign: "center", fontSize: 12, color: B.sand, textTransform: "uppercase", borderLeft: `2px solid ${B.sand}`, fontWeight: 700 }}>Total Año</th>
              )}
            </tr>
            <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
              <th style={{ position: "sticky", left: 0, background: B.navyMid, zIndex: 1 }} />
              {vm.labels.map(lbl => (
                <React.Fragment key={lbl + "_sub"}>
                  <th style={{ padding: "6px 6px", fontSize: 10, color: B.sky, textAlign: "right", borderLeft: `1px solid ${B.navyLight}` }}>Pres</th>
                  <th style={{ padding: "6px 6px", fontSize: 10, color: B.sand, textAlign: "right" }}>Real</th>
                </React.Fragment>
              ))}
              {view !== "ano" && <>
                <th style={{ padding: "6px 6px", fontSize: 10, color: B.sky, textAlign: "right", borderLeft: `2px solid ${B.sand}` }}>Pres</th>
                <th style={{ padding: "6px 6px", fontSize: 10, color: B.sand, textAlign: "right" }}>Real</th>
              </>}
            </tr>
          </thead>
          <tbody>
            {/* INGRESOS */}
            {ingresos.length > 0 && (
              <tr><td colSpan={1 + vm.buckets.length * 2 + (view === "ano" ? 0 : 2)} style={{ padding: "8px 16px", fontSize: 11, color: B.success, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, background: B.navy, position: "sticky", left: 0 }}>● Ingresos</td></tr>
            )}
            {ingresos.map(row => (
              <CategoriaRow key={row.id} row={row} isIncome={true} onEdit={updateCell} onDelete={eliminarCategoria} currentMonth={CURRENT_MONTH} vm={vm} view={view} />
            ))}
            {ingresos.length > 0 && (
              <TotalRow label="TOTAL INGRESOS" rows={ingresos} color={B.success} vm={vm} view={view} />
            )}

            {/* COSTOS */}
            {costos.length > 0 && (
              <tr><td colSpan={1 + vm.buckets.length * 2 + (view === "ano" ? 0 : 2)} style={{ padding: "8px 16px", fontSize: 11, color: B.pink, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, background: B.navy, position: "sticky", left: 0 }}>● Costos directos</td></tr>
            )}
            {costos.map(row => (
              <CategoriaRow key={row.id} row={row} isIncome={false} onEdit={updateCell} onDelete={eliminarCategoria} currentMonth={CURRENT_MONTH} vm={vm} view={view} />
            ))}
            {costos.length > 0 && (
              <TotalRow label="TOTAL COSTOS" rows={costos} color={B.pink} vm={vm} view={view} />
            )}

            {/* UTILIDAD BRUTA */}
            {ingresos.length > 0 && costos.length > 0 && (
              <UtilidadRow label="UTILIDAD BRUTA" positivos={ingresos} negativos={costos} color={B.sky} vm={vm} view={view} />
            )}

            {/* GASTOS */}
            {gastos.length > 0 && (
              <tr><td colSpan={1 + vm.buckets.length * 2 + (view === "ano" ? 0 : 2)} style={{ padding: "8px 16px", fontSize: 11, color: B.warning, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, background: B.navy, position: "sticky", left: 0 }}>● Gastos operativos y administrativos</td></tr>
            )}
            {gastos.map(row => (
              <CategoriaRow key={row.id} row={row} isIncome={false} onEdit={updateCell} onDelete={eliminarCategoria} currentMonth={CURRENT_MONTH} vm={vm} view={view} />
            ))}
            {gastos.length > 0 && (
              <TotalRow label="TOTAL GASTOS" rows={gastos} color={B.warning} vm={vm} view={view} />
            )}

            {/* UTILIDAD NETA */}
            {ingresos.length > 0 && (gastos.length > 0 || costos.length > 0) && (
              <UtilidadRow label="UTILIDAD NETA" positivos={ingresos} negativos={[...costos, ...gastos]} color={B.sand} bold vm={vm} view={view} />
            )}
          </tbody>
        </table>
      </div>

      {/* Modal nueva categoría */}
      {showSim && <PresupuestoSimulador onClose={() => { setShowSim(false); load(); }} />}

      {showNew && (
        <div onClick={e => e.target === e.currentTarget && setShowNew(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 400 }}>
            <h3 style={{ fontSize: 18, marginTop: 0, marginBottom: 16 }}>Nueva categoría</h3>
            <label style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Nombre</label>
            <input autoFocus value={newCat.categoria}
              onChange={e => setNewCat(n => ({ ...n, categoria: e.target.value }))}
              placeholder="Ej: Servicios públicos"
              style={{ width: "100%", padding: "10px 12px", marginTop: 6, marginBottom: 14, borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              onKeyDown={e => e.key === "Enter" && agregarCategoria()} />
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { val: "ingreso", label: "Ingreso", color: B.success },
                { val: "costo",   label: "Costo",   color: B.pink },
                { val: "gasto",   label: "Gasto",   color: B.warning },
              ].map(o => (
                <button key={o.val} onClick={() => setNewCat(n => ({ ...n, tipo: o.val }))}
                  style={{ flex: 1, padding: "10px", borderRadius: 8, border: `2px solid ${newCat.tipo === o.val ? o.color : "transparent"}`, background: newCat.tipo === o.val ? o.color + "22" : B.navyLight, color: newCat.tipo === o.val ? o.color : B.white, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {o.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={agregarCategoria} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriaRow({ row, isIncome, onEdit, onDelete, currentMonth, vm, view }) {
  const budget = row.budget || [];
  const actual = row.actual || [];
  const totalBudget = budget.reduce((s, v) => s + (Number(v) || 0), 0);
  const actualHasData = actual.some(v => v !== null && v !== undefined);
  const totalActual = actual.reduce((s, v) => s + (Number(v) || 0), 0);
  const isFormula = row._isFormula;
  const showYearTotal = view !== "ano";

  return (
    <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
      <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, position: "sticky", left: 0, background: B.navyMid, zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {row.categoria}
          {isFormula && (
            <span title={`Calculado: ${row.formula_pct}% de ${row.formula_source}`}
              style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, background: B.warning + "33", color: B.warning, fontWeight: 700, letterSpacing: 0.5 }}>
              ƒ {row.formula_pct}%
            </span>
          )}
        </span>
        <button onClick={() => onDelete(row.id, row.categoria)}
          title="Eliminar categoría"
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 14, padding: 2 }}
          onMouseEnter={e => e.currentTarget.style.color = B.danger}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.2)"}>✕</button>
      </td>
      {vm.buckets.map((bucket, bi) => {
        const label = vm.labels[bi];
        const isSingleMonth = bucket.length === 1;
        const mi = bucket[0]; // para vista mes
        const bvSum = bucket.reduce((s, m) => s + (Number(budget[m]) || 0), 0);
        const anyActual = bucket.some(m => actual[m] !== null && actual[m] !== undefined);
        const avSum = bucket.reduce((s, m) => s + (Number(actual[m]) || 0), 0);
        const favorable = anyActual && (isIncome ? avSum >= bvSum : avSum <= bvSum);
        const realColor = !anyActual ? "rgba(255,255,255,0.15)" : avSum === 0 ? "rgba(255,255,255,0.2)" : favorable ? B.success : B.danger;
        const isCurrent = bucket.includes(currentMonth);
        return (
          <React.Fragment key={label}>
            <td style={{ padding: "6px 4px", textAlign: "right", borderLeft: `1px solid ${B.navyLight}`, background: isCurrent ? B.navyLight + "30" : "transparent" }}>
              {isFormula ? (
                <span style={{ color: B.sky, opacity: 0.7, fontStyle: "italic" }} title="Calculado automáticamente">
                  {bvSum ? `${fmt(bvSum)}M` : "·"}
                </span>
              ) : isSingleMonth ? (
                <EditableCell value={budget[mi]} onChange={v => onEdit(row.id, "budget", mi, v ?? 0)} color={B.sky} />
              ) : (
                <span style={{ color: B.sky, fontWeight: 600 }}>{fmt(bvSum)}M</span>
              )}
            </td>
            <td style={{ padding: "6px 4px", textAlign: "right", background: isCurrent ? B.navyLight + "30" : "transparent" }}>
              {isSingleMonth ? (
                <EditableCell value={actual[mi]} onChange={v => onEdit(row.id, "actual", mi, v)} color={realColor} />
              ) : (
                <span style={{ color: realColor, fontWeight: 600 }}>{anyActual ? `${fmt(avSum)}M` : ""}</span>
              )}
            </td>
          </React.Fragment>
        );
      })}
      {showYearTotal && <>
        <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color: B.sky, fontWeight: 700, borderLeft: `2px solid ${B.sand}` }}>{fmt(totalBudget)}M</td>
        <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color: actualHasData ? B.sand : "rgba(255,255,255,0.15)", fontWeight: 700 }}>{actualHasData ? `${fmt(totalActual)}M` : ""}</td>
      </>}
    </tr>
  );
}

function TotalRow({ label, rows, color, vm, view }) {
  const showYearTotal = view !== "ano";
  return (
    <tr style={{ borderTop: `2px solid ${B.navyLight}`, background: B.navy + "80" }}>
      <td style={{ padding: "10px 16px", fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 1, position: "sticky", left: 0, background: B.navyMid, zIndex: 1 }}>{label}</td>
      {vm.buckets.map((bucket, bi) => {
        const sumB = rows.reduce((s, r) => s + bucket.reduce((x, m) => x + (Number(r.budget?.[m]) || 0), 0), 0);
        const hasA = rows.some(r => bucket.some(m => r.actual?.[m] !== null && r.actual?.[m] !== undefined));
        const sumA = rows.reduce((s, r) => s + bucket.reduce((x, m) => x + (Number(r.actual?.[m]) || 0), 0), 0);
        return (
          <React.Fragment key={vm.labels[bi]}>
            <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color: B.sky, fontWeight: 700, borderLeft: `1px solid ${B.navyLight}` }}>{fmt(sumB)}M</td>
            <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color: hasA ? color : "rgba(255,255,255,0.15)", fontWeight: 700 }}>{hasA ? `${fmt(sumA)}M` : ""}</td>
          </React.Fragment>
        );
      })}
      {showYearTotal && <>
        <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color: B.sky, fontWeight: 700, borderLeft: `2px solid ${B.sand}` }}>
          {fmt(rows.reduce((s, r) => s + (r.budget || []).reduce((a, v) => a + (Number(v) || 0), 0), 0))}M
        </td>
        <td style={{ padding: "10px 6px", fontSize: 12, textAlign: "right", color, fontWeight: 700 }}>
          {(() => {
            const anyActual = rows.some(r => (r.actual || []).some(v => v !== null && v !== undefined));
            if (!anyActual) return "";
            return fmt(rows.reduce((s, r) => s + (r.actual || []).reduce((a, v) => a + (Number(v) || 0), 0), 0)) + "M";
          })()}
        </td>
      </>}
    </tr>
  );
}

function UtilidadRow({ label, positivos, negativos, color, bold = false, vm, view }) {
  const borderTop = bold ? `3px solid ${color}` : `2px solid ${color}66`;
  const showYearTotal = view !== "ano";
  return (
    <tr style={{ borderTop, background: bold ? B.navyLight + "60" : B.navyLight + "30" }}>
      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 1, position: "sticky", left: 0, background: B.navyMid, zIndex: 1 }}>{label}</td>
      {vm.buckets.map((bucket, bi) => {
        const sumB = positivos.reduce((s, r) => s + bucket.reduce((x, m) => x + (Number(r.budget?.[m]) || 0), 0), 0) -
                     negativos.reduce((s, r) => s + bucket.reduce((x, m) => x + (Number(r.budget?.[m]) || 0), 0), 0);
        const hasA = bucket.some(m => positivos.some(r => r.actual?.[m] != null) || negativos.some(r => r.actual?.[m] != null));
        const sumA = positivos.reduce((s, r) => s + bucket.reduce((x, m) => x + (Number(r.actual?.[m]) || 0), 0), 0) -
                     negativos.reduce((s, r) => s + bucket.reduce((x, m) => x + (Number(r.actual?.[m]) || 0), 0), 0);
        return (
          <React.Fragment key={vm.labels[bi]}>
            <td style={{ padding: "12px 6px", fontSize: 12, textAlign: "right", fontWeight: 800, color: sumB >= 0 ? B.sky : B.danger, borderLeft: `1px solid ${B.navyLight}` }}>{fmt(sumB)}M</td>
            <td style={{ padding: "12px 6px", fontSize: 12, textAlign: "right", fontWeight: 800, color: !hasA ? "rgba(255,255,255,0.15)" : sumA >= 0 ? B.success : B.danger }}>{hasA ? `${fmt(sumA)}M` : ""}</td>
          </React.Fragment>
        );
      })}
      {showYearTotal && (() => {
        const budYear = positivos.reduce((s, r) => s + (r.budget || []).reduce((a, v) => a + (Number(v) || 0), 0), 0) - negativos.reduce((s, r) => s + (r.budget || []).reduce((a, v) => a + (Number(v) || 0), 0), 0);
        const anyA = [...positivos, ...negativos].some(r => (r.actual || []).some(v => v !== null && v !== undefined));
        const realYear = positivos.reduce((s, r) => s + (r.actual || []).reduce((a, v) => a + (Number(v) || 0), 0), 0) - negativos.reduce((s, r) => s + (r.actual || []).reduce((a, v) => a + (Number(v) || 0), 0), 0);
        return (
          <>
            <td style={{ padding: "12px 6px", fontSize: 13, textAlign: "right", fontWeight: 800, color: budYear >= 0 ? B.sky : B.danger, borderLeft: `2px solid ${B.sand}` }}>{fmt(budYear)}M</td>
            <td style={{ padding: "12px 6px", fontSize: 13, textAlign: "right", fontWeight: 800, color: !anyA ? "rgba(255,255,255,0.15)" : realYear >= 0 ? B.success : B.danger }}>{anyA ? `${fmt(realYear)}M` : ""}</td>
          </>
        );
      })()}
    </tr>
  );
}
