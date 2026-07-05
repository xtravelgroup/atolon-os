// AutoAgendarModal — Fase 4 Horarios.
// Modal que muestra la propuesta de auto-agendamiento para un día,
// permite ajustar los empleados asignados a cada slot, y aplica al BD.

import { useState, useEffect, useMemo, useCallback } from "react";
import { B } from "../../brand";
import { supabase } from "../../lib/supabase";
import {
  proposeSlots,
  pickCandidatesForSlot,
  applyAsignaciones,
} from "./autoScheduler";

const isoDate = (d) => (d instanceof Date ? d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) : d);

export default function AutoAgendarModal({ dateISO, empleados, departamentos, actividades, horariosSemana, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [propuesta, setPropuesta] = useState(null);
  const [seleccion, setSeleccion] = useState({}); // slotIdx → [empleado_id]
  const [aplicando, setAplicando] = useState(false);
  const [err, setErr] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [posiciones, setPosiciones] = useState([]);

  // resolver actividad_id por nombre
  const actIdByName = useMemo(() => {
    const m = {};
    (actividades || []).forEach(a => { m[a.nombre] = a.id; });
    return m;
  }, [actividades]);

  // cargar propuesta + posiciones al abrir
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [p, posR] = await Promise.all([
          proposeSlots(supabase, dateISO),
          supabase.from("rh_posiciones").select("id, nombre, departamento_id, parent_id").eq("activo", true),
        ]);
        if (cancel) return;
        const pos = posR.data || [];
        setPosiciones(pos);
        setPropuesta(p);
        // Pre-select: priorizar los que YA tienen turno del día en la
        // actividad correcta (preserva agendamientos previos), luego los que
        // menos horas tienen. No duplicar empleados entre slots.
        const actIdByName = {};
        (actividades || []).forEach(a => { actIdByName[a.nombre] = a.id; });
        const usadosHoyGlobal = new Set();
        const preSel = {};
        p.slots.forEach((slot, idx) => {
          const cands = pickCandidatesForSlot(slot, {
            empleados, departamentos, horariosSemana, dateISO, posiciones: pos,
          });
          const actId = actIdByName[slot.actividadNombre];
          const yaEnEsteSlot = new Set(
            horariosSemana
              .filter(h => h.fecha === dateISO && h.tipo === "turno" && h.actividad_id === actId)
              .map(h => h.empleado_id)
          );
          const prioridad = [
            ...cands.filter(e => yaEnEsteSlot.has(e.id) && !usadosHoyGlobal.has(e.id)),
            ...cands.filter(e => !yaEnEsteSlot.has(e.id) && !usadosHoyGlobal.has(e.id)),
          ];
          const elegidos = prioridad.slice(0, slot.cantidad).map(e => e.id);
          elegidos.forEach(id => usadosHoyGlobal.add(id));
          preSel[idx] = elegidos;
        });
        setSeleccion(preSel);
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [dateISO, empleados, departamentos, horariosSemana, actividades]);

  // empleados YA asignados globalmente en la selección (no repetir en otro slot).
  const yaSeleccionados = useMemo(() => {
    const s = new Set();
    Object.values(seleccion).forEach(arr => (arr || []).forEach(id => s.add(id)));
    return s;
  }, [seleccion]);

  // candidatos disponibles para un slot (filtrados por posición del empleado
  // matchea keywords del slot; fallback a depto). Excluye los ya seleccionados
  // en OTROS slots.
  const candidatosSlot = useCallback((slot, slotIdx) => {
    const cands = pickCandidatesForSlot(slot, { empleados, departamentos, horariosSemana, dateISO, posiciones });
    const propios = new Set(seleccion[slotIdx] || []);
    return cands.filter(e => propios.has(e.id) || !yaSeleccionados.has(e.id));
  }, [empleados, departamentos, horariosSemana, dateISO, posiciones, seleccion, yaSeleccionados]);

  const cambiarSlotEmp = (slotIdx, posicion, empleado_id) => {
    setSeleccion(prev => {
      const arr = [...(prev[slotIdx] || [])];
      arr[posicion] = empleado_id || null;
      return { ...prev, [slotIdx]: arr };
    });
  };

  const aplicar = async () => {
    if (!propuesta) return;
    setAplicando(true); setErr(null); setOkMsg(null);
    const asignaciones = [];
    propuesta.slots.forEach((slot, idx) => {
      const empIds = seleccion[idx] || [];
      const actividad_id = actIdByName[slot.actividadNombre] || null;
      empIds.forEach(empId => {
        if (!empId) return;
        asignaciones.push({
          empleado_id: empId,
          actividad_id,
          hora_ini: slot.entrada + ":00",
          hora_fin: slot.salida + ":00",
        });
      });
    });
    if (asignaciones.length === 0) {
      setErr("No hay empleados seleccionados para agendar.");
      setAplicando(false);
      return;
    }
    const { inserted, errors } = await applyAsignaciones(supabase, dateISO, asignaciones);
    setAplicando(false);
    if (errors.length > 0) {
      setErr(errors.join(" · "));
      return;
    }
    setOkMsg(`✓ ${inserted} horario(s) creado(s) / actualizado(s).`);
    setTimeout(() => { onSaved?.(); onClose(); }, 900);
  };

  const empById = useMemo(() => {
    const m = {};
    empleados.forEach(e => { m[e.id] = e; });
    return m;
  }, [empleados]);

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 500,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}>
      <div style={{
        background: B.navy, borderRadius: 12, border: `1px solid ${B.navyLight}`,
        width: "min(760px, 100%)", maxHeight: "92vh", overflowY: "auto", padding: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: B.white }}>
              ⚡ Auto-agendar Servicio
            </div>
            <div style={{ fontSize: 12, color: B.sand, marginTop: 2 }}>{dateISO}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: B.sand }}>Calculando propuesta…</div>
        ) : !propuesta ? (
          <div style={{ padding: 20, color: B.danger }}>{err || "Sin propuesta"}</div>
        ) : (<>
          {/* Contexto */}
          <div style={{
            background: B.navyMid, padding: "10px 14px", borderRadius: 8, marginBottom: 12,
            display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12,
          }}>
            <span>👥 Pax total: <b style={{ color: B.white }}>{propuesta.context.totalPax}</b></span>
            {propuesta.context.vipPax > 0 && <span>🏖️ VIP: <b style={{ color: B.white }}>{propuesta.context.vipPax}</b></span>}
            {propuesta.context.excPax > 0 && <span>🏊 Exclusive: <b style={{ color: B.white }}>{propuesta.context.excPax}</b></span>}
            {propuesta.context.huespedesPax > 0 && <span>🛏️ Huéspedes: <b style={{ color: B.white }}>{propuesta.context.huespedesPax}</b></span>}
            <span>⏰ Horario general: <b style={{ color: B.white }}>{propuesta.context.entradaGeneral}–{propuesta.context.salidaGeneral}</b></span>
          </div>

          {propuesta.slots.length === 0 ? (
            <div style={{ padding: 20, color: B.sand, textAlign: "center" }}>Sin necesidad de personal para este día.</div>
          ) : (
            <div>
              {propuesta.slots.map((slot, idx) => (
                <SlotEditor
                  key={idx}
                  slot={slot}
                  seleccion={seleccion[idx] || []}
                  candidatos={candidatosSlot(slot, idx)}
                  empById={empById}
                  onChange={(pos, empId) => cambiarSlotEmp(idx, pos, empId)}
                />
              ))}
            </div>
          )}

          {err && (
            <div style={{ padding: "8px 12px", background: B.danger + "22", color: B.danger, borderRadius: 8, marginTop: 10, fontSize: 12 }}>
              {err}
            </div>
          )}
          {okMsg && (
            <div style={{ padding: "8px 12px", background: B.success + "22", color: B.success, borderRadius: 8, marginTop: 10, fontSize: 12 }}>
              {okMsg}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${B.navyLight}` }}>
            <button onClick={onClose} disabled={aplicando}
              style={{ padding: "8px 14px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
            <button onClick={aplicar} disabled={aplicando || propuesta.slots.length === 0}
              style={{ padding: "8px 14px", background: B.success, color: B.navy, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: aplicando ? "wait" : "pointer" }}>
              {aplicando ? "Aplicando…" : "⚡ Aplicar propuesta"}
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}

function SlotEditor({ slot, seleccion, candidatos, empById, onChange }) {
  const slots = Array.from({ length: slot.cantidad }, (_, i) => i);
  return (
    <div style={{
      background: B.navyMid, borderRadius: 8, padding: 12, marginBottom: 10,
      borderLeft: `3px solid ${B.sky}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 18 }}>{slot.icon}</span>
        <span style={{ fontWeight: 800, color: B.white, fontSize: 14 }}>{slot.label}</span>
        <span style={{ fontSize: 11, color: B.sand, padding: "2px 8px", background: B.navy, borderRadius: 6 }}>
          {slot.entrada}–{slot.salida}
        </span>
        <span style={{ fontSize: 11, color: B.sky, padding: "2px 8px", background: B.sky + "22", borderRadius: 6, fontWeight: 700 }}>
          Necesita {slot.cantidad}
        </span>
      </div>
      <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {slots.map(pos => {
          const empId = seleccion[pos] || "";
          const nombreActual = empId ? `${empById[empId]?.nombres || ""} ${empById[empId]?.apellidos || ""}`.trim() : "";
          return (
            <select
              key={pos}
              value={empId}
              onChange={e => onChange(pos, e.target.value || null)}
              style={{
                padding: "7px 10px", background: B.navy, color: B.white,
                border: `1px solid ${empId ? B.success : B.navyLight}`, borderRadius: 6,
                fontSize: 12, outline: "none",
              }}>
              <option value="">— Sin asignar —</option>
              {empId && (
                <option value={empId}>{nombreActual}</option>
              )}
              {candidatos
                .filter(c => c.id !== empId)
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombres} {c.apellidos}{c.cargo ? ` · ${c.cargo}` : ""}
                  </option>
                ))
              }
            </select>
          );
        })}
      </div>
    </div>
  );
}
