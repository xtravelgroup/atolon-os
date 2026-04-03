import { useState, useEffect, useCallback } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

// ── Pure staffing calculation ────────────────────────────────────────────────
function calcStaff(totalPax, vipPax, excPax, ovrMap = {}) {
  const pax = Math.max(totalPax, 20); // apertura mínima
  // Con 0 reservas → staffing de apertura mínima con 1 de cada zona
  const isApertura = totalPax === 0;

  const raw = {
    // Playa: 0 si no hay VIP reales (excepto apertura mínima)
    mesPlaya:   isApertura ? 1 : vipPax === 0 ? 0 : (pax <= 80 ? Math.min(3, Math.ceil(vipPax / 20)) : 4),
    // Pool: 0 si no hay Exclusive reales (excepto apertura mínima)
    mesPool:    isApertura ? 1 : excPax === 0 ? 0 : (excPax <= 10 ? 1 : excPax <= 30 ? 2 : 3),
    mesRest:    pax <= 80 ? 1 : 4,
    runnersBeb: pax <= 60 ? 1 : pax <= 80 ? 2 : 3,
    runnersCom: pax <= 20 ? 0 : pax <= 80 ? 1 : 2,
    bussers:    pax <= 20 ? 0 : pax <= 60 ? 1 : 2,
    bartenders: pax <= 60 ? 1 : 2,
    supervisor: 1,
    hostess:    pax <= 20 ? 0 : pax <= 80 ? 1 : 2,
  };

  // Apply manual overrides on top of calculated values
  const applied = {};
  Object.keys(raw).forEach(k => {
    applied[k] = ovrMap[k] !== undefined ? ovrMap[k] : raw[k];
  });

  const hayMovimiento = pax <= 80 && totalPax > 0;

  const valle = {
    mesPlaya:   applied.mesPlaya,
    mesPool:    applied.mesPool,
    mesRest:    applied.mesRest,
    runnersBeb: applied.runnersBeb,
    runnersCom: 0,
    bussers:    applied.bussers,
    bartenders: applied.bartenders,
    supervisor: applied.supervisor,
    hostess:    applied.hostess,
  };

  const pico = {
    mesPlaya:   hayMovimiento ? Math.max(0, applied.mesPlaya - 1) : applied.mesPlaya,
    mesPool:    applied.mesPool,
    mesRest:    hayMovimiento ? applied.mesRest + 1 : applied.mesRest,
    runnersBeb: applied.runnersBeb,
    runnersCom: applied.runnersCom,
    bussers:    applied.bussers,
    bartenders: applied.bartenders,
    supervisor: applied.supervisor,
    hostess:    applied.hostess,
  };

  const totalValle = Object.values(valle).reduce((s, v) => s + v, 0);
  const totalPico  = Object.values(pico).reduce((s, v) => s + v, 0);

  return { valle, pico, totalValle, totalPico, hayMovimiento, raw, applied };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLES = [
  { key: "mesPlaya",   icon: "🏖️", label: "Mesero Playa",      zona: "Playa VIP",      noValle: "Ratio 1/20 pax VIP · bar a 50m",      noPico: (h) => h ? "−1 se mueve al restaurante" : "Sin cambio" },
  { key: "mesPool",    icon: "🏊", label: "Mesero Pool",        zona: "Pool Exclusive", noValle: "Ratio 1/10 pax Exclusive · bar a 20m", noPico: () => "Nunca se mueve al restaurante" },
  { key: "mesRest",    icon: "🍽️", label: "Mesero Restaurante", zona: "Restaurante",    noValle: "1 fijo (≤80 pax) · 4 fijos (100+)",   noPico: (h) => h ? "+1 viene de playa" : "Sin cambio" },
  { key: "runnersBeb", icon: "🍹", label: "Runner Bebidas",     zona: "Pool + Playa",   noValle: "Activo todo el día",                   noPico: () => "Sin cambio" },
  { key: "runnersCom", icon: "🥘", label: "Runner Comida",      zona: "Cocina → Todos", noValle: "Inactivo (fuera del pico)",             noPico: () => "Solo 12–3pm · Fuera: busser" },
  { key: "bussers",    icon: "🧹", label: "Busser",             zona: "Todo el club",   noValle: "Limpieza + apoyo",                     noPico: () => "Apoyo entregas · sin limpieza" },
  { key: "bartenders", icon: "🍸", label: "Bartender",          zona: "Bar",            noValle: "Restaurante + runners",                noPico: () => "BT1 rest · BT2 camas (si 2 BT)" },
  { key: "supervisor", icon: "👁️", label: "Supervisor",         zona: "Global",         noValle: "Coordinación total",                   noPico: () => "100% en piso" },
  { key: "hostess",    icon: "🌺", label: "Hostess",            zona: "Recepción",      noValle: "Camas + restaurante",                  noPico: () => "Escalonamiento restaurante" },
];

const BLOQUES = [
  { hora: "8:00",  end: "9:00",  label: "Setup & Briefing",         color: B.sky,     turnos: [],                    pico: false },
  { hora: "9:00",  end: "10:00", label: "T1 Activo",                color: B.success, turnos: ["T1"],                pico: false },
  { hora: "10:00", end: "11:30", label: "T1 + T2 Activos",          color: B.success, turnos: ["T1","T2"],           pico: false },
  { hora: "11:30", end: "12:00", label: "T3 Llega (si aplica)",     color: B.warning, turnos: ["T1","T2","T3"],      pico: false, cond: "T3" },
  { hora: "12:00", end: "15:00", label: "PICO — Almuerzo + Bebidas",color: B.danger,  turnos: ["T1","T2","T3"],      pico: true },
  { hora: "15:00", end: "16:30", label: "T1 Sale · Redistribución", color: B.sand,    turnos: ["T2","T3"],           pico: false },
  { hora: "16:30", end: "17:00", label: "T2 Sale",                  color: B.sand,    turnos: ["T3"],                pico: false },
  { hora: "17:00", end: "18:00", label: "T3 Sale · Cierre",         color: B.sky,     turnos: [],                    pico: false },
];

const TURNO_COLORS = { T1: "#4CAF7D", T2: "#4A90C4", T3: "#E8A020" };

const OCUPACION_LEVELS = [
  { max: 40,  label: "Mínimo",  color: B.success,  bg: B.success + "22" },
  { max: 80,  label: "Normal",  color: B.sky,      bg: B.sky + "22" },
  { max: 100, label: "Alto",    color: B.warning,  bg: B.warning + "22" },
  { max: 121, label: "Full",    color: B.danger,   bg: B.danger + "22" },
];

function getOcupNivel(pax) {
  return OCUPACION_LEVELS.find(o => pax <= o.max) || OCUPACION_LEVELS[OCUPACION_LEVELS.length - 1];
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}
function weekStart(iso) {
  const d = new Date(iso + "T12:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}
function fmtDay(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
}
function fmtDayShort(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-CO", { weekday: "short" }).replace(".", "");
}
function fmtDateNum(iso) {
  if (!iso) return "";
  return parseInt(iso.split("-")[2]);
}

// ── Main module ───────────────────────────────────────────────────────────────
export default function Staffing() {
  const isMobile = useMobile();
  const [view, setView]                   = useState("dashboard");
  const [selDate, setSelDate]             = useState(todayStr());
  const [reservas, setReservas]           = useState([]);
  const [salidas, setSalidas]             = useState([]);
  const [overrides, setOverrides]         = useState([]);
  const [weekData, setWeekData]           = useState([]); // [{ date, totalPax, vipPax, excPax }]
  const [loading, setLoading]             = useState(true);
  const [proyecciones, setProyecciones]   = useState({}); // { date: pax_proyectado }
  const [proyModal, setProyModal]         = useState(null); // { date }
  const [proyInput, setProyInput]         = useState(0);
  const [proyNota, setProyNota]           = useState("");
  const [ovrModal, setOvrModal]           = useState(null); // { role, valleVal, picoVal }
  const [ovrQty, setOvrQty]               = useState(0);
  const [ovrReason, setOvrReason]         = useState("");
  const [saving, setSaving]               = useState(false);

  const today = todayStr();

  const fetchData = useCallback(async (date) => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const ws = weekStart(date);
    const we = addDays(ws, 6);

    const [resR, salR, ovrR, weekR, proyR] = await Promise.all([
      supabase.from("reservas")
        .select("id, salida_id, salida, tipo, pax, pax_a, pax_n, estado")
        .eq("fecha", date)
        .in("estado", ["confirmado", "pendiente"]),
      supabase.from("salidas").select("*").eq("activo", true).order("orden"),
      supabase.from("staffing_overrides").select("*").eq("date", date),
      supabase.from("reservas")
        .select("fecha, tipo, pax, estado")
        .gte("fecha", ws).lte("fecha", we)
        .in("estado", ["confirmado", "pendiente"]),
      supabase.from("staffing_proyecciones").select("*").gte("date", ws).lte("date", we),
    ]);

    setReservas(resR.data || []);
    setSalidas(salR.data || []);
    setOverrides(ovrR.data || []);

    // Build proyecciones map
    const proyMap = {};
    (proyR.data || []).forEach(p => { proyMap[p.date] = p; });
    setProyecciones(proyMap);

    // Build weekly aggregation
    const byDate = {};
    for (let i = 0; i <= 6; i++) {
      const d = addDays(ws, i);
      byDate[d] = { date: d, totalPax: 0, vipPax: 0, excPax: 0 };
    }
    (weekR.data || []).forEach(r => {
      if (!byDate[r.fecha]) return;
      byDate[r.fecha].totalPax += (r.pax || 0);
      if (["VIP Pass", "Atolon Experience"].includes(r.tipo))
        byDate[r.fecha].vipPax += (r.pax || 0);
      if (r.tipo === "Exclusive Pass")
        byDate[r.fecha].excPax += (r.pax || 0);
    });
    setWeekData(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(selDate); }, [selDate, fetchData]);

  // Derived values
  const totalPaxReal = reservas.reduce((s, r) => s + (r.pax || 0), 0);
  const vipPax       = reservas.filter(r => ["VIP Pass", "Atolon Experience"].includes(r.tipo))
                                .reduce((s, r) => s + (r.pax || 0), 0);
  const excPax       = reservas.filter(r => r.tipo === "Exclusive Pass")
                                .reduce((s, r) => s + (r.pax || 0), 0);

  // Projection for selected date — use the higher of real vs projected
  const proyHoy       = proyecciones[selDate]?.pax_proyectado || 0;
  const totalPax      = Math.max(totalPaxReal, proyHoy);
  const usaProyeccion = proyHoy > totalPaxReal && proyHoy > 0;

  // When projection is the basis, project VIP/Exclusive at the 80/20 mix
  // BUT always use whichever is higher: real category pax OR projected split
  // so that if real VIP (57) > projected VIP split (48), meseros de playa usan el real
  const projVipSplit = usaProyeccion ? Math.round(totalPax * 0.8) : vipPax;
  const projExcSplit = usaProyeccion ? totalPax - projVipSplit       : excPax;
  const effectiveVipPax = Math.max(vipPax, projVipSplit);
  const effectiveExcPax = Math.max(excPax, projExcSplit);

  const ovrMap = {};
  overrides.forEach(o => { ovrMap[o.role] = o.quantity_override; });

  const staff = calcStaff(totalPax, effectiveVipPax, effectiveExcPax, ovrMap);
  const nivel = getOcupNivel(totalPax || 20);

  // Active turnos (salidas with confirmed pax today)
  const salidaPaxMap = {};
  reservas.forEach(r => {
    const sid = r.salida_id || r.salida;
    if (sid) salidaPaxMap[sid] = (salidaPaxMap[sid] || 0) + (r.pax || 0);
  });
  const activeSalidas = salidas.filter(s => salidaPaxMap[s.id] > 0);

  // ── Override modal handlers ──────────────────────────────────────────────
  const openOvrModal = (role) => {
    const valleVal = staff.valle[role];
    const picoVal  = staff.pico[role];
    setOvrQty(ovrMap[role] !== undefined ? ovrMap[role] : staff.raw[role]);
    setOvrReason(overrides.find(o => o.role === role)?.reason || "");
    setOvrModal({ role, valleVal, picoVal });
  };

  const saveOverride = async () => {
    if (!supabase || !ovrModal) return;
    setSaving(true);
    await supabase.from("staffing_overrides").upsert({
      id:                `OVR-${selDate}-${ovrModal.role}`,
      date:              selDate,
      role:              ovrModal.role,
      quantity_override: Number(ovrQty),
      reason:            ovrReason.trim() || null,
      created_at:        new Date().toISOString(),
    }, { onConflict: "id" });
    setSaving(false);
    setOvrModal(null);
    fetchData(selDate);
  };

  const deleteOverride = async (role) => {
    if (!supabase) return;
    await supabase.from("staffing_overrides").delete()
      .eq("id", `OVR-${selDate}-${role}`);
    fetchData(selDate);
  };

  const openProyModal = (date) => {
    const existing = proyecciones[date];
    setProyInput(existing?.pax_proyectado || 0);
    setProyNota(existing?.notas || "");
    setProyModal({ date });
  };

  const saveProyeccion = async () => {
    if (!supabase || !proyModal) return;
    setSaving(true);
    const pax = Number(proyInput);
    let err = null;
    if (pax === 0) {
      const { error } = await supabase.from("staffing_proyecciones").delete().eq("id", `PROY-${proyModal.date}`);
      err = error;
    } else {
      const { error } = await supabase.from("staffing_proyecciones").upsert({
        id:              `PROY-${proyModal.date}`,
        date:            proyModal.date,
        pax_proyectado:  pax,
        notas:           proyNota.trim() || null,
        updated_at:      new Date().toISOString(),
      }, { onConflict: "id" });
      err = error;
    }
    setSaving(false);
    if (err) { alert("Error guardando proyección: " + err.message); return; }
    setProyModal(null);
    fetchData(selDate);
  };

  // ── Print plan ──────────────────────────────────────────────────────────
  const handlePrint = () => {
    const rows = ROLES.map(r => {
      const isOvr = ovrMap[r.key] !== undefined;
      return "<tr>"
        + "<td>" + r.icon + " " + r.label + "</td>"
        + "<td>" + r.zona + "</td>"
        + "<td style='text-align:center'>" + staff.valle[r.key] + (isOvr ? " *" : "") + "</td>"
        + "<td style='text-align:center;font-weight:700;color:#D64545'>" + staff.pico[r.key] + (isOvr ? " *" : "") + "</td>"
        + "<td style='font-size:11px;color:#888'>" + r.noPico(staff.hayMovimiento) + "</td>"
        + "</tr>";
    }).join("");

    const turnosStr = activeSalidas.length > 0
      ? activeSalidas.map(s => s.hora + " · " + s.nombre + " · " + (salidaPaxMap[s.id] || 0) + " pax").join(" &nbsp;|&nbsp; ")
      : "Sin turnos confirmados";

    const html = [
      "<!DOCTYPE html><html><head><meta charset='utf-8'>",
      "<title>Staffing " + selDate + "</title>",
      "<style>",
      "body{font-family:Arial,sans-serif;margin:0;padding:24px 28px;color:#0D1B3E;font-size:12px}",
      "h1{font-size:26px;font-weight:900;margin:0 0 2px}",
      ".sub{color:#666;margin-bottom:18px;font-size:12px}",
      ".kpis{display:flex;gap:14px;margin-bottom:18px}",
      ".kpi{border:2px solid #0D1B3E;border-radius:8px;padding:10px 16px;flex:1;text-align:center}",
      ".kpi .v{font-size:30px;font-weight:900;line-height:1.1}",
      ".kpi .l{font-size:10px;text-transform:uppercase;color:#666;letter-spacing:1px}",
      "table{width:100%;border-collapse:collapse;margin-top:14px}",
      "th{background:#0D1B3E;color:#fff;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px}",
      "td{padding:6px 10px;border-bottom:1px solid #eee;font-size:12px}",
      "tr:nth-child(even) td{background:#f9f9f9}",
      ".alert{background:#FFF3CD;border:1px solid #E8A020;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:12px}",
      ".footer{margin-top:16px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:8px}",
      "@media print{body{padding:12px}@page{size:A4 landscape;margin:12mm}}",
      "</style></head><body>",
      "<h1>Plan de Staffing — Atolon Beach Club</h1>",
      "<div class='sub'>" + selDate + " &nbsp;·&nbsp; " + activeSalidas.length + " turno(s) activo(s) &nbsp;·&nbsp; Generado " + new Date().toLocaleString("es-CO") + "</div>",
      "<div class='kpis'>",
      "<div class='kpi'><div class='v'>" + (totalPax || 20) + "</div><div class='l'>Pax Total</div></div>",
      "<div class='kpi'><div class='v'>" + staff.totalValle + "</div><div class='l'>Staff Valle</div></div>",
      "<div class='kpi'><div class='v'>" + staff.totalPico + "</div><div class='l'>Staff Pico 12–3pm</div></div>",
      "<div class='kpi'><div class='v'>1:" + Math.round((totalPax || 20) / staff.totalPico) + "</div><div class='l'>Ratio Pax/Staff</div></div>",
      "<div class='kpi'><div class='v' style='color:" + nivel.color + "'>" + nivel.label.toUpperCase() + "</div><div class='l'>Ocupación</div></div>",
      "</div>",
      staff.hayMovimiento ? "<div class='alert'>⚠️ MOVIMIENTO 12–3pm: 1 Mesero de Playa pasa al Restaurante → regresa a las 3:00pm</div>" : "",
      (totalPax || 0) >= 100 ? "<div class='alert'>⚠️ ALTA OCUPACIÓN (100+ pax): Confirmar mise en place · Activar protocolo cocina · Hostess crítica</div>" : "",
      "<table><thead><tr><th>Rol</th><th>Zona</th><th style='text-align:center'>Valle</th><th style='text-align:center'>Pico 12–3pm</th><th>Nota pico</th></tr></thead><tbody>",
      rows,
      "<tr style='background:#0D1B3E;color:#fff'><td colspan='2'><b>TOTAL</b></td><td style='text-align:center'><b>" + staff.totalValle + "</b></td><td style='text-align:center'><b>" + staff.totalPico + "</b></td><td></td></tr>",
      "</tbody></table>",
      "<div style='margin-top:16px;font-size:12px'><b>Turnos:</b> " + turnosStr + "</div>",
      overrides.length > 0 ? "<div class='footer'>* Ajuste manual aplicado · " + overrides.map(o => o.role + ": " + o.quantity_override + (o.reason ? " (" + o.reason + ")" : "")).join(" · ") + "</div>" : "",
      "<div class='footer'>Atolon OS · Briefing 8:00am · Para uso interno del supervisor</div>",
      "</body></html>",
    ].join("");

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const IS = { background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, padding: "9px 12px", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const LS = { fontSize: 11, color: B.sand, fontWeight: 600, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" };

  const TABS = [
    { key: "dashboard", label: "Dashboard",  icon: "📋" },
    { key: "turnos",    label: "Turnos",     icon: "⏰" },
    { key: "semana",    label: "Semana",     icon: "📅" },
    { key: "ajustes",   label: "Ajustes",    icon: "⚙️" },
  ];

  // ── Tab: Dashboard ────────────────────────────────────────────────────────
  function TabDashboard() {
    const vipPct = totalPax > 0 ? Math.round((effectiveVipPax / totalPax) * 100) : 80;
    const excPct = 100 - vipPct;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Proyección activa */}
        {usaProyeccion && (
          <div style={{ background: B.sky + "18", border: `1px solid ${B.sky}55`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>📊</span>
              <div>
                <div style={{ fontWeight: 700, color: B.sky, fontSize: 13, marginBottom: 2 }}>Proyección activa — {proyHoy} pax total</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                  Confirmados: <strong style={{ color: B.white }}>{totalPaxReal}</strong> ({vipPax} VIP · {excPax} Exclusive) · Staffing usa el mayor por categoría.
                  {(vipPax > projVipSplit || excPax > projExcSplit) && (
                    <span style={{ color: B.sand, marginLeft: 6 }}>⚡ Real supera split proyectado — ajustado.</span>
                  )}
                  {proyecciones[selDate]?.notas && <span style={{ color: B.sand }}> · {proyecciones[selDate].notas}</span>}
                </div>
              </div>
            </div>
            <button onClick={() => openProyModal(selDate)} style={{ background: "transparent", border: `1px solid ${B.sky}55`, borderRadius: 8, color: B.sky, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>Editar</button>
          </div>
        )}

        {/* Real superó proyección total */}
        {!usaProyeccion && proyHoy > 0 && totalPaxReal > proyHoy && (
          <div style={{ background: B.success + "18", border: `1px solid ${B.success}55`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>📈</span>
            <div>
              <div style={{ fontWeight: 700, color: B.success, fontSize: 13, marginBottom: 2 }}>Números reales superaron proyección — staffing ajustado</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                Real: <strong style={{ color: B.white }}>{totalPaxReal} pax</strong> ({vipPax} VIP · {excPax} Exclusive) vs proyectado: {proyHoy}. Staffing recalculado sobre los reales.
              </div>
            </div>
          </div>
        )}

        {/* Overrides manuales por debajo del cálculo real */}
        {(() => {
          const rolesConflicto = ROLES.filter(r => ovrMap[r.key] !== undefined && ovrMap[r.key] < staff.raw[r.key]);
          if (rolesConflicto.length === 0) return null;
          return (
            <div style={{ background: B.warning + "18", border: `1px solid ${B.warning}55`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, color: B.warning, fontSize: 13, marginBottom: 4 }}>Ajustes manuales por debajo del cálculo actual</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.8 }}>
                  {rolesConflicto.map(r => (
                    <span key={r.key} style={{ marginRight: 12 }}>
                      {r.icon} {r.label}: <strong style={{ color: B.warning }}>{ovrMap[r.key]}</strong> asignado · fórmula sugiere <strong style={{ color: B.white }}>{staff.raw[r.key]}</strong>
                      <button onClick={() => deleteOverride(r.key)} style={{ marginLeft: 6, background: "none", border: `1px solid ${B.warning}55`, borderRadius: 4, color: B.warning, fontSize: 10, padding: "1px 6px", cursor: "pointer" }}>Restablecer</button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Alerts */}
        {staff.hayMovimiento && (
          <div style={{ background: B.warning + "18", border: `1px solid ${B.warning}55`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🔄</span>
            <div>
              <div style={{ fontWeight: 700, color: B.warning, fontSize: 13, marginBottom: 3 }}>Movimiento 12–3pm</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>1 Mesero de Playa pasa al Restaurante durante el almuerzo. La playa queda con {staff.valle.mesPlaya - 1} mesero(s). Regresa a las 3:00pm.</div>
            </div>
          </div>
        )}
        {(totalPax >= 100) && (
          <div style={{ background: B.danger + "18", border: `1px solid ${B.danger}55`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🔴</span>
            <div>
              <div style={{ fontWeight: 700, color: B.danger, fontSize: 13, marginBottom: 3 }}>Alta Ocupación — {totalPax} pax</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>Confirmar mise en place completa · Activar protocolo cocina · Hostess crítica para escalonamiento de restaurante.</div>
            </div>
          </div>
        )}
        {(totalPax >= 80 && totalPax < 100) && (
          <div style={{ background: B.warning + "14", border: `1px solid ${B.warning}44`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🟡</span>
            <div>
              <div style={{ fontWeight: 700, color: B.warning, fontSize: 13, marginBottom: 3 }}>Alta ocupación — {totalPax} pax</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>Hostess activa. Escalonamiento de restaurante recomendado.</div>
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "Pax Total",        value: totalPax || 0,          sub: usaProyeccion ? `${totalPaxReal} confirmados · ${proyHoy} proyectados` : totalPax ? `${vipPax} VIP · ${excPax} Exclusive` : "Sin reservas",  color: usaProyeccion ? B.sky : nivel.color },
            { label: "Staff Valle",      value: staff.totalValle,        sub: "8am–12pm y 3–6pm",                                                 color: B.sky },
            { label: "Staff Pico",       value: staff.totalPico,         sub: "12–3pm (almuerzo)",                                                color: B.danger },
            { label: "Ratio Pax/Staff",  value: `1:${Math.round((totalPax || 20) / staff.totalPico)}`, sub: "en pico", color: B.sand },
          ].map(k => (
            <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 18px", borderLeft: `4px solid ${k.color}` }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 28, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* VIP / Exclusive mix */}
        {totalPax > 0 && (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Mix VIP / Exclusive</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{effectiveVipPax} VIP · {effectiveExcPax} Exclusive{usaProyeccion ? " (80/20 proyectado)" : ""}</span>
            </div>
            <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 2 }}>
              <div style={{ width: vipPct + "%", background: B.sky, borderRadius: "6px 0 0 6px", transition: "width 0.4s" }} />
              <div style={{ width: excPct + "%", background: "#7C3AED", borderRadius: "0 6px 6px 0", transition: "width 0.4s" }} />
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: B.sky }}>● VIP Pass {vipPct}%</span>
              <span style={{ fontSize: 11, color: "#A78BFA" }}>● Exclusive {excPct}%</span>
            </div>
          </div>
        )}

        {/* Staffing table */}
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 52px 52px 36px" : "1fr 120px 120px 44px", background: B.navy, padding: "10px 16px", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Rol</div>
            <div style={{ fontSize: 11, color: B.sky,   textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>Valle</div>
            <div style={{ fontSize: 11, color: B.danger, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>Pico 12–3pm</div>
            <div />
          </div>

          {ROLES.map((r, i) => {
            const v = staff.valle[r.key];
            const p = staff.pico[r.key];
            const changed = p !== v;
            const isOvr   = ovrMap[r.key] !== undefined;
            return (
              <div key={r.key} style={{
                display: "grid", gridTemplateColumns: isMobile ? "1fr 52px 52px 36px" : "1fr 120px 120px 44px",
                padding: "11px 16px", gap: 8, alignItems: "center",
                borderBottom: i < ROLES.length - 1 ? `1px solid ${B.navyLight}` : "none",
                background: isOvr ? B.warning + "08" : "transparent",
              }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{r.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: B.white, display: "flex", alignItems: "center", gap: 6 }}>
                      {r.label}
                      {isOvr && <span style={{ fontSize: 9, background: B.warning + "33", color: B.warning, border: `1px solid ${B.warning}66`, borderRadius: 10, padding: "1px 6px", fontWeight: 600 }}>AJUSTE</span>}
                    </div>
                    {!isMobile && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{r.zona}</div>}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: B.sky }}>{v}</span>
                </div>
                <div style={{ textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: changed ? (p > v ? B.danger : B.success) : "rgba(255,255,255,0.4)" }}>{p}</span>
                  {changed && p > v && <span style={{ fontSize: 9, color: B.danger }}>▲</span>}
                  {changed && p < v && <span style={{ fontSize: 9, color: B.success }}>▼</span>}
                </div>
                <div>
                  <button onClick={() => openOvrModal(r.key)} style={{
                    background: isOvr ? B.warning + "22" : B.navyLight,
                    border: `1px solid ${isOvr ? B.warning + "44" : B.navyLight}`,
                    borderRadius: 6, color: isOvr ? B.warning : "rgba(255,255,255,0.5)",
                    padding: "4px 8px", fontSize: 12, cursor: "pointer", fontWeight: 700,
                  }}>
                    {isOvr ? "✎" : "+"}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Totals row */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 52px 52px 36px" : "1fr 120px 120px 44px", padding: "12px 16px", gap: 8, alignItems: "center", background: B.navy, borderTop: `2px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Staff</div>
            <div style={{ textAlign: "center", fontSize: 22, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", color: B.sky }}>{staff.totalValle}</div>
            <div style={{ textAlign: "center", fontSize: 22, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", color: B.danger }}>{staff.totalPico}</div>
            <div />
          </div>
        </div>

        {/* Active turnos summary */}
        {activeSalidas.length > 0 && (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Turnos del día</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {activeSalidas.map((s, i) => {
                const c = [B.success, B.sky, B.warning][i] || B.sand;
                return (
                  <div key={s.id} style={{ background: c + "22", border: `1px solid ${c}44`, borderRadius: 8, padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 800, color: c }}>{s.hora}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: B.white }}>{s.nombre}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{salidaPaxMap[s.id] || 0} pax · regreso {s.hora_regreso}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Tab: Turnos ───────────────────────────────────────────────────────────
  function TabTurnos() {
    const hasT3 = activeSalidas.length >= 3;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
          Bloques horarios del día · {selDate} · {totalPax || 0} pax confirmados
        </div>
        {BLOQUES.map((b, i) => {
          const isPico = b.pico;
          const showBlock = b.cond !== "T3" || hasT3;
          if (!showBlock && b.cond === "T3") return (
            <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 16px", border: `1px solid ${B.navyLight}`, opacity: 0.4, display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.3)", width: 52, flexShrink: 0 }}>{b.hora}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{b.label} (no aplica hoy)</span>
            </div>
          );
          return (
            <div key={i} style={{
              background: isPico ? B.danger + "18" : B.navyMid,
              border: `1px solid ${isPico ? B.danger + "55" : B.navyLight}`,
              borderRadius: 10,
              padding: isMobile ? "12px 14px" : "14px 20px",
            }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                {/* Hora */}
                <div style={{ width: 60, flexShrink: 0 }}>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 800, color: isPico ? B.danger : b.color }}>{b.hora}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>→ {b.end}</div>
                </div>

                {/* Label + Turnos */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, fontWeight: isPico ? 800 : 600, color: isPico ? B.danger : B.white, marginBottom: 6 }}>
                    {isPico && "🔥 "}{b.label}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {b.turnos.map(t => {
                      const c = TURNO_COLORS[t] || B.sand;
                      return (
                        <span key={t} style={{ background: c + "22", border: `1px solid ${c}44`, color: c, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{t}</span>
                      );
                    })}
                    {b.turnos.length === 0 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Sin grupos activos</span>}
                  </div>
                </div>

                {/* Staff */}
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", color: isPico ? B.danger : B.sky }}>
                      {isPico ? staff.totalPico : staff.totalValle}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>staff</div>
                  </div>
                </div>
              </div>

              {/* Pico detail */}
              {isPico && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, borderTop: `1px solid ${B.danger}33`, paddingTop: 10 }}>
                  {staff.hayMovimiento && (
                    <span style={{ fontSize: 11, background: B.warning + "22", color: B.warning, border: `1px solid ${B.warning}44`, borderRadius: 6, padding: "3px 10px" }}>
                      🔄 1 Mesero Playa → Restaurante
                    </span>
                  )}
                  <span style={{ fontSize: 11, background: B.sky + "22", color: B.sky, border: `1px solid ${B.sky}44`, borderRadius: 6, padding: "3px 10px" }}>
                    🥘 {staff.pico.runnersCom} Runner{staff.pico.runnersCom !== 1 ? "s" : ""} Comida activo{staff.pico.runnersCom !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 11, background: B.success + "22", color: B.success, border: `1px solid ${B.success}44`, borderRadius: 6, padding: "3px 10px" }}>
                    🍽️ {staff.pico.mesRest} Mesero{staff.pico.mesRest !== 1 ? "s" : ""} Restaurante
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Escalonamiento nota */}
        {activeSalidas.length >= 2 && (
          <div style={{ background: B.sky + "11", border: `1px solid ${B.sky}33`, borderRadius: 10, padding: "12px 16px", marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.sky, marginBottom: 6 }}>📋 Escalonamiento Restaurante</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activeSalidas.slice(0, 3).map((s, i) => {
                const horarios = ["12:00–13:00", "12:30–13:30", "13:00–14:00"];
                return (
                  <div key={s.id} style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                    <span style={{ fontWeight: 700 }}>{s.hora}</span> → Almuerzo sugerido <span style={{ color: B.white, fontWeight: 600 }}>{horarios[i] || "13:00–14:00"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Tab: Semana ───────────────────────────────────────────────────────────
  function TabSemana() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Semana del {fmtDay(weekData[0]?.date)} al {fmtDay(weekData[6]?.date)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Toca un día para ver el detalle · 📊 para proyectar</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(7, 1fr)", gap: 10 }}>
          {weekData.map(d => {
            const proyD    = proyecciones[d.date]?.pax_proyectado || 0;
            const efectivo = Math.max(d.totalPax, proyD);
            const usaProy  = proyD > d.totalPax && proyD > 0;
            const effVip   = usaProy ? Math.round(efectivo * 0.8) : d.vipPax;
            const effExc   = usaProy ? efectivo - effVip : d.excPax;
            const s        = calcStaff(efectivo, effVip, effExc);
            const nv       = getOcupNivel(efectivo || 20);
            const isSel    = d.date === selDate;
            const isToday  = d.date === today;
            const tieneProyeccion = proyD > 0;
            return (
              <div key={d.date} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <div
                  onClick={() => { setSelDate(d.date); setView("dashboard"); }}
                  style={{
                    background: isSel ? B.sky + "22" : B.navyMid,
                    border: `2px solid ${isSel ? B.sky : isToday ? B.sand + "66" : B.navyLight}`,
                    borderRadius: tieneProyeccion ? "12px 12px 0 0" : 12,
                    padding: "14px 12px", cursor: "pointer",
                    textAlign: "center", transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 11, color: isToday ? B.sand : "rgba(255,255,255,0.5)", fontWeight: isToday ? 700 : 400, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                    {fmtDayShort(d.date)}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: isSel ? B.sky : B.white, marginBottom: 8 }}>
                    {fmtDateNum(d.date)}
                  </div>
                  <div style={{ background: nv.bg, border: `1px solid ${nv.color}44`, color: nv.color, borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 700, marginBottom: 8 }}>
                    {nv.label.toUpperCase()}
                  </div>
                  {/* Pax: real vs proyectado */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: proyD > d.totalPax ? B.sky : nv.color, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {efectivo} pax
                  </div>
                  {tieneProyeccion && (
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {d.totalPax} real · <span style={{ color: B.sky }}>{proyD} proy</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                    Valle {s.totalValle} · Pico {s.totalPico}
                  </div>
                </div>
                {/* Proyección button */}
                <button
                  onClick={e => { e.stopPropagation(); openProyModal(d.date); }}
                  style={{
                    background: tieneProyeccion ? B.sky + "22" : B.navyLight,
                    border: `1px solid ${tieneProyeccion ? B.sky + "55" : B.navyLight}`,
                    borderTop: "none",
                    borderRadius: "0 0 10px 10px",
                    color: tieneProyeccion ? B.sky : "rgba(255,255,255,0.4)",
                    padding: "6px 4px", fontSize: 11, cursor: "pointer", fontWeight: 600,
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}
                >
                  <span>📊</span>
                  <span>{tieneProyeccion ? proyD + " proy" : "Proyectar"}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Weekly summary table */}
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", marginTop: 4 }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${B.navyLight}`, fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Resumen Semanal</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: B.navy }}>
                  {["Día", "Real", "Proyectado", "Efectivo", "Nivel", "Valle", "Pico"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekData.map(d => {
                  const proyD    = proyecciones[d.date]?.pax_proyectado || 0;
                  const efectivo = Math.max(d.totalPax, proyD);
                  const usaProy  = proyD > d.totalPax && proyD > 0;
                  const effVip   = usaProy ? Math.round(efectivo * 0.8) : d.vipPax;
                  const effExc   = usaProy ? efectivo - effVip : d.excPax;
                  const s  = calcStaff(efectivo, effVip, effExc);
                  const nv = getOcupNivel(efectivo || 20);
                  const isSel = d.date === selDate;
                  const tieneProyeccion = proyD > 0;
                  return (
                    <tr key={d.date} onClick={() => { setSelDate(d.date); setView("dashboard"); }}
                      style={{ background: isSel ? B.sky + "11" : "transparent", cursor: "pointer", borderBottom: `1px solid ${B.navyLight}` }}>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: d.date === today ? 700 : 400, color: d.date === today ? B.sand : B.white }}>
                        {fmtDay(d.date)}{d.date === today ? " (hoy)" : ""}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{d.totalPax}</td>
                      <td style={{ padding: "10px 14px" }}>
                        {tieneProyeccion ? (
                          <button onClick={e => { e.stopPropagation(); openProyModal(d.date); }}
                            style={{ background: B.sky + "22", border: `1px solid ${B.sky}55`, borderRadius: 6, color: B.sky, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            {proyD} pax
                          </button>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); openProyModal(d.date); }}
                            style={{ background: "transparent", border: `1px solid ${B.navyLight}`, borderRadius: 6, color: "rgba(255,255,255,0.35)", padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>
                            + Agregar
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: proyD > d.totalPax ? B.sky : nv.color }}>{efectivo}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ background: nv.bg, color: nv.color, border: `1px solid ${nv.color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{nv.label}</span>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 700, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.totalValle}</td>
                      <td style={{ padding: "10px 14px", fontSize: 14, fontWeight: 700, color: B.danger, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.totalPico}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Tab: Ajustes ──────────────────────────────────────────────────────────
  function TabAjustes() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          Ajustes manuales para el {selDate}. Los overrides se aplican sobre el cálculo automático y quedan registrados.
        </div>

        {overrides.length === 0 ? (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: "40px 0", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: B.white, marginBottom: 4 }}>Sin ajustes manuales</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>El staffing está calculado automáticamente basado en las reservas.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overrides.map(o => {
              const role = ROLES.find(r => r.key === o.role);
              return (
                <div key={o.id} style={{ background: B.navyMid, border: `1px solid ${B.warning}44`, borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>{role?.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: B.white }}>{role?.label || o.role}</span>
                      <span style={{ background: B.warning + "33", color: B.warning, border: `1px solid ${B.warning}55`, borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
                        → {o.quantity_override}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                        (calculado: {staff.raw[o.role]})
                      </span>
                    </div>
                    {o.reason && <div style={{ fontSize: 12, color: B.sand }}>{o.reason}</div>}
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                      {new Date(o.created_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                      {o.created_by && ` · ${o.created_by}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openOvrModal(o.role)} style={{ background: B.navyLight, border: "none", borderRadius: 6, color: B.sky, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>✎</button>
                    <button onClick={() => deleteOverride(o.role)} style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 6, color: B.danger, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add override */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Ajustar rol</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ROLES.map(r => (
              <button key={r.key} onClick={() => openOvrModal(r.key)} style={{
                background: ovrMap[r.key] !== undefined ? B.warning + "22" : B.navyLight,
                border: `1px solid ${ovrMap[r.key] !== undefined ? B.warning + "55" : B.navyLight}`,
                borderRadius: 8, color: ovrMap[r.key] !== undefined ? B.warning : B.white,
                padding: "7px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600,
                display: "flex", gap: 6, alignItems: "center",
              }}>
                <span>{r.icon}</span>
                <span>{r.label}</span>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 800 }}>
                  {ovrMap[r.key] !== undefined ? ovrMap[r.key] : staff.raw[r.key]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "0 0 40px" : "0 0 40px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 900, color: B.sand, margin: 0, letterSpacing: 1 }}>Staffing</h1>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Cálculo automático de dotación · {selDate === today ? "Hoy" : selDate}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Date selector */}
          <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
            style={{ ...IS, width: "auto", padding: "7px 12px", fontSize: 13 }} />
          <button onClick={() => setSelDate(today)} style={{
            background: selDate === today ? B.sky + "22" : B.navyLight,
            border: `1px solid ${selDate === today ? B.sky : B.navyLight}`,
            borderRadius: 8, color: selDate === today ? B.sky : "rgba(255,255,255,0.5)",
            padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
          }}>Hoy</button>
          <button onClick={handlePrint} style={{
            background: "transparent", border: `1px solid ${B.sand}55`, borderRadius: 8, color: B.sand,
            padding: "7px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            🖨️ {isMobile ? "" : "Imprimir Plan"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${B.navyLight}`, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setView(t.key)} style={{
            background: "none", border: "none",
            borderBottom: view === t.key ? `2px solid ${B.sky}` : "2px solid transparent",
            color: view === t.key ? B.sky : "rgba(255,255,255,0.4)",
            padding: isMobile ? "10px 12px" : "10px 20px", fontSize: 13, fontWeight: 700,
            cursor: "pointer", display: "flex", gap: 6, alignItems: "center", marginBottom: -1, whiteSpace: "nowrap",
          }}>
            <span>{t.icon}</span>
            {!isMobile && <span>{t.label}</span>}
          </button>
        ))}

        {/* Occupancy badge in tab bar */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", paddingRight: 4 }}>
          <span style={{
            background: nivel.bg, color: nivel.color, border: `1px solid ${nivel.color}44`,
            borderRadius: 10, padding: "3px 10px", fontSize: 11, fontWeight: 700,
          }}>
            {totalPax || 0} pax · {nivel.label}
          </span>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
          Cargando datos de staffing...
        </div>
      ) : (
        <>
          {view === "dashboard" && <TabDashboard />}
          {view === "turnos"    && <TabTurnos />}
          {view === "semana"    && <TabSemana />}
          {view === "ajustes"   && <TabAjustes />}
        </>
      )}

      {/* Proyección modal */}
      {proyModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => e.target === e.currentTarget && setProyModal(null)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 360, border: `1px solid ${B.sky}44` }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: B.sky, display: "flex", gap: 8, alignItems: "center" }}>
              📊 Proyección de Pax
            </h3>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
              {fmtDay(proyModal.date)} · Reservas confirmadas: <strong style={{ color: B.white }}>{weekData.find(d => d.date === proyModal.date)?.totalPax || 0}</strong>
              <div style={{ marginTop: 4, color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                El staffing usará el valor más alto entre lo proyectado y lo real.
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={LS}>Pax proyectados</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={() => setProyInput(q => Math.max(0, Number(q) - 5))}
                  style={{ background: B.navyLight, border: "none", borderRadius: 8, color: B.white, width: 40, height: 40, fontSize: 16, cursor: "pointer", fontWeight: 700 }}>−5</button>
                <button onClick={() => setProyInput(q => Math.max(0, Number(q) - 1))}
                  style={{ background: B.navyLight, border: "none", borderRadius: 8, color: B.white, width: 36, height: 40, fontSize: 18, cursor: "pointer", fontWeight: 700 }}>−</button>
                <input type="number" min={0} max={120} value={proyInput} onChange={e => setProyInput(Number(e.target.value))}
                  style={{ ...IS, width: 70, textAlign: "center", padding: "8px", fontSize: 20, fontWeight: 800 }} />
                <button onClick={() => setProyInput(q => Math.min(120, Number(q) + 1))}
                  style={{ background: B.navyLight, border: "none", borderRadius: 8, color: B.white, width: 36, height: 40, fontSize: 18, cursor: "pointer", fontWeight: 700 }}>+</button>
                <button onClick={() => setProyInput(q => Math.min(120, Number(q) + 5))}
                  style={{ background: B.navyLight, border: "none", borderRadius: 8, color: B.white, width: 40, height: 40, fontSize: 16, cursor: "pointer", fontWeight: 700 }}>+5</button>
              </div>
              {/* Quick select */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {[20, 40, 60, 80, 100, 120].map(v => (
                  <button key={v} onClick={() => setProyInput(v)}
                    style={{ background: proyInput === v ? B.sky + "33" : B.navyLight, border: `1px solid ${proyInput === v ? B.sky : B.navyLight}`, borderRadius: 6, color: proyInput === v ? B.sky : "rgba(255,255,255,0.5)", padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={LS}>Nota (opcional)</label>
              <input value={proyNota} onChange={e => setProyNota(e.target.value)}
                placeholder="Ej: Evento privado, grupo B2B, temporada alta..."
                style={IS} />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setProyModal(null)} style={{ flex: 1, padding: "11px", borderRadius: 8, background: B.navyLight, border: "none", color: B.white, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              {proyecciones[proyModal.date] && (
                <button onClick={async () => { setProyInput(0); await saveProyeccion(); }} disabled={saving}
                  style={{ padding: "11px 16px", borderRadius: 8, background: B.danger + "22", border: `1px solid ${B.danger}44`, color: B.danger, fontSize: 13, cursor: "pointer" }}>
                  Borrar
                </button>
              )}
              <button onClick={saveProyeccion} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 8, background: B.sky, border: "none", color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Guardando..." : "💾 Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override modal */}
      {ovrModal && (() => {
        const role = ROLES.find(r => r.key === ovrModal.role);
        const calcVal = staff.raw[ovrModal.role];
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            onClick={e => e.target === e.currentTarget && setOvrModal(null)}>
            <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 380, border: `1px solid ${B.warning}44` }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: B.warning, display: "flex", gap: 8, alignItems: "center" }}>
                <span>{role?.icon}</span> Ajuste — {role?.label}
              </h3>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
                Valor calculado: <strong style={{ color: B.white }}>{calcVal}</strong> · Valle: {ovrModal.valleVal} · Pico: {ovrModal.picoVal}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={LS}>Cantidad override</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button onClick={() => setOvrQty(q => Math.max(0, Number(q) - 1))}
                    style={{ background: B.navyLight, border: "none", borderRadius: 8, color: B.white, width: 40, height: 40, fontSize: 20, cursor: "pointer", fontWeight: 700 }}>−</button>
                  <input type="number" min={0} max={20} value={ovrQty} onChange={e => setOvrQty(Number(e.target.value))}
                    style={{ ...IS, width: 80, textAlign: "center", padding: "8px" }} />
                  <button onClick={() => setOvrQty(q => Number(q) + 1)}
                    style={{ background: B.navyLight, border: "none", borderRadius: 8, color: B.white, width: 40, height: 40, fontSize: 20, cursor: "pointer", fontWeight: 700 }}>+</button>
                  <button onClick={() => setOvrQty(calcVal)} style={{ background: "transparent", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.5)", padding: "8px 12px", fontSize: 11, cursor: "pointer" }}>Reset</button>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={LS}>Razón del ajuste</label>
                <input value={ovrReason} onChange={e => setOvrReason(e.target.value)}
                  placeholder="Ej: Personal de vacaciones, evento especial..."
                  style={IS} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setOvrModal(null)} style={{ flex: 1, padding: "11px", borderRadius: 8, background: B.navyLight, border: "none", color: B.white, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                <button onClick={saveOverride} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 8, background: B.warning, border: "none", color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Guardando..." : "💾 Guardar Ajuste"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
