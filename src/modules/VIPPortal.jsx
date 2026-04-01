import { useState, useEffect, useRef } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" };

const BENEFICIOS = {
  coral: { pct: 5,  camas: 1,     personas: 2, personasPropia: 4, personasLancha: 2, color: "#f87171", label: "Coral Member", icon: "🪸", desc: "Entry level – acceso base",
           embarcacionPropia: true, transporte: 50000, descuentoPasadia: 10, adicionalConsumible: 100000 },
  reef:  { pct: 8,  camas: 2,     personas: 4, personasPropia: 6, personasLancha: 4, color: "#34d399", label: "Reef Member",  icon: "🐚", desc: "Cliente frecuente – upgrades y perks",
           embarcacionPropia: true, transporte: 50000, descuentoPasadia: 12, adicionalConsumible: 100000 },
  ocean: { pct: 10, camas: "VIP", personas: 6, personasPropia: null, personasLancha: 6, color: "#60a5fa", label: "Ocean Member", icon: "🌊", desc: "Elite – experiencia completa",
           embarcacionPropia: true, transporte: 50000, descuentoPasadia: 15, adicionalConsumible: null },
};

const CARD_GRADIENTS = {
  coral: "linear-gradient(135deg, #7f1d1d 0%, #450a0a 60%, #991b1b 100%)",
  reef:  "linear-gradient(135deg, #064e3b 0%, #022c22 60%, #065f46 100%)",
  ocean: "linear-gradient(135deg, #1e3a5f 0%, #0c1a35 60%, #1e40af 100%)",
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ─── Responsive hook ────────────────────────────────────────────────────────
function useW() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ══════════════════════════════════════════════════════
// MEMBERSHIP CARD CONTENT (shared between card + fullscreen)
// ══════════════════════════════════════════════════════
function CardContent({ miembro, compact = false }) {
  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: compact ? 16 : 22, position: "relative" }}>
        <img src="/atolon-logo-white.png" alt="Atolon" style={{ height: compact ? 80 : 110, opacity: 0.9, display: "block" }} />
        <div style={{
          padding: compact ? "4px 12px" : "5px 16px", borderRadius: 20, fontSize: compact ? 11 : 12, fontWeight: 700,
          background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)",
          color: b.color, border: `1px solid ${b.color}77`, letterSpacing: 1,
        }}>
          {b.icon} {b.label.toUpperCase()}
        </div>
      </div>

      <div style={{ marginBottom: compact ? 16 : 24, position: "relative" }}>
        <div style={{ fontSize: compact ? 20 : 26, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 4, letterSpacing: "-0.01em" }}>
          {miembro.nombre}
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, letterSpacing: 3, fontFamily: "monospace" }}>{miembro.numero_membresia || "—"}</div>
      </div>

      <div style={{ display: "flex", flexDirection: compact ? "column" : "row", gap: compact ? 14 : 32, flexWrap: "wrap", position: "relative" }}>
        <div>
          <div style={{ fontSize: 9, opacity: 0.45, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>PUNTOS DISPONIBLES</div>
          <div style={{ fontSize: compact ? 26 : 32, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "-0.02em" }}>
            ◉ {(miembro.puntos_disponibles || 0).toLocaleString("es-CO")}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, opacity: 0.45, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>BENEFICIOS ACTIVOS</div>
          <div style={{ fontSize: compact ? 12 : 13, opacity: 0.85, lineHeight: 1.9 }}>
            {miembro.nivel === "ocean" ? (
              <>
                🚤 Embarcación propia · <span style={{ color: b.color }}>personas ilimitadas</span><br />
                ⛵ Lancha Atolon hasta {b.personasLancha} pax · <span style={{ color: b.color }}>$50.000 por persona</span><br />
                🛏 Camas VIP ilimitadas<br />
                🏖 {b.descuentoPasadia}% descuento pasadías<br />
                💰 {b.pct}% en puntos (sin imp. ni propina)
              </>
            ) : miembro.nivel === "reef" ? (
              <>
                🚤 Embarcación propia hasta <span style={{ color: b.color }}>{b.personasPropia} pax</span><br />
                ⛵ Lancha Atolon hasta {b.personasLancha} pax · <span style={{ color: b.color }}>$50.000 por persona</span><br />
                🛏 {b.camas} camas por visita<br />
                ➕ Pax extra · <span style={{ color: b.color }}>$100.000 consumibles</span><br />
                🏖 {b.descuentoPasadia}% descuento pasadías<br />
                💰 {b.pct}% del consumo en puntos
              </>
            ) : (
              <>
                🚤 Embarcación propia hasta <span style={{ color: b.color }}>{b.personasPropia} pax</span><br />
                ⛵ Lancha Atolon hasta {b.personasLancha} pax · <span style={{ color: b.color }}>$50.000 por persona</span><br />
                🛏 {b.camas} cama por visita<br />
                ➕ Pax extra · <span style={{ color: b.color }}>$100.000 consumibles</span><br />
                🏖 {b.descuentoPasadia}% descuento pasadías<br />
                💰 {b.pct}% del consumo en puntos
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════
// FULLSCREEN CARD (mobile tap)
// ══════════════════════════════════════════════════════
function CardFullscreen({ miembro, onClose }) {
  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;
  const gradient = CARD_GRADIENTS[miembro.nivel] || CARD_GRADIENTS.coral;
  const qrData = encodeURIComponent(miembro.numero_membresia || miembro.id);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=000000&color=ffffff&data=${qrData}`;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        {/* Card */}
        <div style={{ background: gradient, borderRadius: 20, padding: "28px 24px", color: "#fff", position: "relative", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.7)", marginBottom: 20 }}>
          <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
          <div style={{ position: "absolute", bottom: -60, right: 20, width: 240, height: 240, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
          <img src="/atolon-peces.png" alt="" style={{ position: "absolute", bottom: -8, right: -8, width: 160, opacity: 0.12, pointerEvents: "none" }} />
          <CardContent miembro={miembro} compact />
        </div>

        {/* QR Code */}
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>Código de Membresía</div>
          <div style={{ display: "inline-block", background: "#000", borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <img src={qrUrl} alt="QR" style={{ width: 160, height: 160, display: "block" }} />
          </div>
          <div style={{ fontSize: 13, fontFamily: "monospace", color: b.color, letterSpacing: 3, fontWeight: 700 }}>
            {miembro.numero_membresia || miembro.id}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>{miembro.nombre}</div>
        </div>

        <button onClick={onClose} style={{ marginTop: 20, width: "100%", padding: "13px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, color: "rgba(255,255,255,0.7)", fontSize: 14, cursor: "pointer" }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MEMBERSHIP CARD
// ══════════════════════════════════════════════════════
function MembershipCard({ miembro, onTap }) {
  const w = useW();
  const isMobile = w < 640;
  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;
  const gradient = CARD_GRADIENTS[miembro.nivel] || CARD_GRADIENTS.coral;
  return (
    <div
      onClick={isMobile && onTap ? onTap : undefined}
      style={{
        background: gradient,
        borderRadius: 20,
        padding: isMobile ? "22px 20px" : "32px 36px",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        width: "100%",
        boxSizing: "border-box",
        cursor: isMobile && onTap ? "pointer" : "default",
      }}>
      {/* Decorative circles */}
      <div style={{ position: "absolute", top: -50, right: -50, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
      <div style={{ position: "absolute", bottom: -70, right: 30, width: 280, height: 280, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
      {/* Fish watermark */}
      <img src="/atolon-peces.png" alt="" style={{ position: "absolute", bottom: -10, right: -10, width: isMobile ? 140 : 190, opacity: 0.12, pointerEvents: "none", userSelect: "none" }} />

      <CardContent miembro={miembro} compact={isMobile} />

      {/* Mobile tap hint */}
      {isMobile && onTap && (
        <div style={{ position: "absolute", bottom: 12, right: 16, fontSize: 10, opacity: 0.35, letterSpacing: 1 }}>
          Toca para ver QR →
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// LOGIN SCREEN
// ══════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) { setError("Ingresa tu email"); return; }
    setLoading(true); setError("");
    if (!supabase) { setError("Base de datos no conectada"); setLoading(false); return; }
    const { data, error: err } = await supabase.from("vip_miembros")
      .select("*").eq("email", email.toLowerCase().trim()).eq("activo", true).single();
    if (err || !data) { setError("Email no encontrado o miembro inactivo"); setLoading(false); return; }
    if (data.clave && clave.trim() !== data.clave) { setError("Clave incorrecta"); setLoading(false); return; }
    setLoading(false);
    onLogin(data);
  };

  return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <img src="/atolon-logo-white.png" alt="Atolon Beach Club" style={{ height: 72, objectFit: "contain", display: "block", margin: "0 auto 20px" }} />
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 6px", letterSpacing: "0.02em" }}>✦ Atolón Society</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>Programa de membresía exclusiva · Atolon Beach Club</p>
        </div>

        <div style={{ background: B.navyMid, borderRadius: 20, padding: "36px 32px", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={LS}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="tu@email.com" style={IS} />
            </div>
            <div>
              <label style={LS}>Clave de acceso</label>
              <input type="password" value={clave} onChange={e => setClave(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="Tu clave personal" style={IS} />
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
                ¿Primera vez? Deja la clave en blanco y podrás crear una nueva
              </div>
            </div>
            {error && <div style={{ color: B.danger, fontSize: 13, textAlign: "center" }}>{error}</div>}
            <button onClick={handleLogin} disabled={loading} style={{
              padding: "14px", background: loading ? B.navyLight : `linear-gradient(135deg, ${B.sky}, #3b82f6)`,
              color: loading ? "rgba(255,255,255,0.4)" : "#fff", border: "none", borderRadius: 10,
              fontWeight: 700, fontSize: 15, cursor: loading ? "default" : "pointer", marginTop: 4,
              boxShadow: loading ? "none" : "0 4px 16px rgba(59,130,246,0.4)",
            }}>
              {loading ? "Verificando..." : "Entrar al Portal →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// SET PASSWORD SCREEN
// ══════════════════════════════════════════════════════
function SetPasswordScreen({ miembro, onDone }) {
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (clave.length < 4) { setError("La clave debe tener al menos 4 caracteres"); return; }
    if (clave !== clave2) { setError("Las claves no coinciden"); return; }
    setSaving(true);
    const { error: err } = await supabase.from("vip_miembros").update({ clave }).eq("id", miembro.id);
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onDone(clave);
  };

  return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img src="/atolon-logo-white.png" alt="Atolon Beach Club" style={{ height: 64, objectFit: "contain", display: "block", margin: "0 auto 16px" }} />
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, margin: "0 0 6px" }}>Crea tu clave</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>Bienvenido, {miembro.nombre.split(" ")[0]}. Crea una clave para acceder al portal.</p>
        </div>
        <div style={{ background: B.navyMid, borderRadius: 20, padding: "32px 28px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={LS}>Nueva clave</label>
              <input type="password" value={clave} onChange={e => setClave(e.target.value)} placeholder="Mínimo 4 caracteres" style={IS} />
            </div>
            <div>
              <label style={LS}>Confirmar clave</label>
              <input type="password" value={clave2} onChange={e => setClave2(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSave()} placeholder="Repite la clave" style={IS} />
            </div>
            {error && <div style={{ color: B.danger, fontSize: 13 }}>{error}</div>}
            <button onClick={handleSave} disabled={saving} style={{ padding: "13px", background: saving ? B.navyLight : B.success, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
              {saving ? "Guardando..." : "Guardar y entrar →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// SUBIR RECIBO MODAL
// ══════════════════════════════════════════════════════
function SubirReciboModal({ miembro, onClose, onSubmitted }) {
  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;

  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [monto, setMonto]         = useState(null);
  const [aiTexto, setAiTexto]     = useState("");
  const [aiError, setAiError]     = useState(false);
  const [fechaRecibo, setFechaRecibo] = useState(null); // fecha extraída por IA
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState("");
  const [manualMonto, setManualMonto] = useState("");
  const fileRef = useRef();

  const baseConsumo = monto ? monto / 1.08 : 0;
  const puntosCalc  = monto ? Math.floor(baseConsumo * b.pct / 100 / 10) : 0;

  const toBase64 = (f) => new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(f);
  });

  const handleFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setMonto(null); setAiTexto(""); setAiError(false); setError(""); setManualMonto(""); setFechaRecibo(null);

    setAnalyzing(true);
    try {
      const imageBase64 = await toBase64(f);
      const mediaType   = f.type || "image/jpeg";
      const { data, error: fnErr } = await supabase.functions.invoke("analyze-recibo", {
        body: { imageBase64, mediaType },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.encontrado && data.monto > 0) {
        setMonto(data.monto);
        setAiTexto(data.texto || "");
        if (data.fecha) setFechaRecibo(data.fecha);
      } else {
        setAiError(true);
      }
    } catch {
      setAiError(true);
    } finally {
      setAnalyzing(false);
    }
  };

  // Validar que la fecha del recibo coincida con una reserva del miembro
  const [reservaMatch, setReservaMatch] = useState(null); // null=no revisado, true=ok, false=no match
  useEffect(() => {
    if (!fechaRecibo || !supabase) return;
    supabase.from("vip_reservas").select("fecha, tipo, estado")
      .eq("miembro_id", miembro.id)
      .eq("fecha", fechaRecibo)
      .neq("estado", "cancelada")
      .then(({ data }) => setReservaMatch(data && data.length > 0));
  }, [fechaRecibo]);

  const handleSubmit = async () => {
    if (!file)  { setError("Selecciona una foto del recibo"); return; }
    if (!monto) { setError("No se pudo leer el monto — sube otra foto o ingrésalo manualmente"); return; }
    setUploading(true); setError("");

    let recibo_url = null;
    const ext  = file.name.split(".").pop();
    const path = `${miembro.id}/${uid()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("vip-recibos").upload(path, file);
    if (upErr) { setError("Error subiendo imagen: " + upErr.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("vip-recibos").getPublicUrl(path);
    recibo_url = urlData?.publicUrl || null;

    const { error: txErr } = await supabase.from("vip_transacciones").insert({
      id: uid(), miembro_id: miembro.id, tipo: "ganados",
      puntos: puntosCalc,
      descripcion: `Pendiente validación · ${aiTexto || `Total: $${monto.toLocaleString("es-CO")}`}${fechaRecibo ? ` · Fecha: ${fechaRecibo}` : ""}`,
      recibo_url, monto_consumo: monto, validado: false,
    });
    if (txErr) { setError(txErr.message); setUploading(false); return; }
    setUploading(false); setSuccess(true);
    setTimeout(() => { onSubmitted(); onClose(); }, 2500);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: B.navyMid, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, padding: "28px 24px 40px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontFamily: "'Barlow Condensed', sans-serif" }}>📸 Subir Recibo</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>¡Recibo enviado!</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
              Tu recibo está en revisión. Los puntos se acreditarán en las próximas 24 horas.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Zona foto */}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
            <div onClick={() => fileRef.current?.click()} style={{
              border: `2px dashed ${analyzing ? B.sky : preview ? B.success : B.navyLight}`,
              borderRadius: 14, padding: preview ? "12px" : "32px", textAlign: "center",
              cursor: "pointer", background: "rgba(255,255,255,0.03)", transition: "all 0.2s",
            }}>
              {preview ? (
                <img src={preview} alt="Recibo" style={{ maxHeight: 220, borderRadius: 8, maxWidth: "100%", objectFit: "contain", display: "block", margin: "0 auto" }} />
              ) : (
                <>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>📷</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Toma o sube la foto del recibo</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>La IA lee el total automáticamente</div>
                </>
              )}
            </div>
            {preview && (
              <button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", color: B.sky, fontSize: 12, cursor: "pointer", textAlign: "center" }}>
                📷 Cambiar foto
              </button>
            )}

            {/* IA analizando */}
            {analyzing && (
              <div style={{ background: B.sky + "15", border: `1px solid ${B.sky}33`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 20 }}>🤖</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: B.sky }}>Analizando recibo con IA...</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Leyendo el total del consumo</div>
                </div>
              </div>
            )}

            {/* IA no pudo leer */}
            {aiError && !analyzing && (
              <div style={{ background: B.danger + "15", border: `1px solid ${B.danger}33`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: B.danger, marginBottom: 6 }}>⚠️ No se pudo leer el recibo</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>Intenta con otra foto más clara o ingresa el total manualmente:</div>
                <input type="number" value={manualMonto} onChange={e => { setManualMonto(e.target.value); setMonto(parseFloat(e.target.value) || null); }}
                  placeholder="Total del recibo en pesos" style={IS} inputMode="numeric" />
              </div>
            )}

            {/* Alerta de fecha */}
            {fechaRecibo && reservaMatch === false && !analyzing && (
              <div style={{ background: "#E8A02018", border: "1px solid #E8A02044", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <div style={{ fontSize: 12, color: "#E8A020", lineHeight: 1.5 }}>
                  La fecha del recibo (<strong>{fechaRecibo}</strong>) no coincide con ninguna reserva registrada. El equipo lo revisará manualmente.
                </div>
              </div>
            )}
            {fechaRecibo && reservaMatch === true && !analyzing && (
              <div style={{ background: B.success + "15", border: `1px solid ${B.success}33`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: B.success }}>
                ✓ Fecha del recibo coincide con tu reserva del {fechaRecibo}
              </div>
            )}

            {/* Resultado IA */}
            {monto && !analyzing && (
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "16px", fontSize: 13, lineHeight: 1.9 }}>
                {aiTexto && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 10, fontStyle: "italic" }}>
                    📄 "{aiTexto}"
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Total recibo</span>
                  <span>${monto.toLocaleString("es-CO")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Menos 8% impuesto</span>
                  <span style={{ color: B.danger }}>− ${Math.round(monto - baseConsumo).toLocaleString("es-CO")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Base consumo</span>
                  <span>${Math.round(baseConsumo).toLocaleString("es-CO")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>
                    Puntos {b.icon} <span style={{ color: b.color }}>{b.pct}%</span>
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: B.success }}>+{puntosCalc.toLocaleString("es-CO")} pts</span>
                </div>
              </div>
            )}

            {error && <div style={{ color: B.danger, fontSize: 13 }}>{error}</div>}

            <button onClick={handleSubmit} disabled={uploading || analyzing || !monto}
              style={{ padding: "14px", background: (uploading || analyzing || !monto) ? B.navyLight : B.success, color: (uploading || analyzing || !monto) ? "rgba(255,255,255,0.3)" : "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: (uploading || analyzing || !monto) ? "default" : "pointer" }}>
              {uploading ? "Enviando..." : analyzing ? "Analizando..." : !monto ? "Sube una foto del recibo" : "Enviar Recibo →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// RESERVA MODAL
// ══════════════════════════════════════════════════════
function ReservaModal({ tipo, miembro, onClose, onCreated }) {
  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;
  const [form, setForm] = useState({ fecha: "", hora: "", personas: 1, notas: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // tipo="llegada" siempre es embarcación propia
  const titulo = "🚤 Reservar Llegada Propia";

  const handleCreate = async () => {
    if (!form.fecha) { setError("Selecciona una fecha"); return; }
    setSaving(true);
    const { error: err } = await supabase.from("vip_reservas").insert({
      id: uid(), miembro_id: miembro.id, tipo: "lancha_propia",
      fecha: form.fecha, hora: form.hora || null,
      personas: form.personas,
      notas: form.notas || null,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false); onCreated(); onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: B.navyMid, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, padding: "28px 24px 40px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{titulo}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        {/* Badge */}
        <div style={{ background: b.color + "18", border: `1px solid ${b.color}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: b.color }}>
          🚤 Embarcación propia · Sin costo de transporte · {miembro.nivel === "ocean" ? "Personas ilimitadas" : `Hasta ${b.personasPropia} personas`}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={LS}>Fecha de llegada</label>
            <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} style={IS} />
          </div>
          <div>
            <label style={LS}>Hora estimada (opcional)</label>
            <input type="time" value={form.hora} onChange={e => set("hora", e.target.value)} style={IS} />
          </div>
          <div>
            <label style={LS}>Personas aprox.</label>
            <input type="number" min="1" value={form.personas} onChange={e => set("personas", parseInt(e.target.value) || 1)} style={IS} />
          </div>
          <div>
            <label style={LS}>Notas</label>
            <input value={form.notas} onChange={e => set("notas", e.target.value)} placeholder="Nombre de la embarcación, ocasión especial..." style={IS} />
          </div>
          {error && <div style={{ color: B.danger, fontSize: 13 }}>{error}</div>}
          <button onClick={handleCreate} disabled={saving} style={{ padding: "14px", background: saving ? B.navyLight : B.sky, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Enviando..." : "Confirmar Llegada →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// LANCHA ATOLON MODAL
// ══════════════════════════════════════════════════════
const PASADIA_PRODUCTS = [
  { id: "VIP",  icon: "🌴", label: "VIP Pass",          precio: 320000, precioNino: 240000, tieneNino: true },
  { id: "EXC",  icon: "⭐", label: "Exclusive Pass",     precio: 590000, precioNino: 0,      tieneNino: false },
  { id: "EXP",  icon: "🛥", label: "Atolon Experience",  precio: 1100000,precioNino: 0,     tieneNino: false },
  { id: "AFT",  icon: "🌙", label: "After Island",       precio: 170000, precioNino: 120000, tieneNino: true },
];

// Shared availability fetcher — same logic as BookingPopup
async function fetchDisponSal(fecha) {
  const [{ data: sals }, { data: reservasDay }, { data: cierresDay }, { data: ovrs }] = await Promise.all([
    supabase.from("salidas").select("*").eq("activo", true).order("hora"),
    supabase.from("reservas").select("salida_id, pax").eq("fecha", fecha).neq("estado", "cancelado"),
    supabase.from("cierres").select("tipo, salidas").eq("fecha", fecha).eq("activo", true),
    supabase.from("salidas_override").select("salida_id, accion").eq("fecha", fecha),
  ]);
  const allSals = sals || [];
  const paxBySal = {};
  (reservasDay || []).forEach(r => {
    if (r.salida_id) paxBySal[r.salida_id] = (paxBySal[r.salida_id] || 0) + (r.pax || 0);
  });
  const cierre = (cierresDay || [])[0] || null;
  const ovrMap = {};
  (ovrs || []).forEach(o => { ovrMap[o.salida_id] = o.accion; });

  return allSals.map(s => {
    let disp;
    if (ovrMap[s.id] === "cerrar") { disp = -1; }
    else if (ovrMap[s.id] === "abrir") { disp = Math.max(0, (s.capacidad_total || 30) - (paxBySal[s.id] || 0)); }
    else if (cierre?.tipo === "total" || (cierre?.salidas || []).includes(s.id)) { disp = -1; }
    else if (s.auto_apertura) {
      const fixedFull = allSals.filter(f => !f.auto_apertura)
        .every(f => (paxBySal[f.id] || 0) / (f.capacidad_total || 1) >= 0.9);
      disp = fixedFull ? Math.max(0, (s.capacidad_total || 30) - (paxBySal[s.id] || 0)) : -1;
    } else {
      disp = Math.max(0, (s.capacidad_total || 30) - (paxBySal[s.id] || 0));
    }
    return { ...s, disp };
  }).filter(s => s.disp > 0); // solo disponibles
}

function LanchaAtolonModal({ miembro, onClose, onCreated }) {
  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;
  const [fecha, setFecha]       = useState("");
  const [salidas, setSalidas]   = useState([]);
  const [loadingSal, setLoadingSal] = useState(false);
  const [salidaSel, setSalida]  = useState(null);
  const [pax, setPax]           = useState(1);
  const [notas, setNotas]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (!fecha || !supabase) return;
    setLoadingSal(true); setSalida(null);
    fetchDisponSal(fecha).then(s => { setSalidas(s); setLoadingSal(false); });
  }, [fecha]);

  const total = 50000 * pax;

  const handleCreate = async () => {
    if (!fecha)     { setError("Selecciona una fecha"); return; }
    if (!salidaSel) { setError("Selecciona una salida"); return; }
    setSaving(true);
    const { error: err } = await supabase.from("vip_reservas").insert({
      id: uid(), miembro_id: miembro.id, tipo: "lancha_atolon",
      fecha, hora: salidaSel.hora, personas: pax,
      notas: [`Salida: ${salidaSel.nombre} ${salidaSel.hora}`, `Transporte: ${(50000).toLocaleString("es-CO")} × ${pax} = $${total.toLocaleString("es-CO")}`, notas].filter(Boolean).join(" · "),
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false); onCreated(); onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: B.navyMid, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, padding: "28px 24px 44px", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>⛵ Lancha Atolon</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        {/* Info */}
        <div style={{ background: B.sand + "15", border: `1px solid ${B.sand}30`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, fontSize: 13, color: B.sand, lineHeight: 1.6 }}>
          Hasta <strong>{b.personasLancha} personas</strong> incluidas · <strong>$50.000 por persona</strong> de transporte
          {b.adicionalConsumible && <span style={{ color: "rgba(255,255,255,0.5)" }}> · Pax extra: ${(100000).toLocaleString("es-CO")} consumibles</span>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={LS}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={IS} />
          </div>

          {fecha && (
            <div>
              <label style={LS}>Salida disponible</label>
              {loadingSal ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "10px 0" }}>Verificando disponibilidad...</div>
              ) : salidas.length === 0 ? (
                <div style={{ background: B.danger + "18", border: `1px solid ${B.danger}33`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: B.danger }}>
                  No hay salidas disponibles para esta fecha
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {salidas.map(s => (
                    <button key={s.id} onClick={() => setSalida(s)} style={{
                      padding: "12px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", color: "#fff",
                      background: salidaSel?.id === s.id ? B.sky + "22" : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${salidaSel?.id === s.id ? B.sky : "rgba(255,255,255,0.1)"}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <span style={{ fontWeight: 700 }}>{s.hora}</span>
                        <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 10, fontSize: 13 }}>{s.nombre}</span>
                      </div>
                      <span style={{ fontSize: 11, color: B.success, background: B.success + "22", padding: "3px 10px", borderRadius: 20 }}>
                        {s.disp} cupos
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label style={LS}>Personas (máx. {b.personasLancha})</label>
            <select value={pax} onChange={e => setPax(parseInt(e.target.value))} style={{ ...IS, cursor: "pointer" }}>
              {Array.from({ length: b.personasLancha }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n} persona{n !== 1 ? "s" : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={LS}>Notas</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ocasión especial, preferencias..." style={IS} />
          </div>

          {/* Total */}
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Total transporte</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: B.sand }}>${total.toLocaleString("es-CO")}</span>
          </div>

          {error && <div style={{ color: B.danger, fontSize: 13 }}>{error}</div>}
          <button onClick={handleCreate} disabled={saving} style={{ padding: "14px", background: saving ? B.navyLight : B.sky, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Enviando..." : "Confirmar Reserva →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// COMPRAR PASADIA MODAL
// ══════════════════════════════════════════════════════
function ComprarPasadiaModal({ miembro, onClose, onCreated }) {
  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;
  const pct = b.descuentoPasadia;

  const [producto, setProducto]  = useState(null);
  const [fecha, setFecha]        = useState("");
  const [salidas, setSalidas]    = useState([]);
  const [loadingSal, setLoadingSal] = useState(false);
  const [salidaSel, setSalida]   = useState(null);
  const [paxA, setPaxA]          = useState(1);
  const [paxN, setPaxN]          = useState(0);
  const [notas, setNotas]        = useState("");
  const [saving, setSaving]      = useState(false);
  const [error, setError]        = useState("");

  useEffect(() => {
    if (!fecha || !supabase || producto?.id === "AFT") return;
    setLoadingSal(true); setSalida(null);
    fetchDisponSal(fecha).then(s => { setSalidas(s); setLoadingSal(false); });
  }, [fecha, producto]);

  const precioA = producto ? Math.round(producto.precio * (1 - pct / 100)) : 0;
  const precioN = producto ? Math.round((producto.precioNino || 0) * (1 - pct / 100)) : 0;
  const total   = precioA * paxA + precioN * paxN;

  const handleCreate = async () => {
    if (!producto)           { setError("Selecciona un tipo de pasadía"); return; }
    if (!fecha)              { setError("Selecciona una fecha"); return; }
    if (!salidaSel && producto.id !== "AFT") { setError("Selecciona una salida"); return; }
    setSaving(true);
    const { error: err } = await supabase.from("vip_reservas").insert({
      id: uid(), miembro_id: miembro.id, tipo: "lancha_atolon",
      fecha, hora: salidaSel?.hora || null,
      personas: paxA + paxN,
      notas: [
        `Pasadía: ${producto.label}`,
        `Adultos: ${paxA} × $${precioA.toLocaleString("es-CO")}`,
        paxN > 0 ? `Niños: ${paxN} × $${precioN.toLocaleString("es-CO")}` : null,
        `Descuento Society ${pct}% aplicado`,
        `Total: $${total.toLocaleString("es-CO")}`,
        salidaSel ? `Salida: ${salidaSel.nombre} ${salidaSel.hora}` : null,
        notas || null,
      ].filter(Boolean).join(" · "),
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false); onCreated(); onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: B.navyMid, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, padding: "28px 24px 44px", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🏖 Comprar Pasadía</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ background: b.color + "18", border: `1px solid ${b.color}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: b.color }}>
          {b.icon} {b.label} — <strong>{pct}% de descuento</strong> aplicado automáticamente
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Producto */}
          <div>
            <label style={LS}>Tipo de pasadía</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PASADIA_PRODUCTS.map(p => {
                const pa = Math.round(p.precio * (1 - pct / 100));
                const pn = Math.round((p.precioNino || 0) * (1 - pct / 100));
                return (
                  <button key={p.id} onClick={() => setProducto(p)} style={{
                    padding: "12px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", color: "#fff",
                    background: producto?.id === p.id ? B.sky + "22" : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${producto?.id === p.id ? B.sky : "rgba(255,255,255,0.1)"}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <span style={{ fontWeight: 700 }}>{p.icon} {p.label}</span>
                      {p.tieneNino && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginLeft: 8 }}>· Niños: ${pn.toLocaleString("es-CO")}</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textDecoration: "line-through" }}>${p.precio.toLocaleString("es-CO")}</div>
                      <div style={{ fontWeight: 800, color: B.success }}>${pa.toLocaleString("es-CO")}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={LS}>Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={IS} />
          </div>

          {/* Salidas (excepto After Island) */}
          {fecha && producto && producto.id !== "AFT" && (
            <div>
              <label style={LS}>Salida disponible</label>
              {loadingSal ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>Verificando disponibilidad...</div>
              ) : salidas.length === 0 ? (
                <div style={{ background: B.danger + "18", border: `1px solid ${B.danger}33`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color: B.danger }}>
                  No hay salidas disponibles para esta fecha
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {salidas.map(s => (
                    <button key={s.id} onClick={() => setSalida(s)} style={{
                      padding: "11px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer", color: "#fff",
                      background: salidaSel?.id === s.id ? B.sky + "22" : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${salidaSel?.id === s.id ? B.sky : "rgba(255,255,255,0.1)"}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <span style={{ fontWeight: 700 }}>{s.hora}</span>
                        <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 10, fontSize: 13 }}>{s.nombre}</span>
                      </div>
                      <span style={{ fontSize: 11, color: B.success, background: B.success + "22", padding: "3px 10px", borderRadius: 20 }}>
                        {s.disp} cupos
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pax */}
          {producto && (
            <div style={{ display: "grid", gridTemplateColumns: producto.tieneNino ? "1fr 1fr" : "1fr", gap: 10 }}>
              <div>
                <label style={LS}>Adultos</label>
                <select value={paxA} onChange={e => setPaxA(parseInt(e.target.value))} style={{ ...IS, cursor: "pointer" }}>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {producto.tieneNino && (
                <div>
                  <label style={LS}>Niños (hasta 12)</label>
                  <select value={paxN} onChange={e => setPaxN(parseInt(e.target.value))} style={{ ...IS, cursor: "pointer" }}>
                    {Array.from({ length: 11 }, (_, i) => i).map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div>
            <label style={LS}>Notas</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ocasión especial, peticiones..." style={IS} />
          </div>

          {/* Total */}
          {producto && (
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Total con descuento {pct}%</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: B.success }}>${total.toLocaleString("es-CO")}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                El equipo de Atolon confirmará tu reserva y coordina el pago
              </div>
            </div>
          )}

          {error && <div style={{ color: B.danger, fontSize: 13 }}>{error}</div>}
          <button onClick={handleCreate} disabled={saving} style={{ padding: "14px", background: saving ? B.navyLight : B.success, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Enviando..." : "Solicitar Pasadía →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN PORTAL
// ══════════════════════════════════════════════════════
function MainPortal({ miembro: initialMiembro, onLogout }) {
  const [miembro, setMiembro] = useState(initialMiembro);
  const [reservas, setReservas] = useState([]);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRecibo, setShowRecibo] = useState(false);
  const [showReserva, setShowReserva] = useState(null);
  const [showCardFull, setShowCardFull] = useState(false);
  const [showLancha, setShowLancha] = useState(false);
  const [showPasadia, setShowPasadia] = useState(false);
  const w = useW();
  const isMobile = w < 640;

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    const [{ data: res }, { data: transactions }, { data: m }] = await Promise.all([
      supabase.from("vip_reservas").select("*").eq("miembro_id", miembro.id).order("fecha", { ascending: false }),
      supabase.from("vip_transacciones").select("*").eq("miembro_id", miembro.id).order("created_at", { ascending: false }),
      supabase.from("vip_miembros").select("*").eq("id", miembro.id).single(),
    ]);
    setReservas(res || []);
    setTxs(transactions || []);
    if (m) setMiembro(m);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;
  const equivalenciaCOP = (miembro.puntos_disponibles || 0) * 10;

  const estadoColor = { pendiente: B.warning, confirmada: B.success, cancelada: B.danger, completada: B.sky };
  const estadoLabel = { pendiente: "Pendiente", confirmada: "Confirmada", cancelada: "Cancelada", completada: "Completada" };
  const tipoColor = { ganados: B.success, canjeados: B.danger, ajuste: B.warning };
  const tipoLabel = { ganados: "Ganados", canjeados: "Canjeados", ajuste: "Ajuste" };

  return (
    <div style={{ minHeight: "100vh", background: B.navy, fontFamily: "inherit" }}>
      {showRecibo   && <SubirReciboModal miembro={miembro} onClose={() => setShowRecibo(false)} onSubmitted={load} />}
      {showReserva  && <ReservaModal tipo={showReserva} miembro={miembro} onClose={() => setShowReserva(null)} onCreated={load} />}
      {showLancha   && <LanchaAtolonModal miembro={miembro} onClose={() => setShowLancha(false)} onCreated={load} />}
      {showPasadia  && <ComprarPasadiaModal miembro={miembro} onClose={() => setShowPasadia(false)} onCreated={load} />}
      {showCardFull && <CardFullscreen miembro={miembro} onClose={() => setShowCardFull(false)} />}

      {/* Header */}
      <div style={{ background: B.navyMid, borderBottom: `1px solid ${B.navyLight}`, padding: isMobile ? "12px 16px" : "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/favicon-blue.png" alt="Atolon" style={{ height: isMobile ? 28 : 36, objectFit: "contain" }} />
          <div>
            <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 800, letterSpacing: 1 }}>✦ Atolón Society</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Atolon Beach Club</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: "none", border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 8, color: "rgba(255,255,255,0.5)", fontSize: 12, padding: "6px 12px", cursor: "pointer" }}>
          Salir
        </button>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: isMobile ? "16px 12px 80px" : "24px 20px 60px" }}>
        {/* Membership Card */}
        <div style={{ marginBottom: 20 }}>
          <MembershipCard miembro={miembro} onTap={() => setShowCardFull(true)} />
        </div>

        {/* Mis Puntos */}
        <div style={{ background: B.navyMid, borderRadius: 16, padding: isMobile ? "20px 16px" : "24px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Mis Puntos Disponibles</div>
          <div style={{ fontSize: isMobile ? 44 : 56, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "-0.02em", color: b.color, lineHeight: 1 }}>
            {(miembro.puntos_disponibles || 0).toLocaleString("es-CO")}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
            Equivalen a <strong style={{ color: B.success }}>{COP(equivalenciaCOP)}</strong> en consumos
          </div>
          <button onClick={() => setShowRecibo(true)} style={{
            marginTop: 16, padding: "13px 28px", background: `linear-gradient(135deg, ${B.sky}, #3b82f6)`,
            color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(59,130,246,0.35)", width: isMobile ? "100%" : "auto",
          }}>
            📸 Subir Recibo
          </button>
        </div>

        {/* Reservas */}
        <div style={{ background: B.navyMid, borderRadius: 16, padding: isMobile ? "20px 16px" : "24px", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, fontFamily: "'Barlow Condensed', sans-serif" }}>Mis Reservas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            <button onClick={() => setShowReserva("llegada")} style={{
              padding: "16px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12, cursor: "pointer", textAlign: "left", color: "#fff", display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{ fontSize: 26 }}>🚤</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Reservar Llegada Propia</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Notifica tu llegada en embarcación propia</div>
              </div>
            </button>
            <button onClick={() => setShowLancha(true)} style={{
              padding: "16px 20px", background: `rgba(96,165,250,0.08)`, border: `1px solid ${B.sky}44`,
              borderRadius: 12, cursor: "pointer", textAlign: "left", color: "#fff", display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{ fontSize: 26 }}>⛵</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Reservar Lancha Atolon</div>
                <div style={{ fontSize: 11, color: B.sky }}>Hasta {b.personasLancha} pax · $50.000 por persona</div>
              </div>
            </button>
            <button onClick={() => setShowPasadia(true)} style={{
              padding: "16px 20px", background: `rgba(52,211,153,0.08)`, border: `1px solid ${B.success}44`,
              borderRadius: 12, cursor: "pointer", textAlign: "left", color: "#fff", display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{ fontSize: 26 }}>🏖</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Comprar Pasadía</div>
                <div style={{ fontSize: 11, color: B.success }}>{b.descuentoPasadia}% de descuento Society aplicado</div>
              </div>
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "16px 0" }}>Cargando...</div>
          ) : reservas.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "16px 0", fontSize: 13 }}>Sin reservas aún</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reservas.slice(0, 5).map(r => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                      {r.tipo === "lancha_propia" ? "🚤 Llegada propia" : r.tipo === "lancha_atolon" ? "⛵ Lancha Atolon" : r.tipo === "restaurante" ? "🍽 Restaurante" : r.tipo === "cama_playa" ? "🛏 Cama de Playa" : r.tipo}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{r.fecha} · {r.personas} persona{r.personas !== 1 ? "s" : ""}</div>
                  </div>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: (estadoColor[r.estado] || "#fff") + "22", color: estadoColor[r.estado] || "#fff" }}>
                    {estadoLabel[r.estado] || r.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historial de Puntos */}
        <div style={{ background: B.navyMid, borderRadius: 16, padding: "24px" }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>Historial de Puntos</div>
          {loading ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "16px 0" }}>Cargando...</div>
          ) : txs.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "16px 0", fontSize: 13 }}>
              Sin movimientos aún. ¡Sube tu primer recibo!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {txs.map(tx => (
                <div key={tx.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "12px 14px",
                  borderLeft: `3px solid ${tipoColor[tx.tipo] || B.navyLight}`,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, color: tipoColor[tx.tipo] }}>
                      {tx.tipo === "ganados" ? "+" : tx.tipo === "canjeados" ? "-" : "±"}{tx.puntos?.toLocaleString("es-CO")} pts · {tipoLabel[tx.tipo]}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                      {tx.descripcion || "—"}
                      {tx.monto_consumo ? ` · ${COP(tx.monto_consumo)}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                      {new Date(tx.created_at).toLocaleDateString("es-CO")}
                    </div>
                  </div>
                  {!tx.validado && (
                    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: B.warning + "22", color: B.warning, flexShrink: 0, marginLeft: 12 }}>En revisión</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mi Perfil */}
        <PerfilSection miembro={miembro} onUpdated={(updated) => setMiembro(m => ({ ...m, ...updated }))} />

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// PERFIL — editar email y teléfono
// ══════════════════════════════════════════════════════
function PerfilSection({ miembro, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail]     = useState(miembro.email || "");
  const [tel, setTel]         = useState(miembro.telefono || "");
  const [saving, setSaving]   = useState(false);
  const [ok, setOk]           = useState(false);
  const [error, setError]     = useState("");

  const handleSave = async () => {
    if (!email.trim()) { setError("El email no puede estar vacío"); return; }
    setSaving(true); setError("");
    const { error: err } = await supabase.from("vip_miembros")
      .update({ email: email.trim().toLowerCase(), telefono: tel.trim() || null })
      .eq("id", miembro.id);
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false); setOk(true); setEditing(false);
    onUpdated({ email: email.trim().toLowerCase(), telefono: tel.trim() || null });
    setTimeout(() => setOk(false), 3000);
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 16, padding: "20px", marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing ? 16 : 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>Mi Perfil</div>
        {!editing && (
          <button onClick={() => { setEditing(true); setOk(false); }} style={{ background: "none", border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 8, color: "rgba(255,255,255,0.6)", fontSize: 12, padding: "5px 12px", cursor: "pointer" }}>
            ✏️ Editar
          </button>
        )}
      </div>

      {!editing ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Email</span>
            <span>{miembro.email}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Teléfono</span>
            <span>{miembro.telefono || <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>}</span>
          </div>
          {ok && <div style={{ fontSize: 12, color: B.success, marginTop: 4 }}>✓ Datos actualizados</div>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={LS}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={IS} />
          </div>
          <div>
            <label style={LS}>Teléfono</label>
            <input type="tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="+57 300 000 0000" style={IS} />
          </div>
          {error && <div style={{ color: B.danger, fontSize: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditing(false)} style={{ flex: 1, padding: "11px", background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 10, color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: "11px", background: saving ? B.navyLight : B.sky, border: "none", borderRadius: 10, color: saving ? "rgba(255,255,255,0.3)" : "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer" }}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════
const SESSION_KEY = "vip_society_session";

export default function VIPPortal() {
  const [session, setSession] = useState(() => {
    try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [forceSetClave, setForceSetClave] = useState(false);

  const handleLogin = (miembro) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(miembro));
    setSession(miembro);
    if (!miembro.clave) setForceSetClave(true);
  };

  const handlePasswordSet = (newClave) => {
    setSession(s => {
      const updated = { ...s, clave: newClave };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      return updated;
    });
    setForceSetClave(false);
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setForceSetClave(false);
  };

  if (!session) return <LoginScreen onLogin={handleLogin} />;
  if (forceSetClave) return <SetPasswordScreen miembro={session} onDone={handlePasswordSet} />;
  return <MainPortal miembro={session} onLogout={handleLogout} />;
}
