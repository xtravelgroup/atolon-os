import { useState, useEffect, Component, lazy, Suspense } from "react";
import { supabase } from "./lib/supabase";
import {
  validatePassword, hashPassword, isInHistory, strengthSignals,
  PASSWORD_POLICY, aplicaCaducidad, diasHastaCaducidad,
} from "./lib/passwordPolicy";
import { aplicaMFAEffective, getMFAStatus } from "./lib/mfaPolicy";
import MFAEnrollment from "./components/MFAEnrollment";
import MFAChallenge from "./components/MFAChallenge";
import { B } from "./brand";
import AtolanOS from "./modules/AtolanOS";
import AtolanTrack from "./lib/AtolanTrack";
import { initTracking } from "./lib/gtm";

// ── Error Boundary — muestra el error en pantalla en vez de pantalla azul ───
//
// Caso especial: chunk load errors. Cuando Vercel deploya una nueva versión,
// los nombres de los chunks cambian (Eventos-XXXXXX.js). El usuario que tiene
// la pestaña abierta apunta al chunk viejo, que ya no existe → "Failed to
// fetch dynamically imported module". El handler global en main.jsx lo
// captura, PERO si el error ocurre durante el render del lazy component,
// React lo intercepta primero acá. Detectamos el patrón y recargamos solos.
//
// Debounce por timestamp en vez de flag binario: permite múltiples reloads
// en una sesión larga (deploys seguidos) sin entrar en loop.
const CHUNK_RELOAD_TS_KEY = "__atolon_chunk_reload";
const CHUNK_RELOAD_DEBOUNCE_MS = 10_000; // mínimo entre reloads
function isChunkLoadError(err) {
  const msg = String(err?.message || err || "");
  return /Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError|Importing a module script failed/i.test(msg);
}
function chunkRecoveryAllowed() {
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_TS_KEY)) || 0;
  return Date.now() - last > CHUNK_RELOAD_DEBOUNCE_MS;
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, recovering: false }; }
  static getDerivedStateFromError(e) {
    if (isChunkLoadError(e) && chunkRecoveryAllowed()) {
      // No mostrar el error rojo — mostrar "Actualizando..." y recargar.
      return { error: e, recovering: true };
    }
    return { error: e, recovering: false };
  }
  componentDidCatch(err) {
    if (this.state.recovering) {
      sessionStorage.setItem(CHUNK_RELOAD_TS_KEY, String(Date.now()));
      // Limpiar caches del navegador antes de recargar (por si el HTML
      // viejo está cacheado y volveríamos a recibir hashes que ya no existen).
      const reload = () => window.location.reload();
      if (typeof caches !== "undefined") {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(reload);
      } else {
        reload();
      }
    }
  }
  render() {
    if (this.state.recovering) {
      // Pantalla mínima durante el reload — ~200-500ms en redes normales.
      return (
        <div style={{
          position: "fixed", inset: 0, background: "#0D1B3E",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          color: "#C8B99A", fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
          <div style={{
            width: 40, height: 40, marginBottom: 16,
            border: "3px solid rgba(200,185,154,0.2)",
            borderTopColor: "#C8B99A",
            borderRadius: "50%",
            animation: "atolon-spin 0.8s linear infinite",
          }} />
          <div style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Actualizando…
          </div>
          <style>{`@keyframes atolon-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      const stack = this.state.error?.stack || "";
      return (
        <div style={{
          position: "fixed", inset: 0, background: "#0D1B3E",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: 24, fontFamily: "monospace", color: "#fff",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#F87171" }}>Error de render</div>
          <div style={{ fontSize: 13, color: "#fca5a5", marginBottom: 16, textAlign: "center", maxWidth: 500 }}>{msg}</div>
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.4)", whiteSpace: "pre-wrap",
            maxWidth: 500, maxHeight: 200, overflowY: "auto", background: "#152650",
            padding: 12, borderRadius: 8,
          }}>{stack}</div>
          <button onClick={() => window.location.reload()} style={{
            marginTop: 20, padding: "10px 24px", borderRadius: 8, border: "none",
            background: "#8ECAE6", color: "#0D1B3E", fontWeight: 700, cursor: "pointer",
          }}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Force Change Password ───────────────────────────────────────────────────
function ForceChangePassword({ userEmail, onDone, motivo }) {
  const [pass, setPass]     = useState("");
  const [pass2, setPass2]   = useState("");
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);
  const [show, setShow]     = useState(false);
  const [show2, setShow2]   = useState(false);
  const [userNombre, setUserNombre] = useState("");
  const [pwdHistory, setPwdHistory] = useState([]);

  // Cargar nombre + historial para validaciones KPMG C-2
  useEffect(() => {
    if (!supabase || !userEmail) return;
    supabase.from("usuarios").select("nombre, password_history")
      .eq("email", userEmail.toLowerCase()).maybeSingle()
      .then(({ data }) => {
        if (data?.nombre) setUserNombre(data.nombre);
        if (Array.isArray(data?.password_history)) setPwdHistory(data.password_history);
      });
  }, [userEmail]);

  const IS = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1.5px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
    color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    // KPMG C-2 — validar contra política institucional
    const policyError = validatePassword(pass, { email: userEmail, nombre: userNombre });
    if (policyError) { setError(policyError); return; }
    if (pass !== pass2) { setError("Las contraseñas no coinciden"); return; }
    // No reutilizar las últimas N
    if (await isInHistory(pass, pwdHistory, userEmail.toLowerCase())) {
      setError(`No podés reutilizar tus últimas ${PASSWORD_POLICY.historySize} contraseñas. Elegí una nueva.`);
      return;
    }
    setSaving(true);
    // 1. Cambiar la clave en Supabase Auth
    const { error: authErr } = await supabase.auth.updateUser({ password: pass });
    if (authErr) { setError(authErr.message); setSaving(false); return; }
    // 2. Actualizar usuarios: flag, timestamp, historial
    const newHash = await hashPassword(pass, userEmail.toLowerCase());
    const newHistory = [newHash, ...pwdHistory].slice(0, PASSWORD_POLICY.historySize);
    await supabase.from("usuarios").update({
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
      password_history: newHistory,
      failed_login_count: 0,
      locked_until: null,
    }).eq("email", userEmail.toLowerCase());
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
                placeholder={`Mínimo ${PASSWORD_POLICY.minLength} caracteres · 3 categorías`} required style={{ ...IS, paddingRight: 44 }} />
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

          {/* Indicadores de fortaleza KPMG C-2 */}
          {pass.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
              {strengthSignals(pass).map(({ ok, label }) => (
                <div key={label} style={{ textAlign: "center", padding: "4px 6px", borderRadius: 6, background: ok ? B.success + "22" : "rgba(255,255,255,0.06)", border: `1px solid ${ok ? B.success + "55" : "transparent"}` }}>
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
      onClick={() => AtolanTrack.whatsappClick("float_button")}
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
// ── Lazy module imports ─────────────────────────────────────────────────────
// Cada módulo se carga bajo demanda al primer uso (chunk separado por Vite).
// Antes: bundle único de 4.2 MB cargaba todo de una vez.
// Ahora: bundle inicial ~500 KB; cada módulo es ~30-100 KB on-demand.
const Login = lazy(() => import("./modules/Login"));
const ResetPassword = lazy(() => import("./modules/ResetPassword"));
const Pasadias = lazy(() => import("./modules/Pasadias"));
const Reservas = lazy(() => import("./modules/Reservas"));
const FloorPlan = lazy(() => import("./modules/FloorPlan"));
const Comercial = lazy(() => import("./modules/Comercial"));
const B2B = lazy(() => import("./modules/B2B"));
const Eventos = lazy(() => import("./modules/Eventos"));
const AuditLog = lazy(() => import("./modules/AuditLog"));
const SoDViolations = lazy(() => import("./modules/SoDViolations"));
const BackupDR = lazy(() => import("./modules/BackupDR"));
const EventosVariance = lazy(() => import("./modules/EventosVariance"));
const DianCompliance = lazy(() => import("./modules/DianCompliance"));
const Financiero = lazy(() => import("./modules/Financiero"));
const CXC = lazy(() => import("./modules/CXC"));
const HotelReservas = lazy(() => import("./modules/HotelReservas"));
const HotelHuespedes = lazy(() => import("./modules/HotelHuespedes"));
const HotelTarifas = lazy(() => import("./modules/HotelTarifas"));
const HotelCheckin = lazy(() => import("./modules/HotelCheckin"));
const HotelHabitaciones = lazy(() => import("./modules/HotelHabitaciones"));
const HotelRoomService = lazy(() => import("./modules/HotelRoomService"));
const PoolService = lazy(() => import("./modules/PoolService"));
const PoolServicePortal = lazy(() => import("./modules/PoolServicePortal"));
const MeseroPortal = lazy(() => import("./modules/MeseroPortal"));
const HotelMinibar = lazy(() => import("./modules/HotelMinibar"));
const HotelHousekeeping = lazy(() => import("./modules/HotelHousekeeping"));
const GuestPortal = lazy(() => import("./modules/GuestPortal"));
const RoomQRLanding = lazy(() => import("./modules/RoomQRLanding"));
const StaffView = lazy(() => import("./modules/StaffView"));
const CamareraPortal = lazy(() => import("./modules/CamareraPortal"));
const HousekeepingInspection = lazy(() => import("./modules/HousekeepingInspection"));
const Briefings = lazy(() => import("./modules/Briefings"));
const RHManuales = lazy(() => import("./modules/RHManuales"));
const Reportes = lazy(() => import("./modules/Reportes"));
const Presupuesto = lazy(() => import("./modules/Presupuesto"));
const EstadoResultados = lazy(() => import("./modules/EstadoResultados"));
const Activos = lazy(() => import("./modules/Activos"));
const Requisiciones = lazy(() => import("./modules/Requisiciones"));
const Compras = lazy(() => import("./modules/Compras"));
const Pagos = lazy(() => import("./modules/Pagos"));
const EmpleadoPortal = lazy(() => import("./modules/EmpleadoPortal"));
const AgenciaPortal = lazy(() => import("./modules/AgenciaPortal"));
const ReclutamientoPortal = lazy(() => import("./modules/ReclutamientoPortal"));
const Reclutamiento = lazy(() => import("./modules/Reclutamiento"));
const Comedor = lazy(() => import("./modules/Comedor"));
const LasAmericasPortal = lazy(() => import("./modules/LasAmericasPortal"));
const GranFondoNairo = lazy(() => import("./modules/GranFondoNairo"));
const BookingWidget = lazy(() => import("./modules/BookingWidget"));
const BookingPopup = lazy(() => import("./modules/BookingPopup"));
const PagoCliente = lazy(() => import("./modules/PagoCliente"));
const Configuracion = lazy(() => import("./modules/Configuracion"));
const Usuarios = lazy(() => import("./modules/Usuarios"));
const Contenido = lazy(() => import("./modules/Contenido"));
const Upsells = lazy(() => import("./modules/Upsells"));
const Menus = lazy(() => import("./modules/Menus"));
const CheckIn = lazy(() => import("./modules/CheckIn"));
const ZarpeInfo = lazy(() => import("./modules/ZarpeInfo"));
const ZarpeGrupo = lazy(() => import("./modules/ZarpeGrupo"));
const Analitica = lazy(() => import("./modules/Analitica"));
const MuelleCheckin = lazy(() => import("./modules/MuelleCheckin"));
const MuelleSalidas = lazy(() => import("./modules/MuelleSalidas"));
const VIPAdmin = lazy(() => import("./modules/VIPAdmin"));
const Clientes = lazy(() => import("./modules/Clientes"));
const VIPPortal = lazy(() => import("./modules/VIPPortal"));
const Staffing = lazy(() => import("./modules/Staffing"));
const SelfCheckIn = lazy(() => import("./modules/SelfCheckIn"));
const Historial = lazy(() => import("./modules/Historial"));
const CierreCaja = lazy(() => import("./modules/CierreCaja"));
const Actividades = lazy(() => import("./modules/Actividades"));
const Mantenimiento = lazy(() => import("./modules/Mantenimiento"));
const CarritoAbandonado = lazy(() => import("./modules/CarritoAbandonado"));
const WhatsAppChat = lazy(() => import("./modules/WhatsAppChat"));
const Metas = lazy(() => import("./modules/Metas"));
const Comisiones = lazy(() => import("./modules/Comisiones"));
const Resultados = lazy(() => import("./modules/Resultados"));
const ResultadosViewer = lazy(() => import("./modules/ResultadosViewer"));
const TrackViewer = lazy(() => import("./modules/TrackViewer"));
const Lancha = lazy(() => import("./modules/Lancha"));
const CosteoProductos = lazy(() => import("./modules/CosteoProductos"));
const DiaDeLaMadre = lazy(() => import("./modules/DiaDeLaMadre"));
const Despedidas = lazy(() => import("./modules/Despedidas"));
const RecursosHumanos = lazy(() => import("./modules/RecursosHumanos"));
const Nomina = lazy(() => import("./modules/Nomina"));
const NominaPorDia = lazy(() => import("./modules/NominaPorDia"));
const ProcesarNomina = lazy(() => import("./modules/ProcesarNomina"));
const Horarios = lazy(() => import("./modules/Horarios"));
const AsistenciaZK = lazy(() => import("./modules/AsistenciaZK"));
const ContratistasAdmin = lazy(() => import("./modules/ContratistasAdmin"));
const ContratistasPortal = lazy(() => import("./modules/ContratistasPortal"));
const ContratistasCurso = lazy(() => import("./modules/ContratistasCurso"));
const ContratistasRegistro = lazy(() => import("./modules/ContratistasRegistro"));
const ContratistasVerificar = lazy(() => import("./modules/ContratistasVerificar"));
const ContratistasMuelle = lazy(() => import("./modules/ContratistasMuelle"));
const ZarpesLog = lazy(() => import("./modules/ZarpesLog"));
const Proveedores = lazy(() => import("./modules/Proveedores"));
const Items = lazy(() => import("./modules/Items"));
const HacerInventario = lazy(() => import("./modules/HacerInventario"));
const Transferencias = lazy(() => import("./modules/Transferencias"));
const EscanearProductos = lazy(() => import("./modules/EscanearProductos"));
const LoggroAdmin = lazy(() => import("./modules/LoggroAdmin"));
const HotelFolios = lazy(() => import("./modules/HotelFolios"));
const ApiPortal = lazy(() => import("./modules/ApiPortal"));
const BlueApplePortal = lazy(() => import("./modules/BlueApplePortal"));
const BlueApplePaxPublic = lazy(() => import("./modules/BlueApplePaxPublic"));
const JuicyCream = lazy(() => import("./modules/JuicyCream"));
const JuicyOrganizador = lazy(() => import("./modules/JuicyOrganizador"));
const CajasExpress = lazy(() => import("./modules/CajasExpress"));
const CajasExpressAdmin = lazy(() => import("./modules/CajasExpressAdmin"));
const CajasImpresion = lazy(() => import("./modules/CajasImpresion"));
const CajasVentas = lazy(() => import("./modules/CajasVentas"));
const CajasSetup = lazy(() => import("./modules/CajasSetup"));
const TrackExterno = lazy(() => import("./modules/TrackExterno"));

const MODULE_MAP = {
  pasadias: <Pasadias />,
  reservas: <Reservas />,
  floorplan: <FloorPlan />,
  comercial: <Comercial />,
  b2b: <B2B />,
  eventos: <Eventos />,
  audit_log: <AuditLog />,
  sod_violations: <SoDViolations />,
  backup_dr: <BackupDR />,
  eventos_variance: <EventosVariance />,
  dian_compliance: <DianCompliance />,
  financiero: <Financiero />,
  cxc: <CXC />,
  presupuesto: <Presupuesto />,
  estado_resultados: <EstadoResultados />,
  activos: <Activos />,
  requisiciones: <Requisiciones />,
  compras: <Compras />,
  pagos: <Pagos />,
  items: <Items />,
  hacer_inventario: <HacerInventario />,
  transferencias: <Transferencias />,
  loggro: <LoggroAdmin />,
  hotel_folios: <HotelFolios />,
  contenido: <Contenido />,
  upsells:   <Upsells />,
  staffing:  <Staffing />,
  checkin:   <CheckIn />,
  zarpes_log: <ZarpesLog />,
  muelle:    <MuelleCheckin />,
  salidas_isla: <MuelleSalidas />,
  lancha:       <Lancha />,
  costeo_productos:   <CosteoProductos />,
  menus:     <Menus />,
  configuracion: <Configuracion />,
  usuarios: <Usuarios />,
  analitica: <Analitica />,
  vip: <VIPAdmin />,
  clientes: <Clientes />,
  historial: <Historial />,
  cierre_caja: <CierreCaja />,
  mantenimiento: <Mantenimiento />,
  actividades:  <Actividades />,
  carrito_abandonado: <CarritoAbandonado />,
  whatsapp_chat: <WhatsAppChat />,
  metas: <Metas />,
  comisiones: <Comisiones />,
  resultados: <Resultados />,
  rrhh: <RecursosHumanos />,
  reclutamiento: <Reclutamiento />,
  comedor: <Comedor />,
  nomina: <Nomina />,
  nomina_dia: <NominaPorDia />,
  procesar_nomina: <ProcesarNomina />,
  asistencia_zk: <AsistenciaZK />,
  horarios: <Horarios />,
  contratistas_admin: <ContratistasAdmin />,
  contratistas_muelle: <ContratistasMuelle />,
  briefings: <Briefings />,
  manuales: <RHManuales />,
  reportes: <Reportes />,
  proveedores: <Proveedores />,
  hotel_reservas:     <HotelReservas />,
  hotel_habitaciones: <HotelHabitaciones />,
  hotel_huespedes:    <HotelHuespedes />,
  hotel_checkin:      <HotelCheckin />,
  hotel_housekeeping: <HotelHousekeeping />,
  hotel_roomservice:  <HotelRoomService />,
  pool_service:       <PoolService />,
  hotel_minibar:      <HotelMinibar />,
  hotel_tarifas:      <HotelTarifas />,
  api_portal:         <ApiPortal />,
  cajas_ventas:       <CajasVentas />,
};

// Public routes — no auth required
const PUBLIC_ROUTES = ["empleados", "agencia", "booking", "pago", "reset-password", "zarpe-info", "zarpe-grupo", "login", "las-americas", "resultados", "track", "dia-de-la-madre", "madres", "blueapple", "blueapple-pax", "juicy", "juicyandcream", "juicy-organizador", "juice-organizador", "cajas", "cajas-admin", "cajas-imprimir", "cajas-setup", ""];

function getRoute() {
  return window.location.pathname.replace(/^\//, "") || "";
}

// Loading screen shown during auth transitions (prevents Chrome blue flash)
function LoadingScreen() {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0D1B3E",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
    }}>
      <img src="/favicon-blue.png" alt="Atolon" style={{ width: 48, height: 48, opacity: 0.6 }} />
      <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.1)", borderTop: "3px solid #8ECAE6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

export default function App() {
  const [route, setRoute]               = useState(getRoute());
  const [activeModule, setActiveModule] = useState("dashboard");
  const [session, setSession]           = useState(undefined); // undefined = loading
  const [waPhone, setWaPhone]           = useState(null);
  const [mustChange, setMustChange]     = useState(false); // force password change
  const [appReady, setAppReady]         = useState(false); // prevents Chrome blue flash on first login
  const [nuevaVersion, setNuevaVersion] = useState(false);  // deploy nuevo detectado

  useEffect(() => {
    // Timeout de seguridad: si getSession no responde en 4s, asumir no autenticado
    const fallback = setTimeout(() => setSession(prev => prev === undefined ? null : prev), 4000);
    supabase.auth.getSession()
      .then(({ data }) => { clearTimeout(fallback); setSession(data?.session ?? null); setAppReady(true); })
      .catch(() => { clearTimeout(fallback); setSession(null); setAppReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      clearTimeout(fallback);
      // En móvil, TOKEN_REFRESHED puede emitir null brevemente — solo blanquear en SIGNED_OUT real
      if (event === "SIGNED_OUT") {
        setSession(null); setAppReady(true);
      } else if (s) {
        setSession(s); setAppReady(true);
      }
    });
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
  // + KPMG C-2: caducidad de password para roles administrativos
  // + KPMG C-2: MFA obligatorio para roles administrativos
  // + KPMG C-3: tracking de ultimo_acceso para detectar cuentas zombie
  const [pwdExpiredMotivo, setPwdExpiredMotivo] = useState("");
  const [mfaState, setMfaState] = useState({
    checked: false,        // ya corrió el check
    needsEnrollment: false,
    needsChallenge: false,
    factorId: null,
    rolId: null,
  });
  useEffect(() => {
    if (!session?.user?.email || !supabase) {
      setMustChange(false); setPwdExpiredMotivo("");
      setMfaState({ checked: false, needsEnrollment: false, needsChallenge: false, factorId: null, rolId: null });
      return;
    }
    const email = session.user.email.toLowerCase();
    (async () => {
      const { data } = await supabase.from("usuarios")
        .select("must_change_password, rol_id, password_changed_at, mfa_required")
        .eq("email", email).single();

      // 1) Cambio de password forzado (override todo)
      if (data?.must_change_password) {
        setMustChange(true);
        setPwdExpiredMotivo("Cambio obligatorio en primer ingreso o por instrucción de Gerencia.");
        setMfaState({ checked: true, needsEnrollment: false, needsChallenge: false, factorId: null, rolId: data?.rol_id || null });
        return;
      }
      if (data?.rol_id && aplicaCaducidad(data.rol_id)) {
        const dias = diasHastaCaducidad(data.password_changed_at);
        if (dias !== null && dias <= 0) {
          setMustChange(true);
          setPwdExpiredMotivo(`Tu contraseña expiró hace ${Math.abs(dias)} días (política Atolón · cambio cada ${PASSWORD_POLICY.maxAgeDays} días para rol ${data.rol_id}).`);
          setMfaState({ checked: true, needsEnrollment: false, needsChallenge: false, factorId: null, rolId: data.rol_id });
          return;
        }
      }
      setMustChange(false);
      setPwdExpiredMotivo("");

      // 2) MFA — aplica a roles sensibles (super_admin, admin) o si el
      //    super_admin marcó explícitamente mfa_required=true para este
      //    usuario en Usuarios.jsx. mfa_required=false exime aun siendo admin.
      if (aplicaMFAEffective(data?.rol_id, data?.mfa_required)) {
        const status = await getMFAStatus(supabase);
        if (status?.needsChallenge && status.verifiedTotp) {
          setMfaState({ checked: true, needsEnrollment: false, needsChallenge: true, factorId: status.verifiedTotp.id, rolId: data.rol_id });
          return;
        }
        if (status?.needsEnrollment) {
          setMfaState({ checked: true, needsEnrollment: true, needsChallenge: false, factorId: null, rolId: data.rol_id });
          return;
        }
      }
      setMfaState({ checked: true, needsEnrollment: false, needsChallenge: false, factorId: null, rolId: data?.rol_id || null });
    })();

    // Fire-and-forget: actualizar ultimo_acceso
    supabase.from("usuarios").update({ ultimo_acceso: new Date().toISOString() })
      .eq("email", email).then(() => {}).catch(() => {});
  }, [session]);

  const navigate = (mod) => setActiveModule(mod);

  const aplicarActualizacion = () => {
    try {
      if (typeof caches !== "undefined") {
        caches.keys()
          .then(ks => Promise.all(ks.map(k => caches.delete(k))))
          .finally(() => window.location.reload());
        return;
      }
    } catch { /* noop */ }
    window.location.reload();
  };

  const VersionBanner = () => nuevaVersion ? (
    <div
      onClick={aplicarActualizacion}
      title="Recargar para actualizar"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 99999,
        background: "#7C3AED", color: "#fff", textAlign: "center",
        padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
        boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
      }}
    >
      🔄 Hay una versión nueva de Atolon OS — clic aquí para actualizar
    </div>
  ) : null;

  // Listen for cross-module navigation requests (e.g. CXC → Reservas, Clientes → Reservas)
  useEffect(() => {
    const handler = (e) => {
      const { modulo, reservaId, clienteId } = e.detail || {};
      if (reservaId) window.__openReservaId = reservaId;
      if (clienteId) window.__openClienteId = clienteId;
      if (modulo) {
        // Remember previous module to return to it
        window.__previousModule = activeModule;
        setActiveModule(modulo);
      }
    };
    window.addEventListener("atolon-navigate", handler);

    // Listen for "go back" events
    const backHandler = () => {
      if (window.__previousModule) {
        setActiveModule(window.__previousModule);
        window.__previousModule = null;
      }
    };
    window.addEventListener("atolon-navigate-back", backHandler);

    return () => {
      window.removeEventListener("atolon-navigate", handler);
      window.removeEventListener("atolon-navigate-back", backHandler);
    };
  }, [activeModule]);

  // ── Detector de versión nueva desplegada ─────────────────────────────────
  // El SPA mantiene el JS viejo en memoria mientras navegas dentro de la app
  // (no re-descarga chunks ya cargados). Si Vercel desplegó otra versión, el
  // index servido referencia otro entry hash. Lo detectamos comparando contra
  // /booking (ruta SPA pública estable, sin redirect ni auth) y ofrecemos
  // recargar — sin auto-reload para no perder datos en formularios.
  useEffect(() => {
    const entryRe = /assets\/index-[A-Za-z0-9_-]+\.js/;
    const current = Array.from(document.querySelectorAll('script[type="module"]'))
      .map(s => (s.getAttribute("src") || "").match(entryRe)?.[0])
      .find(Boolean) || null;
    if (!current) return;
    let stop = false;
    const check = async () => {
      try {
        const res = await fetch("/booking", { cache: "no-store" });
        if (!res.ok) return;
        const html = await res.text();
        const deployed = html.match(entryRe)?.[0];
        if (deployed && deployed !== current && !stop) setNuevaVersion(true);
      } catch { /* offline — ignorar */ }
    };
    const t  = setTimeout(check, 45000);
    const id = setInterval(check, 150000);
    return () => { stop = true; clearTimeout(t); clearInterval(id); };
  }, []);

  // AtolanTrack: page_view on public route load
  useEffect(() => {
    const publicTrackRoutes = ["booking", "pago", ""];
    const isTrackable = publicTrackRoutes.some(r => route === r || route.startsWith(r + "/") || route.startsWith("pago"));
    if (isTrackable) {
      AtolanTrack.init().then(() => AtolanTrack.pageView("/" + route));
      // Cargar píxeles de terceros configurados en /track (una sola vez).
      if (!window.__pixelsInit) {
        window.__pixelsInit = true;
        supabase.from("configuracion")
          .select("meta_pixel_id, gtm_id, ga4_id, google_ads_id, tiktok_pixel_id")
          .eq("id", "atolon").single()
          .then(({ data }) => { if (data) initTracking(data); })
          .catch(() => {});
      }
    }
  }, [route]);

  // Public routes — show WhatsApp button
  const isPublic = ["empleados", "agencia", "booking", "", "reset-password", "zarpe-info", "despedidas", "contratistas"].includes(route) || route.startsWith("pago") || route.startsWith("booking/") || route.startsWith("m/") || route.startsWith("room/") || route.startsWith("despedidas/") || route.startsWith("contratistas/") || route.startsWith("verificar/");

  // Always-public routes (no auth needed ever)
  if (route === "track" || route.startsWith("track/")) return <TrackExterno />;
  if (route === "blueapple-pax") return <BlueApplePaxPublic />;
  if (route === "blueapple" || route.startsWith("blueapple/")) return <BlueApplePortal />;
  if (route === "juicy" || route === "juicyandcream") return <JuicyCream />;
  if (route === "juicy-organizador" || route === "juice-organizador") return <JuicyOrganizador />;
  if (route === "cajas")           return <CajasExpress />;
  if (route === "cajas-admin")     return <CajasExpressAdmin />;
  if (route === "cajas-imprimir")  return <CajasImpresion />;
  if (route === "cajas-setup")     return <CajasSetup />;
  if (route === "empleados")      return <><EmpleadoPortal /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "agencia" || route === "") return <><AgenciaPortal /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "carreras" || route.startsWith("carreras/")) return <><ReclutamientoPortal /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "booking/lasamericas" || route === "las-americas") return <LasAmericasPortal />;
  if (route === "gran-fondo" || route === "nairo") return <GranFondoNairo />;
  if (route === "booking" || route.startsWith("booking/")) return <><BookingPopup /><WhatsAppFloat phone={waPhone} /></>;
  if (route.startsWith("pago"))   return <><PagoCliente /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "reset-password") return <><ResetPassword /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "zarpe-info")     return <><ZarpeInfo /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "escanear-productos" || route === "escanear") return <EscanearProductos />;
  if (route === "zarpe-grupo")    return <><ZarpeGrupo /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "dia-de-la-madre" || route === "madres") return <DiaDeLaMadre />;
  if (route === "despedidas" || route.startsWith("despedidas/")) return <><Despedidas /><WhatsAppFloat phone={waPhone} /></>;
  if (route === "contratistas" || route === "contratistas/exito") return <ContratistasPortal />;
  if (route.startsWith("contratistas/curso/")) return <ContratistasCurso token={route.slice("contratistas/curso/".length)} />;
  if (route.startsWith("contratistas/registro/")) {
    // /contratistas/registro/<eventoId>            → modo nuevo
    // /contratistas/registro/<eventoId>/<token>    → modo gestión
    const rest = route.slice("contratistas/registro/".length);
    const [evId, tk] = rest.split("/");
    return <ContratistasRegistro eventoId={evId} token={tk || null} />;
  }
  if (route.startsWith("verificar/")) return <ContratistasVerificar code={route.slice("verificar/".length)} />;
  if (route === "society")        return <VIPPortal />;
  if (route === "checkin-pax")    return <SelfCheckIn />;
  if (route.startsWith("m/"))     return <GuestPortal token={route.slice(2)} />;
  if (route.startsWith("room/"))  return <RoomQRLanding idOrNumero={decodeURIComponent(route.slice(5))} />;
  if (route.startsWith("pool/"))  return <PoolServicePortal qr={decodeURIComponent(route.slice(5))} />;
  if (route === "meseros")        return <MeseroPortal />;
  if (route.startsWith("staff/")) return <StaffView eventoId={route.slice(6)} />;
  if (route === "housekeeping/inspeccion") return <HousekeepingInspection />;
  if (route.startsWith("housekeeping/")) return <CamareraPortal token={route.slice(13)} />;

  // Loading auth state — mostrar spinner mientras se verifica sesión (evita pantalla azul en Chrome PC)
  if (!appReady) return <LoadingScreen />;

  // /resultados: si está autenticado → OS con módulo activo; si no → viewer público con clave
  if (route === "resultados") {
    if (session) {
      // Usuario autenticado: mostrar OS con Resultados activo
      return (
        <ErrorBoundary>
          <AtolanOS
            activeModule="resultados"
            onNavigate={navigate}
            moduleContent={MODULE_MAP["resultados"]}
            userEmail={session.user?.email}
          />
        </ErrorBoundary>
      );
    }
    return <ResultadosViewer />;
  }

  // /track: portal de la agencia (AtolonTrack). Autenticado → OS con módulo
  // analitica; si no → viewer público con clave (Analitica modo externo).
  if (route === "track") {
    if (session) {
      return (
        <ErrorBoundary>
          <AtolanOS
            activeModule="analitica"
            onNavigate={navigate}
            moduleContent={MODULE_MAP["analitica"]}
            userEmail={session.user?.email}
          />
        </ErrorBoundary>
      );
    }
    return <TrackViewer />;
  }

  // /login: show login form if not authenticated, else fall through to OS
  if (route === "login" && !session) return <><Login /><WhatsAppFloat phone={waPhone} /></>;

  // Not logged in from any other route
  if (!session) return <><Login /><WhatsAppFloat phone={waPhone} /></>;

  // Logged in but must change password first
  if (mustChange) return <ForceChangePassword userEmail={session.user.email} motivo={pwdExpiredMotivo} onDone={() => setMustChange(false)} />;

  // KPMG C-2 · MFA gate — bloquear OS hasta que el segundo factor se complete
  if (mfaState.checked && mfaState.needsChallenge && mfaState.factorId) {
    return (
      <MFAChallenge
        factorId={mfaState.factorId}
        userEmail={session.user.email}
        onDone={() => setMfaState(s => ({ ...s, needsChallenge: false }))}
        onCancel={() => setSession(null)}
      />
    );
  }
  if (mfaState.checked && mfaState.needsEnrollment) {
    return (
      <MFAEnrollment
        userEmail={session.user.email}
        motivo={`Tu rol "${mfaState.rolId}" exige autenticación en 2 pasos (política Atolón · KPMG C-2). Configurá tu app de autenticación ahora.`}
        onDone={() => setMfaState(s => ({ ...s, needsEnrollment: false }))}
      />
    );
  }

  // Logged in — show OS (internal, no WhatsApp button)
  return (
    <ErrorBoundary>
      <VersionBanner />
      <AtolanOS
        activeModule={activeModule}
        onNavigate={navigate}
        moduleContent={MODULE_MAP[activeModule] || null}
        userEmail={session.user?.email}
      />
    </ErrorBoundary>
  );
}
