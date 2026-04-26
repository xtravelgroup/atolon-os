import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { B, COP, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { logAccion } from "../lib/logAccion";

const IS = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: B.navy, border: `1px solid rgba(255,255,255,0.1)`,
  color: "#fff", fontSize: 13, outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
};
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const AREAS = [
  { key: "ayb",      label: "A&B",      icon: "🍽️", desc: "Alimentos y Bebidas" },
  { key: "pasadias", label: "Pasadías", icon: "🏖️", desc: "VIP · Exclusive · After Island · Todos los tipos" },
  { key: "otros",    label: "Otros",    icon: "📦", desc: "Otro punto de venta" },
];

// Mapeo forma_pago de reservas → método de cierre de caja (Pasadías: solo Datáfono y Efectivo)
const FORMA_TO_METODO = {
  "Efectivo":  "efectivo",
  "Datáfono":  "datafono",
};

// Métodos visibles por área
const METODOS_PASADIAS = ["datafono", "efectivo"];

const METODOS = [
  { key: "datafono",      label: "Datáfono",      icon: "💳" },
  { key: "efectivo",      label: "Efectivo",       icon: "💵" },
  { key: "link_pago",     label: "Link de Pago",   icon: "🔗" },
  { key: "resort_credit", label: "Resort Credit",  icon: "🏨" },
  { key: "transferencia", label: "Transferencia",  icon: "🏦" },
  { key: "otros",         label: "Otros",          icon: "➕" },
];

