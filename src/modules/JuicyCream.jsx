// Landing + booking engine para evento JUICY & CREAM (afterparty oficial
// J Balvin · Cartagena · Domingo 07-jun-2026). Vende:
//  • Tickets generales (VIP, ETAPA 1-3, DOOR) con precio dinámico early/anytime
//  • Mesas (DJ BOOTH, BACKSTAGE, VIP BEACH) con consumible 15%/25%
// Las reservas se guardan en juicy_cream_reservas y el flujo de pago
// es vía WhatsApp al equipo comercial (MVP). Las mesas son únicas — al
// reservarse una, se bloquea automáticamente por unique index DB.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const COP = n => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;

// ── Paleta inspirada en el flyer ──────────────────────────────────────
const C = {
  bg:      "#0a0a0a",
  bgSoft:  "#141414",
  card:    "#1a1a1a",
  border:  "#2a2a2a",
  text:    "#fff",
  textMid: "rgba(255,255,255,0.65)",
  textLow: "rgba(255,255,255,0.35)",
  red:     "#E11D2A",  // rojo cherry del flyer
  redDark: "#9B1018",
  cream:   "#F4EBD8",  // cream/vainilla
  gold:    "#D9A55B",
  silver:  "#C0C0C0",
};

const WA_PHONE = "573104077720"; // mismo número operativo de Atolón

// ── Datos del evento ──────────────────────────────────────────────────
const EVENTO = {
  fecha: "Domingo 07 de Junio",
  doors: "2:00 PM",
  venue: "Atolón Beach Club · Isla Tierra Bomba · Cartagena",
  tagline: "ELECTRONIC WORLD · URBAN VIBES",
  lineup: {
    headliner: "Aria Vega",
    electronic: ["2 NOMADS", "Gustavo Ibarra"],
    urban: ["DJ Pope", "DJ Tornall"],
    extra: "Argüello — precisamente en Cartagena",
  },
  by: "3 NOMADS X · 574 STUDIO",
  oficial: "Official Afterparty J Balvin Colombian Tour Finale",
};

// ── Tickets: precios cambian según hora actual y categoría ────────────
const TICKETS = [
  {
    key: "VIP", label: "VIP",
    sub: "Acceso preferente",
    cupo: 100,
    early: { hasta: 16, precio: 165000 },   // < 4PM
    anytime: 193000,
    color: C.red,
  },
  {
    key: "ETAPA_1", label: "Etapa 1",
    sub: "Primera etapa",
    cupo: 100,
    early: { hasta: 16, precio: 193000 },
    anytime: 248000,
    color: C.gold,
  },
  {
    key: "ETAPA_2", label: "Etapa 2",
    sub: "Segunda etapa",
    cupo: 100,
    early: { hasta: 18, precio: 248000 },   // < 6PM
    anytime: 303000,
    color: C.gold,
  },
  {
    key: "ETAPA_3", label: "Etapa 3",
    sub: "Tercera etapa",
    cupo: 100,
    early: { hasta: 18, precio: 303000 },
    anytime: 358000,
    color: C.gold,
  },
  {
    key: "DOOR", label: "Door",
    sub: "Última disponibilidad",
    cupo: 300,
    early: { hasta: 18, precio: 385000 },
    anytime: 440000,
    color: C.cream,
  },
];

