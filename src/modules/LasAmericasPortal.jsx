import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl } from "../lib/wompi";

// ── Branding constants (easy to update) ─────────────────────────────────────
const HOTEL_NOMBRE = "Hotel Las Americas";
const HOTEL_LOGO   = "/las-americas-logo.png";
const ORO          = "#B8962E";
const ORO_LIGHT    = "#D4AF5A";
const DARK         = "#0A1628";
const DARK_MID     = "#0F2040";
const DARK_CARD    = "#122448";
const WARM_WHITE   = "#F5F2EC";

// ── Helpers ──────────────────────────────────────────────────────────────────
const COP = (v) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(v);

const todayStr = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// ── Shared input styles ───────────────────────────────────────────────────────
const IS = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1.5px solid rgba(255,255,255,0.12)`,
  background: "rgba(255,255,255,0.06)",
  color: WARM_WHITE,
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

// ── Stepper button ────────────────────────────────────────────────────────────
function Stepper({ value, onChange, min = 0 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{
          width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${ORO}`,
          background: "transparent", color: ORO, fontSize: 20, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
        }}
      >−</button>
      <span style={{ fontSize: 22, fontWeight: 700, color: WARM_WHITE, minWidth: 28, textAlign: "center" }}>{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        style={{
          width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${ORO}`,
          background: "transparent", color: ORO, fontSize: 20, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
        }}
      >+</button>
    </div>
  );
}

// ── Loading spinner ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        border: `3px solid rgba(255,255,255,0.1)`,
        borderTop: `3px solid ${ORO}`,
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header() {
  const [logoErr, setLogoErr] = useState(false);
  return (
    <div style={{
      background: `linear-gradient(135deg, ${DARK} 0%, ${DARK_MID} 100%)`,
      borderBottom: `2px solid ${ORO}`,
      padding: "28px 24px 24px",
      textAlign: "center",
    }}>
      {/* Hotel logo */}
      <div style={{ marginBottom: 12 }}>
        {!logoErr ? (
          <img
            src={HOTEL_LOGO}
            alt={HOTEL_NOMBRE}
            onError={() => setLogoErr(true)}
            style={{ height: 72, objectFit: "contain", display: "inline-block" }}
          />
        ) : (
          <div style={{ fontSize: 26, fontWeight: 900, color: WARM_WHITE, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 1 }}>
            {HOTEL_NOMBRE.toUpperCase()}
          </div>
        )}
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize: 15,
        color: ORO_LIGHT,
        fontFamily: "'Barlow Condensed', sans-serif",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: 16,
      }}>
        Reserva tu Pasadía en Atolon Beach Club
      </div>

      {/* Atolon logo */}
      <img
        src="/atolon-logo-white.png"
        alt="Atolon Beach Club"
        style={{ height: 32, objectFit: "contain", opacity: 0.7 }}
      />
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ["Elige tu Pasadía", "Fecha y Personas", "Tus Datos"];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 24px", gap: 0 }}>
      {steps.map((label, i) => {
        const num = i + 1;
        const active = step === num;
        const done   = step > num;
        return (
          <div key={num} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: done ? ORO : active ? ORO : "rgba(255,255,255,0.1)",
                color: (done || active) ? DARK : "rgba(255,255,255,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700,
                border: active ? `2px solid ${ORO_LIGHT}` : "2px solid transparent",
                boxShadow: active ? `0 0 12px ${ORO}55` : "none",
              }}>
                {done ? "✓" : num}
              </div>
              <div style={{ fontSize: 10, color: active ? ORO_LIGHT : "rgba(255,255,255,0.35)", textAlign: "center", maxWidth: 72, letterSpacing: "0.03em" }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 40, height: 2, background: step > num ? ORO : "rgba(255,255,255,0.1)", margin: "0 4px", marginBottom: 20 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Pasadía card ──────────────────────────────────────────────────────────────
function PasadiaCard({ pasadia, convenio, selected, onSelect }) {
  const [imgErr, setImgErr] = useState(false);
  const precio = convenio?.tarifa_publica || 0;

  return (
    <div
      onClick={onSelect}
      style={{
        background: DARK_CARD,
        borderRadius: 16,
        overflow: "hidden",
        cursor: "pointer",
        border: selected ? `2px solid ${ORO}` : "2px solid transparent",
        boxShadow: selected ? `0 0 20px ${ORO}33` : "0 4px 16px rgba(0,0,0,0.3)",
        transition: "all 0.2s ease",
      }}
    >
      {/* Photo */}
      <div style={{ width: "100%", height: 180, background: DARK_MID, position: "relative", overflow: "hidden" }}>
        {!imgErr && pasadia.foto_principal_url ? (
          <img
            src={pasadia.foto_principal_url}
            alt={pasadia.nombre}
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 }}>
            🏖️
          </div>
        )}
        {selected && (
          <div style={{
            position: "absolute", top: 10, right: 10,
            background: ORO, borderRadius: "50%", width: 28, height: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: DARK, fontSize: 14, fontWeight: 900,
          }}>✓</div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "16px 18px 20px" }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 22, fontWeight: 700, color: WARM_WHITE,
          marginBottom: 6, letterSpacing: "0.02em",
        }}>
          {pasadia.nombre}
        </div>
        {pasadia.descripcion && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 12 }}>
            {pasadia.descripcion}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          {pasadia.min_pax && (
            <div style={{
              background: `${ORO}22`, border: `1px solid ${ORO}55`,
              borderRadius: 20, padding: "3px 10px",
              fontSize: 12, color: ORO_LIGHT,
            }}>
              Mín. {pasadia.min_pax} pax
            </div>
          )}
          {precio > 0 && (
            <div style={{ fontSize: 18, fontWeight: 700, color: ORO_LIGHT }}>
              {COP(precio)} <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>/ persona</span>
            </div>
          )}
        </div>
        <button
          style={{
            marginTop: 14, width: "100%", padding: "11px",
            background: selected ? ORO : "transparent",
            color: selected ? DARK : ORO,
            border: `1.5px solid ${ORO}`,
            borderRadius: 8, fontWeight: 700, fontSize: 14,
            cursor: "pointer", transition: "all 0.15s ease",
            fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em",
          }}
        >
          {selected ? "✓ Seleccionado" : "Seleccionar"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function LasAmericasPortal() {
  // ── Data state ────────────────────────────────────────────────────────────
  const [loading, setLoading]       = useState(true);
  const [aliado, setAliado]         = useState(null);
  const [convenios, setConvenios]   = useState([]);
  const [pasadiasDB, setPasadiasDB] = useState([]);
  const [error, setError]           = useState(null);

  // ── Booking flow state ────────────────────────────────────────────────────
  const [step, setStep]             = useState(1);
  const [selectedTipo, setSelectedTipo] = useState(null);  // tipo_pasadia string
  const [salidas, setSalidas]       = useState([]);
  const [disponibilidad, setDisponibilidad] = useState({});
  const [overrides, setOverrides]   = useState({});
  const [form, setForm] = useState({
    fecha: "", salida_id: "", nombre: "", contacto: "", email: "", notas: "",
    pax_a: 2, pax_n: 0,
  });
  const [saving, setSaving]         = useState(false);
  const [confirmed, setConfirmed]   = useState(null); // { id, estado }

  // ── Load aliado + convenios + pasadías ─────────────────────────────────────
  useEffect(() => {
    if (!supabase) { setError("Base de datos no disponible"); setLoading(false); return; }
    const load = async () => {
      // Find aliado
      const { data: aliadoData, error: aliadoErr } = await supabase
        .from("aliados_b2b")
        .select("id, nombre, estado")
        .ilike("nombre", "%americas%")
        .eq("estado", "activo")
        .limit(1)
        .single();

      if (aliadoErr || !aliadoData) {
        setError("Portal no disponible en este momento.");
        setLoading(false);
        return;
      }
      setAliado(aliadoData);

      // Load convenios + pasadías in parallel
      const [convRes, pasRes] = await Promise.all([
        supabase.from("b2b_convenios").select("*").eq("aliado_id", aliadoData.id).eq("activo", true),
        supabase.from("pasadias").select("*").eq("activo", true).order("orden"),
      ]);
      setConvenios(convRes.data || []);
      setPasadiasDB(pasRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  // ── Derived: cards to show (only pasadías that have a convenio) ────────────
  const cards = pasadiasDB
    .map(p => {
      const convenio = convenios.find(c => c.tipo_pasadia === p.tipo || c.tipo_pasadia === p.nombre);
      return convenio ? { pasadia: p, convenio } : null;
    })
    .filter(Boolean);

  // ── Pasadía currently selected ─────────────────────────────────────────────
  const selectedCard = cards.find(c => c.convenio.tipo_pasadia === selectedTipo);
  const precioPublico = selectedCard?.convenio?.tarifa_publica || 0;
  const totalPax = (form.pax_a || 1) + (form.pax_n || 0);
  const totalCOP = precioPublico * totalPax;

  // ── Load salidas when date changes ─────────────────────────────────────────
  const loadSalidas = useCallback(async (fecha) => {
    if (!supabase || !fecha) return;
    const [resR, ovrR, salR] = await Promise.all([
      supabase.from("reservas").select("salida_id, pax").eq("fecha", fecha).neq("estado", "cancelado"),
      supabase.from("salidas_override").select("*").eq("fecha", fecha),
      supabase.from("salidas").select("*").eq("activo", true).order("hora"),
    ]);
    const dispMap = {};
    (resR.data || []).forEach(r => { dispMap[r.salida_id] = (dispMap[r.salida_id] || 0) + (r.pax || 0); });
    const ovrMap = {};
    (ovrR.data || []).forEach(o => { ovrMap[o.salida_id] = o; });
    setDisponibilidad(dispMap);
    setOverrides(ovrMap);
    setSalidas(salR.data || []);
  }, []);

  const handleFechaChange = (fecha) => {
    setForm(f => ({ ...f, fecha, salida_id: "" }));
    loadSalidas(fecha);
  };

  // ── Auto-apertura logic (same as AgenciaPortal) ────────────────────────────
  const getSalidasDisponibles = () => {
    const todayISO = todayStr();
    const isToday  = form.fecha === todayISO;
    const nowMins  = isToday ? (() => {
      const t = new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    })() : -1;

    return salidas.filter(s => {
      const ovr = overrides[s.id];
      if (ovr) return ovr.accion === "abrir";
      // Close 45 min before departure when today
      if (isToday && s.hora) {
        const [h, m] = s.hora.split(":").map(Number);
        if (nowMins >= (h * 60 + m) - 45) return false;
      }
      if (!s.auto_apertura) return true;
      const fijas = salidas.filter(f => !f.auto_apertura);
      return fijas.every(f => (disponibilidad[f.id] || 0) / (f.capacidad_total || 1) >= 0.9);
    });
  };

  const salidasDisp = form.fecha ? getSalidasDisponibles() : [];
  const selectedSalida = salidas.find(s => s.id === form.salida_id);

  // Does selected pasadía need a boat? sin_embarcacion=false means HAS transport
  const needsSalida = selectedCard?.pasadia?.sin_embarcacion === false;

  // ── Create reservation ─────────────────────────────────────────────────────
  const createReserva = async (estado) => {
    if (!aliado || saving) return null;
    setSaving(true);
    const reservaId = `LAS-AMERICAS-${Date.now()}`;
    const { error: insErr } = await supabase.from("reservas").insert({
      id: reservaId,
      fecha: form.fecha,
      salida_id: form.salida_id || null,
      tipo: selectedCard.convenio.tipo_pasadia,
      canal: "Hotel Las Americas",
      nombre: form.nombre,
      contacto: form.contacto,
      pax: totalPax,
      pax_a: form.pax_a,
      pax_n: form.pax_n,
      precio_u: precioPublico,
      total: totalCOP,
      abono: 0,
      saldo: totalCOP,
      estado,
      notas: form.notas || null,
      aliado_id: aliado.id,
      qr_code: `HOTEL-LAS-AMERICAS-${Date.now()}`,
    });
    setSaving(false);
    if (insErr) { alert("Error al crear la reserva. Por favor intenta de nuevo."); return null; }
    return reservaId;
  };

  const handleReservarCupo = async () => {
    const id = await createReserva("hold");
    if (!id) return;
    setConfirmed({ id, estado: "hold" });
  };

  const handlePagarAhora = async () => {
    const id = await createReserva("pendiente_pago");
    if (!id) return;
    setConfirmed({ id, estado: "pendiente_pago" });
    const url = await wompiCheckoutUrl({
      referencia: id,
      totalCOP,
      email: form.email || "",
      redirectUrl: window.location.href,
    });
    window.open(url, "_blank");
  };

  const handleSelectPasadia = (tipo) => {
    setSelectedTipo(tipo);
    setForm(f => ({ ...f, fecha: "", salida_id: "" }));
    setTimeout(() => {
      document.getElementById("step2")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    setStep(2);
  };

  const handleContinuar = () => {
    if (!form.fecha) return;
    if (needsSalida && !form.salida_id) return;
    setStep(3);
    setTimeout(() => {
      document.getElementById("step3")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const canContinuar = form.fecha && (!needsSalida || form.salida_id);
  const canSubmit    = form.nombre.trim() && form.contacto.trim();

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setStep(1);
    setSelectedTipo(null);
    setConfirmed(null);
    setForm({ fecha: "", salida_id: "", nombre: "", contacto: "", email: "", notas: "", pax_a: 2, pax_n: 0 });
    setSalidas([]);
    setDisponibilidad({});
    setOverrides({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  // Loading
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: DARK, display: "flex", flexDirection: "column" }}>
        <Header />
        <Spinner />
      </div>
    );
  }

  // Error / not found
  if (error || !aliado) {
    return (
      <div style={{ minHeight: "100vh", background: DARK, display: "flex", flexDirection: "column" }}>
        <Header />
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🌊</div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: WARM_WHITE, marginBottom: 10 }}>
            Portal no disponible
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", maxWidth: 340, lineHeight: 1.7, marginBottom: 28 }}>
            {error || "Este portal no está disponible en este momento."}<br />
            Para reservas comuníquese directamente con Atolon Beach Club.
          </div>
          <a
            href="https://wa.me/573001234567"
            style={{
              padding: "12px 28px", background: ORO, color: DARK, borderRadius: 10,
              fontWeight: 700, fontSize: 15, textDecoration: "none",
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em",
            }}
          >
            Contactar Atolon Beach Club
          </a>
        </div>
      </div>
    );
  }

  // Confirmation screen
  if (confirmed) {
    const isPago = confirmed.estado === "pendiente_pago";
    return (
      <div style={{ minHeight: "100vh", background: DARK, display: "flex", flexDirection: "column" }}>
        <Header />
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center",
        }}>
          {/* Gold checkmark */}
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: `linear-gradient(135deg, ${ORO}, ${ORO_LIGHT})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, marginBottom: 24,
            boxShadow: `0 0 40px ${ORO}44`,
          }}>
            ✓
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 32, fontWeight: 800, color: WARM_WHITE, marginBottom: 8,
          }}>
            ¡Reserva Confirmada!
          </div>
          <div style={{ fontSize: 14, color: ORO_LIGHT, marginBottom: 28, letterSpacing: "0.05em" }}>
            {confirmed.id}
          </div>

          {/* Summary card */}
          <div style={{
            background: DARK_CARD, borderRadius: 16, padding: "24px 28px",
            width: "100%", maxWidth: 400, textAlign: "left",
            border: `1px solid ${ORO}33`, marginBottom: 24,
          }}>
            {[
              ["Pasadía",    selectedCard?.pasadia?.nombre],
              ["Fecha",      form.fecha],
              ["Personas",   `${form.pax_a} adulto${form.pax_a !== 1 ? "s" : ""}${form.pax_n > 0 ? ` + ${form.pax_n} niño${form.pax_n !== 1 ? "s" : ""}` : ""}`],
              selectedSalida ? ["Salida",   `${selectedSalida.hora} — ${selectedSalida.nombre}`] : null,
              ["Total",      COP(totalCOP)],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 14 }}>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
                <span style={{ color: WARM_WHITE, fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Status message */}
          <div style={{
            background: isPago ? `${ORO}18` : "rgba(255,255,255,0.05)",
            border: `1px solid ${isPago ? ORO + "44" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 10, padding: "14px 18px",
            fontSize: 13, color: isPago ? ORO_LIGHT : "rgba(255,255,255,0.6)",
            maxWidth: 400, width: "100%", lineHeight: 1.6, marginBottom: 28, textAlign: "center",
          }}>
            {isPago
              ? "Se ha abierto la página de pago en una nueva pestaña. Su cupo quedará confirmado una vez se complete el pago."
              : "Su cupo está reservado. Por favor pagar en el muelle antes del zarpe."}
          </div>

          <button
            onClick={handleReset}
            style={{
              padding: "13px 36px", background: "transparent",
              color: ORO, border: `1.5px solid ${ORO}`,
              borderRadius: 10, fontWeight: 700, fontSize: 15,
              cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: "0.04em",
            }}
          >
            Realizar otra reserva
          </button>

          {/* Footer */}
          <div style={{ marginTop: 48, fontSize: 12, color: "rgba(255,255,255,0.25)", letterSpacing: "0.05em" }}>
            Atolon Beach Club · Tierra Bomba, Cartagena
          </div>
        </div>
      </div>
    );
  }

  // ── Main booking flow ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: DARK, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: WARM_WHITE }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
      `}</style>

      <Header />
      <StepBar step={step} />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px 60px" }}>

        {/* ── STEP 1: Elige tu Pasadía ─────────────────────────────────────── */}
        <section id="step1">
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 26, fontWeight: 800, color: WARM_WHITE,
            marginBottom: 6, letterSpacing: "0.02em",
          }}>
            1 · Elige tu Pasadía
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>
            Selecciona la experiencia que más te guste
          </div>

          {cards.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, padding: "32px 0" }}>
              No hay pasadías disponibles en este momento.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 20,
            }}>
              {cards.map(({ pasadia, convenio }) => (
                <PasadiaCard
                  key={pasadia.id}
                  pasadia={pasadia}
                  convenio={convenio}
                  selected={selectedTipo === convenio.tipo_pasadia}
                  onSelect={() => handleSelectPasadia(convenio.tipo_pasadia)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── STEP 2: Fecha y Personas ──────────────────────────────────────── */}
        {step >= 2 && (
          <section id="step2" style={{ marginTop: 48 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 26, fontWeight: 800, color: WARM_WHITE,
              marginBottom: 6, letterSpacing: "0.02em",
            }}>
              2 · Selecciona Fecha y Personas
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24 }}>
              ¿Cuándo van y cuántas personas?
            </div>

            <div style={{
              background: DARK_CARD, borderRadius: 16, padding: "28px 24px",
              border: `1px solid rgba(255,255,255,0.08)`,
              display: "flex", flexDirection: "column", gap: 24, maxWidth: 520,
            }}>
              {/* Date */}
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Fecha
                </label>
                <input
                  type="date"
                  value={form.fecha}
                  min={todayStr()}
                  onChange={e => handleFechaChange(e.target.value)}
                  style={{ ...IS, maxWidth: 220 }}
                />
              </div>

              {/* Adults */}
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Adultos
                </label>
                <Stepper value={form.pax_a} min={1} onChange={v => setForm(f => ({ ...f, pax_a: v }))} />
              </div>

              {/* Children */}
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Niños (0–12 años)
                </label>
                <Stepper value={form.pax_n} min={0} onChange={v => setForm(f => ({ ...f, pax_n: v }))} />
              </div>

              {/* Salida picker — only when pasadía needs transport and date selected */}
              {needsSalida && form.fecha && (
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Salida
                  </label>
                  {salidasDisp.length === 0 ? (
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", padding: "10px 0" }}>
                      No hay salidas disponibles para esta fecha.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {salidasDisp.map(s => {
                        const ocupado = disponibilidad[s.id] || 0;
                        const cap     = s.capacidad_total || 0;
                        const disp    = cap > 0 ? cap - ocupado : null;
                        const sel     = form.salida_id === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setForm(f => ({ ...f, salida_id: s.id }))}
                            style={{
                              padding: "9px 16px", borderRadius: 24,
                              border: sel ? `2px solid ${ORO}` : "1.5px solid rgba(255,255,255,0.2)",
                              background: sel ? `${ORO}22` : "rgba(255,255,255,0.05)",
                              color: sel ? ORO_LIGHT : "rgba(255,255,255,0.7)",
                              fontSize: 13, cursor: "pointer",
                              fontWeight: sel ? 700 : 400,
                              transition: "all 0.15s ease",
                            }}
                          >
                            {s.hora} — {s.nombre}{disp !== null ? ` (${disp} disp.)` : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Continuar button */}
              <button
                onClick={handleContinuar}
                disabled={!canContinuar}
                style={{
                  padding: "14px", borderRadius: 10, border: "none",
                  background: canContinuar ? `linear-gradient(135deg, ${ORO}, ${ORO_LIGHT})` : "rgba(255,255,255,0.08)",
                  color: canContinuar ? DARK : "rgba(255,255,255,0.3)",
                  fontWeight: 800, fontSize: 15, cursor: canContinuar ? "pointer" : "default",
                  fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em",
                  transition: "all 0.15s ease",
                }}
              >
                Continuar →
              </button>
            </div>
          </section>
        )}

        {/* ── STEP 3: Tus Datos ─────────────────────────────────────────────── */}
        {step >= 3 && (
          <section id="step3" style={{ marginTop: 48 }}>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 26, fontWeight: 800, color: WARM_WHITE,
              marginBottom: 6, letterSpacing: "0.02em",
            }}>
              3 · Tus Datos
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24 }}>
              Necesitamos tus datos para confirmar la reserva
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 24, alignItems: "start",
            }}>
              {/* Form */}
              <div style={{
                background: DARK_CARD, borderRadius: 16, padding: "28px 24px",
                border: `1px solid rgba(255,255,255,0.08)`,
                display: "flex", flexDirection: "column", gap: 18,
              }}>
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    style={IS}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    WhatsApp / Teléfono *
                  </label>
                  <input
                    type="tel"
                    placeholder="+57 300 000 0000"
                    value={form.contacto}
                    onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))}
                    style={IS}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Email (opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="tucorreo@email.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    style={IS}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Notas (opcional)
                  </label>
                  <textarea
                    placeholder="Alguna solicitud especial..."
                    value={form.notas}
                    onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                    rows={3}
                    style={{ ...IS, resize: "vertical", lineHeight: 1.5 }}
                  />
                </div>
              </div>

              {/* Summary + action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Total summary */}
                <div style={{
                  background: DARK_CARD, borderRadius: 16, padding: "22px 24px",
                  border: `1px solid ${ORO}33`,
                }}>
                  <div style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 16, fontWeight: 700, color: ORO_LIGHT,
                    marginBottom: 14, letterSpacing: "0.04em", textTransform: "uppercase",
                  }}>
                    Resumen
                  </div>
                  {[
                    ["Pasadía",   selectedCard?.pasadia?.nombre],
                    ["Fecha",     form.fecha],
                    ["Personas",  `${totalPax} (${form.pax_a} adulto${form.pax_a !== 1 ? "s" : ""}${form.pax_n > 0 ? ` + ${form.pax_n} niño${form.pax_n !== 1 ? "s" : ""}` : ""})`],
                    selectedSalida ? ["Salida", `${selectedSalida.hora} — ${selectedSalida.nombre}`] : null,
                    ["Precio/persona", COP(precioPublico)],
                  ].filter(Boolean).map(([label, val]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
                      <span style={{ color: WARM_WHITE }}>{val}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${ORO}33`, paddingTop: 12, marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, color: WARM_WHITE, fontSize: 15 }}>Total</span>
                    <span style={{ fontWeight: 800, color: ORO_LIGHT, fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(totalCOP)}</span>
                  </div>
                </div>

                {/* Action buttons */}
                <button
                  onClick={handlePagarAhora}
                  disabled={!canSubmit || saving}
                  style={{
                    padding: "15px", borderRadius: 10, border: "none",
                    background: (canSubmit && !saving) ? `linear-gradient(135deg, ${ORO}, ${ORO_LIGHT})` : "rgba(255,255,255,0.08)",
                    color: (canSubmit && !saving) ? DARK : "rgba(255,255,255,0.3)",
                    fontWeight: 800, fontSize: 16, cursor: (canSubmit && !saving) ? "pointer" : "default",
                    fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em",
                    transition: "all 0.15s ease",
                  }}
                >
                  {saving ? "Procesando..." : "💳 Pagar Ahora"}
                </button>

                <button
                  onClick={handleReservarCupo}
                  disabled={!canSubmit || saving}
                  style={{
                    padding: "15px", borderRadius: 10,
                    border: (canSubmit && !saving) ? `1.5px solid ${ORO}` : "1.5px solid rgba(255,255,255,0.1)",
                    background: "transparent",
                    color: (canSubmit && !saving) ? ORO_LIGHT : "rgba(255,255,255,0.3)",
                    fontWeight: 700, fontSize: 16, cursor: (canSubmit && !saving) ? "pointer" : "default",
                    fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em",
                    transition: "all 0.15s ease",
                  }}
                >
                  {saving ? "Procesando..." : "📋 Reservar Cupo"}
                </button>

                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", lineHeight: 1.6 }}>
                  "Reservar Cupo" aparta tu lugar. El pago se realiza en el muelle antes del zarpe.
                </div>
              </div>
            </div>
          </section>
        )}

      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center", padding: "20px 16px",
        borderTop: `1px solid rgba(255,255,255,0.06)`,
        fontSize: 12, color: "rgba(255,255,255,0.2)", letterSpacing: "0.05em",
      }}>
        Atolon Beach Club · Tierra Bomba, Cartagena
      </div>
    </div>
  );
}
