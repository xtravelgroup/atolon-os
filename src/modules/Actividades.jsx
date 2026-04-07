// Actividades.jsx — Catálogo y venta de actividades
import { useState, useEffect } from "react";
import { B, COP, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { AcknowledgeModal, AcknowledgeRecibo, DISCLAIMER_TEXT } from "../lib/AcknowledgeModal";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const CATEGORIAS = ["Bienestar", "Aventura", "Cultura", "Acuático", "Gastronomía", "Otro"];

const CAT_COLORS = {
  Bienestar:   { bg: "#a78bfa22", color: "#a78bfa" },
  Aventura:    { bg: "#fb923c22", color: "#fb923c" },
  Cultura:     { bg: "#60a5fa22", color: "#60a5fa" },
  Acuático:    { bg: "#22d3ee22", color: "#22d3ee" },
  Gastronomía: { bg: "#4ade8022", color: "#4ade80" },
  Otro:        { bg: "#94a3b822", color: "#94a3b8" },
};

const RUTAS_TERRESTRE_V = [
  { key: "aeropuerto",  label: "Aeropuerto" },
  { key: "bocagrande",  label: "Bocagrande" },
  { key: "centro",      label: "Centro" },
  { key: "la_boquilla", label: "La Boquilla" },
  { key: "zona_norte",  label: "Zona Norte" },
  { key: "otro",        label: "Otro" },
];
const RUTAS_ACUATICAS_V = [
  { key: "cta_atl",     label: "Cartagena → Atolon" },
  { key: "atl_cta",     label: "Atolon → Cartagena" },
  { key: "cta_atl_cta", label: "Cartagena → Atolon → Cartagena" },
  { key: "atl_cta_atl", label: "Atolon → Cartagena → Atolon" },
  { key: "atl_rosario", label: "Atolon → Isla del Rosario" },
  { key: "otros",       label: "Otros" },
];

const FORMAS_PAGO = [
  { key: "efectivo",     label: "Efectivo",    icon: "💵" },
  { key: "datafono",     label: "Datáfono",    icon: "💳" },
  { key: "transferencia",label: "Transferencia",icon: "🏦" },
  { key: "cxc",          label: "CXC",         icon: "📋" },
  { key: "habitacion",   label: "Habitación",  icon: "🏨" },
  { key: "link",         label: "Mandar Link", icon: "🔗" },
];

const EMPTY_ACT = {
  nombre: "", categoria: "Otro", descripcion: "",
  precio: "", precio_nino: "0", precio_tipo: "por_persona", duracion: "",
  cupo_max: "", proveedor: "", activo: true, orden: "0",
};

// ─── Catalogo Tab ─────────────────────────────────────────────────────────────
export function TabCatalogo() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // null | "new" | activity object
  const [form, setForm]       = useState(EMPTY_ACT);
  const [saving, setSaving]   = useState(false);

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("actividades").select("*").order("orden").order("nombre");
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew  = () => { setForm(EMPTY_ACT); setModal("new"); };
  const openEdit = (a) => {
    setForm({
      nombre:      a.nombre || "",
      categoria:   a.categoria || "Otro",
      descripcion: a.descripcion || "",
      precio:      String(a.precio ?? ""),
      precio_nino: String(a.precio_nino ?? "0"),
      precio_tipo: a.precio_tipo || "por_persona",
      duracion:    a.duracion || "",
      cupo_max:    a.cupo_max != null ? String(a.cupo_max) : "",
      proveedor:   a.proveedor || "",
      activo:      a.activo !== false,
      orden:       String(a.orden ?? "0"),
    });
    setModal(a);
  };
  const closeModal = () => { setModal(null); setSaving(false); };

  const save = async () => {
    if (!supabase || !form.nombre.trim()) return;
    setSaving(true);
    const payload = {
      nombre:      form.nombre.trim(),
      categoria:   form.categoria,
      descripcion: form.descripcion || "",
      precio:      Number(form.precio) || 0,
      precio_nino: Number(form.precio_nino) || 0,
      duracion:    form.duracion || "",
      cupo_max:    form.cupo_max !== "" ? Number(form.cupo_max) : null,
      precio_tipo: form.precio_tipo || "por_persona",
      proveedor:   form.proveedor || null,
      activo:      form.activo,
      orden:       Number(form.orden) || 0,
    };
    let error;
    if (modal === "new") {
      ({ error } = await supabase.from("actividades").insert({ id: `ACT-${Date.now()}`, ...payload }));
    } else {
      ({ error } = await supabase.from("actividades").update(payload).eq("id", modal.id));
    }
    if (error) {
      alert("Error al guardar: " + error.message);
      setSaving(false);
      return;
    }
    await load();
    closeModal();
  };

  const toggleActivo = async (id, current) => {
    await supabase.from("actividades").update({ activo: !current }).eq("id", id);
    setItems(prev => prev.map(a => a.id === id ? { ...a, activo: !current } : a));
  };

  const del = async (id) => {
    if (!window.confirm("¿Eliminar esta actividad?")) return;
    await supabase.from("actividades").delete().eq("id", id);
    setItems(prev => prev.filter(a => a.id !== id));
  };

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>Catálogo de Actividades</h2>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{items.length} actividades configuradas</div>
        </div>
        <button onClick={openNew} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Nueva Actividad
        </button>
      </div>

      {items.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Sin actividades</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Crea tu primera actividad para empezar a vender.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {items.map(a => {
            const cat = CAT_COLORS[a.categoria] || CAT_COLORS["Otro"];
            return (
              <div key={a.id} style={{ background: B.navyMid, borderRadius: 12, padding: "20px 24px", border: `1px solid ${a.activo ? "rgba(255,255,255,0.07)" : B.danger + "33"}`, opacity: a.activo ? 1 : 0.6 }}>
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{a.nombre}</div>
                    <span style={{ fontSize: 10, padding: "2px 9px", borderRadius: 8, background: cat.bg, color: cat.color, fontWeight: 700 }}>
                      {a.categoria || "Otro"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => toggleActivo(a.id, a.activo)}
                      style={{ background: a.activo ? B.success + "22" : B.navyLight, color: a.activo ? B.success : "rgba(255,255,255,0.4)", border: "none", borderRadius: 7, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>
                      {a.activo ? "Activo" : "Inactivo"}
                    </button>
                  </div>
                </div>

                {/* Prices */}
                <div style={{ display: "flex", gap: 16, marginBottom: 10, alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {a.precio_tipo === "por_actividad" ? "Por actividad" : "Por persona"}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: B.sky }}>{COP(a.precio)}</div>
                  </div>
                  {a.precio_tipo !== "por_actividad" && a.precio_nino > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Niño</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa" }}>{COP(a.precio_nino)}</div>
                    </div>
                  )}
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: a.precio_tipo === "por_actividad" ? "#fb923c22" : B.sky + "22", color: a.precio_tipo === "por_actividad" ? "#fb923c" : B.sky, fontWeight: 600, marginBottom: 2 }}>
                    {a.precio_tipo === "por_actividad" ? "🎯 x actividad" : "👤 x persona"}
                  </span>
                </div>

                {/* Meta */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                  {a.duracion && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>⏱ {a.duracion}</span>}
                  {a.proveedor && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>🤝 {a.proveedor}</span>}
                  {a.cupo_max  && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>👥 máx {a.cupo_max}</span>}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
                  <button onClick={() => openEdit(a)} style={{ flex: 1, background: B.navyLight, color: B.sand, border: "none", borderRadius: 7, padding: "7px 0", fontSize: 12, cursor: "pointer" }}>Editar</button>
                  <button onClick={() => del(a.id)} style={{ background: B.danger + "22", color: B.danger, border: "none", borderRadius: 7, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 520, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 22 }}>
              {modal === "new" ? "Nueva Actividad" : `Editar: ${modal.nombre}`}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Nombre + Categoria */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LS}>Nombre *</label>
                  <input value={form.nombre} onChange={e => f("nombre", e.target.value)} style={IS} placeholder="Ej: Kayak en manglares" />
                </div>
                <div>
                  <label style={LS}>Categoría</label>
                  <select value={form.categoria} onChange={e => f("categoria", e.target.value)} style={IS}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Descripcion */}
              <div>
                <label style={LS}>Descripción</label>
                <textarea value={form.descripcion} onChange={e => f("descripcion", e.target.value)} rows={2} style={{ ...IS, resize: "vertical" }} placeholder="Descripción de la actividad..." />
              </div>

              {/* Tipo de precio */}
              <div>
                <label style={LS}>Tipo de precio</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { key: "por_persona",   label: "👤 Por persona" },
                    { key: "por_actividad", label: "🎯 Por actividad" },
                  ].map(opt => (
                    <button key={opt.key} type="button" onClick={() => f("precio_tipo", opt.key)}
                      style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${form.precio_tipo === opt.key ? B.sky : B.navyLight}`, background: form.precio_tipo === opt.key ? B.sky + "22" : B.navy, color: form.precio_tipo === opt.key ? B.sky : "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: form.precio_tipo === opt.key ? 700 : 400, cursor: "pointer" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Precios + Duración */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LS}>{form.precio_tipo === "por_actividad" ? "Precio actividad *" : "Precio adulto *"}</label>
                  <input type="number" value={form.precio} onChange={e => f("precio", e.target.value)} style={IS} placeholder="0" min="0" />
                </div>
                <div style={{ opacity: form.precio_tipo === "por_actividad" ? 0.3 : 1, pointerEvents: form.precio_tipo === "por_actividad" ? "none" : "auto" }}>
                  <label style={LS}>Precio niño</label>
                  <input type="number" value={form.precio_tipo === "por_actividad" ? "0" : form.precio_nino} onChange={e => f("precio_nino", e.target.value)} style={IS} placeholder="0" min="0" />
                </div>
                <div>
                  <label style={LS}>Duración</label>
                  <input value={form.duracion} onChange={e => f("duracion", e.target.value)} style={IS} placeholder="1 hora" />
                </div>
              </div>

              {/* Proveedor + Cupo + Orden */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LS}>Proveedor</label>
                  <input value={form.proveedor} onChange={e => f("proveedor", e.target.value)} style={IS} placeholder="Nombre del proveedor" />
                </div>
                <div>
                  <label style={LS}>Cupo máx.</label>
                  <input type="number" value={form.cupo_max} onChange={e => f("cupo_max", e.target.value)} style={IS} placeholder="Sin límite" min="0" />
                </div>
                <div>
                  <label style={LS}>Orden</label>
                  <input type="number" value={form.orden} onChange={e => f("orden", e.target.value)} style={IS} placeholder="0" />
                </div>
              </div>

              {/* Activo */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={form.activo} onChange={e => f("activo", e.target.checked)} />
                Activo (visible en punto de venta)
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={closeModal} style={{ flex: 1, padding: 11, background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={save} disabled={saving || !form.nombre.trim()}
                style={{ flex: 2, padding: 11, background: saving ? B.navyLight : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vender Tab (POS) ─────────────────────────────────────────────────────────
function TabVender() {
  const [actividades, setActividades] = useState([]);
  const [transportes, setTransportes] = useState([]);
  const [loadingActs, setLoadingActs] = useState(true);
  const [cart, setCart] = useState([]); // [{tipo, cartId, ...}]
  const [rutaModal, setRutaModal] = useState(null); // menu_item para elegir ruta
  const [cliente, setCliente] = useState({ nombre: "", telefono: "", fecha: todayStr(), hora: "", notas: "" });
  const [formaPago, setFormaPago] = useState("efectivo");
  const [saving, setSaving] = useState(false);
  const [successId, setSuccessId] = useState(null);
  const [showAck, setShowAck] = useState(false);
  const [reciboData, setReciboData] = useState(null); // { firma, clienteNombre, servicios, fecha }
  const [ventas, setVentas] = useState([]);
  const [loadingVentas, setLoadingVentas] = useState(false);

  const loadActividades = async () => {
    if (!supabase) { setLoadingActs(false); return; }
    const { data } = await supabase.from("actividades").select("*").eq("activo", true).order("orden").order("nombre");
    setActividades(data || []);
    setLoadingActs(false);
  };

  const loadTransportes = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("menu_items").select("*")
      .in("menu_tipo", ["transportacion", "trans_acuatica"])
      .eq("activo", true).order("nombre");
    setTransportes(data || []);
  };

  const loadVentas = async () => {
    if (!supabase) return;
    setLoadingVentas(true);
    const hoy = todayStr();
    const { data } = await supabase.from("actividades_ventas").select("*").eq("fecha", hoy).order("created_at", { ascending: false }).limit(10);
    setVentas(data || []);
    setLoadingVentas(false);
  };

  useEffect(() => {
    loadActividades();
    loadTransportes();
    loadVentas();
  }, []);

  const addToCart = (act) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.tipo === "actividad" && i.actividad.id === act.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], adultos: next[idx].adultos + 1 };
        return next;
      }
      return [...prev, { tipo: "actividad", cartId: act.id, actividad: act, adultos: 1, ninos: 0 }];
    });
  };

  const addTransporte = (item, rutaKey, rutaLabel, precio) => {
    const cartId = `${item.id}-${rutaKey}-${Date.now()}`;
    setCart(prev => [...prev, { tipo: "transporte", cartId, item, ruta_key: rutaKey, ruta_label: rutaLabel, precio }]);
    setRutaModal(null);
  };

  const removeFromCart = (cartId) => setCart(prev => prev.filter(i => i.cartId !== cartId));

  const changeQty = (cartId, field, delta) => {
    setCart(prev => prev.map(i => {
      if (i.cartId !== cartId) return i;
      const next = { ...i, [field]: Math.max(0, i[field] + delta) };
      if (next.adultos === 0) return null;
      return next;
    }).filter(Boolean));
  };

  const itemSubtotal = (item) => {
    if (item.tipo === "transporte") return item.precio;
    return item.adultos * item.actividad.precio + item.ninos * (item.actividad.precio_nino || 0);
  };

  const total = cart.reduce((sum, i) => sum + itemSubtotal(i), 0);

  const canRegister = cart.length > 0 && cliente.nombre.trim() && formaPago !== "link";
  const isLink = formaPago === "link";

  const registrar = async (firma) => {
    if (!supabase || !canRegister) return;
    setSaving(true);
    const id = `AV-${Date.now()}`;
    const items = cart.map(i => i.tipo === "transporte"
      ? { actividad_id: i.item.id, nombre: `${i.item.nombre} — ${i.ruta_label}`, adultos: 1, ninos: 0, precio_unit: i.precio, precio_nino_unit: 0, subtotal: i.precio, tipo: "transporte", ruta: i.ruta_key }
      : { actividad_id: i.actividad.id, nombre: i.actividad.nombre, adultos: i.adultos, ninos: i.ninos, precio_unit: i.actividad.precio, precio_nino_unit: i.actividad.precio_nino || 0, subtotal: itemSubtotal(i) }
    );
    const first = cart[0];
    const isTrans = first.tipo === "transporte";
    const now = new Date().toISOString();
    const payload = {
      id,
      actividad_id:      isTrans ? first.item.id      : first.actividad.id,
      actividad_nombre:  isTrans ? `${first.item.nombre} — ${first.ruta_label}` : first.actividad.nombre,
      cliente_nombre:    cliente.nombre.trim(),
      cliente_tel:       cliente.telefono.trim() || null,
      adultos:           isTrans ? 1               : first.adultos,
      ninos:             isTrans ? 0               : first.ninos,
      precio_unitario:   isTrans ? first.precio    : first.actividad.precio,
      precio_nino_unit:  isTrans ? 0               : first.actividad.precio_nino || 0,
      total,
      forma_pago:        formaPago,
      estado:            "pagado",
      fecha:             cliente.fecha || todayStr(),
      hora:              cliente.hora || null,
      notas:             cliente.notas || null,
      items,
      firma_base64:      firma || null,
      acknowledge_at:    firma ? now : null,
    };
    const { error } = await supabase.from("actividades_ventas").insert(payload);
    if (error) {
      alert("Error registrando venta: " + error.message);
      setSaving(false);
      return;
    }
    setSuccessId(id);
    // Show printable recibo with the firma
    const fechaLegible = new Date().toLocaleString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
    setReciboData({ firma, clienteNombre: cliente.nombre.trim(), servicios: cart.map(i => i.actividad.nombre), fecha: fechaLegible });
    setCart([]);
    setSaving(false);
    await loadVentas();
  };

  const enviarLink = () => {
    const tel = cliente.telefono.trim().replace(/\D/g, "");
    if (!tel) { alert("Ingresa el teléfono del cliente."); return; }
    const msg = encodeURIComponent(`Hola ${cliente.nombre || ""}! Aquí está el link de pago para tu actividad:\nhttps://ncdyttgxuicyruathkxd.supabase.co`);
    window.open(`https://wa.me/${tel}?text=${msg}`, "_blank");
  };

  const cg = (k, v) => setCliente(p => ({ ...p, [k]: v }));

  if (loadingActs) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando actividades...</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "flex-start" }}>
      {/* ── Left: Activity picker ── */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>
          Actividades disponibles
        </div>

        {actividades.length === 0 ? (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 32, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            No hay actividades activas. Ve al Catálogo para agregarlas.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {actividades.map(a => {
              const cat = CAT_COLORS[a.categoria] || CAT_COLORS["Otro"];
              const inCart = cart.find(i => i.tipo === "actividad" && i.actividad.id === a.id);
              return (
                <button key={a.id} onClick={() => addToCart(a)}
                  style={{ background: inCart ? B.sky + "22" : B.navyMid, border: `1px solid ${inCart ? B.sky : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: "16px 14px", textAlign: "left", cursor: "pointer", transition: "all 0.15s" }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: cat.bg, color: cat.color, fontWeight: 700, display: "inline-block", marginBottom: 8 }}>
                    {a.categoria || "Otro"}
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: B.white, marginBottom: 4, lineHeight: 1.3 }}>{a.nombre}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: B.sky }}>{COP(a.precio)}</div>
                  {a.precio_nino > 0 && <div style={{ fontSize: 11, color: "#a78bfa" }}>Niño: {COP(a.precio_nino)}</div>}
                  {a.duracion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>⏱ {a.duracion}</div>}
                  {inCart && <div style={{ fontSize: 11, color: B.sky, marginTop: 6, fontWeight: 700 }}>✓ En carrito ×{inCart.adultos}</div>}
                </button>
              );
            })}
          </div>
        )}

        {/* Transportaciones */}
        {transportes.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>
              Transportaciones
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {transportes.map(t => {
                const isTerre = t.menu_tipo === "transportacion";
                const rutas = (isTerre ? RUTAS_TERRESTRE_V : RUTAS_ACUATICAS_V).filter(r => t.precios_rutas?.[r.key] > 0);
                return (
                  <button key={t.id} onClick={() => setRutaModal(t)}
                    style={{ background: B.navyMid, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px 14px", textAlign: "left", cursor: rutas.length ? "pointer" : "default", opacity: rutas.length ? 1 : 0.4, transition: "all 0.15s" }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: isTerre ? "#0891b222" : "#0e749022", color: isTerre ? "#38bdf8" : "#22d3ee", fontWeight: 700, display: "inline-block", marginBottom: 8 }}>
                      {isTerre ? "🚐 Terrestre" : "⛵ Acuática"}
                    </span>
                    <div style={{ fontSize: 13, fontWeight: 700, color: B.white, marginBottom: 4, lineHeight: 1.3 }}>{t.nombre}</div>
                    {t.categoria && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{t.categoria}</div>}
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>{rutas.length} ruta{rutas.length !== 1 ? "s" : ""}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent sales */}
        {ventas.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>
              Ventas de hoy
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ventas.map(v => (
                <div key={v.id} style={{ background: B.navyMid, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{v.cliente_nombre}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                      {v.actividad_nombre} · {v.adultos}A{v.ninos > 0 ? `+${v.ninos}N` : ""} · {v.forma_pago}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: B.sky }}>{COP(v.total)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Cart + Checkout ── */}
      <div style={{ position: "sticky", top: 20 }}>
        <div style={{ background: B.navyMid, borderRadius: 14, padding: "22px 20px", border: "1px solid rgba(255,255,255,0.07)" }}>

          {/* Success banner */}
          {successId && (
            <div style={{ background: B.success + "22", border: `1px solid ${B.success}55`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: B.success }}>
              ✓ Venta registrada — <strong>{successId}</strong>
              <button onClick={() => setSuccessId(null)} style={{ float: "right", background: "none", border: "none", color: B.success, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
          )}

          {/* Cart items */}
          <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>
            Carrito {cart.length > 0 && <span style={{ background: B.sky, color: B.navy, borderRadius: 8, padding: "2px 8px", fontSize: 11 }}>{cart.length}</span>}
          </div>

          {cart.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              Selecciona actividades de la izquierda
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {cart.map(item => (
                <div key={item.cartId} style={{ background: B.navy, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>
                      {item.tipo === "transporte" ? `${item.item.nombre}` : item.actividad.nombre}
                      {item.tipo === "transporte" && <div style={{ fontSize: 11, color: "#22d3ee", marginTop: 2 }}>📍 {item.ruta_label}</div>}
                    </div>
                    <button onClick={() => removeFromCart(item.cartId)}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16, padding: 0, marginLeft: 8 }}>✕</button>
                  </div>

                  {/* Transporte: precio fijo */}
                  {item.tipo === "transporte" ? (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Precio del viaje</div>
                  ) : (
                    <>
                      {/* Adultos */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: item.actividad.precio_nino > 0 ? 6 : 0 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Adultos × {COP(item.actividad.precio)}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button onClick={() => changeQty(item.cartId, "adultos", -1)}
                            style={{ width: 24, height: 24, borderRadius: 6, background: B.navyLight, border: "none", color: B.white, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{item.adultos}</span>
                          <button onClick={() => changeQty(item.cartId, "adultos", 1)}
                            style={{ width: 24, height: 24, borderRadius: 6, background: B.navyLight, border: "none", color: B.white, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      </div>
                      {/* Niños */}
                      {item.actividad.precio_nino > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Niños × {COP(item.actividad.precio_nino)}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button onClick={() => changeQty(item.cartId, "ninos", -1)}
                              style={{ width: 24, height: 24, borderRadius: 6, background: B.navyLight, border: "none", color: B.white, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{item.ninos}</span>
                            <button onClick={() => changeQty(item.cartId, "ninos", 1)}
                              style={{ width: 24, height: 24, borderRadius: 6, background: B.navyLight, border: "none", color: B.white, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Subtotal */}
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: B.sky, marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
                    {COP(itemSubtotal(item))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          {cart.length > 0 && (
            <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>TOTAL</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: B.sky }}>{COP(total)}</span>
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 16 }} />

          {/* Customer fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            <div>
              <label style={LS}>Nombre cliente *</label>
              <input value={cliente.nombre} onChange={e => cg("nombre", e.target.value)} style={IS} placeholder="Nombre completo" />
            </div>
            <div>
              <label style={LS}>Teléfono</label>
              <input value={cliente.telefono} onChange={e => cg("telefono", e.target.value)} style={IS} placeholder="+57..." />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={LS}>Fecha</label>
                <input type="date" value={cliente.fecha} onChange={e => cg("fecha", e.target.value)} style={IS} />
              </div>
              <div>
                <label style={LS}>Hora</label>
                <input type="time" value={cliente.hora} onChange={e => cg("hora", e.target.value)} style={IS} />
              </div>
            </div>
            <div>
              <label style={LS}>Notas</label>
              <textarea value={cliente.notas} onChange={e => cg("notas", e.target.value)} rows={2} style={{ ...IS, resize: "vertical" }} placeholder="Indicaciones especiales..." />
            </div>
          </div>

          {/* Forma de pago */}
          <div style={{ marginBottom: 16 }}>
            <label style={LS}>Forma de pago</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
              {FORMAS_PAGO.map(fp => (
                <button key={fp.key} onClick={() => setFormaPago(fp.key)}
                  style={{
                    padding: "9px 6px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: formaPago === fp.key ? B.sky : B.navy,
                    color: formaPago === fp.key ? B.navy : "rgba(255,255,255,0.55)",
                  }}>
                  {fp.icon} {fp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action button */}
          {isLink ? (
            <button onClick={enviarLink}
              style={{ width: "100%", padding: 13, borderRadius: 10, border: "none", background: "#25D366", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              📲 Enviar link WhatsApp
            </button>
          ) : (
            <button onClick={() => setShowAck(true)} disabled={!canRegister || saving}
              style={{ width: "100%", padding: 13, borderRadius: 10, border: "none", background: canRegister && !saving ? B.sky : B.navyLight, color: canRegister && !saving ? B.navy : "rgba(255,255,255,0.3)", fontSize: 14, fontWeight: 700, cursor: canRegister && !saving ? "pointer" : "default" }}>
              {saving ? "Registrando..." : "Registrar Venta"}
            </button>
          )}

          {!canRegister && !isLink && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 8 }}>
              {cart.length === 0 ? "Agrega actividades o transportaciones" : "Ingresa el nombre del cliente"}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal selector de ruta para transportes ── */}
      {rutaModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "24px 20px", width: "100%", maxWidth: 400, border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{rutaModal.nombre}</div>
              <button onClick={() => setRutaModal(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>Selecciona la ruta</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(rutaModal.menu_tipo === "transportacion" ? RUTAS_TERRESTRE_V : RUTAS_ACUATICAS_V)
                .filter(r => rutaModal.precios_rutas?.[r.key] > 0)
                .map(r => (
                  <button key={r.key}
                    onClick={() => addTransporte(rutaModal, r.key, r.label, Number(rutaModal.precios_rutas[r.key]))}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", background: B.navy, cursor: "pointer", width: "100%" }}>
                    <span style={{ fontSize: 13, color: B.white }}>{r.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: B.sky }}>{COP(Number(rutaModal.precios_rutas[r.key]))}</span>
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Acknowledge Modal (firma del cliente) ── */}
      {showAck && (
        <AcknowledgeModal
          clienteNombre={cliente.nombre.trim()}
          servicios={cart.map(i => i.tipo === "transporte" ? `${i.item.nombre} — ${i.ruta_label}` : i.actividad.nombre)}
          onConfirm={(firma) => { setShowAck(false); registrar(firma); }}
          onCancel={() => setShowAck(false)}
        />
      )}

      {/* ── Recibo imprimible ── */}
      {reciboData && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 16 }}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, width: "100%", maxWidth: 600, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: B.success }}>✓ Venta registrada</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => window.print()}
                  style={{ padding: "7px 16px", borderRadius: 8, background: B.sky, color: B.navy, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  🖨 Imprimir
                </button>
                <button onClick={() => setReciboData(null)}
                  style={{ padding: "7px 14px", borderRadius: 8, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer" }}>
                  Cerrar
                </button>
              </div>
            </div>
            <AcknowledgeRecibo
              clienteNombre={reciboData.clienteNombre}
              servicios={reciboData.servicios}
              firmaBase64={reciboData.firma}
              fecha={reciboData.fecha}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Actividades() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Actividades — Vender</h2>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          Registra ventas de actividades. Configura el catálogo en <strong style={{ color: B.sky }}>Productos</strong>.
        </div>
      </div>
      <TabVender />
    </div>
  );
}
