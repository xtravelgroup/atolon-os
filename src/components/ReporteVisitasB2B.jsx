// ReporteVisitasB2B — Reporte global de visitas B2B con filtro por vendedor.
// Muestra: KPIs por vendedor (total visitas, por tipo, por resultado, próximas)
// + tabla detallada de cada visita con vendedor, aliado, fecha, etc.
//
// Fuentes:
//   - b2b_visitas (visitas registradas)
//   - aliados_b2b (nombre del aliado para mostrar en vez del id)
//   - usuarios (lista de vendedores activos para el filtro)

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const fmtFecha = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T12:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};

const TIPO_COLOR = {
  "presencial":     B.success,
  "inspección":     "#a78bfa",
  "llamada":        B.sky,
  "email":          "#22d3ee",
  "whatsapp":       "#10b981",
  "evento":         B.warning,
  "otro":           "rgba(255,255,255,0.4)",
};
const ESTADO_COLOR = {
  "programada":  B.warning,
  "realizada":   B.success,
  "cancelada":   B.danger,
  "no_show":     B.danger,
};

export default function ReporteVisitasB2B() {
  const [loading, setLoading] = useState(true);
  const [visitas, setVisitas] = useState([]);
  const [aliados, setAliados] = useState([]);
  const [vendedores, setVendedores] = useState([]);

  // Filtros
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(); monthStart.setDate(1);
  const [from, setFrom] = useState(monthStart.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [filtroVendedor, setFiltroVendedor] = useState("__todos__");
  const [filtroEstado, setFiltroEstado] = useState("__todos__");
  const [filtroTipo, setFiltroTipo] = useState("__todos__");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [vRes, aRes, uRes] = await Promise.all([
        supabase.from("b2b_visitas").select("*").order("fecha", { ascending: false }),
        supabase.from("aliados_b2b").select("id, nombre, vendedor_id"),
        supabase.from("usuarios").select("id, nombre, email").eq("activo", true).order("nombre"),
      ]);
      setVisitas(vRes.data || []);
      setAliados(aRes.data || []);
      setVendedores(uRes.data || []);
      setLoading(false);
    })();
  }, []);

  const aliadoMap = useMemo(() => {
    const m = {};
    aliados.forEach(a => { m[a.id] = a; });
    return m;
  }, [aliados]);

  // Filtros aplicados
  const filtradas = useMemo(() => {
    return visitas.filter(v => {
      if (from && v.fecha < from) return false;
      if (to   && v.fecha > to)   return false;
      if (filtroVendedor !== "__todos__" && (v.realizada_por || "") !== filtroVendedor) return false;
      if (filtroEstado   !== "__todos__" && v.estado !== filtroEstado) return false;
      if (filtroTipo     !== "__todos__" && v.tipo !== filtroTipo) return false;
      return true;
    });
  }, [visitas, from, to, filtroVendedor, filtroEstado, filtroTipo]);

  // Agrupar por vendedor
  const porVendedor = useMemo(() => {
    const grupos = {};
    filtradas.forEach(v => {
      const vendor = v.realizada_por || "(sin asignar)";
      if (!grupos[vendor]) {
        grupos[vendor] = {
          vendor, total: 0,
          realizadas: 0, programadas: 0, canceladas: 0, noShow: 0,
          presenciales: 0, inspecciones: 0, llamadas: 0, otras: 0,
          aliadosUnicos: new Set(),
          visitas: [],
        };
      }
      const g = grupos[vendor];
      g.total++;
      g.visitas.push(v);
      if (v.aliado_id) g.aliadosUnicos.add(v.aliado_id);
      if (v.estado === "realizada")  g.realizadas++;
      if (v.estado === "programada") g.programadas++;
      if (v.estado === "cancelada")  g.canceladas++;
      if (v.estado === "no_show")    g.noShow++;
      if (v.tipo === "presencial")   g.presenciales++;
      else if (v.tipo === "inspección") g.inspecciones++;
      else if (v.tipo === "llamada") g.llamadas++;
      else                            g.otras++;
    });
    return Object.values(grupos).sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const totales = useMemo(() => ({
    total:        filtradas.length,
    realizadas:   filtradas.filter(v => v.estado === "realizada").length,
    programadas:  filtradas.filter(v => v.estado === "programada").length,
    canceladas:   filtradas.filter(v => v.estado === "cancelada").length,
    aliadosUnicos: new Set(filtradas.map(v => v.aliado_id)).size,
    vendedoresActivos: new Set(filtradas.map(v => v.realizada_por).filter(Boolean)).size,
  }), [filtradas]);

  // Lista única de tipos y estados para los selects (de los datos reales)
  const tiposUnicos   = useMemo(() => Array.from(new Set(visitas.map(v => v.tipo).filter(Boolean))).sort(), [visitas]);
  const estadosUnicos = useMemo(() => Array.from(new Set(visitas.map(v => v.estado).filter(Boolean))).sort(), [visitas]);
  const vendedoresUnicos = useMemo(() => Array.from(new Set(visitas.map(v => v.realizada_por).filter(Boolean))).sort(), [visitas]);

  const setQuickRange = (key) => {
    const t = new Date();
    if (key === "hoy")        { setFrom(today); setTo(today); }
    else if (key === "semana") {
      const lunes = new Date(t); lunes.setDate(t.getDate() - ((t.getDay() + 6) % 7));
      setFrom(lunes.toISOString().slice(0, 10)); setTo(today);
    }
    else if (key === "mes")   {
      const m = new Date(t); m.setDate(1);
      setFrom(m.toISOString().slice(0, 10)); setTo(today);
    }
    else if (key === "trim")  {
      const m = new Date(t); m.setMonth(m.getMonth() - 3);
      setFrom(m.toISOString().slice(0, 10)); setTo(today);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.5)" }}>Cargando reporte de visitas…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: B.sand, margin: 0 }}>📊 Reporte de Visitas B2B</h2>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          {fmtFecha(from)} → {fmtFecha(to)} · {totales.total} visita{totales.total !== 1 ? "s" : ""} · {totales.vendedoresActivos} vendedor{totales.vendedoresActivos !== 1 ? "es" : ""}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={LS}>Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={IS} />
          </div>
          <div>
            <label style={LS}>Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={IS} />
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 1 }}>
            {[["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["trim", "Trimestre"]].map(([k, l]) => (
              <button key={k} onClick={() => setQuickRange(k)}
                style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${B.navyLight}`, background: "transparent", color: B.sand, fontSize: 11, cursor: "pointer" }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div>
            <label style={LS}>Vendedor</label>
            <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={IS}>
              <option value="__todos__">Todos los vendedores</option>
              {vendedoresUnicos.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={LS}>Estado</label>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={IS}>
              <option value="__todos__">Todos</option>
              {estadosUnicos.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={LS}>Tipo</label>
            <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={IS}>
              <option value="__todos__">Todos</option>
              {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs globales */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 20 }}>
        <Kpi label="Total visitas"   valor={totales.total}        color={B.sand} />
        <Kpi label="Realizadas"      valor={totales.realizadas}   color={B.success} />
        <Kpi label="Programadas"     valor={totales.programadas}  color={B.warning} />
        <Kpi label="Canceladas"      valor={totales.canceladas}   color={B.danger} />
        <Kpi label="Aliados visitados" valor={totales.aliadosUnicos} color={B.sky} />
        <Kpi label="Vendedores activos" valor={totales.vendedoresActivos} color="#a78bfa" />
      </div>

      {/* Por vendedor */}
      {porVendedor.length === 0 ? (
        <div style={{ padding: 50, background: B.navyMid, borderRadius: 12, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>📭</div>
          <div>Sin visitas registradas en este período.</div>
          <div style={{ fontSize: 11, marginTop: 8, color: "rgba(255,255,255,0.3)" }}>
            Para registrar una visita: B2B → Aliados → entra a un aliado → tab "Visitas" → + Nueva visita.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {porVendedor.map(g => (
            <VendedorCard key={g.vendor} grupo={g} aliadoMap={aliadoMap} />
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor, color }) {
  return (
    <div style={{ background: B.navyMid, padding: 12, borderRadius: 10, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>{valor}</div>
    </div>
  );
}

function VendedorCard({ grupo, aliadoMap }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
      {/* Header del vendedor — clickeable */}
      <div onClick={() => setOpen(!open)}
        style={{
          padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center",
          cursor: "pointer", borderBottom: open ? `1px solid ${B.navyLight}` : "none",
          background: open ? B.navy : "transparent", transition: "background 0.15s",
        }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
            {grupo.vendor === "(sin asignar)" ? <span style={{ color: B.warning }}>{grupo.vendor}</span> : grupo.vendor}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
            {grupo.aliadosUnicos.size} aliado{grupo.aliadosUnicos.size !== 1 ? "s" : ""} ·{" "}
            <span style={{ color: B.success }}>✓ {grupo.realizadas}</span> ·{" "}
            <span style={{ color: B.warning }}>⏳ {grupo.programadas}</span>
            {grupo.canceladas > 0 && <> · <span style={{ color: B.danger }}>✕ {grupo.canceladas}</span></>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>
              {grupo.total}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>visitas</div>
          </div>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Detalle expandido */}
      {open && (
        <div style={{ padding: "12px 0" }}>
          {/* Mini stats por tipo */}
          <div style={{ display: "flex", gap: 8, padding: "0 18px 12px", flexWrap: "wrap" }}>
            {grupo.presenciales > 0 && <Pill label={`Presencial · ${grupo.presenciales}`} color={B.success} />}
            {grupo.inspecciones > 0 && <Pill label={`Inspección · ${grupo.inspecciones}`} color="#a78bfa" />}
            {grupo.llamadas     > 0 && <Pill label={`Llamada · ${grupo.llamadas}`} color={B.sky} />}
            {grupo.otras        > 0 && <Pill label={`Otras · ${grupo.otras}`} color="rgba(255,255,255,0.4)" />}
          </div>

          {/* Tabla de visitas */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: B.navy }}>
                  <th style={th}>Fecha</th>
                  <th style={{ ...th, textAlign: "left" }}>Aliado</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: "left" }}>Objetivo</th>
                  <th style={{ ...th, textAlign: "left" }}>Resultado</th>
                  <th style={{ ...th, textAlign: "left" }}>Próxima acción</th>
                </tr>
              </thead>
              <tbody>
                {grupo.visitas.map(v => {
                  const aliado = aliadoMap[v.aliado_id];
                  return (
                    <tr key={v.id} style={{ borderTop: `1px solid ${B.navyLight}40` }}>
                      <td style={td}>{fmtFecha(v.fecha)}{v.hora ? <span style={{ color: "rgba(255,255,255,0.4)" }}> · {v.hora}</span> : ""}</td>
                      <td style={{ ...td, color: "#fff", fontWeight: 600 }}>{aliado?.nombre || v.aliado_id || "—"}</td>
                      <td style={td}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: (TIPO_COLOR[v.tipo] || "rgba(255,255,255,0.2)") + "22", color: TIPO_COLOR[v.tipo] || "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 700 }}>
                          {v.tipo || "—"}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: (ESTADO_COLOR[v.estado] || "rgba(255,255,255,0.2)") + "22", color: ESTADO_COLOR[v.estado] || "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 700 }}>
                          {v.estado || "—"}
                        </span>
                      </td>
                      <td style={{ ...td, color: "rgba(255,255,255,0.85)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={v.objetivo || ""}>
                        {v.objetivo || "—"}
                      </td>
                      <td style={{ ...td, color: "rgba(255,255,255,0.85)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={v.resultado || ""}>
                        {v.resultado || "—"}
                      </td>
                      <td style={{ ...td, color: B.warning, fontSize: 11, maxWidth: 160 }} title={v.proxima_accion || ""}>
                        {v.proxima_accion ? (
                          <>
                            {v.proxima_accion}
                            {v.fecha_proxima && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{fmtFecha(v.fecha_proxima)}</div>}
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ label, color }) {
  return (
    <span style={{
      padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
      background: color + "22", color, border: `1px solid ${color}33`,
    }}>{label}</span>
  );
}

const th = { padding: "8px 10px", textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" };
const td = { padding: "9px 10px", color: "rgba(255,255,255,0.7)", verticalAlign: "top" };
const IS = { padding: "8px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 10, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" };
