import React, { useState, useEffect, useMemo } from "react";
import { B, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

// Muestra el historial de movimientos_inventario_atolon para un item.
// Reutilizable desde cualquier modulo (Items, Almacenes, etc).
export default function MovimientosItem({ itemId, unidad, stockActual }) {
  const [movs, setMovs] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMovs(null);
      const desde = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase.from("movimientos_inventario_atolon")
        .select("id, tipo, cantidad, unidad, precio_unit, fecha, usuario_email, notas, origen_tipo, almacen_id, anulado")
        .eq("item_id", itemId).eq("anulado", false)
        .gte("fecha", desde).order("fecha", { ascending: false }).limit(200);
      if (!cancelled) setMovs(data || []);
    })();
    return () => { cancelled = true; };
  }, [itemId, days]);

  const totales = useMemo(() => {
    if (!movs) return { entradas: 0, salidas: 0, neto: 0, porTipo: {} };
    let entradas = 0, salidas = 0;
    const porTipo = {};
    for (const m of movs) {
      const q = Number(m.cantidad) || 0;
      const esEntrada = String(m.tipo).startsWith("entrada");
      if (esEntrada) entradas += q; else salidas += q;
      porTipo[m.tipo] = (porTipo[m.tipo] || 0) + (esEntrada ? q : -q);
    }
    return { entradas, salidas, neto: entradas - salidas, porTipo };
  }, [movs]);

  const TIPO_LABEL = {
    entrada_compra: { emoji: "📦", label: "Compra", color: "#22c55e" },
    entrada_ajuste: { emoji: "➕", label: "Ajuste +", color: "#22c55e" },
    entrada_transferencia: { emoji: "🔁", label: "Transferencia +", color: "#22c55e" },
    salida_venta_restobar: { emoji: "🍽️", label: "Venta Restobar", color: "#fbbf24" },
    salida_comedor: { emoji: "🍴", label: "Comedor", color: "#a78bfa" },
    salida_evento: { emoji: "🎉", label: "Evento", color: "#ec4899" },
    salida_cortesia: { emoji: "🎁", label: "Cortesía", color: "#fbbf24" },
    salida_interno: { emoji: "👷", label: "Consumo interno", color: "#38bdf8" },
    salida_ajuste: { emoji: "➖", label: "Ajuste -", color: "#ef4444" },
    salida_merma: { emoji: "🗑️", label: "Merma", color: "#ef4444" },
    salida_transferencia: { emoji: "🔁", label: "Transferencia -", color: "#ef4444" },
  };

  const fmtN = n => Number(n || 0).toLocaleString("es-CO", { maximumFractionDigits: 3 });

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          📊 Movimientos ({days}d)
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          style={{ fontSize: 11, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}>
          <option value={7}>7 días</option>
          <option value={30}>30 días</option>
          <option value={90}>90 días</option>
          <option value={365}>1 año</option>
        </select>
      </div>

      {movs === null ? (
        <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 11, background: B.navy, borderRadius: 10 }}>Cargando...</div>
      ) : movs.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12, background: B.navy, borderRadius: 10 }}>Sin movimientos en el período</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div style={{ background: B.navy, borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>Entradas</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#22c55e" }}>+{fmtN(totales.entradas)}</div>
            </div>
            <div style={{ background: B.navy, borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>Salidas</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#ef4444" }}>−{fmtN(totales.salidas)}</div>
            </div>
            <div style={{ background: B.navy, borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>Stock actual</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: B.sky }}>{fmtN(stockActual)} {unidad}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {Object.entries(totales.porTipo).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([tipo, cant]) => {
              const cfg = TIPO_LABEL[tipo] || { emoji: "•", label: tipo, color: "#888" };
              return (
                <span key={tipo} style={{ fontSize: 10, padding: "3px 8px", background: cfg.color + "22", color: cfg.color, borderRadius: 10, border: `1px solid ${cfg.color}44` }}>
                  {cfg.emoji} {cfg.label} {cant >= 0 ? "+" : ""}{fmtN(cant)}
                </span>
              );
            })}
          </div>

          <div style={{ background: B.navy, borderRadius: 10, maxHeight: expanded ? "none" : 280, overflowY: "auto" }}>
            {movs.slice(0, expanded ? movs.length : 8).map(m => {
              const cfg = TIPO_LABEL[m.tipo] || { emoji: "•", label: m.tipo, color: "#888" };
              const esEntrada = String(m.tipo).startsWith("entrada");
              return (
                <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${B.navyLight}44`, fontSize: 11, alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: cfg.color }}>{cfg.emoji} {cfg.label}</span>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{fmtFecha(m.fecha)}</span>
                      {m.almacen_id && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 6 }}>{m.almacen_id.replace("LOC-","")}</span>}
                    </div>
                    {m.notas && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{m.notas.slice(0, 80)}</div>}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 700, color: esEntrada ? "#22c55e" : "#ef4444", fontSize: 13 }}>
                    {esEntrada ? "+" : "−"}{fmtN(m.cantidad)}
                  </div>
                </div>
              );
            })}
          </div>
          {movs.length > 8 && (
            <button onClick={() => setExpanded(!expanded)} style={{ marginTop: 8, background: "transparent", border: "none", color: B.sky, fontSize: 11, cursor: "pointer", padding: "6px 0" }}>
              {expanded ? "Contraer" : `Ver los ${movs.length - 8} restantes`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
