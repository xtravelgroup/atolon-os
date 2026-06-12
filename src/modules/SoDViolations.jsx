// KPMG C-4 · Módulo "Segregación de Funciones (SoD)"
// =============================================================
// Vista para super_admin / auditor. Muestra:
//   1) Violaciones detectadas en datos actuales (sod_violations_log)
//   2) Excepciones autorizadas vigentes y vencidas (sod_exceptions)
//   3) Política activa (matriz hard-coded en el trigger)
//
// Solo lectura para auditor. Super_admin puede crear/expirar excepciones.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { logAccion } from "../lib/logAccion";
import { useBreakpoint } from "../lib/responsive";
import {
  pagePadding, cardPadding, sectionCard, tableWrapper,
  inputStyle, btnPrimary, btnSecondary, modalOverlay, modalBox,
  flexRow, labelStyle, T, S, TOUCH_TARGET,
} from "../lib/responsive";

const fmt$ = n => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fmtDate = s => s ? new Date(s).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function SoDViolations() {
  const { isMobile } = useBreakpoint();
  const [violations, setViolations] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [usuarios, setUsuarios]     = useState({});  // id → {nombre, rol}
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState("violaciones");
  const [showNuevaExcepcion, setShowNuevaExcepcion] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [{ data: vs }, { data: es }, { data: us }] = await Promise.all([
      supabase.from("sod_violations_log").select("*").order("ocurrido_at", { ascending: false }),
      supabase.from("sod_exceptions").select("*").order("valido_hasta", { ascending: false }),
      supabase.from("usuarios").select("id,nombre,rol_id"),
    ]);
    const map = {};
    (us || []).forEach(u => { map[u.id] = u; });
    setUsuarios(map);
    setViolations(vs || []);
    setExceptions(es || []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const expVigentes = exceptions.filter(e => new Date(e.valido_hasta) > new Date());
  const expVencidas = exceptions.filter(e => new Date(e.valido_hasta) <= new Date());

  return (
    <div style={{ ...pagePadding({ isMobile }), color: B.fg }}>
      <div style={{ marginBottom: S.lg }}>
        <h1 style={{ fontSize: T.h1, margin: 0, fontWeight: 700 }}>Segregación de Funciones (SoD)</h1>
        <p style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 6 }}>
          KPMG C-4 · Matriz de incompatibilidad de roles. Detecta y previene que el mismo usuario cumpla funciones que deberían estar separadas.
        </p>
      </div>

      {/* Resumen */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
        gap: S.md, marginBottom: S.lg,
      }}>
        <KPI label="Violaciones detectadas" value={violations.length} tone={violations.length === 0 ? "ok" : "danger"} />
        <KPI label="Excepciones vigentes" value={expVigentes.length} tone={expVigentes.length === 0 ? "ok" : "warn"} />
        <KPI label="Excepciones vencidas" value={expVencidas.length} tone="neutral" />
        <KPI label="Triggers activos" value={2} tone="ok" subtitle="req + OC" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${B.border}`, marginBottom: S.lg }}>
        {[
          ["violaciones", `Violaciones (${violations.length})`],
          ["excepciones", `Excepciones (${expVigentes.length})`],
          ["matriz", "Matriz activa"],
        ].map(([k, l]) => (
          <button key={k}
            onClick={() => setTab(k)}
            style={{
              padding: "10px 16px", background: "transparent",
              border: 0, borderBottom: tab === k ? `2px solid ${B.brand}` : "2px solid transparent",
              color: tab === k ? B.brand : B.fgMuted, fontWeight: 600,
              cursor: "pointer", fontSize: T.sm, minHeight: TOUCH_TARGET,
            }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center" }}>Cargando…</div>
      ) : tab === "violaciones" ? (
        violations.length === 0 ? (
          <div style={{
            ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center",
            border: `1px solid rgba(34,197,94,0.3)`, background: "rgba(34,197,94,0.08)",
          }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <h3 style={{ color: "#86efac", marginTop: 8 }}>Sin violaciones de SoD</h3>
            <p style={{ color: B.fgMuted, fontSize: T.sm }}>
              Ningún usuario cumple roles incompatibles en transacciones cerradas.
            </p>
          </div>
        ) : (
          <div style={tableWrapper}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
              <thead style={{ background: "rgba(255,255,255,0.04)" }}>
                <tr>
                  {["Tabla", "Doc", "Usuario en conflicto", "Roles", "Contexto", "Monto", "Cuándo"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {violations.map(v => {
                  const u = usuarios[v.usuario_a];
                  return (
                    <tr key={`${v.tabla}-${v.row_id}`} style={{ borderBottom: `1px solid ${B.border}`, background: "rgba(239,68,68,0.04)" }}>
                      <td style={tdS}>{v.tabla}</td>
                      <td style={tdS}><code style={{ fontSize: 11 }}>{v.row_id}</code></td>
                      <td style={tdS}>{u?.nombre || v.usuario_a} <span style={{ color: B.fgMuted, fontSize: 11 }}>{u?.rol_id}</span></td>
                      <td style={tdS}>{v.rol_a} + {v.rol_b}</td>
                      <td style={tdS}>{v.contexto}</td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmt$(v.monto)}</td>
                      <td style={tdS}>{fmtDate(v.ocurrido_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : tab === "excepciones" ? (
        <div>
          <div style={{ ...flexRow({ isMobile }), justifyContent: "space-between", alignItems: "center", marginBottom: S.md }}>
            <span style={{ color: B.fgMuted, fontSize: T.sm }}>Excepciones autorizadas — vigentes primero</span>
            <button onClick={() => setShowNuevaExcepcion(true)} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff" }}>+ Nueva excepción</button>
          </div>
          {exceptions.length === 0 ? (
            <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center", color: B.fgMuted }}>
              No hay excepciones registradas. Esto es lo ideal.
            </div>
          ) : (
            <div style={tableWrapper}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
                <thead style={{ background: "rgba(255,255,255,0.04)" }}>
                  <tr>
                    {["Estado", "Tabla", "Usuario", "Motivo", "Autorizado por", "Desde", "Hasta"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map(e => {
                    const vigente = new Date(e.valido_hasta) > new Date();
                    return (
                      <tr key={e.id} style={{ borderBottom: `1px solid ${B.border}` }}>
                        <td style={tdS}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            background: vigente ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.15)",
                            color: vigente ? "#fbbf24" : "#94a3b8",
                          }}>{vigente ? "VIGENTE" : "Vencida"}</span>
                        </td>
                        <td style={tdS}>{e.tabla}</td>
                        <td style={tdS}>{usuarios[e.usuario_id]?.nombre || e.usuario_id}</td>
                        <td style={{ ...tdS, maxWidth: 280 }}>{e.motivo}</td>
                        <td style={tdS}>{usuarios[e.autorizado_por]?.nombre || e.autorizado_por}</td>
                        <td style={tdS}>{fmtDate(e.valido_desde)}</td>
                        <td style={tdS}>{fmtDate(e.valido_hasta)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        // Matriz hard-coded del trigger
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }) }}>
          <h3 style={{ marginTop: 0 }}>Reglas activas (enforced en BD)</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
            <thead style={{ background: "rgba(255,255,255,0.04)" }}>
              <tr>
                {["Rol A", "Rol B", "Tabla", "Cuándo se gatilla", "Acción"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: `1px solid ${B.border}` }}>
                <td style={tdS}>Solicitante</td>
                <td style={tdS}>Aprobador</td>
                <td style={tdS}><code>requisiciones</code></td>
                <td style={tdS}>UPDATE estado → Aprobada/Rechazada</td>
                <td style={tdS}><span style={{ color: "#fca5a5" }}>BLOQUEAR</span></td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${B.border}` }}>
                <td style={tdS}>Emisor</td>
                <td style={tdS}>Pagador anticipo</td>
                <td style={tdS}><code>ordenes_compra</code></td>
                <td style={tdS}>UPDATE anticipo_pagado = true</td>
                <td style={tdS}><span style={{ color: "#fca5a5" }}>BLOQUEAR</span></td>
              </tr>
            </tbody>
          </table>
          <p style={{ color: B.fgMuted, fontSize: T.xs, marginTop: 16 }}>
            Excepción: si un super_admin registra una entrada vigente en <code>sod_exceptions</code>, el trigger deja pasar la operación (queda registrada en audit_log para revisión posterior).
          </p>
        </div>
      )}

      {showNuevaExcepcion && (
        <NuevaExcepcionModal
          isMobile={isMobile}
          usuarios={Object.values(usuarios)}
          onClose={() => setShowNuevaExcepcion(false)}
          onSaved={() => { setShowNuevaExcepcion(false); loadAll(); }}
        />
      )}
    </div>
  );
}

