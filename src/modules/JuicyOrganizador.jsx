// Portal del organizador del evento JUICY & CREAM (3 NOMADS X / 574 STUDIO).
// Acceso con clave "Juice" — vista de solo lectura del estado de ventas:
//   • KPIs: tickets vendidos, mesas reservadas, pax total, revenue
//   • Detalle por tipo (tickets/mesas) y por zona
//   • Lista completa de reservas con cliente, monto y estado
// Datos: juicy_cream_reservas (mismo backend del booking engine público /juicy).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const COP = n => `$${Math.round(Number(n) || 0).toLocaleString("es-CO")}`;
const CLAVE = "Juice";
const STORAGE_KEY = "juicy_organizador_auth_v1";

// Pax por mesa (mismo modelo que JuicyCream.jsx)
const MESA_PAX = {
  A1: 12, A2: 12, "1A": 12, "1B": 12, "2A": 12, "2B": 12, "3A": 12, "3B": 12, "4A": 12, "4B": 12,
  "1C": 10, "2C": 10, "3C": 10, "4C": 10, "5C": 10, "6C": 10, "7C": 10, "8C": 10,
};
const MESA_ZONA = {
  A1: "DJ BOOTH", A2: "DJ BOOTH",
  "1A": "BACKSTAGE", "1B": "BACKSTAGE", "2A": "BACKSTAGE", "2B": "BACKSTAGE",
  "3A": "BACKSTAGE", "3B": "BACKSTAGE", "4A": "BACKSTAGE", "4B": "BACKSTAGE",
  "1C": "VIP BEACH", "2C": "VIP BEACH", "3C": "VIP BEACH", "4C": "VIP BEACH",
  "5C": "VIP BEACH", "6C": "VIP BEACH", "7C": "VIP BEACH", "8C": "VIP BEACH",
};

const C = {
  bg: "#FAFAF8", bgCard: "#FFFFFF",
  text: "#0A0A0A", textMid: "#404040", textLow: "#888888",
  border: "#E5E5E5", borderMid: "#CCCCCC",
  red: "#E11D2A", redDark: "#9B1018",
  green: "#16A34A",
  amber: "#F59E0B",
  cream: "#F4EBD8",
};

