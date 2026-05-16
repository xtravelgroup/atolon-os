// TrackExterno — vista pública de AtolonTrack (solo Web+Mkt y WhatsApp),
// protegida con una clave propia (independiente del login admin).
// Ruta pública: /track
import { useState, lazy, Suspense } from "react";
import { B } from "../brand";

const Analitica = lazy(() => import("./Analitica.jsx"));

// Clave configurable en Vercel (VITE_TRACK_CLAVE). Fallback por defecto.
const CLAVE = import.meta.env.VITE_TRACK_CLAVE || "atolon-track";
const LS_KEY = "atolon_track_externo_ok";

export default function TrackExterno() {
  const [ok, setOk] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);

  const entrar = () => {
    if (val.trim() === CLAVE) {
      try { localStorage.setItem(LS_KEY, "1"); } catch { /* noop */ }
      setOk(true);
    } else {
      setErr(true);
    }
  };

  if (ok) {
    return (
      <Suspense fallback={
        <div style={{ minHeight: "100vh", background: B.navy, color: B.sand,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
          Cargando AtolonTrack…
        </div>
      }>
        <div style={{ minHeight: "100vh", background: B.navy }}>
          <Analitica externo />
        </div>
      </Suspense>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: B.navy, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        background: B.navyMid, borderRadius: 16, padding: 32, width: "100%",
        maxWidth: 380, border: `1px solid ${B.navyLight}`,
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 4 }}>📊 AtolonTrack</div>
        <div style={{ fontSize: 13, color: B.muted, marginBottom: 22 }}>
          Vista externa — Web + Marketing y WhatsApp
        </div>
        <label style={{ fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>
          Clave de acceso
        </label>
        <input
          type="password"
          value={val}
          autoFocus
          onChange={e => { setVal(e.target.value); setErr(false); }}
          onKeyDown={e => { if (e.key === "Enter") entrar(); }}
          placeholder="••••••••"
          style={{
            width: "100%", padding: "11px 14px", borderRadius: 10, fontSize: 14,
            background: B.navyLight, border: `1px solid ${err ? B.danger || "#F87171" : B.navyLight}`,
            color: "#fff", outline: "none", boxSizing: "border-box",
          }} />
        {err && <div style={{ fontSize: 12, color: B.danger || "#F87171", marginTop: 8 }}>Clave incorrecta.</div>}
        <button onClick={entrar} style={{
          width: "100%", marginTop: 16, padding: "12px 18px", borderRadius: 10,
          border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
          background: B.sand, color: B.navy,
        }}>
          Entrar
        </button>
      </div>
    </div>
  );
}
