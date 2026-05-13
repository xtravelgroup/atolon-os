// EmailOCModal — Envía la OC al proveedor por correo con PDF adjunto.
// Genera el PDF con jsPDF en el cliente y llama al edge function send-oc-proveedor.
// jsPDF es ~400KB (130KB gzip) — lo cargamos LAZY al momento de generar
// el PDF, no en el bundle de Compras / Requisiciones.
import React, { useState, useEffect } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";

export default function EmailOCModal({ oc, onClose, currentUser, reload }) {
  const { isMobile } = useBreakpoint();
  const [step, setStep] = useState("compose"); // compose | sending | sent | error
  const [to, setTo] = useState(oc.proveedor_email || "");
  const [cc, setCc] = useState(currentUser?.email || "erickern1@gmail.com");
  const [mensaje, setMensaje] = useState("");
  const [conPDF, setConPDF] = useState(true);
  const [error, setError] = useState("");
  const [resendId, setResendId] = useState("");
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    supabase.from("oc_emails_enviados")
      .select("*").eq("oc_id", oc.id)
      .order("enviado_at", { ascending: false })
      .then(({ data }) => setHistorial(data || []));
  }, [oc.id]);

  const generarPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const m = 14;
    let y = 20;

    // Header
    doc.setFontSize(10).setTextColor(150);
    doc.text("INTEROP COLOMBIA SAS", m, y);
    y += 6;
    doc.setFontSize(18).setTextColor(0);
    doc.text(`Orden de Compra ${oc.codigo}`, m, y);
    y += 8;
    doc.setFontSize(9).setTextColor(100);
    doc.text(`Fecha emisión: ${oc.fecha_emision || "—"}`, m, y);
    y += 10;

    // Proveedor
    doc.setFontSize(10).setTextColor(80);
    doc.text("PROVEEDOR", m, y); y += 5;
    doc.setFontSize(11).setTextColor(0);
    doc.text(oc.proveedor_nombre || "—", m, y); y += 5;
    if (oc.proveedor_nit) { doc.setFontSize(9).setTextColor(80); doc.text(`NIT: ${oc.proveedor_nit}`, m, y); y += 4; }
    if (oc.proveedor_email) { doc.text(oc.proveedor_email, m, y); y += 4; }
    y += 6;

    // Items table header — SOLO cantidades para el proveedor (sin precios).
    // El proveedor cotiza con sus precios y respondemos con cotización aprobada.
    doc.setFillColor(13, 27, 62);
    doc.rect(m, y, 182, 7, "F");
    doc.setTextColor(255).setFontSize(9);
    doc.text("#", m + 2, y + 5);
    doc.text("Ítem", m + 10, y + 5);
    doc.text("Cantidad", m + 145, y + 5, { align: "right" });
    doc.text("Unidad", m + 178, y + 5, { align: "right" });
    y += 9;

    doc.setTextColor(0).setFontSize(9);
    (oc.items || []).forEach((it, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(String(i + 1), m + 2, y);
      doc.text(String(it.item || it.nombre || "—").slice(0, 80), m + 10, y);
      doc.text(String(it.cant || 0), m + 145, y, { align: "right" });
      doc.text(String(it.unidad || ""), m + 178, y, { align: "right" });
      y += 5;
    });
    y += 8;

    // Mensaje de solicitud de cotización (en lugar del total)
    doc.setFontSize(10).setTextColor(13, 27, 62).setFont(undefined, "bold");
    doc.text("Por favor confirme disponibilidad y envíe cotización con sus precios.", m, y);
    doc.setFont(undefined, "normal");
    y += 12;

    // Notas
    if (oc.notas) {
      doc.setFontSize(9).setTextColor(100);
      doc.text("Notas:", m, y); y += 5;
      doc.setTextColor(0);
      doc.text(doc.splitTextToSize(oc.notas, 180), m, y);
      y += 12;
    }

    // Footer
    doc.setFontSize(8).setTextColor(120);
    doc.text("Entrega: Bodeguita (Cartagena). Coordinar con muelle antes de despachar.", m, 285);
    doc.text("Interop Colombia SAS · Cartagena, Colombia", m, 290);

    return doc.output("datauristring").split(",")[1]; // base64 puro sin el prefijo
  };

  const enviar = async () => {
    setError("");
    if (!to.trim()) return setError("El destinatario es requerido.");
    setStep("sending");
    try {
      const pdfBase64 = conPDF ? await generarPDF() : null;
      const toList = to.split(",").map(s => s.trim()).filter(Boolean);
      const ccList = cc.split(",").map(s => s.trim()).filter(Boolean);

      const { data, error } = await supabase.functions.invoke("send-oc-proveedor", {
        body: {
          to: toList,
          cc: ccList,
          oc,
          pdfBase64,
          customMessage: mensaje || null,
          replyTo: currentUser?.email || "compras@atolon.co",
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Error desconocido");
      setResendId(data.id || "");

      // Registrar envío
      await supabase.from("oc_emails_enviados").insert({
        id: `EMAIL_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        oc_id: oc.id,
        oc_codigo: oc.codigo,
        enviado_a: toList,
        cc: ccList,
        asunto: `Orden de Compra ${oc.codigo} · Atolón`,
        cuerpo_custom: mensaje || null,
        con_pdf: !!pdfBase64,
        resend_id: data.id || null,
        enviado_por: currentUser?.email || null,
      });

      // Cambiar estado de la OC a 'enviada' si estaba 'emitida'
      if (oc.estado === "emitida") {
        await supabase.from("ordenes_compra").update({
          estado: "enviada", enviada_at: new Date().toISOString(),
        }).eq("id", oc.id);
      }

      setStep("sent");
      setTimeout(() => { reload?.(); }, 500);
    } catch (e) {
      setError(String(e?.message || e));
      setStep("error");
    }
  };

  return (
    <div style={overlay}>
      <div style={{
        background: B.navy, borderRadius: 12, width: isMobile ? "100%" : 600,
        maxWidth: "100%", maxHeight: "92vh", overflow: "auto",
        border: `1px solid ${B.navyLight}`, color: B.white,
      }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: B.sand }}>📧 Enviar OC al proveedor</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{oc.codigo} · {oc.proveedor_nombre || "—"} · {COP(oc.total || 0)}</div>
          </div>
          <button onClick={onClose} style={btnClose}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          {step === "compose" && (
            <>
              <Field label="Para *">
                <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="proveedor@empresa.com (separa con coma para varios)" style={input} />
              </Field>
              <Field label="CC">
                <input type="email" value={cc} onChange={e => setCc(e.target.value)} style={input} />
              </Field>
              <Field label="Mensaje personalizado (opcional)">
                <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={4} placeholder="Hola, te enviamos nuestra OC. Por favor confirma…" style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Si lo dejas vacío, se usa el mensaje estándar.</div>
              </Field>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={conPDF} onChange={e => setConPDF(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Adjuntar PDF de la OC</span>
              </label>

              {error && <div style={errorBox}>{error}</div>}

              {historial.length > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: B.navyMid, borderRadius: 8, border: `1px solid ${B.navyLight}` }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Envíos previos ({historial.length})</div>
                  {historial.slice(0, 5).map(h => (
                    <div key={h.id} style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", padding: "4px 0", borderBottom: `1px solid ${B.navyLight}` }}>
                      {fmtFecha(h.enviado_at?.slice(0, 10))} → {(h.enviado_a || []).join(", ")} {h.con_pdf ? "📎" : ""}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                <button onClick={onClose} style={btnSecondary}>Cancelar</button>
                <button onClick={enviar} style={btnPrimary}>📤 Enviar correo</button>
              </div>
            </>
          )}

          {step === "sending" && <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 32 }}>📤</div>
            <div style={{ fontSize: 14, marginTop: 10 }}>Enviando…</div>
          </div>}

          {step === "sent" && <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10, color: B.success }}>Correo enviado</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>ID: {resendId}</div>
            <button onClick={onClose} style={{ ...btnPrimary, marginTop: 20 }}>Cerrar</button>
          </div>}

          {step === "error" && <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 40 }}>❌</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 10, color: B.danger }}>Error al enviar</div>
            <div style={{ ...errorBox, marginTop: 12 }}>{error}</div>
            <button onClick={() => setStep("compose")} style={{ ...btnSecondary, marginTop: 20 }}>← Reintentar</button>
          </div>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9000, padding: 16,
};
const input = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white,
  fontSize: 13, boxSizing: "border-box",
};
const btnPrimary = {
  padding: "9px 16px", border: "none", borderRadius: 8,
  background: B.sand, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const btnSecondary = {
  padding: "9px 16px", border: `1px solid ${B.navyLight}`, borderRadius: 8,
  background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnClose = {
  width: 32, height: 32, borderRadius: 16, border: `1px solid ${B.navyLight}`,
  background: "transparent", color: B.white, fontSize: 22, cursor: "pointer",
};
const errorBox = {
  padding: 10, background: B.danger + "22", border: `1px solid ${B.danger}`,
  borderRadius: 6, fontSize: 12, color: B.danger, marginTop: 12,
};
