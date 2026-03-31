import { useState } from "react";
import { B, COP } from "../brand";

const PERIODS = ["Mar 2026", "Feb 2026", "Ene 2026"];
const DATA = {
  "Mar 2026": {
    ingresos: [
      { cat: "Pasadias", val: 142800000 },
      { cat: "Eventos", val: 45000000 },
      { cat: "B2B Comisiones", val: 18200000 },
      { cat: "Bar & Restaurante", val: 32500000 },
      { cat: "Tienda", val: 4800000 },
    ],
    gastos: [
      { cat: "Nomina", val: 48000000 },
      { cat: "Combustible Flota", val: 12500000 },
      { cat: "Alimentos & Bebidas", val: 18700000 },
      { cat: "Mantenimiento", val: 8200000 },
      { cat: "Marketing", val: 6500000 },
      { cat: "Servicios Publicos", val: 3800000 },
      { cat: "Seguros", val: 4200000 },
      { cat: "Otros", val: 5600000 },
    ],
  },
  "Feb 2026": {
    ingresos: [
      { cat: "Pasadias", val: 128500000 },
      { cat: "Eventos", val: 38000000 },
      { cat: "B2B Comisiones", val: 15800000 },
      { cat: "Bar & Restaurante", val: 28900000 },
      { cat: "Tienda", val: 3200000 },
    ],
    gastos: [
      { cat: "Nomina", val: 48000000 },
      { cat: "Combustible Flota", val: 11800000 },
      { cat: "Alimentos & Bebidas", val: 16200000 },
      { cat: "Mantenimiento", val: 15400000 },
      { cat: "Marketing", val: 5200000 },
      { cat: "Servicios Publicos", val: 3800000 },
      { cat: "Seguros", val: 4200000 },
      { cat: "Otros", val: 4100000 },
    ],
  },
  "Ene 2026": {
    ingresos: [
      { cat: "Pasadias", val: 165200000 },
      { cat: "Eventos", val: 52000000 },
      { cat: "B2B Comisiones", val: 22100000 },
      { cat: "Bar & Restaurante", val: 38400000 },
      { cat: "Tienda", val: 6100000 },
    ],
    gastos: [
      { cat: "Nomina", val: 52000000 },
      { cat: "Combustible Flota", val: 14200000 },
      { cat: "Alimentos & Bebidas", val: 21500000 },
      { cat: "Mantenimiento", val: 6800000 },
      { cat: "Marketing", val: 8900000 },
      { cat: "Servicios Publicos", val: 4100000 },
      { cat: "Seguros", val: 4200000 },
      { cat: "Otros", val: 3800000 },
    ],
  },
};

export default function Financiero() {
  const [period, setPeriod] = useState("Mar 2026");
  const [compare, setCompare] = useState("Feb 2026");

  const d = DATA[period];
  const c = DATA[compare];
  const totalIng = d.ingresos.reduce((s, r) => s + r.val, 0);
  const totalGas = d.gastos.reduce((s, r) => s + r.val, 0);
  const utilidad = totalIng - totalGas;
  const cTotalIng = c.ingresos.reduce((s, r) => s + r.val, 0);
  const cTotalGas = c.gastos.reduce((s, r) => s + r.val, 0);
  const cUtilidad = cTotalIng - cTotalGas;
  const pct = v => v > 0 ? `+${((v) * 100).toFixed(1)}%` : `${((v) * 100).toFixed(1)}%`;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600 }}>Estado Financiero (P&L)</h2>
        <div style={{ display: "flex", gap: 12 }}>
          <select value={period} onChange={e => setPeriod(e.target.value)}
            style={{ padding: "8px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13 }}>
            {PERIODS.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={compare} onChange={e => setCompare(e.target.value)}
            style={{ padding: "8px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13 }}>
            {PERIODS.filter(p => p !== period).map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Ingresos", val: totalIng, delta: (totalIng - cTotalIng) / cTotalIng, color: B.success },
          { label: "Gastos", val: totalGas, delta: (totalGas - cTotalGas) / cTotalGas, color: B.danger },
          { label: "Utilidad Neta", val: utilidad, delta: (utilidad - cUtilidad) / cUtilidad, color: B.sand },
          { label: "Margen", val: null, pctVal: `${((utilidad / totalIng) * 100).toFixed(1)}%`, color: B.sky },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", flex: 1, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.pctVal || COP(s.val)}</div>
            {s.delta !== undefined && <div style={{ fontSize: 12, color: s.delta >= 0 ? B.success : B.danger, marginTop: 2 }}>{pct(s.delta)} vs {compare}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Ingresos */}
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 16, color: B.success }}>Ingresos</h3>
            <span style={{ fontWeight: 700 }}>{COP(totalIng)}</span>
          </div>
          {d.ingresos.map((r, i) => {
            const cv = c.ingresos.find(cr => cr.cat === r.cat)?.val || 0;
            const delta = cv ? (r.val - cv) / cv : 0;
            return (
              <div key={r.cat} style={{ padding: "12px 20px", borderBottom: i < d.ingresos.length - 1 ? `1px solid ${B.navyLight}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>{r.cat}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{COP(r.val)}</div>
                  <div style={{ fontSize: 11, color: delta >= 0 ? B.success : B.danger }}>{pct(delta)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Gastos */}
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 16, color: B.danger }}>Gastos</h3>
            <span style={{ fontWeight: 700 }}>{COP(totalGas)}</span>
          </div>
          {d.gastos.map((r, i) => {
            const cv = c.gastos.find(cr => cr.cat === r.cat)?.val || 0;
            const delta = cv ? (r.val - cv) / cv : 0;
            return (
              <div key={r.cat} style={{ padding: "12px 20px", borderBottom: i < d.gastos.length - 1 ? `1px solid ${B.navyLight}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>{r.cat}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{COP(r.val)}</div>
                  <div style={{ fontSize: 11, color: delta <= 0 ? B.success : B.danger }}>{pct(delta)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
