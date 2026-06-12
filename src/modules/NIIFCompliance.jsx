// KPMG D-3 · NIIF para PYMES (Colombia)
// =============================================================
// Módulo de cumplimiento NIIF Pymes (Grupo 2). 4 tabs:
//   1. Dashboard — compliance check + KPIs
//   2. Política — política contable single-row
//   3. Activos — gap analysis NIIF + depreciación calculada
//   4. Vidas útiles — catálogo por categoría

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive";
import { logAccion } from "../lib/logAccion";
import {
  pagePadding, cardPadding, sectionCard, tableWrapper,
  inputStyle, btnPrimary, btnSecondary,
  flexRow, labelStyle, T, S, TOUCH_TARGET,
} from "../lib/responsive";

const fmt$ = n => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fmtDate = s => s ? new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STATUS_LABEL = {
  ok:            { label: "OK",              tone: "ok",     fg: "#86efac" },
  sin_vida_util: { label: "Sin vida útil",   tone: "danger", fg: "#fca5a5" },
  sin_costo:     { label: "Sin costo",       tone: "danger", fg: "#fca5a5" },
  sin_fecha:     { label: "Sin fecha compra", tone: "danger", fg: "#fca5a5" },
  sin_metodo:    { label: "Sin método",      tone: "warn",   fg: "#fbbf24" },
};

const TONE_BG = {
  ok:      "rgba(34,197,94,0.12)",
  warn:    "rgba(245,158,11,0.12)",
  danger:  "rgba(239,68,68,0.12)",
  neutral: "rgba(255,255,255,0.03)",
};

