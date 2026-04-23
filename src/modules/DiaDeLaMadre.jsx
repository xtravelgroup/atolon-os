import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl } from "../lib/wompi";
import FacturaElectronicaForm, { FacturaElectronicaToggle, FE_EMPTY, feValidate, fePayload } from "../lib/FacturaElectronicaForm.jsx";

// ── Paleta ────────────────────────────────────────────────────────────────────
const ROSA      = "#F472B6";
const ROSA2     = "#EC4899";
const DORADO    = "#F59E0B";
const DORADO2   = "#D97706";
const OSCURO    = "#0D0610";
const OSCURO_MID= "#130A18";
const CARD      = "#1A0F20";
const CARD2     = "#160C1C";
const BLANCO    = "#FFF5F8";

const COP = (v) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(v);

const PRECIO_A = 320_000;
const PRECIO_N = 240_000;
const FECHA    = "2025-05-10";

const INCLUYE = [
  { icon: "⛵", titulo: "Atardecer en Catamarán Flamante", desc: "Un paseo mágico por la Bahía de Cartagena viendo caer el sol en el Caribe." },
  { icon: "🍹", titulo: "Open Bar",                         desc: "Cócteles, vinos y bebidas ilimitadas durante el recorrido en catamarán." },
  { icon: "🍽️", titulo: "Cena Buffet en Atolon",            desc: "Mesa de sabores del Caribe en nuestro beach club frente al mar." },
  { icon: "🎭", titulo: "Show en vivo",                      desc: "Una noche de entretenimiento especial diseñada para celebrar a mamá." },
];

const PROGRAMA = [
  { hora: "4:30 PM",  icon: "⚓", label: "Abordaje",        desc: "Muelle de la Bodeguita — Puerta 4" },
  { hora: "5:00 PM",  icon: "⛵", label: "Zarpe",            desc: "Salida en Catamarán Flamante por la Bahía con Open Bar" },
  { hora: "5:30 PM",  icon: "🌅", label: "Atardecer",        desc: "Atardecer por la Bahía de Cartagena" },
  { hora: "6:30 PM",  icon: "🏖️", label: "Llegada a Atolón", desc: "Arribo al Atolón Beach Club" },
  { hora: "7:00 PM",  icon: "🍽️", label: "Cena Buffet",      desc: "Cena tipo buffet y show especial para mamá" },
  { hora: "10:00 PM", icon: "🌙", label: "Retorno",          desc: "Regreso a Cartagena" },
];

