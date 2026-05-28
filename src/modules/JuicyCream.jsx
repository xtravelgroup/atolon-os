// Landing + booking engine para evento JUICY & CREAM (afterparty oficial
// J Balvin · Cartagena · Domingo 07-jun-2026). Vende:
//  • Boletería (VIP, ETAPA 1-3, DOOR) con precio dinámico early/anytime
//  • Mesas / camas (DJ BOOTH, BACKSTAGE, FRONT POOL, VIP BEACH) con consumible 15%/25%
// Las reservas se guardan en juicy_cream_reservas y el flujo de pago
// es vía WhatsApp al equipo comercial (MVP). Las mesas son únicas — al
// reservarse una, se bloquea automáticamente por unique index DB.
//
// Estilo visual replica el flyer oficial: fondo cream, "JUICY" rojo cherry
// liquid, "CREAM" chrome/silver, doodles de fauna marina en outline rojo,
// firma cursiva para AriaJega.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl } from "../lib/wompi";
import { crearSesionPago } from "../lib/internacional";

const COP = n => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;

// ── Paleta inspirada en el flyer ──────────────────────────────────────
const C = {
  bg:        "#FAFAF8",       // off-white casi cream
  bgAlt:     "#FFFFFF",
  cream:     "#F4EBD8",       // cream del flyer (acentos)
  text:      "#0A0A0A",
  textMid:   "#404040",
  textLow:   "#888888",
  border:    "#E5E5E5",
  borderMid: "#CCCCCC",
  red:       "#E11D2A",       // cherry red del flyer
  redDark:   "#9B1018",
  silver1:   "#FFFFFF",
  silver2:   "#D8D8D8",
  silver3:   "#888888",
};

const WA_PHONE = "573104077720";

// ── Datos del evento ──────────────────────────────────────────────────
const EVENTO = {
  fecha: "Domingo · Junio 07",
  fechaCorta: "JUNE 07",
  doors: "2:00 PM",
  venue: "Atolón Beach Club · Isla Tierra Bomba · Cartagena",
  tagline: "ELECTRONIC WORLD · URBAN VIBES",
  lineup: {
    headliner: "AriaVega",
    electronic: ["2 NOMADS", "GUSTAVO IBARRA"],
    urban: ["DJ POPE", "DJ TORNALL"],
    extra: "ARGÜELLO precisamente en Cartagena",
  },
  by: "3 NOMADS X · 574 STUDIO",
  oficial: "OFFICIAL AFTERPARTY J BALVIN COLOMBIAN TOUR FINALE",
};

// ── Tickets: precios cambian según hora actual y categoría ────────────
// `visible: false` oculta la categoría del booking (sigue en el código por si
// la queremos reactivar más adelante). Por ahora solo VIP y Backstage.
//
// `incluye` es el detalle que se muestra dentro del card de ese ticket
// (transporte, horarios, recargos, impuesto muelle, etc.).
const INCLUYE_TRANSPORTE = [
  { icon: "🚤", titulo: "Transporte incluido", detalle: "Lancha rápida ida y vuelta desde el Muelle de La Bodeguita." },
  { icon: "⏱", titulo: "Duración del trayecto", detalle: "Aproximadamente 15 minutos por trayecto." },
  { icon: "🕐", titulo: "Horarios de salida (ida)", detalle: "Desde las 1:30 PM · Salidas cada 30 minutos." },
  { icon: "🌙", titulo: "Horarios de regreso", detalle: "Desde las 9:00 PM hasta las 2:00 AM · Regresos cada 30 minutos." },
  { icon: "⚠", titulo: "Impuesto de muelle NO incluido", detalle: "Se paga directamente en la taquilla de La Bodeguita.", warning: true },
];

const INCLUYE_EARLY = [
  { icon: "🎟", titulo: "Acceso válido hasta las 4:00 PM", detalle: "Debes ingresar antes de las 4:00 PM. Después de esa hora deberás pagar el ticket Anytime." },
  ...INCLUYE_TRANSPORTE,
];
const INCLUYE_ANYTIME = [
  { icon: "🎟", titulo: "Acceso a cualquier hora", detalle: "Sin restricción de horario de ingreso durante el evento." },
  ...INCLUYE_TRANSPORTE,
];

const TICKETS = [
  // VIP — Hasta 4 PM (cheaper, restricted entry time)
  {
    key: "VIP_EARLY", label: "VIP · Hasta 4 PM",
    sub: "Acceso preferente · Ingreso antes de las 4:00 PM",
    cupo: 100, early: { hasta: 99, precio: 150000 }, anytime: 150000, // flat
    visible: true,
    incluye: INCLUYE_EARLY,
  },
  // VIP — Anytime (full price, no entry restriction)
  {
    key: "VIP_ANYTIME", label: "VIP · Anytime",
    sub: "Acceso preferente · Ingreso a cualquier hora",
    cupo: 100, early: { hasta: 99, precio: 175000 }, anytime: 175000, // flat
    visible: true,
    incluye: INCLUYE_ANYTIME,
    badge: "Sin restricción",
  },
  // Backstage
  {
    key: "BACKSTAGE", label: "Backstage", sub: "Mismo acceso de VIP · Área Backstage",
    cupo: 60, early: { hasta: 99, precio: 450000 }, anytime: 450000,
    visible: true,
    incluye: INCLUYE_ANYTIME, // backstage también es anytime
    badge: "Área exclusiva",
  },
  { key: "ETAPA_1", label: "Etapa 1", sub: "Primera etapa",            cupo: 100, early: { hasta: 16, precio: 193000 }, anytime: 248000, visible: false },
  { key: "ETAPA_2", label: "Etapa 2", sub: "Segunda etapa",            cupo: 100, early: { hasta: 18, precio: 248000 }, anytime: 303000, visible: false },
  { key: "ETAPA_3", label: "Etapa 3", sub: "Tercera etapa",            cupo: 100, early: { hasta: 18, precio: 303000 }, anytime: 358000, visible: false },
  { key: "DOOR",    label: "Door",    sub: "Última disponibilidad",    cupo: 300, early: { hasta: 18, precio: 385000 }, anytime: 440000, visible: false },
];
const TICKETS_VISIBLES = TICKETS.filter(t => t.visible !== false);