export default function NIIFCompliance() {
  const { isMobile } = useBreakpoint();
  const [tab, setTab] = useState("dashboard");
  const [policy, setPolicy]     = useState(null);
  const [vidas, setVidas]       = useState([]);
  const [activos, setActivos]   = useState([]);
  const [loading, setLoading]   = useState(true);

  async function loadAll() {
    setLoading(true);
    const [{ data: p }, { data: v }, { data: a }] = await Promise.all([
      supabase.from("niif_policy").select("*").eq("id", 1).single(),
      supabase.from("niif_vidas_utiles").select("*").order("categoria"),
      supabase.from("niif_activos_depreciacion").select("*").order("niif_status").limit(2000),
    ]);
    setPolicy(p); setVidas(v || []); setActivos(a || []);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  const kpis = useMemo(() => {
    const acc = { total: 0, ok: 0, incompletos: 0, valor_total: 0, valor_libros: 0, deprec_acum: 0 };
    activos.forEach(a => {
      acc.total++;
      acc.valor_total += Number(a.costo) || 0;
      if (a.niif_status === "ok") {
        acc.ok++;
        acc.valor_libros += Number(a.valor_en_libros) || 0;
        acc.deprec_acum  += Number(a.depreciacion_acumulada) || 0;
      } else {
        acc.incompletos++;
      }
    });
    return acc;
  }, [activos]);

  const policyComplete = !!(policy?.vigente_desde && policy?.reconocimiento_ingresos);
  const proxRevision = policy?.proximo_review ? new Date(policy.proximo_review) : null;
  const reviewVencido = proxRevision && proxRevision < new Date();

  return (
    <div style={{ ...pagePadding({ isMobile }), color: B.fg }}>
      <div style={{ marginBottom: S.lg }}>
        <h1 style={{ fontSize: T.h1, margin: 0, fontWeight: 700 }}>NIIF para PYMES (Colombia)</h1>
        <p style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 6 }}>
          KPMG D-3 · Marco normativo: Decreto 2420/2015 (Grupo 2 — NIIF Pymes). Política contable + depreciación + reconocimiento de ingresos.
        </p>
      </div>

      {reviewVencido && (
        <div style={{
          padding: 14, borderRadius: 12, marginBottom: S.md,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",
        }}>
          <div style={{ fontWeight: 700, color: "#fca5a5" }}>🚨 Política contable con review VENCIDO</div>
          <div style={{ fontSize: T.sm, color: B.fgMuted, marginTop: 4 }}>
            Debía revisarse el {fmtDate(policy.proximo_review)}. NIIF Pymes sec. 10.4 exige revisión anual.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${B.border}`, marginBottom: S.lg, overflowX: "auto" }}>
        {[
          ["dashboard",   "Dashboard"],
          ["politica",    "Política contable"],
          ["activos",     `Activos NIIF (${kpis.incompletos} pendientes)`],
          ["vidas",       `Vidas útiles (${vidas.length})`],
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
        <Dashboard isMobile={isMobile} kpis={kpis} policy={policy} policyComplete={policyComplete} onGoTo={setTab} />
      ) : tab === "politica" ? (
        <PoliticaForm isMobile={isMobile} policy={policy} onSaved={loadAll} />
      ) : tab === "activos" ? (
        <ActivosNIIF isMobile={isMobile} activos={activos} vidas={vidas} />
      ) : (
        <VidasUtiles isMobile={isMobile} vidas={vidas} />
      )}
    </div>
  );
}

const td = { padding: "10px 12px", verticalAlign: "top" };

function Dashboard({ isMobile, kpis, policy, policyComplete, onGoTo }) {
  return (
    <>
      <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), marginBottom: S.md }}>
        <h3 style={{ marginTop: 0 }}>📋 Estado de cumplimiento NIIF</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <ComplianceRow ok={policyComplete} label="Política contable documentada con review vigente" actionLabel="Editar" onAction={() => onGoTo("politica")} />
          <ComplianceRow ok={kpis.incompletos === 0 && kpis.total > 0} label={`Activos fijos con datos NIIF completos (${kpis.ok}/${kpis.total})`} actionLabel="Completar" onAction={() => onGoTo("activos")} />
          <ComplianceRow ok={!!policy?.reconocimiento_ingresos} label="Política de reconocimiento de ingresos (sec. 23)" actionLabel="Editar" onAction={() => onGoTo("politica")} />
          <ComplianceRow ok={!!policy?.politica_deterioro} label="Política de deterioro CxC (sec. 11)" actionLabel="Editar" onAction={() => onGoTo("politica")} />
          <ComplianceRow ok={!!policy?.politica_provisiones} label="Política de provisiones (sec. 21)" actionLabel="Editar" onAction={() => onGoTo("politica")} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: S.md, marginBottom: S.lg }}>
        <KPI label="Total activos" value={kpis.total} tone="neutral" />
        <KPI label="Datos completos" value={kpis.ok} subtitle={kpis.total ? `${((kpis.ok/kpis.total)*100).toFixed(0)}%` : "—"} tone={kpis.ok === kpis.total && kpis.total ? "ok" : "warn"} />
        <KPI label="Costo registrado" value={fmt$(kpis.valor_total)} tone="neutral" />
        <KPI label="Valor en libros (calc.)" value={fmt$(kpis.valor_libros)} subtitle={fmt$(kpis.deprec_acum) + " depreciado"} tone="neutral" />
      </div>

      {kpis.incompletos > 0 && (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <h3 style={{ marginTop: 0, color: "#fca5a5" }}>⚠️ Acción requerida: completar datos NIIF</h3>
          <p style={{ color: B.fgMuted, fontSize: T.sm, lineHeight: 1.6 }}>
            <b>{kpis.incompletos}</b> activos no tienen los campos requeridos por NIIF Pymes sec. 17
            (costo de adquisición, fecha de compra, vida útil, método de depreciación). Sin estos
            campos no se puede calcular depreciación y los estados financieros estarán incompletos.
          </p>
          <button onClick={() => onGoTo("activos")} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff", marginTop: 8 }}>
            Ver gap analysis →
          </button>
        </div>
      )}
    </>
  );
}

function ComplianceRow({ ok, label, actionLabel, onAction }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
      borderRadius: 8, background: ok ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
      border: `1px solid ${ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
    }}>
      <span style={{ fontSize: 18 }}>{ok ? "✅" : "⚠️"}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {!ok && onAction && (
        <button onClick={onAction} style={{ background: "transparent", border: 0, color: B.brand, cursor: "pointer", textDecoration: "underline", fontSize: T.sm }}>{actionLabel}</button>
      )}
    </div>
  );
}

