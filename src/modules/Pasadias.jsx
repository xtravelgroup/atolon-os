import { useState, useEffect, useCallback } from "react";
import { B, COP, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

const ESTADO_BOTE = { activo: { bg: B.success + "22", color: B.success }, mantenimiento: { bg: B.warning + "22", color: B.warning }, inactivo: { bg: B.navyLight, color: "rgba(255,255,255,0.4)" } };

// ═══════════════════════════════════════════════
// TAB: PASADIAS (productos)
// ═══════════════════════════════════════════════
function TabPasadias({ pasadias, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [newForm, setNewForm] = useState({ nombre: "", precio: "", precio_neto_agencia: "", precio_nino: "", precio_neto_nino: "", nino_nota: "", min_pax: 1, descripcion: "", web_publica: true, visible_agencias_todas: false, visible_agencias_seleccionadas: false, sin_embarcacion: false });
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState("");
  const [newItemEn, setNewItemEn] = useState("");
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingExtra, setUploadingExtra] = useState(false);
  const [agencias, setAgencias] = useState([]);
  const [agenciasVis, setAgenciasVis] = useState({}); // aliado_id -> boolean

  const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
  const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

  const loadAgenciasVis = async (pasadiaId) => {
    if (!supabase) return;
    const [{ data: ags }, { data: vis }] = await Promise.all([
      supabase.from("aliados_b2b").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("pasadias_agencias_visibles").select("aliado_id, visible").eq("pasadia_id", pasadiaId),
    ]);
    setAgencias(ags || []);
    const map = {};
    (vis || []).forEach(v => { map[v.aliado_id] = v.visible; });
    setAgenciasVis(map);
  };

  const toggleAgenciaVis = async (aliadoId, currentVal) => {
    if (!supabase || !selected) return;
    const newVal = !currentVal;
    setAgenciasVis(m => ({ ...m, [aliadoId]: newVal }));
    await supabase.from("pasadias_agencias_visibles").upsert({
      id: `PAV-${selected.id}-${aliadoId}`,
      pasadia_id: selected.id,
      aliado_id: aliadoId,
      visible: newVal,
    }, { onConflict: "pasadia_id,aliado_id" });
  };

  const openDetail = async (p) => {
    setSelected(p);
    setEditing(false);
    setForm({ ...p });
    if (supabase) {
      const { data } = await supabase.from("pasadia_incluye").select("*").eq("pasadia_id", p.id).order("orden");
      setItems(data || []);
      if (p.visible_agencias_seleccionadas) {
        await loadAgenciasVis(p.id);
      }
    }
  };

  const startEdit = async () => {
    setEditing(true);
    setForm({ ...selected });
    if (selected.visible_agencias_seleccionadas && agencias.length === 0) {
      await loadAgenciasVis(selected.id);
    }
  };

  const saveEdit = async () => {
    if (!supabase) return;
    await supabase.from("pasadias").update({
      nombre: form.nombre,
      precio: Number(form.precio) || 0,
      precio_neto_agencia: Number(form.precio_neto_agencia) || 0,
      precio_nino: Number(form.precio_nino) || 0,
      precio_neto_nino: Number(form.precio_neto_nino) || 0,
      nino_nota: form.nino_nota || null,
      descripcion: form.descripcion,
      min_pax: Number(form.min_pax) || 1,
      web_publica: form.web_publica,
      visible_agencias_todas: form.visible_agencias_todas || false,
      visible_agencias_seleccionadas: form.visible_agencias_seleccionadas || false,
      sin_embarcacion: form.sin_embarcacion || false,
      activo: form.activo,
    }).eq("id", form.id);
    onRefresh(); setEditing(false);
    const fresh = { ...selected, ...form, precio: Number(form.precio) || 0, min_pax: Number(form.min_pax) || 1 };
    setSelected(fresh);
  };

  const uploadMainPhoto = async (file) => {
    if (!supabase || !file) return;
    setUploadingMain(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `pasadias/${selected.id}/main-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("b2b-docs").getPublicUrl(path);
      const url = urlData.publicUrl;
      const { error: dbErr } = await supabase.from("pasadias").update({ foto_principal_url: url }).eq("id", selected.id);
      if (dbErr) throw dbErr;
      setSelected(s => ({ ...s, foto_principal_url: url }));
      onRefresh();
    } catch (e) {
      alert("Error subiendo foto: " + e.message);
    }
    setUploadingMain(false);
  };

  const uploadExtraPhoto = async (file) => {
    if (!supabase || !file) return;
    setUploadingExtra(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `pasadias/${selected.id}/extra-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("b2b-docs").getPublicUrl(path);
      const url = urlData.publicUrl;
      const current = selected.fotos_adicionales || [];
      const updated = [...current, url];
      const { error: dbErr } = await supabase.from("pasadias").update({ fotos_adicionales: updated }).eq("id", selected.id);
      if (dbErr) throw dbErr;
      setSelected(s => ({ ...s, fotos_adicionales: updated }));
      onRefresh();
    } catch (e) {
      alert("Error subiendo foto adicional: " + e.message);
    }
    setUploadingExtra(false);
  };

  const removeExtraPhoto = async (url) => {
    if (!supabase) return;
    const updated = (selected.fotos_adicionales || []).filter(u => u !== url);
    await supabase.from("pasadias").update({ fotos_adicionales: updated }).eq("id", selected.id);
    setSelected(s => ({ ...s, fotos_adicionales: updated }));
    onRefresh();
  };

  const addItem = async () => {
    if (!supabase || !newItem.trim()) return;
    const orden = items.length + 1;
    // Auto-translate to English if not provided
    let enText = newItemEn.trim();
    if (!enText) {
      try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(newItem.trim())}&langpair=es|en`);
        const json = await res.json();
        enText = json?.responseData?.translatedText || "";
      } catch { /* ignore, leave empty */ }
    }
    await supabase.from("pasadia_incluye").insert({ id: `INC-${Date.now()}`, pasadia_id: selected.id, descripcion: newItem.trim(), descripcion_en: enText, orden });
    const { data } = await supabase.from("pasadia_incluye").select("*").eq("pasadia_id", selected.id).order("orden");
    setItems(data || []);
    setNewItem("");
    setNewItemEn("");
  };

  const updateItemEn = async (id, value) => {
    if (!supabase) return;
    await supabase.from("pasadia_incluye").update({ descripcion_en: value }).eq("id", id);
    setItems(prev => prev.map(it => it.id === id ? { ...it, descripcion_en: value } : it));
  };

  const deleteItem = async (id) => {
    if (!supabase) return;
    await supabase.from("pasadia_incluye").delete().eq("id", id);
    setItems(p => p.filter(i => i.id !== id));
  };

  const toggleField = async (id, field, val) => {
    if (!supabase) return;
    await supabase.from("pasadias").update({ [field]: !val }).eq("id", id);
    onRefresh();
  };

  // DETAIL VIEW
  if (selected) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <button onClick={() => setSelected(null)} style={{ background: B.navyLight, border: "none", borderRadius: 8, padding: "8px 16px", color: B.white, cursor: "pointer", fontSize: 13 }}>{"\u2190"} Volver</button>
          <h3 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{selected.nombre}</h3>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(selected.precio)}</div>
            {selected.precio_neto_agencia > 0 && <div style={{ fontSize: 12, color: B.warning }}>Neto agencia: {COP(selected.precio_neto_agencia)}</div>}
          </div>
          {!editing && <button onClick={startEdit} style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Editar</button>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Info / Edit */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 24, gridColumn: "1 / -1" }}>
            <h4 style={{ fontSize: 14, color: B.sand, marginBottom: 16 }}>Datos del Pasadia</h4>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div><label style={LS}>Nombre</label><input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} style={IS} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <div><label style={LS}>Precio Adulto Público</label><input type="number" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} style={IS} /></div>
                  <div><label style={LS}>Neto Adulto Agencia</label><input type="number" value={form.precio_neto_agencia || ""} onChange={e => setForm(f => ({ ...f, precio_neto_agencia: e.target.value }))} style={IS} /></div>
                  <div><label style={LS}>Min. Pax</label><input type="number" value={form.min_pax} onChange={e => setForm(f => ({ ...f, min_pax: e.target.value }))} style={IS} /></div>
                  <div><label style={LS}>Precio Niño Público</label><input type="number" value={form.precio_nino || ""} onChange={e => setForm(f => ({ ...f, precio_nino: e.target.value }))} placeholder="0 = no aplica" style={IS} /></div>
                  <div><label style={LS}>Neto Niño Agencia</label><input type="number" value={form.precio_neto_nino || ""} onChange={e => setForm(f => ({ ...f, precio_neto_nino: e.target.value }))} placeholder="0 = no aplica" style={IS} /></div>
                  <div><label style={LS}>Nota Niño</label><input value={form.nino_nota || ""} onChange={e => setForm(f => ({ ...f, nino_nota: e.target.value }))} placeholder="Ej: +$50k consumibles" style={IS} /></div>
                </div>
                <div><label style={LS}>Descripcion</label><textarea value={form.descripcion || ""} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={3} style={{ ...IS, resize: "vertical" }} /></div>
                <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Visibilidad</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!form.web_publica} onChange={e => setForm(f => ({ ...f, web_publica: e.target.checked }))} />
                    <span>🌐 Visible en Web</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!form.visible_agencias_todas} onChange={e => {
                      const v = e.target.checked;
                      setForm(f => ({ ...f, visible_agencias_todas: v, visible_agencias_seleccionadas: v ? false : f.visible_agencias_seleccionadas }));
                      if (v && agencias.length === 0) loadAgenciasVis(selected.id);
                    }} />
                    <span>🏢 Visible en todas las agencias</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!form.visible_agencias_seleccionadas} onChange={e => {
                      const v = e.target.checked;
                      setForm(f => ({ ...f, visible_agencias_seleccionadas: v, visible_agencias_todas: v ? false : f.visible_agencias_todas }));
                      if (v) loadAgenciasVis(selected.id);
                    }} />
                    <span>🎯 Visible en agencias seleccionadas</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
                    <input type="checkbox" checked={!!form.sin_embarcacion} onChange={e => setForm(f => ({ ...f, sin_embarcacion: e.target.checked }))} />
                    <span>🚫⛵ Sin transporte (no requiere hora de salida)</span>
                  </label>
                  {(form.visible_agencias_seleccionadas) && agencias.length > 0 && (
                    <div style={{ marginTop: 8, background: B.navyMid, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Activar/desactivar por agencia (se guarda al instante):</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {agencias.map(ag => {
                          const vis = agenciasVis[ag.id] || false;
                          return (
                            <button key={ag.id} onClick={() => toggleAgenciaVis(ag.id, vis)}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, border: `1px solid ${vis ? B.success + "66" : B.navyLight}`, background: vis ? B.success + "15" : B.navy, cursor: "pointer", fontSize: 12, color: vis ? B.success : "rgba(255,255,255,0.5)", textAlign: "left" }}>
                              <span style={{ fontSize: 14 }}>{vis ? "✅" : "⬜"}</span>
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ag.nombre}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", paddingTop: 4, borderTop: `1px solid ${B.navyLight}`, marginTop: 2 }}>
                    <input type="checkbox" checked={!!form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                    <span>✅ Activo</span>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveEdit} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Guardar</button>
                  <button onClick={() => setEditing(false)} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                  {[
                    { label: "Precio Adulto Público",  value: COP(selected.precio),                color: B.sand    },
                    { label: "Neto Adulto Agencia",    value: COP(selected.precio_neto_agencia),   color: B.warning },
                    { label: "Precio Niño Público",    value: selected.precio_nino > 0 ? COP(selected.precio_nino) : "No aplica",      color: selected.precio_nino > 0 ? B.sky : "rgba(255,255,255,0.3)" },
                    { label: "Neto Niño Agencia",      value: selected.precio_neto_nino > 0 ? COP(selected.precio_neto_nino) : "No aplica", color: selected.precio_neto_nino > 0 ? B.warning : "rgba(255,255,255,0.3)" },
                  ].map(r => (
                    <div key={r.label} style={{ background: "#0D1B3E", borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{r.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: r.color }}>{r.value}</div>
                    </div>
                  ))}
                </div>
                {selected.nino_nota && <div style={{ marginTop: 10, fontSize: 12, color: B.sky, background: B.sky + "11", border: `1px solid ${B.sky}22`, borderRadius: 8, padding: "8px 12px" }}>ℹ️ Nota niños: {selected.nino_nota}</div>}
                <div style={{ marginTop: 12, fontSize: 13, lineHeight: 2 }}>
                  <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Min. Pax:</span> <strong>{selected.min_pax}</strong></div>
                  <div>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Visibilidad: </span>
                    {selected.web_publica && <span style={{ marginRight: 6, fontSize: 11, padding: "2px 8px", borderRadius: 10, background: B.sky + "22", color: B.sky }}>🌐 Web</span>}
                    {selected.visible_agencias_todas && <span style={{ marginRight: 6, fontSize: 11, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>🏢 Todas las agencias</span>}
                    {selected.visible_agencias_seleccionadas && <span style={{ marginRight: 6, fontSize: 11, padding: "2px 8px", borderRadius: 10, background: B.warning + "22", color: B.warning }}>🎯 Agencias seleccionadas</span>}
                    {!selected.web_publica && !selected.visible_agencias_todas && !selected.visible_agencias_seleccionadas && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Oculto</span>}
                    {selected.sin_embarcacion && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: B.danger + "22", color: B.danger }}>🚫⛵ Sin transporte</span>}
                  </div>
                  {selected.visible_agencias_seleccionadas && agencias.length > 0 && (
                    <div style={{ marginTop: 10, background: B.navy, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Agencias habilitadas:</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {agencias.map(ag => {
                          const vis = agenciasVis[ag.id] || false;
                          return (
                            <span key={ag.id} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: vis ? B.success + "22" : B.navyLight, color: vis ? B.success : "rgba(255,255,255,0.3)" }}>
                              {vis ? "✅" : "⬜"} {ag.nombre}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Estado:</span> <strong style={{ color: selected.activo ? B.success : B.danger }}>{selected.activo ? "Activo" : "Inactivo"}</strong></div>
                  {selected.descripcion && <div style={{ marginTop: 8, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{selected.descripcion}</div>}
                </div>
              </>
            )}
          </div>

          {/* Fotos */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
            <h4 style={{ fontSize: 14, color: B.sand, marginBottom: 16 }}>📸 Fotos (widget web)</h4>

            {/* Foto principal */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Foto Principal</div>
              <div style={{ position: "relative", width: "100%", height: 140, borderRadius: 10, overflow: "hidden", background: B.navy, border: `2px dashed ${B.navyLight}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {selected.foto_principal_url
                  ? <img src={selected.foto_principal_url} alt="principal" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Sin foto principal</div>
                }
                <label style={{ position: "absolute", bottom: 8, right: 8, background: B.sand, color: B.navy, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {uploadingMain ? "Subiendo..." : selected.foto_principal_url ? "Cambiar" : "+ Subir"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && uploadMainPhoto(e.target.files[0])} />
                </label>
              </div>
            </div>

            {/* Fotos adicionales */}
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Fotos Adicionales ({(selected.fotos_adicionales || []).length})
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                {(selected.fotos_adicionales || []).map((url, i) => (
                  <div key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden" }}>
                    <img src={url} alt={`extra-${i}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={() => removeExtraPhoto(url)}
                      style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "white", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>✕</button>
                  </div>
                ))}
                <label style={{ aspectRatio: "1", borderRadius: 8, border: `2px dashed ${B.navyLight}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: B.navy, flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 22, color: "rgba(255,255,255,0.3)" }}>+</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{uploadingExtra ? "Subiendo..." : "Agregar"}</span>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && uploadExtraPhoto(e.target.files[0])} />
                </label>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>
                Las fotos se muestran en el popup de reservas de la web. Recomendado: mínimo 1200×800px, formato JPG o WEBP.
              </div>
            </div>
          </div>

          {/* Incluye — line by line */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
            <h4 style={{ fontSize: 14, color: B.sand, marginBottom: 16 }}>Que Incluye ({items.length})</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map((item, i) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: B.navy, borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: B.sand, fontWeight: 700, minWidth: 20 }}>{i + 1}.</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{item.descripcion}</span>
                  <input
                    defaultValue={item.descripcion_en || ""}
                    onBlur={e => updateItemEn(item.id, e.target.value)}
                    placeholder="English..."
                    style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 6, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.6)", outline: "none" }}
                  />
                  <button onClick={() => deleteItem(item.id)} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 14, opacity: 0.5, padding: "2px 6px" }}>{"\u2715"}</button>
                </div>
              ))}
              {items.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>No hay items. Agrega el primero.</div>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()}
                placeholder="Español..."
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none" }} />
              <input value={newItemEn} onChange={e => setNewItemEn(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()}
                placeholder="English..."
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.6)", fontSize: 13, outline: "none" }} />
              <button onClick={addItem} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "0 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const createPasadia = async () => {
    if (!supabase || !newForm.nombre.trim() || saving) return;
    setSaving(true);
    const maxOrden = pasadias.reduce((m, p) => Math.max(m, p.orden || 0), 0);
    await supabase.from("pasadias").insert({
      id: `PAS-${Date.now()}`, nombre: newForm.nombre,
      precio: Number(newForm.precio) || 0,
      precio_neto_agencia: Number(newForm.precio_neto_agencia) || 0,
      precio_nino: Number(newForm.precio_nino) || 0,
      precio_neto_nino: Number(newForm.precio_neto_nino) || 0,
      nino_nota: newForm.nino_nota || null,
      min_pax: Number(newForm.min_pax) || 1, descripcion: newForm.descripcion,
      web_publica: newForm.web_publica,
      visible_agencias_todas: newForm.visible_agencias_todas || false,
      visible_agencias_seleccionadas: newForm.visible_agencias_seleccionadas || false,
      activo: true, orden: maxOrden + 1,
    });
    onRefresh(); setShowNew(false); setSaving(false);
    setNewForm({ nombre: "", precio: "", precio_neto_agencia: "", precio_nino: "", precio_neto_nino: "", nino_nota: "", min_pax: 1, descripcion: "", web_publica: true, visible_agencias_todas: false, visible_agencias_seleccionadas: false });
  };

  // GRID VIEW
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setShowNew(true)} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Nuevo Pasadia</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {pasadias.map(p => (
          <div key={p.id} onClick={() => openDetail(p)} style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${p.activo ? B.navyLight : B.danger + "44"}`, opacity: p.activo ? 1 : 0.6, cursor: "pointer", transition: "transform 0.1s" }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${B.navyLight}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{p.nombre}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(p.precio)}</div>
                  {p.precio_neto_agencia > 0 && <div style={{ fontSize: 12, color: B.warning }}>Neto agencia: {COP(p.precio_neto_agencia)}</div>}
                  {p.precio_nino > 0 && <div style={{ fontSize: 12, color: B.sky }}>Niño: {COP(p.precio_nino)}{p.precio_neto_nino > 0 ? ` · neto ${COP(p.precio_neto_nino)}` : ""}</div>}
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 120 }}>
                  {p.web_publica && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.sky + "22", color: B.sky }}>WEB</span>}
                  {p.visible_agencias_todas && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>AGENCIAS</span>}
                  {p.visible_agencias_seleccionadas && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.warning + "22", color: B.warning }}>SELECC</span>}
                  {!p.web_publica && !p.visible_agencias_todas && !p.visible_agencias_seleccionadas && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.navyLight, color: "rgba(255,255,255,0.4)" }}>OCULTO</span>}
                  {p.sin_embarcacion && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.danger + "22", color: B.danger }}>🚫⛵</span>}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{p.descripcion}</div>
            </div>
            <div style={{ padding: "12px 24px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              <div>Min. pax: <strong>{p.min_pax}</strong></div>
            </div>
            <div style={{ padding: "12px 24px", display: "flex", gap: 8, borderTop: `1px solid ${B.navyLight}` }}>
              <span style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Click para ver detalle y editar incluye</span>
              <button onClick={ev => { ev.stopPropagation(); toggleField(p.id, "sin_embarcacion", p.sin_embarcacion); }} style={{ padding: "6px 12px", borderRadius: 6, background: p.sin_embarcacion ? B.danger + "33" : "rgba(255,255,255,0.06)", color: p.sin_embarcacion ? B.danger : "rgba(255,255,255,0.4)", border: "none", fontSize: 11, cursor: "pointer" }} title="Sin transporte (no requiere hora de salida)">{p.sin_embarcacion ? "🚫⛵ Sin transporte" : "⛵ Con transporte"}</button>
              <button onClick={ev => { ev.stopPropagation(); toggleField(p.id, "activo", p.activo); }} style={{ padding: "6px 12px", borderRadius: 6, background: p.activo ? B.danger + "22" : B.success + "22", color: p.activo ? B.danger : B.success, border: "none", fontSize: 11, cursor: "pointer" }}>{p.activo ? "Desactivar" : "Activar"}</button>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 500 }}>
            <h3 style={{ marginBottom: 20, fontSize: 17, fontWeight: 700 }}>Nuevo Pasadia</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={LS}>Nombre</label><input value={newForm.nombre} onChange={e => setNewForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: VIP Pass" style={IS} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div><label style={LS}>Precio Adulto Público</label><input type="number" value={newForm.precio} onChange={e => setNewForm(f => ({ ...f, precio: e.target.value }))} placeholder="320000" style={IS} /></div>
                <div><label style={LS}>Neto Adulto Agencia</label><input type="number" value={newForm.precio_neto_agencia} onChange={e => setNewForm(f => ({ ...f, precio_neto_agencia: e.target.value }))} placeholder="272000" style={IS} /></div>
                <div><label style={LS}>Min. Pax</label><input type="number" value={newForm.min_pax} onChange={e => setNewForm(f => ({ ...f, min_pax: e.target.value }))} style={IS} /></div>
                <div><label style={LS}>Precio Niño Público</label><input type="number" value={newForm.precio_nino} onChange={e => setNewForm(f => ({ ...f, precio_nino: e.target.value }))} placeholder="0 = no aplica" style={IS} /></div>
                <div><label style={LS}>Neto Niño Agencia</label><input type="number" value={newForm.precio_neto_nino} onChange={e => setNewForm(f => ({ ...f, precio_neto_nino: e.target.value }))} placeholder="0 = no aplica" style={IS} /></div>
                <div><label style={LS}>Nota Niño</label><input value={newForm.nino_nota} onChange={e => setNewForm(f => ({ ...f, nino_nota: e.target.value }))} placeholder="+$50k consumibles..." style={IS} /></div>
              </div>
              <div><label style={LS}>Descripcion</label><textarea value={newForm.descripcion} onChange={e => setNewForm(f => ({ ...f, descripcion: e.target.value }))} rows={3} placeholder="Que incluye este pasadia..." style={{ ...IS, resize: "vertical" }} /></div>
              <div style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Visibilidad</div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={newForm.web_publica} onChange={e => setNewForm(f => ({ ...f, web_publica: e.target.checked }))} />
                  🌐 Visible en Web
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={newForm.visible_agencias_todas} onChange={e => setNewForm(f => ({ ...f, visible_agencias_todas: e.target.checked, visible_agencias_seleccionadas: e.target.checked ? false : f.visible_agencias_seleccionadas }))} />
                  🏢 Visible en todas las agencias
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={newForm.visible_agencias_seleccionadas} onChange={e => setNewForm(f => ({ ...f, visible_agencias_seleccionadas: e.target.checked, visible_agencias_todas: e.target.checked ? false : f.visible_agencias_todas }))} />
                  🎯 Visible en agencias seleccionadas
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
                  <input type="checkbox" checked={newForm.sin_embarcacion} onChange={e => setNewForm(f => ({ ...f, sin_embarcacion: e.target.checked }))} />
                  <span>🚫⛵ Sin transporte (no requiere hora de salida)</span>
                </label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={createPasadia} disabled={saving} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: saving ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? "Guardando..." : "Crear Pasadia"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB: EMBARCACIONES (flota)
// ═══════════════════════════════════════════════
function TabEmbarcaciones({ embarcaciones, onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({});
  const [newForm, setNewForm] = useState({ nombre: "", tipo: "", capacidad: "", capitan: "", estado: "activo", propiedad: "propia", costo_renta: "" });
  const [saving, setSaving] = useState(false);

  const createEmb = async () => {
    if (!supabase || !newForm.nombre.trim() || saving) return;
    setSaving(true);
    await supabase.from("embarcaciones").insert({ id: `B${String(Date.now()).slice(-3)}`, nombre: newForm.nombre, tipo: newForm.tipo, capacidad: Number(newForm.capacidad) || 0, capitan: newForm.capitan, estado: newForm.estado, propiedad: newForm.propiedad, costo_renta: Number(newForm.costo_renta) || 0, matricula: newForm.matricula || null, piloto_cedula: newForm.piloto_cedula || null, piloto_celular: newForm.piloto_celular || null, piloto2_nombre: newForm.piloto2_nombre || null, piloto2_cedula: newForm.piloto2_cedula || null, piloto2_celular: newForm.piloto2_celular || null });
    onRefresh(); setShowNew(false); setNewForm({ nombre: "", tipo: "", capacidad: "", capitan: "", estado: "activo", propiedad: "propia", costo_renta: "", matricula: "", piloto_cedula: "", piloto_celular: "", piloto2_nombre: "", piloto2_cedula: "", piloto2_celular: "" }); setSaving(false);
  };

  const startEdit = (e) => { setEditing(e.id); setForm({ ...e }); };
  const saveEdit = async () => {
    if (!supabase) return;
    await supabase.from("embarcaciones").update({
      nombre: form.nombre, tipo: form.tipo, capacidad: Number(form.capacidad) || 0,
      estado: form.estado, capitan: form.capitan, notas: form.notas,
      matricula: form.matricula, piloto_cedula: form.piloto_cedula, piloto_celular: form.piloto_celular,
      piloto2_nombre: form.piloto2_nombre, piloto2_cedula: form.piloto2_cedula, piloto2_celular: form.piloto2_celular,
      propiedad: form.propiedad || "propia", costo_renta: Number(form.costo_renta) || 0,
    }).eq("id", form.id);
    onRefresh(); setEditing(null);
  };

  const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
  const LS2 = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setShowNew(true)} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Nueva Embarcacion</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
      {embarcaciones.map(e => {
        const ec = ESTADO_BOTE[e.estado] || ESTADO_BOTE.activo;
        return (
          <div key={e.id} style={{ background: B.navyMid, borderRadius: 12, padding: 20, border: `1px solid ${B.navyLight}`, opacity: e.estado === "inactivo" ? 0.5 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{e.nombre}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{e.tipo}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexDirection: "column", alignItems: "flex-end" }}>
                <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, background: ec.bg, color: ec.color, fontWeight: 600 }}>{e.estado}</span>
                <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, background: e.propiedad === "rentada" ? B.warning + "22" : B.success + "22", color: e.propiedad === "rentada" ? B.warning : B.success, fontWeight: 600 }}>{e.propiedad === "rentada" ? "Rentada" : "Propia"}</span>
                {e._usos > 0 && <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, background: B.sky + "22", color: B.sky, fontWeight: 600 }}>⚓ {e._usos} viajes</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: 13 }}>
              <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Capacidad:</span> <strong>{e.capacidad} pax</strong></div>
              {e.propiedad === "rentada" && e.costo_renta > 0 && <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Costo:</span> <strong style={{ color: B.warning }}>{COP(e.costo_renta)}</strong></div>}
            </div>
            {e.matricula && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Matrícula: <strong style={{ color: B.sky }}>{e.matricula}</strong></div>}
            {e.capitan && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>Cap 1: {e.capitan}{e.piloto_cedula ? ` · ${e.piloto_cedula}` : ""}{e.piloto_celular ? ` · ${e.piloto_celular}` : ""}</div>}
            {e.piloto2_nombre && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Cap 2: {e.piloto2_nombre}{e.piloto2_cedula ? ` · ${e.piloto2_cedula}` : ""}{e.piloto2_celular ? ` · ${e.piloto2_celular}` : ""}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: `1px solid ${B.navyLight}` }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>ID: {e.id}</div>
              <button onClick={() => startEdit(e)} style={{ background: B.navyLight, color: B.white, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 11, cursor: "pointer" }}>Editar</button>
            </div>
          </div>
        );
      })}

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 460 }}>
            <h3 style={{ marginBottom: 20, fontSize: 17, fontWeight: 700 }}>Editar Embarcacion</h3>
            {[["nombre", "Nombre"], ["tipo", "Tipo"], ["capacidad", "Capacidad (pax)", "number"], ["matricula", "Matrícula"],
              ["capitan", "Capitán 1 — Nombre"], ["piloto_cedula", "Capitán 1 — Cédula"], ["piloto_celular", "Capitán 1 — Celular"],
              ["piloto2_nombre", "Capitán 2 — Nombre"], ["piloto2_cedula", "Capitán 2 — Cédula"], ["piloto2_celular", "Capitán 2 — Celular"]
            ].map(([k, l, t]) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>{l}</label>
                <input type={t || "text"} value={form[k] || ""} onChange={ev => setForm(f => ({ ...f, [k]: ev.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Estado</label>
                <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none" }}>
                  <option value="activo">Activo</option><option value="mantenimiento">Mantenimiento</option><option value="inactivo">Inactivo</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Propiedad</label>
                <select value={form.propiedad || "propia"} onChange={e => setForm(f => ({ ...f, propiedad: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none" }}>
                  <option value="propia">Propia</option><option value="rentada">Rentada</option>
                </select>
              </div>
            </div>
            {(form.propiedad === "rentada") && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Costo de Renta (COP)</label>
                <input type="number" value={form.costo_renta || ""} onChange={e => setForm(f => ({ ...f, costo_renta: e.target.value }))} placeholder="Ej: 2500000" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={saveEdit} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* New Embarcacion Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 460 }}>
            <h3 style={{ marginBottom: 20, fontSize: 17, fontWeight: 700 }}>Nueva Embarcacion</h3>
            {[
              ["nombre", "Nombre", "Ej: Caribe I"], ["tipo", "Tipo", "Ej: Lancha 24'"], ["capacidad", "Capacidad (pax)", "12", "number"], ["matricula", "Matrícula", "Ej: MN-1234"],
              ["capitan", "Capitán 1 — Nombre", "Nombre completo"], ["piloto_cedula", "Capitán 1 — Cédula", "Número de cédula"], ["piloto_celular", "Capitán 1 — Celular", "Ej: 3001234567"],
              ["piloto2_nombre", "Capitán 2 — Nombre", "Nombre completo"], ["piloto2_cedula", "Capitán 2 — Cédula", "Número de cédula"], ["piloto2_celular", "Capitán 2 — Celular", "Ej: 3001234567"],
            ].map(([k, l, ph, t]) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label style={LS2}>{l}</label>
                <input type={t || "text"} value={newForm[k]} onChange={ev => setNewForm(f => ({ ...f, [k]: ev.target.value }))} placeholder={ph} style={IS} />
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={LS2}>Estado</label>
                <select value={newForm.estado} onChange={e => setNewForm(f => ({ ...f, estado: e.target.value }))} style={IS}>
                  <option value="activo">Activo</option><option value="mantenimiento">Mantenimiento</option><option value="inactivo">Inactivo</option>
                </select>
              </div>
              <div>
                <label style={LS2}>Propiedad</label>
                <select value={newForm.propiedad} onChange={e => setNewForm(f => ({ ...f, propiedad: e.target.value }))} style={IS}>
                  <option value="propia">Propia</option><option value="rentada">Rentada</option>
                </select>
              </div>
            </div>
            {newForm.propiedad === "rentada" && (
              <div style={{ marginBottom: 14 }}>
                <label style={LS2}>Costo de Renta (COP)</label>
                <input type="number" value={newForm.costo_renta} onChange={e => setNewForm(f => ({ ...f, costo_renta: e.target.value }))} placeholder="Ej: 2500000" style={IS} />
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={createEmb} disabled={saving} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: saving ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? "Guardando..." : "Crear Embarcacion"}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB: SALIDAS Y CALENDARIO
// ═══════════════════════════════════════════════
function TabSalidas({ salidas, embarcaciones, cierres, onRefreshSalidas, onRefreshCierres }) {
  const [showCierreForm, setShowCierreForm] = useState(false);
  const [cierreForm, setCierreForm] = useState({ tipo: "total", fecha: "", motivo: "", salidas: [] });
  const [editingSalida, setEditingSalida] = useState(null);
  const [salidaForm, setSalidaForm] = useState({});

  const hoy = todayStr();
  const cierresActivos = cierres.filter(c => c.activo && c.fecha >= hoy);

  const toggleSalida = async (id, activo) => {
    if (!supabase) return;
    await supabase.from("salidas").update({ activo: !activo }).eq("id", id);
    onRefreshSalidas();
  };

  const editSalida = (s) => { setEditingSalida(s.id); setSalidaForm({ ...s, embarcaciones_arr: s.embarcaciones || [] }); };
  const saveSalida = async () => {
    if (!supabase) return;
    const caps = (salidaForm.embarcaciones_arr || []).reduce((sum, eid) => {
      const emb = embarcaciones.find(e => e.id === eid);
      return sum + (emb?.capacidad || 0);
    }, 0);
    await supabase.from("salidas").update({
      hora: salidaForm.hora, hora_regreso: salidaForm.hora_regreso, nombre: salidaForm.nombre,
      embarcaciones: salidaForm.embarcaciones_arr, capacidad_total: caps,
      auto_apertura: salidaForm.auto_apertura,
    }).eq("id", salidaForm.id);
    onRefreshSalidas(); setEditingSalida(null);
  };

  const toggleBote = (boteId) => {
    setSalidaForm(f => {
      const arr = f.embarcaciones_arr || [];
      return { ...f, embarcaciones_arr: arr.includes(boteId) ? arr.filter(b => b !== boteId) : [...arr, boteId] };
    });
  };

  const addCierre = async () => {
    if (!supabase || !cierreForm.fecha || !cierreForm.motivo) return;
    await supabase.from("cierres").insert({
      id: `C-${Date.now()}`, tipo: cierreForm.tipo, fecha: cierreForm.fecha,
      salidas: cierreForm.tipo === "total" ? salidas.map(s => s.id) : cierreForm.salidas,
      motivo: cierreForm.motivo, activo: true, creado_por: "Admin",
    });
    onRefreshCierres();
    setCierreForm({ tipo: "total", fecha: "", motivo: "", salidas: [] });
    setShowCierreForm(false);
  };

  const toggleCierre = async (id, activo) => {
    if (!supabase) return;
    await supabase.from("cierres").update({ activo: !activo }).eq("id", id);
    onRefreshCierres();
  };

  return (
    <div>
      {/* Salidas */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, color: B.sand, marginBottom: 16 }}>Salidas Programadas</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {salidas.map(s => {
            const botes = (s.embarcaciones || []).map(eid => embarcaciones.find(e => e.id === eid)).filter(Boolean);
            return (
              <div key={s.id} style={{ background: B.navyMid, borderRadius: 12, padding: 20, display: "flex", alignItems: "center", gap: 20, opacity: s.activo ? 1 : 0.4 }}>
                <div style={{ minWidth: 60, textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: B.sky }}>{s.hora}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Reg. {s.hora_regreso}</div>
                </div>
                <div style={{ width: 1, height: 50, background: B.navyLight }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.nombre} — {s.hora}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {botes.map(b => {
                      const ec = ESTADO_BOTE[b.estado];
                      return (
                        <span key={b.id} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: ec.bg, color: ec.color }}>
                          {b.nombre} ({b.capacidad} pax)
                        </span>
                      );
                    })}
                  </div>
                  {s.auto_apertura && <div style={{ fontSize: 11, color: B.warning, marginTop: 4 }}>Auto-apertura al {s.auto_umbral || 75}% de ocupacion</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.capacidad_total} <span style={{ fontSize: 12, fontWeight: 400, color: "rgba(255,255,255,0.4)" }}>pax</span></div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => editSalida(s)} style={{ background: B.navyLight, color: B.white, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer" }}>Editar</button>
                  <button onClick={() => toggleSalida(s.id, s.activo)} style={{ background: s.activo ? B.danger + "22" : B.success + "22", color: s.activo ? B.danger : B.success, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer" }}>{s.activo ? "Desact." : "Activar"}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cierres */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, color: B.sand }}>Cierres Programados ({cierresActivos.length})</h3>
          <button onClick={() => setShowCierreForm(true)} style={{ background: B.danger, color: B.white, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Nuevo Cierre</button>
        </div>
        {cierresActivos.length === 0 && <div style={{ background: B.navyMid, borderRadius: 12, padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay cierres programados</div>}
        {cierresActivos.map(c => (
          <div key={c.id} style={{ background: B.navyMid, borderRadius: 10, padding: "14px 20px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: `4px solid ${c.tipo === "total" ? B.danger : B.warning}` }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.fecha} — {c.motivo}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{c.tipo === "total" ? "Cierre Total" : `Parcial: ${(c.salidas || []).join(", ")}`}</div>
            </div>
            <button onClick={() => toggleCierre(c.id, c.activo)} style={{ background: B.navyLight, color: B.white, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer" }}>Desactivar</button>
          </div>
        ))}
      </div>

      {/* Edit Salida Modal */}
      {editingSalida && (
        <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && setEditingSalida(null)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 480 }}>
            <h3 style={{ marginBottom: 20, fontSize: 17, fontWeight: 700 }}>Editar Salida {salidaForm.id}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}><label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Nombre</label><input value={salidaForm.nombre || ""} onChange={e => setSalidaForm(f => ({ ...f, nombre: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
              <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Hora Salida</label><input value={salidaForm.hora} onChange={e => setSalidaForm(f => ({ ...f, hora: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
              <div style={{ marginBottom: 14 }}><label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Hora Regreso</label><input value={salidaForm.hora_regreso || ""} onChange={e => setSalidaForm(f => ({ ...f, hora_regreso: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 8, textTransform: "uppercase" }}>Embarcaciones Asignadas</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {embarcaciones.filter(e => e.estado === "activo").map(e => {
                  const selected = (salidaForm.embarcaciones_arr || []).includes(e.id);
                  return (
                    <button key={e.id} onClick={() => toggleBote(e.id)} style={{
                      padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                      background: selected ? B.sky : B.navy, color: selected ? B.navy : "rgba(255,255,255,0.5)",
                      border: `1px solid ${selected ? B.sky : B.navyLight}`,
                    }}>{e.nombre} ({e.capacidad})</button>
                  );
                })}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={salidaForm.auto_apertura || false} onChange={e => setSalidaForm(f => ({ ...f, auto_apertura: e.target.checked }))} /> Auto-apertura cuando salidas previas llegan al 75%
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setEditingSalida(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={saveSalida} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Guardar Salida</button>
            </div>
          </div>
        </div>
      )}

      {/* Cierre Form Modal */}
      {showCierreForm && (
        <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && setShowCierreForm(false)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 460 }}>
            <h3 style={{ marginBottom: 20, fontSize: 17, fontWeight: 700 }}>Nuevo Cierre</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Tipo</label>
                <select value={cierreForm.tipo} onChange={e => setCierreForm(f => ({ ...f, tipo: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none" }}>
                  <option value="total">Total (todo el dia)</option><option value="parcial">Parcial (salidas especificas)</option>
                </select></div>
              <div><label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Fecha</label><input type="date" value={cierreForm.fecha} onChange={e => setCierreForm(f => ({ ...f, fecha: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
              {cierreForm.tipo === "parcial" && (
                <div>
                  <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 8, textTransform: "uppercase" }}>Salidas afectadas</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {salidas.map(s => {
                      const sel = cierreForm.salidas.includes(s.id);
                      return <button key={s.id} onClick={() => setCierreForm(f => ({ ...f, salidas: sel ? f.salidas.filter(x => x !== s.id) : [...f.salidas, s.id] }))} style={{ padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, background: sel ? B.sand : B.navy, color: sel ? B.navy : B.white, border: `1px solid ${B.navyLight}` }}>{s.hora} — {s.nombre}</button>;
                    })}
                  </div>
                </div>
              )}
              <div><label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase" }}>Motivo</label><input value={cierreForm.motivo} onChange={e => setCierreForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Motivo del cierre" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowCierreForm(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={addCierre} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: B.danger, color: B.white, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Crear Cierre</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════
export default function Pasadias() {
  const isMobile = useMobile();
  const [tab, setTab] = useState("pasadias");
  const [loading, setLoading] = useState(true);
  const [pasadias, setPasadias] = useState([]);
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [salidasData, setSalidasData] = useState([]);
  const [cierres, setCierres] = useState([]);

  const fetchPasadias = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("pasadias").select("*").order("orden");
    setPasadias(data || []);
  }, []);

  const fetchEmbarcaciones = useCallback(async () => {
    if (!supabase) return;
    const [embR, resR] = await Promise.all([
      supabase.from("embarcaciones").select("*"),
      supabase.from("reservas").select("embarcacion_asignada").neq("estado", "cancelado").not("embarcacion_asignada", "is", null),
    ]);
    const embs = embR.data || [];
    const usosMap = {};
    (resR.data || []).forEach(r => {
      if (r.embarcacion_asignada) usosMap[r.embarcacion_asignada] = (usosMap[r.embarcacion_asignada] || 0) + 1;
    });
    const embsConUsos = embs.map(e => ({ ...e, _usos: usosMap[e.nombre] || 0 }));
    // Propias primero, luego por uso descendente, luego por nombre
    embsConUsos.sort((a, b) => {
      const propA = a.propiedad === "propia" ? 0 : 1;
      const propB = b.propiedad === "propia" ? 0 : 1;
      if (propA !== propB) return propA - propB;
      if (b._usos !== a._usos) return b._usos - a._usos;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });
    setEmbarcaciones(embsConUsos);
  }, []);

  const fetchSalidas = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("salidas").select("*").order("orden");
    setSalidasData(data || []);
  }, []);

  const fetchCierres = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("cierres").select("*").order("fecha");
    setCierres(data || []);
  }, []);

  useEffect(() => {
    Promise.all([fetchPasadias(), fetchEmbarcaciones(), fetchSalidas(), fetchCierres()]).then(() => setLoading(false));
  }, [fetchPasadias, fetchEmbarcaciones, fetchSalidas, fetchCierres]);

  const capTotal = salidasData.filter(s => s.activo).reduce((s, r) => s + (r.capacidad_total || 0), 0);
  const botesActivos = embarcaciones.filter(e => e.estado === "activo").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif" }}>Pasadias</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 8 : 12, marginBottom: 20 }}>
        {[
          { label: "Tipos de Pasadia", val: pasadias.filter(p => p.activo).length, color: B.sand },
          { label: "Embarcaciones Activas", val: `${botesActivos} / ${embarcaciones.length}`, color: B.sky },
          { label: "Salidas Activas", val: salidasData.filter(s => s.activo).length, color: B.success },
          { label: "Capacidad / Día", val: `${capTotal} pax`, color: B.pink },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 10, padding: isMobile ? "12px 14px" : "16px 20px", borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: isMobile ? 10 : 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {[["pasadias", "🎫 Pasadias"], ["embarcaciones", "⛵ Embarcaciones"], ["salidas", "🕐 Salidas"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: isMobile ? "8px 14px" : "9px 20px", borderRadius: 8, border: "none", cursor: "pointer",
            fontSize: isMobile ? 12 : 13, fontWeight: 600, flexShrink: 0,
            background: tab === k ? B.sky : B.navyMid, color: tab === k ? B.navy : B.sand,
          }}>{l}</button>
        ))}
      </div>

      {tab === "pasadias" && <TabPasadias pasadias={pasadias} onRefresh={fetchPasadias} />}
      {tab === "embarcaciones" && <TabEmbarcaciones embarcaciones={embarcaciones} onRefresh={fetchEmbarcaciones} />}
      {tab === "salidas" && <TabSalidas salidas={salidasData} embarcaciones={embarcaciones} cierres={cierres} onRefreshSalidas={fetchSalidas} onRefreshCierres={fetchCierres} />}
    </div>
  );
}
