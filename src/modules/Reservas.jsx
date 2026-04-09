import { useState, useEffect, useCallback } from "react";
import { B, COP, PASADIAS, todayStr, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { logAccion } from "../lib/logAccion";

const fmtHora = (ts) => {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });
};

// ── helpers ──────────────────────────────────────────────────────────────────

const CANALES   = ["Web", "WhatsApp", "B2B", "Teléfono", "Walk-in"];
const VENDEDORES = ["Sin asignar"]; // fallback; real list loaded from usuarios (ventas + gerente_ventas)
const FORMAS_PAGO = ["Transferencia", "Efectivo", "Datafono", "Wompi", "SKY", "CXC", "Enviar Link de Pago"];

const ESTADO_STYLE = {
  confirmado:            { bg: B.success + "22", color: B.success, label: "Confirmado"   },
  check_in:              { bg: B.sky     + "22", color: B.sky,     label: "Check-In ✓"  },
  pendiente:             { bg: B.warning + "22", color: B.warning, label: "Pendiente"    },
  pendiente_pago:        { bg: B.warning + "22", color: B.warning, label: "Pend. Pago"  },
  pendiente_comprobante: { bg: B.sky     + "22", color: B.sky,     label: "Pend. Comp"  },
  cancelado:             { bg: B.danger  + "22", color: B.danger,  label: "Cancelado"   },
};

// pax already booked per salida from reservas data (uses DB salida ids)
function paxPorSalida(reservas, salidas) {
  const map = {};
  salidas.forEach(s => (map[s.id] = 0));
  reservas.forEach(r => {
    if (r.estado !== "cancelado" && map[r.salida] !== undefined)
      map[r.salida] += (r.pax || 0);
  });
  return map;
}

const EMPTY_FORM = {
  nombre: "", contacto: "", telefono: "", fecha: "", tipo: PASADIAS[0]?.tipo || "", pax_a: 1, pax_n: 0,
  salida_id: "", canal: "WhatsApp", precio: PASADIAS[0]?.precio || 0, precio_nino: 0,
  abono: 0, forma_pago: "Transferencia", fecha_pago: "", aliado_id: "", vendedor: "Sin asignar", notas: "",
};

// ── sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ estado }) {
  const s = ESTADO_STYLE[estado] || ESTADO_STYLE.pendiente;
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}44`,
      borderRadius: 20,
      padding: "3px 10px",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.3,
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function DepartureCard({ salida, paxCount, extraCap = 0 }) {
  const cap = (salida.capacidad_total || 30) + extraCap;
  const pct = paxCount / cap;
  const full = pct >= 1;
  const almostFull = pct >= 0.75;
  const barColor = full ? B.danger : almostFull ? B.warning : B.success;
  const statusLabel = full ? "LLENO" : almostFull ? "CASI LLENO" : "DISPONIBLE";
  const statusColor = full ? B.danger : almostFull ? B.warning : B.success;
  const disp = Math.max(0, cap - paxCount);

  return (
    <div style={{
      background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 12,
      padding: "18px 20px", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: B.sand, letterSpacing: 1 }}>
            {salida.nombre}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: B.white, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1.1 }}>
            {salida.hora}
          </div>
          <div style={{ fontSize: 12, color: B.sky, marginTop: 2 }}>Regreso {salida.hora_regreso}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ background: statusColor + "22", color: statusColor, border: `1px solid ${statusColor}44`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
            {statusLabel}
          </span>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{disp} disponibles</div>
        </div>
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: B.sand }}>Pasajeros</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: B.white }}>{paxCount} / {cap}</span>
        </div>
        <div style={{ background: B.navyLight, borderRadius: 4, height: 6, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(pct * 100, 100)}%`, height: "100%", background: barColor, borderRadius: 4, transition: "width 0.4s ease" }} />
        </div>
      </div>
    </div>
  );
}

// ── ReservaDetalle ────────────────────────────────────────────────────────────

