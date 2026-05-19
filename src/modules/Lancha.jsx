// Lancha.jsx — Bitácora operativa por embarcación
// Tabs por lancha (Castillete, Naturalle, …) con:
//   · Resumen (KPIs: gasto mes, galones mes, próximo servicio, horas motor)
//   · Combustible (cargas)
//   · Mantenimiento / Reparaciones
//   · Incidentes
//   · Viajes (viene de muelle_zarpes_flota)
//   · Configuración de la lancha

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import CostosFlotaTab from "../components/CostosFlotaTab";
import MotoresTab from "../components/MotoresTab";

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const TIPOS = [
  { k: "combustible",    l: "⛽ Combustible",      c: B.warning },
  { k: "mantenimiento",  l: "🔧 Mantenimiento",    c: B.sky },
  { k: "reparacion",     l: "🛠️ Reparación",       c: "#ec4899" },
  { k: "inspeccion",     l: "🔍 Inspección",       c: B.sand },
  { k: "limpieza",       l: "🧼 Limpieza",         c: "#34d399" },
  { k: "marina",         l: "🅿️ Marina/Parqueo",   c: "#22d3ee" },
  { k: "capitanes",      l: "👨‍✈️ Capitanes",       c: "#fb923c" },
  { k: "incidente",      l: "⚠️ Incidente",        c: B.danger },
  { k: "viaje",          l: "⛵ Viaje",            c: "#a78bfa" },
  { k: "otro",           l: "📋 Otro",             c: "rgba(255,255,255,0.4)" },
];

const TIPOS_MANTENIMIENTO = ["mantenimiento", "reparacion", "inspeccion", "limpieza"];
const TIPOS_OPERATIVOS    = ["marina", "capitanes"];

