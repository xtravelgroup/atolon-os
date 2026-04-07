import { useState, useEffect, useCallback } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const IS  = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS  = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const AREAS = [
  "Muelle / Embarcadero", "Restaurante", "Bar", "Piscina", "Zona de playa",
  "Baños", "Cocina", "Sistema eléctrico", "Sistema hidráulico",
  "Equipos A/C", "Equipos de sonido", "Área VIP", "Recepción", "Almacén", "General",
];

const TIPOS = [
  { key: "preventivo",  label: "Preventivo",  color: "#38bdf8" },
  { key: "correctivo",  label: "Correctivo",  color: "#f59e0b" },
  { key: "emergencia",  label: "Emergencia",  color: "#ef4444" },
];

const PRIORIDADES = [
  { key: "alta",  label: "Alta",  color: "#ef4444" },
  { key: "media", label: "Media", color: "#f59e0b" },
  { key: "baja",  label: "Baja",  color: "#4ade80" },
];

const ESTADOS = [
  { key: "pendiente",   label: "Pendiente",   color: "#f59e0b" },
  { key: "en_proceso",  label: "En proceso",  color: "#38bdf8" },
  { key: "completado",  label: "Completado",  color: "#4ade80" },
  { key: "cancelado",   label: "Cancelado",   color: "rgba(255,255,255,0.25)" },
];

const tipoColor     = k => TIPOS.find(t => t.key === k)?.color     || B.sand;
const prioridadColor= k => PRIORIDADES.find(p => p.key === k)?.color || B.sand;
const estadoColor   = k => ESTADOS.find(e => e.key === k)?.color    || B.sand;
const tipoLabel     = k => TIPOS.find(t => t.key === k)?.label     || k;
const estadoLabel   = k => ESTADOS.find(e => e.key === k)?.label    || k;
const prioLabel     = k => PRIORIDADES.find(p => p.key === k)?.label || k;

const fmtFecha = d => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—";
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

const EMPTY = {
  area: AREAS[0], titulo: "", descripcion: "",
  tipo: "correctivo", prioridad: "media", estado: "pendiente",
  asignado_a: "", fecha_reporte: todayISO(), fecha_programada: "",
  fecha_completado: "", costo_estimado: "", costo_real: "", notas: "",
};

