import { useState, useEffect, useCallback, useRef } from "react";
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
  const isBanquete  = menuTipo === "banquetes";
  const [form, setForm] = useState(isEdit
    ? { ...item, tiene_iva: item.tiene_iva ?? true, opciones: item.opciones || [], seleccion_modo: item.seleccion_modo || "todo", seleccion_cantidad: item.seleccion_cantidad || 0, room_service: item.room_service ?? false, foto_url: item.foto_url || "", destacado: item.destacado ?? false, disponible: item.disponible ?? true, nombre_en: item.nombre_en || "", descripcion_en: item.descripcion_en || "", categoria_en: item.categoria_en || "", loggro_id: item.loggro_id || null, loggro_categoria: item.loggro_categoria || null }
    : { nombre: "", descripcion: "", precio: "", categoria: categorias[0] || "", activo: true, orden: 0, menu_tipo: menuTipo, tiene_iva: true, opciones: [], seleccion_modo: "todo", seleccion_cantidad: 0, room_service: false, foto_url: "", destacado: false, disponible: true, nombre_en: "", descripcion_en: "", categoria_en: "", loggro_id: null, loggro_categoria: null });

  // Loggro linker
  const [loggroSearch, setLoggroSearch] = useState("");
  const [loggroResults, setLoggroResults] = useState([]);
  const [loggroOpen, setLoggroOpen] = useState(false);
  const [loggroCurrent, setLoggroCurrent] = useState(null); // nombre actual si está linked
  // Headers necesarios para llamar Edge Functions de Supabase (anon key)
  const fnHeaders = {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };

  useEffect(() => {
    // Cuando se abre el modal, si ya tiene loggro_id, traer el producto DIRECTO por su _id
    // (antes buscaba por nombre y no matcheaba si Atolón/Loggro tenían nombres distintos)
    if (form.loggro_id) {
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/raw?path=${encodeURIComponent("/products/" + form.loggro_id)}`, {
        headers: fnHeaders,
      })
        .then(r => r.json()).then(d => {
          // /raw devuelve { status, body: { ..._id, name, ... } } o directo el producto
          const prod = d?.body || d;
          if (prod?.name) setLoggroCurrent(prod.name);
        }).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (!loggroOpen) return;
    const q = (loggroSearch || form.nombre || "").trim();
    if (q.length < 2) { setLoggroResults([]); return; }
    const t = setTimeout(() => {
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/products?pagination=true&limit=30&page=0&name=${encodeURIComponent(q)}`, {
        headers: fnHeaders,
      })
        .then(r => r.json()).then(d => setLoggroResults(d.products || [])).catch(() => setLoggroResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [loggroSearch, loggroOpen, form.nombre]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  const subirFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${menuTipo}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("menu-items").upload(path, file, { upsert: true, contentType: file.type });
      if (error) { alert("Error subiendo foto: " + error.message); setUploadingPhoto(false); return; }
      const { data } = supabase.storage.from("menu-items").getPublicUrl(path);
      setForm(f => ({ ...f, foto_url: data.publicUrl }));
    } catch (err) {
      alert("Error: " + err.message);
    }
    setUploadingPhoto(false);
  };
  const [newOpcion, setNewOpcion] = useState("");
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
      room_service: !!form.room_service,
      foto_url:    form.foto_url || null,
      destacado:   !!form.destacado,
      disponible:  form.disponible !== false,
      nombre_en:      form.nombre_en || null,
      descripcion_en: form.descripcion_en || null,
      categoria_en:   form.categoria_en || null,
      loggro_id:      form.loggro_id || null,
      loggro_categoria: form.loggro_categoria || null,
    };
    if (isBanquete) {
      payload.opciones = form.opciones || [];
      payload.seleccion_modo = form.seleccion_modo || "todo";
      payload.seleccion_cantidad = form.seleccion_modo === "seleccion" ? (Number(form.seleccion_cantidad) || 0) : null;
    }
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
          {!isEspacio && !isServicio && (
            <div>
              <label style={LS}>Foto del plato</label>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: 110, height: 110, borderRadius: 12, background: form.foto_url ? `url(${form.foto_url}) center/cover` : "#0F172A",
                    border: `2px dashed ${form.foto_url ? "transparent" : "#334155"}`, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative", overflow: "hidden" }}>
                  {!form.foto_url && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.3 }}>📷<br/>Subir<br/>foto</div>}
                  {uploadingPhoto && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>Subiendo…</div>}
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={subirFoto} style={{ display: "none" }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    style={{ padding: "8px 12px", borderRadius: 8, background: B.sand, color: B.navy, border: "none", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                    {form.foto_url ? "Cambiar foto" : "Subir foto"}
                  </button>
                  {form.foto_url && (
                    <button type="button" onClick={() => set("foto_url", "")}
                      style={{ padding: "8px 12px", borderRadius: 8, background: "transparent", color: "#ef4444", border: `1px solid #ef444433`, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                      Quitar foto
                    </button>
                  )}
                  <input value={form.foto_url || ""} onChange={e => set("foto_url", e.target.value)}
                    style={{ ...IS, fontSize: 11, padding: "6px 10px" }} placeholder="o pega URL..." />
                </div>
              </div>
            </div>
          )}

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

          {!isEspacio && !isServicio && (
            <div style={{ padding: "12px 14px", background: `${B.sky}08`, border: `1px solid ${B.sky}33`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: B.sky, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>🇬🇧 English translation</div>
              <div style={{ marginBottom: 10 }}>
                <label style={LS}>Name (EN)</label>
                <input value={form.nombre_en || ""} onChange={e => set("nombre_en", e.target.value)} style={IS} placeholder="e.g. Fried Green Plantains" />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={LS}>Description (EN)</label>
                <textarea value={form.descripcion_en || ""} onChange={e => set("descripcion_en", e.target.value)} rows={2}
                  style={{ ...IS, resize: "vertical" }}
                  placeholder="Ingredients, presentation, allergens..." />
              </div>
              <div>
                <label style={LS}>Category (EN)</label>
                <input value={form.categoria_en || ""} onChange={e => set("categoria_en", e.target.value)} style={IS} placeholder="e.g. Starters" />
              </div>
            </div>
          )}

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

          {!isEspacio && !isServicio && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#a78bfa11", border: "1px solid #a78bfa33", borderRadius: 8 }}>
                <input type="checkbox" checked={!!form.room_service} onChange={e => set("room_service", e.target.checked)} id="rs-chk" />
                <label htmlFor="rs-chk" style={{ fontSize: 13, color: "#a78bfa", cursor: "pointer", fontWeight: 600 }}>
                  🛎️ Disponible en Room Service
                </label>
              </div>

              {/* ── Enlace con Loggro ── */}
              <div style={{ padding: "10px 12px", background: "#38bdf811", border: "1px solid #38bdf833", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: loggroOpen ? 8 : 0 }}>
                  <div style={{ fontSize: 12, color: "#38bdf8", fontWeight: 700 }}>🔗 Enlace con Loggro (POS)</div>
                  <button type="button" onClick={() => setLoggroOpen(o => !o)} style={{ background: "none", border: "none", color: "#38bdf8", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                    {loggroOpen ? "▲ Cerrar" : "▼ Abrir"}
                  </button>
                </div>
                {!loggroOpen && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                    {form.loggro_id ? (
                      <span style={{ color: "#22c55e" }}>✓ Enlazado: {loggroCurrent || form.loggro_id.slice(-10)}</span>
                    ) : (
                      <span style={{ color: "#f59e0b" }}>⚠ Sin enlazar</span>
                    )}
                  </div>
                )}
                {loggroOpen && (
                  <>
                    {form.loggro_id && (
                      <div style={{ fontSize: 11, color: "#22c55e", marginBottom: 8 }}>
                        Actualmente enlazado a: <strong>{loggroCurrent || form.loggro_id}</strong>
                        <button type="button" onClick={() => { set("loggro_id", null); set("loggro_categoria", null); setLoggroCurrent(null); }}
                          style={{ marginLeft: 8, padding: "2px 8px", fontSize: 10, borderRadius: 4, border: "1px solid #ef444455", background: "#ef444422", color: "#ef4444", cursor: "pointer" }}>
                          Quitar
                        </button>
                      </div>
                    )}
                    <input
                      value={loggroSearch}
                      onChange={e => setLoggroSearch(e.target.value)}
                      placeholder={`🔍 Buscar en Loggro (ej: ${form.nombre || "nombre..."})`}
                      style={{ ...IS, padding: "7px 10px", fontSize: 12 }}
                    />
                    {loggroResults.length > 0 && (
                      <div style={{ marginTop: 6, maxHeight: 200, overflowY: "auto", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 6 }}>
                        {loggroResults.map(p => {
                          const id = p._id || p.id;
                          const isCurrent = form.loggro_id === id;
                          const isBT = /\bBT\b/i.test(p.name);
                          return (
                            <div key={id} onClick={() => {
                              set("loggro_id", id);
                              set("loggro_categoria", p.category?.name || null);
                              setLoggroCurrent(p.name);
                              setLoggroOpen(false);
                            }}
                              style={{
                                padding: "8px 10px", cursor: "pointer", fontSize: 12,
                                background: isCurrent ? "#22c55e22" : "transparent",
                                borderBottom: `1px solid ${B.navyLight}`,
                                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
                              }}
                              onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                              onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = "transparent"; }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                                  {isBT && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#C8B99A33", color: "#C8B99A" }}>🍾 BT</span>}
                                </div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{p.category?.name || "Sin categoría"}</div>
                              </div>
                              {isCurrent && <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>✓</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {loggroSearch.length >= 2 && loggroResults.length === 0 && (
                      <div style={{ marginTop: 6, padding: 8, fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Sin resultados</div>
                    )}
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#F5C84211", border: "1px solid #F5C84233", borderRadius: 8 }}>
                  <input type="checkbox" checked={!!form.destacado} onChange={e => set("destacado", e.target.checked)} id="dest-chk" />
                  <label htmlFor="dest-chk" style={{ fontSize: 12, color: "#F5C842", cursor: "pointer", fontWeight: 600 }}>⭐ Destacado</label>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: form.disponible !== false ? "#22c55e11" : "#ef444411", border: `1px solid ${form.disponible !== false ? "#22c55e33" : "#ef444433"}`, borderRadius: 8 }}>
                  <input type="checkbox" checked={form.disponible !== false} onChange={e => set("disponible", e.target.checked)} id="disp-chk" />
                  <label htmlFor="disp-chk" style={{ fontSize: 12, color: form.disponible !== false ? "#22c55e" : "#ef4444", cursor: "pointer", fontWeight: 600 }}>
                    {form.disponible !== false ? "✓ Disponible" : "✕ Agotado"}
                  </label>
                </div>
              </div>
            </>
          )}

          {/* ── Opciones / Sub-items del menú (solo Banquetes) ── */}
          {isBanquete && (
            <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 14 }}>
              <label style={LS}>¿Qué incluye este menú?</label>

              {/* Modalidad de selección */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button type="button" onClick={() => set("seleccion_modo", "todo")}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8,
                    border: `2px solid ${form.seleccion_modo === "todo" ? B.success : "transparent"}`,
                    background: form.seleccion_modo === "todo" ? B.success + "22" : B.navyLight,
                    color: form.seleccion_modo === "todo" ? B.success : "rgba(255,255,255,0.5)",
                    fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ✓ Incluye todo
                </button>
                <button type="button" onClick={() => set("seleccion_modo", "seleccion")}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8,
                    border: `2px solid ${form.seleccion_modo === "seleccion" ? B.warning : "transparent"}`,
                    background: form.seleccion_modo === "seleccion" ? B.warning + "22" : B.navyLight,
                    color: form.seleccion_modo === "seleccion" ? B.warning : "rgba(255,255,255,0.5)",
                    fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ☑ Selección de X
                </button>
              </div>

              {form.seleccion_modo === "seleccion" && (
                <div style={{ marginBottom: 12 }}>
                  <label style={LS}>¿Cuántas opciones se pueden seleccionar?</label>
                  <input type="number" min={1} value={form.seleccion_cantidad || ""}
                    onChange={e => set("seleccion_cantidad", e.target.value)}
                    placeholder="Ej: 3 (el cliente elige 3 de las opciones)" style={IS} />
                </div>
              )}

              {/* Lista de opciones */}
              <div style={{ marginBottom: 10 }}>
                {(form.opciones || []).length === 0 && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 8 }}>
                    Sin opciones. Agrega los platos/productos que incluye este menú.
                  </div>
                )}
                {(form.opciones || []).map((op, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 10px", background: B.navy, borderRadius: 6, marginBottom: 4 }}>
                    <input value={op} onChange={e => {
                      const next = [...form.opciones];
                      next[idx] = e.target.value;
                      set("opciones", next);
                    }} style={{ flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: 13, outline: "none" }} />
                    <button onClick={() => set("opciones", form.opciones.filter((_, i) => i !== idx))}
                      style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 4, color: B.danger, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>✕</button>
                  </div>
                ))}
              </div>

              {/* Agregar nueva opción */}
              <div style={{ display: "flex", gap: 6 }}>
                <input value={newOpcion} onChange={e => setNewOpcion(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (newOpcion.trim()) { set("opciones", [...(form.opciones||[]), newOpcion.trim()]); setNewOpcion(""); } } }}
                  placeholder="Ej: Ceviche de camarón, Arroz con coco..."
                  style={{ ...IS, flex: 1 }} />
                <button onClick={() => { if (newOpcion.trim()) { set("opciones", [...(form.opciones||[]), newOpcion.trim()]); setNewOpcion(""); } }}
                  style={{ padding: "9px 18px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>+ Agregar</button>
              </div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Productos</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
          {!loading && (() => {
            const enlazados = tabItems.filter(i => i.loggro_id).length;
            const total = tabItems.length;
            if (total === 0) return null;
            const pct = Math.round((enlazados / total) * 100);
            return (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: "#22c55e11", color: "#22c55e", fontWeight: 700, border: "1px solid #22c55e44" }}
                title={`${enlazados} de ${total} productos vinculados a Loggro POS`}>
                🔗 {enlazados}/{total} en Loggro ({pct}%)
              </span>
            );
          })()}
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
                    background: B.navyMid, borderRadius: 10, padding: "12px 14px",
                    borderLeft: `3px solid ${item.activo ? tipo.color : "rgba(255,255,255,0.1)"}`,
                    opacity: item.activo ? 1 : 0.5,
                  }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      {/* Thumbnail */}
                      <div style={{ width: 64, height: 64, borderRadius: 8, background: item.foto_url ? `url(${item.foto_url}) center/cover` : B.navyLight, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, position: "relative" }}>
                        {!item.foto_url && "🍽"}
                        {item.destacado && <div style={{ position: "absolute", top: -4, right: -4, background: "#F5C842", color: B.navy, borderRadius: "50%", width: 18, height: 18, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>★</div>}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{item.nombre}</div>
                          {item.disponible === false && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#ef444433", color: "#ef4444", fontWeight: 700, textTransform: "uppercase" }}>Agotado</span>}
                          {item.loggro_id ? (
                            <span title={`Loggro: ${item.loggro_id}`} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#22c55e22", color: "#22c55e", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              🔗 Loggro
                            </span>
                          ) : (
                            <span title="Sin enlace a Loggro" style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase" }}>
                              sin enlace
                            </span>
                          )}
                        </div>
                        {item.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.descripcion}</div>}
                        {item.precio > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: B.sand }}>{COP(item.precio)}</div>}
                        {item.loggro_id && <LoggroLinkLabel loggroId={item.loggro_id} />}
                      </div>
                      {/* Actions */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
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

// ═══════════════════════════════════════════════════════════════════════════
// LoggroLinkLabel — muestra el nombre del producto en Loggro por su _id.
// Cachea resultados en memoria para evitar múltiples fetches del mismo _id.
// ═══════════════════════════════════════════════════════════════════════════
const _loggroNameCache = new Map();
const _loggroNamePending = new Map();

function LoggroLinkLabel({ loggroId }) {
  const [name, setName] = useState(() => _loggroNameCache.get(loggroId) || null);

  useEffect(() => {
    if (!loggroId) return;
    if (_loggroNameCache.has(loggroId)) { setName(_loggroNameCache.get(loggroId)); return; }

    // Coalesce simultaneous requests for the same id
    let promise = _loggroNamePending.get(loggroId);
    if (!promise) {
      promise = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/raw?path=${encodeURIComponent("/products/" + loggroId)}`, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      })
        .then(r => r.json())
        .then(d => {
          const prod = d?.body || d;
          const n = prod?.name || null;
          _loggroNameCache.set(loggroId, n);
          _loggroNamePending.delete(loggroId);
          return n;
        })
        .catch(() => { _loggroNamePending.delete(loggroId); return null; });
      _loggroNamePending.set(loggroId, promise);
    }
    let cancel = false;
    promise.then(n => { if (!cancel) setName(n); });
    return () => { cancel = true; };
  }, [loggroId]);

  return (
    <div style={{ fontSize: 10, color: "#22c55ecc", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
      <span>→</span>
      <span style={{ fontWeight: 600 }}>{name || "cargando..."}</span>
    </div>
  );
}
