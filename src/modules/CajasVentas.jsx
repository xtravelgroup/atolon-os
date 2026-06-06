// CajasVentas — Dashboard live de todas las ventas hechas en /cajas
// (Cajas Express del evento). Muestra:
//   - KPIs grandes: total revenue, count, métodos de pago, propinas
//   - Breakdown por caja, cajero, impresora, hora del día
//   - Top productos vendidos
//   - Lista de ventas expandible con items
//   - Auto-refresh cada 10s para que sirva durante el evento
//   - Filtros: rango de fecha (hoy / ayer / 7d / mes / custom) y por caja
//   - Anular venta (con motivo)

import { useEffect, useMemo, useState } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

const fmtFechaHora = (iso) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

// Rangos preset → [desde, hasta] como ISO. Hasta es exclusivo (siempre fin de día / hoy).
function calcularRango(rango) {
  const ahora = new Date();
  const hoy0  = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0);
  if (rango === "hoy")       return [hoy0, ahora];
  if (rango === "ayer") {
    const ayer = new Date(hoy0); ayer.setDate(ayer.getDate() - 1);
    return [ayer, hoy0];
  }
  if (rango === "7d") {
    const d = new Date(hoy0); d.setDate(d.getDate() - 6);
    return [d, ahora];
  }
  if (rango === "mes") {
    const d = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    return [d, ahora];
  }
  return [hoy0, ahora];
}

