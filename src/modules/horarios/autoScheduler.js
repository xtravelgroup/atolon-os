// Auto-scheduler para Servicio — Fase 4.
//
// proposeSlots(supabase, dateISO) devuelve una propuesta de agendamiento para
// un día concreto, aplicando las reglas de staffing_config:
//   - Cantidad por rol → calcStaff() (usa reservas + estancias + overrides)
//   - Horario general (Playa/Piscina/Restaurante-sin-huéspedes/Runners/Bartenders)
//     → entradaParaPrimerPasadia() / salidaParaUltimoPasadia()
//   - Restaurante CON huéspedes → 2 turnos T1/T2 desde regla_con_huespedes
//   - Cajero → turno_fijo
//
// La propuesta NO escribe en BD. applyProposal() se encarga de eso.
//
// Alcance: solo roles de servicio (mesPlaya, mesPool, mesRest, runnersBeb,
// bartenders, cajero). El resto de departamentos (Cocina, Housekeeping, etc.)
// no se auto-agendan.

import {
  fetchStaffingForDate,
  entradaParaPrimerPasadia,
  salidaParaUltimoPasadia,
  getStaffingConfig,
} from "../staffing/calc";

// Mapeo rol → actividad (rh_actividades) + depto (rh_departamentos) + posiciones.
// `posicionMatches`: keywords (case-insensitive) que deben aparecer en el nombre
// de la posición del empleado para ser candidato. El auto-scheduler filtra
// por posición primero (más específico) y cae a depto si no matchea nadie.
export const SERVICE_ROLES = [
  { rol: "mesPlaya",   actividadNombre: "Playa",      deptNombre: "Meseros", label: "Mesero Playa",       icon: "🏖️", posicionMatches: ["playa", "mesero"] },
  { rol: "mesPool",    actividadNombre: "Piscina",    deptNombre: "Meseros", label: "Mesero Piscina",     icon: "🏊", posicionMatches: ["piscina", "pool", "mesero"] },
  { rol: "mesRest",    actividadNombre: "Restaurant", deptNombre: "Meseros", label: "Mesero Restaurante", icon: "🍽️", posicionMatches: ["restaurant", "restaurante", "mesero"] },
  { rol: "runnersBeb", actividadNombre: "Runner Bar", deptNombre: "Bar",     label: "Runners",            icon: "🏃", posicionMatches: ["runner"] },
  { rol: "bartenders", actividadNombre: "Bartender",  deptNombre: "Bar",     label: "Bartender",          icon: "🍸", posicionMatches: ["bartender"] },
  { rol: "cajero",     actividadNombre: "Cajero",     deptNombre: "Servicio",label: "Cajero",             icon: "💰", posicionMatches: ["cajero", "caja"], strict: true },
];

// Detecta primer y último pasadía del día consultando reservas → salidas.
// Fallback: si no hay reservas, usa "10:00" (salida por defecto).
async function fetchPasadiasHoras(supabase, dateISO) {
  const [resR, salR] = await Promise.all([
    supabase.from("reservas")
      .select("salida_id, estado")
      .eq("fecha", dateISO)
      .in("estado", ["confirmado", "pendiente"]),
    supabase.from("salidas").select("id, hora").eq("activo", true),
  ]);
  const salidas = salR.data || [];
  const horaById = {};
  salidas.forEach(s => { horaById[s.id] = s.hora?.slice(0, 5); });
  const horas = (resR.data || [])
    .map(r => horaById[r.salida_id])
    .filter(Boolean)
    .sort();
  if (horas.length === 0) return { primer: "10:00", ultimo: "10:00" };
  return { primer: horas[0], ultimo: horas[horas.length - 1] };
}

// Retorna la propuesta de slots para un día.
export async function proposeSlots(supabase, dateISO) {
  const [staff, pasadias] = await Promise.all([
    fetchStaffingForDate(supabase, dateISO),
    fetchPasadiasHoras(supabase, dateISO),
  ]);

  const { applied, huespedesPax, totalPax, vipPax, excPax } = staff;
  const entrada = entradaParaPrimerPasadia(pasadias.primer);
  const salida = salidaParaUltimoPasadia(pasadias.ultimo);
  const cfg = getStaffingConfig();

  const slots = [];

  for (const svc of SERVICE_ROLES) {
    const roleCfg = cfg.roles?.[svc.rol];
    if (!roleCfg) continue;
    const cantidad = applied[svc.rol] || 0;

    // Cajero — turno fijo
    if (roleCfg.turno_fijo) {
      if (cantidad > 0) {
        slots.push({
          rol: svc.rol,
          actividadNombre: svc.actividadNombre,
          deptNombre: svc.deptNombre,
          posicionMatches: svc.posicionMatches || [],
          strict: !!svc.strict,
          label: svc.label,
          icon: svc.icon,
          entrada: roleCfg.turno_fijo.entrada,
          salida: roleCfg.turno_fijo.salida,
          cantidad,
          turnoKey: null,
        });
      }
      continue;
    }

    // Restaurante con huéspedes — 2 turnos T1/T2 (cantidad es total = per_turno × nturnos)
    if (svc.rol === "mesRest" && huespedesPax > 0 && roleCfg.regla_con_huespedes?.turnos?.length) {
      const rh = roleCfg.regla_con_huespedes;
      const perTurno = Math.round(cantidad / rh.turnos.length);
      if (perTurno > 0) {
        rh.turnos.forEach(t => {
          slots.push({
            rol: svc.rol,
            actividadNombre: svc.actividadNombre,
            deptNombre: svc.deptNombre,
            posicionMatches: svc.posicionMatches || [],
            strict: !!svc.strict,
            label: `${svc.label} (${t.key})`,
            icon: svc.icon,
            entrada: t.entrada,
            salida: t.salida,
            cantidad: perTurno,
            turnoKey: t.key,
          });
        });
      }
      continue;
    }

    // Default: horario general por pasadías
    if (cantidad > 0) {
      slots.push({
        rol: svc.rol,
        actividadNombre: svc.actividadNombre,
        deptNombre: svc.deptNombre,
        posicionMatches: svc.posicionMatches || [],
        strict: !!svc.strict,
        label: svc.label,
        icon: svc.icon,
        entrada,
        salida,
        cantidad,
        turnoKey: null,
      });
    }
  }

  return {
    date: dateISO,
    context: {
      totalPax,
      vipPax,
      excPax,
      huespedesPax,
      primerPasadia: pasadias.primer,
      ultimoPasadia: pasadias.ultimo,
      entradaGeneral: entrada,
      salidaGeneral: salida,
    },
    slots,
  };
}

