// Horarios — planificación semanal por departamento con drag & drop
// - Filas: empleados agrupados por departamento (colapsables)
// - Columnas: Lun → Dom
// - Drag plantillas (M/T/N/P/D/V/A) sobre las celdas
// - Contador horas/semana con semáforo según límite legal (44h ahora, 42h desde 16-jul-2026)

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import VistaCobertura from "./horarios/VistaCobertura";

// ─── Helpers de fechas ────────────────────────────────────────────────────
const toISO = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const startOfWeek = (d = new Date()) => {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - (day === 0 ? 6 : day - 1); // Lunes como inicio
  x.setDate(diff); x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DIA_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const fmtRangoSemana = (ini) => {
  const fin = addDays(ini, 6);
  const opt = { day: "numeric", month: "short" };
  return `${ini.toLocaleDateString("es-CO", opt)} → ${fin.toLocaleDateString("es-CO", opt)}`;
};

// Horas legales: 44 hasta 15-jul-2026, 42 desde 16-jul-2026
const horasLegalesEnSemana = (iniSemana) => {
  const cutoff = new Date("2026-07-16T00:00:00-05:00");
  return iniSemana >= cutoff ? 42 : 44;
};

// Calcular horas de un turno (resta 1h de almuerzo si el turno es >= 5h)
const horasDelTurno = (h) => {
  if (!h || h.tipo !== "turno") return 0;
  const ini = h.hora_ini; const fin = h.hora_fin;
  if (!ini || !fin) return 0; // Sin horas asignadas = 0
  const [hi, mi] = ini.split(":").map(Number);
  const [hf, mf] = fin.split(":").map(Number);
  let diff = (hf * 60 + mf) - (hi * 60 + mi);
  if (diff <= 0) diff += 24 * 60;
  const horas = diff / 60;
  // Descontar 1h de almuerzo si el turno dura 5h o más
  const netas = horas >= 5 ? horas - 1 : horas;
  return Math.max(0, netas);
};

// ─── Componente principal ───────────────────────────────────────────────────
export default function Horarios() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [empleados, setEmpleados] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deptsCerrados, setDeptsCerrados] = useState(() => new Set());
  const [draggingPlantilla, setDraggingPlantilla] = useState(null);
  const [cellMenu, setCellMenu] = useState(null); // {empId, fecha, event}
  const [searchQ, setSearchQ] = useState("");
  const [vista, setVista] = useState("planilla"); // "planilla" | "cobertura"

  const dias = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { date: d, iso: toISO(d), label: DIA_CORTOS[i], dia: d.getDate() };
    }),
  [weekStart]);

  const horasLegales = horasLegalesEnSemana(weekStart);

  // ─── Load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const ini = toISO(weekStart);
    const fin = toISO(addDays(weekStart, 6));
    const [eR, dR, pR, aR, hR] = await Promise.all([
      supabase.from("rh_empleados").select("id, nombres, apellidos, cargo, departamento_id, activo, avatar_color").eq("activo", true).order("nombres"),
      supabase.from("rh_departamentos").select("id, nombre, color, activo").eq("activo", true),
      supabase.from("rh_turno_plantillas").select("*").eq("activo", true).order("orden"),
      supabase.from("rh_actividades").select("*").eq("activo", true).order("orden"),
      supabase.from("rh_horarios").select("*").gte("fecha", ini).lte("fecha", fin),
    ]);
    setEmpleados(eR.data || []);
    setDepartamentos(dR.data || []);
    setPlantillas(pR.data || []);
    setActividades(aR.data || []);
    setHorarios(hR.data || []);
    setLoading(false);
  }, [weekStart]);
  useEffect(() => { load(); }, [load]);

  const horariosMap = useMemo(() => {
    const m = {};
    horarios.forEach(h => { m[`${h.empleado_id}|${h.fecha}`] = h; });
    return m;
  }, [horarios]);

  const plantillasMap = useMemo(() => {
    const m = {}; plantillas.forEach(p => { m[p.id] = p; }); return m;
  }, [plantillas]);

  const actividadesMap = useMemo(() => {
    const m = {}; actividades.forEach(a => { m[a.id] = a; }); return m;
  }, [actividades]);

  // Empleados agrupados por departamento
  const grupos = useMemo(() => {
    const q = searchQ.toLowerCase().trim();
    const filtered = empleados.filter(e => {
      if (!q) return true;
      const nombre = `${e.nombres} ${e.apellidos}`.toLowerCase();
      return nombre.includes(q) || (e.cargo || "").toLowerCase().includes(q);
    });
    const byDept = new Map();
    filtered.forEach(e => {
      const dept = departamentos.find(d => d.id === e.departamento_id);
      const key = dept?.id || "_sin_dept";
      if (!byDept.has(key)) {
        byDept.set(key, {
          dept: dept || { id: "_sin_dept", nombre: "Sin departamento", color: "#64748B" },
          empleados: [],
        });
      }
      byDept.get(key).empleados.push(e);
    });
    return Array.from(byDept.values()).sort((a, b) => a.dept.nombre.localeCompare(b.dept.nombre));
  }, [empleados, departamentos, searchQ]);

  // ─── Asignar turno ──────────────────────────────────────────────────────
  const asignar = async (empleado_id, fecha, plantilla_id, extra = {}) => {
    const existing = horariosMap[`${empleado_id}|${fecha}`];
    if (!plantilla_id) {
      if (existing) await supabase.from("rh_horarios").delete().eq("id", existing.id);
      load();
      return;
    }
    const p = plantillasMap[plantilla_id];
    const esTurnoTrabajo = (p?.tipo || "turno") === "turno";
    // Para turnos de trabajo: si no se pasan horas custom, dejar null (supervisor las pone al editar).
    // Para descansos/vacaciones/ausencias: no hay horas.
    const payload = {
      empleado_id, fecha, plantilla_id,
      tipo: p?.tipo || "turno",
      hora_ini: esTurnoTrabajo ? (extra.hora_ini ?? existing?.hora_ini ?? null) : null,
      hora_fin: esTurnoTrabajo ? (extra.hora_fin ?? existing?.hora_fin ?? null) : null,
      actividad_id: extra.actividad_id ?? existing?.actividad_id ?? null,
      notas: extra.notas ?? existing?.notas ?? "",
      updated_at: new Date().toISOString(),
    };
    if (existing) await supabase.from("rh_horarios").update(payload).eq("id", existing.id);
    else          await supabase.from("rh_horarios").insert(payload);
    load();
  };

  const horasEmpleado = (empId) =>
    dias.reduce((s, d) => s + horasDelTurno(horariosMap[`${empId}|${d.iso}`]), 0);

  const semaforoColor = (horas) => {
    if (horas === 0) return "rgba(255,255,255,0.2)";
    if (horas <= horasLegales) return B.success;
    if (horas <= horasLegales + 10) return B.warning;
    return B.danger;
  };

  const toggleDept = (id) => setDeptsCerrados(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const duplicarSemana = async () => {
    if (!confirm(`Copiar los turnos de ${fmtRangoSemana(weekStart)} a la semana siguiente?`)) return;
    const rows = horarios.map(h => {
      const old = new Date(h.fecha + "T12:00:00");
      return {
        empleado_id: h.empleado_id,
        fecha: toISO(addDays(old, 7)),
        plantilla_id: h.plantilla_id,
        actividad_id: h.actividad_id,
        tipo: h.tipo, hora_ini: h.hora_ini, hora_fin: h.hora_fin, notas: h.notas || "",
      };
    });
    if (rows.length === 0) return alert("No hay turnos esta semana");
    await supabase.from("rh_horarios").upsert(rows, { onConflict: "empleado_id,fecha" });
    setWeekStart(addDays(weekStart, 7));
  };

  const limpiarSemana = async () => {
    if (!confirm(`Borrar TODOS los turnos de ${fmtRangoSemana(weekStart)}?`)) return;
    await supabase.from("rh_horarios")
      .delete().gte("fecha", toISO(weekStart)).lte("fecha", toISO(addDays(weekStart, 6)));
    load();
  };

  // ─── Drag & drop ─────────────────────────────────────────────────────────
  const onDragStart = (e, plantilla) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", plantilla.id);
    setDraggingPlantilla(plantilla);
  };
  const onDragEnd = () => setDraggingPlantilla(null);
  const onDrop = (e, empId, fecha) => {
    e.preventDefault();
    const plantillaId = e.dataTransfer.getData("text/plain");
    setDraggingPlantilla(null);
    if (!plantillaId) return;
    const p = plantillasMap[plantillaId];
    // Si es turno de trabajo: abrir CellMenu para que el supervisor defina horas.
    // Si es descanso/vacación/ausencia: guardar directo (no necesitan horas).
    if ((p?.tipo || "turno") === "turno") {
      // Pre-seleccionar la plantilla en el menu
      setCellMenu({ empId, fecha, _preselPlantilla: plantillaId });
    } else {
      asignar(empId, fecha, plantillaId);
    }
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };

  // Compact label para mostrar en celda
  const cellLabel = (h) => {
    if (!h) return null;
    const p = plantillasMap[h.plantilla_id];
    return p?.codigo || (p?.nombre?.[0]) || "·";
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 800 }}>📅 Horarios</h2>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={btn(B.navyLight)}>‹</button>
          <button onClick={() => setWeekStart(startOfWeek())} style={btn(B.sky)}>Hoy</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={btn(B.navyLight)}>›</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: B.sand, marginLeft: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {fmtRangoSemana(weekStart)}
          </div>
          <div style={{ fontSize: 11, color: horasLegales === 42 ? B.warning : B.success, marginLeft: 8, padding: "3px 10px", borderRadius: 12, background: (horasLegales === 42 ? B.warning : B.success) + "22", fontWeight: 700 }}>
            Límite legal: {horasLegales}h/sem
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", background: B.navyMid, borderRadius: 10, padding: 3, gap: 2 }}>
            <button onClick={() => setVista("planilla")}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: vista === "planilla" ? B.sky : "transparent", color: vista === "planilla" ? B.navy : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              📅 Planilla
            </button>
            <button onClick={() => setVista("cobertura")}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: vista === "cobertura" ? B.sky : "transparent", color: vista === "cobertura" ? B.navy : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              📊 Cobertura
            </button>
          </div>
          {vista === "planilla" && (<>
          <input placeholder="🔍 Buscar empleado…" value={searchQ} onChange={e => setSearchQ(e.target.value)}
            style={{ padding: "6px 10px", background: B.navyMid, color: B.white, border: `1px solid ${B.navyLight}`, borderRadius: 8, fontSize: 12, width: 180, outline: "none" }} />
          <button onClick={() => window.print()} style={btn(B.navyLight)}>🖨️ Imprimir</button>
          <button onClick={duplicarSemana} style={btn(B.success)}>📋 Copiar a próx. sem</button>
          <button onClick={limpiarSemana} style={btn(B.danger + "33", B.danger)}>🗑️ Limpiar semana</button>
          </>)}
        </div>
      </div>

      {vista === "cobertura" ? (
        <VistaCobertura
          empleados={empleados}
          departamentos={departamentos}
          actividades={actividades}
          horarios={horarios}
          weekStart={weekStart}
        />
      ) : (<>
      {/* Plantillas arrastrables */}
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
          Arrastrar →
        </div>
        {plantillas.map(p => (
          <div key={p.id}
            draggable
            onDragStart={e => onDragStart(e, p)}
            onDragEnd={onDragEnd}
            style={{
              padding: "8px 14px", borderRadius: 8, background: p.color + "22",
              border: `2px solid ${p.color}`, color: p.color, fontWeight: 800,
              cursor: "grab", fontSize: 13, display: "flex", alignItems: "center", gap: 8,
              opacity: draggingPlantilla?.id === p.id ? 0.5 : 1,
              userSelect: "none",
            }}>
            <span style={{ fontSize: 15, fontFamily: "'Barlow Condensed', sans-serif" }}>{p.codigo || p.nombre?.[0]}</span>
            <span>{p.nombre}</span>
            {p.hora_ini && <span style={{ fontSize: 10, opacity: 0.7 }}>{p.hora_ini.slice(0,5)}–{p.hora_fin?.slice(0,5)}</span>}
          </div>
        ))}
      </div>

      {/* Grid por departamento */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: B.sand }}>Cargando…</div>
      ) : grupos.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Sin empleados que mostrar</div>
      ) : (
        grupos.map(({ dept, empleados }) => {
          const cerrado = deptsCerrados.has(dept.id);
          const horasDept = empleados.reduce((s, e) => s + horasEmpleado(e.id), 0);
          const promHoras = empleados.length > 0 ? horasDept / empleados.length : 0;
          return (
            <div key={dept.id} style={{ marginBottom: 18 }}>
              <div onClick={() => toggleDept(dept.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", background: dept.color + "22", borderRadius: 10, borderLeft: `4px solid ${dept.color}`, marginBottom: 2 }}>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{cerrado ? "▶" : "▼"}</span>
                <div style={{ fontWeight: 800, fontSize: 15, color: B.white }}>{dept.nombre}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                  {empleados.length} {empleados.length === 1 ? "empleado" : "empleados"} · {horasDept.toFixed(0)}h plan · prom {promHoras.toFixed(1)}h
                </div>
              </div>
              {!cerrado && (
                <div style={{ overflowX: "auto", background: B.navyMid, borderRadius: 10, border: `1px solid ${B.navyLight}` }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                    <thead>
                      <tr style={{ background: B.navyLight }}>
                        <th style={thStyle}>Empleado</th>
                        {dias.map(d => (
                          <th key={d.iso} style={{ ...thStyle, textAlign: "center" }}>
                            <div>{d.label}</div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{d.dia}</div>
                          </th>
                        ))}
                        <th style={{ ...thStyle, textAlign: "center", minWidth: 80 }}>Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empleados.map(e => {
                        const horas = horasEmpleado(e.id);
                        return (
                          <tr key={e.id} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                            <td style={{ padding: "8px 12px", minWidth: 180 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 26, height: 26, borderRadius: 13, background: e.avatar_color || B.sky, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: B.navy, flexShrink: 0 }}>
                                  {e.nombres?.charAt(0)}{e.apellidos?.charAt(0)}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: B.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {e.nombres} {e.apellidos}
                                  </div>
                                  {e.cargo && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.cargo}</div>}
                                </div>
                              </div>
                            </td>
                            {dias.map(d => {
                              const h = horariosMap[`${e.id}|${d.iso}`];
                              const p = h ? plantillasMap[h.plantilla_id] : null;
                              const a = h ? actividadesMap[h.actividad_id] : null;
                              return (
                                <td key={d.iso}
                                  onDrop={(ev) => onDrop(ev, e.id, d.iso)}
                                  onDragOver={onDragOver}
                                  onClick={() => setCellMenu({ empId: e.id, fecha: d.iso })}
                                  style={{
                                    padding: 4, textAlign: "center", cursor: "pointer", position: "relative",
                                    background: draggingPlantilla ? "rgba(142,202,230,0.08)" : "transparent",
                                    borderLeft: "1px dashed rgba(255,255,255,0.04)",
                                    minWidth: 70, height: 54,
                                  }}>
                                  {h ? (
                                    <div style={{
                                      background: p?.color + "33" || B.navyLight,
                                      border: `1.5px solid ${p?.color || B.navyLight}`,
                                      borderRadius: 6, padding: "6px 2px", fontSize: 15, fontWeight: 800,
                                      color: p?.color || B.white, fontFamily: "'Barlow Condensed', sans-serif",
                                    }}>
                                      {cellLabel(h)}
                                      {a && <div style={{ fontSize: 9, color: a.color, marginTop: 2, fontFamily: "Inter, sans-serif" }}>{a.icono} {a.nombre}</div>}
                                      {/* Usar las horas CUSTOM del turno, no las de la plantilla */}
                                      {h.hora_ini && h.hora_fin && (
                                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 1, fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
                                          {h.hora_ini.slice(0,5)}–{h.hora_fin.slice(0,5)}
                                        </div>
                                      )}
                                      {h.tipo === "turno" && !h.hora_ini && (
                                        <div style={{ fontSize: 8, color: B.warning, marginTop: 2, fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
                                          ⚠ sin horas
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 18 }}>+</div>
                                  )}
                                </td>
                              );
                            })}
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: semaforoColor(horas), fontFamily: "'Barlow Condensed', sans-serif" }}>
                                {horas.toFixed(1)}h
                              </span>
                              {horas > horasLegales && (
                                <div style={{ fontSize: 9, color: B.warning, marginTop: 1 }}>
                                  +{(horas - horasLegales).toFixed(1)}h extra
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      </>)}

      {/* Cell menu popover */}
      {cellMenu && (
        <CellMenu
          empId={cellMenu.empId}
          fecha={cellMenu.fecha}
          preselPlantilla={cellMenu._preselPlantilla}
          current={horariosMap[`${cellMenu.empId}|${cellMenu.fecha}`]}
          plantillas={plantillas}
          actividades={actividades}
          empleados={empleados}
          onAsignar={(pid, extra) => { asignar(cellMenu.empId, cellMenu.fecha, pid, extra); setCellMenu(null); }}
          onBorrar={() => { asignar(cellMenu.empId, cellMenu.fecha, null); setCellMenu(null); }}
          onClose={() => setCellMenu(null)}
        />
      )}
    </div>
  );
}

// ─── Cell Menu modal (editar turno específico) ───────────────────────────
function CellMenu({ empId, fecha, current, plantillas, actividades, empleados, preselPlantilla, onAsignar, onBorrar, onClose }) {
  const [sel, setSel] = useState(preselPlantilla || current?.plantilla_id || null);
  const [act, setAct] = useState(current?.actividad_id || null);
  const [horaIni, setHoraIni] = useState(current?.hora_ini?.slice(0, 5) || "");
  const [horaFin, setHoraFin] = useState(current?.hora_fin?.slice(0, 5) || "");

  const plantSel = plantillas.find(p => p.id === sel);
  const esTurnoTrabajo = (plantSel?.tipo || "turno") === "turno";
  const emp = empleados?.find(e => e.id === empId);

  // Calcular horas netas (con descuento de 1h almuerzo si >= 5h)
  const calcHoras = () => {
    if (!horaIni || !horaFin) return { brutas: 0, netas: 0, almuerzo: 0 };
    const [hi, mi] = horaIni.split(":").map(Number);
    const [hf, mf] = horaFin.split(":").map(Number);
    let diff = (hf * 60 + mf) - (hi * 60 + mi);
    if (diff <= 0) diff += 24 * 60;
    const brutas = diff / 60;
    const almuerzo = brutas >= 5 ? 1 : 0;
    const netas = Math.max(0, brutas - almuerzo);
    return { brutas, netas, almuerzo };
  };
  const { brutas, netas, almuerzo } = calcHoras();

  const puedeGuardar = sel && (!esTurnoTrabajo || (horaIni && horaFin));

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, width: 480, maxWidth: "100%" }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Asignar turno</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>
          {emp ? `${emp.nombres} ${emp.apellidos}` : ""} · {fecha}
        </div>

        <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Tipo de turno</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {plantillas.map(p => (
            <button key={p.id} onClick={() => setSel(p.id)}
              style={{ padding: "8px 12px", borderRadius: 8, border: `2px solid ${sel === p.id ? p.color : "transparent"}`, background: sel === p.id ? p.color + "33" : B.navyLight, color: sel === p.id ? p.color : "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {p.codigo || p.nombre?.[0]} · {p.nombre}
            </button>
          ))}
        </div>

        {/* Horas custom — solo si es turno de trabajo (no descanso/vacación/ausencia) */}
        {esTurnoTrabajo && (
          <div style={{ background: "rgba(142,202,230,0.08)", borderRadius: 8, padding: "12px 14px", marginBottom: 14, border: `1px solid ${B.sky}33` }}>
            <div style={{ fontSize: 10, color: B.sky, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
              Horas del turno · se descuenta 1h de almuerzo si &ge; 5h
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 4 }}>Entrada</label>
                <input type="time" value={horaIni} onChange={e => setHoraIni(e.target.value)}
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 4 }}>Salida</label>
                <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)}
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            {horaIni && horaFin && (
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.7)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  {brutas.toFixed(1)}h brutas {almuerzo > 0 && <span style={{ color: B.warning }}>− 1h almuerzo</span>}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>
                  = {netas.toFixed(1)}h netas
                </span>
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Actividad (opcional)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          <button onClick={() => setAct(null)}
            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${!act ? B.sand : "transparent"}`, background: !act ? B.sand + "22" : B.navyLight, color: !act ? B.sand : "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>
            — sin actividad —
          </button>
          {actividades.map(a => (
            <button key={a.id} onClick={() => setAct(a.id)}
              style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${act === a.id ? a.color : "transparent"}`, background: act === a.id ? a.color + "22" : B.navyLight, color: act === a.id ? a.color : "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer" }}>
              {a.icono} {a.nombre}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button onClick={onBorrar} style={btn(B.danger + "33", B.danger)}>🗑 Quitar turno</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btn(B.navyLight)}>Cancelar</button>
            <button
              onClick={() => puedeGuardar && onAsignar(sel, {
                actividad_id: act,
                hora_ini: esTurnoTrabajo ? horaIni : null,
                hora_fin: esTurnoTrabajo ? horaFin : null,
              })}
              disabled={!puedeGuardar}
              style={{ ...btn(puedeGuardar ? B.success : B.navyLight), opacity: puedeGuardar ? 1 : 0.5 }}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── estilos ───────────────────────────────────────────────────────────────
const thStyle = { padding: "10px 12px", textAlign: "left", fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 };
const btn = (bg, fg = B.navy) => ({ padding: "7px 13px", borderRadius: 8, border: "none", background: bg, color: fg, fontSize: 12, fontWeight: 700, cursor: "pointer" });
