import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import AtolanOS from "./modules/AtolanOS";

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
  checkin:   <CheckIn />,
  menus:     <Menus />,
  configuracion: <Configuracion />,
  usuarios: <Usuarios />,
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
    supabase.from("configuracion").select("telefono").eq("id", "atolon").single()
      .then(({ data }) => { if (data?.telefono) setWaPhone(data.telefono); });
  }, []);

  const navigate = (mod) => setActiveModule(mod);

  // Public routes — show WhatsApp button
  const isPublic = ["empleados", "agencia", "booking", "", "reset-password", "zarpe-info"].includes(route) || route.startsWith("pago");

  // Always-public routes (no auth needed ever)
  if (route === "empleados")      return <><EmpleadoPortal /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "agencia" || route === "") return <><AgenciaPortal /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "booking")        return <><BookingPopup /><WhatsAppFloat phone={waPhone} /></>;
  if (route.startsWith("pago"))   return <><PagoCliente /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "reset-password") return <><ResetPassword /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "zarpe-info")     return <><ZarpeInfo /><WhatsAppFloat phone={waPhone} /></>;

  // Loading auth state
  if (session === undefined) return null;

  // /login: show login form if not authenticated, else fall through to OS
  if (route === "login" && !session) return <><Login /><WhatsAppFloat phone={waPhone} /></>;

  // Not logged in from any other route
  if (!session) return <><Login /><WhatsAppFloat phone={waPhone} /></>;

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
