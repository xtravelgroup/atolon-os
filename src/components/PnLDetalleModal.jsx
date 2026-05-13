// PnLDetalleModal — Drill-down de una línea del P&L.
// Click en una categoría (ingreso/costo/gasto) abre este modal y muestra
// las transacciones reales que dan origen al valor del mes/YTD.
//
// Estrategia: cada categoría tiene un fetcher que sabe qué tabla(s) consultar.
// Si la categoría no tiene fetcher mapeado, muestra mensaje informativo con
// link al módulo Presupuesto para que el contador lo edite manualmente.

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtFecha = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};

// ── Mapping categoria → fuente(s) de datos ───────────────────────────────
// Cada fetcher recibe { year, month, ytd } y retorna {transactions, total, sourcesNote}.
// month es 0-based. Si ytd=true, agrega Ene–month. Si ytd=false, solo el mes.

const FETCHERS = {
  // ═══ INGRESOS ═══
  "Pasadías": async ({ year, month, ytd }) => {
    const { from, to } = rango(year, month, ytd);
    const { data } = await supabase
      .from("reservas")
      .select("id, fecha, nombre, tipo, total, abono, estado, canal, forma_pago")
      .gte("fecha", from).lte("fecha", to)
      .in("estado", ["confirmado", "pagado"])
      .order("fecha", { ascending: false });
    const filtered = (data || []).filter(r => !/(hotel|estancia)/i.test(r.tipo || ""));
    return {
      transactions: filtered.map(r => ({
        fecha: r.fecha, descripcion: `${r.tipo} · ${r.nombre}`,
        monto: Number(r.abono || r.total || 0),
        ref: r.id, source: "reservas", canal: r.canal,
      })),
      sourcesNote: `Reservas con estado "confirmado" o "pagado" excluyendo hotel/estancia.`,
    };
  },

  "Eventos y Grupos": async ({ year, month, ytd }) => {
    const { from, to } = rango(year, month, ytd);
    const { data: eventos } = await supabase
      .from("eventos")
      .select("id, fecha, nombre, total_evento, abonos_total, estado")
      .gte("fecha", from).lte("fecha", to)
      .order("fecha", { ascending: false });
    return {
      transactions: (eventos || []).map(e => ({
        fecha: e.fecha, descripcion: `Evento · ${e.nombre}`,
        monto: Number(e.abonos_total || e.total_evento || 0),
        ref: e.id, source: "eventos",
      })),
      sourcesNote: `Tabla eventos — usa abonos_total cuando hay, si no total_evento.`,
    };
  },

  "Alimentos y Bebidas": async ({ year, month, ytd }) => {
    const { from, to } = rango(year, month, ytd);
    const { data } = await supabase
      .from("cierre_caja_dia")
      .select("fecha, total_ventas, ventas_netas, ventas_brutas, sede")
      .gte("fecha", from).lte("fecha", to)
      .order("fecha", { ascending: false });
    return {
      transactions: (data || []).map(c => ({
        fecha: c.fecha, descripcion: `Cierre caja${c.sede ? " · " + c.sede : ""}`,
        monto: Number(c.ventas_netas || c.total_ventas || c.ventas_brutas || 0),
        ref: c.fecha, source: "cierre_caja_dia",
      })),
      sourcesNote: `Cierre de caja diario (POS Loggro). Usa ventas_netas si existe.`,
    };
  },

  // ═══ COSTOS Y GASTOS ═══
  "Costo Pasadías": async ({ year, month, ytd }) =>
    combinarFuentes([
      await ocPorCategoria(year, month, ytd, ["pasadia", "lancha", "combustible", "marina"]),
      await lanchaCostosPorMes(year, month, ytd, ["combustible", "marina", "capitanes"]),
    ]),

  "Costo A&B": async ({ year, month, ytd }) =>
    ocPorCategoria(year, month, ytd, ["a&b", "alimentos", "bebidas", "cocina", "bar"]),

  "Costo Eventos y Grupos": async ({ year, month, ytd }) =>
    ocPorCategoria(year, month, ytd, ["evento", "grupo"]),

  "Nómina": async ({ year, month, ytd }) => {
    const { from, to } = rango(year, month, ytd);
    const { data } = await supabase
      .from("nomina")
      .select("id, fecha_pago, empleado_nombre, total_pago, periodo")
      .gte("fecha_pago", from).lte("fecha_pago", to)
      .order("fecha_pago", { ascending: false });
    return {
      transactions: (data || []).map(n => ({
        fecha: n.fecha_pago, descripcion: `${n.empleado_nombre || "—"}${n.periodo ? " · " + n.periodo : ""}`,
        monto: Number(n.total_pago || 0), ref: n.id, source: "nomina",
      })),
      sourcesNote: `Tabla nomina — pagos a colaboradores fijos.`,
    };
  },

  "Nómina (Por Día)": async ({ year, month, ytd }) => {
    const { from, to } = rango(year, month, ytd);
    const { data } = await supabase
      .from("nomina_dia")
      .select("id, fecha, empleado_nombre, total_pago, descripcion")
      .gte("fecha", from).lte("fecha", to)
      .order("fecha", { ascending: false });
    return {
      transactions: (data || []).map(n => ({
        fecha: n.fecha, descripcion: `${n.empleado_nombre || "—"}${n.descripcion ? " · " + n.descripcion : ""}`,
        monto: Number(n.total_pago || 0), ref: n.id, source: "nomina_dia",
      })),
      sourcesNote: `Tabla nomina_dia — pagos diarios (jornales).`,
    };
  },

  "Mantenimiento":     ({ year, month, ytd }) => pagosOtrosPorCat(year, month, ytd, ["mantenim", "reparacion"]),
  "Marketing":         ({ year, month, ytd }) => pagosOtrosPorCat(year, month, ytd, ["marketing", "publicidad"]),
  "Parqueo Lanchas":   async ({ year, month, ytd }) => lanchaCostosPorMes(year, month, ytd, ["marina"]),
  "Combustible Castillete": async ({ year, month, ytd }) => lanchaCostosPorMes(year, month, ytd, ["combustible"], "Castillete"),
  "Servicios":         ({ year, month, ytd }) => pagosOtrosPorCat(year, month, ytd, ["servicio", "agua", "luz", "internet"]),
  "Entretenimiento":   ({ year, month, ytd }) => pagosOtrosPorCat(year, month, ytd, ["entretenim"]),
  "Software":          ({ year, month, ytd }) => pagosOtrosPorCat(year, month, ytd, ["software", "saas", "licencia"]),
  "Suministros":       ({ year, month, ytd }) => pagosOtrosPorCat(year, month, ytd, ["suministros", "papeleria", "limpieza"]),
  "Comunidad":         ({ year, month, ytd }) => pagosOtrosPorCat(year, month, ytd, ["comunidad", "rse"]),
  "Contratistas":      ({ year, month, ytd }) => pagosOtrosPorCat(year, month, ytd, ["contratista", "freelance"]),
  "Comisiones":        async ({ year, month, ytd }) => fetchComisiones(year, month, ytd),
  "Comisiones B2B":    async ({ year, month, ytd }) => fetchComisiones(year, month, ytd),

  // Aliases para Financiero
  "Grupos":   async ({ year, month, ytd }) => fetchEventos(year, month, ytd, "grupo"),
  "Eventos":  async ({ year, month, ytd }) => fetchEventos(year, month, ytd, "evento"),
  "Alimentos y Bebidas (Loggro)": async (p) => FETCHERS["Alimentos y Bebidas"](p),
  "Pasadías (Caja)":  async ({ year, month, ytd }) => fetchCierresPorArea(year, month, ytd, "pasadias"),
  "After Island":     async ({ year, month, ytd }) => fetchCierresPorArea(year, month, ytd, "after_island"),
  "Otros (Caja)":     async ({ year, month, ytd }) => fetchCierresPorArea(year, month, ytd, "otros"),
};

