// Módulo Monitor de Edge Functions
// =============================================================
// Para super_admin / contabilidad / auditor.
// Permite ver: catálogo completo de edge functions, su salud actual
// (errores 7d, indicadores indirectos como loggro sync errors),
// historial de invocaciones logueadas, y runbook por función.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive";
import {
  pagePadding, cardPadding, sectionCard, tableWrapper,
  inputStyle, btnPrimary, btnSecondary,
  flexRow, labelStyle, T, S, TOUCH_TARGET,
} from "../lib/responsive";

const fmtDateTime = s => s ? new Date(s).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—";

const SALUD_TONE = {
  ok:        { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.4)",  fg: "#86efac", icon: "✅" },
  warning:   { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", fg: "#fbbf24", icon: "⚠️" },
  critico:   { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.4)",  fg: "#fca5a5", icon: "🚨" },
  sin_datos: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)", fg: "#94a3b8", icon: "—" },
};

const CATEGORIA_COLOR = {
  payments: "#635BFF",
  sync:     "#F59E0B",
  comms:    "#0078FF",
  tracking: "#94a3b8",
  ops:      "#3ECF8E",
  ai:       "#A855F7",
  ext_api:  "#0DD292",
};

export default function EdgeFunctions() {
  const { isMobile } = useBreakpoint();
  const [tab, setTab] = useState("salud");
  const [health, setHealth] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroCat, setFiltroCat] = useState("todas");
  const [filtroSalud, setFiltroSalud] = useState("todas");
  const [selectedFn, setSelectedFn] = useState(null);

  async function loadAll() {
    setLoading(true);
    const [{ data: h }, { data: l }] = await Promise.all([
      supabase.from("edge_function_health").select("*").order("criticidad").order("function_name"),
      supabase.from("edge_function_log").select("*").order("invoked_at", { ascending: false }).limit(200),
    ]);
    setHealth(h || []);
    setLogs(l || []);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  const filtered = useMemo(() => health.filter(h => {
    if (filtroCat !== "todas" && h.categoria !== filtroCat) return false;
    if (filtroSalud !== "todas" && h.salud !== filtroSalud) return false;
    return true;
  }), [health, filtroCat, filtroSalud]);

  const kpis = useMemo(() => {
    const acc = { total: health.length, ok: 0, warning: 0, critico: 0, sin_datos: 0, errores_7d: 0, errors_indirectos: 0 };
    health.forEach(h => {
      acc[h.salud] = (acc[h.salud] || 0) + 1;
      acc.errores_7d         += (h.errors_7d || 0) + (h.timeouts_7d || 0);
      acc.errors_indirectos  += (h.errors_indirectos_7d || 0) + (h.huerfanos_indirectos_7d || 0);
    });
    return acc;
  }, [health]);

  return (
    <div style={{ ...pagePadding({ isMobile }), color: B.fg }}>
      <div style={{ marginBottom: S.lg }}>
        <h1 style={{ fontSize: T.h1, margin: 0, fontWeight: 700 }}>Edge Functions</h1>
        <p style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 6 }}>
          Inventario y salud de funciones serverless. Errores, timeouts y latencias últimos 7 días.
        </p>
      </div>

      {kpis.critico > 0 && (
        <div style={{ padding: 14, borderRadius: 12, marginBottom: S.md, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)" }}>
          <div style={{ fontWeight: 700, color: "#fca5a5" }}>🚨 {kpis.critico} función(es) en estado crítico</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: S.md, marginBottom: S.lg }}>
        <KPI label="Total catalogadas" value={kpis.total} tone="neutral" />
        <KPI label="OK" value={kpis.ok} tone="ok" subtitle={`${kpis.sin_datos} sin datos`} />
        <KPI label="Warnings" value={kpis.warning} tone={kpis.warning ? "warn" : "ok"} />
        <KPI label="Errores indirectos 7d" value={kpis.errors_indirectos} subtitle="Loggro huérfanos + sync errors" tone={kpis.errors_indirectos ? "danger" : "ok"} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${B.border}`, marginBottom: S.lg, overflowX: "auto" }}>
        {[
          ["salud",     "Salud"],
          ["logs",      `Logs (${logs.length})`],
          ["catalogo",  "Catálogo"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "10px 16px", background: "transparent", border: 0,
            borderBottom: tab === k ? `2px solid ${B.brand}` : "2px solid transparent",
            color: tab === k ? B.brand : B.fgMuted, fontWeight: 600,
            cursor: "pointer", fontSize: T.sm, minHeight: TOUCH_TARGET, whiteSpace: "nowrap",
          }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center" }}>Cargando…</div>
      ) : tab === "salud" ? (
        <Salud
          isMobile={isMobile} filtered={filtered}
          filtroCat={filtroCat} setFiltroCat={setFiltroCat}
          filtroSalud={filtroSalud} setFiltroSalud={setFiltroSalud}
          onSelect={(h) => setSelectedFn(h)}
        />
      ) : tab === "logs" ? (
        <Logs isMobile={isMobile} logs={logs} />
      ) : (
        <Catalogo isMobile={isMobile} health={health} />
      )}

      {selectedFn && (
        <DetailModal isMobile={isMobile} fn={selectedFn} logs={logs} onClose={() => setSelectedFn(null)} />
      )}
    </div>
  );
}

const td = { padding: "10px 12px", verticalAlign: "top" };

function Salud({ isMobile, filtered, filtroCat, setFiltroCat, filtroSalud, setFiltroSalud, onSelect }) {
  return (
    <>
      <div style={{ ...flexRow({ isMobile, gap: 10 }), marginBottom: S.md, flexWrap: "wrap" }}>
        <div style={{ minWidth: 160 }}>
          <label style={labelStyle}>Categoría</label>
          <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={inputStyle({ isMobile })}>
            <option value="todas">Todas</option>
            {Object.keys(CATEGORIA_COLOR).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={labelStyle}>Salud</label>
          <select value={filtroSalud} onChange={e => setFiltroSalud(e.target.value)} style={inputStyle({ isMobile })}>
            <option value="todas">Todas</option>
            <option value="critico">Crítico</option>
            <option value="warning">Warning</option>
            <option value="ok">OK</option>
            <option value="sin_datos">Sin datos</option>
          </select>
        </div>
      </div>

      <div style={tableWrapper}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
          <thead style={{ background: "rgba(255,255,255,0.04)" }}>
            <tr>
              {["Salud", "Función", "Cat", "Criticidad", "Invs 7d", "Errores 7d", "Indir.", "Latencia", "Última inv"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(h => {
              const t = SALUD_TONE[h.salud] || SALUD_TONE.sin_datos;
              return (
                <tr key={h.function_name}
                  onClick={() => onSelect(h)}
                  style={{ borderBottom: `1px solid ${B.border}`, cursor: "pointer" }}>
                  <td style={td}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
                    }}>{t.icon} {h.salud}</span>
                  </td>
                  <td style={td}>
                    <code style={{ fontSize: 12, color: B.fg }}>{h.function_name}</code>
                    <div style={{ fontSize: 11, color: B.fgMuted, marginTop: 2 }}>{h.descripcion}</div>
                  </td>
                  <td style={td}>
                    <span style={{
                      padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: (CATEGORIA_COLOR[h.categoria] || "#888") + "22",
                      color: CATEGORIA_COLOR[h.categoria] || "#888",
                    }}>{h.categoria}</span>
                  </td>
                  <td style={td}>{h.criticidad}</td>
                  <td style={td}>{h.invs_7d}</td>
                  <td style={{ ...td, color: h.errors_7d ? "#fca5a5" : B.fg, fontWeight: h.errors_7d ? 700 : 400 }}>
                    {h.errors_7d + (h.timeouts_7d || 0)}
                    {h.timeouts_7d > 0 && <div style={{ fontSize: 10, color: B.fgMuted }}>{h.timeouts_7d} timeout</div>}
                  </td>
                  <td style={{ ...td, color: h.errors_indirectos_7d || h.huerfanos_indirectos_7d ? "#fbbf24" : B.fgMuted }}>
                    {(h.errors_indirectos_7d || 0) + (h.huerfanos_indirectos_7d || 0)}
                  </td>
                  <td style={td}>{h.avg_ms_7d ? `${h.avg_ms_7d}ms` : "—"}</td>
                  <td style={{ ...td, fontSize: T.xs, color: B.fgMuted }}>{fmtDateTime(h.ultima_invocacion)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Logs({ isMobile, logs }) {
  if (!logs.length) return (
    <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center", color: B.fgMuted }}>
      Aún no hay invocaciones logueadas. Conforme las llamadas usen <code>invokeFn()</code> de <code>src/lib/edgeFn.js</code>, aparecerán acá.
    </div>
  );
  return (
    <div style={tableWrapper}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
        <thead style={{ background: "rgba(255,255,255,0.04)" }}>
          <tr>
            {["Fecha", "Función", "Status", "HTTP", "Duración", "Caller", "Error"].map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map(l => {
            const isErr = l.status === "error" || l.status === "timeout";
            return (
              <tr key={l.id} style={{ borderBottom: `1px solid ${B.border}`, background: isErr ? "rgba(239,68,68,0.04)" : "transparent" }}>
                <td style={td}>{fmtDateTime(l.invoked_at)}</td>
                <td style={td}><code style={{ fontSize: 12 }}>{l.function_name}</code></td>
                <td style={td}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: isErr ? "rgba(239,68,68,0.15)" : l.status === "pending" ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)",
                    color: isErr ? "#fca5a5" : l.status === "pending" ? "#fbbf24" : "#86efac",
                  }}>{l.status}</span>
                </td>
                <td style={td}>{l.http_status || "—"}</td>
                <td style={td}>{l.duration_ms ? `${l.duration_ms}ms` : "—"}</td>
                <td style={{ ...td, fontSize: T.xs, color: B.fgMuted }}>{l.caller || "—"}</td>
                <td style={{ ...td, color: "#fca5a5", maxWidth: 280, fontSize: T.xs }}>{l.error_message || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Catalogo({ isMobile, health }) {
  const porCategoria = {};
  health.forEach(h => {
    (porCategoria[h.categoria] = porCategoria[h.categoria] || []).push(h);
  });
  return (
    <div style={{ display: "grid", gap: S.md }}>
      {Object.entries(porCategoria).map(([cat, items]) => (
        <div key={cat} style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }) }}>
          <h3 style={{ marginTop: 0, color: CATEGORIA_COLOR[cat] || B.fg }}>
            {cat} <span style={{ fontSize: 12, color: B.fgMuted, fontWeight: 400 }}>({items.length})</span>
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            {items.map(h => (
              <div key={h.function_name} style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                <code style={{ fontSize: 12, fontWeight: 700 }}>{h.function_name}</code>
                <div style={{ fontSize: 11, color: B.fgMuted, marginTop: 2 }}>{h.descripcion}</div>
                <div style={{ fontSize: 10, color: B.fgMuted, marginTop: 4 }}>
                  {h.trigger_tipo} · {h.criticidad}{h.proveedor ? ` · ${h.proveedor}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KPI({ label, value, subtitle, tone = "neutral" }) {
  const colors = {
    ok:      { border: "rgba(34,197,94,0.3)",  bg: "rgba(34,197,94,0.08)",  fg: "#86efac" },
    warn:    { border: "rgba(245,158,11,0.3)", bg: "rgba(245,158,11,0.08)", fg: "#fbbf24" },
    danger:  { border: "rgba(239,68,68,0.3)",  bg: "rgba(239,68,68,0.08)",  fg: "#fca5a5" },
    neutral: { border: "rgba(255,255,255,0.1)", bg: "rgba(255,255,255,0.03)", fg: "#fff" },
  }[tone];
  return (
    <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${colors.border}`, background: colors.bg }}>
      <div style={{ fontSize: T.xs, color: B.fgMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: T.h2, fontWeight: 800, color: colors.fg, marginTop: 4 }}>{value}</div>
      {subtitle && <div style={{ fontSize: T.xs, color: B.fgMuted, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function DetailModal({ isMobile, fn, logs, onClose }) {
  const myLogs = logs.filter(l => l.function_name === fn.function_name).slice(0, 20);
  const t = SALUD_TONE[fn.salud] || SALUD_TONE.sin_datos;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#0F1A1F", borderRadius: 14, padding: 24, maxWidth: 720, width: "100%",
        maxHeight: "85vh", overflowY: "auto", color: B.fg,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <code style={{ fontSize: 16, fontWeight: 700 }}>{fn.function_name}</code>
            <div style={{ fontSize: 12, color: B.fgMuted, marginTop: 4 }}>{fn.descripcion}</div>
          </div>
          <span style={{
            padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700,
            background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
          }}>{t.icon} {fn.salud}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
          <Mini label="Categoría" value={fn.categoria} />
          <Mini label="Criticidad" value={fn.criticidad} />
          <Mini label="Trigger" value={fn.trigger_tipo || "—"} />
          <Mini label="Proveedor" value={fn.proveedor || "—"} />
          <Mini label="Invocaciones 7d" value={fn.invs_7d || 0} />
          <Mini label="Errores 7d" value={(fn.errors_7d || 0) + (fn.timeouts_7d || 0)} />
        </div>

        {(fn.errors_indirectos_7d > 0 || fn.huerfanos_indirectos_7d > 0) && (
          <div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
            <div style={{ color: "#fbbf24", fontWeight: 600, fontSize: 13 }}>⚠️ Indicadores indirectos (últimos 7d)</div>
            <div style={{ fontSize: 12, color: B.fgMuted, marginTop: 4 }}>
              {fn.errors_indirectos_7d > 0 && <div>· {fn.errors_indirectos_7d} sync con status='error'</div>}
              {fn.huerfanos_indirectos_7d > 0 && <div>· {fn.huerfanos_indirectos_7d} rows huérfanos sin sync_id</div>}
            </div>
          </div>
        )}

        <h4 style={{ marginTop: 18, marginBottom: 6 }}>Últimas 20 invocaciones registradas</h4>
        {myLogs.length === 0 ? (
          <div style={{ fontSize: 12, color: B.fgMuted }}>Aún no hay logs explícitos para esta función.</div>
        ) : (
          <div style={{ ...tableWrapper, maxHeight: 280 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.xs }}>
              <tbody>
                {myLogs.map(l => (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${B.border}` }}>
                    <td style={{ padding: "6px 8px" }}>{fmtDateTime(l.invoked_at)}</td>
                    <td style={{ padding: "6px 8px", color: l.status === "ok" ? "#86efac" : "#fca5a5", fontWeight: 600 }}>{l.status}</td>
                    <td style={{ padding: "6px 8px" }}>{l.duration_ms ? `${l.duration_ms}ms` : "—"}</td>
                    <td style={{ padding: "6px 8px", maxWidth: 280, color: "#fca5a5" }}>{l.error_message || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={onClose} style={{
          marginTop: 16, padding: "10px 18px", background: B.brand, color: "#fff",
          border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 600,
        }}>Cerrar</button>
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div style={{ padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 10, color: B.fgMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
