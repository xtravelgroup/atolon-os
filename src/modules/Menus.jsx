import { useState, useEffect, useCallback } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";
import { TabCatalogo as ActividadesCatalogo } from "./Actividades";
import { TabEmbarcaciones } from "./Embarcaciones";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const TIPOS = [
  { key: "restaurant",     label: "Menú Restaurant",   color: "#2E7D52" },
  { key: "banquetes",      label: "Menú de Banquetes", color: "#1E3566" },
  { key: "espacios_renta", label: "Espacios Renta",    color: "#7C3AED" },
  { key: "hospedaje",      label: "Hospedaje",         color: "#0f766e" },
  { key: "otros_servicios", label: "Otros Servicios",  color: "#7B4F12" },
  { key: "actividades",       label: "Actividades",              color: "#0ea5e9" },
  { key: "bebidas",           label: "Menú Bebidas",             color: "#7c3aed" },
  { key: "transportacion",    label: "Transportación Terrestre", color: "#0891b2" },
  { key: "trans_acuatica",    label: "Transportación Acuática",  color: "#0e7490" },
];

// ─── Transportación ───────────────────────────────────────────────────────────

const TIPOS_VEHICULO = ["Van", "Bus", "Taxi", "Camioneta", "Chiva", "Otro"];
const RUTAS_TERRESTRE = [
  { key: "aeropuerto",  label: "Aeropuerto" },
  { key: "bocagrande",  label: "Bocagrande" },
  { key: "centro",      label: "Centro" },
  { key: "la_boquilla", label: "La Boquilla" },
  { key: "zona_norte",  label: "Zona Norte" },
  { key: "otro",        label: "Otro" },
];
const EMPTY_PRECIOS_TERRESTRE = { aeropuerto: "", bocagrande: "", centro: "", la_boquilla: "", zona_norte: "", otro: "" };

