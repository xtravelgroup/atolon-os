import { useState, useEffect, useCallback, useRef } from "react";
import { useMobile } from "../lib/useMobile";
import { B, COP, todayDisplay, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { GRUPOS_NAV, BOTTOM_NAV } from "../lib/modulosCatalogo";

async function logout() {
  await supabase.auth.signOut();
  window.location.reload();
}

// Dashboard siempre visible, fuera de grupos
const NAV_TOP = [
  { key: "dashboard", label: "Dashboard", icon: "⌂" },
];

// Grupos y bottom vienen del catálogo central — agregar módulos en modulosCatalogo.js
const NAV_GROUPS = GRUPOS_NAV;
const NAV_BOTTOM = BOTTOM_NAV;

// Flat lookup for topbar title
const ALL_ITEMS = [
  ...NAV_TOP,
  ...NAV_GROUPS.flatMap(g => g.items),
  ...NAV_BOTTOM,
];
const MODULE_KEY_MAP = {};

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

      // grupoPaxTotal: excluye Impuesto Muelle y STAFF de la suma de pax visible
      const grupoPax = (g) => (g.pasadias_org || []).filter(p => p.tipo !== "Impuesto Muelle" && p.tipo !== "STAFF").reduce((s, p) => s + (Number(p.personas) || 0), 0) || (g.pax || 0);

      const [ventasHoyR, paxHoyR, paxMananaR, leadsHoyR, evtR, reqR, cobR, cobR2, grpHoyR, grpMananaR, llegHoyR, llegMananaR] = await Promise.all([
        // Pasadías vendidos hoy: filtrar por cuándo se CREÓ la reserva
        supabase.from("reservas").select("total")
          .eq("estado", "confirmado")
          .gte("created_at", inicioHoy)
          .lte("created_at", finHoy),
        // Pax hoy: confirmados + check_in + pipeline comercial
        supabase.from("reservas").select("pax").eq("fecha", hoy).in("estado", ["confirmado", "check_in", "pendiente", "pendiente_pago", "pendiente_comprobante"]),
        // Pax mañana: confirmados + check_in + pipeline comercial
        supabase.from("reservas").select("pax").eq("fecha", mananaStr).in("estado", ["confirmado", "check_in", "pendiente", "pendiente_pago", "pendiente_comprobante"]),
        // Leads creados hoy aún activos
        supabase.from("leads").select("id")
          .not("stage", "in", '("Cerrado Ganado","Perdido","Duplicado")')
          .gte("created_at", inicioHoy)
          .lte("created_at", finHoy),
        supabase.from("eventos").select("id").in("stage", ["Consulta", "Cotizado", "Confirmado"]),
        supabase.from("requisiciones").select("id").eq("estado", "Pendiente"),
        // Cobrado hoy: abono con fecha_pago = hoy (registrado manualmente)
        supabase.from("reservas").select("abono").eq("fecha_pago", hoy).neq("estado", "cancelado"),
        // Cobrado hoy: abono sin fecha_pago pero creado hoy (web/Wompi automático)
        supabase.from("reservas").select("abono").is("fecha_pago", null).gte("created_at", inicioHoy).lte("created_at", finHoy).gt("abono", 0).neq("estado", "cancelado"),
        // Grupos hoy y mañana
        supabase.from("eventos").select("id, pax, fecha, pasadias_org, categoria, aliado_id").eq("fecha", hoy).neq("stage", "Realizado"),
        supabase.from("eventos").select("id, pax, fecha, pasadias_org, categoria, aliado_id").eq("fecha", mananaStr).neq("stage", "Realizado"),
        // Llegadas muelle (After Island, Restaurante, Walk-in) — excluye lancha_atolon
        supabase.from("muelle_llegadas").select("pax_total").eq("fecha", hoy).neq("tipo", "lancha_atolon"),
        supabase.from("muelle_llegadas").select("pax_total").eq("fecha", mananaStr).neq("tipo", "lancha_atolon"),
      ]);

      const isGrupo = (e) => e.categoria === "grupo" || (!e.categoria && e.aliado_id);
      const paxGruposHoy    = (grpHoyR.data    || []).filter(isGrupo).reduce((s, g) => s + grupoPax(g), 0);
      const paxGruposManana = (grpMananaR.data  || []).filter(isGrupo).reduce((s, g) => s + grupoPax(g), 0);
      const paxLlegHoy      = (llegHoyR.data    || []).reduce((s, l) => s + (l.pax_total || 0), 0);
      const paxLlegManana   = (llegMananaR.data || []).reduce((s, l) => s + (l.pax_total || 0), 0);

      const ventasHoy = ventasHoyR.data || [];
      const cobradoHoy = [...(cobR.data || []), ...(cobR2.data || [])].reduce((s, r) => s + (r.abono || 0), 0);
      setKpis({
        pasadiasVendidos: ventasHoy.length,
        revenue: cobradoHoy,
        leadsHoy: (leadsHoyR.data || []).length,
        paxHoy:    (paxHoyR.data    || []).reduce((s, r) => s + (r.pax || 0), 0) + paxGruposHoy + paxLlegHoy,
        paxManana: (paxMananaR.data  || []).reduce((s, r) => s + (r.pax || 0), 0) + paxGruposManana + paxLlegManana,
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
      {/* Fila: Pax */}
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
          <h3 style={{ color: B.sand, marginBottom: 16, fontSize: 18 }}>Info del Sistema</h3>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
            Datos en tiempo real desde Supabase · Zona horaria Colombia
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
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPass1, setNewPass1] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [changingPass, setChangingPass] = useState(false);
  const [passError, setPassError] = useState("");
  const [passSuccess, setPassSuccess] = useState(false);

  const handleChangePassword = async () => {
    setPassError("");
    if (newPass1.length < 6) return setPassError("La contraseña debe tener al menos 6 caracteres");
    if (newPass1 !== newPass2) return setPassError("Las contraseñas no coinciden");
    setChangingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPass1 });
    setChangingPass(false);
    if (error) return setPassError(error.message);
    setPassSuccess(true);
    setNewPass1(""); setNewPass2("");
    setTimeout(() => { setShowChangePassword(false); setPassSuccess(false); }, 1500);
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userModulos, setUserModulos] = useState(null); // null = loading
  const [userName, setUserName] = useState("");
  const [theme, setTheme] = useState(() => typeof window !== "undefined" ? (localStorage.getItem("atolon_theme") || "dark") : "dark");
  const isLight = theme === "light";
  useEffect(() => { try { localStorage.setItem("atolon_theme", theme); } catch {} }, [theme]);

  // Paleta de shell según tema
  const T = isLight ? {
    sidebarBg:     "#F5F2EA",   // arena muy claro
    sidebarBorder: "#D8CFBA",
    topbarBg:      "#FFFFFF",
    topbarBorder:  "#E0E0E0",
    textMain:      "#000000",   // negro sólido para máximo contraste
    textMid:       "rgba(0,0,0,0.85)",
    textLight:     "rgba(0,0,0,0.55)",
    activeBg:      "rgba(13,27,62,0.12)",
    hoverBg:       "rgba(13,27,62,0.05)",
    logoSrc:       "/atolon-logo.png",
  } : {
    sidebarBg:     B.navyMid,
    sidebarBorder: B.navyLight,
    topbarBg:      B.navy,
    topbarBorder:  B.navyLight,
    textMain:      B.white,
    textMid:       "rgba(255,255,255,0.55)",
    textLight:     "rgba(255,255,255,0.25)",
    activeBg:      "rgba(255,255,255,0.1)",
    hoverBg:       "rgba(255,255,255,0.05)",
    logoSrc:       "/atolon-logo-white.png",
  };

  // Load current user's modulos + role from DB
  useEffect(() => {
    if (!userEmail || !supabase) { setUserModulos(null); return; }
    supabase.from("usuarios").select("modulos, rol_id, nombre, avatar_color").eq("email", userEmail).maybeSingle()
      .then(async ({ data }) => {
        if (data?.nombre) setUserName(data.nombre);
        const mods = data?.modulos;
        // If no modulos or empty → show all
        if (!Array.isArray(mods) || mods.length === 0) { setUserModulos(null); return; }
        // Heuristic: 20+ modules = effectively admin (full access)
        if (mods.length >= 20) { setUserModulos(null); return; }
        // Try roles table to confirm admin
        if (data?.rol_id) {
          try {
            const { data: rol } = await supabase.from("roles").select("permisos").eq("id", data.rol_id).maybeSingle();
            if (rol?.permisos?.["*"]) { setUserModulos(null); return; }
          } catch (_) {}
        }
        setUserModulos(mods);
      })
      .catch(() => setUserModulos(null));
  }, [userEmail]);

  const canSee = useCallback((key) => {
    if (!userModulos || userModulos.length === 0) return true;
    return userModulos.includes(key);
  }, [userModulos]);

  // Filtered nav structure
  const visibleNavGroups = NAV_GROUPS.map(g => ({
    ...g, items: g.items.filter(i => canSee(i.key)),
  })).filter(g => g.items.length > 0);

  const visibleNavBottom = NAV_BOTTOM.filter(i => canSee(i.key));

  // Which group is the active module in?
  const activeGroup = visibleNavGroups.find(g => g.items.some(i => i.key === activeModule))?.key || null;

  const w = collapsed ? 64 : 224;

  const navigate = (key) => {
    const realKey = MODULE_KEY_MAP[key] || key;
    onNavigate?.(realKey);
    if (isMobile) setSidebarOpen(false);
  };

  const NavItem = ({ item, indent = false }) => {
    const active = activeModule === (MODULE_KEY_MAP[item.key] || item.key);
    return (
      <div onClick={() => navigate(item.key)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: indent ? "7px 10px 7px 20px" : "9px 12px",
          borderRadius: 7, cursor: "pointer", marginBottom: 1,
          background: active ? T.activeBg : "transparent",
          color: active ? T.textMain : T.textMid,
          transition: "background 0.12s, color 0.12s",
          borderLeft: active && indent ? `2px solid ${B.sky}` : indent ? "2px solid transparent" : "none",
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.hoverBg; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: indent ? 13 : 15, width: 18, textAlign: "center", flexShrink: 0, opacity: active ? 1 : 0.7 }}>{item.icon}</span>
        {(!collapsed || isMobile) && <span style={{ fontSize: indent ? 13 : 14, whiteSpace: "nowrap", fontWeight: active ? 600 : 400 }}>{item.label}</span>}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", position: "fixed", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      {/* Light mode: overrides de los colores de tema oscuro más comunes usados en los módulos.
         Cada override apunta a tanto hex como rgb() porque React puede normalizar. */}
      <style>{`
        .atolon-light-content { color: #0D1B3E; }

        /* Backgrounds dark → light */
        .atolon-light-content [style*="#0D1B3E"][style*="background"],
        .atolon-light-content [style*="rgb(13, 27, 62)"][style*="background"],
        .atolon-light-content [style*="rgb(13,27,62)"][style*="background"] {
          background-color: #F5F2EA !important;
          background: #F5F2EA !important;
        }
        .atolon-light-content [style*="#152650"][style*="background"],
        .atolon-light-content [style*="rgb(21, 38, 80)"][style*="background"],
        .atolon-light-content [style*="rgb(21,38,80)"][style*="background"] {
          background-color: #FFFFFF !important;
          background: #FFFFFF !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .atolon-light-content [style*="#1E3566"][style*="background"],
        .atolon-light-content [style*="rgb(30, 53, 102)"][style*="background"],
        .atolon-light-content [style*="rgb(30,53,102)"][style*="background"] {
          background-color: #EDE7D6 !important;
          background: #EDE7D6 !important;
        }

        /* Borders dark → soft */
        .atolon-light-content [style*="#1E3566"][style*="border"],
        .atolon-light-content [style*="rgb(30, 53, 102)"][style*="border"] {
          border-color: #D8CFBA !important;
        }

        /* Text white → navy */
        .atolon-light-content [style*="color: #fff"],
        .atolon-light-content [style*="color:#fff"],
        .atolon-light-content [style*="color: #FFF"],
        .atolon-light-content [style*="color:#FFF"],
        .atolon-light-content [style*="color: #ffffff"],
        .atolon-light-content [style*="color:#ffffff"],
        .atolon-light-content [style*="color: #FFFFFF"],
        .atolon-light-content [style*="color:#FFFFFF"],
        .atolon-light-content [style*="color: rgb(255, 255, 255)"],
        .atolon-light-content [style*="color:rgb(255, 255, 255)"] {
          color: #0D1B3E !important;
        }

        /* Text white alpha → navy alpha */
        .atolon-light-content [style*="color: rgba(255, 255, 255, 0.9)"],
        .atolon-light-content [style*="color: rgba(255,255,255,0.9)"] { color: rgba(13,27,62,0.9) !important; }
        .atolon-light-content [style*="color: rgba(255, 255, 255, 0.8)"],
        .atolon-light-content [style*="color: rgba(255,255,255,0.8)"] { color: rgba(13,27,62,0.85) !important; }
        .atolon-light-content [style*="color: rgba(255, 255, 255, 0.7)"],
        .atolon-light-content [style*="color: rgba(255,255,255,0.7)"] { color: rgba(13,27,62,0.75) !important; }
        .atolon-light-content [style*="color: rgba(255, 255, 255, 0.6)"],
        .atolon-light-content [style*="color: rgba(255,255,255,0.6)"] { color: rgba(13,27,62,0.65) !important; }
        .atolon-light-content [style*="color: rgba(255, 255, 255, 0.5)"],
        .atolon-light-content [style*="color: rgba(255,255,255,0.5)"] { color: rgba(13,27,62,0.55) !important; }
        .atolon-light-content [style*="color: rgba(255, 255, 255, 0.4)"],
        .atolon-light-content [style*="color: rgba(255,255,255,0.4)"] { color: rgba(13,27,62,0.45) !important; }
        .atolon-light-content [style*="color: rgba(255, 255, 255, 0.35)"],
        .atolon-light-content [style*="color: rgba(255,255,255,0.35)"] { color: rgba(13,27,62,0.4) !important; }
        .atolon-light-content [style*="color: rgba(255, 255, 255, 0.3)"],
        .atolon-light-content [style*="color: rgba(255,255,255,0.3)"] { color: rgba(13,27,62,0.35) !important; }
        .atolon-light-content [style*="color: rgba(255, 255, 255, 0.25)"],
        .atolon-light-content [style*="color: rgba(255,255,255,0.25)"] { color: rgba(13,27,62,0.3) !important; }

        /* Inputs: fondo navy → blanco */
        .atolon-light-content input,
        .atolon-light-content textarea,
        .atolon-light-content select {
          background-color: #FFFFFF !important;
          color: #0D1B3E !important;
          border-color: #D8CFBA !important;
        }
        .atolon-light-content input::placeholder,
        .atolon-light-content textarea::placeholder {
          color: rgba(13,27,62,0.4) !important;
        }

        /* Tablas: filas hover */
        .atolon-light-content tr:hover {
          background-color: #F5F2EA !important;
        }
      `}</style>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 99,
        }} />
      )}

      {/* Sidebar */}
      <div style={{
        width: isMobile ? 240 : w,
        background: T.sidebarBg, transition: "transform 0.2s, width 0.2s, background 0.2s", flexShrink: 0,
        display: "flex", flexDirection: "column", overflow: "hidden",
        ...(isMobile ? {
          position: "fixed", top: 0, left: 0, height: "100dvh", zIndex: 100,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        } : {}),
      }}>
        {/* Logo */}
        <div style={{
          padding: (collapsed && !isMobile) ? "20px 8px" : "20px 16px",
          borderBottom: `1px solid ${T.sidebarBorder}`,
          display: "flex", justifyContent: "center", alignItems: "center",
          cursor: isMobile ? "default" : "pointer",
        }} onClick={() => !isMobile && setCollapsed(c => !c)}>
          {(collapsed && !isMobile)
            ? <img src="/favicon-blue.png" alt="Atolon" style={{ width: 40, height: 40, objectFit: "contain" }} />
            : <img src={T.logoSrc} alt="Atolon Beach Club" style={{ height: 60, objectFit: "contain" }} onError={(e) => { e.currentTarget.src = "/atolon-logo-white.png"; }} />
          }
        </div>

        {/* Nav */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "10px 8px",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
          minHeight: 0,
        }}>

          {/* Top items (Dashboard) */}
          {NAV_TOP.map(n => <NavItem key={n.key} item={n} />)}

          {/* Divider */}
          <div style={{ height: 1, background: isLight ? T.sidebarBorder : `${B.navyLight}88`, margin: "8px 4px" }} />

          {/* Groups — filtered by user permissions */}
          {visibleNavGroups.map(group => {
            const hasActive = group.items.some(i => activeModule === (MODULE_KEY_MAP[i.key] || i.key));
            return (
              <div key={group.key} style={{ marginBottom: 4 }}>
                {/* Group label */}
                {!collapsed && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 12px 4px",
                    color: hasActive ? group.color : T.textLight,
                  }}>
                    <span style={{ fontSize: 12 }}>{group.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>{group.label}</span>
                  </div>
                )}
                <div>
                  {group.items.map(item => <NavItem key={item.key} item={item} indent={!collapsed} />)}
                </div>
              </div>
            );
          })}

          {/* Divider */}
          <div style={{ height: 1, background: isLight ? T.sidebarBorder : `${B.navyLight}88`, margin: "8px 4px" }} />

          {/* Bottom items — filtered by user permissions */}
          {visibleNavBottom.map(n => <NavItem key={n.key} item={n} />)}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 8px", borderTop: `1px solid ${T.sidebarBorder}` }}>
          {!collapsed && userEmail && (
            <div style={{ fontSize: 10, color: T.textLight, padding: "0 8px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userEmail}
            </div>
          )}
          <div onClick={() => setShowChangePassword(true)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 7, cursor: "pointer",
              color: T.textLight, transition: "background 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = B.sky + "18"; e.currentTarget.style.color = B.sky; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textLight; }}
          >
            <span style={{ fontSize: 15, width: 18, textAlign: "center", flexShrink: 0 }}>🔑</span>
            {!collapsed && <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>Cambiar contraseña</span>}
          </div>
          <div onClick={logout}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 7, cursor: "pointer",
              color: T.textLight, transition: "background 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#D6454518"; e.currentTarget.style.color = "#F87171"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textLight; }}
          >
            <span style={{ fontSize: 15, width: 18, textAlign: "center", flexShrink: 0 }}>⎋</span>
            {!collapsed && <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>Cerrar sesión</span>}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* TopBar */}
        <div style={{
          height: 54, padding: isMobile ? "0 16px" : "0 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: `1px solid ${T.topbarBorder}`, flexShrink: 0, background: T.topbarBg,
          transition: "background 0.2s",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)} style={{
                background: "none", border: "none", color: T.textMain, fontSize: 22,
                cursor: "pointer", padding: "4px 6px", lineHeight: 1,
              }}>☰</button>
            )}
            {/* Breadcrumb: Grupo > Módulo */}
            {activeGroup && !isMobile && (
              <span style={{ fontSize: 12, color: T.textLight, fontWeight: 500 }}>
                {NAV_GROUPS.find(g => g.key === activeGroup)?.label} ›
              </span>
            )}
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 17 : 20, fontWeight: 700, color: T.textMain }}>
              {ALL_ITEMS.find(n => (MODULE_KEY_MAP[n.key] || n.key) === activeModule)?.label || "Dashboard"}
            </span>
            {!isMobile && <span style={{ fontSize: 12, color: T.textLight }}>{todayDisplay()}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Toggle tema */}
            <button
              onClick={() => setTheme(isLight ? "dark" : "light")}
              title={isLight ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
              style={{
                width: 32, height: 32, borderRadius: 16,
                background: isLight ? "#F5C842" + "22" : B.navyLight,
                border: "none", cursor: "pointer", fontSize: 15, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>
              {isLight ? "🌙" : "☀️"}
            </button>
            <div style={{
              width: 32, height: 32, borderRadius: 16,
              background: isLight ? "#0D1B3E" : B.navyLight,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
              color: isLight ? "#fff" : "rgba(255,255,255,0.6)",
            }}>{
              userName
                ? userName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
                : userEmail ? userEmail.slice(0, 2).toUpperCase() : "?"
            }</div>
          </div>
        </div>

        {/* Content area */}
        <div
          className={isLight ? "atolon-light-content" : ""}
          style={{
            flex: 1, overflowY: "auto", padding: isMobile ? "16px 12px" : 28,
            background: isLight ? "#FAF8F2" : "transparent",
          }}>
          {/* Block access to modules not in user's permissions */}
          {moduleContent && activeModule !== "dashboard" && !canSee(activeModule) ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60%", gap: 12 }}>
              <div style={{ fontSize: 48 }}>🔒</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Acceso restringido</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>No tienes permiso para acceder a este módulo.</div>
            </div>
          ) : (
            moduleContent || <Dashboard />
          )}
        </div>
      </div>

      <MayaChat />

      {/* ── Modal: Cambiar contraseña ── */}
      {showChangePassword && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowChangePassword(false)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 400, maxWidth: "100%", border: `1px solid ${B.navyLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "#fff" }}>🔑 Cambiar contraseña</h3>
              <button onClick={() => setShowChangePassword(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 18 }}>
              {userEmail}
            </div>
            {passSuccess ? (
              <div style={{ textAlign: "center", padding: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.success }}>Contraseña actualizada</div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>Nueva contraseña</label>
                  <input type="password" value={newPass1} onChange={e => { setNewPass1(e.target.value); setPassError(""); }}
                    placeholder="Mínimo 6 caracteres" autoFocus
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navy, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>Confirmar contraseña</label>
                  <input type="password" value={newPass2} onChange={e => { setNewPass2(e.target.value); setPassError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleChangePassword()}
                    placeholder="Repetir contraseña"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navy, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
                {passError && (
                  <div style={{ fontSize: 12, color: "#F87171", marginBottom: 14, padding: "8px 12px", background: "#D6454522", borderRadius: 6 }}>
                    {passError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowChangePassword(false)}
                    style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button onClick={handleChangePassword} disabled={changingPass}
                    style={{ flex: 2, padding: "11px", background: B.sky, border: "none", borderRadius: 8, color: B.navy, fontSize: 14, cursor: "pointer", fontWeight: 700, opacity: changingPass ? 0.5 : 1 }}>
                    {changingPass ? "Actualizando..." : "Cambiar contraseña"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
