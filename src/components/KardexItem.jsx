import React, { useState, useEffect, useMemo } from "react";
import { B, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

// Kardex de un item: flujo Inicial → Compras → Transferencias → Ventas → Stock.
// Reemplaza al MovimientosItem legacy que mezclaba todos los movs sin
// contar el flujo real de inventario.
//
// Props:
//   itemId (string) — item a mostrar
//   unidad (string) — unidad para mostrar
//   stockActual (number) — stock real según items_stock_locacion (consolidado todas las bodegas)
//   stockPorBodega ([{loc:{id,nombre,icono},cantidad}]) — opcional, si viene se muestra breakdown

const TIPO_META = {
  entrada_ajuste_inicial:   { emoji: "🎯", label: "Inventario inicial",     color: "#38bdf8", grupo: "base" },
  entrada_ajuste:           { emoji: "➕", label: "Ajuste positivo",        color: "#22c55e", grupo: "ajuste_in" },
  entrada_compra:           { emoji: "📦", label: "Compras",                color: "#22c55e", grupo: "compra" },
  entrada_transferencia:    { emoji: "🔁", label: "Transferencia entrante", color: "#a3a3a3", grupo: "transf_in" },
  salida_transferencia:     { emoji: "🔁", label: "Transferencia saliente", color: "#a3a3a3", grupo: "transf_out" },
  salida_venta_restobar:    { emoji: "🍽️", label: "Ventas Restobar",       color: "#fbbf24", grupo: "venta" },
  salida_incluido:          { emoji: "🎟️", label: "Incluido en pase",      color: "#c084fc", grupo: "incluido" },
  salida_cortesia:          { emoji: "🎁", label: "Cortesías",              color: "#f472b6", grupo: "cortesia" },
  salida_comedor:           { emoji: "🍴", label: "Comedor empleados",     color: "#a78bfa", grupo: "comedor" },
  salida_evento:            { emoji: "🎉", label: "Eventos",                color: "#ec4899", grupo: "evento" },
  salida_interno:           { emoji: "👷", label: "Consumo interno",        color: "#38bdf8", grupo: "interno" },
  salida_ajuste:            { emoji: "➖", label: "Ajuste negativo",        color: "#ef4444", grupo: "ajuste_out" },
  salida_merma:             { emoji: "🗑️", label: "Merma",                 color: "#ef4444", grupo: "merma" },
};

// Orden visual de las filas del kardex
const KARDEX_ORDER = [
  "base",         // inventario inicial
  "compra",
  "ajuste_in",
  "transf_in",
  "transf_out",
  "venta",
  "incluido",
  "cortesia",
  "comedor",
  "evento",
  "interno",
  "ajuste_out",
  "merma",
];

const fmtN = n => Number(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 3 });

