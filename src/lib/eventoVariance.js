// KPMG B-5 · Análisis de varianza Cotizado vs Consumido vs Pagado
// ===================================================================
// Funciones puras para calcular la diferencia entre lo que se cotizó,
// lo que el cliente realmente consumió (A&B) y lo que pagó.
//
// El propósito desde auditoría es detectar:
//   - Eventos que consumieron mucho más de lo cotizado (deficit oculto)
//   - Eventos que se sub-facturaron (pagado < cotizado significativamente)
//   - Eventos sin consumo registrado pero con cotización A&B (proceso roto)

/**
 * Calcula totales de la cotización agrupados por categoría.
 * cotizacion_data esquema: { espacios:[], alimentos:[], hospedaje:[], servicios:[], notas }
 * Cada item: { concepto, cantidad, valor_unit, noches, iva, menu_tipo? }
 */
export function cotizacionTotales(cot) {
  const empty = { total: 0, espacios: 0, alimentos: 0, hospedaje: 0, servicios: 0, items: 0 };
  if (!cot || typeof cot !== "object") return empty;

  const sumarItems = (arr) => {
    if (!Array.isArray(arr)) return 0;
    return arr.reduce((s, it) => {
      const cant   = Number(it.cantidad)   || 0;
      const valor  = Number(it.valor_unit) || 0;
      const noches = Number(it.noches)     || 1;
      const iva    = Number(it.iva)        || 0;
      const subtotal = cant * valor * noches;
      const con_iva  = subtotal * (1 + iva / 100);
      return s + con_iva;
    }, 0);
  };

  const espacios   = sumarItems(cot.espacios);
  const alimentos  = sumarItems(cot.alimentos);
  const hospedaje  = sumarItems(cot.hospedaje);
  const servicios  = sumarItems(cot.servicios);
  const total      = espacios + alimentos + hospedaje + servicios;
  const items      = (cot.espacios?.length || 0) + (cot.alimentos?.length || 0)
                   + (cot.hospedaje?.length || 0) + (cot.servicios?.length || 0);

  return { total, espacios, alimentos, hospedaje, servicios, items };
}

/**
 * Suma los pagos del evento.
 * pagos esquema: array de { monto, fecha, metodo, ... }
 */
export function pagosTotal(pagos) {
  if (!Array.isArray(pagos)) return 0;
  return pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
}

/**
 * Calcula consumo real desde eventos_consumo_openbar.
 * Recibe array de filas no anuladas.
 */
export function consumoTotales(consumoRows) {
  if (!Array.isArray(consumoRows)) return { total: 0, registros: 0, unidades: 0, costo_cero: 0 };
  const vigentes = consumoRows.filter(r => !r.anulado);
  const total       = vigentes.reduce((s, r) => s + (Number(r.costo_total) || 0), 0);
  const unidades    = vigentes.reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
  const costo_cero  = vigentes.filter(r => !Number(r.costo_total)).length;
  return { total, registros: vigentes.length, unidades, costo_cero };
}

/**
 * Combina los 3 ángulos y calcula varianzas / banderas.
 *
 * Banderas:
 *   FLAG_NO_CONSUMO  → Cotizado A&B > 0 pero consumo registrado = 0
 *                     (proceso operativo roto: no se capturó el consumo)
 *   FLAG_SUB_PAGO    → Pagado < 70% Cotizado y fecha ya pasó
 *                     (saldo por cobrar grande o evento subfacturado)
 *   FLAG_SOBRE_CONSUMO → Consumido > 110% Cotizado A&B
 *                     (cliente consumió mucho más de lo presupuestado;
 *                     puede ser margen perdido o cobro adicional pendiente)
 *   FLAG_COSTO_CERO  → Existen registros de consumo con costo_total = 0
 *                     (item sin precio configurado en Loggro)
 */
export function variance(evento, consumoRows) {
  const cot = cotizacionTotales(evento?.cotizacion_data);
  const pag = pagosTotal(evento?.pagos);
  const con = consumoTotales(consumoRows);

  const dif_pag_vs_cot     = pag - cot.total;
  const dif_pag_vs_cot_pct = cot.total > 0 ? (dif_pag_vs_cot / cot.total) * 100 : null;

  const dif_con_vs_ab      = con.total - cot.alimentos;
  const dif_con_vs_ab_pct  = cot.alimentos > 0 ? (dif_con_vs_ab / cot.alimentos) * 100 : null;

  const flags = [];
  const fechaPasada = evento?.fecha ? new Date(evento.fecha) < new Date() : false;

  if (cot.alimentos > 0 && con.total === 0 && fechaPasada) {
    flags.push("FLAG_NO_CONSUMO");
  }
  if (fechaPasada && cot.total > 0 && pag < cot.total * 0.7) {
    flags.push("FLAG_SUB_PAGO");
  }
  if (cot.alimentos > 0 && con.total > cot.alimentos * 1.1) {
    flags.push("FLAG_SOBRE_CONSUMO");
  }
  if (con.costo_cero > 0) {
    flags.push("FLAG_COSTO_CERO");
  }

  return {
    cotizado:  cot,
    pagado:    pag,
    consumido: con,
    dif_pag_vs_cot,
    dif_pag_vs_cot_pct,
    dif_con_vs_ab,
    dif_con_vs_ab_pct,
    flags,
    estado: flags.length === 0 ? "ok" : flags.includes("FLAG_NO_CONSUMO") || flags.includes("FLAG_SUB_PAGO") ? "danger" : "warning",
  };
}

export const FLAG_DESC = {
  FLAG_NO_CONSUMO:    "Evento ya pasó y tenía A&B cotizado, pero no se registró consumo",
  FLAG_SUB_PAGO:      "Pagado < 70% de lo cotizado y el evento ya pasó",
  FLAG_SOBRE_CONSUMO: "Consumo real > 110% del cotizado A&B (sobreconsumo)",
  FLAG_COSTO_CERO:    "Hay items consumidos con costo $0 (item sin precio en Loggro)",
};
