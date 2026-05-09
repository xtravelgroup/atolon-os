// PagarTatiana — Página de checkout unificado para reservas_pasadia
// (creadas vía Tatiana / Visito.AI). Muestra DOS opciones de pago
// claramente separadas: 🇨🇴 Wompi (COP) y 🌎 Zoho Pay (USD).
//
// Ruta: /pagar/{reserva_id}
//
// Diferencias con PagoCliente.jsx (que es para reservas web/internas):
// - Lee de tabla reservas_pasadia (no reservas)
// - Diseño 2-button grid (no widget único)
// - Soporta multi-idioma (es, en) según reserva.idioma

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Brand
const C = {
  navy:    "#0D1B3E",
  navyMid: "#1a2952",
  navyLt:  "#2d3a5f",
  sand:    "#C8B99A",
  sky:     "#8ECAE6",
  pink:    "#F4C6D0",
  white:   "#fafafa",
  success: "#22c55e",
  warn:    "#f59e0b",
  danger:  "#ef4444",
};

const TRM_USD_COP = 4000;
const TASA_PORTUARIA = 18000;

const PRODUCTO_LABEL = {
  vip: "VIP Pass",
  exclusive: "Exclusive Pass",
  experience: "Atolón Experience",
  "after-island": "After Island",
};

// Traducciones inline (es, en)
const T = {
  es: {
    title: "Tu reserva está casi lista",
    subtitle: "Selecciona la forma de pago",
    summary: "Resumen de tu reserva",
    fecha: "Fecha",
    horario: "Salida",
    personas: "Personas",
    producto: "Producto",
    total: "Total",
    expira_en: "Tu cupo expira en",
    minutos: "minutos",
    pay_cop: "Tarjeta colombiana",
    pay_usd: "International card",
    pay_cop_sub: "Pago en pesos · Wompi",
    pay_usd_sub: "Pay in USD · Zoho Pay",
    confirmed: "¡Pago confirmado!",
    confirmed_msg: "Tu reserva está garantizada. Recibirás un email con todos los detalles.",
    expired: "Tu reserva ha expirado",
    expired_msg: "El tiempo para completar el pago ha vencido. Contáctanos para reactivar tu cupo.",
    cancelled: "Tu reserva fue cancelada",
    cancelled_msg: "Si necesitas ayuda, comunícate con nosotros.",
    contact_wa: "Contactar por WhatsApp",
    reminders_title: "Antes de tu visita",
    reminder_1: "Llega al muelle 30 minutos antes",
    reminder_2: "Trae documento de identidad original",
    reminder_3: "Tasa portuaria en efectivo",
    reminder_4: "Trae traje de baño, bloqueador y ganas de relajarte",
    quote: "Más cerca de Cartagena, pero lejos de lo ordinario.",
    powered_by: "Procesado por",
  },
  en: {
    title: "Your reservation is almost ready",
    subtitle: "Choose your payment method",
    summary: "Booking summary",
    fecha: "Date",
    horario: "Departure",
    personas: "Guests",
    producto: "Package",
    total: "Total",
    expira_en: "Your spot expires in",
    minutos: "minutes",
    pay_cop: "Colombian card",
    pay_usd: "International card",
    pay_cop_sub: "Pay in COP · Wompi",
    pay_usd_sub: "Pay in USD · Zoho Pay",
    confirmed: "Payment confirmed!",
    confirmed_msg: "Your booking is guaranteed. You'll receive an email with all the details.",
    expired: "Your reservation has expired",
    expired_msg: "Time to complete payment is over. Contact us to reactivate.",
    cancelled: "Your reservation was cancelled",
    cancelled_msg: "If you need help, get in touch.",
    contact_wa: "Contact via WhatsApp",
    reminders_title: "Before your visit",
    reminder_1: "Arrive at the dock 30 minutes early",
    reminder_2: "Bring original ID",
    reminder_3: "Port tax in cash",
    reminder_4: "Bring swimwear, sunscreen and good vibes",
    quote: "Closer to Cartagena, far from ordinary.",
    powered_by: "Processed by",
  },
};