async function fetchComisiones(year, month, ytd) {
  const { from, to } = rango(year, month, ytd);
  const { data } = await supabase
    .from("comisiones_semanas")
    .select("id, aliado_nombre, monto_comision, semana_inicio, semana_fin, estado, ejecutado_at, pago_metodo, pago_referencia")
    .gte("ejecutado_at", from + "T00:00:00").lte("ejecutado_at", to + "T23:59:59")
    .order("ejecutado_at", { ascending: false });
  return {
    transactions: (data || []).map(c => ({
      fecha: (c.ejecutado_at || "").slice(0, 10),
      descripcion: `${c.aliado_nombre} · sem ${c.semana_inicio?.slice(5)}–${c.semana_fin?.slice(5)}${c.pago_referencia ? " · " + c.pago_referencia : ""}`,
      monto: Number(c.monto_comision || 0), ref: c.id, source: "comisiones_semanas",
    })),
    sourcesNote: `Comisiones ejecutadas (pagadas) en el período.`,
  };
}

async function fetchEventos(year, month, ytd, categoria) {
  const { from, to } = rango(year, month, ytd);
  const { data } = await supabase
    .from("eventos")
    .select("id, fecha, nombre, total_evento, abonos_total, estado, categoria, stage, aliado_id")
    .gte("fecha", from).lte("fecha", to)
    .eq("categoria", categoria)
    .order("fecha", { ascending: false });
  return {
    transactions: (data || []).map(e => ({
      fecha: e.fecha,
      descripcion: `${categoria === "grupo" ? "Grupo" : "Evento"} · ${e.nombre}${e.aliado_id ? " · B2B" : ""}`,
      monto: Number(e.abonos_total || e.total_evento || 0),
      ref: e.id, source: "eventos",
    })),
    sourcesNote: `Tabla eventos filtrado por categoria='${categoria}'.`,
  };
}

