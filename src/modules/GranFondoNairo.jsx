import { useState } from "react";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl } from "../lib/wompi";

// ── Brand ────────────────────────────────────────────────────────────────────
const AMARILLO  = "#FFD100";
const AMARILLO2 = "#FFC400";
const ROJO      = "#CF3226";
const DARK      = "#060D1A";
const DARK_MID  = "#0A1528";
const DARK_CARD = "#0F1E35";
const DARK_CARD2= "#0C1929";
const BLANCO    = "#F8F6F0";

const COP = (v) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(v);

// ── Fechas del evento ─────────────────────────────────────────────────────────
const FECHAS = [
  { date: "2025-10-09", label: "Jueves 9 Oct",   emoji: "🚴‍♂️", desc: "Refresca las piernas en el mar Caribe. El mejor recovery es el agua." },
  { date: "2025-10-10", label: "Viernes 10 Oct",  emoji: "🌊", desc: "Regenera músculos, descansa la mente. Tu cuerpo lo necesita." },
  { date: "2025-10-11", label: "Sábado 11 Oct",   emoji: "⚡", desc: "Energía máxima antes del gran día. Recarga en el Caribe." },
  { date: "2025-10-12", label: "Domingo 12 Oct",  emoji: "🏆", isSpecial: true, desc: "El cierre perfecto. Un día de playa exclusivo con el mejor ciclista de Colombia." },
];

// ── Planes ────────────────────────────────────────────────────────────────────
const PLANES = [
  {
    id: "transporte",
    nombre: "Solo Transporte",
    emoji: "🚤",
    precioA: 150000,
    precioN: 120000,
    incluye: [
      "Traslado en lancha a Tierra Bomba",
      "Acceso a Atolón Beach Club",
      "Regreso en lancha",
    ],
    noIncluye: ["Almuerzo", "Cama de playa"],
  },
  {
    id: "completo",
    nombre: "Transporte + Almuerzo + Cama",
    emoji: "🏖️",
    precioA: 250000,
    precioN: 200000,
    popular: true,
    incluye: [
      "Traslado en lancha a Tierra Bomba",
      "Acceso a Atolón Beach Club",
      "Almuerzo: Entrada + Plato fuerte + Postre",
      "Cama de playa y zona lounge",
      "Regreso en lancha",
    ],
    noIncluye: [],
  },
];

// ── Shared input style ────────────────────────────────────────────────────────
const IS = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1.5px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
  color: BLANCO, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

