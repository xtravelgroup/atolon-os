// KPMG D-2 · Ley 1581/2012 — Hábeas Data
// =============================================================
// Módulo para super_admin / contabilidad / auditor.
// 4 tabs:
//   1. Política — texto, encargado, RNBD, aviso de privacidad
//   2. Inventario — bases de datos con PII (tipos, base legal, retención)
//   3. Consentimientos — registro de consentimientos otorgados
//   4. Solicitudes — ARCO + supresión + portabilidad + SLA tracker

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

const fmtDate = s => s ? new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = s => s ? new Date(s).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—";

const TIPO_SOLICITUD_LABEL = {
  acceso:        "Acceso (saber qué datos tenemos)",
  rectificacion: "Rectificación (corregir datos)",
  cancelacion:   "Cancelación (cerrar cuenta)",
  supresion:     "Supresión (borrar datos)",
  revocatoria:   "Revocatoria del consentimiento",
  portabilidad:  "Portabilidad (entregar copia)",
  queja:         "Queja / Reclamo",
};

const ESTADO_TONE = {
  recibida:  { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", fg: "#fbbf24" },
  en_proceso:{ bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.4)", fg: "#7dd3fc" },
  atendida:  { bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.4)",  fg: "#86efac" },
  rechazada: { bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.4)", fg: "#94a3b8" },
};

export default function HabeasData() {
  const { isMobile } = useBreakpoint();
  const [tab, setTab] = useState("dashboard");
  const [policy, setPolicy]       = useState(null);
  const [inventory, setInventory] = useState([]);
  const [consents, setConsents]   = useState([]);
  const [requests, setRequests]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showNuevaSol, setShowNuevaSol] = useState(false);
  const [editReq, setEditReq]     = useState(null);

  async function loadAll() {
    setLoading(true);
    const [{ data: p }, { data: i }, { data: c }, { data: r }] = await Promise.all([
      supabase.from("habeas_data_policy").select("*").eq("id", 1).single(),
      supabase.from("habeas_data_inventory").select("*").order("tabla"),
      supabase.from("habeas_data_consents").select("*").order("otorgado_at", { ascending: false }).limit(500),
      supabase.from("habeas_data_requests").select("*").order("recibida_at", { ascending: false }).limit(500),
    ]);
    setPolicy(p); setInventory(i || []); setConsents(c || []); setRequests(r || []);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  const kpis = useMemo(() => {
    const now = Date.now();
    const abiertas = requests.filter(r => r.estado === "recibida" || r.estado === "en_proceso");
    const vencidas = abiertas.filter(r => new Date(r.fecha_limite).getTime() < now);
    const proximas = abiertas.filter(r => {
      const t = new Date(r.fecha_limite).getTime();
      return t >= now && t - now <= 3 * 86400000;
    });
    return {
      abiertas: abiertas.length,
      vencidas: vencidas.length,
      proximas: proximas.length,
      atendidas: requests.filter(r => r.estado === "atendida").length,
      consents_activos: consents.filter(c => !c.retirado_at).length,
      consents_retirados: consents.filter(c => c.retirado_at).length,
      tablas_pii: inventory.length,
      sensibles: inventory.filter(i => i.contiene_sensibles).length,
    };
  }, [requests, consents, inventory]);

  return (
    <div style={{ ...pagePadding({ isMobile }), color: B.fg }}>
      <div style={{ marginBottom: S.lg }}>
        <h1 style={{ fontSize: T.h1, margin: 0, fontWeight: 700 }}>Hábeas Data (Ley 1581/2012)</h1>
        <p style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 6 }}>
          KPMG D-2 · Tratamiento de datos personales en Colombia. Política, inventario PII, consentimientos y solicitudes ARCO.
        </p>
      </div>

      {/* Alerta de vencidas */}
      {kpis.vencidas > 0 && (
        <div style={{
          padding: 14, borderRadius: 12, marginBottom: S.md,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",
        }}>
          <div style={{ fontWeight: 700, color: "#fca5a5" }}>🚨 {kpis.vencidas} solicitud(es) FUERA DE PLAZO LEGAL</div>
          <div style={{ fontSize: T.sm, color: B.fgMuted, marginTop: 4 }}>
            Ley 1581 establece 10 días hábiles para consultas y 15 días hábiles para reclamos.
            Cada solicitud vencida puede derivar en sanción de la SIC (hasta 2000 SMMLV ~ $2.8 Bn).
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${B.border}`, marginBottom: S.lg, overflowX: "auto" }}>
        {[
          ["dashboard",      "Dashboard"],
          ["politica",       "Política"],
          ["inventario",     `Inventario PII (${kpis.tablas_pii})`],
          ["consentimientos", `Consentimientos (${kpis.consents_activos})`],
          ["solicitudes",    `Solicitudes (${kpis.abiertas})`],
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
        <Dashboard isMobile={isMobile} kpis={kpis} policy={policy} onGoTo={setTab} />
      ) : tab === "politica" ? (
        <PoliticaForm isMobile={isMobile} policy={policy} onSaved={loadAll} />
      ) : tab === "inventario" ? (
        <Inventario isMobile={isMobile} inventory={inventory} />
      ) : tab === "consentimientos" ? (
        <Consentimientos isMobile={isMobile} consents={consents} />
      ) : (
        <Solicitudes
          isMobile={isMobile} requests={requests}
          onNueva={() => setShowNuevaSol(true)}
          onEdit={(r) => setEditReq(r)}
        />
      )}

      {(showNuevaSol || editReq) && (
        <SolicitudModal
          isMobile={isMobile}
          solicitud={editReq}
          onClose={() => { setShowNuevaSol(false); setEditReq(null); }}
          onSaved={() => { setShowNuevaSol(false); setEditReq(null); loadAll(); }}
        />
      )}
    </div>
  );
}

const td = { padding: "10px 12px", verticalAlign: "top" };

function Dashboard({ isMobile, kpis, policy, onGoTo }) {
  const politicaCompleta = !!(policy?.encargado_email && policy?.texto_politica);
  const rnbdRegistrado = !!policy?.registro_rnbd_numero;
  return (
    <>
      {/* Compliance check */}
      <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), marginBottom: S.md }}>
        <h3 style={{ marginTop: 0 }}>📋 Estado de cumplimiento</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <ComplianceRow ok={politicaCompleta} label="Política de tratamiento documentada con encargado designado" actionLabel="Configurar" onAction={() => onGoTo("politica")} />
          <ComplianceRow ok={kpis.tablas_pii >= 5} label={`Inventario de bases de datos con PII (${kpis.tablas_pii} tablas mapeadas)`} actionLabel="Ver" onAction={() => onGoTo("inventario")} />
          <ComplianceRow ok={rnbdRegistrado} label="Registro Nacional de Bases de Datos (RNBD) ante SIC" actionLabel="Configurar" onAction={() => onGoTo("politica")} />
          <ComplianceRow ok={kpis.vencidas === 0} label={`Solicitudes ARCO dentro de plazo (${kpis.vencidas} vencida${kpis.vencidas === 1 ? "" : "s"})`} actionLabel="Atender" onAction={() => onGoTo("solicitudes")} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: S.md, marginBottom: S.lg }}>
        <KPI label="Solicitudes abiertas" value={kpis.abiertas} subtitle={kpis.proximas ? `${kpis.proximas} próximas a vencer` : "Todas en plazo"} tone={kpis.vencidas ? "danger" : kpis.proximas ? "warn" : "ok"} />
        <KPI label="Atendidas (total)" value={kpis.atendidas} tone="ok" />
        <KPI label="Consentimientos activos" value={kpis.consents_activos} subtitle={`${kpis.consents_retirados} retirados`} tone="neutral" />
        <KPI label="Tablas con datos sensibles" value={kpis.sensibles} subtitle={`de ${kpis.tablas_pii} tablas PII`} tone={kpis.sensibles ? "warn" : "ok"} />
      </div>

      <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }) }}>
        <h3 style={{ marginTop: 0 }}>📞 Canal de atención</h3>
        <div style={{ fontSize: T.sm, color: B.fgMuted, lineHeight: 1.6 }}>
          Email para titulares: <b style={{ color: B.fg }}>{policy?.encargado_email || "— configurar"}</b><br />
          Encargado: <b style={{ color: B.fg }}>{policy?.encargado_tratamiento || "—"}</b><br />
          Plazos legales:<br />
          &nbsp;&nbsp;• Consultas (art. 14): <b>10 días hábiles</b> ≈ 14 días calendario<br />
          &nbsp;&nbsp;• Reclamos (art. 15): <b>15 días hábiles</b> ≈ 21 días calendario<br />
          Sanciones: hasta 2000 SMMLV (~$2.8 Bn COP 2026)
        </div>
      </div>
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
      <span style={{ fontSize: 18, color: ok ? "#86efac" : "#fca5a5" }}>{ok ? "✅" : "⚠️"}</span>
      <span style={{ flex: 1, color: ok ? B.fg : B.fg }}>{label}</span>
      {!ok && onAction && (
        <button onClick={onAction} style={{ background: "transparent", border: 0, color: B.brand, cursor: "pointer", textDecoration: "underline", fontSize: T.sm }}>{actionLabel}</button>
      )}
    </div>
  );
}

function PoliticaForm({ isMobile, policy, onSaved }) {
  const [f, setF] = useState({
    version:                policy?.version              || "1.0",
    texto_politica:         policy?.texto_politica       || "",
    aviso_privacidad:       policy?.aviso_privacidad     || "",
    encargado_tratamiento:  policy?.encargado_tratamiento|| "",
    encargado_email:        policy?.encargado_email      || "",
    encargado_telefono:     policy?.encargado_telefono   || "",
    registro_rnbd_numero:   policy?.registro_rnbd_numero || "",
    registro_rnbd_fecha:    policy?.registro_rnbd_fecha  || "",
    vigente_desde:          policy?.vigente_desde        || "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true); setMsg("");
    const me = (await supabase.auth.getUser()).data?.user?.email?.toLowerCase();
    const { error } = await supabase.from("habeas_data_policy").update({
      ...f,
      registro_rnbd_fecha: f.registro_rnbd_fecha || null,
      vigente_desde: f.vigente_desde || null,
      ultima_revision: new Date().toISOString(),
      revisado_por: me,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setSaving(false);
    if (error) { setMsg("Error: " + error.message); return; }
    logAccion("habeas_data_policy_updated", { version: f.version });
    setMsg("Guardado. Recordá hacer review anual.");
    onSaved?.();
  }

  return (
    <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), maxWidth: 900 }}>
      <h3 style={{ marginTop: 0 }}>Política de Tratamiento de Datos</h3>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Versión</label>
          <input value={f.version} onChange={e => upd("version", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
        <div>
          <label style={labelStyle}>Vigente desde</label>
          <input type="date" value={f.vigente_desde} onChange={e => upd("vigente_desde", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
        <div>
          <label style={labelStyle}>Última revisión</label>
          <input value={policy?.ultima_revision ? fmtDate(policy.ultima_revision) : "—"} readOnly style={{ ...inputStyle({ isMobile }), opacity: 0.6 }} />
        </div>
      </div>

      <h4 style={{ margin: "16px 0 8px" }}>Encargado del tratamiento</h4>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Nombre</label>
          <input value={f.encargado_tratamiento} onChange={e => upd("encargado_tratamiento", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
        <div>
          <label style={labelStyle}>Email *</label>
          <input type="email" value={f.encargado_email} onChange={e => upd("encargado_email", e.target.value)} placeholder="privacidad@atolon.co" style={inputStyle({ isMobile })} />
        </div>
        <div>
          <label style={labelStyle}>Teléfono</label>
          <input value={f.encargado_telefono} onChange={e => upd("encargado_telefono", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
      </div>

      <h4 style={{ margin: "16px 0 8px" }}>Registro Nacional de Bases de Datos (SIC)</h4>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Número de registro RNBD</label>
          <input value={f.registro_rnbd_numero} onChange={e => upd("registro_rnbd_numero", e.target.value)} placeholder="Si no estás registrado, hacelo en sic.gov.co" style={inputStyle({ isMobile })} />
        </div>
        <div>
          <label style={labelStyle}>Fecha de registro</label>
          <input type="date" value={f.registro_rnbd_fecha} onChange={e => upd("registro_rnbd_fecha", e.target.value)} style={inputStyle({ isMobile })} />
        </div>
      </div>

      <h4 style={{ margin: "16px 0 8px" }}>Texto de la política</h4>
      <textarea value={f.texto_politica} onChange={e => upd("texto_politica", e.target.value)} rows={12}
        style={{ ...inputStyle({ isMobile }), resize: "vertical", minHeight: 200, fontFamily: "monospace", fontSize: 12 }} />

      <h4 style={{ margin: "16px 0 8px" }}>Aviso de privacidad (corto, para forms)</h4>
      <textarea value={f.aviso_privacidad} onChange={e => upd("aviso_privacidad", e.target.value)} rows={4}
        style={{ ...inputStyle({ isMobile }), resize: "vertical", minHeight: 80 }} />

      <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "flex-end", marginTop: S.lg, alignItems: "center" }}>
        {msg && <span style={{ flex: 1, color: msg.startsWith("Error") ? "#fca5a5" : "#86efac", fontSize: T.sm }}>{msg}</span>}
        <button onClick={save} disabled={saving} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff", opacity: saving ? 0.5 : 1 }}>
          {saving ? "Guardando…" : "Guardar política"}
        </button>
      </div>
    </div>
  );
}

function Inventario({ isMobile, inventory }) {
  const BASE_LEGAL_LABEL = {
    contrato:         "Contrato",
    consentimiento:   "Consentimiento",
    obligacion_legal: "Obligación legal",
    interes_legitimo: "Interés legítimo",
  };
  return (
    <>
      <div style={{ color: B.fgMuted, fontSize: T.sm, marginBottom: S.md }}>
        Inventario de tablas con datos personales. Cada entrada corresponde a una base de datos sujeta a registro en RNBD.
      </div>
      <div style={tableWrapper}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
          <thead style={{ background: "rgba(255,255,255,0.04)" }}>
            <tr>
              {["Tabla", "Tipos de dato", "Propósito", "Base legal", "Retención", "Sensibles"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inventory.map(i => (
              <tr key={i.id} style={{ borderBottom: `1px solid ${B.border}`, background: i.contiene_sensibles ? "rgba(245,158,11,0.04)" : "transparent" }}>
                <td style={td}><b>{i.tabla}</b><div style={{ fontSize: 11, color: B.fgMuted }}>{i.descripcion}</div></td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(i.tipos_datos || []).map(t => (
                      <span key={t} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: "rgba(56,189,248,0.15)", color: "#7dd3fc" }}>{t}</span>
                    ))}
                  </div>
                </td>
                <td style={{ ...td, maxWidth: 280 }}>{i.proposito}</td>
                <td style={td}>{BASE_LEGAL_LABEL[i.base_legal] || i.base_legal}</td>
                <td style={td}>{i.retencion_anos} años</td>
                <td style={td}>{i.contiene_sensibles ? <span style={{ color: "#fbbf24", fontWeight: 700 }}>⚠️ SÍ</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inventory.some(i => i.contiene_sensibles) && (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), marginTop: S.md, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <b style={{ color: "#fbbf24" }}>⚠️ Datos sensibles detectados</b>
          <div style={{ fontSize: T.sm, color: B.fgMuted, marginTop: 4 }}>
            Las tablas marcadas requieren consentimiento explícito y reforzado (Decreto 1377/2013 art. 6).
            Validá que tengamos consentimiento por escrito para datos de salud, biométricos y de menores.
          </div>
        </div>
      )}
    </>
  );
}

function Consentimientos({ isMobile, consents }) {
  return (
    <>
      <div style={{ color: B.fgMuted, fontSize: T.sm, marginBottom: S.md }}>
        Últimos {consents.length} consentimientos registrados (max 500). Append-only: revocar = marcar retirado_at.
      </div>
      {consents.length === 0 ? (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center", color: B.fgMuted }}>
          Aún no hay consentimientos registrados. El booking engine debería insertar uno por reserva con la versión de política aceptada.
        </div>
      ) : (
        <div style={tableWrapper}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
            <thead style={{ background: "rgba(255,255,255,0.04)" }}>
              <tr>
                {["Titular", "Tipo", "Versión", "Canal", "Otorgado", "Estado"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {consents.map(c => {
                const activo = !c.retirado_at;
                return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${B.border}` }}>
                    <td style={td}>{c.titular_email}{c.titular_identif && <div style={{ fontSize: 11, color: B.fgMuted }}>ID: {c.titular_identif}</div>}</td>
                    <td style={td}>{c.tipo}</td>
                    <td style={td}>{c.version_politica}</td>
                    <td style={td}>{c.canal_captura || "—"}</td>
                    <td style={td}>{fmtDateTime(c.otorgado_at)}</td>
                    <td style={td}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: activo ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.12)",
                        color: activo ? "#86efac" : "#94a3b8",
                      }}>{activo ? "Activo" : `Retirado ${fmtDate(c.retirado_at)}`}</span>
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

