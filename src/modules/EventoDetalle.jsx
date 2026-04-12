// EventoDetalle.jsx — Pantalla completa de planificación de evento
// Timeline, transporte, contactos, dietas, modo staff, bitácora
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { useMobile } from "../lib/useMobile";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const IS  = { background: "#1E3566", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" };
const LS  = { fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" };
const BTN = (bg = B.sky, col = "#fff") => ({ background: bg, color: col, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" });
const nowHH = () => { const d = new Date(); return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); };
const uid = () => Math.random().toString(36).slice(2, 10);

// ─── Tipos de bloque de timeline ──────────────────────────────────────────────
const TIPOS_TIMELINE = [
  { key: "montaje",    label: "🔧 Montaje",        color: B.sand },
  { key: "proveedor",  label: "🚚 Proveedor",       color: B.sky },
  { key: "zarpe",      label: "⛵ Zarpe",            color: "#34d399" },
  { key: "actividad",  label: "🎉 Actividad",        color: B.success },
  { key: "servicio",   label: "🍽️ Servicio F&B",    color: "#f97316" },
  { key: "pausa",      label: "⏸ Pausa",            color: "rgba(255,255,255,0.3)" },
  { key: "traslado",   label: "🚢 Traslado",         color: "#a78bfa" },
  { key: "cierre",     label: "🔒 Cierre",           color: B.warning },
  { key: "emergencia", label: "🚨 Emergencia",       color: B.danger },
];
const tipoColor = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.color || B.sky;
const tipoLabel = (t) => TIPOS_TIMELINE.find(x => x.key === t)?.label || t;

const ESTADOS_TL = [
  { key: "pendiente",   label: "Pendiente",   color: "rgba(255,255,255,0.4)" },
  { key: "en_curso",    label: "En curso",    color: B.warning },
  { key: "completado",  label: "✓ Listo",     color: B.success },
  { key: "retrasado",   label: "⚠ Retrasado", color: B.danger },
  { key: "cancelado",   label: "✗ Cancelado", color: B.danger },
];

const RESTRICCIONES_BASE = ["Vegetariano","Vegano","Sin gluten","Sin lactosa","Sin mariscos","Sin nueces","Sin cerdo","Kosher","Halal","Diabético","Sin alcohol"];

// ─── Componentes menores ─────────────────────────────────────────────────────
function Pill({ label, color, onRemove }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
      {label}
      {onRemove && <span onClick={onRemove} style={{ cursor: "pointer", opacity: 0.6, fontSize: 13 }}>✕</span>}
    </span>
  );
}

function Inp({ value, onChange, type = "text", placeholder, style: sx, ...rest }) {
  return <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...IS, ...sx }} {...rest} />;
}

function Sel({ value, onChange, children }) {
  return <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...IS, appearance: "none" }}>{children}</select>;
}

