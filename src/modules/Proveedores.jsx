import { useState, useEffect } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const IS  = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const ISsm= { ...IS, padding: "7px 8px", fontSize: 12 };
const LS  = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const TIPOS = [
  "Alimentos y Bebidas",
  "Bebidas Alcohólicas",
  "Decoración y Flores",
  "Equipos y Sonido",
  "Fotografía / Video",
  "Limpieza y Aseo",
  "Logística y Transporte",
  "Mantenimiento",
  "Papelería y Suministros",
  "Servicios Profesionales",
  "Tecnología",
  "Uniformes y Dotación",
  "Otro",
];

const TIPOS_CUENTA = ["Corriente", "Ahorros", "Nequi", "Daviplata", "Bancolombia QR"];

function uid() { return "PROV-" + Date.now(); }

function Badge({ label, color = B.sky }) {
  return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: color + "22", color, fontWeight: 700 }}>{label}</span>;
}

// ── CONTACTO INLINE FORM ──────────────────────────────────────────
function ContactoForm({ onSave, onCancel }) {
  const [f, setF] = useState({ nombre: "", cargo: "", telefono: "", email: "", es_principal: false });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto auto", gap: 8, alignItems: "end", marginTop: 10, padding: 10, background: B.navyLight + "33", borderRadius: 8 }}>
      <div><label style={{ ...LS, fontSize: 10 }}>Nombre</label><input value={f.nombre} onChange={e => s("nombre", e.target.value)} style={ISsm} placeholder="Nombre" /></div>
      <div><label style={{ ...LS, fontSize: 10 }}>Cargo</label><input value={f.cargo} onChange={e => s("cargo", e.target.value)} style={ISsm} placeholder="Cargo" /></div>
      <div><label style={{ ...LS, fontSize: 10 }}>Teléfono</label><input value={f.telefono} onChange={e => s("telefono", e.target.value)} style={ISsm} placeholder="+57..." /></div>
      <div><label style={{ ...LS, fontSize: 10 }}>Email</label><input value={f.email} onChange={e => s("email", e.target.value)} style={ISsm} placeholder="email" /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 2 }}>
        <input type="checkbox" checked={f.es_principal} onChange={e => s("es_principal", e.target.checked)} />
        <span style={{ fontSize: 10, color: B.sand }}>Principal</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={() => { if (f.nombre.trim()) onSave(f); }} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓</button>
        <button onClick={onCancel} style={{ background: B.navyLight, color: B.white, border: "none", borderRadius: 6, padding: "7px 10px", fontSize: 11, cursor: "pointer" }}>✕</button>
      </div>
    </div>
  );
}

