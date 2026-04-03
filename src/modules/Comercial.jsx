import { useState, useEffect, useCallback } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

const VENDEDORES = ["Valentina Ríos", "Camilo Herrera", "Natalia Ospina", "Juan Estrada"];

const CANALES = ["Web", "WhatsApp", "Referido", "B2B", "Instagram", "Telefono"];

const ETAPAS = ["Nuevo", "Contactado", "Cotizado", "Cerrado Ganado", "Perdido"];

// ─── Vendor stats derived from leads ─────────────────────────────────────────

function buildVendorStats(leads, list = VENDEDORES) {
  return list.map(v => {
    const vLeads = leads.filter(l => l.vendedor === v);
    const cerrados = vLeads.filter(l => l.etapa === "Cerrado Ganado");
    const revenue = cerrados.reduce((s, l) => s + l.valorEstimado, 0);
    return {
      vendedor: v,
      leads: vLeads.length,
      cerrados: cerrados.length,
      conversion: vLeads.length ? Math.round((cerrados.length / vLeads.length) * 100) : 0,
      revenue,
    };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ETAPA_COLORS = {
  "Nuevo":          { bg: "#1E3566", accent: B.sky },
  "Contactado":     { bg: "#1E3566", accent: B.warning },
  "Cotizado":       { bg: "#1E3566", accent: "#A78BFA" },
  "Cerrado Ganado": { bg: "#153322", accent: B.success },
  "Perdido":        { bg: "#2A1515", accent: B.danger },
};

const CANAL_BADGE = {
  "Web":       { bg: "#1E3566", color: B.sky },
  "WhatsApp":  { bg: "#153322", color: B.success },
  "Referido":  { bg: "#2A1E3E", color: "#A78BFA" },
  "B2B":       { bg: "#1A2A0E", color: "#A3E635" },
  "Instagram": { bg: "#3A1530", color: B.pink },
  "Telefono":  { bg: "#2A220A", color: B.warning },
};

function badge(canal) {
  const c = CANAL_BADGE[canal] || { bg: B.navyLight, color: B.white };
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: c.bg,
    color: c.color,
    letterSpacing: "0.04em",
  };
}

function isOverdue(dateStr) {
  if (!dateStr || dateStr === "—") return false;
  return dateStr < new Date().toISOString().slice(0, 10);
}

// ─── Components ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: B.navyMid,
      borderRadius: 12,
      padding: "16px 20px",
      flex: 1,
      minWidth: 140,
      borderLeft: `3px solid ${accent || B.sky}`,
    }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: B.white }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: B.sand, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function LeadCard({ lead, onSelect }) {
  const overdue = isOverdue(lead.proximaAccion);
  return (
    <div
      onClick={() => onSelect(lead)}
      style={{
        background: ETAPA_COLORS[lead.etapa]?.bg || B.navyMid,
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 8,
        cursor: "grab",
        border: `1px solid ${ETAPA_COLORS[lead.etapa]?.accent || B.sky}22`,
        boxShadow: "0 2px 8px #0004",
        transition: "transform 0.1s, box-shadow 0.1s",
        userSelect: "none",
        position: "relative",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 6px 18px #0006";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px #0004";
      }}
    >
      {/* Drag hint dots */}
      <div style={{ position: "absolute", top: 10, right: 10, display: "flex", flexDirection: "column", gap: 3, opacity: 0.3 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ display: "flex", gap: 3 }}>
            <div style={{ width: 3, height: 3, borderRadius: "50%", background: B.white }} />
            <div style={{ width: 3, height: 3, borderRadius: "50%", background: B.white }} />
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: B.white, marginBottom: 3, paddingRight: 20, lineHeight: 1.3 }}>{lead.nombre}</div>
      <div style={{ fontSize: 11, color: B.sand, marginBottom: 6 }}>{lead.contacto}</div>

      <div style={{ marginBottom: 8 }}>
        <span style={badge(lead.canal)}>{lead.canal}</span>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, color: ETAPA_COLORS[lead.etapa]?.accent || B.sky, marginBottom: 6 }}>
        {COP(lead.valorEstimado)}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: B.sand }}>
          <span style={{ opacity: 0.7 }}>Días en etapa: </span>
          <span style={{ color: lead.diasEtapa > 10 ? B.warning : B.white, fontWeight: 600 }}>{lead.diasEtapa}</span>
        </div>
        {lead.proximaAccion !== "—" && (
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            color: overdue ? B.danger : B.sky,
            background: overdue ? "#D6454522" : "#8ECAE622",
            padding: "2px 6px",
            borderRadius: 6,
          }}>
            {overdue ? "⚠ " : ""}{lead.proximaAccion}
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: B.sand, marginTop: 6, opacity: 0.7 }}>{lead.vendedor}</div>
    </div>
  );
}

