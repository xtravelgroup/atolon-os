import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { logAccion } from "../lib/logAccion";
import { B, todayStr } from "../brand";
import {
  useBreakpoint, pagePadding, sectionCard, responsiveGrid, tableWrapper,
  noOverflow, T, S, TOUCH_TARGET,
} from "../lib/responsive.js";

// ─────────────────────────────────────────────────────────────────────────────
// Plan / Cronograma — Plan de integración Atolón → Grupo Las Américas
// Fuente: hoja "Plan" del cronograma (IC-GLA-PI-001). Una fila por tarea con
// dependencias, fechas, prioridad, estado y avance. Campos editables aquí:
// Estado, Avance %, Responsable y Comentarios (igual que en la hoja).
// ─────────────────────────────────────────────────────────────────────────────

const DIA_D = "2026-11-01";     // apertura bajo GLA
const CORTE = "2026-10-31";     // corte contable

// Orden y color de áreas (orden de la hoja)
const AREAS = [
  ["GOB", "Gobierno y Dirección", "#8ECAE6"],
  ["LEG", "Legal y Contratos", "#f59e0b"],
  ["FIN", "Finanzas y Contabilidad", "#f5c842"],
  ["TH", "Talento Humano", "#C8B99A"],
  ["SIS", "Sistemas y Tecnología", "#38bdf8"],
  ["COC", "Cocina y A&B", "#22c55e"],
  ["BAR", "Bar y Bebidas", "#a78bfa"],
  ["SER", "Servicio y Experiencia", "#ec4899"],
  ["PLA", "Playa y Piscina", "#06b6d4"],
  ["MUE", "Muelle y Transporte", "#0ea5e9"],
  ["EVE", "Eventos y Grupos", "#f97316"],
  ["MAN", "Mantenimiento e Ing.", "#A855F7"],
  ["VEN", "Ventas", "#38bdf8"],
  ["MKT", "Marketing y Marca", "#ec4899"],
  ["REV", "Revenue Management", "#f5c842"],
  ["COM", "Compras y Almacén", "#f97316"],
  ["COMU", "Comunicaciones", "#8ECAE6"],
  ["REC", "Recepción", "#a78bfa"],
  ["HAB", "Habitaciones", "#a78bfa"],
];
const areaMeta = (cod) => AREAS.find((a) => a[0] === cod) || [cod, cod, "#8ECAE6"];

const ESTADOS = ["Pendiente", "En curso", "Completada", "Bloqueada"];
const estadoColor = (e) => ({ Completada: B.success, "En curso": B.warning, Bloqueada: B.danger, Pendiente: "#64748b" }[e] || "#64748b");
const PRIORIDADES = ["Crítica", "Alta", "Media", "Baja"];
const prioColor = (p) => ({ "Crítica": "#f59e0b", Alta: "#8ECAE6", Media: "#C8B99A", Baja: "rgba(255,255,255,0.4)" }[p] || "#C8B99A");

const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "—");
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const isVencida = (t) => t.estado !== "Completada" && t.fecha_fin && t.fecha_fin < todayStr();

