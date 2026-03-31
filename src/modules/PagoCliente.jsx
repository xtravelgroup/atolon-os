import { useState, useEffect, useCallback } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl, wompiTransactionStatus } from "../lib/wompi";

// ─── helpers ────────────────────────────────────────────────────────────────
function getReservaId() {
  // /pago/R-1234567  or  /pago?id=R-1234567  or  /pago?reserva=WEB-xxx
  const parts = window.location.pathname.split("/");
  const fromPath = parts[parts.length - 1];
  if (fromPath && fromPath.startsWith("R-")) return fromPath;
  const p = new URLSearchParams(window.location.search);
  return p.get("reserva") || p.get("id") || "";
}

function useCountdown(expiresAt) {
  const [secsLeft, setSecsLeft] = useState(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = Math.floor((new Date(expiresAt) - Date.now()) / 1000);
      setSecsLeft(Math.max(diff, 0));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);
  return secsLeft;
}

function fmtTime(secs) {
  if (secs === null) return "--:--";
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── pantalla: Pago Completado ──────────────────────────────────────────────
function PagoOk({ reserva }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, marginBottom: 8, color: B.success }}>¡Pago recibido!</h2>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 24, fontSize: 15 }}>
        Tu reserva en Atolon Beach Club está confirmada
      </p>
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, maxWidth: 360, margin: "0 auto", textAlign: "left", fontSize: 14, lineHeight: 2 }}>
        <div><span style={{ color: B.sand }}>Nombre:</span> {reserva.nombre}</div>
        <div><span style={{ color: B.sand }}>Fecha:</span> {new Date(reserva.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        <div><span style={{ color: B.sand }}>Pasadía:</span> {reserva.tipo}</div>
        <div><span style={{ color: B.sand }}>Personas:</span> {reserva.pax}</div>
        <div><span style={{ color: B.sand }}>Total:</span> <strong style={{ color: B.success }}>{COP(reserva.total)}</strong></div>
      </div>
      <p style={{ marginTop: 24, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Presenta esta pantalla al llegar al club</p>
    </div>
  );
}

// ─── pantalla: Link Expirado ────────────────────────────────────────────────
function LinkExpirado() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>⏱️</div>
      <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, color: B.danger, marginBottom: 12 }}>Link expirado</h2>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
        El tiempo para completar el pago ha vencido.<br />
        Contacta a la agencia para generar un nuevo link.
      </p>
    </div>
  );
}

