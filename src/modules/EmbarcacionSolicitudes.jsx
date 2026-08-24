// EmbarcacionSolicitudes.jsx — Módulo transaccional: solicitudes de servicios de embarcación
// Cualquier área solicita (pasadías, huéspedes, venta cliente, staff, compras, evento).
// Operaciones asigna embarcación + capitán + costo y avanza el estado.
// Sin flujo de aprobación — solicitada → asignada → en_curso → completada/cancelada.

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive.js";
import { logAccion } from "../lib/logAccion";

// ── Config ────────────────────────────────────────────────────────────────
const TIPOS_USO = [
  { key: "pasadias",       label: "Pasadías",          icon: "☀", color: "#F59E0B" },
  { key: "huespedes",      label: "Huéspedes Hotel",   icon: "🏨", color: "#A855F7" },
  { key: "venta_cliente",  label: "Venta a Cliente",   icon: "💰", color: "#10B981" },
  { key: "evento",         label: "Evento / Grupo",    icon: "🎉", color: "#EC4899" },
  { key: "staff",          label: "Transporte Staff",  icon: "👷", color: "#38BDF8" },
  { key: "compras",        label: "Transporte Compras", icon: "📦", color: "#FB923C" },
  { key: "otro",           label: "Otro",              icon: "📋", color: "#94A3B8" },
];
const tipoMeta = (k) => TIPOS_USO.find(t => t.key === k) || TIPOS_USO[6];

const ESTADOS = [
  { key: "solicitada",  label: "Solicitada", color: "#F5C842" },
  { key: "asignada",    label: "Asignada",   color: "#38BDF8" },
  { key: "en_curso",    label: "En curso",   color: "#A855F7" },
  { key: "completada",  label: "Completada", color: "#10B981" },
  { key: "cancelada",   label: "Cancelada",  color: "#EF4444" },
];
const estadoMeta = (k) => ESTADOS.find(e => e.key === k) || ESTADOS[0];

const PRIORIDADES = [
  { key: "baja",     label: "Baja",     color: "#94A3B8" },
  { key: "normal",   label: "Normal",   color: "#38BDF8" },
  { key: "alta",     label: "Alta",     color: "#F59E0B" },
  { key: "urgente",  label: "Urgente",  color: "#EF4444" },
];
const prioMeta = (k) => PRIORIDADES.find(p => p.key === k) || PRIORIDADES[1];

const RUTAS_COMUNES = [
  "Cartagena → Atolón",
  "Atolón → Cartagena",
  "Cartagena → Atolón → Cartagena",
  "Atolón → Cartagena → Atolón",
  "Atolón → Isla del Rosario",
  "Muelle Castillete → Atolón",
  "Atolón → Muelle Castillete",
  "Otro",
];

const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

