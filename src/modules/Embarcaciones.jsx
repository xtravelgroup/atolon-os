import { useState, useEffect, useCallback } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const IS  = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS  = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const ISsm = { ...IS, padding: "7px 10px", fontSize: 12 };

const TIPOS_EMBAR = ["Deportiva", "Triton", "Lancha", "Yate", "Catamarán", "Bote", "Otro"];
const ESTADOS     = ["activo", "inactivo", "mantenimiento"];

const RUTAS = [
  { key: "cta_atl",     label: "Cartagena → Atolon" },
  { key: "atl_cta",     label: "Atolon → Cartagena" },
  { key: "cta_atl_cta", label: "Cartagena → Atolon → Cartagena" },
  { key: "atl_cta_atl", label: "Atolon → Cartagena → Atolon" },
  { key: "atl_rosario", label: "Atolon → Isla del Rosario (Full Day)" },
  { key: "otros",       label: "Otros" },
];

const ESTADO_CFG = {
  activo:        { color: B.success, label: "Activo" },
  inactivo:      { color: "rgba(255,255,255,0.3)", label: "Inactivo" },
  mantenimiento: { color: "#f59e0b", label: "Mantenimiento" },
};

const EMPTY_PRECIOS = { cta_atl: "", atl_cta: "", cta_atl_cta: "", atl_cta_atl: "", atl_rosario: "", otros: "" };

const EMPTY = {
  id: "", nombre: "", tipo: "Deportiva", capacidad: "", estado: "activo",
  propiedad: "propia", costo_renta: "", matricula: "", capitan: "",
  piloto_cedula: "", piloto_celular: "",
  piloto2_nombre: "", piloto2_cedula: "", piloto2_celular: "",
  notas: "", precios: {},
};

