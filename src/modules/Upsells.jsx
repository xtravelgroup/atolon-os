// Upsells.jsx — Gestión de ofertas adicionales del widget de reservas
import { useState, useEffect } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const PRODUCTS_OPTS = [
  { slug: "vip-pass",          label: "VIP Pass" },
  { slug: "exclusive-pass",    label: "Exclusive Pass" },
  { slug: "atolon-experience", label: "Atolon Experience" },
  { slug: "after-island",      label: "After Island" },
];

const EMPTY = {
  nombre: "", descripcion: "", precio: "", por_persona: true,
  tipo: "addon", upgrade_slug: "", aplica_a: [],
  condicion_no_ninos: false, emoji: "🎁", activo: true, orden: 0, foto_url: "",
};

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: "#0D1B3E", border: "1px solid #1E3566", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "#C8B99A", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

export default function Upsells() {
  const [items,        setItems]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState(null);
  const [form,         setForm]         = useState(EMPTY);
  const [saving,       setSaving]       = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const fetch = async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("upsells").select("*").order("orden");
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const openNew  = () => { setForm(EMPTY); setModal("new"); };
  const openEdit = (u) => { setForm({ ...u, precio: String(u.precio || ""), aplica_a: u.aplica_a || [], foto_url: u.foto_url || "" }); setModal(u); };
  const closeModal = () => { setModal(null); setSaving(false); };

  const toggleAplicaA = (slug) => {
    setForm(f => ({
      ...f,
      aplica_a: f.aplica_a.includes(slug) ? f.aplica_a.filter(s => s !== slug) : [...f.aplica_a, slug],
    }));
  };

  const save = async () => {
    if (!supabase || !form.nombre.trim()) return;
    setSaving(true);
    const payload = {
      nombre:              form.nombre.trim(),
      descripcion:         form.descripcion || "",
      precio:              Number(form.precio) || 0,
      por_persona:         form.por_persona,
      tipo:                form.tipo,
      upgrade_slug:        form.tipo === "upgrade" ? form.upgrade_slug : null,
      aplica_a:            form.aplica_a,
      condicion_no_ninos:  form.condicion_no_ninos,
      emoji:               form.emoji || "🎁",
      activo:              form.activo,
      orden:               Number(form.orden) || 0,
      foto_url:            form.foto_url || null,
    };
    if (modal === "new") {
      await supabase.from("upsells").insert({ id: `UP-${Date.now()}`, ...payload });
    } else {
      await supabase.from("upsells").update(payload).eq("id", modal.id);
    }
    await fetch();
    closeModal();
  };

  const toggle = async (id, field, val) => {
    await supabase.from("upsells").update({ [field]: !val }).eq("id", id);
    setItems(prev => prev.map(u => u.id === id ? { ...u, [field]: !val } : u));
  };

  const uploadFoto = async (file) => {
    if (!supabase || !file) return;
    setUploadingImg(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `upsells/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("b2b-docs").getPublicUrl(path);
      setForm(f => ({ ...f, foto_url: urlData.publicUrl }));
    } catch (e) {
      alert("Error subiendo imagen: " + e.message);
    }
    setUploadingImg(false);
  };

  const del = async (id) => {
    if (!window.confirm("¿Eliminar este upsell?")) return;
    await supabase.from("upsells").delete().eq("id", id);
    setItems(prev => prev.filter(u => u.id !== id));
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Upsells</h2>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
            Ofertas adicionales que se muestran en el widget web antes del pago
          </div>
        </div>
        <button onClick={openNew} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Nuevo Upsell
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, border: `1px solid ${B.navyLight}` }}>
        💡 Los upsells aparecen <strong style={{ color: B.sand }}>después de que el cliente llena sus datos</strong> y antes de pagar.
        El tipo <strong style={{ color: "#a5b4fc" }}>Upgrade</strong> reemplaza el producto seleccionado.
        El tipo <strong style={{ color: B.sky }}>Add-on</strong> suma al total.
      </div>

      {items.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⬆️</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Sin upsells configurados</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Crea tu primer upsell para aumentar el ticket promedio.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map(u => (
            <div key={u.id} style={{ background: B.navyMid, borderRadius: 12, padding: "18px 22px", border: `1px solid ${u.activo ? B.navyLight : B.danger + "33"}`, opacity: u.activo ? 1 : 0.55, display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: B.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{u.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{u.nombre}</span>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: u.tipo === "upgrade" ? "#a5b4fc22" : B.sky + "22", color: u.tipo === "upgrade" ? "#a5b4fc" : B.sky, fontWeight: 700 }}>
                    {u.tipo === "upgrade" ? "⬆ Upgrade" : "➕ Add-on"}
                  </span>
                  {u.condicion_no_ninos && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.warning + "22", color: B.warning }}>Solo sin niños</span>}
                  {(u.aplica_a || []).length > 0 && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.navyLight, color: "rgba(255,255,255,0.5)" }}>
                      {u.aplica_a.join(", ")}
                    </span>
                  )}
                </div>
                {u.descripcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6, lineHeight: 1.5 }}>{u.descripcion}</div>}
                <div style={{ fontSize: 14, fontWeight: 700, color: B.sand }}>
                  {COP(u.precio)} {u.por_persona ? "/ persona" : "flat"}
                  {u.tipo === "upgrade" && u.upgrade_slug && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 400 }}> → {u.upgrade_slug}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <button onClick={() => toggle(u.id, "activo", u.activo)} style={{ background: u.activo ? B.success + "22" : B.navyLight, color: u.activo ? B.success : "rgba(255,255,255,0.4)", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                  {u.activo ? "Activo" : "Inactivo"}
                </button>
                <button onClick={() => openEdit(u)} style={{ background: B.navyLight, color: B.sand, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Editar</button>
                <button onClick={() => del(u.id)} style={{ background: B.danger + "22", color: B.danger, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 22 }}>
              {modal === "new" ? "Nuevo Upsell" : `Editar: ${modal.nombre}`}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
                <div>
                  <label style={LS}>Nombre</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} style={IS} placeholder="Ej: Upgrade a Exclusive Pass" />
                </div>
                <div style={{ width: 70 }}>
                  <label style={LS}>Emoji</label>
                  <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} style={IS} placeholder="🎁" />
                </div>
              </div>

              <div>
                <label style={LS}>Descripción</label>
                <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} style={{ ...IS, resize: "vertical" }} placeholder="Qué incluye este upsell..." />
              </div>

              {/* Foto */}
              <div>
                <label style={LS}>Foto (se muestra en el widget)</label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {form.foto_url && (
                    <div style={{ position: "relative", width: 90, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                      <img src={form.foto_url} alt="upsell" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button onClick={() => setForm(f => ({ ...f, foto_url: "" }))}
                        style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "white", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  )}
                  <label style={{ cursor: "pointer", display: "inline-block" }}>
                    <div style={{ padding: "8px 16px", borderRadius: 8, background: B.navyLight, fontSize: 12, color: B.sand, fontWeight: 600, cursor: "pointer" }}>
                      {uploadingImg ? "Subiendo..." : form.foto_url ? "Cambiar foto" : "+ Subir foto"}
                    </div>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && uploadFoto(e.target.files[0])} />
                  </label>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LS}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={IS}>
                    <option value="addon">➕ Add-on</option>
                    <option value="upgrade">⬆ Upgrade</option>
                  </select>
                </div>
                <div>
                  <label style={LS}>Precio</label>
                  <input type="number" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} style={IS} placeholder="0" />
                </div>
                <div>
                  <label style={LS}>Cobrar</label>
                  <select value={form.por_persona ? "pp" : "flat"} onChange={e => setForm(f => ({ ...f, por_persona: e.target.value === "pp" }))} style={IS}>
                    <option value="pp">Por persona</option>
                    <option value="flat">Precio fijo</option>
                  </select>
                </div>
              </div>

              {form.tipo === "upgrade" && (
                <div>
                  <label style={LS}>Hacer upgrade hacia…</label>
                  <select value={form.upgrade_slug} onChange={e => setForm(f => ({ ...f, upgrade_slug: e.target.value }))} style={IS}>
                    <option value="">Seleccionar producto…</option>
                    {PRODUCTS_OPTS.map(p => <option key={p.slug} value={p.slug}>{p.label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={LS}>Aplica a los productos (vacío = todos)</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  {PRODUCTS_OPTS.map(p => (
                    <button key={p.slug} type="button" onClick={() => toggleAplicaA(p.slug)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", background: form.aplica_a.includes(p.slug) ? B.sky : B.navyLight, color: form.aplica_a.includes(p.slug) ? B.navy : "rgba(255,255,255,0.5)" }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.condicion_no_ninos} onChange={e => setForm(f => ({ ...f, condicion_no_ninos: e.target.checked }))} />
                  Solo mostrar si no hay niños
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                  Activo
                </label>
              </div>

              <div style={{ width: 80 }}>
                <label style={LS}>Orden</label>
                <input type="number" value={form.orden} onChange={e => setForm(f => ({ ...f, orden: e.target.value }))} style={IS} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={closeModal} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={save} disabled={saving || !form.nombre.trim()}
                style={{ flex: 2, padding: "11px", background: saving ? B.navyLight : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