// ── Mesas ─────────────────────────────────────────────────────────────
// Capacidad por zona:
//   DJ Booth & Backstage → 12 pax (mesas premium)
//   Front Pool & VIP Beach → 10 pax (mesas VIP estándar)
const MESAS = [
  { key: "A1", zona: "DJ BOOTH",   precio: 20350000, consumible: 0.25, transporte: true, premium: true, pax: 12 },
  { key: "A2", zona: "DJ BOOTH",   precio: 20350000, consumible: 0.25, transporte: true, premium: true, pax: 12 },
  { key: "1A", zona: "BACKSTAGE",  precio: 14300000, consumible: 0.25, transporte: true, premium: true, pax: 12 },
  { key: "1B", zona: "BACKSTAGE",  precio: 14300000, consumible: 0.25, transporte: true, premium: true, pax: 12 },
  { key: "2A", zona: "FRONT POOL", precio: 12100000, consumible: 0.15, pax: 10 },
  { key: "2B", zona: "FRONT POOL", precio: 12100000, consumible: 0.15, pax: 10 },
  { key: "3A", zona: "FRONT POOL", precio: 9900000,  consumible: 0.15, pax: 10 },
  { key: "3B", zona: "FRONT POOL", precio: 9900000,  consumible: 0.15, pax: 10 },
  { key: "4A", zona: "FRONT POOL", precio: 8250000,  consumible: 0.15, pax: 10 },
  { key: "4B", zona: "FRONT POOL", precio: 8250000,  consumible: 0.15, pax: 10 },
  { key: "1C", zona: "VIP BEACH",  precio: 6600000,  consumible: 0.15, pax: 10 },
  { key: "5C", zona: "VIP BEACH",  precio: 6600000,  consumible: 0.15, pax: 10 },
  { key: "2C", zona: "VIP BEACH",  precio: 5500000,  consumible: 0.15, pax: 10 },
  { key: "6C", zona: "VIP BEACH",  precio: 5500000,  consumible: 0.15, pax: 10 },
  { key: "3C", zona: "VIP BEACH",  precio: 4400000,  consumible: 0.15, pax: 10 },
  { key: "7C", zona: "VIP BEACH",  precio: 4400000,  consumible: 0.15, pax: 10 },
  { key: "4C", zona: "VIP BEACH",  precio: 3850000,  consumible: 0.15, pax: 10 },
  { key: "8C", zona: "VIP BEACH",  precio: 3850000,  consumible: 0.15, pax: 10 },
];

// Descripción / beneficios por zona — se muestra dentro de cada bloque de
// mesas en MesasSection. Cada zona tiene su lista de "incluye".
const BENEFICIOS_PREMIUM = [
  "25% consumible incluido",
  "Transporte privado en lancha ida & regreso para el grupo completo",
  "Concierge VIP",
  "Ingreso preferente",
  "Baños exclusivos",
  "Experiencias de marca únicas",
];
const ZONA_DESCRIPCION = {
  "DJ BOOTH":  BENEFICIOS_PREMIUM,
  "BACKSTAGE": BENEFICIOS_PREMIUM,
  // Placeholder — el usuario va a enviar:
  // "FRONT POOL": [...],
  // "VIP BEACH":  [...],
};

const horaCO = () => {
  const t = new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
};