export default function PagarTatiana() {
  const [reserva, setReserva] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [minutosRestantes, setMinutosRestantes] = useState(null);

  // Get reserva_id from URL: /pagar/{id}
  const reservaId = (() => {
    const path = (typeof window !== "undefined" ? window.location.pathname : "") || "";
    const m = path.match(/^\/?pagar\/([^/?#]+)/i);
    return m ? m[1] : "";
  })();

  // Load reserva
  useEffect(() => {
    if (!reservaId || !supabase) { setLoading(false); setErr("missing"); return; }
    supabase.from("reservas_pasadia").select("*").eq("id", reservaId).single()
      .then(({ data, error }) => {
        if (error || !data) { setErr("not_found"); setLoading(false); return; }
        setReserva(data);
        setLoading(false);
        // Wompi/Zoho redirige con ?status=APPROVED o ?status=success — recargar
        const params = new URLSearchParams(window.location.search);
        if (params.has("status") || params.has("transaction_id")) {
          setTimeout(() => window.location.reload(), 2000);
        }
      });
  }, [reservaId]);

  // Countdown
  useEffect(() => {
    if (!reserva?.expira_en) return;
    const tick = () => {
      const ms = new Date(reserva.expira_en).getTime() - Date.now();
      setMinutosRestantes(ms > 0 ? Math.ceil(ms / 60000) : 0);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [reserva]);

  const lang = reserva?.idioma === "en" ? "en" : "es";
  const t = T[lang];

  if (!reservaId) {
    return <ErrorScreen titulo="Link inválido" mensaje="Falta el ID de reserva" />;
  }
  if (loading) return <LoadingScreen />;
  if (err === "not_found" || !reserva) {
    return <ErrorScreen titulo={lang === "en" ? "Reservation not found" : "Reserva no encontrada"} mensaje={lang === "en" ? "This link is invalid or expired" : "Este link es inválido o expiró"} />;
  }

  // Confirmada → success screen
  if (reserva.estado === "confirmada") {
    return <SuccessScreen reserva={reserva} t={t} />;
  }

  // Cancelada
  if (reserva.estado === "cancelada") {
    return <ErrorScreen titulo={t.cancelled} mensaje={t.cancelled_msg} contactWA={t.contact_wa} />;
  }

  // Expirada
  if (minutosRestantes === 0) {
    return <ErrorScreen titulo={t.expired} mensaje={t.expired_msg} contactWA={t.contact_wa} />;
  }

  // Activa — mostrar opciones de pago
  return <CheckoutScreen reserva={reserva} t={t} minutosRestantes={minutosRestantes} />;
}

// ─── PANTALLA: CHECKOUT ─────────────────────────────────────────────────
function CheckoutScreen({ reserva, t, minutosRestantes }) {
  const [paymentLoading, setPaymentLoading] = useState(null); // 'wompi' | 'zoho'
  const [zohoSession, setZohoSession] = useState(null);

  const totalCOP = Number(reserva.total_cop || 0);
  const totalUSD = Math.ceil(totalCOP / TRM_USD_COP);
  const tasaTotal = TASA_PORTUARIA * Number(reserva.num_personas || 1);

  // Iniciar pago Wompi (widget)
  const pagarWompi = async () => {
    setPaymentLoading("wompi");
    // Cargar Wompi widget script si no está
    const script = document.createElement("script");
    script.src = "https://checkout.wompi.co/widget.js";
    script.async = true;
    script.onload = () => {
      // Get pub_key de configuracion (rehidratado en build via env)
      const pubKey = import.meta.env.VITE_WOMPI_PUB_KEY || "pub_prod_j2kColsiNhfHj27SWbi62nQpUTNFPZc1";
      const integrityKey = import.meta.env.VITE_WOMPI_INTEGRITY_KEY || "";
      // Wompi widget v2
      const checkout = new window.WidgetCheckout({
        currency:    "COP",
        amountInCents: totalCOP * 100,
        reference:   reserva.id,
        publicKey:   pubKey,
        signature:   { integrity: integrityKey ? signWompi(reserva.id, totalCOP, integrityKey) : undefined },
        redirectUrl: `${window.location.origin}/pagar/${reserva.id}`,
        customerData: {
          email:    reserva.cliente_email,
          fullName: reserva.cliente_nombre,
          phoneNumber: (reserva.cliente_telefono || "").replace(/\D/g, ""),
        },
      });
      checkout.open(() => {
        setPaymentLoading(null);
        setTimeout(() => window.location.reload(), 1500);
      });
    };
    script.onerror = () => {
      alert("No se pudo cargar Wompi. Intenta de nuevo.");
      setPaymentLoading(null);
    };
    document.body.appendChild(script);
  };

  // Iniciar pago Zoho Pay (widget embebido)
  const pagarZoho = async () => {
    setPaymentLoading("zoho");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/zoho-payments/create-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON}`,
          "apikey": SUPABASE_ANON,
        },
        body: JSON.stringify({
          amount:      totalUSD,
          currency:    "USD",
          reference:   reserva.id,
          description: `Atolón Beach Club · ${reserva.cliente_nombre}`,
          nombre:      reserva.cliente_nombre,
          email:       reserva.cliente_email,
          context:     "reservas_pasadia",
          context_id:  reserva.id,
        }),
      });
      const data = await res.json();
      if (data?.payments_session_id) {
        setZohoSession({
          sessionId: data.payments_session_id,
          accountId: data.widget?.account_id,
          apiKey:    data.widget?.api_key,
          domain:    data.widget?.domain || "US",
        });
      } else {
        alert("Error iniciando pago: " + (data?.error || "intenta de nuevo"));
        setPaymentLoading(null);
      }
    } catch (e) {
      alert("Error: " + e.message);
      setPaymentLoading(null);
    }
  };

  const fechaFormateada = formatFecha(reserva.fecha, reserva.idioma);

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px" }}>
        {/* Header con countdown */}
        <div style={{ background: C.navyMid, borderRadius: 14, padding: 18, marginBottom: 16, border: `1px solid ${C.sand}33` }}>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, color: C.sand, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            ATOLÓN
          </h1>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{t.title}</div>
          {minutosRestantes !== null && minutosRestantes > 0 && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: minutosRestantes <= 5 ? C.danger + "22" : C.warn + "15", borderRadius: 8, fontSize: 12, color: minutosRestantes <= 5 ? C.danger : C.warn, border: `1px solid ${minutosRestantes <= 5 ? C.danger : C.warn}44` }}>
              ⏱ {t.expira_en} <strong>{minutosRestantes} {t.minutos}</strong>
            </div>
          )}
        </div>

        {/* Resumen */}
        <div style={{ background: C.navyMid, borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{t.summary}</div>
          <Row label={t.producto} value={PRODUCTO_LABEL[reserva.producto] || reserva.producto} />
          <Row label={t.fecha} value={fechaFormateada} />
          <Row label={t.horario} value={reserva.horario_salida + " AM"} />
          <Row label={t.personas} value={String(reserva.num_personas)} />
          <div style={{ borderTop: `1px solid ${C.navyLt}`, marginTop: 10, paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>{t.total}</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.sand }}>${totalCOP.toLocaleString("es-CO")} COP</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>≈ ${totalUSD} USD</div>
              </div>
            </div>
          </div>
        </div>

        {/* 2 BOTONES DE PAGO */}
        <div style={{ fontSize: 11, color: C.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{t.subtitle}</div>
        <div style={{ display: "grid", gridTemplateColumns: window.innerWidth > 700 ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 16 }}>
          {/* WOMPI - COP */}
          <button onClick={pagarWompi} disabled={paymentLoading}
            style={{
              padding: "20px 16px", borderRadius: 14, border: `2px solid ${C.sky}66`,
              background: paymentLoading === "wompi" ? C.navyLt : `linear-gradient(135deg, ${C.navyMid}, ${C.navyLt})`,
              color: C.white, cursor: paymentLoading ? "wait" : "pointer", textAlign: "left",
              opacity: paymentLoading === "zoho" ? 0.5 : 1, transition: "all 0.2s",
            }}
            onMouseEnter={e => !paymentLoading && (e.currentTarget.style.borderColor = C.sky)}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🇨🇴</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t.pay_cop}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{t.pay_cop_sub}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.sand, marginTop: 10 }}>${totalCOP.toLocaleString("es-CO")} COP</div>
            {paymentLoading === "wompi" && <div style={{ fontSize: 11, color: C.sky, marginTop: 6 }}>Cargando...</div>}
          </button>

          {/* ZOHO - USD */}
          <button onClick={pagarZoho} disabled={paymentLoading}
            style={{
              padding: "20px 16px", borderRadius: 14, border: `2px solid ${C.pink}66`,
              background: paymentLoading === "zoho" ? C.navyLt : `linear-gradient(135deg, ${C.navyMid}, ${C.navyLt})`,
              color: C.white, cursor: paymentLoading ? "wait" : "pointer", textAlign: "left",
              opacity: paymentLoading === "wompi" ? 0.5 : 1, transition: "all 0.2s",
            }}
            onMouseEnter={e => !paymentLoading && (e.currentTarget.style.borderColor = C.pink)}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🌎</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t.pay_usd}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{t.pay_usd_sub}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.sand, marginTop: 10 }}>${totalUSD} USD</div>
            {paymentLoading === "zoho" && <div style={{ fontSize: 11, color: C.pink, marginTop: 6 }}>Cargando...</div>}
          </button>
        </div>

        {/* Recordatorios */}
        <div style={{ background: C.navyMid, borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: C.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{t.reminders_title}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.9 }}>
            <div>⏰ {t.reminder_1}</div>
            <div>🆔 {t.reminder_2}</div>
            <div>💵 {t.reminder_3}: <strong>${tasaTotal.toLocaleString("es-CO")} COP</strong></div>
            <div>🌴 {t.reminder_4}</div>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)", fontStyle: "italic", marginTop: 16 }}>
          {t.quote}
        </div>
      </div>

      {/* Zoho widget overlay */}
      {zohoSession && (
        <ZohoWidgetOverlay session={zohoSession} reservaId={reserva.id} onClose={() => { setZohoSession(null); setPaymentLoading(null); }} />
      )}
    </div>
  );
}

// ─── Pantallas auxiliares ───────────────────────────────────────────────
function SuccessScreen({ reserva, t }) {
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, color: C.sand, margin: "0 0 12px", textTransform: "uppercase" }}>
          {t.confirmed}
        </h1>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginBottom: 24, lineHeight: 1.6 }}>
          {t.confirmed_msg}
        </div>
        <div style={{ background: C.navyMid, borderRadius: 14, padding: 18, textAlign: "left", marginBottom: 16 }}>
          <Row label={t.producto} value={PRODUCTO_LABEL[reserva.producto]} />
          <Row label={t.fecha} value={formatFecha(reserva.fecha, reserva.idioma)} />
          <Row label={t.horario} value={reserva.horario_salida + " AM"} />
          <Row label={t.personas} value={String(reserva.num_personas)} />
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontStyle: "italic", marginTop: 16 }}>
          {t.quote}
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ titulo, mensaje, contactWA }) {
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "60px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, color: C.sand, margin: "0 0 12px" }}>{titulo}</h1>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 24 }}>{mensaje}</div>
        {contactWA && (
          <a href="https://wa.me/573180341155" target="_blank" rel="noreferrer"
            style={{ display: "inline-block", padding: "12px 24px", background: "#25D366", color: "#fff", borderRadius: 10, textDecoration: "none", fontWeight: 600 }}>
            💬 {contactWA}
          </a>
        )}
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={pageStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: C.sand }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🌊</div>
          <div style={{ fontSize: 14 }}>Cargando...</div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────
function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
      <span style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <span style={{ color: C.white, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function formatFecha(fecha, idioma) {
  if (!fecha) return "";
  const lang = idioma === "en" ? "en-US" : "es-CO";
  return new Date(fecha + "T12:00:00").toLocaleDateString(lang, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// Wompi signature (SHA256) para integridad — opcional según config
function signWompi(reference, amountCOP, integrityKey) {
  // Placeholder: si tenemos integrity key, frontend NO debería firmar (es backend job).
  // Para simplificar, se omite la firma y se usa redirect-based payment.
  return undefined;
}

const pageStyle = {
  minHeight: "100vh",
  background: `linear-gradient(180deg, ${C.navy} 0%, #050d24 100%)`,
  color: C.white,
  fontFamily: "Lato, system-ui, -apple-system, sans-serif",
};

// ─── Zoho Widget Overlay ────────────────────────────────────────────────
// Usa el widget embebido de Zoho Pay. En el callback de éxito, redirige
// para que la página recargue y el webhook tenga tiempo de actualizar BD.
function ZohoWidgetOverlay({ session, reservaId, onClose }) {
  useEffect(() => {
    // Cargar SDK de Zoho
    if (window.ZPayments) { initWidget(); return; }
    const script = document.createElement("script");
    script.src = "https://js.zohostatic.com/payments/checkout/v1/zpayments.js";
    script.async = true;
    script.onload = () => initWidget();
    script.onerror = () => { alert("No se pudo cargar Zoho Pay"); onClose(); };
    document.body.appendChild(script);

    function initWidget() {
      try {
        const instance = new window.ZPayments({
          account_id: session.accountId,
          domain:     session.domain,
          otherOptions: { api_key: session.apiKey },
        });
        instance.requestPaymentMethod({
          payments_session_id: session.sessionId,
        }).then(() => {
          // Pago iniciado correctamente. Webhook procesará la confirmación.
          setTimeout(() => window.location.reload(), 2000);
        }).catch(err => {
          console.error("Zoho payment error:", err);
          onClose();
        });
      } catch (e) {
        console.error("Zoho init error:", e);
        onClose();
      }
    }
  }, [session, onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: C.white, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ marginTop: 12 }}>Iniciando pago seguro...</div>
        <button onClick={onClose} style={{ marginTop: 20, padding: "8px 16px", background: "transparent", border: `1px solid ${C.sand}`, color: C.sand, borderRadius: 8, cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
