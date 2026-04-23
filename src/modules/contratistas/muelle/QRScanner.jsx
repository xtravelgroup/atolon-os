// QR Scanner usando jsqr + getUserMedia. Dibuja cada ~200ms el frame del video
// en un canvas y pasa el imageData a jsQR. Cuando hay match, detiene el stream
// y llama a onResult(code.data).
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { C } from "../constants";

export default function QRScanner({ onResult, onClose }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef   = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Este dispositivo no soporta acceso a cámara.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        await v.play();
        setReady(true);
        tick();
      } catch (e) {
        setError("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
      }
    })();

    function tick() {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) { loopRef.current = setTimeout(tick, 200); return; }
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        const w = v.videoWidth, h = v.videoHeight;
        if (w && h) {
          c.width = w; c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, w, h);
          try {
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (code && code.data) {
              stop();
              onResult && onResult(code.data);
              return;
            }
          } catch { /* cross-origin or sampling issue — ignore */ }
        }
      }
      loopRef.current = setTimeout(tick, 200);
    }

    function stop() {
      if (loopRef.current) { clearTimeout(loopRef.current); loopRef.current = null; }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    }

    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(6,15,36,0.92)",
      zIndex: 9999, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 560, aspectRatio: "1 / 1",
        background: "#000", borderRadius: 16, overflow: "hidden",
        position: "relative", boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        <video ref={videoRef} muted playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        {/* Marco guía */}
        <div style={{
          position: "absolute", inset: "12%",
          border: `3px solid ${C.sky}`, borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
          pointerEvents: "none",
        }} />
        {!ready && !error && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 14,
          }}>Abriendo cámara…</div>
        )}
        {error && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center", padding: 20,
            color: "#fff", fontSize: 14, textAlign: "center",
          }}>{error}</div>
        )}
      </div>
      <div style={{ color: "#fff", fontSize: 14, marginTop: 16, opacity: 0.75, textAlign: "center" }}>
        Apunta la cámara al código QR del certificado
      </div>
      <button
        onClick={onClose}
        style={{
          marginTop: 20, minHeight: 48, padding: "12px 32px",
          borderRadius: 10, border: "none",
          background: "#fff", color: C.navy,
          fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}
      >Cancelar</button>
    </div>
  );
}