// ─── Modal Crear / Editar ──────────────────────────────────────────────────────
function EmbarcacionModal({ item, onClose, onSaved }) {
  const isEdit = !!item?.id;
  const [form, setForm] = useState(isEdit
    ? { ...EMPTY, ...item, costo_renta: item.costo_renta || "", precios: { ...EMPTY_PRECIOS, ...(item.precios || {}) } }
    : { ...EMPTY, precios: { ...EMPTY_PRECIOS } });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setPrecio = (ruta, val) => setForm(f => ({ ...f, precios: { ...f.precios, [ruta]: val } }));

  const save = async () => {
    if (!form.nombre.trim() || !form.capacidad) { setError("Nombre y capacidad son obligatorios"); return; }
    if (!form.id.trim()) { setError("ID de embarcación es obligatorio (ej: B001)"); return; }
    setSaving(true); setError("");
    const payload = {
      nombre:         form.nombre.trim(),
      tipo:           form.tipo,
      capacidad:      Number(form.capacidad) || 0,
      estado:         form.estado,
      propiedad:      form.propiedad,
      costo_renta:    Number(form.costo_renta) || 0,
      matricula:      form.matricula.trim() || null,
      capitan:        form.capitan.trim() || "",
      piloto_cedula:  form.piloto_cedula.trim() || null,
      piloto_celular: form.piloto_celular.trim() || null,
      piloto2_nombre: form.piloto2_nombre.trim() || null,
      piloto2_cedula: form.piloto2_cedula.trim() || null,
      piloto2_celular:form.piloto2_celular.trim() || null,
      notas:          form.notas.trim() || null,
      precios:        form.precios || {},
      updated_at:     new Date().toISOString(),
    };
    let err;
    if (isEdit) {
      const { error: e } = await supabase.from("embarcaciones").update(payload).eq("id", item.id);
      err = e;
    } else {
      const id = form.id.trim().toUpperCase();
      const { error: e } = await supabase.from("embarcaciones").insert({ id, ...payload, created_at: new Date().toISOString() });
      err = e;
    }
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 580, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{isEdit ? `Editar: ${item.nombre}` : "Nueva Embarcación"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ID + Nombre */}
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
            <div>
              <label style={LS}>ID <span style={{ color: B.danger }}>*</span></label>
              <input value={form.id} onChange={e => set("id", e.target.value)} style={IS} placeholder="B001" disabled={isEdit}
                style={{ ...IS, opacity: isEdit ? 0.5 : 1 }} />
            </div>
            <div>
              <label style={LS}>Nombre <span style={{ color: B.danger }}>*</span></label>
              <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS} placeholder="Natturale" />
            </div>
          </div>

          {/* Tipo + Capacidad + Estado */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Tipo</label>
              <select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={IS}>
                {TIPOS_EMBAR.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Capacidad (pax) <span style={{ color: B.danger }}>*</span></label>
              <input type="number" value={form.capacidad} onChange={e => set("capacidad", e.target.value)} style={IS} placeholder="20" />
            </div>
            <div>
              <label style={LS}>Estado</label>
              <select value={form.estado} onChange={e => set("estado", e.target.value)} style={IS}>
                {ESTADOS.map(s => <option key={s} value={s}>{ESTADO_CFG[s]?.label || s}</option>)}
              </select>
            </div>
          </div>

          {/* Propiedad + Costo renta + Matrícula */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Propiedad</label>
              <select value={form.propiedad} onChange={e => set("propiedad", e.target.value)} style={IS}>
                <option value="propia">Propia</option>
                <option value="rentada">Rentada</option>
              </select>
            </div>
            <div>
              <label style={LS}>Costo Renta/día</label>
              <input type="number" value={form.costo_renta} onChange={e => set("costo_renta", e.target.value)} style={IS} placeholder="2250000"
                disabled={form.propiedad === "propia"} style={{ ...IS, opacity: form.propiedad === "propia" ? 0.4 : 1 }} />
            </div>
            <div>
              <label style={LS}>Matrícula</label>
              <input value={form.matricula} onChange={e => set("matricula", e.target.value)} style={IS} placeholder="CP-053091-B" />
            </div>
          </div>

          {/* Capitán */}
          <div>
            <label style={LS}>Capitán</label>
            <input value={form.capitan} onChange={e => set("capitan", e.target.value)} style={IS} placeholder="Nombre del capitán" />
          </div>

          {/* Piloto 1 */}
          <div style={{ background: B.navy + "88", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontWeight: 700 }}>⚓ Piloto / Motorista</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ ...LS, fontSize: 10 }}>Cédula</label>
                <input value={form.piloto_cedula} onChange={e => set("piloto_cedula", e.target.value)} style={ISsm} placeholder="73144958" />
              </div>
              <div>
                <label style={{ ...LS, fontSize: 10 }}>Celular</label>
                <input value={form.piloto_celular} onChange={e => set("piloto_celular", e.target.value)} style={ISsm} placeholder="3103640948" />
              </div>
            </div>
          </div>

          {/* Piloto 2 */}
          <div style={{ background: B.navy + "88", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontWeight: 700 }}>⚓ Piloto 2 (opcional)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ ...LS, fontSize: 10 }}>Nombre</label>
                <input value={form.piloto2_nombre} onChange={e => set("piloto2_nombre", e.target.value)} style={ISsm} placeholder="Nombre" />
              </div>
              <div>
                <label style={{ ...LS, fontSize: 10 }}>Cédula</label>
                <input value={form.piloto2_cedula} onChange={e => set("piloto2_cedula", e.target.value)} style={ISsm} placeholder="1047406329" />
              </div>
              <div>
                <label style={{ ...LS, fontSize: 10 }}>Celular</label>
                <input value={form.piloto2_celular} onChange={e => set("piloto2_celular", e.target.value)} style={ISsm} placeholder="3216577153" />
              </div>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label style={LS}>Notas</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2}
              style={{ ...IS, resize: "vertical" }} placeholder="Observaciones, mantenimiento pendiente..." />
          </div>

          {/* Tarifas por ruta */}
          <div style={{ background: B.navy + "88", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14, fontWeight: 700 }}>💰 Tarifas por Ruta (COP)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {RUTAS.map(r => (
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

          {error && <div style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: B.danger }}>⚠️ {error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={save} disabled={saving}
              style={{ flex: 2, padding: "11px", borderRadius: 8, border: "none", background: saving ? B.navyLight : B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
              {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear embarcación"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Embarcaciones (exportado para Productos) ──────────────────────────────
export function TabEmbarcaciones() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | "new" | item

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("embarcaciones").select("*").order("nombre");
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEstado = async (item) => {
    const next = item.estado === "activo" ? "inactivo" : "activo";
    await supabase.from("embarcaciones").update({ estado: next, updated_at: new Date().toISOString() }).eq("id", item.id);
    setItems(p => p.map(e => e.id === item.id ? { ...e, estado: next } : e));
  };

  const activas      = items.filter(e => e.estado === "activo");
  const totalCap     = activas.reduce((s, e) => s + (e.capacidad || 0), 0);
  const totalRenta   = items.filter(e => e.propiedad === "rentada").reduce((s, e) => s + (e.costo_renta || 0), 0);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando embarcaciones...</div>;

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Embarcaciones", val: items.length, color: B.sky },
          { label: "Activas", val: activas.length, color: B.success },
          { label: "Cap. Total Activas", val: `${totalCap} pax`, color: B.sand },
          { label: "Costo Renta/día", val: totalRenta > 0 ? COP(totalRenta) : "—", color: "#f59e0b" },
        ].map(k => (
          <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${k.color}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Header + botón */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setModal("new")}
          style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Nueva Embarcación
        </button>
      </div>

      {/* Cards */}
      {items.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚓</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>No hay embarcaciones registradas</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {items.map(e => {
            const cfg = ESTADO_CFG[e.estado] || { color: B.sand, label: e.estado };
            return (
              <div key={e.id} style={{ background: B.navyMid, borderRadius: 14, padding: 20, border: `1px solid rgba(255,255,255,0.07)`, opacity: e.estado === "inactivo" ? 0.55 : 1 }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>⛵</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{e.nombre}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: cfg.color + "22", color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: e.propiedad === "propia" ? B.success + "22" : B.sand + "22", color: e.propiedad === "propia" ? B.success : B.sand }}>{e.propiedad === "propia" ? "Propia" : "Rentada"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{e.tipo} · ID: {e.id}</div>
                  </div>
                </div>

                {/* Info grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <InfoRow icon="👥" label="Capacidad" val={`${e.capacidad} pax`} />
                  {e.matricula && <InfoRow icon="📋" label="Matrícula" val={e.matricula} />}
                  {e.capitan && <InfoRow icon="🧭" label="Capitán" val={e.capitan} />}
                  {e.propiedad === "rentada" && e.costo_renta > 0 && <InfoRow icon="💰" label="Renta/día" val={COP(e.costo_renta)} />}
                </div>

                {/* Pilotos */}
                {(e.piloto_cedula || e.piloto2_nombre) && (
                  <div style={{ background: B.navy, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12 }}>
                    <div style={{ color: B.sky, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Pilotos</div>
                    {e.piloto_cedula && (
                      <div style={{ color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>
                        C.C. {e.piloto_cedula} {e.piloto_celular && <span style={{ color: "rgba(255,255,255,0.4)" }}>· {e.piloto_celular}</span>}
                      </div>
                    )}
                    {e.piloto2_nombre && (
                      <div style={{ color: "rgba(255,255,255,0.5)" }}>
                        {e.piloto2_nombre} {e.piloto2_cedula && `· ${e.piloto2_cedula}`}
                      </div>
                    )}
                  </div>
                )}

                {/* Tarifas */}
                {e.precios && Object.values(e.precios).some(v => v && Number(v) > 0) && (
                  <div style={{ background: B.navy, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 700 }}>💰 Tarifas</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {RUTAS.filter(r => e.precios[r.key] && Number(e.precios[r.key]) > 0).map(r => (
                        <div key={r.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{r.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>{COP(Number(e.precios[r.key]))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {e.notas && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic", marginBottom: 12 }}>📝 {e.notas}</div>}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setModal(e)}
                    style={{ flex: 1, padding: "8px", borderRadius: 8, background: B.navyLight, color: B.white, border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✏️ Editar</button>
                  <button onClick={() => toggleEstado(e)}
                    style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600,
                      background: e.estado === "activo" ? B.danger + "22" : B.success + "22",
                      color: e.estado === "activo" ? B.danger : B.success }}>
                    {e.estado === "activo" ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <EmbarcacionModal
          item={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function InfoRow({ icon, label, val }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
      </div>
    </div>
  );
}

export default TabEmbarcaciones;
