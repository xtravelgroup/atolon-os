import { useState, useEffect, useCallback, useRef } from "react";
import { useMobile } from "../lib/useMobile";
import { B, COP, todayDisplay, todayStr } from "../brand";
import { supabase } from "../lib/supabase";

async function logout() {
  await supabase.auth.signOut();
  window.location.reload();
}

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "\u2302" },
  { key: "pasadias", label: "Pasadias", icon: "\u2600" },
  { key: "reservas", label: "Reservas", icon: "\u2693" },
  { key: "checkin",  label: "Check-in", icon: "✅" },
  { key: "muelle",   label: "Llegadas",  icon: "⚓" },
  { key: "floorplan", label: "Floor Plan", icon: "\u25A6" },
  { key: "comercial", label: "Comercial", icon: "\u2605" },
  { key: "b2b", label: "B2B", icon: "\u2637" },
  { key: "eventos", label: "Eventos", icon: "\u266B" },
  { key: "contratos", label: "Contratos", icon: "\u2709" },
  { key: "financiero", label: "Financiero", icon: "\u2261" },
  { key: "analitica",  label: "Analítica",  icon: "📊" },
  { key: "presupuesto", label: "Presupuesto", icon: "\u25CB" },
  { key: "activos", label: "Activos", icon: "\u2692" },
  { key: "requisiciones", label: "Requisiciones", icon: "\u2706" },
  { key: "contenido",     label: "Contenido",     icon: "📢" },
  { key: "upsells",       label: "Upsells",       icon: "⬆" },
  { key: "menus",         label: "Menús",         icon: "🍽️" },
  { key: "configuracion", label: "Configuración", icon: "⚙" },
  { key: "usuarios",      label: "Usuarios",      icon: "👥" },
  { key: "vip",          label: "Society",       icon: "✦" },
];

