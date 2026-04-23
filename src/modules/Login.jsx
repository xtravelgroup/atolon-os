import { useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const IS = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1.5px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
  color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};

export default function Login() {
  const [mode, setMode]       = useState("login"); // "login" | "forgot" | "done"
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message === "Invalid login credentials"
      ? "Email o contraseña incorrectos"
      : err.message);
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setMode("done");
  }

  return (
    <div style={{
      minHeight: "100dvh", background: B.navy,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: 400, maxWidth: "92vw",
        background: B.navyMid, borderRadius: 20,
        padding: "40px 36px", boxShadow: "0 24px 64px #0008",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/atolon-logo-white.png" alt="Atolon Beach Club" style={{ width: 180, margin: "0 auto 14px", display: "block" }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: B.white }}>Atolon OS</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {mode === "login"  && "Ingresa a tu cuenta"}
            {mode === "forgot" && "Recuperar contraseña"}
            {mode === "done"   && "Revisa tu correo"}
          </div>
        </div>

        {/* Done state */}
        {mode === "done" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
            <div style={{ color: B.white, fontSize: 15, marginBottom: 8 }}>
              Enviamos un link a <strong>{email}</strong>
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 24 }}>
              Revisa tu bandeja de entrada y haz click en el enlace para crear una nueva contraseña.
            </div>
            <button onClick={() => setMode("login")} style={{
              background: "none", border: "none", color: B.sky,
              fontSize: 13, cursor: "pointer", textDecoration: "underline",
            }}>← Volver al login</button>
          </div>
        )}

        {/* Login form */}
        {mode === "login" && (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>EMAIL</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com" required autoComplete="email" style={IS} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>CONTRASEÑA</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" style={IS} />
            </div>
            {error && (
              <div style={{ background: "#D6454522", border: "1px solid #D6454544", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#F87171", marginBottom: 16 }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: B.sky, color: B.navy, fontSize: 15, fontWeight: 700,
              cursor: loading ? "wait" : "pointer", marginBottom: 14,
            }}>
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
            <div style={{ textAlign: "center" }}>
              <button type="button" onClick={() => { setMode("forgot"); setError(""); }} style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.4)",
                fontSize: 13, cursor: "pointer",
              }}>¿Olvidaste tu contraseña?</button>
            </div>
          </form>
        )}

        {/* Forgot password form */}
        {mode === "forgot" && (
          <form onSubmit={handleForgot}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>EMAIL</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com" required autoComplete="email" style={IS} />
            </div>
            {error && (
              <div style={{ background: "#D6454522", border: "1px solid #D6454544", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#F87171", marginBottom: 16 }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: B.sky, color: B.navy, fontSize: 15, fontWeight: 700,
              cursor: loading ? "wait" : "pointer", marginBottom: 14,
            }}>
              {loading ? "Enviando..." : "Enviar link de recuperación"}
            </button>
            <div style={{ textAlign: "center" }}>
              <button type="button" onClick={() => { setMode("login"); setError(""); }} style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.4)",
                fontSize: 13, cursor: "pointer",
              }}>← Volver al login</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