function ReservaDetalle({ reserva: r0, onClose, onUpdated, isMobile, salidaList = [], aliadoList = [], vendedoresList = VENDEDORES, pasadiaList = PASADIAS }) {
  const [tab, setTab]           = useState("detalles");
  const [editing, setEdit]      = useState(false);
  const [saving, setSaving]     = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDateModal, setShowDateModal]     = useState(false);
  const [showPagoModal, setShowPagoModal]     = useState(false);
  const [pagoMonto, setPagoMonto]             = useState(0);
  const [pagoForma, setPagoForma]             = useState("Transferencia");
  const [pagoFecha, setPagoFecha]             = useState(todayStr());
  const [cancelNombre, setCancelNombre]       = useState(r0.nombre || "");
  const [newFecha, setNewFecha]               = useState(r0.fecha  || "");
  const [creditDestB2B, setCreditDestB2B]     = useState(false); // true = crédito va al aliado B2B
  const [retractoMode, setRetractoMode]       = useState("retracto"); // "retracto" | "credito" when in retracto period
  const [sendingEmail, setSendingEmail]       = useState(false);
  const [emailSent, setEmailSent]             = useState(false);
  const [form, setForm]     = useState({
    nombre:    r0.nombre    || "",
    contacto:  r0.contacto  || "",
    telefono:  r0.telefono  || "",
    fecha:     r0.fecha     || "",
    salida_id: r0.salida    || "",
    tipo:      r0.tipo      || "",
    canal:     r0.canal     || "",
    pax_a:     r0.pax_a     ?? r0.pax ?? 1,
    pax_n:     r0.pax_n     ?? 0,
    abono:     r0.abono     || 0,
    total:     r0.total     || 0,
    estado:    r0.estado    || "pendiente",
    notas:     r0.notas     || "",
    forma_pago: r0.forma_pago || "Transferencia",
    fecha_pago: r0.fecha_pago ? (r0.fecha_pago + "").slice(0, 10) : "",
    vendedor:   r0.vendedor  || "Sin asignar",
    aliado_id:  r0.aliado_id || "",
    nombre_embarcacion: r0.nombre_embarcacion || "",
    hora_llegada: r0.hora_llegada || "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  // Use stored saldo from DB; only recompute when user edits total or abono
  const saldo = editing ? (form.total - form.abono) : (r0.saldo ?? form.total - form.abono);
  const salida = salidaList.find(s => s.id === form.salida_id);

  // ── Disponibilidad por salida para la fecha seleccionada ─────────────────
  const [paxPorSalidaFecha, setPaxPorSalidaFecha] = useState({});
  const [overridesFecha,    setOverridesFecha]    = useState({});
  const [loadingDisp,       setLoadingDisp]       = useState(false);

  useEffect(() => {
    if (!editing || !form.fecha || !supabase) return;
    setLoadingDisp(true);
    Promise.all([
      supabase.from("reservas").select("salida_id, pax, estado, id")
        .eq("fecha", form.fecha).neq("estado", "cancelado").neq("id", r0.id),
      supabase.from("salidas_override").select("*").eq("fecha", form.fecha),
      supabase.from("cierres").select("tipo, salidas, activo").eq("fecha", form.fecha).eq("activo", true),
    ]).then(([resR, ovrR, cieR]) => {
      const pmap = {};
      salidaList.forEach(s => (pmap[s.id] = 0));
      (resR.data || []).forEach(r => { pmap[r.salida_id] = (pmap[r.salida_id] || 0) + (r.pax || 0); });
      setPaxPorSalidaFecha(pmap);
      const omap = {};
      (ovrR.data || []).forEach(o => { omap[o.salida_id] = o; });
      setOverridesFecha(omap);
      setLoadingDisp(false);
    });
  }, [editing, form.fecha, salidaList, r0.id]);

  // Salidas disponibles para la fecha en edición
  const salidasParaFecha = salidaList.filter(s => {
    if (!s.activo) return false;
    const ovr = overridesFecha[s.id];
    if (ovr?.accion === "cerrar") return false;
    const cap = s.capacidad_total || 30;
    const pax = paxPorSalidaFecha[s.id] || 0;
    if (ovr?.accion === "abrir") return true;
    return pax < cap;
  });

  const dispLabel = (s) => {
    const cap = s.capacidad_total || 30;
    const pax = paxPorSalidaFecha[s.id] || 0;
    const disp = Math.max(0, cap - pax);
    return `${s.hora} — ${s.nombre} (${disp} disponibles)`;
  };
  const aliado = aliadoList.find(a => a.id === form.aliado_id);
  const tieneCXC = aliado && (aliado.cupo_credito || 0) > 0;

  // 24-hour lock: if confirmed and service is within 24h, block edits and date changes
  const horasHastaServicio = r0.fecha
    ? (new Date(r0.fecha + "T08:00:00") - new Date()) / 3_600_000
    : Infinity;
  const dentro24h = r0.estado === "confirmado" && horasHastaServicio < 24 && horasHastaServicio > -48;

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true);
    const pax = Number(form.pax_a) + Number(form.pax_n);
    const emailUpd = form.contacto.trim().includes("@") ? form.contacto.trim() : (r0.email || null);

    // ── Detectar qué cambió para el log ──────────────────────────────────
    const salidaAntes  = salidaList.find(s => s.id === (r0.salida || ""));
    const salidaDespues = salidaList.find(s => s.id === form.salida_id);
    const cambios = [];
    if (r0.fecha     !== form.fecha)      cambios.push(`Fecha: ${r0.fecha} → ${form.fecha}`);
    if ((r0.salida || "") !== form.salida_id) cambios.push(`Horario: ${salidaAntes?.hora || r0.salida || "—"} → ${salidaDespues?.hora || form.salida_id || "—"}`);
    if (r0.estado    !== form.estado)     cambios.push(`Estado: ${r0.estado} → ${form.estado}`);
    if (r0.tipo      !== form.tipo)       cambios.push(`Paquete: ${r0.tipo} → ${form.tipo}`);
    if ((r0.pax_a ?? r0.pax ?? 1) !== Number(form.pax_a) || (r0.pax_n ?? 0) !== Number(form.pax_n))
      cambios.push(`Pax: ${r0.pax_a ?? r0.pax ?? 1}A ${r0.pax_n ?? 0}N → ${form.pax_a}A ${form.pax_n}N`);
    if ((r0.total || 0) !== Number(form.total)) cambios.push(`Total: $${(r0.total||0).toLocaleString()} → $${Number(form.total).toLocaleString()}`);
    if ((r0.abono || 0) !== Number(form.abono)) cambios.push(`Abono: $${(r0.abono||0).toLocaleString()} → $${Number(form.abono).toLocaleString()}`);

    await supabase.from("reservas").update({
      nombre:    form.nombre.trim(),
      contacto:  form.contacto.trim(),
      email:     emailUpd,
      telefono:  form.telefono.trim() || null,
      fecha:     form.fecha,
      salida_id: form.salida_id || null,
      tipo:      form.tipo,
      canal:     form.canal,
      pax_a:     Number(form.pax_a),
      pax_n:     Number(form.pax_n),
      pax,
      abono:     Number(form.abono),
      total:     Number(form.total),
      saldo:     Number(form.total) - Number(form.abono),
      estado:    form.estado,
      notas:     form.notas,
      forma_pago: form.forma_pago || null,
      fecha_pago: form.fecha_pago || null,
      vendedor:   form.vendedor !== "Sin asignar" ? form.vendedor : null,
      aliado_id:  form.aliado_id || null,
      nombre_embarcacion: form.nombre_embarcacion || null,
      hora_llegada: form.hora_llegada || null,
    }).eq("id", r0.id);

    // Log de auditoría
    if (cambios.length > 0) {
      logAccion({
        modulo:       "reservas",
        accion:       "editar_reserva",
        tabla:        "reservas",
        registroId:   r0.id,
        datosAntes:   { fecha: r0.fecha, salida: r0.salida, estado: r0.estado, tipo: r0.tipo, pax: r0.pax, total: r0.total, abono: r0.abono },
        datosDespues: { fecha: form.fecha, salida_id: form.salida_id, estado: form.estado, tipo: form.tipo, pax, total: form.total, abono: form.abono },
        notas:        cambios.join(" | "),
      });
    }

    if (form.estado === "confirmado") await upsertCliente({ ...r0, ...form, pax: Number(form.pax_a) + Number(form.pax_n) });
    setSaving(false);
    setEdit(false);
    onUpdated();
  };

  const handleResendEmail = async () => {
    if (sendingEmail) return;
    setSendingEmail(true);
    try {
      const { data: fresh } = supabase
        ? await supabase.from("reservas").select("*").eq("id", r0.id).single()
        : { data: r0 };
      const resp = await fetch(
        "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/send-confirmation",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fresh || r0) }
      );
      const json = await resp.json();
      if (json.ok || json.id) {
        setEmailSent(true);
        setTimeout(() => setEmailSent(false), 3000);
      } else {
        alert("Error al reenviar: " + (json.error || JSON.stringify(json)));
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSendingEmail(false);
  };

  const handlePago = async () => {
    if (!supabase || pagoMonto <= 0) return;
    setSaving(true);
    const nuevoAbono = (r0.abono || 0) + Number(pagoMonto);
    const nuevoSaldo = (r0.total || 0) - nuevoAbono;
    const nuevoEstado = nuevoSaldo <= 0 ? "confirmado" : r0.estado;
    await supabase.from("reservas").update({
      abono:      nuevoAbono,
      saldo:      Math.max(0, nuevoSaldo),
      estado:     nuevoEstado,
      forma_pago: pagoForma,
      fecha_pago: pagoFecha,
    }).eq("id", r0.id);
    logAccion({ modulo: "reservas", accion: "registrar_pago", tabla: "reservas", registroId: r0.id,
      datosAntes: { abono: r0.abono, saldo: r0.saldo, estado: r0.estado },
      datosDespues: { abono: nuevoAbono, saldo: Math.max(0, nuevoSaldo), estado: nuevoEstado, forma_pago: pagoForma },
      notas: `Pago ${COP(pagoMonto)} vía ${pagoForma}` });
    setSaving(false);
    setShowPagoModal(false);
    onUpdated();
  };

  const upsertCliente = async (reserva) => {
    // email se guarda en reserva.email (nuevo campo) o fallback a reserva.contacto si tiene @
    const emailKey = reserva.email || (reserva.contacto?.includes("@") ? reserva.contacto : null);
    if (!supabase || !emailKey) return;
    const { data: allRes } = await supabase.from("reservas")
      .select("total")
      .or(`email.eq.${emailKey},contacto.eq.${emailKey}`)
      .eq("estado", "confirmado");
    const totalReservas = (allRes || []).length;
    const totalGastado  = (allRes || []).reduce((s, r) => s + (r.total || 0), 0);
    const { data: crdR } = await supabase.from("creditos")
      .select("saldo").eq("cliente_email", emailKey)
      .eq("redimido", false).gte("vigencia_hasta", new Date().toISOString().slice(0,10));
    const creditoDisp = (crdR || []).reduce((s, c) => s + (c.saldo || 0), 0);
    await supabase.from("clientes").upsert({
      id:                emailKey,
      email:             emailKey,
      nombre:            reserva.nombre,
      telefono:          reserva.telefono || null,
      canal_origen:      reserva.canal || null,
      primera_reserva_id: reserva.id,
      total_reservas:    totalReservas,
      total_gastado:     totalGastado,
      credito_disponible: creditoDisp,
      updated_at:        new Date().toISOString(),
    }, { onConflict: "email" });
  };

  const handleEstado = async (estado) => {
    if (!supabase) return;
    // Reservas confirmadas no se pueden devolver a pendiente manualmente
    if (r0.estado === "confirmado") return;
    await supabase.from("reservas").update({ estado }).eq("id", r0.id);
    set("estado", estado);
    if (estado === "confirmado") await upsertCliente({ ...r0, estado: "confirmado" });
    onUpdated();
  };

  // ── Política de cancelación según polizas Atolón ──────────────────────────
  const calcPolitica = () => {
    const now         = new Date();
    const serviceDate = new Date(r0.fecha + "T08:00:00");
    const purchaseDate= new Date(r0.created_at);
    const hoursUntil  = (serviceDate - now) / 3_600_000;
    const calDaysUntil= (serviceDate - now) / 86_400_000;
    const daysSincePurchase = (now - purchaseDate) / 86_400_000;
    // Retracto: compra no presencial, ≤5 días hábiles desde compra, servicio >5 días calendario
    const noPresencial = !["Walk-in", "Presencial"].includes(r0.canal);
    const bizDays = daysSincePurchase * (5 / 7);
    if (noPresencial && bizDays <= 5 && calDaysUntil > 5) {
      return { tipo: "retracto", pct: 100, monto: r0.total, refundType: "dinero",
        label: "Derecho de Retracto (Ley 1480)",
        desc: "100% devolución al medio de pago original dentro de los plazos legales." };
    }
    if (hoursUntil > 48) {
      return { tipo: "politica", pct: 100, monto: r0.total, refundType: "credito",
        label: "Cancelación > 48 h",
        desc: "100% en crédito · Vigencia 12 meses · Transferible · No redimible en dinero." };
    }
    if (hoursUntil >= 24) {
      const monto = Math.round(r0.total * 0.70);
      return { tipo: "politica", pct: 70, monto, refundType: "credito",
        label: "Cancelación 24–48 h",
        desc: "70% en crédito · Vigencia 12 meses · Transferible · No redimible en dinero." };
    }
    return { tipo: "noshow", pct: 0, monto: 0, refundType: "ninguno",
      label: "Menos de 24 h / No show",
      desc: "No aplica crédito ni reprogramación según política de cancelación." };
  };

  const handleCancelacion = async () => {
    if (!supabase) return;
    setSaving(true);
    const pol = calcPolitica();
    // During retracto, user can choose dinero (retracto) or credito
    const efectiveRefundType = pol.tipo === "retracto" && retractoMode === "credito" ? "credito" : pol.refundType;
    const nota = `Cancelado el ${new Date().toLocaleString("es-CO")} — ${pol.label}${pol.tipo === "retracto" && retractoMode === "credito" ? " (cliente optó por crédito)" : ""}`;
    await supabase.from("reservas").update({
      estado: "cancelado",
      notas: r0.notas ? `${r0.notas}\n${nota}` : nota,
    }).eq("id", r0.id);
    if (efectiveRefundType === "credito" && pol.monto > 0) {
      const vigencia = new Date();
      vigencia.setFullYear(vigencia.getFullYear() + 1);
      const esB2B = creditDestB2B && !!aliado;
      await supabase.from("creditos").insert({
        id: `CRD-${Date.now()}`,
        reserva_id:     r0.id,
        cliente_nombre: esB2B ? aliado.nombre : cancelNombre,
        cliente_email:  esB2B ? (aliado.email || null) : (r0.email || null),
        aliado_id:      esB2B ? aliado.id : null,
        monto:          pol.monto,
        saldo:          pol.monto,
        motivo:         pol.label,
        tipo:           esB2B ? "b2b" : pol.tipo,
        vigencia_hasta: vigencia.toISOString().slice(0, 10),
        transferible:   true,
        notas:          esB2B ? `Crédito a cuenta B2B de ${aliado.nombre}` : null,
      });
    }
    logAccion({ modulo: "reservas", accion: "cancelar_reserva", tabla: "reservas", registroId: r0.id,
      datosAntes: { estado: r0.estado, total: r0.total, abono: r0.abono },
      datosDespues: { estado: "cancelado" },
      notas: `${pol.label} — Reembolso: ${pol.refundType} ${COP(pol.monto)}` });
    setSaving(false);
    setShowCancelModal(false);
    set("estado", "cancelado");
    onUpdated();
  };

  const handleCambioFecha = async () => {
    if (!supabase || !newFecha) return;
    setSaving(true);
    await supabase.from("reservas").update({ fecha: newFecha }).eq("id", r0.id);
    logAccion({ modulo: "reservas", accion: "cambiar_fecha", tabla: "reservas", registroId: r0.id,
      datosAntes: { fecha: r0.fecha }, datosDespues: { fecha: newFecha } });
    set("fecha", newFecha);
    setSaving(false);
    setShowDateModal(false);
    onUpdated();
  };

  const IS = {
    background: "#0D1B3E",
    border: `1px solid ${B.navyLight}`,
    borderRadius: 8,
    color: B.white,
    padding: "9px 12px",
    fontSize: 14,
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const LS = { fontSize: 11, color: B.sand, fontWeight: 600, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" };

  const ESTADO_BTNS = [
    { key: "confirmado", label: "✓ Confirmado", color: B.success },
    { key: "pendiente",  label: "⏳ Pendiente",  color: B.warning },
    { key: "cancelado",  label: "✕ Cancelado",   color: B.danger  },
  ];

  const fmtDT = (ts) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <>
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: B.navyMid,
        border: isMobile ? "none" : `1px solid ${B.navyLight}`,
        borderRadius: isMobile ? "20px 20px 0 0" : 16,
        width: "100%",
        maxWidth: isMobile ? "100%" : 680,
        maxHeight: isMobile ? "93dvh" : "90vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{ padding: "18px 24px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: B.sky, fontFamily: "monospace", marginBottom: 3 }}>{r0.id}</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: B.white }}>{r0.nombre}</div>
              <div style={{ fontSize: 13, color: B.sand, marginTop: 2 }}>
                {r0.fecha ? new Date(r0.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : "—"}
                {salida && <> &nbsp;·&nbsp; ⛵ {salida.hora}</>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!editing && <button onClick={() => setEdit(true)} style={{ background: B.navyLight, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.sky, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>✏️ Editar</button>}
              <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 24, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>×</button>
            </div>
          </div>

          {/* Estado — confirmado: solo cambio fecha o cancelación con política */}
          {dentro24h && (
            <div style={{ background: B.warning + "18", border: `1px solid ${B.warning}55`, borderRadius: 8, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: B.warning, fontWeight: 600 }}>
              🔒 Menos de 24 h para el servicio — no se permiten modificaciones ni cambios de fecha. Solo cancelación según política (sin crédito).
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            {r0.estado === "confirmado" ? (
              <>
                <span style={{ fontSize: 12, padding: "4px 14px", borderRadius: 20, background: B.success + "33", border: `1px solid ${B.success}`, color: B.success, fontWeight: 700 }}>✓ Confirmado</span>
                {!dentro24h && <button onClick={() => { setNewFecha(r0.fecha || ""); setShowDateModal(true); }} style={{ background: "transparent", border: `1px solid ${B.sky}`, borderRadius: 20, color: B.sky, padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📅 Cambiar Fecha</button>}
                <button onClick={() => { setCancelNombre(r0.nombre || ""); setShowCancelModal(true); }} style={{ background: "transparent", border: `1px solid ${B.danger}`, borderRadius: 20, color: B.danger, padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>❌ Cancelar Reserva</button>
                <button onClick={handleResendEmail} disabled={sendingEmail} style={{ background: emailSent ? B.success + "22" : "transparent", border: `1px solid ${emailSent ? B.success : B.sand + "88"}`, borderRadius: 20, color: emailSent ? B.success : B.sand, padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: sendingEmail ? "default" : "pointer", opacity: sendingEmail ? 0.6 : 1 }}>
                  {sendingEmail ? "Enviando..." : emailSent ? "✓ Enviado" : "📧 Reenviar correo"}
                </button>
                <a href={`/zarpe-info?id=${r0.id}`} target="_blank" rel="noreferrer" style={{ background: "transparent", border: `1px solid ${B.sky + "66"}`, borderRadius: 20, color: B.sky, padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none" }}>🎫 Certificado</a>
              </>
            ) : (
              ESTADO_BTNS.map(b => (
                <button key={b.key} onClick={() => handleEstado(b.key)} style={{
                  background: form.estado === b.key ? b.color + "33" : "transparent",
                  border: `1px solid ${form.estado === b.key ? b.color : B.navyLight}`,
                  borderRadius: 20,
                  color: form.estado === b.key ? b.color : "rgba(255,255,255,0.4)",
                  padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}>{b.label}</button>
              ))
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${B.navyLight}` }}>
            {["detalles", "pasajeros", "historial"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: "none", border: "none", borderBottom: tab === t ? `2px solid ${B.sky}` : "2px solid transparent",
                color: tab === t ? B.sky : "rgba(255,255,255,0.4)",
                padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                textTransform: "capitalize", marginBottom: -1,
              }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px" }}>

          {/* ── Tab: Detalles ── */}
          {tab === "detalles" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Datos principales */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LS}>Titular</label>
                  {editing ? <input style={IS} value={form.nombre} onChange={e => set("nombre", e.target.value)} /> :
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{r0.nombre}</div>}
                </div>
                <div>
                  <label style={LS}>Email</label>
                  {editing ? <input style={IS} value={form.contacto} onChange={e => set("contacto", e.target.value)} placeholder="correo@ejemplo.com" /> :
                    <div style={{ fontSize: 14, color: r0.contacto ? B.sky : "rgba(255,255,255,0.3)" }}>{r0.email || r0.contacto || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Teléfono / WhatsApp</label>
                  {editing ? <input style={IS} value={form.telefono} onChange={e => set("telefono", e.target.value)} placeholder="+57 300 000 0000" /> :
                    <div style={{ fontSize: 14, color: r0.telefono ? B.white : "rgba(255,255,255,0.3)" }}>{r0.telefono || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Canal</label>
                  {editing ? (
                    <select style={IS} value={form.canal} onChange={e => set("canal", e.target.value)}>
                      {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : <div style={{ fontSize: 14 }}>{r0.canal || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Tipo de pase</label>
                  {editing ? (
                    <select style={IS} value={form.tipo} onChange={e => set("tipo", e.target.value)}>
                      {pasadiaList.map(p => <option key={p.tipo} value={p.tipo}>{p.tipo}</option>)}
                    </select>
                  ) : <div style={{ fontSize: 14 }}>{r0.tipo || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Pax adultos</label>
                  {editing ? <input type="number" min={0} style={IS} value={form.pax_a} onChange={e => set("pax_a", Number(e.target.value))} /> :
                    <div style={{ fontSize: 14 }}>{r0.pax_a ?? r0.pax ?? "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Pax niños (0–12)</label>
                  {editing ? <input type="number" min={0} style={IS} value={form.pax_n} onChange={e => set("pax_n", Number(e.target.value))} /> :
                    <div style={{ fontSize: 14 }}>{r0.pax_n ?? 0}</div>}
                </div>
                <div>
                  <label style={LS}>Fecha</label>
                  {editing ? <input type="date" style={IS} value={form.fecha} onChange={e => set("fecha", e.target.value)} /> :
                    <div style={{ fontSize: 14 }}>{r0.fecha || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Horario de salida {loadingDisp && <span style={{ color: B.sky, fontWeight: 400 }}>· verificando...</span>}</label>
                  {editing ? (
                    <select style={IS} value={form.salida_id} onChange={e => set("salida_id", e.target.value)}>
                      <option value="">Sin asignar</option>
                      {(salidasParaFecha.length > 0 ? salidasParaFecha : salidaList).map(s => (
                        <option key={s.id} value={s.id}>{dispLabel(s)}</option>
                      ))}
                      {/* Si la salida actual no está en la lista disponible, mostrarla igual */}
                      {form.salida_id && !salidasParaFecha.find(s => s.id === form.salida_id) && salidaList.find(s => s.id === form.salida_id) && (
                        <option value={form.salida_id} disabled>
                          ⚠️ {salidaList.find(s => s.id === form.salida_id)?.hora} — Sin disponibilidad
                        </option>
                      )}
                    </select>
                  ) : <div style={{ fontSize: 14 }}>{salida ? `${salida.hora} — ${salida.nombre}` : r0.salida || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Vendedor</label>
                  {editing ? (
                    <select style={IS} value={form.vendedor} onChange={e => set("vendedor", e.target.value)}>
                      {vendedoresList.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : <div style={{ fontSize: 14, color: r0.vendedor ? B.white : "rgba(255,255,255,0.3)" }}>{r0.vendedor || "Sin asignar"}</div>}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LS}>Agencia B2B</label>
                  {editing ? (
                    <select style={IS} value={form.aliado_id} onChange={e => set("aliado_id", e.target.value)}>
                      <option value="">Sin agencia</option>
                      {aliadoList.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                  ) : (
                    <div style={{ fontSize: 14, color: aliado ? B.sky : "rgba(255,255,255,0.3)" }}>
                      {aliado ? aliado.nombre : (r0.agencia || "Sin agencia")}
                    </div>
                  )}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LS}>Notas</label>
                  {editing ? <textarea rows={3} style={{ ...IS, resize: "vertical" }} value={form.notas} onChange={e => set("notas", e.target.value)} placeholder="Observaciones especiales…" /> :
                    <div style={{ fontSize: 13, color: r0.notas ? B.sand : "rgba(255,255,255,0.3)" }}>{r0.notas || "Sin notas"}</div>}
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: `1px solid ${B.navyLight}` }} />

              {/* Pagos */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>💳 Pagos</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Total", value: COP(form.total), color: B.white },
                    { label: "Abonado", value: COP(form.abono), color: B.success },
                    { label: "Saldo", value: COP(Math.max(0, saldo)), color: saldo > 0 ? B.warning : B.success },
                  ].map(p => (
                    <div key={p.label} style={{ background: "#0D1B3E", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{p.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: p.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{p.value}</div>
                    </div>
                  ))}
                </div>
                {editing && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={LS}>Total (COP)</label>
                      <input type="number" min={0} style={IS} value={form.total} onChange={e => set("total", Number(e.target.value))} />
                    </div>
                    <div>
                      <label style={LS}>Abono (COP)</label>
                      <input type="number" min={0} style={IS} value={form.abono} onChange={e => set("abono", Number(e.target.value))} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={LS}>Forma de pago</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {FORMAS_PAGO.filter(f => f !== "CXC" || tieneCXC).map(fp => (
                          <button key={fp} onClick={() => set("forma_pago", fp)} style={{
                            padding: "5px 12px", borderRadius: 20,
                            border: `1px solid ${form.forma_pago === fp ? B.sky : B.navyLight}`,
                            background: form.forma_pago === fp ? B.sky + "22" : "transparent",
                            color: form.forma_pago === fp ? B.sky : "rgba(255,255,255,0.5)",
                            fontSize: 12, fontWeight: 600, cursor: "pointer",
                          }}>{fp}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={LS}>Fecha de pago</label>
                      <input type="date" style={IS} value={form.fecha_pago || ""} onChange={e => set("fecha_pago", e.target.value)} />
                    </div>
                  </div>
                )}
                {!editing && (r0.forma_pago || form.forma_pago) && (
                  <div style={{ marginTop: 10, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                    Método de pago: <strong style={{ color: B.sky }}>{r0.forma_pago || form.forma_pago}</strong>
                    {r0.fecha_pago && <span style={{ marginLeft: 10 }}>· Fecha: <strong style={{ color: B.sand }}>{new Date(r0.fecha_pago + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}</strong></span>}
                  </div>
                )}
                {!editing && saldo > 0 && (
                  <button onClick={() => { setPagoMonto(saldo); setPagoFecha(todayStr()); setPagoForma(r0.forma_pago || "Transferencia"); setShowPagoModal(true); }}
                    style={{ marginTop: 14, background: B.success + "22", border: `1px solid ${B.success}`, borderRadius: 8, color: B.success, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", width: "100%" }}>
                    💳 Registrar Pago
                  </button>
                )}
              </div>

              {/* Save / Cancel */}
              {editing && (
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
                  <button onClick={() => { setEdit(false); setForm({ nombre: r0.nombre||"", contacto: r0.contacto||"", telefono: r0.telefono||"", fecha: r0.fecha||"", salida_id: r0.salida||"", tipo: r0.tipo||"", canal: r0.canal||"", pax_a: r0.pax_a??r0.pax??1, pax_n: r0.pax_n??0, abono: r0.abono||0, total: r0.total||0, estado: r0.estado||"pendiente", notas: r0.notas||"" }); }} style={{ background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.sand, padding: "9px 20px", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button onClick={handleSave} disabled={saving} style={{ background: B.sky, border: "none", borderRadius: 8, color: B.navy, padding: "9px 24px", fontSize: 14, cursor: "pointer", fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
                    {saving ? "Guardando…" : "💾 Guardar cambios"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Pasajeros ── */}
          {tab === "pasajeros" && (
            <div>
              {(!r0.pasajeros || r0.pasajeros.length === 0) ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🧍</div>
                  <div style={{ fontSize: 14 }}>No hay datos de pasajeros registrados</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {r0.pasajeros.map((p, i) => (
                    <div key={i} style={{ background: "#0D1B3E", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.nombre || `Pasajero ${i + 1}`}</div>
                      <div style={{ fontSize: 13, color: B.sand, display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {p.identificacion && <span>🪪 {p.identificacion}</span>}
                        {p.nacionalidad && <span>🌍 {p.nacionalidad}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Historial ── */}
          {tab === "historial" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { icon: "🗓", label: "Reserva creada",    value: fmtDT(r0.created_at), color: B.sky    },
                { icon: "✏️", label: "Última modificación", value: fmtDT(r0.updated_at), color: B.sand   },
                r0.forma_pago && { icon: "💳", label: "Método de pago", value: r0.forma_pago, color: B.white },
                r0.canal && { icon: "📡", label: "Canal de venta",    value: r0.canal, color: B.white },
                r0.vendedor && { icon: "🧑‍💼", label: "Vendedor",         value: r0.vendedor, color: B.sand },
                (aliado || r0.agencia) && { icon: "🏢", label: "Agencia B2B", value: aliado?.nombre || r0.agencia, color: B.sky },
                r0.nombre_embarcacion && { icon: "⛵", label: "Embarcación",        value: r0.nombre_embarcacion, color: B.sky },
                r0.hora_llegada && { icon: "🕐", label: "Hora est. llegada", value: r0.hora_llegada, color: B.sky },
                r0.ci && { icon: "✅", label: "Check-in realizado",  value: fmtDT(r0.ci), color: B.success },
                r0.co && { icon: "🏁", label: "Check-out",            value: fmtDT(r0.co), color: B.sand },
                r0.ep && { icon: "🌅", label: "Llegada temprana",     value: "Activado",   color: B.warning },
                r0.extension && { icon: "🌙", label: "Extensión",         value: `${r0.extension} día(s) · Regreso ${r0.ext_regreso || "—"}`, color: B.sand },
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{ background: "#0D1B3E", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: item.color }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── Modal: Registrar Pago ── */}
    {showPagoModal && (
      <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        onClick={e => e.target === e.currentTarget && setShowPagoModal(false)}>
        <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 360, border: `1px solid ${B.navyLight}` }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: B.white }}>💳 Registrar Pago</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>Monto (COP)</label>
              <input type="number" min={0} max={saldo} value={pagoMonto} onChange={e => setPagoMonto(Number(e.target.value))}
                style={{ background: "#0D1B3E", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, padding: "9px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" }} />
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Saldo actual: {COP(saldo)}</div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }}>Fecha de pago *</label>
              <input type="date" value={pagoFecha} onChange={e => setPagoFecha(e.target.value)}
                style={{ background: "#0D1B3E", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, padding: "9px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>Forma de pago</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {FORMAS_PAGO.filter(f => f !== "Enviar Link de Pago" && (f !== "CXC" || tieneCXC)).map(fp => (
                  <button key={fp} onClick={() => setPagoForma(fp)} style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${pagoForma === fp ? B.sky : B.navyLight}`,
                    background: pagoForma === fp ? B.sky + "22" : "transparent",
                    color: pagoForma === fp ? B.sky : "rgba(255,255,255,0.5)",
                  }}>{fp}</button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button onClick={() => setShowPagoModal(false)} style={{ flex: 1, background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.sand, padding: "10px", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
            <button onClick={handlePago} disabled={saving || pagoMonto <= 0 || !pagoFecha}
              style={{ flex: 2, background: B.success, border: "none", borderRadius: 8, color: B.navy, padding: "10px", fontSize: 14, cursor: "pointer", fontWeight: 700, opacity: (saving || pagoMonto <= 0 || !pagoFecha) ? 0.5 : 1 }}>
              {saving ? "Guardando…" : `Registrar ${COP(pagoMonto)}`}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal: Cambiar Fecha ── */}
    {showDateModal && (
      <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        onClick={e => e.target === e.currentTarget && setShowDateModal(false)}>
        <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 340, border: `1px solid ${B.navyLight}` }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>📅 Cambiar Fecha</h3>
          <div style={{ marginBottom: 8, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Fecha actual: <strong style={{ color: B.white }}>{fmtFecha(r0.fecha)}</strong></div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 6, textTransform: "uppercase" }}>Nueva Fecha</label>
            <input type="date" value={newFecha} onChange={e => setNewFecha(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>⚠️ Sujeto a disponibilidad. Diferencias tarifarias son asumidas por el cliente.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowDateModal(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, background: B.navyLight, border: "none", color: B.white, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={handleCambioFecha} disabled={saving || !newFecha || newFecha === r0.fecha}
              style={{ flex: 1, padding: "10px", borderRadius: 8, background: B.sky, border: "none", color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: (!newFecha || newFecha === r0.fecha) ? 0.5 : 1 }}>
              {saving ? "Guardando..." : "Confirmar Cambio"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal: Cancelación con Política ── */}
    {showCancelModal && (() => {
      const pol = calcPolitica();
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowCancelModal(false)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 420, border: `1px solid ${B.danger}44` }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: B.danger }}>❌ Cancelar Reserva</h3>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{r0.id} · {r0.nombre}</div>

            {/* Política aplicable */}
            <div style={{ background: pol.refundType === "dinero" ? B.success + "15" : pol.refundType === "credito" ? B.sky + "15" : B.danger + "15", borderRadius: 10, padding: "14px 16px", marginBottom: 20, border: `1px solid ${pol.refundType === "dinero" ? B.success + "44" : pol.refundType === "credito" ? B.sky + "44" : B.danger + "44"}` }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Política aplicable</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 6 }}>{pol.label}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{pol.desc}</div>
              {pol.monto > 0 && (
                <div style={{ marginTop: 12, fontSize: 22, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: pol.refundType === "dinero" ? B.success : B.sky }}>
                  {COP(pol.monto)} <span style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.5)" }}>{pol.refundType === "dinero" ? "reembolso" : "en crédito"}</span>
                </div>
              )}
            </div>

            {/* Retracto: ofrecer opción de crédito en lugar de devolución */}
            {pol.tipo === "retracto" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 8, textTransform: "uppercase" }}>¿Cómo desea el reembolso?</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { key: "retracto", label: "💸 Devolución de dinero", desc: "Retracto Ley 1480" },
                    { key: "credito",  label: "🎟️ Crédito a favor",       desc: "100% vigencia 12 meses" },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => setRetractoMode(opt.key)}
                      style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: `1.5px solid ${retractoMode === opt.key ? B.success : B.navyLight}`, background: retractoMode === opt.key ? B.success + "22" : "transparent", color: retractoMode === opt.key ? B.success : "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                      <div>{opt.label}</div>
                      <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.7 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Destino del crédito — cliente o B2B */}
            {(pol.refundType === "credito" || (pol.tipo === "retracto" && retractoMode === "credito")) && pol.monto > 0 && aliado && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 8, textTransform: "uppercase" }}>Destino del crédito</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { key: false, label: "👤 Cliente" },
                    { key: true,  label: `🏢 B2B — ${aliado.nombre}` },
                  ].map(opt => (
                    <button key={String(opt.key)} onClick={() => { setCreditDestB2B(opt.key); if (!opt.key) setCancelNombre(r0.nombre || ""); }}
                      style={{ flex: 1, padding: "9px 10px", borderRadius: 8, border: `1.5px solid ${creditDestB2B === opt.key ? B.sky : B.navyLight}`, background: creditDestB2B === opt.key ? B.sky + "22" : "transparent", color: creditDestB2B === opt.key ? B.sky : "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Nombre para el crédito */}
            {(pol.refundType === "credito" || (pol.tipo === "retracto" && retractoMode === "credito")) && pol.monto > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 6, textTransform: "uppercase" }}>
                  {creditDestB2B && aliado ? "Agencia B2B" : "Crédito a nombre de"}
                </label>
                {creditDestB2B && aliado ? (
                  <div style={{ padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.sky}44`, color: B.sky, fontSize: 14, fontWeight: 600 }}>
                    🏢 {aliado.nombre}
                  </div>
                ) : (
                  <input value={cancelNombre} onChange={e => setCancelNombre(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.sky}`, color: B.white, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                )}
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                  {creditDestB2B && aliado
                    ? "El crédito se registra en la cuenta del aliado B2B. Vigencia 12 meses, transferible."
                    : "El crédito queda registrado a este nombre. Vigencia 12 meses, transferible."}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCancelModal(false)} style={{ flex: 1, padding: "11px", borderRadius: 8, background: B.navyLight, border: "none", color: B.white, fontSize: 13, cursor: "pointer" }}>Volver</button>
              <button onClick={handleCancelacion} disabled={saving}
                style={{ flex: 1, padding: "11px", borderRadius: 8, background: B.danger, border: "none", color: B.white, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Procesando..." : "Confirmar Cancelación"}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}

// ── modal ─────────────────────────────────────────────────────────────────────

function ReservaModal({ onClose, onSave, isMobile, salidaList = [], aliadoList = [], vendedoresList = VENDEDORES, pasadiaList = PASADIAS, conveniosMap = {}, paxMap = {}, fechaDefault, getSalidasVisibles }) {
  const initFecha = fechaDefault || todayStr();
  const [form, setForm]       = useState({ ...EMPTY_FORM, fecha: initFecha, salida_id: "" });
  const [errors, setErrors]   = useState({});
  const [linkPago, setLinkPago] = useState("");
  const [precioMode, setPrecioMode] = useState("full"); // "full" | "neto"
  const [paxMapFecha,    setPaxMapFecha]    = useState(paxMap); // pax by salida for selected date
  const [overridesFecha, setOverridesFecha] = useState({});    // salidas_override map for selected date
  const [cierreFecha,    setCierreFecha]    = useState(null);  // cierre activo para la fecha seleccionada

  // Fetch real pax counts + overrides + cierres for the selected date
  useEffect(() => {
    if (!supabase || !form.fecha) return;
    Promise.all([
      supabase.from("reservas").select("salida_id, pax, estado").eq("fecha", form.fecha).neq("estado", "cancelado"),
      supabase.from("salidas_override").select("*").eq("fecha", form.fecha),
      supabase.from("cierres").select("tipo, salidas, activo, motivo").eq("fecha", form.fecha).eq("activo", true).limit(1),
    ]).then(([resR, ovrR, cieR]) => {
      const map = {};
      salidaList.forEach(s => (map[s.id] = 0));
      (resR.data || []).forEach(r => { map[r.salida_id] = (map[r.salida_id] || 0) + (r.pax || 0); });
      setPaxMapFecha(map);
      const omap = {};
      (ovrR.data || []).forEach(o => { omap[o.salida_id] = o; });
      setOverridesFecha(omap);
      setCierreFecha((cieR.data && cieR.data.length > 0) ? cieR.data[0] : null);
    });
  }, [form.fecha, salidaList]);

  const calcPrecio = (tipo, aliado_id, mode) => {
    const p = pasadiaList.find(p => p.tipo.toLowerCase() === tipo?.toLowerCase());
    if (!p) return 0;
    if (aliado_id && mode === "neto") {
      const tarifaAliado = conveniosMap[aliado_id]?.[tipo?.toLowerCase()];
      if (tarifaAliado > 0) return tarifaAliado;
      if (p.precio_neto_agencia > 0) return p.precio_neto_agencia;
    }
    return p.precio;
  };

  const calcPrecioNino = (tipo, aliado_id, mode) => {
    const p = pasadiaList.find(p => p.tipo.toLowerCase() === tipo?.toLowerCase());
    if (!p) return 0;
    if (aliado_id && mode === "neto") {
      const tarifaAliadoNino = conveniosMap[aliado_id]?.[tipo?.toLowerCase() + "__nino"];
      if (tarifaAliadoNino > 0) return tarifaAliadoNino;
      if (p.precio_neto_nino > 0) return p.precio_neto_nino;
    }
    return p.precio_nino || 0;
  };

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === "tipo") {
        next.precio      = calcPrecio(v, f.aliado_id, precioMode);
        next.precio_nino = calcPrecioNino(v, f.aliado_id, precioMode);
      }
      if (k === "aliado_id") {
        const aliado = aliadoList.find(a => a.id === v);
        if (!aliado || !aliado.cupo_credito) next.forma_pago = "Transferencia";
        next.precio      = calcPrecio(f.tipo, v, precioMode);
        next.precio_nino = calcPrecioNino(f.tipo, v, precioMode);
      }
      // CXC = crédito, no hay abono en efectivo
      if (k === "forma_pago" && v === "CXC") {
        next.abono = 0;
      }
      return next;
    });
    setErrors(e => ({ ...e, [k]: undefined }));
  };

  const handlePrecioMode = (mode) => {
    setPrecioMode(mode);
    setForm(f => ({
      ...f,
      precio:      calcPrecio(f.tipo, f.aliado_id, mode),
      precio_nino: calcPrecioNino(f.tipo, f.aliado_id, mode),
    }));
  };

  const aliado = aliadoList.find(a => a.id === form.aliado_id);
  const tieneCXC = aliado && (aliado.cupo_credito || 0) > 0;
  const pasadiaActual = pasadiaList.find(p => p.tipo.toLowerCase() === form.tipo?.toLowerCase());
  const sinTransporte = pasadiaActual?.sin_embarcacion === true;
  const precioFull     = pasadiaActual?.precio || 0;
  const precioNeto     = (form.aliado_id && conveniosMap[form.aliado_id]?.[form.tipo?.toLowerCase()])
    || pasadiaActual?.precio_neto_agencia || 0;
  const precioNinoFull = pasadiaActual?.precio_nino || 0;
  const precioNinoNeto = (form.aliado_id && conveniosMap[form.aliado_id]?.[form.tipo?.toLowerCase() + "__nino"])
    || pasadiaActual?.precio_neto_nino || 0;
  const tieneNino = precioNinoFull > 0; // esta pasadía tiene tarifa de niño
  const formasPagoDisp = form.forma_pago === "Enviar Link de Pago"
    ? FORMAS_PAGO
    : FORMAS_PAGO.filter(f => f !== "CXC" || tieneCXC);

  // Salidas visible for selected date — uses locally fetched overridesFecha + cierreFecha
  const salidasFecha = (() => {
    // Si hay cierre total: ninguna salida disponible
    if (cierreFecha?.tipo === "total") return [];
    const activas = salidaList.filter(s => s.activo);
    const sorted = [...activas].sort((a, b) => a.hora.localeCompare(b.hora));
    return sorted.filter((s, idx) => {
      const ovr = overridesFecha[s.id];
      if (ovr?.accion === "abrir") return true;   // manual calendar override: force open
      if (ovr?.accion === "cerrar") return false;  // manual calendar override: force close
      // Cierre parcial: bloquea las salidas específicas
      if (cierreFecha && (cierreFecha.salidas || []).includes(s.id)) return false;
      if (!s.auto_apertura) return true;           // fixed salida: always open
      if (idx === 0) return true;
      const prev = sorted[idx - 1];
      const prevCap = (prev.capacidad_total || 1) + (overridesFecha[prev.id]?.extra_embarcaciones || []).reduce((sum, e) => sum + (e.capacidad || 0), 0);
      const pct = (paxMapFecha[prev.id] || 0) / prevCap;
      return pct >= (prev.auto_umbral || 75) / 100;
    });
  })();

  // Effective capacity including extra boats from calendar overrides
  const getCapacity = (sal) => {
    const extraCap = (overridesFecha[sal.id]?.extra_embarcaciones || []).reduce((sum, e) => sum + (e.capacidad || 0), 0);
    return (sal.capacidad_total || 30) + extraCap;
  };

  // Availability per salida (uses live fetch + calendar overrides for selected date)
  const getDisp = (sal) => {
    const usados = paxMapFecha[sal.id] || 0;
    return Math.max(0, getCapacity(sal) - usados);
  };

  const validate = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = "Requerido";
    // Teléfono opcional para reservas B2B (la agencia puede no tener el dato del cliente)
    if (form.canal !== "B2B") {
      if (!form.telefono.trim() || !/^[\d\s+\-()\\.]{7,}$/.test(form.telefono)) e.telefono = "Teléfono requerido";
    }
    if (!form.fecha)         e.fecha = "Requerido";
    if (cierreFecha?.tipo === "total") e.fecha = "Fecha cerrada — no se pueden crear reservas";
    if (!form.salida_id && !sinTransporte) e.salida_id = "Requerido";
    if ((Number(form.pax_a) + Number(form.pax_n)) < 1) e.pax_a = "Min 1 pax";
    if (form.precio < 0)     e.precio = "Inválido";
    if (form.abono < 0)      e.abono  = "Inválido";
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const isLink = form.forma_pago === "Enviar Link de Pago";
    const reservaId = await onSave({ ...form, _isLink: isLink });
    if (isLink && reservaId) {
      setLinkPago(`${window.location.origin}/pago?reserva=${reservaId}`);
    } else {
      onClose();
    }
  };

  const IS = (err) => ({
    background: "#0D1B3E", border: `1px solid ${err ? B.danger : B.navyLight}`,
    borderRadius: 8, color: B.white, padding: "9px 12px", fontSize: 14,
    width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  });
  const LS = { fontSize: 11, color: B.sand, fontWeight: 600, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" };
  const FS = { display: "flex", flexDirection: "column", gap: 4 };
  const G2 = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 };

  if (linkPago) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#00000088", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 16, width: "100%", maxWidth: 480, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: B.white, marginBottom: 8 }}>Reserva creada</div>
          <div style={{ fontSize: 13, color: B.sand, marginBottom: 20 }}>Copia y envía este link de pago al cliente:</div>
          <div style={{ background: "#0D1B3E", borderRadius: 10, padding: "14px 16px", marginBottom: 16, wordBreak: "break-all", fontSize: 13, color: B.sky, fontFamily: "monospace" }}>{linkPago}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { navigator.clipboard?.writeText(linkPago); }} style={{ flex: 1, padding: "11px", background: B.navyLight, border: "none", borderRadius: 8, color: B.white, fontWeight: 700, cursor: "pointer" }}>📋 Copiar</button>
            <button onClick={onClose} style={{ flex: 1, padding: "11px", background: B.sky, border: "none", borderRadius: 8, color: B.navy, fontWeight: 700, cursor: "pointer" }}>✓ Listo</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#00000088", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: isMobile ? 0 : 16, width: "100%", maxWidth: isMobile ? "100%" : 600, maxHeight: isMobile ? "100%" : "92vh", height: isMobile ? "100%" : "auto", overflowY: "auto", padding: isMobile ? "20px 16px" : 28, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: B.sand, margin: 0 }}>Nueva Reserva</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>×</button>
        </div>

        {/* ── Titular ── */}
        <div style={G2}>
          <div style={{ ...FS, gridColumn: "1 / -1" }}>
            <label style={LS}>Nombre del titular *</label>
            <input style={IS(errors.nombre)} value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: Valentina Ospina" autoFocus />
            {errors.nombre && <span style={{ fontSize: 11, color: B.danger }}>{errors.nombre}</span>}
          </div>
          <div style={FS}>
            <label style={LS}>Email</label>
            <input style={IS()} value={form.contacto} onChange={e => set("contacto", e.target.value)} placeholder="correo@ejemplo.com" />
          </div>
          <div style={FS}>
            <label style={LS}>Teléfono / WhatsApp *</label>
            <input style={IS(errors.telefono)} value={form.telefono} onChange={e => set("telefono", e.target.value)} placeholder="+57 300 000 0000" />
            {errors.telefono && <span style={{ fontSize: 11, color: B.danger }}>{errors.telefono}</span>}
          </div>
          <div style={FS}>
            <label style={LS}>Canal</label>
            <select style={IS()} value={form.canal} onChange={e => set("canal", e.target.value)}>
              {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={FS}>
            <label style={LS}>Fecha de servicio *</label>
            <input type="date" style={IS(errors.fecha)} value={form.fecha} onChange={e => { set("fecha", e.target.value); set("salida_id", ""); }} />
            {errors.fecha && <span style={{ fontSize: 11, color: B.danger }}>{errors.fecha}</span>}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${B.navyLight}` }} />

        {/* ── Producto y salida ── */}
        <div style={G2}>
          <div style={FS}>
            <label style={LS}>Tipo de pase</label>
            <select style={IS()} value={form.tipo} onChange={e => set("tipo", e.target.value)}>
              {pasadiaList.map(p => <option key={p.tipo} value={p.tipo}>{p.tipo}</option>)}
            </select>
          </div>
          <div style={FS}>
            <label style={LS}>Precio por pax (COP)</label>
            {/* Agencia seleccionada: toggle neto/público */}
            {form.aliado_id ? (
              <div>
                <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                  <button type="button" onClick={() => handlePrecioMode("full")}
                    style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                      background: precioMode === "full" ? B.sky : B.navyLight,
                      color: precioMode === "full" ? B.navy : "rgba(255,255,255,0.5)" }}>
                    Público {precioFull > 0 ? COP(precioFull) : ""}
                  </button>
                  <button type="button" onClick={() => handlePrecioMode("neto")}
                    style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                      background: precioMode === "neto" ? B.warning : B.navyLight,
                      color: precioMode === "neto" ? B.navy : "rgba(255,255,255,0.5)" }}>
                    Neto {precioNeto > 0 ? COP(precioNeto) : ""}
                  </button>
                </div>
                {precioMode === "neto" && precioNeto === 0
                  ? <input type="number" min={0} style={IS()} value={form.precio}
                      onChange={e => setForm(f => ({ ...f, precio: Number(e.target.value) }))}
                      placeholder="Ingresa precio neto" />
                  : <div style={{ ...IS(), background: B.navyLight, color: B.sand, fontWeight: 700, cursor: "default", userSelect: "none" }}>
                      {form.precio > 0 ? COP(form.precio) : "—"}
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 8, fontWeight: 400 }}>
                        ({precioMode === "neto" ? "precio neto agencia" : "precio público"})
                      </span>
                    </div>
                }
              </div>
            ) : (
              <div style={{ ...IS(), background: B.navyLight, color: B.sand, fontWeight: 700, cursor: "default", userSelect: "none" }}>
                {form.precio > 0 ? COP(form.precio) : "—"}
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 8, fontWeight: 400 }}>precio oficial</span>
              </div>
            )}
          </div>
          <div style={FS}>
            <label style={LS}>Adultos</label>
            <input type="number" min={0} style={IS(errors.pax_a)} value={form.pax_a} onChange={e => set("pax_a", Number(e.target.value))} />
            {errors.pax_a && <span style={{ fontSize: 11, color: B.danger }}>{errors.pax_a}</span>}
          </div>
          <div style={FS}>
            <label style={LS}>Niños (0–12)</label>
            <input type="number" min={0} style={IS()} value={form.pax_n} onChange={e => set("pax_n", Number(e.target.value))} />
          </div>
          {/* Precio niño: solo visible cuando hay niños y la pasadía tiene tarifa de niño */}
          {Number(form.pax_n) > 0 && tieneNino && (
            <div style={{ ...FS, gridColumn: "1 / -1" }}>
              <label style={LS}>Precio por niño</label>
              <div style={{ ...IS(), background: B.navyLight, color: B.sky, fontWeight: 700, cursor: "default", userSelect: "none" }}>
                {COP(form.precio_nino > 0 ? form.precio_nino : precioNinoFull)}
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 8, fontWeight: 400 }}>
                  ({precioMode === "neto" ? "tarifa neta niño" : "precio público niño"})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Banner de cierre — fecha bloqueada */}
        {cierreFecha && (
          <div style={{ background: "#D6454522", border: `1px solid #D64545`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔒</span>
            <div>
              <div style={{ fontWeight: 700, color: "#F87171", fontSize: 13 }}>
                {cierreFecha.tipo === "total" ? "Fecha cerrada — sin disponibilidad" : "Cierre parcial en esta fecha"}
              </div>
              {cierreFecha.motivo && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{cierreFecha.motivo}</div>}
            </div>
          </div>
        )}

        {/* Embarcación propia — solo para pasadías sin transporte (After Island, etc.) */}
        {sinTransporte && (
          <div style={{ background: "#0D1B3E44", border: `1px solid ${B.navyLight}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 12 }}>
              ⛵ Embarcación del cliente
            </div>
            <div style={G2}>
              <div style={FS}>
                <label style={LS}>Nombre de la embarcación</label>
                <input style={IS()} type="text" placeholder="Ej: El Delfín" value={form.nombre_embarcacion || ""} onChange={e => set("nombre_embarcacion", e.target.value)} />
              </div>
              <div style={FS}>
                <label style={LS}>Hora estimada de llegada</label>
                <input style={IS()} type="time" value={form.hora_llegada || ""} onChange={e => set("hora_llegada", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Salida selector con disponibilidad — oculto si pasadía es sin transporte */}
        {!sinTransporte && <div style={FS}>
          <label style={LS}>Horario de salida *</label>
          {salidasFecha.length === 0 ? (
            <div style={{ fontSize: 13, color: B.warning }}>No hay salidas abiertas para esta fecha</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {salidasFecha.map(s => {
                const disp = getDisp(s);
                const full = disp === 0;
                const sel  = form.salida_id === s.id;
                return (
                  <div key={s.id} onClick={() => !full && set("salida_id", s.id)} style={{
                    background: sel ? B.sky + "22" : "#0D1B3E",
                    border: `1.5px solid ${sel ? B.sky : full ? B.danger + "44" : B.navyLight}`,
                    borderRadius: 10, padding: "12px 14px", cursor: full ? "not-allowed" : "pointer",
                    opacity: full ? 0.5 : 1, display: "flex", justifyContent: "space-between", alignItems: "center",
                    transition: "all 0.15s",
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: sel ? B.sky : B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {s.hora} — {s.nombre}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                        Regreso {s.hora_regreso}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: full ? B.danger : disp <= 5 ? B.warning : B.success }}>
                        {full ? "LLENO" : `${disp} disp.`}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{(paxMapFecha[s.id] || 0)}/{getCapacity(s)} pax</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {errors.salida_id && <span style={{ fontSize: 11, color: B.danger }}>{errors.salida_id}</span>}
        </div>}

        <div style={{ borderTop: `1px solid ${B.navyLight}` }} />

        {/* ── Venta / Asignación ── */}
        <div style={G2}>
          <div style={FS}>
            <label style={LS}>Vendedor</label>
            <select style={IS()} value={form.vendedor} onChange={e => set("vendedor", e.target.value)}>
              {vendedoresList.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={FS}>
            <label style={LS}>Agencia B2B</label>
            <select style={IS()} value={form.aliado_id} onChange={e => set("aliado_id", e.target.value)}>
              <option value="">Sin agencia</option>
              {aliadoList.map(a => <option key={a.id} value={a.id}>{a.nombre}{a.cupo_credito ? ` (CXC $${(a.cupo_credito/1000).toFixed(0)}k)` : ""}</option>)}
            </select>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${B.navyLight}` }} />

        {/* ── Pago ── */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>💳 Abono inicial</div>
          <div style={G2}>
            <div style={FS}>
              <label style={LS}>Forma de pago</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {formasPagoDisp.map(fp => (
                  <button key={fp} onClick={() => set("forma_pago", fp)} style={{
                    padding: "6px 12px", borderRadius: 20, border: `1px solid ${form.forma_pago === fp ? B.sky : B.navyLight}`,
                    background: form.forma_pago === fp ? B.sky + "22" : "transparent",
                    color: form.forma_pago === fp ? B.sky : "rgba(255,255,255,0.5)",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>{fp}</button>
                ))}
              </div>
            </div>
            {form.forma_pago !== "Enviar Link de Pago" && (
              <div style={FS}>
                <label style={LS}>Monto abono (COP)</label>
                <input type="number" min={0} style={IS(errors.abono)} value={form.abono} onChange={e => set("abono", Number(e.target.value))} />
              </div>
            )}
            {form.forma_pago !== "Enviar Link de Pago" && form.abono > 0 && (
              <div style={FS}>
                <label style={LS}>Fecha de pago</label>
                <input type="date" style={IS()} value={form.fecha_pago} onChange={e => set("fecha_pago", e.target.value)} />
              </div>
            )}
          </div>
          {form.forma_pago === "Enviar Link de Pago" && (
            <div style={{ marginTop: 10, fontSize: 13, color: B.warning, background: B.warning + "11", border: `1px solid ${B.warning}44`, borderRadius: 8, padding: "10px 14px" }}>
              ⚠️ Se generará un link de pago para enviar al cliente. La reserva quedará en estado pendiente hasta que pague.
            </div>
          )}
          {form.forma_pago === "CXC" && aliado && (
            <div style={{ marginTop: 10, fontSize: 13, color: B.sky, background: B.sky + "11", border: `1px solid ${B.sky}44`, borderRadius: 8, padding: "10px 14px" }}>
              💳 Cargo a cuenta corriente de <strong>{aliado.nombre}</strong> · Cupo disponible: <strong>{COP(aliado.cupo_credito)}</strong>
            </div>
          )}
        </div>

        {/* Notas */}
        <div style={FS}>
          <label style={LS}>Notas</label>
          <textarea rows={2} style={{ ...IS(), resize: "vertical" }} value={form.notas} onChange={e => set("notas", e.target.value)} placeholder="Observaciones, peticiones especiales…" />
        </div>

        {/* Preview totales */}
        {form.tipo && (
          <div style={{ background: "#0D1B3E", borderRadius: 10, padding: "12px 16px" }}>
            {/* Desglose por adultos/niños cuando hay niños con tarifa diferente */}
            {Number(form.pax_n) > 0 && (form.precio_nino || 0) > 0 && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                {Number(form.pax_a) > 0 && <span>{form.pax_a} adulto{form.pax_a !== 1 ? "s" : ""} × {COP(form.precio)}</span>}
                <span>{form.pax_n} niño{form.pax_n !== 1 ? "s" : ""} × {COP(form.precio_nino)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              {(() => {
                const total = Number(form.pax_a) * Number(form.precio) + Number(form.pax_n) * Number(form.precio_nino || form.precio);
                const abono = form.forma_pago === "Enviar Link de Pago" ? 0 : Number(form.abono);
                const saldo = total - abono;
                return [
                  { label: "Total",  value: COP(total), color: B.white   },
                  { label: "Abono",  value: COP(abono), color: B.success },
                  { label: "Saldo",  value: COP(Math.max(0, saldo)), color: saldo > 0 ? B.warning : B.success },
                ].map(p => (
                  <div key={p.label}>
                    <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em" }}>{p.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: p.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{p.value}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.sand, padding: "9px 20px", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
          <button onClick={handleSave} style={{ background: B.sky, border: "none", borderRadius: 8, color: B.navy, padding: "9px 24px", fontSize: 14, cursor: "pointer", fontWeight: 700 }}>
            {form.forma_pago === "Enviar Link de Pago" ? "🔗 Crear y Generar Link" : "💾 Guardar reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

function tomorrowStr() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

function mapRow(r) {
  return {
    id:          r.id,
    fecha:       (r.fecha || "").slice(0, 10),  // normalize to YYYY-MM-DD
    salida:      r.salida_id,
    tipo:        r.tipo,
    canal:       r.canal,
    nombre:      r.nombre,
    contacto:    r.contacto,
    telefono:    r.telefono,
    email:       r.email,
    pax:         r.pax,
    pax_a:       r.pax_a,
    pax_n:       r.pax_n,
    agencia:     r.agencia,
    aliado_id:   r.aliado_id,
    vendedor:    r.vendedor,
    precio_u:    r.precio_u,
    total:       r.total,
    abono:       r.abono,
    saldo:       r.saldo,
    estado:      r.estado,
    ep:          r.ep,
    ci:          r.ci,
    co:          r.co,
    extension:   r.extension,
    ext_regreso: r.ext_regreso,
    notas:       r.notas,
    forma_pago:  r.forma_pago,
    fecha_pago:  r.fecha_pago ? (r.fecha_pago + "").slice(0, 10) : null,
    lead_id:     r.lead_id,
    pasajeros:   r.pasajeros,
    created_at:  r.created_at,
    updated_at:  r.updated_at,
  };
}

// ═══════════════════════════════════════════════
// TAB: CALENDARIO MENSUAL (moved from Pasadias)
// ═══════════════════════════════════════════════
function TabCalendario({ salidas, cierres, embarcaciones }) {
  const hoy = todayStr();
  const [mesOffset, setMesOffset] = useState(0);
  const [reservasPorDia, setReservasPorDia] = useState({});
  const [gruposPorDia,   setGruposPorDia]   = useState({});
  const [sinTransportePorDia, setSinTransportePorDia] = useState({});
  const [overrides, setOverrides] = useState({});
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedSalida, setSelectedSalida] = useState(null);
  const [resDetalle, setResDetalle] = useState([]);
  const [loadingRes, setLoadingRes] = useState(false);
  const [selectedReserva, setSelectedReserva] = useState(null);
  const [embForm, setEmbForm] = useState({ nombre_embarcacion: "", hora_llegada: "" });
  const [savingEmb, setSavingEmb] = useState(false);
  const [grupoEmbDropdown, setGrupoEmbDropdown] = useState(null); // "grupoId-sgKey"

  const now = new Date();
  const mesDate = new Date(now.getFullYear(), now.getMonth() + mesOffset, 1);
  const year = mesDate.getFullYear();
  const month = mesDate.getMonth();
  const mesNombre = mesDate.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const primerDia = new Date(year, month, 1).getDay();
  const diasEnMes = new Date(year, month + 1, 0).getDate();

  const fetchMonthData = useCallback(() => {
    if (!supabase) return;
    const desde = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const hasta = `${year}-${String(month + 1).padStart(2, "0")}-${String(diasEnMes).padStart(2, "0")}`;
    supabase.from("reservas").select("fecha, salida_id, pax").gte("fecha", desde).lte("fecha", hasta).neq("estado", "cancelado")
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => {
          if (!map[r.fecha]) map[r.fecha] = {};
          if (!map[r.fecha][r.salida_id]) map[r.fecha][r.salida_id] = 0;
          map[r.fecha][r.salida_id] += r.pax || 0;
        });
        setReservasPorDia(map);
      });
    // Fetch grupos for the month — pax counts toward salida capacity
    supabase.from("eventos")
      .select("id, nombre, tipo, pax, fecha, salidas_grupo, modalidad_pago, pasadias_org, stage")
      .eq("categoria", "grupo")
      .gte("fecha", desde).lte("fecha", hasta)
      .then(({ data }) => {
        const byDay = {};
        (data || []).forEach(g => {
          const f = g.fecha;
          if (!f) return;
          if (!byDay[f]) byDay[f] = [];
          byDay[f].push(g);
        });
        setGruposPorDia(byDay);
      });
    // Fetch reservas sin transporte (salida_id null) for the month
    supabase.from("reservas")
      .select("id, nombre, tipo, pax, pax_a, pax_n, total, abono, estado, forma_pago, canal, email, telefono, created_at, fecha, notas")
      .is("salida_id", null)
      .gte("fecha", desde).lte("fecha", hasta)
      .neq("estado", "cancelado")
      .then(({ data }) => {
        const byDay = {};
        (data || []).forEach(r => {
          if (!byDay[r.fecha]) byDay[r.fecha] = [];
          byDay[r.fecha].push(r);
        });
        setSinTransportePorDia(byDay);
      });
    supabase.from("salidas_override").select("*").gte("fecha", desde).lte("fecha", hasta)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(o => {
          if (!map[o.fecha]) map[o.fecha] = {};
          map[o.fecha][o.salida_id] = o;
        });
        setOverrides(map);
      });
  }, [year, month, diasEnMes]);

  useEffect(() => { fetchMonthData(); }, [fetchMonthData]);
  useEffect(() => { setSelectedSalida(null); setResDetalle([]); setSelectedReserva(null); }, [selectedDay]);

  const toggleOverride = async (fecha, salidaId, currentlyVisible) => {
    if (!supabase) return;
    const existing = (overrides[fecha] || {})[salidaId];
    if (existing) {
      await supabase.from("salidas_override").delete().eq("id", existing.id);
    } else {
      await supabase.from("salidas_override").insert({
        id: `OVR-${Date.now()}`, fecha, salida_id: salidaId,
        accion: currentlyVisible ? "cerrar" : "abrir",
        extra_embarcaciones: [],
      });
    }
    fetchMonthData();
  };

  const addExtraEmbarcacion = async (fecha, salidaId, embId) => {
    if (!supabase) return;
    const emb = embarcaciones.find(e => e.id === embId);
    if (!emb) return;
    const existing = (overrides[fecha] || {})[salidaId];
    const extras = existing?.extra_embarcaciones || [];
    if (extras.some(e => e.id === embId)) return;
    const newExtras = [...extras, { id: emb.id, nombre: emb.nombre, capacidad: emb.capacidad }];
    if (existing) {
      await supabase.from("salidas_override").update({ extra_embarcaciones: newExtras }).eq("id", existing.id);
    } else {
      await supabase.from("salidas_override").insert({
        id: `OVR-${Date.now()}`, fecha, salida_id: salidaId,
        accion: isDefaultVisible(fecha, salidaId) ? "abrir" : "abrir",
        extra_embarcaciones: newExtras,
      });
    }
    fetchMonthData();
  };

  const removeExtraEmbarcacion = async (fecha, salidaId, embId) => {
    if (!supabase) return;
    const existing = (overrides[fecha] || {})[salidaId];
    if (!existing) return;
    const newExtras = (existing.extra_embarcaciones || []).filter(e => e.id !== embId);
    await supabase.from("salidas_override").update({ extra_embarcaciones: newExtras }).eq("id", existing.id);
    fetchMonthData();
  };

  const addCapacidadVirtual = async (fecha, salidaId, capacidad, label = "Sin Lancha") => {
    if (!supabase) return;
    const existing = (overrides[fecha] || {})[salidaId];
    const extras = existing?.extra_embarcaciones || [];
    const newEntry = { id: `virtual-${Date.now()}`, nombre: `${label} (+${capacidad})`, capacidad, virtual: true };
    const newExtras = [...extras, newEntry];
    if (existing) {
      await supabase.from("salidas_override").update({ extra_embarcaciones: newExtras }).eq("id", existing.id);
    } else {
      await supabase.from("salidas_override").insert({
        id: `OVR-${Date.now()}`, fecha, salida_id: salidaId,
        accion: isDefaultVisible(fecha, salidaId) ? "abrir" : "abrir",
        extra_embarcaciones: newExtras,
      });
    }
    fetchMonthData();
  };

  const addEmbarcacionGrupo = async (grupo, sgKey, embId) => {
    if (!supabase) return;
    const emb = embarcaciones.find(e => e.id === embId);
    if (!emb) return;
    const newSalidas = (grupo.salidas_grupo || []).map(sg => {
      const key = sg.custom ? sg.hora : sg.id;
      if (key !== sgKey) return sg;
      const existing = sg.embarcaciones || [];
      if (existing.some(e => e.id === embId)) return sg;
      return { ...sg, embarcaciones: [...existing, { id: emb.id, nombre: emb.nombre, capacidad: emb.capacidad }] };
    });
    await supabase.from("eventos").update({ salidas_grupo: newSalidas }).eq("id", grupo.id);
    setGruposPorDia(prev => {
      const dayGroups = (prev[selectedDay] || []).map(g => g.id === grupo.id ? { ...g, salidas_grupo: newSalidas } : g);
      return { ...prev, [selectedDay]: dayGroups };
    });
    setGrupoEmbDropdown(null);
  };

  const removeEmbarcacionGrupo = async (grupo, sgKey, embId) => {
    if (!supabase) return;
    const newSalidas = (grupo.salidas_grupo || []).map(sg => {
      const key = sg.custom ? sg.hora : sg.id;
      if (key !== sgKey) return sg;
      return { ...sg, embarcaciones: (sg.embarcaciones || []).filter(e => e.id !== embId) };
    });
    await supabase.from("eventos").update({ salidas_grupo: newSalidas }).eq("id", grupo.id);
    setGruposPorDia(prev => {
      const dayGroups = (prev[selectedDay] || []).map(g => g.id === grupo.id ? { ...g, salidas_grupo: newSalidas } : g);
      return { ...prev, [selectedDay]: dayGroups };
    });
  };

  const loadReservasSalida = async (salidaId) => {
    if (!supabase || !selectedDay) return;
    if (selectedSalida === salidaId) { setSelectedSalida(null); setResDetalle([]); setSelectedReserva(null); return; }
    setSelectedSalida(salidaId);
    setSelectedReserva(null);
    setLoadingRes(true);
    const { data } = await supabase.from("reservas").select("*")
      .eq("fecha", selectedDay).eq("salida_id", salidaId)
      .neq("estado", "cancelado").order("created_at");
    setResDetalle(data || []);
    setLoadingRes(false);
  };

  const ESTADO_CAL = {
    confirmado:            { bg: B.success + "22", color: B.success, label: "Confirmado" },
    pendiente:             { bg: B.warning + "22", color: B.warning, label: "Pendiente"  },
    pendiente_pago:        { bg: B.warning + "22", color: B.warning, label: "Pend. Pago" },
    pendiente_comprobante: { bg: B.sky    + "22", color: B.sky,     label: "Pend. Comp" },
    cancelado:             { bg: B.danger  + "22", color: B.danger,  label: "Cancelado"  },
  };

  const dias = [];
  for (let i = 0; i < primerDia; i++) dias.push(null);
  for (let d = 1; d <= diasEnMes; d++) dias.push(d);

  const getCierreForDate = (fecha) => cierres.find(c => c.activo && c.fecha === fecha);
  const salidasActivas = salidas.filter(s => s.activo);

  // Cascade auto-apertura: each salida opens when the previous reaches its auto_umbral %
  const autoAperturaCheck = (s, resDia) => {
    const sorted = [...salidasActivas].sort((a, b) => a.hora.localeCompare(b.hora));
    const idx = sorted.findIndex(x => x.id === s.id);
    if (idx <= 0) return true; // primera salida: siempre visible
    const prev = sorted[idx - 1];
    return (resDia[prev.id] || 0) / (prev.capacidad_total || 1) >= (prev.auto_umbral || 75) / 100;
  };

  const getSalidasVisibles = (fecha) => {
    const cierre = getCierreForDate(fecha);
    const resDia = reservasPorDia[fecha] || {};
    const dayOverrides = overrides[fecha] || {};
    return salidasActivas.filter(s => {
      const ovr = dayOverrides[s.id];
      if (ovr) return ovr.accion === "abrir";
      if (cierre) {
        if (cierre.tipo === "total") return false;
        if ((cierre.salidas || []).includes(s.id)) return false;
      }
      if (!s.auto_apertura) return true;
      return autoAperturaCheck(s, resDia);
    });
  };

  const isDefaultVisible = (fecha, salidaId) => {
    const cierre = getCierreForDate(fecha);
    const resDia = reservasPorDia[fecha] || {};
    const s = salidasActivas.find(x => x.id === salidaId);
    if (!s) return false;
    if (cierre) {
      if (cierre.tipo === "total") return false;
      if ((cierre.salidas || []).includes(s.id)) return false;
    }
    if (!s.auto_apertura) return true;
    return autoAperturaCheck(s, resDia);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 20 }}>
        <button onClick={() => setMesOffset(m => m - 1)} style={{ background: B.navyLight, border: "none", borderRadius: 8, padding: "8px 16px", color: B.white, cursor: "pointer", fontSize: 16 }}>{"\u2190"}</button>
        <h3 style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", textTransform: "capitalize", minWidth: 200, textAlign: "center" }}>{mesNombre}</h3>
        <button onClick={() => setMesOffset(m => m + 1)} style={{ background: B.navyLight, border: "none", borderRadius: 8, padding: "8px 16px", color: B.white, cursor: "pointer", fontSize: 16 }}>{"\u2192"}</button>
      </div>
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 16, fontSize: 11 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: B.success, marginRight: 4 }} />Disponible</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: B.warning, marginRight: 4 }} />+70% ocupado</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: B.danger, marginRight: 4 }} />Lleno / Cerrado</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, color: B.sand, padding: "6px 0", fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {dias.map((dia, i) => {
          if (!dia) return <div key={`empty-${i}`} />;
          const fecha = `${year}-${String(month + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
          const isHoy = fecha === hoy;
          const cierre = getCierreForDate(fecha);
          const resDia = reservasPorDia[fecha] || {};
          const isPast = fecha < hoy;
          return (
            <div key={dia} onClick={() => setSelectedDay(selectedDay === fecha ? null : fecha)}
              style={{
                background: cierre ? B.danger + "22" : isHoy ? B.sky + "15" : B.navyMid,
                borderRadius: 8, padding: "8px 6px", minHeight: 90, cursor: "pointer",
                border: isHoy ? `2px solid ${B.sky}` : selectedDay === fecha ? `2px solid ${B.sand}` : `1px solid ${B.navyLight}`,
                opacity: isPast ? 0.5 : 1, transition: "border 0.15s",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: isHoy ? 700 : 400, color: isHoy ? B.sky : B.white }}>{dia}</span>
                {cierre && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 8, background: B.danger, color: B.white }}>CERRADO</span>}
              </div>
              {(() => {
                const grupos = gruposPorDia[fecha] || [];
                // Pax from grupos per salida_id
                const grupoPax = {};
                // Custom grupo salidas (hora not matching any salida)
                const salidaHoras = new Set(salidas.map(s => s.hora));
                const customSalidas = []; // { hora, pax, nombres }
                grupos.forEach(g => {
                  (g.salidas_grupo || []).forEach(sg => {
                    const pax = Number(sg.personas) || 0;
                    if (!sg.custom && sg.id && !sg.id.startsWith("custom-") && salidas.some(s => s.id === sg.id)) {
                      grupoPax[sg.id] = (grupoPax[sg.id] || 0) + pax;
                    } else {
                      // Custom hora — show as extra departure
                      const ex = customSalidas.find(c => c.hora === sg.hora);
                      if (ex) { ex.pax += pax; ex.nombres.push(g.nombre); }
                      else customSalidas.push({ hora: sg.hora, pax, nombres: [g.nombre] });
                    }
                  });
                });
                return (
                  <>
                    {getSalidasVisibles(fecha).map(s => {
                      const paxRes   = resDia[s.id] || 0;
                      const paxGrupo = grupoPax[s.id] || 0;
                      const paxVendidos = paxRes + paxGrupo;
                      const ovr = (overrides[fecha] || {})[s.id];
                      const extraCap = (ovr?.extra_embarcaciones || []).reduce((sum, e) => sum + (e.capacidad || 0), 0);
                      const cap = (s.capacidad_total || 1) + extraCap;
                      const pct = cap > 0 ? paxVendidos / cap : 0;
                      const barColor = pct >= 1 ? B.danger : pct >= 0.7 ? B.warning : B.success;
                      return (
                        <div key={s.id} style={{ marginBottom: 3 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                            <span>{s.hora}</span>
                            <span style={{ fontWeight: 600, color: paxVendidos > 0 ? B.white : "rgba(255,255,255,0.25)" }}>
                              {paxVendidos}/{cap}{paxGrupo > 0 && <span style={{ color: B.sand }}>👥</span>}
                            </span>
                          </div>
                          <div style={{ height: 3, background: B.navy, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(pct * 100, 100)}%`, height: "100%", background: barColor, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                    {/* Extra custom grupo departures */}
                    {customSalidas.map(cs => (
                      <div key={cs.hora} style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: B.sand }}>
                          <span>⛵ {cs.hora}</span>
                          <span style={{ fontWeight: 600 }}>👥 {cs.pax}</span>
                        </div>
                        <div style={{ height: 3, background: B.sand + "33", borderRadius: 2 }} />
                      </div>
                    ))}
                  </>
                );
              })()}
              {(sinTransportePorDia[fecha] || []).length > 0 && (
                <div style={{ fontSize: 9, color: B.sky, marginTop: 2, fontWeight: 600 }}>
                  🚶 {(sinTransportePorDia[fecha] || []).reduce((s, r) => s + (r.pax || 0), 0)} pax sin transp
                </div>
              )}
              {cierre && <div style={{ fontSize: 9, color: B.danger, marginTop: 2 }}>{cierre.motivo}</div>}
            </div>
          );
        })}
      </div>
      {selectedDay && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 24, marginTop: 16 }}>
          <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span>{new Date(selectedDay + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</span>
            {getCierreForDate(selectedDay) && <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 12, background: B.danger, color: B.white }}>CERRADO — {getCierreForDate(selectedDay).motivo}</span>}
            {(() => {
              const paxRes = Object.values(reservasPorDia[selectedDay] || {}).reduce((s, v) => s + v, 0);
              const paxSinT = (sinTransportePorDia[selectedDay] || []).reduce((s, r) => s + (r.pax || 0), 0);
              const paxGrupos = (gruposPorDia[selectedDay] || []).reduce((sum, g) => {
                const p = (g.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF").reduce((s, p) => s + (Number(p.personas) || 0), 0) || g.pax || 0;
                return sum + p;
              }, 0);
              const total = paxRes + paxSinT + paxGrupos;
              return total > 0 ? (
                <span style={{ fontSize: 13, fontWeight: 600, padding: "3px 12px", borderRadius: 12, background: B.navyLight, color: B.sand }}>
                  {total} pax totales
                </span>
              ) : null;
            })()}
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${salidasActivas.length}, 1fr)`, gap: 12 }}>
            {salidasActivas.map(s => {
              const visibles = getSalidasVisibles(selectedDay);
              const isOpen = visibles.some(v => v.id === s.id);
              const hasOverride = (overrides[selectedDay] || {})[s.id];
              const paxRes = (reservasPorDia[selectedDay] || {})[s.id] || 0;
              const paxGrupoD = (gruposPorDia[selectedDay] || []).reduce((sum, g) => {
                const sg = (g.salidas_grupo || []).find(x => x.id === s.id && !x.custom);
                return sum + (sg ? Number(sg.personas) || 0 : 0);
              }, 0);
              const pax = paxRes + paxGrupoD;
              const cap = s.capacidad_total || 0;
              const botes = (s.embarcaciones || []).map(eid => embarcaciones.find(e => e.id === eid)).filter(Boolean);
              const override = (overrides[selectedDay] || {})[s.id];
              const extraBotes = override?.extra_embarcaciones || [];
              const capTotal = cap + extraBotes.reduce((sum, e) => sum + (e.capacidad || 0), 0);
              const pctTotal = capTotal > 0 ? pax / capTotal : 0;
              const barColorTotal = pctTotal >= 1 ? B.danger : pctTotal >= 0.7 ? B.warning : B.success;
              const asignadas = botes.map(b => b.id);
              const disponibles = embarcaciones.filter(e => e.estado === "activo" && !asignadas.includes(e.id) && !extraBotes.some(x => x.id === e.id));
              const isSelSal = selectedSalida === s.id;
              return (
                <div key={s.id}
                  onClick={() => isOpen && loadReservasSalida(s.id)}
                  style={{ background: B.navy, borderRadius: 10, padding: 16, textAlign: "center", opacity: isOpen ? 1 : 0.4, cursor: isOpen ? "pointer" : "default", border: `2px solid ${isSelSal ? B.sand : isOpen ? B.navyLight : B.danger + "44"}`, transition: "border 0.15s" }}>
                  <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.nombre}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: isOpen ? B.sky : B.danger }}>{s.hora}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Regreso: {s.hora_regreso}</div>
                  {isOpen ? (
                    <>
                      <div style={{ fontSize: 36, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: barColorTotal }}>{pax}<span style={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }}>/{capTotal}</span></div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>pax vendidos</div>
                      <div style={{ height: 6, background: B.navyLight, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                        <div style={{ width: `${Math.min(pctTotal * 100, 100)}%`, height: "100%", background: barColorTotal, borderRadius: 3 }} />
                      </div>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap", marginBottom: 4 }}>
                        {botes.map(b => (
                          <span key={b.id} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.navyLight, color: "rgba(255,255,255,0.5)" }}>⛵ {b.nombre} ({b.capacidad})</span>
                        ))}
                      </div>
                      {extraBotes.length > 0 && (
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap", marginBottom: 4 }}>
                          {extraBotes.map(b => (
                            <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "2px 8px 2px 10px", borderRadius: 10, background: B.success + "22", color: B.success, border: `1px solid ${B.success}44` }}>
                              ⛵ {b.nombre} ({b.capacidad})
                              <button onClick={(e) => { e.stopPropagation(); removeExtraEmbarcacion(selectedDay, s.id, b.id); }}
                                style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0 }}>✕</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 12, fontWeight: 600, color: capTotal - pax > 0 ? B.success : B.danger, marginBottom: 8 }}>
                        {capTotal - pax > 0 ? `${capTotal - pax} disponibles` : "LLENO"}
                      </div>
                      {disponibles.length > 0 && (
                        <select defaultValue="" onClick={e => e.stopPropagation()} onChange={e => { if (e.target.value) { addExtraEmbarcacion(selectedDay, s.id, e.target.value); e.target.value = ""; } }}
                          style={{ width: "100%", padding: "6px 10px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 11, cursor: "pointer", marginBottom: 6, outline: "none" }}>
                          <option value="">⛵ Agregar embarcación...</option>
                          {disponibles.map(e => (
                            <option key={e.id} value={e.id}>{e.nombre} — {e.tipo} ({e.capacidad} pax)</option>
                          ))}
                        </select>
                      )}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Sin Lancha</div>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                          {[15, 20, 40, 50].map(n => (
                            <button key={n} onClick={(e) => { e.stopPropagation(); addCapacidadVirtual(selectedDay, s.id, n); }}
                              style={{ padding: "4px 10px", borderRadius: 6, background: B.sky + "22", color: B.sky, border: `1px solid ${B.sky}44`, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              +{n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: "16px 0", fontSize: 13, color: B.danger }}>CERRADA</div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); toggleOverride(selectedDay, s.id, isOpen); }} style={{
                    width: "100%", padding: "8px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    background: isOpen ? B.danger + "22" : B.success + "22", color: isOpen ? B.danger : B.success,
                  }}>{isOpen ? "Cerrar esta salida" : "Abrir esta salida"}</button>
                  {hasOverride && <div style={{ fontSize: 10, color: B.warning, marginTop: 4 }}>Override activo</div>}
                </div>
              );
            })}
          </div>

          {/* ── Lista de reservas de la salida seleccionada ── */}
          {selectedSalida && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h5 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: B.white }}>
                  {salidasActivas.find(s => s.id === selectedSalida)?.nombre} · {salidasActivas.find(s => s.id === selectedSalida)?.hora}
                  <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>({resDetalle.length} reservas)</span>
                </h5>
                <button onClick={() => { setSelectedSalida(null); setResDetalle([]); setSelectedReserva(null); }}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
              </div>
              {loadingRes ? (
                <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.4)" }}>Cargando...</div>
              ) : resDetalle.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Sin reservas para esta salida</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {resDetalle.map(r => {
                    const est = ESTADO_CAL[r.estado] || { bg: B.navyLight, color: B.white, label: r.estado };
                    const isSelR = selectedReserva?.id === r.id;
                    return (
                      <div key={r.id} onClick={() => setSelectedReserva(isSelR ? null : r)}
                        style={{ background: isSelR ? B.navyLight : B.navy, borderRadius: 8, padding: "12px 16px", cursor: "pointer", border: `1px solid ${isSelR ? B.sand : B.navyLight}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, transition: "border 0.15s" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: B.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nombre}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{r.tipo} · {r.pax} pax · {r.forma_pago || "—"} · ⏱ {fmtHora(r.created_at)}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: B.white }}>{COP(r.total || 0)}</span>
                          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: est.bg, color: est.color, fontWeight: 600 }}>{est.label}</span>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{isSelR ? "▲" : "▼"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Grupos del día ── */}
          {(gruposPorDia[selectedDay] || []).length > 0 && (
            <div style={{ background: B.navy, borderRadius: 12, padding: 16, marginTop: 12 }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 10 }}>
                👥 Grupos del día — {(gruposPorDia[selectedDay] || []).reduce((sum, g) => {
                  const p = (g.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF").reduce((s, p) => s + (Number(p.personas) || 0), 0) || g.pax || 0;
                  return sum + p;
                }, 0)} pax
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(gruposPorDia[selectedDay] || []).map(g => {
                  const salidaIds = new Set(salidas.map(s => s.id));
                  const allSGs = (g.salidas_grupo || []);
                  const totalPaxGrupo = (g.pasadias_org || [])
                    .filter(p => p.tipo !== "Impuesto Muelle")
                    .reduce((s, p) => s + (Number(p.personas) || 0), 0) || g.pax || 0;
                  return (
                    <div key={g.id} style={{ background: "rgba(200,185,154,0.08)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(200,185,154,0.2)" }}>
                      {/* Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{g.nombre}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {g.modalidad_pago === "organizador" && (
                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: B.sand + "22", color: B.sand }}>💳 Org</span>
                          )}
                          {g.tipo && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>🌴 {g.tipo}</span>}
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: B.sand + "33", color: B.sand, fontWeight: 700 }}>
                            👥 {totalPaxGrupo} pax
                          </span>
                        </div>
                      </div>
                      {/* Salidas con embarcaciones */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {allSGs.map(sg => {
                          const isCustom = sg.custom || !salidaIds.has(sg.id || "");
                          const sgKey = isCustom ? sg.hora : sg.id;
                          const sal = !isCustom ? salidas.find(s => s.id === sg.id) : null;
                          const hora = sal?.hora || sg.hora || "—";
                          const paxSg = Number(sg.personas) || 0;
                          const embsSg = sg.embarcaciones || [];
                          const capSg = embsSg.reduce((s, e) => s + (e.capacidad || 0), 0);
                          const pctSg = capSg > 0 ? Math.min(1, paxSg / capSg) : 0;
                          const barCol = pctSg >= 1 ? B.danger : pctSg >= 0.7 ? B.warning : B.success;
                          const dropKey = `${g.id}-${sgKey}`;
                          const showDrop = grupoEmbDropdown === dropKey;
                          // Available boats: not already assigned to this sg
                          const assignedIds = new Set(embsSg.map(e => e.id));
                          const disponibles = embarcaciones.filter(e => e.estado === "activo" && !assignedIds.has(e.id));
                          return (
                            <div key={sgKey} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: isCustom ? B.warning : B.sky }}>
                                  ⛵ {hora}{isCustom ? " (especial)" : ""}
                                </span>
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                  {paxSg} pax · cap {capSg || "—"}
                                </span>
                              </div>
                              {/* Capacity bar */}
                              {capSg > 0 && (
                                <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.1)", marginBottom: 8, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${pctSg * 100}%`, background: barCol, borderRadius: 4, transition: "width 0.3s" }} />
                                </div>
                              )}
                              {/* Boat chips */}
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                {embsSg.map(emb => (
                                  <div key={emb.id} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(200,185,154,0.15)", border: "1px solid rgba(200,185,154,0.3)", borderRadius: 20, padding: "3px 10px 3px 8px", fontSize: 11 }}>
                                    <span>🚤</span>
                                    <span style={{ color: B.sand, fontWeight: 600 }}>{emb.nombre}</span>
                                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>+{emb.capacidad}</span>
                                    <button onClick={() => removeEmbarcacionGrupo(g, sgKey, emb.id)}
                                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1, marginLeft: 2 }}>✕</button>
                                  </div>
                                ))}
                                {/* Add boat button */}
                                {disponibles.length > 0 && (
                                  <div style={{ position: "relative" }}>
                                    <button onClick={() => setGrupoEmbDropdown(showDrop ? null : dropKey)}
                                      style={{ background: "rgba(255,255,255,0.06)", border: "1px dashed rgba(255,255,255,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
                                      + Embarcación
                                    </button>
                                    {showDrop && (
                                      <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: B.navyMid, border: `1px solid ${B.sand}44`, borderRadius: 8, zIndex: 100, minWidth: 160, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
                                        {disponibles.map(emb => (
                                          <div key={emb.id} onClick={() => addEmbarcacionGrupo(g, sgKey, emb.id)}
                                            style={{ padding: "8px 12px", fontSize: 12, cursor: "pointer", color: B.white, borderBottom: `1px solid rgba(255,255,255,0.06)` }}
                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(200,185,154,0.12)"}
                                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                            🚤 {emb.nombre} <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>(cap {emb.capacidad})</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Sin Transporte del día ── */}
          {(sinTransportePorDia[selectedDay] || []).length > 0 && (
            <div style={{ background: B.navy, borderRadius: 12, padding: 16, marginTop: 12 }}>
              <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 10 }}>
                🚶 Sin Transporte — {(sinTransportePorDia[selectedDay] || []).reduce((s, r) => s + (r.pax || 0), 0)} pax
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(sinTransportePorDia[selectedDay] || []).map(r => {
                  const est = ESTADO_CAL[r.estado] || { bg: B.navyLight, color: B.white, label: r.estado };
                  const isSelR = selectedReserva?.id === r.id;
                  return (
                    <div key={r.id} onClick={() => { if (isSelR) { setSelectedReserva(null); } else { setSelectedReserva(r); setEmbForm({ nombre_embarcacion: r.nombre_embarcacion || "", hora_llegada: r.hora_llegada || "" }); } }}
                      style={{ background: isSelR ? B.navyLight : "rgba(100,180,255,0.06)", borderRadius: 8, padding: "12px 14px", cursor: "pointer", border: `1px solid ${isSelR ? B.sky : "rgba(100,180,255,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, transition: "border 0.15s" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: B.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nombre}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{r.tipo} · {r.pax} pax · {r.forma_pago || "—"} · ⏱ {fmtHora(r.created_at)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: B.white }}>{COP(r.total || 0)}</span>
                        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: est.bg, color: est.color, fontWeight: 600 }}>{est.label}</span>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{isSelR ? "▲" : "▼"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Detalle de la reserva seleccionada ── */}
          {selectedReserva && (
            <div style={{ background: B.navy, borderRadius: 12, padding: 20, marginTop: 12, border: `1px solid ${B.sand}55` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h5 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: B.white }}>{selectedReserva.nombre}</h5>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{selectedReserva.id}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 10, background: (ESTADO_CAL[selectedReserva.estado] || {}).bg || B.navyLight, color: (ESTADO_CAL[selectedReserva.estado] || {}).color || B.white, fontWeight: 700 }}>
                    {(ESTADO_CAL[selectedReserva.estado] || {}).label || selectedReserva.estado}
                  </span>
                  <button onClick={() => setSelectedReserva(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>✕</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  ["Tipo pasadía", selectedReserva.tipo || "—"],
                  ["Fecha salida",  fmtFecha(selectedReserva.fecha)],
                  ["Hora reserva",  fmtHora(selectedReserva.created_at)],
                  ["Pax adultos",   selectedReserva.pax_a ?? selectedReserva.pax ?? "—"],
                  ["Pax niños",     selectedReserva.pax_n ?? "—"],
                  ["Total",         COP(selectedReserva.total || 0)],
                  ["Abono",         COP(selectedReserva.abono || 0)],
                  ["Saldo",         COP((selectedReserva.total || 0) - (selectedReserva.abono || 0))],
                  ["Forma de pago", selectedReserva.forma_pago || "—"],
                  ["Canal",         selectedReserva.canal || "—"],
                  ["Email",         selectedReserva.email || "—"],
                  ["Teléfono",      selectedReserva.telefono || "—"],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: B.navyMid, borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, color: B.white, fontWeight: 600, wordBreak: "break-all" }}>{String(value)}</div>
                  </div>
                ))}
              </div>
              {selectedReserva.notas && (
                <div style={{ background: B.navyMid, borderRadius: 8, padding: "10px 14px", marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Notas</div>
                  <div style={{ fontSize: 13, color: B.white }}>{selectedReserva.notas}</div>
                </div>
              )}

              {/* ── Embarcación (solo sin transporte) ── */}
              {!selectedReserva.salida_id && (
                <div style={{ background: B.navyMid, borderRadius: 10, padding: "14px 16px", marginTop: 10, border: `1px solid ${B.sky}33` }}>
                  <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: 12 }}>
                    ⛵ Embarcación del cliente
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Nombre embarcación</div>
                      <input
                        value={embForm.nombre_embarcacion}
                        onChange={e => setEmbForm(f => ({ ...f, nombre_embarcacion: e.target.value }))}
                        placeholder="Ej: El Delfín"
                        style={{ width: "100%", background: "#0D1B3E", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Hora est. llegada</div>
                      <input
                        type="time"
                        value={embForm.hora_llegada}
                        onChange={e => setEmbForm(f => ({ ...f, hora_llegada: e.target.value }))}
                        style={{ width: "100%", background: "#0D1B3E", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                      />
                    </div>
                  </div>
                  <button
                    disabled={savingEmb}
                    onClick={async () => {
                      if (!supabase) return;
                      setSavingEmb(true);
                      await supabase.from("reservas").update({
                        nombre_embarcacion: embForm.nombre_embarcacion || null,
                        hora_llegada: embForm.hora_llegada || null,
                      }).eq("id", selectedReserva.id);
                      // Update local state
                      setSinTransportePorDia(prev => {
                        const day = selectedReserva.fecha;
                        const updated = (prev[day] || []).map(r =>
                          r.id === selectedReserva.id
                            ? { ...r, nombre_embarcacion: embForm.nombre_embarcacion || null, hora_llegada: embForm.hora_llegada || null }
                            : r
                        );
                        return { ...prev, [day]: updated };
                      });
                      setSelectedReserva(r => r ? { ...r, nombre_embarcacion: embForm.nombre_embarcacion || null, hora_llegada: embForm.hora_llegada || null } : r);
                      setSavingEmb(false);
                    }}
                    style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: savingEmb ? B.navyLight : B.sky, color: B.navy, fontWeight: 700, cursor: savingEmb ? "default" : "pointer", fontSize: 13 }}>
                    {savingEmb ? "Guardando..." : "💾 Guardar"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Reservas() {
  const isMobile = useMobile();
  const [reservasHoy,     setReservasHoy]     = useState([]);
  const [reservasManana,  setReservasManana]  = useState([]);
  const [reservasFecha,   setReservasFecha]   = useState([]);
  const [reservasFuturas, setReservasFuturas] = useState([]);
  const [gruposHoy,       setGruposHoy]       = useState([]);
  const [gruposManana,    setGruposManana]     = useState([]);
  const [gruposFecha,     setGruposFecha]     = useState([]);
  const [salidas,        setSalidas]        = useState([]);
  const [aliados,        setAliados]        = useState([]);
  const [conveniosMap,   setConveniosMap]   = useState({}); // { aliado_id: { tipo_pasadia: tarifa_neta } }
  const [vendedores,     setVendedores]     = useState(VENDEDORES);
  const [pasadias,       setPasadias]       = useState(PASADIAS);
  const [cierres,        setCierres]        = useState([]);
  const [embarcaciones,  setEmbarcaciones]  = useState([]);
  const [overridesMap,   setOverridesMap]   = useState({});
  const [cobradoHoy,     setCobradoHoy]     = useState(0);
  const [loading, setLoading]       = useState(true);
  const [tab,     setTab]           = useState("reservas");
  const [tabDia,  setTabDia]        = useState("hoy");
  const [fechaFiltro, setFechaFiltro] = useState(""); // for "otra fecha" tab
  const [search, setSearch]         = useState("");
  const [filterEstado, setFilter]   = useState("todos");
  const [showModal, setShowModal]   = useState(false);
  const [detalle, setDetalle]       = useState(null);

  const today    = todayStr();
  const tomorrow = tomorrowStr();

  const fetchReservas = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);

    // Auto-cancelar reservas pendiente_pago cuyo link ya expiró
    await supabase.from("reservas")
      .update({ estado: "cancelado" })
      .eq("estado", "pendiente_pago")
      .lt("link_expira_at", new Date().toISOString())
      .not("link_expira_at", "is", null);

    const todayStart = `${today}T00:00:00.000Z`;
    const tomorrowStart = `${tomorrow}T00:00:00.000Z`;

    const GRUPO_FIELDS = "id, nombre, tipo, pax, fecha, pasadias_org, stage, modalidad_pago, aliado_id, categoria";
    const isGrupo = (e) => e.categoria === "grupo" || (!e.categoria && e.aliado_id);
    const [resHoy, resManana, salR, aliR, cierreR, embR, ovrR, empR, pasR, cobR, cobR2, convR, grpHoyR, grpMananaR] = await Promise.all([
      supabase.from("reservas").select("*").eq("fecha", today).order("salida_id"),
      supabase.from("reservas").select("*").eq("fecha", tomorrow).order("salida_id"),
      supabase.from("salidas").select("*").order("orden"),
      supabase.from("aliados_b2b").select("id, nombre, cupo_credito").eq("estado", "activo").order("nombre"),
      supabase.from("cierres").select("*").order("fecha"),
      supabase.from("embarcaciones").select("*").order("nombre"),
      supabase.from("salidas_override").select("*").in("fecha", [today, tomorrow]),
      supabase.from("usuarios").select("id, nombre, rol_id").in("rol_id", ["ventas", "gerente_ventas"]).order("nombre"),
      supabase.from("pasadias").select("id, nombre, precio, precio_neto_agencia, precio_nino, precio_neto_nino, sin_embarcacion").eq("activo", true).order("orden"),
      // Pagos con fecha_pago = hoy (registrados manualmente)
      supabase.from("reservas").select("abono").eq("fecha_pago", today).neq("estado", "cancelado"),
      // Pagos sin fecha_pago pero creados hoy con abono > 0 (web/Wompi automáticos)
      supabase.from("reservas").select("abono").is("fecha_pago", null).gte("created_at", todayStart).lt("created_at", tomorrowStart).gt("abono", 0).neq("estado", "cancelado"),
      supabase.from("b2b_convenios").select("aliado_id, tipo_pasadia, tarifa_neta, tarifa_neta_nino").eq("activo", true),
      // Grupos hoy y mañana — incluidos en Promise.all para evitar flash de pax incorrecto
      supabase.from("eventos").select(GRUPO_FIELDS).eq("fecha", today).neq("stage", "Realizado"),
      supabase.from("eventos").select(GRUPO_FIELDS).eq("fecha", tomorrow).neq("stage", "Realizado"),
    ]);
    if (resHoy.data)    setReservasHoy(resHoy.data.map(mapRow));
    if (resManana.data) setReservasManana(resManana.data.map(mapRow));
    setGruposHoy((grpHoyR.data || []).filter(isGrupo));
    setGruposManana((grpMananaR.data || []).filter(isGrupo));
    if (empR.data && empR.data.length > 0) setVendedores(["Sin asignar", ...(empR.data.map(e => e.nombre))]);
    if (pasR.data && pasR.data.length > 0) setPasadias(pasR.data.map(p => ({ tipo: p.nombre, precio: p.precio, precio_neto_agencia: p.precio_neto_agencia || 0, precio_nino: p.precio_nino || 0, precio_neto_nino: p.precio_neto_nino || 0, sin_embarcacion: p.sin_embarcacion || false })));
    const totalCobrado = [(cobR.data || []), (cobR2.data || [])].flat().reduce((s, r) => s + (r.abono || 0), 0);
    setCobradoHoy(totalCobrado);
    if (salR.data)      setSalidas(salR.data);
    if (aliR.data)      setAliados(aliR.data);
    if (convR.data) {
      const cmap = {};
      convR.data.forEach(c => {
        if (!cmap[c.aliado_id]) cmap[c.aliado_id] = {};
        cmap[c.aliado_id][c.tipo_pasadia.toLowerCase()] = c.tarifa_neta;
        if (c.tarifa_neta_nino > 0) cmap[c.aliado_id][c.tipo_pasadia.toLowerCase() + "__nino"] = c.tarifa_neta_nino;
      });
      setConveniosMap(cmap);
    }
    if (cierreR.data)   setCierres(cierreR.data);
    if (embR.data)      setEmbarcaciones(embR.data);
    if (ovrR.data) {
      const omap = {};
      ovrR.data.forEach(o => {
        const fk = (o.fecha || "").slice(0, 10); // normalize date to YYYY-MM-DD
        if (!omap[fk]) omap[fk] = {};
        omap[fk][o.salida_id] = o;
      });
      setOverridesMap(omap);
    }
    setLoading(false);
  }, [today, tomorrow]);

  useEffect(() => { fetchReservas(); }, [fetchReservas]);

  // Fetch reservas para el tab "otras"
  useEffect(() => {
    if (tabDia !== "fecha" || !supabase) return;
    if (fechaFiltro) {
      // Fecha específica seleccionada
      supabase.from("reservas").select("*").eq("fecha", fechaFiltro).order("salida_id")
        .then(({ data }) => setReservasFecha((data || []).map(mapRow)));
      // Grupos para esa fecha
      supabase.from("eventos").select("id, nombre, tipo, pax, fecha, pasadias_org, stage, modalidad_pago, aliado_id, categoria")
        .eq("fecha", fechaFiltro).neq("stage", "Realizado")
        .then(({ data }) => setGruposFecha((data || []).filter(e => e.categoria === "grupo" || (!e.categoria && e.aliado_id))));
    } else {
      setGruposFecha([]);
      // Sin filtro → todas las futuras (hoy en adelante), sin canceladas
      supabase.from("reservas").select("*").gte("fecha", today).neq("estado", "cancelado").order("fecha").order("salida_id")
        .then(({ data }) => setReservasFuturas((data || []).map(mapRow)));
    }
  }, [tabDia, fechaFiltro, today]);

  // Active dataset based on tab
  const reservas = tabDia === "hoy"
    ? reservasHoy
    : tabDia === "manana"
      ? reservasManana
      : (fechaFiltro ? reservasFecha : reservasFuturas);
  const grupos = tabDia === "hoy" ? gruposHoy : tabDia === "manana" ? gruposManana : (fechaFiltro ? gruposFecha : []);
  // Pax real del grupo: excluye Impuesto Muelle y STAFF del conteo de pasajeros
  const grupoPaxTotal = (g) => (g.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF").reduce((s, p) => s + (Number(p.personas) || 0), 0) || g.pax || 0;
  const paxMap = paxPorSalida(reservas, salidas);

  // Determine which salidas are open for a given date (respects cierres + overrides + 30-min cutoff)
  const getSalidasAbiertas = (fecha, paxMapOverride, ignorarCutoff = false) => {
    const cierre = cierres.find(c => c.activo && c.fecha === fecha);
    const dayOvr = overridesMap[fecha] || {};
    const pm = paxMapOverride || paxMap; // pax counts for cascade check
    const activas = salidas.filter(s => s.activo);
    const sorted = [...activas].sort((a, b) => a.hora.localeCompare(b.hora));
    // Para hoy: calcular minutos actuales en hora Colombia (UTC-5)
    const esHoy = fecha === today;
    const ahoraMin = (esHoy && !ignorarCutoff) ? (() => {
      const now = new Date();
      const bog = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
      return bog.getHours() * 60 + bog.getMinutes();
    })() : null;
    return sorted.filter((s, idx) => {
      if (!s.activo) return false;
      // Corte de 30 min: si es hoy y la salida ya salió (solo en tablero, no en booking manual)
      if (ahoraMin !== null && s.hora) {
        const [hh, mm] = s.hora.split(":").map(Number);
        const salidaMin = hh * 60 + mm;
        if (ahoraMin >= salidaMin - 30) return false;
      }
      const ovr = dayOvr[s.id];
      if (ovr) return ovr.accion === "abrir"; // override always wins
      if (cierre) {
        if (cierre.tipo === "total") return false;
        if ((cierre.salidas || []).includes(s.id)) return false;
      }
      if (!s.auto_apertura) return true; // fixed salida: always open
      // cascade: open only if previous salida is ≥ auto_umbral% full
      if (idx === 0) return true;
      const prev = sorted[idx - 1];
      return (pm[prev.id] || 0) / (prev.capacidad_total || 1) >= (prev.auto_umbral || 75) / 100;
    });
  };

  const filtered = reservas.filter(r => {
    const matchSearch = r.nombre.toLowerCase().includes(search.toLowerCase()) ||
                        r.id.toLowerCase().includes(search.toLowerCase()) ||
                        r.tipo.toLowerCase().includes(search.toLowerCase());
    const matchEstado = filterEstado === "todos" || r.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const totalPax   = reservas.filter(r => r.estado !== "cancelado").reduce((s, r) => s + r.pax, 0)
                   + grupos.reduce((s, g) => s + grupoPaxTotal(g), 0);
  const totalAbono = reservas.filter(r => r.estado !== "cancelado").reduce((s, r) => s + r.abono, 0);
  const totalVenta = reservas.filter(r => r.estado !== "cancelado").reduce((s, r) => s + r.total, 0);

  const addReserva = async (form) => {
    if (!supabase) return null;

    // Bloquear reservas en fechas con cierre activo (validación en el momento de guardar)
    const fechaRes = form.fecha || (tabDia === "manana" ? tomorrow : today);
    const cierre = cierres.find(c => c.activo && c.fecha === fechaRes);
    if (cierre?.tipo === "total") {
      alert(`❌ La fecha ${fechaRes} está cerrada (${cierre.motivo || "Buy-Out / Cierre total"}). No se puede crear la reserva.`);
      return null;
    }

    const pax   = Number(form.pax_a) + Number(form.pax_n);
    const total = Number(form.pax_a) * Number(form.precio)
                + Number(form.pax_n) * Number(form.precio_nino > 0 ? form.precio_nino : form.precio);
    const isLink = form._isLink;
    const abono  = isLink ? 0 : (form.forma_pago === "CXC" ? 0 : (Number(form.abono) || 0));
    const reservaId = `R-${Date.now()}`;
    const emailVal = form.contacto?.trim().includes("@") ? form.contacto.trim() : null;
    const row = {
      id:         reservaId,
      fecha:      form.fecha || (tabDia === "manana" ? tomorrow : today),
      salida_id:  form.salida_id || null,
      tipo:       form.tipo,
      canal:      form.canal,
      nombre:     form.nombre.trim(),
      contacto:   form.contacto || "",
      email:      emailVal,
      telefono:   form.telefono?.trim() || null,
      pax,
      pax_a:      Number(form.pax_a),
      pax_n:      Number(form.pax_n),
      precio_u:   Number(form.precio),
      total,
      abono,
      saldo:      total - abono,
      estado:          isLink ? "pendiente_pago" : (abono >= total ? "confirmado" : "pendiente"),
      forma_pago:      isLink ? "link_pago" : form.forma_pago,
      // Link de pago: expira en 48 horas
      link_expira_at:  isLink ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : null,
      aliado_id:       form.aliado_id || null,
      vendedor:        form.vendedor !== "Sin asignar" ? form.vendedor : null,
      notas:           form.notas || "",
      fecha_pago:      form.fecha_pago || null,
      nombre_embarcacion: form.nombre_embarcacion || null,
      hora_llegada:    form.hora_llegada || null,
    };
    await supabase.from("reservas").insert(row);
    logAccion({ modulo: "reservas", accion: "crear_reserva", tabla: "reservas", registroId: row.id,
      datosDespues: row, notas: `Canal: ${row.canal} · ${row.pax} pax · ${COP(row.total)}` });
    fetchReservas();
    return reservaId;
  };

  const toggleEstado = async (id) => {
    if (!supabase) return;
    const r = reservas.find(r => r.id === id);
    if (!r) return;
    const cycle = { pendiente: "confirmado", confirmado: "cancelado", cancelado: "pendiente" };
    const nextEstado = cycle[r.estado] || "pendiente";
    await supabase.from("reservas").update({ estado: nextEstado }).eq("id", id);
    // Si se confirma manualmente y la reserva tiene un lead, cerrarlo
    if (nextEstado === "confirmado" && r.lead_id) {
      await supabase.from("leads").update({
        stage: "Cerrado Ganado",
        ultimo_contacto: new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }),
      }).eq("id", r.lead_id);
    }
    fetchReservas();
  };

  const deleteReserva = async (id) => {
    if (!supabase) return;
    await supabase.from("reservas").delete().eq("id", id);
    fetchReservas();
  };

  // ── styles ──
  const cardStyle = {
    background: B.navyMid,
    border: `1px solid ${B.navyLight}`,
    borderRadius: 12,
    padding: "20px 24px",
  };

  const pillStyle = (active) => ({
    background: active ? B.sky : B.navyLight,
    color: active ? B.navy : B.sand,
    border: "none",
    borderRadius: 20,
    padding: "5px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 0.2s",
  });

  const thStyle = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    color: B.sand,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    borderBottom: `1px solid ${B.navyLight}`,
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "12px 14px",
    fontSize: 14,
    color: B.white,
    borderBottom: `1px solid ${B.navyLight}44`,
    verticalAlign: "middle",
  };

  return (
    <div style={{
      background: B.navy,
      minHeight: "100vh",
      padding: isMobile ? "0 0 60px" : "28px 28px 60px",
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      color: B.white,
      boxSizing: "border-box",
    }}>
      {/* ── page header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 16 : 28 }}>
        <h1 style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: isMobile ? 24 : 34,
          fontWeight: 800,
          color: B.sand,
          margin: 0,
          letterSpacing: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          Reservas
          {supabase && !loading && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#4CAF7D22", color: "#4CAF7D" }}>LIVE</span>
          )}
        </h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: B.sky, border: "none", borderRadius: 8, color: B.navy,
            padding: isMobile ? "10px 14px" : "10px 22px",
            fontSize: isMobile ? 13 : 15, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> {isMobile ? "Nueva" : "Nueva Reserva"}
        </button>
      </div>

      {/* ── Main tab: Reservas / Calendario ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[["reservas", "⚓ Reservas"], ["calendario", "📅 Calendario"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "9px 22px", borderRadius: 8, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600,
            background: tab === k ? B.sky : B.navyMid,
            color: tab === k ? B.navy : B.sand,
          }}>{l}</button>
        ))}
      </div>

      {tab === "calendario" && (
        <TabCalendario salidas={salidas} cierres={cierres} embarcaciones={embarcaciones} />
      )}

      {tab === "reservas" && <>

      {/* ── Day tabs ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: isMobile ? 16 : 20, alignItems: "center" }}>
        {[
          { key: "hoy",    label: "Hoy",    fecha: today,    count: reservasHoy.filter(r => r.estado !== "cancelado").reduce((s,r) => s + r.pax, 0) },
          { key: "manana", label: "Mañana", fecha: tomorrow, count: reservasManana.filter(r => r.estado !== "cancelado").reduce((s,r) => s + r.pax, 0) },
        ].map(t => (
          <button key={t.key} onClick={() => { setTabDia(t.key); setSearch(""); setFilter("todos"); }} style={{
            display: "flex", alignItems: "center", gap: 8,
            background: tabDia === t.key ? B.sky + "22" : B.navyMid,
            border: `1px solid ${tabDia === t.key ? B.sky : B.navyLight}`,
            borderRadius: 10, padding: "10px 20px", cursor: "pointer",
            color: tabDia === t.key ? B.sky : B.sand, fontWeight: 700, fontSize: 14,
            transition: "all 0.15s",
          }}>
            <span>{t.key === "hoy" ? "☀️" : "🌙"} {t.label}</span>
            <span style={{ background: tabDia === t.key ? B.sky : B.navyLight, color: tabDia === t.key ? B.navy : B.sand, borderRadius: 20, padding: "1px 9px", fontSize: 12, fontWeight: 800 }}>
              {t.count} pax
            </span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{t.fecha}</span>
          </button>
        ))}
        {/* Otras / Futuras */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => { setTabDia("fecha"); setFechaFiltro(""); setSearch(""); setFilter("todos"); }} style={{
            display: "flex", alignItems: "center", gap: 8,
            background: tabDia === "fecha" ? B.sand + "22" : B.navyMid,
            border: `1px solid ${tabDia === "fecha" ? B.sand : B.navyLight}`,
            borderRadius: 10, padding: "10px 16px", cursor: "pointer",
            color: tabDia === "fecha" ? B.sand : "rgba(255,255,255,0.4)", fontWeight: 700, fontSize: 14,
            transition: "all 0.15s",
          }}>
            <span>📅 Otras</span>
            {tabDia === "fecha" && !fechaFiltro && reservasFuturas.length > 0 && (
              <span style={{ background: B.sand, color: B.navy, borderRadius: 20, padding: "1px 9px", fontSize: 12, fontWeight: 800 }}>
                {reservasFuturas.filter(r => r.estado !== "cancelado").reduce((s,r) => s + r.pax, 0)} pax
              </span>
            )}
          </button>
          {tabDia === "fecha" && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)}
                style={{ background: "#0D1B3E", border: `1px solid ${B.sand}`, borderRadius: 8, color: B.white, padding: "8px 10px", fontSize: 13, outline: "none" }} />
              {fechaFiltro && (
                <button onClick={() => setFechaFiltro("")}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
                  title="Ver todas las futuras">✕</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── summary kpis — ocultar en "Otras" sin fecha específica ── */}
      {!(tabDia === "fecha" && !fechaFiltro) && (
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: isMobile ? 8 : 14, marginBottom: isMobile ? 16 : 24 }}>
        {[
          { label: "Total Pax",  value: totalPax,         unit: "personas",           color: B.sky     },
          { label: "Revenue",    value: COP(totalAbono),  unit: "cobrado del día",    color: B.success },
          { label: "Venta Total",value: COP(totalVenta),  unit: "total en reservas",  color: B.sand    },
        ].map(k => (
          <div key={k.label} style={{ ...cardStyle, padding: "16px 20px" }}>
            <div style={{ fontSize: 12, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>
              {k.value}
            </div>
            {k.unit && <div style={{ fontSize: 12, color: B.sky, marginTop: 2 }}>{k.unit}</div>}
          </div>
        ))}
      </div>
      )}

      {/* ── departure board — ocultar en "Otras" sin fecha específica ── */}
      {!isMobile && salidas.length > 0 && !(tabDia === "fecha" && !fechaFiltro) && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: B.sand, margin: "0 0 14px", letterSpacing: 0.5 }}>
            Tablero de Salidas
          </h2>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {(() => {
              const fechaBoard = tabDia === "hoy" ? today : tabDia === "manana" ? tomorrow : fechaFiltro;
              const abiertas = fechaBoard ? getSalidasAbiertas(fechaBoard) : [];
              // also include salidas not "open" but that have actual reservations
              const conReservas = salidas.filter(s => s.activo && (paxMap[s.id] || 0) > 0 && !abiertas.find(a => a.id === s.id));
              const dayOvr = fechaBoard ? (overridesMap[fechaBoard] || {}) : {};
              return [...abiertas, ...conReservas].sort((a, b) => a.hora.localeCompare(b.hora)).map(s => {
                const extraCap = (dayOvr[s.id]?.extra_embarcaciones || []).reduce((sum, e) => sum + (e.capacidad || 0), 0);
                return <DepartureCard key={s.id} salida={s} paxCount={paxMap[s.id] || 0} extraCap={extraCap} />;
              });
            })()}
          </div>
        </div>
      )}

      {/* ── reservations table ── */}
      <div style={isMobile ? {} : cardStyle}>
        {/* table header */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 18 : 20, fontWeight: 700, color: B.sand, margin: 0 }}>
              Lista de Reservas <span style={{ fontSize: 13, fontWeight: 500, color: B.sky }}>({filtered.length})</span>
            </h2>
          </div>
          {/* search */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: B.sand, fontSize: 14, pointerEvents: "none" }}>⌕</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar reserva…"
              style={{ background: B.navyLight, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, padding: "10px 12px 10px 30px", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          {/* filter pills */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {["todos", "confirmado", "pendiente", "cancelado"].map(e => (
              <button key={e} style={{ ...pillStyle(filterEstado === e), flexShrink: 0, fontSize: 12 }} onClick={() => setFilter(e)}>
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile card list */}
        {isMobile ? (
          loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: B.sand }}>Cargando reservas…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>🏝️</div>
              <div style={{ fontSize: 14, color: B.sand }}>No hay reservas</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(r => {
                const salida = salidas.find(s => s.id === r.salida);
                const saldo = r.saldo ?? (r.total - r.abono);
                return (
                  <div key={r.id} onClick={() => setDetalle(r)} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", border: `1px solid ${B.navyLight}`, cursor: "pointer" }}>
                    {/* Row 1: nombre + badge + actions */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                          {r.id}
                          {r.created_at && <span style={{ marginLeft: 8, color: B.sand }}>⏱ {fmtHora(r.created_at)}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <StatusBadge estado={r.estado} />
                        <button onClick={e => { e.stopPropagation(); toggleEstado(r.id); }} title="Cambiar estado"
                          style={{ background: B.navyLight, border: "none", borderRadius: 8, color: B.sky, padding: "7px 10px", fontSize: 16, cursor: "pointer" }}>↻</button>
                        <button onClick={e => { e.stopPropagation(); deleteReserva(r.id); }} title="Eliminar"
                          style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 8, color: B.danger, padding: "7px 10px", fontSize: 14, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                    {/* Row 2: details */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                      {tabDia === "fecha" && !fechaFiltro && r.fecha && (
                        <span style={{ background: B.sky + "22", borderRadius: 6, padding: "2px 8px", color: B.sky, fontWeight: 700 }}>
                          {new Date(r.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                      )}
                      <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: B.sand }}>{r.pax} pax</span>
                      <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: "rgba(255,255,255,0.6)" }}>{r.tipo}</span>
                      <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: B.sky }}>{salida ? `${salida.hora} · ${salida.nombre}` : r.salida || "—"}</span>
                      <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: "rgba(255,255,255,0.5)" }}>{r.canal}</span>
                    </div>
                    {/* Row 3: money */}
                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13 }}>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Total: </span><span style={{ fontWeight: 700 }}>{COP(r.total)}</span></div>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Abono: </span><span style={{ fontWeight: 700, color: B.success }}>{COP(r.abono)}</span></div>
                      {saldo > 0 && <div><span style={{ color: B.warning, fontWeight: 700 }}>Saldo: {COP(saldo)}</span></div>}
                    </div>
                    {r.notas && <div style={{ marginTop: 6, fontSize: 11, color: B.sand, opacity: 0.7 }}>{r.notas}</div>}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Desktop table */
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                <thead>
                  <tr>
                    {["#", "Nombre", "Tipo", "Pax", "Salida", "Canal", "Total", "Abono", "Estado", "Acciones"].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10} style={{ ...tdStyle, textAlign: "center", color: B.sand, padding: "32px 0" }}>Cargando reservas…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ ...tdStyle, textAlign: "center", padding: "48px 0" }}>
                        <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>🏝️</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: B.sand, marginBottom: 4 }}>No hay reservas para hoy</div>
                        <div style={{ fontSize: 13, color: B.sky }}>Las reservas que ingreses aparecerán aquí.</div>
                      </td>
                    </tr>
                  ) : filtered.map(r => {
                    const salida = salidas.find(s => s.id === r.salida);
                    const saldo = r.saldo ?? (r.total - r.abono);
                    return (
                      <tr key={r.id} onClick={() => setDetalle(r)} style={{ transition: "background 0.15s", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = B.navyLight + "55"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ ...tdStyle, color: B.sky, fontWeight: 700, fontSize: 13 }}>{r.id}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          <div>{r.nombre}</div>
                          {r.created_at && <div style={{ fontSize: 11, color: B.sand, marginTop: 1 }}>⏱ {fmtHora(r.created_at)}</div>}
                          {r.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notas}</div>}
                        </td>
                        <td style={{ ...tdStyle, color: B.sand, fontSize: 13 }}>{r.tipo}</td>
                        <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: B.sky }}>{r.pax}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700, color: B.sky }}>{salida ? salida.hora : r.salida || "—"}</div>
                          {salida && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{salida.nombre}</div>}
                        </td>
                        <td style={tdStyle}><span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", fontSize: 12, color: B.sky, fontWeight: 600 }}>{r.canal}</span></td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: B.white }}>{COP(r.total)}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700, color: B.success }}>{COP(r.abono)}</div>
                          {saldo > 0 && <div style={{ fontSize: 11, color: B.warning }}>Saldo: {COP(saldo)}</div>}
                        </td>
                        <td style={tdStyle}><StatusBadge estado={r.estado} /></td>
                        <td style={tdStyle} onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => toggleEstado(r.id)} title="Cambiar estado" style={{ background: B.navyLight, border: "none", borderRadius: 6, color: B.sky, padding: "5px 10px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>↻</button>
                            <button onClick={() => deleteReserva(r.id)} title="Eliminar" style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 6, color: B.danger, padding: "5px 10px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div style={{ display: "flex", gap: 24, justifyContent: "flex-end", paddingTop: 14, borderTop: `1px solid ${B.navyLight}`, marginTop: 4, flexWrap: "wrap" }}>
                {[
                  { label: "Subtotal abonado", value: COP(filtered.reduce((s, r) => s + r.abono, 0)), color: B.success },
                  { label: "Subtotal venta",   value: COP(filtered.reduce((s, r) => s + r.total, 0)), color: B.sand    },
                ].map(f => (
                  <div key={f.label} style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: f.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{f.value}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Grupos del día ── */}
      {grupos.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, marginTop: 16, border: `1px solid rgba(200,185,154,0.2)` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: B.sand }}>
              👥 Grupos del día
              <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>
                {grupos.length} grupo{grupos.length !== 1 ? "s" : ""} · {grupos.reduce((s, g) => s + grupoPaxTotal(g), 0)} pax
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {grupos.map(g => {
              const pax = grupoPaxTotal(g);
              const tipos = [...new Set((g.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle").map(p => p.tipo))].join(", ");
              return (
                <div key={g.id} style={{ background: "rgba(200,185,154,0.07)", borderRadius: 10, padding: "12px 16px", border: "1px solid rgba(200,185,154,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: B.white }}>{g.nombre}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {tipos || g.tipo || "—"} · {g.modalidad_pago === "organizador" ? "💳 Pago organizador" : "Pago individual"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pax</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{pax}</div>
                    </div>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, fontWeight: 600,
                      background: g.stage === "Confirmado" ? B.success + "22" : g.stage === "Cotizado" ? B.warning + "22" : B.navyLight,
                      color: g.stage === "Confirmado" ? B.success : g.stage === "Cotizado" ? B.warning : "rgba(255,255,255,0.4)" }}>
                      {g.stage || "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── modals ── */}
      {showModal && (
        <ReservaModal
          onClose={() => setShowModal(false)}
          onSave={addReserva}
          isMobile={isMobile}
          salidaList={salidas}
          aliadoList={aliados}
          vendedoresList={vendedores}
          pasadiaList={pasadias}
          conveniosMap={conveniosMap}
          paxMap={paxMap}
          getSalidasVisibles={fecha => getSalidasAbiertas(fecha, undefined, true)}
          fechaDefault={tabDia === "manana" ? tomorrow : tabDia === "fecha" && fechaFiltro ? fechaFiltro : today}
        />
      )}
      {detalle && (
        <ReservaDetalle
          reserva={detalle}
          isMobile={isMobile}
          onClose={() => setDetalle(null)}
          onUpdated={() => { fetchReservas(); setDetalle(null); }}
          salidaList={salidas}
          aliadoList={aliados}
          vendedoresList={vendedores}
          pasadiaList={pasadias}
        />
      )}
      </>}
    </div>
  );
}
