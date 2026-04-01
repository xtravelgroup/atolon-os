import { useState, useEffect, useCallback } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const TIPOS = [
  { key: "restaurant", label: "Menú Restaurant", color: "#2E7D52" },
  { key: "banquetes",  label: "Menú de Banquetes", color: "#1E3566" },
];

function ItemModal({ item, menuTipo, onClose, onSaved, categorias }) {
  const isEdit = !!item?.id;
  const [form, setForm] = useState(isEdit
    ? { ...item }
    : { nombre: "", descripcion: "", precio: "", categoria: categorias[0] || "", activo: true, orden: 0, menu_tipo: menuTipo });
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    const payload = {
      nombre:      form.nombre.trim(),
      descripcion: form.descripcion || "",
      precio:      Number(form.precio) || 0,
      categoria:   form.categoria || "General",
      activo:      form.activo,
      orden:       Number(form.orden) || 0,
      menu_tipo:   menuTipo,
    };
    if (isEdit) {
      await supabase.from("menu_items").update(payload).eq("id", item.id);
    } else {
      await supabase.from("menu_items").insert({ id: `MENU-${Date.now()}`, ...payload });
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>{isEdit ? "Editar ítem" : "Nuevo ítem de menú"}</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={LS}>Nombre del plato / ítem</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS} placeholder="Ej: Arroz con coco y camarones" autoFocus />
          </div>

          <div>
            <label style={LS}>Descripción</label>
            <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={2}
              style={{ ...IS, resize: "vertical" }} placeholder="Ingredientes, presentación, alérgenos..." />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Precio (COP)</label>
              <input type="number" value={form.precio} onChange={e => set("precio", e.target.value)} style={IS} placeholder="0" />
            </div>
            <div>
              <label style={LS}>Orden</label>
              <input type="number" value={form.orden} onChange={e => set("orden", e.target.value)} style={IS} placeholder="0" />
            </div>
          </div>

          <div>
            <label style={LS}>Categoría</label>
            <select value={form.categoria} onChange={e => set("categoria", e.target.value)} style={IS}>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">+ Nueva categoría...</option>
            </select>
            {form.categoria === "__new__" && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input value={newCat} onChange={e => setNewCat(e.target.value)} style={{ ...IS, flex: 1 }} placeholder="Nombre de la nueva categoría" />
                <button onClick={() => { if (newCat.trim()) set("categoria", newCat.trim()); setNewCat(""); }}
                  style={{ padding: "9px 14px", borderRadius: 8, background: B.sand, color: B.navy, border: "none", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>OK</button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={form.activo} onChange={e => set("activo", e.target.checked)} id="activo-chk" />
            <label htmlFor="activo-chk" style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>Activo en el menú</label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving || !form.nombre.trim()}
            style={{ flex: 2, padding: "11px", background: saving ? B.navyLight : B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Agregar ítem"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Menus() {
  const [tab,    setTab]    = useState("restaurant");
  const [items,  setItems]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,  setModal]  = useState(null); // null | "new" | item obj
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(null);

  const tipo = TIPOS.find(t => t.key === tab);

  const fetch = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("menu_items").select("*").order("categoria").order("orden").order("nombre");
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const tabItems = items.filter(i => i.menu_tipo === tab);
  const filtered = search
    ? tabItems.filter(i => i.nombre.toLowerCase().includes(search.toLowerCase()) || i.categoria.toLowerCase().includes(search.toLowerCase()))
    : tabItems;

  // Group by categoria
  const grouped = filtered.reduce((acc, i) => {
    const cat = i.categoria || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(i);
    return acc;
  }, {});

  const categorias = [...new Set(tabItems.map(i => i.categoria || "General"))].sort();

  const deleteItem = async (id) => {
    setDeleting(id);
    await supabase.from("menu_items").delete().eq("id", id);
    await fetch();
    setDeleting(null);
  };

  const toggleActivo = async (item) => {
    await supabase.from("menu_items").update({ activo: !item.activo }).eq("id", item.id);
    await fetch();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Menús</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar plato o categoría..."
            style={{ ...IS, width: 240 }} />
          <button onClick={() => setModal("new")}
            style={{ background: tipo.color, color: B.white, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            + Agregar ítem
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: B.navyMid, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {TIPOS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch(""); }}
            style={{ padding: "8px 24px", borderRadius: 7, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: tab === t.key ? t.color : "transparent",
              color: tab === t.key ? B.white : "rgba(255,255,255,0.45)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total ítems", val: tabItems.length, color: tipo.color },
          { label: "Activos", val: tabItems.filter(i => i.activo).length, color: B.success },
          { label: "Categorías", val: categorias.length, color: B.sand },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", flex: 1, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Menu items grouped by category */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "40px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🍽️</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
            {search ? "Sin resultados para esa búsqueda" : `No hay ítems en el ${tipo.label}. Agrega el primero.`}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, catItems]) => (
            <div key={cat}>
              <div style={{ fontSize: 13, fontWeight: 700, color: tipo.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, borderBottom: `2px solid ${tipo.color}33`, paddingBottom: 6 }}>
                {cat} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>({catItems.length})</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
                {catItems.sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre)).map(item => (
                  <div key={item.id} style={{
                    background: B.navyMid, borderRadius: 10, padding: "14px 16px",
                    borderLeft: `3px solid ${item.activo ? tipo.color : "rgba(255,255,255,0.1)"}`,
                    opacity: item.activo ? 1 : 0.5,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{item.nombre}</div>
                        {item.descripcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, marginBottom: 6 }}>{item.descripcion}</div>}
                        {item.precio > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: B.sand }}>{COP(item.precio)}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => toggleActivo(item)}
                          title={item.activo ? "Desactivar" : "Activar"}
                          style={{ padding: "5px 9px", borderRadius: 6, background: item.activo ? B.success + "22" : B.navyLight, color: item.activo ? B.success : "rgba(255,255,255,0.3)", border: "none", cursor: "pointer", fontSize: 12 }}>
                          {item.activo ? "●" : "○"}
                        </button>
                        <button onClick={() => setModal(item)}
                          style={{ padding: "5px 9px", borderRadius: 6, background: B.navyLight, color: B.white, border: "none", cursor: "pointer", fontSize: 12 }}>✏️</button>
                        <button onClick={() => deleteItem(item.id)} disabled={deleting === item.id}
                          style={{ padding: "5px 9px", borderRadius: 6, background: B.danger + "22", color: B.danger, border: "none", cursor: "pointer", fontSize: 12 }}>
                          {deleting === item.id ? "..." : "✕"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ItemModal
          item={modal === "new" ? null : modal}
          menuTipo={tab}
          categorias={categorias.length > 0 ? categorias : ["General"]}
          onClose={() => setModal(null)}
          onSaved={fetch}
        />
      )}
    </div>
  );
}
