// ZohoPaymentWidget — Modal con el widget embebido de Zoho Payments.
// Lo usa BookingPopup (y cualquier flujo de pago internacional) cuando el
// merchant activo es Zoho Pay.
//
// Flujo:
//   1) Backend crea una Payment Session (edge function /zoho-payments/create-session)
//      → retorna { payments_session_id, widget: { account_id, api_key, domain } }
//   2) Este componente carga el script https://static.zohocdn.com/zpay/zpay-js/v1/zpayments.js
//   3) Inicializa `new window.ZPayments({ account_id, domain, otherOptions: { api_key } })`
//   4) Llama `instance.requestPaymentMethod({ amount, currency_code, payments_session_id, ... })`
//      → abre el iframe del widget con tarjeta/Apple Pay/Google Pay
//   5) El usuario paga → success/failure callback + webhook actualiza la reserva
//
// Documentación oficial:
//   https://www.zoho.com/us/payments/developerdocs/web-integration/integrate-widget/

import { useEffect, useRef, useState } from "react";
import { B } from "../brand";

const ZP_SCRIPT = "https://static.zohocdn.com/zpay/zpay-js/v1/zpayments.js";

function loadZpScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Sin window"));
    if (window.ZPayments) return resolve(window.ZPayments);
    // Si ya hay un <script> insertado, esperar a que cargue
    const existing = document.querySelector(`script[src="${ZP_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.ZPayments));
      existing.addEventListener("error", () => reject(new Error("Error cargando widget Zoho")));
      return;
    }
    const s = document.createElement("script");
    s.src = ZP_SCRIPT;
    s.async = true;
    s.onload = () => {
      if (window.ZPayments) resolve(window.ZPayments);
      else reject(new Error("Widget cargado pero ZPayments no expuesto"));
    };
    s.onerror = () => reject(new Error("No se pudo cargar el script del widget de Zoho"));
    document.head.appendChild(s);
  });
}

/**
 * @param {Object} props
 * @param {Object} props.session  - { payments_session_id, amount, currency, widget: {account_id, api_key, domain} }
 * @param {Object} props.address  - { name, email, phone }
 * @param {string} props.description - texto que ve el cliente
 * @param {string} props.invoiceNumber
 * @param {string} props.business - nombre del negocio (default: "Atolón Beach Club")
 * @param {Function} props.onSuccess - (paymentData) => void — invocado al aprobar
 * @param {Function} props.onError   - (error) => void
 * @param {Function} props.onClose   - () => void — al cerrar sin pagar
 */
export default function ZohoPaymentWidget({
  session,
  address = {},
  description = "Pago Atolón Beach Club",
  invoiceNumber = "",
  business = "Atolón Beach Club",
  onSuccess,
  onError,
  onClose,
}) {
  const [status, setStatus] = useState("loading"); // loading | ready | running | error
  const [errMsg, setErrMsg] = useState("");
  const instanceRef = useRef(null);

  // Cargar script + inicializar instancia
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!session?.payments_session_id) throw new Error("Falta payments_session_id");
        if (!session?.widget?.account_id || !session?.widget?.api_key) {
          throw new Error("Falta config del widget (account_id o api_key)");
        }
        const ZPayments = await loadZpScript();
        if (cancelled) return;

        const instance = new ZPayments({
          account_id: String(session.widget.account_id),
          domain:     session.widget.domain || "US",
          otherOptions: {
            api_key: session.widget.api_key,
          },
        });
        instanceRef.current = instance;
        setStatus("ready");
      } catch (err) {
        console.error("[ZohoPaymentWidget] init error:", err);
        if (!cancelled) {
          setErrMsg(err?.message || String(err));
          setStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session?.payments_session_id]);

  // Auto-abrir el widget cuando esté listo
  useEffect(() => {
    if (status !== "ready") return;
    abrirWidget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function abrirWidget() {
    const instance = instanceRef.current;
    if (!instance) return;
    setStatus("running");
    try {
      const options = {
        amount:              String(session.amount || ""),
        transaction_type:    "payment",
        currency_code:       session.currency || "USD",
        payments_session_id: session.payments_session_id,
        currency_symbol:     symbolFor(session.currency || "USD"),
        business,
        description,
        ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
        address: {
          name:  address.name  || "",
          email: address.email || "",
          phone: address.phone || "",
        },
      };
      const data = await instance.requestPaymentMethod(options);
      // Pago exitoso
      onSuccess?.(data);
    } catch (err) {
      // El usuario cerró el widget — no es error real
      if (err?.code === "widget_closed") {
        onClose?.();
        return;
      }
      console.error("[ZohoPaymentWidget] payment error:", err);
      setErrMsg(err?.message || JSON.stringify(err));
      setStatus("error");
      onError?.(err);
    } finally {
      try { await instance.close(); } catch {}
    }
  }

  // Cleanup
  useEffect(() => {
    return () => {
      try { instanceRef.current?.close?.(); } catch {}
      instanceRef.current = null;
    };
  }, []);

  // UI overlay durante carga / error
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(13,27,62,0.7)", zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: 32, maxWidth: 420, width: "100%",
        boxShadow: "0 12px 48px rgba(0,0,0,0.35)", textAlign: "center",
      }}>
        {status === "loading" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: B.navy }}>
              Preparando pago seguro…
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Cargando Zoho Payments
            </div>
          </>
        )}

        {status === "ready" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💳</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: B.navy }}>
              Abriendo checkout…
            </div>
          </>
        )}

        {status === "running" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💳</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: B.navy }}>
              Esperando confirmación de Zoho…
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Sigue las instrucciones en la ventana de pago.
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#b91c1c", marginBottom: 8 }}>
              No se pudo abrir el pago
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16, wordBreak: "break-word" }}>
              {errMsg || "Error desconocido"}
            </div>
            <button onClick={() => onClose?.()}
              style={{
                padding: "10px 20px", borderRadius: 8, background: B.navy, color: "#fff",
                border: "none", fontWeight: 700, cursor: "pointer",
              }}>
              Cerrar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function symbolFor(code) {
  const m = { USD: "$", EUR: "€", GBP: "£", COP: "$", MXN: "$", INR: "₹" };
  return m[code] || "$";
}