function PoliticaForm({ isMobile, policy, onSaved }) {
  const [f, setF] = useState({
    grupo:                       policy?.grupo                       || "Grupo 2 (NIIF Pymes)",
    marco_normativo:             policy?.marco_normativo             || "",
    moneda_funcional:            policy?.moneda_funcional            || "COP",
    periodo_contable:            policy?.periodo_contable            || "",
    base_medicion:               policy?.base_medicion               || "",
    metodo_depreciacion_default: policy?.metodo_depreciacion_default || "linea_recta",
    reconocimiento_ingresos:     policy?.reconocimiento_ingresos     || "",
    politica_inventarios:        policy?.politica_inventarios        || "",
    politica_provisiones:        policy?.politica_provisiones        || "",
    politica_deterioro:          policy?.politica_deterioro          || "",
    politica_arrendamientos:     policy?.politica_arrendamientos     || "",
    vigente_desde:               policy?.vigente_desde               || "",
    proximo_review:              policy?.proximo_review              || "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true); setMsg("");
    const me = (await supabase.auth.getUser()).data?.user?.email?.toLowerCase();
    const { error } = await supabase.from("niif_policy").update({
      ...f,
      vigente_desde: f.vigente_desde || null,
      proximo_review: f.proximo_review || null,
      ultima_revision: new Date().toISOString(),
      revisado_por: me,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setSaving(false);
    if (error) { setMsg("Error: " + error.message); return; }
    logAccion("niif_policy_updated", {});
    setMsg("Guardado. Próxima revisión: " + (f.proximo_review || "configurar"));
    onSaved?.();
  }

  const sec = (label, key, rows = 4, ph = "") => (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        value={f[key]} onChange={e => upd(key, e.target.value)}
        rows={rows} placeholder={ph}
        style={{ ...inputStyle({ isMobile }), resize: "vertical", minHeight: rows * 22, fontFamily: "monospace", fontSize: 12 }}
      />
    </div>
  );

  return (
    <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), maxWidth: 900 }}>
      <h3 style={{ marginTop: 0 }}>Política contable</h3>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Grupo NIIF</label>
          <input value={f.grupo} onChange={e => upd("grupo", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
        <div>
          <label style={labelStyle}>Moneda funcional</label>
          <input value={f.moneda_funcional} onChange={e => upd("moneda_funcional", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
        <div>
          <label style={labelStyle}>Método depreciación default</label>
          <select value={f.metodo_depreciacion_default} onChange={e => upd("metodo_depreciacion_default", e.target.value)} style={inputStyle({ isMobile })}>
            <option value="linea_recta">Línea recta</option>
            <option value="unidades_produccion">Unidades de producción</option>
            <option value="suma_digitos">Suma de los dígitos</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Período contable</label>
          <input value={f.periodo_contable} onChange={e => upd("periodo_contable", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
        <div>
          <label style={labelStyle}>Vigente desde</label>
          <input type="date" value={f.vigente_desde} onChange={e => upd("vigente_desde", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
        <div>
          <label style={labelStyle}>Próxima revisión</label>
          <input type="date" value={f.proximo_review} onChange={e => upd("proximo_review", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
      </div>

      {sec("Marco normativo", "marco_normativo", 2)}
      {sec("Base de medición", "base_medicion", 2)}
      {sec("Reconocimiento de ingresos (sec. 23)", "reconocimiento_ingresos", 6)}
      {sec("Política de inventarios (sec. 13)", "politica_inventarios", 4)}
      {sec("Política de provisiones (sec. 21)", "politica_provisiones", 5)}
      {sec("Política de deterioro (sec. 11)", "politica_deterioro", 4)}
      {sec("Política de arrendamientos (sec. 20)", "politica_arrendamientos", 4)}

      <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "flex-end", marginTop: S.lg, alignItems: "center" }}>
        {msg && <span style={{ flex: 1, color: msg.startsWith("Error") ? "#fca5a5" : "#86efac", fontSize: T.sm }}>{msg}</span>}
        <button onClick={save} disabled={saving} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff", opacity: saving ? 0.5 : 1 }}>
          {saving ? "Guardando…" : "Guardar política"}
        </button>
      </div>
    </div>
  );
}

function ActivosNIIF({ isMobile, activos, vidas }) {
  const [filtroEstado, setFiltroEstado] = useState("incompletos");
  const filtered = useMemo(() => {
    if (filtroEstado === "incompletos") return activos.filter(a => a.niif_status !== "ok");
    if (filtroEstado === "ok") return activos.filter(a => a.niif_status === "ok");
    return activos;
  }, [activos, filtroEstado]);

  // Sugerencias por categoría
  const vidasByCat = useMemo(() => {
    const idx = {};
    vidas.forEach(v => { idx[v.categoria] = v; });
    return idx;
  }, [vidas]);

  function exportCSV() {
    const rows = [["ID", "Código", "Nombre", "Categoría", "Fecha compra", "Costo", "Vida útil años (sugerida)", "Método (sugerido)", "Valor residual %", "Estado NIIF"]];
    activos.forEach(a => {
      const v = vidasByCat[a.categoria];
      rows.push([
        a.id, a.codigo || "", a.nombre, a.categoria || "",
        a.fecha_compra || "",
        a.costo || 0,
        v?.vida_util_default || "",
        v?.metodo_default || "linea_recta",
        v?.valor_residual_pct || 0,
        a.niif_status,
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `activos-niif-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <div style={{ ...flexRow({ isMobile, gap: 10 }), marginBottom: S.md, alignItems: "center" }}>
        <div style={{ minWidth: 180 }}>
          <label style={labelStyle}>Filtro</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={inputStyle({ isMobile })}>
            <option value="incompletos">Solo incompletos ({activos.filter(a => a.niif_status !== "ok").length})</option>
            <option value="ok">Solo OK ({activos.filter(a => a.niif_status === "ok").length})</option>
            <option value="todos">Todos ({activos.length})</option>
          </select>
        </div>
        <div style={{ marginLeft: isMobile ? 0 : "auto", alignSelf: "flex-end" }}>
          <button onClick={exportCSV} style={btnSecondary({ isMobile })}>📥 Exportar CSV (con sugerencias)</button>
        </div>
      </div>

      <div style={{ fontSize: T.xs, color: B.fgMuted, marginBottom: 8 }}>
        Mostrando {filtered.length} activos. El CSV incluye vida útil y método sugerido por categoría — útil para que contabilidad cargue en bloque.
      </div>

      <div style={tableWrapper}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
          <thead style={{ background: "rgba(255,255,255,0.04)" }}>
            <tr>
              {["Activo", "Categoría", "Fecha", "Costo", "Vida útil", "Estado NIIF", "Valor libros"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map(a => {
              const s = STATUS_LABEL[a.niif_status] || STATUS_LABEL.sin_vida_util;
              const sug = vidasByCat[a.categoria];
              return (
                <tr key={a.id} style={{ borderBottom: `1px solid ${B.border}`, background: TONE_BG[s.tone] }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{a.nombre}</div>
                    {a.codigo && <div style={{ fontSize: 11, color: B.fgMuted }}>{a.codigo}</div>}
                  </td>
                  <td style={td}>{a.categoria || "—"}</td>
                  <td style={td}>{fmtDate(a.fecha_compra)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{a.costo > 0 ? fmt$(a.costo) : <span style={{ color: "#fca5a5" }}>sin costo</span>}</td>
                  <td style={td}>
                    {a.vida_util_anios
                      ? `${a.vida_util_anios} años`
                      : sug
                        ? <span style={{ color: B.fgMuted, fontStyle: "italic" }}>sugerido: {sug.vida_util_default}a</span>
                        : "—"}
                  </td>
                  <td style={td}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: TONE_BG[s.tone], color: s.fg, border: `1px solid ${s.fg}33`,
                    }}>{s.label}</span>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{a.valor_en_libros !== null && a.valor_en_libros !== undefined ? fmt$(a.valor_en_libros) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 500 && (
        <div style={{ color: B.fgMuted, fontSize: T.xs, marginTop: 8, textAlign: "center" }}>
          Mostrando los primeros 500. Usá el CSV para ver todos.
        </div>
      )}
    </>
  );
}

function VidasUtiles({ isMobile, vidas }) {
  return (
    <>
      <div style={{ color: B.fgMuted, fontSize: T.sm, marginBottom: S.md }}>
        Catálogo de vidas útiles recomendadas por categoría conforme NIIF Pymes sec. 17 y Estatuto Tributario art. 137.
      </div>
      <div style={tableWrapper}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
          <thead style={{ background: "rgba(255,255,255,0.04)" }}>
            <tr>
              {["Categoría", "Rango (años)", "Default", "Valor residual", "Método", "Base legal"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vidas.map(v => (
              <tr key={v.id} style={{ borderBottom: `1px solid ${B.border}` }}>
                <td style={td}><b>{v.categoria}</b>{v.notas && <div style={{ fontSize: 11, color: B.fgMuted }}>{v.notas}</div>}</td>
                <td style={td}>{v.vida_util_min} - {v.vida_util_max}</td>
                <td style={td}><b>{v.vida_util_default}</b></td>
                <td style={td}>{v.valor_residual_pct}%</td>
                <td style={td}>{v.metodo_default.replace("_", " ")}</td>
                <td style={{ ...td, fontSize: T.xs, color: B.fgMuted, maxWidth: 280 }}>{v.base_legal || "—"}</td>
              </tr>
            ))}
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