// Selecciona empleados para un slot. Filtro primario: posición del empleado
// matchea keywords del slot (ej. "Mesero Playa" para slot Playa). Si el slot
// no es `strict`, cae a filtro por departamento cuando nadie matchea por
// posición (backward compat con empleados sin posición aún).
//
// NO excluye a los ya agendados hoy — la exclusión se maneja en el modal
// (empleados en otros slots) para permitir "re-agendar" sobre turnos previos
// del mismo empleado en la misma actividad.
export function pickCandidatesForSlot(slot, {
  empleados, departamentos, horariosSemana, dateISO, posiciones = [],
}) {
  // 1) Filtro por posición: empleado.posicion_id apunta a una posición cuyo
  //    nombre contiene algún keyword del slot.
  const kws = (slot.posicionMatches || []).map(k => k.toLowerCase());
  const posIdsMatch = new Set(
    posiciones
      .filter(p => kws.some(kw => (p.nombre || "").toLowerCase().includes(kw)))
      .map(p => p.id)
  );
  let candidatos = empleados.filter(e => e.activo && e.posicion_id && posIdsMatch.has(e.posicion_id));

  // 2) Fallback: si el slot NO es strict y nadie matcheó por posición,
  //    filtrar por departamento (empleados legacy sin posicion_id).
  if (candidatos.length === 0 && !slot.strict) {
    const dept = departamentos.find(d => d.nombre === slot.deptNombre);
    if (dept) {
      candidatos = empleados.filter(e => e.activo && e.departamento_id === dept.id);
    }
  }

  if (candidatos.length === 0) return [];

  // Ordenar por horas-semana asc (menor carga primero) para balancear.
  const disponibles = candidatos;

  // Ordenar por horas semanales ascendente (menor carga primero).
  const horasPorEmp = {};
  horariosSemana.forEach(h => {
    if (!h.hora_ini || !h.hora_fin || h.tipo !== "turno") return;
    const [hi, mi] = h.hora_ini.split(":").map(Number);
    const [hf, mf] = h.hora_fin.split(":").map(Number);
    let diff = (hf * 60 + mf) - (hi * 60 + mi);
    if (diff <= 0) diff += 24 * 60;
    const brutas = diff / 60;
    const almuerzo = brutas >= 5 ? 1 : 0;
    const netas = Math.max(0, brutas - almuerzo);
    horasPorEmp[h.empleado_id] = (horasPorEmp[h.empleado_id] || 0) + netas;
  });

  return disponibles.sort((a, b) => (horasPorEmp[a.id] || 0) - (horasPorEmp[b.id] || 0));
}

// Aplica una propuesta al BD. Recibe un mapa slot→[empleado_ids] con las
// selecciones finales del usuario. Genera bulk upsert a rh_horarios.
//
// asignaciones: [{ empleado_id, actividad_id, hora_ini, hora_fin }]
export async function applyAsignaciones(supabase, dateISO, asignaciones) {
  if (!asignaciones || asignaciones.length === 0) return { inserted: 0, errors: [] };
  const rows = asignaciones.map(a => ({
    empleado_id: a.empleado_id,
    fecha: dateISO,
    tipo: "turno",
    hora_ini: a.hora_ini,
    hora_fin: a.hora_fin,
    actividad_id: a.actividad_id,
    notas: "auto-agendado",
  }));
  // Upsert por (empleado_id, fecha) — si existe, actualizar. Si no, insertar.
  const { data, error } = await supabase
    .from("rh_horarios")
    .upsert(rows, { onConflict: "empleado_id,fecha" })
    .select();
  if (error) return { inserted: 0, errors: [error.message] };
  return { inserted: data?.length || 0, errors: [] };
}