// KPIs are now loaded from Supabase in the Dashboard component

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: B.navyMid, borderRadius: 12, padding: "20px 24px", flex: "1 1 220px",
      borderLeft: `4px solid ${color}`, minWidth: 200,
    }}>
      <div style={{ fontSize: 13, color: B.sand, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 32, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Dashboard() {
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const load = async () => {
      const hoy = todayStr();
      // tomorrow in Colombia timezone
      const manana = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
      manana.setDate(manana.getDate() + 1);
      const mananaStr = manana.toLocaleDateString("en-CA");

      // Ventas creadas HOY (created_at en zona Colombia)
      const inicioHoy = hoy + "T00:00:00-05:00";
      const finHoy    = hoy + "T23:59:59-05:00";

      const [ventasHoyR, paxHoyR, paxMananaR, leadsHoyR, evtR, reqR] = await Promise.all([
        // Pasadías vendidos y revenue: filtrar por cuándo se CREÓ la reserva
        supabase.from("reservas").select("total")
          .eq("estado", "confirmado")
          .gte("created_at", inicioHoy)
          .lte("created_at", finHoy),
        // Pax hoy: pasajeros cuyo viaje es HOY (solo confirmados)
        supabase.from("reservas").select("pax").eq("fecha", hoy).eq("estado", "confirmado"),
        // Pax mañana: pasajeros cuyo viaje es MAÑANA (solo confirmados)
        supabase.from("reservas").select("pax").eq("fecha", mananaStr).eq("estado", "confirmado"),
        // Leads creados hoy aún activos
        supabase.from("leads").select("id")
          .not("stage", "in", '("Cerrado Ganado","Perdido")')
          .gte("created_at", inicioHoy)
          .lte("created_at", finHoy),
        supabase.from("eventos").select("id").in("stage", ["Consulta", "Cotizado", "Confirmado"]),
        supabase.from("requisiciones").select("id").eq("estado", "Pendiente"),
      ]);

      const ventasHoy = ventasHoyR.data || [];
      setKpis({
        pasadiasVendidos: ventasHoy.length,
        revenue: ventasHoy.reduce((s, r) => s + (r.total || 0), 0),
        leadsHoy: (leadsHoyR.data || []).length,
        paxHoy: (paxHoyR.data || []).reduce((s, r) => s + (r.pax || 0), 0),
        paxManana: (paxMananaR.data || []).reduce((s, r) => s + (r.pax || 0), 0),
        eventos: (evtR.data || []).length,
        reqPendientes: (reqR.data || []).length,
      });
      setLoading(false);
    };
    load();
  }, []);

  const v = (k) => loading ? "..." : (typeof kpis[k] === "number" ? kpis[k] : "—");

  return (
    <div>
      {/* Fila 1: Ventas de hoy */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard
          label="Pasadías Vendidos Hoy"
          value={loading ? "..." : String(kpis.pasadiasVendidos ?? 0)}
          sub="reservas confirmadas hoy"
          color={B.sky}
        />
        <KpiCard
          label="Revenue Hoy"
          value={loading ? "..." : COP(kpis.revenue || 0)}
          sub="total en ventas del día"
          color={B.success}
        />
        <KpiCard
          label="Leads Activos Hoy"
          value={loading ? "..." : String(kpis.leadsHoy ?? 0)}
          sub="leads nuevos activos hoy"
          color={B.pink}
        />
      </div>
      {/* Fila 2: Pax */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <KpiCard
          label="Pax Hoy"
          value={loading ? "..." : String(kpis.paxHoy ?? 0)}
          sub={`pasajeros · ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "short" })}`}
          color={B.sand}
        />
        <KpiCard
          label="Pax Mañana"
          value={loading ? "..." : String(kpis.paxManana ?? 0)}
          sub="pasajeros confirmados mañana"
          color={B.navyLight}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
          <h3 style={{ color: B.sand, marginBottom: 16, fontSize: 18 }}>Estado del Sistema</h3>
          {[
            { label: "Reservas", color: B.sky },
            { label: "Leads", color: B.pink },
            { label: "Eventos", color: B.sand },
            { label: "Requisiciones", color: B.warning },
            { label: "Activos", color: B.success },
          ].map(s => (
            <div key={s.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 0", borderBottom: `1px solid ${B.navyLight}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />
                <span style={{ fontSize: 14 }}>{s.label}</span>
              </div>
              {supabase ? (
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: B.success + "22", color: B.success }}>Conectado</span>
              ) : (
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: B.navyLight, color: "rgba(255,255,255,0.4)" }}>Sin conexion</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
          <h3 style={{ color: B.sand, marginBottom: 16, fontSize: 18 }}>Resumen Rápido</h3>
          <div style={{ fontSize: 13, lineHeight: 2.4, color: "rgba(255,255,255,0.7)" }}>
            <div>Requisiciones pendientes: <strong style={{ color: B.warning }}>{kpis.reqPendientes ?? 0}</strong></div>
            <div>Eventos activos: <strong style={{ color: B.sand }}>{kpis.eventos ?? 0}</strong></div>
            <div>Revenue hoy: <strong style={{ color: B.success }}>{loading ? "..." : COP(kpis.revenue || 0)}</strong></div>
            <div style={{ marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
              Datos en tiempo real desde Supabase · Zona horaria Colombia
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MayaChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { from: "maya", text: "Hola! Soy Maya, tu asistente de Atolon. Puedo ayudarte con reservas, reportes, clientes y mas. Que necesitas?" },
  ]);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    setMsgs(p => [...p, { from: "user", text: input }, { from: "maya", text: "Entendido. Pronto podré ayudarte con eso." }]);
    setInput("");
  };

  if (!open) {
    return (
      <div onClick={() => setOpen(true)} style={{
        position: "fixed", bottom: 24, right: 24, width: 56, height: 56,
        borderRadius: 28, background: `linear-gradient(135deg, ${B.pink}, ${B.sand})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", zIndex: 1000,
        fontSize: 24, fontWeight: 700, color: B.navy,
      }}>
        M
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, width: 380, height: 500,
      background: B.navyMid, borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      display: "flex", flexDirection: "column", zIndex: 1000, overflow: "hidden",
    }}>
      <div style={{
        padding: "16px 20px", background: `linear-gradient(135deg, ${B.pink}, ${B.sand})`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontWeight: 700, color: B.navy, fontSize: 16 }}>Maya IA</div>
          <div style={{ fontSize: 11, color: B.navy, opacity: 0.7 }}>Asistente Atolon Beach Club</div>
        </div>
        <div onClick={() => setOpen(false)} style={{ cursor: "pointer", fontSize: 20, color: B.navy, fontWeight: 700 }}>x</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.from === "user" ? "flex-end" : "flex-start",
            background: m.from === "user" ? B.navyLight : "rgba(200,185,154,0.15)",
            padding: "10px 14px", borderRadius: 12, maxWidth: "80%", fontSize: 13, lineHeight: 1.5,
          }}>
            {m.text}
          </div>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${B.navyLight}`, display: "flex", gap: 8 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Escribe a Maya..."
          style={{
            flex: 1, background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8,
            padding: "10px 14px", color: B.white, fontSize: 13, outline: "none",
          }}
        />
        <button onClick={send} style={{
          background: B.sand, border: "none", borderRadius: 8, padding: "0 16px",
          color: B.navy, fontWeight: 700, cursor: "pointer",
        }}>Enviar</button>
      </div>
    </div>
  );
}

export default function AtolanOS({ activeModule = "dashboard", onNavigate, moduleContent, userEmail }) {
  const isMobile = useMobile();
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const w = collapsed ? 64 : 220;

  const navigate = (key) => {
    onNavigate?.(key);
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 99,
        }} />
      )}

      {/* Sidebar */}
      <div style={{
        width: isMobile ? 240 : w,
        background: B.navyMid, transition: "transform 0.2s, width 0.2s", flexShrink: 0,
        display: "flex", flexDirection: "column", overflow: "hidden",
        ...(isMobile ? {
          position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 100,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        } : {}),
      }}>
        <div style={{
          padding: (collapsed && !isMobile) ? "20px 8px" : "24px 16px", borderBottom: `1px solid ${B.navyLight}`,
          display: "flex", justifyContent: "center", alignItems: "center", cursor: isMobile ? "default" : "pointer",
        }} onClick={() => !isMobile && setCollapsed(c => !c)}>
          {(collapsed && !isMobile)
            ? <img src="/favicon-blue.png" alt="Atolon" style={{ width: 48, height: 48, objectFit: "contain" }} />
            : <img src="/atolon-logo-white.png" alt="Atolon Beach Club" style={{ height: 72, objectFit: "contain" }} />
          }
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
          {NAV.map(n => {
            const active = activeModule === n.key;
            return (
              <div key={n.key} onClick={() => navigate(n.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: collapsed ? "10px 14px" : "10px 14px", borderRadius: 8,
                  cursor: "pointer", marginBottom: 2,
                  background: active ? B.navyLight : "transparent",
                  color: active ? B.white : "rgba(255,255,255,0.6)",
                  transition: "background 0.15s",
                }}>
                <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{n.icon}</span>
                {!collapsed && <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>{n.label}</span>}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 8px", borderTop: `1px solid ${B.navyLight}` }}>
          {!collapsed && userEmail && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", padding: "0 8px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userEmail}
            </div>
          )}
          <div onClick={logout}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              color: "rgba(255,255,255,0.4)", transition: "background 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#D6454522"; e.currentTarget.style.color = "#F87171"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>⎋</span>
            {!collapsed && <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>Cerrar sesión</span>}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* TopBar */}
        <div style={{
          height: 56, padding: isMobile ? "0 16px" : "0 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: `1px solid ${B.navyLight}`, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)} style={{
                background: "none", border: "none", color: B.white, fontSize: 22,
                cursor: "pointer", padding: "4px 6px", lineHeight: 1,
              }}>☰</button>
            )}
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 17 : 20, fontWeight: 600 }}>
              {NAV.find(n => n.key === activeModule)?.label || "Dashboard"}
            </span>
            {!isMobile && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{todayDisplay()}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16, background: B.navyLight,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, cursor: "pointer",
            }}>JD</div>
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px 12px" : 28 }}>
          {moduleContent || <Dashboard />}
        </div>
      </div>

      <MayaChat />
    </div>
  );
}
