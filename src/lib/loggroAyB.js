// ── Helper para consumir ventas A&B desde Loggro Restobar ────────────────────
// Fuente oficial de datos de A&B para P/L, Financiero y Resultados.
// Reemplaza las lecturas de cierres_caja.total_ventas (que es el arqueo del
// cajero, no la facturación oficial).

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Caché en memoria — { "from|to": data }
const cache = new Map();

/**
 * getAyBRango(from, to) → { ok, resumen, por_metodo, por_dia }
 *   por_dia: { "YYYY-MM-DD": { ventas, propinas, tickets, anuladas, por_metodo } }
 * Los llamadores usan resumen.total_ventas para totales, por_dia para series
 * diarias/mensuales, y por_metodo para segmentación por método de pago.
 */
export async function getAyBRango(from, to) {
  const key = `${from}|${to}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const res = await fetch(
      `${URL}/functions/v1/loggro-sync/cierre-caja-rango?from=${from}&to=${to}`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Error Loggro");
    cache.set(key, data);
    return data;
  } catch (e) {
    console.warn("[loggroAyB] fallback a cierres_caja:", e?.message);
    return { ok: false, error: e.message, resumen: { total_ventas: 0, total_propinas: 0, total_general: 0, tickets: 0, anuladas: 0 }, por_metodo: {}, por_dia: {} };
  }
}

// Total A&B neto (ventas reales sin propinas ni anuladas) para un rango
export async function getTotalAyB(from, to) {
  const data = await getAyBRango(from, to);
  return Number(data?.resumen?.total_ventas) || 0;
}

// Total de ventas A&B por fecha individual → { "YYYY-MM-DD": ventas }
export async function getAyBPorDia(from, to) {
  const data = await getAyBRango(from, to);
  const out = {};
  for (const [fecha, d] of Object.entries(data?.por_dia || {})) {
    out[fecha] = Number(d.ventas) || 0;
  }
  return out;
}

export function clearCache() { cache.clear(); }