export default function Plan() {
  const bp = useBreakpoint();
  const { isMobile } = bp;
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("areas");
  const [openTask, setOpenTask] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [q, setQ] = useState("");
  const [fArea, setFArea] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fPrio, setFPrio] = useState("");

  const load = async () => {
    const { data } = await supabase.from("plan_tareas").select("*").order("orden");
    setTasks(data || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const patch = (id, fields) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    supabase.from("plan_tareas").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).then(() => {});
    logAccion({ modulo: "plan", accion: "editar_tarea", tabla: "plan_tareas", registroId: id, datosDespues: fields });
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (fArea && t.area_cod !== fArea) return false;
      if (fEstado && t.estado !== fEstado) return false;
      if (fPrio && t.prioridad !== fPrio) return false;
      if (s && ![t.codigo, t.titulo, t.descripcion, t.responsable, t.area].some((x) => (x || "").toLowerCase().includes(s))) return false;
      return true;
    });
  }, [tasks, q, fArea, fEstado, fPrio]);

  const k = useMemo(() => {
    const tot = filtered.length;
    const comp = filtered.filter((t) => t.estado === "Completada").length;
    const curso = filtered.filter((t) => t.estado === "En curso").length;
    const venc = filtered.filter(isVencida).length;
    const crit = filtered.filter((t) => t.prioridad === "Crítica" && t.estado !== "Completada").length;
    const avance = tot ? Math.round(filtered.reduce((a, t) => a + (Number(t.avance) || 0), 0) / tot) : 0;
    return { tot, comp, curso, venc, crit, avance };
  }, [filtered]);

  const diasD = daysBetween(todayStr(), DIA_D);

  if (loading) return <div style={{ ...pagePadding(bp), color: "rgba(255,255,255,0.6)", fontSize: T.base }}>Cargando plan…</div>;

  return (
    <div style={{ ...pagePadding(bp), ...noOverflow, color: "#fff" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: S.md, marginBottom: S.lg }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: isMobile ? T.h3 : T.h1, fontWeight: 800, letterSpacing: "-0.02em" }}>Plan de Integración</div>
          <div style={{ fontSize: T.sm, color: "rgba(255,255,255,0.55)" }}>Atolón → Grupo Las Américas · apertura 1 de noviembre</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: isMobile ? T.h2 : T.h1, fontWeight: 800, color: diasD >= 0 ? B.sky : B.warning, lineHeight: 1 }}>{diasD >= 0 ? diasD : "—"}</div>
          <div style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)" }}>días para el Día D</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ ...responsiveGrid({ cols: 6, minWidth: isMobile ? 140 : 150, gap: S.md }), marginBottom: S.lg }}>
        <KPI label="Tareas" value={k.tot} />
        <KPI label="Avance global" value={k.avance + "%"} color={B.sky} bar={k.avance} />
        <KPI label="Completadas" value={k.comp} color={B.success} />
        <KPI label="En curso" value={k.curso} color={B.warning} />
        <KPI label="Vencidas" value={k.venc} color={k.venc ? B.danger : "#64748b"} />
        <KPI label="Críticas abiertas" value={k.crit} color="#f59e0b" />
      </div>

      {/* Controles */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: S.sm, marginBottom: S.lg }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[["areas", "Áreas"], ["gantt", "Gantt"], ["resumen", "Resumen"]].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{ ...tabBtn, minHeight: TOUCH_TARGET, background: view === v ? B.sky : "rgba(255,255,255,0.06)", color: view === v ? B.navy : "rgba(255,255,255,0.7)" }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarea, área, responsable…" style={{ ...ctrl, flex: 1, minWidth: 160, maxWidth: 300 }} />
        <select value={fArea} onChange={(e) => setFArea(e.target.value)} style={{ ...ctrl, maxWidth: 180 }}><option value="">Todas las áreas</option>{AREAS.map((a) => <option key={a[0]} value={a[0]}>{a[1]}</option>)}</select>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={{ ...ctrl, maxWidth: 150 }}><option value="">Todos los estados</option>{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select>
        <select value={fPrio} onChange={(e) => setFPrio(e.target.value)} style={{ ...ctrl, maxWidth: 150 }}><option value="">Toda prioridad</option>{PRIORIDADES.map((p) => <option key={p}>{p}</option>)}</select>
      </div>

      {view === "areas" && (
        <AreasView tasks={filtered} isMobile={isMobile} collapsed={collapsed} setCollapsed={setCollapsed} openTask={openTask} setOpenTask={setOpenTask} patch={patch} />
      )}
      {view === "gantt" && <GanttView tasks={filtered} isMobile={isMobile} onOpen={setOpenTask} />}
      {view === "resumen" && <ResumenView tasks={filtered} isMobile={isMobile} onArea={(cod) => { setFArea(cod); setView("areas"); }} />}

      {openTask && <TaskModal task={tasks.find((t) => t.id === openTask)} allTasks={tasks} isMobile={isMobile} onClose={() => setOpenTask(null)} patch={patch} />}
    </div>
  );
}

// ─── KPI ─────────────────────────────────────────────────────────────────────
function KPI({ label, value, color, bar }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: T.h2, fontWeight: 800, color: color || "#fff", lineHeight: 1.2 }}>{value}</div>
      {bar != null && <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", marginTop: 6, overflow: "hidden" }}><div style={{ width: bar + "%", height: "100%", background: color || B.sky }} /></div>}
    </div>
  );
}