const precioTicket = (t) => {
  const h = horaCO();
  return h < t.early.hasta ? t.early.precio : t.anytime;
};

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
export default function JuicyCream() {
  const [tab, setTab] = useState(null);             // null = pantalla inicial · "tickets" | "mesas"
  const [reservadas, setReservadas] = useState(new Set());
  const [ticketsVendidos, setTicketsVendidos] = useState({});
  const [cart, setCart] = useState(null);
  const [reload, setReload] = useState(0);
  const contentRef = useRef(null);

  // Cuando el usuario elige Boletería o Mesas, scrollea hasta la sección de
  // contenido (donde están las cards) en vez de obligarlo a deslizar.
  // Pequeño delay para que React renderice la sección antes del scroll.
  const handleTab = (next) => {
    setTab(next);
    if (next) {
      setTimeout(() => {
        contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  };

  useEffect(() => {
    if (!supabase) return;
    supabase.from("juicy_cream_reservas")
      .select("tipo, categoria, cantidad, estado")
      .neq("estado", "cancelado")
      .then(({ data }) => {
        const mesas = new Set();
        const tickets = {};
        (data || []).forEach(r => {
          if (r.tipo === "mesa") mesas.add(r.categoria);
          else if (r.tipo === "ticket") tickets[r.categoria] = (tickets[r.categoria] || 0) + (r.cantidad || 1);
        });
        setReservadas(mesas);
        setTicketsVendidos(tickets);
      });
  }, [reload]);

  const abrirTicket = (t) => setCart({
    kind: "ticket", categoria: t.key, label: t.label, cantidad: 1,
    precio: precioTicket(t),
  });
  const abrirMesa = (m) => {
    if (reservadas.has(m.key)) return;
    setCart({
      kind: "mesa", categoria: m.key, label: `${m.zona} · ${m.key}`, cantidad: 1,
      precio: m.precio, consumible: m.consumible, transporte: !!m.transporte,
      pax: m.pax || null,
    });
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      color: C.text,
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Google Fonts: condensed + script */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Allura&family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes drip {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(3px); }
        }
        .jc-juicy {
          background: linear-gradient(180deg, #E11D2A 0%, #9B1018 60%, #5C0A0F 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 4px 0 #5C0A0F) drop-shadow(0 6px 16px rgba(225,29,42,0.3));
        }
        .jc-cream {
          background: linear-gradient(180deg, #FFFFFF 0%, #D8D8D8 35%, #FFFFFF 50%, #888888 75%, #BBBBBB 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 3px 0 #555555) drop-shadow(0 5px 12px rgba(0,0,0,0.15));
        }
        .jc-amp {
          background: linear-gradient(180deg, #FFFFFF 0%, #C8C8C8 50%, #888888 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 2px 0 #666);
        }
      `}</style>

      <Hero tab={tab} onTab={handleTab} />
      <Selector tab={tab} onTab={handleTab} sticky />

      {tab && (
        <div ref={contentRef} style={{
          maxWidth: 1100, margin: "0 auto", padding: "32px 16px 80px",
          scrollMarginTop: 80, // compensa el alto del selector sticky
        }}>
          {tab === "tickets"
            ? <TicketsSection vendidos={ticketsVendidos} onSelect={abrirTicket} />
            : <MesasSection reservadas={reservadas} onSelect={abrirMesa} />
          }
          {/* Transporte general solo en mesas — los tickets ya muestran el
              detalle de horarios dentro de cada card. */}
          {tab === "mesas" && <Transporte />}
        </div>
      )}

      <Footer />

      {cart && (
        <CheckoutModal
          item={cart}
          onClose={() => setCart(null)}
          onConfirmar={() => { setReload(x => x + 1); setCart(null); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// HERO — replica el flyer
// ──────────────────────────────────────────────────────────────────────
function Hero({ tab, onTab }) {
  return (
    <div style={{ position: "relative", textAlign: "center", padding: "40px 16px 24px", maxWidth: 920, margin: "0 auto" }}>
      {/* JBalvin tag */}
      <div style={{ fontSize: 11, letterSpacing: "0.32em", color: C.text, fontWeight: 600, marginBottom: 4 }}>
        OFFICIAL AFTERPARTY
      </div>
      <div style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 38, letterSpacing: "0.32em", marginBottom: 2 }}>
        J BALVIN
      </div>
      <div style={{ fontSize: 11, letterSpacing: "0.28em", color: C.text, fontWeight: 500 }}>
        COLOMBIAN TOUR FINALE
      </div>
      <div style={{ width: 56, height: 2, background: C.red, margin: "10px auto 18px" }} />

      {/* JUICY & CREAM principal */}
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* Splash decoración detrás */}
        <SplashDeco />

        <h1 style={{
          fontFamily: "'Anton', Impact, sans-serif",
          fontSize: "clamp(72px, 14vw, 160px)",
          fontWeight: 900,
          lineHeight: 0.88,
          margin: 0,
          letterSpacing: "0.02em",
          position: "relative",
          zIndex: 2,
        }}>
          <span className="jc-juicy">JUICY</span>
          <br />
          <span className="jc-amp" style={{ fontSize: "0.6em" }}>&amp;</span>
          {" "}
          <span className="jc-cream">CREAM</span>
        </h1>
      </div>

      {/* Doodles laterales */}
      <DoodlesRow />

      <div style={{
        fontSize: 13, letterSpacing: "0.18em", color: C.text, fontWeight: 700,
        marginTop: 8, marginBottom: 22,
      }}>
        ELECTRONIC WORLD. <span style={{ color: C.red }}>URBAN VIBES.</span>
      </div>

      {/* Selector inline — arriba de AriaVega, dentro del hero.
          La versión sticky sigue apareciendo después del hero (Selector con
          prop sticky) para que el usuario siempre tenga acceso al toggle. */}
      <div style={{ maxWidth: 760, margin: "0 auto 32px" }}>
        <Selector tab={tab} onTab={onTab} compact />
      </div>

      {/* AriaVega cursive signature */}
      <div style={{ marginBottom: 18, position: "relative" }}>
        {/* Estrella roja arriba */}
        <div style={{ position: "absolute", left: "50%", top: -8, transform: "translateX(-50%)", color: C.red, fontSize: 22 }}>✦</div>
        <div style={{
          fontFamily: "'Allura', 'Brush Script MT', cursive",
          fontSize: "clamp(56px, 10vw, 96px)",
          color: C.red,
          lineHeight: 1,
          transform: "rotate(-3deg)",
          display: "inline-block",
        }}>
          {EVENTO.lineup.headliner}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: C.text, fontWeight: 500 }}>
          <span style={{ color: C.border }}>──</span> + very special guests <span style={{ color: C.border }}>──</span>
        </div>
      </div>

      {/* Líneup en 2 columnas */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr",
        gap: 20, maxWidth: 520, margin: "0 auto", alignItems: "center",
        paddingTop: 14, borderTop: `1px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMid, letterSpacing: "0.22em", fontWeight: 600, marginBottom: 6 }}>ELECTRONIC WORLD</div>
          {EVENTO.lineup.electronic.map(a => (
            <div key={a} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: "0.04em", lineHeight: 1.1 }}>{a}</div>
          ))}
        </div>
        <div style={{ color: C.text, fontSize: 22, fontWeight: 200, opacity: 0.4 }}>X</div>
        <div>
          <div style={{ fontSize: 10, color: C.red, letterSpacing: "0.22em", fontWeight: 600, marginBottom: 6 }}>URBAN WORLD</div>
          {EVENTO.lineup.urban.map(a => (
            <div key={a} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: "0.04em", lineHeight: 1.1, color: C.red }}>{a}</div>
          ))}
        </div>
      </div>

      {/* Argüello */}
      <div style={{ marginTop: 22, fontSize: 13, color: C.text }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.05em" }}>ARGÜ<span style={{ color: C.red }}>ELLO</span></span>
        <div style={{ fontSize: 11, color: C.textMid, fontStyle: "italic", marginTop: 2 }}>precisamente en</div>
        <div style={{
          fontFamily: "'Anton', sans-serif", fontSize: "clamp(40px, 7vw, 64px)",
          letterSpacing: "0.06em", marginTop: 2,
        }}>
          <span className="jc-cream">CARTAGENA</span>
        </div>
        <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.1em", marginTop: 2 }}>
          ISLA TIERRA BOMBA · COLOMBIA
        </div>
      </div>

      {/* Pills info */}
      <div style={{
        display: "grid", gap: 0,
        gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
        maxWidth: 560, margin: "26px auto 0",
        padding: "12px 18px",
        border: `1.5px solid ${C.red}`, borderRadius: 4,
        background: "#fff",
      }}>
        <Pill icon="📅" titulo="SUNDAY" valor="JUNE 07" />
        <Sep />
        <Pill icon="🕐" titulo="DOORS OPEN" valor="2PM" />
        <Sep />
        <Pill icon="📍" titulo="ATOLÓN" valor="BEACH CLUB" />
      </div>

      <div style={{
        display: "inline-block", marginTop: 14, padding: "8px 18px",
        border: `1.5px solid ${C.red}`, borderRadius: 50, fontSize: 11,
        letterSpacing: "0.25em", color: C.red, fontWeight: 700,
      }}>
        JUICYANDCREAM.COM
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: C.textLow, letterSpacing: "0.2em", fontWeight: 600 }}>
        POWERED BY : <span style={{ color: C.text }}>3 NOMADS X</span> & <span style={{ color: C.text }}>574 STUDIO</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SELECTOR — Boletería / Mesas y Camas (sticky)
