import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const B = {
  navy: "#0a1628", navyMid: "#0f1f3d", navyLight: "#1a2f52",
  sky: "#38bdf8", sand: "#f5c842", success: "#22c55e",
  danger: "#ef4444", pink: "#ec4899", purple: "#a855f7",
  text: "#e2e8f0", muted: "rgba(255,255,255,0.45)",
};

export default function Analitica() {
  const [periodo, setPeriodo] = useState("7d");
  const [stats, setStats] = useState(null);
  const [sesiones, setSesiones] = useState([]);
  const [embudos, setEmbudos] = useState([]);
  const [canales, setCanales] = useState([]);
  const [topEventos, setTopEventos] = useState([]);
  const [atribuciones, setAtribuciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const periodos = [
    { val: "1d", label: "Hoy" },
    { val: "7d", label: "7 días" },
    { val: "30d", label: "30 días" },
    { val: "90d", label: "90 días" },
  ];

  useEffect(() => { fetchAll(); }, [periodo]);

  async function fetchAll() {
    setLoading(true);
    const dias = parseInt(periodo);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();

    const [sesRes, embRes, ingRes, evRes, atribRes] = await Promise.all([
      supabase.from("track_sesiones").select("*").gte("created_at", desde),
      supabase.from("track_embudos").select("*").gte("created_at", desde),
      supabase.from("track_ingresos").select("*").gte("created_at", desde),
      supabase.from("track_eventos").select("tipo, categoria").gte("ts", desde),
      supabase.from("track_atribuciones").select("canal, valor").gte("created_at", desde),
    ]);

    const sesList = sesRes.data || [];
    const embList = embRes.data || [];
    const ingList = ingRes.data || [];
    const evList  = evRes.data  || [];

    // KPIs
    const totalSesiones = sesList.length;
    const sesConv = sesList.filter(s => s.convertida).length;
    const tasaConv = totalSesiones ? ((sesConv / totalSesiones) * 100).toFixed(1) : "0.0";
    const ingresoTotal = ingList.reduce((s, i) => s + (i.monto || 0), 0);
    const ticketPromedio = sesConv ? (ingresoTotal / sesConv).toFixed(0) : 0;
    const durPromedio = sesList.length
      ? (sesList.reduce((s, x) => s + (x.duracion_seg || 0), 0) / sesList.length).toFixed(0)
      : 0;

    setStats({ totalSesiones, sesConv, tasaConv, ingresoTotal, ticketPromedio, durPromedio });

    // Canales
    const canalMap = {};
    sesList.forEach(s => {
      const c = s.canal || "directo";
      if (!canalMap[c]) canalMap[c] = { sesiones: 0, conversiones: 0, ingreso: 0 };
      canalMap[c].sesiones++;
      if (s.convertida) { canalMap[c].conversiones++; canalMap[c].ingreso += s.ingreso || 0; }
    });
    const canalArr = Object.entries(canalMap)
      .map(([canal, d]) => ({ canal, ...d, tasa: d.sesiones ? ((d.conversiones / d.sesiones) * 100).toFixed(1) : "0.0" }))
      .sort((a, b) => b.ingreso - a.ingreso);
    setCanales(canalArr);

    // Embudo pasos
    const total = embList.length || 1;
    const pasos = [1,2,3,4,5,6].map(p => ({
      paso: p,
      label: ["Vio widget","Eligió fecha","Eligió paquete","Datos personales","Llegó a pago","Completó pago"][p-1],
      count: embList.filter(e => e[`paso_${p}_ts`]).length,
    }));
    setEmbudos(pasos);

    // Top eventos
    const evMap = {};
    evList.forEach(e => {
      const k = e.tipo;
      evMap[k] = (evMap[k] || 0) + 1;
    });
    const evArr = Object.entries(evMap).map(([tipo, count]) => ({ tipo, count })).sort((a,b) => b.count - a.count).slice(0, 10);
    setTopEventos(evArr);

    // Atribución por canal
    const atribList = atribRes.data || [];
    const atribMap = {};
    atribList.forEach(a => {
      const c = a.canal || "directo";
      if (!atribMap[c]) atribMap[c] = 0;
      atribMap[c] += a.valor || 0;
    });
    const atribArr = Object.entries(atribMap)
      .map(([canal, valor]) => ({ canal, valor }))
      .sort((a, b) => b.valor - a.valor);
    setAtribuciones(atribArr);

    setSesiones(sesList.slice(-50).reverse());
    setLoading(false);
  }

  const fmt = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  if (loading && !stats) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: B.muted }}>
      Cargando analítica...
    </div>
  );

  const KPI = ({ label, value, sub, color }) => (
    <div style={{ background: B.navyMid, borderRadius: 14, padding: "20px 24px", border: `1px solid rgba(255,255,255,0.07)` }}>
      <div style={{ fontSize: 12, color: B.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ padding: "24px", fontFamily: "'Inter','Segoe UI',sans-serif", color: B.text, minHeight: "100vh", background: B.navy }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff" }}>📊 AtolonTrack</h1>
          <div style={{ fontSize: 13, color: B.muted, marginTop: 4 }}>Analítica de conversión en tiempo real</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {periodos.map(p => (
            <button key={p.val} onClick={() => setPeriodo(p.val)}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: periodo === p.val ? B.sky : B.navyLight, color: periodo === p.val ? B.navy : B.text }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
          <KPI label="Sesiones" value={stats.totalSesiones.toLocaleString("es-CO")} />
          <KPI label="Conversiones" value={stats.sesConv} color={B.success} />
          <KPI label="Tasa Conversión" value={`${stats.tasaConv}%`} color={stats.tasaConv >= 3 ? B.success : B.sand} />
          <KPI label="Ingresos Totales" value={fmt(stats.ingresoTotal)} color={B.sky} />
          <KPI label="Ticket Promedio" value={fmt(stats.ticketPromedio)} />
          <KPI label="Duración Promedio" value={`${Math.floor(stats.durPromedio / 60)}m ${stats.durPromedio % 60}s`} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Embudo */}
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)" }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>🔽 Embudo de Conversión</h3>
          {embudos.map((p, i) => {
            const maxCount = embudos[0]?.count || 1;
            const pct = maxCount ? ((p.count / maxCount) * 100) : 0;
            const dropPct = i > 0 && embudos[i-1].count ? (((embudos[i-1].count - p.count) / embudos[i-1].count) * 100).toFixed(0) : null;
            return (
              <div key={p.paso} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: B.muted }}>{p.label}</span>
                  <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>
                    {p.count.toLocaleString("es-CO")}
                    {dropPct && <span style={{ color: B.danger, marginLeft: 8 }}>-{dropPct}%</span>}
                  </span>
                </div>
                <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: p.paso === 6 ? B.success : B.sky, borderRadius: 4, transition: "width 0.5s" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Canales */}
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)" }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>📡 Canales de Adquisición</h3>
          {canales.length === 0 && <div style={{ color: B.muted, fontSize: 13 }}>Sin datos aún</div>}
          {canales.map(c => (
            <div key={c.canal} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{c.canal}</div>
                <div style={{ fontSize: 11, color: B.muted }}>{c.sesiones} sesiones · {c.tasa}% conv</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: B.sky }}>{fmt(c.ingreso)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Eventos */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>⚡ Eventos Más Frecuentes</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {topEventos.map(e => (
            <div key={e.tipo} style={{ background: B.navyLight, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: B.text }}>{e.tipo}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: B.sky }}>{e.count.toLocaleString("es-CO")}</span>
            </div>
          ))}
          {topEventos.length === 0 && <div style={{ color: B.muted, fontSize: 13 }}>Sin eventos registrados aún</div>}
        </div>
      </div>

      {/* Atribución por Canal */}
      {atribuciones.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>🎯 Atribución por Canal (Last Touch)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {atribuciones.map(a => (
              <div key={a.canal} style={{ background: B.navyLight, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: B.text }}>{a.canal}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: B.success }}>{fmt(a.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: B.muted, textAlign: "center" }}>
        AtolonTrack v1.0 · Datos actualizados en tiempo real desde Supabase
      </div>
    </div>
  );
}
