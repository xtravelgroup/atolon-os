// CustomerJourney — entender el flujo completo del cliente:
//   1. De dónde vienen (origen)
//   2. Cómo se mueven en el embudo (funnel por bucket)
//   3. Qué pasa con cada cliente individual (timeline drill-down)
//   4. Métricas comparativas entre buckets (resumen ejecutivo)

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";
import { useMobile } from "../lib/useMobile";
import {
  calcularFunnelPorOrigen, construirTimeline, calcularResumenEjecutivo,
  FUNNEL_STEPS,
} from "../lib/funnelAnalytics.js";
import { ORIGEN_LABELS, ORIGEN_BUCKETS } from "../lib/origenClassifier.js";

const BUCKET_COLORS = {
  grupo:     "#a855f7",   // purple
  whatsapp:  "#22c55e",   // green
  marketing: "#ec4899",   // pink
  staff:     "#f5c842",   // sand
  web:       "#38bdf8",   // sky
};

const IS = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${B.navyLight}`,
  color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box",
};
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

// ── Tab nav ──────────────────────────────────────────────────────────────────
function TabBar({ active, onChange }) {
  const tabs = [
    { key: "funnel",    label: "📊 Funnel por origen" },
    { key: "timeline",  label: "🔍 Customer Timeline" },
    { key: "resumen",   label: "📈 Resumen ejecutivo" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          background: active === t.key ? B.sand : "rgba(255,255,255,0.06)",
          color: active === t.key ? B.navy : B.white,
          border: `1px solid ${active === t.key ? B.sand : B.navyLight}`,
          borderRadius: 10, padding: "10px 18px", cursor: "pointer",
          fontSize: 13, fontWeight: 700,
        }}>{t.label}</button>
      ))}
    </div>
  );
}

// ── Vista 1: Funnel por Origen ───────────────────────────────────────────────
function FunnelView({ data }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>
      {data.map(bucket => (
        <FunnelCard key={bucket.bucket} bucket={bucket} />
      ))}
    </div>
  );
}

function FunnelCard({ bucket }) {
  const color = BUCKET_COLORS[bucket.bucket] || B.sky;
  const totalTop = bucket.total_sesiones;

  return (
    <div style={{ background: B.navyMid, borderRadius: 14, padding: 20, borderLeft: `4px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: B.white }}>{ORIGEN_LABELS[bucket.bucket]}</h3>
        <span style={{ fontSize: 11, color: B.sand }}>{bucket.convRate}% conv total</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {bucket.cascada.map((paso, idx) => {
          const widthPct = totalTop ? (paso.count / totalTop) * 100 : 0;
          const isWorst = bucket.mayor_abandono && bucket.mayor_abandono.paso === paso.paso;
          return (
            <div key={paso.paso}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 11, marginBottom: 2 }}>
                <span style={{ color: isWorst ? B.warning : "rgba(255,255,255,0.7)" }}>
                  {paso.paso}. {paso.label}
                </span>
                <span style={{ color: B.white, fontWeight: 600 }}>
                  {paso.count}
                  {idx > 0 && paso.dropoff > 0 && (
                    <span style={{ color: isWorst ? B.warning : "rgba(255,255,255,0.4)", marginLeft: 6, fontSize: 10 }}>
                      −{paso.dropoff}%
                    </span>
                  )}
                </span>
              </div>
              <div style={{ height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${widthPct}%`,
                  background: isWorst ? B.warning : color,
                  transition: "width 0.3s",
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Outcome: reservas + check-in */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${B.navyLight}`, display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 9 }}>Reservas</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: B.success }}>{bucket.reservas}</div>
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 9 }}>Check-in</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: B.sand }}>{bucket.checkIn}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 9 }}>Ingreso</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: color }}>${(bucket.ingreso / 1_000_000).toFixed(1)}M</div>
        </div>
      </div>

      {bucket.mayor_abandono && bucket.mayor_abandono.dropoff > 20 && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(232,160,32,0.1)", border: "1px solid rgba(232,160,32,0.3)", borderRadius: 8, fontSize: 11, color: B.warning }}>
          ⚠️ Mayor abandono: <strong>{bucket.mayor_abandono.label}</strong> (−{bucket.mayor_abandono.dropoff}%)
        </div>
      )}
    </div>
  );
}

