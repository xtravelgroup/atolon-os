// AcknowledgeModal — firma de exoneración para servicios de terceros
// Usado en: Actividades (POS), BookingPopup (online)
import { useRef, useState, useEffect, useCallback } from "react";
import { B } from "../brand";

export const DISCLAIMER_TEXT = `El cliente declara conocer y aceptar que el servicio adquirido es prestado por un operador o proveedor tercero, independiente de Interop Colombia SAS (Atolon Beach Club). Interop Colombia SAS actúa únicamente como vendedor del servicio y no asume responsabilidad alguna por la ejecución, calidad, seguridad, ni por cualquier incidente, daño, lesión o pérdida que pueda ocurrir durante la prestación del mismo. Al firmar este documento, el cliente libera a Interop Colombia SAS de toda responsabilidad relacionada con dicho servicio.`;

// ─── Pad de firma (canvas) ────────────────────────────────────────────────────
function SignaturePad({ canvasRef, onHasFirma }) {
  const drawing   = useRef(false);
  const lastPos   = useRef(null);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const start = useCallback((e) => {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pos    = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
  }, [canvasRef]);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pos    = getPos(e, canvas);
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    onHasFirma(true);
  }, [canvasRef, onHasFirma]);

  const end = useCallback(() => { drawing.current = false; }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("mousedown",  start, { passive: false });
    canvas.addEventListener("mousemove",  draw,  { passive: false });
    canvas.addEventListener("mouseup",    end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove",  draw,  { passive: false });
    canvas.addEventListener("touchend",   end);
    return () => {
      canvas.removeEventListener("mousedown",  start);
      canvas.removeEventListener("mousemove",  draw);
      canvas.removeEventListener("mouseup",    end);
      canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove",  draw);
      canvas.removeEventListener("touchend",   end);
    };
  }, [canvasRef, start, draw, end]);

  return null;
}

// ─── Modal interno (con firma) ────────────────────────────────────────────────
export function AcknowledgeModal({ clienteNombre, servicios, onConfirm, onCancel }) {
  const canvasRef  = useRef(null);
  const [hasFirma, setHasFirma] = useState(false);

  const limpiar = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasFirma(false);
  };

  const confirmar = () => {
    const canvas = canvasRef.current;
    onConfirm(canvas.toDataURL("image/png"));
  };

  const now = new Date().toLocaleString("es-CO", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: "100%", maxWidth: 560, maxHeight: "95vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Autorización de servicio de terceros</h3>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{now}</div>
        </div>

        {/* Cliente + servicios */}
        <div style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: B.sand, marginBottom: 4 }}>Cliente</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{clienteNombre || "—"}</div>
          {servicios && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
              {servicios.map((s, i) => <div key={i}>• {s}</div>)}
            </div>
          )}
        </div>

        {/* Texto disclaimer */}
        <div style={{ background: B.navy + "88", borderRadius: 10, padding: "14px 16px", marginBottom: 20, fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.7 }}>
          {DISCLAIMER_TEXT}
        </div>

        {/* Firma */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 700 }}>
            Firma del cliente
          </div>
          <div style={{ position: "relative", border: `2px solid ${hasFirma ? B.success + "88" : B.navyLight}`, borderRadius: 10, overflow: "hidden", background: B.navy, touchAction: "none" }}>
            <canvas
              ref={canvasRef}
              width={480}
              height={130}
              style={{ display: "block", width: "100%", cursor: "crosshair" }}
            />
            <SignaturePad canvasRef={canvasRef} onHasFirma={setHasFirma} />
            {!hasFirma && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.2)" }}>← Firmar aquí →</span>
              </div>
            )}
          </div>
          <button onClick={limpiar}
            style={{ marginTop: 8, padding: "5px 14px", borderRadius: 6, background: "none", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer" }}>
            Limpiar firma
          </button>
        </div>

        {/* Botones */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: 11, background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={confirmar} disabled={!hasFirma}
            style={{ flex: 2, padding: 11, background: hasFirma ? B.success : B.navyLight, color: hasFirma ? B.navy : "rgba(255,255,255,0.3)", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: hasFirma ? "pointer" : "default" }}>
            ✓ Confirmar y registrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Checkbox online (BookingPopup) ───────────────────────────────────────────
export function AcknowledgeCheckbox({ checked, onChange }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "14px 16px", border: `1px solid ${checked ? "#4ade8044" : "rgba(255,255,255,0.1)"}` }}>
      <label style={{ display: "flex", gap: 12, cursor: "pointer", alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16, cursor: "pointer", accentColor: "#4ade80" }}
        />
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
          <strong style={{ color: B.white, display: "block", marginBottom: 4 }}>📋 Autorización de servicio</strong>
          Entiendo que este servicio es prestado por un operador tercero independiente de Interop Colombia SAS (Atolon Beach Club), quien actúa únicamente como vendedor del servicio y no asume responsabilidad por su ejecución, calidad o cualquier incidente durante el mismo.
        </div>
      </label>
    </div>
  );
}

// ─── Comprobante imprimible ───────────────────────────────────────────────────
export function AcknowledgeRecibo({ clienteNombre, servicios, firmaBase64, fecha }) {
  return (
    <div id="acknowledge-recibo" style={{ background: B.white, color: "#111", borderRadius: 12, padding: 28, fontFamily: "sans-serif", fontSize: 13 }}>
      <div style={{ textAlign: "center", borderBottom: "2px solid #ddd", paddingBottom: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>AUTORIZACIÓN DE SERVICIO DE TERCEROS</div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Interop Colombia SAS — Atolon Beach Club</div>
        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{fecha}</div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <strong>Cliente:</strong> {clienteNombre}<br />
        {servicios?.length > 0 && <><strong>Servicio(s):</strong> {servicios.join(", ")}</>}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 20, color: "#333" }}>
        {DISCLAIMER_TEXT}
      </div>
      {firmaBase64 && (
        <div style={{ borderTop: "1px solid #ddd", paddingTop: 16 }}>
          <div style={{ fontSize: 12, marginBottom: 8 }}>Firma del cliente:</div>
          <img src={firmaBase64} alt="Firma" style={{ border: "1px solid #ddd", borderRadius: 6, maxWidth: "100%", background: "#0D1B3E" }} />
        </div>
      )}
    </div>
  );
}
