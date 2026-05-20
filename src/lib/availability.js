// Cliente del SPA para el availability-engine.
// Reemplaza queries duplicadas a salidas/cierres/reservas en los módulos.

const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Verifica disponibilidad real para una fecha y un grupo.
 * @param {string} fecha — YYYY-MM-DD
 * @param {number} numPersonas
 * @returns {Promise<{ hay_disponibilidad: boolean, opciones: Array, horarios_disponibles: string[] }>}
 */
/**
 * Versión detallada (admin o public).
 * Devuelve cap base + extra, pax actual, motivo de cierre, override aplicado.
 *
 * @param {string} fecha — YYYY-MM-DD
 * @param {string} [excludeReservaId] — id a excluir (cuando se edita una reserva existente)
 * @param {{ clientView?: boolean }} [opts] — clientView=true aplica cutoff 45min antes de salida hoy
 */
export async function checkDisponibilidadDetailed(fecha, excludeReservaId, opts = {}) {
  if (!fecha) throw new Error("fecha requerida");
  const r = await fetch(`${SUPA_URL}/functions/v1/availability-engine/check-detailed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPA_ANON}`,
      apikey: SUPA_ANON,
    },
    body: JSON.stringify({
      fecha,
      exclude_reserva_id: excludeReservaId || null,
      client_view: !!opts.clientView,
    }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`availability-engine ${r.status}: ${body.error || "unknown"}`);
  }
  return await r.json();
}

/**
 * Vista mensual: cupos disponibles por día del mes. Para calendarios.
 * @param {number} year
 * @param {number} month — 1-12
 * @returns {Promise<{ year, month, capacidad_diaria_base, dias: Record<string,{abierto,cupos,cierre?}> }>}
 */
export async function checkDisponibilidadMonth(year, month) {
  if (!year || !month || month < 1 || month > 12) throw new Error("year + month (1-12) requeridos");
  const r = await fetch(`${SUPA_URL}/functions/v1/availability-engine/check-month`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPA_ANON}`,
      apikey: SUPA_ANON,
    },
    body: JSON.stringify({ year, month }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`availability-engine ${r.status}: ${body.error || "unknown"}`);
  }
  return await r.json();
}

export async function checkDisponibilidad(fecha, numPersonas) {
  if (!fecha || !Number.isInteger(numPersonas) || numPersonas <= 0) {
    throw new Error("fecha y numPersonas válidos son requeridos");
  }
  const r = await fetch(`${SUPA_URL}/functions/v1/availability-engine/check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPA_ANON}`,
      apikey: SUPA_ANON,
    },
    body: JSON.stringify({ fecha, num_personas: numPersonas }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`availability-engine ${r.status}: ${body.error || "unknown"}`);
  }
  return await r.json();
}
