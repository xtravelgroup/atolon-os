// EscanearProductos.jsx — Landing mobile-first para vincular códigos de barra a productos del catálogo.
// Ruta pública: /escanear-productos (requiere login normal del sistema)
//
// Flujo:
//   1. Buscar producto por nombre (solo muestra los SIN código)
//   2. Tap en producto → abre cámara → escanea EAN
//   3. Guarda y vuelve a la búsqueda
//   4. Contador de pendientes / asignados

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg:       "#0A1733",
  navy:     "#0D1B3E",
  navyMid:  "#14254E",
  navyLight:"#1E3566",
  sky:      "#38BDF8",
  sand:     "#C8B99A",
  success:  "#4ADE80",
  warning:  "#F59E0B",
  danger:   "#EF4444",
  white:    "#FFFFFF",
};

export default function EscanearProductos() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [soloSinCodigo, setSoloSinCodigo] = useState(true);
  const [scanFor, setScanFor] = useState(null); // item object
  const [userEmail, setUserEmail] = useState("");
  const [flash, setFlash] = useState(null); // { type, text }

  const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-productos`;
  const FN_HEADERS = {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };

  const load = () => {
    setLoading(true);
    fetch(`${FN_URL}/items`, { headers: FN_HEADERS })
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // Intenta tomar email de sesión si existe, sin bloquear
    supabase?.auth.getSession().then(({ data }) => setUserEmail(data?.session?.user?.email || "anónimo")).catch(() => setUserEmail("anónimo"));
  }, []);

  const filtered = useMemo(() => {
    let list = items;
    if (soloSinCodigo) list = list.filter(i => !i.codigo);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i => i.nombre?.toLowerCase().includes(s) || i.codigo?.toLowerCase().includes(s));
    }
    return list;
  }, [items, search, soloSinCodigo]);

  const stats = useMemo(() => {
    const total = items.length;
    const conCodigo = items.filter(i => i.codigo).length;
    return { total, conCodigo, sinCodigo: total - conCodigo };
  }, [items]);

  const guardarCodigo = async (itemId, codigo) => {
    setScanFor(null);
    setFlash({ type: "ok", text: `💾 Guardando...` });
    try {
      const res = await fetch(`${FN_URL}/save-code`, {
        method: "POST",
        headers: FN_HEADERS,
        body: JSON.stringify({ item_id: itemId, codigo }),
      });
      const d = await res.json();
      if (!d.ok) {
        setFlash({ type: "err", text: "❌ " + (d.error || "Error") });
        setTimeout(() => setFlash(null), 5000);
        return;
      }
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, codigo } : i));
      setFlash({ type: "ok", text: `✓ Guardado: ${codigo}` });
      setTimeout(() => setFlash(null), 2000);
    } catch (e) {
      setFlash({ type: "err", text: "❌ " + e.message });
      setTimeout(() => setFlash(null), 5000);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: "-apple-system, 'Segoe UI', sans-serif", paddingBottom: 80 }}>
      {/* Header fijo */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: C.navy, borderBottom: `1px solid ${C.navyLight}`,
        padding: "14px 16px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>📷 Escanear Productos</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{userEmail}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.success, fontFamily: "'Barlow Condensed', sans-serif" }}>
              {stats.conCodigo}<span style={{ color: "rgba(255,255,255,0.25)" }}>/{stats.total}</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>con código</div>
          </div>
        </div>
        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar producto..."
          style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: C.navyMid, border: `1px solid ${C.navyLight}`, color: C.white, fontSize: 15, outline: "none", boxSizing: "border-box" }}
        />
        {/* Toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
          <input type="checkbox" checked={soloSinCodigo} onChange={e => setSoloSinCodigo(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: C.sky }} />
          Ocultar los que ya tienen código ({stats.sinCodigo} pendientes)
        </label>
      </div>

      {/* Lista de productos */}
      <div style={{ padding: "12px 12px 40px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.4)" }}>
            {stats.sinCodigo === 0 ? (
              <>
                <div style={{ fontSize: 54, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>¡Todos los productos tienen código!</div>
              </>
            ) : (
              <div style={{ fontSize: 14 }}>Sin resultados para "{search}"</div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(i => (
              <button key={i.id} onClick={() => setScanFor(i)}
                style={{
                  background: i.codigo ? C.success + "10" : C.navyMid,
                  border: `1px solid ${i.codigo ? C.success + "55" : C.navyLight}`,
                  borderRadius: 12, padding: "14px 16px",
                  cursor: "pointer", textAlign: "left",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: i.codigo ? C.success + "30" : C.sky + "20",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, flexShrink: 0,
                }}>
                  {i.codigo ? "✓" : "📷"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {i.nombre}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    {i.categoria} · {i.unidad}
                  </div>
                  {i.codigo && (
                    <div style={{ fontSize: 11, color: C.success, marginTop: 4, fontFamily: "monospace", fontWeight: 700 }}>
                      {i.codigo}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }}>›</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {flash && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: flash.type === "ok" ? C.success : C.danger, color: C.navy,
          padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 800,
          boxShadow: "0 6px 20px rgba(0,0,0,0.3)", zIndex: 100,
        }}>
          {flash.text}
        </div>
      )}

      {/* Scanner modal */}
      {scanFor && <ScannerScreen item={scanFor} onClose={() => setScanFor(null)} onCode={(c) => guardarCodigo(scanFor.id, c)} />}
    </div>
  );
}

// ─── Scanner fullscreen ────────────────────────────────────────────────────
function ScannerScreen({ item, onClose, onCode }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [lastCode, setLastCode] = useState("");
  const [manual, setManual] = useState("");
  const detectorSupported = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    if (!detectorSupported) {
      setError("Tu navegador no soporta escaneo nativo. Usa entrada manual.");
      return;
    }
    let stream = null;
    let rafId = null;
    let stopped = false;
    const start = async () => {
      try {
        const detector = new window.BarcodeDetector({
          formats: ["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code","data_matrix","itf"],
        });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const loop = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              const code = codes[0].rawValue || codes[0].displayValue;
              if (code) {
                try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); osc.frequency.value = 900; osc.connect(ctx.destination); osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, 80); } catch(_) {}
                if (navigator.vibrate) navigator.vibrate(80);
                setLastCode(code);
                stopped = true;
                if (stream) stream.getTracks().forEach(t => t.stop());
                onCode(code);
                return;
              }
            }
          } catch(_) {}
          rafId = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) { setError("No se pudo acceder a la cámara: " + e.message); }
    };
    start();
    return () => { stopped = true; if (rafId) cancelAnimationFrame(rafId); if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []); // eslint-disable-line

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", background: "rgba(0,0,0,0.85)", color: "#fff", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Escaneando para</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.sand }}>{item.nombre}</div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✕</button>
      </div>

      {/* Video */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
        {error ? (
          <div style={{ color: "#fca5a5", textAlign: "center", padding: 40, fontSize: 14 }}>⚠️ {error}</div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80%", maxWidth: 500, aspectRatio: "2 / 1", border: `3px solid ${lastCode ? C.success : C.sky}`, borderRadius: 16, pointerEvents: "none", boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)", transition: "border-color 0.2s" }} />
            <div style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", fontSize: 13, color: "rgba(255,255,255,0.7)", textShadow: "0 2px 4px rgba(0,0,0,0.6)" }}>
              Apunta al código de barras
            </div>
          </>
        )}
      </div>

      {/* Entrada manual */}
      <div style={{ padding: "12px 16px", background: "rgba(0,0,0,0.85)", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: 8 }}>
        <input value={manual} onChange={e => setManual(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && manual.trim()) onCode(manual.trim()); }}
          placeholder="…o escribe el código a mano y pulsa Enter"
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 14, outline: "none" }} />
        <button onClick={() => { if (manual.trim()) onCode(manual.trim()); }}
          style={{ background: C.sky, color: C.navy, border: "none", borderRadius: 8, padding: "0 18px", fontWeight: 800, cursor: "pointer" }}>Usar</button>
      </div>
    </div>
  );
}