export default function KardexItem({ itemId, unidad, stockActual = 0, stockPorBodega = null, locaciones = [] }) {
  const [movs, setMovs] = useState(null);
  const [expandGrupo, setExpandGrupo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMovs(null);
      const { data } = await supabase.from("movimientos_inventario_atolon")
        .select("id, tipo, cantidad, precio_unit, fecha, created_at, usuario_email, notas, origen_tipo, origen_id, almacen_id, anulado")
        .eq("item_id", itemId).eq("anulado", false)
        .order("fecha", { ascending: true })
        .limit(2000);
      if (!cancelled) setMovs(data || []);
    })();
    return () => { cancelled = true; };
  }, [itemId]);

  // Nombre de bodega a partir del id
  const bodegaLabel = useMemo(() => {
    const map = new Map(locaciones.map(l => [l.id, l.nombre]));
    return (id) => map.get(id) || (id || "").replace("LOC-", "") || "—";
  }, [locaciones]);

  // Clasificar cada mov en su "grupo Kardex".
  // Inventario inicial: primer entrada_ajuste con "15" o "jul" en notas — o el más antiguo si no hay heurística.
  const clasificado = useMemo(() => {
    if (!movs) return null;
    // Detectar el inicial: buscar entrada_ajuste con nota que sugiera "15 jul" (primer setup)
    let initialIdx = -1;
    for (let i = 0; i < movs.length; i++) {
      const m = movs[i];
      if (m.tipo !== "entrada_ajuste") continue;
      const nota = String(m.notas || "").toLowerCase();
      if (nota.includes("15") && (nota.includes("jul") || nota.includes("julio") || nota.includes("inicial") || nota.includes("apertura"))) {
        initialIdx = i;
        break;
      }
    }
    // Fallback: el primer entrada_ajuste que aparezca (más antiguo, ya que ordenamos ASC)
    if (initialIdx === -1) {
      initialIdx = movs.findIndex(m => m.tipo === "entrada_ajuste");
    }

    const grupos = {}; // grupo -> { total, movs: [] }
    for (const g of KARDEX_ORDER) grupos[g] = { total: 0, movs: [] };

    for (let i = 0; i < movs.length; i++) {
      const m = movs[i];
      const meta = (i === initialIdx && m.tipo === "entrada_ajuste")
        ? TIPO_META.entrada_ajuste_inicial
        : TIPO_META[m.tipo];
      if (!meta) continue;
      const cant = Number(m.cantidad) || 0;
      const signo = String(m.tipo).startsWith("entrada") ? 1 : -1;
      grupos[meta.grupo].total += signo * cant;
      grupos[meta.grupo].movs.push({ ...m, meta });
    }
    return grupos;
  }, [movs]);

  // Stock calculado desde el kardex — para verificación
  const stockCalc = useMemo(() => {
    if (!clasificado) return 0;
    return KARDEX_ORDER.reduce((s, g) => s + (clasificado[g]?.total || 0), 0);
  }, [clasificado]);

  const diff = stockActual - stockCalc;
  const hayDiferencia = Math.abs(diff) > 0.01;

  if (movs === null) {
    return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, background: B.navy, borderRadius: 10 }}>Cargando kardex...</div>;
  }

  return (
    <div>
      {/* Breakdown por bodega */}
      {stockPorBodega && stockPorBodega.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            📍 Stock por bodega
          </div>
          <div style={{ background: B.navy, borderRadius: 10, padding: 8 }}>
            {stockPorBodega.map(x => {
              const pct = stockActual > 0 ? (x.cantidad / stockActual) * 100 : 0;
              return (
                <div key={x.loc.id} style={{ padding: "8px 10px", borderBottom: `1px solid ${B.navyLight}44` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{x.loc.icono || "📍"} {x.loc.nombre}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: x.cantidad < 0 ? "#fca5a5" : "#fff" }}>
                      {fmtN(x.cantidad)} {unidad}
                    </span>
                  </div>
                  <div style={{ height: 4, background: B.navyLight, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.abs(pct))}%`, background: x.cantidad < 0 ? "#ef4444" : B.sky }} />
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 10px", fontSize: 13, fontWeight: 800, color: B.sky, borderTop: `2px solid ${B.sky}44` }}>
              <span>Total</span>
              <span>{fmtN(stockActual)} {unidad}</span>
            </div>
          </div>
        </div>
      )}

      {/* Kardex Timeline */}
      <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        📊 Kardex del producto
      </div>
      <div style={{ background: B.navy, borderRadius: 10, padding: 4 }}>
        {KARDEX_ORDER.map(g => {
          const grupo = clasificado?.[g];
          if (!grupo || grupo.movs.length === 0) return null;
          const meta = TIPO_META[grupo.movs[0].tipo] || (g === "base" ? TIPO_META.entrada_ajuste_inicial : { emoji: "•", label: g, color: "#888" });
          const label = g === "base" ? "Inventario inicial" : meta.label;
          const total = grupo.total;
          const isTransf = g.startsWith("transf");
          const signo = total > 0 ? "+" : "";
          const isExpanded = expandGrupo === g;

          return (
            <div key={g}>
              <div
                onClick={() => setExpandGrupo(isExpanded ? null : g)}
                style={{
                  display: "grid", gridTemplateColumns: "24px 1fr auto 20px", gap: 10, alignItems: "center",
                  padding: "10px 12px", cursor: "pointer",
                  borderBottom: `1px solid ${B.navyLight}44`,
                  background: isExpanded ? B.navyLight + "44" : "transparent",
                }}
              >
                <span style={{ fontSize: 14 }}>{meta.emoji}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>{label}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{grupo.movs.length} movs</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: isTransf ? "#a3a3a3" : (total > 0 ? "#22c55e" : "#ef4444"), fontVariantNumeric: "tabular-nums" }}>
                  {isTransf ? "±" : signo}{fmtN(total)}
                </div>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{isExpanded ? "▾" : "▸"}</span>
              </div>
              {isExpanded && (
                <div style={{ background: "rgba(0,0,0,0.3)", padding: 8, borderBottom: `1px solid ${B.navyLight}44` }}>
                  {grupo.movs.slice().reverse().slice(0, 50).map(m => {
                    const cant = Number(m.cantidad) || 0;
                    const signoI = String(m.tipo).startsWith("entrada") ? "+" : "−";
                    const colorI = String(m.tipo).startsWith("entrada") ? "#22c55e" : "#ef4444";
                    const ocMatch = String(m.notas || "").match(/OC-\d{4}-\d+/);
                    return (
                      <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "5px 10px", fontSize: 10, borderBottom: `1px solid ${B.navyLight}22` }}>
                        <div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ color: "rgba(255,255,255,0.7)" }}>{fmtFecha(m.fecha)}</span>
                            <span style={{ color: "rgba(255,255,255,0.4)" }}>· {bodegaLabel(m.almacen_id)}</span>
                            {ocMatch && <span style={{ color: B.sky, fontWeight: 700 }}>· 📄 {ocMatch[0]}</span>}
                          </div>
                          {m.notas && (
                            <div style={{ color: "rgba(255,255,255,0.4)", marginTop: 2, fontSize: 9 }}>{m.notas.slice(0, 100)}</div>
                          )}
                        </div>
                        <div style={{ color: colorI, fontWeight: 700, textAlign: "right", fontSize: 11 }}>
                          {signoI}{fmtN(cant)}
                        </div>
                      </div>
                    );
                  })}
                  {grupo.movs.length > 50 && (
                    <div style={{ padding: "6px 10px", fontSize: 9, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
                      Mostrando 50 de {grupo.movs.length}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Stock actual (fila final) */}
        <div style={{ display: "grid", gridTemplateColumns: "24px 1fr auto 20px", gap: 10, padding: "12px", background: B.sky + "18", borderTop: `2px solid ${B.sky}`, alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>=</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: B.sky }}>STOCK ACTUAL</span>
          <span style={{ fontSize: 15, fontWeight: 900, color: B.sky, fontVariantNumeric: "tabular-nums" }}>{fmtN(stockActual)} {unidad}</span>
          <span />
        </div>
      </div>

      {/* Alerta si el kardex no cuadra con el stock actual */}
      {hayDiferencia && (
        <div style={{ marginTop: 12, padding: 10, background: "#f59e0b22", border: `1px solid #f59e0b55`, borderRadius: 8, fontSize: 11, color: "#fbbf24" }}>
          ⚠️ El kardex no cuadra con el stock actual. Calculado: <b>{fmtN(stockCalc)}</b> · Real: <b>{fmtN(stockActual)}</b> · Diferencia: <b>{diff > 0 ? "+" : ""}{fmtN(diff)}</b>.
          Esto suele indicar movimientos anulados sin revertir stock, o un conteo físico que ajustó sin registrar mov.
        </div>
      )}
    </div>
  );
}
