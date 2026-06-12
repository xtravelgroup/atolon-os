// Módulo "Cumplimiento DIAN / Facturación Electrónica"
// =============================================================
// La facturación electrónica está delegada en:
//   - Loggro Restrobar : F&B (consumo eventos + Pool Service)
//   - Loggro Pyme      : Hospedaje, eventos, OCs
//
// Este módulo gestiona los CONTROLES de delegación que un auditor pide:
//   1. Resoluciones DIAN vigentes (registro + alertas de expiración)
//   2. Monitor de sincronización (qué de Atolón llegó a Loggro)
//   3. Reconciliación mensual cobrado vs facturado
//   4. Export CSV para evidence pack

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive";
import { logAccion } from "../lib/logAccion";
import {
  pagePadding, cardPadding, sectionCard, tableWrapper,
  inputStyle, btnPrimary, btnSecondary, modalOverlay, modalBox,
  flexRow, labelStyle, T, S, TOUCH_TARGET,
} from "../lib/responsive";

const fmt$    = n => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fmtDate = s => s ? new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const ESTADO_TONE = {
  sincronizado: { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.4)",  fg: "#86efac" },
  huerfano:     { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.4)",  fg: "#fca5a5" },
  error:        { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.4)",  fg: "#fca5a5" },
  pendiente:    { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", fg: "#fbbf24" },
  no_aplica:    { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.3)", fg: "#94a3b8" },
};

export default function DianCompliance() {
  const { isMobile } = useBreakpoint();
  const [tab, setTab]                 = useState("dashboard");
  const [resoluciones, setResoluciones] = useState([]);
  const [unified, setUnified]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showNueva, setShowNueva]     = useState(false);
  const [editResol, setEditResol]     = useState(null);

  async function loadAll() {
    setLoading(true);
    const [{ data: rs }, { data: us }] = await Promise.all([
      supabase.from("dian_resoluciones").select("*").order("activa", { ascending: false }).order("fecha_vigencia_hasta", { ascending: false }),
      supabase.from("loggro_sync_unified").select("*").order("created_at", { ascending: false }).limit(5000),
    ]);
    setResoluciones(rs || []);
    setUnified(us || []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  // KPIs por ambiente
  const summary = useMemo(() => {
    const acc = { restrobar: { ok: 0, huerf: 0, err: 0, monto_ok: 0, monto_huerf: 0 },
                  pyme:      { ok: 0, huerf: 0, err: 0, monto_ok: 0, monto_huerf: 0 } };
    unified.forEach(r => {
      const env = acc[r.loggro_environment]; if (!env) return;
      if (r.estado_sync === "sincronizado") { env.ok++; env.monto_ok += Number(r.monto) || 0; }
      else if (r.estado_sync === "huerfano") { env.huerf++; env.monto_huerf += Number(r.monto) || 0; }
      else if (r.estado_sync === "error")    { env.err++;   env.monto_huerf += Number(r.monto) || 0; }
    });
    return acc;
  }, [unified]);

  const resVigentes = resoluciones.filter(r => r.activa && new Date(r.fecha_vigencia_hasta) >= new Date());
  const resExpirando = resoluciones.filter(r => {
    if (!r.activa) return false;
    const dias = (new Date(r.fecha_vigencia_hasta).getTime() - Date.now()) / 86400000;
    return dias >= 0 && dias <= 60;
  });

  return (
    <div style={{ ...pagePadding({ isMobile }), color: B.fg }}>
      <div style={{ marginBottom: S.lg }}>
        <h1 style={{ fontSize: T.h1, margin: 0, fontWeight: 700 }}>Cumplimiento DIAN (Facturación Electrónica)</h1>
        <p style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 6 }}>
          La facturación electrónica está delegada en Loggro. Acá se monitorea que toda transacción de Atolón haya llegado a su Loggro correcto.
        </p>
      </div>

      {/* Banner de delegación */}
      <div style={{
        padding: 14, borderRadius: 12, marginBottom: S.lg,
        background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.3)",
      }}>
        <div style={{ fontWeight: 700, color: "#7dd3fc", marginBottom: 4 }}>📋 Delegación de facturación</div>
        <div style={{ fontSize: T.sm, color: B.fgMuted, lineHeight: 1.5 }}>
          • <b>Loggro Restrobar</b> — F&B: consumo de eventos (open bar, banquetes), Pool Service.<br />
          • <b>Loggro Pyme</b> — Hospedaje, eventos, órdenes de compra, hotelería.<br />
          Atolón OS NO emite facturas; solo orquesta el envío. Un huérfano = transacción cobrada sin facturar.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${B.border}`, marginBottom: S.lg, overflowX: "auto" }}>
        {[
          ["dashboard",     "Dashboard"],
          ["sincronizacion", `Sync (${unified.filter(u => u.estado_sync === "huerfano" || u.estado_sync === "error").length})`],
          ["resoluciones",  `Resoluciones (${resVigentes.length})`],
          ["reconciliacion", "Reconciliación"],
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
      ) : tab === "dashboard" ? (
        <Dashboard isMobile={isMobile} summary={summary} resVigentes={resVigentes} resExpirando={resExpirando} onGoTo={setTab} />
      ) : tab === "sincronizacion" ? (
        <SyncMonitor isMobile={isMobile} unified={unified} />
      ) : tab === "resoluciones" ? (
        <Resoluciones
          isMobile={isMobile} resoluciones={resoluciones}
          onNueva={() => setShowNueva(true)}
          onEdit={(r) => setEditResol(r)}
        />
      ) : (
        <Reconciliacion isMobile={isMobile} unified={unified} />
      )}

      {(showNueva || editResol) && (
        <ResolucionModal
          isMobile={isMobile}
          resolucion={editResol}
          onClose={() => { setShowNueva(false); setEditResol(null); }}
          onSaved={() => { setShowNueva(false); setEditResol(null); loadAll(); }}
        />
      )}
    </div>
  );
}

const td = { padding: "10px 12px", verticalAlign: "top" };

function Dashboard({ isMobile, summary, resVigentes, resExpirando, onGoTo }) {
  return (
    <>
      {/* Resoluciones expirando soon */}
      {resExpirando.length > 0 && (
        <div style={{
          padding: 14, borderRadius: 12, marginBottom: S.md,
          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.4)",
        }}>
          <div style={{ fontWeight: 700, color: "#fbbf24" }}>⚠️ Resoluciones por vencer ({resExpirando.length})</div>
          <div style={{ fontSize: T.sm, color: B.fgMuted, marginTop: 4 }}>
            Algunas resoluciones DIAN vencen en menos de 60 días. Gestioná renovación con Loggro.
            <button onClick={() => onGoTo("resoluciones")} style={{ marginLeft: 8, background: "transparent", border: 0, color: "#fbbf24", textDecoration: "underline", cursor: "pointer" }}>Ver →</button>
          </div>
        </div>
      )}

      {/* KPIs Restrobar */}
      <h3 style={{ margin: "16px 0 8px", fontSize: T.base }}>🍽 Loggro Restrobar (F&B)</h3>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: S.md, marginBottom: S.lg }}>
        <KPI label="Sincronizado" value={summary.restrobar.ok} subtitle={fmt$(summary.restrobar.monto_ok)} tone="ok" />
        <KPI label="Huérfanos" value={summary.restrobar.huerf} subtitle={fmt$(summary.restrobar.monto_huerf)} tone={summary.restrobar.huerf ? "danger" : "ok"} />
        <KPI label="Errores" value={summary.restrobar.err} tone={summary.restrobar.err ? "danger" : "ok"} />
        <KPI label="Resoluciones vigentes" value={resVigentes.filter(r => r.loggro_environment === "restrobar").length} tone={resVigentes.filter(r => r.loggro_environment === "restrobar").length ? "ok" : "warn"} />
      </div>

      {/* KPIs Pyme */}
      <h3 style={{ margin: "16px 0 8px", fontSize: T.base }}>🏢 Loggro Pyme (Hospedaje + OCs)</h3>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: S.md, marginBottom: S.lg }}>
        <KPI label="Sincronizado" value={summary.pyme.ok} subtitle={fmt$(summary.pyme.monto_ok)} tone="ok" />
        <KPI label="Huérfanos" value={summary.pyme.huerf} subtitle={fmt$(summary.pyme.monto_huerf)} tone={summary.pyme.huerf ? "danger" : "ok"} />
        <KPI label="Errores" value={summary.pyme.err} tone={summary.pyme.err ? "danger" : "ok"} />
        <KPI label="Resoluciones vigentes" value={resVigentes.filter(r => r.loggro_environment === "pyme").length} tone={resVigentes.filter(r => r.loggro_environment === "pyme").length ? "ok" : "warn"} />
      </div>

      {(summary.restrobar.huerf + summary.pyme.huerf + summary.restrobar.err + summary.pyme.err) === 0 ? (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center", color: "#86efac" }}>
          ✅ Sin huérfanos ni errores de sync. Todas las transacciones están en Loggro.
        </div>
      ) : null}
    </>
  );
}

function SyncMonitor({ isMobile, unified }) {
  const [filtroEstado, setFiltroEstado] = useState("huerfano");
  const [filtroFuente, setFiltroFuente] = useState("todas");
  const [filtroEnv, setFiltroEnv]       = useState("todos");

  const filtered = useMemo(() => {
    return unified.filter(r => {
      if (filtroEstado !== "todos" && r.estado_sync !== filtroEstado) return false;
      if (filtroFuente !== "todas" && r.fuente !== filtroFuente) return false;
      if (filtroEnv    !== "todos" && r.loggro_environment !== filtroEnv) return false;
      return true;
    }).slice(0, 500);  // cap render
  }, [unified, filtroEstado, filtroFuente, filtroEnv]);

  function exportCSV() {
    const rows = [["Fuente", "Loggro env", "Row ID", "Doc padre", "Estado", "Loggro ref", "Monto", "Created", "Error"]];
    filtered.forEach(r => rows.push([
      r.fuente, r.loggro_environment, r.row_id, r.doc_padre_id || "",
      r.estado_sync, r.loggro_ref || "", r.monto, r.created_at, r.sync_error || ""
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `loggro-sync-${filtroEstado}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <div style={{ ...flexRow({ isMobile, gap: 10 }), marginBottom: S.md, flexWrap: "wrap" }}>
        <div style={{ minWidth: 160 }}>
          <label style={labelStyle}>Estado</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={inputStyle({ isMobile })}>
            <option value="huerfano">Huérfanos</option>
            <option value="error">Errores</option>
            <option value="pendiente">Pendientes</option>
            <option value="sincronizado">Sincronizados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={labelStyle}>Fuente</label>
          <select value={filtroFuente} onChange={e => setFiltroFuente(e.target.value)} style={inputStyle({ isMobile })}>
            <option value="todas">Todas</option>
            <option value="eventos_consumo_openbar">Consumo eventos</option>
            <option value="pool_service_pedidos">Pool Service</option>
            <option value="ordenes_compra">OCs</option>
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={labelStyle}>Ambiente Loggro</label>
          <select value={filtroEnv} onChange={e => setFiltroEnv(e.target.value)} style={inputStyle({ isMobile })}>
            <option value="todos">Ambos</option>
            <option value="restrobar">Restrobar</option>
            <option value="pyme">Pyme</option>
          </select>
        </div>
        <div style={{ marginLeft: isMobile ? 0 : "auto", alignSelf: "flex-end" }}>
          <button onClick={exportCSV} style={btnSecondary({ isMobile })}>📥 Exportar CSV</button>
        </div>
      </div>

      <div style={{ fontSize: T.xs, color: B.fgMuted, marginBottom: 8 }}>
        Mostrando {filtered.length} de {unified.filter(r => filtroEstado === "todos" || r.estado_sync === filtroEstado).length} {filtered.length >= 500 ? "(cap 500 — usá filtros más estrictos)" : ""}
      </div>

      <div style={tableWrapper}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
          <thead style={{ background: "rgba(255,255,255,0.04)" }}>
            <tr>
              {["Fuente", "Loggro", "Row ID", "Estado", "Loggro ref", "Monto", "Creado", "Error"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const t = ESTADO_TONE[r.estado_sync] || ESTADO_TONE.no_aplica;
              return (
                <tr key={`${r.fuente}-${r.row_id}`} style={{ borderBottom: `1px solid ${B.border}` }}>
                  <td style={td}>{r.fuente.replace(/_/g, " ")}</td>
                  <td style={td}>{r.loggro_environment}</td>
                  <td style={td}><code style={{ fontSize: 11 }}>{r.row_id}</code></td>
                  <td style={td}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
                    }}>{r.estado_sync}</span>
                  </td>
                  <td style={td}>{r.loggro_ref || "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmt$(r.monto)}</td>
                  <td style={td}>{fmtDate(r.created_at)}</td>
                  <td style={{ ...td, color: "#fca5a5", maxWidth: 200, fontSize: T.xs }}>{r.sync_error || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Resoluciones({ isMobile, resoluciones, onNueva, onEdit }) {
  return (
    <>
      <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "space-between", alignItems: "center", marginBottom: S.md }}>
        <span style={{ color: B.fgMuted, fontSize: T.sm }}>Una resolución por (ambiente Loggro, tipo doc, prefijo)</span>
        <button onClick={onNueva} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff" }}>+ Nueva resolución</button>
      </div>

      {resoluciones.length === 0 ? (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center", color: B.fgMuted }}>
          No hay resoluciones registradas. Agregá las vigentes de Loggro Restrobar y Loggro Pyme.
        </div>
      ) : (
        <div style={tableWrapper}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
            <thead style={{ background: "rgba(255,255,255,0.04)" }}>
              <tr>
                {["Estado", "Ambiente", "Resolución", "Prefijo", "Rango", "Vigencia", "Tipo", ""].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resoluciones.map(r => {
                const vence = new Date(r.fecha_vigencia_hasta);
                const dias  = (vence.getTime() - Date.now()) / 86400000;
                const expirada = dias < 0;
                const expirando = dias >= 0 && dias <= 60;
                const tone = !r.activa ? "#94a3b8" : expirada ? "#fca5a5" : expirando ? "#fbbf24" : "#86efac";
                const tonebg = !r.activa ? "rgba(148,163,184,0.12)" : expirada ? "rgba(239,68,68,0.12)" : expirando ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)";
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${B.border}` }}>
                    <td style={td}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: tonebg, color: tone,
                      }}>{!r.activa ? "Inactiva" : expirada ? "Vencida" : expirando ? `${Math.ceil(dias)}d` : "Vigente"}</span>
                    </td>
                    <td style={td}><b>{r.loggro_environment}</b></td>
                    <td style={td}>
                      <div>{r.numero_resolucion}</div>
                      <div style={{ fontSize: 11, color: B.fgMuted }}>{fmtDate(r.fecha_resolucion)}</div>
                    </td>
                    <td style={td}>{r.prefijo}</td>
                    <td style={td}>{r.consecutivo_desde.toLocaleString()} → {r.consecutivo_hasta.toLocaleString()}</td>
                    <td style={td}>{fmtDate(r.fecha_vigencia_desde)} → {fmtDate(r.fecha_vigencia_hasta)}</td>
                    <td style={td}>{r.tipo_documento}</td>
                    <td style={td}>
                      <button onClick={() => onEdit(r)} style={{ background: "transparent", border: 0, color: B.brand, cursor: "pointer", fontSize: T.xs, textDecoration: "underline" }}>Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Reconciliacion({ isMobile, unified }) {
  // Agrupar por mes + fuente + estado
  const byMonth = useMemo(() => {
    const acc = {};
    unified.forEach(r => {
      const mes = r.created_at?.slice(0, 7) || "—";
      const key = `${mes}|${r.fuente}|${r.loggro_environment}`;
      if (!acc[key]) acc[key] = { mes, fuente: r.fuente, env: r.loggro_environment, sync_n: 0, sync_$: 0, huerf_n: 0, huerf_$: 0 };
      if (r.estado_sync === "sincronizado") { acc[key].sync_n++; acc[key].sync_$  += Number(r.monto) || 0; }
      else if (r.estado_sync === "huerfano" || r.estado_sync === "error") { acc[key].huerf_n++; acc[key].huerf_$ += Number(r.monto) || 0; }
    });
    return Object.values(acc).sort((a, b) => (b.mes || "").localeCompare(a.mes || ""));
  }, [unified]);

  function exportCSV() {
    const rows = [["Mes", "Fuente", "Loggro env", "Sync #", "Sync $", "Huérfano #", "Huérfano $", "% Captura"]];
    byMonth.forEach(r => {
      const total = r.sync_$ + r.huerf_$;
      const pct = total ? (r.sync_$ / total * 100).toFixed(1) : "—";
      rows.push([r.mes, r.fuente, r.env, r.sync_n, r.sync_$, r.huerf_n, r.huerf_$, pct]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `reconciliacion-loggro-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "space-between", alignItems: "center", marginBottom: S.md }}>
        <span style={{ color: B.fgMuted, fontSize: T.sm }}>Captura mensual: % cobrado en Atolón que llegó a Loggro</span>
        <button onClick={exportCSV} style={btnSecondary({ isMobile })}>📥 Exportar CSV</button>
      </div>

      <div style={tableWrapper}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
          <thead style={{ background: "rgba(255,255,255,0.04)" }}>
            <tr>
              {["Mes", "Fuente", "Loggro", "Sincronizado", "Huérfano", "% Captura"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byMonth.map((r, i) => {
              const total = r.sync_$ + r.huerf_$;
              const pct = total ? (r.sync_$ / total) * 100 : null;
              const pctColor = pct === null ? B.fg : pct >= 95 ? "#86efac" : pct >= 80 ? "#fbbf24" : "#fca5a5";
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${B.border}` }}>
                  <td style={td}>{r.mes}</td>
                  <td style={td}>{r.fuente.replace(/_/g, " ")}</td>
                  <td style={td}>{r.env}</td>
                  <td style={td}>{r.sync_n} · <span style={{ color: B.fgMuted }}>{fmt$(r.sync_$)}</span></td>
                  <td style={{ ...td, color: r.huerf_n ? "#fca5a5" : B.fg }}>
                    {r.huerf_n} · {fmt$(r.huerf_$)}
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: pctColor }}>{pct === null ? "—" : `${pct.toFixed(1)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
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

function ResolucionModal({ isMobile, resolucion, onClose, onSaved }) {
  const isEdit = !!resolucion;
  const [f, setF] = useState({
    loggro_environment:   resolucion?.loggro_environment   || "restrobar",
    numero_resolucion:    resolucion?.numero_resolucion    || "",
    fecha_resolucion:     resolucion?.fecha_resolucion     || "",
    prefijo:              resolucion?.prefijo              || "FE",
    consecutivo_desde:    resolucion?.consecutivo_desde    || 1,
    consecutivo_hasta:    resolucion?.consecutivo_hasta    || 1000000,
    fecha_vigencia_desde: resolucion?.fecha_vigencia_desde || "",
    fecha_vigencia_hasta: resolucion?.fecha_vigencia_hasta || "",
    tipo_documento:       resolucion?.tipo_documento       || "factura_venta",
    ambiente:             resolucion?.ambiente             || "produccion",
    notas:                resolucion?.notas                || "",
    activa:               resolucion?.activa               ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (!f.numero_resolucion.trim()) { setErr("Número de resolución obligatorio"); return; }
    if (!f.fecha_resolucion || !f.fecha_vigencia_desde || !f.fecha_vigencia_hasta) { setErr("Fechas obligatorias"); return; }
    if (Number(f.consecutivo_hasta) <= Number(f.consecutivo_desde)) { setErr("Consecutivo hasta debe ser mayor a desde"); return; }
    setSaving(true);
    const me = (await supabase.auth.getUser()).data?.user?.email?.toLowerCase();
    const payload = {
      ...f,
      consecutivo_desde: Number(f.consecutivo_desde),
      consecutivo_hasta: Number(f.consecutivo_hasta),
      registrada_por: me,
      updated_at: new Date().toISOString(),
    };
    let res;
    if (isEdit) res = await supabase.from("dian_resoluciones").update(payload).eq("id", resolucion.id);
    else        res = await supabase.from("dian_resoluciones").insert(payload);
    if (res.error) { setErr(res.error.message); setSaving(false); return; }
    logAccion(isEdit ? "dian_resol_editada" : "dian_resol_creada", { numero: f.numero_resolucion, env: f.loggro_environment });
    setSaving(false);
    onSaved();
  }

  return (
    <div style={modalOverlay}>
      <div style={modalBox({ isMobile, maxWidth: 600 })}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? "Editar resolución DIAN" : "Nueva resolución DIAN"}</h3>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Ambiente Loggro</label>
            <select value={f.loggro_environment} onChange={e => upd("loggro_environment", e.target.value)} style={inputStyle({ isMobile })}>
              <option value="restrobar">Loggro Restrobar (F&B)</option>
              <option value="pyme">Loggro Pyme (Hospedaje + OCs)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tipo de documento</label>
            <select value={f.tipo_documento} onChange={e => upd("tipo_documento", e.target.value)} style={inputStyle({ isMobile })}>
              <option value="factura_venta">Factura de venta</option>
              <option value="nota_credito">Nota crédito</option>
              <option value="nota_debito">Nota débito</option>
              <option value="pos">POS</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Número de resolución *</label>
            <input value={f.numero_resolucion} onChange={e => upd("numero_resolucion", e.target.value)} placeholder="18760000xxxxx" style={inputStyle({ isMobile })} />
          </div>
          <div>
            <label style={labelStyle}>Fecha de la resolución *</label>
            <input type="date" value={f.fecha_resolucion} onChange={e => upd("fecha_resolucion", e.target.value)} style={inputStyle({ isMobile })} />
          </div>
          <div>
            <label style={labelStyle}>Prefijo *</label>
            <input value={f.prefijo} onChange={e => upd("prefijo", e.target.value)} placeholder="FE / FACT / POS" style={inputStyle({ isMobile })} />
          </div>
          <div>
            <label style={labelStyle}>Ambiente</label>
            <select value={f.ambiente} onChange={e => upd("ambiente", e.target.value)} style={inputStyle({ isMobile })}>
              <option value="produccion">Producción</option>
              <option value="habilitacion">Habilitación</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Consecutivo desde *</label>
            <input type="number" value={f.consecutivo_desde} onChange={e => upd("consecutivo_desde", e.target.value)} style={inputStyle({ isMobile })} />
          </div>
          <div>
            <label style={labelStyle}>Consecutivo hasta *</label>
            <input type="number" value={f.consecutivo_hasta} onChange={e => upd("consecutivo_hasta", e.target.value)} style={inputStyle({ isMobile })} />
          </div>
          <div>
            <label style={labelStyle}>Vigencia desde *</label>
            <input type="date" value={f.fecha_vigencia_desde} onChange={e => upd("fecha_vigencia_desde", e.target.value)} style={inputStyle({ isMobile })} />
          </div>
          <div>
            <label style={labelStyle}>Vigencia hasta *</label>
            <input type="date" value={f.fecha_vigencia_hasta} onChange={e => upd("fecha_vigencia_hasta", e.target.value)} style={inputStyle({ isMobile })} />
          </div>
        </div>

        <label style={labelStyle}>Notas</label>
        <textarea value={f.notas} onChange={e => upd("notas", e.target.value)} rows={2}
          placeholder="Ej: Resolución renovada por Loggro el …"
          style={{ ...inputStyle({ isMobile }), resize: "vertical" }} />

        <label style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: T.sm }}>
          <input type="checkbox" checked={f.activa} onChange={e => upd("activa", e.target.checked)} />
          Activa
        </label>

        {err && <div style={{ color: "#fca5a5", fontSize: T.sm, marginTop: 8 }}>{err}</div>}

        <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "flex-end", marginTop: S.lg }}>
          <button onClick={onClose} style={btnSecondary({ isMobile })}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear resolución"}
          </button>
        </div>
      </div>
    </div>
  );
}
