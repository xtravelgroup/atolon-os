// TrackViewer.jsx — Portal público de AtolonTrack para la agencia
// Ruta: atolon.co/track  ·  Protegido con clave
// Renderiza Analitica en modo `externo` (vista limitada Web+Mkt / WhatsApp)
// que incluye el panel "🎯 Tracking & Pixels" para que la agencia cargue
// los IDs de Meta Pixel / GA4 / GTM / Google Ads / TikTok.
import { useState, useEffect } from "react";
import Analitica from "./Analitica";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive";

const CLAVE = "atolontrack";
const SESSION_KEY = "atolon_track_auth";

export default function TrackViewer() {
  const { isMobile } = useBreakpoint();
  const [authed,  setAuthed]  = useState(false);
  const [input,   setInput]   = useState("");
  const [error,   setError]   = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const existing = document.querySelector('meta[name="viewport"]');
    if (!existing) {
      const meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1, maximum-scale=1";
      document.head.appendChild(meta);
    }
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") { setAuthed(true); return; }
    import("../lib/supabase").then(({ supabase }) => {
      if (!supabase) return;
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session?.user?.email) {
          sessionStorage.setItem(SESSION_KEY, "1");
          setAuthed(true);
        }
      });
    });
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (input.trim() === CLAVE) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
      setInput("");
    }
  };

  if (authed) {
    return (
      <div style={{ minHeight: "100vh", background: B.navy }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: isMobile ? "10px 12px 0" : "14px 18px 0" }}>
          <button
            onClick={() => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false); setInput(""); }}
            style={{
              padding: isMobile ? "5px 10px" : "6px 14px",
              borderRadius: 8,
              border: `1px solid rgba(255,255,255,0.12)`,
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              fontSize: isMobile ? 11 : 12,
              cursor: "pointer",
            }}>
            Cerrar sesión
          </button>
        </div>
        <Analitica externo={true} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: B.navy,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <img src="/logo.png" alt="Atolon" style={{ height: 56, marginBottom: 16 }} onError={e => e.target.style.display = "none"} />
        <div style={{ fontSize: 28, fontWeight: 900, color: B.white, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
          AtolonTrack
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
          Resultados de pauta &amp; configuración de pixels · Agencia
        </div>
      </div>

      <div style={{
        background: B.navyMid,
        borderRadius: 20,
        padding: "36px 40px",
        width: "100%",
        maxWidth: 380,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        border: `1px solid ${B.navyLight}`,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 6 }}>
          🔒 Acceso restringido
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 24, lineHeight: 1.6 }}>
          Ingresa la clave para ver los resultados y configurar el tracking.
        </div>

        <form onSubmit={submit}>
          <div style={{ position: "relative", marginBottom: 20 }}>
            <input
              type={visible ? "text" : "password"}
              value={input}
              onChange={e => { setInput(e.target.value); setError(false); }}
              placeholder="Clave de acceso"
              autoFocus
              style={{
                width: "100%",
                padding: "14px 48px 14px 16px",
                borderRadius: 10,
                border: `1.5px solid ${error ? "#f87171" : B.navyLight}`,
                background: B.navy,
                color: B.white,
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
                letterSpacing: "0.1em",
                transition: "border-color 0.15s",
              }}
            />
            <button
              type="button"
              onClick={() => setVisible(v => !v)}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.3)", fontSize: 16, padding: 4,
              }}>
              {visible ? "🙈" : "👁️"}
            </button>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#f87171", marginBottom: 14, textAlign: "center" }}>
              Clave incorrecta. Intenta de nuevo.
            </div>
          )}

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 10,
              border: "none",
              background: B.sky,
              color: B.navy,
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              letterSpacing: "0.03em",
            }}>
            Entrar →
          </button>
        </form>
      </div>

      <div style={{ marginTop: 24, fontSize: 11, color: "rgba(255,255,255,0.15)" }}>
        © {new Date().getFullYear()} Atolon Beach Club · Cartagena de Indias
      </div>
    </div>
  );
}
