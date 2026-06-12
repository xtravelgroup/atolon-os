// Pantalla de challenge MFA (login con segundo factor)
//
// Se monta cuando el usuario ya tiene un factor TOTP verificado y la
// sesión está en aal1 (solo password). Bloquea el acceso a la OS
// hasta que se complete la verificación al nivel aal2.

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

export default function MFAChallenge({ factorId, userEmail, onDone, onCancel }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e?.preventDefault();
    if (code.length < 6) { setError("Ingresá el código de 6 dígitos."); return; }
    setBusy(true); setError("");
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) { setError(chErr.message); setBusy(false); return; }
      const { error: verr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (verr) {
        setError("Código inválido. Probá de nuevo (el código rota cada 30s).");
        setBusy(false);
        return;
      }
      // Actualizar mfa_last_used_at (fire-and-forget)
      if (userEmail) {
        supabase.from("usuarios")
          .update({ mfa_last_used_at: new Date().toISOString() })
          .eq("email", userEmail.toLowerCase())
          .then(() => {}).catch(() => {});
      }
      onDone?.();
    } catch (e) {
      setError(String(e?.message || e));
      setBusy(false);
    }
  }

  async function handleSignOut() {
    try { await supabase.auth.signOut(); } catch {}
    onCancel?.();
  }

  const wrap = {
    minHeight: "100vh", background: B.dark,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  };
  const card = {
    background: "#0F1A1F", borderRadius: 16, padding: 32, maxWidth: 380, width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)", color: B.fg,
  };
  const btn = {
    width: "100%", padding: "12px 20px", border: 0, borderRadius: 10,
    background: B.brand, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
    minHeight: 44, marginTop: 16,
  };
  const input = {
    width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${B.border}`,
    background: "#0a1014", color: B.fg, fontSize: 24, letterSpacing: 8, textAlign: "center",
    fontFamily: "monospace", outline: "none",
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/favicon-blue.png" alt="" style={{ width: 48, height: 48, opacity: 0.9 }} />
          <h2 style={{ margin: "12px 0 4px", fontSize: 22 }}>Verificación en 2 pasos</h2>
          <p style={{ color: B.fgMuted, fontSize: 13, margin: 0 }}>
            Abrí tu app de autenticación y tipea el código de 6 dígitos
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            style={input}
            autoFocus
            autoComplete="one-time-code"
          />
          {error && (
            <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 10, textAlign: "center" }}>{error}</div>
          )}
          <button type="submit" disabled={busy || code.length < 6} style={{ ...btn, opacity: busy || code.length < 6 ? 0.5 : 1 }}>
            {busy ? "Verificando…" : "Verificar"}
          </button>
        </form>
        <button
          onClick={handleSignOut}
          style={{
            width: "100%", padding: "10px 20px", marginTop: 12,
            background: "transparent", color: B.fgMuted, border: 0,
            fontSize: 12, cursor: "pointer", textDecoration: "underline",
          }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
