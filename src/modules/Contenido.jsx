import { useState, useEffect, useCallback } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

// ─── Metadatos ───────────────────────────────────
const TIPO_META = {
  articulo:   { label: "Artículo",   icon: "📚", color: "#60A5FA" },
  promocion:  { label: "Promoción",  icon: "🎉", color: "#FBBF24" },
  newsletter: { label: "Newsletter", icon: "📰", color: "#34D399" },
};
const CAT_META = {
  foto:   { label: "Foto",   icon: "🖼",  color: "#60A5FA" },
  video:  { label: "Video",  icon: "🎬",  color: "#F472B6" },
  story:  { label: "Story",  icon: "📱",  color: "#A78BFA" },
  banner: { label: "Banner", icon: "🎨",  color: "#FBBF24" },
  logo:   { label: "Logo",   icon: "✨",  color: "#34D399" },
};

// ═══════════════════════════════════════════════
// TAB PUBLICACIONES — artículos, promos, newsletters
// ═══════════════════════════════════════════════
function TabPublicaciones() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState("todos");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]    = useState(null);
  const [saving, setSaving]      = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [expanded, setExpanded]  = useState(null);

  const EMPTY = { tipo: "articulo", titulo: "", descripcion: "", cuerpo: "", imagen_url: "", link_externo: "", label_link: "Ver más", destacado: false, fecha_expira: "" };
  const [form, setForm] = useState(EMPTY);
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const fetchItems = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("b2b_contenido").select("*")
      .order("destacado", { ascending: false }).order("created_at", { ascending: false });
    setItems(data || []); setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openNew  = () => { setForm(EMPTY); setEditing(null); setShowModal(true); };
  const openEdit = (item) => { setForm({ ...item, fecha_expira: item.fecha_expira || "" }); setEditing(item.id); setShowModal(true); };

  const uploadImg = async (file) => {
    if (!supabase || !file) return;
    setUploadingImg(true);
    const path = `contenido/img-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from("b2b-docs").getPublicUrl(path);
      upd("imagen_url", urlData.publicUrl);
    }
    setUploadingImg(false);
  };

  const save = async () => {
    if (!supabase || !form.titulo.trim() || saving) return;
    setSaving(true);
    const payload = {
      tipo: form.tipo, titulo: form.titulo.trim(), descripcion: form.descripcion.trim(),
      cuerpo: form.cuerpo.trim(), imagen_url: form.imagen_url || null,
      link_externo: form.link_externo.trim() || null, label_link: form.label_link.trim() || "Ver más",
      destacado: form.destacado, activo: true,
      fecha_expira: form.fecha_expira || null,
    };
    if (editing) {
      await supabase.from("b2b_contenido").update(payload).eq("id", editing);
    } else {
      await supabase.from("b2b_contenido").insert({ id: `CNT-${Date.now()}`, ...payload });
    }
    setSaving(false); setShowModal(false); fetchItems();
  };

  const toggleActivo = async (item) => {
    if (!supabase) return;
    await supabase.from("b2b_contenido").update({ activo: !item.activo }).eq("id", item.id);
    fetchItems();
  };

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const filtrados = filtro === "todos" ? items : items.filter(it => it.tipo === filtro);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[["todos", "Todos"], ["promocion", "🎉 Promociones"], ["newsletter", "📰 Newsletters"], ["articulo", "📚 Artículos"]].map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} style={{ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: filtro === k ? B.sky : B.navyMid, color: filtro === k ? B.navy : "rgba(255,255,255,0.6)" }}>{l}</button>
          ))}
        </div>
        <button onClick={openNew} style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Nueva publicación
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total",     val: items.length,                       color: B.sky },
          { label: "Activas",   val: items.filter(i => i.activo).length, color: B.success },
          { label: "Destacadas",val: items.filter(i => i.destacado && i.activo).length, color: B.sand },
          { label: "Vencidas",  val: items.filter(i => i.tipo === "promocion" && i.fecha_expira && i.fecha_expira < hoy).length, color: B.warning },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 10, padding: "14px 20px", flex: 1, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>}

      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtrados.map(item => {
          const meta = TIPO_META[item.tipo] || TIPO_META.articulo;
          const isExp = expanded === item.id;
          const vencida = item.tipo === "promocion" && item.fecha_expira && item.fecha_expira < hoy;
          return (
            <div key={item.id} style={{ background: B.navyMid, borderRadius: 12, border: `1px solid ${!item.activo ? B.navyLight + "44" : item.destacado ? meta.color + "44" : B.navyLight}`, opacity: item.activo ? 1 : 0.5, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                {/* Imagen miniatura */}
                {item.imagen_url
                  ? <div style={{ width: 52, height: 52, borderRadius: 8, background: `url(${item.imagen_url}) center/cover`, flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 52, borderRadius: 8, background: meta.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{meta.icon}</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: meta.color + "22", color: meta.color, fontWeight: 700 }}>{meta.icon} {meta.label}</span>
                    {item.destacado && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: B.sand + "22", color: B.sand, fontWeight: 700 }}>⭐ Destacado</span>}
                    {!item.activo && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>Inactivo</span>}
                    {vencida && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: B.warning + "22", color: B.warning, fontWeight: 700 }}>⏰ Vencida</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.titulo}</div>
                  {item.descripcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</div>}
                </div>
                {item.fecha_expira && (
                  <div style={{ fontSize: 11, color: vencida ? B.warning : "rgba(255,255,255,0.4)", textAlign: "center", flexShrink: 0 }}>
                    <div>Vence</div>
                    <div style={{ fontWeight: 700 }}>{new Date(item.fecha_expira + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {item.cuerpo && (
                    <button onClick={() => setExpanded(isExp ? null : item.id)}
                      style={{ padding: "7px 12px", borderRadius: 7, background: B.navyLight, border: "none", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>
                      {isExp ? "▲" : "▼"}
                    </button>
                  )}
                  <button onClick={() => openEdit(item)} style={{ padding: "7px 12px", borderRadius: 7, background: B.navyLight, border: "none", color: B.sand, fontSize: 11, cursor: "pointer" }}>✏ Editar</button>
                  <button onClick={() => toggleActivo(item)} style={{ padding: "7px 12px", borderRadius: 7, background: item.activo ? B.danger + "22" : B.success + "22", border: `1px solid ${item.activo ? B.danger + "44" : B.success + "44"}`, color: item.activo ? B.danger : B.success, fontSize: 11, cursor: "pointer" }}>
                    {item.activo ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
              {isExp && item.cuerpo && (
                <div style={{ padding: "0 18px 16px 84px", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, whiteSpace: "pre-wrap", borderTop: `1px solid ${B.navyLight}22` }}>
                  {item.cuerpo}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtrados.length === 0 && (
          <div style={{ textAlign: "center", padding: 64, color: "rgba(255,255,255,0.25)" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
            <div>No hay publicaciones</div>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>{editing ? "Editar publicación" : "Nueva publicación"}</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={LS}>Tipo</label>
                <select value={form.tipo} onChange={e => upd("tipo", e.target.value)} style={IS}>
                  <option value="articulo">📚 Artículo</option>
                  <option value="promocion">🎉 Promoción</option>
                  <option value="newsletter">📰 Newsletter</option>
                </select>
              </div>
              {form.tipo === "promocion" && (
                <div>
                  <label style={LS}>Fecha de vencimiento</label>
                  <input type="date" value={form.fecha_expira} onChange={e => upd("fecha_expira", e.target.value)} style={IS} />
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={LS}>Título *</label>
              <input value={form.titulo} onChange={e => upd("titulo", e.target.value)} placeholder="Ej: Oferta especial temporada alta" style={IS} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={LS}>Descripción corta (resumen)</label>
              <input value={form.descripcion} onChange={e => upd("descripcion", e.target.value)} placeholder="Un párrafo breve visible en la tarjeta..." style={IS} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={LS}>Cuerpo completo (texto expandible)</label>
              <textarea value={form.cuerpo} onChange={e => upd("cuerpo", e.target.value)} placeholder="Contenido detallado de la publicación..." rows={6}
                style={{ ...IS, resize: "vertical", lineHeight: 1.5 }} />
            </div>

            {/* Imagen portada */}
            <div style={{ marginBottom: 12 }}>
              <label style={LS}>Imagen de portada</label>
              {form.imagen_url && (
                <div style={{ height: 120, background: `url(${form.imagen_url}) center/cover`, borderRadius: 8, marginBottom: 8 }} />
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderRadius: 8, border: `1px dashed ${B.navyLight}`, cursor: "pointer", background: B.navy }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{uploadingImg ? "⏳ Subiendo..." : "⬆ Subir imagen"}</span>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && uploadImg(e.target.files[0])} />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 8, marginBottom: 12 }}>
              <div>
                <label style={LS}>Link externo (opcional)</label>
                <input value={form.link_externo} onChange={e => upd("link_externo", e.target.value)} placeholder="https://..." style={IS} />
              </div>
              <div>
                <label style={LS}>Texto del botón</label>
                <input value={form.label_link} onChange={e => upd("label_link", e.target.value)} placeholder="Ver más" style={IS} />
              </div>
            </div>

            <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" id="dest-m" checked={form.destacado} onChange={e => upd("destacado", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
              <label htmlFor="dest-m" style={{ fontSize: 13, color: B.sand, cursor: "pointer" }}>⭐ Marcar como destacado (aparece primero con borde de color)</label>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: 11, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={save} disabled={saving || !form.titulo.trim()}
                style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: saving || !form.titulo.trim() ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer" }}>
                {saving ? "Guardando..." : editing ? "Guardar cambios" : "Publicar ahora"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB MEDIA KIT — gestión de archivos descargables
// ═══════════════════════════════════════════════
function TabMediaKit() {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [categoria, setCategoria] = useState("todos");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [saving, setSaving]       = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  const EMPTY = { categoria: "foto", titulo: "", descripcion: "", archivo_url: "", thumbnail_url: "", tipo_archivo: "", tamano_kb: "", dimensiones: "" };
  const [form, setForm] = useState(EMPTY);
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const fetchItems = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("b2b_media_kit").select("*")
      .order("orden").order("created_at", { ascending: false });
    setItems(data || []); setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openNew  = () => { setForm(EMPTY); setEditing(null); setShowModal(true); };
  const openEdit = (item) => { setForm({ ...item }); setEditing(item.id); setShowModal(true); };

  const uploadFile = async (file, isThumb = false) => {
    if (!supabase || !file) return;
    isThumb ? setUploadingThumb(true) : setUploadingFile(true);
    const path = `media-kit/${isThumb ? "thumb" : "file"}-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from("b2b-docs").getPublicUrl(path);
      if (isThumb) {
        upd("thumbnail_url", urlData.publicUrl);
      } else {
        upd("archivo_url", urlData.publicUrl);
        upd("tipo_archivo", file.type);
        upd("tamano_kb", Math.round(file.size / 1024));
      }
    }
    isThumb ? setUploadingThumb(false) : setUploadingFile(false);
  };

  const save = async () => {
    if (!supabase || !form.titulo.trim() || !form.archivo_url || saving) return;
    setSaving(true);
    const payload = {
      categoria: form.categoria, titulo: form.titulo.trim(), descripcion: form.descripcion.trim(),
      archivo_url: form.archivo_url, thumbnail_url: form.thumbnail_url || null,
      tipo_archivo: form.tipo_archivo || null, tamano_kb: Number(form.tamano_kb) || null,
      dimensiones: form.dimensiones.trim() || null, activo: true,
    };
    if (editing) {
      await supabase.from("b2b_media_kit").update(payload).eq("id", editing);
    } else {
      await supabase.from("b2b_media_kit").insert({ id: `MK-${Date.now()}`, orden: items.filter(i => i.activo).length, ...payload });
    }
    setSaving(false); setShowModal(false); fetchItems();
  };

  const toggleActivo = async (item) => {
    if (!supabase) return;
    await supabase.from("b2b_media_kit").update({ activo: !item.activo }).eq("id", item.id);
    fetchItems();
  };

  const fmtSize = (kb) => !kb ? "" : kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
  const filtrados = categoria === "todos" ? items : items.filter(i => i.categoria === categoria);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        {/* Filtro categorías */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setCategoria("todos")} style={{ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: categoria === "todos" ? B.sky : B.navyMid, color: categoria === "todos" ? B.navy : "rgba(255,255,255,0.6)" }}>
            Todos ({items.length})
          </button>
          {Object.entries(CAT_META).map(([k, m]) => {
            const cnt = items.filter(i => i.categoria === k).length;
            return (
              <button key={k} onClick={() => setCategoria(k)} style={{ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: categoria === k ? m.color : B.navyMid, color: categoria === k ? B.navy : "rgba(255,255,255,0.6)" }}>
                {m.icon} {m.label} {cnt > 0 && `(${cnt})`}
              </button>
            );
          })}
        </div>
        <button onClick={openNew} style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
          + Subir material
        </button>
      </div>

      {/* KPIs por categoría */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {Object.entries(CAT_META).map(([k, m]) => {
          const cnt = items.filter(i => i.categoria === k && i.activo).length;
          return (
            <div key={k} style={{ background: B.navyMid, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, border: `1px solid ${cnt > 0 ? m.color + "33" : B.navyLight}` }}>
              <span style={{ fontSize: 18 }}>{m.icon}</span>
              <div>
                <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase" }}>{m.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: cnt > 0 ? m.color : "rgba(255,255,255,0.3)" }}>{cnt}</div>
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>}

      {/* Grid de tarjetas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {filtrados.map(item => {
          const meta = CAT_META[item.categoria] || CAT_META.foto;
          const isVideo = item.tipo_archivo?.startsWith("video") || item.categoria === "video";
          const thumb = item.thumbnail_url || (isVideo ? null : item.archivo_url);
          return (
            <div key={item.id} style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${item.activo ? B.navyLight : B.navyLight + "33"}`, opacity: item.activo ? 1 : 0.45, display: "flex", flexDirection: "column" }}>
              {/* Preview */}
              <div style={{ height: 160, background: thumb ? `url(${thumb}) center/cover` : B.navy, flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {!thumb && <span style={{ fontSize: 44, opacity: 0.2 }}>{meta.icon}</span>}
                {isVideo && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 48, height: 48, borderRadius: 24, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>▶</div>
                  </div>
                )}
                <div style={{ position: "absolute", top: 8, left: 8 }}>
                  <span style={{ fontSize: 10, padding: "2px 9px", borderRadius: 20, background: meta.color + "dd", color: "#000", fontWeight: 700 }}>{meta.icon} {meta.label}</span>
                </div>
                {/* Botones admin sobre la imagen */}
                <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 4 }}>
                  <button onClick={() => openEdit(item)} style={{ width: 30, height: 30, borderRadius: 6, background: "rgba(0,0,0,0.65)", border: "none", color: B.sand, fontSize: 12, cursor: "pointer" }}>✏</button>
                  <button onClick={() => toggleActivo(item)} style={{ width: 30, height: 30, borderRadius: 6, background: "rgba(0,0,0,0.65)", border: "none", color: item.activo ? B.danger : B.success, fontSize: 13, cursor: "pointer" }}>{item.activo ? "👁" : "🚫"}</button>
                </div>
              </div>
              {/* Info */}
              <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3, lineHeight: 1.3 }}>{item.titulo}</div>
                {item.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 6, lineHeight: 1.4 }}>{item.descripcion}</div>}
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  {item.dimensiones && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: B.navyLight, color: "rgba(255,255,255,0.5)" }}>{item.dimensiones}</span>}
                  {item.tamano_kb > 0 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{fmtSize(item.tamano_kb)}</span>}
                </div>
                <div style={{ flex: 1 }} />
                <a href={item.archivo_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", padding: "8px 0", borderRadius: 7, background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}33`, fontSize: 11, fontWeight: 700, textAlign: "center", textDecoration: "none" }}>
                  ⬇ Ver / Descargar
                </a>
              </div>
            </div>
          );
        })}
        {!loading && filtrados.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 64, color: "rgba(255,255,255,0.25)" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
            <div>No hay material en esta categoría</div>
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>Haz clic en "+ Subir material" para agregar</div>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: "100%", maxWidth: 540, maxHeight: "92vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>{editing ? "Editar material" : "Subir nuevo material"}</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={LS}>Categoría</label>
                <select value={form.categoria} onChange={e => upd("categoria", e.target.value)} style={IS}>
                  {Object.entries(CAT_META).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Dimensiones</label>
                <input value={form.dimensiones} onChange={e => upd("dimensiones", e.target.value)} placeholder="1080x1080, 1920x1080..." style={IS} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={LS}>Título *</label>
              <input value={form.titulo} onChange={e => upd("titulo", e.target.value)} placeholder="Ej: Foto aérea playa · verano 2025" style={IS} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={LS}>Descripción (sugerencia de uso)</label>
              <input value={form.descripcion} onChange={e => upd("descripcion", e.target.value)} placeholder="Ideal para posts del feed, formato cuadrado..." style={IS} />
            </div>

            {/* Archivo principal */}
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Archivo principal * (foto o video)</label>
              <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 10, border: `2px dashed ${form.archivo_url ? B.success : B.navyLight}`, background: B.navy, cursor: "pointer", transition: "border-color 0.2s" }}>
                {form.archivo_url
                  ? <><span style={{ fontSize: 18 }}>✅</span><span style={{ fontSize: 13, color: B.success, fontWeight: 700 }}>Archivo subido correctamente</span></>
                  : <><span style={{ fontSize: 18, opacity: 0.4 }}>📁</span><span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{uploadingFile ? "⏳ Subiendo..." : "Haz clic para subir (foto, video, PDF...)"}</span></>
                }
                <input type="file" accept="image/*,video/*,.pdf,.zip" style={{ display: "none" }} onChange={e => e.target.files[0] && uploadFile(e.target.files[0])} />
              </label>
            </div>

            {/* Miniatura para videos */}
            <div style={{ marginBottom: 24 }}>
              <label style={LS}>Imagen de previsualización — opcional, recomendado para videos</label>
              <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, border: `1px dashed ${form.thumbnail_url ? B.success : B.navyLight}`, background: B.navy, cursor: "pointer" }}>
                {form.thumbnail_url
                  ? <><span style={{ fontSize: 16 }}>✅</span><span style={{ fontSize: 12, color: B.success }}>Miniatura subida</span></>
                  : <><span style={{ fontSize: 16, opacity: 0.4 }}>🖼</span><span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{uploadingThumb ? "⏳ Subiendo..." : "Subir imagen de portada"}</span></>
                }
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && uploadFile(e.target.files[0], true)} />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: 11, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={save} disabled={saving || !form.titulo.trim() || !form.archivo_url}
                style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: saving || !form.titulo.trim() || !form.archivo_url ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer" }}>
                {saving ? "Guardando..." : editing ? "Guardar cambios" : "Subir al portal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN — Módulo Contenido
// ═══════════════════════════════════════════════
export default function Contenido() {
  const [tab, setTab] = useState("publicaciones");

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Contenido del Portal B2B</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Gestiona lo que las agencias ven en sus tabs de Novedades y Redes Sociales</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, background: B.navyMid, borderRadius: 12, padding: 5 }}>
        {[
          ["publicaciones", "📢 Publicaciones", "Artículos, promociones y newsletters"],
          ["mediakit",      "📲 Media Kit",      "Fotos, videos y banners para descargar"],
        ].map(([k, l, d]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: "12px 20px", borderRadius: 9, border: "none", cursor: "pointer",
            fontSize: 14, fontWeight: tab === k ? 700 : 500, textAlign: "left",
            background: tab === k ? B.sky : "transparent",
            color: tab === k ? B.navy : "rgba(255,255,255,0.5)",
            transition: "all 0.15s",
          }}>
            <div>{l}</div>
            <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>{d}</div>
          </button>
        ))}
      </div>

      {tab === "publicaciones" && <TabPublicaciones />}
      {tab === "mediakit"      && <TabMediaKit />}
    </div>
  );
}