function parseCOP(v) { return parseInt(String(v).replace(/[^0-9-]/g, ""), 10) || 0; }
function fmtFecha(d) {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

// ─── Historial de Cierres ─────────────────────────────────────────────────────
function HistorialCierres({ refresh, area, userRol, userPermisos = [] }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editCierre, setEditCierre] = useState(null); // cierre being edited
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const canEdit = userRol === "super_admin";
  // Loggro visible para: admin/gerente/contabilidad por rol, O usuarios con
  // permiso explícito 'ver_loggro_caja' (otorgado individualmente)
  const canSeeLoggro = /admin|gerente|contab/i.test(String(userRol || ""))
    || (Array.isArray(userPermisos) && userPermisos.includes("ver_loggro_caja"));

  // Cache de consultas Loggro por fecha { "YYYY-MM-DD": { loading, data, error } }
  const [loggroByDate, setLoggroByDate] = useState({});

  // Mapea paymentMethodValue de Loggro → key interno de cierre
  const LOGGRO_METODO_MAP = {
    "Datafono": "datafono", "Datáfono": "datafono", "Tarjeta": "datafono",
    "Efectivo": "efectivo", "Cash": "efectivo",
    "Link de Pago": "link_pago", "Link": "link_pago",
    "Transferencia": "transferencia", "Resort Credit": "resort_credit",
  };

  const fetchLoggroCierre = async (fecha) => {
    if (!fecha || loggroByDate[fecha]) return;
    setLoggroByDate(prev => ({ ...prev, [fecha]: { loading: true } }));
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/cierre-caja?fecha=${fecha}`,
        {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error consultando Loggro");
      setLoggroByDate(prev => ({ ...prev, [fecha]: { loading: false, data } }));
    } catch (e) {
      setLoggroByDate(prev => ({ ...prev, [fecha]: { loading: false, error: e.message } }));
    }
  };

  const startEdit = (c) => {
    setEditCierre(c);
    setEditForm({
      fecha: c.fecha || "",
      cajero_nombre: c.cajero_nombre || "",
      numero_caja: c.numero_caja || "",
      numero_comprobante: c.numero_comprobante || "",
      notas: c.notas || "",
      efectivo_contado: c.efectivo_contado || 0,
      metodos: JSON.parse(JSON.stringify(c.metodos || {})),
    });
  };

  const saveEdit = async () => {
    if (!supabase || !editCierre) return;
    setEditSaving(true);
    // Recalculate totals from edited metodos
    let totalVentas = 0, totalPropinas = 0;
    Object.values(editForm.metodos || {}).forEach(v => {
      if (typeof v === "object" && v !== null) {
        totalVentas   += Number(v.venta) || 0;
        totalPropinas += Number(v.propina) || 0;
      }
    });
    const totalGeneral = totalVentas + totalPropinas;
    const efectivoData = editForm.metodos?.efectivo || {};
    const efectivoEsperado = (Number(efectivoData.venta) || 0) + (Number(efectivoData.propina) || 0);
    const efectivoContado  = Number(editForm.efectivo_contado) || 0;
    const diferencia = efectivoContado - efectivoEsperado;

    const payload = {
      fecha: editForm.fecha,
      cajero_nombre: editForm.cajero_nombre,
      numero_caja: editForm.numero_caja || null,
      numero_comprobante: editForm.numero_comprobante || null,
      notas: editForm.notas || null,
      metodos: editForm.metodos,
      total_ventas: totalVentas,
      total_propinas: totalPropinas,
      total_general: totalGeneral,
      efectivo_esperado: efectivoEsperado,
      efectivo_contado: efectivoContado,
      diferencia,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("cierres_caja").update(payload).eq("id", editCierre.id);
    setEditSaving(false);
    if (error) return alert("Error actualizando cierre: " + error.message);
    await logAccion({ modulo: "cierre_caja", accion: "editar_cierre", tabla: "cierres_caja", registroId: editCierre.id,
      datosAntes: { total_ventas: editCierre.total_ventas, total_propinas: editCierre.total_propinas },
      datosDespues: payload, notas: "Editado por super_admin" });
    setEditCierre(null);
    load();
  };

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    let q = supabase.from("cierres_caja").select("*").order("created_at", { ascending: false }).limit(50);
    if (area) q = q.eq("area", area);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  }, [area]);

  useEffect(() => { load(); }, [load, refresh]);

  if (loading) return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "20px 0" }}>Cargando historial…</div>;
  if (rows.length === 0) return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "20px 0" }}>Sin cierres registrados.</div>;

  const AREA_LABEL = Object.fromEntries(AREAS.map(a => [a.key, a.label]));
  const AREA_ICON  = Object.fromEntries(AREAS.map(a => [a.key, a.icon]));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {["Fecha", "Área", "Cajero", "Caja", "No. Comp.", "Total Vtas.", "Propinas", "Total", "Efect. Dif.", ""].map(h => (
              <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const dif = c.diferencia || 0;
            const difColor = dif === 0 ? "#4ade80" : dif < 0 ? "#f87171" : "#fbbf24";
            const isExp = expanded === c.id;
            const metodos = c.metodos || {};
            return (
              <>
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                  onClick={() => {
                    const newExp = isExp ? null : c.id;
                    setExpanded(newExp);
                    if (newExp && canSeeLoggro && c.area === "ayb" && c.fecha) fetchLoggroCierre(c.fecha);
                  }}>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap", color: "rgba(255,255,255,0.7)" }}>{fmtFecha(c.fecha)}</td>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                    {AREA_ICON[c.area] || "📦"} <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{AREA_LABEL[c.area] || c.area || "—"}</span>
                  </td>
                  <td style={{ padding: "9px 10px", fontWeight: 600 }}>{c.cajero_nombre || "—"}</td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{c.numero_caja || "—"}</td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{c.numero_comprobante || "—"}</td>
                  <td style={{ padding: "9px 10px", color: B.sky, fontWeight: 600 }}>{COP(c.total_ventas || 0)}</td>
                  <td style={{ padding: "9px 10px", color: B.sand }}>{COP(c.total_propinas || 0)}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 700 }}>{COP(c.total_general || 0)}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 700, color: difColor }}>
                    {dif >= 0 ? "+" : ""}{COP(dif)}
                  </td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{isExp ? "▲" : "▼"}</td>
                </tr>
                {isExp && (
                  <tr key={`${c.id}-exp`} style={{ background: "rgba(255,255,255,0.02)" }}>
                    <td colSpan={10} style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                        {/* Métodos */}
                        <div style={{ flex: 2, minWidth: 280 }}>
                          <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Detalle por método</div>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                <th style={{ padding: "4px 8px", textAlign: "left", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Método</th>
                                <th style={{ padding: "4px 8px", textAlign: "right", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Venta</th>
                                <th style={{ padding: "4px 8px", textAlign: "right", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Propina</th>
                                <th style={{ padding: "4px 8px", textAlign: "right", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(metodos).filter(([, v]) => (v.venta || v.propina)).map(([k, v]) => (
                                <tr key={k} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                  <td style={{ padding: "5px 8px", color: "rgba(255,255,255,0.6)" }}>
                                    {METODOS.find(m => m.key === k)?.label || k}
                                  </td>
                                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{COP(v.venta || 0)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: B.sand }}>{COP(v.propina || 0)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{COP((v.venta || 0) + (v.propina || 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Meta */}
                        <div style={{ flex: 1, minWidth: 180, fontSize: 12 }}>
                          <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Info del cierre</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "rgba(255,255,255,0.5)" }}>
                            <div><span style={{ color: "rgba(255,255,255,0.3)" }}>Usuario: </span>{c.usuario_email}</div>
                            <div><span style={{ color: "rgba(255,255,255,0.3)" }}>Efect. esperado: </span>{COP(c.efectivo_esperado || 0)}</div>
                            <div><span style={{ color: "rgba(255,255,255,0.3)" }}>Efect. contado: </span>{COP(c.efectivo_contado || 0)}</div>
                            {c.notas && <div><span style={{ color: "rgba(255,255,255,0.3)" }}>Notas: </span>{c.notas}</div>}
                            {c.comprobante_url && (
                              <a href={c.comprobante_url} target="_blank" rel="noopener noreferrer"
                                style={{ color: B.sky, textDecoration: "none", marginTop: 4 }}>
                                📎 Ver comprobante
                              </a>
                            )}
                            {canEdit && (
                              <button onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                                style={{ marginTop: 10, background: B.sky + "22", border: `1px solid ${B.sky}`, borderRadius: 8, color: B.sky, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                ✏️ Editar cierre
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── Comparativo vs Loggro (solo super_admin / contabilidad / gerente_general, área A&B) ── */}
                      {canSeeLoggro && c.area === "ayb" && (() => {
                        const lg = loggroByDate[c.fecha];
                        if (!lg) return null;
                        if (lg.loading) return (
                          <div style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>⏳ Cargando data de Loggro…</div>
                        );
                        if (lg.error) return (
                          <div style={{ marginTop: 16, background: "#f8717115", border: "1px solid #f8717133", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#fca5a5" }}>
                            Error Loggro: {lg.error}
                          </div>
                        );
                        const data = lg.data;

                        // Agrupar por key interno
                        const lgPorKey = {}; const sinMapear = [];
                        for (const [nombre, info] of Object.entries(data.por_metodo || {})) {
                          const key = LOGGRO_METODO_MAP[nombre];
                          const v = Number(info.ventas) || 0, p = Number(info.propinas) || 0;
                          if (key) {
                            if (!lgPorKey[key]) lgPorKey[key] = { venta: 0, propina: 0 };
                            lgPorKey[key].venta += v;
                            lgPorKey[key].propina += p;
                          } else {
                            sinMapear.push({ nombre, venta: v, propina: p });
                          }
                        }

                        const caj = c.metodos || {};
                        const rowsCmp = METODOS.filter(m => m.key !== "otros").map(m => {
                          const caV = Number(caj[m.key]?.venta) || 0;
                          const caP = Number(caj[m.key]?.propina) || 0;
                          const lgV = Number(lgPorKey[m.key]?.venta) || 0;
                          const lgP = Number(lgPorKey[m.key]?.propina) || 0;
                          return { key: m.key, label: m.label, icon: m.icon, caV, caP, lgV, lgP };
                        }).filter(r => r.caV || r.caP || r.lgV || r.lgP);

                        const lgTotalV = Number(data.resumen?.total_ventas) || 0;
                        const lgTotalP = Number(data.resumen?.total_propinas) || 0;
                        const caTotalV = Number(c.total_ventas) || 0;
                        const caTotalP = Number(c.total_propinas) || 0;
                        const difV = caTotalV - lgTotalV;
                        const difP = caTotalP - lgTotalP;
                        const clr = (d) => d === 0 ? "#4ade80" : Math.abs(d) < 5000 ? "#fbbf24" : "#f87171";
                        const fmtDif = (d) => (d >= 0 ? "+" : "") + COP(d);

                        return (
                          <div style={{ marginTop: 18, borderTop: "1px dashed rgba(142,202,230,0.2)", paddingTop: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                              <div style={{ fontSize: 10, color: B.sky, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
                                📊 Comparativo: Cajero vs Loggro
                              </div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{(data.facturas || []).length} facturas en Loggro</div>
                            </div>

                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                  <th style={{ padding: "4px 8px", textAlign: "left", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Método</th>
                                  <th colSpan={2} style={{ padding: "4px 8px", textAlign: "center", color: "rgba(255,255,255,0.45)", fontWeight: 700, borderLeft: "1px solid rgba(255,255,255,0.05)" }}>Cajero</th>
                                  <th colSpan={2} style={{ padding: "4px 8px", textAlign: "center", color: B.sky, fontWeight: 700, borderLeft: "1px solid rgba(255,255,255,0.05)" }}>Loggro</th>
                                  <th colSpan={2} style={{ padding: "4px 8px", textAlign: "center", color: B.sand, fontWeight: 700, borderLeft: "1px solid rgba(255,255,255,0.05)" }}>Diferencia</th>
                                </tr>
                                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                                  <th></th>
                                  <th style={{ padding: "2px 8px", textAlign: "right", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>Venta</th>
                                  <th style={{ padding: "2px 8px", textAlign: "right" }}>Prop.</th>
                                  <th style={{ padding: "2px 8px", textAlign: "right", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>Venta</th>
                                  <th style={{ padding: "2px 8px", textAlign: "right" }}>Prop.</th>
                                  <th style={{ padding: "2px 8px", textAlign: "right", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>Venta</th>
                                  <th style={{ padding: "2px 8px", textAlign: "right" }}>Prop.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rowsCmp.map(r => {
                                  const dV = r.caV - r.lgV, dP = r.caP - r.lgP;
                                  return (
                                    <tr key={r.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                      <td style={{ padding: "5px 8px", color: "rgba(255,255,255,0.65)" }}>{r.icon} {r.label}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>{COP(r.caV)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: "rgba(255,255,255,0.55)" }}>{COP(r.caP)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: B.sky, borderLeft: "1px solid rgba(255,255,255,0.05)" }}>{COP(r.lgV)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: B.sky + "aa" }}>{COP(r.lgP)}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: clr(dV), fontWeight: 700, borderLeft: "1px solid rgba(255,255,255,0.05)" }}>{dV !== 0 ? fmtDif(dV) : "—"}</td>
                                      <td style={{ padding: "5px 8px", textAlign: "right", color: clr(dP), fontWeight: 700 }}>{dP !== 0 ? fmtDif(dP) : "—"}</td>
                                    </tr>
                                  );
                                })}
                                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", fontWeight: 800 }}>
                                  <td style={{ padding: "6px 8px", color: "#fff" }}>TOTAL</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", borderLeft: "1px solid rgba(255,255,255,0.05)" }}>{COP(caTotalV)}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{COP(caTotalP)}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", color: B.sky, borderLeft: "1px solid rgba(255,255,255,0.05)" }}>{COP(lgTotalV)}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", color: B.sky }}>{COP(lgTotalP)}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", color: clr(difV), borderLeft: "1px solid rgba(255,255,255,0.05)" }}>{fmtDif(difV)}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", color: clr(difP) }}>{fmtDif(difP)}</td>
                                </tr>
                              </tbody>
                            </table>

                            {sinMapear.length > 0 && (
                              <div style={{ marginTop: 8, fontSize: 10, color: "rgba(251,191,36,0.7)" }}>
                                ⚠️ Métodos de Loggro sin mapear: {sinMapear.map(s => `${s.nombre} (${COP(s.venta)})`).join(" · ")}
                              </div>
                            )}

                            {/* Facturas del día */}
                            {(data.facturas || []).length > 0 && (
                              <details style={{ marginTop: 10 }}>
                                <summary style={{ cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
                                  Ver {data.facturas.length} facturas del día en Loggro
                                </summary>
                                <div style={{ marginTop: 8, maxHeight: 280, overflowY: "auto", fontSize: 10 }}>
                                  {[...data.facturas].sort((a, b) => (a.hora || "").localeCompare(b.hora || "")).map(f => (
                                    <div key={f.id} style={{
                                      display: "grid", gridTemplateColumns: "70px 1fr 110px 110px 90px",
                                      gap: 8, padding: "4px 4px",
                                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                                      background: f.closeToMidnight ? "rgba(251,191,36,0.08)" : "transparent",
                                    }}>
                                      <span style={{ color: f.closeToMidnight ? "#fbbf24" : "rgba(255,255,255,0.5)", fontWeight: f.closeToMidnight ? 700 : 400 }}>
                                        {f.closeToMidnight ? "⚠️ " : ""}{f.hora}
                                      </span>
                                      <span style={{ color: "rgba(255,255,255,0.8)" }}>#{f.numero}{f.cliente && ` · ${f.cliente}`}</span>
                                      <span style={{ color: "rgba(255,255,255,0.4)" }}>{f.cajero || "—"}</span>
                                      <span style={{ color: "rgba(255,255,255,0.4)" }}>{f.metodo || "—"}</span>
                                      <span style={{ color: "#fff", fontWeight: 700, textAlign: "right" }}>{COP((f.total || 0) + (f.tip || 0))}</span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}

                            <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                              P/L y reportes de A&B usan los datos de Loggro (facturación oficial).
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>

      {/* ── Modal Editar Cierre (super_admin) ── */}
      {editCierre && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, overflowY: "auto" }}
          onClick={e => e.target === e.currentTarget && setEditCierre(null)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: B.white }}>✏️ Editar Cierre — {fmtFecha(editCierre.fecha)}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={LS}>Fecha</label><input type="date" value={editForm.fecha} onChange={e => setEditForm(f => ({ ...f, fecha: e.target.value }))} style={IS} /></div>
              <div><label style={LS}>Cajero</label><input value={editForm.cajero_nombre} onChange={e => setEditForm(f => ({ ...f, cajero_nombre: e.target.value }))} style={IS} /></div>
              <div><label style={LS}>No. Caja</label><input value={editForm.numero_caja||""} onChange={e => setEditForm(f => ({ ...f, numero_caja: e.target.value }))} style={IS} /></div>
              <div><label style={LS}>No. Comprobante</label><input value={editForm.numero_comprobante||""} onChange={e => setEditForm(f => ({ ...f, numero_comprobante: e.target.value }))} style={IS} /></div>
            </div>

            {/* Métodos editable */}
            <div style={{ marginTop: 16 }}>
              <label style={LS}>Detalle por método de pago</label>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Método</th>
                    <th style={{ padding: "6px 8px", textAlign: "right", color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Venta</th>
                    <th style={{ padding: "6px 8px", textAlign: "right", color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Propina</th>
                  </tr>
                </thead>
                <tbody>
                  {METODOS.map(m => {
                    const val = editForm.metodos?.[m.key] || {};
                    return (
                      <tr key={m.key} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "6px 8px", color: "rgba(255,255,255,0.6)" }}>{m.icon} {m.label}</td>
                        <td style={{ padding: "4px 4px" }}>
                          <input type="number" value={val.venta || ""} onChange={e => {
                            const v = Number(e.target.value) || 0;
                            setEditForm(f => ({ ...f, metodos: { ...f.metodos, [m.key]: { ...f.metodos?.[m.key], venta: v } } }));
                          }} style={{ ...IS, textAlign: "right", padding: "6px 8px", fontSize: 12 }} />
                        </td>
                        <td style={{ padding: "4px 4px" }}>
                          <input type="number" value={val.propina || ""} onChange={e => {
                            const v = Number(e.target.value) || 0;
                            setEditForm(f => ({ ...f, metodos: { ...f.metodos, [m.key]: { ...f.metodos?.[m.key], propina: v } } }));
                          }} style={{ ...IS, textAlign: "right", padding: "6px 8px", fontSize: 12 }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginTop: 16 }}>
              <div><label style={LS}>Efectivo contado</label><input type="number" value={editForm.efectivo_contado} onChange={e => setEditForm(f => ({ ...f, efectivo_contado: Number(e.target.value) || 0 }))} style={IS} /></div>
              <div><label style={LS}>Notas</label><textarea value={editForm.notas||""} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} rows={2} style={{ ...IS, resize: "vertical" }} /></div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button onClick={() => setEditCierre(null)} style={{ flex: 1, background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.sand, padding: "10px", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
              <button onClick={saveEdit} disabled={editSaving}
                style={{ flex: 2, background: B.success, border: "none", borderRadius: 8, color: B.navy, padding: "10px", fontSize: 14, cursor: "pointer", fontWeight: 700, opacity: editSaving ? 0.5 : 1 }}>
                {editSaving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CierreCaja() {
  const isMobile = useMobile();
  const fileRef    = useRef(null);
  const cameraRef  = useRef(null);

  // Logged-in user + lista de usuarios
  const [userNombre, setUserNombre] = useState("");
  const [userRol, setUserRol]       = useState("");
  const [userPermisos, setUserPermisos] = useState([]);
  const [usuariosList, setUsuariosList] = useState([]);
  useEffect(() => {
    if (!supabase) return;
    // Load all active users for cajero dropdown
    supabase.from("usuarios").select("nombre").eq("activo", true).order("nombre")
      .then(({ data }) => { if (data) setUsuariosList(data.map(u => u.nombre)); });
    // Pre-select logged-in user + detect role + permisos extra
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.email) return;
      const { data } = await supabase.from("usuarios").select("nombre, rol_id, permisos_extra")
        .eq("email", session.user.email.toLowerCase()).single();
      if (data?.nombre) { setUserNombre(data.nombre); setCajero(data.nombre); }
      if (data?.rol_id) setUserRol(data.rol_id);
      if (Array.isArray(data?.permisos_extra)) setUserPermisos(data.permisos_extra);
    });
  }, []);

  // Form state
  const [area, setArea]         = useState("ayb");
  const [fecha, setFecha]       = useState(todayStr());
  const [cajero, setCajero]     = useState("");
  const [numCaja, setNumCaja]   = useState("");
  const [numComp, setNumComp]   = useState("");
  const [photos, setPhotos]     = useState([]);              // [{id, file, url, uploading}]

  // Métodos: { datafono: { venta: "", propina: "" }, ... }
  const initMetodos = () => Object.fromEntries(METODOS.map(m => [m.key, { venta: "", propina: "" }]));
  const [metodos, setMetodos] = useState(initMetodos());

  // Otros: lista dinámica con descripción
  const [otrosList, setOtrosList] = useState([]);
  const addOtro = () => setOtrosList(p => [...p, { id: Date.now().toString(), desc: "", venta: "", propina: "" }]);
  const removeOtro = (id) => setOtrosList(p => p.filter(o => o.id !== id));
  const setOtro = (id, field, val) => setOtrosList(p => p.map(o => o.id === id ? { ...o, [field]: val } : o));

  // INC 8%
  const [incBase,     setIncBase]     = useState("");
  const [incImpuesto, setIncImpuesto] = useState("");

  // Efectivo cuadre
  const [efectivoContado, setEfectivoContado] = useState("");

  const [notas, setNotas]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [savedId, setSavedId]   = useState(null);
  const [error, setError]       = useState(null);
  const [historialKey, setHistorialKey] = useState(0);

  // ── Reservas del día (solo para área Pasadías) ───────────────────────────────
  const [reservasDia,     setReservasDia]     = useState([]);
  const [loadingReservas, setLoadingReservas] = useState(false);

  useEffect(() => {
    if (!supabase || area !== "pasadias" || !fecha || !cajero) {
      setReservasDia([]); return;
    }
    setLoadingReservas(true);
    supabase.from("reservas")
      .select("id, nombre, tipo, forma_pago, abono, pax, precio_u, total, estado")
      .eq("fecha", fecha)
      .eq("vendedor", cajero)
      .neq("forma_pago", "link_pago")
      .neq("estado", "cancelado")
      .order("created_at")
      .then(({ data }) => {
        const rows = data || [];
        setReservasDia(rows);
        // Auto-llenar métodos desde las reservas (excluye CXC)
        const newM = initMetodos();
        rows.forEach(r => {
          const mk = FORMA_TO_METODO[r.forma_pago];
          if (!mk) return;
          const cur = parseCOP(newM[mk].venta) || 0;
          newM[mk].venta = String(cur + (r.abono || 0));
        });
        setMetodos(newM);
        setLoadingReservas(false);
      });
  }, [area, fecha, cajero]); // eslint-disable-line

  // Totales de reservas por método para mostrar en el panel
  const resumenReservas = useMemo(() => {
    const map = {};
    let totalCXC = 0;
    reservasDia.forEach(r => {
      if (r.forma_pago === "CXC") { totalCXC += r.abono || 0; return; }
      const mk = FORMA_TO_METODO[r.forma_pago] || "otros";
      if (!map[mk]) map[mk] = 0;
      map[mk] += r.abono || 0;
    });
    return { porMetodo: map, totalCXC };
  }, [reservasDia]);

  const setM = (key, field, val) =>
    setMetodos(p => ({ ...p, [key]: { ...p[key], [field]: val } }));

  // ── Computed ────────────────────────────────────────────────────────────────
  const computed = Object.fromEntries(
    METODOS.map(m => {
      const v = parseCOP(metodos[m.key].venta);
      const p = parseCOP(metodos[m.key].propina);
      return [m.key, { venta: v, propina: p, total: v + p }];
    })
  );

  const otrosVentaTotal  = otrosList.reduce((s, o) => s + parseCOP(o.venta), 0);
  const otrosPropTotal   = otrosList.reduce((s, o) => s + parseCOP(o.propina), 0);

  const totalVentas   = METODOS.filter(m => m.key !== "otros").reduce((s, m) => s + computed[m.key].venta, 0) + otrosVentaTotal;
  const totalPropinas = METODOS.filter(m => m.key !== "otros").reduce((s, m) => s + computed[m.key].propina, 0) + otrosPropTotal;
  const totalGeneral  = totalVentas + totalPropinas;

  const efectivoEsperado = computed.efectivo.total;
  const efectivoContadoNum = parseCOP(efectivoContado);
  const diferencia = efectivoContadoNum - efectivoEsperado;
  const difColor = diferencia === 0 ? "#4ade80" : diferencia < 0 ? "#f87171" : "#fbbf24";

  // ── Upload + AI parse (multi-foto) ──────────────────────────────────────────
  const [parseStatus, setParseStatus] = useState(null); // null | "parsing" | "ok" | "fail"
  const [parseMsg, setParseMsg]       = useState("");

  const MAX_PHOTOS = 3;

  const addPhoto = async (f) => {
    if (!f || photos.length >= MAX_PHOTOS) return;
    const id = `ph-${Date.now()}`;
    setPhotos(prev => [...prev, { id, file: f, url: "", uploading: true }]);
    setParseStatus(null); setParseMsg("");

    // Upload to Storage
    if (supabase) {
      const path = `cierres/${Date.now()}-${f.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("cierres-docs").upload(path, f, { upsert: true });
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from("cierres-docs").getPublicUrl(path);
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, url: publicUrl, uploading: false } : p));
      } else {
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, uploading: false } : p));
      }
    }
  };

  const removePhoto = (id) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
    setParseStatus(null); setParseMsg("");
  };

  // Leer imagen como base64
  const toBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  // Analizar todas las fotos con IA y combinar resultados
  const analizarFotos = async () => {
    const imagePhotos = photos.filter(p => p.file && p.file.type !== "application/pdf" && !p.file.name.toLowerCase().endsWith(".pdf"));
    if (!imagePhotos.length || !supabase) return;
    setParseStatus("parsing"); setParseMsg("");

    // Acumuladores para combinar resultados de múltiples imágenes
    let combined = { cajero: "", numero_comprobante: "", fecha: "", inc_base: 0, inc_impuesto: 0, metodos: {} };
    let anyOk = false;

    for (const ph of imagePhotos) {
      try {
        const base64   = await toBase64(ph.file);
        const mediaType = ph.file.type || "image/jpeg";
        const { data: fnData, error: fnErr } = await supabase.functions.invoke("parse-comprobante", {
          body: { imageBase64: base64, mediaType },
        });
        if (fnErr || !fnData?.ok) continue;
        anyOk = true;
        // Texto: usar primer valor encontrado
        if (!combined.cajero               && fnData.cajero)              combined.cajero               = fnData.cajero;
        if (!combined.numero_comprobante   && fnData.numero_comprobante)  combined.numero_comprobante   = fnData.numero_comprobante;
        if (!combined.fecha                && fnData.fecha)               combined.fecha                = fnData.fecha;
        // Números: acumular (el recibo puede estar partido en varias fotos)
        if (fnData.inc_base)     combined.inc_base     += Number(fnData.inc_base)     || 0;
        if (fnData.inc_impuesto) combined.inc_impuesto += Number(fnData.inc_impuesto) || 0;
        if (fnData.metodos) {
          for (const [k, v] of Object.entries(fnData.metodos)) {
            if (!combined.metodos[k]) combined.metodos[k] = { venta: 0, propina: 0 };
            combined.metodos[k].venta   += Number(v.venta)   || 0;
            combined.metodos[k].propina += Number(v.propina) || 0;
          }
        }
      } catch { /* continuar con siguiente foto */ }
    }

    if (!anyOk) {
      setParseStatus("fail");
      setParseMsg("No se pudo leer automáticamente. Ingresa los datos manualmente.");
      return;
    }

    // Auto-fill form con datos combinados
    if (combined.cajero)             setCajero(combined.cajero);
    if (combined.numero_comprobante) setNumComp(combined.numero_comprobante);
    if (combined.fecha)              setFecha(combined.fecha);
    if (combined.inc_base)           setIncBase(String(combined.inc_base));
    if (combined.inc_impuesto)       setIncImpuesto(String(combined.inc_impuesto));
    if (Object.keys(combined.metodos).length > 0) {
      setMetodos(prev => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(combined.metodos)) {
          if (next[k]) next[k] = { venta: String(v.venta || ""), propina: String(v.propina || "") };
        }
        return next;
      });
    }

    const nFotos = imagePhotos.length;
    setParseStatus("ok");
    setParseMsg(`✅ ${nFotos} foto${nFotos > 1 ? "s" : ""} analizadas. Revisa y corrige si es necesario.`);
  };

  // ── Guardar Cierre ───────────────────────────────────────────────────────────
  const guardar = async () => {
    if (!supabase) return;
    if (!cajero.trim()) { setError("Ingresa el nombre del cajero."); return; }
    setSaving(true);
    setError(null);

    const session = await supabase.auth.getSession();
    const email = session?.data?.session?.user?.email || "sistema";

    const metodosData = Object.fromEntries(
      METODOS.map(m => {
        if (m.key === "otros") {
          return [m.key, { venta: otrosVentaTotal, propina: otrosPropTotal, total: otrosVentaTotal + otrosPropTotal }];
        }
        return [m.key, { venta: computed[m.key].venta, propina: computed[m.key].propina, total: computed[m.key].total }];
      })
    );
    if (otrosList.length > 0) {
      metodosData.otros_items = otrosList.map(o => ({ desc: o.desc, venta: parseCOP(o.venta), propina: parseCOP(o.propina) }));
    }

    const id = `CC-${Date.now()}`;
    const record = {
      id,
      fecha,
      area,
      cajero_nombre: cajero.trim(),
      numero_caja: numCaja.trim() || null,
      numero_comprobante: numComp.trim() || null,
      comprobante_url: photos.find(p => p.url)?.url || null,
      comprobante_urls: photos.filter(p => p.url).map(p => p.url),
      usuario_email: email,
      metodos: metodosData,
      total_ventas: totalVentas,
      total_propinas: totalPropinas,
      total_general: totalGeneral,
      inc_base: parseCOP(incBase) || null,
      inc_impuesto: parseCOP(incImpuesto) || null,
      efectivo_esperado: efectivoEsperado,
      efectivo_contado: efectivoContadoNum,
      diferencia,
      notas: notas.trim() || null,
      estado: "cerrado",
    };

    const { error: err } = await supabase.from("cierres_caja").insert(record);
    if (err) { setError("Error guardando: " + err.message); setSaving(false); return; }

    await logAccion({ modulo: "cierre_caja", accion: "cierre_caja", tabla: "cierres_caja", registroId: id, datosDespues: record });

    setSaved(true);
    setSavedId(id);
    setSaving(false);
    setHistorialKey(k => k + 1);
  };

  const reset = () => {
    setSaved(false); setSavedId(null); setError(null);
    setCajero(userNombre || ""); setNumCaja(""); setNumComp(""); setPhotos([]);
    setMetodos(initMetodos()); setOtrosList([]); setIncBase(""); setIncImpuesto("");
    setEfectivoContado(""); setNotas("");
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ color: "#fff", fontFamily: "inherit", maxWidth: 860, margin: "0 auto", paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>💵 Cierre de Caja</h2>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Registro de ingresos por punto de venta</div>
      </div>

      {saved ? (
        /* ── Éxito ── */
        <div style={{ background: "#4ade8018", border: "1px solid #4ade8033", borderRadius: 16, padding: "28px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#4ade80", marginBottom: 6 }}>Cierre guardado exitosamente</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>ID: {savedId}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", margin: "12px 0" }}>
            Total ventas <strong style={{ color: B.sky }}>{COP(totalVentas)}</strong>
            {" · "}Propinas <strong style={{ color: B.sand }}>{COP(totalPropinas)}</strong>
            {" · "}Total <strong style={{ color: "#fff" }}>{COP(totalGeneral)}</strong>
          </div>
          <button onClick={reset}
            style={{ marginTop: 8, background: B.sand, color: B.navy, border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            + Nuevo Cierre
          </button>
        </div>
      ) : (
        <>
          {/* ── 1. Área ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Área / Punto de venta</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {AREAS.map(a => (
                <button key={a.key} onClick={() => setArea(a.key)}
                  style={{
                    padding: "10px 18px", borderRadius: 10, border: `1px solid ${area === a.key ? B.sky : "rgba(255,255,255,0.1)"}`,
                    background: area === a.key ? B.sky + "22" : "transparent",
                    color: area === a.key ? B.sky : "rgba(255,255,255,0.5)",
                    fontWeight: area === a.key ? 700 : 500, cursor: "pointer", fontSize: 13,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                  <span>{a.icon}</span> {a.label}
                  {!isMobile && <span style={{ fontSize: 10, opacity: 0.6 }}>— {a.desc}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* ── 2. Cajero + Fecha (pasadías) / Datos del comprobante (otros) ── */}
          {area === "pasadias" ? (
            <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={LS}>Cajero</label>
                  <select value={cajero} onChange={e => setCajero(e.target.value)} style={IS}>
                    <option value="">— Seleccionar —</option>
                    {usuariosList.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Fecha</label>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={IS} />
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Datos del comprobante</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={LS}>Cajero</label>
                  <select value={cajero} onChange={e => setCajero(e.target.value)} style={IS}>
                    <option value="">— Seleccionar —</option>
                    {usuariosList.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Caja</label>
                  <select value={numCaja} onChange={e => setNumCaja(e.target.value)} style={IS}>
                    <option value="">— Seleccionar —</option>
                    {["Bar", "Bar Playa", "Room Service", "Eventos"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={LS}>No. Comprobante</label>
                  <input value={numComp} onChange={e => setNumComp(e.target.value)} placeholder="Ej: 1353" style={IS} />
                </div>
                <div>
                  <label style={LS}>Fecha</label>
                  <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={IS} />
                </div>
              </div>

              {/* Upload */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={LS}>Fotos del comprobante ({photos.length}/{MAX_PHOTOS})</label>
                  {photos.length > 0 && photos.every(p => !p.uploading) && parseStatus !== "parsing" && (
                    <button onClick={analizarFotos}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "none", background: B.sky + "22", color: B.sky, cursor: "pointer", fontWeight: 700 }}>
                      🤖 Analizar con IA
                    </button>
                  )}
                </div>

                {/* Miniaturas de fotos subidas */}
                {photos.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {photos.map((ph, i) => (
                      <div key={ph.id} style={{ position: "relative", width: 72, height: 72 }}>
                        {ph.uploading ? (
                          <div style={{ width: 72, height: 72, borderRadius: 8, background: B.navy, border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⏳</div>
                        ) : ph.url ? (
                          <a href={ph.url} target="_blank" rel="noopener noreferrer">
                            <img src={ph.url} alt={`foto ${i+1}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: `2px solid ${B.sky}55` }} />
                          </a>
                        ) : (
                          <div style={{ width: 72, height: 72, borderRadius: 8, background: B.navy, border: "1px dashed rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📷</div>
                        )}
                        <button onClick={() => removePhoto(ph.id)}
                          style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", border: "none", background: "#f87171", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                          ✕
                        </button>
                        <div style={{ position: "absolute", bottom: 2, left: 2, fontSize: 9, background: "rgba(0,0,0,0.6)", color: "#fff", borderRadius: 3, padding: "1px 4px" }}>
                          {i+1}/{photos.length}
                        </div>
                      </div>
                    ))}
                    {/* Slot para agregar más */}
                    {photos.length < MAX_PHOTOS && (
                      <button onClick={() => cameraRef.current?.click()}
                        style={{ width: 72, height: 72, borderRadius: 8, border: "1px dashed rgba(142,202,230,0.4)", background: "rgba(142,202,230,0.05)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                        <span style={{ fontSize: 22 }}>📷</span>
                        <span style={{ fontSize: 9, color: B.sky }}>+ Foto</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Botones iniciales cuando no hay fotos */}
                {photos.length === 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <button onClick={() => cameraRef.current?.click()}
                      style={{ padding: "14px 12px", borderRadius: 10, border: "1px dashed rgba(142,202,230,0.35)", background: "rgba(142,202,230,0.06)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 26 }}>📷</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: B.sky }}>Tomar foto</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>Hasta 3 fotos · IA auto-completa</span>
                    </button>
                    <button onClick={() => fileRef.current?.click()}
                      style={{ padding: "14px 12px", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.12)", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 26 }}>📎</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>Adjuntar archivo</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>PDF, JPG o PNG</span>
                    </button>
                  </div>
                )}

                <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                  onChange={e => { if (e.target.files[0]) { addPhoto(e.target.files[0]); e.target.value = ""; } }} />
                <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: "none" }}
                  onChange={e => { if (e.target.files[0]) { addPhoto(e.target.files[0]); e.target.value = ""; } }} />

                {parseStatus === "parsing" && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: B.sky + "15", border: `1px solid ${B.sky}33`, fontSize: 12, color: B.sky, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                    Analizando fotos con IA…
                  </div>
                )}
                {parseStatus === "ok" && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#4ade8015", border: "1px solid #4ade8033", fontSize: 12, color: "#4ade80" }}>
                    {parseMsg}
                  </div>
                )}
                {parseStatus === "fail" && (
                  <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 12, color: "#fbbf24" }}>
                    {parseMsg}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 3. Panel Ventas del Sistema (solo Pasadías) ── */}
          {area === "pasadias" && cajero && fecha && (
            <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(56,189,248,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: B.sky, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  🧾 Ventas del sistema — {cajero} · {fmtFecha(fecha)}
                </div>
                {loadingReservas && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Cargando…</span>}
                {!loadingReservas && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{reservasDia.length} reserva{reservasDia.length !== 1 ? "s" : ""}</span>}
              </div>

              {!loadingReservas && reservasDia.length === 0 && (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "8px 0" }}>Sin reservas registradas para este cajero en esta fecha.</div>
              )}

              {reservasDia.length > 0 && (
                <>
                  {/* Lista de reservas */}
                  <div style={{ marginBottom: 14 }}>
                    {reservasDia.map(r => (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
                        <div>
                          <span style={{ color: "#fff", fontWeight: 600 }}>{r.nombre}</span>
                          <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8, fontSize: 11 }}>{r.tipo} · {r.pax} pax</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: B.sand, fontWeight: 700, marginRight: 10 }}>{COP(r.abono)}</span>
                          <span style={{ fontSize: 11, color: r.forma_pago === "CXC" ? B.sky : "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 10 }}>
                            {r.forma_pago === "CXC" ? "Cuenta B2B" : r.forma_pago}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Resumen por método */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {Object.entries(resumenReservas.porMetodo).map(([mk, total]) => {
                      const m = METODOS.find(x => x.key === mk);
                      return (
                        <div key={mk} style={{ background: B.navyLight, borderRadius: 8, padding: "8px 14px", fontSize: 12 }}>
                          <span style={{ color: "rgba(255,255,255,0.5)" }}>{m?.icon} {m?.label}: </span>
                          <strong style={{ color: "#fff" }}>{COP(total)}</strong>
                        </div>
                      );
                    })}
                    {resumenReservas.totalCXC > 0 && (
                      <div style={{ background: B.navyLight, borderRadius: 8, padding: "8px 14px", fontSize: 12 }}>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>🏢 Cuenta B2B: </span>
                        <strong style={{ color: B.sky }}>{COP(resumenReservas.totalCXC)}</strong>
                      </div>
                    )}
                    <div style={{ background: "#4ade8015", border: "1px solid #4ade8033", borderRadius: 8, padding: "8px 14px", fontSize: 12 }}>
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>Total cobrado: </span>
                      <strong style={{ color: "#4ade80" }}>{COP(Object.values(resumenReservas.porMetodo).reduce((s, v) => s + v, 0))}</strong>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                    Los montos de Datáfono y Efectivo fueron pre-llenados automáticamente. Ajusta si hay diferencias.
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── 4. Métodos de pago ── */}
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
              {area === "pasadias" ? "Verificar montos" : "Métodos de pago"}
            </div>

            {/* Column headers */}
            {!isMobile && (
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 120px", gap: 10, marginBottom: 8, padding: "0 4px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Método</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Ventas (sin propina)</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Propinas</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>Total</div>
              </div>
            )}

            {METODOS.filter(m => m.key !== "otros" && (area !== "pasadias" || METODOS_PASADIAS.includes(m.key))).map(m => {
              const isEfectivo = m.key === "efectivo";
              const tot = computed[m.key].total;
              return (
                <div key={m.key} style={{
                  padding: "10px 12px", borderRadius: 10, marginBottom: 6,
                  background: isEfectivo ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isEfectivo ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.04)"}`,
                }}>
                  {isMobile ? (
                    // ── MÓVIL: label arriba, inputs abajo con etiqueta ──
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{m.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: isEfectivo ? 700 : 500, color: isEfectivo ? "#fbbf24" : "rgba(255,255,255,0.8)" }}>{m.label}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: tot > 0 ? (isEfectivo ? "#fbbf24" : "#fff") : "rgba(255,255,255,0.2)" }}>
                          {tot > 0 ? COP(tot) : "—"}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ventas</div>
                          <input type="number" min="0" placeholder="0" value={metodos[m.key].venta}
                            onChange={e => setM(m.key, "venta", e.target.value)}
                            style={{ ...IS, fontSize: 13, textAlign: "right" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "rgba(200,185,154,0.5)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Propinas</div>
                          <input type="number" min="0" placeholder="0" value={metodos[m.key].propina}
                            onChange={e => setM(m.key, "propina", e.target.value)}
                            style={{ ...IS, fontSize: 13, textAlign: "right", background: "rgba(200,185,154,0.06)", borderColor: "rgba(200,185,154,0.1)" }} />
                        </div>
                      </div>
                    </>
                  ) : (
                    // ── DESKTOP: grid horizontal ──
                    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 120px", gap: 10, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{m.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: isEfectivo ? 700 : 500, color: isEfectivo ? "#fbbf24" : "rgba(255,255,255,0.8)" }}>{m.label}</span>
                      </div>
                      <input type="number" min="0" placeholder="0" value={metodos[m.key].venta}
                        onChange={e => setM(m.key, "venta", e.target.value)}
                        style={{ ...IS, fontSize: 13, textAlign: "right" }} />
                      <input type="number" min="0" placeholder="0" value={metodos[m.key].propina}
                        onChange={e => setM(m.key, "propina", e.target.value)}
                        style={{ ...IS, fontSize: 13, textAlign: "right", background: "rgba(200,185,154,0.06)", borderColor: "rgba(200,185,154,0.1)" }} />
                      <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: tot > 0 ? (isEfectivo ? "#fbbf24" : "#fff") : "rgba(255,255,255,0.2)" }}>
                        {tot > 0 ? COP(tot) : "—"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Otros métodos (dinámico) — solo A&B y Otros ── */}
            {area !== "pasadias" && otrosList.map((o) => {
              const oTot = parseCOP(o.venta) + parseCOP(o.propina);
              return (
                <div key={o.id} style={{
                  borderRadius: 10, marginBottom: 6,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  padding: "10px 12px",
                }}>
                  {/* Descripción + eliminar */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 15 }}>➕</span>
                    <input placeholder="Descripción (ej: Nequi, Bono, Cupon…)" value={o.desc}
                      onChange={e => setOtro(o.id, "desc", e.target.value)}
                      style={{ ...IS, flex: 1, fontSize: 13 }} />
                    <button onClick={() => removeOtro(o.id)}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>
                      ✕
                    </button>
                  </div>
                  {/* Venta / Propina / Total */}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 120px", gap: 10, alignItems: "center" }}>
                    <input type="number" min="0" placeholder="Venta" value={o.venta}
                      onChange={e => setOtro(o.id, "venta", e.target.value)}
                      style={{ ...IS, fontSize: 13, textAlign: "right" }} />
                    <input type="number" min="0" placeholder="Propina" value={o.propina}
                      onChange={e => setOtro(o.id, "propina", e.target.value)}
                      style={{ ...IS, fontSize: 13, textAlign: "right", background: "rgba(200,185,154,0.06)", borderColor: "rgba(200,185,154,0.1)" }} />
                    {!isMobile && (
                      <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: oTot > 0 ? "#fff" : "rgba(255,255,255,0.2)" }}>
                        {oTot > 0 ? COP(oTot) : "—"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {area !== "pasadias" && (
              <button onClick={addOtro} style={{
                width: "100%", background: "none",
                border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 8,
                padding: "9px 14px", color: "rgba(255,255,255,0.4)", fontSize: 12,
                cursor: "pointer", marginBottom: 10, textAlign: "left",
              }}>
                ➕ Agregar otro método de pago
              </button>
            )}

            {/* Totals row */}
            {isMobile ? (
              <div style={{ padding: "12px", borderRadius: 10, marginTop: 8, background: "rgba(142,202,230,0.08)", border: `1px solid ${B.sky}33` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: B.sky, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>TOTAL</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Ventas</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: B.sky }}>{COP(totalVentas)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "rgba(200,185,154,0.5)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Propinas</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: B.sand }}>{COP(totalPropinas)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Total</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{COP(totalGeneral)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                display: "grid", gridTemplateColumns: "160px 1fr 1fr 120px",
                gap: 10, alignItems: "center",
                padding: "12px 12px", borderRadius: 10, marginTop: 8,
                background: "rgba(142,202,230,0.08)", border: `1px solid ${B.sky}33`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: B.sky }}>TOTAL</div>
                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: B.sky }}>{COP(totalVentas)}</div>
                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: B.sand }}>{COP(totalPropinas)}</div>
                <div style={{ textAlign: "right", fontSize: 16, fontWeight: 800, color: "#fff" }}>{COP(totalGeneral)}</div>
              </div>
            )}
          </div>

          {/* ── 4. INC 8% + Resumen (no aplica para Pasadías) ── */}
          {area !== "pasadias" && <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Impuestos y resumen</div>

            {/* INC 8% */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>INC (8%)</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10, alignItems: "end" }}>
                <div>
                  <label style={LS}>Base gravable</label>
                  <input type="number" min="0" placeholder="0" value={incBase}
                    onChange={e => {
                      setIncBase(e.target.value);
                      const base = parseInt(e.target.value, 10) || 0;
                      setIncImpuesto(base ? String(Math.round(base * 0.08)) : "");
                    }}
                    style={{ ...IS, textAlign: "right" }} />
                </div>
                <div>
                  <label style={LS}>INC (8%)</label>
                  <input type="number" min="0" placeholder="0" value={incImpuesto}
                    onChange={e => setIncImpuesto(e.target.value)}
                    style={{ ...IS, textAlign: "right", color: "#fbbf24" }} />
                </div>
                <div style={{ padding: "10px 0" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Auto-calculado</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Base × 8% = Imp. — editable si difiere</div>
                </div>
              </div>
            </div>

            {/* Resumen tipo comprobante */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Resumen</div>
              {[
                { label: "Total Ventas (sin propina)",       value: totalVentas,               color: B.sky },
                { label: "Propinas",                         value: totalPropinas,              color: B.sand },
                { label: "INC (8%)",                         value: parseCOP(incImpuesto),      color: "#fbbf24", skip: !incImpuesto },
                { label: "Total General (Debe tener)",       value: totalGeneral,               color: "#fff", bold: true, sep: true },
                { label: "Total Efectivo",                   value: computed.efectivo.total,    color: "#fbbf24" },
              ].filter(r => !r.skip).map(r => (
                <div key={r.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0",
                  borderTop: r.sep ? "1px solid rgba(255,255,255,0.08)" : "none",
                  marginTop: r.sep ? 4 : 0,
                }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{r.label}</span>
                  <span style={{ fontSize: r.bold ? 16 : 13, fontWeight: r.bold ? 800 : 600, color: r.color }}>
                    {COP(r.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>}

          {/* ── 5. Cuadre de efectivo ── */}
          {efectivoEsperado > 0 && (
            <div style={{ background: "rgba(251,191,36,0.07)", borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(251,191,36,0.15)" }}>
              <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>💵 Cuadre de Efectivo</div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ ...LS, color: "#fbbf2480" }}>Efectivo en sistema</label>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fbbf24" }}>{COP(efectivoEsperado)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ ...LS, color: "#fbbf2480" }}>Efectivo contado</label>
                  <input type="number" min="0" placeholder="0" value={efectivoContado}
                    onChange={e => setEfectivoContado(e.target.value)}
                    style={{ ...IS, fontSize: 15, fontWeight: 700, textAlign: "right" }} />
                </div>
                {efectivoContado !== "" && (
                  <div style={{ padding: "10px 18px", borderRadius: 10, background: difColor + "18", border: `1px solid ${difColor}33`, minWidth: 140, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>Diferencia</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: difColor }}>{diferencia >= 0 ? "+" : ""}{COP(diferencia)}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {diferencia === 0 ? "Cuadrado ✓" : diferencia > 0 ? "Sobrante" : "Faltante"}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 5. Notas ── */}
          <div style={{ marginBottom: 20 }}>
            <label style={LS}>Notas / Observaciones</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Inconsistencias, novedades del día, gastos de caja…"
              rows={2} style={{ ...IS, resize: "vertical", lineHeight: 1.5 }} />
          </div>

          {error && (
            <div style={{ background: "#f8717122", border: "1px solid #f8717144", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#f87171" }}>
              {error}
            </div>
          )}

          {/* ── Guardar ── */}
          <button onClick={guardar} disabled={saving || !cajero.trim() || photos.some(p => p.uploading)}
            style={{
              width: "100%", padding: "15px", borderRadius: 12, border: "none",
              background: (saving || !cajero.trim() || photos.some(p => p.uploading)) ? "rgba(255,255,255,0.06)" : B.sand,
              color: (saving || !cajero.trim() || photos.some(p => p.uploading)) ? "rgba(255,255,255,0.25)" : B.navy,
              fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 36,
            }}>
            {saving ? "Guardando…" : photos.some(p => p.uploading) ? "Subiendo fotos…" : "Guardar Cierre de Caja"}
          </button>
        </>
      )}

      {/* ── Historial ── */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Historial de Cierres</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Rol detectado: <span style={{ color: B.sky }}>{userRol || "(cargando…)"}</span></div>
        </div>
        <HistorialCierres refresh={historialKey} area={area} userRol={userRol} userPermisos={userPermisos} />
      </div>

    </div>
  );
}