export default function CajasVentas() {
  const isMobile = useMobile();

  const [rango, setRango] = useState("hoy");        // hoy | ayer | 7d | mes
  const [cajaFiltro, setCajaFiltro] = useState(""); // "" = todas
  const [cajas, setCajas] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [reload, setReload] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  // Carga lista de cajas para el filtro
  useEffect(() => {
    if (!supabase) return;
    supabase.from("cajas_evento_cajas")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setCajas(data || []));
  }, []);

  // Carga ventas según rango + filtro
  useEffect(() => {
    if (!supabase) return;
    setLoading(true);
    const [desde, hasta] = calcularRango(rango);
    let q = supabase.from("cajas_evento_ventas")
      .select("*")
      .gte("created_at", desde.toISOString())
      .lt("created_at",  hasta.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);
    if (cajaFiltro) q = q.eq("caja_id", cajaFiltro);
    q.then(({ data }) => { setVentas(data || []); setLoading(false); });
  }, [rango, cajaFiltro, reload]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => setReload(r => r + 1), 10000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  // Sólo no-anuladas para los totales
  const activas = useMemo(
    () => ventas.filter(v => v.estado !== "anulada"),
    [ventas]
  );

  // Cálculos derivados
  const kpis = useMemo(() => {
    const k = {
      count: 0, total: 0, propinas: 0,
      efectivo: 0, tarjeta: 0, usd: 0,
      anuladas: ventas.length - activas.length,
      items: 0,
    };
    activas.forEach(v => {
      k.count++;
      k.total += Number(v.total) || 0;
      k.propinas += Number(v.propina) || 0;
      if (v.metodo_pago === "efectivo") k.efectivo += Number(v.total) || 0;
      if (v.metodo_pago === "tarjeta")  k.tarjeta  += Number(v.total) || 0;
      if (v.pago_recibido?.moneda === "USD") k.usd += Number(v.pago_recibido?.monto) || 0;
      k.items += (v.items || []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
    });
    return k;
  }, [activas, ventas.length]);

  // Por caja
  const porCaja = useMemo(() => {
    const m = {};
    activas.forEach(v => {
      const key = v.caja_id || "—";
      if (!m[key]) m[key] = { caja: key, count: 0, total: 0 };
      m[key].count++;
      m[key].total += Number(v.total) || 0;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [activas]);

  // Por cajero
  const porCajero = useMemo(() => {
    const m = {};
    activas.forEach(v => {
      const key = v.cajero_nombre || "—";
      if (!m[key]) m[key] = { cajero: key, count: 0, total: 0 };
      m[key].count++;
      m[key].total += Number(v.total) || 0;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [activas]);

  // Top productos (suma de cantidad y revenue)
  const topProductos = useMemo(() => {
    const m = {};
    activas.forEach(v => {
      (v.items || []).forEach(it => {
        const k = it.nombre || it.id || "—";
        if (!m[k]) m[k] = { nombre: k, cantidad: 0, revenue: 0 };
        m[k].cantidad += Number(it.cantidad) || 0;
        m[k].revenue  += Number(it.subtotal) || (Number(it.precio) * Number(it.cantidad)) || 0;
      });
    });
    return Object.values(m).sort((a, b) => b.cantidad - a.cantidad).slice(0, 12);
  }, [activas]);

  // Por hora del día (curva de venta)
  const porHora = useMemo(() => {
    const buckets = {};
    activas.forEach(v => {
      const h = new Date(v.created_at).getHours();
      if (!buckets[h]) buckets[h] = { hora: h, count: 0, total: 0 };
      buckets[h].count++;
      buckets[h].total += Number(v.total) || 0;
    });
    return Object.values(buckets).sort((a, b) => a.hora - b.hora);
  }, [activas]);

  const anular = async (venta) => {
    const motivo = prompt(`¿Anular venta ${venta.id}?\n\nMotivo:`);
    if (!motivo || motivo.trim().length < 3) return;
    const { error } = await supabase.from("cajas_evento_ventas").update({
      estado: "anulada",
      anulada_motivo: motivo.trim(),
      anulada_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", venta.id);
    if (error) { alert("Error: " + error.message); return; }
    setReload(r => r + 1);
  };

  const exportCSV = () => {
    const rows = [
      ["Fecha", "VentaID", "Caja", "Cajero", "Total", "Propina", "Método", "Moneda", "Items", "LoggroEstado", "Estado"],
      ...activas.map(v => [
        new Date(v.created_at).toLocaleString("es-CO"),
        v.id, v.caja_id, v.cajero_nombre,
        v.total, v.propina || 0,
        v.metodo_pago, v.pago_recibido?.moneda || "COP",
        (v.items || []).map(i => `${i.cantidad}x ${i.nombre}`).join(" | "),
        v.loggro_estado || "—", v.estado || "ok",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `ventas-cajas-${rango}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pad = isMobile ? 12 : 24;
  const maxPico = Math.max(...porHora.map(h => h.total), 1);

  return (
    <div style={{ padding: pad, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header + controles */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 18 }}>
        <div style={{ flex: "1 1 auto", minWidth: 200 }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 900, color: B.navy, letterSpacing: "-0.01em" }}>
            💰 Ventas Cajas Express
          </h2>
          <div style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>
            {loading ? "Cargando…" : `${kpis.count} ventas activas${kpis.anuladas ? ` · ${kpis.anuladas} anuladas` : ""} · Auto-refresh ${autoRefresh ? "ON" : "OFF"}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setAutoRefresh(a => !a)} style={btnSec(autoRefresh ? B.success : B.muted)}>
            {autoRefresh ? "🔄 Live" : "⏸ Pausa"}
          </button>
          <button onClick={() => setReload(r => r + 1)} style={btnSec(B.muted)}>↻ Refrescar</button>
          <button onClick={exportCSV} style={btnSec(B.navy)}>⬇ CSV</button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { v: "hoy", l: "Hoy" },
          { v: "ayer", l: "Ayer" },
          { v: "7d", l: "Últ. 7 días" },
          { v: "mes", l: "Mes" },
        ].map(o => (
          <button key={o.v} onClick={() => setRango(o.v)}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 20, cursor: "pointer",
              background: rango === o.v ? B.navy : "#fff",
              color: rango === o.v ? "#fff" : B.navy,
              border: `1.5px solid ${rango === o.v ? B.navy : "#dde2eb"}`,
            }}>{o.l}</button>
        ))}
        <div style={{ width: 1, background: "#dde2eb", margin: "0 6px" }} />
        <select value={cajaFiltro} onChange={e => setCajaFiltro(e.target.value)}
          style={{
            padding: "8px 30px 8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 20,
            background: cajaFiltro ? B.navy : "#fff",
            color: cajaFiltro ? "#fff" : B.navy,
            border: `1.5px solid ${cajaFiltro ? B.navy : "#dde2eb"}`,
            outline: "none", cursor: "pointer", appearance: "none",
          }}>
          <option value="">Todas las cajas</option>
          {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {/* KPIs grandes */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10, marginBottom: 18,
      }}>
        <Kpi label="REVENUE" valor={COP(kpis.total)} color={B.navy} big />
        <Kpi label="VENTAS"  valor={kpis.count} color={B.navy} />
        <Kpi label="ITEMS"   valor={kpis.items} color={B.muted} />
        <Kpi label="EFECTIVO" valor={COP(kpis.efectivo)} color={B.success} />
        <Kpi label="TARJETA"  valor={COP(kpis.tarjeta)}  color={B.warning} />
        <Kpi label="PROPINAS" valor={COP(kpis.propinas)} color="#9333ea" />
        {kpis.usd > 0 && <Kpi label="USD RECIBIDOS" valor={`US$ ${Math.round(kpis.usd).toLocaleString("en-US")}`} color="#0ea5e9" />}
      </div>

      {/* Curva por hora — barritas */}
      {porHora.length > 1 && (
        <Card title="Curva por hora">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100, padding: "0 4px" }}>
            {porHora.map(h => (
              <div key={h.hora} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div title={`${h.hora}h — ${h.count} ventas · ${COP(h.total)}`}
                  style={{
                    width: "100%", maxWidth: 40,
                    background: B.navy, borderRadius: "4px 4px 0 0",
                    height: `${(h.total / maxPico) * 100}%`,
                    minHeight: 2,
                    transition: "height 0.4s",
                  }} />
                <div style={{ fontSize: 10, color: B.muted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                  {String(h.hora).padStart(2, "0")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Breakdowns en 2 columnas (1 en mobile) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 14, marginBottom: 18,
      }}>
        <Card title={`Por caja (${porCaja.length})`}>
          <Lista rows={porCaja.map(r => ({
            label: r.caja, sub: `${r.count} ventas`, valor: COP(r.total),
          }))} />
        </Card>
        <Card title={`Por cajero (${porCajero.length})`}>
          <Lista rows={porCajero.map(r => ({
            label: r.cajero, sub: `${r.count} ventas`, valor: COP(r.total),
          }))} />
        </Card>
      </div>

      {/* Top productos */}
      <Card title="Top productos vendidos">
        <div style={{ display: "grid", gap: 6 }}>
          {topProductos.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: B.muted, fontSize: 13 }}>Sin productos vendidos en este rango.</div>
          )}
          {topProductos.map((p, idx) => (
            <div key={p.nombre} style={{
              display: "grid", gridTemplateColumns: "30px 1fr auto auto", gap: 12,
              padding: "8px 12px", background: idx === 0 ? "#FFF4D6" : "#F7F9FC",
              borderRadius: 6, alignItems: "center", fontSize: 13,
            }}>
              <span style={{ color: B.muted, fontWeight: 800, fontFamily: "monospace" }}>#{idx + 1}</span>
              <span style={{ fontWeight: 700 }}>{p.nombre}</span>
              <span style={{ color: B.muted }}>{p.cantidad} u.</span>
              <span style={{ fontWeight: 800, color: B.navy, fontVariantNumeric: "tabular-nums" }}>{COP(p.revenue)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Lista de ventas */}
      <Card title={`Ventas (${activas.length})`}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: B.muted }}>Cargando…</div>
        ) : isMobile ? (
          <div style={{ display: "grid", gap: 8 }}>
            {activas.map(v => (
              <VentaCardMobile key={v.id} v={v}
                expandido={expandedId === v.id}
                onExpand={() => setExpandedId(e => e === v.id ? null : v.id)}
                onAnular={() => anular(v)} />
            ))}
            {activas.length === 0 && <Vacio />}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F7F9FC" }}>
                  <th style={th}>Hora</th>
                  <th style={th}>Caja</th>
                  <th style={th}>Cajero</th>
                  <th style={th}>Items</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={th}>Pago</th>
                  <th style={th}>Loggro</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {activas.map(v => (
                  <VentaRowDesktop key={v.id} v={v}
                    expandido={expandedId === v.id}
                    onExpand={() => setExpandedId(e => e === v.id ? null : v.id)}
                    onAnular={() => anular(v)} />
                ))}
                {activas.length === 0 && (
                  <tr><td colSpan="8"><Vacio /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers UI
// ──────────────────────────────────────────────────────────────────────

function Card({ title, children }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e3e7ef", borderRadius: 12,
      padding: 16, marginBottom: 14,
    }}>
      <div style={{ fontSize: 11, color: B.muted, letterSpacing: "0.16em", fontWeight: 800, marginBottom: 12 }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, valor, color, big }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e3e7ef", borderRadius: 10,
      padding: "14px 16px", display: "flex", flexDirection: "column",
    }}>
      <div style={{ fontSize: 10, color: B.muted, letterSpacing: "0.18em", fontWeight: 800 }}>
        {label}
      </div>
      <div style={{
        fontSize: big ? 26 : 20, fontWeight: 900,
        color: color || B.navy, marginTop: 4, fontVariantNumeric: "tabular-nums",
        lineHeight: 1.1, wordBreak: "break-all",
      }}>
        {valor}
      </div>
    </div>
  );
}

function Lista({ rows }) {
  if (!rows || rows.length === 0) {
    return <div style={{ padding: 16, textAlign: "center", color: B.muted, fontSize: 13 }}>Sin datos.</div>;
  }
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "1fr auto", gap: 8,
          padding: "8px 10px", background: "#F7F9FC", borderRadius: 5,
          fontSize: 13,
        }}>
          <div>
            <div style={{ fontWeight: 700 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: B.muted, marginTop: 1 }}>{r.sub}</div>
          </div>
          <div style={{ fontWeight: 800, color: B.navy, fontVariantNumeric: "tabular-nums", alignSelf: "center" }}>
            {r.valor}
          </div>
        </div>
      ))}
    </div>
  );
}

function Vacio() {
  return <div style={{ padding: 30, textAlign: "center", color: B.muted, fontSize: 13 }}>Sin ventas en este filtro / rango.</div>;
}

function VentaRowDesktop({ v, expandido, onExpand, onAnular }) {
  const itemsTxt = (v.items || []).map(it => `${it.cantidad}× ${it.nombre}`).join(", ");
  return (
    <>
      <tr style={{ borderTop: "1px solid #f1f3f8", cursor: "pointer" }} onClick={onExpand}>
        <td style={td}>{fmtHora(v.created_at)}</td>
        <td style={td}>{v.caja_id}</td>
        <td style={{ ...td, fontWeight: 600 }}>{v.cajero_nombre || "—"}</td>
        <td style={{ ...td, fontSize: 12, color: B.muted, maxWidth: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {itemsTxt}
        </td>
        <td style={{ ...td, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {COP(v.total)}
          {Number(v.propina) > 0 && (
            <div style={{ fontSize: 10, color: B.muted, fontWeight: 500 }}>+{COP(v.propina)} 💵</div>
          )}
        </td>
        <td style={td}><Tag metodo={v.metodo_pago} pago={v.pago_recibido} /></td>
        <td style={td}><LoggroBadge estado={v.loggro_estado} error={v.loggro_error} /></td>
        <td style={td}>
          <button onClick={(e) => { e.stopPropagation(); onAnular(); }}
            style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 700,
              background: "transparent", color: B.danger, border: `1px solid ${B.danger}`,
              borderRadius: 6, cursor: "pointer",
            }}>Anular</button>
        </td>
      </tr>
      {expandido && (
        <tr style={{ background: "#FFF9E6" }}>
          <td colSpan="8" style={{ padding: "12px 16px", fontSize: 12 }}>
            <DetallesVenta v={v} />
          </td>
        </tr>
      )}
    </>
  );
}

function VentaCardMobile({ v, expandido, onExpand, onAnular }) {
  return (
    <div onClick={onExpand} style={{
      background: "#fff", border: "1px solid #e3e7ef", borderRadius: 10,
      padding: "10px 12px", cursor: "pointer",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{v.cajero_nombre || "—"}</div>
          <div style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>
            {fmtHora(v.created_at)} · {v.caja_id} · {(v.items || []).length} ítems
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 900, color: B.navy, fontVariantNumeric: "tabular-nums" }}>{COP(v.total)}</div>
          <Tag metodo={v.metodo_pago} pago={v.pago_recibido} />
        </div>
      </div>
      {expandido && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e3e7ef" }}>
          <DetallesVenta v={v} />
          <button onClick={(e) => { e.stopPropagation(); onAnular(); }}
            style={{
              marginTop: 10, width: "100%", padding: "8px",
              background: "transparent", color: B.danger, border: `1px solid ${B.danger}`,
              borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>Anular venta</button>
        </div>
      )}
    </div>
  );
}

function DetallesVenta({ v }) {
  return (
    <div>
      <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
        {(v.items || []).map((it, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
            <span>{it.cantidad}× {it.nombre}</span>
            <span style={{ color: B.muted, fontVariantNumeric: "tabular-nums" }}>{COP(it.precio)}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{COP(it.subtotal || it.precio * it.cantidad)}</span>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 6, paddingTop: 6, borderTop: "1px dashed #ccc",
        fontSize: 11, color: B.muted, fontFamily: "monospace",
      }}>
        {v.id} · {fmtFechaHora(v.created_at)}
        {v.pago_recibido?.moneda === "USD" && (
          <span style={{ marginLeft: 10, color: "#0ea5e9", fontWeight: 700 }}>
            USD ${v.pago_recibido.monto} @ {v.pago_recibido.tasa_cambio}
          </span>
        )}
      </div>
    </div>
  );
}

function Tag({ metodo, pago }) {
  const isCash = metodo === "efectivo";
  const isUsd  = pago?.moneda === "USD";
  return (
    <span style={{
      display: "inline-block", marginTop: 2,
      fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10,
      background: isUsd ? "#0ea5e933" : isCash ? B.success + "33" : B.warning + "33",
      color:      isUsd ? "#0369a1"   : isCash ? B.success         : "#92400E",
    }}>
      {isUsd ? "💵 USD" : isCash ? "💵 EFECTIVO" : "💳 TARJETA"}
    </span>
  );
}

function LoggroBadge({ estado, error }) {
  if (!estado) return <span style={{ fontSize: 10, color: B.muted }}>—</span>;
  const map = {
    sent:    { l: "✓ Sent",    c: B.success },
    failed:  { l: "✗ Failed",  c: B.danger },
    pending: { l: "⏳ Pending", c: B.warning },
  };
  const m = map[estado] || { l: estado, c: B.muted };
  return (
    <span title={error || ""} style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
      background: m.c + "22", color: m.c,
    }}>{m.l}</span>
  );
}

const th = { padding: "8px 10px", fontSize: 10, fontWeight: 800, color: B.muted, letterSpacing: "0.1em", textAlign: "left" };
const td = { padding: "8px 10px", verticalAlign: "top" };

function btnSec(color) {
  return {
    padding: "8px 14px", fontSize: 12, fontWeight: 700,
    background: "#fff", color: color, border: `1.5px solid ${color}`,
    borderRadius: 20, cursor: "pointer",
  };
}