// ── Mesas ─────────────────────────────────────────────────────────────
const MESAS = [
  // DJ Booth
  { key: "A1", zona: "DJ BOOTH",  precio: 20350000, consumible: 0.25, transporte: true, premium: true },
  { key: "A2", zona: "DJ BOOTH",  precio: 20350000, consumible: 0.25, transporte: true, premium: true },
  // Backstage
  { key: "1A", zona: "BACKSTAGE", precio: 14300000, consumible: 0.25, transporte: true, premium: true },
  { key: "1B", zona: "BACKSTAGE", precio: 14300000, consumible: 0.25, transporte: true, premium: true },
  // 2A-2B
  { key: "2A", zona: "FRONT POOL", precio: 12100000, consumible: 0.25 },
  { key: "2B", zona: "FRONT POOL", precio: 12100000, consumible: 0.25 },
  // 3A-3B
  { key: "3A", zona: "FRONT POOL", precio: 9900000, consumible: 0.25 },
  { key: "3B", zona: "FRONT POOL", precio: 9900000, consumible: 0.25 },
  // 4A-4B
  { key: "4A", zona: "FRONT POOL", precio: 8250000, consumible: 0.25 },
  { key: "4B", zona: "FRONT POOL", precio: 8250000, consumible: 0.25 },
  // VIP Beach
  { key: "1C", zona: "VIP BEACH", precio: 6600000, consumible: 0.15 },
  { key: "5C", zona: "VIP BEACH", precio: 6600000, consumible: 0.15 },
  { key: "2C", zona: "VIP BEACH", precio: 5500000, consumible: 0.15 },
  { key: "6C", zona: "VIP BEACH", precio: 5500000, consumible: 0.15 },
  { key: "3C", zona: "VIP BEACH", precio: 4400000, consumible: 0.15 },
  { key: "7C", zona: "VIP BEACH", precio: 4400000, consumible: 0.15 },
  { key: "4C", zona: "VIP BEACH", precio: 3850000, consumible: 0.15 },
  { key: "8C", zona: "VIP BEACH", precio: 3850000, consumible: 0.15 },
];