function Solicitudes({ isMobile, requests, onNueva, onEdit }) {
  return (
    <>
      <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "space-between", alignItems: "center", marginBottom: S.md }}>
        <span style={{ color: B.fgMuted, fontSize: T.sm }}>SLA: 10 días hábiles (consultas) · 15 días hábiles (reclamos)</span>
        <button onClick={onNueva} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff" }}>+ Nueva solicitud</button>
      </div>
      {requests.length === 0 ? (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center", color: B.fgMuted }}>
          No hay solicitudes registradas.
        </div>
      ) : (
        <div style={tableWrapper}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
            <thead style={{ background: "rgba(255,255,255,0.04)" }}>
              <tr>
                {["Estado", "Titular", "Tipo", "Recibida", "Vence", "Atendido por", ""].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(r => {
                const tone = ESTADO_TONE[r.estado] || ESTADO_TONE.recibida;
                const dias = (new Date(r.fecha_limite).getTime() - Date.now()) / 86400000;
                const venc = r.estado !== "atendida" && r.estado !== "rechazada" && dias < 0;
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${B.border}`, background: venc ? "rgba(239,68,68,0.06)" : "transparent" }}>
                    <td style={td}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
                      }}>{r.estado}</span>
                      {venc && <div style={{ fontSize: 11, color: "#fca5a5", marginTop: 4 }}>VENCIDA hace {Math.abs(Math.ceil(dias))}d</div>}
                    </td>
                    <td style={td}>
                      {r.titular_email}
                      {r.titular_nombre && <div style={{ fontSize: 11, color: B.fgMuted }}>{r.titular_nombre}</div>}
                    </td>
                    <td style={td}>{TIPO_SOLICITUD_LABEL[r.tipo] || r.tipo}</td>
                    <td style={td}>{fmtDate(r.recibida_at)}</td>
                    <td style={{ ...td, fontWeight: venc ? 700 : 400, color: venc ? "#fca5a5" : dias < 3 ? "#fbbf24" : B.fg }}>
                      {fmtDate(r.fecha_limite)}
                    </td>
                    <td style={td}>{r.atendido_por || "—"}</td>
                    <td style={td}>
                      <button onClick={() => onEdit(r)} style={{ background: "transparent", border: 0, color: B.brand, cursor: "pointer", fontSize: T.xs, textDecoration: "underline" }}>Atender</button>
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

function SolicitudModal({ isMobile, solicitud, onClose, onSaved }) {
  const isEdit = !!solicitud;
  const [f, setF] = useState({
    titular_email:   solicitud?.titular_email   || "",
    titular_nombre:  solicitud?.titular_nombre  || "",
    titular_identif: solicitud?.titular_identif || "",
    tipo:            solicitud?.tipo            || "acceso",
    detalle:         solicitud?.detalle         || "",
    canal_recepcion: solicitud?.canal_recepcion || "email",
    estado:          solicitud?.estado          || "recibida",
    respuesta:       solicitud?.respuesta       || "",
    motivo_rechazo:  solicitud?.motivo_rechazo  || "",
    evidencia_url:   solicitud?.evidencia_url   || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (!f.titular_email.trim()) { setErr("Email del titular obligatorio"); return; }
    if (!f.detalle.trim() || f.detalle.length < 10) { setErr("Detalle obligatorio (mín 10 chars)"); return; }
    setSaving(true);
    const me = (await supabase.auth.getUser()).data?.user?.email?.toLowerCase();
    const payload = { ...f };
    if (f.estado === "atendida" || f.estado === "rechazada") {
      payload.atendido_por = me;
      payload.atendido_at = new Date().toISOString();
    }
    let res;
    if (isEdit) res = await supabase.from("habeas_data_requests").update(payload).eq("id", solicitud.id);
    else        res = await supabase.from("habeas_data_requests").insert(payload);
    if (res.error) { setErr(res.error.message); setSaving(false); return; }
    logAccion(isEdit ? "habeas_data_solicitud_actualizada" : "habeas_data_solicitud_creada",
      { tipo: f.tipo, titular: f.titular_email, estado: f.estado });
    setSaving(false);
    onSaved();
  }

  return (
    <div style={modalOverlay}>
      <div style={modalBox({ isMobile, maxWidth: 640 })}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? "Atender solicitud" : "Nueva solicitud de titular"}</h3>
        {isEdit && (
          <div style={{ marginBottom: 10, fontSize: T.xs, color: B.fgMuted }}>
            Recibida {fmtDateTime(solicitud.recibida_at)} · Vence {fmtDateTime(solicitud.fecha_limite)}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Email del titular *</label>
            <input value={f.titular_email} onChange={e => upd("titular_email", e.target.value)} disabled={isEdit} style={inputStyle({ isMobile })} />
          </div>
          <div>
            <label style={labelStyle}>Nombre</label>
            <input value={f.titular_nombre} onChange={e => upd("titular_nombre", e.target.value)} style={inputStyle({ isMobile })} />
          </div>
          <div>
            <label style={labelStyle}>Identificación</label>
            <input value={f.titular_identif} onChange={e => upd("titular_identif", e.target.value)} style={inputStyle({ isMobile })} />
          </div>
          <div>
            <label style={labelStyle}>Tipo de solicitud *</label>
            <select value={f.tipo} onChange={e => upd("tipo", e.target.value)} disabled={isEdit} style={inputStyle({ isMobile })}>
              {Object.entries(TIPO_SOLICITUD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Canal de recepción</label>
            <select value={f.canal_recepcion} onChange={e => upd("canal_recepcion", e.target.value)} style={inputStyle({ isMobile })}>
              <option value="email">Email</option>
              <option value="formulario_web">Formulario web</option>
              <option value="presencial">Presencial</option>
              <option value="telefono">Teléfono</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Estado</label>
            <select value={f.estado} onChange={e => upd("estado", e.target.value)} style={inputStyle({ isMobile })}>
              <option value="recibida">Recibida</option>
              <option value="en_proceso">En proceso</option>
              <option value="atendida">Atendida</option>
              <option value="rechazada">Rechazada</option>
            </select>
          </div>
        </div>

        <label style={labelStyle}>Detalle de la solicitud *</label>
        <textarea value={f.detalle} onChange={e => upd("detalle", e.target.value)} rows={3}
          placeholder="Qué pide exactamente el titular…"
          style={{ ...inputStyle({ isMobile }), resize: "vertical", minHeight: 70 }} />

        {(f.estado === "atendida" || f.estado === "en_proceso") && (
          <>
            <label style={{ ...labelStyle, marginTop: 10 }}>Respuesta enviada al titular</label>
            <textarea value={f.respuesta} onChange={e => upd("respuesta", e.target.value)} rows={3}
              style={{ ...inputStyle({ isMobile }), resize: "vertical", minHeight: 70 }} />
          </>
        )}

        {f.estado === "rechazada" && (
          <>
            <label style={{ ...labelStyle, marginTop: 10 }}>Motivo de rechazo *</label>
            <textarea value={f.motivo_rechazo} onChange={e => upd("motivo_rechazo", e.target.value)} rows={2}
              style={{ ...inputStyle({ isMobile }), resize: "vertical", minHeight: 50 }} />
          </>
        )}

        <label style={{ ...labelStyle, marginTop: 10 }}>URL de evidencia (PDF, email, etc.)</label>
        <input value={f.evidencia_url} onChange={e => upd("evidencia_url", e.target.value)} placeholder="https://…" style={inputStyle({ isMobile })} />

        {err && <div style={{ color: "#fca5a5", fontSize: T.sm, marginTop: 8 }}>{err}</div>}

        <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "flex-end", marginTop: S.lg }}>
          <button onClick={onClose} style={btnSecondary({ isMobile })}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}