// ─── componente principal ───────────────────────────────────────────────────
export default function PagoCliente() {
  const reservaId = getReservaId();
  const [reserva, setReserva] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState("");

  const secsLeft = useCountdown(reserva?.link_expira_at);
  const expirado = secsLeft !== null && secsLeft === 0;
  const yaPagado = reserva?.estado === "confirmado" || reserva?.estado === "pagado";

  // Wompi redirige con ?id=TRANSACTION_ID después del pago
  const params       = new URLSearchParams(window.location.search);
  const wompiTxId    = params.get("id") || "";
  const leadIdParam  = params.get("lead") || "";

  const fetchReserva = useCallback(async () => {
    if (!supabase || !reservaId) { setError("Link inválido"); setLoading(false); return; }
    const { data, error: err } = await supabase.from("reservas").select("*").eq("id", reservaId).single();
    if (err || !data) { setError("Reserva no encontrada"); setLoading(false); return; }
    setReserva(data);
    setLoading(false);
  }, [reservaId]);

  useEffect(() => { fetchReserva(); }, [fetchReserva]);

  // Cuando Wompi redirige de vuelta: verificar estado real de la transacción
  useEffect(() => {
    if (!wompiTxId || !reservaId || !supabase) return;
    (async () => {
      const status = await wompiTransactionStatus(wompiTxId);
      if (status === "APPROVED") {
        const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
        // Confirmar reserva
        await supabase.from("reservas").update({
          estado: "confirmado", forma_pago: "wompi", saldo: 0,
        }).eq("id", reservaId);
        // Cerrar lead en Comercial
        if (leadIdParam) {
          await supabase.from("leads").update({
            stage: "Cerrado Ganado",
            ultimo_contacto: hoy,
          }).eq("id", leadIdParam);
        }
        fetchReserva();
      }
    })();
  }, [wompiTxId, reservaId, leadIdParam, fetchReserva]);

  const pagarWompi = async () => {
    if (!reserva) return;
    setProcesando("wompi");
    const url = await wompiCheckoutUrl({
      referencia: reserva.id,
      totalCOP: reserva.total,
      email: reserva.contacto?.includes("@") ? reserva.contacto : "",
    });
    // Redirigir en la misma ventana — sin redirect-url para evitar 403 en localhost
    window.location.href = url;
  };

  const pagarStripe = async () => {
    setProcesando("stripe");
    // TODO: llamar Edge Function para crear Stripe Checkout Session
    alert("Stripe internacional — próximamente disponible. Usa transferencia o llama a la agencia.");
    setProcesando("");
  };

  // ── Layout wrapper ──────────────────────────────────────────────────────
  const wrap = (content) => (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${B.sand}, ${B.sky})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 24, fontWeight: 700, color: B.navy }}>A</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, letterSpacing: 1, color: "rgba(255,255,255,0.6)" }}>ATOLON BEACH CLUB</div>
      </div>
      <div style={{ background: B.navyMid, borderRadius: 20, padding: 32, width: "100%", maxWidth: 440 }}>
        {content}
      </div>
    </div>
  );

  if (loading) return wrap(<div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>Cargando...</div>);
  if (error) return wrap(<div style={{ textAlign: "center", color: B.danger, padding: 40 }}>{error}</div>);
  if (yaPagado || pagoOk) return wrap(<PagoOk reserva={reserva} />);
  if (expirado) return wrap(<LinkExpirado />);

  return wrap(
    <div>
      {/* Countdown */}
      {reserva.link_expira_at && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: secsLeft < 120 ? B.danger + "22" : B.success + "15", borderRadius: 10, padding: "10px 16px", marginBottom: 24, border: `1px solid ${secsLeft < 120 ? B.danger + "44" : B.success + "33"}` }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Tiempo para pagar</span>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: secsLeft < 120 ? B.danger : B.success }}>{fmtTime(secsLeft)}</span>
        </div>
      )}

      {/* Resumen reserva */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, marginBottom: 4 }}>Completa tu pago</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>Atolon Beach Club · Cartagena</p>
        <div style={{ background: B.navy, borderRadius: 12, padding: "14px 18px", fontSize: 13, lineHeight: 2.2 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Nombre</span>
            <span style={{ fontWeight: 600 }}>{reserva.nombre}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Fecha</span>
            <span>{new Date(reserva.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Pasadía</span>
            <span>{reserva.tipo}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>Personas</span>
            <span>{reserva.pax}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${B.navyLight}`, marginTop: 8, paddingTop: 8 }}>
            <span style={{ fontWeight: 700 }}>Total</span>
            <span style={{ fontWeight: 700, fontSize: 18, fontFamily: "'Barlow Condensed', sans-serif", color: B.sand }}>{COP(reserva.total)}</span>
          </div>
        </div>
      </div>

      {/* Opciones de pago */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Selecciona tu método de pago</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Tarjeta Colombia — Wompi */}
        <button onClick={pagarWompi} disabled={!!procesando}
          style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: procesando === "wompi" ? "#5B4CF5" + "33" : B.navy, border: `2px solid ${procesando === "wompi" ? "#5B4CF5" : B.navyLight}`, borderRadius: 14, cursor: procesando ? "default" : "pointer", width: "100%", color: B.white, textAlign: "left" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#5B4CF5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#fff", flexShrink: 0 }}>W</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>🇨🇴 Tarjeta Colombia</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Débito / Crédito · PSE · Nequi · Bancolombia</div>
          </div>
          {procesando === "wompi" ? <span style={{ fontSize: 12, color: "#5B4CF5" }}>Abriendo...</span> : <span style={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }}>›</span>}
        </button>

        {/* Tarjeta Internacional — Stripe */}
        <button onClick={pagarStripe} disabled={!!procesando}
          style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: procesando === "stripe" ? "#635BFF" + "33" : B.navy, border: `2px solid ${procesando === "stripe" ? "#635BFF" : B.navyLight}`, borderRadius: 14, cursor: procesando ? "default" : "pointer", width: "100%", color: B.white, textAlign: "left" }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#635BFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>S</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>🌍 Tarjeta Internacional</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Visa · Mastercard · Amex · USD / EUR</div>
          </div>
          {procesando === "stripe" ? <span style={{ fontSize: 12, color: "#635BFF" }}>Redirigiendo...</span> : <span style={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }}>›</span>}
        </button>
      </div>

      <p style={{ marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
        Pago seguro · Atolon Beach Club SAS · NIT 901.xxx.xxx
      </p>
    </div>
  );
}
