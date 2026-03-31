import { useState, useEffect, useCallback } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

// ── Constants ────────────────────────────────────────────────
const ESTADOS = ["Borrador", "Pendiente", "Aprobada", "En Compra", "Recibida", "Rechazada"];
const ESTADO_COLOR = {
  Borrador:  { bg: B.navyLight, accent: "rgba(255,255,255,0.5)" },
  Pendiente: { bg: "#2A220A", accent: B.warning },
  Aprobada:  { bg: "#153322", accent: B.success },
  "En Compra": { bg: "#1E3566", accent: B.sky },
  Recibida:  { bg: "#153322", accent: "#6DD4A0" },
  Rechazada: { bg: "#2A1515", accent: B.danger },
};
const TIPOS = ["OPEX", "CAPEX"];
const CATEGORIAS = ["Alimentos", "Combustible", "Mantenimiento", "Equipos", "Mobiliario", "Tecnologia", "Marketing", "Uniformes", "Limpieza", "Otro"];
const AREAS = ["Operaciones", "Cocina", "Bar", "Administracion", "Flota", "Mantenimiento", "Marketing", "Deportes"];
const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"];
const PRIO_COLOR = { Baja: B.sky, Media: B.sand, Alta: B.warning, Urgente: B.danger };


// ── Sub-Components ───────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", flex: "1 1 200px", borderLeft: `4px solid ${color}`, minWidth: 180 }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ text, bg, color }) {
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", background: bg, color }}>{text}</span>
  );
}

function ReqCard({ req, onSelect }) {
  const ec = ESTADO_COLOR[req.estado] || ESTADO_COLOR.Borrador;
  const pc = PRIO_COLOR[req.prioridad] || B.sky;
  return (
    <div onClick={() => onSelect(req)} style={{
      background: ec.bg, borderRadius: 12, padding: "12px 14px", marginBottom: 8,
      border: `1px solid ${ec.accent}22`, boxShadow: "0 2px 8px #0004",
      cursor: "pointer", transition: "transform 0.1s", userSelect: "none",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 18px #0006"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 8px #0004"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{req.id}</span>
        <Badge text={req.tipo} bg={req.tipo === "CAPEX" ? "#2A1E3E" : B.navyLight} color={req.tipo === "CAPEX" ? "#A78BFA" : B.sand} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: B.white, marginBottom: 6, lineHeight: 1.3 }}>{req.desc}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>{req.area} \u00b7 {req.solicitante}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: B.sand }}>{COP(req.total)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: pc }} />
          <span style={{ fontSize: 10, color: pc }}>{req.prioridad}</span>
        </div>
      </div>
    </div>
  );
}

function NewReqModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    desc: "", tipo: "OPEX", cat: "Alimentos", area: "Operaciones", prioridad: "Media",
    proveedor: "", fechaNecesaria: "", justificacion: "",
    items: [{ item: "", cant: 1, unidad: "Unidades", precioU: 0, subtotal: 0 }],
  });

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const updateItem = (i, k, v) => {
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [k]: v };
      if (k === "cant" || k === "precioU") items[i].subtotal = (Number(items[i].cant) || 0) * (Number(items[i].precioU) || 0);
      return { ...f, items };
    });
  };
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { item: "", cant: 1, unidad: "Unidades", precioU: 0, subtotal: 0 }] }));
  const removeItem = i => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const total = form.items.reduce((s, it) => s + (it.subtotal || 0), 0);

  const handleSave = (asBorrador) => {
    if (!form.desc.trim()) return;
    onSave({
      ...form,
      id: `REQ-${String(Date.now()).slice(-3)}`,
      estado: asBorrador ? "Borrador" : "Pendiente",
      fecha: new Date().toLocaleDateString("en-CA"),
      solicitante: "Usuario Actual",
      total,
      timeline: [
        { quien: "Usuario Actual", accion: "Creada", fecha: new Date().toLocaleString("es-CO"), comentario: "" },
        ...(!asBorrador ? [{ quien: "Usuario Actual", accion: "Enviada", fecha: new Date().toLocaleString("es-CO"), comentario: "" }] : []),
      ],
    });
  };

  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
  const labelStyle = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 640, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px #0008" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>Nueva Requisicion</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>\u00d7</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
            <label style={labelStyle}>Descripcion</label>
            <input value={form.desc} onChange={e => setField("desc", e.target.value)} placeholder="Descripcion de la compra" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Tipo</label>
            <select value={form.tipo} onChange={e => setField("tipo", e.target.value)} style={inputStyle}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Categoria</label>
            <select value={form.cat} onChange={e => setField("cat", e.target.value)} style={inputStyle}>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Area Solicitante</label>
            <select value={form.area} onChange={e => setField("area", e.target.value)} style={inputStyle}>
              {AREAS.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Prioridad</label>
            <select value={form.prioridad} onChange={e => setField("prioridad", e.target.value)} style={inputStyle}>
              {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Proveedor Sugerido</label>
            <input value={form.proveedor} onChange={e => setField("proveedor", e.target.value)} placeholder="Opcional" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Fecha Necesaria</label>
            <input type="date" value={form.fechaNecesaria} onChange={e => setField("fechaNecesaria", e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
            <label style={labelStyle}>Justificacion</label>
            <textarea value={form.justificacion} onChange={e => setField("justificacion", e.target.value)} rows={2} placeholder="Por que se necesita esta compra?" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        </div>

        {/* Items sub-table */}
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: B.sand }}>Items</span>
            <button onClick={addItem} style={{ padding: "5px 14px", borderRadius: 6, background: B.navyLight, border: "none", color: B.sky, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>+ Agregar Item</button>
          </div>
          <div style={{ background: B.navy, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 1fr 1fr 1fr 36px", gap: 0, padding: "8px 10px", borderBottom: `1px solid ${B.navyLight}` }}>
              {["Item", "Cant", "Unidad", "P. Unit.", "Subtotal", ""].map(h => (
                <span key={h} style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>
            {form.items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 1fr 1fr 1fr 36px", gap: 4, padding: "6px 10px", borderBottom: `1px solid ${B.navyLight}`, alignItems: "center" }}>
                <input value={it.item} onChange={e => updateItem(i, "item", e.target.value)} placeholder="Descripcion" style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                <input type="number" value={it.cant} onChange={e => updateItem(i, "cant", Number(e.target.value))} style={{ ...inputStyle, padding: "6px 8px", fontSize: 12, textAlign: "center" }} />
                <input value={it.unidad} onChange={e => updateItem(i, "unidad", e.target.value)} style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} />
                <input type="number" value={it.precioU} onChange={e => updateItem(i, "precioU", Number(e.target.value))} style={{ ...inputStyle, padding: "6px 8px", fontSize: 12, textAlign: "right" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: B.sand, textAlign: "right", paddingRight: 4 }}>{COP(it.subtotal)}</span>
                {form.items.length > 1 && (
                  <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }}>\u00d7</button>
                )}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px", borderTop: `2px solid ${B.navyLight}` }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: B.white }}>Total: <span style={{ color: B.sand }}>{COP(total)}</span></span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => handleSave(true)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: B.navyLight, color: B.white, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Guardar Borrador</button>
          <button onClick={() => handleSave(false)} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Enviar a Aprobacion</button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ req, onClose, onUpdate }) {
  const [comment, setComment] = useState("");
  const ec = ESTADO_COLOR[req.estado] || ESTADO_COLOR.Borrador;

  const advance = (nuevoEstado, accion) => {
    onUpdate({
      ...req,
      estado: nuevoEstado,
      timeline: [...req.timeline, { quien: "Usuario Actual", accion, fecha: new Date().toLocaleString("es-CO"), comentario: comment }],
    });
    setComment("");
  };

  const actions = {
    Borrador: [{ label: "Enviar a Aprobacion", estado: "Pendiente", accion: "Enviada", color: B.sky }],
    Pendiente: [
      { label: "Aprobar", estado: "Aprobada", accion: "Aprobada", color: B.success },
      { label: "Rechazar", estado: "Rechazada", accion: "Rechazada", color: B.danger },
    ],
    Aprobada: [{ label: "Marcar En Compra", estado: "En Compra", accion: "En Compra", color: B.sky }],
    "En Compra": [{ label: "Marcar Recibida", estado: "Recibida", accion: "Recibida", color: B.success }],
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 680, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px #0008" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{req.id}</span>
              <Badge text={req.estado} bg={ec.bg} color={ec.accent} />
              <Badge text={req.tipo} bg={req.tipo === "CAPEX" ? "#2A1E3E" : B.navyLight} color={req.tipo === "CAPEX" ? "#A78BFA" : B.sand} />
              <Badge text={req.prioridad} bg={PRIO_COLOR[req.prioridad] + "22"} color={PRIO_COLOR[req.prioridad]} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{req.desc}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>\u00d7</button>
        </div>

        {/* Info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 16px", marginBottom: 20, fontSize: 13 }}>
          {[
            ["Area", req.area], ["Categoria", req.cat], ["Solicitante", req.solicitante],
            ["Fecha Creacion", req.fecha], ["Fecha Necesaria", req.fechaNecesaria], ["Proveedor", req.proveedor || "\u2014"],
          ].map(([l, v]) => (
            <div key={l}><span style={{ color: "rgba(255,255,255,0.4)" }}>{l}:</span> <span style={{ fontWeight: 600 }}>{v}</span></div>
          ))}
        </div>

        {req.justificacion && (
          <div style={{ background: B.navy, borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.7)" }}>
            <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>Justificacion</span>
            {req.justificacion}
          </div>
        )}

        {/* Items table */}
        <div style={{ background: B.navy, borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: B.sand }}>Items</span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Total: <span style={{ color: B.sand }}>{COP(req.total)}</span></span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Item", "Cant.", "Unidad", "P. Unit.", "Subtotal"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: h === "Item" ? "left" : "right", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${B.navyLight}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {req.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{it.item}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right" }}>{it.cant}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right", color: "rgba(255,255,255,0.5)" }}>{it.unidad}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right" }}>{COP(it.precioU)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right", fontWeight: 600, color: B.sand }}>{COP(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Timeline */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 10 }}>Historial</span>
          <div style={{ borderLeft: `2px solid ${B.navyLight}`, marginLeft: 8, paddingLeft: 20 }}>
            {req.timeline.map((t, i) => {
              const tc = ESTADO_COLOR[t.accion] || ESTADO_COLOR.Borrador;
              return (
                <div key={i} style={{ position: "relative", marginBottom: 16 }}>
                  <div style={{ position: "absolute", left: -27, top: 2, width: 12, height: 12, borderRadius: 6, background: tc.accent || B.navyLight, border: `2px solid ${B.navyMid}` }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{t.quien}</span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{t.accion}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{t.fecha}</span>
                  </div>
                  {t.comentario && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4, lineHeight: 1.5 }}>{t.comentario}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        {actions[req.estado] && (
          <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentario (opcional)" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {actions[req.estado].map(a => (
                <button key={a.label} onClick={() => advance(a.estado, a.accion)} style={{
                  flex: 1, padding: "10px", borderRadius: 8, border: "none",
                  background: a.color, color: a.color === B.danger ? B.white : B.navy,
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>{a.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function Requisiciones() {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("kanban");
  const [filterTipo, setFilterTipo] = useState("Todos");
  const [filterArea, setFilterArea] = useState("Todas");
  const [filterEstado, setFilterEstado] = useState("Todos");
  const [filterPrio, setFilterPrio] = useState("Todas");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState(null);

  // ── Supabase: Fetch all requisiciones ──
  const fetchReqs = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("requisiciones")
      .select("*")
      .order("fecha", { ascending: false });
    if (error) { console.error("Fetch error:", error); }
    else {
      setReqs(data.map(r => ({
        id: r.id, desc: r.descripcion, tipo: r.tipo, cat: r.categoria, area: r.area,
        solicitante: r.solicitante, prioridad: r.prioridad, estado: r.estado,
        fecha: r.fecha, fechaNecesaria: r.fecha_necesaria, proveedor: r.proveedor || "",
        justificacion: r.justificacion || "", items: r.items || [], total: r.total,
        timeline: r.timeline || [],
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchReqs(); }, [fetchReqs]);

  // ── Supabase: Realtime subscription ──
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("requisiciones-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "requisiciones" }, () => {
        fetchReqs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchReqs]);

  const filtered = reqs.filter(r => {
    if (filterTipo !== "Todos" && r.tipo !== filterTipo) return false;
    if (filterArea !== "Todas" && r.area !== filterArea) return false;
    if (filterEstado !== "Todos" && r.estado !== filterEstado) return false;
    if (filterPrio !== "Todas" && r.prioridad !== filterPrio) return false;
    if (search && !r.desc.toLowerCase().includes(search.toLowerCase()) && !r.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pendientes = reqs.filter(r => r.estado === "Pendiente").length;
  const aprobadas = reqs.filter(r => r.estado === "Aprobada" || r.estado === "En Compra" || r.estado === "Recibida").length;
  const gastoMes = reqs.filter(r => r.estado !== "Rechazada" && r.estado !== "Borrador").reduce((s, r) => s + r.total, 0);

  // ── Supabase: Insert new requisicion ──
  const handleSave = async (newReq) => {
    if (supabase) {
      const row = {
        id: newReq.id, descripcion: newReq.desc, tipo: newReq.tipo, categoria: newReq.cat,
        area: newReq.area, solicitante: newReq.solicitante, prioridad: newReq.prioridad,
        estado: newReq.estado, fecha: newReq.fecha, fecha_necesaria: newReq.fechaNecesaria || null,
        proveedor: newReq.proveedor || null, justificacion: newReq.justificacion || null,
        items: newReq.items, total: newReq.total, timeline: newReq.timeline,
      };
      const { error } = await supabase.from("requisiciones").insert(row);
      if (error) { console.error("Insert error:", error); setReqs(p => [newReq, ...p]); }
      else { await fetchReqs(); }
    } else {
      setReqs(p => [newReq, ...p]);
    }
    setShowNew(false);
  };

  // ── Supabase: Update requisicion ──
  const handleUpdate = async (updated) => {
    if (supabase) {
      const { error } = await supabase.from("requisiciones").update({
        estado: updated.estado, timeline: updated.timeline,
      }).eq("id", updated.id);
      if (error) { console.error("Update error:", error); setReqs(p => p.map(r => r.id === updated.id ? updated : r)); }
      else { await fetchReqs(); }
    } else {
      setReqs(p => p.map(r => r.id === updated.id ? updated : r));
    }
    setDetail(updated);
  };

  const selectStyle = { padding: "7px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, cursor: "pointer", outline: "none" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Barlow Condensed', sans-serif" }}>Requisiciones de Compras</h2>
          {loading && <div style={{ width: 16, height: 16, border: `2px solid ${B.navyLight}`, borderTopColor: B.sky, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        <button onClick={() => setShowNew(true)} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Nueva Requisicion</button>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Pendientes Aprobacion" value={pendientes} sub={`${reqs.filter(r => r.estado === "Pendiente" && r.prioridad === "Urgente").length} urgentes`} color={B.warning} />
        <StatCard label="Aprobadas este Mes" value={aprobadas} color={B.success} />
        <StatCard label="Gasto Comprometido" value={COP(gastoMes)} color={B.sand} />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["kanban", "tabla"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: view === v ? B.sky : B.navyLight, color: view === v ? B.navy : B.sand,
            }}>{v === "kanban" ? "Kanban" : "Tabla"}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: B.navyLight }} />
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={selectStyle}>
          <option>Todos</option>{TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterArea} onChange={e => setFilterArea(e.target.value)} style={selectStyle}>
          <option>Todas</option>{AREAS.map(a => <option key={a}>{a}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={selectStyle}>
          <option>Todos</option>{ESTADOS.map(e => <option key={e}>{e}</option>)}
        </select>
        <select value={filterPrio} onChange={e => setFilterPrio(e.target.value)} style={selectStyle}>
          <option>Todas</option>{PRIORIDADES.map(p => <option key={p}>{p}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
          style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, width: 200, outline: "none" }} />
      </div>

      {/* Kanban View */}
      {view === "kanban" && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {ESTADOS.map(estado => {
            const ec = ESTADO_COLOR[estado];
            const cards = filtered.filter(r => r.estado === estado);
            const colTotal = cards.reduce((s, r) => s + r.total, 0);
            return (
              <div key={estado} style={{ background: B.navy, borderRadius: 12, padding: "14px 12px", minWidth: 220, flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: ec.accent }} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{estado}</span>
                  </div>
                  <span style={{ background: ec.accent + "22", color: ec.accent, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{cards.length}</span>
                </div>
                {colTotal > 0 && <div style={{ fontSize: 11, color: B.sand, marginBottom: 10 }}>{COP(colTotal)}</div>}
                <div style={{ flex: 1, minHeight: 80 }}>
                  {cards.map(r => <ReqCard key={r.id} req={r} onSelect={setDetail} />)}
                  {cards.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center", paddingTop: 20 }}>Sin requisiciones</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {view === "tabla" && (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                {["#", "Descripcion", "Tipo", "Cat.", "Area", "Solicitante", "Monto", "Prioridad", "Estado", "Fecha"].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${B.navyLight}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const ec = ESTADO_COLOR[r.estado];
                const pc = PRIO_COLOR[r.prioridad];
                return (
                  <tr key={r.id} onClick={() => setDetail(r)} style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", background: i % 2 === 0 ? "transparent" : B.navyMid }}>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{r.id}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, maxWidth: 250 }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.desc}</div>
                    </td>
                    <td style={{ padding: "12px 14px" }}><Badge text={r.tipo} bg={r.tipo === "CAPEX" ? "#2A1E3E" : B.navyLight} color={r.tipo === "CAPEX" ? "#A78BFA" : B.sand} /></td>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{r.cat}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12 }}>{r.area}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12 }}>{r.solicitante}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: B.sand }}>{COP(r.total)}</td>
                    <td style={{ padding: "12px 14px" }}><Badge text={r.prioridad} bg={pc + "22"} color={pc} /></td>
                    <td style={{ padding: "12px 14px" }}><Badge text={r.estado} bg={ec.bg} color={ec.accent} /></td>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{fmtFecha(r.fecha)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>No hay requisiciones con estos filtros</div>}
        </div>
      )}

      {/* Modals */}
      {showNew && <NewReqModal onClose={() => setShowNew(false)} onSave={handleSave} />}
      {detail && <DetailModal req={detail} onClose={() => setDetail(null)} onUpdate={handleUpdate} />}
    </div>
  );
}