function KanbanColumn({ etapa, leads, onSelect }) {
  const total = leads.reduce((s, l) => s + l.valorEstimado, 0);
  const accent = ETAPA_COLORS[etapa]?.accent || B.sky;
  return (
    <div style={{
      background: B.navy,
      borderRadius: 12,
      padding: "14px 12px",
      minWidth: 220,
      flex: 1,
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: accent }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: B.white }}>{etapa}</span>
        </div>
        <span style={{
          background: accent + "22",
          color: accent,
          fontSize: 11,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 20,
        }}>{leads.length}</span>
      </div>
      {total > 0 && (
        <div style={{ fontSize: 11, color: B.sand, marginBottom: 10, opacity: 0.8 }}>
          Pipeline: {COP(total)}
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 60 }}>
        {leads.length === 0 && (
          <div style={{ textAlign: "center", color: B.sand, fontSize: 12, opacity: 0.4, padding: "20px 0" }}>No hay leads registrados</div>
        )}
        {leads.map(l => <LeadCard key={l.id} lead={l} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

function VendorTable({ stats }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["Vendedor", "Leads", "Cerrados", "Conversión", "Revenue"].map(h => (
              <th key={h} style={{
                textAlign: h === "Vendedor" ? "left" : "right",
                padding: "10px 14px",
                color: B.sand,
                fontWeight: 600,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                borderBottom: `1px solid ${B.navyLight}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map((row, i) => (
            <tr key={row.vendedor} style={{ background: i % 2 === 0 ? B.navyMid : "transparent" }}>
              <td style={{ padding: "10px 14px", color: B.white, fontWeight: 600 }}>{row.vendedor}</td>
              <td style={{ padding: "10px 14px", color: B.sky, textAlign: "right" }}>{row.leads}</td>
              <td style={{ padding: "10px 14px", color: B.success, textAlign: "right" }}>{row.cerrados}</td>
              <td style={{ padding: "10px 14px", textAlign: "right" }}>
                <span style={{
                  color: row.conversion >= 50 ? B.success : row.conversion >= 25 ? B.warning : B.danger,
                  fontWeight: 700,
                }}>{row.conversion}%</span>
              </td>
              <td style={{ padding: "10px 14px", color: B.white, fontWeight: 700, textAlign: "right" }}>{COP(row.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ open, onClose, onSubmit }) {
  const empty = { nombre: "", contacto: "", tel: "", email: "", canal: "Web", valorEstimado: "", vendedor: VENDEDORES[0] };
  const [form, setForm] = useState(empty);
  if (!open) return null;

  const field = (label, key, type = "text", opts = null) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {opts ? (
        <select
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8,
            background: B.navyLight, border: `1px solid ${B.navyLight}`,
            color: B.white, fontSize: 13, outline: "none",
          }}
        >
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={label}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8,
            background: B.navyLight, border: `1px solid ${B.navyLight}`,
            color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );

  function handle() {
    if (!form.nombre || !form.contacto) return;
    onSubmit({
      id: `L-${Date.now()}`,
      nombre: form.nombre,
      contacto: form.contacto,
      tel: form.tel,
      email: form.email,
      canal: form.canal,
      vendedor: form.vendedor,
      valor_est: Number(form.valorEstimado) || 0,
      stage: "Nuevo",
      fecha_creacion: new Date().toLocaleDateString("en-CA"),
    });
    setForm(empty);
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000A", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: B.navyMid, borderRadius: 16, padding: 28, width: 480, maxWidth: "95vw",
        boxShadow: "0 20px 60px #0008", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: B.white }}>Nuevo Lead</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <div style={{ gridColumn: "1 / -1" }}>{field("Nombre / Empresa", "nombre")}</div>
          {field("Contacto", "contacto")}
          {field("Teléfono", "tel", "tel")}
          {field("Email", "email", "email")}
          {field("Canal", "canal", "text", CANALES)}
          {field("Vendedor", "vendedor", "text", VENDEDORES)}
          <div style={{ gridColumn: "1 / -1" }}>{field("Valor Estimado (COP)", "valorEstimado", "number")}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${B.navyLight}`,
            background: "none", color: B.sand, fontSize: 13, cursor: "pointer",
          }}>Cancelar</button>
          <button onClick={handle} style={{
            flex: 2, padding: "10px", borderRadius: 8, border: "none",
            background: B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Agregar Lead</button>
        </div>
      </div>
    </div>
  );
}

function LeadDetail({ lead, onClose, onUpdateEtapa }) {
  if (!lead) return null;
  const accent = ETAPA_COLORS[lead.etapa]?.accent || B.sky;
  const [pendingEtapa, setPendingEtapa] = useState(null); // "Cerrado Ganado" pending confirmation
  const [fechaPago, setFechaPago]       = useState(new Date().toLocaleDateString("en-CA"));

  const IS = { background: "#0D1B3E", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, padding: "8px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" };

  const handleEtapaClick = (e) => {
    if (e === "Cerrado Ganado") { setPendingEtapa(e); return; }
    onUpdateEtapa(lead.id, e, null);
    onClose();
  };

  const confirmCerrado = () => {
    if (!fechaPago) return;
    onUpdateEtapa(lead.id, "Cerrado Ganado", fechaPago);
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000A", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => { if (e.target === e.currentTarget) { setPendingEtapa(null); onClose(); } }}>
      <div style={{
        background: B.navyMid, borderRadius: 16, padding: 28, width: 440, maxWidth: "95vw",
        boxShadow: "0 20px 60px #0008",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: B.white, marginBottom: 4 }}>{lead.nombre}</div>
            <span style={badge(lead.canal)}>{lead.canal}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", marginBottom: 18 }}>
          {[
            ["Contacto", lead.contacto],
            ["Teléfono", lead.tel],
            ["Email", lead.email],
            ["Vendedor", lead.vendedor],
            ["Valor Estimado", COP(lead.valorEstimado)],
            ["Días en etapa", lead.diasEtapa],
            ["Próxima Acción", lead.proximaAccion],
            ["Etapa actual", lead.etapa],
            ...(lead.fechaPago ? [["Fecha de pago", lead.fechaPago]] : []),
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{k}</div>
              <div style={{ fontSize: 13, color: B.white, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Fecha de pago modal inline when moving to Cerrado Ganado */}
        {pendingEtapa === "Cerrado Ganado" ? (
          <div style={{ background: B.success + "18", border: `1px solid ${B.success}55`, borderRadius: 10, padding: 16, marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.success, marginBottom: 12 }}>🏆 Cerrar como Ganado</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>Fecha de pago *</label>
              <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} style={IS} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPendingEtapa(null)} style={{ flex: 1, background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.sand, padding: "8px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={confirmCerrado} disabled={!fechaPago} style={{ flex: 2, background: B.success, border: "none", borderRadius: 8, color: B.navy, padding: "8px", fontSize: 13, cursor: "pointer", fontWeight: 700, opacity: !fechaPago ? 0.5 : 1 }}>✓ Confirmar cierre</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Mover a etapa</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ETAPAS.map(e => (
                <button
                  key={e}
                  onClick={() => handleEtapaClick(e)}
                  style={{
                    padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                    cursor: "pointer",
                    background: e === lead.etapa ? (ETAPA_COLORS[e]?.accent || B.sky) : B.navyLight,
                    color: e === lead.etapa ? B.navy : B.white,
                    border: `1px solid ${e === lead.etapa ? (ETAPA_COLORS[e]?.accent || B.sky) : B.navyLight}`,
                    transition: "all 0.15s",
                  }}
                >{e}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Comercial() {
  const [leads, setLeads] = useState([]);
  const [vendedoresList, setVendedoresList] = useState(VENDEDORES);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [filterVendedor, setFilterVendedor] = useState("Todos");
  const [filterCanal, setFilterCanal] = useState("Todos");
  const [activeTab, setActiveTab] = useState("kanban");

  // Load vendedores from empleados table
  useEffect(() => {
    if (!supabase) return;
    supabase.from("empleados").select("nombre").eq("activo", true).order("nombre")
      .then(({ data }) => { if (data?.length) setVendedoresList(data.map(e => e.nombre)); });
  }, []);

  const fetchLeads = useCallback(async () => {
    if (!supabase) {
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setLeads(data.map(r => ({
        id: r.id,
        nombre: r.nombre,
        contacto: r.contacto,
        tel: r.tel,
        email: r.email,
        canal: r.canal,
        vendedor: r.vendedor,
        valorEstimado: r.valor_est || 0,
        etapa: r.stage,
        diasEtapa: r.fecha_creacion
          ? Math.floor((Date.now() - new Date(r.fecha_creacion).getTime()) / 86400000)
          : 0,
        proximaAccion: r.prox_fecha || "—",
        notas: r.notas,
        etiquetas: r.etiquetas,
        perdidoRazon: r.perdido_razon,
        fechaPago: r.fecha_pago || null,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const filtered = leads.filter(l =>
    (filterVendedor === "Todos" || l.vendedor === filterVendedor) &&
    (filterCanal === "Todos" || l.canal === filterCanal)
  );

  const enProceso = filtered.filter(l => !["Cerrado Ganado", "Perdido"].includes(l.etapa)).length;
  const cerradosMes = filtered.filter(l => l.etapa === "Cerrado Ganado").length;
  const revenuePipeline = filtered
    .filter(l => !["Perdido"].includes(l.etapa))
    .reduce((s, l) => s + l.valorEstimado, 0);

  async function addLead(dbRow) {
    if (!supabase) return;
    await supabase.from("leads").insert([dbRow]);
    fetchLeads();
  }

  async function updateEtapa(id, newStage, fechaPago = null) {
    if (!supabase) return;
    const upd = { stage: newStage, ultimo_contacto: new Date().toLocaleDateString("en-CA") };
    if (newStage === "Cerrado Ganado" && fechaPago) upd.fecha_pago = fechaPago;
    await supabase.from("leads").update(upd).eq("id", id);
    fetchLeads();
  }

  const vendorStats = buildVendorStats(leads, vendedoresList);

  const selectStyle = {
    padding: "7px 12px", borderRadius: 8, background: B.navyLight,
    border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12,
    cursor: "pointer", outline: "none",
  };

  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setActiveTab(key)}
      style={{
        padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600,
        cursor: "pointer", border: "none",
        background: activeTab === key ? B.sky : B.navyLight,
        color: activeTab === key ? B.navy : B.sand,
        transition: "all 0.15s",
      }}
    >{label}</button>
  );

  return (
    <div style={{ background: B.navy, minHeight: "100vh", padding: 24, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: B.white, letterSpacing: "-0.02em" }}>
              Comercial
            </h1>
            {supabase && !loading && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#4CAF7D22", color: "#4CAF7D" }}>LIVE</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: B.sand, marginTop: 3 }}>Pipeline de ventas · Atolon Beach Club</div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            padding: "9px 18px", borderRadius: 8, background: B.sky, color: B.navy,
            border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
            boxShadow: `0 4px 14px ${B.sky}44`,
          }}
        >+ Nuevo Lead</button>
      </div>

      {/* Stats Bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Total Leads" value={filtered.length} sub={`de ${leads.length} en total`} accent={B.sky} />
        <StatCard label="En Proceso" value={enProceso} sub="activos en pipeline" accent={B.warning} />
        <StatCard label="Cerrados (mes)" value={cerradosMes} sub="ganados" accent={B.success} />
        <StatCard label="Revenue Pipeline" value={COP(revenuePipeline)} sub="valor estimado" accent="#A78BFA" />
      </div>

      {/* Filters + Tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {tabBtn("kanban", "Kanban")}
          {tabBtn("vendedores", "Vendedores")}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Filtrar por:</span>
          <select value={filterVendedor} onChange={e => setFilterVendedor(e.target.value)} style={selectStyle}>
            <option value="Todos">Todos los vendedores</option>
            {vendedoresList.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={filterCanal} onChange={e => setFilterCanal(e.target.value)} style={selectStyle}>
            <option value="Todos">Todos los canales</option>
            {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Kanban View */}
      {activeTab === "kanban" && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>
          {ETAPAS.map(etapa => (
            <KanbanColumn
              key={etapa}
              etapa={etapa}
              leads={filtered.filter(l => l.etapa === etapa)}
              onSelect={setSelectedLead}
            />
          ))}
        </div>
      )}

      {/* Vendor Performance View */}
      {activeTab === "vendedores" && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 16 }}>Rendimiento por Vendedor</div>
          <VendorTable stats={vendorStats} />

          {/* Canal breakdown */}
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 14 }}>Leads por Canal</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {CANALES.map(canal => {
                const count = leads.filter(l => l.canal === canal).length;
                const rev = leads.filter(l => l.canal === canal && l.etapa === "Cerrado Ganado").reduce((s, l) => s + l.valorEstimado, 0);
                return (
                  <div key={canal} style={{
                    background: B.navy, borderRadius: 10, padding: "12px 16px",
                    minWidth: 140, border: `1px solid ${B.navyLight}`,
                  }}>
                    <span style={badge(canal)}>{canal}</span>
                    <div style={{ fontSize: 20, fontWeight: 700, color: B.white, marginTop: 8 }}>{count}</div>
                    <div style={{ fontSize: 11, color: B.sand, marginTop: 2 }}>leads</div>
                    {rev > 0 && <div style={{ fontSize: 12, color: B.success, marginTop: 4, fontWeight: 600 }}>{COP(rev)} cerrado</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} onSubmit={addLead} />
      <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} onUpdateEtapa={updateEtapa} />
    </div>
  );
}
