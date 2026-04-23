import { useState, useEffect, useCallback } from "react";
import { B, COP, PASADIAS } from "../brand";

const TIPOS_PASADIA = ["— Sin especificar —", ...PASADIAS.map(p => p.tipo)];
const HORAS = ["08:30", "10:00", "11:30", "13:00"];
import { supabase } from "../lib/supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

const VENDEDORES = []; // No hardcoded vendors — derived from leads data

const CANALES = ["Web", "WhatsApp", "Referido", "B2B", "Instagram", "Telefono"];

const ETAPAS = ["Nuevo", "Contactado", "Cotizado", "Cerrado Ganado", "Perdido", "Duplicado"];

// ─── Vendor stats derived from leads ─────────────────────────────────────────

function buildVendorStats(leads) {
  // Derive vendors from actual leads — never show phantom vendors with 0 leads
  const vendorMap = {};
  leads.forEach(l => {
    const v = l.vendedor || "Sin asignar";
    if (!vendorMap[v]) vendorMap[v] = { vendedor: v, leads: 0, cerrados: 0, revenue: 0 };
    vendorMap[v].leads++;
    if (l.etapa === "Cerrado Ganado") {
      vendorMap[v].cerrados++;
      vendorMap[v].revenue += l.valorEstimado || 0;
    }
  });
  return Object.values(vendorMap)
    .map(v => ({ ...v, conversion: v.leads ? Math.round((v.cerrados / v.leads) * 100) : 0 }))
    .sort((a, b) => b.leads - a.leads);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ETAPA_COLORS = {
  "Nuevo":          { bg: "#1E3566", accent: B.sky },
  "Contactado":     { bg: "#1E3566", accent: B.warning },
  "Cotizado":       { bg: "#1E3566", accent: "#A78BFA" },
  "Cerrado Ganado": { bg: "#153322", accent: B.success },
  "Perdido":        { bg: "#2A1515", accent: B.danger },
  "Duplicado":      { bg: "#2B2B2B", accent: "rgba(255,255,255,0.4)" },
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

      {/* Detalles de visita */}
      {(lead.tipoPasadia || lead.fechaVisita || lead.pax > 0) && (
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "7px 10px", marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {lead.tipoPasadia && (
            <span style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>🏖️ {lead.tipoPasadia}</span>
          )}
          {lead.pax > 0 && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>· 👥 {lead.pax} pax</span>
          )}
          {lead.fechaVisita && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
              · 📅 {new Date(lead.fechaVisita + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
            </span>
          )}
          {lead.horaVisita && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>· 🕐 {lead.horaVisita}</span>
          )}
        </div>
      )}

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
          {stats.length === 0 && (
            <tr><td colSpan={5} style={{ padding: "24px 14px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Sin leads registrados aún</td></tr>
          )}
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
  const empty = { nombre: "", contacto: "", tel: "", email: "", canal: "Web", valorEstimado: "", vendedor: "", pax: "", fecha_visita: "", hora_visita: "", tipo_pasadia: "" };
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
      pax: Number(form.pax) || null,
      fecha_visita: form.fecha_visita || null,
      hora_visita: form.hora_visita || null,
      tipo_pasadia: form.tipo_pasadia && form.tipo_pasadia !== "— Sin especificar —" ? form.tipo_pasadia : null,
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
          {field("Tipo de Pasadía", "tipo_pasadia", "text", TIPOS_PASADIA)}
          {field("Personas (pax)", "pax", "number")}
          {field("Fecha visita", "fecha_visita", "date")}
          {field("Hora salida", "hora_visita", "text", ["— Sin hora —", ...HORAS])}
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
  const [pendingEtapa, setPendingEtapa] = useState(null);
  const [fechaPago, setFechaPago]       = useState(new Date().toLocaleDateString("en-CA"));
  const [reservaLinked, setReservaLinked] = useState(null);
  const [showTerminar, setShowTerminar]   = useState(false);
  const [terminando, setTerminando]       = useState(false);
  const [linkGenerado, setLinkGenerado]   = useState(null);
  const [salidas, setSalidas]             = useState([]);
  const [showPagoManual, setShowPagoManual] = useState(false);
  const [formaPagoManual, setFormaPagoManual] = useState("efectivo");
  const [fechaPagoManual, setFechaPagoManual] = useState(new Date().toLocaleDateString("en-CA"));

  // Parse datos from notas text e.g. "VIP Pass · 2026-04-04 · 4 pax · ..."
  const parsedFromNotas = (() => {
    const n = lead.notas || "";
    const tipoMatch = PASADIAS.find(p => n.includes(p.tipo));
    const fechaMatch = n.match(/(\d{4}-\d{2}-\d{2})/);
    const paxMatch   = n.match(/(\d+)\s*pax/i);
    return {
      tipo:  tipoMatch?.tipo || null,
      fecha: fechaMatch?.[1] || null,
      pax:   paxMatch ? Number(paxMatch[1]) : null,
    };
  })();

  const [rForm, setRForm] = useState({
    nombre:    lead.nombre    || "",
    email:     lead.email     || lead.contacto || "",
    telefono:  lead.tel       || "",
    tipo:      lead.tipoPasadia || parsedFromNotas.tipo  || "VIP Pass",
    fecha:     lead.fechaVisita || parsedFromNotas.fecha || new Date().toLocaleDateString("en-CA"),
    salida_id: "",
    pax:       lead.pax > 0 ? lead.pax : (parsedFromNotas.pax || 2),
    grupo_id:  "",
  });
  const [grupos, setGrupos] = useState([]);

  // Fetch linked reservation — update form with its data when it arrives
  useEffect(() => {
    if (!supabase || !lead.id) return;
    supabase.from("reservas")
      .select("id,nombre,fecha,tipo,pax,total,estado,salida_id,link_pago,forma_pago,email,contacto,telefono")
      .eq("lead_id", lead.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setReservaLinked(data);
        // Pre-fill form with reservation data (more complete than lead)
        setRForm(f => ({
          ...f,
          nombre:    data.nombre   || f.nombre,
          email:     data.email    || data.contacto || f.email,
          telefono:  data.telefono || f.telefono,
          tipo:      data.tipo     || f.tipo,
          fecha:     data.fecha    ? data.fecha.slice(0,10) : f.fecha,
          salida_id: data.salida_id || f.salida_id,
          pax:       data.pax      || f.pax,
        }));
      });
  }, [lead.id]);

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

  const fmtFechaVisita = (f) => f
    ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : null;

  const hasVisitData = lead.tipoPasadia || lead.pax > 0 || lead.fechaVisita || lead.horaVisita;

  // Fetch salidas + grupos
  useEffect(() => {
    if (!supabase || !showTerminar) return;
    supabase.from("salidas").select("id,nombre,hora").eq("activo", true).order("hora")
      .then(({ data }) => { if (data) setSalidas(data); });
    supabase.from("eventos").select("id,nombre,fecha,aliado_id").eq("categoria", "grupo")
      .order("fecha", { ascending: true })
      .then(({ data }) => { if (data) setGrupos(data); });
  }, [showTerminar]);

  const rTotal = (PASADIAS.find(p => p.tipo === rForm.tipo)?.precio || 0) * Number(rForm.pax || 0);

  // ── Guardar cambios en reserva existente (o crear nueva) ───────────────────
  async function upsertReserva() {
    if (!supabase || !rForm.fecha || !rForm.salida_id || !rForm.nombre) return null;
    const pasadia = PASADIAS.find(p => p.tipo === rForm.tipo) || PASADIAS[0];
    const pax = Number(rForm.pax) || 1;
    const total = pasadia.precio * pax;

    const grupoSeleccionado = grupos.find(g => g.id === rForm.grupo_id) || null;

    if (reservaLinked) {
      // Update existing
      await supabase.from("reservas").update({
        nombre: rForm.nombre, email: rForm.email, contacto: rForm.email,
        telefono: rForm.telefono, tipo: rForm.tipo,
        fecha: rForm.fecha, salida_id: rForm.salida_id,
        pax, pax_a: pax, precio_u: pasadia.precio,
        total, saldo: total, abono: 0,
        grupo_id: rForm.grupo_id || null,
        canal: rForm.grupo_id ? "GRUPO" : (reservaLinked.canal || "WEB"),
        aliado_id: grupoSeleccionado?.aliado_id || reservaLinked.aliado_id || null,
        updated_at: new Date().toISOString(),
      }).eq("id", reservaLinked.id);
      const updated = { ...reservaLinked, nombre: rForm.nombre, email: rForm.email, telefono: rForm.telefono, tipo: rForm.tipo, fecha: rForm.fecha, salida_id: rForm.salida_id, pax, total, grupo_id: rForm.grupo_id || null };
      setReservaLinked(updated);
      return updated;
    } else {
      // Insert new
      const newId = `WEB-${Date.now()}`;
      const reservaData = {
        id: newId, fecha: rForm.fecha, salida_id: rForm.salida_id,
        tipo: rForm.tipo, canal: rForm.grupo_id ? "GRUPO" : "WEB",
        nombre: rForm.nombre, contacto: rForm.email || "", email: rForm.email || "", telefono: rForm.telefono || "",
        pax, pax_a: pax, pax_n: 0, precio_u: pasadia.precio,
        total, abono: 0, saldo: total, estado: "pendiente_pago", forma_pago: "stripe",
        lead_id: lead.id, qr_code: `ATOLON-${newId}`,
        grupo_id: rForm.grupo_id || null,
        aliado_id: grupoSeleccionado?.aliado_id || null,
        extras_solicitados: [], pasajeros: [],
        precio_neto: 0, credito_generado: "0", descuento_agencia: 0,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("reservas").insert([reservaData]);
      if (error) { alert("Error: " + error.message); return null; }
      setReservaLinked(reservaData);
      return reservaData;
    }
  }

  // ── Generar link de pago internacional (ruteado dinámicamente a Stripe o Zoho Pay) ──
  async function generarLinkStripe() {
    if (!rForm.salida_id || !rForm.nombre) return;
    setTerminando(true);
    try {
      const reserva = await upsertReserva();
      if (!reserva) { setTerminando(false); return; }
      const { crearSesionPago } = await import("../lib/internacional");
      // Convertir COP a USD (tasa fallback 4200)
      const tasa = 4200;
      const amountUSD = Math.ceil((reserva.total || 0) / tasa);
      const session = await crearSesionPago({
        amount: amountUSD,
        currency: "USD",
        reference: reserva.id,
        description: `${rForm.tipo} — ${new Date(rForm.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long" })}`,
        nombre: rForm.nombre,
        email: rForm.email || "",
        fecha: rForm.fecha,
        context: "reserva",
        context_id: reserva.id,
      });
      if (session?.url) {
        await supabase.from("reservas").update({ link_pago: session.url }).eq("id", reserva.id);
        setLinkGenerado(session.url);
      } else {
        alert("Error generando link de pago internacional");
      }
    } catch (e) { alert("Error: " + e.message); }
    setTerminando(false);
  }

  // ── Pago manual ─────────────────────────────────────────────────────────────
  async function registrarPagoManual() {
    if (!rForm.salida_id || !rForm.nombre) return;
    setTerminando(true);
    try {
      const reserva = await upsertReserva();
      if (!reserva) { setTerminando(false); return; }
      await supabase.from("reservas").update({
        estado: "confirmado", forma_pago: formaPagoManual,
        abono: reserva.total, saldo: 0,
        updated_at: new Date().toISOString(),
      }).eq("id", reserva.id);
      await supabase.from("leads").update({
        stage: "Cerrado Ganado",
        ultimo_contacto: new Date().toLocaleDateString("en-CA"),
        fecha_pago: fechaPagoManual,
      }).eq("id", lead.id);
      onUpdateEtapa(lead.id, "Cerrado Ganado", fechaPagoManual);
      onClose();
    } catch(e) { alert("Error: " + e.message); }
    setTerminando(false);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000A", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => { if (e.target === e.currentTarget) { setPendingEtapa(null); onClose(); } }}>
      <div style={{
        background: B.navyMid, borderRadius: 16, padding: 28, width: 480, maxWidth: "95vw",
        boxShadow: "0 20px 60px #0008", maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: B.white, marginBottom: 6 }}>{lead.nombre}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={badge(lead.canal)}>{lead.canal}</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: (ETAPA_COLORS[lead.etapa]?.accent || B.sky) + "22", color: ETAPA_COLORS[lead.etapa]?.accent || B.sky, fontWeight: 600 }}>{lead.etapa}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Datos de la visita — destacado */}
        {hasVisitData && (
          <div style={{ background: "#1A2855", border: `1px solid ${B.sky}33`, borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 12 }}>📋 Datos de la visita</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
              {lead.tipoPasadia && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Pasadía</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: B.white }}>🏖️ {lead.tipoPasadia}</div>
                </div>
              )}
              {lead.fechaVisita && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Fecha</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: B.white, textTransform: "capitalize" }}>📅 {fmtFechaVisita(lead.fechaVisita)}</div>
                </div>
              )}
              {lead.pax > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Personas</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif" }}>👥 {lead.pax} pax</div>
                </div>
              )}
              {lead.horaVisita && (
                <div>
                  <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Hora de salida</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>🕐 {lead.horaVisita}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Terminar Reserva — etapa Nuevo ── */}
        {lead.etapa === "Nuevo" && (
          <div style={{ background: "#2A1E00", border: `1px solid ${B.warning}55`, borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: B.warning, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>⚠ Reserva Pendiente de Pago</div>
              <button onClick={() => { setShowTerminar(v => !v); setLinkGenerado(null); setShowPagoManual(false); }}
                style={{ padding: "5px 14px", borderRadius: 8, background: showTerminar ? B.navyLight : B.warning, border: "none", color: showTerminar ? B.sand : B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {showTerminar ? "Ocultar" : "Terminar Reserva"}
              </button>
            </div>

            {!showTerminar && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>
                {reservaLinked ? `Reserva ${reservaLinked.id} · ${reservaLinked.tipo} · ${COP(reservaLinked.total)}` : "Sin reserva creada — cliente no completó el proceso."}
              </div>
            )}

            {showTerminar && (
              <div>
                {/* Formulario unificado editable */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>Nombre completo</label>
                    <input value={rForm.nombre} onChange={e => setRForm(f => ({ ...f, nombre: e.target.value }))}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, background:B.navyLight, border:`1px solid ${B.navyLight}`, color:B.white, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>Email</label>
                    <input type="email" value={rForm.email} onChange={e => setRForm(f => ({ ...f, email: e.target.value }))}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, background:B.navyLight, border:`1px solid ${B.navyLight}`, color:B.white, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>Teléfono / WhatsApp</label>
                    <input type="tel" value={rForm.telefono} onChange={e => setRForm(f => ({ ...f, telefono: e.target.value }))}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, background:B.navyLight, border:`1px solid ${B.navyLight}`, color:B.white, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>Tipo de Pasadía</label>
                    <select value={rForm.tipo} onChange={e => setRForm(f => ({ ...f, tipo: e.target.value }))}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, background:B.navyLight, border:`1px solid ${B.navyLight}`, color:B.white, fontSize:12, outline:"none" }}>
                      {PASADIAS.map(p => <option key={p.tipo} value={p.tipo}>{p.tipo} — {COP(p.precio)}/pax</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>Personas</label>
                    <input type="number" min="1" value={rForm.pax} onChange={e => setRForm(f => ({ ...f, pax: e.target.value }))}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, background:B.navyLight, border:`1px solid ${B.navyLight}`, color:B.white, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>Fecha de visita</label>
                    <input type="date" value={rForm.fecha} onChange={e => setRForm(f => ({ ...f, fecha: e.target.value }))}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, background:B.navyLight, border:`1px solid ${B.navyLight}`, color:B.white, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>Salida</label>
                    <select value={rForm.salida_id} onChange={e => setRForm(f => ({ ...f, salida_id: e.target.value }))}
                      style={{ width:"100%", padding:"8px 10px", borderRadius:8, background:B.navyLight, border:`1px solid ${B.navyLight}`, color:B.white, fontSize:12, outline:"none" }}>
                      <option value="">— Seleccionar salida —</option>
                      {salidas.map(s => <option key={s.id} value={s.id}>{s.hora} — {s.nombre}</option>)}
                    </select>
                  </div>
                  {/* Grupo */}
                  {grupos.length > 0 && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontSize: 10, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>👥 Grupo (opcional)</label>
                      <select
                        value={rForm.grupo_id}
                        onChange={e => {
                          const gid = e.target.value;
                          const g = grupos.find(x => x.id === gid);
                          setRForm(f => ({ ...f, grupo_id: gid, fecha: g ? g.fecha : f.fecha }));
                        }}
                        style={{ width:"100%", padding:"8px 10px", borderRadius:8, background: rForm.grupo_id ? "#2A1E3E" : B.navyLight, border:`1px solid ${rForm.grupo_id ? "#a78bfa66" : B.navyLight}`, color:B.white, fontSize:12, outline:"none" }}>
                        <option value="">— Sin grupo —</option>
                        {grupos.map(g => (
                          <option key={g.id} value={g.id}>{g.nombre} · {new Date(g.fecha + "T12:00:00").toLocaleDateString("es-CO",{day:"numeric",month:"short",year:"numeric"})}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Total calculado */}
                {rTotal > 0 && (
                  <div style={{ fontSize: 16, color: B.warning, fontWeight: 800, marginBottom: 14 }}>
                    Total: {COP(rTotal)}
                  </div>
                )}

                {/* Link generado */}
                {linkGenerado && (
                  <div style={{ background: "#0D1B3E", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: B.success, fontWeight: 700, marginBottom: 6 }}>✅ Link de pago generado</div>
                    <div style={{ fontSize: 11, color: B.sky, wordBreak: "break-all", marginBottom: 10 }}>{linkGenerado}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => navigator.clipboard.writeText(linkGenerado)} style={{ flex:1, padding:"7px", borderRadius:8, background:B.sky+"22", border:`1px solid ${B.sky}44`, color:B.sky, fontSize:12, fontWeight:700, cursor:"pointer" }}>📋 Copiar</button>
                      <a href={`https://wa.me/${rForm.telefono?.replace(/\D/g,"")}?text=${encodeURIComponent("Hola " + rForm.nombre + ", aquí está el link para completar tu reserva en Atolon Beach Club: " + linkGenerado)}`}
                        target="_blank" rel="noreferrer"
                        style={{ flex:1, padding:"7px", borderRadius:8, background:"#153322", border:`1px solid ${B.success}44`, color:B.success, fontSize:12, fontWeight:700, cursor:"pointer", textDecoration:"none", textAlign:"center", display:"block" }}>
                        📲 WhatsApp
                      </a>
                    </div>
                  </div>
                )}

                {/* Pago manual — campos extra */}
                {showPagoManual && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12, background:"#0D1B3E", borderRadius:10, padding:"12px 14px" }}>
                    <div>
                      <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>Forma de pago</label>
                      <select value={formaPagoManual} onChange={e => setFormaPagoManual(e.target.value)} style={{ width:"100%", padding:"8px 10px", borderRadius:8, background:B.navyLight, border:`1px solid ${B.navyLight}`, color:B.white, fontSize:13, outline:"none" }}>
                        {["efectivo","datafono","transferencia","cxc"].map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", display:"block", marginBottom:4 }}>Fecha de pago</label>
                      <input type="date" value={fechaPagoManual} onChange={e => setFechaPagoManual(e.target.value)} style={{ width:"100%", padding:"8px 10px", borderRadius:8, background:B.navyLight, border:`1px solid ${B.navyLight}`, color:B.white, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                    </div>
                  </div>
                )}

                {/* Botones de acción */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={generarLinkStripe} disabled={terminando || !rForm.salida_id || !rForm.nombre}
                    style={{ flex:1, minWidth:140, padding:"9px", borderRadius:8, background:"#1E3566", border:`1px solid ${B.sky}55`, color:B.sky, fontSize:12, fontWeight:700, cursor:"pointer", opacity:(terminando||!rForm.salida_id||!rForm.nombre)?0.5:1 }}>
                    {terminando && !showPagoManual ? "Generando..." : "🔗 Generar Link Stripe"}
                  </button>
                  {!showPagoManual ? (
                    <button onClick={() => setShowPagoManual(true)} style={{ flex:1, minWidth:140, padding:"9px", borderRadius:8, background:"#153322", border:`1px solid ${B.success}55`, color:B.success, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      ✓ Pago Manual
                    </button>
                  ) : (
                    <button onClick={registrarPagoManual} disabled={terminando || !rForm.salida_id || !rForm.nombre}
                      style={{ flex:1, minWidth:140, padding:"9px", borderRadius:8, background:B.success, border:"none", color:B.navy, fontSize:12, fontWeight:700, cursor:"pointer", opacity:(terminando||!rForm.salida_id||!rForm.nombre)?0.5:1 }}>
                      {terminando ? "Guardando..." : "✓ Confirmar Pago"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reserva vinculada — solo cuando Cerrado Ganado */}
        {lead.etapa === "Cerrado Ganado" && (
          <div style={{ background: "#153322", border: `1px solid ${B.success}44`, borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: B.success, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 10 }}>🏆 Reserva vinculada</div>
            {reservaLinked ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 12 }}>
                  {[
                    ["ID Reserva", reservaLinked.id],
                    ["Estado", reservaLinked.estado],
                    ["Pasadía", reservaLinked.tipo],
                    ["Fecha", reservaLinked.fecha ? new Date(reservaLinked.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—"],
                    ["Personas", reservaLinked.pax],
                    ["Total", COP(reservaLinked.total)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 13, color: B.white, fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <a
                  href={`/zarpe-info?id=${reservaLinked.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-block", padding: "7px 16px", borderRadius: 8, background: B.success + "22", color: B.success, fontSize: 12, fontWeight: 700, textDecoration: "none", border: `1px solid ${B.success}44` }}
                >
                  🎫 Ver certificado →
                </a>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>No hay reserva vinculada a este lead</div>
            )}
          </div>
        )}

        {/* Datos de contacto */}
        <div style={{ background: "#0D1B3E", borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 12 }}>👤 Contacto</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
            {[
              ["Email", lead.contacto],
              ["Teléfono", lead.tel],
              ["Vendedor", lead.vendedor],
              ["Valor Estimado", COP(lead.valorEstimado)],
              ["Días en pipeline", lead.diasEtapa],
              ["Próxima acción", lead.proximaAccion !== "—" ? lead.proximaAccion : null],
              ...(lead.fechaPago ? [["Fecha de pago", lead.fechaPago]] : []),
            ].filter(([, v]) => v != null && v !== "").map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{k}</div>
                <div style={{ fontSize: 13, color: B.white, fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Notas */}
        {lead.notas && (
          <div style={{ background: "#0D1B3E", borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 8 }}>📝 Notas</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>{lead.notas}</div>
          </div>
        )}

        {/* Mover etapa / Cerrar Ganado */}
        {pendingEtapa === "Cerrado Ganado" ? (
          <div style={{ background: B.success + "18", border: `1px solid ${B.success}55`, borderRadius: 10, padding: 16 }}>
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
                <button key={e} onClick={() => handleEtapaClick(e)} style={{
                  padding: "6px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  background: e === lead.etapa ? (ETAPA_COLORS[e]?.accent || B.sky) : B.navyLight,
                  color: e === lead.etapa ? B.navy : B.white,
                  border: `1px solid ${e === lead.etapa ? (ETAPA_COLORS[e]?.accent || B.sky) : B.navyLight}`,
                  transition: "all 0.15s",
                }}>{e}</button>
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
        pax: r.pax || 0,
        fechaVisita: r.fecha_visita || null,
        horaVisita: r.hora_visita || null,
        tipoPasadia: r.tipo_pasadia || null,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const filtered = leads.filter(l =>
    (filterVendedor === "Todos" || l.vendedor === filterVendedor) &&
    (filterCanal === "Todos" || l.canal === filterCanal)
  );

  const enProceso = filtered.filter(l => !["Cerrado Ganado", "Perdido", "Duplicado"].includes(l.etapa)).length;
  const cerradosMes = filtered.filter(l => l.etapa === "Cerrado Ganado").length;
  const revenuePipeline = filtered
    .filter(l => !["Perdido", "Duplicado"].includes(l.etapa))
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

  const vendorStats = buildVendorStats(leads);

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
              {(() => {
                // Derive channels from actual leads, not hardcoded list
                const canalMap = {};
                leads.forEach(l => {
                  const c = l.canal || "Sin canal";
                  if (!canalMap[c]) canalMap[c] = { count: 0, rev: 0 };
                  canalMap[c].count++;
                  if (l.etapa === "Cerrado Ganado") canalMap[c].rev += l.valorEstimado || 0;
                });
                const canalesActivos = Object.entries(canalMap).sort((a, b) => b[1].count - a[1].count);
                if (canalesActivos.length === 0) return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Sin leads registrados aún</div>;
                return canalesActivos.map(([canal, { count, rev }]) => (
                  <div key={canal} style={{
                    background: B.navy, borderRadius: 10, padding: "12px 16px",
                    minWidth: 140, border: `1px solid ${B.navyLight}`,
                  }}>
                    <span style={badge(canal)}>{canal}</span>
                    <div style={{ fontSize: 20, fontWeight: 700, color: B.white, marginTop: 8 }}>{count}</div>
                    <div style={{ fontSize: 11, color: B.sand, marginTop: 2 }}>leads</div>
                    {rev > 0 && <div style={{ fontSize: 12, color: B.success, marginTop: 4, fontWeight: 600 }}>{COP(rev)} cerrado</div>}
                  </div>
                ));
              })()}
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