function TransportModal({ item, onClose, onSaved }) {
  const isEdit = !!item?.id;
  const empty = {
    nombre: "", tipo_vehiculo: "Van", capacidad: "",
    precios_rutas: { ...EMPTY_PRECIOS_TERRESTRE },
    descripcion: "", activo: true,
  };
  const [form, setForm] = useState(isEdit ? {
    nombre:        item.nombre || "",
    tipo_vehiculo: item.categoria?.trim() || "Van",
    capacidad:     item.descripcion?.match(/Cap: (\d+)/)?.[1] || "",
    precios_rutas: { ...EMPTY_PRECIOS_TERRESTRE, ...(item.precios_rutas || {}) },
    descripcion:   item.descripcion?.replace(/Cap: \d+\s*\|?\s*/, "").trim() || "",
    activo:        item.activo ?? true,
  } : empty);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setRuta = (k, v) => setForm(f => ({ ...f, precios_rutas: { ...f.precios_rutas, [k]: v } }));

  const save = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    let desc = form.capacidad ? `Cap: ${form.capacidad}` : "";
    if (form.descripcion.trim()) desc += (desc ? " | " : "") + form.descripcion.trim();

    const payload = {
      nombre:       form.nombre.trim(),
      categoria:    form.tipo_vehiculo,
      precio:       0,
      descripcion:  desc,
      precios_rutas: form.precios_rutas,
      activo:       form.activo,
      orden:        0,
      menu_tipo:    "transportacion",
      tiene_iva:    false,
    };
    const { error } = isEdit
      ? await supabase.from("menu_items").update(payload).eq("id", item.id)
      : await supabase.from("menu_items").insert({ id: `TRANS-${Date.now()}`, ...payload });
    if (error) { alert("Error: " + error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: B.white }}>{isEdit ? "Editar Transportación" : "Nueva Transportación"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Nombre */}
          <div>
            <label style={LS}>Nombre / Descripción del vehículo</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS} placeholder="Ej: Van Mercedes Sprinter" />
          </div>

          {/* Tipo + Capacidad */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Tipo de vehículo</label>
              <select value={form.tipo_vehiculo} onChange={e => set("tipo_vehiculo", e.target.value)} style={IS}>
                {TIPOS_VEHICULO.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Capacidad (pax)</label>
              <input type="number" value={form.capacidad} onChange={e => set("capacidad", e.target.value)} style={IS} placeholder="Ej: 8" />
            </div>
          </div>

          {/* Precios por ruta */}
          <div>
            <label style={{ ...LS, marginBottom: 10 }}>💰 Tarifas por ruta</label>
            <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {RUTAS_TERRESTRE.map(r => (
                <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1fr 160px", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 13, color: B.white }}>🚗 {r.label}</div>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: B.sand }}>$</span>
                    <input
                      type="number"
                      value={form.precios_rutas[r.key]}
                      onChange={e => setRuta(r.key, e.target.value)}
                      style={{ ...IS, paddingLeft: 22, textAlign: "right" }}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label style={LS}>Notas adicionales</label>
            <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={2}
              style={{ ...IS, resize: "vertical" }} placeholder="Horarios, condiciones, incluye..." />
          </div>

          {/* Activo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="trans-activo" checked={form.activo} onChange={e => set("activo", e.target.checked)} />
            <label htmlFor="trans-activo" style={{ fontSize: 13, color: B.sand, cursor: "pointer" }}>Activo / disponible</label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving || !form.nombre.trim()} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "#0891b2", color: B.white, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Agregar Transportación"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabTransportacion() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // null | "new" | item object

  const fetch = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from("menu_items").select("*").eq("menu_tipo", "transportacion").order("nombre");
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggle = async (item) => {
    await supabase.from("menu_items").update({ activo: !item.activo }).eq("id", item.id);
    fetch();
  };

  const del = async (item) => {
    if (!confirm(`¿Eliminar "${item.nombre}"?`)) return;
    await supabase.from("menu_items").delete().eq("id", item.id);
    fetch();
  };

  const activos = items.filter(i => i.activo).length;

  const parseItem = (item) => {
    const tipo_v   = (item.categoria || "").trim();
    const capMatch = item.descripcion?.match(/Cap: (\d+)/);
    const nota     = (item.descripcion || "").replace(/Cap: \d+\s*\|?\s*/, "").trim();
    const precios  = item.precios_rutas || {};
    return { tipo_v, cap: capMatch?.[1], nota, precios };
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Total", val: items.length, color: "#0891b2" },
            { label: "Activos", val: activos, color: B.success },
            { label: "Inactivos", val: items.length - activos, color: B.sand },
          ].map(s => (
            <div key={s.label} style={{ background: B.navyMid, borderRadius: 10, padding: "12px 18px", borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: B.white }}>{s.val}</div>
            </div>
          ))}
        </div>
        <button onClick={() => setModal("new")} style={{ padding: "9px 18px", borderRadius: 8, background: "#0891b2", border: "none", color: B.white, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Nueva Transportación
        </button>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>
      ) : items.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚗</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>No hay transportación registrada. Agrega la primera.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {items.map(item => {
            const { tipo_v, cap, nota, precios } = parseItem(item);
            const rutasConPrecio = RUTAS_TERRESTRE.filter(r => Number(precios[r.key]) > 0);
            return (
              <div key={item.id} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 18px", border: `1px solid ${item.activo ? "#0891b222" : B.navyLight}`, opacity: item.activo ? 1 : 0.6 }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>{item.nombre}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {tipo_v && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#0891b233", color: "#38bdf8", fontWeight: 600 }}>🚗 {tipo_v}</span>}
                      {cap    && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: B.navyLight, color: B.sand, fontWeight: 600 }}>👥 {cap} pax</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setModal(item)} style={{ padding: "4px 10px", borderRadius: 6, background: B.navyLight, border: "none", color: B.sand, fontSize: 11, cursor: "pointer" }}>✏️</button>
                    <button onClick={() => toggle(item)} style={{ padding: "4px 10px", borderRadius: 6, background: item.activo ? "#153322" : B.navyLight, border: "none", color: item.activo ? B.success : B.sand, fontSize: 11, cursor: "pointer" }}>{item.activo ? "✓ Activo" : "Inactivo"}</button>
                    <button onClick={() => del(item)} style={{ padding: "4px 8px", borderRadius: 6, background: "none", border: "none", color: B.danger, fontSize: 14, cursor: "pointer" }}>🗑</button>
                  </div>
                </div>

                {/* Tarifas por ruta */}
                {rutasConPrecio.length > 0 && (
                  <div style={{ background: B.navy, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                    {rutasConPrecio.map(r => (
                      <div key={r.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{r.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8" }}>{COP(Number(precios[r.key]))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {nota && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", borderTop: `1px solid ${B.navyLight}`, paddingTop: 8, marginTop: 4 }}>{nota}</div>}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <TransportModal
          item={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={fetch}
        />
      )}
    </div>
  );
}

// ─── Transportación Acuática ──────────────────────────────────────────────────

const TIPOS_ACUATICO = ["Lancha", "Yate", "Catamarán", "Velero", "Bote", "Otro"];

const RUTAS_ACUATICAS = [
  { key: "cta_atl",     label: "Cartagena → Atolon" },
  { key: "atl_cta",     label: "Atolon → Cartagena" },
  { key: "cta_atl_cta", label: "Cartagena → Atolon → Cartagena" },
  { key: "atl_cta_atl", label: "Atolon → Cartagena → Atolon" },
  { key: "atl_rosario", label: "Atolon → Isla del Rosario (Full Day)" },
  { key: "otros",       label: "Otros" },
];

const EMPTY_PRECIOS_AGUA = { cta_atl: "", atl_cta: "", cta_atl_cta: "", atl_cta_atl: "", atl_rosario: "", otros: "" };

function TransAcuaticaModal({ item, onClose, onSaved }) {
  const isEdit = !!item?.id;
  const [form, setForm] = useState({
    nombre:       isEdit ? item.nombre || "" : "",
    tipo_vehiculo: isEdit ? (item.categoria?.trim() || "Lancha") : "Lancha",
    capacidad:    isEdit ? (item.descripcion?.match(/Cap: (\d+)/)?.[1] || "") : "",
    notas:        isEdit ? ((item.descripcion || "").replace(/Cap: \d+\s*\|?\s*/, "").trim()) : "",
    activo:       isEdit ? (item.activo ?? true) : true,
    precios:      isEdit ? { ...EMPTY_PRECIOS_AGUA, ...(item.precios_rutas || {}) } : { ...EMPTY_PRECIOS_AGUA },
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setPrecio = (key, val) => setForm(f => ({ ...f, precios: { ...f.precios, [key]: val } }));

  const save = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    let desc = "";
    if (form.capacidad) desc += `Cap: ${form.capacidad}`;
    if (form.notas.trim()) desc += (desc ? " | " : "") + form.notas.trim();
    const payload = {
      nombre:        form.nombre.trim(),
      categoria:     form.tipo_vehiculo,
      precio:        0,
      descripcion:   desc,
      precios_rutas: form.precios,
      activo:        form.activo,
      orden:         0,
      menu_tipo:     "trans_acuatica",
      tiene_iva:     false,
    };
    let error;
    if (isEdit) {
      ({ error } = await supabase.from("menu_items").update(payload).eq("id", item.id));
    } else {
      ({ error } = await supabase.from("menu_items").insert({ id: `AGUA-${Date.now()}`, ...payload }));
    }
    if (error) {
      alert("Error al guardar: " + error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
    onClose();
  };

  const ISsm = { ...IS, padding: "7px 10px", fontSize: 12 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: B.white }}>{isEdit ? "Editar servicio" : "Nuevo Servicio Acuático"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Nombre */}
          <div>
            <label style={LS}>Nombre del servicio</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS} placeholder="Ej: Transfer Estándar, Full Day Rosario..." />
          </div>

          {/* Tipo + Capacidad */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Tipo de embarcación</label>
              <select value={form.tipo_vehiculo} onChange={e => set("tipo_vehiculo", e.target.value)} style={IS}>
                {TIPOS_ACUATICO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Capacidad (pax)</label>
              <input type="number" value={form.capacidad} onChange={e => set("capacidad", e.target.value)} style={IS} placeholder="20" />
            </div>
          </div>

          {/* Tarifas por ruta */}
          <div style={{ background: B.navy + "88", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: "#22d3ee", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14, fontWeight: 700 }}>💰 Tarifas por Ruta (COP)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {RUTAS_ACUATICAS.map(r => (
                <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{r.label}</div>
                  <input
                    type="number"
                    value={form.precios[r.key] || ""}
                    onChange={e => setPrecio(r.key, e.target.value)}
                    placeholder="0"
                    style={{ ...ISsm, textAlign: "right" }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label style={LS}>Notas / condiciones</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2}
              style={{ ...IS, resize: "vertical" }} placeholder="Incluye, horarios, condiciones..." />
          </div>

          {/* Activo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="agua-activo" checked={form.activo} onChange={e => set("activo", e.target.checked)} />
            <label htmlFor="agua-activo" style={{ fontSize: 13, color: B.sand, cursor: "pointer" }}>Activo / disponible</label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving || !form.nombre.trim()} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "#0e7490", color: B.white, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Agregar servicio"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabTransAcuatica() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);

  const fetch = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from("menu_items").select("*").eq("menu_tipo", "trans_acuatica").order("nombre");
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggle = async (item) => {
    await supabase.from("menu_items").update({ activo: !item.activo }).eq("id", item.id);
    fetch();
  };
  const del = async (item) => {
    if (!confirm(`¿Eliminar "${item.nombre}"?`)) return;
    await supabase.from("menu_items").delete().eq("id", item.id);
    fetch();
  };

  const parseItem = (item) => {
    const tipo_v    = item.categoria?.trim() || "";
    const capMatch  = item.descripcion?.match(/Cap: (\d+)/);
    const notaClean = (item.descripcion || "").replace(/Cap: \d+\s*\|?\s*/, "").trim();
    const precios   = item.precios_rutas || {};
    const hayPrecios = RUTAS_ACUATICAS.some(r => precios[r.key] && Number(precios[r.key]) > 0);
    return { tipo_v, cap: capMatch?.[1], nota: notaClean, precios, hayPrecios };
  };

  const activos = items.filter(i => i.activo).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { label: "Total", val: items.length, color: "#0e7490" },
            { label: "Activos", val: activos, color: B.success },
            { label: "Inactivos", val: items.length - activos, color: B.sand },
          ].map(s => (
            <div key={s.label} style={{ background: B.navyMid, borderRadius: 10, padding: "12px 18px", borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: B.white }}>{s.val}</div>
            </div>
          ))}
        </div>
        <button onClick={() => setModal("new")} style={{ padding: "9px 18px", borderRadius: 8, background: "#0e7490", border: "none", color: B.white, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Nuevo Servicio Acuático
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>
      ) : items.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛵</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>No hay servicios registrados. Agrega el primero.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {items.map(item => {
            const { tipo_v, cap, nota, precios, hayPrecios } = parseItem(item);
            return (
              <div key={item.id} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 18px", border: `1px solid ${item.activo ? "#0e749033" : B.navyLight}`, opacity: item.activo ? 1 : 0.6 }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>{item.nombre}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {tipo_v && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#0e749033", color: "#22d3ee", fontWeight: 600 }}>{tipo_v}</span>}
                      {cap    && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: B.navyLight, color: B.sand, fontWeight: 600 }}>👥 {cap} pax</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setModal(item)} style={{ padding: "4px 10px", borderRadius: 6, background: B.navyLight, border: "none", color: B.sand, fontSize: 11, cursor: "pointer" }}>✏️</button>
                    <button onClick={() => toggle(item)} style={{ padding: "4px 10px", borderRadius: 6, background: item.activo ? "#153322" : B.navyLight, border: "none", color: item.activo ? B.success : B.sand, fontSize: 11, cursor: "pointer" }}>{item.activo ? "✓" : "Off"}</button>
                    <button onClick={() => del(item)} style={{ padding: "4px 8px", borderRadius: 6, background: "none", border: "none", color: B.danger, fontSize: 14, cursor: "pointer" }}>🗑</button>
                  </div>
                </div>

                {/* Tarifas */}
                {hayPrecios && (
                  <div style={{ background: B.navy, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: "#22d3ee", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 700 }}>💰 Tarifas</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {RUTAS_ACUATICAS.filter(r => precios[r.key] && Number(precios[r.key]) > 0).map(r => (
                        <div key={r.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{r.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#22d3ee" }}>{COP(Number(precios[r.key]))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {nota && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", borderTop: `1px solid ${B.navyLight}`, paddingTop: 8 }}>{nota}</div>}
              </div>
            );
          })}
        </div>
      )}

      {modal && <TransAcuaticaModal item={modal === "new" ? null : modal} onClose={() => setModal(null)} onSaved={fetch} />}
    </div>
  );
}

function ItemModal({ item, menuTipo, onClose, onSaved, categorias }) {
  const isEdit      = !!item?.id;
  const isEspacio   = menuTipo === "espacios_renta";
  const isServicio  = menuTipo === "otros_servicios";
  const [form, setForm] = useState(isEdit
    ? { ...item, tiene_iva: item.tiene_iva ?? true }
    : { nombre: "", descripcion: "", precio: "", categoria: categorias[0] || "", activo: true, orden: 0, menu_tipo: menuTipo, tiene_iva: true });
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
      tiene_iva:   form.tiene_iva,
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
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
          {isEdit
            ? isEspacio ? "Editar espacio" : isServicio ? "Editar servicio" : "Editar ítem"
            : isEspacio ? "Nuevo espacio de renta" : isServicio ? "Nuevo servicio" : "Nuevo ítem de menú"}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={LS}>{isEspacio ? "Nombre del espacio" : isServicio ? "Nombre del servicio" : "Nombre del plato / ítem"}</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS}
              placeholder={isEspacio ? "Ej: Salón Principal, Terraza Caribe..." : isServicio ? "Ej: DJ, Decoración, Transporte..." : "Ej: Arroz con coco y camarones"} autoFocus />
          </div>

          <div>
            <label style={LS}>{isEspacio ? "Descripción y amenidades" : isServicio ? "Descripción del servicio" : "Descripción"}</label>
            <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={isEspacio || isServicio ? 3 : 2}
              style={{ ...IS, resize: "vertical" }}
              placeholder={isEspacio ? "Capacidad, equipos incluidos, servicios, características del espacio..." : isServicio ? "Detalles del servicio, incluye, condiciones..." : "Ingredientes, presentación, alérgenos..."} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>{isEspacio ? "Tarifa (COP)" : "Precio (COP)"}</label>
              <input type="number" value={form.precio} onChange={e => set("precio", e.target.value)} style={IS} placeholder="0" />
            </div>
            <div>
              <label style={LS}>Orden</label>
              <input type="number" value={form.orden} onChange={e => set("orden", e.target.value)} style={IS} placeholder="0" />
            </div>
          </div>

          <div>
            <label style={LS}>{isEspacio ? "Tipo de espacio" : isServicio ? "Categoría de servicio" : "Categoría"}</label>
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

          {(isServicio || isEspacio) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={form.tiene_iva} onChange={e => set("tiene_iva", e.target.checked)} id="iva-chk" />
              <label htmlFor="iva-chk" style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                Aplica IVA (19%)
              </label>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={form.activo} onChange={e => set("activo", e.target.checked)} id="activo-chk" />
            <label htmlFor="activo-chk" style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
              {isEspacio || isServicio ? "Disponible / activo" : "Activo en el menú"}
            </label>
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
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Productos</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        {!["actividades","transportacion","trans_acuatica"].includes(tab) && (
          <div style={{ display: "flex", gap: 10 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar plato o categoría..."
              style={{ ...IS, width: 240 }} />
            <button onClick={() => setModal("new")}
              style={{ background: tipo.color, color: B.white, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              {tab === "espacios_renta" ? "+ Agregar espacio" : tab === "otros_servicios" ? "+ Agregar servicio" : "+ Agregar ítem"}
            </button>
          </div>
        )}
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

      {/* Actividades tab — render catalog directly */}
      {tab === "actividades"    && <ActividadesCatalogo />}
      {tab === "transportacion" && <TabTransportacion />}
      {tab === "trans_acuatica" && <TabTransAcuatica />}

      {/* Stats + items — only for menu tabs */}
      {!["actividades","transportacion","trans_acuatica"].includes(tab) && <><div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: tab === "espacios_renta" ? "Total espacios" : tab === "otros_servicios" ? "Total servicios" : "Total ítems", val: tabItems.length, color: tipo.color },
          { label: tab === "espacios_renta" || tab === "otros_servicios" ? "Disponibles" : "Activos", val: tabItems.filter(i => i.activo).length, color: B.success },
          { label: tab === "espacios_renta" || tab === "otros_servicios" ? "Tipos" : "Categorías", val: categorias.length, color: B.sand },
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
          <div style={{ fontSize: 32, marginBottom: 12 }}>{tab === "espacios_renta" ? "🏛️" : tab === "otros_servicios" ? "🛎️" : "🍽️"}</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
            {search ? "Sin resultados para esa búsqueda"
              : tab === "espacios_renta" ? "No hay espacios registrados. Agrega el primero."
              : tab === "otros_servicios" ? "No hay servicios registrados. Agrega el primero."
              : `No hay ítems en el ${tipo.label}. Agrega el primero.`}
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
      )}</>}
    </div>
  );
}
