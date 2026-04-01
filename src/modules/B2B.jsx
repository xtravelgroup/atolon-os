import { useState, useEffect, useCallback } from "react";
import { B, COP, PASADIAS, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";
import { asignarPuntosReserva, getRankingAgencia, getPuntosConfig } from "../lib/puntos";
import Incentivos from "./Incentivos";
import { EventoModal, ReservasGrupoModal } from "./Eventos";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const ISsm = { ...IS, padding: "7px 8px", fontSize: 12 };

// ═══════════════════════════════════════════════
// CONTACTO INLINE FORM
// ═══════════════════════════════════════════════
function ContactoInlineForm({ onSave, onCancel }) {
  const [f, setF] = useState({ nombre: "", cargo: "", telefono: "", email: "", es_principal: false });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto auto", gap: 8, alignItems: "end", marginTop: 10, padding: 10, background: B.navyLight + "44", borderRadius: 8 }}>
      <div><label style={{ ...LS, fontSize: 10 }}>Nombre</label><input value={f.nombre} onChange={e => s("nombre", e.target.value)} style={ISsm} placeholder="Nombre" /></div>
      <div><label style={{ ...LS, fontSize: 10 }}>Cargo</label><input value={f.cargo} onChange={e => s("cargo", e.target.value)} style={ISsm} placeholder="Cargo" /></div>
      <div><label style={{ ...LS, fontSize: 10 }}>Telefono</label><input value={f.telefono} onChange={e => s("telefono", e.target.value)} style={ISsm} placeholder="+57..." /></div>
      <div><label style={{ ...LS, fontSize: 10 }}>Email</label><input value={f.email} onChange={e => s("email", e.target.value)} style={ISsm} placeholder="email" /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 2 }}>
        <input type="checkbox" checked={f.es_principal} onChange={e => s("es_principal", e.target.checked)} />
        <span style={{ fontSize: 10, color: B.sand }}>Principal</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={() => { if (f.nombre.trim()) onSave(f); }} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{"\u2713"}</button>
        <button onClick={onCancel} style={{ background: B.navyLight, color: B.white, border: "none", borderRadius: 6, padding: "7px 10px", fontSize: 11, cursor: "pointer" }}>{"\u2715"}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// CONTACTOS LIST (reusable for aliado or locacion)
