// Vista Cobertura — staffing por área × franja horaria
// Filas = AREAS, Columnas = FRANJAS. Cada celda: X/Y (asignados / necesitan).
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";
import { AREAS, FRANJAS, franjaEsPico } from "./areas";
import { fetchStaffingForDate } from "../staffing/calc";

const toISO = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DIA_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// hhmm a minutos
const hm2min = (s) => {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
};

// overlap entre [a1,a2) y [b1,b2) en minutos
const overlaps = (a1, a2, b1, b2) => {
  if (a1 == null || a2 == null) return false;
  // turnos que cruzan medianoche
  if (a2 <= a1) a2 += 24 * 60;
  return Math.max(a1, b1) < Math.min(a2, b2);
};

export default function VistaCobertura({ empleados, departamentos, actividades, horarios, weekStart }) {
  // diaIdx 0..6 (Lun..Dom)
  const [diaIdx, setDiaIdx] = useState(() => {
    const today = new Date();
    const iso = toISO(today);
    for (let i = 0; i < 7; i++) {
      if (toISO(addDays(weekStart, i)) === iso) return i;
    }
    return 0;
  });
  const [demandaRows, setDemandaRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState(null); // {area, franja}
  const [staffing, setStaffing] = useState(null); // resultado de fetchStaffingForDate

  const loadDemanda = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("rh_cobertura_demanda").select("*");
    setDemandaRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { loadDemanda(); }, [loadDemanda]);

  const demandaMap = useMemo(() => {
    const m = {};
    demandaRows.forEach(d => { m[`${d.area_key}|${d.dia_semana}|${d.franja}`] = d.necesitan; });
    return m;
  }, [demandaRows]);

  const fechaSel = toISO(addDays(weekStart, diaIdx));

  // Si alguna área usa staffing, cargamos datos del día una sola vez.
  const hayAreaStaffing = useMemo(() => AREAS.some(a => a.source === "staffing"), []);
  useEffect(() => {
    let cancelled = false;
    if (!hayAreaStaffing) { setStaffing(null); return; }
    (async () => {
      const s = await fetchStaffingForDate(supabase, fechaSel);
      if (!cancelled) setStaffing(s);
    })();
    return () => { cancelled = true; };
  }, [fechaSel, hayAreaStaffing]);

  // Demanda por area × franja: si source=staffing, lee de staffing; else demandaMap
  const getNecesitan = useCallback((area, franja) => {
    if (area.source === "staffing" && staffing && area.staffingRole) {
      const bucket = franjaEsPico(franja) ? staffing.pico : staffing.valle;
      return bucket?.[area.staffingRole] ?? 0;
    }
    return demandaMap[`${area.key}|${diaIdx}|${franja.key}`] || 0;
  }, [staffing, demandaMap, diaIdx]);

  // resolver deptId y actividadId por nombre
  const areasResolved = useMemo(() => {
    return AREAS.map(a => {
      const dept = departamentos.find(d => d.nombre === a.deptNombre);
      const act = a.actividadNombre ? actividades.find(x => x.nombre === a.actividadNombre) : null;
      return { ...a, deptId: dept?.id, actId: act?.id, deptColor: dept?.color };
    });
  }, [departamentos, actividades]);

  // índice: empleado -> dept
  const empDept = useMemo(() => {
    const m = {};
    empleados.forEach(e => { m[e.id] = e.departamento_id; });
    return m;
  }, [empleados]);

  // Para cada area × franja, retornar lista de empleados asignados que cubren la franja
  const getAsignados = useCallback((area, franja) => {
    const f1 = hm2min(franja.ini), f2 = hm2min(franja.fin);
    return horarios.filter(h => {
      if (h.fecha !== fechaSel) return false;
      if (h.tipo !== "turno") return false;
      if (!h.hora_ini || !h.hora_fin) return false;
      if (empDept[h.empleado_id] !== area.deptId) return false;
      if (area.actId && h.actividad_id !== area.actId) return false;
      const hi = hm2min(h.hora_ini), hf = hm2min(h.hora_fin);
      return overlaps(hi, hf, f1, f2);
    });
  }, [horarios, fechaSel, empDept]);

  const cellColor = (x, y) => {
    if (y === 0) return { bg: "rgba(255,255,255,0.05)", fg: "rgba(255,255,255,0.35)", border: B.navyLight };
    if (x >= y) return { bg: B.success + "22", fg: B.success, border: B.success };
    return { bg: B.danger + "22", fg: B.danger, border: B.danger };
  };

  const diaFecha = addDays(weekStart, diaIdx);
  const diaLabel = diaFecha.toLocaleDateString("es-CO", { day: "numeric", month: "short" });

  return (
    <div>
      {/* Selector de día */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginRight: 8 }}>
          Día
        </div>
        {DIA_CORTOS.map((d, i) => {
          const isSel = i === diaIdx;
          const fecha = addDays(weekStart, i);
          return (
            <button key={i} onClick={() => setDiaIdx(i)}
              style={{
                padding: "6px 12px", borderRadius: 8, border: `2px solid ${isSel ? B.sky : "transparent"}`,
                background: isSel ? B.sky + "33" : B.navyMid, color: isSel ? B.sky : B.white,
                fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>
              {d} <span style={{ opacity: 0.6, fontWeight: 500 }}>{fecha.getDate()}</span>
            </button>
          );
        })}
      </div>

      {hayAreaStaffing && staffing && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>
          Servicio y Bar calculados desde Staffing · Pax del día:{" "}
          <b style={{ color: B.white }}>{staffing.totalPax}</b>
          {staffing.vipPax > 0 && <> · VIP: <b style={{ color: B.white }}>{staffing.vipPax}</b></>}
          {staffing.excPax > 0 && <> · Exclusive: <b style={{ color: B.white }}>{staffing.excPax}</b></>}
          {staffing.hayMovimiento && <span style={{ color: B.warning, marginLeft: 8 }}>⚠ Movimiento 12–3pm</span>}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: B.sand }}>Cargando demanda…</div>
      ) : (
        <div style={{ overflowX: "auto", background: B.navyMid, borderRadius: 10, border: `1px solid ${B.navyLight}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: B.navyLight }}>
                <th style={thStyle}>Área · {diaLabel}</th>
                {FRANJAS.map(f => (
                  <th key={f.key} style={{ ...thStyle, textAlign: "center", minWidth: 70 }}>{f.label}</th>
                ))}
                <th style={{ ...thStyle, textAlign: "center", minWidth: 70 }}>Asig/Nec</th>
              </tr>
            </thead>
            <tbody>
              {areasResolved.map(area => {
                let totalX = 0, totalY = 0;
                return (
                  <tr key={area.key} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                    <td style={{ padding: "10px 12px", minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 4, height: 22, borderRadius: 2, background: area.deptColor || B.sky }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: B.white }}>{area.label}</div>
                          {!area.deptId && (
                            <div style={{ fontSize: 9, color: B.warning }}>⚠ dept no encontrado: {area.deptNombre}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {FRANJAS.map(f => {
                      const y = getNecesitan(area, f);
                      const x = area.deptId ? getAsignados(area, f).length : 0;
                      totalX += x; totalY += y;
                      const c = cellColor(x, y);
                      const fromStaffing = area.source === "staffing";
                      return (
                        <td key={f.key} style={{ padding: 3, textAlign: "center" }}>
                          <div
                            onClick={() => setDetalle({ area, franja: f })}
                            title={fromStaffing ? "Calculado desde Staffing (pax del día)" : undefined}
                            style={{
                              padding: "10px 4px", borderRadius: 6, cursor: "pointer",
                              background: c.bg, border: `1.5px solid ${c.border}`,
                              color: c.fg, fontWeight: 800, fontSize: 15,
                              fontFamily: "'Barlow Condensed', sans-serif",
                              position: "relative",
                            }}>
                            {x} / {y}
                            {fromStaffing && (
                              <span style={{ position: "absolute", top: 2, right: 4, fontSize: 9, opacity: 0.7 }}>⚙</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, fontWeight: 800, color: totalX >= totalY && totalY > 0 ? B.success : totalY === 0 ? "rgba(255,255,255,0.3)" : B.danger }}>
                      {totalX}/{totalY}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <DetalleModal
          area={detalle.area}
          franja={detalle.franja}
          fecha={fechaSel}
          diaIdx={diaIdx}
          empleados={empleados}
          horarios={horarios}
          getAsignados={getAsignados}
          demandaMap={demandaMap}
          staffing={staffing}
          necesitanCalc={getNecesitan(detalle.area, detalle.franja)}
          onClose={() => setDetalle(null)}
          onSaved={loadDemanda}
        />
      )}
    </div>
  );
}

function DetalleModal({ area, franja, fecha, diaIdx, empleados, horarios, getAsignados, demandaMap, staffing, necesitanCalc, onClose, onSaved }) {
  const key = `${area.key}|${diaIdx}|${franja.key}`;
  const isStaffing = area.source === "staffing";
  const [necesitan, setNecesitan] = useState(demandaMap[key] || 0);
  const [saving, setSaving] = useState(false);

  const asignados = area.deptId ? getAsignados(area, franja) : [];
  const asignadosIds = new Set(asignados.map(h => h.empleado_id));

  // empleados del mismo dept, sin turno o no cubren la franja
  const disponibles = empleados.filter(e => {
    if (e.departamento_id !== area.deptId) return false;
    if (asignadosIds.has(e.id)) return false;
    return true;
  });

  const guardar = async () => {
    setSaving(true);
    const n = Math.max(0, parseInt(necesitan, 10) || 0);
    await supabase.from("rh_cobertura_demanda").upsert({
      area_key: area.key,
      dia_semana: diaIdx,
      franja: franja.key,
      necesitan: n,
      updated_at: new Date().toISOString(),
    }, { onConflict: "area_key,dia_semana,franja" });
    setSaving(false);
    await onSaved();
    onClose();
  };

  const asignadosEmp = asignados.map(h => ({
    h,
    emp: empleados.find(e => e.id === h.empleado_id),
  }));

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, width: 560, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, color: B.white }}>Detalle de cobertura</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
          {area.label} · {fecha} · Franja {franja.label}
        </div>

        {isStaffing ? (
          <div style={{ background: "rgba(142,202,230,0.08)", borderRadius: 8, padding: "12px 14px", marginBottom: 14, border: `1px solid ${B.sky}33` }}>
            <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
              ⚙ Calculado desde Staffing
            </div>
            {staffing ? (
              <>
                <div style={{ fontSize: 13, color: B.white, marginBottom: 4 }}>
                  Necesitan según Staffing:{" "}
                  <b>{staffing.valle?.[area.staffingRole] ?? 0}</b> (valle) /{" "}
                  <b>{staffing.pico?.[area.staffingRole] ?? 0}</b> (pico)
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
                  Pax del día: <b style={{ color: B.white }}>{staffing.totalPax}</b>
                  {staffing.vipPax > 0 && <> · VIP: <b style={{ color: B.white }}>{staffing.vipPax}</b></>}
                  {staffing.excPax > 0 && <> · Exclusive: <b style={{ color: B.white }}>{staffing.excPax}</b></>}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
                  Esta franja ({franja.label}): <b style={{ color: B.sky }}>{necesitanCalc}</b> asignados{" "}
                  <span style={{ opacity: 0.6 }}>(Asignados actuales: {asignados.length})</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
                Cargando datos de Staffing…
              </div>
            )}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("navigate-module", { detail: { module: "staffing" } }))}
              style={{ padding: "7px 13px", borderRadius: 8, border: `1px solid ${B.sky}`, background: "transparent", color: B.sky, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Ajustar en módulo Staffing →
            </button>
          </div>
        ) : (
          <div style={{ background: "rgba(142,202,230,0.08)", borderRadius: 8, padding: "12px 14px", marginBottom: 14, border: `1px solid ${B.sky}33` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Necesitan:</label>
              <input type="number" min="0" value={necesitan} onChange={e => setNecesitan(e.target.value)}
                style={{ width: 80, padding: "7px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, outline: "none" }} />
              <button onClick={guardar} disabled={saving}
                style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: B.success, color: B.navy, fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.5 : 1 }}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                Asignados: <span style={{ fontWeight: 800, color: asignados.length >= (demandaMap[key] || 0) && (demandaMap[key] || 0) > 0 ? B.success : B.white }}>{asignados.length}</span>
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>
          Asignados ({asignados.length})
        </div>
        {asignadosEmp.length === 0 ? (
          <div style={{ padding: 12, background: B.navy, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>
            Nadie asignado en esta franja.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {asignadosEmp.map(({ h, emp }) => emp && (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: B.navy, borderRadius: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: emp.avatar_color || B.sky, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: B.navy, flexShrink: 0 }}>
                  {emp.nombres?.charAt(0)}{emp.apellidos?.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: B.white }}>{emp.nombres} {emp.apellidos}</div>
                  {emp.cargo && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{emp.cargo}</div>}
                </div>
                <div style={{ fontSize: 11, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
                  {h.hora_ini?.slice(0,5)}–{h.hora_fin?.slice(0,5)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>
          Empleados disponibles del área ({disponibles.length})
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 8, fontStyle: "italic" }}>
          Agrega turno desde la vista Planilla.
        </div>
        {disponibles.length === 0 ? (
          <div style={{ padding: 12, background: B.navy, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 }}>
            No hay empleados adicionales del área.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {disponibles.map(emp => {
              // Verificar si tiene turno ese día pero no cubre la franja
              const tieneTurno = horarios.some(h => h.empleado_id === emp.id && h.fecha === fecha);
              return (
                <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: B.navy, borderRadius: 6, fontSize: 11 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: emp.avatar_color || B.sky, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: B.navy }}>
                    {emp.nombres?.charAt(0)}{emp.apellidos?.charAt(0)}
                  </div>
                  <span style={{ color: B.white }}>{emp.nombres} {emp.apellidos?.charAt(0)}.</span>
                  {tieneTurno && <span style={{ color: B.warning, fontSize: 9 }}>• turno fuera de franja</span>}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: B.navyLight, color: B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const thStyle = { padding: "10px 12px", textAlign: "left", fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 };
