import React from "react";
import { B } from "../brand";
import KardexItem from "./KardexItem";

// Panel lateral compartido para ver detalle de un item con:
// - Nombre + categoría + unidad
// - Stock por locación (si stockMap y locaciones se pasan)
// - Historial de movimientos (MovimientosItem)
//
// Uso desde cualquier módulo:
//   <ItemDetailModal item={item} locaciones={locaciones}
//     stockMap={stockMap} onClose={() => setDetalle(null)} />
//
// stockMap: Map de "item_id|locacion_id" → { cantidad } (opcional).
// locaciones: array de items_locaciones (opcional).
// Si no se pasan, se muestra solo el historial de movimientos.
export default function ItemDetailModal({ item, locaciones = [], stockMap, onClose }) {
  const fmt = n => Number(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 3 });

  const stockPorLoc = stockMap
    ? locaciones
        .map(l => ({
          loc: l,
          cantidad: Number(stockMap.get?.(`${item.id}|${l.id}`)?.cantidad ?? stockMap[`${item.id}|${l.id}`]) || 0,
        }))
        .filter(x => x.cantidad !== 0)
        .sort((a, b) => Math.abs(b.cantidad) - Math.abs(a.cantidad))
    : [];
  const total = stockPorLoc.reduce((s, x) => s + x.cantidad, 0);

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}
    >
      <div style={{ width: 520, maxWidth: "95vw", height: "100vh", overflowY: "auto", background: B.navyMid, padding: 24, borderLeft: `3px solid ${B.sky}` }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            {item.categoria && (
              <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: B.sky + "22", color: B.sky }}>
                {item.categoria}
              </span>
            )}
            <h2 style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", margin: "8px 0 0", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.nombre}
            </h2>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              Unidad: {item.unidad || "—"} · ID: {item.id}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: B.sand, fontSize: 22, cursor: "pointer", flexShrink: 0, marginLeft: 12 }}
          >
            ×
          </button>
        </div>

        {/* Kardex (incluye breakdown por bodega + timeline de movs agrupados) */}
        <KardexItem
          itemId={item.id}
          unidad={item.unidad}
          stockActual={stockMap ? total : (item.stock_actual ?? 0)}
          stockPorBodega={stockMap ? stockPorLoc : null}
          locaciones={locaciones}
        />
      </div>
    </div>
  );
}
