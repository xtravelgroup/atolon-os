// Módulo "Secretos & Tokens"
// =============================================================
// Inventario de API keys, tokens y webhooks usados por el sistema.
// Permite trackear rotación, criticidad y próximas renovaciones.
// Solo super_admin / contabilidad / auditor deberían tener acceso.

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

const CATEGORIA_COLOR = {
  supabase: "#3ECF8E",
  stripe:   "#635BFF",
  wompi:    "#0DD292",
  zoho:     "#E42527",
  meta:     "#0078FF",
  loggro:   "#F59E0B",
  otros:    "#94A3B8",
};

const MOTIVO_LABEL = {
  calendario:         "Calendario (rotación programada)",
  incidente:          "Incidente / sospecha",
  empleado_saliente:  "Empleado saliente",
  filtracion:         "Filtración / token expuesto",
};

const RUNBOOK_ANON_KEY = `
ROTACIÓN DEL ANON KEY DE SUPABASE
==================================
1. Backup del valor actual (por si necesitás revertir):
   - Supabase Dashboard → Settings → API → copiá el "anon public" actual

2. Generar nuevo anon key:
   - Supabase Dashboard → Settings → API → "Reset" en anon public
   - Copiá el nuevo valor

3. Actualizar Vercel (para el frontend + middleware):
   - Vercel Dashboard → Project → Settings → Environment Variables
   - Editar VITE_SUPABASE_ANON_KEY → pegar nuevo valor
   - Editar SUPABASE_ANON_KEY → mismo valor (el middleware lo lee así)
   - Redeploy

4. Actualizar Supabase Functions Secrets:
   - Supabase Dashboard → Edge Functions → Manage secrets
   - SUPABASE_ANON_KEY → nuevo valor
   - Las funciones tomarán el nuevo valor al próximo invoke

5. Actualizar print-agent (la .exe en cada Bar/Cocina):
   - Editar print-agent/.env con el nuevo SUPABASE_ANON_KEY
   - Reempaquetar:  npm run build:win
   - Distribuir el .exe nuevo a cada PC con AnyDesk

6. Smoke test:
   - atolon.co/cajas
   - atolon.co/muelle
   - atolon.co (login + dashboard)
   - Verificar que el print-agent siga imprimiendo

7. Registrar la rotación en este módulo (botón "Registrar rotación")
`;

const RUNBOOK_SERVICE_ROLE = `
ROTACIÓN DEL SERVICE ROLE KEY DE SUPABASE (CRÍTICO)
====================================================
⚠️ El service_role bypassea RLS. Solo se usa en edge functions y
   en api/* de Vercel.

1. Identificar todos los lugares (ya están en este inventario):
   - Edge functions (admin-users, contratistas-*, loggro-*, etc.)
   - api/* de Vercel (update-tasa, daily-resultados, wompi-poll, etc.)

2. Supabase Dashboard → Settings → API → "Reset" en service_role
   ⚠️ Copiá el nuevo valor en clipboard

3. Vercel env: SUPABASE_SERVICE_ROLE_KEY → nuevo valor → redeploy

4. Supabase Functions Secrets: SUPABASE_SERVICE_ROLE_KEY → nuevo valor

5. Smoke test edge functions críticas:
   - admin-users (crear usuario test)
   - loggro-sync (sync OC)
   - send-whatsapp
`;

