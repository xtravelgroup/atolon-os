// Planificador de Presupuesto — sesión colaborativa con sliders y quick-buttons.
// Al final aplica los valores al budget[mes] del Presupuesto real.

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MESES_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const fmt = (v) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n < 0 ? "-" : ""}$${(abs/1000).toFixed(2)}B`;
  return `${n < 0 ? "-" : ""}$${abs.toFixed(2)}M`;
};
const pct = (v) => isNaN(v) ? "—" : `${Number(v).toFixed(1)}%`;

// Calcular budget final considerando fórmulas
const applyFormulas = (cats) => {
  return cats.map(c => {
    if (c.formula_pct && c.formula_source) {
      const src = cats.find(x => x.categoria === c.formula_source);
      if (src) {
        const factor = Number(c.formula_pct) / 100;
        return { ...c, _calcValue: (src._draftValue ?? 0) * factor, _isFormula: true };
      }
    }
    return { ...c, _calcValue: c._draftValue };
  });
};

export default function PresupuestoSimulador({ onClose }) {
  const [year] = useState(2026);
  const [month, setMonth] = useState(new Date().getMonth() + 1); // 1-12, default mes siguiente al actual
  const [cats, setCats] = useState([]);
  const [baseline, setBaseline] = useState([]); // valores originales para delta
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notas, setNotas] = useState("");
  const [origen, setOrigen] = useState("actual"); // actual | mes_anterior | vacio
  const [history, setHistory] = useState([]); // para undo
  const [empleados, setEmpleados] = useState([]);
  const [empExcluidos, setEmpExcluidos] = useState(new Set()); // ids que "se quitan" en el escenario
  const [empExtras, setEmpExtras] = useState([]); // empleados hipotéticos
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [whatIfs, setWhatIfs] = useState({}); // { id: bool }
  const [metaEbitda, setMetaEbitda] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: catsData }, { data: empData }] = await Promise.all([
        supabase.from("presupuesto_anual").select("*").eq("year", year).order("orden"),
        supabase.from("empleados_loggro").select("id, nombre_completo, cargo, salario_base, estado").eq("estado", "activo").order("salario_base", { ascending: false }),
      ]);
      const rows = (catsData || []).map(c => ({
        ...c,
        _draftValue: Number(c.budget?.[month - 1]) || 0,
      }));
      setCats(rows);
      setBaseline(rows.map(r => ({ id: r.id, v: r._draftValue })));
      setEmpleados(empData || []);
      setHistory([]);
      setLoading(false);
    })();
  }, [year, month]);

  // Guardar estado en historial para undo
  const pushHistory = () => setHistory(h => [...h.slice(-19), cats.map(c => ({ id: c.id, v: c._draftValue }))]);
  const undo = () => {
    setHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setCats(cs => cs.map(c => ({ ...c, _draftValue: prev.find(p => p.id === c.id)?.v ?? c._draftValue })));
      return h.slice(0, -1);
    });
  };

  const cargarDesde = (tipo) => {
    setOrigen(tipo);
    setCats(prev => prev.map(c => {
      let val = 0;
      if (tipo === "actual") val = Number(c.budget?.[month - 1]) || 0;
      else if (tipo === "mes_anterior") val = Number(c.budget?.[Math.max(0, month - 2)]) || 0;
      else if (tipo === "vacio") val = 0;
      return { ...c, _draftValue: val };
    }));
  };

  const setDraft = (id, value) => {
    pushHistory();
    setCats(prev => prev.map(c => c.id === id ? { ...c, _draftValue: Math.max(0, Math.round(value * 100) / 100) } : c));
  };

  const adjustDraft = (id, deltaPct) => {
    pushHistory();
    setCats(prev => prev.map(c => {
      if (c.id !== id) return c;
      const current = Number(c._draftValue) || 0;
      const newVal = current * (1 + deltaPct / 100);
      return { ...c, _draftValue: Math.max(0, Math.round(newVal * 100) / 100) };
    }));
  };

  // ── Presets (E) ─────────────────────────────────────────────────
  const aplicarPreset = (tipo) => {
    pushHistory();
    setCats(prev => prev.map(c => {
      const base = baseline.find(b => b.id === c.id)?.v || 0;
      let factor = 1;
      if (tipo === "optimista") factor = c.tipo === "ingreso" ? 1.20 : 0.95;
      else if (tipo === "pesimista") factor = c.tipo === "ingreso" ? 0.75 : 1.10;
      else if (tipo === "base") factor = 1;
      return { ...c, _draftValue: Math.round(base * factor * 100) / 100 };
    }));
  };

  // ── Nómina: calcular impacto de empleados excluidos/extras ──────
  const deltaNomina = useMemo(() => {
    const eliminados = empleados.filter(e => empExcluidos.has(e.id)).reduce((s, e) => s + (Number(e.salario_base) || 0), 0);
    const agregados = empExtras.reduce((s, e) => s + (Number(e.salario) || 0), 0);
    return (agregados - eliminados) / 1_000_000; // en M
  }, [empleados, empExcluidos, empExtras]);

  // ── What-ifs (F) ─────────────────────────────────────────────────
  const WHAT_IFS = [
    { id: "contratar_mesero", label: "Contratar 2 meseros más", impact: { gasto: { "Nómina": +3.5 } } },
    { id: "subir_vip", label: "Subir precio VIP +10%", impact: { ingreso: { "Pasadías": +12 } } },
    { id: "cerrar_lunes", label: "Cerrar lunes", impact: { ingreso: { "Pasadías": -8 }, costo: { "Costo A&B": -1 }, gasto: { "Servicios": -0.5 } } },
    { id: "temp_baja", label: "Temporada baja (-20% pax)", impact: { ingreso: { "Pasadías": -24 } } },
  ];

  const toggleWhatIf = (wid) => {
    const w = WHAT_IFS.find(x => x.id === wid);
    if (!w) return;
    pushHistory();
    setWhatIfs(prev => {
      const active = !prev[wid];
      const sign = active ? 1 : -1;
      setCats(cs => cs.map(c => {
        const tipo = c.tipo; // 'ingreso' | 'costo' | 'gasto'
        const delta = w.impact[tipo]?.[c.categoria];
        if (!delta) return c;
        return { ...c, _draftValue: Math.max(0, Math.round((Number(c._draftValue) + delta * sign) * 100) / 100) };
      }));
      return { ...prev, [wid]: active };
    });
  };

  // Aplicar fórmulas para ver valores calculados
  const catsWithCalc = useMemo(() => applyFormulas(cats), [cats]);

  // KPIs en vivo (con delta vs baseline)
  const kpis = useMemo(() => {
    const ing = catsWithCalc.filter(c => c.tipo === "ingreso").reduce((s, c) => s + (c._calcValue || 0), 0);
    const cos = catsWithCalc.filter(c => c.tipo === "costo").reduce((s, c) => s + (c._calcValue || 0), 0);
    const gas = catsWithCalc.filter(c => c.tipo === "gasto").reduce((s, c) => s + (c._calcValue || 0), 0);
    const gross = ing - cos;
    const ebitda = ing - cos - gas;

    // Baseline (aplicando fórmulas también)
    const baseCats = cats.map(c => {
      const b = baseline.find(x => x.id === c.id)?.v || 0;
      return { ...c, _draftValue: b };
    });
    const baseCatsCalc = applyFormulas(baseCats);
    const ingB = baseCatsCalc.filter(c => c.tipo === "ingreso").reduce((s, c) => s + (c._calcValue || 0), 0);
    const cosB = baseCatsCalc.filter(c => c.tipo === "costo").reduce((s, c) => s + (c._calcValue || 0), 0);
    const gasB = baseCatsCalc.filter(c => c.tipo === "gasto").reduce((s, c) => s + (c._calcValue || 0), 0);
    const grossB = ingB - cosB;
    const ebitdaB = ingB - cosB - gasB;

    return {
      revenue: ing, costos: cos, gastos: gas, gross, ebitda,
      grossMarg: ing > 0 ? (gross / ing) * 100 : 0,
      ebitdaMarg: ing > 0 ? (ebitda / ing) * 100 : 0,
      costPct: ing > 0 ? (cos / ing) * 100 : 0,
      // deltas vs baseline
      dRev: ing - ingB, dCos: cos - cosB, dGas: gas - gasB, dGross: gross - grossB, dEbi: ebitda - ebitdaB,
    };
  }, [catsWithCalc, cats, baseline]);

  const aplicar = async () => {
    if (!confirm(`¿Aplicar estos valores al Presupuesto de ${MESES[month - 1]} ${year}?\n\nSe sobrescribirán los valores actuales.`)) return;
    setSaving(true);
    // Actualizar budget[mes - 1] de cada categoría
    for (const c of cats) {
      if (c._isFormula || (c.formula_pct && c.formula_source)) continue; // las fórmulas se calculan solas
      const budget = [...(c.budget || Array(12).fill(0))];
      while (budget.length < 12) budget.push(0);
      budget[month - 1] = Number(c._draftValue) || 0;
      await supabase.from("presupuesto_anual").update({ budget, updated_at: new Date().toISOString() }).eq("id", c.id);
    }
    setSaving(false);
    alert(`✅ Presupuesto de ${MESES[month - 1]} aplicado con éxito`);
    onClose?.();
  };

  const ingresos = catsWithCalc.filter(c => c.tipo === "ingreso");
  const costos   = catsWithCalc.filter(c => c.tipo === "costo");
  const gastos   = catsWithCalc.filter(c => c.tipo === "gasto");

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: B.sand }}>Cargando…</div>;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, overflowY: "auto" }}>
      <div style={{ maxWidth: 1100, margin: "20px auto", background: B.navy, borderRadius: 16, overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 28px", background: B.navyMid, borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: B.sand, letterSpacing: 2, textTransform: "uppercase" }}>🎯 Planificador de Presupuesto</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 800, color: B.white }}>
              Sesión de planeación · {MESES[month - 1]} {year}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: "8px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none" }}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>✕</button>
          </div>
        </div>

        {/* Origen */}
        <div style={{ padding: "12px 28px", background: "rgba(255,255,255,0.02)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Partir de:</span>
          {[
            { k: "actual",        l: "Presupuesto actual" },
            { k: "mes_anterior",  l: `${MESES_SHORT[Math.max(0, month - 2)]}` },
            { k: "vacio",         l: "En blanco ($0)" },
          ].map(o => (
            <button key={o.k} onClick={() => cargarDesde(o.k)}
              style={{
                padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: origen === o.k ? B.sky + "33" : "transparent",
                border: `1px solid ${origen === o.k ? B.sky : B.navyLight}`,
                color: origen === o.k ? B.sky : "rgba(255,255,255,0.6)",
              }}>{o.l}</button>
          ))}
        </div>

        {/* KPIs en vivo con delta vs baseline */}
        <div style={{ padding: "18px 28px", background: B.navyMid, borderBottom: `2px solid ${B.sand}`, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          {[
            { l: "Revenue",       v: fmt(kpis.revenue),     sub: "Total ingresos",                delta: kpis.dRev,   color: B.success, isIncome: true },
            { l: "Costos",        v: fmt(kpis.costos),      sub: pct(kpis.costPct) + " de rev",   delta: kpis.dCos,   color: B.pink,    isIncome: false },
            { l: "Utilidad Bruta",v: fmt(kpis.gross),       sub: pct(kpis.grossMarg) + " margen", delta: kpis.dGross, color: B.sky,     isIncome: true },
            { l: "Gastos",        v: fmt(kpis.gastos),      sub: "OpEx",                          delta: kpis.dGas,   color: B.warning, isIncome: false },
            { l: "EBITDA",        v: fmt(kpis.ebitda),      sub: pct(kpis.ebitdaMarg) + " margen", delta: kpis.dEbi,   color: B.sand, bold: true, isIncome: true },
          ].map((k, i) => {
            const hasDelta = Math.abs(k.delta) > 0.01;
            const fav = k.isIncome ? k.delta >= 0 : k.delta <= 0;
            const dColor = !hasDelta ? "rgba(255,255,255,0.3)" : fav ? B.success : B.danger;
            return (
              <div key={i} style={{ borderLeft: `3px solid ${k.color}`, padding: "4px 10px" }}>
                <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{k.l}</div>
                <div style={{ fontSize: k.bold ? 24 : 20, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.v}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{k.sub}</div>
                {hasDelta && (
                  <div style={{ fontSize: 10, color: dColor, fontWeight: 700, marginTop: 2 }}>
                    {k.delta > 0 ? "▲" : "▼"} {fmt(Math.abs(k.delta))} vs base
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Presets + Undo + What-Ifs + Auto-balance */}
        <div style={{ padding: "12px 28px", background: "rgba(255,255,255,0.03)", borderBottom: `1px solid ${B.navyLight}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>⚡ Presets:</span>
          <button onClick={() => aplicarPreset("optimista")} style={presetBtn(B.success)}>🟢 Optimista</button>
          <button onClick={() => aplicarPreset("base")}      style={presetBtn(B.sky)}>🟡 Base</button>
          <button onClick={() => aplicarPreset("pesimista")} style={presetBtn(B.danger)}>🔴 Pesimista</button>
          <span style={{ width: 1, height: 20, background: B.navyLight, margin: "0 4px" }} />
          <button onClick={undo} disabled={history.length === 0}
            style={{ padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: `1px solid ${history.length ? B.sand : B.navyLight}`, background: "transparent", color: history.length ? B.sand : "rgba(255,255,255,0.3)", cursor: history.length ? "pointer" : "default" }}>
            ⟲ Deshacer {history.length > 0 && `(${history.length})`}
          </button>
          <span style={{ width: 1, height: 20, background: B.navyLight, margin: "0 4px" }} />
          <button onClick={() => setShowEmpModal(true)}
            style={{ padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "none", background: B.sky + "33", color: B.sky, cursor: "pointer" }}>
            👥 Gestionar empleados {deltaNomina !== 0 && <span style={{ color: deltaNomina > 0 ? B.danger : B.success }}>({deltaNomina > 0 ? "+" : ""}{deltaNomina.toFixed(1)}M)</span>}
          </button>
        </div>

        {/* What-ifs */}
        <div style={{ padding: "12px 28px", background: "rgba(142,202,230,0.05)", borderBottom: `1px solid ${B.navyLight}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: B.sky, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>💭 ¿Qué pasa si…?</span>
          {WHAT_IFS.map(w => (
            <label key={w.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, background: whatIfs[w.id] ? B.sky + "33" : "rgba(255,255,255,0.04)", border: `1px solid ${whatIfs[w.id] ? B.sky : B.navyLight}`, cursor: "pointer", fontSize: 11, color: whatIfs[w.id] ? B.sky : "rgba(255,255,255,0.6)", fontWeight: 600 }}>
              <input type="checkbox" checked={!!whatIfs[w.id]} onChange={() => toggleWhatIf(w.id)}
                style={{ accentColor: B.sky }} />
              {w.label}
            </label>
          ))}
        </div>

        {/* Categorías */}
        <div style={{ padding: "20px 28px" }}>
          {[
            { title: "💚 INGRESOS", items: ingresos, color: B.success, income: true },
            { title: "🔶 COSTOS DIRECTOS", items: costos, color: B.pink },
            { title: "🟡 GASTOS", items: gastos, color: B.warning },
          ].map(sec => (
            <div key={sec.title} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: sec.color, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${sec.color}33` }}>
                {sec.title}
              </div>
              {sec.items.map(c => (
                <Row key={c.id} cat={c} onChangeValue={(v) => setDraft(c.id, v)} onAdjust={(d) => adjustDraft(c.id, d)} />
              ))}
            </div>
          ))}
        </div>

        {/* Notas */}
        <div style={{ padding: "0 28px 20px" }}>
          <label style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, display: "block", marginBottom: 6 }}>
            💡 Notas de la sesión
          </label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
            placeholder="Decisiones de la reunión, supuestos, puntos pendientes…"
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
        </div>

        {/* Modal de empleados */}
        {showEmpModal && (
          <EmpleadosModal
            empleados={empleados}
            excluidos={empExcluidos}
            extras={empExtras}
            deltaM={deltaNomina}
            onToggleEmp={(id) => {
              setEmpExcluidos(s => {
                const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id);
                return n;
              });
            }}
            onAddExtra={(extra) => setEmpExtras(arr => [...arr, { id: `x-${Date.now()}`, ...extra }])}
            onRemoveExtra={(id) => setEmpExtras(arr => arr.filter(x => x.id !== id))}
            onApply={() => {
              // Aplicar el delta a la categoría "Nómina"
              pushHistory();
              setCats(prev => prev.map(c => {
                if (c.categoria !== "Nómina") return c;
                const base = baseline.find(b => b.id === c.id)?.v || 0;
                return { ...c, _draftValue: Math.max(0, Math.round((base + deltaNomina) * 100) / 100) };
              }));
              setShowEmpModal(false);
            }}
            onClose={() => setShowEmpModal(false)}
          />
        )}

        {/* Footer */}
        <div style={{ padding: "16px 28px", background: B.navyMid, borderTop: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            ℹ️ Los cambios no se guardan hasta que des "Aplicar". Las fórmulas (ƒ) se recalculan solas.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, background: "transparent", color: "rgba(255,255,255,0.55)", border: `1px solid ${B.navyLight}`, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Descartar
            </button>
            <button onClick={aplicar} disabled={saving} style={{ padding: "10px 22px", borderRadius: 8, background: saving ? B.navyLight : B.success, color: B.navy, border: "none", fontSize: 13, fontWeight: 800, cursor: saving ? "default" : "pointer" }}>
              {saving ? "Aplicando…" : `Aplicar a ${MESES[month - 1]} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helper: preset button style ───────────────────────────────────────────
const presetBtn = (color) => ({
  padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
  border: `1px solid ${color}55`, background: color + "22", color,
  cursor: "pointer",
});

// ─── Modal de empleados para Nómina ────────────────────────────────────────
function EmpleadosModal({ empleados, excluidos, extras, deltaM, onToggleEmp, onAddExtra, onRemoveExtra, onApply, onClose }) {
  const [newNombre, setNewNombre] = useState("");
  const [newSalario, setNewSalario] = useState("");
  const [newCargo, setNewCargo] = useState("");

  const totalExcluidos = empleados.filter(e => excluidos.has(e.id)).reduce((s, e) => s + (Number(e.salario_base) || 0), 0);
  const totalExtras = extras.reduce((s, e) => s + (Number(e.salario) || 0), 0);

  const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, width: 680, maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Escenario de nómina</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 800, color: B.white }}>Gestionar empleados</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "14px 24px", background: "rgba(255,255,255,0.03)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div style={{ padding: "8px 12px", borderLeft: `3px solid ${B.danger}` }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase" }}>Excluidos</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: B.danger, fontFamily: "'Barlow Condensed', sans-serif" }}>-{COP(totalExcluidos)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{excluidos.size} persona{excluidos.size !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ padding: "8px 12px", borderLeft: `3px solid ${B.success}` }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase" }}>Agregados</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>+{COP(totalExtras)}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{extras.length} persona{extras.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ padding: "8px 12px", borderLeft: `3px solid ${B.sand}` }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase" }}>Impacto nómina</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: deltaM === 0 ? "rgba(255,255,255,0.5)" : deltaM > 0 ? B.danger : B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>
              {deltaM > 0 ? "+" : ""}{deltaM.toFixed(2)}M
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 24px" }}>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>Empleados actuales</div>
          <div style={{ maxHeight: 280, overflowY: "auto", border: `1px solid ${B.navyLight}`, borderRadius: 8 }}>
            {empleados.map(e => {
              const ex = excluidos.has(e.id);
              return (
                <div key={e.id} onClick={() => onToggleEmp(e.id)}
                  style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: ex ? "rgba(215,69,69,0.08)" : "transparent", borderBottom: `1px solid ${B.navyLight}40`, opacity: ex ? 0.5 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14 }}>{ex ? "✗" : "✓"}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, textDecoration: ex ? "line-through" : "none" }}>{e.nombre_completo}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{e.cargo || "—"}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ex ? B.danger : B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {COP(e.salario_base)}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, margin: "18px 0 8px" }}>Agregar empleados hipotéticos</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 2fr auto", gap: 8, marginBottom: 8 }}>
            <input placeholder="Nombre" value={newNombre} onChange={e => setNewNombre(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, outline: "none" }} />
            <input placeholder="Cargo" value={newCargo} onChange={e => setNewCargo(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, outline: "none" }} />
            <input placeholder="Salario mensual" type="number" value={newSalario} onChange={e => setNewSalario(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, outline: "none" }} />
            <button onClick={() => {
              if (!newNombre.trim() || !newSalario) return;
              onAddExtra({ nombre: newNombre.trim(), cargo: newCargo, salario: Number(newSalario) });
              setNewNombre(""); setNewCargo(""); setNewSalario("");
            }} style={{ padding: "0 14px", borderRadius: 6, background: B.success, color: B.navy, border: "none", fontWeight: 700, cursor: "pointer" }}>+</button>
          </div>
          {extras.length > 0 && (
            <div style={{ border: `1px solid ${B.navyLight}`, borderRadius: 6, overflow: "hidden" }}>
              {extras.map(e => (
                <div key={e.id} style={{ padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", background: B.success + "11", borderBottom: `1px solid ${B.navyLight}40` }}>
                  <div style={{ fontSize: 12 }}>
                    <strong>+ {e.nombre}</strong> {e.cargo && <span style={{ color: "rgba(255,255,255,0.4)" }}>· {e.cargo}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: B.success, fontWeight: 700 }}>{COP(e.salario)}</span>
                    <button onClick={() => onRemoveExtra(e.id)} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 13 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: 8, background: "transparent", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.55)", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
          <button onClick={onApply} style={{ padding: "9px 18px", borderRadius: 8, background: B.success, border: "none", color: B.navy, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Aplicar cambios a Nómina
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row: una categoría con slider + quick buttons ─────────────────────────
function Row({ cat, onChangeValue, onAdjust }) {
  const isFormula = !!(cat.formula_pct && cat.formula_source);
  const value = isFormula ? (cat._calcValue || 0) : (cat._draftValue || 0);
  const baseForSlider = cat.budget ? (cat.budget.reduce((a, b) => Math.max(a, Number(b) || 0), 0) || 1) * 1.5 : 100;
  const max = Math.max(baseForSlider, value * 1.5, 100);

  return (
    <div style={{ padding: "10px 14px", background: B.navyMid, borderRadius: 8, marginBottom: 6, display: "grid", gridTemplateColumns: "200px 1fr 140px 320px", gap: 14, alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.white }}>
          {cat.categoria}
          {isFormula && (
            <span title={`Calculado: ${cat.formula_pct}% de ${cat.formula_source}`}
              style={{ fontSize: 9, marginLeft: 6, padding: "1px 6px", borderRadius: 8, background: B.warning + "22", color: B.warning, fontWeight: 700 }}>
              ƒ {cat.formula_pct}%
            </span>
          )}
        </div>
      </div>

      {/* Slider */}
      <input type="range" min={0} max={max} step="0.5" value={value}
        disabled={isFormula}
        onChange={e => onChangeValue(Number(e.target.value))}
        style={{
          width: "100%", cursor: isFormula ? "not-allowed" : "pointer", accentColor: B.sky, opacity: isFormula ? 0.5 : 1,
        }} />

      {/* Valor numérico editable */}
      <input type="number" min={0} step="0.01" value={value}
        disabled={isFormula}
        onChange={e => onChangeValue(Number(e.target.value))}
        style={{
          padding: "6px 10px", borderRadius: 6, background: isFormula ? "rgba(255,255,255,0.03)" : B.navy, border: `1px solid ${B.navyLight}`,
          color: isFormula ? B.warning : B.white, fontSize: 14, fontWeight: 700, textAlign: "right", width: "100%", boxSizing: "border-box",
          fontFamily: "'Barlow Condensed', sans-serif", outline: "none",
          cursor: isFormula ? "not-allowed" : "text",
        }} />

      {/* Quick buttons */}
      <div style={{ display: "flex", gap: 4 }}>
        {[-10, -5, 5, 10, 20].map(delta => (
          <button key={delta} onClick={() => onAdjust(delta)}
            disabled={isFormula}
            style={{
              flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 10, fontWeight: 700,
              background: delta > 0 ? B.success + "22" : B.danger + "22",
              color: delta > 0 ? B.success : B.danger,
              border: "none", cursor: isFormula ? "not-allowed" : "pointer",
              opacity: isFormula ? 0.4 : 1,
            }}>
            {delta > 0 ? "+" : ""}{delta}%
          </button>
        ))}
      </div>
    </div>
  );
}
