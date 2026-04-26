// SignaturePad.jsx — Captura de firma con canvas HTML5 + upload a Supabase
// Funciona con mouse y touch (móvil/tablet). Devuelve la URL pública.

import { useRef, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

export default function SignaturePad({ value, onChange, bucket = "motores", path = "firmas", label = "Firma" }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  // Inicializar canvas con tamaño correcto y fondo blanco
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    // Resolución DPI para que la firma se vea nítida
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPoint(e) {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
    setHasContent(true);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = getPoint(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end() {
    if (!drawing) return;
    setDrawing(false);
  }

  function clear() {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasContent(false);
    if (onChange) onChange("");
  }

  async function upload() {
    if (!hasContent) { setErr("Firma vacía"); return; }
    setUploading(true); setErr("");
    try {
      const blob = await new Promise(res => canvasRef.current.toBlob(res, "image/png"));
      const filePath = `${path}/${Date.now()}.png`;
      const { error } = await supabase.storage.from(bucket).upload(filePath, blob, { upsert: true, contentType: "image/png" });
      if (error) throw error;
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filePath);
      if (onChange) onChange(pub.publicUrl);
    } catch (e) { setErr(e.message); }
    setUploading(false);
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {value ? (
        <div style={{ background: "#fff", borderRadius: 8, padding: 8, marginBottom: 6 }}>
          <img src={value} alt="firma" style={{ maxWidth: "100%", maxHeight: 120, display: "block" }} />
          <div style={{ marginTop: 6, display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button onClick={() => onChange && onChange("")} style={{ padding: "4px 10px", background: "transparent", border: `1px solid ${B.danger}`, color: B.danger, fontSize: 11, borderRadius: 4, cursor: "pointer" }}>
              ✕ Borrar firma
            </button>
          </div>
        </div>
      ) : (
        <>
          <canvas ref={canvasRef}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            style={{ width: "100%", height: 120, background: "#fff", borderRadius: 8, border: `1px solid ${B.navyLight}`, touchAction: "none", cursor: "crosshair" }} />
          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
            <button onClick={clear} disabled={!hasContent}
              style={{ padding: "5px 12px", background: B.navy, border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.6)", fontSize: 11, borderRadius: 4, cursor: hasContent ? "pointer" : "default", opacity: hasContent ? 1 : 0.4 }}>
              🧹 Limpiar
            </button>
            <button onClick={upload} disabled={!hasContent || uploading}
              style={{ padding: "5px 12px", background: B.success, border: "none", color: B.navy, fontWeight: 700, fontSize: 11, borderRadius: 4, cursor: (hasContent && !uploading) ? "pointer" : "default", opacity: (hasContent && !uploading) ? 1 : 0.5 }}>
              {uploading ? "Subiendo…" : "✓ Guardar firma"}
            </button>
            {err && <span style={{ fontSize: 10, color: B.danger, alignSelf: "center" }}>{err}</span>}
          </div>
        </>
      )}
    </div>
  );
}
