import { useState, useEffect, useRef } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" };

const BENEFICIOS = {
  coral: { pct: 5,  camas: 2,     personas: 2, color: "#f87171", label: "Coral Member", icon: "🪸", desc: "Entry level – acceso base",
           embarcacionPropia: false, personasLancha: 2, transporteOcean: null },
  reef:  { pct: 8,  camas: 4,     personas: 4, color: "#34d399", label: "Reef Member",  icon: "🐚", desc: "Cliente frecuente – upgrades y perks",
           embarcacionPropia: false, personasLancha: 4, transporteOcean: null },
  ocean: { pct: 10, camas: "VIP", personas: 6, color: "#60a5fa", label: "Ocean Member", icon: "🌊", desc: "Elite – experiencia completa",
           embarcacionPropia: true, personasLancha: 6, transporteOcean: 50000 },
};

const CARD_GRADIENTS = {
  coral: "linear-gradient(135deg, #7f1d1d 0%, #450a0a 60%, #991b1b 100%)",
  reef:  "linear-gradient(135deg, #064e3b 0%, #022c22 60%, #065f46 100%)",
  ocean: "linear-gradient(135deg, #1e3a5f 0%, #0c1a35 60%, #1e40af 100%)",
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ══════════════════════════════════════════════════════
// MEMBERSHIP CARD
// ══════════════════════════════════════════════════════
function MembershipCard({ miembro, fullWidth = true }) {
  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;
  const gradient = CARD_GRADIENTS[miembro.nivel] || CARD_GRADIENTS.coral;
  return (
    <div style={{
      background: gradient,
      borderRadius: 20,
      padding: "32px 36px",
      color: "#fff",
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      width: fullWidth ? "100%" : "auto",
      boxSizing: "border-box",
    }}>
      <div style={{ position: "absolute", top: -50, right: -50, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
      <div style={{ position: "absolute", bottom: -70, right: 30, width: 280, height: 280, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />
      <div style={{ position: "absolute", top: 40, right: -20, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, position: "relative" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, opacity: 0.65, textTransform: "uppercase" }}>✦ ATOLÓN SOCIETY</div>
        <div style={{
          padding: "5px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)",
          color: b.color, border: `1px solid ${b.color}77`,
          letterSpacing: 1,
        }}>
          {b.icon} {b.label.toUpperCase()}
        </div>
      </div>

      <div style={{ marginBottom: 24, position: "relative" }}>
        <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 6, letterSpacing: "-0.01em" }}>
          {miembro.nombre}
        </div>
        <div style={{ fontSize: 12, opacity: 0.5, letterSpacing: 3, fontFamily: "monospace" }}>{miembro.numero_membresia || "—"}</div>
      </div>

      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", position: "relative" }}>
        <div>
          <div style={{ fontSize: 9, opacity: 0.45, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>PUNTOS DISPONIBLES</div>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "-0.02em" }}>
            ◉ {(miembro.puntos_disponibles || 0).toLocaleString("es-CO")}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, opacity: 0.45, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>BENEFICIOS ACTIVOS</div>
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.9 }}>
            {miembro.nivel === "ocean" ? (
              <>
                🛏 Camas VIP ilimitadas<br />
                🚤 Embarcación propia · sin límite de pax<br />
                ⛵ Lancha Atolon hasta {b.personasLancha} pax · <span style={{ color: b.color }}>$50.000 transporte</span><br />
                💰 {b.pct}% en puntos (sin imp. ni propina)
              </>
            ) : (
              <>
                🛏 {b.camas} camas · 🍽 {b.personas} personas<br />
                💰 {b.pct}% del consumo en puntos
              </>
            )}
          </div>
        </div>
      </div>
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
  const [monto, setMonto] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!file) { setError("Selecciona una foto del recibo"); return; }
    if (!monto || isNaN(parseFloat(monto))) { setError("Ingresa el monto del consumo"); return; }
    setUploading(true); setError("");
    let recibo_url = null;
    // Upload to Supabase storage
    if (supabase) {
      const ext = file.name.split(".").pop();
      const path = `${miembro.id}/${uid()}.${ext}`;
      const { data: upData, error: upErr } = await supabase.storage.from("vip-recibos").upload(path, file);
      if (upErr) { setError("Error subiendo imagen: " + upErr.message); setUploading(false); return; }
      const { data: urlData } = supabase.storage.from("vip-recibos").getPublicUrl(path);
      recibo_url = urlData?.publicUrl || null;
    }
    // Insert transaction
    const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.coral;
    const montoNum = parseFloat(monto);
    const puntosEstimados = Math.floor(montoNum * b.pct / 100 / 10); // rough estimate
    const { error: txErr } = await supabase.from("vip_transacciones").insert({
      id: uid(), miembro_id: miembro.id, tipo: "ganados",
      puntos: puntosEstimados, descripcion: "Recibo pendiente de validación",
      recibo_url, monto_consumo: montoNum, validado: false,
    });
    if (txErr) { setError(txErr.message); setUploading(false); return; }
    setUploading(false);
    setSuccess(true);
    setTimeout(() => { onSubmitted(); onClose(); }, 2500);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: B.navyMid, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, padding: "28px 24px 40px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontFamily: "'Barlow Condensed', sans-serif" }}>📸 Subir Recibo</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>¡Recibo recibido!</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
              Tu recibo está en revisión. Los puntos se acreditarán en las próximas 24 horas.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={LS}>Foto del recibo</label>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
              <div onClick={() => fileRef.current?.click()} style={{
                border: `2px dashed ${B.navyLight}`, borderRadius: 12, padding: "24px", textAlign: "center",
                cursor: "pointer", background: "rgba(255,255,255,0.03)", transition: "border-color 0.2s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = B.sky}
                onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}
              >
                {preview ? (
                  <img src={preview} alt="Preview" style={{ maxHeight: 200, borderRadius: 8, maxWidth: "100%", objectFit: "contain" }} />
                ) : (
                  <div>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>Toca para tomar o seleccionar foto</div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label style={LS}>Monto del consumo (COP)</label>
              <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="Ej: 150000" style={IS} />
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
              Con tu nivel <strong style={{ color: BENEFICIOS[miembro.nivel]?.color }}>
                {BENEFICIOS[miembro.nivel]?.icon} {BENEFICIOS[miembro.nivel]?.label}
              </strong>, ganas el <strong>{BENEFICIOS[miembro.nivel]?.pct}%</strong> en puntos.
              {monto && !isNaN(parseFloat(monto)) && (
                <span> Puntos estimados: <strong style={{ color: B.success }}>~{Math.floor(parseFloat(monto) * (BENEFICIOS[miembro.nivel]?.pct || 5) / 100 / 10).toLocaleString("es-CO")} pts</strong></span>
              )}
            </div>
            {error && <div style={{ color: B.danger, fontSize: 13 }}>{error}</div>}
            <button onClick={handleSubmit} disabled={uploading} style={{ padding: "14px", background: uploading ? B.navyLight : B.success, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: uploading ? "default" : "pointer" }}>
              {uploading ? "Subiendo..." : "Enviar Recibo"}
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
  const esOcean = miembro.nivel === "ocean";

  // Para llegada en lancha (Ocean): seleccionar tipo de llegada
  const [llegadaTipo, setLlegadaTipo] = useState(
    tipo === "llegada" ? (esOcean ? null : "lancha_atolon") : null
  );

  const [form, setForm] = useState({ fecha: "", hora: "", personas: 1, notas: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const maxPersonas = tipo === "cama_playa" ? (esOcean ? 20 : b.camas)
                    : tipo === "restaurante" ? b.personas
                    : llegadaTipo === "lancha_atolon" ? b.personasLancha
                    : 99; // embarcación propia: sin límite real

  const titulo = tipo === "restaurante" ? "🍽 Reservar Restaurante"
               : tipo === "cama_playa"  ? "🛏 Reservar Cama de Playa"
               : "⛵ Reservar Llegada";

  const handleCreate = async () => {
    if (!form.fecha) { setError("Selecciona una fecha"); return; }
    if (tipo === "llegada" && !llegadaTipo) { setError("Selecciona cómo llegas"); return; }
    setSaving(true);
    const tipoFinal = tipo === "llegada"
      ? (llegadaTipo === "propia" ? "lancha_propia" : "lancha_atolon")
      : tipo;
    const { error: err } = await supabase.from("vip_reservas").insert({
      id: uid(), miembro_id: miembro.id, tipo: tipoFinal,
      fecha: form.fecha, hora: form.hora || null,
      personas: form.personas,
      notas: [
        llegadaTipo === "lancha_atolon" ? `Transporte Atolon: $50,000` : null,
        form.notas || null,
      ].filter(Boolean).join(" · ") || null,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false); onCreated(); onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: B.navyMid, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, padding: "28px 24px 40px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{titulo}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        {/* Selección tipo llegada (solo Ocean, solo tipo=llegada) */}
        {tipo === "llegada" && esOcean && !llegadaTipo && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>¿Cómo llegas a Atolon?</div>
            <button onClick={() => setLlegadaTipo("propia")}
              style={{ padding: "18px 20px", borderRadius: 14, border: `2px solid ${b.color}44`, background: B.navy, color: "#fff", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 30 }}>🚤</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Embarcación propia</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>Sin límite de personas · Acceso camas VIP · Sin costo de transporte</div>
                </div>
              </div>
            </button>
            <button onClick={() => setLlegadaTipo("lancha_atolon")}
              style={{ padding: "18px 20px", borderRadius: 14, border: `2px solid ${B.sky}44`, background: B.navy, color: "#fff", cursor: "pointer", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 30 }}>⛵</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Lancha de Atolon</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>Hasta {b.personasLancha} personas · Solo pagas <strong style={{ color: B.sand }}>$50.000 por transporte</strong></div>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Formulario */}
        {(tipo !== "llegada" || llegadaTipo) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Resumen si es lancha Atolon Ocean */}
            {tipo === "llegada" && llegadaTipo === "lancha_atolon" && (
              <div style={{ background: B.sand + "18", border: `1px solid ${B.sand}33`, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.sand }}>⛵ Lancha Atolon</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Máx. {b.personasLancha} personas</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Costo de transporte</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.sand }}>$50.000</div>
                </div>
              </div>
            )}
            {tipo === "llegada" && llegadaTipo === "propia" && (
              <div style={{ background: b.color + "18", border: `1px solid ${b.color}33`, borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: b.color }}>🚤 Embarcación propia · Sin límite de pax</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Acceso directo a camas VIP</div>
              </div>
            )}

            {/* Cambiar selección */}
            {tipo === "llegada" && esOcean && (
              <button onClick={() => setLlegadaTipo(null)} style={{ background: "none", border: "none", color: B.sky, fontSize: 12, cursor: "pointer", textAlign: "left", padding: 0 }}>
                ← Cambiar tipo de llegada
              </button>
            )}

            <div>
              <label style={LS}>Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Hora (opcional)</label>
              <input type="time" value={form.hora} onChange={e => set("hora", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>
                {llegadaTipo === "propia" ? "Personas aprox." : `Personas (máx. ${maxPersonas === 99 ? "ilimitado" : maxPersonas})`}
              </label>
              {llegadaTipo === "propia" ? (
                <input type="number" min="1" value={form.personas} onChange={e => set("personas", parseInt(e.target.value) || 1)} style={IS} />
              ) : (
                <select value={form.personas} onChange={e => set("personas", parseInt(e.target.value))} style={{ ...IS, cursor: "pointer" }}>
                  {Array.from({ length: maxPersonas === 99 ? 30 : maxPersonas }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n} persona{n !== 1 ? "s" : ""}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label style={LS}>Notas</label>
              <input value={form.notas} onChange={e => set("notas", e.target.value)} placeholder="Ocasión especial, preferencias..." style={IS} />
            </div>
            {error && <div style={{ color: B.danger, fontSize: 13 }}>{error}</div>}
            <button onClick={handleCreate} disabled={saving} style={{ padding: "14px", background: saving ? B.navyLight : B.sky, color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: saving ? "default" : "pointer" }}>
              {saving ? "Enviando..." : "Confirmar Reserva →"}
            </button>
          </div>
        )}
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
  const [showReserva, setShowReserva] = useState(null); // 'restaurante' | 'cama_playa'

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
      {showRecibo && <SubirReciboModal miembro={miembro} onClose={() => setShowRecibo(false)} onSubmitted={load} />}
      {showReserva && <ReservaModal tipo={showReserva} miembro={miembro} onClose={() => setShowReserva(null)} onCreated={load} />}

      {/* Header */}
      <div style={{ background: B.navyMid, borderBottom: `1px solid ${B.navyLight}`, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/favicon-blue.png" alt="Atolon" style={{ height: 36, objectFit: "contain" }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1 }}>✦ Atolón Society</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Atolon Beach Club</div>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: "none", border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 8, color: "rgba(255,255,255,0.5)", fontSize: 13, padding: "7px 14px", cursor: "pointer" }}>
          Salir
        </button>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 60px" }}>
        {/* Membership Card */}
        <div style={{ marginBottom: 28 }}>
          <MembershipCard miembro={miembro} />
        </div>

        {/* Mis Puntos */}
        <div style={{ background: B.navyMid, borderRadius: 16, padding: "24px", marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Mis Puntos Disponibles</div>
          <div style={{ fontSize: 56, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "-0.02em", color: b.color, lineHeight: 1 }}>
            {(miembro.puntos_disponibles || 0).toLocaleString("es-CO")}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
            Equivalen a <strong style={{ color: B.success }}>{COP(equivalenciaCOP)}</strong> en consumos
          </div>
          <button onClick={() => setShowRecibo(true)} style={{
            marginTop: 20, padding: "13px 28px", background: `linear-gradient(135deg, ${B.sky}, #3b82f6)`,
            color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(59,130,246,0.35)",
          }}>
            📸 Subir Recibo
          </button>
        </div>

        {/* Reservas */}
        <div style={{ background: B.navyMid, borderRadius: 16, padding: "24px", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>Mis Reservas</div>
          <div style={{ display: "grid", gridTemplateColumns: b.embarcacionPropia ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <button onClick={() => setShowReserva("cama_playa")} style={{
              padding: "18px 12px", background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.1)`,
              borderRadius: 12, cursor: "pointer", textAlign: "center", color: "#fff",
            }}>
              <div style={{ fontSize: 26, marginBottom: 5 }}>🛏</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Cama de Playa</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{b.embarcacionPropia ? "Camas VIP" : `Hasta ${b.camas} camas`}</div>
            </button>
            <button onClick={() => setShowReserva("restaurante")} style={{
              padding: "18px 12px", background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.1)`,
              borderRadius: 12, cursor: "pointer", textAlign: "center", color: "#fff",
            }}>
              <div style={{ fontSize: 26, marginBottom: 5 }}>🍽</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Restaurante</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Hasta {b.personas} personas</div>
            </button>
            {b.embarcacionPropia && (
              <button onClick={() => setShowReserva("llegada")} style={{
                padding: "18px 12px", background: `rgba(96,165,250,0.1)`, border: `1px solid ${b.color}44`,
                borderRadius: 12, cursor: "pointer", textAlign: "center", color: "#fff",
              }}>
                <div style={{ fontSize: 26, marginBottom: 5 }}>⛵</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Reservar Llegada</div>
                <div style={{ fontSize: 11, color: b.color }}>Propia o Atolon</div>
              </button>
            )}
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
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{r.tipo === "restaurante" ? "🍽 Restaurante" : "🛏 Cama de Playa"}</div>
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
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════
export default function VIPPortal() {
  const [session, setSession] = useState(null);
  const [forceSetClave, setForceSetClave] = useState(false);

  const handleLogin = (miembro) => {
    setSession(miembro);
    if (!miembro.clave) setForceSetClave(true);
  };

  const handlePasswordSet = (newClave) => {
    setSession(s => ({ ...s, clave: newClave }));
    setForceSetClave(false);
  };

  const handleLogout = () => { setSession(null); setForceSetClave(false); };

  if (!session) return <LoginScreen onLogin={handleLogin} />;
  if (forceSetClave) return <SetPasswordScreen miembro={session} onDone={handlePasswordSet} />;
  return <MainPortal miembro={session} onLogout={handleLogout} />;
}
