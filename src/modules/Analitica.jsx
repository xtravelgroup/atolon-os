import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const B = {
  navy: "#0a1628", navyMid: "#0f1f3d", navyLight: "#1a2f52",
  sky: "#38bdf8", sand: "#f5c842", success: "#22c55e",
  danger: "#ef4444", pink: "#ec4899", purple: "#a855f7",
  text: "#e2e8f0", muted: "rgba(255,255,255,0.45)",
};

// Normalize canal names so "WEB", "Web", "web" all map to the same bucket
function normCanal(raw) {
  const c = (raw || "").trim().toLowerCase();
  if (c === "web" || c === "widget" || c === "") return "Web";
  if (c === "whatsapp") return "WhatsApp";
  if (c === "b2b" || c === "agencia") return "B2B";
  if (c === "telefono" || c === "teléfono" || c === "phone") return "Teléfono";
  if (c === "directo" || c === "direct") return "Directo";
  if (c === "referido" || c === "referral") return "Referido";
  if (c === "sem_google") return "Google SEM";
  if (c === "seo_organico") return "SEO";
  if (c === "paid_social_meta") return "Meta Ads";
  if (c === "organic_social") return "Social Orgánico";
  if (c === "email") return "Email";
  // Capitalize first letter for anything else
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export default function Analitica() {
  const [periodo, setPeriodo] = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [pkgData, setPkgData] = useState([]);
  const [stats, setStats] = useState(null);
  const [sesiones, setSesiones] = useState([]);
  const [embudos, setEmbudos] = useState([]);
  const [canales, setCanales] = useState([]);
  const [topEventos, setTopEventos] = useState([]);
  const [atribuciones, setAtribuciones] = useState([]);
  const [atribFirstTouch, setAtribFirstTouch] = useState([]);
  const [abandonos, setAbandonos] = useState([]);
  const [abandonoRevenue, setAbandonoRevenue] = useState(0);
  const [geoData, setGeoData] = useState([]);
  const [paymentErrors, setPaymentErrors] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [retornoStats, setRetornoStats] = useState(null);
  const [dailyTrend, setDailyTrend] = useState([]);
  const [idiomas, setIdiomas] = useState([]);
  const [segmentos, setSegmentos] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionEvents, setSessionEvents] = useState([]);
  const [loadingJourney, setLoadingJourney] = useState(false);
  const [scrollStats, setScrollStats] = useState(null);
  const [exitIntents, setExitIntents] = useState(0);
  const [loading, setLoading] = useState(true);

  const periodos = [
    { val: "1d", label: "Hoy" },
    { val: "7d", label: "7 días" },
    { val: "30d", label: "30 días" },
    { val: "90d", label: "90 días" },
  ];

  useEffect(() => { if (periodo !== "custom" || (customFrom && customTo)) fetchAll(); }, [periodo, customFrom, customTo]);

  async function fetchAll() {
    setLoading(true);
    let desde;
    if (periodo === "custom" && customFrom) {
      desde = new Date(customFrom).toISOString();
    } else {
      const dias = parseInt(periodo);
      desde = new Date(Date.now() - dias * 86400000).toISOString();
    }
    const hasta = periodo === "custom" && customTo ? new Date(customTo + "T23:59:59").toISOString() : new Date().toISOString();

    const [sesRes, embRes, evRes, resConvRes, atribRes, abandRes, ingresosRes, usuariosRes] = await Promise.all([
      supabase.from("track_sesiones").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_embudos").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_eventos").select("tipo, categoria, datos, ts").gte("ts", desde).lte("ts", hasta),
      supabase.from("reservas").select("id, total, canal, tipo, created_at").eq("estado", "confirmado").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_atribuciones").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_abandonment").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_ingresos").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_usuarios").select("segmento, intent_score, value_score").not("segmento", "is", null).limit(500),
    ]);

    const sesList      = sesRes.data      || [];
    const embList      = embRes.data      || [];
    const evList       = evRes.data       || [];
    const atribList    = atribRes.data    || [];
    const abandList    = abandRes.data    || [];
    const ingresosList = ingresosRes.data || [];
    const usuariosList = usuariosRes.data || [];

    // Solo reservas originadas en el widget web — excluir ventas internas (equipo) y agencias
    const WEB_CANALES = ["Web", "Directo", "Referido", "WhatsApp", "Google SEM", "SEO", "Meta Ads", "Social Orgánico", "Email"];
    const resConvList = (resConvRes.data || []).filter(r => WEB_CANALES.includes(normCanal(r.canal)));

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const totalSesiones  = sesList.length;
    const usuariosUnicos = new Set(sesList.map(s => s.usuario_id).filter(Boolean)).size;
    const sesConv        = resConvList.length;
    // Tasa: reservas web / sesiones widget (solo canal WEB/directo/referido)
    const resWeb  = resConvList.filter(r => ["Web","Directo","Referido"].includes(normCanal(r.canal)));
    const tasaConv = usuariosUnicos ? ((resWeb.length / usuariosUnicos) * 100).toFixed(1) : "0.0";
    const ingresoTotal   = resConvList.reduce((s, r) => s + (r.total || 0), 0);
    const ticketPromedio = sesConv ? (ingresoTotal / sesConv).toFixed(0) : 0;
    const sesConDur      = sesList.filter(s => s.duracion_seg > 0);
    const durPromedio    = sesConDur.length
      ? (sesConDur.reduce((s, x) => s + x.duracion_seg, 0) / sesConDur.length).toFixed(0)
      : 0;
    const sesXUsuario = usuariosUnicos ? (totalSesiones / usuariosUnicos).toFixed(1) : "1.0";

    setStats({ totalSesiones, usuariosUnicos, sesConv, tasaConv, ingresoTotal, ticketPromedio, durPromedio, sesXUsuario });

    // ── Canales de Adquisición ────────────────────────────────────────────────
    // Sesiones por canal (widget), revenue por canal (desde reservas reales)
    const canalMap = {};
    sesList.forEach(s => {
      const c = normCanal(s.canal);
      if (!canalMap[c]) canalMap[c] = { sesiones: 0, conversiones: 0, ingreso: 0 };
      canalMap[c].sesiones++;
    });
    // Atribuir cada reserva confirmada a su canal según reservas.canal
    resConvList.forEach(r => {
      const c = normCanal(r.canal);
      if (!canalMap[c]) canalMap[c] = { sesiones: 0, conversiones: 0, ingreso: 0 };
      canalMap[c].conversiones++;
      canalMap[c].ingreso += r.total || 0;
    });
    const canalArr = Object.entries(canalMap)
      .map(([canal, d]) => ({
        canal, ...d,
        tasa: d.sesiones ? ((d.conversiones / d.sesiones) * 100).toFixed(1) : "—",
      }))
      .sort((a, b) => b.ingreso - a.ingreso);
    setCanales(canalArr);

    // ── Embudo de conversión ──────────────────────────────────────────────────
    const pasos = [1,2,3,4,5,6].map(p => ({
      paso: p,
      label: ["Vio widget","Eligió fecha","Eligió paquete","Datos personales","Llegó a pago","Completó pago"][p-1],
      count: embList.filter(e => e[`paso_${p}_ts`]).length,
    }));
    setEmbudos(pasos);

    // ── Top eventos ───────────────────────────────────────────────────────────
    const evMap = {};
    evList.forEach(e => { evMap[e.tipo] = (evMap[e.tipo] || 0) + 1; });
    setTopEventos(Object.entries(evMap).map(([tipo, count]) => ({ tipo, count })).sort((a,b) => b.count - a.count).slice(0, 10));

    // ── Atribución por canal (desde reservas reales) ──────────────────────────
    const atribMap = {};
    resConvList.forEach(r => {
      const c = normCanal(r.canal);
      if (!atribMap[c]) atribMap[c] = 0;
      atribMap[c] += r.total || 0;
    });
    const atribArr = Object.entries(atribMap)
      .map(([canal, valor]) => ({ canal, valor }))
      .sort((a, b) => b.valor - a.valor);
    setAtribuciones(atribArr);

    // ── Abandono de embudo ────────────────────────────────────────────────────
    const embAbandList = embList.filter(e => e.abandono_paso);
    const abandByStep = {};
    embAbandList.forEach(e => {
      const k = e.abandono_paso;
      abandByStep[k] = (abandByStep[k] || 0) + 1;
    });
    const stepLabels = {
      1: "Vio widget", 2: "Eligió fecha", 3: "Eligió paquete",
      4: "Ingresó datos", 5: "Llegó a pago", 6: "Completó pago",
    };
    const abandArr = Object.entries(abandByStep)
      .map(([paso, count]) => ({ paso: Number(paso), label: stepLabels[paso] || `Paso ${paso}`, count }))
      .sort((a, b) => a.paso - b.paso);
    setAbandonos(abandArr);

    // ── Revenue por paquete ───────────────────────────────────────────────────
    const pkgMap = {};
    resConvList.forEach(r => {
      const k = r.tipo || "Sin tipo";
      if (!pkgMap[k]) pkgMap[k] = { tipo: k, count: 0, ingreso: 0 };
      pkgMap[k].count++;
      pkgMap[k].ingreso += r.total || 0;
    });
    const pkgArr = Object.values(pkgMap).sort((a, b) => b.ingreso - a.ingreso);
    setPkgData(pkgArr);

    // ── Geo Dashboard ─────────────────────────────────────────────────────────
    const paisMap = {};
    sesList.forEach(s => {
      if (s.pais) {
        if (!paisMap[s.pais]) paisMap[s.pais] = { pais: s.pais, sesiones: 0, conversiones: 0, turistas: 0 };
        paisMap[s.pais].sesiones++;
        if (s.es_turista) paisMap[s.pais].turistas++;
      }
    });
    resConvList.forEach(r => {
      const ses = sesList.find(s => s.convertida);
      if (ses?.pais && paisMap[ses.pais]) paisMap[ses.pais].conversiones++;
    });
    const geoArr = Object.values(paisMap).sort((a,b) => b.sesiones - a.sesiones).slice(0, 10);
    setGeoData(geoArr);
    const turistas  = sesList.filter(s => s.es_turista === true).length;
    const locales   = sesList.filter(s => s.es_turista === false).length;
    const retornando = sesList.filter(s => s.is_returning).length;
    setRetornoStats({ turistas, locales, retornando, total: sesList.length });

    // ── Payment Errors ────────────────────────────────────────────────────────
    const errEvents = evList.filter(e => e.tipo === "payment_error");
    const errMap = {};
    errEvents.forEach(e => {
      const k = e.datos?.metodo || "unknown";
      if (!errMap[k]) errMap[k] = { metodo: k, count: 0, montoTotal: 0 };
      errMap[k].count++;
      errMap[k].montoTotal += e.datos?.monto || 0;
    });
    setPaymentErrors(Object.values(errMap).sort((a,b) => b.count - a.count));

    // ── Abandoned Revenue ─────────────────────────────────────────────────────
    const totalAbandonoRev = abandList.reduce((s, a) => s + (a.monto_potencial || 0), 0);
    setAbandonoRevenue(totalAbandonoRev);

    // ── First Touch Attribution ───────────────────────────────────────────────
    const ftMap = {};
    atribList.filter(a => a.modelo === "first_touch").forEach(a => {
      const c = normCanal(a.canal);
      ftMap[c] = (ftMap[c] || 0) + a.valor;
    });
    setAtribFirstTouch(Object.entries(ftMap).map(([canal, valor]) => ({ canal, valor })).sort((a,b)=>b.valor-a.valor));

    // ── Daily Trend (last 14 days buckets) ───────────────────────────────────
    const dayMap = {};
    sesList.forEach(s => {
      const d = s.created_at?.slice(0, 10);
      if (d) { if (!dayMap[d]) dayMap[d] = { fecha: d, sesiones: 0, conversiones: 0, ingreso: 0 }; dayMap[d].sesiones++; }
    });
    resConvList.forEach(r => {
      const d = r.created_at?.slice(0, 10);
      if (d) { if (!dayMap[d]) dayMap[d] = { fecha: d, sesiones: 0, conversiones: 0, ingreso: 0 }; dayMap[d].conversiones++; dayMap[d].ingreso += r.total || 0; }
    });
    const dailyArr = Object.values(dayMap).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-30);
    setDailyTrend(dailyArr);

    // ── Language Breakdown ────────────────────────────────────────────────────
    const langMap = {};
    sesList.forEach(s => {
      const lang = s.idioma_sitio || s.idioma?.slice(0, 2) || "es";
      langMap[lang] = (langMap[lang] || 0) + 1;
    });
    setIdiomas(Object.entries(langMap).map(([k, v]) => ({ lang: k, count: v })).sort((a,b) => b.count - a.count));

    // ── Segment Breakdown ─────────────────────────────────────────────────────
    const segMap = {};
    usuariosList.forEach(u => {
      const s = u.segmento || "nuevo";
      if (!segMap[s]) segMap[s] = { segmento: s, count: 0, avgValue: 0, avgIntent: 0, totalValue: 0, totalIntent: 0 };
      segMap[s].count++;
      segMap[s].totalValue  += u.value_score  || 0;
      segMap[s].totalIntent += u.intent_score || 0;
    });
    Object.values(segMap).forEach(s => {
      s.avgValue  = s.count ? Math.round(s.totalValue  / s.count) : 0;
      s.avgIntent = s.count ? Math.round(s.totalIntent / s.count) : 0;
    });
    setSegmentos(Object.values(segMap).sort((a,b) => b.count - a.count));

    // ── Scroll Depth Stats ────────────────────────────────────────────────────
    const scrollEvents = evList.filter(e => e.tipo === "scroll_depth");
    if (scrollEvents.length > 0) {
      const pcts = scrollEvents.map(e => e.datos?.profundidad_pct || 0);
      const avg  = Math.round(pcts.reduce((s,v) => s+v, 0) / pcts.length);
      const dist = { "25%": 0, "50%": 0, "75%": 0, "90%+": 0 };
      pcts.forEach(p => {
        if (p >= 90) dist["90%+"]++;
        else if (p >= 75) dist["75%"]++;
        else if (p >= 50) dist["50%"]++;
        else if (p >= 25) dist["25%"]++;
      });
      setScrollStats({ avg, dist, total: scrollEvents.length });
    }

    // ── Exit Intent Count ─────────────────────────────────────────────────────
    setExitIntents(evList.filter(e => e.tipo === "exit_intent").length);

    // ── Transaction Explorer ──────────────────────────────────────────────────
    setIngresos(ingresosList.slice(0,30).reverse());

    setSesiones(sesList.slice(-50).reverse());
    setLoading(false);
  }

  const fmt = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  async function loadSessionJourney(ses) {
    setSelectedSession(ses);
    setLoadingJourney(true);
    const { data } = await supabase.from("track_eventos")
      .select("tipo, categoria, datos, ts, url")
      .eq("sesion_id", ses.id)
      .order("ts", { ascending: true });
    setSessionEvents(data || []);
    setLoadingJourney(false);
  }

  const EVENTO_ICON = {
    page_view: "📄", booking_widget_visto: "👁", product_view: "🛍",
    availability_search: "🔍", pax_cambio: "👥", calendario_navegar: "📅",
    begin_checkout: "🛒", guest_info_completed: "✏️", payment_method_selected: "💳",
    payment_attempt: "💸", conversion: "✅", payment_error: "❌",
    scroll_depth: "📜", exit_intent: "🚪", whatsapp_click: "💬",
    embudo_abandono: "⚠️", form_error: "⚡", language_changed: "🌐",
  };

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {periodos.map(p => (
            <button key={p.val} onClick={() => setPeriodo(p.val)}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: periodo === p.val ? B.sky : B.navyLight, color: periodo === p.val ? B.navy : B.text }}>
              {p.label}
            </button>
          ))}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPeriodo("custom"); }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: periodo === "custom" ? B.sky : B.navyLight, color: periodo === "custom" ? B.navy : B.text, fontSize: 12, cursor: "pointer" }} />
            <span style={{ color: B.muted, fontSize: 12 }}>→</span>
            <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPeriodo("custom"); }}
              style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: periodo === "custom" ? B.sky : B.navyLight, color: periodo === "custom" ? B.navy : B.text, fontSize: 12, cursor: "pointer" }} />
          </div>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 28 }}>
          <KPI label="Usuarios Únicos" value={stats.usuariosUnicos.toLocaleString("es-CO")} sub={`${stats.totalSesiones} sesiones · ${stats.sesXUsuario} ses/usuario`} />
          <KPI label="Conversiones" value={stats.sesConv} sub={`${stats.ingresoTotal > 0 ? "Reservas pagadas" : "Reservas confirmadas"}`} color={B.success} />
          <KPI label="Tasa Conv. Web" value={`${stats.tasaConv}%`} sub="Visitantes widget → Venta web" color={stats.tasaConv >= 3 ? B.success : B.sand} />
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

      {/* Abandono de Embudo */}
      {abandonos.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#fff" }}>⚠️ Abandono por Paso</h3>
          <div style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Usuarios que salieron sin completar la reserva</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {abandonos.map(a => (
              <div key={a.paso} style={{ background: B.navyLight, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: B.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Abandonó en paso {a.paso}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: B.text, marginBottom: 6 }}>{a.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: B.danger }}>{a.count}</div>
              </div>
            ))}
          </div>
          {abandonos.length === 0 && <div style={{ color: B.muted, fontSize: 13 }}>Sin abandonos registrados aún. Se activa cuando usuarios cierran el widget antes de completar la reserva.</div>}
        </div>
      )}

      {/* Link de WhatsApp con UTM */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#fff" }}>📲 Links Rastreados por WhatsApp</h3>
        <div style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Usa estos links cuando envíes el widget por WhatsApp. AtolonTrack sabrá exactamente qué visitas y reservas vinieron de WhatsApp.</div>
        {(() => {
          const base = `${window.location.origin}/booking`;
          const grupos = [
            {
              titulo: "🌴 Por Paquete",
              color: B.sky,
              links: [
                { label: "VIP Pass",          icon: "🌴", utm: "?tipo=vip-pass&utm_source=whatsapp&utm_medium=directo&utm_campaign=vip-pass",                msg: "¡Reserva tu VIP Pass en Atolon Beach Club! 🌴" },
                { label: "Exclusive Pass",    icon: "⭐", utm: "?tipo=exclusive-pass&utm_source=whatsapp&utm_medium=directo&utm_campaign=exclusive-pass",    msg: "¡Reserva tu Exclusive Pass en Atolon Beach Club! ⭐" },
                { label: "Atolon Experience", icon: "🛥️", utm: "?tipo=atolon-experience&utm_source=whatsapp&utm_medium=directo&utm_campaign=atolon-experience", msg: "¡Reserva tu Atolon Experience en Atolon Beach Club! 🛥️" },
                { label: "After Island",      icon: "🌙", utm: "?tipo=after-island&utm_source=whatsapp&utm_medium=directo&utm_campaign=after-island",        msg: "¡Reserva tu After Island en Atolon Beach Club! 🌙" },
              ],
            },
            {
              titulo: "📣 General",
              color: B.success,
              links: [
                { label: "Consulta general",       icon: "💬", utm: "?utm_source=whatsapp&utm_medium=directo&utm_campaign=consulta",  msg: "¡Reserva tu pasadía en Atolon Beach Club! 🌊" },
                { label: "Oferta / Promo",         icon: "🏷️", utm: "?utm_source=whatsapp&utm_medium=directo&utm_campaign=promo",     msg: "¡Aprovecha esta promo en Atolon Beach Club! 🏷️" },
                { label: "Follow-up",              icon: "🔁", utm: "?utm_source=whatsapp&utm_medium=directo&utm_campaign=followup",  msg: "Hola! Te comparto el link para tu reserva en Atolon Beach Club 🌊" },
                { label: "Grupo / Evento",         icon: "🎉", utm: "?utm_source=whatsapp&utm_medium=directo&utm_campaign=grupo",     msg: "¡Reserva tu experiencia grupal en Atolon Beach Club! 🎉" },
              ],
            },
          ];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {grupos.map(g => (
                <div key={g.titulo}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: g.color, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>{g.titulo}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                    {g.links.map(l => {
                      const url = base + l.utm;
                      return (
                        <div key={l.label} style={{ background: B.navyLight, borderRadius: 10, padding: "14px 16px" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{l.icon} {l.label}</div>
                          <div style={{ fontSize: 10, color: B.muted, wordBreak: "break-all", marginBottom: 10, lineHeight: 1.5 }}>{url}</div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => navigator.clipboard.writeText(url)}
                              style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              📋 Copiar
                            </button>
                            <a href={`https://wa.me/?text=${encodeURIComponent(`${l.msg}\n${url}`)}`}
                              target="_blank" rel="noreferrer"
                              style={{ flex: 1, padding: "7px 0", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none", textAlign: "center" }}>
                              💬 Enviar
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Revenue por Paquete */}
      {pkgData.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>📦 Revenue por Paquete</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pkgData.map((p, i) => {
              const maxIng = pkgData[0]?.ingreso || 1;
              const pct = Math.round((p.ingreso / maxIng) * 100);
              return (
                <div key={p.tipo}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: B.text, fontWeight: 600 }}>{p.tipo}</span>
                    <span style={{ fontSize: 13, color: B.sky, fontWeight: 700 }}>{fmt(p.ingreso)} · {p.count} reservas</span>
                  </div>
                  <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: i === 0 ? B.sky : i === 1 ? B.purple : B.success, borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dispositivos y Navegadores */}
      {sesiones.length > 0 && (() => {
        const devMap = {}, osMap = {}, brMap = {};
        sesiones.forEach(s => {
          const dev = s.dispositivo || "desktop";
          const nav = s.navegador   || "Otro";
          const sos = s.os          || "Desconocido";
          devMap[dev] = (devMap[dev] || 0) + 1;
          brMap[nav]  = (brMap[nav]  || 0) + 1;
          osMap[sos]  = (osMap[sos]  || 0) + 1;
        });
        const total = sesiones.length;
        const bar = (map) => Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([k,v]) => ({k, v, pct: Math.round((v/total)*100)}));
        const DEVICE_ICON = { mobile: "📱", tablet: "📲", desktop: "💻" };
        return (
          <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>📱 Dispositivos y Navegadores</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
              {[
                { title: "Dispositivo", data: bar(devMap), icon: (k) => DEVICE_ICON[k] || "🖥️" },
                { title: "Navegador",   data: bar(brMap),  icon: () => "🌐" },
                { title: "Sistema Operativo", data: bar(osMap), icon: () => "💡" },
              ].map(sec => (
                <div key={sec.title}>
                  <div style={{ fontSize: 12, color: B.sand, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>{sec.title}</div>
                  {sec.data.map(({ k, v, pct }) => (
                    <div key={k} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: B.text }}>{sec.icon(k)} {k}</span>
                        <span style={{ fontSize: 12, color: B.muted }}>{v} · {pct}%</span>
                      </div>
                      <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: B.sky, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Geo Dashboard ─────────────────────────────────────────────────── */}
      {(geoData.length > 0 || retornoStats) && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>🌍 Geo & Perfil de Visitante</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Countries */}
            <div>
              <div style={{ fontSize: 12, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Países</div>
              {geoData.length === 0
                ? <div style={{ fontSize: 12, color: B.muted }}>Geo activo — datos llegan en próximas sesiones</div>
                : geoData.map(g => (
                  <div key={g.pais} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 13, color: B.text }}>{g.pais}</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {g.turistas > 0 && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "#38bdf822", color: B.sky }}>✈️ {g.turistas}</span>}
                      <span style={{ fontSize: 13, fontWeight: 700, color: B.muted }}>{g.sesiones} ses</span>
                    </div>
                  </div>
                ))
              }
            </div>
            {/* Turista / Local / Retorno */}
            {retornoStats && (
              <div>
                <div style={{ fontSize: 12, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Perfil</div>
                {[
                  { label: "✈️ Turistas internacionales", val: retornoStats.turistas, color: B.sky },
                  { label: "🏠 Locales / Colombianos",    val: retornoStats.locales, color: B.success },
                  { label: "🔁 Usuarios recurrentes",     val: retornoStats.retornando, color: B.sand },
                  { label: "🌐 Sin geo detectado",        val: retornoStats.total - retornoStats.turistas - retornoStats.locales, color: B.muted },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 13, color: B.text }}>{row.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: row.color }}>{row.val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Attribution Comparison: First vs Last Touch ────────────────────── */}
      {atribFirstTouch.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#fff" }}>🔀 Atribución: First Touch vs Last Touch</h3>
          <div style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Qué canal inició el interés vs qué canal cerró la venta</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {[{ title: "First Touch", data: atribFirstTouch, color: B.purple }, { title: "Last Touch", data: atribuciones, color: B.sky }].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 12, color: col.color, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>{col.title}</div>
                {col.data.length === 0
                  ? <div style={{ fontSize: 12, color: B.muted }}>Sin datos aún</div>
                  : col.data.map(a => (
                    <div key={a.canal} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 13, color: B.text }}>{a.canal}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: col.color }}>{fmt(a.valor)}</span>
                    </div>
                  ))
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Abandoned Revenue ─────────────────────────────────────────────── */}
      {abandonoRevenue > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: `1px solid ${B.danger}33`, marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#fff" }}>💸 Revenue Abandonado</h3>
              <div style={{ fontSize: 12, color: B.muted }}>Usuarios que llegaron a pago y no completaron</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: B.danger }}>{fmt(abandonoRevenue)}</div>
              <div style={{ fontSize: 11, color: B.muted }}>potencial no capturado</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
            {(() => {
              const pkgMap = {};
              // Use abandonment data from track_abandonment table
              return null; // package breakdown loads when data has package_type
            })()}
          </div>
        </div>
      )}

      {/* ── Payment Errors & Friction ─────────────────────────────────────── */}
      {paymentErrors.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>⚠️ Errores de Pago</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {paymentErrors.map(e => (
              <div key={e.metodo} style={{ background: B.navyLight, borderRadius: 10, padding: "14px 16px", borderLeft: `3px solid ${B.danger}` }}>
                <div style={{ fontSize: 11, color: B.muted, marginBottom: 4, textTransform: "uppercase" }}>{e.metodo}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: B.danger }}>{e.count}</div>
                <div style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>errores · {fmt(e.montoTotal)} afectado</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transaction Explorer ──────────────────────────────────────────── */}
      {ingresos.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>💳 Transacciones Recientes</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["ID Reserva","Paquete","Monto","Método","Adultos","Niños","Fecha Visita","Canal","Creado"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: B.sand, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ingresos.map(ing => (
                  <tr key={ing.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "8px 12px", color: B.sky, fontFamily: "monospace", fontSize: 11 }}>{ing.reserva_id?.slice(0,18) || "—"}</td>
                    <td style={{ padding: "8px 12px", color: B.text }}>{ing.package_type || "—"}</td>
                    <td style={{ padding: "8px 12px", color: B.success, fontWeight: 700 }}>{fmt(ing.monto)}</td>
                    <td style={{ padding: "8px 12px", color: B.muted }}>{ing.metodo_pago || "—"}</td>
                    <td style={{ padding: "8px 12px", color: B.muted }}>{ing.adultos ?? "—"}</td>
                    <td style={{ padding: "8px 12px", color: B.muted }}>{ing.ninos ?? "—"}</td>
                    <td style={{ padding: "8px 12px", color: B.muted }}>{ing.fecha_visita || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: B.navyLight, color: B.sand }}>{normCanal(ing.canal) || "—"}</span>
                    </td>
                    <td style={{ padding: "8px 12px", color: B.muted, whiteSpace: "nowrap" }}>{ing.created_at ? new Date(ing.created_at).toLocaleString("es-CO", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Daily Trend Chart ─────────────────────────────────────────────── */}
      {dailyTrend.length > 1 && (() => {
        const maxSes = Math.max(...dailyTrend.map(d => d.sesiones), 1);
        const maxIng = Math.max(...dailyTrend.map(d => d.ingreso), 1);
        return (
          <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>📈 Tendencia Diaria</h3>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 80, marginBottom: 8 }}>
              {dailyTrend.map(d => (
                <div key={d.fecha} title={`${d.fecha}\n${d.sesiones} sesiones · ${fmt(d.ingreso)}`}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", background: B.sky, borderRadius: "2px 2px 0 0", height: Math.max(4, (d.sesiones / maxSes) * 60) }} />
                  {d.ingreso > 0 && <div style={{ width: "60%", background: B.success, borderRadius: 2, height: Math.max(2, (d.ingreso / maxIng) * 16) }} />}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: B.muted }}>{dailyTrend[0]?.fecha}</span>
              <div style={{ display: "flex", gap: 16, fontSize: 10, color: B.muted }}>
                <span style={{ color: B.sky }}>■ Sesiones</span>
                <span style={{ color: B.success }}>■ Ingresos</span>
              </div>
              <span style={{ fontSize: 10, color: B.muted }}>{dailyTrend[dailyTrend.length-1]?.fecha}</span>
            </div>
          </div>
        );
      })()}

      {/* ── Behavior: Scroll Depth + Exit Intent ──────────────────────────── */}
      {(scrollStats || exitIntents > 0) && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>🎯 Comportamiento en Página</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {scrollStats && (
              <div>
                <div style={{ fontSize: 12, color: B.sand, fontWeight: 600, textTransform: "uppercase", marginBottom: 12 }}>Profundidad de Scroll · Promedio {scrollStats.avg}%</div>
                {Object.entries(scrollStats.dist).map(([label, count]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 12, color: B.text }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: B.sky }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
            {exitIntents > 0 && (
              <div>
                <div style={{ fontSize: 12, color: B.sand, fontWeight: 600, textTransform: "uppercase", marginBottom: 12 }}>Exit Intent Detectado</div>
                <div style={{ fontSize: 48, fontWeight: 800, color: B.danger }}>{exitIntents}</div>
                <div style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>usuarios con intención de salida · posibles recuperables con popup/oferta</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Language Breakdown ────────────────────────────────────────────── */}
      {idiomas.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#fff" }}>🌐 Idioma de los Visitantes</h3>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {idiomas.map(({ lang, count }) => {
              const label = lang === "es" ? "🇪🇸 Español" : lang === "en" ? "🇬🇧 English" : lang === "pt" ? "🇧🇷 Português" : `🌐 ${lang}`;
              const pct   = Math.round((count / (idiomas.reduce((s,i) => s+i.count, 0) || 1)) * 100);
              return (
                <div key={lang} style={{ background: B.navyLight, borderRadius: 10, padding: "14px 20px", textAlign: "center", minWidth: 110 }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{label.split(" ")[0]}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: B.white }}>{count}</div>
                  <div style={{ fontSize: 11, color: B.muted }}>{pct}% · {label.split(" ").slice(1).join(" ")}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Customer Segments ─────────────────────────────────────────────── */}
      {segmentos.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#fff" }}>👤 Segmentos de Clientes</h3>
          <div style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Calculado automáticamente por AtolonTrack según historial de compras y comportamiento</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {segmentos.map(seg => {
              const colors = { nuevo: B.sky, retorno: B.success, alto_valor: B.sand, cliente_recurrente: B.purple };
              const labels = { nuevo: "🆕 Nuevo", retorno: "🔁 Retorno", alto_valor: "💎 Alto Valor", cliente_recurrente: "⭐ Recurrente" };
              const color  = colors[seg.segmento] || B.muted;
              return (
                <div key={seg.segmento} style={{ background: B.navyLight, borderRadius: 10, padding: "14px 16px", borderLeft: `3px solid ${color}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8 }}>{labels[seg.segmento] || seg.segmento}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{seg.count}</div>
                  <div style={{ fontSize: 11, color: B.muted, marginTop: 6 }}>Intent avg: {seg.avgIntent} · Value avg: {seg.avgValue}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Session Journey Explorer ───────────────────────────────────────── */}
      {sesiones.length > 0 && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#fff" }}>🗺 Explorador de Sesiones</h3>
          <div style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Haz click en una sesión para ver el journey completo del usuario</div>

          <div style={{ display: "grid", gridTemplateColumns: selectedSession ? "1fr 1fr" : "1fr", gap: 16 }}>
            {/* Session list */}
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {sesiones.map(ses => (
                <div key={ses.id} onClick={() => loadSessionJourney(ses)}
                  style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 6, cursor: "pointer", background: selectedSession?.id === ses.id ? B.navyLight : "rgba(255,255,255,0.03)", border: `1px solid ${selectedSession?.id === ses.id ? B.sky + "66" : "transparent"}`, transition: "all 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: B.sky }}>{ses.id.slice(0, 14)}…</span>
                    <span style={{ fontSize: 10, color: ses.convertida ? B.success : B.muted }}>{ses.convertida ? "✅ Convertida" : "—"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {ses.dispositivo && <span style={{ fontSize: 10, color: B.muted }}>📱 {ses.dispositivo}</span>}
                    {ses.canal && <span style={{ fontSize: 10, color: B.muted }}>📡 {normCanal(ses.canal)}</span>}
                    {ses.pais && <span style={{ fontSize: 10, color: B.muted }}>🌍 {ses.pais}</span>}
                    {ses.duracion_seg > 0 && <span style={{ fontSize: 10, color: B.muted }}>⏱ {Math.floor(ses.duracion_seg/60)}m{ses.duracion_seg%60}s</span>}
                    {ses.ingreso > 0 && <span style={{ fontSize: 10, color: B.success, fontWeight: 700 }}>{fmt(ses.ingreso)}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Journey timeline */}
            {selectedSession && (
              <div style={{ background: B.navy, borderRadius: 10, padding: 16, maxHeight: 400, overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.sand }}>Journey Timeline</div>
                  <button onClick={() => { setSelectedSession(null); setSessionEvents([]); }}
                    style={{ background: "none", border: "none", color: B.muted, cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
                {loadingJourney
                  ? <div style={{ color: B.muted, fontSize: 12 }}>Cargando eventos...</div>
                  : sessionEvents.length === 0
                    ? <div style={{ color: B.muted, fontSize: 12 }}>Sin eventos registrados</div>
                    : sessionEvents.map((ev, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                        <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: ev.tipo === "conversion" ? B.success + "33" : ev.tipo === "payment_error" ? B.danger + "33" : B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                          {EVENTO_ICON[ev.tipo] || "•"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: B.text }}>{ev.tipo}</div>
                          <div style={{ fontSize: 10, color: B.muted }}>{new Date(ev.ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                          {ev.datos && Object.keys(ev.datos).length > 0 && (
                            <div style={{ fontSize: 10, color: B.muted, marginTop: 2, fontFamily: "monospace", wordBreak: "break-all" }}>
                              {Object.entries(ev.datos).filter(([k]) => !["url"].includes(k)).map(([k,v]) => `${k}: ${v}`).join(" · ")}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                }
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: B.muted, textAlign: "center" }}>
        AtolonTrack v2.1 · GTM/GA4/Meta Pixel · Server-side fallback · Datos en tiempo real desde Supabase
      </div>
    </div>
  );
}
