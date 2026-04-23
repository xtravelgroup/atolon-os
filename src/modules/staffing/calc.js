// Shared staffing calculation — extraído de Staffing.jsx para reusar desde
// otros módulos (ej: Horarios › Cobertura).
//
// calcStaff(totalPax, vipPax, excPax, ovrMap) → { valle, pico, totalValle,
//   totalPico, hayMovimiento, raw, applied }
//
// Roles: mesPlaya, mesPool, mesRest, runnersBeb, runnersCom, bussers,
//        bartenders, supervisor, hostess.
//
// hayMovimiento = pax <= 80 && totalPax > 0. Pico = franja de movimiento
// (aprox. 12:00–15:00 almuerzo). En valle runnersCom = 0; en pico se aplica
// el cruce Playa→Restaurante cuando hayMovimiento.

export function calcStaff(totalPax, vipPax, excPax, ovrMap = {}) {
  const pax = Math.max(totalPax, 20); // apertura mínima
  const isApertura = totalPax === 0;

  const raw = {
    mesPlaya:   isApertura ? 1 : vipPax === 0 ? 0 : (pax <= 80 ? Math.min(3, Math.ceil(vipPax / 20)) : 4),
    mesPool:    isApertura ? 1 : excPax === 0 ? 0 : (excPax <= 10 ? 1 : excPax <= 30 ? 2 : 3),
    mesRest:    pax <= 80 ? 1 : 4,
    runnersBeb: pax <= 60 ? 1 : pax <= 80 ? 2 : 3,
    runnersCom: pax <= 20 ? 0 : pax <= 80 ? 1 : 2,
    bussers:    pax <= 20 ? 0 : pax <= 60 ? 1 : 2,
    bartenders: pax <= 60 ? 1 : 2,
    supervisor: 1,
    hostess:    pax <= 20 ? 0 : pax <= 80 ? 1 : 2,
  };

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

// Fetch reservas + overrides para una fecha, correr calcStaff, devolver todo.
// Retorna: { totalPax, vipPax, excPax, overrides, valle, pico, hayMovimiento,
//   totalValle, totalPico, raw, applied }
export async function fetchStaffingForDate(supabase, dateISO) {
  if (!supabase || !dateISO) {
    return { totalPax: 0, vipPax: 0, excPax: 0, overrides: [], valle: {}, pico: {}, hayMovimiento: false, totalValle: 0, totalPico: 0, raw: {}, applied: {} };
  }
  const [resR, ovrR, proyR] = await Promise.all([
    supabase.from("reservas")
      .select("tipo, pax, estado")
      .eq("fecha", dateISO)
      .in("estado", ["confirmado", "pendiente"]),
    supabase.from("staffing_overrides").select("*").eq("date", dateISO),
    supabase.from("staffing_proyecciones").select("*").eq("date", dateISO).maybeSingle(),
  ]);

  const reservas = resR.data || [];
  const overrides = ovrR.data || [];

  const totalPaxReal = reservas.reduce((s, r) => s + (r.pax || 0), 0);
  const vipPaxReal = reservas
    .filter(r => ["VIP Pass", "Atolon Experience"].includes(r.tipo))
    .reduce((s, r) => s + (r.pax || 0), 0);
  const excPaxReal = reservas
    .filter(r => r.tipo === "Exclusive Pass")
    .reduce((s, r) => s + (r.pax || 0), 0);

  const proyHoy = proyR.data?.pax_proyectado || 0;
  const totalPax = Math.max(totalPaxReal, proyHoy);
  const usaProy = proyHoy > totalPaxReal && proyHoy > 0;
  const projVipSplit = usaProy ? Math.round(totalPax * 0.8) : vipPaxReal;
  const projExcSplit = usaProy ? totalPax - projVipSplit : excPaxReal;
  const vipPax = Math.max(vipPaxReal, projVipSplit);
  const excPax = Math.max(excPaxReal, projExcSplit);

  const ovrMap = {};
  overrides.forEach(o => { ovrMap[o.role] = o.quantity_override; });

  const staff = calcStaff(totalPax, vipPax, excPax, ovrMap);
  return { totalPax, vipPax, excPax, overrides, ...staff };
}
