// Módulo "Eventos: Cotizado vs Real" — Control financiero
// =============================================================
// Vista para super_admin / contabilidad / auditor.
// Lista eventos con su análisis de varianza y banderas.
//
// Permite detectar:
//   - Eventos que no registraron consumo A&B (proceso roto)
//   - Eventos subfacturados (pagado < 70% cotizado)
//   - Sobreconsumo (>110% lo cotizado)
//   - Items consumidos sin precio en Loggro

import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive";
import {
  pagePadding, cardPadding, sectionCard, tableWrapper,
  inputStyle, btnPrimary, btnSecondary,
  flexRow, labelStyle, T, S, TOUCH_TARGET,
} from "../lib/responsive";
import { variance, FLAG_DESC } from "../lib/eventoVariance";

const fmt$ = n => (Number(n) || 0).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const fmtPct = (p) => p === null || p === undefined ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
const fmtDate = s => s ? new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const FLAG_TONES = {
  FLAG_NO_CONSUMO:    { color: "#fca5a5", bg: "rgba(239,68,68,0.15)" },
  FLAG_SUB_PAGO:      { color: "#fca5a5", bg: "rgba(239,68,68,0.15)" },
  FLAG_SOBRE_CONSUMO: { color: "#fbbf24", bg: "rgba(245,158,11,0.15)" },
  FLAG_COSTO_CERO:    { color: "#fbbf24", bg: "rgba(245,158,11,0.15)" },
};

