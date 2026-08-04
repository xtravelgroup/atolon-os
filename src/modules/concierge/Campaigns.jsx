import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, TAG, EMPTY, BTN, IS, LS } from "./_shared.jsx";

export default function Campaigns({ tenantId }) {
  const [rows, setRows] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ nombre: "", canal_tipo: "whatsapp", template_id: "", segmento_meta: {} });
  const load = () => supabase.from("ai_campaigns").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, [tenantId]);
  const crear = async () => {
    await supabase.from("ai_campaigns").insert({ id: `CMP-${Date.now()}`, tenant_id: tenantId, ...form });
    setShow(false); setForm({ nombre: "", canal_tipo: "whatsapp", template_id: "", segmento_meta: {} }); load();
  };
  return (
    <div style={{ padding: 20 }}>
      <HEADER title="📢 Campañas" subtitle="Envíos masivos por WhatsApp/Instagram (plantillas aprobadas Meta)" right={<button onClick={() => setShow(true)} style={BTN(B.success)}>+ Nueva</button>} />
      {rows.length === 0 ? <EMPTY icon="📢" text="Sin campañas aún" /> : (
        <div style={CARD}>
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ color: B.sand, textTransform: "uppercase", fontSize: 10, textAlign: "left" }}>
                <th style={{ padding: 8 }}>Nombre</th><th>Canal</th><th>Enviados</th><th>Leídos</th><th>Respuestas</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: `1px solid ${B.navyLight}`, color: "#fff" }}>
                  <td style={{ padding: 10 }}>{r.nombre}</td>
                  <td>{TAG(B.sky, r.canal_tipo)}</td>
                  <td>{r.enviados}</td><td>{r.leidos}</td><td>{r.respuestas}</td>
                  <td>{TAG(r.estado === "completada" ? B.success : r.estado === "enviando" ? B.warning : B.sand, r.estado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {show && (
        <div onClick={e => e.target === e.currentTarget && setShow(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, padding: 22, maxWidth: 540, width: "100%" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 14 }}>Nueva campaña</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label style={LS}>Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={IS} /></div>
              <div><label style={LS}>Canal</label>
                <select value={form.canal_tipo} onChange={e => setForm({ ...form, canal_tipo: e.target.value })} style={IS}>
                  <option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="email">Email</option>
                </select>
              </div>
              <div><label style={LS}>Template ID (Meta)</label><input value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })} style={IS} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShow(false)} style={BTN(B.navyLight)}>Cancelar</button>
              <button onClick={crear} style={BTN(B.success)}>💾 Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