// ── Estilos base ───────────────────────────────────────────────────────────
const IS = { width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };
const BTN = (bg, color = "#fff") => ({ padding: "10px 18px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 13, minHeight: 40 });
const CHIP = (bg, fg) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 12, background: bg, color: fg, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" });

// ══════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════
export default function EmbarcacionSolicitudes() {
  const { isMobile } = useBreakpoint();
  const [rows, setRows] = useState([]);
  const [embarcaciones, setEmbarcaciones] = useState([]);   // maestro: propias + rentadas
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("activas"); // activas | todas | <estado>
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [modalNueva, setModalNueva] = useState(false);
  const [gestion, setGestion] = useState(null);
  const [modalEmbarcacion, setModalEmbarcacion] = useState(null); // { row: emb } o { row: null } para nueva
  const [verEmbarcaciones, setVerEmbarcaciones] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    const [{ data: sess }, { data: solRows }, { data: embRows }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("embarcacion_solicitudes").select("*").gte("fecha_servicio", filtroFechaDesde).order("fecha_servicio", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("embarcaciones").select("*").order("nombre"),
    ]);
    setUser(sess?.user || null);
    setRows(solRows || []);
    setEmbarcaciones(embRows || []);
    setLoading(false);
  }, [filtroFechaDesde]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtered = useMemo(() => {
    let r = rows;
    if (filtroEstado === "activas") r = r.filter(x => !["completada", "cancelada"].includes(x.estado));
    else if (filtroEstado !== "todas") r = r.filter(x => x.estado === filtroEstado);
    if (filtroTipo !== "todos") r = r.filter(x => x.tipo_uso === filtroTipo);
    return r;
  }, [rows, filtroEstado, filtroTipo]);

  // KPIs
  const kpi = useMemo(() => {
    const pendientes = rows.filter(x => x.estado === "solicitada").length;
    const enCurso = rows.filter(x => ["asignada", "en_curso"].includes(x.estado)).length;
    const completadasMes = rows.filter(x => x.estado === "completada").length;
    const costoReal = rows.filter(x => x.estado === "completada").reduce((s, r) => s + Number(r.costo_real || 0), 0);
    return { pendientes, enCurso, completadasMes, costoReal };
  }, [rows]);

  return (
    <div style={{ padding: isMobile ? 16 : 24, fontFamily: "'Inter','Segoe UI',sans-serif", color: B.text, minHeight: "100vh", background: B.navy }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: B.sand, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Operaciones</div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 24 : 32, fontWeight: 800, color: B.white, margin: 0, letterSpacing: "0.02em" }}>
            ⛵ EMBARCACIONES
          </h2>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
            Solicitudes de servicios de embarcación (rentadas y flota propia)
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setVerEmbarcaciones(true)}
            style={{ ...BTN("rgba(255,255,255,0.08)", "#fff"), fontSize: 13 }}>
            ⛵ Embarcaciones Rentadas
          </button>
          <button onClick={() => setModalNueva(true)}
            style={{ ...BTN("#10B981"), fontSize: 14, padding: "12px 22px" }}>
            + Nueva Solicitud
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <Kpi label="Pendientes" value={kpi.pendientes} color="#F5C842" hint="Sin asignar embarcación" />
        <Kpi label="En Progreso" value={kpi.enCurso} color="#38BDF8" hint="Asignadas o en curso" />
        <Kpi label="Completadas" value={kpi.completadasMes} color="#10B981" hint="En el período" />
        <Kpi label="Costo Real" value={COP(kpi.costoReal)} color="#A855F7" hint="Sumatoria completadas" />
      </div>

      {/* Filtros */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 20, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <div>
            <label style={LS}>Estado</label>
            <select style={IS} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              <option value="activas">Activas</option>
              <option value="todas">Todas</option>
              {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <label style={LS}>Tipo de uso</label>
            <select style={IS} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="todos">Todos</option>
              {TIPOS_USO.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={LS}>Desde</label>
            <input type="date" style={IS} value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Lista / cards */}
      {loading && <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Cargando…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)", background: B.navyMid, borderRadius: 12, border: `1px dashed ${B.navyLight}` }}>
          Sin solicitudes en este filtro. Crea la primera con el botón <strong style={{ color: "#10B981" }}>+ Nueva Solicitud</strong>.
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(360px, 1fr))", gap: 14 }}>
          {filtered.map(s => (
            <SolicitudCard key={s.id} row={s} onOpen={() => setGestion(s)} />
          ))}
        </div>
      )}

      {/* Modales */}
      {modalNueva && (
        <SolicitudModal
          user={user}
          onClose={() => setModalNueva(false)}
          onSaved={() => { setModalNueva(false); cargar(); }}
        />
      )}
      {gestion && (
        <GestionModal
          row={gestion}
          embarcaciones={embarcaciones}
          user={user}
          onClose={() => setGestion(null)}
          onSaved={() => { setGestion(null); cargar(); }}
          onEditarEmbarcacion={(e) => setModalEmbarcacion({ row: e })}
          onNuevaEmbarcacion={() => setModalEmbarcacion({ row: null })}
        />
      )}
      {verEmbarcaciones && (
        <ListaEmbarcacionesRentadasModal
          embarcaciones={embarcaciones}
          onClose={() => setVerEmbarcaciones(false)}
          onNuevo={() => { setVerEmbarcaciones(false); setModalEmbarcacion({ row: null }); }}
          onEditar={(e) => { setVerEmbarcaciones(false); setModalEmbarcacion({ row: e }); }}
        />
      )}
      {modalEmbarcacion && (
        <EmbarcacionModal
          row={modalEmbarcacion.row}
          user={user}
          onClose={() => setModalEmbarcacion(null)}
          onSaved={() => { setModalEmbarcacion(null); cargar(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// KPI card
// ══════════════════════════════════════════════════════════════════════════
function Kpi({ label, value, color, hint }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "18px 22px", border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, marginTop: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Card por solicitud
// ══════════════════════════════════════════════════════════════════════════
function SolicitudCard({ row, onOpen }) {
  const tp = tipoMeta(row.tipo_uso);
  const est = estadoMeta(row.estado);
  const prio = prioMeta(row.prioridad);
  return (
    <div onClick={onOpen} style={{
      background: B.navyMid, borderRadius: 12, padding: 18, cursor: "pointer",
      border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${est.color}`,
      transition: "transform 0.1s, box-shadow 0.15s",
    }} onMouseEnter={e => e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.25)`}
        onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, letterSpacing: 1 }}>{row.codigo || "—"}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginTop: 2 }}>
            {tp.icon} {tp.label}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <span style={CHIP(est.color + "33", est.color)}>{est.label}</span>
          {row.prioridad !== "normal" && <span style={CHIP(prio.color + "33", prio.color)}>{prio.label}</span>}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
        <div>📅 <strong style={{ color: "#fff" }}>{row.fecha_servicio}</strong> {row.hora_servicio && `· ${row.hora_servicio.slice(0, 5)}`}</div>
        {row.ruta && <div>🗺 {row.ruta}</div>}
        {row.pax != null && row.pax > 0 && <div>👥 {row.pax} pax</div>}
        {row.carga_desc && <div>📦 {row.carga_desc}</div>}
        {row.embarcacion_nombre && <div>⛵ <strong style={{ color: "#fff" }}>{row.embarcacion_nombre}</strong>{row.capitan && ` · ${row.capitan}`}</div>}
        {row.proveedor_externo && !row.embarcacion_nombre && <div>🏢 {row.proveedor_externo}</div>}
        {row.costo_real > 0 && <div>💰 <strong style={{ color: "#fff" }}>{COP(row.costo_real)}</strong>{row.pago_id && <span style={{ marginLeft: 8, ...CHIP("#10B98133", "#10B981"), fontSize: 9 }}>✓ En Pagos</span>}</div>}
        {row.estado === "completada" && !row.pago_id && <div style={{ color: "#F5C842", fontSize: 11, marginTop: 4 }}>⚠ Falta registrar cuenta de cobro</div>}
        {row.solicitante_nombre && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>Solicitado por {row.solicitante_nombre}</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Modal crear solicitud
// ══════════════════════════════════════════════════════════════════════════
function SolicitudModal({ user, onClose, onSaved }) {
  const { isMobile } = useBreakpoint();
  const [form, setForm] = useState({
    tipo_uso: "pasadias",
    fecha_servicio: new Date().toISOString().slice(0, 10),
    hora_servicio: "",
    ruta: RUTAS_COMUNES[0],
    origen: "", destino: "",
    pax: "",
    carga_desc: "",
    prioridad: "normal",
    cliente_nombre: "",
    notas: "",
    referencia_evento_id: "",
    referencia_reserva_id: "",
    referencia_requisicion_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function guardar() {
    if (!form.fecha_servicio) return setErr("Fecha del servicio es obligatoria");
    if (!form.tipo_uso) return setErr("Selecciona el tipo de uso");
    if (form.tipo_uso === "compras" && !form.carga_desc.trim()) return setErr("Describe la carga a transportar");
    setSaving(true); setErr(null);
    const payload = {
      ...form,
      pax: form.pax === "" ? null : Number(form.pax),
      hora_servicio: form.hora_servicio || null,
      cliente_nombre: form.cliente_nombre || null,
      carga_desc: form.carga_desc || null,
      referencia_evento_id: form.referencia_evento_id || null,
      referencia_reserva_id: form.referencia_reserva_id || null,
      referencia_requisicion_id: form.referencia_requisicion_id || null,
      solicitante_id: user?.id || null,
      solicitante_nombre: user?.user_metadata?.nombre || user?.email || "—",
      area: user?.user_metadata?.area || null,
    };
    const { data, error } = await supabase.from("embarcacion_solicitudes").insert(payload).select().single();
    if (error) { setErr(error.message); setSaving(false); return; }
    logAccion({ modulo: "embarcaciones", accion: "crear", tabla: "embarcacion_solicitudes", registroId: data.id, datosDespues: { codigo: data.codigo, tipo_uso: data.tipo_uso } });
    setSaving(false);
    onSaved();
  }

  return (
    <div onClick={onClose} style={modalBg}>
      <div onClick={e => e.stopPropagation()} style={modalBox(isMobile)}>
        <div style={modalHead}>
          <h3 style={{ margin: 0, color: "#fff" }}>➕ Nueva Solicitud de Embarcación</h3>
          <button onClick={onClose} style={btnClose}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Tipo de uso *</label>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 6 }}>
              {TIPOS_USO.map(t => (
                <button key={t.key} onClick={() => set("tipo_uso", t.key)}
                  style={{
                    padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                    background: form.tipo_uso === t.key ? t.color : B.navy,
                    color: form.tipo_uso === t.key ? "#fff" : "rgba(255,255,255,0.7)",
                    border: `1px solid ${form.tipo_uso === t.key ? t.color : B.navyLight}`,
                    fontSize: 11, fontWeight: 700, textAlign: "left",
                  }}>
                  <div>{t.icon} {t.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Fecha *</label>
              <input type="date" style={IS} value={form.fecha_servicio} onChange={e => set("fecha_servicio", e.target.value)} />
            </div>
            <div>
              <label style={LS}>Hora (opcional)</label>
              <input type="time" style={IS} value={form.hora_servicio} onChange={e => set("hora_servicio", e.target.value)} />
            </div>
          </div>

          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Ruta / Trayecto</label>
              <select style={IS} value={form.ruta} onChange={e => set("ruta", e.target.value)}>
                {RUTAS_COMUNES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Prioridad</label>
              <select style={IS} value={form.prioridad} onChange={e => set("prioridad", e.target.value)}>
                {PRIORIDADES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {(form.tipo_uso !== "compras") && (
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Pasajeros (pax)</label>
              <input type="number" min="0" style={IS} value={form.pax} onChange={e => set("pax", e.target.value)} placeholder="Ej: 12" />
            </div>
          )}

          {(form.tipo_uso === "compras" || form.tipo_uso === "otro") && (
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Carga a transportar {form.tipo_uso === "compras" ? "*" : ""}</label>
              <input style={IS} value={form.carga_desc} onChange={e => set("carga_desc", e.target.value)}
                placeholder="Ej: 20 cajas de bebidas, 5 sacos de arroz, muebles…" />
            </div>
          )}

          {(form.tipo_uso === "venta_cliente" || form.tipo_uso === "evento") && (
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Cliente / Nombre del grupo</label>
              <input style={IS} value={form.cliente_nombre} onChange={e => set("cliente_nombre", e.target.value)}
                placeholder="Nombre del cliente o del evento" />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Notas</label>
            <textarea rows={3} style={{ ...IS, resize: "vertical", fontFamily: "inherit" }}
              value={form.notas} onChange={e => set("notas", e.target.value)}
              placeholder="Contexto adicional, requisitos especiales, etc." />
          </div>

          <details style={{ marginBottom: 14 }}>
            <summary style={{ color: B.sand, fontSize: 12, cursor: "pointer", padding: "6px 0" }}>▸ Referencias opcionales</summary>
            <div style={{ marginTop: 10 }}>
              <label style={LS}>ID Evento</label>
              <input style={IS} value={form.referencia_evento_id} onChange={e => set("referencia_evento_id", e.target.value)} placeholder="EVT-… / GRP-…" />
              <div style={{ height: 10 }} />
              <label style={LS}>ID Reserva</label>
              <input style={IS} value={form.referencia_reserva_id} onChange={e => set("referencia_reserva_id", e.target.value)} placeholder="R-… / WEB-…" />
              <div style={{ height: 10 }} />
              <label style={LS}>ID Requisición</label>
              <input style={IS} value={form.referencia_requisicion_id} onChange={e => set("referencia_requisicion_id", e.target.value)} placeholder="REQ-…" />
            </div>
          </details>

          {err && <div style={{ color: "#EF4444", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        </div>
        <div style={modalFoot}>
          <button onClick={onClose} style={BTN("rgba(255,255,255,0.08)")}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ ...BTN("#10B981"), opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "Crear Solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Modal gestión (asignar / avanzar estado / completar)
// ══════════════════════════════════════════════════════════════════════════
function GestionModal({ row, embarcaciones, user, onClose, onSaved, onEditarEmbarcacion, onNuevaEmbarcacion }) {
  const { isMobile } = useBreakpoint();
  const [form, setForm] = useState({
    embarcacion_id: row.embarcacion_id || "",
    capitan: row.capitan || "",
    capitan_tel: row.capitan_tel || "",
    costo_estimado: row.costo_estimado || "",
    costo_real: row.costo_real || "",
    cobrado_a: row.cobrado_a || "",
    notas_op: row.notas || "",
    cuenta_cobro_numero: row.cuenta_cobro_numero || "",
    cuenta_cobro_fecha: row.cuenta_cobro_fecha || new Date().toISOString().slice(0, 10),
    cuenta_cobro_vencimiento: row.cuenta_cobro_vencimiento || "",
    factura_url: row.factura_url || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const tp = tipoMeta(row.tipo_uso);
  const est = estadoMeta(row.estado);
  const embMap = new Map(embarcaciones.map(e => [e.id, e]));

  async function actualizar(patch, accion) {
    setSaving(true); setErr(null);
    const { error } = await supabase.from("embarcacion_solicitudes").update(patch).eq("id", row.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    logAccion({ modulo: "embarcaciones", accion, tabla: "embarcacion_solicitudes", registroId: row.id, datosDespues: { codigo: row.codigo, ...patch } });
    setSaving(false);
    onSaved();
  }

  async function asignar() {
    if (!form.embarcacion_id) return setErr("Elige una embarcación rentada. Si no está registrada, créala con el botón + al lado del selector.");
    const emb = embMap.get(form.embarcacion_id);
    await actualizar({
      estado: "asignada",
      embarcacion_id: form.embarcacion_id,
      embarcacion_nombre: emb?.nombre || null,
      proveedor_externo: (emb?.propiedad === "rentada" ? (emb?.propietario_nombre || null) : null),
      capitan: form.capitan || emb?.capitan || null,
      capitan_tel: form.capitan_tel || emb?.piloto_celular || emb?.propietario_telefono || null,
      costo_estimado: form.costo_estimado === "" ? null : Number(form.costo_estimado),
      cobrado_a: form.cobrado_a || null,
      asignado_por: user?.id || null,
      asignado_por_nombre: user?.user_metadata?.nombre || user?.email || null,
      asignado_at: new Date().toISOString(),
    }, "asignar");
  }

  async function iniciar() {
    await actualizar({ estado: "en_curso", iniciado_at: new Date().toISOString() }, "iniciar");
  }

  async function completar() {
    if (form.costo_real === "" || form.costo_real === null) return setErr("Registra el costo real antes de completar");
    await actualizar({
      estado: "completada",
      costo_real: Number(form.costo_real),
      completada_at: new Date().toISOString(),
    }, "completar");
  }

  async function cancelar() {
    const motivo = prompt("Motivo de cancelación:");
    if (!motivo) return;
    await actualizar({ estado: "cancelada", cancelada_at: new Date().toISOString(), motivo_cancelacion: motivo }, "cancelar");
  }

  async function reabrir() {
    if (!confirm("¿Reabrir esta solicitud a estado 'solicitada'?")) return;
    await actualizar({ estado: "solicitada", cancelada_at: null, completada_at: null, motivo_cancelacion: null }, "reabrir");
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar definitivamente la solicitud ${row.codigo}? Esta acción no se puede deshacer.`)) return;
    if (row.pago_id) {
      if (!confirm("⚠ Esta solicitud tiene una cuenta de cobro registrada en Pagos. Al eliminar la solicitud NO se borra el pago (queda huérfano). ¿Continuar?")) return;
    }
    setSaving(true); setErr(null);
    const { error } = await supabase.from("embarcacion_solicitudes").delete().eq("id", row.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    logAccion({ modulo: "embarcaciones", accion: "eliminar", tabla: "embarcacion_solicitudes", registroId: row.id, datosAntes: { codigo: row.codigo } });
    setSaving(false);
    onSaved();
  }

  async function registrarCuentaCobro() {
    if (!form.cuenta_cobro_numero.trim()) return setErr("Número de cuenta de cobro obligatorio");
    if (!form.cuenta_cobro_fecha) return setErr("Fecha de emisión obligatoria");
    if (!row.costo_real || row.costo_real <= 0) return setErr("La solicitud no tiene costo real registrado");
    setSaving(true); setErr(null);
    try {
      const pagoId = `PO_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const proveedor = row.proveedor_externo || (row.embarcacion_nombre ? `${row.embarcacion_nombre} (flota)` : "—");
      const conceptoTipo = tp.label;
      const pagoPayload = {
        id: pagoId,
        fecha: form.cuenta_cobro_fecha,
        fecha_vencimiento: form.cuenta_cobro_vencimiento || null,
        concepto: `Servicio embarcación · ${conceptoTipo} · ${row.codigo}${row.ruta ? " · " + row.ruta : ""}`,
        categoria: "transporte-embarcacion",
        proveedor,
        monto: Number(row.costo_real),
        moneda: "COP",
        referencia: form.cuenta_cobro_numero.trim(),
        comprobante_url: form.factura_url || null,
        pagado: false,
        notas: `Solicitud ${row.codigo} · ${row.fecha_servicio}${row.pax ? " · " + row.pax + " pax" : ""}${row.cliente_nombre ? " · " + row.cliente_nombre : ""}`,
        created_by: user?.email || null,
      };
      const { error: pagoErr } = await supabase.from("pagos_otros").insert(pagoPayload);
      if (pagoErr) throw pagoErr;

      const { error: updErr } = await supabase.from("embarcacion_solicitudes").update({
        cuenta_cobro_numero: form.cuenta_cobro_numero.trim(),
        cuenta_cobro_fecha: form.cuenta_cobro_fecha,
        cuenta_cobro_vencimiento: form.cuenta_cobro_vencimiento || null,
        factura_url: form.factura_url || null,
        pago_id: pagoId,
        registrada_pago_at: new Date().toISOString(),
      }).eq("id", row.id);
      if (updErr) throw updErr;

      logAccion({ modulo: "embarcaciones", accion: "registrar_cuenta_cobro", tabla: "embarcacion_solicitudes", registroId: row.id,
        datosDespues: { pago_id: pagoId, monto: row.costo_real, cuenta_cobro_numero: form.cuenta_cobro_numero } });
      logAccion({ modulo: "pagos", accion: "crear_gasto", tabla: "pagos_otros", registroId: pagoId,
        datosDespues: { concepto: pagoPayload.concepto, monto: pagoPayload.monto, proveedor },
        notas: `Auto-generado desde solicitud embarcación ${row.codigo}` });

      setSaving(false);
      onSaved();
    } catch (e) {
      setErr(e.message || String(e));
      setSaving(false);
    }
  }

  const puedeAsignar   = row.estado === "solicitada";
  const puedeIniciar   = row.estado === "asignada";
  const puedeCompletar = ["asignada", "en_curso"].includes(row.estado);
  const puedeCancelar  = !["completada", "cancelada"].includes(row.estado);
  const puedeReabrir   = ["completada", "cancelada"].includes(row.estado);
  const puedeCuentaCobro = row.estado === "completada" && !row.pago_id;
  const tieneCuentaCobro = !!row.pago_id;

  return (
    <div onClick={onClose} style={modalBg}>
      <div onClick={e => e.stopPropagation()} style={modalBox(isMobile)}>
        <div style={{ ...modalHead, background: est.color + "22" }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, fontWeight: 700 }}>{row.codigo}</div>
            <h3 style={{ margin: 0, color: "#fff" }}>{tp.icon} {tp.label}</h3>
          </div>
          <span style={{ ...CHIP(est.color, "#fff"), fontSize: 12, padding: "5px 14px" }}>{est.label}</span>
          <button onClick={onClose} style={btnClose}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {/* Detalles inmutables */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.8 }}>
            <div>📅 <strong>{row.fecha_servicio}</strong> {row.hora_servicio && `· ${row.hora_servicio.slice(0, 5)}`}</div>
            {row.ruta && <div>🗺 {row.ruta}</div>}
            {row.pax != null && row.pax > 0 && <div>👥 {row.pax} pax</div>}
            {row.carga_desc && <div>📦 {row.carga_desc}</div>}
            {row.cliente_nombre && <div>👤 Cliente: <strong>{row.cliente_nombre}</strong></div>}
            {row.prioridad !== "normal" && <div>⚠ Prioridad: <strong style={{ color: prioMeta(row.prioridad).color }}>{prioMeta(row.prioridad).label}</strong></div>}
            {row.solicitante_nombre && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Solicitado por {row.solicitante_nombre}{row.created_at && ` · ${new Date(row.created_at).toLocaleString("es-CO")}`}</div>}
            {row.notas && <div style={{ marginTop: 8, padding: 8, background: B.navy, borderRadius: 6, fontSize: 12 }}>📝 {row.notas}</div>}
            {(row.referencia_evento_id || row.referencia_reserva_id || row.referencia_requisicion_id) && (
              <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                Refs: {[row.referencia_evento_id, row.referencia_reserva_id, row.referencia_requisicion_id].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>

          {/* Sección asignación (siempre visible pero deshabilitada según estado) */}
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>⛵ Asignación</div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Embarcación rentada</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select style={{ ...IS, flex: 1 }} value={form.embarcacion_id}
                onChange={e => set("embarcacion_id", e.target.value)}>
                <option value="">— Selecciona una —</option>
                {embarcaciones.filter(e => e.propiedad === "rentada" && e.estado !== "inactivo").map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}{e.propietario_nombre ? ` · ${e.propietario_nombre}` : ""} · cap {e.capacidad || "?"}</option>
                ))}
              </select>
              <button onClick={onNuevaEmbarcacion} title="Registrar nueva embarcación rentada"
                style={{ padding: "0 14px", borderRadius: 8, border: "none", background: "#10B981", color: "#fff", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>+</button>
              {form.embarcacion_id && (
                <button onClick={() => onEditarEmbarcacion(embMap.get(form.embarcacion_id))} title="Editar / completar datos"
                  style={{ padding: "0 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "#fff", fontSize: 14, cursor: "pointer" }}>✎</button>
              )}
            </div>
          </div>

          {/* Card con datos de la embarcación seleccionada (si es rentada) */}
          {form.embarcacion_id && (() => {
            const e = embMap.get(form.embarcacion_id);
            if (!e || e.propiedad !== "rentada") return null;
            const faltantes = [];
            if (!e.propietario_nombre) faltantes.push("propietario");
            if (!e.propietario_documento) faltantes.push("NIT/CC");
            if (!e.banco || !e.cuenta_numero) faltantes.push("cuenta bancaria");
            if (!e.rut_url) faltantes.push("RUT");
            if (!e.certificacion_bancaria_url) faltantes.push("cert. bancaria");
            return (
              <div style={{ marginBottom: 14, padding: 12, background: "rgba(56,189,248,0.08)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 1.6, borderLeft: `3px solid #38BDF8` }}>
                <div>👤 <strong>{e.propietario_nombre || <span style={{ color: "#94A3B8" }}>(sin propietario)</span>}</strong>{e.propietario_documento && ` · ${e.propietario_documento}`}</div>
                {(e.banco || e.cuenta_numero) && <div>🏦 {e.banco || "—"} · {e.cuenta_tipo || ""} {e.cuenta_numero || ""}</div>}
                <div style={{ marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>📄 RUT: {e.rut_url ? <a href={e.rut_url} target="_blank" rel="noopener" style={{ color: "#38BDF8" }}>ver</a> : <span style={{ color: "#94A3B8" }}>—</span>}</span>
                  <span>🏦 Cert. bancaria: {e.certificacion_bancaria_url ? <a href={e.certificacion_bancaria_url} target="_blank" rel="noopener" style={{ color: "#38BDF8" }}>ver</a> : <span style={{ color: "#94A3B8" }}>—</span>}</span>
                </div>
                {faltantes.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#F59E0B" }}>
                    💡 Datos faltantes: {faltantes.join(", ")}. <button onClick={() => onEditarEmbarcacion(e)} style={{ background: "transparent", border: "none", color: "#38BDF8", cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 11 }}>completar ahora</button> (opcional — la solicitud puede zarpar sin estos datos).
                  </div>
                )}
              </div>
            );
          })()}
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Capitán</label>
              <input style={IS} value={form.capitan} onChange={e => set("capitan", e.target.value)} />
            </div>
            <div>
              <label style={LS}>Teléfono capitán</label>
              <input style={IS} value={form.capitan_tel} onChange={e => set("capitan_tel", e.target.value)} />
            </div>
          </div>
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Costo estimado</label>
              <input type="number" min="0" style={IS} value={form.costo_estimado} onChange={e => set("costo_estimado", e.target.value)} />
            </div>
            <div>
              <label style={LS}>Cobrado a</label>
              <select style={IS} value={form.cobrado_a} onChange={e => set("cobrado_a", e.target.value)}>
                <option value="">—</option>
                <option value="cliente">Cliente (venta)</option>
                <option value="hotel">Hotel</option>
                <option value="operaciones">Operaciones</option>
                <option value="compras">Compras / Bodega</option>
                <option value="rh">RH / Personal</option>
                <option value="cortesia">Cortesía (sin cobro)</option>
              </select>
            </div>
          </div>

          {puedeCompletar && (
            <div style={{ marginTop: 14 }}>
              <label style={LS}>💰 Costo real (al completar) *</label>
              <input type="number" min="0" style={IS} value={form.costo_real} onChange={e => set("costo_real", e.target.value)} />
            </div>
          )}

          {row.motivo_cancelacion && (
            <div style={{ marginTop: 14, padding: 10, background: "#EF444422", borderRadius: 8, fontSize: 13, color: "#EF4444" }}>
              ⚠ Cancelada: {row.motivo_cancelacion}
            </div>
          )}

          {/* Cuenta de cobro — visible cuando está completada */}
          {(puedeCuentaCobro || tieneCuentaCobro) && (
            <div style={{ marginTop: 20, padding: 14, background: tieneCuentaCobro ? "#10B98122" : "rgba(245,200,66,0.08)", borderRadius: 10, border: `1px solid ${tieneCuentaCobro ? "#10B98155" : "rgba(245,200,66,0.3)"}` }}>
              <div style={{ fontSize: 11, color: tieneCuentaCobro ? "#10B981" : B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>
                {tieneCuentaCobro ? "✓ Cuenta de Cobro Registrada" : "💳 Registrar Cuenta de Cobro"}
              </div>
              {tieneCuentaCobro ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.7 }}>
                  <div>N°: <strong style={{ color: "#fff" }}>{row.cuenta_cobro_numero}</strong></div>
                  <div>Emitida: <strong style={{ color: "#fff" }}>{row.cuenta_cobro_fecha}</strong>{row.cuenta_cobro_vencimiento && ` · vence ${row.cuenta_cobro_vencimiento}`}</div>
                  <div>Monto: <strong style={{ color: "#10B981" }}>{COP(row.costo_real)}</strong></div>
                  {row.factura_url && <div>📎 <a href={row.factura_url} target="_blank" rel="noopener" style={{ color: "#38BDF8" }}>Ver factura</a></div>}
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
                    Registrada en Pagos como <strong>Por Pagar</strong> · ref {row.pago_id}
                  </div>
                </div>
              ) : (
                <>
                  <div style={grid2(isMobile)}>
                    <div>
                      <label style={LS}>N° cuenta de cobro / factura *</label>
                      <input style={IS} value={form.cuenta_cobro_numero} onChange={e => set("cuenta_cobro_numero", e.target.value)} placeholder="Ej: FE-1234" />
                    </div>
                    <div>
                      <label style={LS}>Fecha emisión *</label>
                      <input type="date" style={IS} value={form.cuenta_cobro_fecha} onChange={e => set("cuenta_cobro_fecha", e.target.value)} />
                    </div>
                  </div>
                  <div style={grid2(isMobile)}>
                    <div>
                      <label style={LS}>Fecha vencimiento</label>
                      <input type="date" style={IS} value={form.cuenta_cobro_vencimiento} onChange={e => set("cuenta_cobro_vencimiento", e.target.value)} />
                    </div>
                    <div>
                      <label style={LS}>URL factura (Drive, etc.)</label>
                      <input style={IS} value={form.factura_url} onChange={e => set("factura_url", e.target.value)} placeholder="https://..." />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                    💡 Monto: <strong style={{ color: "#fff" }}>{COP(row.costo_real)}</strong> · proveedor: <strong>{row.proveedor_externo || row.embarcacion_nombre || "—"}</strong>
                    <br />Al registrar aparecerá en <strong>Pagos → Por Pagar</strong>.
                  </div>
                  <button onClick={registrarCuentaCobro} disabled={saving}
                    style={{ ...BTN("#F5C842", "#0a1628"), marginTop: 12, opacity: saving ? 0.6 : 1 }}>
                    {saving ? "Registrando…" : "💳 Registrar cuenta de cobro"}
                  </button>
                </>
              )}
            </div>
          )}

          {err && <div style={{ color: "#EF4444", fontSize: 13, marginTop: 12 }}>{err}</div>}
        </div>

        <div style={{ ...modalFoot, flexWrap: "wrap" }}>
          <button onClick={eliminar} disabled={saving} title="Eliminar definitivamente"
            style={{ ...BTN("transparent", "#EF4444"), border: `1px solid ${"#EF444455"}`, opacity: saving ? 0.6 : 1 }}>
            🗑 Eliminar
          </button>
          {puedeReabrir && <button onClick={reabrir} style={BTN("rgba(255,255,255,0.08)")}>↻ Reabrir</button>}
          {puedeCancelar && <button onClick={cancelar} style={BTN("#EF444433", "#EF4444")}>✗ Cancelar</button>}
          <div style={{ flex: 1 }} />
          {puedeAsignar && <button onClick={asignar} disabled={saving} style={{ ...BTN("#38BDF8"), opacity: saving ? 0.6 : 1 }}>{saving ? "…" : "→ Asignar"}</button>}
          {puedeIniciar && <button onClick={iniciar} disabled={saving} style={{ ...BTN("#A855F7"), opacity: saving ? 0.6 : 1 }}>{saving ? "…" : "→ Iniciar"}</button>}
          {puedeCompletar && <button onClick={completar} disabled={saving} style={{ ...BTN("#10B981"), opacity: saving ? 0.6 : 1 }}>{saving ? "…" : "✓ Completar"}</button>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Lista de embarcaciones rentadas del maestro
// ══════════════════════════════════════════════════════════════════════════
function ListaEmbarcacionesRentadasModal({ embarcaciones, onClose, onNuevo, onEditar }) {
  const { isMobile } = useBreakpoint();
  const [busca, setBusca] = useState("");
  const rentadas = embarcaciones.filter(e => e.propiedad === "rentada");
  const list = rentadas.filter(e => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return [e.nombre, e.propietario_nombre, e.propietario_documento, e.capitan].filter(Boolean).some(x => x.toLowerCase().includes(q));
  });
  return (
    <div onClick={onClose} style={modalBg}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalBox(isMobile), maxWidth: 800 }}>
        <div style={modalHead}>
          <h3 style={{ margin: 0, color: "#fff" }}>⛵ Embarcaciones Rentadas ({rentadas.length})</h3>
          <button onClick={onNuevo} style={BTN("#10B981")}>+ Nueva</button>
          <button onClick={onClose} style={btnClose}>×</button>
        </div>
        <div style={{ padding: 16, borderBottom: `1px solid ${B.navyLight}` }}>
          <input placeholder="Buscar por nombre, propietario, capitán o NIT…" value={busca} onChange={e => setBusca(e.target.value)} style={IS} />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {list.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
              {rentadas.length === 0 ? "Aún no hay embarcaciones rentadas registradas." : "Sin resultados."}
            </div>
          )}
          {list.map(e => {
            const flagRut = !e.rut_url;
            const flagCert = !e.certificacion_bancaria_url;
            const flagBanco = !e.banco || !e.cuenta_numero;
            return (
              <div key={e.id} onClick={() => onEditar(e)}
                style={{ padding: 14, borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10 }}
                onMouseEnter={ev => ev.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>⛵ {e.nombre} {e.tipo && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>· {e.tipo}{e.capacidad ? ` · cap ${e.capacidad}` : ""}</span>}</div>
                  {e.capitan && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>👨‍✈️ {e.capitan}</div>}
                  {e.propietario_nombre && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>👤 {e.propietario_nombre}{e.propietario_documento && ` · ${e.propietario_documento}`}</div>}
                  {(e.banco || e.cuenta_numero) && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>🏦 {e.banco} {e.cuenta_tipo} {e.cuenta_numero}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  {flagRut && <span style={CHIP("#F5C84233", "#F5C842")}>Falta RUT</span>}
                  {flagCert && <span style={CHIP("#F5C84233", "#F5C842")}>Falta Cert.Bancaria</span>}
                  {flagBanco && <span style={CHIP("#F5C84233", "#F5C842")}>Falta Cuenta</span>}
                  {!flagRut && !flagCert && !flagBanco && <span style={CHIP("#10B98133", "#10B981")}>✓ Completo</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Editor de embarcación (crear/editar directo en el maestro `embarcaciones`)
// Todos los campos opcionales excepto nombre. Los datos legales/bancarios y
// docs se pueden completar en cualquier momento (bancos exigen cert < 30d).
// ══════════════════════════════════════════════════════════════════════════
function EmbarcacionModal({ row, user, onClose, onSaved }) {
  const { isMobile } = useBreakpoint();
  const isEdit = !!row?.id;
  const [form, setForm] = useState({
    nombre: row?.nombre || "",
    tipo: row?.tipo || "Lancha",
    capacidad: row?.capacidad || "",
    matricula: row?.matricula || "",
    capitan: row?.capitan || "",
    piloto_celular: row?.piloto_celular || "",
    propiedad: row?.propiedad || "rentada",
    estado: row?.estado || "activo",
    propietario_nombre: row?.propietario_nombre || "",
    propietario_documento: row?.propietario_documento || "",
    propietario_telefono: row?.propietario_telefono || "",
    propietario_email: row?.propietario_email || "",
    banco: row?.banco || "",
    cuenta_tipo: row?.cuenta_tipo || "ahorros",
    cuenta_numero: row?.cuenta_numero || "",
    cuenta_titular: row?.cuenta_titular || "",
    rut_url: row?.rut_url || "",
    certificacion_bancaria_url: row?.certificacion_bancaria_url || "",
    notas: row?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingRut, setUploadingRut] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function subirArchivo(file, tipo) {
    if (!file) return null;
    const setUp = tipo === "rut" ? setUploadingRut : setUploadingCert;
    setUp(true); setErr(null);
    try {
      const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
      const idBase = row?.id || `nueva-${Date.now()}`;
      const path = `${idBase}/${tipo}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("embarcacion-docs").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("embarcacion-docs").getPublicUrl(path);
      const url = pub?.publicUrl;
      const campo = tipo === "rut" ? "rut_url" : "certificacion_bancaria_url";
      set(campo, url);
      // Si es edición, persistir de inmediato (cert bancaria se puede actualizar siempre)
      if (isEdit) {
        await supabase.from("embarcaciones").update({ [campo]: url }).eq("id", row.id);
        logAccion({ modulo: "embarcaciones", accion: "actualizar_doc", tabla: "embarcaciones", registroId: row.id, datosDespues: { campo, url } });
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setUp(false);
    }
  }

  async function guardar() {
    if (!form.nombre.trim()) return setErr("Nombre de la embarcación obligatorio");
    setSaving(true); setErr(null);
    try {
      const payload = {
        ...form,
        capacidad: form.capacidad === "" ? null : Number(form.capacidad),
      };
      if (isEdit) {
        const { error } = await supabase.from("embarcaciones").update(payload).eq("id", row.id);
        if (error) throw error;
        logAccion({ modulo: "embarcaciones", accion: "actualizar", tabla: "embarcaciones", registroId: row.id, datosDespues: { nombre: payload.nombre } });
      } else {
        // Generar ID tipo EMB-RENT-<random8>
        const id = `EMB-${(payload.propiedad || "rentada").slice(0, 4).toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
        const { data, error } = await supabase.from("embarcaciones").insert({ id, ...payload }).select().single();
        if (error) throw error;
        logAccion({ modulo: "embarcaciones", accion: "crear", tabla: "embarcaciones", registroId: data.id, datosDespues: { nombre: payload.nombre } });
      }
      setSaving(false);
      onSaved();
    } catch (e) {
      // Índice único case-insensitive → mensaje humano
      if (String(e.code) === "23505" || /ux_embarcaciones_nombre_norm|duplicate key/i.test(e.message || "")) {
        setErr(`Ya existe una embarcación llamada "${form.nombre.trim()}". Búscala en la lista de rentadas y edítala en vez de crear una nueva.`);
      } else {
        setErr(e.message || String(e));
      }
      setSaving(false);
    }
  }

  const TIPOS = ["Lancha", "Deportiva", "Nativa", "Nativa/deportiva", "Rápida", "Yate", "Catamarán", "Compartida", "Bote", "Otro"];
  const BANCOS = ["Bancolombia", "Banco de Bogotá", "Davivienda", "BBVA", "Banco Popular", "AV Villas", "Banco Caja Social", "Colpatria", "Scotiabank Colpatria", "Nequi", "Daviplata", "Otro"];

  return (
    <div onClick={onClose} style={modalBg}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalBox(isMobile), maxWidth: 720 }}>
        <div style={modalHead}>
          <h3 style={{ margin: 0, color: "#fff" }}>{isEdit ? "✎ Editar" : "➕ Nueva"} Embarcación</h3>
          <button onClick={onClose} style={btnClose}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          <div style={{ padding: 10, background: "rgba(56,189,248,0.08)", borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 16, lineHeight: 1.5 }}>
            💡 Solo el <strong>nombre</strong> es obligatorio. Los demás datos pueden completarse después — no bloquean el zarpe.
          </div>

          {/* Datos embarcación */}
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>⛵ Embarcación</div>
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Nombre *</label>
              <input style={IS} value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: María Elena II" />
            </div>
            <div>
              <label style={LS}>Tipo</label>
              <select style={IS} value={form.tipo} onChange={e => set("tipo", e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Capacidad (pax)</label>
              <input type="number" min="0" style={IS} value={form.capacidad} onChange={e => set("capacidad", e.target.value)} />
            </div>
            <div>
              <label style={LS}>Matrícula</label>
              <input style={IS} value={form.matricula} onChange={e => set("matricula", e.target.value)} placeholder="Ej: CO-0000-A" />
            </div>
          </div>
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Capitán</label>
              <input style={IS} value={form.capitan} onChange={e => set("capitan", e.target.value)} />
            </div>
            <div>
              <label style={LS}>Teléfono capitán</label>
              <input style={IS} value={form.piloto_celular} onChange={e => set("piloto_celular", e.target.value)} />
            </div>
          </div>
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Propiedad</label>
              <select style={IS} value={form.propiedad} onChange={e => set("propiedad", e.target.value)}>
                <option value="rentada">Rentada</option>
                <option value="propia">Propia</option>
              </select>
            </div>
            <div>
              <label style={LS}>Estado</label>
              <select style={IS} value={form.estado} onChange={e => set("estado", e.target.value)}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="mantenimiento">Mantenimiento</option>
              </select>
            </div>
          </div>

          {/* Propietario (para rentadas — pero se muestra siempre) */}
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginTop: 14, marginBottom: 8 }}>👤 Propietario</div>
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Nombre / Empresa</label>
              <input style={IS} value={form.propietario_nombre} onChange={e => set("propietario_nombre", e.target.value)} />
            </div>
            <div>
              <label style={LS}>NIT / Documento</label>
              <input style={IS} value={form.propietario_documento} onChange={e => set("propietario_documento", e.target.value)} placeholder="Sin puntos ni guiones" />
            </div>
          </div>
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Teléfono</label>
              <input style={IS} value={form.propietario_telefono} onChange={e => set("propietario_telefono", e.target.value)} />
            </div>
            <div>
              <label style={LS}>Email</label>
              <input type="email" style={IS} value={form.propietario_email} onChange={e => set("propietario_email", e.target.value)} />
            </div>
          </div>

          {/* Datos bancarios */}
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginTop: 14, marginBottom: 8 }}>🏦 Datos bancarios (para pago)</div>
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Banco</label>
              <select style={IS} value={form.banco} onChange={e => set("banco", e.target.value)}>
                <option value="">—</option>
                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Tipo de cuenta</label>
              <select style={IS} value={form.cuenta_tipo} onChange={e => set("cuenta_tipo", e.target.value)}>
                <option value="ahorros">Ahorros</option>
                <option value="corriente">Corriente</option>
              </select>
            </div>
          </div>
          <div style={grid2(isMobile)}>
            <div>
              <label style={LS}>Número de cuenta</label>
              <input style={IS} value={form.cuenta_numero} onChange={e => set("cuenta_numero", e.target.value)} />
            </div>
            <div>
              <label style={LS}>Titular</label>
              <input style={IS} value={form.cuenta_titular} onChange={e => set("cuenta_titular", e.target.value)} placeholder="Igual al propietario si es la misma persona" />
            </div>
          </div>

          {/* Adjuntos */}
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginTop: 14, marginBottom: 8 }}>📎 Documentos</div>

          <div style={{ marginBottom: 14 }}>
            <label style={LS}>RUT</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input type="file" accept="application/pdf,image/*" id="fileRut"
                onChange={e => e.target.files?.[0] && subirArchivo(e.target.files[0], "rut")}
                style={{ display: "none" }} />
              <label htmlFor="fileRut" style={{ ...BTN("#38BDF8"), display: "inline-block", opacity: uploadingRut ? 0.6 : 1 }}>
                {uploadingRut ? "Subiendo…" : (form.rut_url ? "🔄 Reemplazar RUT" : "📤 Subir RUT")}
              </label>
              {form.rut_url && <a href={form.rut_url} target="_blank" rel="noopener" style={{ color: "#38BDF8", fontSize: 13 }}>👁 Ver actual</a>}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Certificación bancaria</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input type="file" accept="application/pdf,image/*" id="fileCert"
                onChange={e => e.target.files?.[0] && subirArchivo(e.target.files[0], "cert")}
                style={{ display: "none" }} />
              <label htmlFor="fileCert" style={{ ...BTN("#38BDF8"), display: "inline-block", opacity: uploadingCert ? 0.6 : 1 }}>
                {uploadingCert ? "Subiendo…" : (form.certificacion_bancaria_url ? "🔄 Reemplazar Cert. Bancaria" : "📤 Subir Cert. Bancaria")}
              </label>
              {form.certificacion_bancaria_url && <a href={form.certificacion_bancaria_url} target="_blank" rel="noopener" style={{ color: "#38BDF8", fontSize: 13 }}>👁 Ver actual</a>}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              💡 Se puede actualizar en cualquier momento (bancos exigen máx 30 días de emitida).
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Notas</label>
            <textarea rows={3} style={{ ...IS, resize: "vertical", fontFamily: "inherit" }}
              value={form.notas} onChange={e => set("notas", e.target.value)}
              placeholder="Tarifas de referencia, condiciones, etc." />
          </div>

          {err && <div style={{ color: "#EF4444", fontSize: 13, marginTop: 12 }}>{err}</div>}
        </div>
        <div style={modalFoot}>
          <button onClick={onClose} style={BTN("rgba(255,255,255,0.08)")}>Cancelar</button>
          <div style={{ flex: 1 }} />
          <button onClick={guardar} disabled={saving} style={{ ...BTN("#10B981"), opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : (isEdit ? "Guardar cambios" : "Registrar embarcación")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Estilos modal ──────────────────────────────────────────────────────────
const modalBg = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 };
const modalBox = (isMobile) => ({
  background: B.navy, borderRadius: 12, width: "100%", maxWidth: 720,
  maxHeight: isMobile ? "95vh" : "90vh", display: "flex", flexDirection: "column",
  border: `1px solid ${B.navyLight}`, boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
});
const modalHead = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 20, borderBottom: `1px solid ${B.navyLight}` };
const modalFoot = { padding: 16, borderTop: `1px solid ${B.navyLight}`, display: "flex", gap: 10, background: B.navyMid };
const btnClose = { background: "transparent", border: "none", color: "#fff", fontSize: 26, cursor: "pointer", padding: 0, marginLeft: 8, lineHeight: 1 };
const grid2 = (isMobile) => ({ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 14 });