// ═══════════════════════════════════════════════
function ContactosList({ contactos, onAdd, onDelete, showAddForm, setShowAddForm }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Contactos ({contactos.length})</div>
      {contactos.map(c => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${B.navyLight}22` }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: c.es_principal ? B.sand + "33" : B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: c.es_principal ? B.sand : "rgba(255,255,255,0.5)", flexShrink: 0 }}>
            {c.nombre.split(" ").map(w => w[0]).join("").slice(0, 2)}
          </div>
          <div style={{ flex: 1, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{c.nombre}</span>
            {c.cargo && <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>({c.cargo})</span>}
            {c.es_principal && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: B.sand + "22", color: B.sand, marginLeft: 8 }}>Principal</span>}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "flex", gap: 12 }}>
            {c.telefono && <span>{c.telefono}</span>}
            {c.email && <span>{c.email}</span>}
          </div>
          <button onClick={() => onDelete(c.id)} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 12, opacity: 0.5 }}>{"\u2715"}</button>
        </div>
      ))}
      {showAddForm ? (
        <ContactoInlineForm onSave={onAdd} onCancel={() => setShowAddForm(false)} />
      ) : (
        <button onClick={() => setShowAddForm(true)} style={{ background: "none", border: `1px dashed ${B.navyLight}`, borderRadius: 6, padding: "6px 14px", color: B.sky, fontSize: 11, cursor: "pointer", marginTop: 8 }}>+ Agregar Contacto</button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// CONVENIOS SECTION
// ═══════════════════════════════════════════════
function ConveniosSection({ aliadoId, comisionBase }) {
  const [convenios, setConvenios] = useState([]);
  const [pasadiasDB, setPasadiasDB] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const fetchConvenios = useCallback(async () => {
    if (!supabase) return;
    // Fetch pasadias reales para tarifas publicas
    const { data: pasData } = await supabase.from("pasadias").select("id, nombre, precio, precio_neto_agencia").eq("activo", true).order("orden");
    setPasadiasDB(pasData || []);

    const { data } = await supabase.from("b2b_convenios").select("*").eq("aliado_id", aliadoId).order("tipo_pasadia");
    if (data && data.length > 0) {
      // Sync tarifas publicas from pasadias table
      const updated = data.map(c => {
        const pas = (pasData || []).find(p => p.nombre === c.tipo_pasadia);
        return { ...c, tarifa_publica: pas?.precio || c.tarifa_publica };
      });
      setConvenios(updated);
    } else if (data && data.length === 0 && pasData && pasData.length > 0) {
      // Auto-seed from real pasadias
      const seeds = pasData.map(p => ({
        id: `CONV-${aliadoId}-${p.nombre.replace(/\s/g, "")}`,
        aliado_id: aliadoId,
        tipo_pasadia: p.nombre,
        tarifa_publica: p.precio,
        tarifa_neta: p.precio_neto_agencia || Math.round(p.precio * (1 - (comisionBase || 12) / 100)),
        comision_pct: comisionBase || 12,
        activo: true,
      }));
      await supabase.from("b2b_convenios").insert(seeds);
      const { data: fresh } = await supabase.from("b2b_convenios").select("*").eq("aliado_id", aliadoId).order("tipo_pasadia");
      setConvenios((fresh || []).map(c => {
        const pas = pasData.find(p => p.nombre === c.tipo_pasadia);
        return { ...c, tarifa_publica: pas?.precio || c.tarifa_publica };
      }));
    }
    setLoaded(true);
  }, [aliadoId, comisionBase]);

  useEffect(() => { fetchConvenios(); }, [fetchConvenios]);

  const updateConvenio = async (id, field, value) => {
    if (!supabase) return;
    const numVal = Number(value) || 0;
    const updates = { [field]: numVal };
    await supabase.from("b2b_convenios").update(updates).eq("id", id);
    setConvenios(p => p.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const toggleActivo = async (id) => {
    const conv = convenios.find(c => c.id === id);
    await supabase.from("b2b_convenios").update({ activo: !conv.activo }).eq("id", id);
    setConvenios(p => p.map(c => c.id === id ? { ...c, activo: !c.activo } : c));
  };

  if (!loaded) return <div style={{ color: "rgba(255,255,255,0.3)", padding: 20, fontSize: 13 }}>Cargando convenios...</div>;

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Pasadia", "Tarifa Publica", "Tarifa Neta Agencia", "Activo"].map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: h === "Pasadia" ? "left" : "center", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${B.navyLight}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {convenios.map(c => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${B.navyLight}`, opacity: c.activo ? 1 : 0.4 }}>
              <td style={{ padding: "12px", fontSize: 14, fontWeight: 600 }}>{c.tipo_pasadia}</td>
              <td style={{ padding: "12px", textAlign: "center", fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{COP(c.tarifa_publica)}</td>
              <td style={{ padding: "12px", textAlign: "center" }}>
                <input type="number" value={c.tarifa_neta} onChange={e => updateConvenio(c.id, "tarifa_neta", e.target.value)}
                  style={{ ...ISsm, width: 140, textAlign: "right", color: B.sand, fontWeight: 700 }} />
              </td>
              <td style={{ padding: "12px", textAlign: "center" }}>
                <button onClick={() => toggleActivo(c.id)} style={{ background: c.activo ? B.success + "22" : B.navyLight, color: c.activo ? B.success : "rgba(255,255,255,0.4)", border: "none", borderRadius: 12, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>{c.activo ? "Si" : "No"}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>Las tarifas publicas vienen del modulo Pasadias. Solo la tarifa neta es editable por aliado.</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// HISTORIAL RESERVAS B2B (inside ficha)
const STATUS_CFG = {
  confirmado:            { color: "#4CAF7D", label: "Confirmado" },
  pendiente:             { color: "#E8A020", label: "Pendiente" },
  cancelado:             { color: "#D64545", label: "Cancelado" },
  pendiente_pago:        { color: "#8ECAE6", label: "Pend. Pago" },
  pendiente_comprobante: { color: "#E8A020", label: "Pend. Comprobante" },
  pagado:                { color: "#4CAF7D", label: "Pagado" },
};
const ESTADOS = ["confirmado", "pendiente", "pendiente_pago", "pendiente_comprobante", "cancelado"];
const FORMAS_PAGO = ["wompi", "transferencia", "transferencia_hold", "transferencia_comprobante", "cliente_paga", "efectivo", "otro"];

function HistorialReservasB2B({ aliadoId }) {
  const [reservas, setReservas]   = useState([]);
  const [salidas, setSalidas]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null); // reserva id
  const [editForm, setEditForm]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [uploadingComp, setUploadingComp] = useState(false);
  const [savedOk, setSavedOk]     = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelForm, setCancelForm] = useState({ tipo: "credito", motivo: "", solicitadoPor: "" });
  // Disponibilidad al editar fecha
  const [dispMap, setDispMap]       = useState({});   // { salida_id: paxVendidos }
  const [cierresDia, setCierresDia] = useState([]);
  const [overridesDia, setOverridesDia] = useState({});
  const [checkingDisp, setCheckingDisp] = useState(false);
  // Historial y pago
  const [historial, setHistorial]     = useState([]);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [pagoForm, setPagoForm]       = useState({ metodo: "transferencia", monto: 0, nota: "", usuario: "" });
  const [uploadingPago, setUploadingPago] = useState(false);

  // ── Log helper ─────────────────────────────────────────────────────────
  const logHistorial = useCallback(async (reservaId, accion, descripcion, valAntes = null, valDespues = null, usuario = "admin") => {
    if (!supabase) return;
    await supabase.from("reservas_historial").insert({
      id: `H-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      reserva_id: reservaId, accion, descripcion,
      valor_anterior: valAntes, valor_nuevo: valDespues, usuario,
    });
  }, []);

  const fetchHistorial = useCallback(async (reservaId) => {
    if (!supabase || !reservaId) return;
    const { data } = await supabase.from("reservas_historial").select("*").eq("reserva_id", reservaId).order("created_at", { ascending: false });
    setHistorial(data || []);
  }, []);

  const fetchR = useCallback(async () => {
    if (!supabase) return;
    const [resR, salR] = await Promise.all([
      supabase.from("reservas").select("*").eq("aliado_id", aliadoId).order("fecha", { ascending: false }).limit(100),
      supabase.from("salidas").select("id,hora,nombre").eq("activo", true).order("orden"),
    ]);
    setReservas(resR.data || []);
    setSalidas(salR.data || []);
    setLoading(false);
  }, [aliadoId]);

  useEffect(() => { fetchR(); }, [fetchR]);

  const checkDisponibilidad = async (fecha) => {
    if (!supabase || !fecha) return;
    setCheckingDisp(true);
    const [resR, cierreR, ovrR] = await Promise.all([
      supabase.from("reservas").select("salida_id, pax").eq("fecha", fecha).neq("estado", "cancelado"),
      supabase.from("cierres").select("*").eq("fecha", fecha).eq("activo", true),
      supabase.from("salidas_override").select("*").eq("fecha", fecha),
    ]);
    const map = {};
    (resR.data || []).forEach(r => { map[r.salida_id] = (map[r.salida_id] || 0) + (r.pax || 0); });
    setDispMap(map);
    setCierresDia(cierreR.data || []);
    const ovrMap = {};
    (ovrR.data || []).forEach(o => { ovrMap[o.salida_id] = o; });
    setOverridesDia(ovrMap);
    setCheckingDisp(false);
  };

  const getSalidasDisponibles = (paxTotal) => {
    const cierre = cierresDia.find(c => c.activo);
    return salidas.filter(s => {
      const ovr = overridesDia[s.id];
      if (ovr) return ovr.accion === "abrir";
      if (cierre) {
        if (cierre.tipo === "total") return false;
        if ((cierre.salidas || []).includes(s.id)) return false;
      }
      if (!s.auto_apertura) return true;
      if (paxTotal >= 10) return true;
      const fijas = salidas.filter(f => !f.auto_apertura);
      return fijas.every(f => (dispMap[f.id] || 0) / (f.capacidad_total || 1) >= 0.9);
    });
  };

  const openEdit = (r) => {
    setSelected(r.id);
    setEditForm({
      nombre: r.nombre || "", contacto: r.contacto || "", fecha: r.fecha || "",
      tipo: r.tipo || "", salida_id: r.salida_id || "", pax_a: r.pax_a || 1,
      pax_n: r.pax_n || 0, estado: r.estado || "pendiente",
      forma_pago: r.forma_pago || "", abono: r.abono || 0, total: r.total || 0,
      notas: r.notas || "",
    });
    setSavedOk(false);
    setHistorial([]);
    if (r.fecha) checkDisponibilidad(r.fecha);
    fetchHistorial(r.id);
  };

  const handleSave = async () => {
    if (!supabase || saving) return;
    setSaving(true);
    const pax = (editForm.pax_a || 1) + (editForm.pax_n || 0);
    const saldo = (editForm.total || 0) - (editForm.abono || 0);

    // Detectar qué cambió para el log
    const changes = [];
    if (sel.estado !== editForm.estado) changes.push(`Estado: ${sel.estado} → ${editForm.estado}`);
    if (sel.fecha !== editForm.fecha) changes.push(`Fecha: ${sel.fecha} → ${editForm.fecha}`);
    if (sel.salida_id !== editForm.salida_id) changes.push(`Horario: ${sel.salida_id || "ninguno"} → ${editForm.salida_id || "ninguno"}`);
    if (sel.pax !== pax) changes.push(`Pax: ${sel.pax} → ${pax}`);
    if (sel.total !== editForm.total) changes.push(`Total: ${COP(sel.total)} → ${COP(editForm.total)}`);
    if (sel.abono !== editForm.abono) changes.push(`Abono: ${COP(sel.abono)} → ${COP(editForm.abono)}`);
    if (sel.nombre !== editForm.nombre) changes.push(`Nombre: ${sel.nombre} → ${editForm.nombre}`);
    if (sel.notas !== editForm.notas) changes.push("Notas actualizadas");

    await supabase.from("reservas").update({
      nombre: editForm.nombre, contacto: editForm.contacto, fecha: editForm.fecha,
      tipo: editForm.tipo, salida_id: editForm.salida_id || null,
      pax_a: editForm.pax_a, pax_n: editForm.pax_n, pax,
      estado: editForm.estado,
      abono: editForm.abono, saldo, total: editForm.total,
      notas: editForm.notas, updated_at: new Date().toISOString(),
    }).eq("id", selected);

    if (changes.length > 0) {
      await logHistorial(selected, "modificacion", changes.join(" · "),
        { estado: sel.estado, fecha: sel.fecha, pax: sel.pax, total: sel.total },
        { estado: editForm.estado, fecha: editForm.fecha, pax, total: editForm.total }
      );
    }

    setSaving(false); setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2500);
    fetchR(); fetchHistorial(selected);
  };

  const handleCancel = () => {
    setCancelForm({ tipo: "credito", motivo: "", solicitadoPor: "" });
    setShowCancelModal(true);
  };

  const confirmCancel = async () => {
    if (!supabase || !selected || !cancelForm.motivo.trim()) return;
    setSaving(true);
    const abonoRecibido = editForm.abono || 0;

    if (cancelForm.tipo === "credito" && abonoRecibido > 0) {
      // Generar crédito para la agencia
      await supabase.from("b2b_creditos").insert({
        id: `CRED-${Date.now()}`, aliado_id: aliadoId, reserva_id: selected,
        monto: abonoRecibido, motivo: `Cancelación reserva ${selected} — ${cancelForm.motivo}`,
        usado: 0, estado: "activo", created_by: cancelForm.solicitadoPor || "admin",
      });
      await supabase.from("reservas").update({
        estado: "cancelado", credito_generado: abonoRecibido,
        notas: `[CANCELADO — Crédito generado: ${abonoRecibido}] ${editForm.notas || ""}`.trim(),
      }).eq("id", selected);

    } else if (cancelForm.tipo === "reembolso" && abonoRecibido > 0) {
      // Crear solicitud de reembolso — requiere aprobación de gerencia
      const reembolsoId = `REMB-${Date.now()}`;
      await supabase.from("reembolsos").insert({
        id: reembolsoId, aliado_id: aliadoId, reserva_id: selected,
        monto: abonoRecibido, motivo: cancelForm.motivo,
        estado: "pendiente_aprobacion", solicitado_por: cancelForm.solicitadoPor || "admin",
      });
      await supabase.from("reservas").update({
        estado: "cancelado", reembolso_id: reembolsoId,
        notas: `[CANCELADO — Reembolso solicitado ${reembolsoId}] ${editForm.notas || ""}`.trim(),
      }).eq("id", selected);

    } else {
      // Sin pago recibido — cancelar sin crédito/reembolso
      await supabase.from("reservas").update({
        estado: "cancelado",
        notas: `[CANCELADO — ${cancelForm.motivo}] ${editForm.notas || ""}`.trim(),
      }).eq("id", selected);
    }

    const logDesc = cancelForm.tipo === "credito"
      ? `Cancelado · Crédito generado ${COP(abonoRecibido)} para la agencia · ${cancelForm.motivo}`
      : cancelForm.tipo === "reembolso"
      ? `Cancelado · Reembolso ${COP(abonoRecibido)} pendiente aprobación gerencia · ${cancelForm.motivo}`
      : `Cancelado sin devolución · ${cancelForm.motivo}`;
    await logHistorial(selected, "cancelacion", logDesc, { estado: sel.estado }, { estado: "cancelado" }, cancelForm.solicitadoPor || "admin");
    setSaving(false); setShowCancelModal(false); setSelected(null); setEditForm(null); fetchR();
  };

  const handleComprobanteUpload = async (file) => {
    if (!file || !supabase) return;
    setUploadingComp(true);
    const ext = file.name.split(".").pop();
    const path = `comp-${selected}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("comprobantes").upload(path, file, { upsert: true });
    if (upErr) { alert("Error subiendo comprobante"); setUploadingComp(false); return; }
    const { data: urlData } = supabase.storage.from("comprobantes").getPublicUrl(path);
    await supabase.from("reservas").update({
      comprobante_url: urlData.publicUrl,
      estado: "confirmado", abono: editForm.total, saldo: 0,
    }).eq("id", selected);
    await logHistorial(selected, "comprobante_subido", `Comprobante de pago subido — Reserva confirmada · ${COP(editForm.total)}`);
    setUploadingComp(false);
    setEditForm(f => ({ ...f, estado: "confirmado", abono: f.total }));
    fetchR(); fetchHistorial(selected);
  };

  // ── KPIs ────────────────────────────────────────────────────────────────
  const activas = reservas.filter(r => r.estado !== "cancelado");
  const totalRev = activas.reduce((s, r) => s + (r.total || 0), 0);
  const totalPax = activas.reduce((s, r) => s + (r.pax || 0), 0);
  const pendientes = reservas.filter(r => ["pendiente_pago","pendiente_comprobante","pendiente"].includes(r.estado)).length;

  const sel = reservas.find(r => r.id === selected);

  const ef = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Total Reservas", val: reservas.length, color: B.sky },
          { label: "Pax Total", val: totalPax, color: B.sand },
          { label: "Revenue Neto", val: COP(totalRev), color: B.success },
          { label: "Pendientes", val: pendientes, color: B.warning },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "12px 16px", flex: 1, borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 360px" : "1fr", gap: 16 }}>
        {/* ── TABLA ─────────────────────────────────────────────────── */}
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          {loading && <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>}
          {!loading && reservas.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay reservas de este aliado</div>}
          {!loading && reservas.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {["Fecha","Huesped","Tipo","Pax","Total","Estado",""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${B.navyLight}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {reservas.map(r => {
                  const sc = STATUS_CFG[r.estado] || { color: B.navyLight, label: r.estado };
                  const isActive = selected === r.id;
                  return (
                    <tr key={r.id} onClick={() => isActive ? (setSelected(null), setEditForm(null)) : openEdit(r)}
                      style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", background: isActive ? B.navyLight + "55" : "transparent" }}>
                      <td style={{ padding: "10px 14px", fontSize: 13 }}>{fmtFecha(r.fecha)}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{r.nombre}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12 }}>{r.tipo}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, textAlign: "center" }}>{r.pax}</td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: B.sand, fontWeight: 600 }}>{COP(r.total)}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 10, background: sc.color + "22", color: sc.color, whiteSpace: "nowrap" }}>{sc.label}</span>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>✎</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── PANEL EDICION ─────────────────────────────────────────── */}
        {selected && editForm && sel && (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h4 style={{ fontSize: 15, color: B.sand }}>Editar Reserva</h4>
              <button onClick={() => { setSelected(null); setEditForm(null); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>{sel.id}</div>

            {/* Estado */}
            <div>
              <label style={LS}>Estado</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ESTADOS.map(e => {
                  const sc = STATUS_CFG[e] || { color: B.navyLight };
                  const isConfirmar = e === "confirmado";
                  return (
                    <button key={e} onClick={() => {
                      if (isConfirmar && editForm.estado !== "confirmado") {
                        // Abrir modal de pago para confirmar
                        setPagoForm({ metodo: "transferencia", monto: (editForm.total || 0) - (editForm.abono || 0), nota: "", usuario: "", _wompiRef: "" });
                        setShowPagoModal(true);
                      } else {
                        ef("estado", e);
                      }
                    }}
                      style={{ padding: "5px 12px", borderRadius: 8, border: `2px solid ${editForm.estado === e ? sc.color : B.navyLight}`, background: editForm.estado === e ? sc.color + "22" : "transparent", color: editForm.estado === e ? sc.color : "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", fontWeight: editForm.estado === e ? 700 : 400 }}>
                      {STATUS_CFG[e]?.label || e}{isConfirmar && editForm.estado !== "confirmado" ? " →" : ""}
                    </button>
                  );
                })}
              </div>
              {editForm.estado !== "confirmado" && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 5 }}>Para confirmar usa "Confirmar →" — se pedirá el método de pago</div>}
            </div>

            {/* Datos básicos */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Nombre huesped</label>
                <input value={editForm.nombre} onChange={e => ef("nombre", e.target.value)} style={IS} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Contacto / Teléfono</label>
                <input value={editForm.contacto} onChange={e => ef("contacto", e.target.value)} style={IS} />
              </div>
              <div>
                <label style={LS}>Adultos</label>
                <input type="number" min={1} value={editForm.pax_a} onChange={e => {
                  const paxA = +e.target.value;
                  const paxN = editForm.pax_n || 0;
                  const precioU = sel.precio_u || sel.precio_neto || 0;
                  setEditForm(f => ({ ...f, pax_a: paxA, total: (paxA + paxN) * precioU }));
                }} style={IS} />
              </div>
              <div>
                <label style={LS}>Niños</label>
                <input type="number" min={0} value={editForm.pax_n} onChange={e => {
                  const paxN = +e.target.value;
                  const paxA = editForm.pax_a || 1;
                  const precioU = sel.precio_u || sel.precio_neto || 0;
                  setEditForm(f => ({ ...f, pax_n: paxN, total: (paxA + paxN) * precioU }));
                }} style={IS} />
              </div>
              {/* Alerta cargo por personas adicionales */}
              {(() => {
                const paxOriginal = sel.pax || 0;
                const paxNuevo = (editForm.pax_a || 1) + (editForm.pax_n || 0);
                const paxExtra = paxNuevo - paxOriginal;
                const precioU = sel.precio_u || sel.precio_neto || 0;
                if (paxExtra <= 0) return null;
                return (
                  <div style={{ gridColumn: "1/-1", padding: "10px 14px", borderRadius: 8, background: B.warning + "22", border: `1px solid ${B.warning + "44"}`, fontSize: 12, color: B.warning }}>
                    ⚠️ +{paxExtra} persona{paxExtra > 1 ? "s" : ""} adicional — nuevo total: <strong>{COP((editForm.pax_a + editForm.pax_n) * precioU)}</strong> (se actualiza automáticamente)
                  </div>
                );
              })()}
            </div>

            {/* Fecha + disponibilidad */}
            <div>
              <label style={LS}>Fecha</label>
              <input type="date" value={editForm.fecha}
                onChange={e => { ef("fecha", e.target.value); ef("salida_id", ""); checkDisponibilidad(e.target.value); }}
                onClick={e => { try { e.target.showPicker(); } catch(_) {} }}
                style={IS} />
            </div>

            {/* Horarios disponibles para la fecha */}
            {editForm.fecha && (() => {
              const paxT = (editForm.pax_a || 1) + (editForm.pax_n || 0);
              const diaCompleto = cierresDia.some(c => c.tipo === "total");
              if (diaCompleto) return (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: B.danger + "22", color: B.danger, fontSize: 12 }}>
                  ✕ Día cerrado — {cierresDia[0]?.motivo || "Sin servicio este día"}
                </div>
              );
              const disponibles = getSalidasDisponibles(paxT);
              if (checkingDisp) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 8 }}>Verificando disponibilidad...</div>;
              if (disponibles.length === 0) return <div style={{ fontSize: 12, color: B.danger, padding: 8 }}>No hay horarios disponibles para esta fecha</div>;
              return (
                <div>
                  <label style={LS}>Horario disponible</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {disponibles.map(s => {
                      const vendidos = dispMap[s.id] || 0;
                      const cap = s.capacidad_total || 0;
                      const libre = cap - vendidos;
                      const lleno = libre < paxT;
                      const selected2 = editForm.salida_id === s.id;
                      return (
                        <div key={s.id} onClick={() => !lleno && ef("salida_id", s.id)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, border: `2px solid ${selected2 ? B.sky : lleno ? B.danger + "44" : B.navyLight}`, background: selected2 ? B.sky + "15" : "transparent", cursor: lleno ? "default" : "pointer", opacity: lleno ? 0.5 : 1 }}>
                          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: selected2 ? B.sky : B.white, minWidth: 50 }}>{s.hora}</span>
                          <div style={{ flex: 1, fontSize: 12 }}>
                            <div style={{ color: "rgba(255,255,255,0.5)" }}>{s.nombre}</div>
                          </div>
                          <div style={{ textAlign: "right", fontSize: 11 }}>
                            {lleno
                              ? <span style={{ color: B.danger }}>Sin cupo ({libre} libre)</span>
                              : <span style={{ color: B.success }}>{libre} cupos</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Total — calculado automáticamente, no editable */}
            <div>
              <label style={LS}>Total reserva</label>
              <div style={{ padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                  {(editForm.pax_a || 1) + (editForm.pax_n || 0)} pax × {COP(sel.precio_u || sel.precio_neto || 0)}
                </span>
                <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: B.sand }}>
                  {COP(editForm.total)}
                </span>
              </div>
            </div>

            {/* Resumen de pago */}
            <div style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Total</span>
                <span style={{ fontWeight: 700 }}>{COP(editForm.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Abonado</span>
                <span style={{ color: B.success, fontWeight: 600 }}>{COP(editForm.abono || 0)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${B.navyLight}`, paddingTop: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Saldo</span>
                <span style={{ fontWeight: 700, color: (editForm.total - (editForm.abono || 0)) > 0 ? B.danger : B.success }}>
                  {COP((editForm.total || 0) - (editForm.abono || 0))}
                </span>
              </div>
              {sel.forma_pago && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Forma de pago</span>
                  <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: B.navyLight, color: B.sky }}>{sel.forma_pago.replace(/_/g, " ")}</span>
                </div>
              )}
            </div>

            {/* Acción de pago */}
            {(editForm.total - (editForm.abono || 0)) > 0 && (
              <button onClick={() => { setPagoForm({ metodo: "transferencia", monto: (editForm.total - (editForm.abono || 0)), nota: "", usuario: "" }); setShowPagoModal(true); }}
                style={{ width: "100%", padding: "11px", borderRadius: 8, border: `2px solid ${B.success + "55"}`, background: B.success + "15", color: B.success, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                💳 Registrar pago
              </button>
            )}

            {/* Notas */}
            <div>
              <label style={LS}>Notas</label>
              <textarea value={editForm.notas} onChange={e => ef("notas", e.target.value)}
                style={{ ...IS, resize: "vertical", minHeight: 60 }} />
            </div>

            {/* Comprobante */}
            {sel.comprobante_url ? (
              <a href={sel.comprobante_url} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: B.success + "22", color: B.success, borderRadius: 8, fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
                📎 Ver comprobante subido
              </a>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: B.navyLight + "44", borderRadius: 8, cursor: "pointer", border: `1px dashed ${B.navyLight}` }}>
                <span style={{ fontSize: 18 }}>{uploadingComp ? "⏳" : "📎"}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{uploadingComp ? "Subiendo..." : "Subir comprobante"}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Imagen o PDF del pago</div>
                </div>
                <input type="file" accept="image/*,.pdf" style={{ display: "none" }} disabled={uploadingComp}
                  onChange={e => e.target.files[0] && handleComprobanteUpload(e.target.files[0])} />
              </label>
            )}

            {/* Historial de la reserva */}
            <div>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Historial</div>
              {historial.length === 0
                ? <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "10px 0" }}>Sin historial aún</div>
                : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 200, overflowY: "auto" }}>
                    {historial.map((h, i) => {
                      const iconMap = { creado: "🟢", modificacion: "✏️", comprobante_subido: "📎", pago_registrado: "💳", cancelacion: "🔴", reembolso_solicitado: "💸", nota: "📝" };
                      return (
                        <div key={h.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < historial.length - 1 ? `1px solid ${B.navyLight}` : "none" }}>
                          <div style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{iconMap[h.accion] || "•"}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: B.white }}>{h.descripcion}</div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                              {new Date(h.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              {h.usuario && h.usuario !== "admin" && ` · ${h.usuario}`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>

            {/* Botones */}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {sel.estado !== "cancelado" && (
                <button onClick={handleCancel}
                  style={{ padding: "10px", borderRadius: 8, border: `1px solid ${B.danger + "55"}`, background: "none", color: B.danger, fontSize: 12, cursor: "pointer" }}>
                  Cancelar
                </button>
              )}
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: savedOk ? B.success : B.sky, color: savedOk ? B.white : B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {saving ? "Guardando..." : savedOk ? "✓ Guardado" : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL REGISTRAR PAGO ──────────────────────────────────── */}
      {showPagoModal && sel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={e => e.target === e.currentTarget && setShowPagoModal(false)}>
          <div style={{ background: B.navyMid, borderRadius: 20, padding: 32, width: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, marginBottom: 4 }}>💳 Registrar Pago</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{sel.nombre} · Saldo: {COP((editForm?.total || 0) - (editForm?.abono || 0))}</p>

            {/* Método */}
            <div style={{ marginBottom: 16 }}>
              <label style={LS}>¿Cómo pagó?</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { val: "transferencia", icon: "🏦", label: "Transferencia" },
                  { val: "wompi", icon: "💜", label: "Wompi" },
                  { val: "efectivo", icon: "💵", label: "Efectivo" },
                  { val: "otro", icon: "📋", label: "Otro" },
                ].map(m => (
                  <div key={m.val} onClick={() => setPagoForm(f => ({ ...f, metodo: m.val }))}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: `2px solid ${pagoForm.metodo === m.val ? B.sky : B.navyLight}`, background: pagoForm.metodo === m.val ? B.sky + "15" : B.navy, cursor: "pointer" }}>
                    <span style={{ fontSize: 18 }}>{m.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: pagoForm.metodo === m.val ? 700 : 400, color: pagoForm.metodo === m.val ? B.sky : B.white }}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Monto */}
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Monto recibido</label>
              <input type="number" value={pagoForm.monto} onChange={e => setPagoForm(f => ({ ...f, monto: +e.target.value }))} style={IS} />
            </div>

            {/* TRANSFERENCIA: subir comprobante (obligatorio) */}
            {pagoForm.metodo === "transferencia" && (
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Comprobante de transferencia *</label>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: pagoForm._comprob ? B.success + "15" : B.navyLight + "44", borderRadius: 8, cursor: "pointer", border: `2px dashed ${pagoForm._comprob ? B.success : B.warning + "66"}` }}>
                  <span style={{ fontSize: 20 }}>{uploadingPago ? "⏳" : pagoForm._comprob ? "✅" : "📎"}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: pagoForm._comprob ? B.success : B.white }}>
                      {uploadingPago ? "Subiendo..." : pagoForm._comprob ? "Comprobante adjunto ✓" : "Subir foto/PDF del recibo *"}
                    </div>
                    {!pagoForm._comprob && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Requerido para confirmar por transferencia</div>}
                  </div>
                  <input type="file" accept="image/*,.pdf" style={{ display: "none" }} disabled={uploadingPago}
                    onChange={async e => {
                      const file = e.target.files[0]; if (!file) return;
                      setUploadingPago(true);
                      const ext = file.name.split(".").pop();
                      const path = `comp-${sel.id}-${Date.now()}.${ext}`;
                      await supabase.storage.from("comprobantes").upload(path, file, { upsert: true });
                      const { data: u } = supabase.storage.from("comprobantes").getPublicUrl(path);
                      await supabase.from("reservas").update({ comprobante_url: u.publicUrl }).eq("id", sel.id);
                      setPagoForm(f => ({ ...f, _comprob: u.publicUrl }));
                      setUploadingPago(false);
                    }} />
                </label>
              </div>
            )}

            {/* WOMPI: número de referencia O enviar link */}
            {pagoForm.metodo === "wompi" && (
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Número de referencia Wompi</label>
                <input value={pagoForm._wompiRef || ""} onChange={e => setPagoForm(f => ({ ...f, _wompiRef: e.target.value }))}
                  placeholder="Ej: 123456789 (aparece en el correo de Wompi)" style={{ ...IS, marginBottom: 10 }} />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>— o —</div>
                <button onClick={async () => {
                  const { wompiCheckoutUrl } = await import("../lib/wompi.js");
                  const url = await wompiCheckoutUrl({ referencia: sel.id + "-R2", totalCOP: pagoForm.monto });
                  const linkPago = `${window.location.origin}/pago/${sel.id}`;
                  navigator.clipboard.writeText(linkPago);
                  alert(`Link copiado al portapapeles:\n${linkPago}`);
                }}
                  style={{ width: "100%", padding: "10px", background: "#5B4CF5" + "22", border: `1px solid #5B4CF5`, borderRadius: 8, color: "#a99bf5", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  📲 Copiar link de pago para enviar al cliente
                </button>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Nota (opcional)</label>
              <input value={pagoForm.nota} onChange={e => setPagoForm(f => ({ ...f, nota: e.target.value }))} placeholder="Banco, referencia adicional, observaciones..." style={IS} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={LS}>Registrado por</label>
              <input value={pagoForm.usuario} onChange={e => setPagoForm(f => ({ ...f, usuario: e.target.value }))} placeholder="Tu nombre" style={IS} />
            </div>

            {/* Validación por método */}
            {pagoForm.metodo === "transferencia" && !pagoForm._comprob && (
              <div style={{ padding: "8px 12px", background: B.warning + "22", borderRadius: 8, fontSize: 12, color: B.warning, marginBottom: 12 }}>
                ⚠️ Sube el comprobante para confirmar el pago por transferencia
              </div>
            )}
            {pagoForm.metodo === "wompi" && !pagoForm._wompiRef && (
              <div style={{ padding: "8px 12px", background: B.sky + "15", borderRadius: 8, fontSize: 12, color: B.sky, marginBottom: 12 }}>
                Agrega el número de referencia de Wompi para el registro, o envía el link al cliente para que pague directamente.
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowPagoModal(false)} style={{ flex: 1, padding: "12px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button disabled={!pagoForm.monto || uploadingPago || (pagoForm.metodo === "transferencia" && !pagoForm._comprob)} onClick={async () => {
                if (!supabase || !pagoForm.monto) return;
                const nuevoAbono = (editForm.abono || 0) + pagoForm.monto;
                const nuevoSaldo = (editForm.total || 0) - nuevoAbono;
                const nuevoEstado = nuevoSaldo <= 0 ? "confirmado" : editForm.estado;
                await supabase.from("reservas").update({
                  abono: nuevoAbono, saldo: nuevoSaldo, estado: nuevoEstado,
                  forma_pago: pagoForm.metodo, updated_at: new Date().toISOString(),
                }).eq("id", sel.id);
                const refWompi = pagoForm._wompiRef ? ` · Ref. Wompi: ${pagoForm._wompiRef}` : "";
                const desc = `Pago registrado: ${COP(pagoForm.monto)} vía ${pagoForm.metodo}${refWompi}${pagoForm.nota ? " — " + pagoForm.nota : ""}${nuevoSaldo <= 0 ? " · Reserva confirmada ✓" : ` · Saldo restante: ${COP(nuevoSaldo)}`}`;
                await logHistorial(sel.id, "pago_registrado", desc, { abono: editForm.abono, estado: editForm.estado }, { abono: nuevoAbono, estado: nuevoEstado }, pagoForm.usuario || "admin");
                // Asignar puntos solo si el vendedor no es admin
                if (nuevoEstado === "confirmado" && sel.vendedor_b2b_id) {
                  supabase.from("b2b_usuarios").select("rol").eq("id", sel.vendedor_b2b_id).single()
                    .then(({ data: usr }) => {
                      if (usr?.rol !== "admin") {
                        asignarPuntosReserva({
                          vendedorId: sel.vendedor_b2b_id,
                          agenteId: sel.aliado_id,
                          reservaId: sel.id,
                          pax: sel.pax || 1,
                          totalCOP: sel.total || 0,
                          fecha: sel.fecha,
                          esGrupo: (sel.pax || 0) >= 10,
                        }).catch(() => {});
                      }
                    }).catch(() => {});
                }
                setEditForm(f => ({ ...f, abono: nuevoAbono, estado: nuevoEstado }));
                setShowPagoModal(false);
                fetchR(); fetchHistorial(sel.id);
              }}
                style={{ flex: 2, padding: "12px", background: B.success, color: B.white, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Confirmar pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CANCELACIÓN ─────────────────────────────────────── */}
      {showCancelModal && sel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={e => e.target === e.currentTarget && setShowCancelModal(false)}>
          <div style={{ background: B.navyMid, borderRadius: 20, padding: 32, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, color: B.danger, marginBottom: 4 }}>Cancelar Reserva</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
              {sel.nombre} · {fmtFecha(sel.fecha)} · {COP(sel.total)}
              {sel.abono > 0 && <span style={{ color: B.warning }}> · Abono recibido: {COP(sel.abono)}</span>}
            </p>

            {/* Tipo de cancelación — solo si hay abono */}
            {(sel.abono || 0) > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={LS}>¿Qué hacemos con el abono de {COP(sel.abono)}?</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {[
                    { val: "credito", icon: "💳", title: "Crédito para la agencia", desc: `Genera un crédito de ${COP(sel.abono)} que puede usar en futuras reservas`, color: B.sky },
                    { val: "reembolso", icon: "💸", title: "Solicitar reembolso", desc: "Requiere aprobación de Gerencia General antes de procesar", color: B.warning },
                    { val: "ninguno", icon: "✕", title: "Sin devolución", desc: "Cancelación sin crédito ni reembolso (cargo por cancelación)", color: B.danger },
                  ].map(opt => (
                    <div key={opt.val} onClick={() => setCancelForm(f => ({ ...f, tipo: opt.val }))}
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 10, border: `2px solid ${cancelForm.tipo === opt.val ? opt.color : B.navyLight}`, background: cancelForm.tipo === opt.val ? opt.color + "15" : B.navy, cursor: "pointer" }}>
                      <span style={{ fontSize: 20 }}>{opt.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: cancelForm.tipo === opt.val ? opt.color : B.white }}>{opt.title}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{opt.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Motivo */}
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Motivo de cancelación *</label>
              <textarea value={cancelForm.motivo} onChange={e => setCancelForm(f => ({ ...f, motivo: e.target.value }))}
                placeholder="Describe el motivo de la cancelación..."
                style={{ ...IS, resize: "vertical", minHeight: 72 }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={LS}>Solicitado por</label>
              <input value={cancelForm.solicitadoPor} onChange={e => setCancelForm(f => ({ ...f, solicitadoPor: e.target.value }))} placeholder="Nombre del responsable" style={IS} />
            </div>

            {cancelForm.tipo === "reembolso" && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: B.warning + "15", border: `1px solid ${B.warning + "44"}`, fontSize: 12, color: B.warning, marginBottom: 16 }}>
                ⚠️ El reembolso quedará en estado <strong>Pendiente de Aprobación</strong> — Gerencia General debe aprobar antes de ejecutar el pago.
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCancelModal(false)} style={{ flex: 1, padding: "12px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Volver</button>
              <button onClick={confirmCancel} disabled={saving || !cancelForm.motivo.trim()}
                style={{ flex: 2, padding: "12px", background: !cancelForm.motivo.trim() ? B.navyLight : B.danger, color: B.white, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                {saving ? "Procesando..." : "Confirmar cancelación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CRÉDITOS DE LA AGENCIA ────────────────────────────────── */}
      <CreditosAgencia aliadoId={aliadoId} />
    </div>
  );
}

function CreditosAgencia({ aliadoId }) {
  const [creditos, setCreditos] = useState([]);
  const [reembolsos, setReembolsos] = useState([]);
  const [tab, setTab] = useState("creditos");

  useEffect(() => {
    if (!supabase) return;
    supabase.from("b2b_creditos").select("*").eq("aliado_id", aliadoId).order("created_at", { ascending: false }).then(({ data }) => setCreditos(data || []));
    supabase.from("reembolsos").select("*").eq("aliado_id", aliadoId).order("created_at", { ascending: false }).then(({ data }) => setReembolsos(data || []));
  }, [aliadoId]);

  const aprobarReembolso = async (id) => {
    if (!supabase) return;
    await supabase.from("reembolsos").update({ estado: "aprobado", aprobado_por: "Gerencia General", aprobado_at: new Date().toISOString() }).eq("id", id);
    const { data } = await supabase.from("reembolsos").select("*").eq("aliado_id", aliadoId).order("created_at", { ascending: false });
    setReembolsos(data || []);
  };

  const saldoCreditos = creditos.filter(c => c.estado === "activo").reduce((s, c) => s + (c.saldo || c.monto - c.usado || 0), 0);
  const pendientesRemb = reembolsos.filter(r => r.estado === "pendiente_aprobacion").length;

  if (creditos.length === 0 && reembolsos.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <button onClick={() => setTab("creditos")} style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === "creditos" ? 700 : 400, background: tab === "creditos" ? B.sky + "22" : B.navyMid, color: tab === "creditos" ? B.sky : "rgba(255,255,255,0.5)" }}>
          💳 Créditos {creditos.length > 0 && `· Saldo ${COP(saldoCreditos)}`}
        </button>
        <button onClick={() => setTab("reembolsos")} style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === "reembolsos" ? 700 : 400, background: tab === "reembolsos" ? B.warning + "22" : B.navyMid, color: tab === "reembolsos" ? B.warning : "rgba(255,255,255,0.5)" }}>
          💸 Reembolsos {pendientesRemb > 0 && <span style={{ background: B.danger, color: B.white, borderRadius: 8, padding: "1px 6px", fontSize: 10, marginLeft: 4 }}>{pendientesRemb}</span>}
        </button>
      </div>

      {tab === "creditos" && (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          {creditos.map(c => (
            <div key={c.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Crédito por cancelación</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{c.motivo}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{c.reserva_id} · {new Date(c.created_at).toLocaleDateString("es-CO")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(c.monto)}</div>
                {c.usado > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Usado: {COP(c.usado)}</div>}
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: c.estado === "activo" ? B.success + "22" : B.navyLight, color: c.estado === "activo" ? B.success : "rgba(255,255,255,0.4)" }}>{c.estado}</span>
              </div>
            </div>
          ))}
          {creditos.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay créditos</div>}
        </div>
      )}

      {tab === "reembolsos" && (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          {reembolsos.map(r => (
            <div key={r.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${B.navyLight}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: B.sand }}>{COP(r.monto)}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8,
                      background: r.estado === "pendiente_aprobacion" ? B.warning + "22" : r.estado === "aprobado" ? B.success + "22" : B.danger + "22",
                      color: r.estado === "pendiente_aprobacion" ? B.warning : r.estado === "aprobado" ? B.success : B.danger }}>
                      {r.estado === "pendiente_aprobacion" ? "Pend. Aprobación" : r.estado === "aprobado" ? "Aprobado ✓" : r.estado}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{r.motivo}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                    Solicitado por: {r.solicitado_por || "—"} · {new Date(r.created_at).toLocaleDateString("es-CO")}
                  </div>
                  {r.aprobado_por && <div style={{ fontSize: 11, color: B.success, marginTop: 2 }}>✓ Aprobado por: {r.aprobado_por}</div>}
                </div>
                {r.estado === "pendiente_aprobacion" && (
                  <button onClick={() => aprobarReembolso(r.id)}
                    style={{ padding: "8px 14px", background: B.success, color: B.white, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    ✓ Aprobar
                  </button>
                )}
              </div>
            </div>
          ))}
          {reembolsos.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay reembolsos</div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// VISITAS AGENCIA
// ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════
// EVENTOS / GRUPOS B2B
// ═══════════════════════════════════════════════
const STAGE_COLOR_EV = { Consulta: "#E8A020", Cotizado: "#38BDF8", Confirmado: "#22C55E", Realizado: "rgba(255,255,255,0.3)" };
const COP_EV = (n) => n ? "$" + Math.round(n).toLocaleString("es-CO") : "—";

function EventosGruposB2B({ aliadoId }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filterCat, setFilterCat] = useState("todos");
  const [editEvento, setEditEvento]       = useState(null);  // evento a editar
  const [verReservas, setVerReservas]     = useState(null);  // evento para ver invitados
  const [salidas, setSalidas]             = useState([]);
  const [aliados, setAliados]             = useState([]);
  const [vendedores, setVendedores]       = useState([]);

  const fetchItems = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("eventos").select("*")
      .eq("aliado_id", aliadoId).order("fecha", { ascending: false });
    setItems(data || []); setLoading(false);
  }, [aliadoId]);

  useEffect(() => {
    fetchItems();
    if (!supabase) return;
    // prefetch para EventoModal
    supabase.from("salidas").select("id, hora, nombre").eq("activo", true).order("orden").then(({ data }) => setSalidas(data || []));
    supabase.from("aliados_b2b").select("id, nombre, tipo").order("nombre").then(({ data }) => setAliados(data || []));
    supabase.from("usuarios").select("id, nombre").in("rol_id", ["ventas", "gerente_ventas"]).eq("activo", true).order("nombre").then(({ data }) => setVendedores(data || []));
  }, [fetchItems]);

  const filtered = items.filter(i => filterCat === "todos" || i.categoria === filterCat);

  const totales = {
    todos:   items.length,
    evento:  items.filter(i => i.categoria === "evento").length,
    grupo:   items.filter(i => i.categoria === "grupo").length,
    revenue: items.filter(i => i.stage === "Confirmado" || i.stage === "Realizado").reduce((s, i) => s + (i.valor || 0), 0),
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, color: B.sand, margin: 0 }}>Eventos & Grupos</h3>
        <div style={{ display: "flex", gap: 8 }}>
          {[["todos","Todos"], ["evento","Eventos"], ["grupo","Grupos"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilterCat(v)} style={{
              padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: filterCat === v ? B.sky : B.navy, color: filterCat === v ? B.navy : B.sand,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total", val: totales.todos, color: B.sand },
          { label: "Eventos", val: totales.evento, color: B.sky },
          { label: "Grupos", val: totales.grupo, color: "#A78BFA" },
          { label: "Revenue confirmado", val: COP_EV(totales.revenue), color: B.success },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Cargando...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎪</div>
          No hay {filterCat === "todos" ? "eventos ni grupos" : filterCat + "s"} registrados para este aliado.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(ev => (
            <div key={ev.id}
              onClick={() => setEditEvento(ev)}
              style={{ background: B.navy, borderRadius: 10, padding: "14px 16px",
                borderLeft: `3px solid ${STAGE_COLOR_EV[ev.stage] || B.sand}`,
                cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
              onMouseLeave={e => e.currentTarget.style.background = B.navy}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: B.white }}>{ev.nombre || ev.tipo}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: ev.categoria === "grupo" ? "#A78BFA33" : B.sky + "33", color: ev.categoria === "grupo" ? "#A78BFA" : B.sky, fontWeight: 600, textTransform: "uppercase" }}>
                      {ev.categoria === "grupo" ? "Grupo" : "Evento"}
                    </span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: (STAGE_COLOR_EV[ev.stage] || B.sand) + "22", color: STAGE_COLOR_EV[ev.stage] || B.sand, fontWeight: 600 }}>
                      {ev.stage}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {ev.fecha && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>📅 {new Date(ev.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}</span>}
                    {ev.pax > 0 && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>👥 {ev.pax} pax</span>}
                    {ev.tipo && ev.nombre !== ev.tipo && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>· {ev.tipo}</span>}
                    {ev.contacto && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>👤 {ev.contacto}</span>}
                  </div>
                  {ev.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6, fontStyle: "italic" }}>{ev.notas}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                  {ev.valor > 0 && <div style={{ fontSize: 15, fontWeight: 700, color: B.success }}>{COP_EV(ev.valor)}</div>}
                  {ev.categoria === "grupo" && (
                    <button onClick={e => { e.stopPropagation(); setVerReservas(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, cursor: "pointer", whiteSpace: "nowrap" }}>
                      👥 Ver invitados
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal editar evento */}
      {editEvento && (
        <EventoModal
          evento={editEvento}
          categoria={editEvento.categoria}
          salidas={salidas}
          aliados={aliados}
          vendedores={vendedores}
          onClose={() => setEditEvento(null)}
          onSaved={fetchItems}
          onShowLink={() => {}}
        />
      )}

      {/* Modal lista invitados */}
      {verReservas && (
        <ReservasGrupoModal evento={verReservas} onClose={() => setVerReservas(null)} />
      )}
    </div>
  );
}

const TIPOS_VISITA   = ["presencial", "virtual", "telefonica", "feria/evento"];
const ESTADOS_VISITA = ["programada", "realizada", "cancelada", "reprogramada"];
const ESTADO_VISITA_COLOR = { programada: B.sky, realizada: B.success, cancelada: B.danger, reprogramada: B.warning };

const EMPTY_VISITA = { fecha: "", hora: "", tipo: "presencial", objetivo: "", resultado: "", proxima_accion: "", fecha_proxima: "", realizada_por: "", notas: "", estado: "programada" };

function VisitasAgencia({ aliadoId, aliado }) {
  const [visitas, setVisitas]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editVisita, setEditVisita] = useState(null); // null = nueva, object = editar
  const [form, setForm]           = useState({ ...EMPTY_VISITA });
  const [saving, setSaving]       = useState(false);
  const [expanded, setExpanded]   = useState(null);

  const fetchV = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("b2b_visitas").select("*").eq("aliado_id", aliadoId).order("fecha", { ascending: false });
    setVisitas(data || []);
    setLoading(false);
  }, [aliadoId]);

  useEffect(() => { fetchV(); }, [fetchV]);

  const openNew = () => {
    setEditVisita(null);
    setForm({ ...EMPTY_VISITA });
    setShowForm(true);
  };

  const openEdit = (v) => {
    setEditVisita(v);
    setForm({ fecha: v.fecha, hora: v.hora || "", tipo: v.tipo, objetivo: v.objetivo || "", resultado: v.resultado || "", proxima_accion: v.proxima_accion || "", fecha_proxima: v.fecha_proxima || "", realizada_por: v.realizada_por || "", notas: v.notas || "", estado: v.estado });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!supabase || saving || !form.fecha) return;
    setSaving(true);
    if (editVisita) {
      await supabase.from("b2b_visitas").update({ ...form }).eq("id", editVisita.id);
    } else {
      await supabase.from("b2b_visitas").insert({ id: `VIS-${Date.now()}`, aliado_id: aliadoId, ...form });
    }
    setSaving(false); setShowForm(false); fetchV();
  };

  const handleDelete = async (id) => {
    if (!supabase || !confirm("¿Eliminar esta visita?")) return;
    await supabase.from("b2b_visitas").delete().eq("id", id);
    fetchV();
  };

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const proximas   = visitas.filter(v => v.estado === "programada" && v.fecha >= new Date().toISOString().slice(0,10));
  const realizadas = visitas.filter(v => v.estado === "realizada").length;

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Próximas visitas", val: proximas.length, color: B.sky },
          { label: "Realizadas",       val: realizadas,      color: B.success },
          { label: "Total registradas", val: visitas.length, color: B.sand },
        ].map(k => (
          <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "12px 18px", flex: 1, borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{k.val}</div>
          </div>
        ))}
        <button onClick={openNew} style={{ padding: "12px 22px", background: B.sand, color: B.navy, border: "none", borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
          + Nueva visita
        </button>
      </div>

      {/* Lista de visitas */}
      <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
        {loading && <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>}
        {!loading && visitas.length === 0 && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>No hay visitas registradas para {aliado.nombre}</div>
            <button onClick={openNew} style={{ marginTop: 16, padding: "10px 24px", background: B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Agendar primera visita</button>
          </div>
        )}

        {visitas.map((v, i) => {
          const color = ESTADO_VISITA_COLOR[v.estado] || B.navyLight;
          const isOpen = expanded === v.id;
          const esFutura = v.fecha >= new Date().toISOString().slice(0,10);

          return (
            <div key={v.id} style={{ borderBottom: i < visitas.length - 1 ? `1px solid ${B.navyLight}` : "none" }}>
              {/* Fila principal */}
              <div onClick={() => setExpanded(isOpen ? null : v.id)}
                style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", background: isOpen ? B.navyLight + "44" : "transparent" }}>
                {/* Icono tipo */}
                <div style={{ width: 40, height: 40, borderRadius: 10, background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  {{ presencial: "🤝", virtual: "💻", telefonica: "📞", "feria/evento": "🎪" }[v.tipo] || "📅"}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                      {new Date(v.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    {v.hora && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>· {v.hora}</span>}
                    {esFutura && v.estado === "programada" && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: B.sky + "22", color: B.sky }}>Próxima</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.objetivo || "Sin objetivo registrado"}
                    {v.realizada_por && <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.3)" }}>· {v.realizada_por}</span>}
                  </div>
                </div>

                {/* Tipo + Estado */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.navyLight, color: "rgba(255,255,255,0.5)" }}>{v.tipo}</span>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: color + "22", color }}>{v.estado}</span>
                </div>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Panel expandido */}
              {isOpen && (
                <div style={{ padding: "0 20px 20px", background: B.navy + "66" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontSize: 13, lineHeight: 2.4, marginBottom: 14 }}>
                    {v.objetivo && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>Objetivo: </span>{v.objetivo}</div>}
                    {v.resultado && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>Resultado: </span>{v.resultado}</div>}
                    {v.proxima_accion && (
                      <div style={{ gridColumn: "1/-1", padding: "8px 12px", background: B.sky + "15", borderRadius: 8, border: `1px solid ${B.sky + "33"}` }}>
                        <span style={{ color: B.sky, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Próxima acción: </span>
                        <span style={{ color: B.white }}>{v.proxima_accion}</span>
                        {v.fecha_proxima && <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>
                          · {new Date(v.fecha_proxima + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                        </span>}
                      </div>
                    )}
                    {v.notas && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>Notas: </span>{v.notas}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(v)} style={{ padding: "8px 16px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✎ Editar</button>
                    {v.estado === "programada" && (
                      <button onClick={async () => { await supabase.from("b2b_visitas").update({ estado: "realizada" }).eq("id", v.id); fetchV(); }}
                        style={{ padding: "8px 16px", background: B.success + "22", color: B.success, border: `1px solid ${B.success + "44"}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✓ Marcar realizada</button>
                    )}
                    <button onClick={() => handleDelete(v.id)} style={{ padding: "8px 14px", background: "none", color: B.danger, border: `1px solid ${B.danger + "44"}`, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal nueva/editar visita */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{ background: B.navyMid, borderRadius: 20, padding: 32, width: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, marginBottom: 4 }}>
              {editVisita ? "✎ Editar visita" : "📅 Nueva visita"} — {aliado.nombre}
            </h3>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24 }}>Registro de visita comercial</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* Fecha + Hora */}
              <div>
                <label style={LS}>Fecha *</label>
                <input type="date" value={form.fecha} onChange={e => sf("fecha", e.target.value)} onClick={e => { try { e.target.showPicker(); } catch(_) {} }} style={IS} />
              </div>
              <div>
                <label style={LS}>Hora</label>
                <input type="time" value={form.hora} onChange={e => sf("hora", e.target.value)} style={IS} />
              </div>

              {/* Tipo + Estado */}
              <div>
                <label style={LS}>Tipo de visita</label>
                <select value={form.tipo} onChange={e => sf("tipo", e.target.value)} style={IS}>
                  {TIPOS_VISITA.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Estado</label>
                <select value={form.estado} onChange={e => sf("estado", e.target.value)} style={IS}>
                  {ESTADOS_VISITA.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                </select>
              </div>

              {/* Realizada por */}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Realizada por</label>
                <input value={form.realizada_por} onChange={e => sf("realizada_por", e.target.value)} placeholder="Nombre del ejecutivo de cuenta" style={IS} />
              </div>

              {/* Objetivo */}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Objetivo de la visita</label>
                <textarea value={form.objetivo} onChange={e => sf("objetivo", e.target.value)} placeholder="¿Qué se quiere lograr con esta visita?" rows={2} style={{ ...IS, resize: "vertical" }} />
              </div>

              {/* Resultado (solo si ya se realizó) */}
              {(form.estado === "realizada") && (
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={LS}>Resultado / Lo que pasó</label>
                  <textarea value={form.resultado} onChange={e => sf("resultado", e.target.value)} placeholder="¿Cómo resultó la visita? Acuerdos, compromisos, observaciones..." rows={3} style={{ ...IS, resize: "vertical" }} />
                </div>
              )}

              {/* Próxima acción */}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Próxima acción</label>
                <input value={form.proxima_accion} onChange={e => sf("proxima_accion", e.target.value)} placeholder="¿Qué sigue? Ej: Enviar propuesta de temporada alta..." style={IS} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Fecha próxima acción</label>
                <input type="date" value={form.fecha_proxima} onChange={e => sf("fecha_proxima", e.target.value)} onClick={e => { try { e.target.showPicker(); } catch(_) {} }} style={IS} />
              </div>

              {/* Notas */}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Notas adicionales</label>
                <textarea value={form.notas} onChange={e => sf("notas", e.target.value)} placeholder="Cualquier detalle relevante..." rows={2} style={{ ...IS, resize: "vertical" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "12px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving || !form.fecha}
                style={{ flex: 2, padding: "12px", background: !form.fecha ? B.navyLight : B.sand, color: !form.fecha ? "rgba(255,255,255,0.3)" : B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                {saving ? "Guardando..." : editVisita ? "Guardar cambios" : "Registrar visita"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// INCENTIVOS AGENCIA (gestión desde el OS)
// ═══════════════════════════════════════════════
const INCENTIVO_TIPOS = [
  { val: "meta_pax",       label: "Meta de pasajeros", icon: "👥" },
  { val: "meta_revenue",   label: "Meta de ventas",    icon: "💰" },
  { val: "meta_reservas",  label: "Meta de reservas",  icon: "📋" },
  { val: "especial",       label: "Programa especial", icon: "⭐" },
];

function IncentivosAgencia({ aliadoId }) {
  const [incentivos, setIncentivos] = useState([]);
  const [progreso,   setProgreso]   = useState({});
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const emptyForm = { nombre: "", tipo: "meta_pax", meta_valor: "", beneficio: "", descripcion: "", fecha_inicio: "", fecha_fin: "" };
  const [form, setForm] = useState(emptyForm);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const fetchAll = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("b2b_incentivos")
      .select("*")
      .or(`aliado_id.is.null,aliado_id.eq.${aliadoId}`)
      .order("fecha_fin", { ascending: true });
    const inc = data || [];
    setIncentivos(inc);

    const prog = {};
    for (const i of inc) {
      if (!i.fecha_inicio || !i.fecha_fin || i.tipo === "especial") continue;
      const { data: resData } = await supabase.from("reservas")
        .select("pax, total")
        .eq("aliado_id", aliadoId)
        .neq("estado", "cancelado")
        .gte("fecha", i.fecha_inicio)
        .lte("fecha", i.fecha_fin);
      const pax     = (resData || []).reduce((s, r) => s + (r.pax || 0), 0);
      const revenue = (resData || []).reduce((s, r) => s + (r.total || 0), 0);
      const reservas= (resData || []).length;
      const actual  = i.tipo === "meta_pax" ? pax : i.tipo === "meta_revenue" ? revenue : reservas;
      prog[i.id] = { actual, pct: Math.min(100, Math.round((actual / (i.meta_valor || 1)) * 100)) };
    }
    setProgreso(prog);
    setLoading(false);
  }, [aliadoId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const guardar = async () => {
    if (!supabase || saving || !form.nombre.trim()) return;
    setSaving(true);
    await supabase.from("b2b_incentivos").insert({
      id: `INC-${Date.now()}`,
      aliado_id: aliadoId,
      nombre: form.nombre,
      tipo: form.tipo,
      meta_valor: Number(form.meta_valor) || 0,
      beneficio: form.beneficio,
      descripcion: form.descripcion,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
      activo: true,
    });
    setSaving(false);
    setShowForm(false);
    setForm(emptyForm);
    fetchAll();
  };

  const toggleActivo = async (id, activo) => {
    await supabase.from("b2b_incentivos").update({ activo: !activo }).eq("id", id);
    fetchAll();
  };

  const fmtMeta = (tipo, val) => tipo === "meta_revenue" ? COP(val) : Number(val).toLocaleString();
  const hoy = new Date().toISOString().slice(0, 10);

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, color: B.sand }}>🎯 Programas de Incentivos</h3>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Visibles para el admin de la agencia en su portal</div>
        </div>
        <button onClick={() => setShowForm(true)} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Nuevo programa</button>
      </div>

      {incentivos.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay programas de incentivos para esta agencia</div>
      )}

      {incentivos.map(inc => {
        const p = progreso[inc.id];
        const pct = p?.pct ?? null;
        const cumplido = pct !== null && pct >= 100;
        const esGlobal = inc.aliado_id === null;
        const diasRestantes = inc.fecha_fin ? Math.max(0, Math.ceil((new Date(inc.fecha_fin) - new Date(hoy)) / 86400000)) : null;
        return (
          <div key={inc.id} style={{ background: B.navy, borderRadius: 12, padding: 18, marginBottom: 12, border: `1px solid ${cumplido ? B.success + "44" : B.navyLight}`, opacity: inc.activo ? 1 : 0.4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>{cumplido ? "🏆" : INCENTIVO_TIPOS.find(t => t.val === inc.tipo)?.icon || "🎯"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{inc.nombre}</span>
                  {esGlobal && <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 8, background: B.sky + "22", color: B.sky }}>Global</span>}
                  {cumplido && <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 8, background: B.success + "22", color: B.success, fontWeight: 700 }}>✓ Cumplido</span>}
                </div>
                {inc.beneficio && <div style={{ fontSize: 12, color: B.sand, marginTop: 2 }}>🎁 {inc.beneficio}</div>}
                {inc.fecha_inicio && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{inc.fecha_inicio} → {inc.fecha_fin}{diasRestantes !== null && !cumplido ? ` · ${diasRestantes}d restantes` : ""}</div>}
              </div>
              {pct !== null && (
                <div style={{ textAlign: "right", minWidth: 80 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: cumplido ? B.success : B.sky }}>{pct}%</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{fmtMeta(inc.tipo, p.actual)} / {fmtMeta(inc.tipo, inc.meta_valor)}</div>
                </div>
              )}
              {!esGlobal && (
                <button onClick={() => toggleActivo(inc.id, inc.activo)} style={{ background: inc.activo ? B.danger + "22" : B.success + "22", color: inc.activo ? B.danger : B.success, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>
                  {inc.activo ? "Desactivar" : "Activar"}
                </button>
              )}
            </div>
            {pct !== null && (
              <div style={{ marginTop: 10, height: 6, background: B.navyLight, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: cumplido ? B.success : B.sky, transition: "width 0.5s ease" }} />
              </div>
            )}
          </div>
        );
      })}

      {/* Formulario nuevo incentivo */}
      {showForm && (
        <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 12, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: B.sand, marginBottom: 16 }}>Nuevo programa de incentivo</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>Nombre del programa</label>
              <input value={form.nombre} onChange={e => f("nombre", e.target.value)} placeholder="Ej: Reto Semana Santa 2026" style={IS} />
            </div>
            <div>
              <label style={LS}>Tipo de meta</label>
              <select value={form.tipo} onChange={e => f("tipo", e.target.value)} style={IS}>
                {INCENTIVO_TIPOS.map(t => <option key={t.val} value={t.val}>{t.icon} {t.label}</option>)}
              </select>
            </div>
            {form.tipo !== "especial" && (
              <div>
                <label style={LS}>Valor de la meta</label>
                <input type="number" value={form.meta_valor} onChange={e => f("meta_valor", e.target.value)} placeholder={form.tipo === "meta_revenue" ? "5000000" : "50"} style={IS} />
              </div>
            )}
            <div>
              <label style={LS}>Fecha inicio</label>
              <input type="date" value={form.fecha_inicio} onChange={e => f("fecha_inicio", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Fecha fin</label>
              <input type="date" value={form.fecha_fin} onChange={e => f("fecha_fin", e.target.value)} style={IS} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>Premio / Beneficio al cumplir</label>
              <input value={form.beneficio} onChange={e => f("beneficio", e.target.value)} placeholder="Ej: Bono de $500.000, Noche gratis, Comisión extra 5%..." style={IS} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>Descripción (opcional)</label>
              <textarea value={form.descripcion} onChange={e => f("descripcion", e.target.value)} rows={2} placeholder="Detalles adicionales del programa..." style={{ ...IS, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={() => { setShowForm(false); setForm(emptyForm); }} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={guardar} disabled={saving || !form.nombre.trim()} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: saving ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
              {saving ? "Guardando..." : "Crear programa"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// PUNTOS AGENCIA (leaderboard + config)
// ═══════════════════════════════════════════════
function PuntosAgencia({ aliado }) {
  const [ranking, setRanking] = useState([]);
  const [config, setConfig]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [editCfg, setEditCfg] = useState(false);
  const [cfgForm, setCfgForm] = useState({});
  const [savingCfg, setSavingCfg] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [selVendedor, setSelVendedor] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [rank, cfg] = await Promise.all([
      getRankingAgencia(aliado.id),
      getPuntosConfig(),
    ]);
    setRanking(rank || []);
    setConfig(cfg);
    setCfgForm(cfg || {});
    setLoading(false);
  }, [aliado.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchHistorialVendedor = async (vendedorId) => {
    if (!supabase) return;
    const { data } = await supabase.from("b2b_puntos_historial")
      .select("*").eq("vendedor_id", vendedorId)
      .order("created_at", { ascending: false }).limit(30);
    setHistorial(data || []);
    setSelVendedor(vendedorId);
  };

  const saveCfg = async () => {
    if (!supabase || savingCfg) return;
    setSavingCfg(true);
    await supabase.from("b2b_puntos_config").upsert({
      id: "default",
      activo: cfgForm.activo ?? true,
      nombre_puntos: cfgForm.nombre_puntos || "AtoCoins",
      puntos_por_reserva: Number(cfgForm.puntos_por_reserva) || 0,
      puntos_por_pax: Number(cfgForm.puntos_por_pax) || 0,
      puntos_por_millon: Number(cfgForm.puntos_por_millon) || 0,
      bonus_grupo_10_pax: Number(cfgForm.bonus_grupo_10_pax) || 0,
      bonus_fin_semana: Number(cfgForm.bonus_fin_semana) || 0,
      bonus_primera_reserva_mes: Number(cfgForm.bonus_primera_reserva_mes) || 0,
    });
    setSavingCfg(false);
    setEditCfg(false);
    fetchAll();
  };

  const MEDAL = ["🥇","🥈","🥉"];
  const coinName = config?.nombre_puntos || "AtoCoins";

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando puntos...</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
      {/* ── LEADERBOARD ─────────────────────────────────────── */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, color: B.sand }}>🏆 Ranking {coinName}</h3>
          <button onClick={fetchAll} style={{ background: B.navyLight, border: "none", borderRadius: 6, padding: "5px 12px", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>↺ Actualizar</button>
        </div>
        {ranking.length === 0 && (
          <div style={{ textAlign: "center", padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No hay vendedores registrados en esta agencia
          </div>
        )}
        {ranking.map((v, i) => (
          <div key={v.id} onClick={() => fetchHistorialVendedor(v.id)}
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 10, marginBottom: 8, cursor: "pointer",
              background: selVendedor === v.id ? B.sky + "15" : i === 0 ? B.sand + "0D" : B.navy,
              border: `1px solid ${selVendedor === v.id ? B.sky + "44" : i === 0 ? B.sand + "33" : B.navyLight + "55"}`,
            }}>
            <div style={{ fontSize: 22, width: 32, textAlign: "center" }}>{MEDAL[i] || `#${i+1}`}</div>
            <div style={{ width: 38, height: 38, borderRadius: 19, background: i === 0 ? `linear-gradient(135deg, ${B.sand}, ${B.sky})` : B.navyLight,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700,
              color: i === 0 ? B.navy : "rgba(255,255,255,0.7)", flexShrink: 0 }}>
              {v.nombre?.split(" ").map(w => w[0]).join("").slice(0,2)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{v.nombre}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{v.email}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: i === 0 ? B.sand : B.sky }}>{v.puntos.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>{coinName}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── PANEL DERECHO ───────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Historial de vendedor seleccionado */}
        {selVendedor && historial.length > 0 && (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13, color: B.sand, marginBottom: 14 }}>
              Historial — {ranking.find(v => v.id === selVendedor)?.nombre}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
              {historial.map(h => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${B.navyLight}22` }}>
                  <div>
                    <div style={{ fontSize: 12 }}>{h.concepto}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{new Date(h.created_at).toLocaleDateString("es-CO")}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: h.tipo === "debito" ? B.danger : B.success }}>
                    {h.tipo === "debito" ? "-" : "+"}{h.puntos.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Config de puntos */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: B.sand }}>⚙ Configuración {coinName}</div>
            {!editCfg && <button onClick={() => setEditCfg(true)} style={{ background: B.navyLight, border: "none", borderRadius: 6, padding: "4px 12px", color: B.sand, fontSize: 11, cursor: "pointer" }}>Editar</button>}
          </div>

          {!editCfg ? (
            <div style={{ fontSize: 12, lineHeight: 2.2, color: "rgba(255,255,255,0.7)" }}>
              <div>Sistema: <strong style={{ color: config?.activo ? B.success : B.danger }}>{config?.activo ? "Activo ✓" : "Inactivo"}</strong></div>
              <div>Por reserva: <strong style={{ color: B.sky }}>{config?.puntos_por_reserva || 0} pts</strong></div>
              <div>Por pasajero: <strong style={{ color: B.sky }}>{config?.puntos_por_pax || 0} pts/pax</strong></div>
              <div>Por millón vendido: <strong style={{ color: B.sky }}>{config?.puntos_por_millon || 0} pts/M</strong></div>
              <div>Bonus grupo +10 pax: <strong style={{ color: B.sand }}>{config?.bonus_grupo_10_pax || 0} pts</strong></div>
              <div>Bonus fin de semana: <strong style={{ color: B.sand }}>{config?.bonus_fin_semana || 0} pts</strong></div>
              <div>Bonus 1ª reserva del mes: <strong style={{ color: B.sand }}>{config?.bonus_primera_reserva_mes || 0} pts</strong></div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={cfgForm.activo ?? true} onChange={e => setCfgForm(f => ({ ...f, activo: e.target.checked }))} />
                <span style={{ fontSize: 12, color: B.sand }}>Sistema activo</span>
              </div>
              <div>
                <label style={{ fontSize: 10, color: B.sand, display: "block", marginBottom: 3 }}>Nombre moneda</label>
                <input value={cfgForm.nombre_puntos || ""} onChange={e => setCfgForm(f => ({ ...f, nombre_puntos: e.target.value }))} style={{ ...IS, fontSize: 12, padding: "7px 10px" }} />
              </div>
              {[
                ["puntos_por_reserva", "Pts por reserva"],
                ["puntos_por_pax", "Pts por pax"],
                ["puntos_por_millon", "Pts por millón COP"],
                ["bonus_grupo_10_pax", "Bonus grupo +10 pax"],
                ["bonus_fin_semana", "Bonus fin de semana"],
                ["bonus_primera_reserva_mes", "Bonus 1ª reserva/mes"],
              ].map(([k, label]) => (
                <div key={k}>
                  <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 3 }}>{label}</label>
                  <input type="number" value={cfgForm[k] || 0} onChange={e => setCfgForm(f => ({ ...f, [k]: +e.target.value }))} style={{ ...IS, fontSize: 12, padding: "7px 10px" }} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={() => setEditCfg(false)} style={{ flex: 1, padding: "8px", background: B.navyLight, border: "none", borderRadius: 6, color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                <button onClick={saveCfg} disabled={savingCfg} style={{ flex: 2, padding: "8px", background: B.success, border: "none", borderRadius: 6, color: B.white, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {savingCfg ? "Guardando..." : "Guardar config"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// FICHA DE ALIADO
// ═══════════════════════════════════════════════
function FichaAliado({ aliado, onBack, onRefresh }) {
  const [locaciones, setLocaciones] = useState([]);
  const [contactosAliado, setContactosAliado] = useState([]);
  const [showLocForm, setShowLocForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(null); // locacion_id or "aliado"
  const [uploading, setUploading] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: aliado.nombre, tipo: aliado.tipo, contacto: aliado.contacto, tel: aliado.tel, email: aliado.email, rut: aliado.rut, rnt: aliado.rnt, estado: aliado.estado, vendedor_id: aliado.vendedor_id || "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [tab, setTab] = useState("general"); // general | convenios
  const [vendedores, setVendedores] = useState([]);
  const [rntHistorial, setRntHistorial] = useState([]);
  const [approvingCert, setApprovingCert] = useState(false);
  const [b2bUsers, setB2bUsers]         = useState([]);
  const [sendingEmail, setSendingEmail]   = useState(null);
  const [resetPinId, setResetPinId]       = useState(null);
  const [newPin, setNewPin]               = useState(null);
  const [creditSols, setCreditSols]       = useState([]);
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditForm, setCreditForm]       = useState({ monto: "", dias: "" });
  const [savingCredit, setSavingCredit]   = useState(false);
  const [approvingCredit, setApprovingCredit] = useState(null);
  const [currentUserRol, setCurrentUserRol]   = useState(null);

  const fetchB2bUsers = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("b2b_usuarios").select("*").eq("aliado_id", aliado.id).order("nombre");
    setB2bUsers(data || []);
  }, [aliado.id]);

  const sendWelcomeEmail = async (user) => {
    setSendingEmail(user.id);
    const portalUrl = window.location.origin + "/agencia";
    const subject = encodeURIComponent(`Bienvenido al Portal de Agencias — Atolon Beach Club`);
    const body = encodeURIComponent(
      `Hola ${user.nombre},\n\n` +
      `Te damos la bienvenida al Portal de Agencias de Atolon Beach Club 🌴\n\n` +
      `Ingresa con tu correo registrado en:\n${portalUrl}\n\n` +
      `Email de acceso: ${user.email}\n\n` +
      `Saludos,\nEquipo Atolon Beach Club`
    );
    window.open(`mailto:${user.email}?subject=${subject}&body=${body}`, "_blank");
    setSendingEmail(null);
  };

  const resetPin = async (user) => {
    setResetPinId(user.id);
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    await supabase.from("b2b_usuarios").update({ pin }).eq("id", user.id);
    setNewPin({ userId: user.id, pin });
    setResetPinId(null);
    fetchB2bUsers();
  };

  const fetchCreditSols = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("b2b_credito_solicitudes").select("*").eq("aliado_id", aliado.id).order("created_at", { ascending: false });
    setCreditSols(data || []);
  }, [aliado.id]);

  const solicitarCredito = async () => {
    if (!supabase || savingCredit || !creditForm.monto || !creditForm.dias) return;
    setSavingCredit(true);
    const monto = Number(creditForm.monto);
    const estado = "pendiente_gv"; // always starts at GV
    await supabase.from("b2b_credito_solicitudes").insert({
      id: `CRED-${Date.now()}`, aliado_id: aliado.id,
      monto, dias: Number(creditForm.dias), estado,
      solicitado_por: "admin",
    });
    setSavingCredit(false); setShowCreditForm(false); setCreditForm({ monto: "", dias: "" });
    fetchCreditSols();
  };

  const aprobarCredito = async (sol, userRol) => {
    if (!supabase || approvingCredit) return;
    setApprovingCredit(sol.id);
    const monto = sol.monto;
    let nuevoEstado;
    if (userRol === "gerente_ventas") {
      if (monto <= 4000000) nuevoEstado = "aprobado";
      else nuevoEstado = "pendiente_gg";
    } else if (userRol === "gerente_general") {
      if (monto <= 8000000) nuevoEstado = "aprobado";
      else nuevoEstado = "pendiente_director";
    } else if (userRol === "director") {
      nuevoEstado = "aprobado";
    }
    const now = new Date().toISOString();
    const upd = { estado: nuevoEstado };
    if (userRol === "gerente_ventas")  { upd.aprobado_gv_por = "admin";  upd.aprobado_gv_en  = now; }
    if (userRol === "gerente_general") { upd.aprobado_gg_por = "admin";  upd.aprobado_gg_en  = now; }
    if (userRol === "director")        { upd.aprobado_dir_por = "admin"; upd.aprobado_dir_en = now; }
    await supabase.from("b2b_credito_solicitudes").update(upd).eq("id", sol.id);
    if (nuevoEstado === "aprobado") {
      await supabase.from("aliados_b2b").update({ credito_monto: sol.monto, credito_dias: sol.dias }).eq("id", aliado.id);
      onRefresh();
    }
    setApprovingCredit(null); fetchCreditSols();
  };

  const rechazarCredito = async (sol) => {
    if (!supabase) return;
    await supabase.from("b2b_credito_solicitudes").update({ estado: "rechazado", rechazado_en: new Date().toISOString() }).eq("id", sol.id);
    fetchCreditSols();
  };

  const fetchRntHistorial = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("b2b_rnt_historial").select("*").eq("aliado_id", aliado.id).order("subido_en", { ascending: false });
    setRntHistorial(data || []);
  }, [aliado.id]);

  useEffect(() => {
    if (supabase) {
      supabase.from("usuarios").select("id, nombre, rol_id, avatar_color").eq("activo", true).order("nombre")
        .then(({ data }) => setVendedores(data || []));
      fetchRntHistorial();
      fetchB2bUsers();
      fetchCreditSols();
      // Obtener rol del usuario actual
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) supabase.from("usuarios").select("rol_id").eq("email", user.email.toLowerCase()).single()
          .then(({ data }) => setCurrentUserRol(data?.rol_id || null));
      });
    }
  }, [fetchRntHistorial, fetchB2bUsers, fetchCreditSols]);

  const approveCert = async () => {
    if (!supabase || approvingCert || !aliado.cert_bancaria_pendiente_url) return;
    setApprovingCert(true);
    await supabase.from("aliados_b2b").update({
      cert_bancaria_url:             aliado.cert_bancaria_pendiente_url,
      cert_bancaria_pendiente_url:   null,
      cert_bancaria_solicitud_fecha: null,
      cert_bancaria_solicitud_nota:  null,
    }).eq("id", aliado.id);
    setApprovingCert(false);
    onRefresh();
  };

  const rejectCert = async () => {
    if (!supabase) return;
    await supabase.from("aliados_b2b").update({
      cert_bancaria_pendiente_url:   null,
      cert_bancaria_solicitud_fecha: null,
      cert_bancaria_solicitud_nota:  null,
    }).eq("id", aliado.id);
    onRefresh();
  };

  const saveEdit = async () => {
    if (!supabase || savingEdit) return;
    setSavingEdit(true);
    const { error } = await supabase.from("aliados_b2b").update({
      nombre: editForm.nombre, tipo: editForm.tipo, contacto: editForm.contacto,
      tel: editForm.tel, email: editForm.email,
      rut: editForm.rut, rnt: editForm.rnt, estado: editForm.estado,
      vendedor_id: editForm.vendedor_id || null,
    }).eq("id", aliado.id);
    if (error) { alert("Error al guardar: " + error.message); setSavingEdit(false); return; }
    await onRefresh();
    setEditing(false); setSavingEdit(false);
  };

  // Fetch contactos del aliado (sin locacion)
  const fetchContactosAliado = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("b2b_contactos").select("*").eq("aliado_id", aliado.id).is("locacion_id", null).order("es_principal", { ascending: false });
    setContactosAliado(data || []);
  }, [aliado.id]);

  // Fetch locaciones + sus contactos
  const fetchLocaciones = useCallback(async () => {
    if (!supabase) return;
    const { data: locs } = await supabase.from("b2b_locaciones").select("*").eq("aliado_id", aliado.id).order("created_at");
    if (!locs) return;
    const withContacts = await Promise.all(locs.map(async (loc) => {
      const { data: conts } = await supabase.from("b2b_contactos").select("*").eq("locacion_id", loc.id).order("es_principal", { ascending: false });
      return { ...loc, contactos: conts || [] };
    }));
    setLocaciones(withContacts);
  }, [aliado.id]);

  useEffect(() => { fetchLocaciones(); fetchContactosAliado(); }, [fetchLocaciones, fetchContactosAliado]);

  const uploadDoc = async (tipo, file) => {
    if (!supabase || !file) return;
    setUploading(tipo);
    const ext = file.name.split(".").pop();
    const path = `${aliado.id}/${tipo}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true });
    if (upErr) { console.error("Upload error:", upErr); setUploading(null); return; }
    const { data: urlData } = supabase.storage.from("b2b-docs").getPublicUrl(path);
    const col = tipo === "rut" ? "rut_url" : tipo === "rnt" ? "rnt_url" : "cert_bancaria_url";
    // Guardar RNT anterior en historial
    if (tipo === "rnt" && aliado.rnt_url) {
      await supabase.from("b2b_rnt_historial").insert({
        id: `RNT-${Date.now()}`,
        aliado_id: aliado.id,
        rnt_url: aliado.rnt_url,
        subido_por: "admin",
      });
      fetchRntHistorial();
    }
    await supabase.from("aliados_b2b").update({ [col]: urlData.publicUrl }).eq("id", aliado.id);
    onRefresh(); setUploading(null);
  };

  const addLocacion = async (form) => {
    if (!supabase) return;
    await supabase.from("b2b_locaciones").insert({ id: `LOC-${Date.now()}`, aliado_id: aliado.id, ...form });
    fetchLocaciones(); setShowLocForm(false);
  };

  const addContacto = async (locId, form) => {
    if (!supabase) return;
    if (locId === "aliado") {
      await supabase.from("b2b_contactos").insert({ id: `CON-${Date.now()}`, aliado_id: aliado.id, locacion_id: null, ...form });
      fetchContactosAliado();
    } else {
      await supabase.from("b2b_contactos").insert({ id: `CON-${Date.now()}`, aliado_id: null, locacion_id: locId, ...form });
      fetchLocaciones();
    }
    setShowContactForm(null);
  };

  const deleteContacto = async (id, isAliado) => {
    if (!supabase) return;
    await supabase.from("b2b_contactos").delete().eq("id", id);
    if (isAliado) fetchContactosAliado(); else fetchLocaciones();
  };

  const deleteLoc = async (id) => {
    if (!supabase) return;
    await supabase.from("b2b_locaciones").delete().eq("id", id);
    fetchLocaciones();
  };

  const tipoBg = aliado.tipo === "Hotel" ? B.sky : aliado.tipo === "Agencia" ? B.sand : aliado.tipo === "Freelance" ? B.success : aliado.tipo === "Event Planner" ? B.pink : B.pink;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: B.navyLight, border: "none", borderRadius: 8, padding: "8px 16px", color: B.white, cursor: "pointer", fontSize: 13 }}>{"\u2190"} Volver</button>
        <h2 style={{ fontSize: 22, fontWeight: 600, flex: 1 }}>{aliado.nombre}</h2>
        <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, background: tipoBg + "33", color: tipoBg, fontWeight: 600 }}>{aliado.tipo}</span>
        <span style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, background: aliado.estado === "activo" ? B.success + "22" : B.navyLight, color: aliado.estado === "activo" ? B.success : "rgba(255,255,255,0.5)" }}>{aliado.estado === "activo" ? "Activo" : "Inactivo"}</span>
        {!editing && <button onClick={() => setEditing(true)} style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Editar</button>}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {[["general", "Ficha General"], ["convenios", "Convenios & Tarifas"], ["historial", "Historial Reservas"], ["eventos", "🎪 Eventos/Grupos"], ["visitas", "Visitas"], ["incentivos", "🎯 Incentivos"], ["puntos", "🏆 AtoCoins"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "9px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: tab === k ? B.sky : B.navyMid, color: tab === k ? B.navy : B.sand,
          }}>{l}</button>
        ))}
      </div>

      {tab === "general" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {/* Datos Generales */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 15, color: B.sand, marginBottom: 16 }}>Datos Generales</h3>
              {editing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                  {[
                    ["nombre", "Nombre"], ["tipo", "Tipo", ["Hotel", "Agencia", "Freelance", "Event Planner"]],
                    ["rut", "RUT"], ["rnt", "RNT"], ["contacto", "Contacto"],
                    ["tel", "Telefono"], ["email", "Email"],
                    ["estado", "Estado", ["activo", "inactivo"]],
                  ].map(([key, label, opts]) => (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <label style={{ ...LS, fontSize: 10 }}>{label}</label>
                      {opts ? (
                        <select value={editForm[key]} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} style={ISsm}>
                          {opts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input value={editForm[key] || ""} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} style={ISsm} />
                      )}
                    </div>
                  ))}
                  {/* Vendedor asignado */}
                  <div style={{ gridColumn: "1 / -1", marginBottom: 10 }}>
                    <label style={{ ...LS, fontSize: 10 }}>Vendedor responsable</label>
                    <select value={editForm.vendedor_id || ""} onChange={e => setEditForm(p => ({ ...p, vendedor_id: e.target.value }))} style={ISsm}>
                      <option value="">— Sin asignar —</option>
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, marginTop: 4 }}>
                    <button onClick={saveEdit} disabled={savingEdit} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: savingEdit ? B.navyLight : B.sky, color: savingEdit ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 12, fontWeight: 700, cursor: savingEdit ? "default" : "pointer" }}>{savingEdit ? "Guardando..." : "Guardar"}</button>
                    <button onClick={() => setEditing(false)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 2.4 }}>
                  {[["RUT", aliado.rut], ["RNT", aliado.rnt], ["Contacto", aliado.contacto], ["Telefono", aliado.tel], ["Email", aliado.email],
                    ["Crédito", aliado.credito_monto ? `$${Number(aliado.credito_monto).toLocaleString("es-CO")}` : "—"],
                    ["Días crédito", aliado.credito_dias ? `${aliado.credito_dias} días` : "—"]].map(([l, v]) => (
                    <div key={l}><span style={{ color: "rgba(255,255,255,0.4)", minWidth: 90, display: "inline-block" }}>{l}:</span> <strong>{v || "\u2014"}</strong></div>
                  ))}
                  {/* Vendedor */}
                  <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${B.navyLight}44` }}>
                    <span style={{ color: "rgba(255,255,255,0.4)", minWidth: 90, display: "inline-block" }}>Vendedor:</span>
                    {(() => {
                      const v = vendedores.find(u => u.id === aliado.vendedor_id);
                      return v ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, verticalAlign: "middle" }}>
                          <span style={{ width: 22, height: 22, borderRadius: 11, background: v.avatar_color || B.sky, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: B.navy }}>
                            {v.nombre.split(" ").map(w=>w[0]).join("").slice(0,2)}
                          </span>
                          <strong>{v.nombre}</strong>
                        </span>
                      ) : <strong style={{ color: "rgba(255,255,255,0.3)" }}>Sin asignar</strong>;
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Documentos */}
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
              <h3 style={{ fontSize: 15, color: B.sand, marginBottom: 16 }}>Documentos</h3>

              {/* Alerta cert bancaria pendiente */}
              {aliado.cert_bancaria_pendiente_url && (
                <div style={{ background: B.warning + "18", border: `1px solid ${B.warning}44`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: B.warning, marginBottom: 4 }}>🔔 Solicitud de cambio de cuenta bancaria</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                        {aliado.cert_bancaria_solicitud_fecha
                          ? `Enviado el ${new Date(aliado.cert_bancaria_solicitud_fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}`
                          : "Fecha no registrada"}
                        {aliado.cert_bancaria_solicitud_nota && <span style={{ opacity: 0.8 }}> · "{aliado.cert_bancaria_solicitud_nota}"</span>}
                      </div>
                      <a href={aliado.cert_bancaria_pendiente_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: B.sky, display: "inline-block", marginTop: 6, textDecoration: "none" }}>
                        Ver certificado enviado →
                      </a>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={approveCert} disabled={approvingCert}
                        style={{ background: B.success, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: approvingCert ? "default" : "pointer", opacity: approvingCert ? 0.6 : 1 }}>
                        {approvingCert ? "..." : "✓ Aprobar"}
                      </button>
                      <button onClick={rejectCert}
                        style={{ background: B.danger + "22", color: B.danger, border: `1px solid ${B.danger}44`, borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>
                        ✕ Rechazar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { key: "rut", label: "RUT", url: aliado.rut_url },
                  { key: "rnt", label: "RNT", url: aliado.rnt_url },
                  { key: "cert", label: "Cert. Bancaria", url: aliado.cert_bancaria_url },
                ].map(doc => (
                  <div key={doc.key} style={{ background: B.navy, borderRadius: 8, overflow: "hidden", textAlign: "center" }}>
                    {doc.url ? (
                      <div>
                        <div style={{ height: 100, background: `url(${doc.url}) center/cover`, borderRadius: "8px 8px 0 0" }} />
                        <div style={{ padding: 8, display: "flex", gap: 4, justifyContent: "center" }}>
                          <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: B.sky, textDecoration: "none" }}>Ver</a>
                          <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
                          <label style={{ fontSize: 11, color: B.sand, cursor: "pointer" }}>Cambiar<input type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={e => e.target.files[0] && uploadDoc(doc.key, e.target.files[0])} /></label>
                        </div>
                      </div>
                    ) : (
                      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 130, cursor: "pointer", gap: 8 }}>
                        <div style={{ fontSize: 28, color: "rgba(255,255,255,0.15)" }}>{"\u2B06"}</div>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{uploading === doc.key ? "Subiendo..." : `Subir ${doc.label}`}</span>
                        <input type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={e => e.target.files[0] && uploadDoc(doc.key, e.target.files[0])} />
                      </label>
                    )}
                    <div style={{ padding: "6px 0", fontSize: 11, fontWeight: 600, color: B.sand, borderTop: `1px solid ${B.navyLight}` }}>{doc.label}</div>
                  </div>
                ))}
              </div>

              {/* Historial de RNT */}
              {rntHistorial.length > 0 && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${B.navyLight}` }}>
                  <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Historial RNT ({rntHistorial.length})</div>
                  {rntHistorial.map((h, i) => (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < rntHistorial.length - 1 ? `1px solid ${B.navyLight}22` : "none" }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                          {new Date(h.subido_en).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                        <span style={{ marginLeft: 8, fontSize: 10, padding: "1px 7px", borderRadius: 4, background: h.subido_por === "portal" ? B.sky + "22" : B.sand + "22", color: h.subido_por === "portal" ? B.sky : B.sand }}>
                          {h.subido_por === "portal" ? "Agencia" : "Admin"}
                        </span>
                      </div>
                      <a href={h.rnt_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: B.sky, textDecoration: "none", padding: "3px 10px", borderRadius: 5, background: B.sky + "15" }}>
                        Ver →
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Contactos del Aliado (nivel general) */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, color: B.sand, marginBottom: 12 }}>Contactos del Aliado</h3>
            <ContactosList
              contactos={contactosAliado}
              onAdd={(form) => addContacto("aliado", form)}
              onDelete={(id) => deleteContacto(id, true)}
              showAddForm={showContactForm === "aliado"}
              setShowAddForm={(v) => setShowContactForm(v ? "aliado" : null)}
            />
          </div>

          {/* Acceso al Portal */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, color: B.sand, margin: 0 }}>Acceso al Portal B2B</h3>
              <a href={window.location.origin + "/agencia"} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: B.sky, textDecoration: "none" }}>
                🔗 Ver portal →
              </a>
            </div>
            {b2bUsers.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                No hay usuarios del portal registrados para este aliado.
              </div>
            )}
            {b2bUsers.map(u => (
              <div key={u.id} style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
                {/* Avatar */}
                <div style={{ width: 38, height: 38, borderRadius: 19, background: B.sky + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                  {u.nombre?.charAt(0) || "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{u.nombre}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{u.email}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.sky + "22", color: B.sky }}>{u.rol || "vendedor"}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: u.activo ? B.success + "22" : B.danger + "22", color: u.activo ? B.success : B.danger }}>{u.activo ? "Activo" : "Inactivo"}</span>
                    {u.pin && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>Clave configurada</span>}
                  </div>
                  {/* Mostrar nueva clave recién generada */}
                  {newPin?.userId === u.id && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: B.success + "18", border: `1px solid ${B.success}33`, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: B.success }}>✓ Nueva clave: </span>
                      <strong style={{ fontSize: 16, letterSpacing: 4, color: B.white }}>{newPin.pin}</strong>
                      <button onClick={() => { navigator.clipboard.writeText(newPin.pin); }}
                        style={{ background: "none", border: "none", color: B.sky, fontSize: 11, cursor: "pointer" }}>Copiar</button>
                      <button onClick={() => setNewPin(null)}
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer" }}>✕</button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => sendWelcomeEmail(u)} disabled={sendingEmail === u.id}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 12, fontWeight: 700, cursor: sendingEmail === u.id ? "default" : "pointer", opacity: sendingEmail === u.id ? 0.6 : 1 }}>
                    {sendingEmail === u.id ? "..." : "✉ Bienvenida"}
                  </button>
                  <button onClick={() => resetPin(u)} disabled={resetPinId === u.id}
                    style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 12, fontWeight: 600, cursor: resetPinId === u.id ? "default" : "pointer", opacity: resetPinId === u.id ? 0.6 : 1 }}>
                    {resetPinId === u.id ? "..." : "🔑 Nueva clave"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Crédito */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, color: B.sand, margin: 0 }}>💳 Crédito B2B</h3>
              <button onClick={() => setShowCreditForm(s => !s)} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "7px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                + Solicitar crédito
              </button>
            </div>

            {/* Crédito activo */}
            {(aliado.credito_monto || aliado.credito_dias) && (
              <div style={{ background: B.success + "18", border: `1px solid ${B.success}44`, borderRadius: 10, padding: "14px 18px", marginBottom: 14, display: "flex", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11, color: B.success, textTransform: "uppercase", letterSpacing: 1 }}>Monto aprobado</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: B.white }}>${Number(aliado.credito_monto || 0).toLocaleString("es-CO")}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: B.success, textTransform: "uppercase", letterSpacing: 1 }}>Días de crédito</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: B.white }}>{aliado.credito_dias} días</div>
                </div>
                <span style={{ alignSelf: "center", fontSize: 11, padding: "4px 12px", borderRadius: 10, background: B.success + "33", color: B.success, fontWeight: 700 }}>✓ Vigente</span>
              </div>
            )}

            {/* Form solicitar */}
            {showCreditForm && (
              <div style={{ background: B.navy, borderRadius: 10, padding: 16, marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...LS, fontSize: 10 }}>Monto ($)</label>
                  <input type="number" value={creditForm.monto} onChange={e => setCreditForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="Ej: 5000000" style={{ ...IS, fontSize: 13 }} />
                </div>
                <div style={{ width: 120 }}>
                  <label style={{ ...LS, fontSize: 10 }}>Días de crédito</label>
                  <input type="number" value={creditForm.dias} onChange={e => setCreditForm(f => ({ ...f, dias: e.target.value }))}
                    placeholder="Ej: 30" style={{ ...IS, fontSize: 13 }} />
                </div>
                <button onClick={solicitarCredito} disabled={savingCredit || !creditForm.monto || !creditForm.dias}
                  style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: savingCredit ? B.navyLight : B.sand, color: B.navy, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {savingCredit ? "..." : "Enviar"}
                </button>
                <button onClick={() => setShowCreditForm(false)} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            )}

            {/* Reglas de aprobación */}
            <div style={{ display: "flex", gap: 8, marginBottom: creditSols.length > 0 ? 14 : 0, flexWrap: "wrap" }}>
              {[
                { label: "Hasta $4.000.000", desc: "Gerente de Ventas", color: B.sky },
                { label: "$4M – $8M", desc: "Gte. Ventas + Gte. General", color: B.warning },
                { label: "Más de $8M", desc: "GV + GG + Director", color: B.pink },
              ].map(r => (
                <div key={r.label} style={{ flex: 1, minWidth: 140, background: B.navy, borderRadius: 8, padding: "8px 12px", borderLeft: `3px solid ${r.color}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: r.color }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{r.desc}</div>
                </div>
              ))}
            </div>

            {/* Solicitudes historial */}
            {creditSols.length > 0 && creditSols.map(sol => {
              const canApproveGV  = currentUserRol === "gerente_ventas"  && sol.estado === "pendiente_gv";
              const canApproveGG  = currentUserRol === "gerente_general" && sol.estado === "pendiente_gg";
              const canApproveDir = currentUserRol === "director"        && sol.estado === "pendiente_director";
              const canApprove = canApproveGV || canApproveGG || canApproveDir;
              const statusMap = {
                pendiente_gv:       { label: "Pendiente Gte. Ventas",   color: B.warning },
                pendiente_gg:       { label: "Pendiente Gte. General",  color: B.sky },
                pendiente_director: { label: "Pendiente Director",      color: B.pink },
                aprobado:           { label: "Aprobado",                color: B.success },
                rechazado:          { label: "Rechazado",               color: B.danger },
              };
              const st = statusMap[sol.estado] || { label: sol.estado, color: B.sand };
              return (
                <div key={sol.id} style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", marginBottom: 8, border: `1px solid ${st.color}33` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>${Number(sol.monto).toLocaleString("es-CO")}</span>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>· {sol.dias} días</span>
                        <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 8, background: st.color + "22", color: st.color, fontWeight: 600 }}>{st.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
                        Solicitado: {new Date(sol.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                        {sol.aprobado_gv_en  && <span> · ✓ GV {new Date(sol.aprobado_gv_en).toLocaleDateString("es-CO",  { day: "2-digit", month: "short" })}</span>}
                        {sol.aprobado_gg_en  && <span> · ✓ GG {new Date(sol.aprobado_gg_en).toLocaleDateString("es-CO",  { day: "2-digit", month: "short" })}</span>}
                        {sol.aprobado_dir_en && <span> · ✓ Dir {new Date(sol.aprobado_dir_en).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</span>}
                      </div>
                    </div>
                    {canApprove && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => aprobarCredito(sol, currentUserRol)} disabled={approvingCredit === sol.id}
                          style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: B.success, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          {approvingCredit === sol.id ? "..." : "✓ Aprobar"}
                        </button>
                        <button onClick={() => rechazarCredito(sol)}
                          style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${B.danger}44`, background: "none", color: B.danger, fontSize: 12, cursor: "pointer" }}>
                          ✕ Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Locaciones */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, color: B.sand }}>Locaciones ({locaciones.length})</h3>
              <button onClick={() => setShowLocForm(true)} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Agregar Locacion</button>
            </div>
            {locaciones.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay locaciones registradas.</div>}
            {locaciones.map(loc => (
              <div key={loc.id} style={{ background: B.navy, borderRadius: 10, padding: 20, marginBottom: 12, border: `1px solid ${B.navyLight}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{loc.nombre}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{[loc.direccion, loc.ciudad, loc.telefono].filter(Boolean).join(" \u00b7 ") || "Sin direccion"}</div>
                  </div>
                  <button onClick={() => deleteLoc(loc.id)} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 14, opacity: 0.6 }}>{"\u2715"}</button>
                </div>
                <div style={{ marginLeft: 12, borderLeft: `2px solid ${B.navyLight}`, paddingLeft: 16 }}>
                  <ContactosList
                    contactos={loc.contactos}
                    onAdd={(form) => addContacto(loc.id, form)}
                    onDelete={(id) => deleteContacto(id, false)}
                    showAddForm={showContactForm === loc.id}
                    setShowAddForm={(v) => setShowContactForm(v ? loc.id : null)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "convenios" && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 15, color: B.sand, marginBottom: 16 }}>Convenios — Tarifas por Pasadia</h3>
          <ConveniosSection aliadoId={aliado.id} comisionBase={aliado.comision} />
        </div>
      )}

      {tab === "historial"  && <HistorialReservasB2B aliadoId={aliado.id} />}
      {tab === "eventos"    && <EventosGruposB2B aliadoId={aliado.id} />}
      {tab === "visitas"    && <VisitasAgencia aliadoId={aliado.id} aliado={aliado} />}
      {tab === "incentivos" && <IncentivosAgencia aliadoId={aliado.id} />}
      {tab === "puntos"     && <PuntosAgencia aliado={aliado} />}

      {showLocForm && <LocacionModal onClose={() => setShowLocForm(false)} onSave={addLocacion} />}
    </div>
  );
}

// ═══════════════════════════════════════════════
// LOCACION MODAL
// ═══════════════════════════════════════════════
function LocacionModal({ onClose, onSave }) {
  const [f, setF] = useState({ nombre: "", direccion: "", ciudad: "", telefono: "", notas: "" });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 460 }}>
        <h3 style={{ marginBottom: 20, fontSize: 17, fontWeight: 700 }}>Nueva Locacion</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={LS}>Nombre de la Sede</label><input value={f.nombre} onChange={e => s("nombre", e.target.value)} placeholder="Ej: Sede Cartagena Centro" style={IS} /></div>
          <div><label style={LS}>Direccion</label><input value={f.direccion} onChange={e => s("direccion", e.target.value)} placeholder="Cra 5 #34-12" style={IS} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LS}>Ciudad</label><input value={f.ciudad} onChange={e => s("ciudad", e.target.value)} placeholder="Cartagena" style={IS} /></div>
            <div><label style={LS}>Telefono</label><input value={f.telefono} onChange={e => s("telefono", e.target.value)} placeholder="+57..." style={IS} /></div>
          </div>
          <div><label style={LS}>Notas</label><textarea value={f.notas} onChange={e => s("notas", e.target.value)} rows={2} style={{ ...IS, resize: "vertical" }} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => { if (f.nombre.trim()) onSave(f); }} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Guardar Locacion</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// NUEVO ALIADO MODAL
// ═══════════════════════════════════════════════
function NuevoAliadoModal({ onClose, onSave }) {
  const [f, setF] = useState({ nombre: "", tipo: "Hotel", contacto: "", tel: "", email: "", credito_monto: "", credito_dias: "", rut: "", rnt: "" });
  const [saving, setSaving] = useState(false);
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const handleSave = async () => {
    if (!f.nombre.trim() || saving) return;
    setSaving(true);
    // Generar codigo_fijo secuencial
    let codigoFijo = null;
    if (supabase) {
      const { data: maxData } = await supabase.from("aliados_b2b").select("codigo_fijo")
        .not("codigo_fijo", "is", null).order("codigo_fijo", { ascending: false }).limit(1);
      const last = maxData?.[0]?.codigo_fijo ? parseInt(maxData[0].codigo_fijo.replace("ATO-", "")) : 0;
      codigoFijo = "ATO-" + String(last + 1).padStart(5, "0");
    }
    await onSave({ id: `B2B-${Date.now()}`, nombre: f.nombre, tipo: f.tipo, contacto: f.contacto, tel: f.tel, email: f.email, credito_monto: Number(f.credito_monto) || null, credito_dias: Number(f.credito_dias) || null, rut: f.rut, rnt: f.rnt, estado: "activo", pax_mes: 0, revenue: 0, codigo_fijo: codigoFijo });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000A", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 520 }}>
        <h3 style={{ marginBottom: 20, fontSize: 17, fontWeight: 700 }}>Nuevo Aliado B2B</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}><label style={LS}>Nombre del Aliado</label><input value={f.nombre} onChange={e => s("nombre", e.target.value)} placeholder="Nombre de la empresa" style={IS} /></div>
          <div style={{ marginBottom: 14 }}><label style={LS}>Tipo</label><select value={f.tipo} onChange={e => s("tipo", e.target.value)} style={IS}><option value="Hotel">Hotel</option><option value="Agencia">Agencia</option><option value="Freelance">Freelance</option><option value="Event Planner">Event Planner</option></select></div>
          <div style={{ marginBottom: 14 }}><label style={LS}>Contacto</label><input value={f.contacto} onChange={e => s("contacto", e.target.value)} placeholder="Nombre del contacto" style={IS} /></div>
          <div style={{ marginBottom: 14 }}><label style={LS}>Telefono</label><input value={f.tel} onChange={e => s("tel", e.target.value)} placeholder="+57 ..." style={IS} /></div>
          <div style={{ marginBottom: 14 }}><label style={LS}>Email</label><input value={f.email} onChange={e => s("email", e.target.value)} placeholder="email@aliado.com" style={IS} /></div>
          <div style={{ marginBottom: 14 }}><label style={LS}>Crédito (monto $)</label><input value={f.credito_monto} onChange={e => s("credito_monto", e.target.value)} placeholder="Ej: 5000000" type="number" style={IS} /></div>
          <div style={{ marginBottom: 14 }}><label style={LS}>Días de crédito</label><input value={f.credito_dias} onChange={e => s("credito_dias", e.target.value)} placeholder="Ej: 30" type="number" style={IS} /></div>
          <div style={{ marginBottom: 14 }}><label style={LS}>RUT</label><input value={f.rut} onChange={e => s("rut", e.target.value)} placeholder="NIT o RUT" style={IS} /></div>
          <div style={{ marginBottom: 14 }}><label style={LS}>RNT</label><input value={f.rnt} onChange={e => s("rnt", e.target.value)} placeholder="Registro Nacional de Turismo" style={IS} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: saving ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? "Guardando..." : "Guardar Aliado"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN B2B COMPONENT
// ═══════════════════════════════════════════════
function AliadosList() {
  const [aliados, setAliados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedAliado, setSelectedAliado] = useState(null);
  const [vendedores, setVendedores] = useState([]);

  const fetchAliados = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data, error }, { data: usrs }] = await Promise.all([
      supabase.from("aliados_b2b").select("*").order("nombre"),
      supabase.from("usuarios").select("id, nombre, rol_id, avatar_color").eq("activo", true).order("nombre"),
    ]);
    if (!error && data) setAliados(data.map(a => ({ id: a.id, tipo: a.tipo, nombre: a.nombre, contacto: a.contacto || "", tel: a.tel || "", email: a.email || "", pax_mes: a.pax_mes || 0, comision: a.comision || 0, revenue: a.revenue || 0, estado: a.estado, rut: a.rut || "", rnt: a.rnt || "", rut_url: a.rut_url || "", rnt_url: a.rnt_url || "", cert_bancaria_url: a.cert_bancaria_url || "", cert_bancaria_pendiente_url: a.cert_bancaria_pendiente_url || "", cert_bancaria_solicitud_fecha: a.cert_bancaria_solicitud_fecha || null, cert_bancaria_solicitud_nota: a.cert_bancaria_solicitud_nota || "", vendedor_id: a.vendedor_id || null })));
    setVendedores(usrs || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAliados(); }, [fetchAliados]);

  if (selectedAliado) {
    const fresh = aliados.find(a => a.id === selectedAliado.id) || selectedAliado;
    return <FichaAliado aliado={fresh} onBack={() => setSelectedAliado(null)} onRefresh={fetchAliados} />;
  }

  const filtered = aliados.filter(a => {
    if (filter !== "todos" && a.tipo.toLowerCase() !== filter) return false;
    if (search && !a.nombre.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const pendienteCertCount = aliados.filter(a => a.cert_bancaria_pendiente_url).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>B2B — Agencias y Aliados</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        <button onClick={() => setShowForm(true)} style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>+ Nuevo Aliado</button>
      </div>

      {/* Alerta global: cambios de cuenta bancaria pendientes */}
      {pendienteCertCount > 0 && (
        <div style={{ background: B.warning + "18", border: `1px solid ${B.warning}44`, borderRadius: 12, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 22 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: B.warning }}>
              {pendienteCertCount} solicitud{pendienteCertCount > 1 ? "es" : ""} de cambio de cuenta bancaria pendiente{pendienteCertCount > 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              Haz clic en el aliado para revisar y aprobar o rechazar el certificado bancario.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Aliados Activos", val: aliados.filter(a => a.estado === "activo").length, color: B.success },
          { label: "Total Aliados", val: aliados.length, color: B.sky },
          { label: "Cuentas Pendientes", val: pendienteCertCount, color: B.warning },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", flex: 1, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {[
          { val: "todos", label: "Todos" },
          { val: "hotel", label: "Hoteles" },
          { val: "agencia", label: "Agencias" },
          { val: "freelance", label: "Freelance" },
          { val: "event planner", label: "Event Planners" },
        ].map(f => (
          <button key={f.val} onClick={() => setFilter(f.val)} style={{
            padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
            background: filter === f.val ? B.sand : B.navyMid, color: filter === f.val ? B.navy : B.white,
          }}>{f.label}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar aliado..."
          style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, width: 220 }} />
      </div>

      <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
              {["Aliado", "Tipo", "RUT", "RNT", "Contacto", "Vendedor", "Crédito", "Estado"].map(h => (
                <th key={h} style={{ padding: "14px 16px", textAlign: "left", fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>No hay aliados registrados</td></tr>}
            {filtered.map(a => (
              <tr key={a.id} onClick={() => setSelectedAliado(a)} style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "14px 16px", fontWeight: 600, fontSize: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {a.nombre}
                    {a.cert_bancaria_pendiente_url && (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: B.warning + "33", color: B.warning, fontWeight: 700 }}>🔔 Cuenta</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "14px 16px" }}><span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: a.tipo === "Hotel" ? B.sky + "33" : a.tipo === "Agencia" ? B.sand + "33" : a.tipo === "Freelance" ? B.success + "33" : B.pink + "33", color: a.tipo === "Hotel" ? B.sky : a.tipo === "Agencia" ? B.sand : a.tipo === "Freelance" ? B.success : B.pink }}>{a.tipo}</span></td>
                <td style={{ padding: "14px 16px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{a.rut || "\u2014"}</td>
                <td style={{ padding: "14px 16px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{a.rnt || "\u2014"}</td>
                <td style={{ padding: "14px 16px", fontSize: 13 }}><div>{a.contacto}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{a.email}</div></td>
                <td style={{ padding: "14px 16px", fontSize: 13 }}>
                  {(() => { const v = vendedores.find(u => u.id === a.vendedor_id); return v
                    ? <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 24, height: 24, borderRadius: 12, background: v.avatar_color || B.sky, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: B.navy, flexShrink: 0 }}>{v.nombre.split(" ").map(w=>w[0]).join("").slice(0,2)}</div><span style={{ fontSize: 12 }}>{v.nombre.split(" ")[0]}</span></div>
                    : <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>—</span>; })()}
                </td>
                <td style={{ padding: "14px 16px", fontSize: 13 }}>{a.credito_monto ? `$${Number(a.credito_monto).toLocaleString("es-CO")} · ${a.credito_dias || 0}d` : <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>}</td>
                <td style={{ padding: "14px 16px" }}><span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: a.estado === "activo" ? B.success : B.navyLight }}>{a.estado === "activo" ? "Activo" : "Inactivo"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <NuevoAliadoModal onClose={() => setShowForm(false)} onSave={async (row) => {
        if (supabase) { await supabase.from("aliados_b2b").insert(row); fetchAliados(); }
        setShowForm(false);
      }} />}
    </div>
  );
}

export default function B2B() {
  const [tab, setTab] = useState("aliados");
  return (
    <div>
      {/* Tabs principales */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, background: B.navyMid, borderRadius: 12, padding: 5 }}>
        {[["aliados", "🏢 Aliados"], ["incentivos", "🎯 Incentivos"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: "11px 20px", borderRadius: 9, border: "none", cursor: "pointer",
            fontSize: 14, fontWeight: tab === k ? 700 : 500,
            background: tab === k ? B.sky : "transparent",
            color: tab === k ? B.navy : "rgba(255,255,255,0.5)",
            transition: "all 0.15s",
          }}>{l}</button>
        ))}
      </div>
      {tab === "aliados"    && <AliadosList />}
      {tab === "incentivos" && <Incentivos />}
    </div>
  );
}