// ─── Modal ────────────────────────────────────────────────────────────────────
function OrdenModal({ orden, onClose, onSaved }) {
  const isEdit = !!orden?.id;
  const [form, setForm] = useState(isEdit ? {
    area:             orden.area || AREAS[0],
    titulo:           orden.titulo || "",
    descripcion:      orden.descripcion || "",
    tipo:             orden.tipo || "correctivo",
    prioridad:        orden.prioridad || "media",
    estado:           orden.estado || "pendiente",
    asignado_a:       orden.asignado_a || "",
    fecha_reporte:    orden.fecha_reporte || todayISO(),
    fecha_programada: orden.fecha_programada || "",
    fecha_completado: orden.fecha_completado || "",
    costo_estimado:   orden.costo_estimado ? String(orden.costo_estimado) : "",
    costo_real:       orden.costo_real     ? String(orden.costo_real)     : "",
    notas:            orden.notas || "",
  } : { ...EMPTY });

  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-completar fecha_completado cuando estado = completado
  useEffect(() => {
    if (form.estado === "completado" && !form.fecha_completado) {
      set("fecha_completado", todayISO());
    }
  }, [form.estado]);

  const save = async () => {
    if (!form.titulo.trim()) return;
    setSaving(true);
    const payload = {
      area:             form.area,
      titulo:           form.titulo.trim(),
      descripcion:      form.descripcion || null,
      tipo:             form.tipo,
      prioridad:        form.prioridad,
      estado:           form.estado,
      asignado_a:       form.asignado_a || null,
      fecha_reporte:    form.fecha_reporte || null,
      fecha_programada: form.fecha_programada || null,
      fecha_completado: form.estado === "completado" ? (form.fecha_completado || todayISO()) : null,
      costo_estimado:   Number(form.costo_estimado) || 0,
      costo_real:       Number(form.costo_real) || 0,
      notas:            form.notas || null,
      updated_at:       new Date().toISOString(),
    };
    let error;
    if (isEdit) {
      ({ error } = await supabase.from("mantenimiento_ordenes").update(payload).eq("id", orden.id));
    } else {
      ({ error } = await supabase.from("mantenimiento_ordenes").insert({ id: `MNT-${Date.now()}`, ...payload, created_at: new Date().toISOString() }));
    }
    if (error) { alert("Error: " + error.message); setSaving(false); return; }
    onSaved();
    onClose();
  };

  const BadgeToggle = ({ field, options }) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(opt => (
        <button key={opt.key} type="button" onClick={() => set(field, opt.key)}
          style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${form[field] === opt.key ? opt.color : B.navyLight}`, background: form[field] === opt.key ? opt.color + "33" : B.navy, color: form[field] === opt.key ? opt.color : "rgba(255,255,255,0.4)" }}>
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 600, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{isEdit ? "Editar orden" : "Nueva orden de mantenimiento"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Área + Título */}
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Área / Instalación</label>
              <select value={form.area} onChange={e => set("area", e.target.value)} style={IS}>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Título <span style={{ color: "#ef4444" }}>*</span></label>
              <input value={form.titulo} onChange={e => set("titulo", e.target.value)} style={IS} placeholder="Descripción breve del problema o tarea" />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label style={LS}>Descripción detallada</label>
            <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={3}
              style={{ ...IS, resize: "vertical" }} placeholder="Detalla el problema, ubicación exacta, materiales necesarios..." />
          </div>

          {/* Tipo */}
          <div>
            <label style={LS}>Tipo</label>
            <BadgeToggle field="tipo" options={TIPOS} />
          </div>

          {/* Prioridad */}
          <div>
            <label style={LS}>Prioridad</label>
            <BadgeToggle field="prioridad" options={PRIORIDADES} />
          </div>

          {/* Estado */}
          <div>
            <label style={LS}>Estado</label>
            <BadgeToggle field="estado" options={ESTADOS} />
          </div>

          {/* Asignado + Fechas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Asignado a</label>
              <input value={form.asignado_a} onChange={e => set("asignado_a", e.target.value)} style={IS} placeholder="Nombre del responsable" />
            </div>
            <div>
              <label style={LS}>Fecha reporte</label>
              <input type="date" value={form.fecha_reporte} onChange={e => set("fecha_reporte", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Fecha programada</label>
              <input type="date" value={form.fecha_programada} onChange={e => set("fecha_programada", e.target.value)} style={IS} />
            </div>
          </div>

          {/* Costos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Costo estimado (COP)</label>
              <input type="number" value={form.costo_estimado} onChange={e => set("costo_estimado", e.target.value)} style={IS} placeholder="0" />
            </div>
            <div style={{ opacity: form.estado === "completado" ? 1 : 0.5 }}>
              <label style={LS}>Costo real (COP)</label>
              <input type="number" value={form.costo_real} onChange={e => set("costo_real", e.target.value)} style={IS} placeholder="0" />
            </div>
          </div>

          {/* Fecha completado — solo si completado */}
          {form.estado === "completado" && (
            <div style={{ maxWidth: 200 }}>
              <label style={LS}>Fecha completado</label>
              <input type="date" value={form.fecha_completado} onChange={e => set("fecha_completado", e.target.value)} style={IS} />
            </div>
          )}

          {/* Notas */}
          <div>
            <label style={LS}>Notas / Observaciones</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2}
              style={{ ...IS, resize: "vertical" }} placeholder="Materiales usados, proveedor externo, garantía..." />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving || !form.titulo.trim()}
            style={{ flex: 2, padding: 11, background: saving ? B.navyLight : "#0891b2", color: B.white, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer", opacity: !form.titulo.trim() ? 0.5 : 1 }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear orden"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Módulo principal ─────────────────────────────────────────────────────────
export default function Mantenimiento() {
  const [ordenes,   setOrdenes]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null); // null | "new" | orden
  const [filtroArea,    setFiltroArea]    = useState("todas");
  const [filtroTipo,    setFiltroTipo]    = useState("todos");
  const [filtroPrio,    setFiltroPrio]    = useState("todas");

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("mantenimiento_ordenes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    setOrdenes(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const filtered = ordenes.filter(o => {
    if (filtroArea !== "todas" && o.area !== filtroArea) return false;
    if (filtroTipo !== "todos" && o.tipo !== filtroTipo) return false;
    if (filtroPrio !== "todas" && o.prioridad !== filtroPrio) return false;
    return true;
  });

  const byEstado = estado => filtered.filter(o => o.estado === estado);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const pendientes  = ordenes.filter(o => o.estado === "pendiente").length;
  const enProceso   = ordenes.filter(o => o.estado === "en_proceso").length;
  const mesActual   = new Date().toISOString().slice(0, 7);
  const completados = ordenes.filter(o => o.estado === "completado" && (o.fecha_completado || "").startsWith(mesActual)).length;
  const costoMes    = ordenes
    .filter(o => o.estado === "completado" && (o.fecha_completado || "").startsWith(mesActual))
    .reduce((s, o) => s + (o.costo_real || o.costo_estimado || 0), 0);

  const quickEstado = async (o, nuevoEstado) => {
    const patch = { estado: nuevoEstado, updated_at: new Date().toISOString() };
    if (nuevoEstado === "completado") patch.fecha_completado = todayISO();
    await supabase.from("mantenimiento_ordenes").update(patch).eq("id", o.id);
    setOrdenes(prev => prev.map(x => x.id === o.id ? { ...x, ...patch } : x));
  };

  // ── Columna kanban ─────────────────────────────────────────────────────────
  const KanbanCol = ({ estadoKey, label }) => {
    const items = byEstado(estadoKey);
    const col   = estadoColor(estadoKey);
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: col, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
          <span style={{ fontSize: 11, background: col + "22", color: col, borderRadius: 10, padding: "1px 8px", fontWeight: 700 }}>{items.length}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.length === 0 && (
            <div style={{ border: `1.5px dashed ${B.navyLight}`, borderRadius: 10, padding: "20px 14px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              Sin órdenes
            </div>
          )}
          {items.map(o => (
            <OrdenCard key={o.id} orden={o} onEdit={() => setModal(o)} onQuickEstado={quickEstado} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Mantenimiento</h2>
          {!loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        <button onClick={() => setModal("new")}
          style={{ background: "#0891b2", color: B.white, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + Nueva orden
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Pendientes",          val: pendientes,  color: "#f59e0b" },
          { label: "En proceso",          val: enProceso,   color: "#38bdf8" },
          { label: "Completadas este mes",val: completados, color: "#4ade80" },
          { label: "Costo este mes",      val: costoMes > 0 ? COP(costoMes) : "—", color: B.sand },
        ].map(k => (
          <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${k.color}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {/* Área */}
        <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
          style={{ ...IS, width: "auto", fontSize: 12, padding: "7px 12px" }}>
          <option value="todas">Todas las áreas</option>
          {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {/* Tipo */}
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          style={{ ...IS, width: "auto", fontSize: 12, padding: "7px 12px" }}>
          <option value="todos">Todos los tipos</option>
          {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {/* Prioridad */}
        <select value={filtroPrio} onChange={e => setFiltroPrio(e.target.value)}
          style={{ ...IS, width: "auto", fontSize: 12, padding: "7px 12px" }}>
          <option value="todas">Todas las prioridades</option>
          {PRIORIDADES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {(filtroArea !== "todas" || filtroTipo !== "todos" || filtroPrio !== "todas") && (
          <button onClick={() => { setFiltroArea("todas"); setFiltroTipo("todos"); setFiltroPrio("todas"); }}
            style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>
            ✕ Limpiar filtros
          </button>
        )}
      </div>

      {/* Kanban */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          <KanbanCol estadoKey="pendiente"  label="Pendiente" />
          <KanbanCol estadoKey="en_proceso" label="En proceso" />
          <KanbanCol estadoKey="completado" label="Completado" />
        </div>
      )}

      {modal && (
        <OrdenModal
          orden={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
function OrdenCard({ orden: o, onEdit, onQuickEstado }) {
  const pColor = prioridadColor(o.prioridad);
  const tColor = tipoColor(o.tipo);

  const nextEstado = o.estado === "pendiente" ? "en_proceso" : o.estado === "en_proceso" ? "completado" : null;
  const nextLabel  = nextEstado === "en_proceso" ? "▶ Iniciar" : nextEstado === "completado" ? "✓ Completar" : null;

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", borderLeft: `3px solid ${pColor}`, cursor: "pointer" }}
      onClick={onEdit}
      onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
      onMouseLeave={e => e.currentTarget.style.opacity = "1"}>

      {/* Badges */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: tColor + "22", color: tColor, fontWeight: 600 }}>
          {tipoLabel(o.tipo)}
        </span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: pColor + "22", color: pColor, fontWeight: 600 }}>
          {prioLabel(o.prioridad)}
        </span>
      </div>

      {/* Área */}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        📍 {o.area}
      </div>

      {/* Título */}
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>{o.titulo}</div>

      {/* Meta */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
        {o.asignado_a && <div>👤 {o.asignado_a}</div>}
        {o.fecha_programada && <div>📅 {fmtFecha(o.fecha_programada)}</div>}
        {o.costo_estimado > 0 && <div>💰 Est: {COP(o.costo_estimado)}</div>}
        {o.estado === "completado" && o.costo_real > 0 && <div style={{ color: "#4ade80" }}>✓ Real: {COP(o.costo_real)}</div>}
      </div>

      {/* Avanzar estado rápido */}
      {nextEstado && (
        <button
          onClick={e => { e.stopPropagation(); onQuickEstado(o, nextEstado); }}
          style={{ width: "100%", padding: "6px", borderRadius: 7, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: nextEstado === "completado" ? "#4ade8022" : "#38bdf822",
            color:      nextEstado === "completado" ? "#4ade80"   : "#38bdf8" }}>
          {nextLabel}
        </button>
      )}
    </div>
  );
}
