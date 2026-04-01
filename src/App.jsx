import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import AtolanOS from "./modules/AtolanOS";
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
  configuracion: <Configuracion />,
  usuarios: <Usuarios />,
};

// Public routes — no auth required
const PUBLIC_ROUTES = ["empleados", "agencia", "booking", "pago", "reset-password"];

function getRoute() {
  return window.location.pathname.replace(/^\//, "") || "";
}

export default function App() {
  const [route, setRoute]               = useState(getRoute());
  const [activeModule, setActiveModule] = useState("dashboard");
  const [session, setSession]           = useState(undefined); // undefined = loading

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

  const navigate = (mod) => setActiveModule(mod);

  // Public routes — accessible without login
  if (route === "empleados")      return <EmpleadoPortal />;
  if (route === "agencia")        return <AgenciaPortal />;
  if (route === "booking")        return <BookingPopup />;
  if (route.startsWith("pago"))   return <PagoCliente />;
  if (route === "reset-password") return <ResetPassword />;

  // Loading auth state
  if (session === undefined) return null;

  // Not logged in
  if (!session) return <Login />;

  // Logged in — show OS
  return (
    <AtolanOS
      activeModule={activeModule}
      onNavigate={navigate}
      moduleContent={MODULE_MAP[activeModule] || null}
      userEmail={session.user?.email}
    />
  );
}
