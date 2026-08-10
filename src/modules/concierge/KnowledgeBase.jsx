import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { CARD, HEADER, IS, LS, BTN, TAG, EMPTY } from "./_shared.jsx";

const LINEA_TAG = { b2b: ["#a88530", "🏢 B2B"], confirm: ["#22c55e", "✅ Confirm"], general: ["#38bdf8", "🌐 General"], todas: [B.sand, "🌍 Todas"] };

export default function KnowledgeBase({ tenantId }) {
  const [items, setItems] = useState([]);
  const [filterLinea, setFilterLinea] = useState("all");
  const [showAdd, setShowAdd] = useState(null); // 'text' | 'url' | 'file'
  const [editingId, setEditingId] = useState(null); // KB id cuando se está editando
  const [form, setForm] = useState({ nombre: "", contenido: "", url: "", scope: "tenant", linea: "todas" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const abrirEditar = (r) => {
    setEditingId(r.id);
    setShowAdd(r.tipo); // reutiliza el modal
    setForm({
      nombre: r.nombre || "",
      contenido: r.contenido || "",
      url: r.url || "",
      scope: r.scope || "tenant",
      linea: r.linea || "todas",
    });
    setFile(null);
  };
  const cerrarModal = () => {
    setShowAdd(null); setEditingId(null); setFile(null);
    setForm({ nombre: "", contenido: "", url: "", scope: "tenant", linea: "todas" });
  };

  const load = () => supabase.from("ai_knowledge_base").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).then(({ data }) => setItems(data || []));
  useEffect(() => { load(); }, [tenantId]);

  const totalTokens = items.reduce((s, i) => s + (i.tokens || 0), 0);

  const guardar = async () => {
    if (!form.nombre.trim()) { alert("Nombre requerido"); return; }
    setSaving(true);
    let file_url;
    if (showAdd === "file" && file) {
      const ext = file.name.split(".").pop();
      const path = `kb/${tenantId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("comprobantes").upload(path, file);
      if (!error) file_url = supabase.storage.from("comprobantes").getPublicUrl(path).data.publicUrl;
    }
    const patch = {
      nombre: form.nombre.trim(),
      scope: form.scope,
      linea: form.linea || "todas",
      contenido: showAdd === "text" ? form.contenido : null,
      url: showAdd === "url" ? form.url : null,
      tokens: showAdd === "text" ? Math.ceil((form.contenido || "").length / 4) : 0,
    };
    // file_url solo se sobreescribe si el usuario subió un archivo nuevo
    if (file_url !== undefined) patch.file_url = file_url;

    if (editingId) {
      const { error } = await supabase.from("ai_knowledge_base").update(patch).eq("id", editingId);
      if (error) { alert("Error al actualizar: " + error.message); setSaving(false); return; }
    } else {
      const row = { id: `KB-${Date.now()}`, tenant_id: tenantId, tipo: showAdd, ...patch, file_url: file_url || null };
      const { error } = await supabase.from("ai_knowledge_base").insert(row);
      if (error) { alert("Error al crear: " + error.message); setSaving(false); return; }
    }
    cerrarModal();
    setSaving(false); load();
  };

  const cambiarLinea = async (r, nuevaLinea) => {
    await supabase.from("ai_knowledge_base").update({ linea: nuevaLinea }).eq("id", r.id);
    load();
  };

  const toggle = async (r) => {
    await supabase.from("ai_knowledge_base").update({ activo: !r.activo }).eq("id", r.id);
    load();
  };
  const borrar = async (r) => {
    if (!confirm(`Eliminar "${r.nombre}"?`)) return;
    await supabase.from("ai_knowledge_base").delete().eq("id", r.id);
    load();
  };

  return (
    <div style={{ padding: 20 }}>
      <HEADER title="📚 Knowledge Base" subtitle={`RAG Storage: ${totalTokens.toLocaleString("es-CO")} / 500,000 tokens`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setShowAdd("url")} style={{ ...CARD, cursor: "pointer", textAlign: "center", border: `1px dashed ${B.navyLight}` }}>
          <div style={{ fontSize: 24 }}>🔗</div>
          <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, marginTop: 6 }}>Add URL</div>
        </button>
        <button onClick={() => setShowAdd("file")} style={{ ...CARD, cursor: "pointer", textAlign: "center", border: `1px dashed ${B.navyLight}` }}>
          <div style={{ fontSize: 24 }}>📄</div>
          <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, marginTop: 6 }}>Add Files</div>
        </button>
        <button onClick={() => setShowAdd("text")} style={{ ...CARD, cursor: "pointer", textAlign: "center", border: `1px dashed ${B.navyLight}` }}>
          <div style={{ fontSize: 24 }}>🅣</div>
          <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, marginTop: 6 }}>Add Text</div>
        </button>
      </div>
      {/* Filtro por línea */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["all","Todas"],["todas","🌍 Compartidas"],["general","🌐 General"],["confirm","✅ Confirm"],["b2b","🏢 B2B"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilterLinea(k)}
            style={{ background: filterLinea===k?B.sky:B.navyLight, color: filterLinea===k?B.navy:"#fff",
              border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {items.length === 0 ? <EMPTY text="Aún no hay contenido en la KB. Agrega texto, URLs o archivos para que el agente los use." /> : (
        <div style={CARD}>
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ color: B.sand, textTransform: "uppercase", fontSize: 10, letterSpacing: 1, textAlign: "left" }}>
                <th style={{ padding: 8 }}>Nombre</th><th>Tipo</th><th>Línea</th><th>Scope</th><th>Tokens</th><th>Activo</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.filter(r => filterLinea === "all" || (r.linea || "todas") === filterLinea).map(r => {
                const lineaVal = r.linea || "todas";
                return (
                <tr key={r.id} style={{ borderTop: `1px solid ${B.navyLight}`, color: "#fff" }}>
                  <td style={{ padding: 10 }}>{r.nombre}</td>
                  <td>{TAG(B.sky, r.tipo)}</td>
                  <td>
                    <select value={lineaVal} onChange={e => cambiarLinea(r, e.target.value)}
                      style={{ background: (LINEA_TAG[lineaVal]?.[0] || B.sand) + "22", color: LINEA_TAG[lineaVal]?.[0] || B.sand,
                        border: `1px solid ${LINEA_TAG[lineaVal]?.[0] || B.sand}55`, borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      <option value="todas">🌍 Todas</option>
                      <option value="general">🌐 General</option>
                      <option value="confirm">✅ Confirm</option>
                      <option value="b2b">🏢 B2B</option>
                    </select>
                  </td>
                  <td>{TAG(r.scope === "global" ? "#a78bfa" : B.sand, r.scope)}</td>
                  <td>{r.tokens?.toLocaleString("es-CO") || 0}</td>
                  <td><input type="checkbox" checked={r.activo} onChange={() => toggle(r)} /></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => abrirEditar(r)} style={{ background: "transparent", border: "none", color: B.sky, cursor: "pointer", fontSize: 14, marginRight: 4 }} title="Editar">✏️</button>
                    <button onClick={() => borrar(r)} style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }} title="Eliminar">🗑</button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <div onClick={e => e.target === e.currentTarget && cerrarModal()}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, padding: 22, maxWidth: 720, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 14 }}>
              {editingId ? "Editar" : "Agregar"} {showAdd === "text" ? "texto" : showAdd === "url" ? "URL" : "archivo"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={LS}>Nombre</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} style={IS} />
              </div>
              {showAdd === "text" && (
                <div>
                  <label style={LS}>Contenido {editingId && <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>· ~{Math.ceil((form.contenido || "").length / 4).toLocaleString("es-CO")} tokens</span>}</label>
                  <textarea value={form.contenido} onChange={e => setForm({ ...form, contenido: e.target.value })} rows={18} style={{ ...IS, fontFamily: "monospace", lineHeight: 1.5 }} />
                </div>
              )}
              {showAdd === "url" && (
                <div>
                  <label style={LS}>URL</label>
                  <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://…" style={IS} />
                </div>
              )}
              {showAdd === "file" && (
                <div>
                  <label style={LS}>Archivo (PDF/DOCX/TXT) {editingId && <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>· deja vacío para mantener el actual</span>}</label>
                  <input type="file" accept=".pdf,.txt,.md,.docx" onChange={e => setFile(e.target.files?.[0])} style={IS} />
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={LS}>Línea</label>
                  <select value={form.linea} onChange={e => setForm({ ...form, linea: e.target.value })} style={IS}>
                    <option value="todas">🌍 Todas (aplica a los 3 agentes)</option>
                    <option value="general">🌐 General (web, leads)</option>
                    <option value="confirm">✅ Confirm (WA principal)</option>
                    <option value="b2b">🏢 B2B (agencias)</option>
                  </select>
                </div>
                <div>
                  <label style={LS}>Scope</label>
                  <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })} style={IS}>
                    <option value="tenant">Solo este tenant</option>
                    <option value="global">Global (todos los tenants)</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={cerrarModal} style={BTN(B.navyLight)}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={BTN(B.success)}>{saving ? "…" : (editingId ? "💾 Actualizar" : "💾 Guardar")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