// ─── Vista Áreas (lista agrupada, colapsable) ─────────────────────────────────
function AreasView({ tasks, isMobile, collapsed, setCollapsed, setOpenTask, patch }) {
  const byArea = useMemo(() => {
    const m = {};
    tasks.forEach((t) => { (m[t.area_cod] ||= []).push(t); });
    return m;
  }, [tasks]);
  const orderedCods = AREAS.map((a) => a[0]).filter((c) => byArea[c]);
  if (!orderedCods.length) return <Empty />;
  return (
    <div>
      {orderedCods.map((cod) => {
        const [, name, color] = areaMeta(cod);
        const list = byArea[cod];
        const done = list.filter((t) => t.estado === "Completada").length;
        const isCol = collapsed[cod];
        return (
          <div key={cod} style={{ marginBottom: S.md }}>
            <div onClick={() => setCollapsed((c) => ({ ...c, [cod]: !c[cod] }))} style={{ display: "flex", alignItems: "center", gap: S.sm, cursor: "pointer", padding: "10px 12px", background: B.navyMid, borderRadius: 12, borderLeft: `4px solid ${color}` }}>
              <span style={{ fontSize: 11, transform: isCol ? "rotate(-90deg)" : "none", transition: "transform .15s", color: "rgba(255,255,255,0.5)" }}>▾</span>
              <span style={{ fontWeight: 700, fontSize: T.md, flex: 1 }}>{name}</span>
              <span style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)" }}>{done}/{list.length}</span>
            </div>
            {!isCol && (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                {list.map((t) => <TaskRow key={t.id} t={t} isMobile={isMobile} onOpen={() => setOpenTask(t.id)} patch={patch} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({ t, isMobile, onOpen, patch }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S.sm, padding: "9px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, borderLeft: `3px solid ${estadoColor(t.estado)}` }}>
      <div onClick={onOpen} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "monospace", fontSize: T.xs, color: "rgba(255,255,255,0.4)" }}>{t.codigo}</span>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: prioColor(t.prioridad), flexShrink: 0 }} title={t.prioridad} />
          <span style={{ fontSize: T.base, fontWeight: 600, whiteSpace: isMobile ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.titulo}</span>
        </div>
        <div style={{ fontSize: T.xs, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
          {fmt(t.fecha_inicio)} – {fmt(t.fecha_fin)}{t.responsable ? " · " + t.responsable : ""}{isVencida(t) ? "  ⚠ vencida" : ""}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {!isMobile && <div style={{ width: 54, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}><div style={{ width: (t.avance || 0) + "%", height: "100%", background: estadoColor(t.estado) }} /></div>}
        <select value={t.estado} onChange={(e) => { const est = e.target.value; patch(t.id, { estado: est, ...(est === "Completada" ? { avance: 100 } : {}) }); }} onClick={(e) => e.stopPropagation()}
          style={{ fontSize: T.xs, padding: "5px 8px", borderRadius: 999, border: "none", background: estadoColor(t.estado) + "22", color: estadoColor(t.estado), fontWeight: 700, cursor: "pointer", minHeight: 30 }}>
          {ESTADOS.map((e) => <option key={e} style={{ color: "#000" }}>{e}</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── Vista Gantt (timeline por día, scroll horizontal) ────────────────────────
function GanttView({ tasks, isMobile, onOpen }) {
  const dated = tasks.filter((t) => t.fecha_inicio && t.fecha_fin);
  if (!dated.length) return <Empty />;
  const min = dated.reduce((a, t) => (t.fecha_inicio < a ? t.fecha_inicio : a), dated[0].fecha_inicio);
  const max = dated.reduce((a, t) => (t.fecha_fin > a ? t.fecha_fin : a), dated[0].fecha_fin);
  const total = Math.max(1, daysBetween(min, max) + 1);
  const PX = 8;                       // px por día
  const timelineW = total * PX;
  const labelW = isMobile ? 130 : 230;
  const pos = (d) => daysBetween(min, d) * PX;

  // meses para el eje
  const months = [];
  let cur = new Date(min + "T00:00:00");
  const end = new Date(max + "T00:00:00");
  while (cur <= end) {
    const mstart = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const label = cur.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
    const left = Math.max(0, daysBetween(min, cur.toISOString().slice(0, 10)) * PX);
    months.push({ label, left });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  const barColor = (t) => (t.estado === "Completada" ? B.success : t.prioridad === "Crítica" ? "#f59e0b" : B.sky);
  const rows = [...dated].sort((a, b) => a.fecha_inicio < b.fecha_inicio ? -1 : a.fecha_inicio > b.fecha_inicio ? 1 : a.orden - b.orden);

  const todayLeft = todayStr() >= min && todayStr() <= max ? pos(todayStr()) : null;
  const dLeft = DIA_D >= min && DIA_D <= max ? pos(DIA_D) : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 14, marginBottom: S.sm, fontSize: T.xs, color: "rgba(255,255,255,0.6)", flexWrap: "wrap" }}>
        <Leg c={B.sky} l="Activa" /><Leg c="#f59e0b" l="Crítica" /><Leg c={B.success} l="Completada" />
        <span style={{ color: B.warning }}>│ Día D (1 nov)</span>
      </div>
      <div style={{ ...tableWrapper, background: B.navyMid, borderRadius: 14, padding: "8px 0" }}>
        <div style={{ minWidth: labelW + timelineW }}>
          {/* eje meses */}
          <div style={{ display: "flex", position: "sticky", top: 0 }}>
            <div style={{ width: labelW, flexShrink: 0 }} />
            <div style={{ position: "relative", height: 22, width: timelineW }}>
              {months.map((m, i) => <div key={i} style={{ position: "absolute", left: m.left, fontSize: T.xs, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", borderLeft: "1px solid rgba(255,255,255,0.08)", paddingLeft: 4 }}>{m.label}</div>)}
            </div>
          </div>
          {/* filas */}
          <div style={{ position: "relative" }}>
            {todayLeft != null && <Marker left={labelW + todayLeft} color="rgba(142,202,230,0.5)" />}
            {dLeft != null && <Marker left={labelW + dLeft} color={B.warning} />}
            {rows.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", height: 26 }}>
                <div onClick={() => onOpen(t.id)} style={{ width: labelW, flexShrink: 0, paddingRight: 8, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: T.xs }}>
                  <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.4)" }}>{t.codigo}</span> {t.titulo}
                </div>
                <div style={{ position: "relative", width: timelineW, height: "100%" }}>
                  <div onClick={() => onOpen(t.id)} title={`${t.titulo} · ${fmt(t.fecha_inicio)}–${fmt(t.fecha_fin)} · ${t.avance || 0}%`}
                    style={{ position: "absolute", top: 6, left: pos(t.fecha_inicio), width: Math.max(PX, (daysBetween(t.fecha_inicio, t.fecha_fin) + 1) * PX), height: 14, borderRadius: 4, background: barColor(t) + "55", border: `1px solid ${barColor(t)}`, cursor: "pointer", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: (t.avance || 0) + "%", background: barColor(t) }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
const Marker = ({ left, color }) => <div style={{ position: "absolute", top: 0, bottom: 0, left, width: 2, background: color, zIndex: 2, pointerEvents: "none" }} />;
const Leg = ({ c, l }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 10, borderRadius: 3, background: c + "55", border: `1px solid ${c}` }} />{l}</span>;

// ─── Vista Resumen (por área) ─────────────────────────────────────────────────
function ResumenView({ tasks, isMobile, onArea }) {
  const rows = AREAS.map(([cod, name, color]) => {
    const list = tasks.filter((t) => t.area_cod === cod);
    if (!list.length) return null;
    const done = list.filter((t) => t.estado === "Completada").length;
    const pend = list.filter((t) => t.estado === "Pendiente").length;
    const crit = list.filter((t) => t.prioridad === "Crítica").length;
    const venc = list.filter(isVencida).length;
    const av = Math.round(list.reduce((a, t) => a + (Number(t.avance) || 0), 0) / list.length);
    return { cod, name, color, tot: list.length, done, pend, crit, venc, av };
  }).filter(Boolean);
  if (!rows.length) return <Empty />;
  return (
    <div style={{ ...tableWrapper }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
        <thead><tr>{["Área", "Tareas", "Críticas", "Pend.", "Vencidas", "Compl.", "Avance"].map((h) => <th key={h} style={{ textAlign: h === "Área" ? "left" : "center", fontSize: T.xs, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cod} onClick={() => onArea(r.cod)} style={{ cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <td style={{ padding: "9px 10px", fontWeight: 600, fontSize: T.base }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.color, marginRight: 8 }} />{r.name}</td>
              <td style={{ textAlign: "center", fontSize: T.base }}>{r.tot}</td>
              <td style={{ textAlign: "center", fontSize: T.base, color: r.crit ? "#f59e0b" : "rgba(255,255,255,0.4)" }}>{r.crit}</td>
              <td style={{ textAlign: "center", fontSize: T.base }}>{r.pend}</td>
              <td style={{ textAlign: "center", fontSize: T.base, color: r.venc ? B.danger : "rgba(255,255,255,0.4)" }}>{r.venc}</td>
              <td style={{ textAlign: "center", fontSize: T.base, color: B.success }}>{r.done}</td>
              <td style={{ textAlign: "center", minWidth: 90 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}><div style={{ width: r.av + "%", height: "100%", background: r.color }} /></div>
                  <span style={{ fontSize: T.xs, color: "rgba(255,255,255,0.6)", width: 30 }}>{r.av}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Modal de tarea (detalle + edición) ───────────────────────────────────────
function TaskModal({ task, allTasks, isMobile, onClose, patch }) {
  if (!task) return null;
  const [, name, color] = areaMeta(task.area_cod);
  const deps = (task.dependencias || []).map((c) => allTasks.find((t) => t.codigo === c)).filter(Boolean);
  const blockers = allTasks.filter((t) => (t.dependencias || []).includes(task.codigo));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: isMobile ? "16px 16px 0 0" : 18, padding: isMobile ? 18 : 24, width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontFamily: "monospace", fontSize: T.xs, color: "rgba(255,255,255,0.4)" }}>{task.codigo}</span>
              <span style={{ fontSize: T.xs, color, background: color + "22", borderRadius: 999, padding: "2px 8px" }}>{name}</span>
              <span style={{ fontSize: T.xs, color: prioColor(task.prioridad), background: prioColor(task.prioridad) + "22", borderRadius: 999, padding: "2px 8px" }}>{task.prioridad}</span>
            </div>
            <div style={{ fontSize: T.xl, fontWeight: 800, lineHeight: 1.2 }}>{task.titulo}</div>
          </div>
          <span onClick={onClose} style={{ cursor: "pointer", fontSize: 24, color: "rgba(255,255,255,0.5)", lineHeight: 1 }}>×</span>
        </div>

        {task.descripcion && <div style={{ fontSize: T.base, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, marginBottom: 14 }}>{task.descripcion}</div>}

        <div style={{ ...responsiveGrid({ cols: 2, minWidth: 130, gap: 10 }), marginBottom: 14 }}>
          <Field label="Inicio" value={fmt(task.fecha_inicio)} />
          <Field label="Fin" value={fmt(task.fecha_fin) + (isVencida(task) ? "  ⚠" : "")} />
          <Field label="Duración" value={(task.duracion || "—") + " días"} />
          <Field label="Entregable" value={task.entregable || "—"} />
        </div>

        {(deps.length > 0 || blockers.length > 0) && (
          <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {deps.length > 0 && <DepRow label="Depende de" items={deps} />}
            {blockers.length > 0 && <DepRow label="Bloquea a" items={blockers} />}
          </div>
        )}

        {/* Editables */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: T.xs, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Seguimiento</div>
          <div style={{ ...responsiveGrid({ cols: 2, minWidth: 150, gap: 10 }) }}>
            <div>
              <label style={lbl}>Estado</label>
              <select value={task.estado} onChange={(e) => { const est = e.target.value; patch(task.id, { estado: est, ...(est === "Completada" ? { avance: 100 } : {}) }); }} style={{ ...modalInp }}>{ESTADOS.map((e) => <option key={e}>{e}</option>)}</select>
            </div>
            <div>
              <label style={lbl}>Avance %</label>
              <input type="number" min={0} max={100} defaultValue={task.avance || 0} onBlur={(e) => { let v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0)); patch(task.id, { avance: v, ...(v === 100 ? { estado: "Completada" } : {}) }); }} style={modalInp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Responsable</label>
            <input defaultValue={task.responsable || ""} onBlur={(e) => e.target.value !== (task.responsable || "") && patch(task.id, { responsable: e.target.value })} style={modalInp} />
          </div>
          <div>
            <label style={lbl}>Comentarios</label>
            <textarea defaultValue={task.comentarios || ""} onBlur={(e) => e.target.value !== (task.comentarios || "") && patch(task.id, { comentarios: e.target.value })} rows={3} style={{ ...modalInp, resize: "vertical" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
const Field = ({ label, value }) => <div><div style={{ fontSize: T.xs, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div><div style={{ fontSize: T.base, marginTop: 2 }}>{value}</div></div>;
const DepRow = ({ label, items }) => (
  <div>
    <div style={{ fontSize: T.xs, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((t) => <span key={t.id} style={{ fontSize: T.xs, background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "3px 7px", color: "rgba(255,255,255,0.8)", borderLeft: `2px solid ${estadoColor(t.estado)}` }}>{t.codigo} · {t.titulo.slice(0, 28)}</span>)}
    </div>
  </div>
);

const Empty = () => <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: T.base }}>Sin tareas que coincidan con los filtros.</div>;

const tabBtn = { padding: "8px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: T.sm };
const ctrl = { padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.1)", background: B.navyMid, color: "#fff", fontSize: T.sm, outline: "none", boxSizing: "border-box", minHeight: TOUCH_TARGET };
const lbl = { fontSize: T.xs, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" };
const modalInp = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: T.base, outline: "none", boxSizing: "border-box", minHeight: TOUCH_TARGET };