export default function EventosVariance() {
  const { isMobile } = useBreakpoint();
  const [eventos, setEventos]       = useState([]);
  const [consumoIdx, setConsumoIdx] = useState({}); // evento_id → rows
  const [loading, setLoading]       = useState(true);
  const [filtro, setFiltro]         = useState("flagged"); // flagged | todos | pasados | futuros
  const [meses, setMeses]           = useState(6);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [meses]);

  async function load() {
    setLoading(true);
    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - meses);
    const sinceIso = sinceDate.toISOString();

    const { data: evs } = await supabase
      .from("eventos")
      .select("id,nombre,fecha,valor,valor_extras,cotizacion_data,pagos,empresa,vendedor")
      .gte("fecha", sinceIso)
      .order("fecha", { ascending: false });

    const ids = (evs || []).map(e => e.id);
    let idx = {};
    if (ids.length) {
      // Cargar consumo en chunks de 100 para no reventar el .in()
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));
      const results = await Promise.all(chunks.map(c =>
        supabase.from("eventos_consumo_openbar")
          .select("evento_id,cantidad,costo_total,anulado")
          .in("evento_id", c)
      ));
      results.forEach(({ data }) => {
        (data || []).forEach(r => {
          if (!idx[r.evento_id]) idx[r.evento_id] = [];
          idx[r.evento_id].push(r);
        });
      });
    }
    setEventos(evs || []);
    setConsumoIdx(idx);
    setLoading(false);
  }

  const eventosConVar = useMemo(() => {
    return eventos.map(e => ({ evento: e, v: variance(e, consumoIdx[e.id] || []) }));
  }, [eventos, consumoIdx]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return eventosConVar.filter(({ evento, v }) => {
      if (filtro === "flagged") return v.flags.length > 0;
      if (filtro === "pasados") return evento.fecha && new Date(evento.fecha).getTime() < now;
      if (filtro === "futuros") return evento.fecha && new Date(evento.fecha).getTime() >= now;
      return true;
    }).sort((a, b) => {
      // Severidad: danger > warning > ok; dentro de cada grupo, por valor cotizado desc
      const w = x => x.v.estado === "danger" ? 0 : x.v.estado === "warning" ? 1 : 2;
      const dw = w(a) - w(b);
      if (dw !== 0) return dw;
      return (b.v.cotizado.total || 0) - (a.v.cotizado.total || 0);
    });
  }, [eventosConVar, filtro]);

  // KPIs
  const kpis = useMemo(() => {
    const acc = { total_cotizado: 0, total_pagado: 0, total_consumido: 0, n_eventos: 0, n_flagged: 0, n_no_consumo: 0, n_sub_pago: 0, n_sobre_con: 0, n_costo_cero: 0 };
    eventosConVar.forEach(({ v }) => {
      acc.total_cotizado  += v.cotizado.total;
      acc.total_pagado    += v.pagado;
      acc.total_consumido += v.consumido.total;
      acc.n_eventos += 1;
      if (v.flags.length) acc.n_flagged += 1;
      if (v.flags.includes("FLAG_NO_CONSUMO")) acc.n_no_consumo += 1;
      if (v.flags.includes("FLAG_SUB_PAGO")) acc.n_sub_pago += 1;
      if (v.flags.includes("FLAG_SOBRE_CONSUMO")) acc.n_sobre_con += 1;
      if (v.flags.includes("FLAG_COSTO_CERO")) acc.n_costo_cero += 1;
    });
    return acc;
  }, [eventosConVar]);

  function exportCSV() {
    const rows = [
      ["ID", "Evento", "Fecha", "Empresa", "Vendedor",
       "Cotizado total", "Cotizado A&B", "Pagado", "Consumo A&B real",
       "Δ Pagado-Cotizado", "Δ %", "Δ Consumido-A&B", "Δ %", "Flags"]
    ];
    eventosConVar.forEach(({ evento, v }) => {
      rows.push([
        evento.id, evento.nombre, evento.fecha?.slice(0, 10),
        evento.empresa || "", evento.vendedor || "",
        v.cotizado.total, v.cotizado.alimentos, v.pagado, v.consumido.total,
        v.dif_pag_vs_cot, v.dif_pag_vs_cot_pct?.toFixed(1) || "",
        v.dif_con_vs_ab, v.dif_con_vs_ab_pct?.toFixed(1) || "",
        v.flags.join("|"),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eventos-variance-${meses}m-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ ...pagePadding({ isMobile }), color: B.fg }}>
      <div style={{ marginBottom: S.lg }}>
        <h1 style={{ fontSize: T.h1, margin: 0, fontWeight: 700 }}>Eventos: Cotizado vs Real</h1>
        <p style={{ color: B.fgMuted, fontSize: T.sm, marginTop: 6 }}>
          Análisis de varianza entre lo cotizado, lo pagado y lo consumido. Detecta procesos rotos, subfacturación y sobreconsumo.
        </p>
      </div>

      {/* Controls */}
      <div style={{ ...flexRow({ isMobile, gap: 12 }), marginBottom: S.lg, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 140 }}>
          <label style={labelStyle}>Ventana</label>
          <select value={meses} onChange={e => setMeses(Number(e.target.value))} style={inputStyle({ isMobile })}>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Último año</option>
            <option value={24}>Últimos 2 años</option>
            <option value={120}>Todo</option>
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={labelStyle}>Filtro</label>
          <select value={filtro} onChange={e => setFiltro(e.target.value)} style={inputStyle({ isMobile })}>
            <option value="flagged">Solo con banderas ({kpis.n_flagged})</option>
            <option value="todos">Todos ({kpis.n_eventos})</option>
            <option value="pasados">Pasados</option>
            <option value="futuros">Futuros</option>
          </select>
        </div>
        <div style={{ marginLeft: isMobile ? 0 : "auto" }}>
          <button onClick={exportCSV} style={{ ...btnSecondary({ isMobile }) }}>📥 Exportar CSV</button>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: S.md, marginBottom: S.lg }}>
        <KPI label="Cotizado" value={fmt$(kpis.total_cotizado)} tone="neutral" />
        <KPI label="Pagado" value={fmt$(kpis.total_pagado)} subtitle={kpis.total_cotizado ? `${((kpis.total_pagado/kpis.total_cotizado)*100).toFixed(0)}% del cotizado` : null} tone={kpis.total_pagado >= kpis.total_cotizado * 0.95 ? "ok" : "warn"} />
        <KPI label="Consumo A&B real" value={fmt$(kpis.total_consumido)} tone="neutral" />
        <KPI label="Banderas" value={kpis.n_flagged} subtitle={`${kpis.n_no_consumo} sin consumo · ${kpis.n_sub_pago} sub-pago`} tone={kpis.n_flagged ? "danger" : "ok"} />
      </div>

      {loading ? (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center" }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), textAlign: "center", color: B.fgMuted }}>
          {filtro === "flagged" ? "🎉 Cero banderas en esta ventana" : "Sin eventos en el filtro elegido"}
        </div>
      ) : isMobile ? (
        // Mobile: cards
        <div style={{ display: "grid", gap: S.sm }}>
          {filtered.map(({ evento, v }) => (
            <EventoCard key={evento.id} evento={evento} v={v} />
          ))}
        </div>
      ) : (
        // Desktop: table
        <div style={tableWrapper}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.sm }}>
            <thead style={{ background: "rgba(255,255,255,0.04)" }}>
              <tr>
                {["Evento", "Fecha", "Cotizado", "Pagado", "Δ %", "Cotiz A&B", "Consumo real", "Δ %", "Banderas"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${B.border}`, color: B.fgMuted, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ evento, v }) => (
                <tr key={evento.id} style={{
                  borderBottom: `1px solid ${B.border}`,
                  background: v.estado === "danger" ? "rgba(239,68,68,0.06)"
                            : v.estado === "warning" ? "rgba(245,158,11,0.04)" : "transparent",
                }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{evento.nombre}</div>
                    {evento.empresa && <div style={{ fontSize: 11, color: B.fgMuted }}>{evento.empresa}</div>}
                  </td>
                  <td style={td}>{fmtDate(evento.fecha)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmt$(v.cotizado.total)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmt$(v.pagado)}</td>
                  <td style={{ ...td, textAlign: "right", color: v.dif_pag_vs_cot < 0 ? "#fca5a5" : B.fg }}>
                    {fmtPct(v.dif_pag_vs_cot_pct)}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{fmt$(v.cotizado.alimentos)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmt$(v.consumido.total)}</td>
                  <td style={{ ...td, textAlign: "right", color: v.dif_con_vs_ab > 0 ? "#fbbf24" : B.fg }}>
                    {fmtPct(v.dif_con_vs_ab_pct)}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {v.flags.map(f => (
                        <span key={f} title={FLAG_DESC[f]} style={{
                          padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                          background: FLAG_TONES[f]?.bg, color: FLAG_TONES[f]?.color,
                        }}>{f.replace("FLAG_", "")}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda */}
      <div style={{ ...sectionCard({ isMobile }), padding: cardPadding({ isMobile }), marginTop: S.lg }}>
        <h3 style={{ marginTop: 0, fontSize: T.base }}>Leyenda de banderas</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {Object.entries(FLAG_DESC).map(([f, d]) => (
            <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{
                padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: FLAG_TONES[f]?.bg, color: FLAG_TONES[f]?.color,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>{f.replace("FLAG_", "")}</span>
              <span style={{ color: B.fgMuted, fontSize: T.sm }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const td = { padding: "10px 12px", verticalAlign: "top" };

function KPI({ label, value, subtitle, tone = "neutral" }) {
  const colors = {
    ok:      { border: "rgba(34,197,94,0.3)",  bg: "rgba(34,197,94,0.08)",  fg: "#86efac" },
    warn:    { border: "rgba(245,158,11,0.3)", bg: "rgba(245,158,11,0.08)", fg: "#fbbf24" },
    danger:  { border: "rgba(239,68,68,0.3)",  bg: "rgba(239,68,68,0.08)",  fg: "#fca5a5" },
    neutral: { border: "rgba(255,255,255,0.1)", bg: "rgba(255,255,255,0.03)", fg: "#fff"  },
  }[tone];
  return (
    <div style={{ padding: 16, borderRadius: 12, border: `1px solid ${colors.border}`, background: colors.bg }}>
      <div style={{ fontSize: T.xs, color: B.fgMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: T.h2, fontWeight: 800, color: colors.fg, marginTop: 4 }}>{value}</div>
      {subtitle && <div style={{ fontSize: T.xs, color: B.fgMuted, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function EventoCard({ evento, v }) {
  const borderColor = v.estado === "danger" ? "rgba(239,68,68,0.4)"
                    : v.estado === "warning" ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.1)";
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${borderColor}`, borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{evento.nombre}</div>
          <div style={{ fontSize: 11, color: B.fgMuted }}>{fmtDate(evento.fecha)} · {evento.empresa || "—"}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10, fontSize: T.xs }}>
        <Cell label="Cotizado" v={fmt$(v.cotizado.total)} />
        <Cell label="Pagado" v={fmt$(v.pagado)} delta={fmtPct(v.dif_pag_vs_cot_pct)} />
        <Cell label="Cotiz A&B" v={fmt$(v.cotizado.alimentos)} />
        <Cell label="Consumo real" v={fmt$(v.consumido.total)} delta={fmtPct(v.dif_con_vs_ab_pct)} />
      </div>
      {v.flags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
          {v.flags.map(f => (
            <span key={f} title={FLAG_DESC[f]} style={{
              padding: "3px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: FLAG_TONES[f]?.bg, color: FLAG_TONES[f]?.color,
            }}>{f.replace("FLAG_", "")}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({ label, v, delta }) {
  return (
    <div>
      <div style={{ color: B.fgMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{v}</div>
      {delta && <div style={{ fontSize: 10, color: B.fgMuted }}>{delta}</div>}
    </div>
  );
}
