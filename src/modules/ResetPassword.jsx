import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const IS = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1.5px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
  color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};

export default function ResetPassword() {
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [ready, setReady]         = useState(false);

  useEffect(() => {
    // Supabase sets the session from the URL hash automatically
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
  }, []);

  async function handleReset(e) {
    e.preventDefault();
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    if (password.length < 6)  { setError("Mínimo 6 caracteres"); return; }
    setError(""); setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => { window.location.href = "/"; }, 2000);
  }

  return (
    <div style={{
      minHeight: "100vh", background: B.navy,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: 400, maxWidth: "92vw",
        background: B.navyMid, borderRadius: 20,
        padding: "40px 36px", boxShadow: "0 24px 64px #0008",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px",
            background: `linear-gradient(135deg, ${B.sand}, ${B.sky})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, color: B.navy, fontSize: 22,
          }}>A</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: B.white }}>Nueva contraseña</div>
        </div>

        {done ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div style={{ color: B.white, fontSize: 15 }}>Contraseña actualizada. Redirigiendo...</div>
          </div>
        ) : !ready ? (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
            Verificando enlace...
          </div>
        ) : (
          <form onSubmit={handleReset}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>NUEVA CONTRASEÑA</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres" required style={IS} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>CONFIRMAR CONTRASEÑA</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repite la contraseña" required style={IS} />
            </div>
            {error && (
              <div style={{ background: "#D6454522", border: "1px solid #D6454544", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#F87171", marginBottom: 16 }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: B.sky, color: B.navy, fontSize: 15, fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
            }}>
              {loading ? "Guardando..." : "Guardar nueva contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