function SectionCard({ title, children, action }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
        {action}
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

// ─── TIMELINE ────────────────────────────────────────────────────────────────
function TabTimeline({ items, onChange, readOnly }) {
  const [showForm, setShowForm] = useState(false);
  const [editIdx, setEditIdx]   = useState(null);
  const EMPTY = { hora: "", tipo: "actividad", titulo: "", descripcion: "", responsable: "", duracion: 60, estado: "pendiente", proveedor: "" };
  const [form, setForm] = useState(EMPTY);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const sorted = [...items].sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

  const openNew  = () => { setForm(EMPTY); setEditIdx(null); setShowForm(true); };
  const openEdit = (i) => { setForm({ ...EMPTY, ...sorted[i] }); setEditIdx(i); setShowForm(true); };

  const save = () => {
    if (!form.hora || !form.titulo) return;
    const item = { ...form, id: form.id || uid() };
    if (editIdx !== null) {
      const orig = sorted[editIdx];
      onChange(items.map(x => x.id === orig.id ? item : x));
    } else {
      onChange([...items, item]);
    }
    setShowForm(false);
  };

  const remove = (id) => onChange(items.filter(x => x.id !== id));

  const setEstado = (id, estado) => onChange(items.map(x => x.id === id ? { ...x, estado } : x));

  // Calcular hora fin
  const horaFin = (hora, dur) => {
    if (!hora || !dur) return "";
    const [h, m] = hora.split(":").map(Number);
    const tot = h * 60 + m + Number(dur);
    return String(Math.floor(tot / 60) % 24).padStart(2,"0") + ":" + String(tot % 60).padStart(2,"0");
  };

  // Detectar solapamientos
  const solapos = new Set();
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (a.hora && a.duracion && horaFin(a.hora, a.duracion) > b.hora) {
      solapos.add(a.id); solapos.add(b.id);
    }
  }

  const now = nowHH();
  const currentIdx = sorted.findIndex((it, i) => {
    const next = sorted[i + 1];
    return it.hora <= now && (!next || next.hora > now);
  });

  return (
    <div>
      {!readOnly && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={openNew} style={BTN(B.success)}>+ Agregar bloque</button>
        </div>
      )}

      {/* Línea de tiempo */}
      <div style={{ position: "relative" }}>
        {/* Barra vertical */}
        <div style={{ position: "absolute", left: 56, top: 0, bottom: 0, width: 2, background: B.navyLight, zIndex: 0 }} />

        {sorted.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
            No hay bloques en el rundown. Agrega el primer bloque.
          </div>
        )}

        {sorted.map((item, i) => {
          const color  = tipoColor(item.tipo);
          const esCurr = i === currentIdx;
          const solapo = solapos.has(item.id);
          return (
            <div key={item.id} style={{ display: "flex", gap: 0, marginBottom: 6, position: "relative", zIndex: 1 }}>
              {/* Hora */}
              <div style={{ width: 54, textAlign: "right", paddingRight: 8, paddingTop: 14, flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: esCurr ? B.warning : "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>{item.hora}</div>
                {item.duracion && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{item.duracion}′</div>}
              </div>

              {/* Dot */}
              <div style={{ width: 14, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, flexShrink: 0 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: color, boxShadow: esCurr ? `0 0 12px ${color}` : "none", border: esCurr ? `2px solid #fff` : "none", zIndex: 2 }} />
              </div>

              {/* Card */}
              <div style={{ flex: 1, marginLeft: 12, background: esCurr ? B.navyLight : B.navy,
                border: `1px solid ${solapo ? B.danger + "66" : esCurr ? color + "88" : B.navyLight}`,
                borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "12px 14px",
                boxShadow: esCurr ? `0 0 20px ${color}22` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{tipoLabel(item.tipo)}</span>
                      {item.duracion && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>hasta {horaFin(item.hora, item.duracion)}</span>}
                      {solapo && <span style={{ fontSize: 10, color: B.danger }}>⚠ Solapamiento</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: item.descripcion ? 4 : 0 }}>{item.titulo}</div>
                    {item.descripcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{item.descripcion}</div>}
                    <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {item.responsable && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>👤 {item.responsable}</span>}
                      {item.proveedor   && <span style={{ fontSize: 11, color: B.sky }}>🏢 {item.proveedor}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    {/* Estado selector */}
                    {!readOnly ? (
                      <select value={item.estado || "pendiente"}
                        onChange={e => setEstado(item.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{ background: "transparent", border: `1px solid ${ESTADOS_TL.find(x=>x.key===item.estado)?.color||"rgba(255,255,255,0.2)"}`,
                          color: ESTADOS_TL.find(x=>x.key===item.estado)?.color || "rgba(255,255,255,0.5)",
                          borderRadius: 20, padding: "3px 8px", fontSize: 11, fontWeight: 700, outline: "none", cursor: "pointer",
                          appearance: "none" }}>
                        {ESTADOS_TL.map(e => <option key={e.key} value={e.key} style={{ background: B.navyMid, color: "#fff" }}>{e.label}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: 11, color: ESTADOS_TL.find(x=>x.key===item.estado)?.color || "rgba(255,255,255,0.4)", fontWeight: 700 }}>
                        {ESTADOS_TL.find(x=>x.key===item.estado)?.label || item.estado}
                      </span>
                    )}
                    {!readOnly && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => openEdit(i)} style={{ ...BTN(B.navyLight), padding: "3px 8px", fontSize: 11 }}>✏</button>
                        <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Formulario */}
      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editIdx !== null ? "Editar bloque" : "Nuevo bloque"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LS}>Hora *</label><Inp type="time" value={form.hora} onChange={v => set("hora", v)} /></div>
            <div><label style={LS}>Tipo</label>
              <Sel value={form.tipo} onChange={v => set("tipo", v)}>
                {TIPOS_TIMELINE.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Sel>
            </div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Título *</label><Inp value={form.titulo} onChange={v => set("titulo", v)} placeholder="Ej: Llegada de flores y decoración" /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Descripción</label>
              <textarea value={form.descripcion||""} onChange={e => set("descripcion", e.target.value)} rows={2} style={{ ...IS, resize: "vertical" }} />
            </div>
            <div><label style={LS}>Responsable</label><Inp value={form.responsable} onChange={v => set("responsable", v)} placeholder="Nombre / cargo" /></div>
            <div><label style={LS}>Proveedor</label><Inp value={form.proveedor} onChange={v => set("proveedor", v)} placeholder="Empresa / proveedor" /></div>
            <div><label style={LS}>Duración (min)</label><Inp type="number" value={form.duracion} onChange={v => set("duracion", v)} /></div>
            <div><label style={LS}>Estado</label>
              <Sel value={form.estado} onChange={v => set("estado", v)}>
                {ESTADOS_TL.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
              </Sel>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar bloque</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TRANSPORTE ───────────────────────────────────────────────────────────────
const FLOTA_OPC = ["Caribe I", "Coral II", "Atolon III", "Sunrise", "Palmera", "Transporte externo", "Van privada", "Bus"];
const EMPTY_TRANSP = { id: "", tipo: "ida", embarcacion: "", hora: "", pax: "", muelle: "", notas: "", estado: "pendiente" };

function TabTransporte({ items, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY_TRANSP);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const TIPOS_TR = [
    { key: "ida",       label: "⛵ Zarpe (Ida)",          color: B.success },
    { key: "vuelta",    label: "🔄 Regreso",              color: B.sky },
    { key: "transfer",  label: "🚌 Transfer terrestre",    color: B.sand },
    { key: "privado",   label: "🚤 Servicio privado",      color: "#a78bfa" },
    { key: "proveedor", label: "🚚 Llegada proveedor",     color: B.warning },
  ];
  const typeColor = (t) => TIPOS_TR.find(x => x.key === t)?.color || B.sky;
  const typeLabel = (t) => TIPOS_TR.find(x => x.key === t)?.label || t;

  const sorted = [...items].sort((a, b) => (a.hora||"").localeCompare(b.hora||""));

  const openNew  = () => { setForm(EMPTY_TRANSP); setEditId(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...EMPTY_TRANSP, ...item }); setEditId(item.id); setShowForm(true); };
  const save = () => {
    if (!form.hora || !form.embarcacion) return;
    const item = { ...form, id: form.id || uid() };
    if (editId) onChange(items.map(x => x.id === editId ? item : x));
    else onChange([...items, item]);
    setShowForm(false);
  };
  const remove = (id) => onChange(items.filter(x => x.id !== id));
  const setEstado = (id, estado) => onChange(items.map(x => x.id === id ? { ...x, estado } : x));

  const ESTADOS_TR = ["pendiente","confirmado","en_camino","completado","cancelado"];
  const estadoColor = { pendiente: "rgba(255,255,255,0.4)", confirmado: B.sky, en_camino: B.warning, completado: B.success, cancelado: B.danger };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={openNew} style={BTN(B.success)}>+ Agregar traslado</button>
      </div>

      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          No hay traslados registrados. Agrega el primero.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(item => (
          <div key={item.id} style={{ background: B.navy, borderRadius: 12, padding: "16px 20px",
            borderLeft: `4px solid ${typeColor(item.tipo)}`, display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ textAlign: "center", minWidth: 54 }}>
              <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", color: typeColor(item.tipo) }}>{item.hora}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: typeColor(item.tipo), fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{typeLabel(item.tipo)}</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{item.embarcacion}</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {item.pax    && <span>👥 {item.pax} pax</span>}
                {item.muelle && <span>⚓ {item.muelle}</span>}
                {item.notas  && <span>📝 {item.notas}</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <select value={item.estado || "pendiente"} onChange={e => setEstado(item.id, e.target.value)}
                style={{ background: "transparent", border: `1px solid ${estadoColor[item.estado]||"rgba(255,255,255,0.2)"}`,
                  color: estadoColor[item.estado] || "rgba(255,255,255,0.4)", borderRadius: 20, padding: "3px 10px",
                  fontSize: 11, fontWeight: 700, outline: "none", cursor: "pointer", appearance: "none" }}>
                {ESTADOS_TR.map(e => <option key={e} value={e} style={{ background: B.navyMid }}>{e}</option>)}
              </select>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => openEdit(item)} style={{ ...BTN(B.navyLight), padding: "3px 8px", fontSize: 11 }}>✏</button>
                <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editId ? "Editar traslado" : "Nuevo traslado"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LS}>Hora *</label><Inp type="time" value={form.hora} onChange={v => set("hora", v)} /></div>
            <div><label style={LS}>Tipo</label>
              <Sel value={form.tipo} onChange={v => set("tipo", v)}>
                {TIPOS_TR.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Sel>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Embarcación / Vehículo *</label>
              <Sel value={form.embarcacion} onChange={v => set("embarcacion", v)}>
                <option value="">Seleccionar</option>
                {FLOTA_OPC.map(f => <option key={f} value={f}>{f}</option>)}
              </Sel>
            </div>
            <div><label style={LS}>Pax</label><Inp type="number" value={form.pax} onChange={v => set("pax", v)} /></div>
            <div><label style={LS}>Muelle / Punto</label><Inp value={form.muelle} onChange={v => set("muelle", v)} placeholder="Ej: Muelle Bodeguita Puerta 4" /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Notas adicionales</label><Inp value={form.notas} onChange={v => set("notas", v)} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CONTACTOS RÁPIDOS ────────────────────────────────────────────────────────
const ROLES_CONTACTO = ["Cliente","Coordinador evento","Proveedor AV","Proveedor catering","Proveedor decoración","Proveedor fotografía","Staff Atolon","Capitán","Seguridad","Otro"];
const EMPTY_CONT = { id: "", nombre: "", rol: "Cliente", telefono: "", email: "", empresa: "", notas: "" };

function TabContactos({ items, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY_CONT);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const ROL_COLORS = { Cliente: B.sand, "Coordinador evento": B.success, "Staff Atolon": B.sky };
  const rolColor = (r) => ROL_COLORS[r] || "rgba(255,255,255,0.5)";

  const openEdit = (item) => { setForm({ ...EMPTY_CONT, ...item }); setEditId(item.id); setShowForm(true); };
  const openNew  = () => { setForm(EMPTY_CONT); setEditId(null); setShowForm(true); };
  const save = () => {
    if (!form.nombre) return;
    const item = { ...form, id: form.id || uid() };
    if (editId) onChange(items.map(x => x.id === editId ? item : x));
    else onChange([...items, item]);
    setShowForm(false);
  };
  const remove = (id) => onChange(items.filter(x => x.id !== id));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={openNew} style={BTN(B.success)}>+ Agregar contacto</button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          No hay contactos registrados.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {items.map(item => (
          <div key={item.id} style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", borderTop: `3px solid ${rolColor(item.rol)}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: rolColor(item.rol), textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.rol}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => openEdit(item)} style={{ ...BTN(B.navyLight), padding: "2px 8px", fontSize: 11 }}>✏</button>
                <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "2px 8px", fontSize: 11, color: B.danger }}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{item.nombre}</div>
            {item.empresa && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{item.empresa}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {item.telefono && (
                <a href={`tel:${item.telefono}`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none",
                  background: B.success + "22", borderRadius: 8, padding: "8px 12px", color: B.success, fontWeight: 700, fontSize: 13 }}>
                  📞 {item.telefono}
                </a>
              )}
              {item.telefono && (
                <a href={`https://wa.me/${item.telefono.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none",
                    background: "#25D36622", borderRadius: 8, padding: "8px 12px", color: "#25D366", fontWeight: 700, fontSize: 13 }}>
                  💬 WhatsApp
                </a>
              )}
              {item.email && (
                <a href={`mailto:${item.email}`} style={{ fontSize: 12, color: B.sky, textDecoration: "none" }}>✉ {item.email}</a>
              )}
            </div>
            {item.notas && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 8, fontStyle: "italic" }}>"{item.notas}"</div>}
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editId ? "Editar contacto" : "Nuevo contacto"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Nombre *</label><Inp value={form.nombre} onChange={v => set("nombre", v)} /></div>
            <div><label style={LS}>Rol</label>
              <Sel value={form.rol} onChange={v => set("rol", v)}>
                {ROLES_CONTACTO.map(r => <option key={r} value={r}>{r}</option>)}
              </Sel>
            </div>
            <div><label style={LS}>Empresa</label><Inp value={form.empresa} onChange={v => set("empresa", v)} /></div>
            <div><label style={LS}>Teléfono</label><Inp value={form.telefono} onChange={v => set("telefono", v)} placeholder="+57 300..." /></div>
            <div><label style={LS}>Email</label><Inp type="email" value={form.email} onChange={v => set("email", v)} /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Notas</label><Inp value={form.notas} onChange={v => set("notas", v)} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DIETAS Y ALERGIAS ────────────────────────────────────────────────────────
function TabDietas({ items, paxTotal, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const EMPTY = { id: "", nombre: "", pax: 1, restricciones: [], alergias: [], menu_especial: "", notas: "" };
  const [form, setForm]         = useState(EMPTY);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [customAlergia, setCustomAlergia] = useState("");

  const toggleArr = (arr, val) => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

  const openNew  = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...EMPTY, ...item, restricciones: item.restricciones||[], alergias: item.alergias||[] }); setEditId(item.id); setShowForm(true); };
  const save = () => {
    if (!form.nombre) return;
    const item = { ...form, id: form.id || uid(), pax: Number(form.pax) || 1 };
    if (editId) onChange(items.map(x => x.id === editId ? item : x));
    else onChange([...items, item]);
    setShowForm(false);
  };
  const remove = (id) => onChange(items.filter(x => x.id !== id));

  // Resumen
  const allRestr = items.flatMap(x => (x.restricciones||[]).map(r => r));
  const restrCount = allRestr.reduce((m, r) => { m[r] = (m[r]||0) + 1; return m; }, {});
  const allAlerg = items.flatMap(x => (x.alergias||[]).map(a => a));
  const alergCount = allAlerg.reduce((m, a) => { m[a] = (m[a]||0) + 1; return m; }, {});

  return (
    <div>
      {/* Resumen global */}
      {items.length > 0 && (
        <div style={{ background: B.navy, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Resumen — {items.reduce((s,x) => s + (x.pax||1), 0)} de {paxTotal} pax con restricciones
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {Object.entries(restrCount).map(([r, n]) => (
              <Pill key={r} label={`${r} (${n})`} color={B.warning} />
            ))}
          </div>
          {Object.keys(alergCount).length > 0 && (
            <>
              <div style={{ fontSize: 11, color: B.danger, marginBottom: 6, fontWeight: 700 }}>⚠ ALERGIAS:</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(alergCount).map(([a, n]) => (
                  <Pill key={a} label={`${a} (${n})`} color={B.danger} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={openNew} style={BTN(B.success)}>+ Agregar restricción</button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          Sin restricciones dietéticas registradas.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map(item => (
          <div key={item.id} style={{ background: B.navy, borderRadius: 12, padding: "14px 18px",
            borderLeft: `4px solid ${(item.alergias||[]).length > 0 ? B.danger : B.warning}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
                  {item.nombre}
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 8 }}>{item.pax > 1 ? `(${item.pax} personas)` : ""}</span>
                </div>
                {(item.restricciones||[]).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    {item.restricciones.map(r => <Pill key={r} label={r} color={B.warning} />)}
                  </div>
                )}
                {(item.alergias||[]).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: B.danger, fontWeight: 700 }}>⚠ ALERGIA:</span>
                    {item.alergias.map(a => <Pill key={a} label={a} color={B.danger} />)}
                  </div>
                )}
                {item.menu_especial && <div style={{ fontSize: 12, color: B.sky, marginTop: 4 }}>🍽 Menú especial: {item.menu_especial}</div>}
                {item.notas && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4, fontStyle: "italic" }}>"{item.notas}"</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => openEdit(item)} style={{ ...BTN(B.navyLight), padding: "3px 8px", fontSize: 11 }}>✏</button>
                <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editId ? "Editar restricción" : "Nueva restricción dietética"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Nombre / Grupo *</label><Inp value={form.nombre} onChange={v => set("nombre", v)} placeholder="Ej: Mesa 3 — familia García" /></div>
            <div><label style={LS}>Cantidad de personas</label><Inp type="number" value={form.pax} onChange={v => set("pax", v)} /></div>
            <div><label style={LS}>Menú especial solicitado</label><Inp value={form.menu_especial} onChange={v => set("menu_especial", v)} placeholder="Ej: Sin proteína animal" /></div>
          </div>

          {/* Restricciones */}
          <div style={{ marginTop: 16 }}>
            <label style={LS}>Restricciones dietéticas</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {RESTRICCIONES_BASE.map(r => (
                <button key={r} onClick={() => set("restricciones", toggleArr(form.restricciones, r))}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600,
                    background: form.restricciones.includes(r) ? B.warning : B.warning + "22",
                    color:      form.restricciones.includes(r) ? "#fff" : B.warning }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Alergias */}
          <div style={{ marginTop: 16 }}>
            <label style={{ ...LS, color: B.danger }}>⚠ Alergias (pueden ser peligrosas)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, marginBottom: 10 }}>
              {form.alergias.map(a => (
                <Pill key={a} label={a} color={B.danger} onRemove={() => set("alergias", form.alergias.filter(x => x !== a))} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Inp value={customAlergia} onChange={setCustomAlergia} placeholder="Escribir alergia + Enter" style={{ flex: 1 }}
                onKeyDown={e => { if (e.key === "Enter" && customAlergia.trim()) { set("alergias", [...form.alergias, customAlergia.trim()]); setCustomAlergia(""); }}} />
              <button onClick={() => { if (customAlergia.trim()) { set("alergias", [...form.alergias, customAlergia.trim()]); setCustomAlergia(""); }}}
                style={BTN(B.danger)}>+ Agregar</button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}><label style={LS}>Notas adicionales</label>
            <textarea value={form.notas||""} onChange={e => set("notas", e.target.value)} rows={2} style={{ ...IS, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BITÁCORA DE INCIDENTES ───────────────────────────────────────────────────
const PRIORIDAD_INC = [
  { key: "info",    label: "ℹ Info",     color: B.sky },
  { key: "alerta",  label: "⚠ Alerta",  color: B.warning },
  { key: "critico", label: "🚨 Crítico", color: B.danger },
];

function TabBitacora({ items, onChange }) {
  const [form, setForm] = useState({ descripcion: "", prioridad: "info", reportado_por: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const add = () => {
    if (!form.descripcion.trim()) return;
    const now = new Date();
    const hora = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
    const item = { ...form, id: uid(), hora, timestamp: now.toISOString(), resuelto: false };
    onChange([item, ...items]);
    setForm({ descripcion: "", prioridad: "info", reportado_por: form.reportado_por });
  };

  const toggleResuelto = (id) => onChange(items.map(x => x.id === id ? { ...x, resuelto: !x.resuelto } : x));
  const remove = (id) => onChange(items.filter(x => x.id !== id));

  return (
    <div>
      {/* Formulario rápido */}
      <div style={{ background: B.navy, borderRadius: 12, padding: 16, marginBottom: 20, border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📝 Registrar novedad</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={LS}>Descripción *</label>
            <Inp value={form.descripcion} onChange={v => set("descripcion", v)} placeholder="Describe la novedad o incidente…"
              onKeyDown={e => e.key === "Enter" && add()} />
          </div>
          <div>
            <label style={LS}>Prioridad</label>
            <Sel value={form.prioridad} onChange={v => set("prioridad", v)}>
              {PRIORIDAD_INC.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Sel>
          </div>
          <div>
            <label style={LS}>Reportado por</label>
            <Inp value={form.reportado_por} onChange={v => set("reportado_por", v)} placeholder="Nombre…" style={{ width: 140 }} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={add} style={BTN(B.success)}>Registrar</button>
        </div>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 32, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          Sin novedades registradas.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(item => {
          const pc = PRIORIDAD_INC.find(x => x.key === item.prioridad) || PRIORIDAD_INC[0];
          return (
            <div key={item.id} style={{ background: item.resuelto ? B.navy : B.navyMid,
              borderRadius: 10, padding: "12px 16px", borderLeft: `4px solid ${item.resuelto ? "rgba(255,255,255,0.1)" : pc.color}`,
              opacity: item.resuelto ? 0.5 : 1, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ minWidth: 48, textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: item.resuelto ? "rgba(255,255,255,0.3)" : pc.color }}>{item.hora}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: pc.color }}>{pc.label}</span>
                  {item.reportado_por && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>por {item.reportado_por}</span>}
                  {item.resuelto && <span style={{ fontSize: 11, color: B.success, fontWeight: 700 }}>✓ Resuelto</span>}
                </div>
                <div style={{ fontSize: 13, textDecoration: item.resuelto ? "line-through" : "none" }}>{item.descripcion}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggleResuelto(item.id)} style={{ ...BTN(item.resuelto ? B.navyLight : B.success + "33"), padding: "3px 10px", fontSize: 11, color: item.resuelto ? "rgba(255,255,255,0.4)" : B.success, border: `1px solid ${item.resuelto ? B.navyLight : B.success + "66"}` }}>
                  {item.resuelto ? "Reabrir" : "Resolver"}
                </button>
                <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "22"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MODO STAFF (Vista simplificada para el día del evento) ───────────────────
function ModoStaff({ evento, timeline, contactos, transporte, incidentes }) {
  const now = nowHH();
  const sorted = [...timeline].sort((a, b) => (a.hora||"").localeCompare(b.hora||""));
  const currentIdx = sorted.findIndex((it, i) => {
    const next = sorted[i + 1];
    return it.hora <= now && (!next || next.hora > now);
  });
  const proximos = sorted.filter((_, i) => i >= Math.max(0, currentIdx));
  const criticos = incidentes.filter(x => x.prioridad === "critico" && !x.resuelto);
  const alergias = (evento.restricciones_dieteticas||[]).filter(x => (x.alergias||[]).length > 0);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      {/* Alerta alergias */}
      {alergias.length > 0 && (
        <div style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: B.danger, marginBottom: 8 }}>⚠ ALERGIAS EN ESTE EVENTO</div>
          {alergias.map(a => (
            <div key={a.id} style={{ fontSize: 12, marginBottom: 4 }}>
              <strong>{a.nombre}</strong>: {a.alergias.join(", ")}
            </div>
          ))}
        </div>
      )}

      {/* Incidentes críticos */}
      {criticos.length > 0 && (
        <div style={{ background: B.danger + "33", border: `2px solid ${B.danger}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: B.danger, marginBottom: 8 }}>🚨 INCIDENTES ACTIVOS</div>
          {criticos.map(c => <div key={c.id} style={{ fontSize: 13, marginBottom: 4 }}>• {c.descripcion}</div>)}
        </div>
      )}

      {/* Hora actual */}
      <div style={{ textAlign: "center", padding: "20px 0", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Ahora</div>
        <div style={{ fontSize: 52, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{now}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{evento.nombre} · {fmtFecha(evento.fecha)}</div>
      </div>

      {/* Próximos bloques */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Rundown</div>
        {proximos.slice(0, 8).map((item, i) => {
          const color = tipoColor(item.tipo);
          const isCurr = i === 0 && currentIdx >= 0;
          return (
            <div key={item.id} style={{ display: "flex", gap: 12, marginBottom: 10, opacity: item.estado === "completado" ? 0.4 : 1 }}>
              <div style={{ width: 52, textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: isCurr ? 22 : 16, fontWeight: 900, color: isCurr ? B.warning : "rgba(255,255,255,0.7)", fontFamily: "'Barlow Condensed', sans-serif" }}>{item.hora}</div>
              </div>
              <div style={{ width: 3, background: isCurr ? B.warning : color + "55", borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, background: isCurr ? B.navyLight : "transparent", borderRadius: 8, padding: isCurr ? "8px 12px" : "4px 0" }}>
                <div style={{ fontSize: isCurr ? 16 : 13, fontWeight: isCurr ? 800 : 600 }}>{item.titulo}</div>
                {item.responsable && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>👤 {item.responsable}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Contactos rápidos */}
      {contactos.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Contactos rápidos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {contactos.filter(c => c.telefono).map(c => (
              <a key={c.id} href={`tel:${c.telefono}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: B.navyMid, borderRadius: 10, padding: "12px 16px", textDecoration: "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{c.nombre}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{c.rol}</div>
                </div>
                <div style={{ background: B.success, borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 13, fontWeight: 700 }}>📞 Llamar</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SERVICIOS CONTRATADOS ────────────────────────────────────────────────────
const CATS_SERV = ["Menú Restaurante","Menú Bebidas","Menú Banquetes","Espacios Renta","Transportación Acuática","Transportación Terrestre","Otros Servicios"];
const CATS_TO_TIPO = {
  "Menú Restaurante":      "restaurant",
  "Menú Bebidas":          "bebidas",
  "Menú Banquetes":        "banquetes",
  "Espacios Renta":        "espacios_renta",
  "Transportación Acuática": "trans_acuatica",
  "Transportación Terrestre": "transportacion",
  "Otros Servicios":       "otros_servicios",
};
const EMPTY_SERV = { id: "", categoria: "Menú Restaurante", proveedor: "", descripcion: "", valor: "", estado: "cotizando", notas: "", cantidad: 1 };

function TabServicios({ items, onChange, pasadiasOrg = [], categoria, precioTipo = "publico", pasadiasMap = {} }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState(null);
  const [form, setForm]         = useState(EMPTY_SERV);
  const [menuItems, setMenuItems]   = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Resolver precio: precio_manual → lookup en tabla pasadias
  const resolverPrecio = (p) => {
    if (Number(p.precio_manual) > 0) return Number(p.precio_manual);
    const match = pasadiasMap[(p.tipo || "").toLowerCase()];
    if (match) return precioTipo === "neto" ? (match.precio_neto_agencia || 0) : (match.precio || 0);
    return 0;
  };

  const comprasCliente = categoria === "grupo" ? (pasadiasOrg || []) : [];

  // Cargar productos de menu_items cuando cambia la categoría del formulario
  useEffect(() => {
    if (!showForm || !supabase) return;
    const tipo = CATS_TO_TIPO[form.categoria];
    if (!tipo) { setMenuItems([]); return; }
    setLoadingMenu(true);
    supabase.from("menu_items").select("id,nombre,descripcion,precio,categoria,tiene_iva")
      .eq("menu_tipo", tipo).eq("activo", true).order("categoria").order("orden")
      .then(({ data }) => { setMenuItems(data || []); setLoadingMenu(false); });
  }, [form.categoria, showForm]);

  // Agrupar items por subcategoría
  const menuPorCategoria = menuItems.reduce((acc, it) => {
    if (!acc[it.categoria]) acc[it.categoria] = [];
    acc[it.categoria].push(it);
    return acc;
  }, {});

  const seleccionarProducto = (it) => {
    setForm(f => ({ ...f, descripcion: it.nombre, valor: it.precio || "", notas: it.descripcion || f.notas }));
  };

  const ESTADOS_S = [
    { key: "cotizando",  label: "Cotizando",   color: "rgba(255,255,255,0.4)" },
    { key: "confirmado", label: "Confirmado",  color: B.success },
    { key: "pagado",     label: "Pagado",      color: B.sky },
    { key: "cancelado",  label: "Cancelado",   color: B.danger },
  ];
  const estColor = (e) => ESTADOS_S.find(x => x.key === e)?.color || "rgba(255,255,255,0.4)";

  const openNew  = () => { setForm(EMPTY_SERV); setEditId(null); setShowForm(true); };
  const openEdit = (item) => { setForm({ ...EMPTY_SERV, ...item }); setEditId(item.id); setShowForm(true); };
  const save = () => {
    if (!form.categoria) return;
    const cant  = Number(form.cantidad) || 1;
    const unit  = Number(form.valor) || 0;
    const item  = { ...form, id: form.id || uid(), cantidad: cant, valor_unit: unit, valor: unit * cant };
    if (editId) onChange(items.map(x => x.id === editId ? item : x));
    else onChange([...items, item]);
    setShowForm(false);
  };
  const remove = (id) => onChange(items.filter(x => x.id !== id));
  const setEstado = (id, estado) => onChange(items.map(x => x.id === id ? { ...x, estado } : x));

  const total = items.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const confirmados = items.filter(x => x.estado === "confirmado" || x.estado === "pagado").reduce((s, x) => s + (Number(x.valor)||0), 0);

  return (
    <div>
      {/* ── Resumen de compra del cliente (grupos) ── */}
      {comprasCliente.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            🛒 Lo que compró el cliente
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {comprasCliente.map((p, i) => {
              const personas = Number(p.personas) || 0;
              const precio   = resolverPrecio(p);
              const subtotal = precio * personas;
              return (
                <div key={p.id || i} style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{p.tipo}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "right", minWidth: 90 }}>
                    {precio > 0 ? COP(precio) : "—"} × {personas}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: subtotal > 0 ? B.sand : "rgba(255,255,255,0.3)", fontFamily: "'Barlow Condensed', sans-serif", minWidth: 110, textAlign: "right" }}>
                    {subtotal > 0 ? COP(subtotal) : "$0"}
                  </div>
                </div>
              );
            })}
            {/* Total general */}
            {comprasCliente.length > 0 && (() => {
              const gran = comprasCliente.reduce((s, p) => s + resolverPrecio(p) * (Number(p.personas) || 0), 0);
              return gran > 0 ? (
                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginRight: 12, alignSelf: "center" }}>TOTAL</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(gran)}</span>
                </div>
              ) : null;
            })()}
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "20px 0" }} />
        </div>
      )}

      {items.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { label: "Total servicios", val: COP(total), color: B.sand },
            { label: "Confirmados/Pagados", val: COP(confirmados), color: B.success },
            { label: "Por confirmar", val: COP(total - confirmados), color: B.warning },
          ].map(k => (
            <div key={k.label} style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", flex: 1, minWidth: 140, borderLeft: `3px solid ${k.color}` }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{k.val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={openNew} style={BTN(B.success)}>+ Agregar servicio</button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          No hay servicios contratados registrados.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map(item => (
          <div key={item.id} style={{ background: B.navy, borderRadius: 12, padding: "14px 18px",
            display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{item.categoria}</span>
                <span style={{ fontSize: 11, color: estColor(item.estado), border: `1px solid ${estColor(item.estado)}44`, borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>{item.estado}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{item.proveedor || item.descripcion}</div>
              {item.descripcion && item.proveedor && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{item.descripcion}</div>}
              {item.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, fontStyle: "italic" }}>"{item.notas}"</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              {item.valor > 0 && <>
                {item.cantidad > 1 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{item.cantidad} × {COP(item.valor_unit)}</div>}
                <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(item.valor)}</div>
              </>}
              <select value={item.estado||"cotizando"} onChange={e => setEstado(item.id, e.target.value)}
                style={{ background: "transparent", border: `1px solid ${estColor(item.estado)}44`, color: estColor(item.estado),
                  borderRadius: 8, padding: "3px 8px", fontSize: 11, outline: "none", cursor: "pointer", appearance: "none", marginTop: 6 }}>
                {ESTADOS_S.map(e => <option key={e.key} value={e.key} style={{ background: B.navyMid }}>{e.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={() => openEdit(item)} style={{ ...BTN(B.navyLight), padding: "3px 8px", fontSize: 11 }}>✏</button>
              <button onClick={() => remove(item.id)} style={{ ...BTN(B.danger + "33"), padding: "3px 8px", fontSize: 11, color: B.danger }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontWeight: 800, marginBottom: 16, fontSize: 14 }}>{editId ? "Editar servicio" : "Nuevo servicio"}</div>

          {/* Categoría */}
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Categoría</label>
            <Sel value={form.categoria} onChange={v => { set("categoria", v); setForm(f => ({ ...f, categoria: v, descripcion: "", valor: "" })); }}>
              {CATS_SERV.map(c => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </div>

          {/* Selector de productos del módulo */}
          <div style={{ marginBottom: 16 }}>
            <label style={LS}>Seleccionar producto</label>
            {loadingMenu ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "10px 0" }}>Cargando productos…</div>
            ) : menuItems.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "10px 0" }}>Sin productos para esta categoría</div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, paddingRight: 4 }}>
                {Object.entries(menuPorCategoria).map(([cat, its]) => (
                  <div key={cat}>
                    <div style={{ fontSize: 10, color: B.sky, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "8px 4px 4px" }}>{cat}</div>
                    {its.map(it => {
                      const seleccionado = form.descripcion === it.nombre;
                      return (
                        <button key={it.id} type="button" onClick={() => seleccionarProducto(it)}
                          style={{ width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8, marginBottom: 3,
                            border: `1px solid ${seleccionado ? B.sky : "rgba(255,255,255,0.08)"}`,
                            background: seleccionado ? B.sky + "18" : B.navyLight,
                            color: "#fff", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: seleccionado ? 700 : 400 }}>{it.nombre}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: seleccionado ? B.sky : B.sand, flexShrink: 0 }}>
                            {COP(it.precio)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Campos del servicio */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Descripción / Nombre</label>
              <Inp value={form.descripcion} onChange={v => set("descripcion", v)} placeholder="Nombre del servicio o producto" />
            </div>
            <div>
              <label style={LS}>Cantidad</label>
              <Inp type="number" value={form.cantidad ?? 1} onChange={v => set("cantidad", v)} />
            </div>
            <div>
              <label style={LS}>Precio unitario</label>
              <Inp type="number" value={form.valor} onChange={v => set("valor", v)} />
            </div>
            {(Number(form.valor) > 0 && Number(form.cantidad) > 1) && (
              <div style={{ gridColumn: "span 2", background: B.navyMid, borderRadius: 8, padding: "8px 14px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Subtotal ({form.cantidad} × {COP(form.valor)})</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: B.sand }}>{COP(Number(form.valor) * Number(form.cantidad))}</span>
              </div>
            )}
            <div><label style={LS}>Estado</label>
              <Sel value={form.estado} onChange={v => set("estado", v)}>
                {ESTADOS_S.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
              </Sel>
            </div>
            <div><label style={LS}>Notas</label><Inp value={form.notas} onChange={v => set("notas", v)} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function EventoDetalle({ evento: inicial, onBack, onEdit, onSaved }) {
  const isMobile = useMobile();
  const [tab, setTab] = useState("rundown");
  const [evento, setEvento] = useState(inicial);
  const [saving, setSaving] = useState(false);
  const [modoStaff, setModoStaff] = useState(false);
  const [pasadiasMap, setPasadiasMap] = useState({});
  const saveTimer = useRef(null);

  // Reload fresh data on mount
  useEffect(() => {
    if (!supabase || !inicial?.id) return;
    supabase.from("eventos").select("*").eq("id", inicial.id).single()
      .then(({ data }) => { if (data) setEvento(prev => ({ ...prev, ...data })); });
  }, [inicial?.id]);

  // Cargar precios de pasadías para lookup en tab Servicios
  useEffect(() => {
    if (!supabase) return;
    supabase.from("pasadias").select("nombre, precio, precio_neto_agencia")
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(p => { map[p.nombre.toLowerCase()] = p; });
        setPasadiasMap(map);
      });
  }, []);

  const saveField = useCallback(async (field, value) => {
    if (!supabase || !evento?.id) return;
    setSaving(true);
    await supabase.from("eventos").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", evento.id);
    setSaving(false);
    onSaved?.();
  }, [evento?.id, onSaved]);

  const updateLocal = (field, value) => {
    setEvento(prev => ({ ...prev, [field]: value }));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveField(field, value), 800);
  };

  const stageColors = { Consulta: B.warning, Cotizado: B.sky, Confirmado: B.success, Realizado: "rgba(255,255,255,0.3)" };
  const stageColor = stageColors[evento.stage] || B.sand;

  const TABS = [
    { key: "rundown",   label: isMobile ? "📋" : "📋 Rundown" },
    { key: "servicios", label: isMobile ? "🛎" : "🛎 Servicios" },
    { key: "transporte",label: isMobile ? "⛵" : "⛵ Transporte" },
    { key: "contactos", label: isMobile ? "👤" : "👤 Contactos" },
    { key: "dietas",    label: isMobile ? "🍽️" : "🍽️ Dietas" },
    { key: "bitacora",  label: isMobile ? "📝" : "📝 Bitácora" },
  ];

  // Contar alertas
  const incidentesAbiertos = (evento.incidentes||[]).filter(x => !x.resuelto && x.prioridad === "critico").length;
  const alergias = (evento.restricciones_dieteticas||[]).filter(x => (x.alergias||[]).length > 0).length;

  if (modoStaff) {
    return (
      <div style={{ background: B.navy, minHeight: "100vh", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{evento.nombre}</div>
          <button onClick={() => setModoStaff(false)} style={{ ...BTN(B.navyMid), border: `1px solid ${B.navyLight}`, fontSize: 12 }}>← Vista completa</button>
        </div>
        <ModoStaff evento={evento} timeline={evento.timeline_items||[]} contactos={evento.contactos_rapidos||[]}
          transporte={evento.transporte_detalle||[]} incidentes={evento.incidentes||[]} />
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? 12 : 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ ...BTN(B.navyMid), border: `1px solid ${B.navyLight}`, fontSize: 12, flexShrink: 0, marginTop: 2 }}>← Volver</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0, fontFamily: "'Barlow Condensed', sans-serif" }}>{evento.nombre}</h2>
            <span style={{ background: stageColor + "22", color: stageColor, border: `1px solid ${stageColor}44`,
              borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{evento.stage}</span>
            {incidentesAbiertos > 0 && <span style={{ background: B.danger + "33", color: B.danger, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 800 }}>🚨 {incidentesAbiertos} crítico{incidentesAbiertos > 1 ? "s" : ""}</span>}
            {alergias > 0 && <span style={{ background: B.danger + "22", color: B.danger, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>⚠ {alergias} alergia{alergias > 1 ? "s" : ""}</span>}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
            {evento.tipo} · {evento.fecha_fin && evento.fecha_fin !== evento.fecha ? `${fmtFecha(evento.fecha)} → ${fmtFecha(evento.fecha_fin)}` : fmtFecha(evento.fecha)}
            {evento.hora_ini && ` · ${evento.hora_ini}`}{evento.hora_fin && `–${evento.hora_fin}`}
            {" · "}{evento.pax} pax
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => setModoStaff(true)} style={{ ...BTN("#1a3d2a"), border: `1px solid ${B.success}44`, color: B.success, fontSize: 12 }}>📱 Modo Staff</button>
          <button onClick={onEdit} style={{ ...BTN(B.navyMid), border: `1px solid ${B.navyLight}`, fontSize: 12 }}>✏ Editar datos</button>
          {saving && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", alignSelf: "center" }}>Guardando…</span>}
        </div>
      </div>

      {/* Hero info bar */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 20px", marginBottom: 20,
        display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
        {[
          { label: "Cliente", val: evento.contacto || "—" },
          { label: "Teléfono", val: evento.tel || "—" },
          { label: "Tipo", val: evento.tipo || "—" },
          { label: "Valor", val: COP(evento.valor) },
          { label: "Responsable", val: evento.responsable_evento || evento.vendedor || "—" },
          { label: "Montaje desde", val: evento.montaje || "—" },
        ].map(f => (
          <div key={f.label}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{f.label}</div>
            <div style={{ fontWeight: 700 }}>{f.val}</div>
          </div>
        ))}
      </div>

      {/* Notas operativas */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ ...LS, fontSize: 12 }}>📌 Notas operativas</label>
        <textarea value={evento.notas_operativas || ""} rows={2}
          onChange={e => updateLocal("notas_operativas", e.target.value)}
          placeholder="Instrucciones especiales, requerimientos del cliente, notas del día…"
          style={{ ...IS, resize: "vertical" }} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${B.navyLight}`, paddingBottom: 0, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: "none", border: "none", color: tab === t.key ? "#fff" : "rgba(255,255,255,0.4)",
            borderRadius: "8px 8px 0 0", padding: "9px 16px", fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            cursor: "pointer", whiteSpace: "nowrap",
            borderBottom: tab === t.key ? `3px solid ${B.sky}` : "3px solid transparent",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "rundown"   && <TabTimeline   items={evento.timeline_items||[]}           onChange={v => updateLocal("timeline_items", v)} />}
      {tab === "servicios" && <TabServicios  items={evento.servicios_contratados||[]}     onChange={v => updateLocal("servicios_contratados", v)} pasadiasOrg={evento.pasadias_org||[]} categoria={evento.categoria} precioTipo={evento.precio_tipo||"publico"} pasadiasMap={pasadiasMap} />}
      {tab === "transporte"&& <TabTransporte items={evento.transporte_detalle||[]}        onChange={v => updateLocal("transporte_detalle", v)} />}
      {tab === "contactos" && <TabContactos  items={evento.contactos_rapidos||[]}         onChange={v => updateLocal("contactos_rapidos", v)} />}
      {tab === "dietas"    && <TabDietas     items={evento.restricciones_dieteticas||[]}  paxTotal={evento.pax||0} onChange={v => updateLocal("restricciones_dieteticas", v)} />}
      {tab === "bitacora"  && <TabBitacora   items={evento.incidentes||[]}               onChange={v => updateLocal("incidentes", v)} />}
    </div>
  );
}