export default function Secretos() {
  const { isMobile } = useBreakpoint();
  const [tab, setTab]           = useState("inventario");
  const [secrets, setSecrets]   = useState([]);
  const [rotations, setRotations] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtroCat, setFiltroCat] = useState("todas");
  const [filtroCrit, setFiltroCrit] = useState("todas");
  const [rotateModal, setRotateModal] = useState(null);

  async function loadAll() {
    setLoading(true);
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase.from("secrets_inventory").select("*").eq("activo", true).order("criticidad").order("nombre"),
      supabase.from("secrets_rotations").select("*").order("rotated_at", { ascending: false }).limit(100),
    ]);
    setSecrets(s || []);
    setRotations(r || []);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  const filtered = useMemo(() => secrets.filter(s => {
    if (filtroCat  !== "todas" && s.categoria  !== filtroCat)  return false;
    if (filtroCrit !== "todas" && s.criticidad !== filtroCrit) return false;
    return true;
  }), [secrets, filtroCat, filtroCrit]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const proximas = secrets.filter(s => {
      if (!s.proxima_rotacion) return false;
      const t = new Date(s.proxima_rotacion).getTime();
      return t - now < 30 * 86400000;  // 30 días
    });
    const vencidas = secrets.filter(s => {
      if (!s.proxima_rotacion) return false;
      return new Date(s.proxima_rotacion).getTime() < now;
    });
    const sinRotacion = secrets.filter(s => !s.ultima_rotacion);
    const criticas = secrets.filter(s => s.criticidad === "alta" && (!s.ultima_rotacion || (now - new Date(s.ultima_rotacion).getTime()) > 365 * 86400000));
    return { total: secrets.length, proximas: proximas.length, vencidas: vencidas.length, sinRotacion: sinRotacion.length, criticas: criticas.length };
  }, [secrets]);

  return (
    <div style={{ ...pagePadding({ isMobile }), color: B.fg }}>
      <div style={{ marginBottom: S.lg }}>
        <h1 style={{ fontSize: T.h1, margin: 0, fontWeight: 700 }}>Secretos & Tokens</h1>
        <p style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 6 }}>
          Inventario de API keys, tokens y webhooks del sistema. Trackear rotación y criticidad.
        </p>
      </div>

      {kpis.vencidas > 0 && (
        <div style={{
          padding: 14, borderRadius: 12, marginBottom: S.md,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",
        }}>
          <div style={{ fontWeight: 700, color: "#fca5a5" }}>🚨 {kpis.vencidas} secreto(s) con rotación vencida</div>
          <div style={{ fontSize: T.sm, color: B.fgMuted, marginTop: 4 }}>
            Pasaron más tiempo del recomendado sin rotar. Revisar el listado abajo.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: S.md, marginBottom: S.lg }}>
        <KPI label="Total" value={kpis.total} tone="neutral" />
        <KPI label="Críticos sin rotar > 1 año" value={kpis.criticas} tone={kpis.criticas ? "danger" : "ok"} />
        <KPI label="Vencen en 30 días" value={kpis.proximas} tone={kpis.proximas ? "warn" : "ok"} />
        <KPI label="Vencidos" value={kpis.vencidas} tone={kpis.vencidas ? "danger" : "ok"} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${B.border}`, marginBottom: S.lg, overflowX: "auto" }}>
        {[
          ["inventario", "Inventario"],
          ["historial",  `Historial (${rotations.length})`],
          ["runbook",    "Runbook"],
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
      ) : tab === "inventario" ? (
        <Inventario
          isMobile={isMobile} filtered={filtered}
          filtroCat={filtroCat} setFiltroCat={setFiltroCat}
          filtroCrit={filtroCrit} setFiltroCrit={setFiltroCrit}
          onRotate={(s) => setRotateModal(s)}
        />
      ) : tab === "historial" ? (
        <Historial isMobile={isMobile} rotations={rotations} secrets={secrets} />
      ) : (
        <Runbook isMobile={isMobile} />
      )}

      {rotateModal && (
        <RotateModal
          isMobile={isMobile} secret={rotateModal}
          onClose={() => setRotateModal(null)}
          onSaved={() => { setRotateModal(null); loadAll(); }}
        />
      )}
    </div>
  );
}

const td = { padding: "10px 12px", verticalAlign: "top" };

function Inventario({ isMobile, filtered, filtroCat, setFiltroCat, filtroCrit, setFiltroCrit, onRotate }) {
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
          <label style={labelStyle}>Criticidad</label>
          <select value={filtroCrit} onChange={e => setFiltroCrit(e.target.value)} style={inputStyle({ isMobile })}>
            <option value="todas">Todas</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
      </div>

      <div style={tableWrapper}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
          <thead style={{ background: "rgba(255,255,255,0.04)" }}>
            <tr>
              {["Secreto", "Categoría", "Criticidad", "Última rotación", "Próxima", "Dónde", ""].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const proxT = s.proxima_rotacion ? new Date(s.proxima_rotacion).getTime() : null;
              const vencido = proxT !== null && proxT < Date.now();
              const proximo = proxT !== null && proxT - Date.now() < 30 * 86400000 && !vencido;
              const tone = s.criticidad === "alta" ? "#fca5a5" : s.criticidad === "media" ? "#fbbf24" : "#86efac";
              const tonebg = s.criticidad === "alta" ? "rgba(239,68,68,0.12)" : s.criticidad === "media" ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)";
              return (
                <tr key={s.id} style={{ borderBottom: `1px solid ${B.border}`, background: vencido ? "rgba(239,68,68,0.05)" : "transparent" }}>
                  <td style={td}>
                    <code style={{ fontSize: 12, color: B.fg }}>{s.nombre}</code>
                    <div style={{ fontSize: 11, color: B.fgMuted, marginTop: 2 }}>{s.descripcion}</div>
                  </td>
                  <td style={td}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: (CATEGORIA_COLOR[s.categoria] || "#888") + "22",
                      color: CATEGORIA_COLOR[s.categoria] || "#888",
                    }}>{s.categoria}</span>
                  </td>
                  <td style={td}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: tonebg, color: tone,
                    }}>{s.criticidad.toUpperCase()}</span>
                  </td>
                  <td style={td}>
                    {s.ultima_rotacion ? fmtDate(s.ultima_rotacion)
                      : <span style={{ color: "#fbbf24" }}>nunca</span>}
                  </td>
                  <td style={{ ...td, color: vencido ? "#fca5a5" : proximo ? "#fbbf24" : B.fg, fontWeight: vencido || proximo ? 700 : 400 }}>
                    {s.proxima_rotacion ? fmtDate(s.proxima_rotacion) : "—"}
                    {vencido && <div style={{ fontSize: 11 }}>VENCIDO</div>}
                  </td>
                  <td style={{ ...td, fontSize: 11, color: B.fgMuted, maxWidth: 200 }}>{s.donde_se_configura}</td>
                  <td style={td}>
                    {s.rotable && (
                      <button onClick={() => onRotate(s)} style={{
                        background: "transparent", border: 0, color: B.brand,
                        cursor: "pointer", fontSize: T.xs, textDecoration: "underline",
                      }}>Registrar rotación</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Historial({ isMobile, rotations, secrets }) {
  const byId = Object.fromEntries(secrets.map(s => [s.id, s]));
  if (!rotations.length) return (
    <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center", color: B.fgMuted }}>
      Sin rotaciones registradas. Cuando rotes un secreto, registralo desde el botón en el inventario.
    </div>
  );
  return (
    <div style={tableWrapper}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
        <thead style={{ background: "rgba(255,255,255,0.04)" }}>
          <tr>
            {["Fecha", "Secreto", "Motivo", "Operador", "Notas"].map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rotations.map(r => (
            <tr key={r.id} style={{ borderBottom: `1px solid ${B.border}` }}>
              <td style={td}>{fmtDate(r.rotated_at)}</td>
              <td style={td}><code style={{ fontSize: 12 }}>{byId[r.secret_id]?.nombre || r.secret_id}</code></td>
              <td style={td}>{MOTIVO_LABEL[r.motivo] || r.motivo || "—"}</td>
              <td style={td}>{r.rotated_by || "—"}</td>
              <td style={{ ...td, fontSize: T.xs, color: B.fgMuted, maxWidth: 320 }}>{r.notas || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Runbook({ isMobile }) {
  return (
    <div>
      <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), marginBottom: S.md }}>
        <h3 style={{ marginTop: 0 }}>Anon key Supabase</h3>
        <pre style={{
          whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace",
          fontSize: 12, color: B.fg, lineHeight: 1.5, margin: 0,
          background: "rgba(0,0,0,0.25)", padding: 12, borderRadius: 8, overflowX: "auto",
        }}>{RUNBOOK_ANON_KEY}</pre>
      </div>
      <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }) }}>
        <h3 style={{ marginTop: 0 }}>Service Role Supabase ⚠️</h3>
        <pre style={{
          whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace",
          fontSize: 12, color: B.fg, lineHeight: 1.5, margin: 0,
          background: "rgba(0,0,0,0.25)", padding: 12, borderRadius: 8, overflowX: "auto",
        }}>{RUNBOOK_SERVICE_ROLE}</pre>
      </div>
    </div>
  );
}

function KPI({ label, value, tone = "neutral" }) {
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
    </div>
  );
}

function RotateModal({ isMobile, secret, onClose, onSaved }) {
  const [motivo, setMotivo] = useState("calendario");
  const [notas, setNotas]   = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");

  async function save() {
    setSaving(true); setErr("");
    const me = (await supabase.auth.getUser()).data?.user?.email?.toLowerCase();
    const { error } = await supabase.from("secrets_rotations").insert({
      secret_id: secret.id,
      rotated_by: me,
      motivo,
      notas: notas.trim() || null,
    });
    if (error) { setErr(error.message); setSaving(false); return; }
    logAccion("secret_rotated", { secret: secret.nombre, motivo });
    setSaving(false);
    onSaved();
  }

  return (
    <div style={modalOverlay}>
      <div style={modalBox({ isMobile, maxWidth: 480 })}>
        <h3 style={{ marginTop: 0 }}>Registrar rotación</h3>
        <p style={{ color: B.fgMuted, fontSize: T.sm }}>
          <code>{secret.nombre}</code>
        </p>

        <label style={labelStyle}>Motivo</label>
        <select value={motivo} onChange={e => setMotivo(e.target.value)} style={inputStyle({ isMobile })}>
          {Object.entries(MOTIVO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>

        <label style={{ ...labelStyle, marginTop: 12 }}>Notas (opcional)</label>
        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
          placeholder="Razón específica, contexto, etc."
          style={{ ...inputStyle({ isMobile }), resize: "vertical", minHeight: 80 }} />

        {err && <div style={{ color: "#fca5a5", fontSize: T.sm, marginTop: 8 }}>{err}</div>}

        <div style={{ ...flexRow({ isMobile, gap: 8 }), justifyContent: "flex-end", marginTop: S.lg }}>
          <button onClick={onClose} style={btnSecondary({ isMobile })}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimary({ isMobile }), background: B.brand, color: "#fff", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Guardando…" : "Confirmar rotación"}
          </button>
        </div>
      </div>
    </div>
  );
}
