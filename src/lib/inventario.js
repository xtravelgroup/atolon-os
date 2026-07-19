// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE INVENTARIO
//
// Wrappers alrededor de la RPC ajustar_stock_locacion (atomica) y la funcion
// unificada de transferencia entre locaciones. Objetivo: que TODO el codigo
// que muta stock pase por aca — sin SELECT-then-UPDATE, sin duplicacion de
// escrituras en items_stock_locacion / items_transferencias / movimientos.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

/**
 * Ajusta el stock de un item en una locacion de forma atomica (INSERT+UPDATE
 * con lock via ON CONFLICT). Registra el movimiento en el historial oficial.
 * Retorna la cantidad final en esa locacion.
 *
 * @param {object} opts
 * @param {string} opts.itemId
 * @param {string} opts.locacionId
 * @param {number} opts.delta         Positivo = suma, negativo = resta
 * @param {string} opts.tipo          Tipo de movimiento (entrada_compra, salida_transferencia, etc.). Usa 'skip_mov' para omitir el registro.
 * @param {string} [opts.ref]         Identificador unico del mov (evita duplicados)
 * @param {string} [opts.usuarioEmail]
 * @param {string} [opts.notas]
 * @param {string} [opts.origenTipo]  Categoria del origen (transferencia_manual, ajuste_loggro_a_atolon, venta_restobar, etc.)
 * @param {string} [opts.origenId]    ID del origen (transferencia, ajuste, orden Loggro, etc.)
 * @param {string} [opts.unidad]
 * @param {number} [opts.precioUnit]
 * @returns {Promise<number>} cantidad final en la locacion
 */
export async function ajustarStockLocacion({
  itemId, locacionId, delta, tipo, ref = null,
  usuarioEmail = null, notas = null, origenTipo = null, origenId = null,
  unidad = null, precioUnit = null,
}) {
  const { data, error } = await supabase.rpc("ajustar_stock_locacion", {
    p_item_id: itemId,
    p_locacion_id: locacionId,
    p_delta: delta,
    p_tipo: tipo,
    p_ref: ref,
    p_usuario_email: usuarioEmail,
    p_notas: notas,
    p_origen_tipo: origenTipo,
    p_origen_id: origenId,
    p_unidad: unidad,
    p_precio_unit: precioUnit,
  });
  if (error) throw new Error(`ajustarStockLocacion falló: ${error.message}`);
  return Number(data) || 0;
}

/**
 * Transfiere una cantidad de un item de una locacion a otra. Escribe:
 *   - items_transferencias (registro consolidado)
 *   - movimientos_inventario_atolon × 2 (salida + entrada) via la RPC
 *   - items_stock_locacion × 2 (restar origen, sumar destino) via la RPC
 *
 * Auditoria 2026-07-18: antes existian 2 implementaciones divergentes
 * (Almacenes.jsx completa, Items.jsx TransferenciaModal solo escribia
 * items_transferencias sin movs) — el historial oficial estaba roto.
 *
 * @param {object} opts
 * @param {string} opts.itemId
 * @param {string} opts.origen        locacion_id de origen
 * @param {string} opts.destino       locacion_id de destino
 * @param {number} opts.cantidad      cantidad positiva a transferir
 * @param {string} [opts.unidad]
 * @param {string} [opts.motivo]
 * @param {string} [opts.usuarioEmail]
 * @returns {Promise<{transferId: string, cantOrigen: number, cantDestino: number}>}
 */
export async function transferirStock({
  itemId, origen, destino, cantidad, unidad = null, motivo = "", usuarioEmail = null,
}) {
  if (!itemId) throw new Error("itemId requerido");
  if (!origen || !destino) throw new Error("origen y destino requeridos");
  if (origen === destino) throw new Error("origen y destino no pueden ser iguales");
  const cant = Number(cantidad);
  if (!(cant > 0)) throw new Error("cantidad debe ser > 0");

  const transferId = `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const notas = motivo?.trim() || null;

  // 1) Registro consolidado
  const { error: e1 } = await supabase.from("items_transferencias").insert({
    id: transferId,
    item_id: itemId,
    from_locacion_id: origen,
    to_locacion_id: destino,
    cantidad: cant,
    motivo: notas,
    usuario_email: usuarioEmail,
  });
  if (e1) throw new Error(`insert items_transferencias falló: ${e1.message}`);

  // 2) Salida en origen (atomica)
  const cantOrigen = await ajustarStockLocacion({
    itemId, locacionId: origen, delta: -cant,
    tipo: "salida_transferencia",
    ref: `${transferId}-out`,
    usuarioEmail, notas, unidad,
    origenTipo: "transferencia_manual",
    origenId: transferId,
  });

  // 3) Entrada en destino (atomica)
  const cantDestino = await ajustarStockLocacion({
    itemId, locacionId: destino, delta: cant,
    tipo: "entrada_transferencia",
    ref: `${transferId}-in`,
    usuarioEmail, notas, unidad,
    origenTipo: "transferencia_manual",
    origenId: transferId,
  });

  return { transferId, cantOrigen, cantDestino };
}