const SEVERIDADES = [
  { k: "leve",     l: "Leve",     c: B.success },
  { k: "moderada", l: "Moderada", c: B.warning },
  { k: "grave",    l: "Grave",    c: "#f97316" },
  { k: "critica",  l: "Crítica",  c: B.danger },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => todayStr().slice(0, 7);
const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtFecha = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtFechaCorta = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—";
const fmtHora = (h) => h ? h.slice(0, 5) : "";
const uid = () => "BIT-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

export default function Lancha() {
  const [lanchas, setLanchas] = useState([]);
  const [bitacora, setBitacora] = useState([]);
  const [zarpes, setZarpes] = useState([]);
  const [llegadas, setLlegadas] = useState([]); // muelle_llegadas para computar viajes
  const [capitanes, setCapitanes] = useState([]);
  const [empleados, setEmpleados] = useState([]); // de rh_empleados (para vincular nómina)
  const [loading, setLoading] = useState(true);
  const [activeLancha, setActiveLancha] = useState(null);
  const [tab, setTab] = useState("resumen");
  const [modal, setModal] = useState(null); // { tipo, edit? }
  const [configModal, setConfigModal] = useState(false);
  const [capitanModal, setCapitanModal] = useState(null); // { edit? }

  const [loadErrors, setLoadErrors] = useState([]);
  const [esSuper, setEsSuper] = useState(false); // solo super admin puede borrar viajes

  // ¿El usuario es super admin? (roles.permisos["*"])
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;
        const { data: u } = await supabase.from("usuarios").select("rol_id").eq("email", user.email).maybeSingle();
        if (!u?.rol_id) return;
        const { data: rol } = await supabase.from("roles").select("permisos").eq("id", u.rol_id).maybeSingle();
        if (rol?.permisos?.["*"]) setEsSuper(true);
      } catch (_) { /* sin permiso de borrado */ }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErrors([]);
    // Idempotente: asegura cargos recurrentes del mes actual (marina + capitanes terceros)
    supabase.rpc("generar_marina_mes").then(() => {});
    supabase.rpc("generar_capitanes_mes").then(() => {});
    // Filtrar bitacora/zarpes/llegadas a últimos 90 días para no traer
    // años de histórico al cambiar de módulo.
    const noventaAtras = new Date();
    noventaAtras.setDate(noventaAtras.getDate() - 90);
    const desde = noventaAtras.toISOString().slice(0, 10);
    // Ejecutamos cada query con allSettled + capturamos errores específicos.
    // Antes con Promise.all si UNA query fallaba, todas se descartaban y el
    // módulo aparecía vacío sin pista de qué pasó. Ahora cada una falla en
    // aislamiento y el resto de la data se muestra.
    const [lR, bR, zR, llR, cR, eR] = await Promise.allSettled([
      supabase.from("lanchas").select("*").eq("activo", true).order("nombre"),
      supabase.from("lancha_bitacora").select("*").gte("fecha", desde).order("fecha", { ascending: false }).order("hora", { ascending: false }).limit(500),
      supabase.from("muelle_zarpes_flota").select("*").gte("fecha", desde).order("fecha", { ascending: false }).limit(500),
      // Incluir AMBOS tipos lancha_atolon (singular = pasadía) y lanchas_atolon
      // (plural = staff/provisiones) + columnas de odómetro/foto para que
      // ResumenTab pueda surfacear las lecturas pendientes.
      supabase.from("muelle_llegadas")
        .select("id, fecha, hora_llegada, embarcacion_nombre, tipo, pax_a, pax_n, boca_chica, odometro_foto_url, motores_horas, foto_url, notas")
        .in("tipo", ["lancha_atolon", "lanchas_atolon"])
        .gte("fecha", desde).order("fecha", { ascending: false }).limit(500),
      supabase.from("capitanes_flota").select("*").eq("activo", true).order("nombre"),
      supabase.from("rh_empleados").select("id, nombres, apellidos, cedula, telefono, email, cargo, salario_base, activo").eq("activo", true).order("nombres"),
    ]);
    // Helper: extrae data o reporta error con label de tabla.
    const errs = [];
    const pick = (label, settled) => {
      if (settled.status === "rejected") {
        errs.push({ tabla: label, error: settled.reason?.message || String(settled.reason) });
        console.error(`[Lancha] query ${label} rejected:`, settled.reason);
        return [];
      }
      const { data, error } = settled.value || {};
      if (error) {
        errs.push({ tabla: label, error: error.message || String(error) });
        console.error(`[Lancha] query ${label} error:`, error);
        return [];
      }
      return data || [];
    };
    const lanchasArr = pick("lanchas", lR);
    const bitacoraArr = pick("lancha_bitacora", bR);
    const zarpesArr = pick("muelle_zarpes_flota", zR);
    const llegadasArr = pick("muelle_llegadas", llR);
    const capitanesArr = pick("capitanes_flota", cR);
    const empleadosArr = pick("rh_empleados", eR);
    setLanchas(lanchasArr);
    setBitacora(bitacoraArr);
    setZarpes(zarpesArr);
    setLlegadas(llegadasArr);
    setCapitanes(capitanesArr);
    setEmpleados(empleadosArr);
    setLoadErrors(errs);
    if (!activeLancha && lanchasArr.length) setActiveLancha(lanchasArr[0].id);
    setLoading(false);
  }, [activeLancha]);
  useEffect(() => { load(); }, []); // eslint-disable-line

  // Solo super admin: eliminar un zarpe (muelle_zarpes_flota) o llegada
  // (muelle_llegadas) incorrecto. Recalcula los viajes al recargar.
  const onEliminarViaje = useCallback(async (tabla, id, label) => {
    if (!esSuper || !id) return;
    if (!window.confirm(`¿Eliminar este registro (${label})?\n\nEsta acción no se puede deshacer y recalculará los viajes.`)) return;
    const { error } = await supabase.from(tabla).delete().eq("id", id);
    if (error) { alert("No se pudo eliminar:\n" + error.message); return; }
    load();
  }, [esSuper, load]);

  const lancha = lanchas.find(l => l.id === activeLancha);
  const bitacoraLancha = useMemo(() => bitacora.filter(b => b.lancha_id === activeLancha), [bitacora, activeLancha]);
  // Normaliza nombre: lowercase, sin tildes, colapsa letras repetidas.
  // Esto permite que "Natturale" y "Naturalle" matcheen como la misma lancha.
  const normNombre = (s) => (s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(.)\1+/g, "$1").trim();
  const zarpesLancha = useMemo(() => {
    if (!lancha) return [];
    const target = normNombre(lancha.nombre);
    // Boca Chica = parqueo, no es viaje real → se excluye del conteo de viajes
    return zarpes.filter(z => z.embarcacion && normNombre(z.embarcacion) === target && !z.boca_chica);
  }, [zarpes, lancha]);
  const llegadasLancha = useMemo(() => {
    if (!lancha) return [];
    const target = normNombre(lancha.nombre);
    return llegadas.filter(l => l.embarcacion_nombre && normNombre(l.embarcacion_nombre) === target && !l.boca_chica);
  }, [llegadas, lancha]);
  const capitanesLancha = useMemo(() => capitanes.filter(c => c.lancha_id === activeLancha), [capitanes, activeLancha]);

  // ─── Viajes computados por fecha ─────────────────────────────────────
  // Lógica: cada llegada se parea con el siguiente zarpe del mismo barco.
  // Si hay 2 llegadas seguidas → zarpe perdido. Si hay 2 zarpes seguidos
  // → llegada perdida. # viajes = max(llegadas, zarpes) por día.
  const viajesPorFecha = useMemo(() => {
    const byDate = {}; // fecha → { llegadas: [{hora}], zarpes: [{hora}] }
    llegadasLancha.forEach(l => {
      const f = (l.fecha || "").slice(0, 10);
      if (!f) return;
      (byDate[f] ||= { llegadas: [], zarpes: [] }).llegadas.push({
        id: l.id,
        hora: (l.hora_llegada || "").slice(0, 5),
        pax_a: l.pax_a || 0,
        pax_n: l.pax_n || 0,
      });
    });
    zarpesLancha.forEach(z => {
      const f = (z.fecha || "").slice(0, 10);
      if (!f) return;
      (byDate[f] ||= { llegadas: [], zarpes: [] }).zarpes.push({
        id: z.id,
        hora: (z.hora_zarpe || "").slice(0, 5),
        destino: z.destino,
        pax_a: z.pax_a || 0,
        pax_n: z.pax_n || 0,
      });
    });
    // Ordenar y construir pareo por fecha
    const fechas = Object.keys(byDate).sort().reverse();
    return fechas.map(fecha => {
      const d = byDate[fecha];
      d.llegadas.sort((a, b) => a.hora.localeCompare(b.hora));
      d.zarpes.sort((a, b) => a.hora.localeCompare(b.hora));
      // Pareo cronológico
      const pares = [];
      let pendienteA = null;
      const eventos = [
        ...d.llegadas.map(l => ({ ...l, tipo: "L" })),
        ...d.zarpes.map(z => ({ ...z, tipo: "Z" })),
      ].sort((a, b) => a.hora.localeCompare(b.hora));
      eventos.forEach(ev => {
        if (ev.tipo === "L") {
          if (pendienteA) pares.push({ llegada: pendienteA, zarpe: null }); // zarpe perdido
          pendienteA = ev;
        } else {
          if (pendienteA) {
            pares.push({ llegada: pendienteA, zarpe: ev });
            pendienteA = null;
          } else {
            pares.push({ llegada: null, zarpe: ev }); // llegada perdida
          }
        }
      });
      if (pendienteA) pares.push({ llegada: pendienteA, zarpe: null });
      const viajes = Math.max(d.llegadas.length, d.zarpes.length);
      return {
        fecha,
        llegadas: d.llegadas.length,
        zarpes: d.zarpes.length,
        viajes,
        pares,
      };
    });
  }, [llegadasLancha, zarpesLancha]);

  // Costo por viaje (ida y vuelta) = 2 × costo_viaje_sencillo
  const costoPorViaje = useMemo(() => {
    if (!lancha) return 0;
    return Number(lancha.costo_viaje_sencillo || 0) * 2;
  }, [lancha]);

  // KPIs por mes con SELECTOR. Default = mes actual, pero si está vacío
  // (típico el 1ro de mes antes de cargar operaciones) cae al último mes
  // con datos. Así nunca aparece todo en $0 sin razón. El usuario puede
  // navegar a otros meses con flechas ‹ ›.
  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    bitacoraLancha.forEach(b => { if (b.fecha) set.add(b.fecha.slice(0, 7)); });
    viajesPorFecha.forEach(v => { if (v.fecha) set.add(v.fecha.slice(0, 7)); });
    set.add(thisMonth()); // siempre incluir el actual aunque esté vacío
    return [...set].sort().reverse(); // más reciente primero
  }, [bitacoraLancha, viajesPorFecha]);

  const [mesKpi, setMesKpi] = useState(null);
  // Auto-seleccionar: mes actual si tiene datos, sino el más reciente con datos.
  useEffect(() => {
    if (mesKpi || mesesDisponibles.length === 0) return;
    const actual = thisMonth();
    const hayDatosEnActual = bitacoraLancha.some(b => (b.fecha || "").startsWith(actual))
      || viajesPorFecha.some(v => v.fecha.startsWith(actual));
    setMesKpi(hayDatosEnActual ? actual : mesesDisponibles[0]);
  }, [mesesDisponibles, bitacoraLancha, viajesPorFecha, mesKpi]);

  const kpis = useMemo(() => {
    const mes = mesKpi || thisMonth();
    const delMes = bitacoraLancha.filter(b => (b.fecha || "").startsWith(mes));
    const combustibleMes = delMes.filter(b => b.tipo === "combustible");
    const galonesMes = combustibleMes.reduce((s, b) => s + Number(b.galones || 0), 0);
    const gastoCombustibleMes = combustibleMes.reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const gastoMantMes = delMes.filter(b => TIPOS_MANTENIMIENTO.includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const gastoOperativosMes = delMes.filter(b => TIPOS_OPERATIVOS.includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const gastoMarinaMes    = delMes.filter(b => b.tipo === "marina").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    const gastoCapitanesMes = delMes.filter(b => b.tipo === "capitanes").reduce((s, b) => s + Number(b.costo_total || 0), 0);
    // ÚLTIMAS HORAS DE MOTOR (por motor, no sumadas)
    // Fuentes:
    //   1. lancha_bitacora.kilometraje_h (registro manual: una sola cifra)
    //   2. muelle_llegadas.motores_horas (jsonb {Babor, Estribor, Centro, ...})
    //   3. muelle_zarpes_flota.motores_horas (mismo formato)
    // Tomamos la lectura MÁS RECIENTE y la mostramos desglosada por motor.
    const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/(.)\1+/g, "$1").trim();
    const target = norm(lancha?.nombre);
    const lecturasHoras = [
      ...bitacoraLancha
        .filter(b => b.kilometraje_h != null && Number(b.kilometraje_h) > 0)
        .map(b => ({ ts: (b.fecha || "") + (b.hora || "00:00"), horas: { Total: Number(b.kilometraje_h) || 0 } })),
      ...(llegadas || [])
        .filter(l => l.motores_horas && lancha && norm(l.embarcacion_nombre) === target)
        .map(l => ({ ts: (l.fecha || "") + (l.hora_llegada || "00:00"), horas: l.motores_horas || {} })),
      ...(zarpes || [])
        .filter(z => z.motores_horas && lancha && norm(z.embarcacion) === target)
        .map(z => ({ ts: (z.fecha || "") + (z.hora_zarpe || "00:00"), horas: z.motores_horas || {} })),
    ].filter(x => x.horas && Object.keys(x.horas).length > 0)
     .sort((a, b) => b.ts.localeCompare(a.ts));
    // Objeto {motor: horas} de la lectura más reciente, o {} si no hay
    const ultimoHoras = lecturasHoras[0]?.horas || {};
    const proxServ = bitacoraLancha.find(b => b.proximo_servicio_h || b.proximo_servicio_fecha);
    const viajesMes = viajesPorFecha.filter(v => v.fecha.startsWith(mes)).reduce((s, v) => s + v.viajes, 0);
    const costoCombustibleViajesMes = viajesMes * costoPorViaje;
    const gastoViajesMes = 0;
    const incidentesAbiertos = bitacoraLancha.filter(b => b.tipo === "incidente" && !b.resuelto).length;
    return { galonesMes, gastoCombustibleMes, gastoMantMes, gastoOperativosMes, gastoMarinaMes, gastoCapitanesMes, ultimoHoras, proxServ, viajesMes, costoCombustibleViajesMes, gastoViajesMes, incidentesAbiertos };
  }, [bitacoraLancha, viajesPorFecha, costoPorViaje, mesKpi, llegadas, zarpes, lancha]);

  // Helpers para navegación de mes ‹ ›
  const idxMesActual = mesesDisponibles.indexOf(mesKpi);
  const irMesAnterior = () => { if (idxMesActual < mesesDisponibles.length - 1) setMesKpi(mesesDisponibles[idxMesActual + 1]); };
  const irMesSiguiente = () => { if (idxMesActual > 0) setMesKpi(mesesDisponibles[idxMesActual - 1]); };
  const fmtMesLabel = (ym) => {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    const nombres = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${nombres[Number(m) - 1]} ${y}`;
  };

  async function saveEvento(data) {
    const payload = {
      lancha_id: activeLancha,
      lancha_nombre: lancha?.nombre,
      fecha: data.fecha || todayStr(),
      hora: data.hora || null,
      tipo: data.tipo,
      subtipo: data.subtipo || null,
      descripcion: data.descripcion || null,
      galones: data.galones ? Number(data.galones) : null,
      precio_galon: data.precio_galon ? Number(data.precio_galon) : null,
      costo_total: data.costo_total ? Number(data.costo_total) : null,
      kilometraje_h: data.kilometraje_h ? Number(data.kilometraje_h) : null,
      proveedor: data.proveedor || null,
      taller: data.taller || null,
      proximo_servicio_h: data.proximo_servicio_h ? Number(data.proximo_servicio_h) : null,
      proximo_servicio_fecha: data.proximo_servicio_fecha || null,
      severidad: data.severidad || null,
      resuelto: !!data.resuelto,
      foto_url: data.foto_url || null,
      factura_url: data.factura_url || null,
      capitan: data.capitan || null,
      notas: data.notas || null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const r = await supabase.from("lancha_bitacora").update(payload).eq("id", data.id);
      if (r.error) return r.error;
    } else {
      const r = await supabase.from("lancha_bitacora").insert({ id: uid(), ...payload });
      if (r.error) return r.error;
    }
    setModal(null);
    load();
  }

  async function borrarEvento(id) {
    if (!confirm("¿Eliminar este registro?")) return;
    await supabase.from("lancha_bitacora").delete().eq("id", id);
    load();
  }

  async function toggleResuelto(item) {
    await supabase.from("lancha_bitacora").update({ resuelto: !item.resuelto, updated_at: new Date().toISOString() }).eq("id", item.id);
    load();
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;
  }

  if (!lancha) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>🚤</div>
        <div style={{ fontSize: 16, color: "#fff", marginBottom: 12 }}>Sin lanchas activas</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
          Crea una lancha para llevar su bitácora.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#fff", minHeight: "100vh", background: B.navy }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>🚤 Bitácora de Lanchas</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Combustible, mantenimiento, viajes e incidentes por embarcación.</div>
        </div>
      </div>

      {/* Error banner — mostrar qué query falló para diagnóstico */}
      {loadErrors.length > 0 && (
        <div style={{ marginBottom: 14, padding: "12px 14px", background: B.danger + "22", border: `1px solid ${B.danger}55`, borderRadius: 10, color: "#fca5a5", fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Error cargando datos:</div>
          {loadErrors.map((e, i) => (
            <div key={i} style={{ fontFamily: "monospace", marginTop: 2 }}>
              · <strong>{e.tabla}</strong>: {e.error}
            </div>
          ))}
        </div>
      )}

      {/* Tabs por lancha */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {lanchas.map(l => (
          <button key={l.id} onClick={() => setActiveLancha(l.id)}
            style={{
              padding: "12px 20px", borderRadius: 12, border: "none", cursor: "pointer",
              background: activeLancha === l.id ? B.sky : B.navyMid,
              color: activeLancha === l.id ? B.navy : "#fff",
              fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8,
            }}>
            <span style={{ fontSize: 18 }}>⛵</span>
            {l.nombre}
          </button>
        ))}
        <button onClick={() => setConfigModal(true)}
          style={{ padding: "12px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: B.navyLight, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
          ⚙ Config
        </button>
      </div>

      {/* Info header de la lancha */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {lancha.foto_url ? (
          <img src={lancha.foto_url} alt={lancha.nombre} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 10 }} />
        ) : (
          <div style={{ width: 80, height: 80, borderRadius: 10, background: B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>⛵</div>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{lancha.nombre}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {lancha.matricula && <span>📋 {lancha.matricula}</span>}
            {lancha.capacidad_pax && <span>👥 {lancha.capacidad_pax} pax</span>}
            {lancha.capacidad_tanque_gal && <span>⛽ {lancha.capacidad_tanque_gal} gal</span>}
            {lancha.motor && <span>⚙ {lancha.motor}</span>}
            {lancha.capitan_default && <span>👨‍✈️ {lancha.capitan_default}</span>}
          </div>
        </div>
      </div>

      {/* Selector de mes para KPIs ─ default: actual o último con datos */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>KPIs del mes:</span>
        <button onClick={irMesAnterior}
          disabled={idxMesActual >= mesesDisponibles.length - 1}
          style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${B.navyLight}`, background: "transparent", color: idxMesActual >= mesesDisponibles.length - 1 ? "rgba(255,255,255,0.2)" : "#fff", cursor: idxMesActual >= mesesDisponibles.length - 1 ? "default" : "pointer", fontSize: 12 }}>
          ‹
        </button>
        <select value={mesKpi || ""} onChange={e => setMesKpi(e.target.value)}
          style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: "#fff", fontSize: 12, minWidth: 120 }}>
          {mesesDisponibles.map(m => <option key={m} value={m}>{fmtMesLabel(m)}</option>)}
        </select>
        <button onClick={irMesSiguiente}
          disabled={idxMesActual <= 0}
          style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${B.navyLight}`, background: "transparent", color: idxMesActual <= 0 ? "rgba(255,255,255,0.2)" : "#fff", cursor: idxMesActual <= 0 ? "default" : "pointer", fontSize: 12 }}>
          ›
        </button>
        {mesKpi && mesKpi !== thisMonth() && (
          <span style={{ fontSize: 10, color: B.sand, fontStyle: "italic" }}>
            (mes actual sin datos — mostrando último con operación)
          </span>
        )}
      </div>

      {/* KPIs del mes seleccionado */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Galones",             v: `${kpis.galonesMes.toFixed(1)} gal`, c: B.warning },
          { l: "Combustible",         v: fmtCOP(kpis.gastoCombustibleMes),    c: B.warning },
          { l: "Mant./Rep.",          v: fmtCOP(kpis.gastoMantMes),           c: B.sky },
          { l: "Marina",              v: fmtCOP(kpis.gastoMarinaMes),         c: "#22d3ee" },
          { l: "Capitanes",           v: fmtCOP(kpis.gastoCapitanesMes),      c: "#fb923c" },
          // Horas motor: si la lectura tiene varios motores (ej Naturalle:
          // {Babor, Estribor}), mostrarlos por separado en lugar de sumarlos.
          (() => {
            const horas = kpis.ultimoHoras || {};
            const entries = Object.entries(horas).filter(([, v]) => Number(v) > 0);
            return { l: "Horas motor", motores: entries, c: B.sand };
          })(),
          { l: "Incidentes abiertos", v: kpis.incidentesAbiertos,             c: kpis.incidentesAbiertos > 0 ? B.danger : B.success },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navyMid, padding: 12, borderRadius: 10, borderLeft: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
            {k.motores ? (
              k.motores.length === 0 ? (
                <div style={{ fontSize: 18, fontWeight: 800, color: k.c, marginTop: 2 }}>0 h</div>
              ) : k.motores.length === 1 && k.motores[0][0] === "Total" ? (
                // Bitácora manual: solo un valor "Total"
                <div style={{ fontSize: 18, fontWeight: 800, color: k.c, marginTop: 2 }}>
                  {Number(k.motores[0][1]).toFixed(0)} h
                </div>
              ) : (
                <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                  {k.motores.map(([nombre, valor]) => (
                    <div key={nombre} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 14, fontWeight: 700, color: k.c }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.04em", minWidth: 52 }}>{nombre}</span>
                      <span>{Number(valor).toFixed(0)} h</span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div style={{ fontSize: 18, fontWeight: 800, color: k.c, marginTop: 2 }}>{k.v}</div>
            )}
          </div>
        ))}
      </div>

      {/* Tabs internos */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { k: "resumen",       l: "📊 Resumen" },
          { k: "costos",        l: "💸 Costos" },
          { k: "motores",       l: "🛠️ Motores" },
          { k: "combustible",   l: "⛽ Combustible" },
          { k: "mantenimiento", l: "🔧 Mantenimiento" },
          { k: "operativos",    l: "🅿️ Operativos" },
          { k: "capitanes",     l: `👨‍✈️ Capitanes (${capitanesLancha.length})` },
          { k: "incidentes",    l: "⚠️ Incidentes" },
          { k: "viajes",        l: `⛵ Viajes (${viajesPorFecha.reduce((s, v) => s + v.viajes, 0)})` },
          { k: "todos",         l: "📋 Todo" },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={BTN(tab === t.k ? B.sky : B.navyMid, tab === t.k ? B.navy : "#fff")}>
            {t.l}
          </button>
        ))}
      </div>

      {/* Botón agregar */}
      {tab !== "viajes" && tab !== "resumen" && tab !== "capitanes" && tab !== "costos" && tab !== "motores" && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setModal({ tipo: defaultTipoForTab(tab) })}
            style={BTN(B.success)}>
            + Nuevo registro
          </button>
        </div>
      )}

      {tab === "resumen" && (
        <ResumenTab bitacora={bitacoraLancha} zarpes={zarpesLancha} llegadas={llegadas} zarpesAll={zarpes} lancha={lancha} onReload={load} />
      )}
      {tab === "costos" && (
        <CostosFlotaTab lanchaId={activeLancha} />
      )}
      {tab === "motores" && (
        <MotoresTab activeLancha={activeLancha} lanchas={lanchas} />
      )}
      {tab === "combustible" && (
        <ListaEventos
          items={bitacoraLancha.filter(b => b.tipo === "combustible")}
          onEdit={(e) => setModal({ tipo: "combustible", edit: e })}
          onDelete={borrarEvento}
        />
      )}
      {tab === "mantenimiento" && (
        <ListaEventos
          items={bitacoraLancha.filter(b => TIPOS_MANTENIMIENTO.includes(b.tipo))}
          onEdit={(e) => setModal({ tipo: e.tipo, edit: e })}
          onDelete={borrarEvento}
        />
      )}
      {tab === "operativos" && (
        <ListaEventos
          items={bitacoraLancha.filter(b => TIPOS_OPERATIVOS.includes(b.tipo))}
          onEdit={(e) => setModal({ tipo: e.tipo, edit: e })}
          onDelete={borrarEvento}
        />
      )}
      {tab === "capitanes" && (
        <ListaCapitanes
          capitanes={capitanesLancha}
          onAdd={() => setCapitanModal({})}
          onEdit={(c) => setCapitanModal({ edit: c })}
          onDelete={async (id) => {
            if (!confirm("¿Eliminar capitán? (Los pagos ya registrados quedan en bitácora)")) return;
            await supabase.from("capitanes_flota").update({ activo: false }).eq("id", id);
            load();
          }}
        />
      )}
      {tab === "incidentes" && (
        <ListaEventos
          items={bitacoraLancha.filter(b => b.tipo === "incidente")}
          onEdit={(e) => setModal({ tipo: "incidente", edit: e })}
          onDelete={borrarEvento}
          onToggleResuelto={toggleResuelto}
        />
      )}
      {tab === "viajes" && (
        <ListaViajesComputados viajesPorFecha={viajesPorFecha} costoPorViaje={costoPorViaje} esSuper={esSuper} onEliminarViaje={onEliminarViaje} />
      )}
      {tab === "todos" && (
        <ListaEventos
          items={bitacoraLancha}
          onEdit={(e) => setModal({ tipo: e.tipo, edit: e })}
          onDelete={borrarEvento}
          onToggleResuelto={toggleResuelto}
        />
      )}

      {modal && (
        <EventoModal
          tipo={modal.tipo}
          edit={modal.edit}
          onClose={() => setModal(null)}
          onSave={saveEvento}
          capitanDefault={lancha.capitan_default}
        />
      )}
      {configModal && (
        <ConfigLanchaModal
          lancha={lancha}
          onClose={() => setConfigModal(false)}
          onSaved={() => { setConfigModal(false); load(); }}
        />
      )}
      {capitanModal && (
        <CapitanModal
          edit={capitanModal.edit}
          lancha={lancha}
          empleados={empleados}
          capitanesAsignados={capitanes}
          onClose={() => setCapitanModal(null)}
          onSaved={() => { setCapitanModal(null); load(); }}
        />
      )}
    </div>
  );
}

function defaultTipoForTab(tab) {
  if (tab === "combustible") return "combustible";
  if (tab === "mantenimiento") return "mantenimiento";
  if (tab === "operativos") return "marina";
  if (tab === "incidentes") return "incidente";
  return "combustible";
}

// ─── Resumen tab ───────────────────────────────────────────────────────────
// ─── Lecturas de odómetro ──────────────────────────────────────────────
// Muestra las fotos de odómetro y horas registradas desde el muelle
// (ya sea llegadas o zarpes). Si una lectura tiene foto pero NO horas,
// permite al manager capturarlas viendo la foto. Modal con zoom + inputs.
function LecturasOdometro({ lecturas, onReload }) {
  const [editar, setEditar] = useState(null); // lectura siendo editada
  const sinHoras = lecturas.filter(l => !l.horas || Object.keys(l.horas).length === 0);
  const conHoras = lecturas.filter(l => l.horas && Object.keys(l.horas).length > 0);

  const guardarHoras = async (lec, horas) => {
    // Construir el objeto motores_horas tal como lo escribe el form del muelle
    const cleaned = {};
    Object.entries(horas).forEach(([k, v]) => {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) cleaned[k] = n;
    });
    if (Object.keys(cleaned).length === 0) {
      alert("Ingresá al menos un valor de horas para guardar.");
      return;
    }
    const { error } = await supabase.from(lec.tabla).update({ motores_horas: cleaned }).eq("id", lec.id);
    if (error) { alert("Error: " + error.message); return; }
    setEditar(null);
    onReload?.();
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>📸 Lecturas de odómetro</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
          {conHoras.length} con horas · {sinHoras.length > 0 && <span style={{ color: B.warning, fontWeight: 700 }}>{sinHoras.length} pendiente{sinHoras.length === 1 ? "" : "s"}</span>}
        </div>
      </div>

      {sinHoras.length > 0 && (
        <div style={{ marginBottom: 12, padding: "10px 12px", background: B.warning + "22", border: `1px solid ${B.warning}55`, borderRadius: 8, fontSize: 12, color: B.warning }}>
          ⚠ Hay {sinHoras.length} foto{sinHoras.length === 1 ? "" : "s"} de odómetro sin horas registradas. Capturá las horas leyendo cada foto para que entren al cálculo de reserva motores.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {lecturas.slice(0, 12).map(l => {
          const tieneHoras = l.horas && Object.keys(l.horas).length > 0;
          return (
            <div key={l.tabla + l.id} style={{
              background: B.navy, borderRadius: 10, padding: 10,
              border: `1px solid ${tieneHoras ? B.success + "44" : B.warning + "55"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 11 }}>
                <span style={{ fontWeight: 700 }}>{l.tipo} · {l.fecha?.slice(0, 10)}</span>
                <span style={{ color: "rgba(255,255,255,0.45)" }}>{(l.hora || "").slice(0, 5)}</span>
              </div>
              {l.foto ? (
                <a href={l.foto} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                  <img src={l.foto} alt="odómetro" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6, border: `1px solid ${B.navyLight}` }} />
                </a>
              ) : (
                <div style={{ height: 120, background: B.navyLight, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Sin foto</div>
              )}
              <div style={{ marginTop: 8, fontSize: 11 }}>
                {tieneHoras ? (
                  <div style={{ color: B.success, fontWeight: 700 }}>
                    {Object.entries(l.horas).map(([k, v]) => `${k}: ${v}h`).join(" · ")}
                  </div>
                ) : (
                  <button onClick={() => setEditar(l)}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: `1px solid ${B.warning}`, background: B.warning + "22", color: B.warning, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    ✏️ Capturar horas
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editar && (
        <CapturarHorasModal lectura={editar} onClose={() => setEditar(null)} onSave={guardarHoras} />
      )}
    </div>
  );
}