// ── FICHA PROVEEDOR ──────────────────────────────────────────────
function FichaProveedor({ proveedor, onBack, onUpdate }) {
  const [p, setP] = useState(proveedor);
  const [contactos, setContactos] = useState([]);
  const [showContactoForm, setShowContactoForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const s = (k, v) => { setP(prev => ({ ...prev, [k]: v })); setDirty(true); };

  useEffect(() => {
    supabase.from("proveedor_contactos").select("*").eq("proveedor_id", proveedor.id).order("es_principal", { ascending: false })
      .then(({ data }) => setContactos(data || []));
  }, [proveedor.id]);

  const handleSave = async () => {
    setSaving(true);
    const { id, created_at, ...fields } = p;
    await supabase.from("proveedores").update(fields).eq("id", id);
    setSaving(false);
    setDirty(false);
    onUpdate(p);
  };

  const handleAddContacto = async (f) => {
    const nuevo = { id: "CONT-" + Date.now(), proveedor_id: proveedor.id, ...f };
    await supabase.from("proveedor_contactos").insert(nuevo);
    setContactos(prev => [...prev, nuevo]);
    setShowContactoForm(false);
  };

  const handleDeleteContacto = async (id) => {
    await supabase.from("proveedor_contactos").delete().eq("id", id);
    setContactos(prev => prev.filter(c => c.id !== id));
  };

  const tipoColor = { "Alimentos y Bebidas": "#22c55e", "Bebidas Alcohólicas": "#8b5cf6", "Logística y Transporte": "#f59e0b", "Mantenimiento": "#ef4444" };
  const color = tipoColor[p.tipo] || B.sky;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: B.navyLight, color: B.white, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>← Volver</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{p.nombre}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {p.tipo && <Badge label={p.tipo} color={color} />}
            <Badge label={p.activo ? "Activo" : "Inactivo"} color={p.activo ? "#22c55e" : "#ef4444"} />
          </div>
        </div>
        <button onClick={handleSave} disabled={!dirty || saving} style={{ background: dirty ? B.sky : B.navyLight, color: dirty ? B.navy : "rgba(255,255,255,0.3)", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: dirty ? "pointer" : "default", transition: "all 0.2s" }}>
          {saving ? "Guardando..." : "💾 Guardar"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* DATOS GENERALES */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>📋 Datos Generales</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Nombre / Razón Social</label>
              <input value={p.nombre || ""} onChange={e => s("nombre", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Tipo</label>
              <select value={p.tipo || ""} onChange={e => s("tipo", e.target.value)} style={IS}>
                <option value="">— Seleccionar —</option>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>NIT / CC</label>
              <input value={p.nit || ""} onChange={e => s("nit", e.target.value)} style={IS} placeholder="900.123.456-7" />
            </div>
            <div>
              <label style={LS}>Teléfono</label>
              <input value={p.telefono || ""} onChange={e => s("telefono", e.target.value)} style={IS} placeholder="+57 300..." />
            </div>
            <div>
              <label style={LS}>Email</label>
              <input value={p.email || ""} onChange={e => s("email", e.target.value)} style={IS} placeholder="contacto@..." />
            </div>
            <div>
              <label style={LS}>Ciudad</label>
              <input value={p.ciudad || ""} onChange={e => s("ciudad", e.target.value)} style={IS} placeholder="Cartagena" />
            </div>
            <div>
              <label style={LS}>Estado</label>
              <select value={p.activo ? "true" : "false"} onChange={e => s("activo", e.target.value === "true")} style={IS}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Dirección</label>
              <input value={p.direccion || ""} onChange={e => s("direccion", e.target.value)} style={IS} placeholder="Cra 5 #34-12" />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Notas</label>
              <textarea value={p.notas || ""} onChange={e => s("notas", e.target.value)} style={{ ...IS, minHeight: 70, resize: "vertical" }} placeholder="Condiciones, observaciones..." />
            </div>
          </div>
        </div>

        {/* DATOS BANCARIOS */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>🏦 Datos Bancarios</div>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={LS}>Banco</label>
              <input value={p.cuenta_banco || ""} onChange={e => s("cuenta_banco", e.target.value)} style={IS} placeholder="Bancolombia, Davivienda..." />
            </div>
            <div>
              <label style={LS}>Tipo de Cuenta</label>
              <select value={p.cuenta_tipo || ""} onChange={e => s("cuenta_tipo", e.target.value)} style={IS}>
                <option value="">— Seleccionar —</option>
                {TIPOS_CUENTA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Número de Cuenta</label>
              <input value={p.cuenta_numero || ""} onChange={e => s("cuenta_numero", e.target.value)} style={IS} placeholder="000-000000-00" />
            </div>
          </div>

          {/* Contacto principal rápido */}
          <div style={{ marginTop: 20, padding: "12px 16px", background: B.navy, borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Contacto Principal</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ ...LS, fontSize: 10 }}>Nombre</label>
                <input value={p.contacto_nombre || ""} onChange={e => s("contacto_nombre", e.target.value)} style={ISsm} placeholder="Nombre" />
              </div>
              <div>
                <label style={{ ...LS, fontSize: 10 }}>Cargo</label>
                <input value={p.contacto_cargo || ""} onChange={e => s("contacto_cargo", e.target.value)} style={ISsm} placeholder="Cargo" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTACTOS */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: "0.1em" }}>👥 Contactos ({contactos.length})</div>
          {!showContactoForm && (
            <button onClick={() => setShowContactoForm(true)} style={{ background: B.sky + "22", color: B.sky, border: `1px solid ${B.sky}44`, borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>+ Agregar</button>
          )}
        </div>
        {contactos.length === 0 && !showContactoForm && (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Sin contactos registrados</div>
        )}
        {contactos.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${B.navyLight}22` }}>
            <div style={{ width: 30, height: 30, borderRadius: 15, background: c.es_principal ? B.sand + "33" : B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: c.es_principal ? B.sand : "rgba(255,255,255,0.5)", flexShrink: 0 }}>
              {c.nombre.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{c.nombre}</span>
              {c.cargo && <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>({c.cargo})</span>}
              {c.es_principal && <Badge label="Principal" color={B.sand} />}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", gap: 14 }}>
              {c.telefono && <span>📞 {c.telefono}</span>}
              {c.email && <span>✉ {c.email}</span>}
            </div>
            <button onClick={() => handleDeleteContacto(c.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, opacity: 0.5 }}>✕</button>
          </div>
        ))}
        {showContactoForm && <ContactoForm onSave={handleAddContacto} onCancel={() => setShowContactoForm(false)} />}
      </div>
    </div>
  );
}

// ── MODAL AGREGAR PROVEEDOR ──────────────────────────────────────
function ModalAgregar({ onClose, onCreated }) {
  const [f, setF] = useState({ nombre: "", tipo: "", nit: "", telefono: "", email: "", ciudad: "Cartagena", activo: true });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!f.nombre.trim()) return;
    setSaving(true);
    const nuevo = { id: uid(), ...f };
    const { data, error } = await supabase.from("proveedores").insert(nuevo).select().single();
    setSaving(false);
    if (!error) { onCreated(data); onClose(); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: "100%", maxWidth: 480 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nuevo Proveedor</div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={LS}>Nombre / Razón Social *</label>
            <input value={f.nombre} onChange={e => s("nombre", e.target.value)} style={IS} placeholder="Nombre del proveedor" autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Tipo</label>
              <select value={f.tipo} onChange={e => s("tipo", e.target.value)} style={IS}>
                <option value="">— Seleccionar —</option>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>NIT / CC</label>
              <input value={f.nit} onChange={e => s("nit", e.target.value)} style={IS} placeholder="900.123.456-7" />
            </div>
            <div>
              <label style={LS}>Teléfono</label>
              <input value={f.telefono} onChange={e => s("telefono", e.target.value)} style={IS} placeholder="+57 300..." />
            </div>
            <div>
              <label style={LS}>Email</label>
              <input value={f.email} onChange={e => s("email", e.target.value)} style={IS} placeholder="contacto@..." />
            </div>
          </div>
          <div>
            <label style={LS}>Ciudad</label>
            <input value={f.ciudad} onChange={e => s("ciudad", e.target.value)} style={IS} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onClose} style={{ background: B.navyLight, color: B.white, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving || !f.nombre.trim()} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {saving ? "Guardando..." : "Crear Proveedor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MÓDULO PRINCIPAL ─────────────────────────────────────────────
export default function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [filterTipo, setFilterTipo]   = useState("");
  const [filterActivo, setFilterActivo] = useState("true");
  const [selected, setSelected]       = useState(null);
  const [showModal, setShowModal]     = useState(false);

  useEffect(() => {
    supabase.from("proveedores").select("*").order("nombre")
      .then(({ data }) => { setProveedores(data || []); setLoading(false); });
  }, []);

  const tiposUsados = [...new Set(proveedores.map(p => p.tipo).filter(Boolean))].sort();

  const filtered = proveedores.filter(p => {
    const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || (p.nit || "").includes(search) || (p.email || "").toLowerCase().includes(search.toLowerCase());
    const matchTipo   = !filterTipo || p.tipo === filterTipo;
    const matchActivo = filterActivo === "" || String(p.activo) === filterActivo;
    return matchSearch && matchTipo && matchActivo;
  });

  const tipoColor = (tipo) => {
    const map = { "Alimentos y Bebidas": "#22c55e", "Bebidas Alcohólicas": "#8b5cf6", "Logística y Transporte": "#f59e0b", "Mantenimiento": "#ef4444", "Decoración y Flores": "#ec4899", "Equipos y Sonido": "#06b6d4" };
    return map[tipo] || B.sky;
  };

  if (selected) {
    return (
      <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
        <FichaProveedor
          proveedor={selected}
          onBack={() => setSelected(null)}
          onUpdate={(updated) => {
            setProveedores(prev => prev.map(p => p.id === updated.id ? updated : p));
            setSelected(updated);
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>📦 Proveedores</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{filtered.length} proveedores</div>
        </div>
        <button onClick={() => setShowModal(true)} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Nuevo Proveedor</button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar por nombre, NIT, email..."
          style={{ ...IS, maxWidth: 320, flex: "1 1 200px" }}
        />
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={{ ...IS, width: "auto", flex: "0 0 auto" }}>
          <option value="">Todos los tipos</option>
          {tiposUsados.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterActivo} onChange={e => setFilterActivo(e.target.value)} style={{ ...IS, width: "auto", flex: "0 0 auto" }}>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
          <option value="">Todos</option>
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>Cargando proveedores...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div>{search || filterTipo ? "Sin resultados para la búsqueda" : "Aún no hay proveedores registrados"}</div>
          {!search && !filterTipo && <button onClick={() => setShowModal(true)} style={{ marginTop: 16, background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Agregar el primero</button>}
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          {/* Encabezados */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr auto", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${B.navyLight}44`, fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <span>Proveedor</span>
            <span>Tipo</span>
            <span>Teléfono</span>
            <span>Email</span>
            <span>Ciudad</span>
            <span></span>
          </div>
          {filtered.map((p, i) => (
            <div
              key={p.id}
              onClick={() => setSelected(p)}
              style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr auto", gap: 12, padding: "12px 16px", borderBottom: i < filtered.length - 1 ? `1px solid ${B.navyLight}22` : "none", cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = B.navyLight + "22"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nombre}</div>
                {p.nit && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>NIT: {p.nit}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {p.tipo ? <Badge label={p.tipo} color={tipoColor(p.tipo)} /> : <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>—</span>}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center" }}>{p.telefono || "—"}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email || "—"}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center" }}>{p.ciudad || "—"}</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: p.activo ? "#22c55e22" : "#ef444422", color: p.activo ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{p.activo ? "Activo" : "Inactivo"}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ModalAgregar
          onClose={() => setShowModal(false)}
          onCreated={(nuevo) => setProveedores(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
        />
      )}
    </div>
  );
}
