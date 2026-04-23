// Bitácora de zarpes — histórico de todos los zarpes generados desde check-in
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B, fmtFecha } from "../brand";

const IS = { width: "100%", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const weekAgo = () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toLocaleDateString("en-CA"); };

export default function ZarpesLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fechaFrom, setFechaFrom] = useState(weekAgo());
  const [fechaTo, setFechaTo] = useState(today());
  const [search, setSearch] = useState("");
  const [filtroEmb, setFiltroEmb] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("zarpes_log")
      .select("*")
      .gte("fecha", fechaFrom).lte("fecha", fechaTo)
      .order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fechaFrom, fechaTo]);

  const embarcaciones = useMemo(() => {
    return ["", ...Array.from(new Set(rows.map(r => r.embarcacion_nombre).filter(Boolean))).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(r => {
      if (filtroEmb && r.embarcacion_nombre !== filtroEmb) return false;
      if (!q) return true;
      return [r.embarcacion_nombre, r.salida_nombre, r.salida_hora, r.zarpe_codigo, r.generado_por_nombre, r.generado_por_email]
        .filter(Boolean).some(v => v.toLowerCase().includes(q));
    });
  }, [rows, search, filtroEmb]);

  const kpis = useMemo(() => ({
    total: rows.length,
    paxTotal: rows.reduce((s, r) => s + (r.pax_total || 0), 0),
    colabsTotal: rows.reduce((s, r) => s + (r.colaboradores_count || 0), 0),
    embarcaciones: new Set(rows.map(r => r.embarcacion_nombre).filter(Boolean)).size,
  }), [rows]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: B.white, margin: 0 }}>Bitácora de Zarpes</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Registro histórico de todos los zarpes generados desde Check-in
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { label: "Zarpes",         value: kpis.total,          color: B.sky },
          { label: "Pasajeros",      value: kpis.paxTotal,       color: B.sand },
          { label: "Colaboradores",  value: kpis.colabsTotal,    color: B.pink },
          { label: "Embarcaciones",  value: kpis.embarcaciones,  color: B.success },
        ].map(k => (
          <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${k.color}`, minWidth: 180, flex: "1 1 180px" }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: B.white }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Rango</span>
          <input type="date" value={fechaFrom} onChange={e => setFechaFrom(e.target.value)} style={{ ...IS, width: 150 }} />
          <span style={{ color: "rgba(255,255,255,0.3)" }}>→</span>
          <input type="date" value={fechaTo} onChange={e => setFechaTo(e.target.value)} style={{ ...IS, width: 150 }} />
        </div>
        <input placeholder="🔍 Embarcación, código, usuario…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...IS, flex: "1 1 200px", minWidth: 180 }} />
        <select value={filtroEmb} onChange={e => setFiltroEmb(e.target.value)} style={{ ...IS, width: 200 }}>
          {embarcaciones.map(e => <option key={e} value={e}>{e === "" ? "Todas embarcaciones" : e}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ padding: 40, color: B.sand, textAlign: "center" }}>Cargando…</div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: B.navyLight }}>
                  {["Fecha", "Salida", "Embarcación", "Código", "Pasajeros", "Colabs.", "Generado por", "Hora envío"].map(h => (
                    <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.35)" }}>
                    {rows.length === 0 ? "Sin zarpes en el rango seleccionado" : "Sin coincidencias"}
                  </td></tr>
                )}
                {filtered.map(r => (
                  <tr key={r.id} onClick={() => setSelected(r)} style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px 14px", fontSize: 12 }}>{fmtFecha(r.fecha)}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: 600 }}>{r.salida_nombre || "—"}</div>
                      <div style={{ fontSize: 11, color: B.sand }}>{r.salida_hora || "—"}</div>
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 600 }}>{r.embarcacion_nombre || "—"}</td>
                    <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 12, color: r.zarpe_codigo ? B.sky : "rgba(255,255,255,0.3)" }}>
                      {r.zarpe_codigo || "pendiente"}
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: B.sand, fontWeight: 700 }}>{r.pax_total}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: r.colaboradores_count > 0 ? B.pink : "rgba(255,255,255,0.3)", fontWeight: 700 }}>{r.colaboradores_count}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12 }}>
                      <div>{r.generado_por_nombre || "—"}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{r.generado_por_email || ""}</div>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {new Date(r.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            Mostrando {filtered.length} de {rows.length} zarpes
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {selected && <DetalleModal r={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DetalleModal({ r, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, width: 640, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Zarpe</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: B.white }}>
              {r.embarcacion_nombre} — {r.salida_hora}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              {fmtFecha(r.fecha)} · Código {r.zarpe_codigo || "pendiente"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "16px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16, fontSize: 13 }}>
            <InfoRow k="Salida" v={r.salida_nombre} />
            <InfoRow k="Hora" v={r.salida_hora} />
            <InfoRow k="Total pax" v={r.pax_total} />
            <InfoRow k="Colaboradores" v={r.colaboradores_count} />
            <InfoRow k="Generado por" v={r.generado_por_nombre || r.generado_por_email} />
            <InfoRow k="Timestamp" v={new Date(r.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })} />
          </div>

          {/* Pasajeros */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
              🧳 Pasajeros ({(r.pasajeros || []).length})
            </div>
            <div style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", maxHeight: 200, overflowY: "auto" }}>
              {(r.pasajeros || []).length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Sin pasajeros</div>
              ) : (r.pasajeros || []).map((p, i) => (
                <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: i < r.pasajeros.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", display: "flex", justifyContent: "space-between" }}>
                  <span><strong>{p.nombre || "—"}</strong></span>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>{p.identificacion || "—"} · {p.nacionalidad || "—"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Colaboradores */}
          {(r.colaboradores || []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
                👥 Tripulación / Colaboradores ({(r.colaboradores || []).length})
              </div>
              <div style={{ background: B.navy, borderRadius: 8, padding: "10px 14px" }}>
                {(r.colaboradores || []).map((c, i) => (
                  <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: i < r.colaboradores.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", display: "flex", justifyContent: "space-between" }}>
                    <span><strong>{c.nombre || "—"}</strong></span>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>{c.cedula || "—"} · {c.rol || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${B.navyLight}40` }}>
      <span style={{ color: "rgba(255,255,255,0.5)" }}>{k}</span>
      <span style={{ color: B.white, fontWeight: 500, textAlign: "right" }}>{v || "—"}</span>
    </div>
  );
}
