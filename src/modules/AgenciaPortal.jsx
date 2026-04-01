import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import { B, COP, todayStr, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl, WOMPI_INTEGRITY_KEY } from "../lib/wompi";
import { asignarPuntosReserva, getSaldoPuntos, getRankingAgencia, getPuntosConfig } from "../lib/puntos";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

function useDevice() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return { isMobile: w < 768, isTablet: w >= 768 && w < 1100 };
}

// ═══════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) return;
    setLoading(true); setError("");
    if (!supabase) { setError("Base de datos no conectada"); setLoading(false); return; }
    const { data, error: err } = await supabase.from("b2b_usuarios").select("*, aliados_b2b(id, nombre, tipo, comision, estado, precio_vista_admin, precio_vista_vendedor, modalidad_puntos, vendedor_id, contacto, tel, email, codigo, codigo_fijo, rnt_url, rnt_pendiente_url, cert_bancaria_url, cert_bancaria_pendiente_url, cert_bancaria_solicitud_fecha)").eq("email", email.toLowerCase().trim()).eq("activo", true).single();
    if (err || !data) { setError("Email no encontrado o usuario inactivo"); setLoading(false); return; }
    if (data.aliados_b2b?.estado !== "activo") { setError("La agencia no esta activa"); setLoading(false); return; }
    onLogin({ user: data, agencia: data.aliados_b2b });
  };

  return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 40, width: 400, textAlign: "center" }}>
        <img src="/atolon-logo-white.png" alt="Atolon Beach Club" style={{ height: 72, objectFit: "contain", display: "block", margin: "0 auto 20px" }} />
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, marginBottom: 4 }}>Portal de Agencias</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 28 }}>Atolon Beach Club</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email del vendedor" onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{ ...IS, textAlign: "center", fontSize: 14 }} />
          <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN (opcional)" maxLength={6} onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{ ...IS, textAlign: "center", fontSize: 14, letterSpacing: 8 }} />
          {error && <div style={{ color: B.danger, fontSize: 13 }}>{error}</div>}
          <button onClick={handleLogin} disabled={loading}
            style={{ padding: "14px", background: loading ? B.navyLight : B.sand, color: loading ? "rgba(255,255,255,0.4)" : B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: loading ? "default" : "pointer", marginTop: 8 }}>
            {loading ? "Verificando..." : "Ingresar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// NUEVA RESERVA B2B
// ═══════════════════════════════════════════════
function NuevaReserva({ agencia, user, onCreated, vistaPrecios = "ambos" }) {
  const { isMobile } = useDevice();
  const [step, setStep] = useState(1);
  const [convenios, setConvenios] = useState([]);
  const [pasadiasDB, setPasadiasDB] = useState([]);
  const [salidas, setSalidas] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState({});
  const [cierres, setCierres] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [form, setForm] = useState({ tipo: "", fecha: "", salida_id: "", nombre: "", contacto: "", pax: 1, pax_a: 1, pax_n: 0, notas: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [linkPago, setLinkPago] = useState("");
  const [pagoAbierto, setPagoAbierto] = useState(null); // { tipo:"wompi"|"cliente_paga", url, total }
  const [uploadingComp, setUploadingComp] = useState(false);
  const [cuentaBancaria, setCuentaBancaria] = useState(null);
  const [premiosDisponibles, setPremiosDisponibles] = useState([]); // [{incentivo, saldo}]

  // Helpers de visibilidad de precios
  const showPublico = vistaPrecios !== "solo_neto";
  const showNeto    = vistaPrecios !== "solo_publico";

  // Calcula total de premios ganados desde fecha_inicio del incentivo (sin restricción de periodo)
  const calcPremiosGanados = (reservas, inc) => {
    const filtered = (reservas || []).filter(r => {
      if (inc.fecha_inicio && r.fecha < inc.fecha_inicio) return false;
      if (inc.fecha_fin && r.fecha > inc.fecha_fin) return false;
      if (inc.acum_dia_semana !== null && inc.acum_dia_semana !== undefined) {
        if (new Date(r.fecha + "T12:00:00").getDay() !== inc.acum_dia_semana) return false;
      }
      return true;
    });
    const totalPax = filtered.reduce((s, r) => s + (r.pax || 0), 0);
    const bloques  = Math.floor(totalPax / (inc.acum_cada_pax || 1));
    return bloques * (inc.acum_beneficio_cant || 1);
  };

  // Carga los incentivos de acumulación y calcula saldo de premios disponibles
  const loadPremios = async () => {
    if (!supabase) return;
    const [{ data: incs }, { data: reservas }, { data: canjes }] = await Promise.all([
      supabase.from("b2b_incentivos").select("*")
        .or(`aliado_id.is.null,aliado_id.eq.${agencia.id}`)
        .eq("activo", true).eq("tipo", "acumulacion"),
      supabase.from("reservas").select("pax, fecha")
        .eq("aliado_id", agencia.id).neq("estado", "cancelado").neq("canal", "GRUPO"),
      supabase.from("b2b_premios_canjes").select("incentivo_id, pasadias_usadas")
        .eq("aliado_id", agencia.id),
    ]);
    const disponibles = [];
    for (const inc of incs || []) {
      const ganados  = calcPremiosGanados(reservas || [], inc);
      const usados   = (canjes || []).filter(c => c.incentivo_id === inc.id)
                        .reduce((s, c) => s + (c.pasadias_usadas || 1), 0);
      const saldo    = ganados - usados;
      if (saldo > 0) disponibles.push({ incentivo: inc, saldo, ganados, usados });
    }
    setPremiosDisponibles(disponibles);
  };

  useEffect(() => {
    if (!supabase) return;
    supabase.from("b2b_convenios").select("*").eq("aliado_id", agencia.id).eq("activo", true).then(({ data }) => setConvenios(data || []));
    supabase.from("pasadias").select("*").eq("activo", true).order("orden").then(({ data }) => setPasadiasDB(data || []));
    supabase.from("salidas").select("*").eq("activo", true).order("orden").then(({ data }) => setSalidas(data || []));
    supabase.from("configuracion").select("cuentas_bancarias").eq("id", "atolon").single().then(({ data }) => {
      if (data?.cuentas_bancarias?.length) {
        const pred = data.cuentas_bancarias.find(c => c.predeterminada) || data.cuentas_bancarias[0];
        setCuentaBancaria(pred);
      }
    });
    loadPremios();
  }, [agencia.id]);

  // Fetch availability when date changes
  const checkDisponibilidad = async (fecha) => {
    if (!supabase || !fecha) return;
    setForm(f => ({ ...f, fecha, salida_id: "" }));
    const [resR, cierreR, ovrR] = await Promise.all([
      supabase.from("reservas").select("salida_id, pax").eq("fecha", fecha).neq("estado", "cancelado"),
      supabase.from("cierres").select("*").eq("fecha", fecha).eq("activo", true),
      supabase.from("salidas_override").select("*").eq("fecha", fecha),
    ]);
    const resMap = {};
    (resR.data || []).forEach(r => { resMap[r.salida_id] = (resMap[r.salida_id] || 0) + (r.pax || 0); });
    setDisponibilidad(resMap);
    setCierres(cierreR.data || []);
    const ovrMap = {};
    (ovrR.data || []).forEach(o => { ovrMap[o.salida_id] = o; });
    setOverrides(ovrMap);
  };

  // Determine visible salidas for selected date
  const getSalidasDisponibles = () => {
    const cierre = cierres.find(c => c.activo);
    return salidas.filter(s => {
      const ovr = overrides[s.id];
      if (ovr) return ovr.accion === "abrir";
      if (cierre) {
        if (cierre.tipo === "total") return false;
        if ((cierre.salidas || []).includes(s.id)) return false;
      }
      if (!s.auto_apertura) return true;
      const fijas = salidas.filter(f => !f.auto_apertura);
      return fijas.every(f => (disponibilidad[f.id] || 0) / (f.capacidad_total || 1) >= 0.9);
    });
  };

  const salidasDisp = form.fecha ? getSalidasDisponibles() : [];
  const selectedConvenio = convenios.find(c => c.tipo_pasadia === form.tipo);
  const precioPublico = selectedConvenio?.tarifa_publica || 0;
  const precioNeto = selectedConvenio?.tarifa_neta || 0;
  const totalPax = (form.pax_a || 1) + (form.pax_n || 0);
  const total = precioNeto * totalPax;

  // ── handleSave: crea la reserva en HOLD hasta que el pago se confirme ─────
  const handleSave = async (metodoPago, extras = {}) => {
    if (!supabase || saving || !form.tipo || !form.nombre.trim()) return;
    setSaving(true);
    setShowPagoModal(false);
    setShowTransferModal(false);

    const paxT = (form.pax_a || 1) + (form.pax_n || 0);
    const esClientePaga  = metodoPago === "cliente_paga";
    const esWompi        = metodoPago === "wompi";
    const esTransf       = metodoPago === "transferencia";
    const esTransf60     = metodoPago === "transferencia_hold";
    const esTransfComp   = metodoPago === "transferencia_comprobante"; // comprobante ya subido
    const esPremio       = metodoPago === "incentivo_premio";

    const precioUnitario = esClientePaga ? precioPublico : precioNeto;
    const totalFinal     = precioUnitario * paxT;
    const reservaId      = `R-${Date.now()}`;

    // ── Estado según método ──────────────────────────────────────────────
    // Ninguna reserva se confirma hasta que el pago esté completo
    let estado = "pendiente_pago";
    let abono  = 0;
    let saldo  = totalFinal;
    let linkExpira = null;
    let comprob = extras.comprob_url || null;

    if (esWompi) {
      // Agente abre Wompi ahora — queda en hold hasta webhook/redirect
      estado = "pendiente_pago";
      linkExpira = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
    } else if (esClientePaga) {
      // Cliente tiene 15 min para pagar
      estado = "pendiente_pago";
      linkExpira = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    } else if (esTransfComp) {
      // Comprobante ya subido → confirmar
      estado = "confirmado";
      abono  = totalFinal;
      saldo  = 0;
    } else if (esTransf60) {
      // 60 min de hold para transferencia
      estado = "pendiente_comprobante";
      linkExpira = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    } else if (esPremio) {
      // Premio canjeado → confirmado automáticamente, sin cobro
      estado = "confirmado";
      abono  = totalFinal;
      saldo  = 0;
    }

    // Generar URL de Wompi para pago en línea
    let linkGenerado = "";
    if (esClientePaga || esWompi) {
      const baseUrl = wompiCheckoutUrl({
        referencia: reservaId,
        totalCOP: totalFinal,
        email: form.contacto?.includes("@") ? form.contacto : "",
      });
      linkGenerado = await baseUrl;
    }
    if (esClientePaga) {
      // Link que va al cliente → página PagoCliente
      linkGenerado = `${window.location.origin}/pago/${reservaId}`;
    }

    // Auto-open salida si era auto_apertura (solo para reservas confirmadas o en hold)
    const salidaAutoOpen = salidas.find(s => s.id === form.salida_id);
    if (salidaAutoOpen?.auto_apertura) {
      const { data: existingOvr } = await supabase.from("salidas_override").select("id").eq("fecha", form.fecha).eq("salida_id", form.salida_id);
      if (!existingOvr || existingOvr.length === 0) {
        await supabase.from("salidas_override").insert({ id: `OVR-${Date.now()}`, fecha: form.fecha, salida_id: form.salida_id, accion: "abrir", motivo: `Hold B2B ${paxT} pax` });
      }
    }

    const { error } = await supabase.from("reservas").insert({
      id: reservaId, fecha: form.fecha, salida_id: form.salida_id || null, tipo: form.tipo,
      canal: "B2B", nombre: form.nombre, contacto: form.contacto,
      pax: paxT, pax_a: form.pax_a || 1, pax_n: form.pax_n || 0,
      precio_u: precioUnitario, total: totalFinal,
      precio_neto: precioNeto, precio_publico: precioPublico,
      abono, saldo, estado,
      notas: form.notas,
      forma_pago: metodoPago, link_pago: linkGenerado,
      link_expira_at: linkExpira,
      comprobante_url: comprob,
      aliado_id: agencia.id, vendedor_b2b_id: user.id,
      qr_code: `ATOLON-${agencia.id}-${Date.now()}`,
    });

    if (error) { setMsg("Error al guardar la reserva"); setSaving(false); return; }

    // ── Registrar canje de premio si aplica ──────────────────────────────
    if (esPremio && extras.incentivo_id) {
      await supabase.from("b2b_premios_canjes").insert({
        id: `CANJE-${Date.now()}`,
        aliado_id: agencia.id,
        incentivo_id: extras.incentivo_id,
        reserva_id: reservaId,
        pasadias_usadas: 1,
        fecha: form.fecha,
        nota: `Premio canjeado — reserva ${reservaId}`,
      });
    }

    // ── Post-save: acción según método ──────────────────────────────────
    if (esClientePaga) {
      setLinkPago(linkGenerado);
      setPagoAbierto({ tipo: "cliente_paga", url: linkGenerado, total: totalFinal });
    } else if (esWompi) {
      const wompiUrl = await wompiCheckoutUrl({ referencia: reservaId, totalCOP: totalFinal, email: form.contacto?.includes("@") ? form.contacto : "" });
      window.open(wompiUrl, "_blank");
      setPagoAbierto({ tipo: "wompi", url: wompiUrl, total: totalFinal });
    } else if (esTransfComp) {
      setMsg(`✅ Comprobante recibido — Reserva confirmada ${COP(totalFinal)}`);
      setTimeout(() => setMsg(""), 6000);
      // Puntos solo para vendedores, no para admins
      if (user.rol !== "admin") {
        asignarPuntosReserva({
          vendedorId: user.id,
          agenteId: agencia.id,
          reservaId,
          pax: paxT,
          totalCOP: totalFinal,
          fecha: form.fecha,
          esGrupo: paxT >= 10,
        }).catch(() => {});
      }
    } else if (esTransf60) {
      setMsg(`⏱ Reserva en hold 60 min — esperando transferencia ${COP(totalFinal)}`);
      setTimeout(() => setMsg(""), 8000);
    } else if (esPremio) {
      setMsg(`🎁 Premio canjeado — Reserva confirmada sin costo`);
      setTimeout(() => setMsg(""), 6000);
    }

    // Para pagos externos (wompi/clientePaga) NO resetear el form — el agente puede volver
    if (!esWompi && !esClientePaga) {
      setForm({ tipo: "", fecha: "", salida_id: "", nombre: "", contacto: "", pax: 1, pax_a: 1, pax_n: 0, notas: "" });
      setStep(1);
    }
    setSaving(false); onCreated();
  };

  // ── Upload comprobante de transferencia ──────────────────────────────────
  const handleComprobanteUpload = async (file) => {
    if (!file || !supabase) return;
    setUploadingComp(true);
    const ext = file.name.split(".").pop();
    const path = `comp-${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from("comprobantes").upload(path, file, { upsert: true });
    if (error) { setMsg("Error subiendo comprobante"); setUploadingComp(false); return; }
    const { data: urlData } = supabase.storage.from("comprobantes").getPublicUrl(path);
    setUploadingComp(false);
    handleSave("transferencia_comprobante", { comprob_url: urlData.publicUrl });
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
      <h3 style={{ fontSize: 16, color: B.sand, marginBottom: 8 }}>Nueva Reserva</h3>

      {/* Progress */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[1, 2].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? B.sky : B.navyLight }} />
        ))}
      </div>

      {msg && <div style={{ padding: "10px 16px", borderRadius: 8, background: B.success + "22", color: B.success, marginBottom: 16, fontSize: 13 }}>{msg}</div>}

      {/* STEP 1: Fecha + Pax + Tipo + Horario */}
      {step === 1 && (() => {
        const tPax = (form.pax_a || 1) + (form.pax_n || 0);
        const selectedPasadia = pasadiasDB.find(p => p.nombre === form.tipo);
        const esHorariosAbiertos = selectedPasadia?.horarios_abiertos || false;
        const esSinEmb = selectedPasadia?.sin_embarcacion || false;

        // Salidas visibles: default + 10+pax opens auto_apertura + horarios_abiertos shows all
        const salidasParaMostrar = form.fecha && form.tipo ? (() => {
          const cierre = cierres.find(c => c.activo);
          if (esSinEmb) return []; // After Island: no necesita horario
          return salidas.filter(s => {
            const ovr = (overrides || {})[s.id];
            if (ovr) return ovr.accion === "abrir";
            if (cierre) {
              if (cierre.tipo === "total") return false;
              if ((cierre.salidas || []).includes(s.id)) return false;
            }
            if (esHorariosAbiertos) return true; // Atolon Experience: todos los horarios
            if (!s.auto_apertura) return true; // Salidas fijas siempre
            if (tPax >= 10) return true; // 10+ pax abre auto_apertura
            // Default: check if fijas >=90%
            const fijas = salidas.filter(f => !f.auto_apertura);
            return fijas.every(f => (disponibilidad[f.id] || 0) / (f.capacidad_total || 1) >= 0.9);
          });
        })() : [];

        return (
        <div>
          {/* Row 1: Fecha + Adultos + Ninos */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: isMobile ? 12 : 16, marginBottom: 20 }}>
            <div>
              <label style={LS}>Fecha</label>
              <input type="date" value={form.fecha}
                onChange={e => { checkDisponibilidad(e.target.value); setForm(f => ({ ...f, salida_id: "" })); }}
                onClick={e => { try { e.target.showPicker(); } catch(_) {} }}
                min={todayStr()} style={{ ...IS, fontSize: isMobile ? 13 : 15, padding: isMobile ? "10px 12px" : "14px", cursor: "pointer" }} />
            </div>
            <div>
              <label style={LS}>Adultos</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setForm(f => ({ ...f, pax_a: Math.max(1, (f.pax_a || 1) - 1) }))} style={{ width: 36, height: 36, borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                <span style={{ fontSize: 22, fontWeight: 700, minWidth: 30, textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif" }}>{form.pax_a || 1}</span>
                <button onClick={() => setForm(f => ({ ...f, pax_a: (f.pax_a || 1) + 1 }))} style={{ width: 36, height: 36, borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>
            <div>
              <label style={LS}>Ninos</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setForm(f => ({ ...f, pax_n: Math.max(0, (f.pax_n || 0) - 1) }))} style={{ width: 36, height: 36, borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                <span style={{ fontSize: 22, fontWeight: 700, minWidth: 30, textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif" }}>{form.pax_n || 0}</span>
                <button onClick={() => setForm(f => ({ ...f, pax_n: (f.pax_n || 0) + 1 }))} style={{ width: 36, height: 36, borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>
          </div>

          {form.fecha && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>Total: <strong style={{ color: B.white }}>{tPax}</strong> personas ({form.pax_a || 1} adultos{(form.pax_n || 0) > 0 ? `, ${form.pax_n} ninos` : ""})</div>}

          {/* Row 2: Tipo de Pasadia */}
          {form.fecha && !cierres.some(c => c.tipo === "total") && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ ...LS, marginBottom: 12 }}>Tipo de Pasadia</label>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(convenios.length, isMobile ? 2 : 4)}, 1fr)`, gap: 12 }}>
                {convenios.map(c => {
                  const pas = pasadiasDB.find(p => p.nombre === c.tipo_pasadia);
                  const selected = form.tipo === c.tipo_pasadia;
                  const minPax = pas?.min_pax || 1;
                  const cumpleMin = tPax >= minPax;
                  return (
                    <div key={c.tipo_pasadia} onClick={() => cumpleMin && setForm(f => ({ ...f, tipo: c.tipo_pasadia, salida_id: "" }))}
                      style={{
                        background: selected ? B.sky + "15" : B.navy, borderRadius: 10, padding: 16, textAlign: "center",
                        border: `2px solid ${selected ? B.sky : !cumpleMin ? "rgba(255,255,255,0.1)" : B.navyLight}`,
                        cursor: cumpleMin ? "pointer" : "default", opacity: cumpleMin ? 1 : 0.35,
                      }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: selected ? B.sky : B.white, marginBottom: 4 }}>{c.tipo_pasadia}</div>
                      {showPublico && <div style={{ fontSize: 20, fontWeight: 700, color: B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(c.tarifa_publica)}</div>}
                      {showNeto && <div style={{ fontSize: showPublico ? 13 : 20, fontWeight: showPublico ? 400 : 700, color: showPublico ? B.sand : B.sky, fontFamily: showPublico ? "inherit" : "'Barlow Condensed', sans-serif" }}>{showPublico ? `Neto: ${COP(c.tarifa_neta)}` : COP(c.tarifa_neta)}</div>}
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Min. {minPax} pax</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {form.fecha && cierres.some(c => c.tipo === "total") && (
            <div style={{ padding: "16px 20px", borderRadius: 10, background: B.danger + "22", color: B.danger, textAlign: "center", fontSize: 14, marginBottom: 16 }}>
              Dia cerrado — {cierres[0]?.motivo || "No hay servicio este dia"}
            </div>
          )}

          {/* Row 3: Horarios (after tipo selected) */}
          {form.tipo && !esSinEmb && salidasParaMostrar.length > 0 && (
            <div>
              <label style={{ ...LS, marginBottom: 12 }}>Selecciona Horario</label>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(salidasParaMostrar.length, 4)}, 1fr)`, gap: 12 }}>
                {salidasParaMostrar.map(s => {
                  const paxVendidos = disponibilidad[s.id] || 0;
                  const cap = s.capacidad_total || 0;
                  const disponible = cap - paxVendidos;
                  const lleno = disponible < tPax;
                  const requiereVerif = lleno && tPax >= 10;
                  const selectable = !lleno || requiereVerif;
                  const selected = form.salida_id === s.id;
                  return (
                    <div key={s.id} onClick={() => selectable && setForm(f => ({ ...f, salida_id: s.id }))}
                      style={{
                        background: selected ? B.sky + "15" : B.navy, borderRadius: 10, padding: 16, textAlign: "center",
                        border: `2px solid ${selected ? B.sky : !selectable ? B.danger + "33" : requiereVerif ? B.warning + "66" : B.navyLight}`,
                        cursor: selectable ? "pointer" : "default", opacity: !selectable ? 0.4 : 1,
                      }}>
                      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: selected ? B.sky : B.white }}>{s.hora}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{s.nombre}</div>
                      {!lleno && <div style={{ fontSize: 13, fontWeight: 600, color: B.success, marginTop: 4 }}>Disponible</div>}
                      {lleno && !requiereVerif && <div style={{ fontSize: 13, fontWeight: 600, color: B.danger, marginTop: 4 }}>No disponible</div>}
                      {requiereVerif && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: B.warning }}>Sujeto a verificacion</div>
                          <div style={{ fontSize: 10, color: B.warning, opacity: 0.7, marginTop: 2 }}>Requiere confirmar con el Club</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* After Island: no necesita horario */}
          {form.tipo && esSinEmb && (
            <div style={{ background: B.navy, borderRadius: 10, padding: 16, textAlign: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 14, color: B.sand, marginBottom: 4 }}>After Island — Sin horario de salida</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Los huespedes llegan en su propia embarcacion</div>
            </div>
          )}

          {form.tipo && salidasParaMostrar.length === 0 && !esSinEmb && !cierres.some(c => c.tipo === "total") && (
            <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay salidas disponibles para esta fecha</div>
          )}

          {(form.salida_id || (form.tipo && esSinEmb)) && (
            <button onClick={() => { setStep(2); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ width: "100%", padding: "14px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 20 }}>
              Continuar
            </button>
          )}
        </div>
        );
      })()}

      {/* STEP 2: Detalles de la reserva */}
      {step === 2 && (
        <div>
          {/* Selected date/time summary */}
          <div style={{ background: B.navy, borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{new Date(form.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Salida: {salidas.find(s => s.id === form.salida_id)?.hora} — {salidas.find(s => s.id === form.salida_id)?.nombre} | {form.pax_a || 1} adultos{(form.pax_n || 0) > 0 ? ` + ${form.pax_n} ninos` : ""}</div>
            </div>
            <button onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ background: B.navyLight, border: "none", borderRadius: 6, padding: "6px 14px", color: B.sand, fontSize: 12, cursor: "pointer" }}>Cambiar</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 0 : "0 16px" }}>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Pasadia</label>
              <div style={{ padding: "10px 14px", background: B.navy, borderRadius: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: B.white }}>{form.tipo}</span>
                {showPublico && <span style={{ fontSize: 14, fontWeight: 700, color: B.white, marginLeft: 10 }}>{COP(precioPublico)}</span>}
                {showNeto && <span style={{ fontSize: 12, color: B.sand, marginLeft: 8 }}>{showPublico ? `Neto: ${COP(precioNeto)}` : COP(precioNeto)}</span>}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Personas</label>
              <div style={{ fontSize: 14, padding: "10px 14px", background: B.navy, borderRadius: 8, color: B.white }}>{form.pax_a || 1} adultos{(form.pax_n || 0) > 0 ? ` + ${form.pax_n} ninos` : ""} = <strong>{(form.pax_a || 1) + (form.pax_n || 0)} total</strong></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Nombre del Huesped</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre completo" style={IS} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Contacto / Telefono</label>
              <input value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} placeholder="+57..." style={IS} />
            </div>
            <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
              <label style={LS}>Notas</label>
              <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." style={IS} />
            </div>
          </div>

          {form.tipo && (
            <div style={{ background: B.navy, borderRadius: 8, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13 }}>
                {showPublico && <div style={{ fontSize: 13 }}>{totalPax} pax × {COP(precioPublico)} = <strong>{COP(precioPublico * totalPax)}</strong></div>}
                {showNeto && <div style={{ fontSize: 12, color: B.sand, marginTop: showPublico ? 4 : 0 }}>Neto: {totalPax} × {COP(precioNeto)} = {COP(total)}</div>}
              </div>
              <span style={{ fontSize: 20, fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>Total: {COP(showNeto ? total : precioPublico * totalPax)}</span>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }} style={{ flex: 1, padding: "14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }}>Atras</button>
            <button onClick={() => setShowPagoModal(true)} disabled={saving || !form.tipo || !form.nombre.trim()}
              style={{ flex: 2, padding: "14px", borderRadius: 8, border: "none", background: saving || !form.tipo || !form.nombre.trim() ? B.navyLight : B.sky, color: saving || !form.tipo || !form.nombre.trim() ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 14, fontWeight: 700, cursor: saving || !form.tipo || !form.nombre.trim() ? "default" : "pointer" }}>
              {saving ? "Creando..." : "Confirmar Reserva"}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL MÉTODO DE PAGO ── */}
      {showPagoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={e => e.target === e.currentTarget && setShowPagoModal(false)}>
          <div style={{ background: B.navyMid, borderRadius: 20, padding: 32, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, textAlign: "center", marginBottom: 6 }}>¿Cómo se realiza el pago?</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", marginBottom: !WOMPI_INTEGRITY_KEY ? 12 : 28 }}>
              {form.nombre} · {totalPax} pax · {form.tipo}
            </p>
            {!WOMPI_INTEGRITY_KEY && (
              <div style={{ background: B.warning + "22", border: `1px solid ${B.warning + "44"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: B.warning, textAlign: "center" }}>
                ⚠️ Falta la <strong>Llave de Integridad</strong> de Wompi — los pagos funcionan pero sin firma de seguridad
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
              {/* WOMPI */}
              <div onClick={() => handleSave("wompi")} style={{ background: B.navy, borderRadius: 14, padding: "20px 14px", textAlign: "center", cursor: "pointer", border: `2px solid ${B.navyLight}` }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#5B4CF5"}
                onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 20, fontWeight: 900, color: "#fff", fontFamily: "sans-serif" }}>W</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>Wompi</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Abre checkout ahora</div>
                <div style={{ fontSize: 12, color: B.sand }}>Cobrar neto</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(precioNeto * totalPax)}</div>
              </div>

              {/* TRANSFERENCIA */}
              <div onClick={() => { setShowPagoModal(false); setShowTransferModal(true); }}
                style={{ background: B.navy, borderRadius: 14, padding: "20px 14px", textAlign: "center", cursor: "pointer", border: `2px solid ${B.navyLight}` }}
                onMouseEnter={e => e.currentTarget.style.borderColor = B.sky}
                onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🏦</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>Transferencia</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>PSE / Bancolombia</div>
                <div style={{ fontSize: 12, color: B.sand }}>Cobrar neto</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(precioNeto * totalPax)}</div>
              </div>

              {/* CLIENTE PAGA */}
              <div onClick={() => handleSave("cliente_paga")} style={{ background: B.navy, borderRadius: 14, padding: "20px 14px", textAlign: "center", cursor: "pointer", border: `2px solid ${B.navyLight}` }}
                onMouseEnter={e => e.currentTarget.style.borderColor = B.success}
                onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📲</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>Cliente Paga</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Link al cliente</div>
                <div style={{ fontSize: 12, color: B.success }}>Precio público</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(precioPublico * totalPax)}</div>
              </div>
            </div>

            {/* PREMIOS DISPONIBLES */}
            {premiosDisponibles.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>🎁 Premios disponibles</div>
                {premiosDisponibles.map(({ incentivo, saldo }) => (
                  <div key={incentivo.id}
                    onClick={() => handleSave("incentivo_premio", { incentivo_id: incentivo.id })}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: B.navy, borderRadius: 12, border: `2px solid ${B.sand}44`, cursor: "pointer", marginBottom: 8 }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = B.sand}
                    onMouseLeave={e => e.currentTarget.style.borderColor = B.sand + "44"}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: B.sand + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎁</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: B.sand }}>{incentivo.nombre}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{incentivo.acum_beneficio_desc || "Pasadía gratis"} · <strong style={{ color: B.success }}>{saldo} disponible{saldo !== 1 ? "s" : ""}</strong></div>
                    </div>
                    <div style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, background: B.success + "22", color: B.success, fontWeight: 700, whiteSpace: "nowrap" }}>Usar gratis</div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setShowPagoModal(false)} style={{ width: "100%", padding: "12px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── MODAL TRANSFERENCIA ── */}
      {showTransferModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={e => e.target === e.currentTarget && setShowTransferModal(false)}>
          <div style={{ background: B.navyMid, borderRadius: 20, padding: 32, width: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, marginBottom: 4 }}>🏦 Transferencia Bancaria</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{form.nombre} · {COP(precioNeto * totalPax)}</p>

            {/* Datos bancarios */}
            <div style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", marginBottom: 24, fontSize: 13, lineHeight: 2.3 }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Datos para la transferencia</div>
              {cuentaBancaria ? (<>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>Banco</span><span style={{ fontWeight: 600 }}>{cuentaBancaria.banco}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>Tipo</span><span>{cuentaBancaria.tipo}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>Número</span><span style={{ fontWeight: 700, color: B.sky }}>{cuentaBancaria.numero}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>Titular</span><span>{cuentaBancaria.titular}</span></div>
                {cuentaBancaria.nit && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>NIT</span><span>{cuentaBancaria.nit}</span></div>}
              </>) : (
                <div style={{ color: B.warning, fontSize: 12 }}>⚠️ Configura una cuenta bancaria en Configuración → Cuentas Bancarias</div>
              )}
              <div style={{ borderTop: `1px solid ${B.navyLight}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Monto exacto</span>
                <span style={{ fontWeight: 700, color: B.sand, fontSize: 16 }}>{COP(precioNeto * totalPax)}</span>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 16, textAlign: "center" }}>¿Ya tienen el comprobante o necesitan tiempo para transferir?</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Opción 1: Subir comprobante ahora */}
              <label style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: B.navy, borderRadius: 12, border: `2px solid ${B.navyLight}`, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = B.success}
                onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: B.success + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📎</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: B.success }}>Subir comprobante ahora</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sube la foto/PDF del comprobante y confirma la reserva</div>
                </div>
                <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                  onChange={e => e.target.files[0] && handleComprobanteUpload(e.target.files[0])} />
                {uploadingComp && <span style={{ fontSize: 12, color: B.success }}>Subiendo...</span>}
              </label>

              {/* Opción 2: Hold 60 minutos */}
              <div onClick={() => handleSave("transferencia_hold")} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: B.navy, borderRadius: 12, border: `2px solid ${B.navyLight}`, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = B.warning}
                onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: B.warning + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>⏱️</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: B.warning }}>Reservar 60 minutos</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Hold del cupo · La reserva se cancela si no llega el pago</div>
                </div>
              </div>
            </div>

            <button onClick={() => { setShowTransferModal(false); setShowPagoModal(true); }}
              style={{ width: "100%", marginTop: 16, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>← Volver</button>
          </div>
        </div>
      )}

      {/* ── MODAL PAGO ABIERTO (Wompi o Cliente Paga) ── */}
      {pagoAbierto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
          <div style={{ background: B.navyMid, borderRadius: 20, padding: 32, width: "100%", maxWidth: 460, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>

            {pagoAbierto.tipo === "wompi" ? (
              <>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26, fontWeight: 900, color: "#fff" }}>W</div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, marginBottom: 6 }}>Checkout Wompi abierto</h3>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 1.6 }}>
                  Se abrió una nueva pestaña con el checkout de Wompi por <strong style={{ color: B.white }}>{COP(pagoAbierto.total)}</strong>.<br />Completa el pago allá y vuelve aquí.
                </p>
                <button onClick={() => window.open(pagoAbierto.url, "_blank")}
                  style={{ width: "100%", padding: "13px", background: "#5B4CF5", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>
                  🔁 Volver a abrir Wompi
                </button>
              </>
            ) : (
              <>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: B.sky, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 24 }}>🔗</div>
                <h3 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, marginBottom: 6 }}>Link de pago generado</h3>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.6 }}>
                  Envía este link al cliente — tiene <strong style={{ color: B.warning }}>15 minutos</strong> para pagar<br/>{COP(pagoAbierto.total)}
                </p>
                <div style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 12, color: B.sky, wordBreak: "break-all", textAlign: "left" }}>{pagoAbierto.url}</div>
                  <button onClick={() => navigator.clipboard.writeText(pagoAbierto.url)}
                    style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Copiar</button>
                </div>
                <a href={`https://wa.me/?text=${encodeURIComponent(`Hola! Aquí está tu link de pago para el pasadía en Atolon Beach Club 🌊\n\n${pagoAbierto.url}`)}`}
                  target="_blank" rel="noreferrer"
                  style={{ display: "block", width: "100%", padding: "12px", background: "#25D366", color: "#fff", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none", marginBottom: 10 }}>
                  📱 Compartir por WhatsApp
                </a>
              </>
            )}

            {/* Botón volver al carrito */}
            <button onClick={() => { setPagoAbierto(null); setLinkPago(""); setShowPagoModal(true); }}
              style={{ width: "100%", padding: "12px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 10, color: B.sand, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>
              ← Usar otro método de pago
            </button>
            <button onClick={() => { setPagoAbierto(null); setLinkPago(""); setForm({ tipo: "", fecha: "", salida_id: "", nombre: "", contacto: "", pax: 1, pax_a: 1, pax_n: 0, notas: "" }); setStep(1); }}
              style={{ width: "100%", padding: "10px", background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer" }}>
              ✓ Pago completado — Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// GESTIONAR VENDEDORES
// ═══════════════════════════════════════════════
function GestionVendedores({ agencia }) {
  const [vendedores, setVendedores] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", email: "", rol: "vendedor" });
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("b2b_usuarios").select("*").eq("aliado_id", agencia.id).order("nombre");
    setVendedores(data || []);
  }, [agencia.id]);

  useEffect(() => { fetch(); }, [fetch]);

  const addVendedor = async () => {
    if (!supabase || !form.nombre.trim() || !form.email.trim() || saving) return;
    setSaving(true);
    await supabase.from("b2b_usuarios").insert({ id: `USR-${Date.now()}`, aliado_id: agencia.id, nombre: form.nombre, email: form.email.toLowerCase().trim(), rol: form.rol, activo: true });
    fetch(); setShowForm(false); setForm({ nombre: "", email: "", rol: "vendedor" }); setSaving(false);
  };

  const toggleActivo = async (id, activo) => {
    if (!supabase) return;
    await supabase.from("b2b_usuarios").update({ activo: !activo }).eq("id", id);
    fetch();
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, color: B.sand }}>Vendedores ({vendedores.length})</h3>
        <button onClick={() => setShowForm(true)} style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Agregar Vendedor</button>
      </div>
      {vendedores.length === 0 && <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay vendedores registrados</div>}
      {vendedores.map(v => (
        <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${B.navyLight}`, opacity: v.activo ? 1 : 0.4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
            {v.nombre.split(" ").map(w => w[0]).join("").slice(0, 2)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{v.nombre}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{v.email}</div>
          </div>
          <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 12, background: v.rol === "admin" ? B.sand + "22" : B.sky + "22", color: v.rol === "admin" ? B.sand : B.sky }}>{v.rol}</span>
          <button onClick={() => toggleActivo(v.id, v.activo)} style={{ background: v.activo ? B.danger + "22" : B.success + "22", color: v.activo ? B.danger : B.success, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>{v.activo ? "Desactivar" : "Activar"}</button>
        </div>
      ))}

      {showForm && (
        <div style={{ marginTop: 16, padding: 16, background: B.navy, borderRadius: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label style={LS}>Nombre</label><input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre completo" style={IS} /></div>
            <div><label style={LS}>Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@agencia.com" style={IS} /></div>
            <div><label style={LS}>Rol</label><select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))} style={IS}><option value="vendedor">Vendedor</option><option value="admin">Admin</option></select></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={addVendedor} disabled={saving} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: saving ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 12, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? "Guardando..." : "Guardar"}</button>
            <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 12, cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// HISTORIAL DE RESERVAS
// ═══════════════════════════════════════════════
function HistorialReservas({ agencia, vendedorId }) {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null); // reserva id being uploaded
  const [expandedId, setExpandedId] = useState(null);

  const fetchR = useCallback(async () => {
    if (!supabase) return;
    let q = supabase.from("reservas").select("*").eq("aliado_id", agencia.id).order("fecha", { ascending: false }).limit(50);
    if (vendedorId) q = q.eq("vendedor_b2b_id", vendedorId);
    const { data } = await q;
    setReservas(data || []);
    setLoading(false);
  }, [agencia.id, vendedorId]);

  useEffect(() => { fetchR(); }, [fetchR]);

  const STATUS_CFG = {
    confirmado:             { color: B.success,   label: "Confirmado" },
    pendiente:              { color: B.warning,   label: "Pendiente" },
    cancelado:              { color: B.danger,    label: "Cancelado" },
    pendiente_pago:         { color: B.sky,       label: "Pend. Pago" },
    pendiente_comprobante:  { color: B.warning,   label: "Pend. Comprobante" },
    pagado:                 { color: B.success,   label: "Pagado" },
  };

  const handleComprobanteUpload = async (reserva, file) => {
    if (!file || !supabase) return;
    setUploading(reserva.id);
    const ext = file.name.split(".").pop();
    const path = `comp-${reserva.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("comprobantes").upload(path, file, { upsert: true });
    if (upErr) { alert("Error subiendo el comprobante"); setUploading(null); return; }
    const { data: urlData } = supabase.storage.from("comprobantes").getPublicUrl(path);
    await supabase.from("reservas").update({
      comprobante_url: urlData.publicUrl,
      estado: "confirmado",
      abono: reserva.total,
      saldo: 0,
    }).eq("id", reserva.id);
    setUploading(null);
    fetchR();
  };

  // Calcular tiempo restante para reservas en hold
  const getTimeLeft = (expiresAt) => {
    if (!expiresAt) return null;
    const secs = Math.floor((new Date(expiresAt) - Date.now()) / 1000);
    if (secs <= 0) return "Expirado";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between" }}>
        <h3 style={{ fontSize: 16, color: B.sand }}>Mis Reservas</h3>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{reservas.length} reservas</span>
      </div>

      {loading && <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>}
      {!loading && reservas.length === 0 && <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay reservas registradas</div>}

      {!loading && reservas.length > 0 && (
        <div>
          {reservas.map(r => {
            const sc = STATUS_CFG[r.estado] || { color: B.navyLight, label: r.estado };
            const isPendComp = r.estado === "pendiente_comprobante";
            const isPendPago = r.estado === "pendiente_pago";
            const isExpanded = expandedId === r.id;
            const timeLeft = (isPendComp || isPendPago) ? getTimeLeft(r.link_expira_at) : null;

            return (
              <div key={r.id} style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                {/* Fila principal */}
                <div onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: isExpanded ? B.navyLight + "66" : "transparent" }}>

                  {/* Estado badge */}
                  <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 10, background: sc.color + "22", color: sc.color, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {sc.label}
                  </span>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {fmtFecha(r.fecha)} · {r.tipo} · {r.pax} pax
                    </div>
                  </div>

                  {/* Total */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: B.sand }}>{COP(r.total)}</div>
                    {r.forma_pago && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{r.forma_pago.replace(/_/g, " ")}</div>}
                  </div>

                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Panel expandido */}
                {isExpanded && (
                  <div style={{ padding: "0 18px 18px", background: B.navy + "88" }}>

                    {/* Alerta tiempo si está en hold */}
                    {timeLeft && (
                      <div style={{ padding: "10px 14px", borderRadius: 8, background: timeLeft === "Expirado" ? B.danger + "22" : B.warning + "22", color: timeLeft === "Expirado" ? B.danger : B.warning, fontSize: 12, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{isPendComp ? "⏱ Tiempo para subir comprobante:" : "⏱ Tiempo para completar pago:"}</span>
                        <strong style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>{timeLeft}</strong>
                      </div>
                    )}

                    {/* Detalles */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", fontSize: 12, lineHeight: 2.2, marginBottom: 14 }}>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Contacto: </span>{r.contacto || "—"}</div>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Pax: </span>{r.pax_a}A + {r.pax_n}N</div>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Salida: </span>{r.salida_id || "—"}</div>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Pago: </span>{r.forma_pago?.replace(/_/g, " ") || "—"}</div>
                      {r.notas && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>Notas: </span>{r.notas}</div>}
                    </div>

                    {/* Si ya tiene comprobante, mostrarlo */}
                    {r.comprobante_url && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: B.sand, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Comprobante</div>
                        <a href={r.comprobante_url} target="_blank" rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", background: B.success + "22", color: B.success, borderRadius: 8, fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
                          📎 Ver comprobante
                        </a>
                      </div>
                    )}

                    {/* BOTÓN SUBIR COMPROBANTE — solo si está pendiente_comprobante */}
                    {isPendComp && timeLeft !== "Expirado" && (
                      <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: B.warning + "15", border: `2px dashed ${B.warning + "66"}`, borderRadius: 10, cursor: "pointer" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: B.warning + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                          {uploading === r.id ? "⏳" : "📎"}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: B.warning }}>
                            {uploading === r.id ? "Subiendo comprobante..." : "Subir comprobante de transferencia"}
                          </div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                            Foto o PDF del recibo · La reserva se confirma automáticamente
                          </div>
                        </div>
                        <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                          disabled={uploading === r.id}
                          onChange={e => e.target.files[0] && handleComprobanteUpload(r, e.target.files[0])} />
                      </label>
                    )}

                    {/* Expirado y sin comprobante */}
                    {isPendComp && timeLeft === "Expirado" && !r.comprobante_url && (
                      <div style={{ padding: "12px 16px", background: B.danger + "22", borderRadius: 8, fontSize: 13, color: B.danger }}>
                        ⏱ Tiempo expirado — Contacta a Atolon Beach Club para reactivar la reserva
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// QR SECTION
// ═══════════════════════════════════════════════
function QRSection({ agencia }) {
  const qrUrl = `${window.location.origin}/booking?ref=${agencia.id}`;
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);

  useEffect(() => {
    QRCode.toCanvas(canvasRef.current, qrUrl, {
      width: 280,
      margin: 2,
      color: { dark: "#0B1A2C", light: "#FFFFFF" },
    }, (err) => {
      if (!err && canvasRef.current) {
        setQrDataUrl(canvasRef.current.toDataURL("image/png"));
      }
    });
  }, [qrUrl]);

  const copy = () => {
    navigator.clipboard.writeText(qrUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const downloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `QR-${agencia.nombre.replace(/\s+/g, "_")}.png`;
    a.click();
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 28 }}>
      <h3 style={{ fontSize: 18, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, marginBottom: 4 }}>Link / QR de Venta</h3>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24, lineHeight: 1.6 }}>
        Comparte este link o QR con tus clientes. Todas las ventas quedan registradas automáticamente a tu agencia.
      </p>

      {/* Link */}
      <div style={{ background: B.navy, borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, fontSize: 13, wordBreak: "break-all", color: B.sky }}>{qrUrl}</div>
        <button onClick={copy}
          style={{ flexShrink: 0, padding: "8px 18px", borderRadius: 8, border: "none", background: copied ? B.success : B.sky, color: copied ? "#fff" : B.navy, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", transition: "background 0.2s" }}>
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
      </div>

      {/* QR Canvas + Descarga */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ padding: 16, background: "#FFFFFF", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
          <canvas ref={canvasRef} style={{ display: "block", borderRadius: 8 }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{agencia.nombre}</div>
          {agencia.codigo_fijo && (
            <div style={{ fontSize: 11, color: B.sand, letterSpacing: "0.1em", fontFamily: "'Barlow Condensed', sans-serif" }}>
              {agencia.codigo_fijo}
            </div>
          )}
        </div>
        <button onClick={downloadQR} disabled={!qrDataUrl}
          style={{ padding: "12px 32px", borderRadius: 10, border: "none", background: qrDataUrl ? B.sand : B.navyLight, color: qrDataUrl ? B.navy : "rgba(255,255,255,0.3)", fontWeight: 700, fontSize: 14, cursor: qrDataUrl ? "pointer" : "default", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>⬇</span> Descargar QR (PNG)
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// INCENTIVOS — vista admin del portal de agencia
// ═══════════════════════════════════════════════
function IncentivosPortal({ agencia }) {
  const [incentivos, setIncentivos] = useState([]);
  const [progreso,   setProgreso]   = useState({});
  const [saldos,     setSaldos]     = useState({}); // { [incentivo_id]: { ganados, usados, saldo } }
  const [loading,    setLoading]    = useState(true);

  // Helper: calcula premios ganados (sin límite de periodo)
  const calcPremiosGanadosLocal = (reservas, inc) => {
    const filtered = (reservas || []).filter(r => {
      if (inc.fecha_inicio && r.fecha < inc.fecha_inicio) return false;
      return true;
    });
    const totalPax = filtered.reduce((s, r) => s + (r.pax || 0), 0);
    const bloques  = Math.floor(totalPax / (inc.acum_cada_pax || 1));
    return bloques * (inc.acum_beneficio_cant || 1);
  };

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      // Incentivos globales (aliado_id IS NULL) + los de esta agencia
      const { data } = await supabase.from("b2b_incentivos")
        .select("*")
        .or(`aliado_id.is.null,aliado_id.eq.${agencia.id}`)
        .eq("activo", true)
        .order("fecha_fin", { ascending: true });
      const inc = data || [];
      setIncentivos(inc);

      // Calcular progreso para cada incentivo con fecha activa
      const prog = {};
      const sald = {};
      for (const i of inc) {
        if (i.tipo === "meta_pax" || i.tipo === "meta_revenue" || i.tipo === "meta_reservas") {
          if (!i.fecha_inicio || !i.fecha_fin) continue;
          const { data: resData } = await supabase.from("reservas")
            .select("pax, total")
            .eq("aliado_id", agencia.id)
            .neq("estado", "cancelado")
            .gte("fecha", i.fecha_inicio)
            .lte("fecha", i.fecha_fin);
          const pax      = (resData || []).reduce((s, r) => s + (r.pax || 0), 0);
          const revenue  = (resData || []).reduce((s, r) => s + (r.total || 0), 0);
          const reservas = (resData || []).length;
          const actual   = i.tipo === "meta_pax" ? pax : i.tipo === "meta_revenue" ? revenue : reservas;
          prog[i.id] = { actual, pct: Math.min(100, Math.round((actual / (i.meta_valor || 1)) * 100)) };
        } else if (i.tipo === "acumulacion") {
          const [{ data: resData }, { data: canjesData }] = await Promise.all([
            supabase.from("reservas").select("pax, fecha").eq("aliado_id", agencia.id).neq("estado", "cancelado"),
            supabase.from("b2b_premios_canjes").select("pasadias_usadas").eq("aliado_id", agencia.id).eq("incentivo_id", i.id),
          ]);
          const ganados = calcPremiosGanadosLocal(resData || [], i);
          const usados  = (canjesData || []).reduce((s, c) => s + (c.pasadias_usadas || 1), 0);
          sald[i.id] = { ganados, usados, saldo: ganados - usados };
        }
      }
      setProgreso(prog);
      setSaldos(sald);
      setLoading(false);
    };
    load();
  }, [agencia.id]);

  const TIPO_ICON  = { meta_pax: "👥", meta_revenue: "💰", meta_reservas: "📋", especial: "⭐" };
  const TIPO_LABEL = { meta_pax: "Meta de pasajeros", meta_revenue: "Meta de ventas", meta_reservas: "Meta de reservas", especial: "Programa especial" };

  const fmtMeta = (tipo, val) => {
    if (tipo === "meta_revenue") return COP(val);
    return `${Number(val).toLocaleString()}`;
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando incentivos...</div>;

  if (incentivos.length === 0) return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Sin programas de incentivos activos</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Cuando Atolon cree un programa para tu agencia aparecerá aquí.</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div>
          <h3 style={{ fontSize: 18, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, marginBottom: 2 }}>Programas de Incentivos</h3>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{incentivos.length} programa{incentivos.length !== 1 ? "s" : ""} activo{incentivos.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {incentivos.map(inc => {
        const p = progreso[inc.id];
        const pct = p?.pct ?? null;
        const cumplido = pct !== null && pct >= 100;
        const saldoInfo = saldos[inc.id];
        const hoy = new Date().toISOString().slice(0, 10);
        const diasRestantes = inc.fecha_fin
          ? Math.max(0, Math.ceil((new Date(inc.fecha_fin) - new Date(hoy)) / 86400000))
          : null;

        return (
          <div key={inc.id} style={{
            background: B.navyMid, borderRadius: 14, padding: 24,
            border: `1px solid ${cumplido ? B.success + "44" : B.navyLight}`,
            boxShadow: cumplido ? `0 0 20px ${B.success}15` : "none",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: pct !== null ? 16 : 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: cumplido ? B.success + "22" : B.sand + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                {cumplido ? "🏆" : TIPO_ICON[inc.tipo]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{inc.nombre}</span>
                  {cumplido && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 10, background: B.success + "22", color: B.success, fontWeight: 700 }}>✓ Meta cumplida</span>}
                  {!cumplido && inc.aliado_id === null && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.sky + "22", color: B.sky }}>Todas las agencias</span>}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{TIPO_LABEL[inc.tipo]}</div>
                {inc.descripcion && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 6, lineHeight: 1.5 }}>{inc.descripcion}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {diasRestantes !== null && !cumplido && (
                  <div style={{ fontSize: 12, color: diasRestantes <= 7 ? B.warning : "rgba(255,255,255,0.4)" }}>
                    {diasRestantes === 0 ? "⚠ Vence hoy" : `${diasRestantes} días restantes`}
                  </div>
                )}
                {inc.fecha_inicio && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{inc.fecha_inicio} → {inc.fecha_fin}</div>}
              </div>
            </div>

            {/* Barra de progreso */}
            {pct !== null && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Progreso</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cumplido ? B.success : B.sky }}>
                    {fmtMeta(inc.tipo, p.actual)} / {fmtMeta(inc.tipo, inc.meta_valor)}
                  </span>
                </div>
                <div style={{ height: 10, background: B.navy, borderRadius: 5, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 5, transition: "width 0.6s ease",
                    width: `${pct}%`,
                    background: cumplido
                      ? `linear-gradient(90deg, ${B.success}, ${B.sky})`
                      : pct > 70
                        ? `linear-gradient(90deg, ${B.sky}, ${B.sand})`
                        : B.sky,
                  }} />
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, textAlign: "right" }}>{pct}%</div>
              </div>
            )}

            {/* Beneficio — para tipo meta (no acumulacion) */}
            {inc.tipo !== "acumulacion" && inc.beneficio && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: B.sand + "11", borderRadius: 8, border: `1px solid ${B.sand}22`, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🎁</span>
                <div>
                  <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Premio al cumplir</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{inc.beneficio}</div>
                </div>
              </div>
            )}
            {/* Para acumulacion: mostrar qué se gana por periodo */}
            {inc.tipo === "acumulacion" && inc.acum_beneficio_desc && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: B.sand + "11", borderRadius: 8, border: `1px solid ${B.sand}22`, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🎁</span>
                <div>
                  <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Premio al cumplir</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {inc.acum_beneficio_cant > 1 ? `${inc.acum_beneficio_cant}× ` : ""}{inc.acum_beneficio_desc}
                  </div>
                </div>
              </div>
            )}

            {/* Acumulación: progreso y saldo de premios */}
            {inc.tipo === "acumulacion" && (
              <div style={{ marginTop: 14 }}>
                <div style={{ padding: "14px 16px", background: B.navy, borderRadius: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>
                    Por cada <strong style={{ color: B.white }}>{inc.acum_cada_pax} pax</strong> acumulados recibes <strong style={{ color: B.sand }}>{inc.acum_beneficio_cant} pasadía{inc.acum_beneficio_cant !== 1 ? "s" : ""} gratis</strong>
                    {inc.acum_beneficio_desc ? ` — ${inc.acum_beneficio_desc}` : ""}
                  </div>
                  {saldoInfo && (
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: B.navyMid, borderRadius: 8 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{saldoInfo.ganados}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ganados</div>
                      </div>
                      <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: B.navyMid, borderRadius: 8 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.4)", fontFamily: "'Barlow Condensed', sans-serif" }}>{saldoInfo.usados}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Usados</div>
                      </div>
                      <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: saldoInfo.saldo > 0 ? B.success + "22" : B.navyMid, borderRadius: 8, border: saldoInfo.saldo > 0 ? `1px solid ${B.success}44` : "none" }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: saldoInfo.saldo > 0 ? B.success : "rgba(255,255,255,0.3)", fontFamily: "'Barlow Condensed', sans-serif" }}>{saldoInfo.saldo}</div>
                        <div style={{ fontSize: 10, color: saldoInfo.saldo > 0 ? B.success : "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Disponibles</div>
                      </div>
                    </div>
                  )}
                </div>
                {saldoInfo?.saldo > 0 && (
                  <div style={{ padding: "10px 14px", background: B.success + "15", border: `1px solid ${B.success}33`, borderRadius: 8, fontSize: 12, color: B.success, textAlign: "center" }}>
                    🎁 Tienes <strong>{saldoInfo.saldo} pasadía{saldoInfo.saldo !== 1 ? "s" : ""} gratis</strong> disponible{saldoInfo.saldo !== 1 ? "s" : ""} — úsalas al crear una reserva
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════
// PREFERENCIAS DE LA AGENCIA (admin only)
// ═══════════════════════════════════════════════
const PRECIO_OPTS = [
  { val: "ambos",        label: "Tarifa pública y neta",  desc: "Muestra ambos precios",            icon: "👁" },
  { val: "solo_publico", label: "Solo tarifa pública",    desc: "Oculta el precio neto",             icon: "🏷" },
  { val: "solo_neto",    label: "Solo tarifa neta",       desc: "Oculta la tarifa pública",          icon: "🔒" },
];

// ═══════════════════════════════════════════════
// DOCUMENTOS AGENCIA — RNT + Cuenta bancaria
// ═══════════════════════════════════════════════
function DocumentosAgencia({ agencia, onRefresh }) {
  const [uploadingRnt,  setUploadingRnt]  = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [certNota,      setCertNota]      = useState("");
  const [savedCert,     setSavedCert]     = useState(false);
  const [rntOk,         setRntOk]         = useState(false);

  const uploadRnt = async (file) => {
    if (!supabase || !file) return;
    setUploadingRnt(true);
    const ext  = file.name.split(".").pop();
    const path = `${agencia.id}/rnt-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true });
    if (upErr) { setUploadingRnt(false); return; }
    const { data: urlData } = supabase.storage.from("b2b-docs").getPublicUrl(path);
    // Guardar RNT anterior en historial antes de reemplazar
    if (agencia.rnt_url) {
      await supabase.from("b2b_rnt_historial").insert({
        id: `RNT-${Date.now()}`,
        aliado_id: agencia.id,
        rnt_url: agencia.rnt_url,
        subido_por: "portal",
      });
    }
    await supabase.from("aliados_b2b").update({
      rnt_url:         urlData.publicUrl,
      rnt_pendiente_url: null,
    }).eq("id", agencia.id);
    setUploadingRnt(false);
    setRntOk(true);
    setTimeout(() => setRntOk(false), 3000);
    onRefresh?.({ rnt_url: urlData.publicUrl, rnt_pendiente_url: null });
  };

  const uploadCert = async (file) => {
    if (!supabase || !file) return;
    setUploadingCert(true);
    const ext  = file.name.split(".").pop();
    const path = `${agencia.id}/cert-bancaria-solicitud-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("b2b-docs").upload(path, file, { upsert: true });
    if (upErr) { setUploadingCert(false); return; }
    const { data: urlData } = supabase.storage.from("b2b-docs").getPublicUrl(path);
    await supabase.from("aliados_b2b").update({
      cert_bancaria_pendiente_url:  urlData.publicUrl,
      cert_bancaria_solicitud_fecha: new Date().toISOString(),
      cert_bancaria_solicitud_nota:  certNota.trim() || null,
    }).eq("id", agencia.id);
    setUploadingCert(false);
    setSavedCert(true);
    setTimeout(() => setSavedCert(false), 4000);
    onRefresh?.({ cert_bancaria_pendiente_url: urlData.publicUrl });
  };

  const hasPendingCert = !!agencia.cert_bancaria_pendiente_url;
  const solicitudFecha = agencia.cert_bancaria_solicitud_fecha
    ? new Date(agencia.cert_bancaria_solicitud_fecha).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  const IS_d = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>

      {/* RNT */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 22, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 20 }}>📄</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>RNT — Registro Nacional de Turismo</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Sube el RNT actualizado cuando lo renueves</div>
          </div>
          {agencia.rnt_url && (
            <a href={agencia.rnt_url} target="_blank" rel="noopener noreferrer"
              style={{ marginLeft: "auto", fontSize: 12, color: B.sky, textDecoration: "none", padding: "4px 12px", borderRadius: 6, background: B.sky + "22", border: `1px solid ${B.sky}33` }}>
              Ver actual →
            </a>
          )}
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderRadius: 9, border: `2px dashed ${rntOk ? B.success : B.navyLight}`, background: rntOk ? B.success + "15" : B.navy, cursor: "pointer", transition: "all 0.2s", textAlign: "center", justifyContent: "center" }}>
            {uploadingRnt
              ? <span style={{ fontSize: 13, color: B.sand }}>⏳ Subiendo...</span>
              : rntOk
                ? <span style={{ fontSize: 13, color: B.success, fontWeight: 700 }}>✓ RNT actualizado correctamente</span>
                : <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>⬆ Subir RNT actualizado (PDF o imagen)</span>
            }
          </div>
          <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
            onChange={e => e.target.files[0] && uploadRnt(e.target.files[0])} />
        </label>
      </div>

      {/* Cambio de cuenta bancaria */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 22, border: `1px solid ${hasPendingCert ? B.warning + "44" : B.navyLight}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 20 }}>🏦</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Solicitud de cambio de cuenta bancaria</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Sube el certificado bancario de la nueva cuenta</div>
          </div>
          {agencia.cert_bancaria_url && (
            <a href={agencia.cert_bancaria_url} target="_blank" rel="noopener noreferrer"
              style={{ marginLeft: "auto", fontSize: 12, color: B.sky, textDecoration: "none", padding: "4px 12px", borderRadius: 6, background: B.sky + "22", border: `1px solid ${B.sky}33` }}>
              Ver cuenta actual →
            </a>
          )}
        </div>

        {/* Estado pendiente */}
        {hasPendingCert && (
          <div style={{ background: B.warning + "15", border: `1px solid ${B.warning}33`, borderRadius: 10, padding: "12px 16px", marginTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.warning, marginBottom: 4 }}>⏳ Solicitud en proceso</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Certificado enviado el {solicitudFecha}. Estamos procesando el cambio.</div>
            <a href={agencia.cert_bancaria_pendiente_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: B.sky, display: "inline-block", marginTop: 6 }}>Ver certificado enviado →</a>
          </div>
        )}

        {/* Aviso 7 días */}
        <div style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", marginTop: 12, marginBottom: 14, border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
            ℹ️ El cambio de cuenta puede tardar <strong style={{ color: B.sand }}>hasta 7 días hábiles</strong> en hacerse efectivo.
            Si necesitas un cambio inmediato, contacta directamente a tu <strong style={{ color: B.sky }}>agente comercial asignado</strong>.
          </div>
        </div>

        {!hasPendingCert && (
          <>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Nota (opcional)</label>
              <input value={certNota} onChange={e => setCertNota(e.target.value)}
                placeholder="Ej: Cambio de banco, nueva cuenta nómina..."
                style={IS_d} />
            </div>
            <label style={{ display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderRadius: 9, border: `2px dashed ${savedCert ? B.success : B.navyLight}`, background: savedCert ? B.success + "15" : B.navy, cursor: "pointer", transition: "all 0.2s", textAlign: "center", justifyContent: "center" }}>
                {uploadingCert
                  ? <span style={{ fontSize: 13, color: B.sand }}>⏳ Subiendo...</span>
                  : savedCert
                    ? <span style={{ fontSize: 13, color: B.success, fontWeight: 700 }}>✓ Solicitud enviada — te avisaremos cuando se active</span>
                    : <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>⬆ Subir certificado bancario (PDF o imagen)</span>
                }
              </div>
              <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
                onChange={e => e.target.files[0] && uploadCert(e.target.files[0])} />
            </label>
          </>
        )}

        {hasPendingCert && (
          <label style={{ display: "block", marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 18px", borderRadius: 9, border: `2px dashed ${B.navyLight}`, background: B.navy, cursor: "pointer" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Reemplazar certificado enviado</span>
            </div>
            <input type="file" accept="image/*,.pdf" style={{ display: "none" }}
              onChange={e => e.target.files[0] && uploadCert(e.target.files[0])} />
          </label>
        )}
      </div>
    </div>
  );
}

function PreferenciasAgencia({ agencia, onSaved }) {
  const [subTab, setSubTab] = useState("datos");

  // ── Datos de la agencia ──────────────────────────────
  const [datos, setDatos] = useState({
    nombre:   agencia.nombre   || "",
    contacto: agencia.contacto || "",
    tel:      agencia.tel      || "",
    email:    agencia.email    || "",
    codigo:   agencia.codigo   || "",
  });
  const [savingDatos, setSavingDatos] = useState(false);
  const [savedDatos,  setSavedDatos]  = useState(false);
  const [copiado,     setCopiado]     = useState("");
  const [errCodigo,   setErrCodigo]   = useState("");

  const generarCodigo = () => {
    const base = (datos.nombre || agencia.nombre)
      .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const rand = Math.floor(100 + Math.random() * 900);
    setDatos(d => ({ ...d, codigo: `${base}${rand}` }));
    setErrCodigo("");
  };

  const saveDatos = async () => {
    if (!supabase || savingDatos) return;
    setErrCodigo("");
    setSavingDatos(true);
    const updates = {
      nombre:   datos.nombre.trim()   || agencia.nombre,
      contacto: datos.contacto.trim() || null,
      tel:      datos.tel.trim()      || null,
      email:    datos.email.trim()    || null,
      codigo:   datos.codigo.trim().toUpperCase() || null,
    };
    const { error } = await supabase.from("aliados_b2b").update(updates).eq("id", agencia.id);
    if (error?.message?.includes("unique") || error?.message?.includes("duplicate")) {
      setErrCodigo("Ese código ya está en uso. Elige otro.");
      setSavingDatos(false);
      return;
    }
    setSavingDatos(false);
    setSavedDatos(true);
    setTimeout(() => setSavedDatos(false), 3000);
    onSaved?.(updates);
  };

  // ── Vista de precios ─────────────────────────────────
  const [adminVista,    setAdminVista]    = useState(agencia.precio_vista_admin    || "ambos");
  const [vendedorVista, setVendedorVista] = useState(agencia.precio_vista_vendedor || "ambos");
  const [savingPrecios, setSavingPrecios] = useState(false);
  const [savedPrecios,  setSavedPrecios]  = useState(false);

  const savePrecios = async () => {
    if (!supabase || savingPrecios) return;
    setSavingPrecios(true);
    await supabase.from("aliados_b2b").update({
      precio_vista_admin:    adminVista,
      precio_vista_vendedor: vendedorVista,
    }).eq("id", agencia.id);
    setSavingPrecios(false);
    setSavedPrecios(true);
    setTimeout(() => setSavedPrecios(false), 3000);
    onSaved?.({ precio_vista_admin: adminVista, precio_vista_vendedor: vendedorVista });
  };

  const IS_pref = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const LS_pref = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

  const PickerRow = ({ label, role, value, onChange }) => (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 24, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: role === "admin" ? B.sand + "22" : B.sky + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          {role === "admin" ? "🛡" : "👤"}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>¿Qué precios ve este perfil al crear una reserva?</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {PRECIO_OPTS.map(opt => {
          const sel = value === opt.val;
          return (
            <div key={opt.val} onClick={() => onChange(opt.val)}
              style={{ borderRadius: 10, padding: "16px 14px", cursor: "pointer", border: `2px solid ${sel ? (role === "admin" ? B.sand : B.sky) : B.navyLight}`, background: sel ? (role === "admin" ? B.sand + "15" : B.sky + "15") : B.navy, transition: "all 0.15s" }}>
              <div style={{ fontSize: 22, marginBottom: 6, textAlign: "center" }}>{opt.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: sel ? (role === "admin" ? B.sand : B.sky) : B.white, textAlign: "center", marginBottom: 4 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>{opt.desc}</div>
              {sel && <div style={{ textAlign: "center", marginTop: 8 }}>
                <span style={{ fontSize: 10, padding: "2px 10px", borderRadius: 10, background: role === "admin" ? B.sand + "33" : B.sky + "33", color: role === "admin" ? B.sand : B.sky, fontWeight: 700 }}>Seleccionado ✓</span>
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 18, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, marginBottom: 2 }}>Preferencias</h3>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Administra los datos y configuración de tu agencia</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, background: B.navyMid, borderRadius: 10, padding: 4 }}>
        {[["datos", "📋 Datos"], ["precios", "💲 Precios"], ["vendedores", "👥 Vendedores"]].map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)}
            style={{ flex: 1, padding: "10px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: subTab === k ? 700 : 500, background: subTab === k ? B.sky : "transparent", color: subTab === k ? B.navy : "rgba(255,255,255,0.5)", transition: "all 0.15s" }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── DATOS ── */}
      {subTab === "datos" && (
        <div>
          {/* Códigos de agencia */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>

            {/* Código fijo — solo lectura */}
            <div style={{ background: B.navyMid, borderRadius: 14, padding: 22, border: `1px solid ${B.sand}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: B.sand }}>🔒 Código fijo</span>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: B.sand + "22", color: B.sand }}>No cambia nunca</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>
                Identificador permanente asignado por Atolon. Usa este código para referencias internas.
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, padding: "11px 16px", borderRadius: 8, background: B.navy, border: `1px solid ${B.sand}33`, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: B.sand, letterSpacing: "0.12em", textAlign: "center" }}>
                  {agencia.codigo_fijo || "—"}
                </div>
                {agencia.codigo_fijo && (
                  <button onClick={() => { navigator.clipboard.writeText(agencia.codigo_fijo); setCopiado("fijo"); setTimeout(() => setCopiado(""), 2000); }}
                    style={{ padding: "11px 14px", borderRadius: 8, border: "none", background: copiado === "fijo" ? B.success : B.navyLight, color: copiado === "fijo" ? "#fff" : B.sand, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {copiado === "fijo" ? "✓" : "Copiar"}
                  </button>
                )}
              </div>
            </div>

            {/* Código personalizado — editable */}
            <div style={{ background: B.navyMid, borderRadius: 14, padding: 22, border: `1px solid ${B.sky}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: B.sky }}>✏️ Código personalizado</span>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: B.sky + "22", color: B.sky }}>Editable</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 14 }}>
                Alias o código comercial que puedes cambiar cuando quieras.
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={datos.codigo}
                  onChange={e => { setDatos(d => ({ ...d, codigo: e.target.value.toUpperCase().replace(/\s/g, "") })); setErrCodigo(""); }}
                  placeholder="Ej: VIAJ001"
                  maxLength={12}
                  style={{ ...IS_pref, flex: 1, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: "0.1em", textAlign: "center" }}
                />
                <button onClick={generarCodigo}
                  style={{ padding: "11px 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "none", color: B.sand, fontSize: 13, cursor: "pointer" }} title="Generar código">
                  ↻
                </button>
                {datos.codigo && (
                  <button onClick={() => { navigator.clipboard.writeText(datos.codigo); setCopiado("pers"); setTimeout(() => setCopiado(""), 2000); }}
                    style={{ padding: "11px 12px", borderRadius: 8, border: "none", background: copiado === "pers" ? B.success : B.navyLight, color: copiado === "pers" ? "#fff" : B.sky, fontSize: 13, cursor: "pointer" }}>
                    {copiado === "pers" ? "✓" : "⎘"}
                  </button>
                )}
              </div>
              {errCodigo && <div style={{ fontSize: 12, color: B.danger, marginTop: 8 }}>⚠ {errCodigo}</div>}
            </div>
          </div>

          {/* RNT + Cuenta bancaria */}
          <DocumentosAgencia agencia={agencia} onRefresh={onSaved} />

          {/* Datos de contacto */}
          <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, marginBottom: 18 }}>🏢 Información de la agencia</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LS_pref}>Nombre de la agencia</label>
                <input value={datos.nombre} onChange={e => setDatos(d => ({ ...d, nombre: e.target.value }))} style={IS_pref} placeholder="Nombre comercial" />
              </div>
              <div>
                <label style={LS_pref}>Contacto principal</label>
                <input value={datos.contacto} onChange={e => setDatos(d => ({ ...d, contacto: e.target.value }))} style={IS_pref} placeholder="Nombre del contacto" />
              </div>
              <div>
                <label style={LS_pref}>Teléfono</label>
                <input value={datos.tel} onChange={e => setDatos(d => ({ ...d, tel: e.target.value }))} style={IS_pref} placeholder="+57 300 000 0000" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LS_pref}>Email</label>
                <input type="email" value={datos.email} onChange={e => setDatos(d => ({ ...d, email: e.target.value }))} style={IS_pref} placeholder="contacto@agencia.com" />
              </div>
            </div>
          </div>

          <button onClick={saveDatos} disabled={savingDatos}
            style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: savedDatos ? B.success : savingDatos ? B.navyLight : B.sky, color: savedDatos ? "#fff" : savingDatos ? "rgba(255,255,255,0.4)" : B.navy, fontWeight: 700, fontSize: 15, cursor: savingDatos ? "default" : "pointer", transition: "background 0.2s" }}>
            {savingDatos ? "Guardando..." : savedDatos ? "✓ Guardado correctamente" : "Guardar datos"}
          </button>
        </div>
      )}

      {/* ── PRECIOS ── */}
      {subTab === "precios" && (
        <div>
          <PickerRow label="Administrador" role="admin"    value={adminVista}    onChange={setAdminVista} />
          <PickerRow label="Vendedor"      role="vendedor" value={vendedorVista} onChange={setVendedorVista} />

          {/* Preview */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: B.sand, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>Vista previa — tarjeta de pasadia</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {["admin", "vendedor"].map(rol => {
                const vista = rol === "admin" ? adminVista : vendedorVista;
                const showP = vista !== "solo_neto";
                const showN = vista !== "solo_publico";
                return (
                  <div key={rol} style={{ background: B.navy, borderRadius: 10, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{rol === "admin" ? "🛡 Admin ve:" : "👤 Vendedor ve:"}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Pasadia Clásica</div>
                    {showP && <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>$250.000</div>}
                    {showN && <div style={{ fontSize: showP ? 13 : 20, color: showP ? B.sand : B.sky, fontWeight: showP ? 400 : 700, fontFamily: showP ? "inherit" : "'Barlow Condensed', sans-serif" }}>{showP ? "Neto: $220.000" : "$220.000"}</div>}
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
                      {vista === "ambos" ? "Ambos precios" : vista === "solo_publico" ? "Solo tarifa pública" : "Solo tarifa neta"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={savePrecios} disabled={savingPrecios}
            style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: savedPrecios ? B.success : savingPrecios ? B.navyLight : B.sky, color: savedPrecios ? "#fff" : savingPrecios ? "rgba(255,255,255,0.4)" : B.navy, fontWeight: 700, fontSize: 15, cursor: savingPrecios ? "default" : "pointer", transition: "background 0.2s" }}>
            {savingPrecios ? "Guardando..." : savedPrecios ? "✓ Guardado" : "Guardar preferencias"}
          </button>
        </div>
      )}

      {/* ── VENDEDORES ── */}
      {subTab === "vendedores" && <GestionVendedores agencia={agencia} />}
    </div>
  );
}

// ═══════════════════════════════════════════════
// PUNTOS VENDEDOR — balance, ranking, historial
// ═══════════════════════════════════════════════
function PuntosVendedor({ user, agencia }) {
  const [saldo, setSaldo]       = useState(null);
  const [ranking, setRanking]   = useState([]);
  const [historial, setHistorial] = useState([]);
  const [config, setConfig]     = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [sal, rank, cfg] = await Promise.all([
        getSaldoPuntos(user.id),
        getRankingAgencia(agencia.id),
        getPuntosConfig(),
      ]);
      setSaldo(sal);
      setRanking(rank || []);
      setConfig(cfg);
      if (supabase) {
        const { data } = await supabase.from("b2b_puntos_historial")
          .select("*").eq("vendedor_id", user.id)
          .order("created_at", { ascending: false }).limit(20);
        setHistorial(data || []);
      }
      setLoading(false);
    };
    load();
  }, [user.id, agencia.id]);

  const coinName    = config?.nombre_puntos || "AtoCoins";
  const myRank      = ranking.findIndex(v => v.id === user.id) + 1;
  const MEDAL       = ["🥇","🥈","🥉"];
  const esCOP       = agencia.modalidad_puntos === "cop";
  const copPorPunto = config?.cop_por_punto || 0;
  const copValue    = esCOP && copPorPunto > 0 ? Math.round((saldo || 0) * copPorPunto) : null;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando puntos...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Modalidad badge ───────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 12, padding: "5px 14px", borderRadius: 20, fontWeight: 700, background: esCOP ? B.success + "22" : B.sky + "22", color: esCOP ? B.success : B.sky, border: `1px solid ${esCOP ? B.success + "44" : B.sky + "44"}` }}>
          {esCOP ? "💵 Programa COP — tus puntos valen dinero" : "🎁 Programa Premios — canjea tus puntos por premios"}
        </div>
      </div>

      {/* ── Balance Card ─────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${B.navyMid} 0%, ${esCOP ? B.success + "22" : B.sky + "22"} 100%)`, borderRadius: 16, padding: 28, border: `1px solid ${esCOP ? B.success + "33" : B.sky + "33"}`, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: B.sand, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Tu saldo de {coinName}</div>
        <div style={{ fontSize: 64, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: esCOP ? B.success : B.sky, lineHeight: 1 }}>{(saldo || 0).toLocaleString()}</div>
        <div style={{ fontSize: 16, color: B.sand, marginTop: 4 }}>{coinName}</div>
        {copValue !== null && (
          <div style={{ marginTop: 10, fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: B.success }}>
            ≈ {copValue.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 })} COP
          </div>
        )}
        {myRank > 0 && (
          <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", background: B.navy, borderRadius: 20 }}>
            <span style={{ fontSize: 20 }}>{MEDAL[myRank - 1] || `#${myRank}`}</span>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>Posición #{myRank} en {agencia.nombre}</span>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* ── Ranking ────────────────────────────────────────── */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: B.sand, marginBottom: 16 }}>🏆 Ranking de la agencia</div>
          {ranking.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 16 }}>Sin datos</div>}
          {ranking.map((v, i) => {
            const vCOP = esCOP && copPorPunto > 0 ? Math.round((v.puntos || 0) * copPorPunto) : null;
            return (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${B.navyLight}22` }}>
                <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{MEDAL[i] || `#${i+1}`}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: v.id === user.id ? 700 : 400, color: v.id === user.id ? (esCOP ? B.success : B.sky) : B.white }}>{v.nombre}{v.id === user.id ? " (tú)" : ""}</div>
                  {vCOP !== null && <div style={{ fontSize: 10, color: B.success }}>≈ {vCOP.toLocaleString("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0})}</div>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: i === 0 ? B.sand : "rgba(255,255,255,0.7)" }}>{(v.puntos || 0).toLocaleString()}</div>
              </div>
            );
          })}
        </div>

        {/* ── Historial ──────────────────────────────────────── */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: B.sand, marginBottom: 16 }}>📋 Historial de transacciones</div>
          {historial.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 16 }}>Sin transacciones aún. Confirma una reserva para ganar {coinName}.</div>}
          <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {historial.map(h => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${B.navyLight}22` }}>
                <div>
                  <div style={{ fontSize: 12 }}>{h.concepto}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{new Date(h.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: h.tipo === "debito" ? B.danger : B.success }}>
                  {h.tipo === "debito" ? "−" : "+"}{(h.puntos || 0).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Cómo ganar puntos ──────────────────────────────── */}
      {config && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: B.sand }}>💡 Cómo ganar {coinName}</div>
            {esCOP && copPorPunto > 0 && (
              <div style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, background: B.success + "22", color: B.success, fontWeight: 700 }}>
                1 {coinName} = {copPorPunto.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 })}
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { icon: "✅", label: "Por reserva confirmada", pts: config.puntos_por_reserva },
              { icon: "👤", label: "Por cada pasajero", pts: config.puntos_por_pax },
              { icon: "💰", label: "Por millón vendido", pts: config.puntos_por_millon },
              { icon: "👥", label: "Bonus grupo +10 pax", pts: config.bonus_grupo_10_pax },
              { icon: "🌅", label: "Bonus fin de semana", pts: config.bonus_fin_semana },
              { icon: "🌟", label: "Bonus 1ª reserva del mes", pts: config.bonus_primera_reserva_mes },
            ].filter(r => r.pts > 0).map(r => (
              <div key={r.label} style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{r.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.3 }}>{r.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: B.sky }}>{r.pts.toLocaleString()} pts</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// INFO PORTAL — Solo lectura para agencias
// ═══════════════════════════════════════════════
const TIPO_META = {
  articulo:   { label: "Artículo",   icon: "📚", color: "#60A5FA" },
  promocion:  { label: "Promoción",  icon: "🎉", color: "#FBBF24" },
  newsletter: { label: "Newsletter", icon: "📰", color: "#34D399" },
};

function InfoPortal() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState("todos");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.from("b2b_contenido").select("*").eq("activo", true)
      .order("destacado", { ascending: false }).order("created_at", { ascending: false })
      .then(({ data }) => { setItems(data || []); setLoading(false); });
  }, []);

  const hoy = new Date().toISOString().split("T")[0];
  const filtrados = items.filter(it => {
    if (filtro !== "todos" && it.tipo !== filtro) return false;
    if (it.tipo === "promocion" && it.fecha_expira && it.fecha_expira < hoy) return false;
    return true;
  });

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Centro de Información</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Novedades, promociones y contenido exclusivo para tu agencia</p>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[["todos", "Todos"], ["promocion", "🎉 Promociones"], ["newsletter", "📰 Newsletters"], ["articulo", "📚 Artículos"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)} style={{ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: filtro === k ? B.sky : B.navyMid, color: filtro === k ? B.navy : "rgba(255,255,255,0.6)" }}>{l}</button>
        ))}
      </div>
      {loading && <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>}
      {!loading && filtrados.length === 0 && (
        <div style={{ textAlign: "center", padding: 64, color: "rgba(255,255,255,0.25)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 14 }}>No hay publicaciones aún</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {filtrados.map(item => {
          const meta = TIPO_META[item.tipo] || TIPO_META.articulo;
          const isExp = expanded === item.id;
          const diasRestantes = item.tipo === "promocion" && item.fecha_expira
            ? Math.max(0, Math.ceil((new Date(item.fecha_expira) - new Date()) / 86400000)) : null;
          return (
            <div key={item.id} style={{ background: B.navyMid, borderRadius: 14, border: `1px solid ${item.destacado ? meta.color + "55" : B.navyLight}`, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: item.destacado ? `0 0 16px ${meta.color}22` : "none" }}>
              {item.imagen_url && <div style={{ height: 160, background: `url(${item.imagen_url}) center/cover no-repeat`, flexShrink: 0 }} />}
              <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: meta.color + "22", color: meta.color, fontWeight: 700 }}>{meta.icon} {meta.label}</span>
                  {item.destacado && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: B.sand + "22", color: B.sand, fontWeight: 700 }}>⭐ Destacado</span>}
                  {diasRestantes !== null && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: diasRestantes <= 3 ? B.danger + "33" : B.warning + "22", color: diasRestantes <= 3 ? B.danger : B.warning, fontWeight: 700 }}>{diasRestantes === 0 ? "Vence hoy" : `${diasRestantes}d restantes`}</span>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{item.titulo}</div>
                {item.descripcion && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 10 }}>{item.descripcion}</div>}
                {item.cuerpo && (
                  <>
                    {isExp && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, marginBottom: 10, whiteSpace: "pre-wrap", borderTop: `1px solid ${B.navyLight}`, paddingTop: 10 }}>{item.cuerpo}</div>}
                    <button onClick={() => setExpanded(isExp ? null : item.id)} style={{ background: "none", border: "none", color: B.sky, fontSize: 12, cursor: "pointer", textAlign: "left", padding: 0, marginBottom: 10 }}>{isExp ? "▲ Leer menos" : "▼ Leer más"}</button>
                  </>
                )}
                <div style={{ flex: 1 }} />
                {item.link_externo && (
                  <a href={item.link_externo} target="_blank" rel="noopener noreferrer"
                    style={{ display: "block", padding: "9px 14px", borderRadius: 8, background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}33`, fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center", marginTop: 8 }}>
                    {item.label_link || "Ver más"} →
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MEDIA PORTAL — Solo descarga para agencias
// ═══════════════════════════════════════════════
const CAT_META = {
  foto:   { label: "Foto",   icon: "🖼",  color: "#60A5FA" },
  video:  { label: "Video",  icon: "🎬",  color: "#F472B6" },
  story:  { label: "Story",  icon: "📱",  color: "#A78BFA" },
  banner: { label: "Banner", icon: "🎨",  color: "#FBBF24" },
  logo:   { label: "Logo",   icon: "✨",  color: "#34D399" },
};

function MediaPortal() {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [categoria, setCategoria] = useState("todos");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.from("b2b_media_kit").select("*").eq("activo", true)
      .order("orden").order("created_at", { ascending: false })
      .then(({ data }) => { setItems(data || []); setLoading(false); });
  }, []);

  const fmtSize = (kb) => !kb ? "" : kb < 1024 ? `${kb} KB` : `${(kb / 1024).toFixed(1)} MB`;
  const filtrados = categoria === "todos" ? items : items.filter(i => i.categoria === categoria);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Material para Redes Sociales</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Descarga fotos, videos y banners oficiales de Atolón para tus canales</p>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={() => setCategoria("todos")} style={{ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: categoria === "todos" ? B.sky : B.navyMid, color: categoria === "todos" ? B.navy : "rgba(255,255,255,0.6)" }}>Todos ({items.length})</button>
        {Object.entries(CAT_META).map(([k, m]) => {
          const cnt = items.filter(i => i.categoria === k).length;
          if (cnt === 0) return null;
          return <button key={k} onClick={() => setCategoria(k)} style={{ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: categoria === k ? m.color : B.navyMid, color: categoria === k ? B.navy : "rgba(255,255,255,0.6)" }}>{m.icon} {m.label} ({cnt})</button>;
        })}
      </div>
      {loading && <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,0.3)" }}>Cargando...</div>}
      {!loading && filtrados.length === 0 && (
        <div style={{ textAlign: "center", padding: 64, color: "rgba(255,255,255,0.25)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 14 }}>No hay material disponible aún</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {filtrados.map(item => {
          const meta = CAT_META[item.categoria] || CAT_META.foto;
          const isVideo = item.tipo_archivo?.startsWith("video") || item.categoria === "video";
          const thumb = item.thumbnail_url || (isVideo ? null : item.archivo_url);
          return (
            <div key={item.id} style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}`, display: "flex", flexDirection: "column" }}>
              <div style={{ height: 150, background: thumb ? `url(${thumb}) center/cover` : B.navy, flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {!thumb && <span style={{ fontSize: 40, opacity: 0.25 }}>{meta.icon}</span>}
                {isVideo && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 44, height: 44, borderRadius: 22, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>▶</div></div>}
                <div style={{ position: "absolute", top: 8, left: 8 }}><span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: meta.color + "dd", color: "#000", fontWeight: 700 }}>{meta.icon} {meta.label}</span></div>
              </div>
              <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>{item.titulo}</div>
                {item.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 8, lineHeight: 1.4 }}>{item.descripcion}</div>}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {item.dimensiones && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{item.dimensiones}</span>}
                  {item.tamano_kb > 0 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{fmtSize(item.tamano_kb)}</span>}
                </div>
                <div style={{ flex: 1 }} />
                <a href={item.archivo_url} download target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", padding: "9px 0", borderRadius: 8, background: meta.color + "22", color: meta.color, border: `1px solid ${meta.color}33`, fontSize: 12, fontWeight: 700, textAlign: "center", textDecoration: "none" }}>
                  ⬇ Descargar
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// GRUPOS PORTAL
// ═══════════════════════════════════════════════
function GruposPortal({ agencia }) {
  const [grupos,   setGrupos]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [resMap,   setResMap]   = useState({});
  const [loadingR, setLoadingR] = useState(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.from("eventos").select("*")
      .eq("aliado_id", agencia.id)
      .eq("categoria", "grupo")
      .order("fecha", { ascending: false })
      .then(({ data }) => { setGrupos(data || []); setLoading(false); });
  }, [agencia.id]);

  const toggleReservas = async (evt) => {
    if (expanded === evt.id) { setExpanded(null); return; }
    setExpanded(evt.id);
    if (resMap[evt.id]) return;
    setLoadingR(evt.id);
    let q = supabase.from("reservas").select("*").eq("canal", "GRUPO").eq("fecha", evt.fecha);
    if (evt.aliado_id) q = q.eq("aliado_id", evt.aliado_id);
    const { data } = await q.order("created_at", { ascending: false });
    setResMap(m => ({ ...m, [evt.id]: data || [] }));
    setLoadingR(null);
  };

  const bookingUrl = (evt) => `${window.location.origin}/booking?grupo=${evt.id}`;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando grupos...</div>;

  if (grupos.length === 0) return (
    <div style={{ background: B.navyMid, borderRadius: 14, padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎪</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No tienes grupos activos</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Los grupos que Atolon cree para tu agencia aparecerán aquí.</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
        Grupos y eventos abiertos para tu agencia. Cada participante compra su pasadía usando el link del grupo.
      </div>
      {grupos.map(evt => {
        const res    = resMap[evt.id] || [];
        const isOpen = expanded === evt.id;
        const url    = bookingUrl(evt);
        const totalPax = res.reduce((s, r) => s + (r.pax || 0), 0);
        const totalCOP = res.reduce((s, r) => s + (r.total || 0), 0);
        const hoy      = todayStr();
        const pasado   = evt.fecha < hoy;

        return (
          <div key={evt.id} style={{ background: B.navyMid, borderRadius: 14, border: `1px solid ${pasado ? B.navyLight : B.sky + "44"}`, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{evt.nombre}</span>
                  {pasado
                    ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.3)" }}>Finalizado</span>
                    : <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.success + "22", color: B.success }}>Activo</span>
                  }
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  📅 {fmtFecha(evt.fecha)} &nbsp;·&nbsp; 🌴 {evt.tipo}
                  {(evt.salidas_grupo || []).length > 0 && <> &nbsp;·&nbsp; ⛵ {[...evt.salidas_grupo].sort((a,b)=>a.hora.localeCompare(b.hora)).map(s=>s.hora).join(" · ")}</>}
                  {evt.pax && <> &nbsp;·&nbsp; 👥 {evt.pax} cupos</>}
                </div>
              </div>
              {/* Botones */}
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => { navigator.clipboard.writeText(url); }}
                  style={{ padding: "8px 14px", background: B.sky + "22", color: B.sky, border: `1px solid ${B.sky}44`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  📋 Copiar link
                </button>
                <button onClick={() => toggleReservas(evt)}
                  style={{ padding: "8px 14px", background: isOpen ? B.sand + "22" : B.navyLight, color: isOpen ? B.sand : B.white, border: `1px solid ${isOpen ? B.sand + "44" : "transparent"}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  📋 Ver reservas{isOpen && resMap[evt.id] ? ` (${resMap[evt.id].length})` : ""}
                </button>
              </div>
            </div>

            {/* Reservas expandidas */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${B.navyLight}`, padding: "16px 20px", background: B.navy }}>
                {loadingR === evt.id ? (
                  <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "12px 0" }}>Cargando reservas...</div>
                ) : res.length === 0 ? (
                  <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "12px 0" }}>Aún no hay reservas en este grupo.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 20, marginBottom: 12, padding: "8px 12px", background: B.navyMid, borderRadius: 8 }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>👥 Personas: <strong style={{ color: B.white }}>{totalPax}</strong></span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>💵 Total: <strong style={{ color: B.success }}>{COP(totalCOP)}</strong></span>
                    </div>
                    {res.map(r => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${B.navyLight}`, fontSize: 13 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{r.id} · {r.pax} pax · {r.tipo}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, color: B.sand }}>{COP(r.total)}</div>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: r.estado === "confirmado" ? B.success + "22" : B.warning + "22", color: r.estado === "confirmado" ? B.success : B.warning }}>
                            {r.estado}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN PORTAL
// ═══════════════════════════════════════════════
export default function AgenciaPortal() {
  const { isMobile, isTablet } = useDevice();
  const MOBILE_TABS = ["reservar", "historial", "qr", "info", "media"];
  const [session, setSession] = useState(null);
  const [tab, setTab]         = useState("reservar");
  const [refreshKey, setRefreshKey] = useState(0);
  const [vendedor, setVendedor]     = useState(null);
  const [telMuelle, setTelMuelle]   = useState("");

  useEffect(() => {
    if (!session || !supabase) return;
    const { agencia } = session;
    // Fetch vendedor asignado a la agencia
    if (agencia.vendedor_id) {
      supabase.from("usuarios").select("id, nombre, telefono, avatar_color, rol_id")
        .eq("id", agencia.vendedor_id).single()
        .then(({ data }) => setVendedor(data || null));
    } else {
      setVendedor(null);
    }
    // Fetch tel_muelle desde configuracion
    supabase.from("configuracion").select("tel_muelle").eq("id", "atolon").single()
      .then(({ data }) => setTelMuelle(data?.tel_muelle || ""));
  }, [session]);

  useEffect(() => {
    if (isMobile && !MOBILE_TABS.includes(tab)) setTab("reservar");
  }, [isMobile]);

  if (!session) return <LoginScreen onLogin={setSession} />;

  const { user, agencia } = session;
  const isAdmin = user.rol === "admin";

  // Computed price visibility for current user
  const vistaPrecios = isAdmin
    ? (agencia.precio_vista_admin    || "ambos")
    : (agencia.precio_vista_vendedor || "ambos");

  // Called by PreferenciasAgencia after save — updates session in place
  const handlePrefsSaved = (updates) => {
    setSession(prev => ({ ...prev, agencia: { ...prev.agencia, ...updates } }));
  };

  return (
    <div style={{ minHeight: "100vh", background: B.navy }}>
      {/* Header */}
      <div style={{ padding: isMobile ? "10px 16px" : isTablet ? "12px 20px" : "12px 28px", background: B.navyMid, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/atolon-logo-white.png" alt="Atolon Beach Club" style={{ height: isMobile ? 44 : isTablet ? 60 : 80, objectFit: "contain" }} />
          {!isMobile && <div style={{ width: 1, height: 28, background: B.navyLight }} />}
          <div>
            {!isMobile && <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 600 }}>Portal de Agencias</span>}
            <span style={{ fontSize: isMobile ? 13 : 12, color: B.sand, marginLeft: isMobile ? 0 : 12 }}>{agencia.nombre}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!isMobile && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{user.nombre}</span>}
          {!isMobile && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.sky + "22", color: B.sky }}>{user.rol}</span>}
          <button onClick={() => setSession(null)} style={{ padding: "6px 14px", borderRadius: 6, background: B.navyLight, color: B.white, border: "none", fontSize: 12, cursor: "pointer" }}>Salir</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: isMobile ? "100%" : 900, margin: "0 auto", padding: isMobile ? "16px 12px" : isTablet ? "20px 16px" : 28 }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
          {[
            ["reservar", "Nueva Reserva"],
            ["historial", "Mis Reservas"],
            ["qr", "Link / QR"],
            ["grupos", "🎪 Grupos"],
            ...(!isAdmin ? [["puntos", "🏆 Mis Puntos"]] : []),
            ...(isAdmin ? [["incentivos", "🎯 Incentivos"]] : []),
            ["info", "📢 Novedades"],
            ["media", "📲 Redes Sociales"],
            ...(isAdmin ? [["preferencias", "⚙ Preferencias"]] : []),
          ].filter(([k]) => !isMobile || MOBILE_TABS.includes(k)).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: isMobile ? "10px 14px" : "10px 20px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: isMobile ? 12 : 13, fontWeight: 600, flexShrink: 0,
              background: tab === k ? B.sky : B.navyMid, color: tab === k ? B.navy : B.sand,
            }}>{l}</button>
          ))}
        </div>

        {tab === "reservar" && <NuevaReserva agencia={agencia} user={user} onCreated={() => setRefreshKey(k => k + 1)} vistaPrecios={vistaPrecios} />}
        {tab === "historial" && <HistorialReservas key={refreshKey} agencia={agencia} vendedorId={isAdmin ? null : user.id} />}
        {tab === "qr" && <QRSection agencia={agencia} />}
        {tab === "grupos" && <GruposPortal agencia={agencia} />}
        {tab === "puntos" && !isAdmin && <PuntosVendedor user={user} agencia={agencia} />}
        {tab === "incentivos" && isAdmin && <IncentivosPortal agencia={agencia} />}
        {tab === "info"  && <InfoPortal />}
        {tab === "media" && <MediaPortal />}
        {tab === "preferencias" && isAdmin && <PreferenciasAgencia agencia={agencia} onSaved={handlePrefsSaved} />}

        {/* ── Footer: agente comercial + muelle ── */}
        <div style={{ marginTop: isMobile ? 32 : 48, borderTop: `1px solid ${B.navyLight}`, paddingTop: isMobile ? 20 : 24, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
          {/* Agente comercial */}
          <div style={{ flex: "1 1 260px", background: B.navyMid, borderRadius: 14, padding: "18px 22px", display: "flex", gap: 14, alignItems: "center", border: `1px solid ${B.navyLight}` }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: vendedor ? (vendedor.avatar_color || B.sky) : B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: vendedor ? 16 : 22, fontWeight: 700, color: B.navy, flexShrink: 0 }}>
              {vendedor ? vendedor.nombre.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "👤"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Tu agente comercial asignado</div>
              {vendedor ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: B.white }}>{vendedor.nombre}</div>
                  {vendedor.telefono
                    ? <a href={`tel:${vendedor.telefono}`} style={{ fontSize: 13, color: B.sky, textDecoration: "none", display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>📞 {vendedor.telefono}</a>
                    : <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Sin teléfono registrado</div>
                  }
                </>
              ) : (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Sin agente asignado</div>
              )}
            </div>
          </div>

          {/* Asistencia en muelle — siempre visible */}
          <div style={{ flex: "1 1 260px", background: B.navyMid, borderRadius: 14, padding: "18px 22px", display: "flex", gap: 14, alignItems: "center", border: `1px solid ${telMuelle ? B.sand + "44" : B.navyLight}` }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: B.sand + "22", border: `2px solid ${B.sand}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
              ⚓
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>¿Necesitas asistencia en muelle?</div>
              {telMuelle
                ? <a href={`tel:${telMuelle}`} style={{ fontSize: 18, fontWeight: 700, color: B.sand, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>📞 {telMuelle}</a>
                : <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Número no configurado aún</div>
              }
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Llama directo al muelle de Atolon</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
