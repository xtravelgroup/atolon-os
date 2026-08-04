import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, IS, LS, BTN, TAG, EMPTY } from "./_shared.jsx";

const TIPOS = [
  { k: "whatsapp",  l: "WhatsApp Cloud",  icon: "💬", campos: ["phone_number_id","waba_id","access_token","verify_token"] },
  { k: "instagram", l: "Instagram DMs",   icon: "📷", campos: ["page_id","ig_id","access_token","verify_token"] },
  { k: "messenger", l: "Facebook Messenger", icon: "🅕", campos: ["page_id","access_token","verify_token"] },
  { k: "web",       l: "Web Widget",      icon: "🌐", campos: ["site_url","greeting"] },
];

export default function Channels({ tenantId }) {
  const [rows, setRows] = useState([]);
  const [showAdd, setShowAdd] = useState(null);
  const [form, setForm] = useState({ nombre: "", config: {} });

  const load = () => supabase.from("ai_channels").select("*").eq("tenant_id", tenantId).order("created_at").then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, [tenantId]);

  const guardar = async () => {
    const id = `CH-${Date.now()}`;
    await supabase.from("ai_channels").insert({ id, tenant_id: tenantId, tipo: showAdd.k, nombre: form.nombre.trim() || showAdd.l, config: form.config, webhook_url: `${window.location.origin.replace(':5173','')}/functions/v1/concierge-webhook-${showAdd.k}` });
    setShowAdd(null); setForm({ nombre: "", config: {} }); load();
  };
  const toggle = async (r) => { await supabase.from("ai_channels").update({ activo: !r.activo }).eq("id", r.id); load(); };

  return (
    <div style={{ padding: 20 }}>
      <HEADER title="📡 Canales" subtitle="Conecta WhatsApp, Instagram, Messenger y widget web" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
        {TIPOS.map(t => (
          <button key={t.k} onClick={() => setShowAdd(t)} style={{ ...CARD, cursor: "pointer", textAlign: "left" }}>
            <div style={{ fontSize: 26 }}>{t.icon}</div>
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 700, marginTop: 6 }}>{t.l}</div>
            <div style={{ fontSize: 10, color: B.sand, marginTop: 4 }}>+ Conectar</div>
          </button>
        ))}
      </div>
      {rows.length === 0 ? <EMPTY icon="📡" text="No hay canales conectados aún" /> : (
        <div style={CARD}>
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ color: B.sand, textTransform: "uppercase", fontSize: 10, textAlign: "left" }}>
                <th style={{ padding: 8 }}>Nombre</th><th>Tipo</th><th>Status</th><th>Activo</th><th>Webhook</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: `1px solid ${B.navyLight}`, color: "#fff" }}>
                  <td style={{ padding: 10 }}>{r.nombre}</td>
                  <td>{TAG(B.sky, r.tipo)}</td>
                  <td>{TAG(r.status === "active" ? B.success : r.status === "error" ? B.danger : B.warning, r.status)}</td>
                  <td><input type="checkbox" checked={r.activo} onChange={() => toggle(r)} /></td>
                  <td><code style={{ fontSize: 10, color: B.sand }}>{r.webhook_url?.slice(-40)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <div onClick={e => e.target === e.currentTarget && setShowAdd(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, padding: 22, maxWidth: 540, width: "100%" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 14 }}>Conectar {showAdd.l}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label style={LS}>Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder={showAdd.l} style={IS} /></div>
              {showAdd.campos.map(c => (
                <div key={c}><label style={LS}>{c}</label>
                  <input value={form.config[c] || ""} onChange={e => setForm({ ...form, config: { ...form.config, [c]: e.target.value } })}
                    style={IS} type={c.includes("token") ? "password" : "text"} />
                </div>
              ))}
              <div style={{ background: B.navy, padding: 10, borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                💡 Después de guardar, apunta el webhook de {showAdd.l} a la URL que se generará abajo.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowAdd(null)} style={BTN(B.navyLight)}>Cancelar</button>
              <button onClick={guardar} style={BTN(B.success)}>💾 Conectar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
