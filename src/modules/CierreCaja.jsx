import { useState, useEffect, useCallback } from "react";
import { B, COP, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { logAccion } from "../lib/logAccion";

// ── Normalize payment method names ─────────────────────────────────────────
const normForma = (f) => {
  if (!f) return "Pendiente";
  const s = f.trim().toLowerCase();
  if (s === "efectivo") return "Efectivo";
  if (s === "transferencia") return "Transferencia";
  if (s === "wompi") return "Wompi";
  if (s === "sky" || s === "sky bookings") return "SKY";
  if (s === "cxc") return "CXC";
  if (s === "link_pago" || s === "link de pago" || s === "enviar link de pago") return "Link de Pago";
  return f.trim();
};

// ── Shared styles ───────────────────────────────────────────────────────────
const card = {
  background: B.navyMid,
  borderRadius: 12,
  padding: "16px 20px",
  border: `1px solid ${B.navyLight}`,
};

const sectionHeader = {
  fontSize: 14,
  fontWeight: 700,
  color: B.sand,
  marginBottom: 12,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const inputStyle = {
  background: B.navy,
  border: `1px solid ${B.navyLight}`,
  color: "#fff",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const efectivoHighlight = {
  background: "#E8A02015",
  border: "1px solid #E8A02033",
};

const FORMAS_ORDER = ["Efectivo", "Transferencia", "Wompi", "SKY", "CXC", "Link de Pago", "Pendiente"];

function fmtFecha(d) {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, accent }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || "#fff" }}>{value}</div>
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────
function Badge({ text, color }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
      background: (color || B.success) + "22", color: color || B.success,
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      {text}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function CierreCaja() {
  const mobile = useMobile();

  // Date selector
  const [fecha, setFecha] = useState(todayStr());
  const [fechaInput, setFechaInput] = useState(todayStr());

  // Reservas data
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Efectivo cuadre
  const [efectivoContado, setEfectivoContado] = useState("");

  // UI state
  const [showDetalle, setShowDetalle] = useState(false);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [error, setError] = useState(null);

  // Historial
  const [historial, setHistorial] = useState([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);

  // ── Load reservas for selected date ──────────────────────────────────────
  const cargarReservas = useCallback(async (f) => {
    setLoading(true);
    setLoaded(false);
    setError(null);
    setSaved(false);
    setSavedId(null);
    setEfectivoContado("");
    setNotas("");
    setShowDetalle(false);

    if (!supabase) {
      setLoading(false);
      setError("Supabase no disponible.");
      return;
    }

    const { data, error: err } = await supabase
      .from("reservas")
      .select("id, nombre, tipo, canal, forma_pago, pax, estado, total, fecha")
      .eq("fecha", f)
      .neq("estado", "cancelado");

    if (err) {
      setError("Error cargando reservas: " + err.message);
      setLoading(false);
      return;
    }

    setReservas(data || []);
    setLoading(false);
    setLoaded(true);
  }, []);

  // ── Load historial ────────────────────────────────────────────────────────
  const cargarHistorial = useCallback(async () => {
    if (!supabase) return;
    setHistorialLoading(true);
    const { data } = await supabase
      .from("cierres_caja")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setHistorial(data || []);
    setHistorialLoading(false);
  }, []);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  // ── Computed values ───────────────────────────────────────────────────────
  const totalGeneral = reservas.reduce((s, r) => s + (r.total || 0), 0);
  const totalPax = reservas.reduce((s, r) => s + (r.pax || 0), 0);
  const totalReservas = reservas.length;

  // Group by normalized forma_pago
  const porForma = reservas.reduce((acc, r) => {
    const forma = normForma(r.forma_pago);
    if (!acc[forma]) acc[forma] = { count: 0, total: 0 };
    acc[forma].count += 1;
    acc[forma].total += r.total || 0;
    return acc;
  }, {});

  // Ordered rows (known forms first, then any others)
  const formaRows = [
    ...FORMAS_ORDER.filter(f => porForma[f]),
    ...Object.keys(porForma).filter(f => !FORMAS_ORDER.includes(f)),
  ].map(f => ({ forma: f, ...porForma[f] }));

  const efectivoEsperado = porForma["Efectivo"]?.total || 0;
  const efectivoContadoNum = parseInt(efectivoContado.replace(/[^0-9-]/g, ""), 10) || 0;
  const diferencia = efectivoContadoNum - efectivoEsperado;
  const diferenciaColor = diferencia === 0 ? B.success : diferencia < 0 ? B.danger : B.warning;

  // ── Cerrar Caja ───────────────────────────────────────────────────────────
  const cerrarCaja = async () => {
    if (!supabase) { setError("Supabase no disponible."); return; }
    setSaving(true);
    setError(null);

    const session = await supabase.auth.getSession();
    const email = session?.data?.session?.user?.email || "desconocido";

    const totalesPorForma = {};
    formaRows.forEach(row => { totalesPorForma[row.forma] = row.total; });

    const id = `CC-${Date.now()}`;
    const record = {
      id,
      fecha,
      usuario_email: email,
      efectivo_esperado: efectivoEsperado,
      efectivo_contado: efectivoContadoNum,
      diferencia,
      totales_por_forma: totalesPorForma,
      reservas_count: totalReservas,
      total_general: totalGeneral,
      estado: "cerrado",
      notas: notas.trim() || null,
    };

    const { error: insertErr } = await supabase.from("cierres_caja").insert(record);

    if (insertErr) {
      setError("Error guardando cierre: " + insertErr.message);
      setSaving(false);
      return;
    }

    await logAccion({
      modulo: "cierre_caja",
      accion: "cierre_caja",
      tabla: "cierres_caja",
      registroId: id,
      datosDespues: record,
    });

    setSaved(true);
    setSavedId(id);
    setSaving(false);
    cargarHistorial();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ color: "#fff", fontFamily: "inherit", maxWidth: 900, margin: "0 auto", paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Cierre de Caja</h2>
        {supabase && <Badge text="LIVE" color={B.success} />}
      </div>

      {/* ── 1. Date Selector ── */}
      <div style={{ ...card, marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={sectionHeader}>Fecha</div>
        <input
          type="date"
          value={fechaInput}
          onChange={e => setFechaInput(e.target.value)}
          style={{ ...inputStyle, width: "auto", flex: "0 0 auto" }}
        />
        <button
          onClick={() => { setFecha(fechaInput); cargarReservas(fechaInput); }}
          disabled={loading}
          style={{
            background: B.sand, color: B.navy, border: "none", borderRadius: 8,
            padding: "9px 20px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            fontSize: 14, opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Cargando…" : "Cargar"}
        </button>
        {loaded && !loading && (
          <span style={{ fontSize: 13, color: B.sand, marginLeft: 4 }}>
            {fmtFecha(fecha)} — {totalReservas} reservas cargadas
          </span>
        )}
      </div>

      {error && (
        <div style={{ ...card, background: B.danger + "22", border: `1px solid ${B.danger}44`, color: B.danger, marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loaded && (
        <>
          {/* ── 2. Resumen de Ingresos ── */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={sectionHeader}>Resumen de Ingresos</div>

            {/* KPI Cards */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <KpiCard label="Total Ingresos" value={COP(totalGeneral)} accent={B.sky} />
              <KpiCard label="Reservas" value={totalReservas} />
              <KpiCard label="Pax" value={totalPax} />
            </div>

            {/* Grouped table */}
            {formaRows.length === 0 ? (
              <div style={{ fontSize: 13, color: B.sand, opacity: 0.7 }}>No hay reservas para esta fecha.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: B.sand, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Forma de Pago</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", color: B.sand, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Reservas</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", color: B.sand, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Total COP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formaRows.map(row => {
                      const isEfectivo = row.forma === "Efectivo";
                      return (
                        <tr
                          key={row.forma}
                          style={{
                            borderBottom: `1px solid ${B.navyLight}44`,
                            ...(isEfectivo ? efectivoHighlight : {}),
                          }}
                        >
                          <td style={{ padding: "10px 10px", fontWeight: isEfectivo ? 700 : 400 }}>
                            {row.forma}
                            {isEfectivo && (
                              <span style={{ marginLeft: 8, fontSize: 10, color: B.warning, fontWeight: 600, textTransform: "uppercase" }}>
                                Cuadrar
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: "right", padding: "10px 10px", color: "#ccc" }}>{row.count}</td>
                          <td style={{ textAlign: "right", padding: "10px 10px", fontWeight: isEfectivo ? 700 : 400, color: isEfectivo ? B.warning : "#fff" }}>
                            {COP(row.total)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: `2px solid ${B.navyLight}` }}>
                      <td style={{ padding: "10px 10px", fontWeight: 700, color: B.sand }}>Total</td>
                      <td style={{ textAlign: "right", padding: "10px 10px", fontWeight: 700 }}>{totalReservas}</td>
                      <td style={{ textAlign: "right", padding: "10px 10px", fontWeight: 700, color: B.sky }}>{COP(totalGeneral)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── 3. Cuadre de Efectivo ── */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={sectionHeader}>Cuadre de Efectivo</div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 14px", borderRadius: 8, ...efectivoHighlight }}>
              <span style={{ fontSize: 13, color: "#ccc" }}>Efectivo esperado en caja:</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: B.warning }}>{COP(efectivoEsperado)}</span>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 6, fontWeight: 600 }}>
                  Efectivo contado (COP)
                </label>
                <input
                  type="number"
                  value={efectivoContado}
                  onChange={e => setEfectivoContado(e.target.value)}
                  placeholder="0"
                  style={inputStyle}
                  min="0"
                />
              </div>

              {efectivoContado !== "" && (
                <div style={{ padding: "9px 16px", borderRadius: 8, background: diferenciaColor + "18", border: `1px solid ${diferenciaColor}44`, minWidth: 160 }}>
                  <div style={{ fontSize: 11, color: "#aaa", marginBottom: 2, textTransform: "uppercase", fontWeight: 600 }}>Diferencia</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: diferenciaColor }}>
                    {diferencia >= 0 ? "+" : ""}{COP(diferencia)}
                  </div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                    {diferencia === 0 ? "Cuadrado exacto" : diferencia > 0 ? "Sobrante" : "Faltante"}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 4. Detalle de Reservas (collapsible) ── */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div
              onClick={() => setShowDetalle(v => !v)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <div style={{ ...sectionHeader, marginBottom: 0 }}>Detalle de Reservas ({totalReservas})</div>
              <span style={{ color: B.sand, fontSize: 18, userSelect: "none" }}>{showDetalle ? "▲" : "▼"}</span>
            </div>

            {showDetalle && (
              <div style={{ overflowX: "auto", marginTop: 16 }}>
                {reservas.length === 0 ? (
                  <div style={{ fontSize: 13, color: B.sand, opacity: 0.7 }}>Sin reservas.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                        {["Nombre", "Tipo", "Pax", "Forma de Pago", "Total"].map(h => (
                          <th key={h} style={{ textAlign: h === "Total" || h === "Pax" ? "right" : "left", padding: "7px 10px", color: B.sand, fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reservas.map(r => (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${B.navyLight}33` }}>
                          <td style={{ padding: "8px 10px" }}>{r.nombre || "—"}</td>
                          <td style={{ padding: "8px 10px", color: "#ccc" }}>{r.tipo || "—"}</td>
                          <td style={{ padding: "8px 10px", textAlign: "right", color: "#ccc" }}>{r.pax || 0}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 10,
                              background: normForma(r.forma_pago) === "Efectivo" ? B.warning + "22" : B.navyLight + "66",
                              color: normForma(r.forma_pago) === "Efectivo" ? B.warning : "#ccc",
                              fontWeight: 600,
                            }}>
                              {normForma(r.forma_pago)}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{COP(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* ── 5. Notas ── */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={sectionHeader}>Notas del Cierre</div>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones, inconsistencias, novedades del día…"
              rows={3}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* ── 6. Cerrar Caja Button / Success ── */}
          {saved ? (
            <div style={{ ...card, background: B.success + "18", border: `1px solid ${B.success}44`, marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: B.success }}>Caja cerrada exitosamente</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>ID: {savedId}</div>
              <div style={{ fontSize: 13, color: "#ccc", marginTop: 4 }}>
                Total registrado: <strong>{COP(totalGeneral)}</strong> · Efectivo: <strong>{COP(efectivoEsperado)}</strong> · Diferencia: <strong style={{ color: diferenciaColor }}>{diferencia >= 0 ? "+" : ""}{COP(diferencia)}</strong>
              </div>
              <button
                onClick={() => { setSaved(false); setSavedId(null); setLoaded(false); setReservas([]); setFechaInput(todayStr()); }}
                style={{ marginTop: 8, background: "transparent", border: `1px solid ${B.navyLight}`, color: B.sand, borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13, width: "fit-content" }}
              >
                Nuevo Cierre
              </button>
            </div>
          ) : (
            <button
              onClick={cerrarCaja}
              disabled={saving || efectivoContado === ""}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 10,
                border: "none",
                background: (saving || efectivoContado === "") ? B.navyLight : B.sand,
                color: (saving || efectivoContado === "") ? "#888" : B.navy,
                fontSize: 15,
                fontWeight: 700,
                cursor: (saving || efectivoContado === "") ? "not-allowed" : "pointer",
                marginBottom: 20,
                transition: "background 0.2s",
              }}
            >
              {saving ? "Guardando…" : "Cerrar Caja"}
            </button>
          )}
        </>
      )}

      {/* ── 7. Historial de Cierres ── */}
      <div style={{ ...card, marginTop: loaded ? 0 : 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={sectionHeader}>Historial de Cierres</div>
          <button
            onClick={cargarHistorial}
            disabled={historialLoading}
            style={{ background: "transparent", border: `1px solid ${B.navyLight}`, color: B.sand, borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}
          >
            {historialLoading ? "…" : "Actualizar"}
          </button>
        </div>

        {historialLoading ? (
          <div style={{ fontSize: 13, color: "#aaa" }}>Cargando historial…</div>
        ) : historial.length === 0 ? (
          <div style={{ fontSize: 13, color: "#aaa" }}>No hay cierres registrados.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                  {["Fecha", "Usuario", "Total", "Efectivo", "Diferencia", "Estado", "Notas"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "7px 10px", color: B.sand, fontWeight: 600, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map(c => {
                  const dif = c.diferencia || 0;
                  const difColor = dif === 0 ? B.success : dif < 0 ? B.danger : B.warning;
                  const isExpanded = expandedRow === c.id;
                  return (
                    <>
                      <tr
                        key={c.id}
                        onClick={() => setExpandedRow(isExpanded ? null : c.id)}
                        style={{ borderBottom: `1px solid ${B.navyLight}33`, cursor: "pointer", transition: "background 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.background = B.navyLight + "44"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{ padding: "9px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtFecha(c.fecha)}</td>
                        <td style={{ padding: "9px 10px", color: "#aaa", fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.usuario_email || "—"}</td>
                        <td style={{ padding: "9px 10px", fontWeight: 600, color: B.sky }}>{COP(c.total_general)}</td>
                        <td style={{ padding: "9px 10px", color: B.warning }}>{COP(c.efectivo_esperado)}</td>
                        <td style={{ padding: "9px 10px", fontWeight: 700, color: difColor }}>
                          {dif >= 0 ? "+" : ""}{COP(dif)}
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          <Badge text={c.estado || "cerrado"} color={B.success} />
                        </td>
                        <td style={{ padding: "9px 10px", color: "#aaa", fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.notas || "—"}
                        </td>
                      </tr>
                      {isExpanded && c.totales_por_forma && (
                        <tr key={`${c.id}-exp`} style={{ background: B.navy + "88" }}>
                          <td colSpan={7} style={{ padding: "12px 20px" }}>
                            <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              Totales por Forma de Pago
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {Object.entries(c.totales_por_forma).map(([forma, total]) => (
                                <div key={forma} style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>
                                  <span style={{ color: "#aaa", marginRight: 6 }}>{forma}:</span>
                                  <span style={{ fontWeight: 700, color: forma === "Efectivo" ? B.warning : "#fff" }}>{COP(total)}</span>
                                </div>
                              ))}
                            </div>
                            {c.notas && (
                              <div style={{ marginTop: 10, fontSize: 12, color: "#aaa" }}>
                                <span style={{ color: B.sand, fontWeight: 600 }}>Notas: </span>{c.notas}
                              </div>
                            )}
                            <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>ID: {c.id} · {c.reservas_count} reservas</div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
