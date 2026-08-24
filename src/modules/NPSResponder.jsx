// Página pública NPS post-visita — clientes llegan aquí desde WA
// URL: /nps?t=<token>
import { useState, useEffect } from "react";
import { B } from "../brand";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_REVIEW_URL = "https://g.page/r/atolon-beach-club/review";

export default function NPSResponder() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("t") || "";
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null); // { ok, nombre, ya_respondio, score_previo }
  const [score, setScore] = useState(null);
  const [comentario, setComentario] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      if (!token) {
        setError("Enlace inválido");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/nps-responder?token=${encodeURIComponent(token)}`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        const data = await res.json();
        if (!data.ok) setError(data.error === "token_invalido" ? "El enlace expiró o no es válido." : "No pudimos cargar tu encuesta.");
        else setStatus(data);
      } catch {
        setError("Error de conexión. Intenta más tarde.");
      }
      setLoading(false);
    })();
  }, [token]);

  async function enviar(scoreFinal) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/nps-responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ token, score: scoreFinal, comentario: comentario.trim() || null }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error al guardar");
      setSent(true);
      // Si es promotor → invitación fuerte a Google review
      setStatus({ ...status, categoria: data.categoria, score_final: scoreFinal });
    } catch (e) {
      setError(e.message);
    }
    setSending(false);
  }

  async function marcarGoogleClick() {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/nps-responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ token, score: score ?? status.score_final ?? 10, google_review_click: true }),
      });
    } catch {}
    window.open(GOOGLE_REVIEW_URL, "_blank", "noopener");
  }

  const bg = "linear-gradient(135deg, #0a1628 0%, #0f1f3d 100%)";

  if (loading) return (
    <div style={{ background: bg, minHeight: "100vh", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      Cargando…
    </div>
  );

  if (error && !status) return (
    <div style={{ background: bg, minHeight: "100vh", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{error}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>Si necesitas ayuda escríbenos por WhatsApp.</div>
      </div>
    </div>
  );

  return (
    <div style={{ background: bg, minHeight: "100vh", color: "#fff", fontFamily: "system-ui", padding: 24 }}>
      <div style={{ maxWidth: 520, margin: "0 auto", paddingTop: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/atolon-logo-white.png" alt="Atolón" style={{ height: 46, width: "auto", marginBottom: 24 }} />
          <div style={{ fontSize: 12, color: B.sand, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Encuesta post-visita</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px", lineHeight: 1.25 }}>
            {sent ? `¡Gracias, ${status?.nombre || ""}!` : `Hola ${status?.nombre || ""}, ¿cómo estuvo tu visita?`}
          </h1>
          {!sent && (
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
              En una escala de 0 a 10, ¿qué tan probable es que nos recomiendes a un amigo o familiar?
            </div>
          )}
        </div>

        {!sent && (
          <>
            {/* Escala 0-10 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 6, marginBottom: 16 }}>
              {Array.from({ length: 11 }, (_, i) => {
                const activo = score === i;
                const color = i >= 9 ? "#10B981" : i >= 7 ? "#F59E0B" : "#EF4444";
                return (
                  <button
                    key={i}
                    onClick={() => setScore(i)}
                    style={{
                      padding: "12px 0", borderRadius: 8, border: `2px solid ${activo ? color : "rgba(255,255,255,0.15)"}`,
                      background: activo ? color : "rgba(255,255,255,0.03)",
                      color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >{i}</button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
              <span>Nada probable</span>
              <span>Muy probable</span>
            </div>

            {score !== null && (
              <>
                <textarea
                  value={comentario}
                  onChange={e => setComentario(e.target.value.slice(0, 500))}
                  placeholder={score >= 9 ? "¿Qué fue lo que más te gustó? (opcional)"
                              : score >= 7 ? "¿Qué podríamos mejorar? (opcional)"
                              : "Cuéntanos qué pasó para poder mejorar (opcional)"}
                  rows={4}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.03)",
                    color: "#fff", fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none",
                    marginBottom: 16,
                  }}
                />
                <button
                  disabled={sending}
                  onClick={() => enviar(score)}
                  style={{
                    width: "100%", padding: "14px", borderRadius: 10, border: "none",
                    background: sending ? "rgba(255,255,255,0.15)" : B.sand, color: "#0a1628",
                    fontSize: 15, fontWeight: 800, letterSpacing: 0.5, cursor: sending ? "default" : "pointer",
                  }}
                >
                  {sending ? "Enviando…" : "Enviar respuesta"}
                </button>
                {error && <div style={{ color: "#EF4444", fontSize: 13, marginTop: 12, textAlign: "center" }}>{error}</div>}
              </>
            )}
          </>
        )}

        {sent && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>
              {status?.categoria === "promotor" ? "🎉" : status?.categoria === "pasivo" ? "🙌" : "🙏"}
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, marginBottom: 28 }}>
              {status?.categoria === "promotor" && "Nos alegra muchísimo saber que la pasaste bien. Tu opinión pública nos ayuda a que más personas descubran Atolón."}
              {status?.categoria === "pasivo" && "Gracias por tu tiempo. Vamos a trabajar en lo que nos comentas."}
              {status?.categoria === "detractor" && "Sentimos que no haya sido lo que esperabas. Un miembro de nuestro equipo te contactará para conocer más y compensar la experiencia."}
            </div>
            {status?.categoria === "promotor" && (
              <button onClick={marcarGoogleClick}
                style={{
                  padding: "14px 28px", borderRadius: 10, border: "none",
                  background: "#4285F4", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
                }}>
                ⭐ Déjanos una reseña en Google
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