// ── Vista 2: Customer Timeline ───────────────────────────────────────────────
function TimelineView({ buscar }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);

  const onSearch = async () => {
    if (!query || query.length < 3) return;
    setLoading(true);
    const q = query.trim();
    // Buscar en huespedes + reservas (por email, telefono o nombre)
    const isEmail = q.includes("@");
    const isPhone = /^\+?\d{7,}$/.test(q.replace(/\s/g, ""));
    let q1;
    if (isEmail) {
      q1 = supabase.from("reservas").select("id, nombre, email, telefono, total, estado, canal, created_at").ilike("email", `%${q}%`).order("created_at", { ascending: false }).limit(20);
    } else if (isPhone) {
      q1 = supabase.from("reservas").select("id, nombre, email, telefono, total, estado, canal, created_at").ilike("telefono", `%${q.replace(/\s/g, "")}%`).order("created_at", { ascending: false }).limit(20);
    } else {
      q1 = supabase.from("reservas").select("id, nombre, email, telefono, total, estado, canal, created_at").ilike("nombre", `%${q}%`).order("created_at", { ascending: false }).limit(20);
    }
    const { data } = await q1;
    setResults(data || []);
    setLoading(false);
  };

  const cargarTimeline = async (cliente) => {
    setSelected(cliente);
    setLoading(true);
    // Por email: reservas + sesiones (si hay match por usuario_id futuro) + WA mensajes
    const email = (cliente.email || "").toLowerCase();
    const telefono = (cliente.telefono || "").replace(/\s/g, "");
    const [resRes, sesRes, evtRes, waRes] = await Promise.all([
      supabase.from("reservas").select("*").or(email ? `email.ilike.%${email}%,contacto.ilike.%${email}%` : `id.eq.${cliente.id}`).order("created_at", { ascending: false }),
      // No tenemos forma directa de mapear sesiones a un email (track_sesiones tiene usuario_id no email).
      // Por ahora dejamos vacío. Una mejora futura: join via track_atribuciones.
      Promise.resolve({ data: [] }),
      Promise.resolve({ data: [] }),
      telefono ? supabase.from("wa_mensajes").select("conversacion_id, contenido, body, timestamp, created_at").ilike("telefono", `%${telefono}%`).limit(50) : Promise.resolve({ data: [] }),
    ]);
    const items = construirTimeline({
      sesiones: sesRes.data || [],
      eventos: evtRes.data || [],
      reservas: resRes.data || [],
      waMensajes: waRes.data || [],
    });
    setTimeline(items);
    setLoading(false);
  };

  return (
    <div>
      {/* Buscador */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <label style={LS}>🔍 Buscar cliente</label>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <input
            type="search"
            placeholder="Email · teléfono · nombre del cliente…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onSearch()}
            style={{ ...IS, flex: 1 }}
          />
          <button onClick={onSearch} disabled={loading} style={{
            background: B.sky, color: B.navy, border: "none", borderRadius: 8,
            padding: "9px 22px", cursor: "pointer", fontWeight: 700,
          }}>{loading ? "Buscando…" : "Buscar"}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
        {/* Resultados */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 12, maxHeight: 600, overflowY: "auto" }}>
          <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Resultados ({results.length})
          </div>
          {results.length === 0 && (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, padding: "20px 0", textAlign: "center" }}>
              Busca para empezar
            </div>
          )}
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => cargarTimeline(r)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: selected?.id === r.id ? "rgba(56,189,248,0.1)" : "transparent",
                border: `1px solid ${selected?.id === r.id ? B.sky : "rgba(255,255,255,0.06)"}`,
                borderRadius: 8, padding: "10px 12px", marginBottom: 6,
                cursor: "pointer", color: B.white,
              }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.nombre || "—"}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                {r.email || r.telefono || r.id}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                {r.canal} · {r.estado} · ${(r.total || 0).toLocaleString("es-CO")}
              </div>
            </button>
          ))}
        </div>

        {/* Timeline */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, minHeight: 400 }}>
          {!selected ? (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: 60 }}>
              Selecciona un cliente para ver su journey completo
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${B.navyLight}` }}>
                <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 0.5 }}>Timeline</div>
                <div style={{ fontSize: 20, color: B.white, fontWeight: 700, marginTop: 4 }}>{selected.nombre}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                  {selected.email || "—"} · {selected.telefono || "—"}
                </div>
              </div>
              {loading ? (
                <div style={{ color: B.sand, textAlign: "center", padding: 40 }}>Cargando timeline…</div>
              ) : timeline.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", padding: 40 }}>Sin eventos registrados</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "relative" }}>
                  <div style={{ position: "absolute", left: 16, top: 4, bottom: 4, width: 2, background: B.navyLight }} />
                  {timeline.map((item, idx) => (
                    <TimelineItem key={idx} item={item} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ item }) {
  const colorMap = {
    success: B.success,
    warning: B.warning,
    info:    B.sky,
  };
  const c = colorMap[item.color] || B.sky;
  const fecha = new Date(item.ts).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ display: "flex", gap: 14, position: "relative", paddingLeft: 0 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 16,
        background: B.navyMid, border: `2px solid ${c}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, flexShrink: 0, zIndex: 1,
      }}>{item.icon}</div>
      <div style={{ flex: 1, paddingTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: B.white }}>{item.titulo}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>{fecha}</span>
        </div>
        {item.descripcion && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{item.descripcion}</div>
        )}
      </div>
    </div>
  );
}

