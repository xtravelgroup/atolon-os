// KPMG C-5 · Módulo Backups & DR
// =============================================================
// Para super_admin / auditor.
// Muestra: política RPO/RTO, historial de verificaciones, runbook,
// y botón para correr nueva verificación de integridad.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { logAccion } from "../lib/logAccion";
import { useBreakpoint } from "../lib/responsive";
import {
  pagePadding, cardPadding, sectionCard, tableWrapper,
  inputStyle, btnPrimary, btnSecondary,
  flexRow, labelStyle, T, S, TOUCH_TARGET,
} from "../lib/responsive";

const fmtDate = s => s ? new Date(s).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—";

const STATUS_COLORS = {
  ok:      { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.4)",  fg: "#86efac", icon: "✅" },
  warning: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", fg: "#fbbf24", icon: "⚠️" },
  fail:    { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.4)",  fg: "#fca5a5", icon: "❌" },
};

export default function BackupDR() {
  const { isMobile } = useBreakpoint();
  const [policy, setPolicy]       = useState(null);
  const [checks, setChecks]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [running, setRunning]     = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [tab, setTab]             = useState("dashboard");

  async function loadAll() {
    setLoading(true);
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from("dr_policy").select("*").eq("id", 1).single(),
      supabase.from("dr_checks").select("*").order("ejecutado_at", { ascending: false }).limit(50),
    ]);
    setPolicy(p);
    setChecks(c || []);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  async function runIntegrityCheck() {
    setRunning(true);
    setLastResult(null);
    const t0 = Date.now();
    try {
      const { data, error } = await supabase.rpc("dr_run_integrity_check");
      if (error) throw error;
      const duracion = Date.now() - t0;
      const overall = data?.overall || "warning";
      const me = (await supabase.auth.getUser()).data?.user?.email?.toLowerCase();
      await supabase.from("dr_checks").insert({
        ejecutado_por: me,
        tipo: "manual",
        resultado: overall,
        assertions: data?.assertions || [],
        duracion_ms: duracion,
      });
      logAccion("dr_integrity_check", { resultado: overall, duracion_ms: duracion });
      setLastResult({ ...data, duracion_ms: duracion });
      loadAll();
    } catch (e) {
      setLastResult({ overall: "fail", error: String(e?.message || e) });
    } finally {
      setRunning(false);
    }
  }

  const last = checks[0];

  return (
    <div style={{ ...pagePadding({ isMobile }), color: B.fg }}>
      <div style={{ marginBottom: S.lg }}>
        <h1 style={{ fontSize: T.h1, margin: 0, fontWeight: 700 }}>Backups & Disaster Recovery</h1>
        <p style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 6 }}>
          KPMG C-5 · Política RPO/RTO, verificación de integridad, runbook de restauración.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${B.border}`, marginBottom: S.lg, overflowX: "auto" }}>
        {[
          ["dashboard", "Dashboard"],
          ["historial", `Historial (${checks.length})`],
          ["runbook",   "Runbook"],
          ["politica",  "Política"],
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
        <Dashboard
          isMobile={isMobile} policy={policy} last={last}
          running={running} lastResult={lastResult}
          onRun={runIntegrityCheck}
        />
      ) : tab === "historial" ? (
        <Historial isMobile={isMobile} checks={checks} />
      ) : tab === "runbook" ? (
        <Runbook isMobile={isMobile} policy={policy} />
      ) : (
        <Politica isMobile={isMobile} policy={policy} onSaved={loadAll} />
      )}
    </div>
  );
}

function Dashboard({ isMobile, policy, last, running, lastResult, onRun }) {
  const lastStatus = last?.resultado || (lastResult?.overall) || null;
  const tone = lastStatus ? STATUS_COLORS[lastStatus] : null;
  const horasDesdeUltimo = last
    ? Math.round((Date.now() - new Date(last.ejecutado_at).getTime()) / 3600000)
    : null;
  const verificacionFresca = horasDesdeUltimo !== null && horasDesdeUltimo < 168; // 7 días

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: S.md, marginBottom: S.lg }}>
        <KPI label="RPO" value={`${policy?.rpo_horas || 24} h`} subtitle="Pérdida tolerable" tone="neutral" />
        <KPI label="RTO" value={`${policy?.rto_horas || 4} h`} subtitle="Tiempo de restauración" tone="neutral" />
        <KPI label="Retención" value={`${policy?.retencion_dias || 7} d`} subtitle="Snapshots automáticos" tone="neutral" />
        <KPI label="PITR" value={`${policy?.pitr_dias || 7} d`} subtitle="Recovery puntual" tone="neutral" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.3fr 1fr", gap: S.md, marginBottom: S.lg }}>
        {/* Última verificación */}
        <div style={{
          ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }),
          background: tone?.bg || "rgba(255,255,255,0.03)",
          border: `1px solid ${tone?.border || B.border}`,
        }}>
          <div style={{ fontSize: T.xs, color: B.fgMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Última verificación de integridad
          </div>
          {last ? (
            <>
              <div style={{ fontSize: T.h2, fontWeight: 800, color: tone?.fg, marginTop: 4 }}>
                {tone?.icon} {lastStatus.toUpperCase()}
              </div>
              <div style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 4 }}>
                {fmtDate(last.ejecutado_at)} · por {last.ejecutado_por || "—"} · {last.duracion_ms} ms
              </div>
              {!verificacionFresca && (
                <div style={{ color: "#fbbf24", fontSize: T.xs, marginTop: 8 }}>
                  ⚠️ Última verificación hace {horasDesdeUltimo} horas. Se recomienda verificar al menos 1× por semana.
                </div>
              )}
            </>
          ) : (
            <div style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 8 }}>
              No hay verificaciones registradas. Corré la primera.
            </div>
          )}
        </div>

        {/* Botón "Run now" */}
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: T.xs, color: B.fgMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Ejecutar nueva verificación
            </div>
            <p style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 6 }}>
              Corre conteos de tablas críticas, detección de huérfanos y compliance de password.
            </p>
          </div>
          <button onClick={onRun} disabled={running} style={{
            ...btnPrimary({ isMobile }),
            background: B.brand, color: "#fff",
            opacity: running ? 0.5 : 1, marginTop: 12,
          }}>
            {running ? "Corriendo…" : "▶ Correr verificación ahora"}
          </button>
        </div>
      </div>

      {/* Detalle de la última corrida en pantalla */}
      {(lastResult || last) && (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }) }}>
          <h3 style={{ marginTop: 0 }}>Assertions</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {((lastResult?.assertions) || (last?.assertions) || []).map((a, i) => {
              const t = STATUS_COLORS[a.status] || STATUS_COLORS.ok;
              return (
                <div key={i} style={{
                  padding: 12, borderRadius: 8,
                  background: t.bg, border: `1px solid ${t.border}`,
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
                }}>
                  <div style={{ flex: "1 1 auto", minWidth: 200 }}>
                    <div style={{ fontWeight: 700, color: t.fg }}>{t.icon} {a.name}</div>
                    <pre style={{
                      color: B.fgMuted, fontSize: 11, marginTop: 6, padding: 8,
                      background: "rgba(0,0,0,0.25)", borderRadius: 6,
                      overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>{JSON.stringify(a.detail, null, 2)}</pre>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Historial({ isMobile, checks }) {
  if (!checks.length) return (
    <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center", color: B.fgMuted }}>
      Aún no hay verificaciones. Corré una desde el Dashboard.
    </div>
  );
  return (
    <div style={tableWrapper}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
        <thead style={{ background: "rgba(255,255,255,0.04)" }}>
          <tr>
            {["Fecha", "Tipo", "Resultado", "Operador", "Duración", "Notas"].map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {checks.map(c => {
            const t = STATUS_COLORS[c.resultado] || STATUS_COLORS.warning;
            return (
              <tr key={c.id} style={{ borderBottom: `1px solid ${B.border}` }}>
                <td style={td}>{fmtDate(c.ejecutado_at)}</td>
                <td style={td}>{c.tipo}</td>
                <td style={td}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: t.bg, color: t.fg, border: `1px solid ${t.border}`,
                  }}>{t.icon} {c.resultado.toUpperCase()}</span>
                </td>
                <td style={td}>{c.ejecutado_por || "—"}</td>
                <td style={td}>{c.duracion_ms ? `${c.duracion_ms} ms` : "—"}</td>
                <td style={{ ...td, maxWidth: 280, color: B.fgMuted, fontSize: T.xs }}>{c.notas || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const td = { padding: "10px 12px", verticalAlign: "top" };

function Runbook({ isMobile, policy }) {
  return (
    <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }) }}>
      <pre style={{
        whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: T.sm,
        color: B.fg, lineHeight: 1.6, margin: 0,
      }}>{policy?.runbook || "Sin runbook configurado."}</pre>
    </div>
  );
}

function Politica({ isMobile, policy, onSaved }) {
  const [rpoH, setRpoH]     = useState(policy?.rpo_horas || 24);
  const [rtoH, setRtoH]     = useState(policy?.rto_horas || 4);
  const [retD, setRetD]     = useState(policy?.retencion_dias || 7);
  const [pitrD, setPitrD]   = useState(policy?.pitr_dias || 7);
  const [busy, setBusy]     = useState(false);
  const [msg, setMsg]       = useState("");

  async function save() {
    setBusy(true);
    const me = (await supabase.auth.getUser()).data?.user?.email?.toLowerCase();
    const { error } = await supabase.from("dr_policy").update({
      rpo_horas: rpoH, rto_horas: rtoH,
      retencion_dias: retD, pitr_dias: pitrD,
      ultima_revision: new Date().toISOString(),
      revisado_por: me,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setBusy(false);
    if (error) { setMsg("Error: " + error.message); return; }
    logAccion("dr_policy_updated", { rpo_horas: rpoH, rto_horas: rtoH });
    setMsg("Guardado. Próxima revisión recomendada: 6 meses.");
    onSaved?.();
  }

  return (
    <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), maxWidth: 600 }}>
      <h3 style={{ marginTop: 0 }}>Política RPO/RTO</h3>
      <p style={{ color: B.fgMuted, fontSize: T.sm }}>
        Estos targets deben ser aprobados formalmente por Gerencia y revisados al menos 1× por año.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div>
          <label style={labelStyle}>RPO (horas)</label>
          <input type="number" min={0} max={168} value={rpoH}
            onChange={e => setRpoH(Number(e.target.value) || 0)} style={inputStyle({ isMobile })} />
          <small style={{ color: B.fgMuted, fontSize: T.xs }}>Pérdida máxima de datos tolerable</small>
        </div>
        <div>
          <label style={labelStyle}>RTO (horas)</label>
          <input type="number" min={0} max={72} value={rtoH}
            onChange={e => setRtoH(Number(e.target.value) || 0)} style={inputStyle({ isMobile })} />
          <small style={{ color: B.fgMuted, fontSize: T.xs }}>Tiempo máximo para volver a operar</small>
        </div>
        <div>
          <label style={labelStyle}>Retención snapshots (días)</label>
          <input type="number" min={1} max={30} value={retD}
            onChange={e => setRetD(Number(e.target.value) || 1)} style={inputStyle({ isMobile })} />
          <small style={{ color: B.fgMuted, fontSize: T.xs }}>Configurable en Supabase Dashboard</small>
        </div>
        <div>
          <label style={labelStyle}>PITR (días)</label>
          <input type="number" min={1} max={30} value={pitrD}
            onChange={e => setPitrD(Number(e.target.value) || 1)} style={inputStyle({ isMobile })} />
          <small style={{ color: B.fgMuted, fontSize: T.xs }}>Point-in-Time Recovery</small>
        </div>
      </div>

      {policy?.ultima_revision && (
        <div style={{ color: B.fgMuted, fontSize: T.xs, marginTop: 16 }}>
          Última revisión: {fmtDate(policy.ultima_revision)} por {policy.revisado_por || "—"}
        </div>
      )}

      <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "flex-end", marginTop: S.lg }}>
        {msg && <span style={{ flex: 1, color: msg.startsWith("Error") ? "#fca5a5" : "#86efac", fontSize: T.sm, alignSelf: "center" }}>{msg}</span>}
        <button onClick={save} disabled={busy} style={{
          ...btnPrimary({ isMobile }), background: B.brand, color: "#fff",
          opacity: busy ? 0.5 : 1,
        }}>{busy ? "Guardando…" : "Guardar política"}</button>
      </div>
    </div>
  );
}

function KPI({ label, value, subtitle, tone = "neutral" }) {
  const colors = {
    ok:      { bg: "rgba(34,197,94,0.08)",  fg: "#86efac" },
    neutral: { bg: "rgba(255,255,255,0.03)", fg: B.fg },
  }[tone] || { bg: "rgba(255,255,255,0.03)", fg: B.fg };
  return (
    <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${B.border}`, background: colors.bg }}>
      <div style={{ fontSize: T.xs, color: B.fgMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: T.h2, fontWeight: 800, color: colors.fg, marginTop: 4 }}>{value}</div>
      {subtitle && <div style={{ fontSize: T.xs, color: B.fgMuted, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}
