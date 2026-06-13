import { useState, useEffect, useCallback, useRef } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl } from "../lib/wompi";
import { crearSesionPago, getMerchantInternacional } from "../lib/internacional";
import AvisoCargoInternacional from "../components/AvisoCargoInternacional";
import AtolanTrack from "../lib/AtolanTrack";
import { waSendConfirmacion } from "../lib/whatsapp";
import ZohoPaymentWidget from "../components/ZohoPaymentWidget";
import FacturaElectronicaForm, { FE_EMPTY, feValidate, fePayload } from "../lib/FacturaElectronicaForm.jsx";

// ─── helpers ────────────────────────────────────────────────────────────────
function getReservaId() {
  // /pago/R-1234567  or  /pago/WEB-xxx  or  /pago?id=R-1234567  or  /pago?reserva=WEB-xxx
  const parts = window.location.pathname.split("/");
  const fromPath = parts[parts.length - 1];
  if (fromPath && (fromPath.startsWith("R-") || fromPath.startsWith("WEB-"))) return fromPath;
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

function qrUrl(data, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data)}&size=${size}x${size}&bgcolor=162040&color=C8B99A&margin=10&format=png`;
}

// ─── pantalla: Pago Completado ──────────────────────────────────────────────
function PagoOk({ reserva, salida }) {
  const zarpeLink = `https://atolon.co/zarpe-info?id=${reserva.id}`;
  const horaTexto = salida?.hora ? `Salida: ${salida.hora}${salida.hora_regreso ? ` · Regreso: ${salida.hora_regreso}` : ""}` : "";

  // ── Facturación electrónica (movida post-pago para no inflar el step 2 del booking widget) ──
  const yaTieneFE = !!reserva.factura_electronica;
  const [feOpen,   setFeOpen]   = useState(false);
  const [feForm,   setFeForm]   = useState({
    ...FE_EMPTY,
    factura_electronica: true,
    fe_email:    reserva.email    || (reserva.contacto?.includes("@") ? reserva.contacto : ""),
    fe_telefono: reserva.tel      || reserva.telefono || (reserva.contacto && !reserva.contacto.includes("@") ? reserva.contacto : ""),
  });
  const [feSaving, setFeSaving] = useState(false);
  const [feSaved,  setFeSaved]  = useState(yaTieneFE);
  const [feError,  setFeError]  = useState("");
  const setFE = (k, v) => setFeForm(f => ({ ...f, [k]: v }));

  const guardarFE = async () => {
    const faltan = feValidate(feForm);
    if (faltan.length) {
      setFeError(`Falta llenar: ${faltan.map(f => f.replace(/^fe_/, "").replace(/_/g, " ")).join(", ")}`);
      return;
    }
    setFeError("");
    setFeSaving(true);
    const { error } = await supabase
      .from("reservas")
      .update(fePayload(feForm))
      .eq("id", reserva.id);
    setFeSaving(false);
    if (error) {
      setFeError("No se pudo guardar. Intenta de nuevo.");
      return;
    }
    setFeSaved(true);
    setFeOpen(false);
    AtolanTrack.evento("invoice_requested", { reserva_id: reserva.id, tipo_persona: feForm.fe_tipo_persona }, "post_payment");
  };

  // Pre-compute dock arrival time (20 min before departure)
  let llegadaHora = null;
  if (salida?.hora) {
    const parts = salida.hora.split(":");
    const totalMins = parseInt(parts[0]) * 60 + parseInt(parts[1]) - 20;
    const norm = ((totalMins % 1440) + 1440) % 1440;
    llegadaHora = `${String(Math.floor(norm / 60)).padStart(2,"0")}:${String(norm % 60).padStart(2,"0")}`;
  }
  const waMensaje = encodeURIComponent(
    `✅ ¡Reserva confirmada en Atolon Beach Club!\n\n` +
    `👤 ${reserva.nombre}\n` +
    `📅 ${new Date(reserva.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}\n` +
    (salida?.hora ? `⏰ Salida: ${salida.hora}${salida.hora_regreso ? ` · Regreso aprox. ${salida.hora_regreso}` : ""}\n` : "") +
    `🏝️ ${reserva.tipo} · ${reserva.pax} personas\n\n` +
    `🚢 Embarque: Muelle de La Bodeguita — Puerta 1\n` +
    `⏰ Llegar 20 min antes de la salida\n` +
    `💵 Impuesto de muelle: $18.000 COP (no incluido)\n` +
    `🚫 No se permite el ingreso de alimentos ni bebidas a Atolón Beach Club\n\n` +
    `📄 Completa tus datos de zarpe aquí:\n${zarpeLink}`
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Success header */}
      <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, marginBottom: 6, color: B.success }}>¡Pago recibido!</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Tu reserva está confirmada</p>
      </div>

      {/* Aviso del nombre del cargo — solo cuando pagó con tarjeta internacional */}
      {(reserva.forma_pago === "stripe" || reserva.forma_pago === "zoho_pay" || reserva.forma_pago === "Tarjeta Internacional") && (
        <div style={{ background: `${B.sand}15`, border: `1px solid ${B.sand}44`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ fontSize: 22, marginTop: 2 }}>💳</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Tarjeta aprobada</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>
              El cargo en tu estado de cuenta aparecerá a nombre de{" "}
              <strong style={{ color: B.sand }}>X Travel Group</strong>.
            </div>
          </div>
        </div>
      )}

      {/* QR code */}
      <div style={{ background: B.navyMid, borderRadius: 18, padding: 24, textAlign: "center", border: `1px solid rgba(200,185,154,0.2)` }}>
        <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Código de embarque</div>
        <div style={{ display: "inline-block", padding: 10, background: "#162040", borderRadius: 14, border: `2px solid ${B.sand}`, marginBottom: 12 }}>
          <img
            src={qrUrl(reserva.id, 160)}
            alt={`QR ${reserva.id}`}
            width={160} height={160}
            style={{ display: "block", borderRadius: 6 }}
          />
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: 2, color: B.sand }}>{reserva.id}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Muestra este QR al llegar al muelle</div>
      </div>

      {/* Reservation summary */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 18, fontSize: 13, lineHeight: 2.2 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: B.sand }}>Nombre</span><span style={{ fontWeight: 600 }}>{reserva.nombre}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: B.sand }}>Fecha</span><span style={{ textTransform: "capitalize" }}>{new Date(reserva.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "long" })}</span></div>
        {llegadaHora && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: B.sand }}>Hora Llegada Muelle</span>
            <span style={{ fontWeight: 700, color: B.sand }}>{llegadaHora}</span>
          </div>
        )}
        {salida?.hora && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: B.sand }}>Salida</span>
            <span style={{ fontWeight: 700, color: B.sky }}>{salida.hora}</span>
          </div>
        )}
        {salida?.hora_regreso && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: B.sand }}>Regreso</span>
            <span style={{ fontWeight: 700, color: B.sky }}>{salida.hora_regreso}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: B.sand }}>Pasadía</span><span>{reserva.tipo}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: B.sand }}>Personas</span><span>{reserva.pax}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${B.navyLight}`, paddingTop: 8, marginTop: 4 }}>
          <span style={{ fontWeight: 700 }}>Total pagado</span>
          <span style={{ fontWeight: 700, color: B.success, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17 }}>{COP(reserva.total)}</span>
        </div>
      </div>

      {/* Embarkation info */}
      <div style={{ background: "rgba(52,211,153,0.06)", borderRadius: 14, padding: 18, border: "1px solid rgba(52,211,153,0.2)" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: B.success }}>🚢 Información de embarque</div>
        <div style={{ fontSize: 13, lineHeight: 2.3, color: "rgba(255,255,255,0.8)" }}>
          <div>📍 <strong>Muelle de La Bodeguita — Puerta 1</strong></div>
          <div>⏰ Llegar <strong>20 minutos antes</strong> de la salida</div>
          <div>💵 Impuesto de muelle: <strong style={{ color: B.sand }}>COP 18.000</strong> (no incluido)</div>
          <div>🆔 Traer documento de identidad original</div>
          <div style={{ color: B.danger, fontWeight: 600 }}>🚫 No se permite el ingreso de alimentos ni bebidas a Atolón Beach Club</div>
        </div>
      </div>

      {/* Zarpe link */}
      <a href={zarpeLink}
        style={{ display: "block", background: "rgba(200,185,154,0.12)", border: `1px solid rgba(200,185,154,0.3)`, borderRadius: 14, padding: "16px 20px", textDecoration: "none", color: B.white }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: B.sand, marginBottom: 4 }}>📄 Completa tus datos de zarpe</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
          Ingresa nombre, identificación y nacionalidad de todos los viajeros para agilizar el embarque.
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: B.sand }}>Abrir →</div>
      </a>

      {/* Facturación electrónica DIAN — POST-pago, opcional */}
      <div style={{ background: feSaved ? "rgba(52,211,153,0.06)" : "rgba(251,191,36,0.06)", border: `1px solid ${feSaved ? "rgba(52,211,153,0.25)" : "rgba(251,191,36,0.25)"}`, borderRadius: 14, padding: "16px 20px" }}>
        {feSaved ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: B.success, marginBottom: 2 }}>
                Factura electrónica solicitada
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
                Te llegará al correo registrado en 24-48h hábiles.
              </div>
            </div>
          </div>
        ) : !feOpen ? (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22, marginTop: -2 }}>🧾</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: B.white, marginBottom: 2 }}>
                  ¿Necesitas factura electrónica DIAN?
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
                  Si requieres factura electrónica DIAN para tu empresa o gastos personales, ingresa los datos aquí.
                </div>
              </div>
            </div>
            <button onClick={() => setFeOpen(true)}
              style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: `1px solid rgba(251,191,36,0.4)`, background: "rgba(251,191,36,0.1)", color: "#fbbf24", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Sí, requiero factura electrónica
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: B.white }}>🧾 Datos de facturación</div>
              <button onClick={() => { setFeOpen(false); setFeError(""); }}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", padding: 0 }}>
                Cancelar
              </button>
            </div>
            <FacturaElectronicaForm form={feForm} set={setFE} editing={true} theme="dark" />
            {feError && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, fontSize: 12, color: B.danger }}>
                {feError}
              </div>
            )}
            <button onClick={guardarFE} disabled={feSaving}
              style={{ width: "100%", marginTop: 12, padding: "12px 0", borderRadius: 10, border: "none", background: feSaving ? "rgba(251,191,36,0.4)" : "#fbbf24", color: "#1A2740", fontWeight: 700, fontSize: 14, cursor: feSaving ? "wait" : "pointer" }}>
              {feSaving ? "Guardando..." : "Solicitar factura electrónica"}
            </button>
          </>
        )}
      </div>

      {/* WhatsApp save */}
      <a href={`https://wa.me/?text=${waMensaje}`} target="_blank" rel="noreferrer"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#25D366", borderRadius: 14, padding: "14px 20px", textDecoration: "none", color: "#fff", fontWeight: 700, fontSize: 14 }}>
        <span style={{ fontSize: 20 }}>💬</span>
        Guardar confirmación en WhatsApp
      </a>

      <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.25)", paddingBottom: 8 }}>
        Atolon Beach Club · Cartagena de Indias
      </p>
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
  const [salida,  setSalida]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState("");

  const secsLeft = useCountdown(reserva?.link_expira_at);
  // Tratamos null (no cargado aun) como "sin expirar" para evitar
  // flash de UI de expirado durante el primer render (null < 120 = true).
  const expirado = secsLeft === 0;
  const yaPagado = reserva?.estado === "confirmado" || reserva?.estado === "pagado";

  // Wompi redirige con ?id=TRANSACTION_ID después del pago.
  // Stripe redirige con ?session_id=cs_...
  // NO confirmamos client-side — el webhook firmado es la unica autoridad.
  // El cliente solo refetcha y muestra el estado real de la reserva.
  const params         = new URLSearchParams(window.location.search);
  const wompiTxId      = params.get("id") || "";
  const stripeSessionId = params.get("session_id") || "";

  const fetchReserva = useCallback(async () => {
    if (!supabase || !reservaId) { setError("Link inválido"); setLoading(false); return; }
    const { data, error: err } = await supabase.from("reservas").select("*").eq("id", reservaId).single();
    if (err || !data) { setError("Reserva no encontrada"); setLoading(false); return; }

    // Auto-cancel si el link ya expiró y aún está en pendiente_pago
    if (data.estado === "pendiente_pago" && data.link_expira_at && new Date(data.link_expira_at) < new Date()) {
      await supabase.from("reservas").update({ estado: "cancelado", notas: (data.notas || "") + " · Auto-cancelado: link expirado sin pago" }).eq("id", reservaId);
      data.estado = "cancelado";
    }

    setReserva(data);
    // Traer salida para mostrar la hora de salida
    if (data.salida_id) {
      const { data: sal } = await supabase.from("salidas").select("id, nombre, hora, hora_regreso").eq("id", data.salida_id).single();
      if (sal) setSalida(sal);
    }
    setLoading(false);
  }, [reservaId]);

  useEffect(() => { fetchReserva(); }, [fetchReserva]);

  // ─── Post-redirect del proveedor de pago ─────────────────────────────────
  // NO confirmamos client-side. El webhook firmado (stripe-webhook /
  // wompi-webhook / zoho-payments) es la unica autoridad para marcar
  // reserva.estado=confirmado y poblar abono/saldo. Aca solo polleamos
  // hasta que la reserva ya este confirmada y limpiamos la URL para que
  // recargar no re-dispare nada.
  const conversionTrackedRef = useRef(false);
  useEffect(() => {
    const tieneTrigger = !!(wompiTxId || stripeSessionId);
    if (!tieneTrigger || !reservaId || !supabase) return;

    // Limpiar query params para que reload no re-dispare la logica.
    try {
      const u = new URL(window.location.href);
      u.search = "";
      window.history.replaceState({}, "", u.toString());
    } catch { /* noop */ }

    // Polleo cada 2s hasta 30s. El webhook tiene typically <5s.
    let cancelado = false;
    let intentos = 0;
    const maxIntentos = 15;

    const poll = async () => {
      if (cancelado) return;
      intentos++;
      const { data } = await supabase
        .from("reservas")
        .select("id, estado, total, abono, saldo, lead_id, tipo, pax_a, pax_n, fecha, email, contacto")
        .eq("id", reservaId)
        .single();

      if (data?.estado === "confirmado" || data?.estado === "pagado") {
        setReserva((prev) => ({ ...prev, ...data }));
        // Tracking de conversion (lado cliente) — idempotente via ref
        if (!conversionTrackedRef.current) {
          conversionTrackedRef.current = true;
          AtolanTrack.init().then(() => {
            AtolanTrack.conversion(reservaId, data.total || 0, {
              metodo_pago:  data.forma_pago || (wompiTxId ? "wompi" : "stripe"),
              package_type: data.tipo,
              adultos:      data.pax_a,
              ninos:        data.pax_n,
              fecha:        data.fecha,
              monto_bruto:  data.total,
            });
            AtolanTrack.serverEvent("conversion_confirmed",
              { reserva_id: reservaId, monto: data.total }, "conversion");
          }).catch(() => {});
        }
        return;
      }

      if (intentos < maxIntentos && !cancelado) {
        setTimeout(poll, 2000);
      }
      // Si despues de 30s no se confirmo, mostramos estado actual.
      // El usuario puede recargar manualmente. El webhook eventualmente
      // confirmara — esta es solo la primera ventana post-redirect.
    };

    poll();
    return () => { cancelado = true; };
  }, [wompiTxId, stripeSessionId, reservaId]);

  const pagarWompi = async () => {
    if (!reserva) return;
    // Re-fetch para evitar pagar una reserva ya pagada por otro canal o
    // cuyo link expiro mientras el tab estaba abierto.
    const { data: fresh } = await supabase.from("reservas")
      .select("id, estado, total, saldo, link_expira_at, contacto, email").eq("id", reserva.id).single();
    if (!fresh) { setError("Reserva no encontrada"); return; }
    if (fresh.estado === "confirmado" || fresh.estado === "pagado") {
      setReserva(prev => ({ ...prev, ...fresh }));
      return;
    }
    if (fresh.link_expira_at && new Date(fresh.link_expira_at) < new Date()) {
      setError("Este link ya expiró. Solicitá uno nuevo a la agencia.");
      setReserva(prev => ({ ...prev, ...fresh }));
      return;
    }
    setProcesando("wompi");
    const redirectUrl = window.location.href.split("?")[0];
    const url = await wompiCheckoutUrl({
      referencia: fresh.id,
      totalCOP: Number(fresh.saldo) > 0 ? Number(fresh.saldo) : Number(fresh.total),
      email: fresh.contacto?.includes("@") ? fresh.contacto : "",
      redirectUrl,
    });
    window.location.href = url;
  };

  // Sesión de Zoho Pay activa (cuando se está mostrando el widget embebido)
  const [zohoSession, setZohoSession] = useState(null);

  const pagarStripe = async () => {
    if (!reserva) return;
    // Re-fetch: la fuente de verdad es la BD, no el state que puede
    // estar stale si el tab estuvo abierto un rato.
    const { data: fresh } = await supabase.from("reservas")
      .select("id, estado, total, saldo, link_expira_at, tipo, fecha, nombre, contacto").eq("id", reserva.id).single();
    if (!fresh) { setError("Reserva no encontrada"); return; }
    if (fresh.estado === "confirmado" || fresh.estado === "pagado") {
      setReserva(prev => ({ ...prev, ...fresh }));
      return;
    }
    if (fresh.link_expira_at && new Date(fresh.link_expira_at) < new Date()) {
      setError("Este link ya expiró. Solicitá uno nuevo a la agencia.");
      setReserva(prev => ({ ...prev, ...fresh }));
      return;
    }
    setProcesando("stripe");
    try {
      // Tasa USD/COP fallback (4200). El verdadero blindaje contra fraude de
      // monto es el webhook firmado que reconcilia amount_total contra
      // reserva.total leido de DB (ver stripe-webhook + zoho-payments).
      const tasa = 4200;
      const totalACobrar = Number(fresh.saldo) > 0 ? Number(fresh.saldo) : Number(fresh.total);
      const amountUSD = Math.ceil(totalACobrar / tasa);
      const session = await crearSesionPago({
        amount: amountUSD,
        currency: "USD",
        reference: fresh.id,
        description: `${fresh.tipo || "Atolón"} — ${fresh.fecha || ""}`,
        nombre: fresh.nombre,
        email: fresh.contacto?.includes("@") ? fresh.contacto : undefined,
        fecha: fresh.fecha,
        context: "reserva",
        context_id: fresh.id,
      });
      // Nuevo flujo: widget embebido (Zoho Pay) — abre modal con el widget
      if (session?.payments_session_id && session?.widget?.account_id) {
        setZohoSession(session);
        // No reseteamos `procesando` — el widget se monta y maneja el flujo
        return;
      }
      // Compat: viejo flujo de redirect URL
      if (session?.url) {
        window.location.href = session.url;
      } else {
        alert("No se pudo iniciar el pago con tarjeta internacional. Intenta de nuevo.");
        setProcesando("");
      }
    } catch (e) {
      alert("Error: " + (e.message || "conexión"));
      setProcesando("");
    }
  };

  // ── Layout wrapper ──────────────────────────────────────────────────────
  const wrap = (content) => (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <img src="/atolon-logo-white.png" alt="Atolon Beach Club" style={{ height: 52, objectFit: "contain", display: "block", margin: "0 auto" }} />
      </div>
      <div style={{ background: B.navyMid, borderRadius: 20, padding: 32, width: "100%", maxWidth: 440 }}>
        {content}
      </div>

      {/* Widget de Zoho Pay (overlay) — se monta cuando zohoSession está activa */}
      {zohoSession && (
        <ZohoPaymentWidget
          session={zohoSession}
          description={`${reserva?.tipo || "Atolón"} — ${reserva?.fecha || ""}`}
          invoiceNumber={reserva?.id || ""}
          business="Atolón Beach Club"
          address={{
            name:  reserva?.nombre || "",
            email: reserva?.contacto?.includes("@") ? reserva.contacto : "",
            phone: reserva?.contacto && !reserva.contacto.includes("@") ? reserva.contacto : "",
          }}
          onSuccess={() => {
            // El webhook va a marcar la reserva como confirmada. Refrescamos.
            setZohoSession(null);
            setProcesando("");
            setTimeout(fetchReserva, 1500);
          }}
          onError={(err) => {
            setZohoSession(null);
            setProcesando("");
            alert("Error en el pago: " + (err?.message || "Intenta de nuevo"));
          }}
          onClose={() => {
            setZohoSession(null);
            setProcesando("");
          }}
        />
      )}
    </div>
  );

  if (loading) return wrap(<div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>Cargando...</div>);
  if (error) return wrap(<div style={{ textAlign: "center", color: B.danger, padding: 40 }}>{error}</div>);
  if (yaPagado) return wrap(<PagoOk reserva={reserva} salida={salida} />);
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

        <AvisoCargoInternacional lang="es" />
      </div>

      <p style={{ marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
        Pago seguro · Atolon Beach Club SAS · NIT 901.873.457
      </p>
    </div>
  );
}