// ── Vista 3: Resumen Ejecutivo ───────────────────────────────────────────────
function ResumenView({ data }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 14, padding: 20, overflowX: "auto" }}>
      <table width="100%" cellPadding={0} cellSpacing={0} style={{ fontSize: 13, minWidth: 720 }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.04)" }}>
            <th style={thStyle}>Origen</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Visitas</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Reservas</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Conv %</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Ticket promedio</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Ingreso total</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Repeat rate</th>
            <th style={thStyle}>Top abandono</th>
          </tr>
        </thead>
        <tbody>
          {data.map(b => {
            const conv = b.sesiones ? ((b.reservas / b.sesiones) * 100).toFixed(1) : "—";
            const color = BUCKET_COLORS[b.bucket] || B.sky;
            return (
              <tr key={b.bucket} style={{ borderTop: `1px solid ${B.navyLight}33` }}>
                <td style={{ ...tdStyle, borderLeft: `3px solid ${color}` }}>
                  <strong>{ORIGEN_LABELS[b.bucket]}</strong>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{b.sesiones}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: B.success, fontWeight: 600 }}>{b.reservas}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{conv}%</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{b.avgTicket > 0 ? COP(b.avgTicket) : "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right", color, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15 }}>
                  ${(b.ingresoTotal / 1_000_000).toFixed(2)}M
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {b.repeatRate > 0
                    ? <span style={{ color: b.repeatRate > 25 ? B.success : B.white }}>{b.repeatRate}%</span>
                    : <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}
                </td>
                <td style={{ ...tdStyle, fontSize: 11, color: B.warning }}>
                  {b.topDropoff ? `${b.topDropoff.label} (−${b.topDropoff.dropoff}%)` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 16, fontStyle: "italic" }}>
        💡 <strong>Repeat rate</strong>: % de clientes únicos con 2+ reservas en el período.
        <strong> Top abandono</strong>: paso del embudo con mayor drop-off por bucket.
      </div>
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "12px 14px", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 };
const tdStyle = { padding: "12px 14px", color: B.white, fontSize: 13 };

// ── Main module ──────────────────────────────────────────────────────────────
export default function CustomerJourney() {
  const isMobile = useMobile();
  const [tab, setTab] = useState("funnel");
  const [periodo, setPeriodo] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [funnelData, setFunnelData] = useState([]);
  const [resumenData, setResumenData] = useState([]);

  const rango = useMemo(() => {
    const hasta = new Date().toISOString();
    const dias = periodo === "7d" ? 7 : periodo === "30d" ? 30 : 90;
    const desde = new Date(Date.now() - dias * 86400 * 1000).toISOString();
    return { desde, hasta };
  }, [periodo]);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [sesRes, embRes, resRes] = await Promise.all([
      supabase.from("track_sesiones").select("id, usuario_id, canal, utms, referrer, origen_tipo, duracion_seg, convertida, created_at").gte("created_at", rango.desde).lte("created_at", rango.hasta),
      supabase.from("track_embudos").select("sesion_id, paso_1_ts, paso_2_ts, paso_3_ts, paso_4_ts, paso_5_ts, paso_6_ts").gte("created_at", rango.desde).lte("created_at", rango.hasta),
      supabase.from("reservas").select("id, canal, estado, total, email, contacto, grupo_id, vendedor, aliado_id, fecha_pago, created_at, updated_at").gte("created_at", rango.desde).lte("created_at", rango.hasta),
    ]);
    const sesiones = sesRes.data || [];
    const embudos  = embRes.data || [];
    const reservas = resRes.data || [];
    setFunnelData(calcularFunnelPorOrigen({ sesiones, embudos, reservas }));
    setResumenData(calcularResumenEjecutivo({ sesiones, embudos, reservas }));
    setLoading(false);
  }, [rango.desde, rango.hasta]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ padding: isMobile ? 16 : 24, color: B.white, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, color: B.sand, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>
          🧭 Customer Journey
        </h1>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
          De dónde vienen tus clientes y qué pasa con ellos
        </div>
      </div>

      {/* Período + tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <TabBar active={tab} onChange={setTab} />
        <div style={{ display: "flex", gap: 6 }}>
          {[["7d","7 días"],["30d","30 días"],["90d","90 días"]].map(([k, label]) => (
            <button key={k} onClick={() => setPeriodo(k)} style={{
              background: periodo === k ? B.sand : "rgba(255,255,255,0.06)",
              color: periodo === k ? B.navy : B.white,
              border: `1px solid ${periodo === k ? B.sand : B.navyLight}`,
              borderRadius: 8, padding: "7px 14px", cursor: "pointer",
              fontSize: 12, fontWeight: 600,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading && tab !== "timeline" ? (
        <div style={{ textAlign: "center", padding: 60, color: B.sand }}>Cargando datos…</div>
      ) : tab === "funnel" ? (
        <FunnelView data={funnelData} />
      ) : tab === "timeline" ? (
        <TimelineView />
      ) : (
        <ResumenView data={resumenData} />
      )}
    </div>
  );
}
