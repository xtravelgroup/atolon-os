// KPMG C-2 · Pantalla de inscripción de TOTP (Google Authenticator, 1Password, Authy)
//
// Se monta cuando aplicaMFA(rol) === true y el usuario NO tiene factor verificado.
// Flujo:
//   1. supabase.auth.mfa.enroll({factorType: 'totp'}) → QR + secret
//   2. Usuario escanea con Authenticator
//   3. Usuario tipea código de 6 dígitos
//   4. supabase.auth.mfa.challenge({factorId}) + verify({factorId, challengeId, code})
//   5. Al éxito → persistir factor_id en usuarios.mfa_factor_id + mfa_enrolled_at

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

export default function MFAEnrollment({ userEmail, onDone, motivo }) {
  const [step, setStep]           = useState("loading"); // loading | qr | verify | done | error
  const [factorId, setFactorId]   = useState("");
  const [qrSvg, setQrSvg]         = useState("");
  const [secret, setSecret]       = useState("");
  const [code, setCode]           = useState("");
  const [error, setError]         = useState("");
  const [busy, setBusy]           = useState(false);

  // Paso 1: arrancar enrollment al montar
  useEffect(() => {
    let cancel = false;
    async function go() {
      try {
        // Si hay un factor previo unverified, hay que limpiarlo
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const stale = (factorsData?.all || []).filter(f => f.status !== "verified");
        for (const f of stale) {
          try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch {}
        }

        const { data, error: err } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `Atolon-${userEmail}-${Date.now()}`,
        });
        if (cancel) return;
        if (err) { setError(err.message); setStep("error"); return; }
        setFactorId(data.id);
        setQrSvg(data.totp.qr_code || "");
        setSecret(data.totp.secret || "");
        setStep("qr");
      } catch (e) {
        if (!cancel) { setError(String(e?.message || e)); setStep("error"); }
      }
    }
    go();
    return () => { cancel = true; };
  }, [userEmail]);

  async function handleVerify(e) {
    e?.preventDefault();
    if (!code || code.length < 6) { setError("Ingresá el código de 6 dígitos."); return; }
    setBusy(true); setError("");
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) { setError(chErr.message); setBusy(false); return; }
      const { error: verr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (verr) { setError("Código inválido. Probá de nuevo (el código rota cada 30s)."); setBusy(false); return; }

      // Persistir en usuarios para reportería
      await supabase.from("usuarios").update({
        mfa_factor_id:    factorId,
        mfa_enrolled_at:  new Date().toISOString(),
        mfa_last_used_at: new Date().toISOString(),
      }).eq("email", userEmail.toLowerCase());

      setStep("done");
      setTimeout(() => onDone?.(), 1500);
    } catch (e) {
      setError(String(e?.message || e));
      setBusy(false);
    }
  }

  const wrap = {
    minHeight: "100vh", background: B.dark,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  };
  const card = {
    background: "#0F1A1F", borderRadius: 16, padding: 32, maxWidth: 480, width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)", color: B.fg,
  };
  const btn = {
    width: "100%", padding: "12px 20px", border: 0, borderRadius: 10,
    background: B.brand, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
    minHeight: 44, marginTop: 16,
  };
  const input = {
    width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${B.border}`,
    background: "#0a1014", color: B.fg, fontSize: 22, letterSpacing: 6, textAlign: "center",
    fontFamily: "monospace", outline: "none",
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <img src="/favicon-blue.png" alt="" style={{ width: 48, height: 48, opacity: 0.9 }} />
          <h2 style={{ margin: "12px 0 4px", fontSize: 22 }}>Configurar autenticación en 2 pasos</h2>
          <p style={{ color: B.fgMuted, fontSize: 13, margin: 0 }}>
            Requerido para tu rol (política Atolón · KPMG C-2)
          </p>
        </div>

        {motivo ? (
          <div style={{
            background: "rgba(124,58,237,0.15)", border: `1px solid rgba(124,58,237,0.4)`,
            color: "#c4b5fd", padding: 12, borderRadius: 10, fontSize: 12, marginBottom: 16,
          }}>{motivo}</div>
        ) : null}

        {step === "loading" && (
          <div style={{ textAlign: "center", padding: 30, color: B.fgMuted }}>
            Generando código QR…
          </div>
        )}

        {step === "qr" && (
          <>
            <ol style={{ paddingLeft: 18, fontSize: 13, color: B.fgMuted, lineHeight: 1.6 }}>
              <li>Instalá <b>Google Authenticator</b>, <b>1Password</b>, <b>Authy</b> o <b>Microsoft Authenticator</b>.</li>
              <li>Escaneá este código QR desde la app.</li>
              <li>Tipeá el código de 6 dígitos que muestra la app.</li>
            </ol>
            <div style={{
              background: "#fff", padding: 16, borderRadius: 12, margin: "16px auto",
              width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {qrSvg ? (
                <img src={qrSvg} alt="QR MFA" style={{ width: "100%", height: "100%" }} />
              ) : (
                <span style={{ color: "#999", fontSize: 12 }}>QR no disponible</span>
              )}
            </div>
            <details style={{ fontSize: 11, color: B.fgMuted, marginBottom: 8 }}>
              <summary style={{ cursor: "pointer" }}>¿No podés escanear? Mostrar clave manual</summary>
              <code style={{
                display: "block", padding: 10, background: "#0a1014", borderRadius: 6,
                marginTop: 6, wordBreak: "break-all", fontSize: 12, color: B.fg,
              }}>{secret}</code>
            </details>
            <form onSubmit={handleVerify}>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                style={input}
                autoFocus
              />
              {error && (
                <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 10, textAlign: "center" }}>{error}</div>
              )}
              <button type="submit" disabled={busy || code.length < 6} style={{ ...btn, opacity: busy || code.length < 6 ? 0.5 : 1 }}>
                {busy ? "Verificando…" : "Activar MFA"}
              </button>
            </form>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: 30 }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <h3 style={{ margin: "12px 0", color: "#86efac" }}>MFA activado</h3>
            <p style={{ color: B.fgMuted, fontSize: 13 }}>
              A partir de tu próximo login te vamos a pedir un código de 6 dígitos.
            </p>
          </div>
        )}

        {step === "error" && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 36 }}>⚠️</div>
            <p style={{ color: "#fca5a5", fontSize: 13 }}>{error || "Error desconocido"}</p>
            <button onClick={() => window.location.reload()} style={btn}>Reintentar</button>
          </div>
        )}

        <div style={{ marginTop: 20, padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, fontSize: 11, color: B.fgMuted, lineHeight: 1.5 }}>
          <b>¿Por qué?</b> Tu rol tiene acceso a información sensible (contabilidad,
          pagos, configuración). MFA previene que un password robado dé acceso
          directo al sistema.
        </div>
      </div>
    </div>
  );
}