async function fetchCierresPorArea(year, month, ytd, area) {
  const { from, to } = rango(year, month, ytd);
  const { data } = await supabase
    .from("cierre_caja_dia")
    .select("fecha, total_ventas, ventas_netas, ventas_brutas, area, sede")
    .gte("fecha", from).lte("fecha", to)
    .eq("area", area)
    .order("fecha", { ascending: false });
  return {
    transactions: (data || []).map(c => ({
      fecha: c.fecha,
      descripcion: `Caja · ${area}${c.sede ? " · " + c.sede : ""}`,
      monto: Number(c.ventas_netas || c.total_ventas || c.ventas_brutas || 0),
      ref: c.fecha, source: "cierre_caja_dia",
    })),
    sourcesNote: `Cierres de caja con area='${area}'.`,
  };
}

// Fallback genérico: si la categoría no tiene fetcher mapeado, busca en
// requisiciones (módulo Financiero usa requisiciones para gastos por
// categoría) Y en pagos_otros (otras fuentes), unificando los resultados.
async function fetchPagosOtrosGenerico(year, month, ytd, label) {
  const { from, to } = rango(year, month, ytd);

  // 1) Requisiciones (fuente principal de gastos en Financiero P&L)
  const { data: reqs } = await supabase
    .from("requisiciones")
    .select("id, fecha, descripcion, categoria, total, estado")
    .gte("fecha", from).lte("fecha", to)
    .ilike("categoria", label)
    .order("fecha", { ascending: false });

  // 2) Pagos otros (categorías ad-hoc fuera de requisiciones)
  const { data: pagos } = await supabase
    .from("pagos_otros")
    .select("id, fecha, concepto, categoria, proveedor, monto")
    .gte("fecha", from).lte("fecha", to)
    .ilike("categoria", label)
    .order("fecha", { ascending: false });

  const transactions = [
    ...(reqs || []).map(r => ({
      fecha: r.fecha,
      descripcion: `Req ${r.id} · ${r.descripcion || "—"}${r.estado ? " · " + r.estado : ""}`,
      monto: Number(r.total || 0), ref: r.id, source: "requisiciones",
    })),
    ...(pagos || []).map(p => ({
      fecha: p.fecha,
      descripcion: `${p.concepto || "—"}${p.proveedor ? " · " + p.proveedor : ""}`,
      monto: Number(p.monto || 0), ref: p.id, source: "pagos_otros",
    })),
  ].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  return {
    transactions,
    sourcesNote: `requisiciones + pagos_otros donde categoria ilike "${label}".`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function rango(year, monthIdx, ytd) {
  const pad = n => String(n).padStart(2, "0");
  if (ytd) {
    const from = `${year}-01-01`;
    const last = lastDay(year, monthIdx);
    const to = `${year}-${pad(monthIdx + 1)}-${pad(last)}`;
    return { from, to };
  }
  const from = `${year}-${pad(monthIdx + 1)}-01`;
  const to   = `${year}-${pad(monthIdx + 1)}-${pad(lastDay(year, monthIdx))}`;
  return { from, to };
}
function lastDay(y, m) { return new Date(y, m + 1, 0).getDate(); }

async function ocPorCategoria(year, month, ytd, keywords) {
  const { from, to } = rango(year, month, ytd);
  // OCs con factura aplicada o pagadas en el período
  const { data } = await supabase
    .from("ordenes_compra")
    .select("id, codigo, proveedor_nombre, total, fecha_emision, pagada_at, items, factura_aplicada")
    .gte("fecha_emision", from).lte("fecha_emision", to)
    .order("fecha_emision", { ascending: false });
  const matches = (data || []).filter(o => {
    const itemsTxt = JSON.stringify(o.items || []).toLowerCase();
    const provTxt = (o.proveedor_nombre || "").toLowerCase();
    return keywords.some(k => itemsTxt.includes(k) || provTxt.includes(k));
  });
  return {
    transactions: matches.map(o => ({
      fecha: o.fecha_emision,
      descripcion: `OC ${o.codigo} · ${o.proveedor_nombre || "—"}`,
      monto: Number(o.total || 0), ref: o.id, source: "ordenes_compra",
    })),
    sourcesNote: `Órdenes de compra con items o proveedor que matchean: ${keywords.join(", ")}.`,
  };
}

async function pagosOtrosPorCat(year, month, ytd, keywords) {
  const { from, to } = rango(year, month, ytd);
  const { data } = await supabase
    .from("pagos_otros")
    .select("id, fecha, concepto, categoria, proveedor, monto, pagado")
    .gte("fecha", from).lte("fecha", to)
    .order("fecha", { ascending: false });
  const matches = (data || []).filter(p => {
    const txt = ((p.categoria || "") + " " + (p.concepto || "")).toLowerCase();
    return keywords.some(k => txt.includes(k));
  });
  return {
    transactions: matches.map(p => ({
      fecha: p.fecha,
      descripcion: `${p.concepto || "—"}${p.proveedor ? " · " + p.proveedor : ""}`,
      monto: Number(p.monto || 0), ref: p.id, source: "pagos_otros",
    })),
    sourcesNote: `Tabla pagos_otros con categoría/concepto que matchea: ${keywords.join(", ")}.`,
  };
}

async function lanchaCostosPorMes(year, month, ytd, tipos, lanchaNombre) {
  const { from, to } = rango(year, month, ytd);
  let q = supabase
    .from("lancha_bitacora")
    .select("id, fecha, lancha_id, tipo, descripcion, costo_total")
    .gte("fecha", from).lte("fecha", to);
  if (tipos?.length) q = q.in("tipo", tipos);
  const { data } = await q.order("fecha", { ascending: false });
  let rows = data || [];
  if (lanchaNombre) {
    rows = rows.filter(r => (r.lancha_id || "").toLowerCase().includes(lanchaNombre.toLowerCase()));
  }
  return {
    transactions: rows.map(b => ({
      fecha: b.fecha,
      descripcion: `${b.tipo}${b.lancha_id ? " · " + b.lancha_id.replace("LCH-", "") : ""}${b.descripcion ? " · " + b.descripcion : ""}`,
      monto: Number(b.costo_total || 0), ref: b.id, source: "lancha_bitacora",
    })),
    sourcesNote: `Bitácora de lanchas (combustible/marina/mantenimiento).`,
  };
}

function combinarFuentes(results) {
  const transactions = [];
  const sourcesNotes = [];
  results.forEach(r => {
    if (r.transactions) transactions.push(...r.transactions);
    if (r.sourcesNote) sourcesNotes.push(r.sourcesNote);
  });
  transactions.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  return { transactions, sourcesNote: sourcesNotes.join(" · ") };
}

// ── Componente ───────────────────────────────────────────────────────────
export default function PnLDetalleModal({ categoria, tipo, year, month, ytd = false, onClose }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ transactions: [], sourcesNote: "" });
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      const fetcher = FETCHERS[categoria];
      try {
        let result;
        if (fetcher) {
          result = await fetcher({ year, month, ytd });
        } else if (tipo === "gasto" || tipo === "costo") {
          // Fallback: buscar la categoría en pagos_otros
          result = await fetchPagosOtrosGenerico(year, month, ytd, categoria);
        } else {
          result = { transactions: [], sourcesNote: "" };
        }
        setData(result);
      } catch (e) {
        console.error("[PnLDetalle] error:", e);
        setErr(e?.message || String(e));
      }
      setLoading(false);
    })();
  }, [categoria, year, month, ytd]);

  const total = data.transactions.reduce((s, t) => s + Number(t.monto || 0), 0);
  const periodoLabel = ytd
    ? `YTD Ene–${["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][month]} ${year}`
    : `${["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][month]} ${year}`;
  const tipoColor = tipo === "ingreso" ? B.success : tipo === "costo" ? B.pink : B.warning;
  const tipoLabel = tipo === "ingreso" ? "Ingreso" : tipo === "costo" ? "Costo" : "Gasto";

  return (
    <div onClick={e => e.target === e.currentTarget && onClose?.()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, width: "100%", maxWidth: 920, maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${B.navyLight}`, background: B.navy, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: tipoColor + "22", color: tipoColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {tipoLabel}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{categoria}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              📅 {periodoLabel}
            </div>
          </div>
          <button onClick={() => onClose?.()}
            style={{ background: "transparent", border: "none", color: "#fff", fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Contenido */}
        <div style={{ padding: 24 }}>
          {loading && <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Cargando transacciones…</div>}

          {!loading && err && (
            <div style={{ padding: 16, background: B.danger + "22", color: B.danger, borderRadius: 8, fontSize: 13 }}>
              ⚠ {err}
            </div>
          )}

          {!loading && !err && !FETCHERS[categoria] && tipo === "ingreso" && data.transactions.length === 0 && (
            <div style={{ padding: 24, background: B.warning + "11", border: `1px solid ${B.warning}44`, borderRadius: 10, color: "rgba(255,255,255,0.8)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: B.warning, marginBottom: 6 }}>
                Sin drill-down configurado para esta categoría
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                "{categoria}" no tiene fuente de datos automática mapeada. Los valores actuales se ingresan manualmente. Dime qué tabla/criterio quieres usar y lo agrego.
              </div>
            </div>
          )}

          {!loading && !err && data.transactions.length === 0 && (FETCHERS[categoria] || tipo !== "ingreso") && (
            <div style={{ padding: 24, background: B.navy, borderRadius: 10, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>📭</div>
              <div style={{ fontSize: 13 }}>No se encontraron transacciones para este período en las fuentes configuradas.</div>
              {data.sourcesNote && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>{data.sourcesNote}</div>}
            </div>
          )}

          {!loading && !err && data.transactions.length > 0 && (
            <>
              {/* Resumen */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: B.navy, borderRadius: 8, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Total transacciones</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{data.transactions.length}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Total $</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: tipoColor, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {COP(total)}
                  </div>
                </div>
              </div>

              {/* Tabla */}
              <div style={{ background: B.navy, borderRadius: 8, overflow: "auto", border: `1px solid ${B.navyLight}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: B.navyLight }}>
                      <th style={th}>Fecha</th>
                      <th style={{ ...th, textAlign: "left" }}>Descripción</th>
                      <th style={th}>Fuente</th>
                      <th style={{ ...th, textAlign: "right" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((t, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                        <td style={td}>{fmtFecha(t.fecha)}</td>
                        <td style={{ ...td, color: "#fff" }}>{t.descripcion}</td>
                        <td style={{ ...td, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{t.source}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: tipoColor }}>{COP(t.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.sourcesNote && (
                <div style={{ marginTop: 12, padding: 10, background: B.navy, border: `1px dashed ${B.navyLight}`, borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  ℹ️ {data.sourcesNote}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => onClose?.()}
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" };
const td = { padding: "8px 10px", color: "rgba(255,255,255,0.7)", verticalAlign: "top" };