function KPI({ label, value, tone = "neutral", subtitle }) {
  const colors = {
    ok:      { border: "rgba(34,197,94,0.3)",  bg: "rgba(34,197,94,0.08)",  fg: "#86efac" },
    warn:    { border: "rgba(245,158,11,0.3)", bg: "rgba(245,158,11,0.08)", fg: "#fbbf24" },
    danger:  { border: "rgba(239,68,68,0.3)",  bg: "rgba(239,68,68,0.08)",  fg: "#fca5a5" },
    neutral: { border: B.border,               bg: "rgba(255,255,255,0.03)", fg: B.fg     },
  }[tone];
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      border: `1px solid ${colors.border}`, background: colors.bg,
    }}>
      <div style={{ fontSize: T.xs, color: B.fgMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: T.h2, fontWeight: 800, color: colors.fg, marginTop: 4 }}>{value}</div>
      {subtitle && <div style={{ fontSize: T.xs, color: B.fgMuted, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

const tdS = { padding: "10px 12px", verticalAlign: "top" };

function NuevaExcepcionModal({ isMobile, usuarios, onClose, onSaved }) {
  const [tabla, setTabla]               = useState("requisiciones");
  const [usuarioId, setUsuarioId]       = useState("");
  const [motivo, setMotivo]             = useState("");
  const [diasVigencia, setDiasVigencia] = useState(7);
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState("");

  async function save() {
    setErr("");
    if (motivo.trim().length < 20) { setErr("El motivo debe tener al menos 20 caracteres."); return; }
    if (!usuarioId) { setErr("Seleccioná el usuario."); return; }
    if (diasVigencia < 1 || diasVigencia > 90) { setErr("Vigencia entre 1 y 90 días."); return; }
    setSaving(true);
    const me = (await supabase.auth.getUser()).data?.user?.email?.toLowerCase();
    const { data: myRow } = await supabase.from("usuarios").select("id").eq("email", me).single();
    const validoHasta = new Date(Date.now() + diasVigencia * 86400000).toISOString();
    const { error } = await supabase.from("sod_exceptions").insert({
      tabla, usuario_id: usuarioId, motivo: motivo.trim(),
      autorizado_por: myRow?.id || me, valido_hasta: validoHasta,
    });
    if (error) { setErr(error.message); setSaving(false); return; }
    logAccion("sod_excepcion_creada", { tabla, usuario_id: usuarioId, dias: diasVigencia, motivo });
    onSaved();
  }

  return (
    <div style={modalOverlay}>
      <div style={modalBox({ isMobile, maxWidth: 520 })}>
        <h3 style={{ marginTop: 0 }}>Nueva excepción de SoD</h3>
        <p style={{ color: B.fgMuted, fontSize: T.sm }}>
          Permite que un usuario realice 2 roles incompatibles temporalmente. Queda registrado para auditoría.
        </p>

        <label style={labelStyle}>Tabla</label>
        <select value={tabla} onChange={e => setTabla(e.target.value)} style={inputStyle({ isMobile })}>
          <option value="requisiciones">requisiciones (autoaprobación)</option>
          <option value="ordenes_compra">ordenes_compra (autopago)</option>
        </select>

        <label style={{ ...labelStyle, marginTop: S.md }}>Usuario beneficiario</label>
        <select value={usuarioId} onChange={e => setUsuarioId(e.target.value)} style={inputStyle({ isMobile })}>
          <option value="">— Seleccionar —</option>
          {usuarios.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")).map(u => (
            <option key={u.id} value={u.id}>{u.nombre} ({u.rol_id})</option>
          ))}
        </select>

        <label style={{ ...labelStyle, marginTop: S.md }}>Motivo (mínimo 20 caracteres)</label>
        <textarea
          value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder="Ej: Único cajero disponible durante feriado XYZ, urgencia operativa autorizada por Gerencia el…"
          rows={4} style={{ ...inputStyle({ isMobile }), resize: "vertical", minHeight: 90 }}
        />

        <label style={{ ...labelStyle, marginTop: S.md }}>Vigencia (días)</label>
        <input type="number" min={1} max={90} value={diasVigencia}
          onChange={e => setDiasVigencia(Number(e.target.value) || 7)} style={inputStyle({ isMobile })} />

        {err && <div style={{ color: "#fca5a5", fontSize: T.sm, marginTop: 10 }}>{err}</div>}

        <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "flex-end", marginTop: S.lg }}>
          <button onClick={onClose} style={btnSecondary({ isMobile })}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Guardando…" : "Crear excepción"}
          </button>
        </div>
      </div>
    </div>
  );
}