function CapturarHorasModal({ lectura, onClose, onSave }) {
  const [horas, setHoras] = useState({ Babor: "", Estribor: "", Centro: "" });
  const [saving, setSaving] = useState(false);
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 22, width: 520, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>📸 Capturar horas de motor</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
          {lectura.tipo} · {lectura.fecha?.slice(0, 10)} {(lectura.hora || "").slice(0, 5)}
        </div>
        {lectura.foto && (
          <img src={lectura.foto} alt="odómetro" style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 8, marginBottom: 14, background: "#000" }} />
        )}
        <div style={{ fontSize: 11, color: B.sand, marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Lee las horas de la foto y escribilas:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          {["Babor", "Estribor", "Centro"].map(k => (
            <div key={k}>
              <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{k}</label>
              <input type="number" step="0.1" min="0" value={horas[k]}
                onChange={e => setHoras(p => ({ ...p, [k]: e.target.value }))}
                placeholder="ej: 1005"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 14, lineHeight: 1.4 }}>
          Solo llená los motores aplicables a esta embarcación. Naturalle = Babor+Estribor; Castillete = Centro.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: 11, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={async () => { setSaving(true); await onSave(lectura, horas); setSaving(false); }}
            disabled={saving}
            style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: saving ? B.navyLight : B.success, color: "#fff", fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
            {saving ? "Guardando…" : "✓ Guardar horas"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResumenTab({ bitacora, zarpes, llegadas = [], zarpesAll = [], lancha, onReload }) {
  // ── Lecturas de odómetro: surface fotos/horas registradas en muelle ─
  // El operador del muelle sube foto + (opcionalmente) horas en el form de
  // llegada/zarpe. Antes esas lecturas vivían huérfanas — el manager nunca
  // las veía. Acá las exponemos para que pueda revisarlas y, si solo subió
  // foto, capturar las horas viendo la imagen.
  const lecturasOdometro = useMemo(() => {
    if (!lancha) return [];
    const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/(.)\1+/g, "$1").trim();
    const target = norm(lancha.nombre);
    const fromLleg = (llegadas || [])
      .filter(l => norm(l.embarcacion_nombre) === target && (l.odometro_foto_url || l.motores_horas))
      .map(l => ({
        tabla: "muelle_llegadas", id: l.id,
        fecha: l.fecha, hora: l.hora_llegada, tipo: "Llegada",
        foto: l.odometro_foto_url, horas: l.motores_horas,
      }));
    const fromZarp = (zarpesAll || [])
      .filter(z => norm(z.embarcacion) === target && (z.odometro_foto_url || z.motores_horas))
      .map(z => ({
        tabla: "muelle_zarpes_flota", id: z.id,
        fecha: z.fecha, hora: z.hora_zarpe, tipo: "Zarpe",
        foto: z.odometro_foto_url, horas: z.motores_horas,
      }));
    return [...fromLleg, ...fromZarp].sort((a, b) =>
      (b.fecha + (b.hora || "")).localeCompare(a.fecha + (a.hora || ""))
    );
  }, [llegadas, zarpesAll, lancha]);

  // 6 meses de gasto. Usar día 1 + Bogotá: si hoy es abril 30, setMonth(-2)
  // sobre día 30 caía en "Feb 30" → marzo, saltándose febrero. Día 1 + tz
  // Bogotá garantiza que generamos: nov, dic, ene, feb, mar, abr correctamente.
  const meses = [];
  const baseStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  for (let i = 5; i >= 0; i--) {
    const d = new Date(baseStr + "T12:00:00");
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    meses.push(d.toISOString().slice(0, 7));
  }
  const gastosMes = meses.map(m => {
    const items = bitacora.filter(b => (b.fecha || "").startsWith(m));
    return {
      mes: m,
      comb: items.filter(b => b.tipo === "combustible").reduce((s, b) => s + Number(b.costo_total || 0), 0),
      mant: items.filter(b => TIPOS_MANTENIMIENTO.includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0),
      oper: items.filter(b => TIPOS_OPERATIVOS.includes(b.tipo)).reduce((s, b) => s + Number(b.costo_total || 0), 0),
      viajes: 0, // costo se computa del combustible cargado, no per-zarpe
    };
  });
  const maxGasto = Math.max(1, ...gastosMes.map(g => g.comb + g.mant + g.oper + g.viajes));

  const recientes = bitacora.slice(0, 5);
  const proximoServicio = bitacora.find(b => b.proximo_servicio_fecha || b.proximo_servicio_h);

  return (
    <div>
      {/* Lecturas de odómetro registradas en muelle */}
      {lecturasOdometro.length > 0 && (
        <LecturasOdometro lecturas={lecturasOdometro} onReload={onReload} />
      )}

      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13 }}>Gasto últimos 6 meses</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160 }}>
          {gastosMes.map(g => {
            const altoComb   = maxGasto ? (g.comb   / maxGasto) * 120 : 0;
            const altoMant   = maxGasto ? (g.mant   / maxGasto) * 120 : 0;
            const altoOper   = maxGasto ? (g.oper   / maxGasto) * 120 : 0;
            const altoViajes = maxGasto ? (g.viajes / maxGasto) * 120 : 0;
            return (
              <div key={g.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column-reverse", width: "100%", maxWidth: 40, height: 130, alignItems: "stretch" }}>
                  <div style={{ background: B.warning,  height: altoComb,   minHeight: g.comb   > 0 ? 3 : 0 }} title={"Combustible: " + fmtCOP(g.comb)} />
                  <div style={{ background: B.sky,      height: altoMant,   minHeight: g.mant   > 0 ? 3 : 0 }} title={"Mant.: " + fmtCOP(g.mant)} />
                  <div style={{ background: "#22d3ee",  height: altoOper,   minHeight: g.oper   > 0 ? 3 : 0 }} title={"Operativos: " + fmtCOP(g.oper)} />
                  <div style={{ background: "#a78bfa",  height: altoViajes, minHeight: g.viajes > 0 ? 3 : 0 }} title={"Viajes: " + fmtCOP(g.viajes)} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{g.mes.slice(5)}</div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{fmtCOP(g.comb + g.mant + g.oper + g.viajes)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.6)", flexWrap: "wrap" }}>
          <span>▪ <span style={{ color: B.warning }}>Combustible</span></span>
          <span>▪ <span style={{ color: B.sky }}>Mantenimiento</span></span>
          <span>▪ <span style={{ color: "#22d3ee" }}>Operativos</span></span>
          <span>▪ <span style={{ color: "#a78bfa" }}>Viajes</span></span>
        </div>
      </div>

      {proximoServicio && (
        <div style={{ background: B.sky + "15", border: `1px solid ${B.sky}40`, borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
          <div style={{ fontSize: 11, color: B.sky, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>🔔 Próximo servicio</div>
          <div>
            {proximoServicio.proximo_servicio_fecha && `Fecha: ${fmtFecha(proximoServicio.proximo_servicio_fecha)}`}
            {proximoServicio.proximo_servicio_fecha && proximoServicio.proximo_servicio_h && " · "}
            {proximoServicio.proximo_servicio_h && `${proximoServicio.proximo_servicio_h} h motor`}
          </div>
        </div>
      )}

      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Últimos registros</div>
      {recientes.length === 0 ? (
        <div style={{ padding: 20, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          Sin registros todavía.
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
          {recientes.map(r => <EventoRow key={r.id} item={r} compact />)}
        </div>
      )}
    </div>
  );
}

// ─── Lista de eventos ──────────────────────────────────────────────────────
function ListaEventos({ items, onEdit, onDelete, onToggleResuelto }) {
  if (!items.length) {
    return (
      <div style={{ padding: 30, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
        Sin registros.
      </div>
    );
  }
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
      {items.map(r => <EventoRow key={r.id} item={r} onEdit={onEdit} onDelete={onDelete} onToggleResuelto={onToggleResuelto} />)}
    </div>
  );
}

function EventoRow({ item, onEdit, onDelete, onToggleResuelto, compact }) {
  const tipo = TIPOS.find(t => t.k === item.tipo) || TIPOS[TIPOS.length - 1];
  const sev = item.severidad ? SEVERIDADES.find(s => s.k === item.severidad) : null;
  return (
    <div style={{ padding: compact ? "9px 14px" : "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "flex-start", gap: 12, fontSize: 13 }}>
      <div style={{ minWidth: 80, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
        <div style={{ fontWeight: 700 }}>{fmtFechaCorta(item.fecha)}</div>
        {item.hora && <div>{fmtHora(item.hora)}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: tipo.c + "33", color: tipo.c, fontWeight: 700 }}>
            {tipo.l}
          </span>
          {sev && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: sev.c + "33", color: sev.c, fontWeight: 700 }}>
              {sev.l}
            </span>
          )}
          {item.subtipo && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{item.subtipo}</span>}
          {item.tipo === "incidente" && (
            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: item.resuelto ? B.success + "33" : B.danger + "33", color: item.resuelto ? B.success : B.danger, fontWeight: 700, cursor: onToggleResuelto ? "pointer" : "default" }}
              onClick={() => onToggleResuelto && onToggleResuelto(item)}>
              {item.resuelto ? "✓ Resuelto" : "⏳ Abierto"}
            </span>
          )}
        </div>
        {item.descripcion && <div style={{ marginTop: 4, fontSize: 12 }}>{item.descripcion}</div>}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {item.galones && <span>⛽ {Number(item.galones).toFixed(1)} gal</span>}
          {item.precio_galon && <span>· ${Math.round(item.precio_galon).toLocaleString("es-CO")}/gal</span>}
          {item.costo_total && <span>· <strong style={{ color: B.success }}>{fmtCOP(item.costo_total)}</strong></span>}
          {item.kilometraje_h && <span>· ⏱ {item.kilometraje_h}h</span>}
          {item.proveedor && <span>· {item.proveedor}</span>}
          {item.capitan && <span>· 👨‍✈️ {item.capitan}</span>}
        </div>
        {item.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4, fontStyle: "italic" }}>{item.notas}</div>}
        {(item.foto_url || item.factura_url) && (
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {item.foto_url && <a href={item.foto_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: B.sky, textDecoration: "none" }}>📷 Foto</a>}
            {item.factura_url && <a href={item.factura_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: B.sky, textDecoration: "none" }}>🧾 Factura</a>}
          </div>
        )}
      </div>
      {!compact && onEdit && (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onEdit(item)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer" }}>✏️</button>
          <button onClick={() => onDelete(item.id)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Lista de viajes (desde muelle_zarpes_flota) ───────────────────────────
// ─── Lista de Viajes Computados ───────────────────────────────────────
// Computa viajes a partir de muelle_llegadas + muelle_zarpes_flota usando:
//   · Cada llegada se parea con el siguiente zarpe del mismo barco
//   · Si hay 2 llegadas seguidas → zarpe perdido (?? perdido)
//   · Si hay 2 zarpes seguidos → llegada perdida (?? perdido)
//   · # viajes = max(llegadas, zarpes)
//   · Costo combustible (estimado) = viajes × costo_viaje_sencillo × 2
function ListaViajesComputados({ viajesPorFecha, costoPorViaje, esSuper, onEliminarViaje }) {
  if (!viajesPorFecha.length) {
    return (
      <div style={{ padding: 30, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
        Sin viajes registrados.
        <div style={{ fontSize: 11, marginTop: 6 }}>Los viajes se computan a partir de llegadas y zarpes del muelle.</div>
      </div>
    );
  }
  const totalViajes = viajesPorFecha.reduce((s, v) => s + v.viajes, 0);
  const totalPerdidos = viajesPorFecha.reduce((s, v) => s + v.pares.filter(p => !p.llegada || !p.zarpe).length, 0);

  return (
    <div>
      {/* Banner de regla */}
      <div style={{ background: B.navy, border: `1px solid ${B.sand}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.55 }}>
        <strong style={{ color: B.sand }}>📐 Regla de viajes:</strong>
        Cada viaje = ida y vuelta (Cartagena ↔ Atolón). Se calcula como{" "}
        <code style={{ color: B.sky }}>max(llegadas registradas, zarpes registrados)</code> por día.
        Eventos faltantes se infieren cuando hay 2 llegadas (zarpe perdido) o 2 zarpes seguidos (llegada perdida).
      </div>

      <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
        {viajesPorFecha.map(d => (
          <div key={d.fecha} style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ minWidth: 100, fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>
                {fmtFechaCorta(d.fecha)}
              </div>
              <div style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                <span style={{ color: B.sky }}>{d.llegadas} 🛬</span>{" · "}
                <span style={{ color: "#a78bfa" }}>{d.zarpes} 🛫</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#a78bfa" }}>
                {d.viajes} viaje{d.viajes !== 1 ? "s" : ""}
              </div>
            </div>
            {/* Pareo cronológico */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 110 }}>
              {d.pares.map((p, i) => {
                const incompleto = !p.llegada || !p.zarpe;
                const delBtn = (ev, tabla, lbl) => (esSuper && ev?.id ? (
                  <button onClick={() => onEliminarViaje(tabla, ev.id, `${lbl} ${ev.hora || ""} · ${fmtFechaCorta(d.fecha)}`)}
                    title={`Eliminar ${lbl} (solo super admin)`}
                    style={{ background: "transparent", border: "none", color: B.danger, fontSize: 11, fontWeight: 800, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>✕</button>
                ) : null);
                return (
                  <span key={i} style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 4,
                    background: incompleto ? B.danger + "22" : B.success + "18",
                    color: incompleto ? B.danger : "rgba(255,255,255,0.6)",
                    border: incompleto ? `1px dashed ${B.danger}55` : "1px solid transparent",
                    display: "inline-flex", alignItems: "center", gap: 3,
                  }}>
                    {p.llegada?.hora || "??"}{delBtn(p.llegada, "muelle_llegadas", "llegada")}
                    →{p.zarpe?.hora || "??"}{delBtn(p.zarpe, "muelle_zarpes_flota", "zarpe")}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        {/* Footer total */}
        <div style={{ padding: "12px 14px", background: B.navy, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Total</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              {totalViajes} viajes en {viajesPorFecha.length} días
              {totalPerdidos > 0 && (
                <span style={{ color: B.danger, marginLeft: 8 }}>· ⚠ {totalPerdidos} eventos faltantes</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Total viajes</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#a78bfa" }}>{totalViajes}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal nuevo/editar evento ─────────────────────────────────────────────
function EventoModal({ tipo: tipoInicial, edit, onClose, onSave, capitanDefault }) {
  const [f, setF] = useState({
    id: edit?.id || null,
    tipo: edit?.tipo || tipoInicial,
    subtipo: edit?.subtipo || "",
    fecha: edit?.fecha || todayStr(),
    hora: edit?.hora?.slice(0, 5) || new Date().toTimeString().slice(0, 5),
    descripcion: edit?.descripcion || "",
    galones: edit?.galones || "",
    precio_galon: edit?.precio_galon || "",
    costo_total: edit?.costo_total || "",
    kilometraje_h: edit?.kilometraje_h || "",
    proveedor: edit?.proveedor || "",
    taller: edit?.taller || "",
    proximo_servicio_h: edit?.proximo_servicio_h || "",
    proximo_servicio_fecha: edit?.proximo_servicio_fecha || "",
    severidad: edit?.severidad || "leve",
    resuelto: !!edit?.resuelto,
    capitan: edit?.capitan || capitanDefault || "",
    notas: edit?.notas || "",
    foto_url: edit?.foto_url || "",
    factura_url: edit?.factura_url || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  // Auto-calcular costo_total si hay galones + precio_galon y costo está vacío
  useEffect(() => {
    if (f.tipo === "combustible" && f.galones && f.precio_galon && !edit) {
      const calc = Number(f.galones) * Number(f.precio_galon);
      if (calc && !f.costo_total) set("costo_total", Math.round(calc));
    }
  }, [f.galones, f.precio_galon]); // eslint-disable-line

  async function handleFile(e, campo) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(campo); setErr("");
    try {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from("lanchas").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("lanchas").getPublicUrl(path);
      set(campo, pub.publicUrl);
    } catch (e) { setErr(e.message); }
    finally { setUploading(""); }
  }

  async function handleSave() {
    setSaving(true); setErr("");
    const error = await onSave(f);
    setSaving(false);
    if (error) setErr(error.message || "Error al guardar");
  }

  const esCombustible = f.tipo === "combustible";
  const esMantenimiento = ["mantenimiento", "reparacion", "inspeccion", "limpieza"].includes(f.tipo);
  const esOperativo = ["marina", "capitanes"].includes(f.tipo);
  const esIncidente = f.tipo === "incidente";

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
        {edit ? "Editar registro" : "Nuevo registro"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Tipo</label>
          <select value={f.tipo} onChange={e => set("tipo", e.target.value)} style={IS}>
            {TIPOS.filter(t => t.k !== "viaje").map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
          </select>
        </div>
        <div><label style={LS}>Fecha</label><input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Hora</label><input type="time" value={f.hora} onChange={e => set("hora", e.target.value)} style={IS} /></div>

        {/* Combustible */}
        {esCombustible && (
          <>
            <div><label style={LS}>Galones</label><input type="number" step="0.1" value={f.galones} onChange={e => set("galones", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Precio / galón</label><input type="number" value={f.precio_galon} onChange={e => set("precio_galon", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Costo total</label><input type="number" value={f.costo_total} onChange={e => set("costo_total", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Horas motor (opcional)</label><input type="number" step="0.1" value={f.kilometraje_h} onChange={e => set("kilometraje_h", e.target.value)} style={IS} /></div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>Estación / proveedor</label>
              <input value={f.proveedor} onChange={e => set("proveedor", e.target.value)} placeholder="Ej: Terpel, Mobil, particular…" style={IS} />
            </div>
          </>
        )}

        {/* Mantenimiento */}
        {esMantenimiento && (
          <>
            <div><label style={LS}>Subtipo</label>
              <select value={f.subtipo} onChange={e => set("subtipo", e.target.value)} style={IS}>
                <option value="">—</option>
                <option value="cambio_aceite">Cambio de aceite</option>
                <option value="filtros">Filtros</option>
                <option value="motor">Motor</option>
                <option value="helice">Hélice</option>
                <option value="bateria">Batería</option>
                <option value="electronico">Sistema eléctrico</option>
                <option value="casco">Casco / pintura</option>
                <option value="tanque">Tanque</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div><label style={LS}>Costo total</label><input type="number" value={f.costo_total} onChange={e => set("costo_total", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Taller / proveedor</label><input value={f.taller || f.proveedor} onChange={e => { set("taller", e.target.value); set("proveedor", e.target.value); }} style={IS} /></div>
            <div><label style={LS}>Horas motor</label><input type="number" value={f.kilometraje_h} onChange={e => set("kilometraje_h", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Próximo servicio (horas)</label><input type="number" value={f.proximo_servicio_h} onChange={e => set("proximo_servicio_h", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Próximo servicio (fecha)</label><input type="date" value={f.proximo_servicio_fecha} onChange={e => set("proximo_servicio_fecha", e.target.value)} style={IS} /></div>
          </>
        )}

        {/* Operativo (marina/parqueo · capitanes) */}
        {esOperativo && (
          <>
            <div>
              <label style={LS}>{f.tipo === "marina" ? "Periodo / concepto" : "Concepto / nómina"}</label>
              <input value={f.subtipo} onChange={e => set("subtipo", e.target.value)} placeholder={f.tipo === "marina" ? "Ej: Mes abril 2026" : "Ej: Quincena · capitán"} style={IS} />
            </div>
            <div><label style={LS}>Costo total</label><input type="number" value={f.costo_total} onChange={e => set("costo_total", e.target.value)} style={IS} /></div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>{f.tipo === "marina" ? "Marina / proveedor" : "Capitán beneficiario"}</label>
              <input value={f.proveedor} onChange={e => set("proveedor", e.target.value)} placeholder={f.tipo === "marina" ? "Ej: Marina Santa Cruz" : "Ej: Cap. Pérez"} style={IS} />
            </div>
          </>
        )}

        {/* Incidente */}
        {esIncidente && (
          <>
            <div><label style={LS}>Severidad</label>
              <select value={f.severidad} onChange={e => set("severidad", e.target.value)} style={IS}>
                {SEVERIDADES.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 20 }}>
                <input type="checkbox" checked={f.resuelto} onChange={e => set("resuelto", e.target.checked)} />
                Marcar como resuelto
              </label>
            </div>
          </>
        )}

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Descripción</label>
          <textarea value={f.descripcion} onChange={e => set("descripcion", e.target.value)} style={{ ...IS, minHeight: 70, resize: "vertical" }} />
        </div>
        <div><label style={LS}>Capitán</label><input value={f.capitan} onChange={e => set("capitan", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Notas</label><input value={f.notas} onChange={e => set("notas", e.target.value)} style={IS} /></div>

        {/* Archivos */}
        <div>
          <label style={LS}>Foto</label>
          {f.foto_url ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <a href={f.foto_url} target="_blank" rel="noreferrer" style={{ color: B.sky, fontSize: 11 }}>Ver foto</a>
              <button onClick={() => set("foto_url", "")} style={{ ...BTN(B.danger), padding: "3px 8px", fontSize: 10 }}>Quitar</button>
            </div>
          ) : (
            <input type="file" accept="image/*" onChange={e => handleFile(e, "foto_url")} disabled={uploading === "foto_url"} style={{ color: "#fff", fontSize: 11 }} />
          )}
        </div>
        <div>
          <label style={LS}>Factura</label>
          {f.factura_url ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <a href={f.factura_url} target="_blank" rel="noreferrer" style={{ color: B.sky, fontSize: 11 }}>Ver factura</a>
              <button onClick={() => set("factura_url", "")} style={{ ...BTN(B.danger), padding: "3px 8px", fontSize: 10 }}>Quitar</button>
            </div>
          ) : (
            <input type="file" accept="image/*,application/pdf" onChange={e => handleFile(e, "factura_url")} disabled={uploading === "factura_url"} style={{ color: "#fff", fontSize: 11 }} />
          )}
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
        <button onClick={handleSave} disabled={saving || uploading} style={BTN(B.success)}>
          {saving ? "Guardando…" : (edit ? "Guardar cambios" : "Registrar")}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Modal configuración de lancha ─────────────────────────────────────────
function ConfigLanchaModal({ lancha, onClose, onSaved }) {
  const [f, setF] = useState({
    matricula: lancha.matricula || "",
    capacidad_pax: lancha.capacidad_pax || "",
    capacidad_tanque_gal: lancha.capacidad_tanque_gal || "",
    motor: lancha.motor || "",
    modelo: lancha.modelo || "",
    ano: lancha.ano || "",
    capitan_default: lancha.capitan_default || "",
    costo_viaje_sencillo: lancha.costo_viaje_sencillo || "",
    tarifa_alquiler_ida_vuelta: lancha.tarifa_alquiler_ida_vuelta || "",
    marina_costo_mensual: lancha.marina_costo_mensual || "",
    marina_proveedor: lancha.marina_proveedor || "",
    marina_activa: !!lancha.marina_activa,
    foto_url: lancha.foto_url || "",
    notas: lancha.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function handleFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `lancha_${lancha.id}_${Date.now()}_${file.name.replace(/[^\w.]/g, "_")}`;
    const { error } = await supabase.storage.from("lanchas").upload(path, file, { upsert: true });
    if (error) { setErr(error.message); return; }
    const { data: pub } = supabase.storage.from("lanchas").getPublicUrl(path);
    set("foto_url", pub.publicUrl);
  }

  async function save() {
    setSaving(true); setErr("");
    const payload = {
      ...f,
      capacidad_pax: f.capacidad_pax ? Number(f.capacidad_pax) : null,
      capacidad_tanque_gal: f.capacidad_tanque_gal ? Number(f.capacidad_tanque_gal) : null,
      ano: f.ano ? Number(f.ano) : null,
      costo_viaje_sencillo: f.costo_viaje_sencillo ? Number(f.costo_viaje_sencillo) : 0,
      tarifa_alquiler_ida_vuelta: f.tarifa_alquiler_ida_vuelta ? Number(f.tarifa_alquiler_ida_vuelta) : 0,
      marina_costo_mensual: f.marina_costo_mensual ? Number(f.marina_costo_mensual) : 0,
      marina_proveedor: f.marina_proveedor || null,
      marina_activa: !!f.marina_activa,
      updated_at: new Date().toISOString(),
    };
    const r = await supabase.from("lanchas").update(payload).eq("id", lancha.id);
    if (r.error) { setSaving(false); setErr(r.error.message); return; }
    // Si activó marina, asegurar que el mes actual quede registrado
    if (payload.marina_activa && payload.marina_costo_mensual > 0) {
      await supabase.rpc("generar_marina_mes");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>⚙ Configuración — {lancha.nombre}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={LS}>Matrícula</label><input value={f.matricula} onChange={e => set("matricula", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Capacidad (pax)</label><input type="number" value={f.capacidad_pax} onChange={e => set("capacidad_pax", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Tanque (gal)</label><input type="number" value={f.capacidad_tanque_gal} onChange={e => set("capacidad_tanque_gal", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Año</label><input type="number" value={f.ano} onChange={e => set("ano", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Motor</label><input value={f.motor} onChange={e => set("motor", e.target.value)} placeholder="Ej: Yamaha 200HP" style={IS} /></div>
        <div><label style={LS}>Modelo</label><input value={f.modelo} onChange={e => set("modelo", e.target.value)} style={IS} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label style={LS}>Capitán principal</label><input value={f.capitan_default} onChange={e => set("capitan_default", e.target.value)} style={IS} /></div>

        <div style={{ gridColumn: "1 / -1", marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Costos operativos</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Cada llegada o salida en Atolón = 1 medio viaje. 2 medios viajes = 1 ida+vuelta completa.
            Castillete: $100k/medio · $400k ida+vuelta · Naturalle: $137.500/medio · $275k ida+vuelta.
          </div>
        </div>
        <div>
          <label style={LS}>Costo 1 medio viaje (COP)</label>
          <input type="number" value={f.costo_viaje_sencillo} onChange={e => set("costo_viaje_sencillo", e.target.value)} placeholder="100000" style={IS} />
        </div>
        <div>
          <label style={LS}>Tarifa alquiler ida+vuelta (COP)</label>
          <input type="number" value={f.tarifa_alquiler_ida_vuelta} onChange={e => set("tarifa_alquiler_ida_vuelta", e.target.value)} placeholder="400000" style={IS} />
        </div>

        <div style={{ gridColumn: "1 / -1", marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 11, color: "#22d3ee", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>🅿️ Marina / parqueo recurrente</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Si está activa, se inserta automáticamente un cargo el día 1 de cada mes en la bitácora.
          </div>
        </div>
        <div>
          <label style={LS}>Costo mensual (COP)</label>
          <input type="number" value={f.marina_costo_mensual} onChange={e => set("marina_costo_mensual", e.target.value)} placeholder="0" style={IS} />
        </div>
        <div>
          <label style={LS}>Marina / proveedor</label>
          <input value={f.marina_proveedor} onChange={e => set("marina_proveedor", e.target.value)} placeholder="Ej: Marina Santa Cruz" style={IS} />
        </div>
        <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
          <input id="marina_activa" type="checkbox" checked={f.marina_activa} onChange={e => set("marina_activa", e.target.checked)} />
          <label htmlFor="marina_activa" style={{ fontSize: 13, cursor: "pointer" }}>
            Activar cargo recurrente {f.marina_costo_mensual > 0 && <span style={{ color: "rgba(255,255,255,0.5)" }}>(${Math.round(f.marina_costo_mensual).toLocaleString("es-CO")}/mes)</span>}
          </label>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Foto</label>
          {f.foto_url && <img src={f.foto_url} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, marginBottom: 6, display: "block" }} />}
          <input type="file" accept="image/*" onChange={handleFoto} style={{ color: "#fff", fontSize: 11 }} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Notas</label>
          <textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} />
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
        <button onClick={save} disabled={saving} style={BTN(B.sky, B.navy)}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Lista capitanes (por lancha) ───────────────────────────────────────────
function ListaCapitanes({ capitanes, onAdd, onEdit, onDelete }) {
  const totalNomina  = capitanes.filter(c => c.tipo === "nomina").reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
  const totalTercero = capitanes.filter(c => c.tipo === "tercero" && c.recurrente).reduce((s, c) => s + Number(c.salario_mensual || 0), 0);
  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: "rgba(255,255,255,0.6)", flexWrap: "wrap" }}>
          {totalNomina  > 0 && <span>Nómina/mes: <strong style={{ color: "#fb923c" }}>{fmtCOP(totalNomina)}</strong></span>}
          {totalTercero > 0 && <span>Terceros recurrentes/mes: <strong style={{ color: "#fb923c" }}>{fmtCOP(totalTercero)}</strong></span>}
        </div>
        <button onClick={onAdd} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: B.success, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          + Nuevo capitán
        </button>
      </div>
      {!capitanes.length ? (
        <div style={{ padding: 30, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
          Sin capitanes asignados a esta embarcación.
          <div style={{ fontSize: 11, marginTop: 6 }}>Agregá nómina propia o terceros freelance.</div>
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
          {capitanes.map(c => (
            <div key={c.id} style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18 }}>👨‍✈️</div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.nombre}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ padding: "1px 6px", borderRadius: 4, background: c.tipo === "nomina" ? "#fb923c33" : "#a78bfa33", color: c.tipo === "nomina" ? "#fb923c" : "#a78bfa", fontWeight: 700, textTransform: "uppercase", fontSize: 9 }}>
                    {c.tipo === "nomina" ? "NÓMINA" : "TERCERO"}
                  </span>
                  {c.tipo === "tercero" && c.recurrente && (
                    <span style={{ padding: "1px 6px", borderRadius: 4, background: B.success + "33", color: B.success, fontWeight: 700, fontSize: 9, textTransform: "uppercase" }}>
                      RECURRENTE
                    </span>
                  )}
                  {c.documento && <span>· CC {c.documento}</span>}
                  {c.telefono  && <span>· 📞 {c.telefono}</span>}
                </div>
              </div>
              {Number(c.salario_mensual) > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fb923c", whiteSpace: "nowrap" }}>
                  {fmtCOP(c.salario_mensual)}<span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>/mes</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => onEdit(c)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 14, cursor: "pointer" }}>✏️</button>
                <button onClick={() => onDelete(c.id)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 14, cursor: "pointer" }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, padding: 12, background: B.navy, borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
        ℹ️ <strong>Nómina</strong> = empleado de Atolón (su sueldo se paga vía RRHH/Nómina; aquí solo es referencia, no se duplica en bitácora).
        <strong style={{ marginLeft: 6 }}>Tercero recurrente</strong> = freelance con tarifa fija mensual (se inserta automático en bitácora cada inicio de mes).
        Pagos puntuales → registrá manualmente en tab Operativos.
      </div>
    </div>
  );
}

// ─── Modal capitán (nómina/tercero) ─────────────────────────────────────────
function CapitanModal({ edit, lancha, empleados = [], capitanesAsignados = [], onClose, onSaved }) {
  const [f, setF] = useState({
    id: edit?.id || null,
    empleado_id: edit?.empleado_id || "",
    nombre: edit?.nombre || "",
    documento: edit?.documento || "",
    telefono: edit?.telefono || "",
    email: edit?.email || "",
    tipo: edit?.tipo || "tercero",
    salario_mensual: edit?.salario_mensual || "",
    recurrente: edit?.recurrente !== false,
    fecha_inicio: edit?.fecha_inicio || todayStr(),
    fecha_fin: edit?.fecha_fin || "",
    notas: edit?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  // IDs de empleados ya asignados (para no ofrecerlos en el dropdown salvo el editado)
  const empleadosUsados = new Set(
    capitanesAsignados.filter(c => c.empleado_id && c.id !== edit?.id).map(c => c.empleado_id)
  );

  // Filtrar empleados por cargo "capitán" o búsqueda libre
  const empleadosFiltrados = empleados
    .filter(e => !empleadosUsados.has(e.id))
    .filter(e => {
      if (!empSearch.trim()) return true;
      const q = empSearch.toLowerCase();
      const nombre = `${e.nombres || ""} ${e.apellidos || ""}`.toLowerCase();
      return nombre.includes(q) || (e.cedula || "").includes(empSearch) || (e.cargo || "").toLowerCase().includes(q);
    });

  function seleccionarEmpleado(emp) {
    if (!emp) {
      setF(p => ({ ...p, empleado_id: "", nombre: "", documento: "", telefono: "", email: "", salario_mensual: "" }));
      return;
    }
    setF(p => ({
      ...p,
      empleado_id: emp.id,
      nombre: `${emp.nombres || ""} ${emp.apellidos || ""}`.trim(),
      documento: emp.cedula || "",
      telefono: emp.telefono || "",
      email: emp.email || "",
      salario_mensual: emp.salario_base || "",
    }));
  }

  // Si cambia a tercero, limpiar empleado_id
  function cambiarTipo(t) {
    set("tipo", t);
    if (t === "tercero") set("empleado_id", "");
  }

  async function save() {
    setSaving(true); setErr("");
    if (f.tipo === "nomina" && !f.empleado_id) {
      setSaving(false);
      setErr("Selecciona un empleado de la nómina");
      return;
    }
    const payload = {
      empleado_id: f.tipo === "nomina" ? f.empleado_id : null,
      nombre: f.nombre,
      documento: f.documento || null,
      telefono: f.telefono || null,
      email: f.email || null,
      tipo: f.tipo,
      lancha_id: lancha.id,
      salario_mensual: f.salario_mensual ? Number(f.salario_mensual) : 0,
      recurrente: f.tipo === "tercero" ? !!f.recurrente : false,
      fecha_inicio: f.fecha_inicio || null,
      fecha_fin: f.fecha_fin || null,
      notas: f.notas || null,
      activo: true,
      updated_at: new Date().toISOString(),
    };
    let r;
    if (f.id) {
      r = await supabase.from("capitanes_flota").update(payload).eq("id", f.id);
    } else {
      r = await supabase.from("capitanes_flota").insert({ id: "CAP-" + Date.now().toString(36).toUpperCase(), ...payload });
    }
    if (r.error) { setSaving(false); setErr(r.error.message); return; }
    if (payload.tipo === "tercero" && payload.recurrente && payload.salario_mensual > 0) {
      await supabase.rpc("generar_capitanes_mes");
    }
    setSaving(false);
    onSaved();
  }

  const empSeleccionado = empleados.find(e => e.id === f.empleado_id);

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{edit ? "Editar capitán" : "Nuevo capitán"} — {lancha.nombre}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>Mixto: nómina propia (vinculado a RRHH) o tercero (con/sin recurrencia).</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Tipo</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => cambiarTipo("nomina")}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", cursor: "pointer", background: f.tipo === "nomina" ? "#fb923c" : B.navyLight, color: f.tipo === "nomina" ? B.navy : "#fff", fontWeight: 700, fontSize: 12 }}>
              Nómina propia
            </button>
            <button onClick={() => cambiarTipo("tercero")}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", cursor: "pointer", background: f.tipo === "tercero" ? "#a78bfa" : B.navyLight, color: f.tipo === "tercero" ? B.navy : "#fff", fontWeight: 700, fontSize: 12 }}>
              Tercero / freelance
            </button>
          </div>
        </div>

        {/* Nómina: selector de empleado */}
        {f.tipo === "nomina" && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LS}>Empleado de la nómina</label>
            {empSeleccionado ? (
              <div style={{ background: B.navy, borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>👤 {empSeleccionado.nombres} {empSeleccionado.apellidos}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {empSeleccionado.cargo && <span>💼 {empSeleccionado.cargo}</span>}
                    {empSeleccionado.cedula && <span>· CC {empSeleccionado.cedula}</span>}
                    {empSeleccionado.salario_base > 0 && <span>· 💵 {fmtCOP(empSeleccionado.salario_base)}/mes</span>}
                  </div>
                </div>
                <button onClick={() => seleccionarEmpleado(null)}
                  style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 11, cursor: "pointer" }}>
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Buscar por nombre, cédula o cargo…" style={IS} />
                <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", background: B.navy, borderRadius: 8 }}>
                  {empleadosFiltrados.length === 0 ? (
                    <div style={{ padding: 14, fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
                      {empleados.length === 0 ? "No hay empleados activos en RRHH" :
                       empleadosUsados.size === empleados.length ? "Todos los empleados ya están asignados" :
                       "Sin coincidencias"}
                    </div>
                  ) : empleadosFiltrados.map(e => (
                    <div key={e.id} onClick={() => seleccionarEmpleado(e)}
                      style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
                      onMouseEnter={ev => ev.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                      onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{e.nombres} {e.apellidos}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                          {e.cargo || "—"}{e.cedula ? ` · CC ${e.cedula}` : ""}
                        </div>
                      </div>
                      {e.salario_base > 0 && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{fmtCOP(e.salario_base)}/mes</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{ marginTop: 8, padding: 10, background: B.navy, borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              ℹ️ Empleados de nómina NO se insertan en bitácora (su sueldo se paga vía RRHH).
              El salario aquí es referencia para el cálculo de costos de flota.
            </div>
          </div>
        )}

        {/* Tercero: campos libres */}
        {f.tipo === "tercero" && (
          <>
            <div><label style={LS}>Nombre completo</label><input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Documento</label><input value={f.documento} onChange={e => set("documento", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Teléfono</label><input value={f.telefono} onChange={e => set("telefono", e.target.value)} style={IS} /></div>
            <div><label style={LS}>Email</label><input value={f.email} onChange={e => set("email", e.target.value)} style={IS} /></div>
          </>
        )}

        <div>
          <label style={LS}>{f.tipo === "nomina" ? "Salario mensual" : "Tarifa mensual (COP)"}</label>
          <input type="number" value={f.salario_mensual} onChange={e => set("salario_mensual", e.target.value)} style={IS} />
        </div>
        <div><label style={LS}>Fecha inicio</label><input type="date" value={f.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Fecha fin (opcional)</label><input type="date" value={f.fecha_fin} onChange={e => set("fecha_fin", e.target.value)} style={IS} /></div>

        {f.tipo === "tercero" && (
          <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, padding: 10, background: B.navy, borderRadius: 8 }}>
            <input id="cap_rec" type="checkbox" checked={f.recurrente} onChange={e => set("recurrente", e.target.checked)} />
            <label htmlFor="cap_rec" style={{ fontSize: 13, cursor: "pointer" }}>
              Cargo recurrente — insertar automáticamente cada inicio de mes en bitácora
            </label>
          </div>
        )}

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Notas</label>
          <textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} />
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
        <button disabled={!f.nombre || (f.tipo === "nomina" && !f.empleado_id) || saving} onClick={save} style={BTN(B.success)}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: B.navyMid, borderRadius: 14, padding: 22, width: "100%", maxWidth: 720,
        marginTop: 40, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {children}
      </div>
    </div>
  );
}