const IS = {
  width: "100%", padding: "13px 16px", borderRadius: 10,
  border: "1.5px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
  color: BLANCO, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ value, onChange, min = 0 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width: 38, height: 38, borderRadius: "50%", border: `1.5px solid ${ROSA}`, background: "transparent", color: ROSA, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
        −
      </button>
      <span style={{ fontSize: 24, fontWeight: 700, color: BLANCO, minWidth: 30, textAlign: "center" }}>{value}</span>
      <button onClick={() => onChange(value + 1)}
        style={{ width: 38, height: 38, borderRadius: "50%", border: `1.5px solid ${ROSA}`, background: "transparent", color: ROSA, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
        +
      </button>
    </div>
  );
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function Countdown() {
  const calc = () => {
    const diff = new Date("2025-05-10T16:30:00-05:00") - new Date();
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return { d, h, m };
  };
  const [t, setT] = useState(calc);
  useEffect(() => { const id = setInterval(() => setT(calc()), 30000); return () => clearInterval(id); }, []);
  if (!t) return null;
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 36 }}>
      {[["Días", t.d], ["Horas", t.h], ["Min", t.m]].map(([lbl, val]) => (
        <div key={lbl} style={{ textAlign: "center", background: "rgba(244,114,182,0.1)", border: `1px solid ${ROSA}33`, borderRadius: 12, padding: "14px 20px", minWidth: 72 }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 36, fontWeight: 900, color: ROSA, lineHeight: 1 }}>{val}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>{lbl}</div>
        </div>
      ))}
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero({ onScrollToBook }) {
  return (
    <div>
      {/* Hero principal */}
      <div style={{
        background: `radial-gradient(ellipse at 50% 0%, #3d0a2a 0%, ${OSCURO} 70%)`,
        padding: "72px 20px 60px", textAlign: "center",
        position: "relative", overflow: "hidden",
        borderBottom: `1px solid ${ROSA}22`,
      }}>
        {/* Decoración fondo */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 320, opacity: 0.025, pointerEvents: "none", userSelect: "none" }}>🌸</div>
        <div style={{ position: "absolute", top: "10%", left: "5%",  fontSize: 60, opacity: 0.06, pointerEvents: "none" }}>🌹</div>
        <div style={{ position: "absolute", top: "20%", right: "6%", fontSize: 48, opacity: 0.06, pointerEvents: "none" }}>🌺</div>
        <div style={{ position: "absolute", bottom: "15%", left: "8%", fontSize: 40, opacity: 0.05, pointerEvents: "none" }}>✨</div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto" }}>
          {/* Badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `${ROSA}18`, border: `1px solid ${ROSA}44`, borderRadius: 40, padding: "7px 20px", marginBottom: 28 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ROSA, display: "inline-block", animation: "blink 1.5s ease-in-out infinite" }} />
            <span style={{ fontSize: 12, color: ROSA, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>10 de Mayo · Cartagena 2025</span>
          </div>

          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(42px, 8vw, 80px)", fontWeight: 900, color: BLANCO, lineHeight: 1.0, margin: "0 0 10px", letterSpacing: "-0.01em" }}>
            Una noche inolvidable<br />
            <span style={{ background: `linear-gradient(135deg, ${ROSA}, ${DORADO})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>para mamá.</span>
          </h1>

          <p style={{ fontSize: "clamp(16px, 2.5vw, 20px)", color: "rgba(255,245,248,0.65)", lineHeight: 1.65, maxWidth: 560, margin: "14px auto 36px" }}>
            Atardecer en Catamarán por la Bahía de Cartagena,<br />
            Open Bar · Cena Buffet · Show en vivo.
          </p>

          <Countdown />

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 42 }}>
            {[["⛵", "Catamarán Flamante"], ["🍹", "Open Bar"], ["🍽️", "Cena Buffet"], ["🎭", "Show en vivo"]].map(([icon, label]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 20, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 13, color: "rgba(255,245,248,0.75)", fontWeight: 500 }}>
                <span>{icon}</span>{label}
              </div>
            ))}
          </div>

          <button onClick={onScrollToBook}
            style={{ background: `linear-gradient(135deg, ${ROSA2}, ${ROSA})`, color: "#fff", border: "none", borderRadius: 50, padding: "18px 54px", fontSize: 18, fontWeight: 900, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", boxShadow: `0 8px 40px ${ROSA}55`, transition: "transform 0.15s, box-shadow 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 14px 50px ${ROSA}77`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = `0 8px 40px ${ROSA}55`; }}>
            🌹 Celebrar a mamá
          </button>
        </div>
      </div>

      {/* Incluye */}
      <div style={{ background: OSCURO_MID, padding: "60px 20px", borderBottom: `1px solid ${ROSA}15` }}>
        <div style={{ maxWidth: 920, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div style={{ fontSize: 12, color: ROSA, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Una experiencia completa</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, color: BLANCO }}>Todo incluido para mamá</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 18 }}>
            {INCLUYE.map(item => (
              <div key={item.titulo} style={{ background: CARD, borderRadius: 18, padding: "30px 22px", textAlign: "center", border: `1px solid ${ROSA}18`, transition: "border-color 0.2s" }}>
                <div style={{ fontSize: 44, marginBottom: 16 }}>{item.icon}</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 800, color: ROSA, marginBottom: 10, lineHeight: 1.2 }}>{item.titulo}</div>
                <div style={{ fontSize: 13, color: "rgba(255,245,248,0.55)", lineHeight: 1.65 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Programa de la noche */}
      <div style={{ background: OSCURO, padding: "60px 20px", borderBottom: `1px solid ${ROSA}15` }}>
        <div style={{ maxWidth: 660, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 12, color: DORADO, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Sábado 10 de Mayo</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(24px, 4vw, 38px)", fontWeight: 900, color: BLANCO }}>Programa de la noche</div>
          </div>
          <div style={{ position: "relative", paddingLeft: 32 }}>
            <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 2, background: `linear-gradient(to bottom, ${ROSA}88, ${DORADO}44)`, borderRadius: 1 }} />
            {PROGRAMA.map((p, i) => (
              <div key={p.hora} style={{ position: "relative", marginBottom: i < PROGRAMA.length - 1 ? 28 : 0 }}>
                <div style={{ position: "absolute", left: -26, top: 4, width: 14, height: 14, borderRadius: "50%", background: i < 2 ? ROSA : i < 4 ? DORADO : `${ROSA}66`, border: `2px solid ${OSCURO}`, zIndex: 1 }} />
                <div style={{ background: CARD, borderRadius: 12, padding: "14px 18px", border: `1px solid rgba(255,255,255,0.06)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>{p.icon}</span>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 800, color: BLANCO }}>{p.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: ROSA, fontWeight: 700 }}>{p.hora}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,245,248,0.5)", paddingLeft: 28 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Precio destacado */}
      <div style={{ background: `linear-gradient(135deg, #2d0520 0%, #1a0318 50%, #0f0a18 100%)`, padding: "60px 20px", textAlign: "center", borderTop: `2px solid ${ROSA}44`, borderBottom: `2px solid ${ROSA}44`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 260, opacity: 0.03, pointerEvents: "none" }}>🌹</div>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto" }}>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 900, color: BLANCO, marginBottom: 28, lineHeight: 1.1 }}>
            Una noche de lujo<br /><span style={{ color: ROSA }}>a un precio especial.</span>
          </div>
          <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", marginBottom: 36 }}>
            <div style={{ background: CARD, borderRadius: 18, padding: "28px 36px", border: `2px solid ${ROSA}`, boxShadow: `0 0 40px ${ROSA}22` }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Adulto</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 44, fontWeight: 900, color: ROSA, lineHeight: 1 }}>{COP(PRECIO_A)}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>por persona</div>
            </div>
            <div style={{ background: CARD, borderRadius: 18, padding: "28px 36px", border: `1px solid ${ROSA}44` }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Niño (0–11)</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 44, fontWeight: 900, color: "rgba(244,114,182,0.7)", lineHeight: 1 }}>{COP(PRECIO_N)}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>por persona</div>
            </div>
          </div>
          <button onClick={onScrollToBook}
            style={{ background: `linear-gradient(135deg, ${ROSA2}, ${ROSA})`, color: "#fff", border: "none", borderRadius: 50, padding: "17px 52px", fontSize: 17, fontWeight: 900, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", boxShadow: `0 8px 36px ${ROSA}55` }}>
            🌸 Reservar cupos
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirmación ──────────────────────────────────────────────────────────────
function ConfirmScreen({ id, paxA, paxN, total, onReset }) {
  return (
    <div style={{ minHeight: "100vh", background: OSCURO, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
      <div style={{ width: 84, height: 84, borderRadius: "50%", background: `linear-gradient(135deg, ${ROSA2}, ${ROSA})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, marginBottom: 24, boxShadow: `0 0 50px ${ROSA}55` }}>🌹</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 38, fontWeight: 900, color: BLANCO, marginBottom: 6 }}>¡Cupos reservados!</div>
      <div style={{ fontSize: 13, color: ROSA, marginBottom: 28, letterSpacing: "0.06em" }}>{id}</div>

      <div style={{ background: CARD, borderRadius: 16, padding: "24px 30px", width: "100%", maxWidth: 420, textAlign: "left", border: `1px solid ${ROSA}33`, marginBottom: 20 }}>
        {[
          ["Evento",   "🌸 Día de la Madre · Cena Especial"],
          ["Fecha",    "Sábado 10 de Mayo 2025 · 6:00 PM"],
          ["Personas", `${paxA} adulto${paxA !== 1 ? "s" : ""}${paxN > 0 ? ` + ${paxN} niño${paxN !== 1 ? "s" : ""}` : ""}`],
          ["Total",    COP(total)],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, fontSize: 14, gap: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{label}</span>
            <span style={{ color: BLANCO, fontWeight: 600, textAlign: "right" }}>{val}</span>
          </div>
        ))}
      </div>

      <div style={{ background: `${ROSA}10`, border: `1px solid ${ROSA}33`, borderRadius: 10, padding: "14px 20px", fontSize: 13, color: "rgba(255,245,248,0.6)", maxWidth: 420, width: "100%", lineHeight: 1.65, marginBottom: 30 }}>
        Se abrió el portal de pago en una nueva pestaña. Tu cupo quedará confirmado una vez se complete el pago exitosamente. 💳
      </div>

      <button onClick={onReset} style={{ padding: "13px 36px", background: "transparent", color: ROSA, border: `1.5px solid ${ROSA}`, borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
        Reservar más cupos
      </button>
      <div style={{ marginTop: 48, fontSize: 12, color: "rgba(255,255,255,0.2)" }}>Atolón Beach Club · Tierra Bomba, Cartagena</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
export default function DiaDeLaMadre() {
  const [paxA,  setPaxA]  = useState(2);
  const [paxN,  setPaxN]  = useState(0);
  const [form,  setForm]  = useState({ nombre: "", contacto: "", email: "", notas: "", ...FE_EMPTY });
  const setFE = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError] = useState("");
  const [waPhone, setWaPhone] = useState(null);
  const [waHovered, setWaHovered] = useState(false);
  const bookRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("configuracion").select("whatsapp").eq("id", "atolon").single()
      .then(({ data }) => { if (data?.whatsapp) setWaPhone(data.whatsapp); });
  }, []);

  const total = paxA * PRECIO_A + paxN * PRECIO_N;

  const scrollToBook = () => bookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handlePagar = async () => {
    if (!form.nombre.trim() || !form.contacto.trim()) {
      setError("Por favor completa tu nombre y teléfono.");
      return;
    }
    if (paxA + paxN === 0) {
      setError("Debes seleccionar al menos 1 persona.");
      return;
    }
    const feFaltan = feValidate(form);
    if (feFaltan.length > 0) {
      setError("Faltan datos de facturación electrónica: " + feFaltan.map(k => k.replace("fe_","")).join(", "));
      return;
    }
    setError("");
    setSaving(true);
    const reservaId = `MADRE-${Date.now()}`;
    if (supabase) {
      const { error: insErr } = await supabase.from("reservas").insert({
        id:       reservaId,
        fecha:    FECHA,
        tipo:     "Cena Día de la Madre",
        canal:    "Día de la Madre 2025",
        nombre:   form.nombre.trim(),
        contacto: form.contacto.trim(),
        email:    form.email.trim() || null,
        pax:      paxA + paxN,
        pax_a:    paxA,
        pax_n:    paxN,
        total,
        abono:    0,
        saldo:    total,
        estado:   "pendiente_pago",
        notas:    form.notas.trim() || null,
        salida_id: null,
        ...fePayload(form),
      });
      if (insErr) { setError("Error al guardar. Intenta de nuevo."); setSaving(false); return; }
    }
    const url = await wompiCheckoutUrl({
      referencia: reservaId,
      totalCOP:   total,
      email:      form.email.trim() || "",
      redirectUrl: window.location.href,
    });
    setSaving(false);
    setConfirmed({ id: reservaId, paxA, paxN, total });
    window.open(url, "_blank");
  };

  const handleReset = () => {
    setPaxA(2); setPaxN(0); setConfirmed(null); setError("");
    setForm({ nombre: "", contacto: "", email: "", notas: "", ...FE_EMPTY });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (confirmed) return <ConfirmScreen {...confirmed} onReset={handleReset} />;

  return (
    <div style={{ minHeight: "100vh", background: OSCURO, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: BLANCO }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.35} }
        input::placeholder, textarea::placeholder { color: rgba(255,245,248,0.28); }
        input:focus, textarea:focus, select:focus { border-color: ${ROSA}88 !important; }
      `}</style>

      {/* Nav */}
      <div style={{ background: `${OSCURO}f0`, backdropFilter: "blur(8px)", borderBottom: `1px solid ${ROSA}22`, padding: "13px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 900, color: BLANCO, letterSpacing: "0.03em" }}>DÍA DE LA MADRE</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em" }}>ATOLON BEACH CLUB · 10 MAYO 2025</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={scrollToBook}
            style={{ background: `linear-gradient(135deg, ${ROSA2}, ${ROSA})`, color: "#fff", border: "none", borderRadius: 20, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            Reservar
          </button>
          <img src="/atolon-logo-white.png" alt="Atolon" style={{ height: 24, opacity: 0.45, objectFit: "contain" }} />
        </div>
      </div>

      <Hero onScrollToBook={scrollToBook} />

      {/* ── BOOKING ── */}
      <div ref={bookRef} style={{ background: OSCURO_MID, borderTop: `3px solid ${ROSA}` }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "52px 20px" }}>

          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "inline-block", background: `${ROSA}18`, border: `1px solid ${ROSA}44`, borderRadius: 40, padding: "6px 20px", marginBottom: 16, fontSize: 12, color: ROSA, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Cupos limitados
            </div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(26px, 5vw, 38px)", fontWeight: 900, color: BLANCO, marginBottom: 8 }}>Reserva tu mesa</div>
            <div style={{ fontSize: 14, color: "rgba(255,245,248,0.45)" }}>Sábado 10 de Mayo · 6:00 PM · Atolon Beach Club</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Pax */}
            <div style={{ background: CARD, borderRadius: 16, padding: "24px 22px", border: `1px solid ${ROSA}22` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: ROSA, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 20 }}>👥 Personas</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: BLANCO, marginBottom: 2 }}>Adultos</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{COP(PRECIO_A)} por persona</div>
                  </div>
                  <Stepper value={paxA} min={0} onChange={setPaxA} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: BLANCO, marginBottom: 2 }}>Niños (0–11)</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{COP(PRECIO_N)} por persona</div>
                  </div>
                  <Stepper value={paxN} min={0} onChange={setPaxN} />
                </div>
                {(paxA + paxN) > 0 && (
                  <div style={{ borderTop: `1px solid ${ROSA}22`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                      {paxA > 0 ? `${paxA} adulto${paxA !== 1 ? "s" : ""}` : ""}{paxA > 0 && paxN > 0 ? " + " : ""}{paxN > 0 ? `${paxN} niño${paxN !== 1 ? "s" : ""}` : ""}
                    </span>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 900, color: ROSA }}>{COP(total)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Datos */}
            <div style={{ background: CARD, borderRadius: 16, padding: "24px 22px", border: `1px solid rgba(255,255,255,0.07)`, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: ROSA, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>📋 Tus datos</div>
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>Nombre completo *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Tu nombre" style={IS} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>WhatsApp / Teléfono *</label>
                <input value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} placeholder="+57 300..." type="tel" style={IS} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email (opcional)</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tu@email.com" type="email" style={IS} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>Notas (opcional)</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Alergias, solicitudes especiales, nombre de la cumpleañera..." rows={3} style={{ ...IS, resize: "vertical" }} />
              </div>
              <div>
                <FacturaElectronicaToggle checked={form.factura_electronica} onChange={v => setFE("factura_electronica", v)} theme="dark" />
                {form.factura_electronica && <FacturaElectronicaForm form={form} set={setFE} editing={true} theme="dark" />}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ background: "#f8717120", border: "1px solid #f87171", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#f87171" }}>
                {error}
              </div>
            )}

            {/* Resumen + pagar */}
            {(paxA + paxN) > 0 && (
              <div style={{ background: `linear-gradient(135deg, ${ROSA2}22, ${ROSA}11)`, border: `2px solid ${ROSA}`, borderRadius: 16, padding: "22px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total a pagar</div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 36, fontWeight: 900, color: ROSA, lineHeight: 1 }}>{COP(total)}</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.8 }}>
                    {paxA > 0 && <div>{paxA} adulto{paxA !== 1 ? "s" : ""} × {COP(PRECIO_A)}</div>}
                    {paxN > 0 && <div>{paxN} niño{paxN !== 1 ? "s" : ""} × {COP(PRECIO_N)}</div>}
                  </div>
                </div>
                <button onClick={handlePagar} disabled={saving}
                  style={{ width: "100%", padding: "17px", background: saving ? "rgba(244,114,182,0.3)" : `linear-gradient(135deg, ${ROSA2}, ${ROSA})`, color: "#fff", border: "none", borderRadius: 12, fontSize: 17, fontWeight: 900, cursor: saving ? "default" : "pointer", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.07em", textTransform: "uppercase", boxShadow: saving ? "none" : `0 6px 30px ${ROSA}44`, transition: "all 0.15s" }}>
                  {saving ? "Procesando..." : `🌹 Pagar ${COP(total)}`}
                </button>
                <div style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                  🔒 Pago seguro con tarjeta de crédito o débito
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: OSCURO, borderTop: `1px solid rgba(255,255,255,0.06)`, padding: "32px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 2 }}>
          <div>🌸 Atolon Beach Club · Tierra Bomba, Cartagena de Indias</div>
          {waPhone && <div>Para información: WhatsApp <a href={`https://wa.me/${waPhone.replace(/\D/g,"")}`} style={{ color: ROSA, textDecoration: "none" }}>{waPhone}</a></div>}
          <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.15)" }}>© 2025 Atolon Beach Club · Todos los derechos reservados</div>
        </div>
      </div>

      {/* Botón flotante WhatsApp */}
      {waPhone && (
        <a href={`https://wa.me/${waPhone.replace(/\D/g,"")}?text=${encodeURIComponent("¡Hola! Quiero información sobre la Cena Día de la Madre en Atolon 🌸")}`}
          target="_blank" rel="noopener noreferrer"
          onMouseEnter={() => setWaHovered(true)}
          onMouseLeave={() => setWaHovered(false)}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 9999,
            display: "flex", alignItems: "center", gap: 10,
            background: "#25D366",
            borderRadius: waHovered ? 30 : 50,
            padding: waHovered ? "12px 20px 12px 14px" : "14px",
            boxShadow: "0 4px 24px rgba(37,211,102,0.5)",
            textDecoration: "none",
            transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
            overflow: "hidden",
            maxWidth: waHovered ? 260 : 52,
            whiteSpace: "nowrap",
          }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="26" height="26" style={{ flexShrink: 0 }}>
            <path fill="#fff" d="M16 2C8.28 2 2 8.28 2 16c0 2.46.66 4.77 1.8 6.77L2 30l7.43-1.76A13.93 13.93 0 0 0 16 30c7.72 0 14-6.28 14-14S23.72 2 16 2Zm0 25.5a11.44 11.44 0 0 1-5.83-1.6l-.42-.25-4.41 1.04 1.07-4.28-.28-.44A11.47 11.47 0 0 1 4.5 16c0-6.34 5.16-11.5 11.5-11.5S27.5 9.66 27.5 16 22.34 27.5 16 27.5Zm6.3-8.57c-.35-.17-2.05-1.01-2.37-1.13-.31-.12-.54-.17-.77.17-.23.35-.88 1.13-1.08 1.36-.2.23-.4.26-.74.09-.35-.17-1.47-.54-2.8-1.72-1.03-.92-1.73-2.06-1.93-2.4-.2-.35-.02-.53.15-.7.15-.15.35-.4.52-.6.17-.2.23-.35.35-.58.12-.23.06-.43-.03-.6-.09-.17-.77-1.85-1.05-2.54-.28-.67-.56-.58-.77-.59h-.66c-.23 0-.6.09-.91.43-.32.35-1.2 1.17-1.2 2.85s1.23 3.3 1.4 3.53c.17.23 2.42 3.7 5.86 5.19.82.35 1.46.56 1.95.72.82.26 1.57.22 2.16.13.66-.1 2.05-.84 2.34-1.65.29-.81.29-1.5.2-1.65-.09-.14-.31-.23-.65-.4Z"/>
          </svg>
          {waHovered && (
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>¿Tienes preguntas?</span>
          )}
        </a>
      )}
    </div>
  );
}
