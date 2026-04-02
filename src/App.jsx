import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import AtolanOS from "./modules/AtolanOS";

// ── Force Change Password ───────────────────────────────────────────────────
function ForceChangePassword({ userEmail, onDone }) {
  const [pass, setPass]     = useState("");
  const [pass2, setPass2]   = useState("");
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);
  const [show, setShow]     = useState(false);
  const [show2, setShow2]   = useState(false);

  const IS = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1.5px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
    color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (pass.length < 8)          { setError("La contraseña debe tener mínimo 8 caracteres"); return; }
    if (pass === "Atolon123")      { setError("No puedes seguir usando la clave temporal"); return; }
    if (pass !== pass2)            { setError("Las contraseñas no coinciden"); return; }
    setSaving(true);
    // 1. Cambiar la clave en Supabase Auth
    const { error: authErr } = await supabase.auth.updateUser({ password: pass });
    if (authErr) { setError(authErr.message); setSaving(false); return; }
    // 2. Apagar la bandera en la tabla usuarios
    await supabase.from("usuarios").update({ must_change_password: false }).eq("email", userEmail.toLowerCase());
    setSaving(false);
    onDone();
  };

  return (
    <div style={{
      minHeight: "100vh", background: B.navy,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: 420, maxWidth: "92vw",
        background: B.navyMid, borderRadius: 20,
        padding: "40px 36px", boxShadow: "0 24px 64px #0008",
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/atolon-logo-white.png" alt="Atolon" style={{ width: 140, margin: "0 auto 16px", display: "block" }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Cambia tu contraseña</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
            Por seguridad debes crear una contraseña personal antes de continuar. No podrás omitir este paso.
          </div>
        </div>

        <div style={{ background: "#E8A02022", border: "1px solid #E8A02055", borderRadius: 10, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div style={{ fontSize: 13, color: "#E8A020", lineHeight: 1.5 }}>
            Estás usando la contraseña temporal <strong>Atolon123</strong>. Crea una nueva contraseña para proteger tu cuenta.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>NUEVA CONTRASEÑA</label>
            <div style={{ position: "relative" }}>
              <input type={show ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)}
                placeholder="Mínimo 8 caracteres" required style={{ ...IS, paddingRight: 44 }} />
              <button type="button" onClick={() => setShow(s => !s)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>
                {show ? "🙈" : "👁"}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>CONFIRMAR CONTRASEÑA</label>
            <div style={{ position: "relative" }}>
              <input type={show2 ? "text" : "password"} value={pass2} onChange={e => setPass2(e.target.value)}
                placeholder="Repite la contraseña" required style={{ ...IS, paddingRight: 44 }} />
              <button type="button" onClick={() => setShow2(s => !s)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>
                {show2 ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Indicadores de fortaleza */}
          {pass.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {[
                { ok: pass.length >= 8,           label: "8+ chars" },
                { ok: /[A-Z]/.test(pass),          label: "Mayúscula" },
                { ok: /[0-9]/.test(pass),          label: "Número" },
                { ok: pass !== "Atolon123",        label: "No temporal" },
              ].map(({ ok, label }) => (
                <div key={label} style={{ flex: 1, textAlign: "center", padding: "4px 0", borderRadius: 6, background: ok ? B.success + "22" : "rgba(255,255,255,0.06)", border: `1px solid ${ok ? B.success + "55" : "transparent"}` }}>
                  <div style={{ fontSize: 10, color: ok ? B.success : "rgba(255,255,255,0.3)", fontWeight: 600 }}>{ok ? "✓" : "·"} {label}</div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ background: "#D6454522", border: "1px solid #D6454544", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#F87171", marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={saving}
            style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: saving ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 15, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Guardando..." : "Guardar y entrar →"}
          </button>

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button type="button"
              onClick={async () => { await supabase.auth.signOut(); }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 13, cursor: "pointer" }}>
              ¿Olvidaste tu clave? — Cerrar sesión e ingresar con otra contraseña
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Floating WhatsApp Button ────────────────────────────────────────────────
function WhatsAppFloat({ phone }) {
  const [hovered, setHovered] = useState(false);
  if (!phone) return null;
  const clean = phone.replace(/\D/g, "");
  const url = `https://wa.me/${clean}?text=${encodeURIComponent("¡Hola! Necesito asistencia con mi reserva en Atolon Beach Club 🌴")}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 9999,
        display: "flex", alignItems: "center", gap: 10,
        background: "#25D366",
        borderRadius: hovered ? 30 : 50,
        padding: hovered ? "12px 20px 12px 14px" : "14px",
        boxShadow: "0 4px 20px rgba(37,211,102,0.45)",
        textDecoration: "none",
        transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        overflow: "hidden",
        maxWidth: hovered ? 240 : 52,
        whiteSpace: "nowrap",
      }}
      title="Asistencia por WhatsApp"
    >
      {/* WhatsApp SVG icon */}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="26" height="26" style={{ flexShrink: 0 }}>
        <path fill="#fff" d="M16 2C8.28 2 2 8.28 2 16c0 2.46.66 4.77 1.8 6.77L2 30l7.43-1.76A13.93 13.93 0 0 0 16 30c7.72 0 14-6.28 14-14S23.72 2 16 2Zm0 25.5a11.44 11.44 0 0 1-5.83-1.6l-.42-.25-4.41 1.04 1.07-4.28-.28-.44A11.47 11.47 0 0 1 4.5 16c0-6.34 5.16-11.5 11.5-11.5S27.5 9.66 27.5 16 22.34 27.5 16 27.5Zm6.3-8.57c-.35-.17-2.05-1.01-2.37-1.13-.31-.12-.54-.17-.77.17-.23.35-.88 1.13-1.08 1.36-.2.23-.4.26-.74.09-.35-.17-1.47-.54-2.8-1.72-1.03-.92-1.73-2.06-1.93-2.4-.2-.35-.02-.53.15-.7.15-.15.35-.4.52-.6.17-.2.23-.35.35-.58.12-.23.06-.43-.03-.6-.09-.17-.77-1.85-1.05-2.54-.28-.67-.56-.58-.77-.59h-.66c-.23 0-.6.09-.91.43-.32.35-1.2 1.17-1.2 2.85s1.23 3.3 1.4 3.53c.17.23 2.42 3.7 5.86 5.19.82.35 1.46.56 1.95.72.82.26 1.57.22 2.16.13.66-.1 2.05-.84 2.34-1.65.29-.81.29-1.5.2-1.65-.09-.14-.31-.23-.65-.4Z"/>
      </svg>
      {hovered && (
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em" }}>
          ¿Necesitas ayuda?
        </span>
      )}
    </a>
  );
}
import Login from "./modules/Login";
import ResetPassword from "./modules/ResetPassword";
import Pasadias from "./modules/Pasadias";
import Reservas from "./modules/Reservas";
import FloorPlan from "./modules/FloorPlan";
import Comercial from "./modules/Comercial";
import B2B from "./modules/B2B";
import Eventos from "./modules/Eventos";
import MenuContratos from "./modules/MenuContratos";
import Financiero from "./modules/Financiero";
import Presupuesto from "./modules/Presupuesto";
import Activos from "./modules/Activos";
import Requisiciones from "./modules/Requisiciones";
import EmpleadoPortal from "./modules/EmpleadoPortal";
import AgenciaPortal from "./modules/AgenciaPortal";
import BookingWidget from "./modules/BookingWidget";
import BookingPopup from "./modules/BookingPopup";
import PagoCliente from "./modules/PagoCliente";
import Configuracion from "./modules/Configuracion";
import Usuarios from "./modules/Usuarios";
import Contenido from "./modules/Contenido";
import Upsells from "./modules/Upsells";
import Menus from "./modules/Menus";
import CheckIn from "./modules/CheckIn";
import ZarpeInfo from "./modules/ZarpeInfo";
import Analitica from "./modules/Analitica";
import MuelleCheckin from "./modules/MuelleCheckin";
import VIPAdmin from "./modules/VIPAdmin";
import Clientes from "./modules/Clientes";
import VIPPortal from "./modules/VIPPortal";
import Staffing from "./modules/Staffing";

const MODULE_MAP = {
  pasadias: <Pasadias />,
  reservas: <Reservas />,
  floorplan: <FloorPlan />,
  comercial: <Comercial />,
  b2b: <B2B />,
  eventos: <Eventos />,
  contratos: <MenuContratos />,
  financiero: <Financiero />,
  presupuesto: <Presupuesto />,
  activos: <Activos />,
  requisiciones: <Requisiciones />,
  contenido: <Contenido />,
  upsells:   <Upsells />,
  staffing:  <Staffing />,
  checkin:   <CheckIn />,
  muelle:    <MuelleCheckin />,
  menus:     <Menus />,
  configuracion: <Configuracion />,
  usuarios: <Usuarios />,
  analitica: <Analitica />,
  vip: <VIPAdmin />,
  clientes: <Clientes />,
};

// Public routes — no auth required
const PUBLIC_ROUTES = ["empleados", "agencia", "booking", "pago", "reset-password", "zarpe-info", "login", ""];

function getRoute() {
  return window.location.pathname.replace(/^\//, "") || "";
}

export default function App() {
  const [route, setRoute]               = useState(getRoute());
  const [activeModule, setActiveModule] = useState("dashboard");
  const [session, setSession]           = useState(undefined); // undefined = loading
  const [waPhone, setWaPhone]           = useState(null);
  const [mustChange, setMustChange]     = useState(false); // force password change

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(getRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Fetch WhatsApp number from configuracion
  useEffect(() => {
    if (!supabase) return;
    supabase.from("configuracion").select("whatsapp").eq("id", "atolon").single()
      .then(({ data }) => { if (data?.whatsapp) setWaPhone(data.whatsapp); });
  }, []);

  // Verificar si el usuario debe cambiar su clave
  useEffect(() => {
    if (!session?.user?.email || !supabase) { setMustChange(false); return; }
    supabase.from("usuarios").select("must_change_password").eq("email", session.user.email.toLowerCase()).single()
      .then(({ data }) => setMustChange(!!data?.must_change_password));
  }, [session]);

  const navigate = (mod) => setActiveModule(mod);

  // Public routes — show WhatsApp button
  const isPublic = ["empleados", "agencia", "booking", "", "reset-password", "zarpe-info"].includes(route) || route.startsWith("pago") || route.startsWith("booking/");

  // Always-public routes (no auth needed ever)
  if (route === "empleados")      return <><EmpleadoPortal /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "agencia" || route === "") return <><AgenciaPortal /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "booking" || route.startsWith("booking/")) return <><BookingPopup /><WhatsAppFloat phone={waPhone} /></>;
  if (route.startsWith("pago"))   return <><PagoCliente /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "reset-password") return <><ResetPassword /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "zarpe-info")     return <><ZarpeInfo /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "society")        return <VIPPortal />;

  // Loading auth state
  if (session === undefined) return null;

  // /login: show login form if not authenticated, else fall through to OS
  if (route === "login" && !session) return <><Login /><WhatsAppFloat phone={waPhone} /></>;

  // Not logged in from any other route
  if (!session) return <><Login /><WhatsAppFloat phone={waPhone} /></>;

  // Logged in but must change password first
  if (mustChange) return <ForceChangePassword userEmail={session.user.email} onDone={() => setMustChange(false)} />;

  // Logged in — show OS (internal, no WhatsApp button)
  return (
    <AtolanOS
      activeModule={activeModule}
      onNavigate={navigate}
      moduleContent={MODULE_MAP[activeModule] || null}
      userEmail={session.user?.email}
    />
  );
}
