import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, IS, LS, BTN, TAG, EMPTY } from "./_shared.jsx";

export default function HandoffRules({ tenantId }) {
  const [rules, setRules] = useState([]);
  const [wh, setWh] = useState(null);
  const [tab, setTab] = useState("rules");
  const [showEd, setShowEd] = useState(null);

  const load = async () => {
    const [r, w] = await Promise.all([
      supabase.from("ai_handoff_rules").select("*").eq("tenant_id", tenantId).order("orden"),
      supabase.from("ai_working_hours").select("*").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    setRules(r.data || []); setWh(w.data);
  };
  useEffect(() => { load(); }, [tenantId]);

  const guardarRule = async () => {
    const row = { ...showEd, tenant_id: tenantId };
    if (!row.id) row.id = `HR-${Date.now()}`;
    if (typeof row.trigger_keywords === "string")
      row.trigger_keywords = row.trigger_keywords.split(",").map(k => k.trim()).filter(Boolean);
    if (typeof row.required_fields === "string")
      row.required_fields = row.required_fields.split(",").map(k => k.trim()).filter(Boolean);
    await supabase.from("ai_handoff_rules").upsert(row);
    setShowEd(null); load();
  };
  const toggle = async (r) => { await supabase.from("ai_handoff_rules").update({ activo: !r.activo }).eq("id", r.id); load(); };
  const borrar = async (r) => { if (confirm("Eliminar?")) { await supabase.from("ai_handoff_rules").delete().eq("id", r.id); load(); } };

  const guardarWh = async () => { await supabase.from("ai_working_hours").upsert(wh); alert("Guardado"); };

  return (
    <div style={{ padding: 20 }}>
      <HEADER title="🙋 Handoff Rules" subtitle="Cuándo escalar la conversación a un humano" />
      <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: `1px solid ${B.navyLight}` }}>
        {[["rules","Reglas de escalamiento"],["wh","Horario"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "10px 16px", background: "transparent", border: "none", borderBottom: tab===k?`2px solid ${B.sky}`:"2px solid transparent",
            color: tab===k?B.sky:"rgba(255,255,255,0.6)", fontWeight: 700, cursor: "pointer", fontSize: 12
          }}>{l}</button>
        ))}
      </div>
      {tab === "rules" ? (
        <>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setShowEd({ nombre: "", scope: "all", action: "notify", activo: true, orden: 100, trigger_keywords: "" })} style={BTN(B.success)}>+ Add scenario</button>
          </div>
          {rules.length === 0 ? <EMPTY icon="🙋" text="No hay reglas configuradas" /> : (
            <div style={CARD}>
              <table style={{ width: "100%", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: B.sand, textTransform: "uppercase", fontSize: 10, textAlign: "left" }}>
                    <th style={{ padding: 8 }}>Escenario</th><th>Alcance</th><th>Keywords</th><th>Acción</th><th>Activo</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${B.navyLight}`, color: "#fff" }}>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 700 }}>{r.nombre}</div>
                        {r.descripcion && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{r.descripcion}</div>}
                      </td>
                      <td>{TAG(B.sky, r.scope)}</td>
                      <td style={{ fontSize: 10 }}>{(r.trigger_keywords || []).slice(0,3).join(", ")}{(r.trigger_keywords||[]).length > 3 ? "…" : ""}</td>
                      <td>{TAG(B.warning, r.action)}</td>
                      <td><input type="checkbox" checked={r.activo} onChange={() => toggle(r)} /></td>
                      <td style={{ textAlign: "right" }}>
                        <button onClick={() => setShowEd(r)} style={{ background: "transparent", border: "none", color: B.sky, cursor: "pointer" }}>✎</button>
                        <button onClick={() => borrar(r)} style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer" }}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : wh && (
        <div style={{ ...CARD, maxWidth: 720 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontSize: 13 }}>
              <input type="checkbox" checked={wh.activo} onChange={e => setWh({ ...wh, activo: e.target.checked })} />
              Bot activo solo en horario laboral
            </label>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Zona horaria</label>
            <input value={wh.timezone} onChange={e => setWh({ ...wh, timezone: e.target.value })} style={IS} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Horarios por día</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
              {["lun","mar","mie","jue","vie","sab","dom"].map(d => {
                const [ini, fin] = wh.dias?.[d] || ["09:00","20:00"];
                return (
                  <div key={d} style={{ background: B.navy, padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", marginBottom: 4 }}>{d}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input type="time" value={ini} onChange={e => setWh({ ...wh, dias: { ...wh.dias, [d]: [e.target.value, fin] } })} style={{ ...IS, padding: "4px 6px", fontSize: 11 }} />
                      <input type="time" value={fin} onChange={e => setWh({ ...wh, dias: { ...wh.dias, [d]: [ini, e.target.value] } })} style={{ ...IS, padding: "4px 6px", fontSize: 11 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label style={LS}>Mensaje fuera de horario</label>
            <textarea rows={3} value={wh.mensaje_off_hours || ""} onChange={e => setWh({ ...wh, mensaje_off_hours: e.target.value })} style={IS} />
          </div>
          <button onClick={guardarWh} style={{ ...BTN(B.success), marginTop: 14 }}>💾 Guardar horario</button>
        </div>
      )}

      {showEd && (
        <div onClick={e => e.target === e.currentTarget && setShowEd(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, padding: 22, maxWidth: 640, width: "100%" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 14 }}>{showEd.id ? "Editar" : "Nueva"} regla de escalamiento</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div><label style={LS}>Nombre</label><input value={showEd.nombre || ""} onChange={e => setShowEd({ ...showEd, nombre: e.target.value })} style={IS} /></div>
              <div><label style={LS}>Descripción</label><input value={showEd.descripcion || ""} onChange={e => setShowEd({ ...showEd, descripcion: e.target.value })} style={IS} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={LS}>Alcance</label>
                  <select value={showEd.scope} onChange={e => setShowEd({ ...showEd, scope: e.target.value })} style={IS}>
                    <option value="all">Todos</option><option value="pasadias">Pasadías</option><option value="hotel">Hotel</option><option value="eventos">Eventos</option><option value="b2b">B2B</option>
                  </select>
                </div>
                <div>
                  <label style={LS}>Acción</label>
                  <select value={showEd.action} onChange={e => setShowEd({ ...showEd, action: e.target.value })} style={IS}>
                    <option value="notify">Notificar</option><option value="assign">Asignar</option><option value="pause">Pausar bot</option><option value="send_email">Enviar email</option>
                  </select>
                </div>
              </div>
              <div><label style={LS}>Keywords disparadoras (coma-separadas)</label><input value={Array.isArray(showEd.trigger_keywords) ? showEd.trigger_keywords.join(", ") : showEd.trigger_keywords || ""} onChange={e => setShowEd({ ...showEd, trigger_keywords: e.target.value })} style={IS} /></div>
              <div><label style={LS}>Asignar a (email)</label><input value={showEd.asignar_a_email || ""} onChange={e => setShowEd({ ...showEd, asignar_a_email: e.target.value })} style={IS} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowEd(null)} style={BTN(B.navyLight)}>Cancelar</button>
              <button onClick={guardarRule} style={BTN(B.success)}>💾 Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