// ──────────────────────────────────────────────────────────────────────
function Selector({ tab, onTab, compact = false, sticky = false }) {
  // `compact`: versión inline dentro del hero — sin sticky, sin contenedor extra.
  // `sticky`: versión bajo el hero que queda fija en scroll.
  if (compact) {
    return (
      <div>
        {!tab && (
          <div style={{ textAlign: "center", marginBottom: 12, fontSize: 11, letterSpacing: "0.25em", color: C.textMid, fontWeight: 700 }}>
            ELIGE TU EXPERIENCIA
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ChoiceBtn active={tab === "tickets"} onClick={() => onTab("tickets")}
            icon="🎟" titulo="BOLETERÍA" sub="Tickets desde $150.000" />
          <ChoiceBtn active={tab === "mesas"} onClick={() => onTab("mesas")}
            icon="🛋" titulo="MESAS / CAMAS" sub="Experiencia VIP con consumible" />
        </div>
      </div>
    );
  }
  return (
    <div style={{
      position: sticky ? "sticky" : "static", top: 0, zIndex: 30,
      background: "rgba(250,250,248,0.96)", backdropFilter: "blur(8px)",
      borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
      marginTop: 10,
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ChoiceBtn active={tab === "tickets"} onClick={() => onTab("tickets")}
            icon="🎟" titulo="BOLETERÍA" sub="Tickets desde $150.000" />
          <ChoiceBtn active={tab === "mesas"} onClick={() => onTab("mesas")}
            icon="🛋" titulo="MESAS / CAMAS" sub="Experiencia VIP con consumible" />
        </div>
      </div>
    </div>
  );
}

function ChoiceBtn({ active, onClick, icon, titulo, sub }) {
  return (
    <button onClick={onClick} style={{
      padding: "18px 20px",
      background: active ? C.red : "#fff",
      color: active ? "#fff" : C.text,
      border: `2px solid ${active ? C.red : C.borderMid}`,
      borderRadius: 6,
      cursor: "pointer",
      textAlign: "left",
      transition: "all 0.15s",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{ fontSize: 30 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: "0.08em", lineHeight: 1 }}>
          {titulo}
        </div>
        <div style={{ fontSize: 11, marginTop: 4, opacity: active ? 0.85 : 0.6, fontWeight: 500 }}>{sub}</div>
      </div>
      <div style={{ fontSize: 18 }}>{active ? "✕" : "→"}</div>
    </button>
  );
}

function Pill({ icon, titulo, valor }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 9, color: C.textMid, letterSpacing: "0.18em", fontWeight: 700, marginTop: 2 }}>{titulo}</div>
      <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: "0.05em", color: C.red, marginTop: 1 }}>{valor}</div>
    </div>
  );
}
const Sep = () => <div style={{ background: C.borderMid, width: 1 }} />;