// ── Stepper ───────────────────────────────────────────────────────────────────
function Stepper({ value, onChange, min = 0 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${AMARILLO}`, background: "transparent", color: AMARILLO, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        −
      </button>
      <span style={{ fontSize: 22, fontWeight: 700, color: BLANCO, minWidth: 28, textAlign: "center" }}>{value}</span>
      <button onClick={() => onChange(value + 1)}
        style={{ width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${AMARILLO}`, background: "transparent", color: AMARILLO, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        +
      </button>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero({ onScrollToBook }) {
  const PILARES = [
    { icon: "💧", title: "Refresca", desc: "Aguas cristalinas y piscina natural frente al mar. El mejor antiinflamatorio de la naturaleza." },
    { icon: "♻️", title: "Recupérate", desc: "Masajes, camas de playa y silencio caribeño. Tus músculos te lo agradecerán." },
    { icon: "⚡", title: "Energía", desc: "Brunch, cócteles y el sol de Cartagena. Recarga para lo que viene." },
  ];

  return (
    <div>
      {/* Hero principal */}
      <div style={{
        background: `radial-gradient(ellipse at 50% 0%, #1a2a4a 0%, ${DARK} 65%)`,
        padding: "60px 20px 52px", textAlign: "center",
        position: "relative", overflow: "hidden",
        borderBottom: `1px solid rgba(255,209,0,0.15)`,
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 280, opacity: 0.025, pointerEvents: "none", userSelect: "none" }}>
          🚴
        </div>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,209,0,0.12)", border: `1px solid ${AMARILLO}44`, borderRadius: 40, padding: "6px 18px", marginBottom: 24 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: AMARILLO, display: "inline-block", animation: "blink 1.5s ease-in-out infinite" }} />
            <span style={{ fontSize: 12, color: AMARILLO, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Gran Fondo de Nairo · Cartagena 2025</span>
          </div>

          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(38px, 7vw, 72px)", fontWeight: 900, color: BLANCO, lineHeight: 1.0, margin: "0 0 16px", letterSpacing: "-0.01em" }}>
            Después de pedalear,<br />
            <span style={{ color: AMARILLO }}>el Caribe te espera.</span>
          </h1>

          <p style={{ fontSize: "clamp(15px, 2.5vw, 19px)", color: "rgba(248,246,240,0.7)", lineHeight: 1.65, maxWidth: 520, margin: "0 auto 36px" }}>
            Atolón Beach Club abre sus puertas para los ciclistas del Gran Fondo.
            <br />
            <span style={{ color: "rgba(248,246,240,0.45)", fontSize: "0.88em" }}>4 días exclusivos · 9, 10, 11 y 12 de Octubre</span>
          </p>

          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 36 }}>
            {FECHAS.map(f => (
              <div key={f.date} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: f.isSpecial ? `linear-gradient(135deg, ${AMARILLO}, ${AMARILLO2})` : "rgba(255,255,255,0.08)", color: f.isSpecial ? DARK : "rgba(255,255,255,0.7)", border: f.isSpecial ? "none" : "1px solid rgba(255,255,255,0.1)" }}>
                {f.isSpecial ? "🏆 " : ""}{f.label}
              </div>
            ))}
          </div>

          <button onClick={onScrollToBook} style={{ background: `linear-gradient(135deg, ${AMARILLO}, ${AMARILLO2})`, color: DARK, border: "none", borderRadius: 50, padding: "17px 48px", fontSize: 17, fontWeight: 900, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.07em", textTransform: "uppercase", boxShadow: `0 8px 36px ${AMARILLO}44`, transition: "transform 0.15s, box-shadow 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 12px 44px ${AMARILLO}66`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = `0 8px 36px ${AMARILLO}44`; }}>
            🏖️ Reserva tu día de playa
          </button>
        </div>
      </div>

      {/* 3 pilares */}
      <div style={{ background: DARK_MID, padding: "52px 20px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontSize: 12, color: AMARILLO, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Para los guerreros de la montaña</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 800, color: BLANCO, lineHeight: 1.2 }}>Tu recovery nunca fue tan Caribe</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18 }}>
            {PILARES.map(p => (
              <div key={p.title} style={{ background: DARK_CARD, borderRadius: 18, padding: "32px 24px", textAlign: "center", border: `1px solid rgba(255,209,0,0.12)` }}>
                <div style={{ fontSize: 44, marginBottom: 18 }}>{p.icon}</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 800, color: AMARILLO, marginBottom: 10 }}>{p.title}</div>
                <div style={{ fontSize: 14, color: "rgba(248,246,240,0.6)", lineHeight: 1.65 }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Planes / precios */}
      <div style={{ background: DARK, padding: "52px 20px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ fontSize: 12, color: AMARILLO, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Dos opciones, una experiencia única</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(22px, 4vw, 34px)", fontWeight: 800, color: BLANCO }}>Elige tu plan</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
            {PLANES.map(p => (
              <div key={p.id} style={{ background: DARK_CARD2, borderRadius: 18, padding: "28px 24px", border: p.popular ? `2px solid ${AMARILLO}` : `1px solid rgba(255,209,0,0.15)`, position: "relative" }}>
                {p.popular && (
                  <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg, ${AMARILLO}, ${AMARILLO2})`, color: DARK, fontSize: 11, fontWeight: 900, padding: "3px 16px", borderRadius: 20, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
                    ⭐ MÁS COMPLETO
                  </div>
                )}
                <div style={{ fontSize: 36, marginBottom: 14, marginTop: p.popular ? 8 : 0 }}>{p.emoji}</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: BLANCO, marginBottom: 16, lineHeight: 1.2 }}>{p.nombre}</div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: AMARILLO, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(p.precioA)} <span style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "inherit" }}>/ adulto</span></div>
                  <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{COP(p.precioN)} <span style={{ fontSize: 12 }}>/ niño</span></div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {p.incluye.map(item => (
                    <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "rgba(248,246,240,0.8)" }}>
                      <span style={{ color: AMARILLO, flexShrink: 0, marginTop: 1 }}>✓</span>
                      {item}
                    </div>
                  ))}
                  {p.noIncluye.map(item => (
                    <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "rgba(255,255,255,0.25)" }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}>–</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Oct 12 especial */}
      <div style={{ background: `linear-gradient(135deg, #1a0a00 0%, #2a1500 40%, #1a0a00 100%)`, padding: "56px 20px", textAlign: "center", borderTop: `2px solid ${AMARILLO}55`, borderBottom: `2px solid ${AMARILLO}55`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.03, fontSize: 300, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>🏆</div>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "inline-block", background: `linear-gradient(135deg, ${AMARILLO}, ${AMARILLO2})`, color: DARK, padding: "5px 20px", borderRadius: 40, fontSize: 12, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 20 }}>
            ⭐ Evento Especial · 12 de Octubre
          </div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(32px, 6vw, 58px)", fontWeight: 900, color: BLANCO, lineHeight: 1.0, marginBottom: 16 }}>
            Día de Playa<br /><span style={{ color: AMARILLO }}>con Nairo Quintana</span>
          </div>
          <p style={{ fontSize: 16, color: "rgba(248,246,240,0.65)", lineHeight: 1.7, marginBottom: 28 }}>
            El cierre perfecto del Gran Fondo. Comparte la isla, el sol y el mar Caribe con el ciclista más querido de Colombia.
            <br /><span style={{ color: "rgba(248,246,240,0.4)", fontSize: 14 }}>Cupos muy limitados — experiencia única e irrepetible.</span>
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {["🚴 Nairo en la isla", "🏝️ Atolón Beach Club", "🎉 Fiesta de cierre"].map(tag => (
              <div key={tag} style={{ background: "rgba(255,209,0,0.12)", border: `1px solid ${AMARILLO}33`, borderRadius: 20, padding: "6px 16px", fontSize: 13, color: AMARILLO, fontWeight: 600 }}>{tag}</div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: `linear-gradient(135deg, ${DARK_MID}, #0c1a0a)`, padding: "52px 20px", textAlign: "center", borderTop: `1px solid rgba(255,209,0,0.2)` }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: AMARILLO, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>¿Listo para el mejor recovery?</div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(26px, 5vw, 44px)", fontWeight: 900, color: BLANCO, lineHeight: 1.1, marginBottom: 14 }}>Escoge tu día y asegura tu cupo.</div>
          <div style={{ fontSize: 15, color: "rgba(248,246,240,0.5)", marginBottom: 32 }}>Cupos limitados para los mejores días del Gran Fondo. 🚴‍♂️🏖️</div>
          <button onClick={onScrollToBook} style={{ background: `linear-gradient(135deg, ${AMARILLO}, ${AMARILLO2})`, color: DARK, border: "none", borderRadius: 50, padding: "18px 56px", fontSize: 18, fontWeight: 900, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", boxShadow: `0 8px 36px ${AMARILLO}44` }}>
            👉 Reservar ahora
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirmation ──────────────────────────────────────────────────────────────
function ConfirmScreen({ id, fecha, plan, paxA, paxN, total, onReset }) {
  const fechaObj = FECHAS.find(f => f.date === fecha);
  const paxTotal = paxA + paxN;
  return (
    <div style={{ minHeight: "100vh", background: DARK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg, ${AMARILLO}, ${AMARILLO2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, marginBottom: 24, boxShadow: `0 0 44px ${AMARILLO}44` }}>✓</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 36, fontWeight: 900, color: BLANCO, marginBottom: 6 }}>¡Cupo Reservado!</div>
      <div style={{ fontSize: 13, color: AMARILLO, marginBottom: 28, letterSpacing: "0.06em" }}>{id}</div>

      <div style={{ background: DARK_CARD, borderRadius: 16, padding: "24px 28px", width: "100%", maxWidth: 400, textAlign: "left", border: `1px solid ${AMARILLO}33`, marginBottom: 20 }}>
        {[
          ["Evento", "Gran Fondo de Nairo"],
          ["Día",    fechaObj ? `${fechaObj.emoji} ${fechaObj.label}${fechaObj.isSpecial ? " — ¡Con Nairo!" : ""}` : fecha],
          ["Plan",   plan ? `${plan.emoji} ${plan.nombre}` : "—"],
          ["Personas", `${paxA} adulto${paxA !== 1 ? "s" : ""}${paxN > 0 ? ` + ${paxN} niño${paxN !== 1 ? "s" : ""}` : ""} (${paxTotal})`],
          ["Total",  COP(total)],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, fontSize: 14, gap: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{label}</span>
            <span style={{ color: BLANCO, fontWeight: 600, textAlign: "right" }}>{val}</span>
          </div>
        ))}
      </div>

      <div style={{ background: `rgba(255,209,0,0.08)`, border: `1px solid ${AMARILLO}33`, borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "rgba(248,246,240,0.65)", maxWidth: 400, width: "100%", lineHeight: 1.65, marginBottom: 28 }}>
        Se abrió el portal de pago en una nueva pestaña. Tu cupo quedará confirmado una vez se complete el pago exitosamente. 💳
      </div>

      <button onClick={onReset} style={{ padding: "13px 36px", background: "transparent", color: AMARILLO, border: `1.5px solid ${AMARILLO}`, borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Barlow Condensed', sans-serif" }}>
        Reservar otro cupo
      </button>
      <div style={{ marginTop: 48, fontSize: 12, color: "rgba(255,255,255,0.2)", letterSpacing: "0.05em" }}>Atolón Beach Club · Tierra Bomba, Cartagena</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function GranFondoNairo() {
  const [step, setStep]                   = useState(1); // 1=fecha, 2=plan, 3=datos
  const [selectedFecha, setSelectedFecha] = useState(null);
  const [selectedPlan, setSelectedPlan]   = useState(null);
  const [paxA, setPaxA]                   = useState(2);
  const [paxN, setPaxN]                   = useState(0);
  const [form, setForm]  = useState({ nombre: "", contacto: "", email: "", notas: "" });
  const [saving, setSaving]   = useState(false);   // false | "nacional" | "internacional"
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError]     = useState("");

  const plan     = PLANES.find(p => p.id === selectedPlan);
  const totalCOP = plan ? (paxA * plan.precioA) + (paxN * plan.precioN) : 0;

  const scrollToBook = () => document.getElementById("booking-section")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleSelectFecha = (date) => {
    setSelectedFecha(date);
    setSelectedPlan(null);
    setStep(2);
    setTimeout(() => document.getElementById("step2-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const handleSelectPlan = (planId) => {
    setSelectedPlan(planId);
    setStep(3);
    setTimeout(() => document.getElementById("step3-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const handlePagar = async (tipo) => {
    if (!form.nombre.trim() || !form.contacto.trim()) { setError("Por favor completa tu nombre y teléfono."); return; }
    setError("");
    setSaving(tipo);
    const reservaId = `NAIRO-${Date.now()}`;
    if (supabase) {
      const { error: insErr } = await supabase.from("reservas").insert({
        id: reservaId,
        fecha: selectedFecha,
        tipo: plan?.nombre || "Pasadía",
        canal: "Gran Fondo Nairo",
        nombre: form.nombre.trim(),
        contacto: form.contacto.trim(),
        email: form.email.trim() || null,
        pax: paxA + paxN,
        pax_a: paxA,
        pax_n: paxN,
        total: totalCOP,
        abono: 0,
        saldo: totalCOP,
        estado: "pendiente_pago",
        notas: (form.notas ? form.notas + " | " : "") + `Pago: Tarjeta ${tipo}`,
        salida_id: null,
      });
      if (insErr) { setError("Error al guardar. Intenta de nuevo."); setSaving(false); return; }
    }

    let url = "";
    if (tipo === "Internacional") {
      // Rutea por el helper (Zoho Pay / Stripe según merchant activo)
      try {
        const { crearSesionPago } = await import("../lib/internacional");
        const tasa = 4200;
        const amountUSD = Math.ceil(totalCOP / tasa);
        const session = await crearSesionPago({
          amount: amountUSD,
          currency: "USD",
          reference: reservaId,
          description: `Gran Fondo Nairo — ${plan?.nombre || ""} · ${selectedFecha}`,
          nombre: form.nombre.trim(),
          email: form.email.trim() || "",
          fecha: selectedFecha,
          context: "reserva",
          context_id: reservaId,
        });
        url = session.url;
      } catch (e) {
        setError("No se pudo iniciar el pago internacional. Intenta con tarjeta nacional.");
        setSaving(false);
        return;
      }
    } else {
      // Nacional → Wompi
      url = await wompiCheckoutUrl({
        referencia: reservaId,
        totalCOP,
        email: form.email.trim() || "",
        redirectUrl: window.location.href,
      });
    }

    setSaving(false);
    setConfirmed({ id: reservaId, fecha: selectedFecha, plan, paxA, paxN, total: totalCOP });
    window.open(url, "_blank");
  };

  const handleReset = () => {
    setStep(1); setSelectedFecha(null); setSelectedPlan(null); setConfirmed(null); setError("");
    setPaxA(2); setPaxN(0); setForm({ nombre: "", contacto: "", email: "", notas: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (confirmed) return <ConfirmScreen {...confirmed} onReset={handleReset} />;

  const fechaObj = FECHAS.find(f => f.date === selectedFecha);

  return (
    <div style={{ minHeight: "100vh", background: DARK, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: BLANCO }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Top bar */}
      <div style={{ background: DARK, borderBottom: `1px solid rgba(255,209,0,0.2)`, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 4, height: 28, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ flex: 2, background: AMARILLO }} />
            <div style={{ flex: 1, background: ROJO }} />
            <div style={{ flex: 1, background: "#003580" }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 900, color: BLANCO, letterSpacing: "0.02em", lineHeight: 1.1 }}>GRAN FONDO DE NAIRO</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>CARTAGENA · OCTUBRE 2025</div>
          </div>
        </div>
        <img src="/atolon-logo-white.png" alt="Atolon Beach Club" style={{ height: 26, objectFit: "contain", opacity: 0.55 }} />
      </div>

      <Hero onScrollToBook={scrollToBook} />

      {/* ── BOOKING ── */}
      <div id="booking-section" style={{ background: DARK_MID, borderTop: `3px solid ${AMARILLO}` }}>

        {/* Paso 1: Día */}
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "44px 20px" }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 900, color: BLANCO, marginBottom: 6 }}>1 · Elige tu día</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>4 días disponibles · Cupos limitados</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
            {FECHAS.map(f => {
              const sel = selectedFecha === f.date;
              return (
                <div key={f.date} onClick={() => handleSelectFecha(f.date)} style={{ background: sel ? (f.isSpecial ? `linear-gradient(135deg, rgba(255,209,0,0.25), rgba(255,196,0,0.15))` : `rgba(255,209,0,0.15)`) : DARK_CARD, borderRadius: 16, padding: "22px 18px", cursor: "pointer", border: sel ? `2px solid ${AMARILLO}` : f.isSpecial ? `2px solid ${AMARILLO}55` : `2px solid rgba(255,255,255,0.07)`, boxShadow: sel ? `0 0 24px ${AMARILLO}33` : "none", transition: "all 0.2s", textAlign: "center", position: "relative" }}>
                  {f.isSpecial && (
                    <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg, ${AMARILLO}, ${AMARILLO2})`, color: DARK, fontSize: 10, fontWeight: 900, padding: "3px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>⭐ CON NAIRO</div>
                  )}
                  <div style={{ fontSize: 40, marginBottom: 12, marginTop: f.isSpecial ? 8 : 0 }}>{f.emoji}</div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 800, color: sel ? AMARILLO : BLANCO, marginBottom: 6 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, marginBottom: 14 }}>{f.desc}</div>
                  <div style={{ width: "100%", padding: "9px", background: sel ? AMARILLO : "transparent", color: sel ? DARK : AMARILLO, border: `1.5px solid ${AMARILLO}`, borderRadius: 8, fontWeight: 700, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {sel ? "✓ Seleccionado" : "Seleccionar"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Paso 2: Plan */}
        {step >= 2 && selectedFecha && (
          <div id="step2-section" style={{ background: DARK_CARD, borderTop: `1px solid rgba(255,209,0,0.15)`, padding: "44px 20px" }}>
            <div style={{ maxWidth: 780, margin: "0 auto" }}>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 900, color: BLANCO, marginBottom: 6 }}>2 · Elige tu plan</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
                  {fechaObj && `${fechaObj.emoji} ${fechaObj.label}${fechaObj.isSpecial ? " — Día con Nairo 🏆" : ""}`}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
                {PLANES.map(p => {
                  const sel = selectedPlan === p.id;
                  return (
                    <div key={p.id} onClick={() => handleSelectPlan(p.id)} style={{ background: sel ? `rgba(255,209,0,0.1)` : DARK_MID, borderRadius: 18, padding: "28px 24px", cursor: "pointer", border: sel ? `2px solid ${AMARILLO}` : p.popular ? `2px solid ${AMARILLO}44` : `2px solid rgba(255,255,255,0.07)`, boxShadow: sel ? `0 0 24px ${AMARILLO}33` : "none", transition: "all 0.2s", position: "relative" }}>
                      {p.popular && !sel && (
                        <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: `rgba(255,209,0,0.15)`, border: `1px solid ${AMARILLO}55`, color: AMARILLO, fontSize: 10, fontWeight: 900, padding: "3px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>⭐ MÁS COMPLETO</div>
                      )}
                      {sel && (
                        <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: AMARILLO, color: DARK, fontSize: 10, fontWeight: 900, padding: "3px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>✓ SELECCIONADO</div>
                      )}
                      <div style={{ fontSize: 36, marginBottom: 12, marginTop: (p.popular || sel) ? 8 : 0 }}>{p.emoji}</div>
                      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 21, fontWeight: 800, color: sel ? AMARILLO : BLANCO, marginBottom: 14, lineHeight: 1.2 }}>{p.nombre}</div>

                      {/* Precios */}
                      <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "12px 14px", marginBottom: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Adulto</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: AMARILLO, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(p.precioA)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Niño (0–11)</span>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,209,0,0.7)", fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(p.precioN)}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 20 }}>
                        {p.incluye.map(item => (
                          <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: "rgba(248,246,240,0.8)" }}>
                            <span style={{ color: AMARILLO, flexShrink: 0 }}>✓</span>{item}
                          </div>
                        ))}
                        {p.noIncluye.map(item => (
                          <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: "rgba(255,255,255,0.25)" }}>
                            <span style={{ flexShrink: 0 }}>–</span>{item}
                          </div>
                        ))}
                      </div>

                      <div style={{ width: "100%", padding: "11px", background: sel ? AMARILLO : "transparent", color: sel ? DARK : AMARILLO, border: `1.5px solid ${AMARILLO}`, borderRadius: 8, fontWeight: 700, fontSize: 14, textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
                        {sel ? "✓ Seleccionado" : "Elegir este plan"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Paso 3: Personas y datos */}
        {step >= 3 && selectedFecha && selectedPlan && (
          <div id="step3-section" style={{ background: DARK_CARD2, borderTop: `1px solid rgba(255,209,0,0.15)`, padding: "44px 20px" }}>
            <div style={{ maxWidth: 540, margin: "0 auto" }}>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 900, color: BLANCO, marginBottom: 6 }}>3 · Personas y datos</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 28 }}>
                {fechaObj && `${fechaObj.emoji} ${fechaObj.label}`} · {plan?.emoji} {plan?.nombre}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                {/* Pax */}
                <div style={{ background: DARK_MID, borderRadius: 14, padding: "22px 20px", border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                        Adultos · {COP(plan?.precioA || 0)}/pax
                      </div>
                      <Stepper value={paxA} min={1} onChange={setPaxA} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                        Niños (0–11) · {COP(plan?.precioN || 0)}/pax
                      </div>
                      <Stepper value={paxN} min={0} onChange={setPaxN} />
                    </div>
                  </div>
                  <div style={{ borderTop: `1px solid rgba(255,209,0,0.15)`, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
                      {paxA} adulto{paxA !== 1 ? "s" : ""}{paxN > 0 ? ` + ${paxN} niño${paxN !== 1 ? "s" : ""}` : ""}
                    </span>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 800, color: AMARILLO }}>{COP(totalCOP)}</span>
                  </div>
                </div>

                {/* Formulario */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>Nombre completo *</label>
                    <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Tu nombre" style={IS} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>WhatsApp / Teléfono *</label>
                    <input value={form.contacto} onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} placeholder="+57 300..." type="tel" style={IS} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>Email (opcional)</label>
                    <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tu@email.com" type="email" style={IS} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.08em" }}>Notas (opcional)</label>
                    <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Alergias, necesidades especiales, etc." rows={3} style={{ ...IS, resize: "vertical" }} />
                  </div>
                </div>

                {error && (
                  <div style={{ background: "#CF322222", border: "1px solid #CF322244", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#FF8080" }}>{error}</div>
                )}

                {/* Resumen */}
                <div style={{ background: `rgba(255,209,0,0.08)`, border: `1px solid ${AMARILLO}33`, borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 12, color: AMARILLO, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 10 }}>Resumen</div>
                  {[
                    ["Día",      fechaObj ? `${fechaObj.emoji} ${fechaObj.label}${fechaObj.isSpecial ? " 🏆" : ""}` : selectedFecha],
                    ["Plan",     plan ? `${plan.emoji} ${plan.nombre}` : "—"],
                    ["Personas", `${paxA} adulto${paxA !== 1 ? "s" : ""}${paxN > 0 ? ` + ${paxN} niño${paxN !== 1 ? "s" : ""}` : ""}`],
                    ["Total",    COP(totalCOP)],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                      <span style={{ color: "rgba(255,255,255,0.45)" }}>{l}</span>
                      <span style={{ color: BLANCO, fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Botones de pago */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", marginBottom: 2 }}>
                    Selecciona tu método de pago
                  </div>
                  <button
                    onClick={() => handlePagar("Nacional")}
                    disabled={!!saving}
                    style={{ width: "100%", padding: "16px", background: saving === "Nacional" ? "rgba(255,209,0,0.3)" : `linear-gradient(135deg, ${AMARILLO}, ${AMARILLO2})`, color: DARK, border: "none", borderRadius: 12, fontSize: 16, fontWeight: 900, cursor: saving ? "wait" : "pointer", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.05em", textTransform: "uppercase", boxShadow: saving ? "none" : `0 6px 28px ${AMARILLO}44`, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    {saving === "Nacional" ? "Procesando..." : <><span style={{ fontSize: 20 }}>💳</span> Tarjeta Nacional · {COP(totalCOP)}</>}
                  </button>
                  <button
                    onClick={() => handlePagar("Internacional")}
                    disabled={!!saving}
                    style={{ width: "100%", padding: "16px", background: saving === "Internacional" ? "rgba(255,255,255,0.1)" : "transparent", color: BLANCO, border: `2px solid rgba(255,255,255,0.25)`, borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: saving ? "wait" : "pointer", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.05em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    {saving === "Internacional" ? "Procesando..." : <><span style={{ fontSize: 20 }}>🌐</span> Tarjeta Internacional · {COP(totalCOP)}</>}
                  </button>
                </div>

                <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.2)", lineHeight: 1.6 }}>
                  Pago seguro procesado por Wompi · Se abrirá el portal de pago en una nueva pestaña.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, padding: "28px 20px", textAlign: "center" }}>
          <img src="/atolon-logo-white.png" alt="Atolon" style={{ height: 20, opacity: 0.3, marginBottom: 8 }} />
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", letterSpacing: "0.06em" }}>ATOLÓN BEACH CLUB · TIERRA BOMBA · CARTAGENA DE INDIAS</div>
        </div>
      </div>
    </div>
  );
}
