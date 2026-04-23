// ═══════════════════════════════════════════════════════════════════════════
// ApiPortal.jsx — Admin UI to manage the Partner API (OTAs / agencies / etc.)
// Tabs: Partners · Keys · Logs · Webhooks · Docs
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const CARD = { background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 12, padding: 18 };
const BTN  = { background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const BTN_SECONDARY = { ...BTN, background: B.navyLight, color: B.white };
const BTN_DANGER    = { ...BTN, background: B.danger, color: B.white };

const FN_URL = (() => {
  const u = import.meta?.env?.VITE_SUPABASE_URL || "";
  return u ? `${u.replace(/\/$/, "")}/functions/v1/partners-api` : "https://YOUR-PROJECT.supabase.co/functions/v1/partners-api";
})();

const TIPOS = ["OTA", "Agencia", "Integrador", "Revendedor"];
const ESTADOS = ["pendiente", "activo", "suspendido"];
const EVENTOS_WEBHOOK = ["reserva.created", "reserva.cancelled", "disponibilidad.updated"];

// ─── SHA-256 helper (client-side, used to hash new keys before storing) ────
async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}
function genApiKey() {
  return "sk_atolon_" + randomHex(16); // 32 hex chars
}
function copyToClipboard(text) {
  try { navigator.clipboard.writeText(text); return true; } catch { return false; }
}
function fmtDate(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("es-CO", { timeZone: "America/Bogota" }); } catch { return ts; }
}
function statusColor(code) {
  if (!code) return B.sand;
  if (code < 300) return B.success;
  if (code < 400) return B.sky;
  if (code < 500) return B.warning;
  return B.danger;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function ApiPortal() {
  const [tab, setTab] = useState("partners");

  const TABS = [
    { key: "partners", label: "Partners",  icon: "🤝" },
    { key: "keys",     label: "API Keys",  icon: "🔑" },
    { key: "logs",     label: "Logs",      icon: "📋" },
    { key: "webhooks", label: "Webhooks",  icon: "🪝" },
    { key: "docs",     label: "Docs",      icon: "📘" },
  ];

  return (
    <div style={{ padding: 24, background: B.navy, minHeight: "100vh", color: B.white }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 24 }}>🔌</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>API Portal</h1>
          <div style={{ fontSize: 12, color: B.sand, marginTop: 2 }}>
            Gestión de partners, keys y webhooks — <code style={{ color: B.sky }}>{FN_URL}</code>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: `1px solid ${B.navyLight}`, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? B.navyLight : "transparent",
              color: tab === t.key ? B.white : B.sand,
              border: "none",
              borderBottom: tab === t.key ? `2px solid ${B.sky}` : "2px solid transparent",
              padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              borderRadius: "6px 6px 0 0",
            }}>
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === "partners" && <PartnersTab />}
      {tab === "keys"     && <KeysTab />}
      {tab === "logs"     && <LogsTab />}
      {tab === "webhooks" && <WebhooksTab />}
      {tab === "docs"     && <DocsTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTNERS TAB
// ═══════════════════════════════════════════════════════════════════════════
function PartnersTab() {
  const [partners, setPartners] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew]   = useState(false);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("api_partners").select("*").order("created_at", { ascending: false });
    setPartners(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "380px 1fr" : "1fr", gap: 16 }}>
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Partners ({partners.length})</div>
          <button style={BTN} onClick={() => setShowNew(true)}>+ Nuevo</button>
        </div>
        {loading && <div style={{ color: B.sand, fontSize: 12 }}>Cargando…</div>}
        {!loading && partners.length === 0 && <div style={{ color: B.sand, fontSize: 12 }}>Sin partners todavía.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {partners.map(p => (
            <button key={p.id} onClick={() => setSelected(p)}
              style={{
                textAlign: "left", background: selected?.id === p.id ? B.navyLight : "transparent",
                border: `1px solid ${B.navyLight}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer", color: B.white,
              }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.nombre}</div>
              <div style={{ fontSize: 11, color: B.sand, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span>{p.tipo}</span>
                <EstadoBadge estado={p.estado} />
                {p.empresa && <span>· {p.empresa}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <PartnerDetail partner={selected} onClose={() => setSelected(null)} onSaved={load} />
      )}

      {showNew && <PartnerForm onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function EstadoBadge({ estado }) {
  const c = estado === "activo" ? B.success : estado === "suspendido" ? B.danger : B.warning;
  return <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 10, background: c + "22", color: c, fontWeight: 700, textTransform: "uppercase" }}>{estado}</span>;
}

function PartnerDetail({ partner, onClose, onSaved }) {
  const [f, setF] = useState(partner);
  useEffect(() => setF(partner), [partner]);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const save = async () => {
    await supabase.from("api_partners").update({
      nombre: f.nombre, email: f.email, empresa: f.empresa,
      tipo: f.tipo, estado: f.estado, notas: f.notas,
      updated_at: new Date().toISOString(),
    }).eq("id", f.id);
    onSaved();
  };
  const del = async () => {
    if (!confirm(`¿Eliminar partner "${f.nombre}"? Borrará sus keys y webhooks.`)) return;
    await supabase.from("api_partners").delete().eq("id", f.id);
    onClose(); onSaved();
  };

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{f.nombre}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 18, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
        <div><label style={LS}>Nombre</label><input style={IS} value={f.nombre || ""} onChange={e => s("nombre", e.target.value)} /></div>
        <div><label style={LS}>Empresa</label><input style={IS} value={f.empresa || ""} onChange={e => s("empresa", e.target.value)} /></div>
        <div><label style={LS}>Email</label><input style={IS} value={f.email || ""} onChange={e => s("email", e.target.value)} /></div>
        <div><label style={LS}>Tipo</label>
          <select style={IS} value={f.tipo} onChange={e => s("tipo", e.target.value)}>
            {TIPOS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label style={LS}>Estado</label>
          <select style={IS} value={f.estado} onChange={e => s("estado", e.target.value)}>
            {ESTADOS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label style={LS}>ID</label><input style={{ ...IS, opacity: 0.6 }} value={f.id} readOnly /></div>
      </div>
      <div><label style={LS}>Notas</label><textarea style={{ ...IS, minHeight: 80, resize: "vertical" }} value={f.notas || ""} onChange={e => s("notas", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "space-between" }}>
        <button style={BTN_DANGER} onClick={del}>Eliminar</button>
        <button style={BTN} onClick={save}>Guardar</button>
      </div>
    </div>
  );
}

function PartnerForm({ onClose, onSaved }) {
  const [f, setF] = useState({ nombre: "", email: "", empresa: "", tipo: "Integrador", estado: "pendiente", notas: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!f.nombre.trim()) { alert("Nombre requerido"); return; }
    setBusy(true);
    const id = `P-${Date.now().toString(36).toUpperCase()}`;
    const { error } = await supabase.from("api_partners").insert({ id, ...f });
    setBusy(false);
    if (error) { alert(error.message); return; }
    onSaved();
  };

  return (
    <Modal title="Nuevo Partner" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><label style={LS}>Nombre *</label><input style={IS} value={f.nombre} onChange={e => s("nombre", e.target.value)} /></div>
        <div><label style={LS}>Empresa</label><input style={IS} value={f.empresa} onChange={e => s("empresa", e.target.value)} /></div>
        <div><label style={LS}>Email</label><input style={IS} value={f.email} onChange={e => s("email", e.target.value)} /></div>
        <div><label style={LS}>Tipo</label>
          <select style={IS} value={f.tipo} onChange={e => s("tipo", e.target.value)}>
            {TIPOS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div><label style={LS}>Estado</label>
          <select style={IS} value={f.estado} onChange={e => s("estado", e.target.value)}>
            {ESTADOS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <label style={LS}>Notas</label>
      <textarea style={{ ...IS, minHeight: 70 }} value={f.notas} onChange={e => s("notas", e.target.value)} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={BTN_SECONDARY} onClick={onClose}>Cancelar</button>
        <button style={BTN} onClick={save} disabled={busy}>{busy ? "Creando…" : "Crear Partner"}</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYS TAB
// ═══════════════════════════════════════════════════════════════════════════
function KeysTab() {
  const [keys, setKeys] = useState([]);
  const [partners, setPartners] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [revealed, setRevealed] = useState(null); // { key, prefix }
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: k }, { data: p }] = await Promise.all([
      supabase.from("api_partner_keys").select("*").order("created_at", { ascending: false }),
      supabase.from("api_partners").select("id, nombre").order("nombre"),
    ]);
    setKeys(k || []);
    setPartners(p || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const partnerName = id => partners.find(p => p.id === id)?.nombre || id;

  const revoke = async id => {
    if (!confirm("¿Revocar esta key? El partner perderá acceso inmediatamente.")) return;
    await supabase.from("api_partner_keys")
      .update({ estado: "revocada", revoked_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>API Keys ({keys.length})</div>
        <button style={BTN} onClick={() => setShowNew(true)}>+ Generar nueva key</button>
      </div>
      {loading && <div style={{ color: B.sand, fontSize: 12 }}>Cargando…</div>}
      {!loading && keys.length === 0 && <div style={{ color: B.sand, fontSize: 12 }}>Aún no se han generado keys.</div>}
      <div style={{ display: "grid", gap: 6 }}>
        {keys.map(k => (
          <div key={k.id} style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 90px 120px 120px auto",
            gap: 12, alignItems: "center",
            padding: "10px 12px",
            background: k.estado === "activa" ? B.navy : B.navy + "88",
            border: `1px solid ${B.navyLight}`,
            borderRadius: 8,
            opacity: k.estado === "activa" ? 1 : 0.6,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{partnerName(k.partner_id)}</div>
              <div style={{ fontSize: 11, color: B.sand }}>{k.nombre || "(sin nombre)"}</div>
            </div>
            <code style={{ fontSize: 12, color: B.sky, background: B.navyLight, padding: "4px 8px", borderRadius: 6 }}>
              {k.key_prefix}…
            </code>
            <EstadoBadge estado={k.estado === "activa" ? "activo" : "suspendido"} />
            <div style={{ fontSize: 11, color: B.sand }}>{k.rate_limit_per_min}/min</div>
            <div style={{ fontSize: 11, color: B.sand }}>{k.last_used_at ? fmtDate(k.last_used_at) : "nunca"}</div>
            <div>
              {k.estado === "activa" && (
                <button style={{ ...BTN_DANGER, padding: "5px 10px", fontSize: 11 }} onClick={() => revoke(k.id)}>Revocar</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <NewKeyForm
          partners={partners}
          onClose={() => setShowNew(false)}
          onGenerated={(full, prefix) => { setShowNew(false); setRevealed({ key: full, prefix }); load(); }}
        />
      )}
      {revealed && <RevealKeyModal data={revealed} onClose={() => setRevealed(null)} />}
    </div>
  );
}

function NewKeyForm({ partners, onClose, onGenerated }) {
  const [partnerId, setPartnerId] = useState(partners[0]?.id || "");
  const [nombre, setNombre]       = useState("Producción");
  const [rateLimit, setRateLimit] = useState(60);
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);

  const gen = async () => {
    if (!partnerId) { alert("Selecciona un partner"); return; }
    setBusy(true);
    const fullKey = genApiKey();
    const hash = await sha256Hex(fullKey);
    const prefix = fullKey.slice(0, 12);
    const { error } = await supabase.from("api_partner_keys").insert({
      partner_id: partnerId,
      key_hash:   hash,
      key_prefix: prefix,
      nombre,
      rate_limit_per_min: Number(rateLimit) || 60,
      expires_at: expiresAt || null,
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    onGenerated(fullKey, prefix);
  };

  return (
    <Modal title="Generar nueva API Key" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={LS}>Partner *</label>
          <select style={IS} value={partnerId} onChange={e => setPartnerId(e.target.value)}>
            <option value="">— elegir —</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div><label style={LS}>Etiqueta</label><input style={IS} value={nombre} onChange={e => setNombre(e.target.value)} /></div>
        <div><label style={LS}>Rate limit (req/min)</label><input style={IS} type="number" value={rateLimit} onChange={e => setRateLimit(e.target.value)} /></div>
        <div><label style={LS}>Expira (opcional)</label><input style={IS} type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></div>
      </div>
      <div style={{ fontSize: 11, color: B.warning, background: B.warning + "11", padding: 10, borderRadius: 8, marginBottom: 14 }}>
        ⚠ La key completa solo se mostrará UNA vez después de generarla. Guárdala de inmediato.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={BTN_SECONDARY} onClick={onClose}>Cancelar</button>
        <button style={BTN} onClick={gen} disabled={busy}>{busy ? "Generando…" : "Generar Key"}</button>
      </div>
    </Modal>
  );
}

function RevealKeyModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="🔑 Tu API Key (solo visible ahora)" onClose={onClose} size="md">
      <div style={{ fontSize: 12, color: B.sand, marginBottom: 10 }}>
        Copia esta key y guárdala en un lugar seguro. No podrás verla de nuevo — solo el prefijo <code>{data.prefix}</code>.
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: B.navy, border: `2px solid ${B.sky}`, borderRadius: 8, padding: "12px 14px",
        marginBottom: 14,
      }}>
        <code style={{ flex: 1, fontSize: 13, color: B.sky, wordBreak: "break-all" }}>{data.key}</code>
        <button style={{ ...BTN, padding: "6px 12px", fontSize: 11 }}
          onClick={() => { copyToClipboard(data.key); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: B.sand, background: B.navyLight, padding: 10, borderRadius: 8, marginBottom: 14 }}>
        Uso: <code style={{ color: B.sky }}>Authorization: Bearer {data.key.slice(0, 18)}…</code>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button style={BTN} onClick={onClose}>Entendido, la guardé</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGS TAB
// ═══════════════════════════════════════════════════════════════════════════
function LogsTab() {
  const [logs, setLogs]         = useState([]);
  const [partners, setPartners] = useState([]);
  const [fPartner, setFPartner] = useState("");
  const [fEndpoint, setFEndpoint] = useState("");
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("api_partner_logs").select("*").order("ts", { ascending: false }).limit(200);
    if (fPartner)  q = q.eq("partner_id", fPartner);
    if (fEndpoint) q = q.eq("endpoint",   fEndpoint);
    const { data } = await q;
    setLogs(data || []);
    setLoading(false);
  }, [fPartner, fEndpoint]);

  useEffect(() => {
    supabase.from("api_partners").select("id, nombre").order("nombre").then(({ data }) => setPartners(data || []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const endpoints = useMemo(() => Array.from(new Set(logs.map(l => l.endpoint).filter(Boolean))), [logs]);

  return (
    <div style={CARD}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginRight: 8 }}>Logs recientes</div>
        <select style={{ ...IS, width: 200 }} value={fPartner} onChange={e => setFPartner(e.target.value)}>
          <option value="">Todos los partners</option>
          {partners.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select style={{ ...IS, width: 220 }} value={fEndpoint} onChange={e => setFEndpoint(e.target.value)}>
          <option value="">Todos los endpoints</option>
          {endpoints.map(e => <option key={e}>{e}</option>)}
        </select>
        <button style={BTN_SECONDARY} onClick={load}>↻ Recargar</button>
      </div>
      {loading && <div style={{ color: B.sand, fontSize: 12 }}>Cargando…</div>}
      {!loading && logs.length === 0 && <div style={{ color: B.sand, fontSize: 12 }}>Sin logs.</div>}
      <div style={{ display: "grid", gap: 4, fontSize: 12 }}>
        {logs.map(l => (
          <details key={l.id} style={{ background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 6, padding: "6px 10px" }}>
            <summary style={{ display: "grid", gridTemplateColumns: "150px 60px 1fr 70px 70px 1fr", gap: 10, alignItems: "center", cursor: "pointer", listStyle: "none" }}>
              <span style={{ color: B.sand, fontSize: 11 }}>{fmtDate(l.ts)}</span>
              <span style={{ fontWeight: 700, color: B.sky }}>{l.metodo}</span>
              <code style={{ color: B.white }}>{l.endpoint}</code>
              <span style={{ color: statusColor(l.status_code), fontWeight: 700 }}>{l.status_code || "—"}</span>
              <span style={{ color: B.sand }}>{l.duration_ms ?? 0}ms</span>
              <span style={{ color: B.sand, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>{l.partner_id || "—"}</span>
            </summary>
            <div style={{ marginTop: 8, fontSize: 11, display: "grid", gap: 6 }}>
              {l.error_msg && <div style={{ color: B.danger }}>✗ {l.error_msg}</div>}
              {l.request_query && <div><b>Query:</b> <code>{JSON.stringify(l.request_query)}</code></div>}
              {l.request_body  && <div><b>Body:</b>  <code>{JSON.stringify(l.request_body).slice(0, 400)}</code></div>}
              {l.response_body && <div><b>Resp:</b>  <code>{JSON.stringify(l.response_body).slice(0, 400)}</code></div>}
              <div style={{ color: B.sand }}>IP: {l.client_ip || "—"}</div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOKS TAB
// ═══════════════════════════════════════════════════════════════════════════
function WebhooksTab() {
  const [hooks, setHooks]       = useState([]);
  const [partners, setPartners] = useState([]);
  const [showNew, setShowNew]   = useState(false);

  const load = useCallback(async () => {
    const [{ data: h }, { data: p }] = await Promise.all([
      supabase.from("api_partner_webhooks").select("*").order("created_at", { ascending: false }),
      supabase.from("api_partners").select("id, nombre").order("nombre"),
    ]);
    setHooks(h || []);
    setPartners(p || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const partnerName = id => partners.find(p => p.id === id)?.nombre || id;
  const toggle = async (h) => {
    await supabase.from("api_partner_webhooks").update({ activo: !h.activo, updated_at: new Date().toISOString() }).eq("id", h.id);
    load();
  };
  const del = async (id) => {
    if (!confirm("¿Eliminar webhook?")) return;
    await supabase.from("api_partner_webhooks").delete().eq("id", id);
    load();
  };

  return (
    <div style={CARD}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Webhooks ({hooks.length})</div>
        <button style={BTN} onClick={() => setShowNew(true)}>+ Nuevo webhook</button>
      </div>
      {hooks.length === 0 && <div style={{ color: B.sand, fontSize: 12 }}>Sin webhooks configurados.</div>}
      <div style={{ display: "grid", gap: 6 }}>
        {hooks.map(h => (
          <div key={h.id} style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1.5fr 80px 80px", gap: 10, alignItems: "center", padding: "10px 12px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{partnerName(h.partner_id)}</div>
            <code style={{ fontSize: 11, color: B.sky }}>{h.event_type}</code>
            <code style={{ fontSize: 11, color: B.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.url}</code>
            <button style={{ ...BTN_SECONDARY, padding: "4px 8px", fontSize: 11 }} onClick={() => toggle(h)}>
              {h.activo ? "Pausar" : "Activar"}
            </button>
            <button style={{ ...BTN_DANGER, padding: "4px 8px", fontSize: 11 }} onClick={() => del(h.id)}>Eliminar</button>
          </div>
        ))}
      </div>
      {showNew && <WebhookForm partners={partners} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function WebhookForm({ partners, onClose, onSaved }) {
  const [f, setF] = useState({ partner_id: partners[0]?.id || "", event_type: EVENTOS_WEBHOOK[0], url: "", secret: randomHex(24), activo: true });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.partner_id || !f.url) { alert("Partner y URL requeridos"); return; }
    const { error } = await supabase.from("api_partner_webhooks").insert(f);
    if (error) { alert(error.message); return; }
    onSaved();
  };
  return (
    <Modal title="Nuevo Webhook" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><label style={LS}>Partner *</label>
          <select style={IS} value={f.partner_id} onChange={e => s("partner_id", e.target.value)}>
            {partners.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div><label style={LS}>Evento *</label>
          <select style={IS} value={f.event_type} onChange={e => s("event_type", e.target.value)}>
            {EVENTOS_WEBHOOK.map(e => <option key={e}>{e}</option>)}
          </select>
        </div>
      </div>
      <label style={LS}>URL *</label>
      <input style={IS} value={f.url} onChange={e => s("url", e.target.value)} placeholder="https://partner.example.com/webhooks/atolon" />
      <div style={{ marginTop: 10 }}>
        <label style={LS}>Secret (HMAC-SHA256)</label>
        <input style={{ ...IS, fontFamily: "monospace" }} value={f.secret} onChange={e => s("secret", e.target.value)} />
        <div style={{ fontSize: 10, color: B.sand, marginTop: 4 }}>Se firmará cada evento con este secret en header X-Atolon-Signature.</div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={BTN_SECONDARY} onClick={onClose}>Cancelar</button>
        <button style={BTN} onClick={save}>Crear Webhook</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCS TAB
// ═══════════════════════════════════════════════════════════════════════════
function DocsTab() {
  const Section = ({ title, desc, method, path, example }) => (
    <div style={{ ...CARD, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{
          background: method === "GET" ? B.sky : B.success, color: B.navy,
          padding: "3px 10px", borderRadius: 6, fontWeight: 800, fontSize: 11,
        }}>{method}</span>
        <code style={{ fontSize: 14, color: B.white }}>{path}</code>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: B.sand, marginBottom: 10 }}>{desc}</div>
      <pre style={{ background: B.navy, padding: 12, borderRadius: 8, fontSize: 11, color: B.sky, overflow: "auto", margin: 0, border: `1px solid ${B.navyLight}` }}>
{example}
      </pre>
    </div>
  );

  return (
    <div>
      <div style={{ ...CARD, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Autenticación</div>
        <div style={{ fontSize: 12, color: B.sand, marginBottom: 10 }}>
          Todas las llamadas requieren el header <code>Authorization: Bearer sk_atolon_…</code>.
          Rate limit por defecto: 60 req/min por key. Logs disponibles en la pestaña Logs.
        </div>
        <pre style={{ background: B.navy, padding: 12, borderRadius: 8, fontSize: 11, color: B.sky, overflow: "auto", margin: 0 }}>
{`Base URL: ${FN_URL}
Header:   Authorization: Bearer sk_atolon_<32 hex chars>`}
        </pre>
      </div>

      <Section
        method="GET" path="/v1/pasadias"
        title="Listar pasadías disponibles"
        desc="Retorna todas las experiencias activas con precio adulto/niño, mínimo de pax y duración."
        example={`curl -H "Authorization: Bearer sk_atolon_xxxxx" \\
  "${FN_URL}/v1/pasadias"`}
      />

      <Section
        method="GET" path="/v1/availability"
        title="Disponibilidad por fecha"
        desc="Lista las salidas del día con capacidad y vacantes. Si envías ?tipo=VIP Pass también retorna los precios."
        example={`curl -H "Authorization: Bearer sk_atolon_xxxxx" \\
  "${FN_URL}/v1/availability?fecha=2026-05-15&tipo=VIP%20Pass"`}
      />

      <Section
        method="POST" path="/v1/reservas"
        title="Crear reserva"
        desc="Crea una reserva confirmada. Debes enviar salida_id o hora, y los pax adultos/niños."
        example={`curl -X POST -H "Authorization: Bearer sk_atolon_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "fecha": "2026-05-15",
    "hora":  "08:30",
    "tipo":  "VIP Pass",
    "nombre":"Juan Perez",
    "contacto":"+57 300 123 4567",
    "pax_a": 2,
    "pax_n": 1,
    "edades_ninos": [8]
  }' \\
  "${FN_URL}/v1/reservas"`}
      />

      <Section
        method="GET" path="/v1/reservas/:id"
        title="Obtener estado de reserva"
        desc="Retorna los datos actuales de la reserva."
        example={`curl -H "Authorization: Bearer sk_atolon_xxxxx" \\
  "${FN_URL}/v1/reservas/API-abc123"`}
      />

      <Section
        method="POST" path="/v1/reservas/:id/cancel"
        title="Cancelar reserva"
        desc="Marca la reserva como cancelada (idempotente)."
        example={`curl -X POST -H "Authorization: Bearer sk_atolon_xxxxx" \\
  "${FN_URL}/v1/reservas/API-abc123/cancel"`}
      />

      <div style={{ ...CARD }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Webhooks (outbound)</div>
        <div style={{ fontSize: 12, color: B.sand }}>
          Configura webhooks en la pestaña correspondiente para recibir eventos en tu endpoint.
          Cada POST lleva el header <code>X-Atolon-Signature</code> con HMAC-SHA256 del body usando el secret compartido.
          Eventos disponibles: {EVENTOS_WEBHOOK.map(e => <code key={e} style={{ marginRight: 6 }}>{e}</code>)}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Reusable Modal
// ═══════════════════════════════════════════════════════════════════════════
function Modal({ title, children, onClose, size = "md" }) {
  const width = size === "md" ? 640 : 480;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 12, padding: 22, width, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: B.white }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