// ──────────────────────────────────────────────────────────────────────
// TICKETS
// ──────────────────────────────────────────────────────────────────────
function TicketsSection({ vendidos, onSelect }) {
  const h = horaCO();
  return (
    <div>
      <SectionTitle title="BOLETERÍA" sub="Todos los tickets incluyen transporte en lancha desde el Muelle de la Bodeguita · ida y regreso" />
      <div style={{ display: "grid", gap: 14 }}>
        {TICKETS_VISIBLES.map(t => {
          const earlyActive = h < t.early.hasta;
          const tieneEarly = t.early.precio !== t.anytime; // flat-price si son iguales
          const precio = earlyActive ? t.early.precio : t.anytime;
          const vendido = vendidos[t.key] || 0;
          const disponible = t.cupo - vendido;
          const sold = disponible <= 0;
          return (
            <div key={t.key} style={{
              background: "#fff",
              border: `2px solid ${sold ? C.border : C.text}`,
              borderRadius: 6,
              padding: "18px 22px",
              opacity: sold ? 0.5 : 1,
            }}>
              {/* Encabezado: nombre + precio + comprar */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr auto",
                alignItems: "center", gap: 14,
                paddingBottom: t.incluye ? 14 : 0,
                borderBottom: t.incluye ? `1px solid ${C.border}` : "none",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {t.label}
                    </div>
                    {earlyActive && tieneEarly && !sold && (
                      <span style={{
                        fontSize: 10, padding: "3px 9px", borderRadius: 20,
                        background: C.red, color: "#fff", fontWeight: 800, letterSpacing: "0.1em",
                      }}>EARLY BIRD</span>
                    )}
                    {t.badge && !sold && (
                      <span style={{
                        fontSize: 10, padding: "3px 9px", borderRadius: 20,
                        background: C.text, color: "#fff", fontWeight: 800, letterSpacing: "0.08em",
                      }}>{t.badge.toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMid, fontWeight: 500 }}>{t.sub}</div>
                  {(sold || (earlyActive && tieneEarly && !sold)) && (
                    <div style={{ fontSize: 11, color: C.textLow, marginTop: 6 }}>
                      {sold && "Agotado"}
                      {earlyActive && tieneEarly && !sold && (
                        <span style={{ color: C.red, fontWeight: 700 }}>
                          Early hasta {t.early.hasta}:00 hrs
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  {tieneEarly && (
                    <div style={{ fontSize: 10, color: C.textLow, letterSpacing: "0.15em", fontWeight: 700 }}>
                      {earlyActive ? "EARLY" : "ANYTIME"}
                    </div>
                  )}
                  <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 30, color: C.red, lineHeight: 1, marginTop: tieneEarly ? 2 : 0 }}>
                    {COP(precio)}
                  </div>
                  {earlyActive && tieneEarly && (
                    <div style={{ fontSize: 11, color: C.textLow, textDecoration: "line-through", marginTop: 2 }}>
                      {COP(t.anytime)}
                    </div>
                  )}
                  <button onClick={() => !sold && onSelect(t)} disabled={sold}
                    style={{
                      marginTop: 12, padding: "9px 22px",
                      background: sold ? C.border : C.red, color: sold ? C.textLow : "#fff",
                      border: "none", borderRadius: 4, fontWeight: 900, fontSize: 12,
                      letterSpacing: "0.1em", cursor: sold ? "not-allowed" : "pointer",
                      fontFamily: "'Bebas Neue', sans-serif",
                    }}>
                    {sold ? "AGOTADO" : "COMPRAR"}
                  </button>
                </div>
              </div>

              {/* Lista incluye (detalles del ticket) */}
              {t.incluye && (
                <div style={{ paddingTop: 14, display: "grid", gap: 10 }}>
                  {t.incluye.map((it, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{
                        fontSize: 16, lineHeight: 1, flexShrink: 0, width: 22,
                        color: it.warning ? C.red : C.text,
                      }}>{it.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700,
                          color: it.warning ? C.red : C.text, lineHeight: 1.3,
                        }}>{it.titulo}</div>
                        <div style={{
                          fontSize: 11, color: C.textMid, marginTop: 2, lineHeight: 1.4,
                        }}>{it.detalle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MESAS
// ──────────────────────────────────────────────────────────────────────
function MesasSection({ reservadas, onSelect }) {
  const grupos = useMemo(() => {
    const g = {};
    MESAS.forEach(m => { if (!g[m.zona]) g[m.zona] = []; g[m.zona].push(m); });
    return g;
  }, []);
  // Highlight transitorio: cuando el usuario hace click en una mesa del plano,
  // se hace scroll hasta su fila en la lista y la marcamos brevemente para
  // que sea fácil ubicarla.
  const [highlight, setHighlight] = useState(null);
  const handlePlanoClick = (m) => {
    if (reservadas.has(m.key)) return; // mesas tomadas no scrollean
    const el = document.getElementById(`mesa-row-${m.key}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(m.key);
    setTimeout(() => setHighlight(null), 2000);
  };
  return (
    <div>
      <SectionTitle title="MESAS / CAMAS" />

      {/* Intro / descripción general */}
      <div style={{
        background: "#fff", border: `1px solid ${C.borderMid}`, borderRadius: 6,
        padding: "18px 22px", marginBottom: 20,
        fontSize: 13, lineHeight: 1.7, color: C.textMid,
      }}>
        <p style={{ margin: "0 0 12px" }}>
          Todas las mesas incluyen <strong style={{ color: C.text }}>consumo redimible en bebidas</strong> durante el evento — <strong style={{ color: C.text }}>15%</strong> en Front Pool y VIP Beach, <strong style={{ color: C.text }}>25%</strong> en DJ Booth y Backstage.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          Las mesas <strong style={{ color: C.text }}>DJ Booth</strong> y <strong style={{ color: C.text }}>Backstage</strong> incluyen <span style={{ color: C.red, fontWeight: 600 }}>transporte privado en lancha rápida ida & regreso desde Cartagena</span> para todo el grupo.
        </p>
        <p style={{ margin: 0, fontStyle: "italic", color: C.text }}>
          JUICY &amp; CREAM es una experiencia premium curada por <strong>3 NOMADS X × 574 STUDIO</strong>, diseñada para quienes buscan vivir el mejor crossover entre música electrónica, urbano, lujo y cultura de playa en el Caribe colombiano.
        </p>
      </div>

      {/* Plano visual — usa la imagen oficial con hotspots clickeables sobre
          cada mesa. La imagen está en public/juicy-plano.png. Los hotspots
          se posicionan en % para que escalen con el ancho responsive. */}
      <PlanoImagen reservadas={reservadas} onClick={handlePlanoClick} highlight={highlight} />

      {/* Lista por zonas */}
      <div style={{ display: "grid", gap: 12 }}>
        {Object.entries(grupos).map(([zona, mesas]) => {
          const beneficios = ZONA_DESCRIPCION[zona];
          return (
          <div key={zona} style={{
            background: "#fff", border: `1px solid ${C.borderMid}`, borderRadius: 6, padding: 16,
          }}>
            <div style={{
              fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: "0.12em",
              color: C.red, marginBottom: 10,
            }}>{zona}</div>
            {beneficios && (
              <ul style={{
                margin: "0 0 14px", padding: "10px 14px 10px 24px",
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
                fontSize: 12, color: C.textMid, lineHeight: 1.7,
              }}>
                {beneficios.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              {mesas.map(m => {
                const taken = reservadas.has(m.key);
                const isHi  = highlight === m.key;
                return (
                  <button key={m.key} id={`mesa-row-${m.key}`} onClick={() => onSelect(m)} disabled={taken}
                    style={{
                      display: "grid", gridTemplateColumns: "60px 1fr auto",
                      alignItems: "center", gap: 12, padding: "10px 12px",
                      background: taken ? "#F5F5F5" : (isHi ? "#FEF3C7" : "transparent"),
                      border: `${isHi ? 2 : 1}px solid ${isHi ? C.red : C.border}`,
                      borderRadius: 4,
                      cursor: taken ? "not-allowed" : "pointer",
                      color: taken ? C.textLow : C.text, textAlign: "left",
                      opacity: taken ? 0.5 : 1, fontFamily: "inherit",
                      transition: "background 0.3s, border-color 0.3s",
                      scrollMarginTop: 120, // compensa sticky selector cuando se hace scroll
                    }}>
                    <div style={{
                      fontFamily: "'Anton', sans-serif", fontSize: 18,
                      color: m.premium ? C.red : C.text, letterSpacing: "0.05em",
                    }}>{m.key}</div>
                    <div style={{ fontSize: 11, color: C.textMid }}>
                      {m.pax && <span style={{ fontWeight: 700, color: C.text }}>👥 {m.pax} pax</span>}
                      {m.pax && <span style={{ color: C.borderMid, margin: "0 6px" }}>·</span>}
                      Consumible {Math.round(m.consumible * 100)}%
                      {m.transporte && <span style={{ color: C.red, marginLeft: 8, fontWeight: 700 }}>· 🚤 Transporte</span>}
                    </div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: taken ? C.textLow : C.text, letterSpacing: "0.04em" }}>
                      {taken ? "RESERVADA" : COP(m.precio)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* Beneficios */}
      <div style={{ background: "#fff", border: `2px solid ${C.red}`, borderRadius: 6, padding: 16, marginTop: 14 }}>
        <div style={{
          fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: "0.1em",
          color: C.red, marginBottom: 10, textAlign: "center",
        }}>MESAS DJ BOOTH & BACKSTAGE INCLUYEN</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 10 }}>
          {[
            { icon: "🛎", label: "Concierge VIP" },
            { icon: "👑", label: "Ingreso preferente" },
            { icon: "🚻", label: "Baños exclusivos" },
            { icon: "⭐", label: "Experiencias de marca" },
          ].map(b => (
            <div key={b.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22 }}>{b.icon}</div>
              <div style={{ fontSize: 10, color: C.textMid, fontWeight: 700, marginTop: 4 }}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PLANO con imagen oficial + hotspots clickeables ───────────────────
// Las coordenadas son porcentajes respecto al alto/ancho de la imagen
// (juicy-plano.png, vertical ~627×1024). Cada hotspot es un botón
// transparente posicionado en absoluto.
const HOTSPOTS = {
  // Columna izquierda (4A, 3A, 2A, 1A) — top→bottom
  "4A": { top:  4.5, left:  4,  width: 17, height: 7.5 },
  "3A": { top: 13,   left:  4,  width: 17, height: 7.5 },
  "2A": { top: 22,   left:  4,  width: 17, height: 7.5 },
  "1A": { top: 31,   left:  4,  width: 17, height: 7.5 },
  // Columna derecha (4B, 3B, 2B, 1B)
  "4B": { top:  4.5, left: 79,  width: 17, height: 7.5 },
  "3B": { top: 13,   left: 79,  width: 17, height: 7.5 },
  "2B": { top: 22,   left: 79,  width: 17, height: 7.5 },
  "1B": { top: 31,   left: 79,  width: 17, height: 7.5 },
  // Backstage / DJ (centro)
  "A1": { top: 42.5, left: 26.5, width: 16, height: 7 },
  "A2": { top: 42.5, left: 57.5, width: 16, height: 7 },
  // VIP Beach izquierda (1C-4C)
  "1C": { top: 58,   left:  4,  width: 17, height: 7 },
  "2C": { top: 66,   left:  4,  width: 17, height: 7 },
  "3C": { top: 74,   left:  4,  width: 17, height: 7 },
  "4C": { top: 82,   left:  4,  width: 17, height: 7 },
  // VIP Beach derecha (5C-8C)
  "5C": { top: 58,   left: 79,  width: 17, height: 7 },
  "6C": { top: 66,   left: 79,  width: 17, height: 7 },
  "7C": { top: 74,   left: 79,  width: 17, height: 7 },
  "8C": { top: 82,   left: 79,  width: 17, height: 7 },
};

function PlanoImagen({ reservadas, onClick, highlight }) {
  return (
    <div style={{
      background: "#fff", border: `2px solid ${C.text}`, borderRadius: 6,
      padding: 14, marginBottom: 20,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: "0.25em", color: C.textMid,
        fontWeight: 700, textAlign: "center", marginBottom: 12,
      }}>
        PLANO DEL EVENTO · Toca una mesa para ver detalles
      </div>
      <div style={{ position: "relative", maxWidth: 520, margin: "0 auto", lineHeight: 0 }}>
        <img src="/juicy-plano.png" alt="Plano JUICY & CREAM"
          style={{ width: "100%", height: "auto", display: "block", borderRadius: 4 }} />
        {Object.entries(HOTSPOTS).map(([k, pos]) => {
          const m = MESAS.find(x => x.key === k);
          if (!m) return null;
          const taken = reservadas.has(k);
          const isHi  = highlight === k;
          return (
            <button key={k} onClick={() => !taken && onClick(m)} disabled={taken}
              title={`${m.zona} · ${k} · ${COP(m.precio)}${taken ? " · RESERVADA" : ""}`}
              style={{
                position: "absolute",
                top: `${pos.top}%`, left: `${pos.left}%`,
                width: `${pos.width}%`, height: `${pos.height}%`,
                background: taken
                  ? "rgba(225,29,42,0.45)"
                  : (isHi ? "rgba(254,243,199,0.45)" : "transparent"),
                border: isHi ? `2px solid ${C.red}` : "2px solid transparent",
                borderRadius: 6,
                cursor: taken ? "not-allowed" : "pointer",
                padding: 0,
                transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
                boxShadow: isHi ? `0 0 0 4px rgba(225,29,42,0.25)` : "none",
              }}
              onMouseEnter={e => { if (!taken) e.currentTarget.style.background = "rgba(225,29,42,0.18)"; }}
              onMouseLeave={e => {
                if (!taken && !isHi) e.currentTarget.style.background = "transparent";
                else if (taken) e.currentTarget.style.background = "rgba(225,29,42,0.45)";
                else if (isHi) e.currentTarget.style.background = "rgba(254,243,199,0.45)";
              }}
            >
              {taken && (
                <span style={{
                  color: "#fff", fontWeight: 900, fontSize: 11,
                  letterSpacing: "0.06em",
                }}>RESERVADA</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{
        marginTop: 12, fontSize: 11, color: C.textMid, textAlign: "center",
      }}>
        <span style={{ display: "inline-block", width: 14, height: 14, background: "rgba(225,29,42,0.45)", borderRadius: 3, verticalAlign: "middle", marginRight: 6 }} />
        Reservadas
        <span style={{ marginLeft: 16, display: "inline-block", width: 14, height: 14, border: `2px solid ${C.red}`, borderRadius: 3, verticalAlign: "middle", marginRight: 6 }} />
        Seleccionada
      </div>
    </div>
  );
}

function MesaSlot({ k, reservadas, onSelect, size = "md" }) {
  const m = MESAS.find(x => x.key === k);
  if (!m) return <div style={{ height: 38 }} />;
  const taken = reservadas.has(k);
  const color = m.premium ? C.red : C.text;
  return (
    <button onClick={() => onSelect(m)} disabled={taken} style={{
      background: taken ? "#F5F5F5" : "#fff",
      border: `1.5px solid ${taken ? C.border : color}`,
      borderRadius: 4, padding: size === "lg" ? "10px 12px" : "8px 6px",
      color: taken ? C.textLow : color,
      fontFamily: "'Anton', sans-serif",
      fontSize: size === "lg" ? 16 : 13,
      letterSpacing: "0.05em",
      cursor: taken ? "not-allowed" : "pointer",
      minWidth: size === "lg" ? 44 : 32, textAlign: "center",
      opacity: taken ? 0.5 : 1,
    }}>{k}</button>
  );
}

// ──────────────────────────────────────────────────────────────────────
function Transporte() {
  return (
    <div style={{
      marginTop: 36, background: "#fff", border: `1px solid ${C.borderMid}`,
      borderRadius: 6, padding: 22,
    }}>
      <div style={{
        fontFamily: "'Anton', sans-serif", fontSize: 20, letterSpacing: "0.12em",
        color: C.text, marginBottom: 14,
      }}>🚤 TRANSPORTE</div>
      <div style={{ display: "grid", gap: 8, fontSize: 13, color: C.textMid, lineHeight: 1.6 }}>
        <div><strong style={{ color: C.text }}>Salida:</strong> Lanchas rápidas desde Muelle de la Bodeguita · Trayecto 15 min</div>
        <div><strong style={{ color: C.text }}>Ida:</strong> Desde 1:30 PM, cada 30 minutos</div>
        <div><strong style={{ color: C.text }}>Regreso:</strong> Desde 9:00 PM hasta 2:00 AM, cada 30 minutos</div>
        <div style={{ color: C.red, marginTop: 4, fontWeight: 600 }}>
          ⚠ Impuesto de Muelle NO incluido — se paga en la taquilla de la Bodeguita
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: "32px 16px", textAlign: "center", background: "#fff" }}>
      <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 24, letterSpacing: "0.1em", color: C.text }}>
        ATOLÓN BEACH CLUB
      </div>
      <div style={{ fontSize: 10, letterSpacing: "0.25em", marginTop: 4, color: C.textMid }}>TIERRA BOMBA · CARTAGENA</div>
      <div style={{ fontSize: 10, marginTop: 14, color: C.textLow, letterSpacing: "0.05em" }}>
        juicyandcream.com · powered by <strong style={{ color: C.text }}>3 NOMADS X</strong> & <strong style={{ color: C.text }}>574 STUDIO</strong>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SVG decorations
// ──────────────────────────────────────────────────────────────────────
function SplashDeco() {
  // splash rojo detrás de "JUICY"
  return (
    <svg viewBox="0 0 800 240" style={{
      position: "absolute", top: -28, left: -20, width: "60%", height: "auto",
      zIndex: 1, pointerEvents: "none", opacity: 0.85,
    }}>
      <g fill="#E11D2A">
        <circle cx="80" cy="60" r="22" />
        <circle cx="30" cy="40" r="6" />
        <circle cx="50" cy="100" r="9" />
        <circle cx="120" cy="20" r="5" />
        <circle cx="170" cy="50" r="14" />
        <circle cx="200" cy="120" r="7" />
        <circle cx="240" cy="30" r="8" />
        <circle cx="20" cy="160" r="11" />
        <circle cx="280" cy="90" r="5" />
        <path d="M 60 80 Q 50 120 80 150 T 130 200" stroke="#E11D2A" strokeWidth="3" fill="none" />
        <path d="M 200 60 Q 220 90 210 130" stroke="#E11D2A" strokeWidth="2.5" fill="none" />
      </g>
    </svg>
  );
}

function DoodlesRow() {
  // Pez · tortuga · estrella · olas — alrededor de la firma AriaVega
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, top: "55%", pointerEvents: "none",
      display: "flex", justifyContent: "space-between", padding: "0 6%", zIndex: 0,
    }}>
      {/* Izquierda */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: 0.85 }}>
        <svg width="46" height="22" viewBox="0 0 46 22" fill="none">
          <path d="M 4 11 Q 14 2 28 5 L 42 11 L 28 17 Q 14 20 4 11 Z" stroke="#E11D2A" strokeWidth="1.5" />
          <circle cx="32" cy="9" r="1.2" fill="#E11D2A" />
        </svg>
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <ellipse cx="20" cy="16" rx="12" ry="8" stroke="#E11D2A" strokeWidth="1.5" />
          <circle cx="20" cy="16" r="3" stroke="#E11D2A" strokeWidth="1" />
          <path d="M 12 10 L 8 6 M 28 10 L 32 6 M 12 22 L 8 26 M 28 22 L 32 26" stroke="#E11D2A" strokeWidth="1.5" />
          <circle cx="30" cy="8" r="2" stroke="#E11D2A" strokeWidth="1.2" />
        </svg>
      </div>
      {/* Derecha */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: 0.85, alignItems: "flex-end" }}>
        <svg width="44" height="20" viewBox="0 0 44 20" fill="none">
          <path d="M 4 10 Q 10 4 16 10 T 28 10 T 40 10" stroke="#E11D2A" strokeWidth="1.5" />
          <path d="M 32 14 L 36 18 M 36 14 L 40 18" stroke="#E11D2A" strokeWidth="1.5" />
        </svg>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M 16 3 L 19 12 L 29 13 L 21 19 L 24 28 L 16 23 L 8 28 L 11 19 L 3 13 L 13 12 Z" stroke="#E11D2A" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CHECKOUT MODAL
// ──────────────────────────────────────────────────────────────────────
function CheckoutModal({ item, onClose, onConfirmar }) {
  const [cantidad, setCantidad] = useState(item.cantidad);
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "", cedula: "" });
  const [busy, setBusy] = useState(false);

  const totalBase = item.precio * (item.kind === "ticket" ? cantidad : 1);
  const consumibleMonto = item.consumible ? totalBase * item.consumible : 0;
  const totalFinal = totalBase;

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Crea el registro en juicy_cream_reservas y bloquea la mesa (si aplica).
  // Devuelve el id de la reserva (o null si hubo error).
  async function crearReservaPendiente(metodo) {
    const id = `JC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const payload = {
      id, tipo: item.kind, categoria: item.categoria,
      cantidad: item.kind === "ticket" ? Number(cantidad) : 1,
      precio_unitario: item.precio, total: totalFinal,
      consumible_pct: item.consumible ? item.consumible * 100 : 0,
      nombre: form.nombre.trim(),
      email: form.email.trim() || null,
      telefono: form.telefono.trim(),
      cedula: form.cedula.trim() || null,
      estado: "pendiente_pago",
      forma_pago: metodo, // "wompi" | "tarjeta_internacional"
    };
    const { data, error } = await supabase
      .from("juicy_cream_reservas")
      .insert(payload)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        alert("Esta mesa ya fue reservada por otra persona — refresca la página y elige otra.");
        onClose();
      } else {
        alert("Error guardando reserva: " + error.message);
      }
      return null;
    }
    if (!data) {
      alert("La reserva no quedó guardada (sin error). Re-intenta.");
      return null;
    }
    return id;
  }

  // Wompi (tarjeta nacional): redirige al checkout hospedado de Wompi.
  async function pagarWompi() {
    const digitos = (form.telefono || "").replace(/\D/g, "");
    if (!form.nombre.trim() || digitos.length < 7) {
      alert("Nombre y teléfono (mínimo 7 dígitos) son requeridos");
      return;
    }
    setBusy(true);
    const id = await crearReservaPendiente("wompi");
    if (!id) { setBusy(false); return; }
    try {
      const redirectBase = `${window.location.origin}/pago?reserva=${id}`;
      const payUrl = await wompiCheckoutUrl({
        referencia: id, totalCOP: totalFinal,
        email: form.email || "", redirectUrl: redirectBase,
      });
      // Guardar link_pago para auditoría
      supabase.from("juicy_cream_reservas")
        .update({ link_pago: payUrl }).eq("id", id)
        .then(() => {}).catch(() => {});
      onConfirmar(); // permite refrescar la lista de mesas
      window.location.href = payUrl;
    } catch (err) {
      console.error("[juicy/wompi]", err);
      alert("Error con tarjeta nacional: " + (err.message || err));
      setBusy(false);
    }
  }

  // Tarjeta internacional (Zoho Pay): abre widget embebido o redirige.
  async function pagarInternacional() {
    const digitos = (form.telefono || "").replace(/\D/g, "");
    if (!form.nombre.trim() || digitos.length < 7) {
      alert("Nombre y teléfono (mínimo 7 dígitos) son requeridos");
      return;
    }
    setBusy(true);
    const id = await crearReservaPendiente("tarjeta_internacional");
    if (!id) { setBusy(false); return; }
    try {
      const tasa = 4200; // COP → USD aprox; el backend usa tasa real si la tiene
      const amountUSD = Math.ceil(totalFinal / tasa);
      const session = await crearSesionPago({
        amount: amountUSD, currency: "USD", reference: id,
        description: `JUICY & CREAM · ${item.label}`,
        email: form.email || "", nombre: form.nombre,
        context: "juicy_cream", context_id: id,
      });
      if (session.payments_session_id && session.widget?.account_id) {
        // Para MVP: abrir Zoho Pay en nueva pestaña con el payment link si está,
        // o caer al flujo de pago/exito. El widget embebido requiere componente
        // específico (ZohoPaymentWidget) que aquí no está integrado.
        // Por ahora redirigimos a la URL si viene, sino mostramos alerta.
        if (session.url) {
          supabase.from("juicy_cream_reservas").update({ link_pago: session.url }).eq("id", id).then(() => {});
          onConfirmar();
          window.location.href = session.url;
        } else {
          alert("Sesión de pago internacional creada. Te contactamos para finalizar.\n\nID: " + id);
          setBusy(false);
          onConfirmar();
          onClose();
        }
      } else if (session.url) {
        supabase.from("juicy_cream_reservas").update({ link_pago: session.url }).eq("id", id).then(() => {});
        onConfirmar();
        window.location.href = session.url;
      } else {
        throw new Error("Sin URL de pago ni session widget");
      }
    } catch (err) {
      console.error("[juicy/internacional]", err);
      alert("Error con tarjeta internacional: " + (err.message || err) + "\n\nIntenta con tarjeta nacional.");
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 style={{
        fontFamily: "'Anton', sans-serif", fontSize: 24, letterSpacing: "0.05em",
        margin: "0 0 2px", color: C.red,
      }}>{item.label}</h3>
      <div style={{ fontSize: 11, color: C.textLow, marginBottom: 18, letterSpacing: "0.15em", fontWeight: 600 }}>
        JUICY &amp; CREAM · 07 JUN 2026
        {item.kind === "mesa" && item.pax && <span style={{ color: C.text, marginLeft: 8 }}>· 👥 {item.pax} PAX</span>}
      </div>

      {item.kind === "ticket" && (
        <div style={{ marginBottom: 14 }}>
          <Label>Cantidad</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setCantidad(c => Math.max(1, c - 1))} style={qBtn}>−</button>
            <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, minWidth: 36, textAlign: "center" }}>{cantidad}</span>
            <button onClick={() => setCantidad(c => Math.min(10, c + 1))} style={qBtn}>+</button>
            <div style={{ marginLeft: "auto", fontSize: 13, color: C.textMid }}>
              {COP(item.precio)} c/u
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        <Field label="Nombre completo *" value={form.nombre} onChange={v => setF("nombre", v)} />
        <Field label="Teléfono *"        value={form.telefono} onChange={v => setF("telefono", v)} type="tel" placeholder="+57 300 000 0000" />
        <Field label="Email"             value={form.email} onChange={v => setF("email", v)} type="email" />
        <Field label="Cédula"            value={form.cedula} onChange={v => setF("cedula", v)} />
      </div>

      <div style={{
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: item.consumible ? 6 : 0 }}>
          <span style={{ color: C.textMid }}>{item.kind === "ticket" ? `${cantidad} ticket${cantidad > 1 ? "s" : ""}` : "Mesa"}</span>
          <span style={{ fontWeight: 700 }}>{COP(totalBase)}</span>
        </div>
        {item.consumible && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.red, marginBottom: 8 }}>
            <span>Incluye consumible {Math.round(item.consumible * 100)}%</span>
            <span>({COP(consumibleMonto)})</span>
          </div>
        )}
        <div style={{
          display: "flex", justifyContent: "space-between", paddingTop: 10,
          borderTop: `1px solid ${C.border}`,
          fontFamily: "'Anton', sans-serif", fontSize: 22, color: C.red,
        }}>
          <span>TOTAL</span>
          <span>{COP(totalFinal)}</span>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.18em", fontWeight: 700, marginBottom: 10 }}>
        ELIGE MÉTODO DE PAGO
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {/* Tarjeta Nacional → Wompi */}
        <button onClick={pagarWompi} disabled={busy} style={{
          display: "flex", alignItems: "center", gap: 14,
          width: "100%", padding: "14px 18px",
          background: "#fff", color: C.text,
          border: `2px solid ${busy ? C.border : C.text}`, borderRadius: 6,
          cursor: busy ? "wait" : "pointer", textAlign: "left",
          opacity: busy ? 0.6 : 1,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8, background: "#5B4CF5",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 18,
          }}>W</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: "0.08em" }}>
              TARJETA NACIONAL
            </div>
            <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>
              PSE · Nequi · Bancolombia · Visa / Mastercard CO
            </div>
          </div>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, color: C.red }}>
            {COP(totalFinal)}
          </div>
        </button>
        {/* Tarjeta Internacional → Zoho Pay */}
        <button onClick={pagarInternacional} disabled={busy} style={{
          display: "flex", alignItems: "center", gap: 14,
          width: "100%", padding: "14px 18px",
          background: "#fff", color: C.text,
          border: `2px solid ${busy ? C.border : C.text}`, borderRadius: 6,
          cursor: busy ? "wait" : "pointer", textAlign: "left",
          opacity: busy ? 0.6 : 1,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8, background: "#0A0A0A",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 18,
          }}>$</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: "0.08em" }}>
              TARJETA INTERNACIONAL
            </div>
            <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>
              Visa · Mastercard · Amex · Apple Pay · Google Pay
            </div>
          </div>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, color: C.red }}>
            {COP(totalFinal)}
          </div>
        </button>
      </div>
      <div style={{
        marginTop: 12, padding: "8px 12px", background: "#FFF7E6",
        border: "1px solid #F5C842", borderRadius: 6, fontSize: 11,
        color: "#92400E", display: "flex", alignItems: "flex-start", gap: 6,
      }}>
        <span>💳</span>
        <span>
          El cargo con tarjeta internacional aparecerá en tu estado de cuenta a nombre de <strong>X Travel Group</strong>.
        </span>
      </div>
      <div style={{ fontSize: 10, color: C.textLow, marginTop: 10, textAlign: "center" }}>
        🔒 Pago seguro · Tu reserva queda bloqueada al iniciar el pago.
      </div>
    </Overlay>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers UI
// ──────────────────────────────────────────────────────────────────────
function SectionTitle({ title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 42, margin: 0, letterSpacing: "0.05em", color: C.text }}>
        {title}
      </h2>
      <div style={{ width: 60, height: 3, background: C.red, marginTop: 6 }} />
      {sub && <div style={{ fontSize: 12, color: C.textMid, marginTop: 8, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 16, overflowY: "auto",
    }}>
      <div style={{
        background: "#fff", border: `2px solid ${C.text}`, borderRadius: 8,
        padding: 24, width: "100%", maxWidth: 460, position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 10, right: 12,
          background: "none", border: "none", color: C.textMid,
          fontSize: 26, cursor: "pointer", lineHeight: 1, padding: 4,
        }}>×</button>
        {children}
      </div>
    </div>
  );
}

const Label = ({ children }) => (
  <div style={{
    fontSize: 10, color: C.textMid, letterSpacing: "0.18em",
    fontWeight: 700, marginBottom: 6, textTransform: "uppercase",
  }}>{children}</div>
);

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <Label>{label}</Label>
      <input value={value} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder}
        style={{
          width: "100%", padding: "11px 14px",
          background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 4,
          color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box",
          fontFamily: "inherit",
        }} />
    </div>
  );
}

const qBtn = {
  width: 38, height: 38, borderRadius: 4,
  background: "#fff", border: `1.5px solid ${C.text}`, color: C.text,
  fontSize: 18, fontWeight: 900, cursor: "pointer",
};