export default function JuicyOrganizador() {
  const [autenticado, setAutenticado] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Inter:wght@400;500;600;700;800;900&display=swap');
      `}</style>
      {autenticado ? <Dashboard onLogout={() => { sessionStorage.removeItem(STORAGE_KEY); setAutenticado(false); }} />
                   : <LoginScreen onAuth={() => { sessionStorage.setItem(STORAGE_KEY, "1"); setAutenticado(true); }} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// LOGIN
// ──────────────────────────────────────────────────────────────────────
function LoginScreen({ onAuth }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");

  const intentar = () => {
    if (clave.trim() === CLAVE) {
      setError("");
      onAuth();
    } else {
      setError("Clave incorrecta");
      setClave("");
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", border: `2px solid ${C.text}`, borderRadius: 8,
        padding: "36px 32px", maxWidth: 380, width: "100%", textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Anton', Impact, sans-serif",
          fontSize: 36, color: C.red, letterSpacing: "0.04em", lineHeight: 1,
        }}>
          JUICY <span style={{ color: C.text, opacity: 0.6 }}>&amp;</span> CREAM
        </div>
        <div style={{ fontSize: 11, letterSpacing: "0.25em", color: C.textMid, fontWeight: 700, marginTop: 6 }}>
          PORTAL DEL ORGANIZADOR
        </div>
        <div style={{ width: 50, height: 2, background: C.red, margin: "20px auto" }} />

        <input
          type="password" value={clave} autoFocus
          onChange={e => { setClave(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && intentar()}
          placeholder="Clave de acceso"
          style={{
            width: "100%", padding: "13px 14px", fontSize: 16, textAlign: "center",
            border: `2px solid ${error ? C.red : C.borderMid}`, borderRadius: 6,
            outline: "none", boxSizing: "border-box", letterSpacing: "0.15em",
            fontFamily: "inherit",
          }}
        />
        {error && (
          <div style={{ fontSize: 12, color: C.red, marginTop: 8, fontWeight: 600 }}>
            {error}
          </div>
        )}

        <button onClick={intentar} style={{
          marginTop: 16, width: "100%", padding: "14px 24px",
          background: C.red, color: "#fff", border: "none", borderRadius: 6,
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: "0.12em", fontWeight: 700,
          cursor: "pointer",
        }}>
          ENTRAR
        </button>

        <div style={{ fontSize: 10, color: C.textLow, marginTop: 18, letterSpacing: "0.15em" }}>
          ATOLON BEACH CLUB · CARTAGENA
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// DASHBOARD
// ──────────────────────────────────────────────────────────────────────
function Dashboard({ onLogout }) {
  const [loading, setLoading] = useState(true);
  const [reservas, setReservas] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("activas");  // todas | activas | confirmadas | pendientes
  const [filtroTipo, setFiltroTipo] = useState("todos");        // todos | ticket | mesa
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    supabase.from("juicy_cream_reservas")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("[juicy-organizador] fetch error:", error);
        setReservas(data || []);
        setLoading(false);
      });
  }, [refresh]);

  // ── Métricas globales (excluyendo canceladas) ──
  const stats = useMemo(() => {
    const activas = reservas.filter(r => r.estado !== "cancelado");
    const tickets = activas.filter(r => r.tipo === "ticket");
    const mesas   = activas.filter(r => r.tipo === "mesa");

    const ticketsCantidad = tickets.reduce((s, r) => s + (r.cantidad || 1), 0);
    const ticketsRevenue  = tickets.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const ticketsConf     = tickets.filter(r => r.estado === "confirmado").reduce((s, r) => s + (Number(r.total) || 0), 0);

    const mesasCount      = mesas.length;
    const mesasRevenue    = mesas.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const mesasConf       = mesas.filter(r => r.estado === "confirmado").reduce((s, r) => s + (Number(r.total) || 0), 0);
    const mesasPax        = mesas.reduce((s, r) => s + (MESA_PAX[r.categoria] || 0), 0);

    const paxTotal = ticketsCantidad + mesasPax;
    const revenueBruto = ticketsRevenue + mesasRevenue;
    const revenueConfirmado = ticketsConf + mesasConf;

    // Tickets por categoría
    const ticketsPorCat = {};
    tickets.forEach(r => {
      if (!ticketsPorCat[r.categoria]) ticketsPorCat[r.categoria] = { count: 0, revenue: 0 };
      ticketsPorCat[r.categoria].count += r.cantidad || 1;
      ticketsPorCat[r.categoria].revenue += Number(r.total) || 0;
    });
    // Mesas por zona
    const mesasPorZona = {};
    mesas.forEach(r => {
      const zona = MESA_ZONA[r.categoria] || "OTRA";
      if (!mesasPorZona[zona]) mesasPorZona[zona] = { mesas: [], revenue: 0, pax: 0 };
      mesasPorZona[zona].mesas.push(r.categoria);
      mesasPorZona[zona].revenue += Number(r.total) || 0;
      mesasPorZona[zona].pax += MESA_PAX[r.categoria] || 0;
    });

    return {
      total: activas.length,
      ticketsCantidad, ticketsRevenue, ticketsConf,
      mesasCount, mesasRevenue, mesasConf, mesasPax,
      paxTotal, revenueBruto, revenueConfirmado,
      ticketsPorCat, mesasPorZona,
    };
  }, [reservas]);

  // ── Lista filtrada ──
  const lista = useMemo(() => {
    return reservas.filter(r => {
      if (filtroEstado === "activas" && r.estado === "cancelado") return false;
      if (filtroEstado === "confirmadas" && r.estado !== "confirmado") return false;
      if (filtroEstado === "pendientes" && r.estado !== "pendiente_pago") return false;
      if (filtroTipo !== "todos" && r.tipo !== filtroTipo) return false;
      return true;
    });
  }, [reservas, filtroEstado, filtroTipo]);

  return (
    <div>
      {/* Header */}
      <div style={{
        background: "#fff", borderBottom: `1px solid ${C.border}`,
        padding: "18px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: "0.05em" }}>
            JUICY <span style={{ color: C.red }}>&amp;</span> CREAM · Organizador
          </div>
          <div style={{ fontSize: 11, color: C.textMid, letterSpacing: "0.18em", fontWeight: 600, marginTop: 2 }}>
            7 JUN 2026 · ATOLON BEACH CLUB
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setRefresh(r => r + 1)} style={{
            padding: "8px 16px", background: "#fff", border: `1.5px solid ${C.borderMid}`,
            borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600,
          }}>↻ Refrescar</button>
          <button onClick={onLogout} style={{
            padding: "8px 16px", background: "#fff", border: `1.5px solid ${C.borderMid}`,
            borderRadius: 6, fontSize: 12, cursor: "pointer", color: C.textMid,
          }}>Salir</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: C.textMid }}>Cargando...</div>
      ) : (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 60px" }}>

          {/* KPIs principales */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12, marginBottom: 22,
          }}>
            <Kpi label="REVENUE TOTAL" valor={COP(stats.revenueBruto)} accent />
            <Kpi label="CONFIRMADO" valor={COP(stats.revenueConfirmado)} color={C.green} />
            <Kpi label="PENDIENTE PAGO" valor={COP(stats.revenueBruto - stats.revenueConfirmado)} color={C.amber} />
            <Kpi label="PAX TOTAL" valor={stats.paxTotal} />
            <Kpi label="RESERVAS" valor={stats.total} />
          </div>

          {/* Bloque Tickets */}
          <SectionTitulo titulo="🎟 BOLETERÍA" />
          <div style={{
            background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 8,
            padding: 18, marginBottom: 22,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
              <Mini label="Tickets vendidos" valor={stats.ticketsCantidad} />
              <Mini label="Revenue tickets" valor={COP(stats.ticketsRevenue)} />
              <Mini label="Confirmados" valor={COP(stats.ticketsConf)} color={C.green} />
            </div>
            {Object.keys(stats.ticketsPorCat).length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 10, color: C.textMid, letterSpacing: "0.18em", fontWeight: 700, marginBottom: 8 }}>
                  POR CATEGORÍA
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {Object.entries(stats.ticketsPorCat).sort((a,b) => b[1].count - a[1].count).map(([cat, d]) => (
                    <div key={cat} style={{
                      display: "grid", gridTemplateColumns: "1fr auto auto", gap: 14,
                      padding: "8px 12px", background: C.bg, borderRadius: 4, fontSize: 13,
                    }}>
                      <div style={{ fontWeight: 600 }}>{labelCategoria(cat)}</div>
                      <div style={{ color: C.textMid }}>{d.count} ticket{d.count !== 1 ? "s" : ""}</div>
                      <div style={{ fontWeight: 700, color: C.red }}>{COP(d.revenue)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bloque Mesas */}
          <SectionTitulo titulo="🛋 MESAS / CAMAS" />
          <div style={{
            background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 8,
            padding: 18, marginBottom: 22,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
              <Mini label="Mesas reservadas" valor={stats.mesasCount} />
              <Mini label="Pax en mesas" valor={stats.mesasPax} />
              <Mini label="Revenue mesas" valor={COP(stats.mesasRevenue)} />
              <Mini label="Confirmadas" valor={COP(stats.mesasConf)} color={C.green} />
            </div>
            {Object.keys(stats.mesasPorZona).length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 10, color: C.textMid, letterSpacing: "0.18em", fontWeight: 700, marginBottom: 8 }}>
                  POR ZONA
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {Object.entries(stats.mesasPorZona).map(([zona, d]) => (
                    <div key={zona} style={{
                      display: "grid", gridTemplateColumns: "1fr 2fr auto auto", gap: 14,
                      padding: "8px 12px", background: C.bg, borderRadius: 4, fontSize: 13,
                    }}>
                      <div style={{ fontWeight: 700, color: C.red, fontFamily: "'Anton', sans-serif", letterSpacing: "0.06em" }}>{zona}</div>
                      <div style={{ color: C.textMid, fontSize: 11, alignSelf: "center" }}>{d.mesas.sort().join(", ")}</div>
                      <div style={{ color: C.textMid }}>{d.pax} pax</div>
                      <div style={{ fontWeight: 700 }}>{COP(d.revenue)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Lista de reservas */}
          <SectionTitulo titulo={`📋 RESERVAS (${lista.length})`} />
          <div style={{
            background: "#fff", border: `1.5px solid ${C.borderMid}`, borderRadius: 8,
            padding: 14,
          }}>
            {/* Filtros */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <FiltroChips label="Estado" value={filtroEstado} onChange={setFiltroEstado} options={[
                { val: "activas", label: "Activas" },
                { val: "confirmadas", label: "Confirmadas" },
                { val: "pendientes", label: "Pendientes" },
                { val: "todas", label: "Todas (incl. canceladas)" },
              ]} />
              <FiltroChips label="Tipo" value={filtroTipo} onChange={setFiltroTipo} options={[
                { val: "todos", label: "Todos" },
                { val: "ticket", label: "Tickets" },
                { val: "mesa", label: "Mesas" },
              ]} />
            </div>

            {lista.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.textLow }}>
                Sin reservas que coincidan con los filtros.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      <th style={th}>Fecha</th>
                      <th style={th}>Tipo</th>
                      <th style={th}>Detalle</th>
                      <th style={th}>Cliente</th>
                      <th style={th}>Teléfono</th>
                      <th style={{ ...th, textAlign: "right" }}>Total</th>
                      <th style={th}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(r => (
                      <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={td}>{fmtFecha(r.created_at)}</td>
                        <td style={td}>{r.tipo === "ticket" ? "🎟" : "🛋"}</td>
                        <td style={td}>
                          {r.tipo === "ticket"
                            ? `${labelCategoria(r.categoria)} × ${r.cantidad}`
                            : `${MESA_ZONA[r.categoria] || ""} · ${r.categoria} (${MESA_PAX[r.categoria]} pax)`}
                        </td>
                        <td style={td}>{r.nombre}</td>
                        <td style={td}>{r.telefono}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(r.total)}</td>
                        <td style={td}>
                          <EstadoBadge estado={r.estado} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// HELPERS UI
// ──────────────────────────────────────────────────────────────────────
function Kpi({ label, valor, color, accent }) {
  return (
    <div style={{
      background: accent ? C.red : "#fff",
      color: accent ? "#fff" : C.text,
      border: `1.5px solid ${accent ? C.red : C.borderMid}`,
      borderRadius: 8, padding: "14px 18px",
    }}>
      <div style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      <div style={{
        fontFamily: "'Anton', sans-serif", fontSize: 26, lineHeight: 1,
        color: color || (accent ? "#fff" : C.text),
      }}>{valor}</div>
    </div>
  );
}
function Mini({ label, valor, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.textMid, letterSpacing: "0.15em", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 20, color: color || C.text }}>{valor}</div>
    </div>
  );
}
function SectionTitulo({ titulo }) {
  return (
    <div style={{
      fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: "0.08em",
      color: C.text, marginBottom: 10,
    }}>{titulo}</div>
  );
}
function FiltroChips({ label, value, onChange, options }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.textMid, letterSpacing: "0.15em", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map(o => (
          <button key={o.val} onClick={() => onChange(o.val)} style={{
            padding: "5px 11px", fontSize: 11, fontWeight: 600,
            background: value === o.val ? C.text : "#fff",
            color: value === o.val ? "#fff" : C.text,
            border: `1.5px solid ${value === o.val ? C.text : C.borderMid}`,
            borderRadius: 20, cursor: "pointer",
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}
function EstadoBadge({ estado }) {
  const map = {
    confirmado:     { bg: C.green + "22", color: C.green,  label: "Confirmado" },
    pendiente_pago: { bg: C.amber + "22", color: "#92400E", label: "Pendiente" },
    cancelado:      { bg: "#FECACA",      color: "#B91C1C", label: "Cancelado" },
    reembolsado:    { bg: "#E0E7FF",      color: "#3730A3", label: "Reembolsado" },
  };
  const cfg = map[estado] || { bg: C.bg, color: C.textMid, label: estado };
  return (
    <span style={{
      padding: "3px 9px", fontSize: 10, fontWeight: 700,
      background: cfg.bg, color: cfg.color, borderRadius: 12,
      letterSpacing: "0.04em",
    }}>{cfg.label}</span>
  );
}

const th = { padding: "10px 8px", textAlign: "left", fontSize: 10, color: C.textMid, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" };
const td = { padding: "10px 8px", color: C.text, verticalAlign: "middle" };

function fmtFecha(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) +
           " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso || "—"; }
}
function labelCategoria(c) {
  const map = {
    VIP_EARLY: "VIP · Hasta 4 PM",
    VIP_ANYTIME: "VIP · Anytime",
    BACKSTAGE: "Backstage",
    ETAPA_1: "Etapa 1",
    ETAPA_2: "Etapa 2",
    ETAPA_3: "Etapa 3",
    DOOR: "Door",
  };
  return map[c] || c;
}
