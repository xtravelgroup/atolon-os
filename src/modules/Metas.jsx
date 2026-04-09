import { useState, useEffect, useCallback, useMemo } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function nanoid(n = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function currentPeriodo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function periodoLabel(p) {
  if (!p) return "";
  const [y, m] = p.split("-");
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${meses[parseInt(m) - 1]} ${y}`;
}

function prevPeriodo(p) {
  const [y, m] = p.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextPeriodo(p) {
  const [y, m] = p.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function periodRange(periodo) {
  const [y, m] = periodo.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${periodo}-01`, end: `${periodo}-${String(lastDay).padStart(2, "0")}` };
}

function pct(real, meta) {
  if (!meta || meta <= 0) return null;
  return Math.min(Math.round((real / meta) * 100), 999);
}

function pctColor(p) {
  if (p === null || p === undefined) return "rgba(255,255,255,0.15)";
  if (p >= 100) return B.success;
  if (p >= 75)  return "#F59E0B";
  if (p >= 50)  return B.warning;
  return B.danger;
}

function fmtM(v) {
  if (!v) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toLocaleString("es-CO")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Department config
// ─────────────────────────────────────────────────────────────────────────────

const DEPTOS = [
  { key: "pasadias", label: "Venta Pasadías",        icon: "🏖️", metricLabel: "Pasadías" },
  { key: "grupos",   label: "Grupos & Eventos",       icon: "🎉", metricLabel: "Pasadías Grupos" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ real, meta, height = 7 }) {
  const p   = meta > 0 ? Math.min((real / meta) * 100, 100) : 0;
  const col = pctColor(pct(real, meta));
  return (
    <div style={{ background: "#ffffff10", borderRadius: 4, height, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", background: col, borderRadius: 4, transition: "width 0.5s ease" }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drill-down modal
// ─────────────────────────────────────────────────────────────────────────────

const COP_FMT = (v) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(v || 0);

function exportCSV(title, items, cols) {
  const header = cols.map(c => c.label).join(",");
  const rows = items.map(row =>
    cols.map(c => {
      const val = c.render ? c.render(row) : (row[c.key] ?? "");
      const str = String(val).replace(/"/g, '""');
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${title.replace(/[^\w\s]/g, "").trim()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function DrillDownModal({ title, items, cols, onClose }) {
  const btnStyle = {
    padding: "6px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`,
    background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)",
    fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  };

  const handlePrint = () => {
    const header = cols.map(c => `<th style="text-align:${c.right?"right":"left"};padding:6px 10px;border-bottom:1px solid #ccc;font-size:11px;text-transform:uppercase">${c.label}</th>`).join("");
    const bodyRows = items.map(row => {
      const cells = cols.map(c => {
        const val = c.render ? c.render(row) : (row[c.key] ?? "—");
        return `<td style="padding:6px 10px;font-size:13px;text-align:${c.right?"right":"left"};border-bottom:1px solid #eee">${val}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    const html = `<html><head><title>${title}</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}@media print{body{padding:0}}</style></head><body><h2 style="margin-bottom:12px">${title}</h2><p style="color:#666;font-size:12px;margin-bottom:16px">${items.length} registro${items.length!==1?"s":""}</p><table><thead><tr>${header}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ background: B.navyMid, borderRadius: 16, width: "100%", maxWidth: 760, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px #0008" }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 700 }}>{title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{items.length} registro{items.length !== 1 ? "s" : ""}</span>
            <button onClick={handlePrint} style={btnStyle} title="Imprimir">🖨 Imprimir</button>
            <button onClick={() => exportCSV(title, items, cols)} style={btnStyle} title="Exportar a Excel/CSV">📊 Excel</button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
        </div>
        {/* Table */}
        <div style={{ overflowY: "auto", padding: "0 24px 20px" }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Sin registros</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
              <thead>
                <tr>
                  {cols.map(c => (
                    <th key={c.key} style={{ textAlign: c.right ? "right" : "left", padding: "8px 10px", fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${B.navyLight}`, fontWeight: 600 }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${B.navyLight}44` }}>
                    {cols.map(c => (
                      <td key={c.key} style={{ padding: "10px 10px", fontSize: 13, textAlign: c.right ? "right" : "left", color: c.color ? c.color(row) : B.white }}>
                        {c.render ? c.render(row) : row[c.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Resumen
// ─────────────────────────────────────────────────────────────────────────────

function DeptKpiCard({ depto, real, meta, onDrillMetric, onDrillIngresos }) {
  const pMetric  = pct(real.metric, meta.metric);
  const pIngresos = pct(real.ingresos, meta.ingresos);
  const cardColor = pctColor(pMetric ?? pIngresos);

  const clickStyle = { cursor: "pointer", borderRadius: 8, padding: "10px 12px", margin: "-10px -12px", transition: "background 0.15s" };

  return (
    <div style={{
      background: B.navyMid, borderRadius: 14, padding: "22px 24px",
      flex: "1 1 300px", borderTop: `3px solid ${cardColor}`,
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{depto.icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>{depto.label}</div>

      {/* Metric */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {depto.metricLabel}
          </span>
          {meta.metric > 0 && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>meta: {meta.metric}</span>
          )}
        </div>
        <div
          onClick={onDrillMetric}
          title="Ver detalle"
          style={{ ...clickStyle, display: "inline-block" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <div style={{ fontSize: 34, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: pctColor(pMetric), lineHeight: 1 }}>
            {real.metric}
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginLeft: 6, fontFamily: "inherit", fontWeight: 400 }}>↗</span>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          {meta.metric > 0 ? (
            <>
              <ProgressBar real={real.metric} meta={meta.metric} />
              <div style={{ fontSize: 11, color: pctColor(pMetric), marginTop: 4, fontWeight: 700 }}>{pMetric}%</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>Sin meta configurada</div>
          )}
        </div>
      </div>

      {/* Ingresos */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em" }}>Ingresos</span>
          {meta.ingresos > 0 && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>meta: {fmtM(meta.ingresos)}</span>
          )}
        </div>
        <div
          onClick={onDrillIngresos}
          title="Ver detalle"
          style={{ ...clickStyle, display: "inline-block" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <div style={{ fontSize: 26, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: pctColor(pIngresos), lineHeight: 1 }}>
            {fmtM(real.ingresos)}
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginLeft: 6, fontFamily: "inherit", fontWeight: 400 }}>↗</span>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          {meta.ingresos > 0 ? (
            <>
              <ProgressBar real={real.ingresos} meta={meta.ingresos} />
              <div style={{ fontSize: 11, color: pctColor(pIngresos), marginTop: 4, fontWeight: 700 }}>{pIngresos}%</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>Sin meta configurada</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabResumen({ reals, metas, rawReservas, rawEventos, isMobile }) {
  const [drill, setDrill] = useState(null); // { title, items, cols }

  const RES_COLS = [
    { key: "nombre",   label: "Nombre" },
    { key: "fecha",    label: "Fecha" },
    { key: "tipo",     label: "Tipo" },
    { key: "vendedor", label: "Vendedor", render: r => r.vendedor || "Sin asignar" },
    { key: "pax",      label: "Pax", right: true, render: r => (r.pax_a || 0) + (r.pax_n || 0) },
    { key: "total",    label: "Total", right: true, render: r => COP_FMT(r.total), color: () => B.success },
  ];

  const EVT_COLS = [
    { key: "nombre",   label: "Nombre / Grupo" },
    { key: "fecha",    label: "Fecha" },
    { key: "vendedor", label: "Vendedor", render: r => r.vendedor || "Sin asignar" },
    { key: "pax",      label: "Pax", right: true },
    { key: "valor",    label: "Valor", right: true, render: r => COP_FMT(r.valor), color: () => B.success },
  ];

  const pasadiasRows = rawReservas.filter(r => (r.canal || "").toLowerCase() !== "grupo");
  const grupoRows    = rawEventos;

  return (
    <>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {DEPTOS.map(d => (
          <DeptKpiCard
            key={d.key}
            depto={d}
            real={reals[d.key] || { metric: 0, ingresos: 0 }}
            meta={metas[d.key] || { metric: 0, ingresos: 0 }}
            onDrillMetric={() => {
              const rows = d.key === "pasadias" ? pasadiasRows : grupoRows;
              const cols = d.key === "pasadias" ? RES_COLS : EVT_COLS;
              const sorted = d.key === "pasadias"
                ? [...rows].sort((a, b) => ((b.pax_a||0)+(b.pax_n||0)) - ((a.pax_a||0)+(a.pax_n||0)))
                : [...rows].sort((a, b) => (b.pax || 0) - (a.pax || 0));
              setDrill({ title: `${d.icon} ${d.metricLabel} — detalle`, items: sorted, cols });
            }}
            onDrillIngresos={() => {
              const rows = d.key === "pasadias" ? pasadiasRows : grupoRows;
              const cols = d.key === "pasadias" ? RES_COLS : EVT_COLS;
              const sorted = [...rows].sort((a, b) => (b.total || b.valor || 0) - (a.total || a.valor || 0));
              setDrill({ title: `${d.icon} Ingresos ${d.label} — detalle`, items: sorted, cols });
            }}
          />
        ))}
      </div>
      {drill && (
        <DrillDownModal
          title={drill.title}
          items={drill.items}
          cols={drill.cols}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Por Vendedor
// ─────────────────────────────────────────────────────────────────────────────

function VendedorRankingSection({ depto, ranking }) {
  const MEDAL = ["🥇","🥈","🥉"];
  const MEDAL_COLOR = ["#FFD700","#C0C0C0","#CD7F32"];

  if (ranking.length === 0) {
    return (
      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "16px 0", fontStyle: "italic" }}>
        Sin datos para este período
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {ranking.map((v, i) => {
        const pM = pct(v.real.metric, v.meta.metric);
        const pI = pct(v.real.ingresos, v.meta.ingresos);
        const borderColor = i < 3 ? MEDAL_COLOR[i] : B.navyLight;
        return (
          <div key={v.nombre} style={{
            background: B.navyMid, borderRadius: 12, padding: "16px 20px",
            borderLeft: `4px solid ${borderColor}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 17,
                  background: i < 3 ? `${MEDAL_COLOR[i]}22` : B.navyLight,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: i < 3 ? 16 : 13, fontWeight: 700,
                  color: i < 3 ? MEDAL_COLOR[i] : "rgba(255,255,255,0.45)",
                }}>
                  {i < 3 ? MEDAL[i] : i + 1}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{v.nombre}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: pctColor(pM) }}>{v.real.metric}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{depto.metricLabel}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, color: "#F59E0B" }}>{fmtM(v.real.ingresos)}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Ingresos</div>
                </div>
              </div>
            </div>
            {(v.meta.metric > 0 || v.meta.ingresos > 0) && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {v.meta.metric > 0 && (
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{depto.metricLabel} vs meta ({v.meta.metric})</span>
                      <span style={{ fontSize: 10, color: pctColor(pM), fontWeight: 700 }}>{pM ?? 0}%</span>
                    </div>
                    <ProgressBar real={v.real.metric} meta={v.meta.metric} />
                  </div>
                )}
                {v.meta.ingresos > 0 && (
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Ingresos vs meta ({fmtM(v.meta.ingresos)})</span>
                      <span style={{ fontSize: 10, color: pctColor(pI), fontWeight: 700 }}>{pI ?? 0}%</span>
                    </div>
                    <ProgressBar real={v.real.ingresos} meta={v.meta.ingresos} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabVendedores({ rankings }) {
  const [activeDepto, setActiveDepto] = useState("pasadias");
  const depto = DEPTOS.find(d => d.key === activeDepto);
  return (
    <div>
      {/* Dept tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: B.navyMid, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {DEPTOS.map(d => (
          <button key={d.key} onClick={() => setActiveDepto(d.key)} style={{
            padding: "7px 18px", borderRadius: 7, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, transition: "all 0.15s",
            background: activeDepto === d.key ? B.sky : "transparent",
            color: activeDepto === d.key ? B.navy : "rgba(255,255,255,0.5)",
          }}>
            {d.icon} {d.label}
          </button>
        ))}
      </div>
      <VendedorRankingSection depto={depto} ranking={rankings[activeDepto] || []} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Configurar
// ─────────────────────────────────────────────────────────────────────────────

const IS = {
  width: "100%", padding: "8px 10px", borderRadius: 7,
  background: B.navy, border: `1px solid ${B.navyLight}`,
  color: B.white, fontSize: 13, outline: "none", textAlign: "right",
  boxSizing: "border-box", fontFamily: "inherit",
};

function DeptConfigSection({ depto, vendedores: allVendedores, draft, onChange, isMobile }) {
  const vendedores = allVendedores.filter(v => v.dept_ventas === depto.key);
  const draftKey = (entity) => `${depto.key}::${entity}`;
  const getVal = (entity, field) => draft[deptKey(entity)]?.[field] ?? "";
  const deptKey = (entity) => `${depto.key}::${entity}`;

  const COLS = [
    { key: "metric",   label: depto.metricLabel },
    { key: "ingresos", label: "Ingresos (COP)"  },
  ];

  if (isMobile) {
    return (
      <div>
        {/* Dept card */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 18px", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: B.sky, marginBottom: 14 }}>Departamento ({depto.label})</div>
          {COLS.map(c => (
            <div key={c.key} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.label}</label>
              <input type="number" min="0" value={draft[deptKey("__dept__")]?.[c.key] ?? ""} placeholder="0"
                onChange={e => onChange(depto.key, "__dept__", c.key, e.target.value)} style={IS} />
            </div>
          ))}
        </div>
        {/* Vendor cards */}
        {vendedores.map(v => (
          <div key={v.nombre} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 18px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginBottom: 14 }}>{v.nombre}</div>
            {COLS.map(c => (
              <div key={c.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 10, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.label}</label>
                <input type="number" min="0" value={draft[deptKey(v.nombre)]?.[c.key] ?? ""} placeholder="0"
                  onChange={e => onChange(depto.key, v.nombre, c.key, e.target.value)} style={IS} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.8fr repeat(2, 1fr)", gap: 10, padding: "6px 16px" }}>
        <div />
        {COLS.map(c => (
          <div key={c.key} style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>{c.label}</div>
        ))}
      </div>
      {/* Dept row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.8fr repeat(2, 1fr)", gap: 10, padding: "10px 16px", borderRadius: 8, background: B.navyMid + "cc", marginBottom: 6, alignItems: "center", border: `1px solid ${B.sky}22` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: B.sky }}>Total Departamento</div>
        {COLS.map(c => (
          <input key={c.key} type="number" min="0" value={draft[deptKey("__dept__")]?.[c.key] ?? ""} placeholder="0"
            onChange={e => onChange(depto.key, "__dept__", c.key, e.target.value)} style={IS} />
        ))}
      </div>
      {/* Vendor rows */}
      {vendedores.length === 0 && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", fontStyle: "italic", padding: "12px 16px" }}>
          No hay vendedores activos en el sistema.
        </div>
      )}
      {vendedores.map(v => (
        <div key={v.nombre} style={{ display: "grid", gridTemplateColumns: "1.8fr repeat(2, 1fr)", gap: 10, padding: "10px 16px", borderRadius: 8, background: B.navyMid, marginBottom: 6, alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nombre}</div>
          {COLS.map(c => (
            <input key={c.key} type="number" min="0" value={draft[deptKey(v.nombre)]?.[c.key] ?? ""} placeholder="0"
              onChange={e => onChange(depto.key, v.nombre, c.key, e.target.value)} style={IS} />
          ))}
        </div>
      ))}
    </div>
  );
}

function TabConfig({ vendedores, draft, onChange, saving, savedOk, onSave, isMobile }) {
  const [activeDepto, setActiveDepto] = useState("pasadias");
  const depto = DEPTOS.find(d => d.key === activeDepto);

  return (
    <div>
      {/* Dept switcher */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: B.navyMid, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {DEPTOS.map(d => (
          <button key={d.key} onClick={() => setActiveDepto(d.key)} style={{
            padding: "7px 18px", borderRadius: 7, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, transition: "all 0.15s",
            background: activeDepto === d.key ? B.sky : "transparent",
            color: activeDepto === d.key ? B.navy : "rgba(255,255,255,0.5)",
          }}>
            {d.icon} {d.label}
          </button>
        ))}
      </div>

      <DeptConfigSection
        depto={depto}
        vendedores={vendedores}
        draft={draft}
        onChange={onChange}
        isMobile={isMobile}
      />

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 24 }}>
        <button onClick={onSave} disabled={saving} style={{
          padding: "11px 28px", borderRadius: 9, border: "none",
          background: B.sky, color: B.navy, fontWeight: 700, fontSize: 14,
          cursor: saving ? "wait" : "pointer",
        }}>
          {saving ? "Guardando..." : "💾 Guardar Metas"}
        </button>
        {savedOk && <span style={{ fontSize: 13, color: B.success, fontWeight: 600 }}>✓ Metas guardadas</span>}
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
        Las metas se guardan por período (mes). Puedes configurar metas distintas cada mes y por departamento.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function Metas() {
  const isMobile = useMobile();

  const [tab, setTab]         = useState("resumen");
  const [periodo, setPeriodo] = useState(currentPeriodo());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [canConfig, setCanConfig] = useState(false);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("usuarios").select("rol_id").eq("email", user.email).maybeSingle();
      if (data && ["super_admin", "gerente_general"].includes(data.rol_id)) setCanConfig(true);
    })();
  }, []);

  const [vendedores, setVendedores] = useState([]);
  const [metasDB, setMetasDB]       = useState([]);
  const [reservasData, setReservasData] = useState([]);  // aggregated by vendedor
  const [eventosData, setEventosData]   = useState([]);  // aggregated by vendedor
  const [rawReservas, setRawReservas]   = useState([]);  // individual records
  const [rawEventos,  setRawEventos]    = useState([]);  // individual records
  const [draft, setDraft] = useState({});

  // ── Load ─────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { start, end } = periodRange(periodo);

    const [
      { data: usrs },
      { data: metas },
      { data: reservas },
      { data: eventos },
    ] = await Promise.all([
      supabase.from("usuarios").select("nombre, dept_ventas").eq("activo", true).eq("es_vendedor", true).order("nombre"),
      supabase.from("metas").select("*").eq("periodo", periodo),
      // Pasadías individuales (excluye A CONSUMO: pago en sitio, no genera ingreso medible)
      supabase.from("reservas")
        .select("id, nombre, fecha, tipo, vendedor, pax_a, pax_n, total, canal")
        .gte("fecha", start)
        .lte("fecha", end)
        .neq("estado", "cancelado")
        .neq("tipo", "A CONSUMO"),
      supabase.from("eventos")
        .select("id, nombre, fecha, vendedor, pax, valor, pasadias_org")
        .gte("fecha", start)
        .lte("fecha", end)
        .eq("stage", "Confirmado"),
    ]);

    setVendedores(usrs || []);
    setMetasDB(metas || []);
    setRawReservas(reservas || []);
    setRawEventos(eventos || []);

    // Aggregate reservas: split individual vs grupo
    const resMap = {};   // pasadías individuales
    const gruResMap = {}; // pasadías de grupo (canal ILIKE 'grupo')
    for (const r of (reservas || [])) {
      const isGrupo = (r.canal || "").toLowerCase() === "grupo";
      const k = r.vendedor || "Sin asignar";
      if (isGrupo) {
        if (!gruResMap[k]) gruResMap[k] = { vendedor: k, pasadias: 0, ingresos: 0 };
        gruResMap[k].pasadias += (r.pax_a || 0) + (r.pax_n || 0);
        gruResMap[k].ingresos += (r.total || 0);
      } else {
        if (!resMap[k]) resMap[k] = { vendedor: k, pasadias: 0, ingresos: 0 };
        resMap[k].pasadias += (r.pax_a || 0) + (r.pax_n || 0);
        resMap[k].ingresos += (r.total || 0);
      }
    }
    setReservasData(Object.values(resMap));

    const PRECIO_MUELLE = 18000;
    // Aggregate eventos + grupo reservas into eventosData
    const evMap = {};
    for (const e of (eventos || [])) {
      const k = e.vendedor || "Sin asignar";
      if (!evMap[k]) evMap[k] = { vendedor: k, grupos: 0, ingresos: 0 };
      evMap[k].grupos += 1;
      // Subtract Impuesto Muelle from ingresos — it's a tax, not a sale
      const muelleTotal = (e.pasadias_org || [])
        .filter(p => p.tipo === "Impuesto Muelle")
        .reduce((s, p) => s + (Number(p.personas) || 0) * PRECIO_MUELLE, 0);
      evMap[k].ingresos += Math.max(0, (e.valor || 0) - muelleTotal);
    }
    // Add grupo reservas pax/ingresos into eventosData
    for (const r of Object.values(gruResMap)) {
      const k = r.vendedor;
      if (!evMap[k]) evMap[k] = { vendedor: k, grupos: 0, ingresos: 0 };
      evMap[k].grupos += r.pasadias; // count pasadías de grupos as metric
      evMap[k].ingresos += r.ingresos;
    }
    setEventosData(Object.values(evMap));

    setLoading(false);
  }, [periodo]);

  useEffect(() => { load(); }, [load]);

  // ── Sync draft from DB ────────────────────────────────────────────────────────

  useEffect(() => {
    const d = {};
    for (const depto of DEPTOS) {
      const deptRow = metasDB.find(m => m.departamento === depto.key && m.tipo === "departamento");
      d[`${depto.key}::__dept__`] = {
        metric:   deptRow?.meta_pasadias || 0,
        ingresos: deptRow?.meta_ingresos || 0,
      };
      for (const v of (vendedores || [])) {
        const vm = metasDB.find(m => m.departamento === depto.key && m.tipo === "vendedor" && m.vendedor_nombre === v.nombre);
        d[`${depto.key}::${v.nombre}`] = {
          metric:   vm?.meta_pasadias || 0,
          ingresos: vm?.meta_ingresos || 0,
        };
      }
    }
    setDraft(d);
  }, [metasDB, vendedores]);

  // ── Computed real totals ──────────────────────────────────────────────────────

  const reals = useMemo(() => {
    const totalPas = reservasData.reduce((s, r) => ({ metric: s.metric + r.pasadias, ingresos: s.ingresos + r.ingresos }), { metric: 0, ingresos: 0 });
    const totalGru = eventosData.reduce((s, e) => ({ metric: s.metric + e.grupos, ingresos: s.ingresos + e.ingresos }), { metric: 0, ingresos: 0 });
    return { pasadias: totalPas, grupos: totalGru };
  }, [reservasData, eventosData]);

  const metasSummary = useMemo(() => {
    const out = {};
    for (const depto of DEPTOS) {
      const deptRow = metasDB.find(m => m.departamento === depto.key && m.tipo === "departamento");
      out[depto.key] = {
        metric:   deptRow?.meta_pasadias || 0,
        ingresos: deptRow?.meta_ingresos || 0,
      };
    }
    return out;
  }, [metasDB]);

  // Rankings per dept
  const rankings = useMemo(() => {
    const pasVendedores = vendedores.filter(v => v.dept_ventas === "pasadias");
    const gruVendedores = vendedores.filter(v => v.dept_ventas === "grupos");

    const pasRanking = pasVendedores.map(v => {
      const rData = reservasData.find(r => r.vendedor === v.nombre) || { pasadias: 0, ingresos: 0 };
      const mRow  = metasDB.find(m => m.departamento === "pasadias" && m.tipo === "vendedor" && m.vendedor_nombre === v.nombre);
      return {
        nombre: v.nombre,
        real: { metric: rData.pasadias, ingresos: rData.ingresos },
        meta: { metric: mRow?.meta_pasadias || 0, ingresos: mRow?.meta_ingresos || 0 },
      };
    }).sort((a, b) => b.real.metric - a.real.metric || b.real.ingresos - a.real.ingresos);

    const gruRanking = gruVendedores.map(v => {
      const eData = eventosData.find(e => e.vendedor === v.nombre) || { grupos: 0, ingresos: 0 };
      const mRow  = metasDB.find(m => m.departamento === "grupos" && m.tipo === "vendedor" && m.vendedor_nombre === v.nombre);
      return {
        nombre: v.nombre,
        real: { metric: eData.grupos, ingresos: eData.ingresos },
        meta: { metric: mRow?.meta_pasadias || 0, ingresos: mRow?.meta_ingresos || 0 },
      };
    }).sort((a, b) => b.real.metric - a.real.metric || b.real.ingresos - a.real.ingresos);

    return { pasadias: pasRanking, grupos: gruRanking };
  }, [vendedores, reservasData, eventosData, metasDB]);

  // ── Draft change ──────────────────────────────────────────────────────────────

  function handleDraftChange(deptoKey, entityKey, field, val) {
    const k = `${deptoKey}::${entityKey}`;
    setDraft(d => ({ ...d, [k]: { ...(d[k] || {}), [field]: val } }));
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!supabase) return;
    setSaving(true);
    const upserts = [];

    for (const depto of DEPTOS) {
      // Dept row
      const existingDept = metasDB.find(m => m.departamento === depto.key && m.tipo === "departamento");
      const dd = draft[`${depto.key}::__dept__`] || {};
      upserts.push({
        id:              existingDept?.id || `meta_${nanoid(12)}`,
        tipo:            "departamento",
        departamento:    depto.key,
        vendedor_nombre: "",
        periodo,
        meta_pasadias:   Number(dd.metric)   || 0,
        meta_ingresos:   Number(dd.ingresos) || 0,
        updated_at:      new Date().toISOString(),
      });

      // Vendor rows — only for vendedores belonging to this dept
      for (const v of vendedores.filter(v => v.dept_ventas === depto.key)) {
        const existingV = metasDB.find(m => m.departamento === depto.key && m.tipo === "vendedor" && m.vendedor_nombre === v.nombre);
        const vd = draft[`${depto.key}::${v.nombre}`] || {};
        upserts.push({
          id:              existingV?.id || `meta_${nanoid(12)}`,
          tipo:            "vendedor",
          departamento:    depto.key,
          vendedor_nombre: v.nombre,
          periodo,
          meta_pasadias:   Number(vd.metric)   || 0,
          meta_ingresos:   Number(vd.ingresos) || 0,
          updated_at:      new Date().toISOString(),
        });
      }
    }

    const { error } = await supabase.from("metas").upsert(upserts, { onConflict: "id" });
    setSaving(false);
    if (!error) {
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
      await load();
    } else {
      console.error("Error guardando metas:", error);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const TABS = [
    { key: "resumen",    label: "Resumen"      },
    { key: "vendedores", label: "Por Vendedor" },
    ...(canConfig ? [{ key: "config", label: "⚙ Configurar" }] : []),
  ];

  const isCurrentMonth = periodo === currentPeriodo();

  return (
    <div style={{ padding: isMobile ? "16px 12px" : "24px 28px", fontFamily: "'Inter','Segoe UI',sans-serif", color: B.white, minHeight: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
        <div>
          <h2 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: isMobile ? 24 : 30, fontWeight: 700, margin: 0 }}>
            🎯 Metas Comerciales
          </h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Venta Pasadías · Grupos & Eventos
          </div>
        </div>

        {/* Period nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setPeriodo(prevPeriodo(periodo))} style={{
            background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white,
            width: 34, height: 34, borderRadius: 8, cursor: "pointer", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>‹</button>
          <div style={{
            background: B.navyMid, border: `1px solid ${B.navyLight}`,
            borderRadius: 8, padding: "6px 16px", fontSize: 14, fontWeight: 600,
            minWidth: 160, textAlign: "center",
          }}>
            {periodoLabel(periodo)}
            {isCurrentMonth && <span style={{ fontSize: 10, color: B.success, marginLeft: 6 }}>● actual</span>}
          </div>
          <button onClick={() => setPeriodo(nextPeriodo(periodo))} style={{
            background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white,
            width: 34, height: 34, borderRadius: 8, cursor: "pointer", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>›</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: B.navyMid, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: isMobile ? "7px 12px" : "7px 20px", borderRadius: 7, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, transition: "all 0.15s",
            background: tab === t.key ? B.sky : "transparent",
            color: tab === t.key ? B.navy : "rgba(255,255,255,0.5)",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 80, color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Cargando...</div>
      ) : tab === "resumen" ? (
        <TabResumen reals={reals} metas={metasSummary} rawReservas={rawReservas} rawEventos={rawEventos} isMobile={isMobile} />
      ) : tab === "vendedores" ? (
        <TabVendedores rankings={rankings} />
      ) : (
        <TabConfig
          vendedores={vendedores}
          draft={draft}
          onChange={handleDraftChange}
          saving={saving}
          savedOk={savedOk}
          onSave={handleSave}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