// ── Hora actual Colombia (en horas decimales) ─────────────────────────
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
// MAIN COMPONENT
// ──────────────────────────────────────────────────────────────────────
export default function JuicyCream() {
  const [tab, setTab] = useState("tickets");       // tickets | mesas
  const [reservadas, setReservadas] = useState(new Set());   // keys de mesas tomadas
  const [ticketsVendidos, setTicketsVendidos] = useState({}); // {VIP: 12, ETAPA_1: 8, ...}
  const [cart, setCart] = useState(null);          // pedido en construcción
  const [confirmandoCheckout, setConfirmandoCheckout] = useState(false);

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
          else if (r.tipo === "ticket") {
            tickets[r.categoria] = (tickets[r.categoria] || 0) + (r.cantidad || 1);
          }
        });
        setReservadas(mesas);
        setTicketsVendidos(tickets);
      });
  }, [confirmandoCheckout]);

  // ── Carrito ──
  const abrirTicket = (tipo) => {
    setCart({
      kind: "ticket",
      categoria: tipo.key,
      label: tipo.label,
      cantidad: 1,
      precio: precioTicket(tipo),
      color: tipo.color,
    });
  };

  const abrirMesa = (mesa) => {
    if (reservadas.has(mesa.key)) return;
    setCart({
      kind: "mesa",
      categoria: mesa.key,
      label: `${mesa.zona} · ${mesa.key}`,
      cantidad: 1,
      precio: mesa.precio,
      consumible: mesa.consumible,
      transporte: mesa.transporte || false,
      color: mesa.premium ? C.red : C.gold,
    });
  };

  const cerrarCart = () => setCart(null);

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(180deg, ${C.bg} 0%, #1a0505 50%, ${C.bg} 100%)`,
      color: C.text,
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      <Hero />

      {/* Tabs */}
      <div style={{
        position: "sticky", top: 0, zIndex: 30,
        background: "rgba(10,10,10,0.92)", backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 0 }}>
          {[
            { key: "tickets", label: "🎟  TICKETS" },
            { key: "mesas",   label: "🛋  MESAS / CAMAS" },
          ].map(t => (
            <button key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: "18px 16px",
                background: "none", border: "none", cursor: "pointer",
                color: tab === t.key ? C.red : C.textMid,
                fontWeight: 800, fontSize: 14, letterSpacing: "0.1em",
                borderBottom: `3px solid ${tab === t.key ? C.red : "transparent"}`,
                transition: "all 0.2s",
              }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 16px 80px" }}>
        {tab === "tickets" ? (
          <TicketsSection vendidos={ticketsVendidos} onSelect={abrirTicket} />
        ) : (
          <MesasSection reservadas={reservadas} onSelect={abrirMesa} />
        )}

        <Transporte />
        <Footer />
      </div>

      {cart && (
        <CheckoutModal
          item={cart}
          onClose={cerrarCart}
          onConfirmar={() => { setConfirmandoCheckout(c => !c); cerrarCart(); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// HERO
// ──────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <div style={{
      position: "relative",
      padding: "60px 16px 40px",
      textAlign: "center",
      background: "radial-gradient(ellipse at 50% 0%, rgba(225,29,42,0.15), transparent 65%)",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{
          fontSize: 11, letterSpacing: "0.3em", color: C.textLow,
          fontWeight: 700, marginBottom: 12, textTransform: "uppercase",
        }}>
          {EVENTO.oficial}
        </div>

        <h1 style={{
          fontSize: "clamp(56px, 11vw, 120px)",
          fontWeight: 900, lineHeight: 0.95, margin: "0 0 8px",
          fontFamily: "'Bebas Neue', 'Barlow Condensed', Impact, sans-serif",
          letterSpacing: "-0.01em",
        }}>
          <span style={{
            background: `linear-gradient(180deg, ${C.red} 0%, ${C.redDark} 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            textShadow: `0 0 40px ${C.red}66`,
          }}>JUICY</span>
          <span style={{ color: C.textLow, margin: "0 16px" }}>&</span>
          <span style={{
            background: `linear-gradient(180deg, ${C.cream} 0%, ${C.silver} 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>CREAM</span>
        </h1>

        <div style={{
          fontSize: 13, letterSpacing: "0.25em", color: C.cream, fontWeight: 600,
          marginBottom: 32, textTransform: "uppercase",
        }}>
          {EVENTO.tagline}
        </div>

        {/* Lineup */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: "'Brush Script MT', cursive",
            fontSize: 56, color: C.red,
            transform: "rotate(-3deg)", display: "inline-block",
          }}>
            {EVENTO.lineup.headliner}
          </div>
          <div style={{ fontSize: 13, color: C.textMid, marginTop: 4 }}>+ very special guests</div>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: 20,
          maxWidth: 480, margin: "0 auto", padding: "20px 0",
          borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        }}>
          <div>
            <div style={{ fontSize: 10, color: C.textLow, letterSpacing: "0.2em", fontWeight: 700, marginBottom: 6 }}>ELECTRONIC WORLD</div>
            {EVENTO.lineup.electronic.map(a => (
              <div key={a} style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>{a}</div>
            ))}
          </div>
          <div style={{ background: C.border }} />
          <div>
            <div style={{ fontSize: 10, color: C.red, letterSpacing: "0.2em", fontWeight: 700, marginBottom: 6 }}>URBAN WORLD</div>
            {EVENTO.lineup.urban.map(a => (
              <div key={a} style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3, color: C.red }}>{a}</div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: C.textMid, fontStyle: "italic" }}>
          {EVENTO.lineup.extra}
        </div>

        {/* Info principal */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 14, marginTop: 36, maxWidth: 600, marginLeft: "auto", marginRight: "auto",
        }}>
          <InfoPill icon="📅" label={EVENTO.fecha.toUpperCase()} />
          <InfoPill icon="🕐" label={`DOORS ${EVENTO.doors}`} />
          <InfoPill icon="📍" label="ATOLÓN BEACH CLUB" />
        </div>

        <div style={{ marginTop: 18, fontSize: 11, color: C.textLow, letterSpacing: "0.15em", fontWeight: 600 }}>
          ISLA TIERRA BOMBA · CARTAGENA · COLOMBIA
        </div>

        <div style={{ marginTop: 28, fontSize: 10, color: C.textLow, letterSpacing: "0.2em" }}>
          POWERED BY <span style={{ color: C.cream, fontWeight: 800 }}>{EVENTO.by}</span>
        </div>
      </div>
    </div>
  );
}

function InfoPill({ icon, label }) {
  return (
    <div style={{
      padding: "10px 14px",
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      display: "flex", alignItems: "center", gap: 8, justifyContent: "center",
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: C.cream, letterSpacing: "0.05em" }}>{label}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// TICKETS
// ──────────────────────────────────────────────────────────────────────
function TicketsSection({ vendidos, onSelect }) {
  const h = horaCO();
  return (
    <div style={{ marginTop: 24 }}>
      <SectionTitle title="Tickets" sub="Todos los tickets incluyen transporte en lancha desde Muelle de la Bodeguita (ida y regreso)." />

      <div style={{ display: "grid", gap: 14 }}>
        {TICKETS.map(t => {
          const earlyActive = h < t.early.hasta;
          const precio = earlyActive ? t.early.precio : t.anytime;
          const vendido = vendidos[t.key] || 0;
          const disponible = t.cupo - vendido;
          const sold = disponible <= 0;

          return (
            <div key={t.key} style={{
              background: C.card, border: `1px solid ${sold ? C.border : t.color + "44"}`,
              borderRadius: 14, padding: "20px 22px",
              display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center",
              opacity: sold ? 0.5 : 1,
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <div style={{
                    fontSize: 22, fontWeight: 900, letterSpacing: "0.05em",
                    color: t.color, textTransform: "uppercase",
                  }}>{t.label}</div>
                  {earlyActive && !sold && (
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 12,
                      background: C.red + "22", color: C.red, fontWeight: 800, letterSpacing: "0.08em",
                    }}>EARLY BIRD</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: C.textMid }}>{t.sub}</div>
                <div style={{ fontSize: 11, color: C.textLow, marginTop: 6 }}>
                  {sold ? "Agotado" : `${disponible} disponibles de ${t.cupo}`}
                  {earlyActive && (
                    <span style={{ color: C.red, marginLeft: 8 }}>
                      · Early hasta {t.early.hasta}:00 PM
                    </span>
                  )}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: C.textLow, marginBottom: 2 }}>
                  {earlyActive ? "EARLY" : "ANYTIME"}
                </div>
                <div style={{
                  fontSize: 26, fontWeight: 900, color: t.color,
                  fontFamily: "'Bebas Neue', sans-serif", lineHeight: 1,
                }}>
                  {COP(precio)}
                </div>
                {earlyActive && (
                  <div style={{ fontSize: 11, color: C.textLow, textDecoration: "line-through", marginTop: 2 }}>
                    {COP(t.anytime)}
                  </div>
                )}
                <button onClick={() => !sold && onSelect(t)} disabled={sold}
                  style={{
                    marginTop: 10, padding: "8px 16px",
                    background: sold ? C.border : t.color, color: sold ? C.textLow : "#000",
                    border: "none", borderRadius: 8, fontWeight: 900, fontSize: 12,
                    letterSpacing: "0.08em", cursor: sold ? "not-allowed" : "pointer",
                  }}>
                  {sold ? "AGOTADO" : "COMPRAR"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MESAS (plano visual)
// ──────────────────────────────────────────────────────────────────────
function MesasSection({ reservadas, onSelect }) {
  // Agrupar por zona para mostrar precios
  const grupos = useMemo(() => {
    const g = {};
    MESAS.forEach(m => {
      if (!g[m.zona]) g[m.zona] = [];
      g[m.zona].push(m);
    });
    return g;
  }, []);

  return (
    <div style={{ marginTop: 24 }}>
      <SectionTitle title="Mesas / Camas" sub="Experiencia exclusiva con consumible incluido. Las mesas DJ Booth y Backstage incluyen transporte privado en lancha para el grupo completo (ida y regreso)." />

      {/* Plano visual */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 18, marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, color: C.textLow, letterSpacing: "0.2em", marginBottom: 14, textAlign: "center", fontWeight: 700 }}>
          PLANO DEL EVENTO
        </div>

        {/* Columna A (izquierda) | POOL/BACKSTAGE/DJ | Columna B (derecha) */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, marginBottom: 14 }}>
          {/* Lado A */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["4A","3A","2A","1A"].map(k => <MesaSlot key={k} k={k} reservadas={reservadas} onSelect={onSelect} />)}
          </div>

          {/* Centro: POOL, BACKSTAGE, DJ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "space-between" }}>
            <div style={{
              background: "linear-gradient(180deg, #1a3a52, #0d2540)", borderRadius: 8,
              padding: "20px 0", textAlign: "center", fontWeight: 900, color: C.cream,
              letterSpacing: "0.3em", fontSize: 14,
            }}>P O O L</div>
            <div style={{
              background: C.bgSoft, borderRadius: 8, padding: "12px 0", textAlign: "center",
              fontWeight: 700, color: C.textMid, letterSpacing: "0.15em", fontSize: 11,
              border: `1px solid ${C.border}`,
            }}>BACKSTAGE</div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              <MesaSlot k="A1" reservadas={reservadas} onSelect={onSelect} size="lg" />
              <MesaSlot k="A2" reservadas={reservadas} onSelect={onSelect} size="lg" />
            </div>
            <div style={{
              background: C.red + "22", color: C.red, borderRadius: 8,
              padding: "6px 0", textAlign: "center", fontWeight: 900, fontSize: 11, letterSpacing: "0.2em",
              border: `1px solid ${C.red}44`,
            }}>DJ</div>
          </div>

          {/* Lado B */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["4B","3B","2B","1B"].map(k => <MesaSlot key={k} k={k} reservadas={reservadas} onSelect={onSelect} />)}
          </div>
        </div>

        {/* VIP Beach abajo */}
        <div style={{
          background: C.gold + "11", border: `1px solid ${C.gold}33`, borderRadius: 8,
          padding: "10px 0", textAlign: "center",
          fontWeight: 700, color: C.gold, letterSpacing: "0.2em", fontSize: 11, marginBottom: 8,
        }}>☀ VIP BEACH · DANCEFLOOR</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["1C","2C","3C","4C"].map(k => <MesaSlot key={k} k={k} reservadas={reservadas} onSelect={onSelect} />)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["5C","6C","7C","8C"].map(k => <MesaSlot key={k} k={k} reservadas={reservadas} onSelect={onSelect} />)}
          </div>
        </div>
      </div>

      {/* Lista por zonas con precios */}
      <div style={{ display: "grid", gap: 12 }}>
        {Object.entries(grupos).map(([zona, mesas]) => (
          <div key={zona} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
          }}>
            <div style={{
              fontSize: 11, color: C.gold, letterSpacing: "0.2em", marginBottom: 10, fontWeight: 800,
            }}>{zona}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {mesas.map(m => {
                const taken = reservadas.has(m.key);
                return (
                  <button key={m.key} onClick={() => onSelect(m)} disabled={taken}
                    style={{
                      display: "grid", gridTemplateColumns: "60px 1fr auto",
                      alignItems: "center", gap: 12, padding: "10px 12px",
                      background: taken ? C.border : "transparent",
                      border: `1px solid ${taken ? C.border : C.border}`,
                      borderRadius: 8, cursor: taken ? "not-allowed" : "pointer",
                      color: taken ? C.textLow : C.text, textAlign: "left",
                      opacity: taken ? 0.5 : 1,
                    }}>
                    <div style={{
                      fontSize: 13, fontWeight: 900, color: m.premium ? C.red : C.cream,
                      letterSpacing: "0.05em",
                    }}>{m.key}</div>
                    <div style={{ fontSize: 11, color: C.textMid }}>
                      Consumible {Math.round(m.consumible * 100)}%
                      {m.transporte && <span style={{ color: C.gold, marginLeft: 8 }}>· 🚤 Transporte</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: taken ? C.textLow : C.cream }}>
                      {taken ? "RESERVADA" : COP(m.precio)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Beneficios */}
      <div style={{
        background: C.card, border: `1px solid ${C.gold}33`, borderRadius: 12, padding: 16, marginTop: 14,
      }}>
        <div style={{ fontSize: 11, color: C.gold, letterSpacing: "0.15em", fontWeight: 800, marginBottom: 10 }}>
          MESAS DJ BOOTH & BACKSTAGE INCLUYEN
        </div>
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

function MesaSlot({ k, reservadas, onSelect, size = "md" }) {
  const m = MESAS.find(x => x.key === k);
  if (!m) return <div style={{ height: 38 }} />;
  const taken = reservadas.has(k);
  const color = m.premium ? C.red : C.gold;
  return (
    <button onClick={() => onSelect(m)} disabled={taken}
      style={{
        background: taken ? C.border : C.bgSoft, border: `1px solid ${taken ? C.border : color + "55"}`,
        borderRadius: 6, padding: size === "lg" ? "10px 12px" : "8px 6px",
        color: taken ? C.textLow : color, fontWeight: 900,
        fontSize: size === "lg" ? 14 : 11, letterSpacing: "0.05em",
        cursor: taken ? "not-allowed" : "pointer",
        minWidth: size === "lg" ? 44 : 32, textAlign: "center",
        opacity: taken ? 0.5 : 1,
      }}>{k}</button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// TRANSPORTE
// ──────────────────────────────────────────────────────────────────────
function Transporte() {
  return (
    <div style={{
      marginTop: 40,
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22,
    }}>
      <div style={{ fontSize: 11, color: C.cream, letterSpacing: "0.2em", fontWeight: 800, marginBottom: 14 }}>
        🚤 TRANSPORTE
      </div>
      <div style={{ display: "grid", gap: 10, fontSize: 13, color: C.textMid, lineHeight: 1.6 }}>
        <div><strong style={{ color: C.text }}>Salida:</strong> Lanchas rápidas desde Muelle de la Bodeguita · Trayecto 15 min</div>
        <div><strong style={{ color: C.text }}>Ida:</strong> Desde 1:30 PM, cada 30 minutos</div>
        <div><strong style={{ color: C.text }}>Regreso:</strong> Desde 9:00 PM hasta 2:00 AM, cada 30 minutos</div>
        <div style={{ color: C.red, marginTop: 4 }}>
          ⚠ <strong>Impuesto de Muelle NO incluido</strong> — se paga directamente en la taquilla de la Bodeguita
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// FOOTER
// ──────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <div style={{
      marginTop: 50, paddingTop: 28, borderTop: `1px solid ${C.border}`,
      textAlign: "center", color: C.textLow,
    }}>
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: C.cream, letterSpacing: "0.1em",
      }}>ATOLÓN BEACH CLUB</div>
      <div style={{ fontSize: 10, letterSpacing: "0.25em", marginTop: 4 }}>TIERRA BOMBA · CARTAGENA</div>
      <div style={{ fontSize: 10, marginTop: 16 }}>juicyandcream.com · powered by 3 NOMADS X & 574 STUDIO</div>
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
  const [exitoLink, setExitoLink] = useState("");

  const totalBase = item.precio * (item.kind === "ticket" ? cantidad : 1);
  const consumibleMonto = item.consumible ? totalBase * item.consumible : 0;
  const totalFinal = totalBase; // el consumible está incluido (no se suma)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const confirmar = async () => {
    if (!form.nombre.trim() || !form.telefono.trim()) {
      alert("Nombre y teléfono son requeridos");
      return;
    }
    setBusy(true);
    const id = `JC-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const payload = {
      id,
      tipo: item.kind,
      categoria: item.categoria,
      cantidad: item.kind === "ticket" ? Number(cantidad) : 1,
      precio_unitario: item.precio,
      total: totalFinal,
      consumible_pct: item.consumible ? item.consumible * 100 : 0,
      nombre: form.nombre.trim(),
      email: form.email.trim() || null,
      telefono: form.telefono.trim(),
      cedula: form.cedula.trim() || null,
      estado: "pendiente_pago",
    };
    const { error } = await supabase.from("juicy_cream_reservas").insert(payload);
    setBusy(false);
    if (error) {
      if (error.code === "23505") {
        alert("Esta mesa ya fue reservada por otra persona — refresca la página y elige otra.");
        onClose();
      } else {
        alert("Error: " + error.message);
      }
      return;
    }

    // Generar mensaje WhatsApp con resumen
    const msg = `*JUICY & CREAM · Nueva reserva*\n\nID: ${id}\n${item.kind === "ticket" ? "Ticket" : "Mesa"}: ${item.label}\n${item.kind === "ticket" ? `Cantidad: ${cantidad}\n` : ""}Total: ${COP(totalFinal)}${item.consumible ? `\n(Consumible ${Math.round(item.consumible*100)}%: ${COP(consumibleMonto)})` : ""}\n\nCliente: ${form.nombre}\nTel: ${form.telefono}${form.email ? `\nEmail: ${form.email}` : ""}${form.cedula ? `\nCC: ${form.cedula}` : ""}\n\nNecesito link de pago para confirmar mi reserva.`;
    const link = `https://wa.me/${WA_PHONE}?text=${encodeURIComponent(msg)}`;
    setExitoLink(link);
    onConfirmar();
  };

  if (exitoLink) {
    return (
      <Overlay onClose={onClose}>
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontSize: 56 }}>✅</div>
          <h3 style={{ fontSize: 22, fontWeight: 800, margin: "12px 0 8px" }}>Reserva creada</h3>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 24, lineHeight: 1.5 }}>
            Tu reserva está <strong>guardada y bloqueada</strong>. Confirma con el equipo por WhatsApp para recibir el link de pago.
          </div>
          <a href={exitoLink} target="_blank" rel="noreferrer" style={{
            display: "block", padding: "16px 22px",
            background: "#25D366", color: "#000", textDecoration: "none",
            borderRadius: 10, fontWeight: 900, fontSize: 14, letterSpacing: "0.05em",
          }}>💬 ABRIR WHATSAPP PARA PAGAR</a>
          <button onClick={onClose} style={{
            marginTop: 14, padding: "10px 20px", background: "none",
            border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMid,
            fontSize: 12, cursor: "pointer",
          }}>Cerrar</button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <h3 style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px", color: item.color }}>{item.label}</h3>
      <div style={{ fontSize: 11, color: C.textLow, marginBottom: 18 }}>JUICY & CREAM · 07 JUN 2026</div>

      {item.kind === "ticket" && (
        <div style={{ marginBottom: 14 }}>
          <Label>Cantidad</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setCantidad(c => Math.max(1, c - 1))} style={qBtn}>−</button>
            <span style={{ fontSize: 22, fontWeight: 900, minWidth: 36, textAlign: "center" }}>{cantidad}</span>
            <button onClick={() => setCantidad(c => Math.min(10, c + 1))} style={qBtn}>+</button>
            <div style={{ marginLeft: "auto", fontSize: 13, color: C.textMid }}>
              {COP(item.precio)} c/u
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        <Field label="Nombre completo *" value={form.nombre} onChange={v => setF("nombre", v)} />
        <Field label="Teléfono *" value={form.telefono} onChange={v => setF("telefono", v)} type="tel" placeholder="+57 300 000 0000" />
        <Field label="Email" value={form.email} onChange={v => setF("email", v)} type="email" />
        <Field label="Cédula" value={form.cedula} onChange={v => setF("cedula", v)} />
      </div>

      <div style={{
        background: C.bgSoft, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: item.consumible ? 6 : 0 }}>
          <span style={{ color: C.textMid }}>{item.kind === "ticket" ? `${cantidad} ticket${cantidad > 1 ? "s" : ""}` : "Mesa"}</span>
          <span style={{ fontWeight: 700 }}>{COP(totalBase)}</span>
        </div>
        {item.consumible && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.gold, marginBottom: 8 }}>
            <span>Incluye consumible {Math.round(item.consumible*100)}%</span>
            <span>({COP(consumibleMonto)})</span>
          </div>
        )}
        <div style={{
          display: "flex", justifyContent: "space-between", paddingTop: 10,
          borderTop: `1px solid ${C.border}`, fontWeight: 900, fontSize: 18, color: item.color,
        }}>
          <span>TOTAL</span>
          <span>{COP(totalFinal)}</span>
        </div>
      </div>

      <button onClick={confirmar} disabled={busy} style={{
        width: "100%", padding: "16px 22px",
        background: busy ? C.border : item.color, color: "#000",
        border: "none", borderRadius: 10, fontWeight: 900, fontSize: 14,
        letterSpacing: "0.05em", cursor: busy ? "wait" : "pointer",
      }}>
        {busy ? "Procesando…" : "CONFIRMAR RESERVA →"}
      </button>
      <div style={{ fontSize: 10, color: C.textLow, marginTop: 10, textAlign: "center" }}>
        Al confirmar, tu reserva queda bloqueada y recibirás el link de pago por WhatsApp.
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
      <h2 style={{
        fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, margin: 0,
        letterSpacing: "0.05em", color: C.cream,
      }}>{title}</h2>
      {sub && <div style={{ fontSize: 12, color: C.textMid, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, padding: 16, overflowY: "auto",
      }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 24, width: "100%", maxWidth: 460, position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 12,
          background: "none", border: "none", color: C.textMid,
          fontSize: 24, cursor: "pointer", lineHeight: 1, padding: 4,
        }}>×</button>
        {children}
      </div>
    </div>
  );
}

const Label = ({ children }) => (
  <div style={{ fontSize: 10, color: C.textLow, letterSpacing: "0.15em",
    fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>{children}</div>
);

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <Label>{label}</Label>
      <input value={value} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder}
        style={{
          width: "100%", padding: "11px 14px",
          background: C.bgSoft, border: `1px solid ${C.border}`, borderRadius: 8,
          color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box",
        }} />
    </div>
  );
}

const qBtn = {
  width: 36, height: 36, borderRadius: 8,
  background: C.bgSoft, border: `1px solid ${C.border}`, color: C.text,
  fontSize: 18, fontWeight: 900, cursor: "pointer",
};
