// CXC.jsx — Cuentas por Cobrar (Pasadías y reservas con saldo pendiente)
import { useState, useEffect, useMemo } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

export default function CXC() {
  const isMobile = useMobile();
  const [rows, setRows]       = useState([]);
  const [aliadosMap, setAliadosMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro]   = useState(""); // text search
  const [tipoFilter, setTipoFilter] = useState("todos"); // todos | b2b | directo
  const [view, setView]       = useState("detalle"); // detalle | agrupada
  const [expanded, setExpanded] = useState(null); // cliente expandido en vista agrupada

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      supabase.from("reservas")
        .select("id, fecha, nombre, contacto, telefono, tipo, total, abono, saldo, estado, forma_pago, aliado_id, canal, vendedor, created_at, grupo_id")
        .gt("saldo", 0)
        .neq("estado", "cancelado")
        .order("fecha", { ascending: false }),
      supabase.from("aliados_b2b").select("id, nombre, tipo, contacto, tel, email"),
    ]).then(([resR, aliR]) => {
      setRows(resR.data || []);
      const map = {};
      (aliR.data || []).forEach(a => { map[a.id] = a; });
      setAliadosMap(map);
      setLoading(false);
    });
  }, []);

  const nowCO = useMemo(() => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" })), []);

  const aging = (fechaStr) => {
    if (!fechaStr) return 0;
    const f = new Date(fechaStr + "T12:00:00");
    return Math.floor((nowCO - f) / (1000 * 60 * 60 * 24));
  };
  const agingColor = (d) => d <= 7 ? B.success : d <= 30 ? B.warning : B.danger;

  // Filter
  const filtered = rows.filter(r => {
    if (tipoFilter === "b2b" && !r.aliado_id) return false;
    if (tipoFilter === "directo" && r.aliado_id) return false;
    if (filtro) {
      const q = filtro.toLowerCase();
      return (r.nombre || "").toLowerCase().includes(q)
        || (r.contacto || "").toLowerCase().includes(q)
        || (r.id || "").toLowerCase().includes(q)
        || (r.tipo || "").toLowerCase().includes(q);
    }
    return true;
  });

  const totalCxc  = filtered.reduce((s, r) => s + (r.saldo || 0), 0);
  const b2b       = rows.filter(r => r.aliado_id);
  const directo   = rows.filter(r => !r.aliado_id);
  const totalB2B  = b2b.reduce((s, r) => s + (r.saldo || 0), 0);
  const totalDir  = directo.reduce((s, r) => s + (r.saldo || 0), 0);

  // Aging buckets
  const bucket = (label, min, max, color) => {
    const items = rows.filter(r => {
      const d = aging(r.fecha);
      return d >= min && (max === null || d <= max);
    });
    return { label, count: items.length, total: items.reduce((s, r) => s + (r.saldo || 0), 0), color };
  };
  const buckets = [
    bucket("Al día (≤7d)", 0, 7, B.success),
    bucket("8-30 días",    8, 30, B.warning),
    bucket(">30 días",    31, null, B.danger),
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 20 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>💳 Cuentas por Cobrar</h2>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Reservas y pasadías con saldo pendiente · {rows.length} {rows.length === 1 ? "transacción" : "transacciones"}
        </div>
      </div>

      {/* KPIs principales */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${B.warning}` }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total CXC</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(totalCxc)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{filtered.length} de {rows.length}</div>
        </div>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${B.sky}` }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>B2B / Agencias</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(totalB2B)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{b2b.length} reservas</div>
        </div>
        <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${B.sand}` }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Directo / Walk-in</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(totalDir)}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{directo.length} reservas</div>
        </div>
      </div>

      {/* Aging buckets */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {buckets.map(b => (
          <div key={b.label} style={{ background: B.navyMid, borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${b.color}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{b.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: b.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(b.total)}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>· {b.count} reserv{b.count !== 1 ? "as" : "a"}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs de vista */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${B.navyLight}` }}>
        {[{ key: "detalle", label: "📋 Detalle" }, { key: "agrupada", label: "👥 Por Cliente / B2B" }].map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            style={{
              padding: "10px 20px", background: "none", border: "none", cursor: "pointer",
              color: view === t.key ? B.white : "rgba(255,255,255,0.45)",
              fontWeight: view === t.key ? 700 : 400, fontSize: 13,
              borderBottom: view === t.key ? `3px solid ${B.sky}` : "3px solid transparent",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="🔍 Buscar por nombre, ID, tipo..."
          style={{ flex: 1, minWidth: 220, padding: "9px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: "#fff", fontSize: 13, outline: "none" }} />
        <div style={{ display: "flex", background: B.navyMid, borderRadius: 8, padding: 3, gap: 2 }}>
          {[{ key: "todos", label: "Todos" }, { key: "b2b", label: "B2B" }, { key: "directo", label: "Directo" }].map(t => (
            <button key={t.key} onClick={() => setTipoFilter(t.key)}
              style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12,
                background: tipoFilter === t.key ? B.sky : "transparent",
                color: tipoFilter === t.key ? B.navy : "rgba(255,255,255,0.5)" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla CXC */}
      {view === "detalle" ? (loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>Sin saldos pendientes</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{rows.length === 0 ? "Todas las reservas están al día." : "Sin resultados con el filtro actual."}</div>
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${B.navyLight}`, background: B.navy }}>
                  {["ID", "Cliente", "Fecha", "Tipo", "Canal", "Total", "Abono", "Saldo", "Días", "Forma"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em",
                      textAlign: ["Total", "Abono", "Saldo"].includes(h) ? "right" : ["Días"].includes(h) ? "center" : "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const dias = aging(r.fecha);
                  const openReserva = () => window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "reservas", reservaId: r.id } }));
                  return (
                    <tr key={r.id} onClick={openReserva}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: B.sky, fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.id}</td>
                      <td style={{ padding: "10px 12px", fontSize: 13 }}>
                        <div style={{ fontWeight: 700 }}>{r.nombre || "—"}</div>
                        {r.telefono && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{r.telefono}</div>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>{r.fecha}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>
                        <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: B.sand, whiteSpace: "nowrap" }}>{r.tipo}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{r.canal || "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{COP(r.total)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 12, color: B.success }}>{COP(r.abono)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, fontWeight: 800, color: B.warning }}>{COP(r.saldo)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 11 }}>
                        <span style={{ background: agingColor(dias) + "22", color: agingColor(dias), borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>{dias}d</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{r.forma_pago || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${B.warning}`, background: B.navy }}>
                  <td colSpan={7} style={{ padding: "12px 12px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Total</td>
                  <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 16, fontWeight: 900, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(totalCxc)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )) : (
        /* ── Vista agrupada por Cliente / B2B ── */
        (() => {
          // Group filtered rows
          const groups = {};
          filtered.forEach(r => {
            // Group by: aliado_id if B2B, else by nombre (cliente directo)
            const key = r.aliado_id || `cliente::${(r.nombre || "Sin nombre").toLowerCase().trim()}`;
            if (!groups[key]) {
              const esB2B = !!r.aliado_id;
              const aliado = esB2B ? aliadosMap[r.aliado_id] : null;
              groups[key] = {
                key,
                esB2B,
                nombre: esB2B ? (aliado?.nombre || r.aliado_id) : (r.nombre || "Sin nombre"),
                tipo: esB2B ? (aliado?.tipo || "B2B") : "Directo",
                contacto: esB2B ? (aliado?.contacto || "") : (r.contacto || ""),
                tel: esB2B ? (aliado?.tel || "") : (r.telefono || ""),
                email: esB2B ? (aliado?.email || "") : "",
                reservas: [],
                total: 0,
                vencidas: 0,
              };
            }
            groups[key].reservas.push(r);
            groups[key].total += r.saldo || 0;
            if (aging(r.fecha) > 30) groups[key].vencidas += 1;
          });
          const grouped = Object.values(groups).sort((a, b) => b.total - a.total);

          if (grouped.length === 0) {
            return (
              <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.white, marginBottom: 4 }}>Sin saldos pendientes</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{rows.length === 0 ? "Todas las reservas están al día." : "Sin resultados con el filtro actual."}</div>
              </div>
            );
          }

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {grouped.map(g => {
                const isExp = expanded === g.key;
                return (
                  <div key={g.key} style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${isExp ? B.sky + "44" : B.navyLight}` }}>
                    {/* Header */}
                    <div onClick={() => setExpanded(isExp ? null : g.key)}
                      style={{ padding: "16px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: B.white }}>{g.nombre}</span>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: g.esB2B ? B.sky + "22" : B.sand + "22", color: g.esB2B ? B.sky : B.sand, fontWeight: 700, textTransform: "uppercase" }}>
                            {g.esB2B ? g.tipo : "Directo"}
                          </span>
                          {g.vencidas > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: B.danger + "22", color: B.danger, fontWeight: 700 }}>⚠ {g.vencidas} vencida{g.vencidas !== 1 ? "s" : ""}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                          {g.reservas.length} {g.reservas.length === 1 ? "factura" : "facturas"} pendiente{g.reservas.length !== 1 ? "s" : ""}
                          {g.contacto && ` · ${g.contacto}`}
                          {g.tel && ` · ${g.tel}`}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Saldo</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(g.total)}</div>
                      </div>
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, marginLeft: 8 }}>{isExp ? "▲" : "▼"}</span>
                    </div>

                    {/* Detalle de facturas */}
                    {isExp && (
                      <div style={{ borderTop: `1px solid ${B.navyLight}`, padding: "10px 20px 16px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 100px 90px 100px 110px 100px 70px", gap: 8,
                          fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 700, padding: "6px 4px", borderBottom: `1px solid rgba(255,255,255,0.06)`, marginBottom: 6 }}>
                          {!isMobile && <><span>ID / Tipo</span><span>Fecha</span><span style={{textAlign:"right"}}>Total</span><span style={{textAlign:"right"}}>Abono</span><span style={{textAlign:"right"}}>Saldo</span><span style={{textAlign:"center"}}>Días</span><span>Forma</span></>}
                        </div>
                        {g.reservas.map(r => {
                          const dias = aging(r.fecha);
                          const openReserva = () => window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "reservas", reservaId: r.id } }));
                          return (
                            <div key={r.id} onClick={openReserva}
                              style={{
                                display: isMobile ? "block" : "grid",
                                gridTemplateColumns: "1fr 100px 90px 100px 110px 100px 70px", gap: 8,
                                padding: "8px 4px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                                fontSize: 12, cursor: "pointer", transition: "background 0.15s",
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <div>
                                <div style={{ color: B.sky, fontFamily: "monospace", fontSize: 10 }}>{r.id}</div>
                                <div style={{ color: B.sand, fontSize: 12 }}>{r.tipo}</div>
                              </div>
                              <span style={{ color: "rgba(255,255,255,0.6)" }}>{r.fecha}</span>
                              <span style={{ textAlign: "right", color: "rgba(255,255,255,0.6)" }}>{COP(r.total)}</span>
                              <span style={{ textAlign: "right", color: B.success }}>{COP(r.abono)}</span>
                              <span style={{ textAlign: "right", fontWeight: 800, color: B.warning }}>{COP(r.saldo)}</span>
                              <span style={{ textAlign: "center" }}>
                                <span style={{ background: agingColor(dias) + "22", color: agingColor(dias), borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{dias}d</span>
                              </span>
                              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{r.forma_pago || "—"}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
        * Días = días desde la fecha de la reserva. Verde ≤7d · Amarillo ≤30d · Rojo &gt;30d<br />
        * Excluye reservas canceladas. Incluye todas las reservas con saldo pendiente sin importar el período.
      </div>
    </div>
  );
}
