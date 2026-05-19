import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { clasificarOrigenReserva, clasificarOrigen, ORIGEN_BUCKETS, ORIGEN_LABELS } from "../lib/origenClassifier.js";

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
  if (c === "getyourguide" || c === "get your guide" || c === "gyg") return "GetYourGuide";
  // Capitalize first letter for anything else
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// externo=true → vista pública limitada a Web+Mkt y WhatsApp (sin grupo/otros)
export default function Analitica({ externo = false }) {
  const [periodo, setPeriodo] = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [origen,     setOrigen]     = useState(externo ? "ambos" : "all"); // all|web|whatsapp|grupo|otros|ambos
  const [pkgData, setPkgData] = useState([]);
  const [stats, setStats] = useState(null);
  const [atribQA, setAtribQA]   = useState(null);  // calidad de atribución paid media
  const [atribRows, setAtribRows] = useState([]);  // filas para export CAPI/Offline
  const [sesiones, setSesiones] = useState([]);
  const [embudos, setEmbudos] = useState([]);
  const [canales, setCanales] = useState([]);
  const [origenes, setOrigenes] = useState([]);  // 5 buckets: grupo/whatsapp/marketing/staff/web
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

  useEffect(() => { if (periodo !== "custom" || (customFrom && customTo)) fetchAll(); }, [periodo, customFrom, customTo, origen]);

  async function fetchAll() {
    setLoading(true);
    let desde;
    if (periodo === "custom" && customFrom) {
      desde = new Date(customFrom).toISOString();
    } else if (periodo === "1d") {
      // "Hoy" = día CALENDARIO de Bogotá (no rolling 24h, que arrastraba
      // las ventas de ayer). Medianoche Bogotá (UTC-5) expresada en UTC.
      const hoyBog = new Date().toLocaleString("en-CA", { timeZone: "America/Bogota" }).slice(0, 10);
      desde = `${hoyBog}T05:00:00.000Z`;
    } else {
      const dias = parseInt(periodo);
      desde = new Date(Date.now() - dias * 86400000).toISOString();
    }
    // Vista externa: nunca mostrar data anterior al 12 de mayo de 2026.
    const TRACK_MIN_EXTERNO = "2026-05-12T00:00:00.000Z";
    if (externo && desde < TRACK_MIN_EXTERNO) desde = TRACK_MIN_EXTERNO;
    const hasta = periodo === "custom" && customTo ? new Date(customTo + "T23:59:59").toISOString() : new Date().toISOString();

    const [sesRes, embRes, evRes, resConvRes, atribRes, abandRes, ingresosRes, usuariosRes] = await Promise.all([
      supabase.from("track_sesiones").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_embudos").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_eventos").select("tipo, categoria, datos, ts, sesion_id").gte("ts", desde).lte("ts", hasta),
      // Traemos TODAS las reservas del periodo con estado, forma_pago y
      // señales de pago. El filtro "pagada" se hace en JS (esPagada) para
      // poder además mostrar Estado y el método REAL en Transacciones
      // Recientes (track_ingresos.metodo_pago no es confiable — trae "stripe").
      supabase.from("reservas").select("id, total, canal, tipo, grupo_id, vendedor, aliado_id, utms_capturados, created_at, estado, forma_pago, abono, fecha_pago, referencia_pago").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_atribuciones").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_abandonment").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_ingresos").select("*").gte("created_at", desde).lte("created_at", hasta),
      supabase.from("track_usuarios").select("segmento, intent_score, value_score").not("segmento", "is", null).limit(500),
    ]);

    const rawSes       = sesRes.data      || [];   // sin filtrar (panel comparativo de orígenes)
    let   sesList      = rawSes;
    let   embList      = embRes.data      || [];
    let   evList       = evRes.data       || [];
    const atribList    = atribRes.data    || [];
    let   abandList    = abandRes.data    || [];
    let   ingresosList = ingresosRes.data || [];
    const usuariosList = usuariosRes.data || [];

    // ── Filtro global por ORIGEN de cliente (re-segmenta los 13 paneles) ──────
    // 5 buckets del clasificador → 4 visibles: Web+Mkt / WhatsApp / Grupo / Otros
    const o4 = (b) => (b === "marketing" ? "web" : (b === "web" || b === "whatsapp" || b === "grupo") ? b : "otros");
    const sesOrigen = new Map();
    rawSes.forEach(s => {
      const b5 = s.origen_tipo || clasificarOrigen({
        utms: s.utms, referrer: s.referrer, canal: s.canal,
        landing_page: s.primer_landing || s.entrada_url,
      });
      sesOrigen.set(s.id, o4(b5));
    });
    const recOrigen = (r) => {
      if (r.sesion_id && sesOrigen.has(r.sesion_id)) return sesOrigen.get(r.sesion_id);
      return o4(clasificarOrigen({
        utms: r.utms || r.utms_capturados, referrer: r.referrer, canal: r.canal,
        landing_page: r.entrada_url, grupo_id: r.grupo_id, vendedor: r.vendedor, aliado_id: r.aliado_id,
      }));
    };
    // Orígenes permitidos. Externo: SIEMPRE solo web+whatsapp (nunca grupo/otros).
    const allowedOrig = externo
      ? (origen === "ambos" ? new Set(["web", "whatsapp"]) : new Set([origen]))
      : (origen === "all" ? null : new Set([origen]));
    const inAllowed = (b4) => !allowedOrig || allowedOrig.has(b4);
    if (allowedOrig) {
      sesList      = rawSes.filter(s => inAllowed(sesOrigen.get(s.id)));
      embList      = embList.filter(e => inAllowed(recOrigen(e)));
      evList       = evList.filter(e => e.sesion_id ? inAllowed(sesOrigen.get(e.sesion_id)) : !externo);
      abandList    = abandList.filter(a => inAllowed(recOrigen(a)));
      ingresosList = ingresosList.filter(i => inAllowed(recOrigen(i)));
    }

    // ⚠️ AtolonTrack = SELF-SERVICE únicamente. Solo cuentan las reservas que
    // hace el propio cliente desde el widget público (id "WEB-..."), p.ej. los
    // que entran por el link de un grupo y compran. Las que crea el equipo
    // comercial a mano en Atolon OS (id "R-...") NO son self-service y quedan
    // FUERA de toda la analítica de AtolonTrack (KPIs, embudo, orígenes).
    // Conversión = CUALQUIER reserva que PAGÓ, sin importar lo que pase
    // después (check_in/no_show, o incluso cancelada tras pagar — la venta
    // ocurrió). NO cuenta: cancelada nunca pagada ni pendiente sin pago.
    const esPagada = (r) =>
      ["confirmado", "check_in", "no_show"].includes(r.estado) ||
      (r.abono || 0) > 0 || !!r.fecha_pago || !!r.referencia_pago;
    const reservaMap = new Map((resConvRes.data || []).map(r => [r.id, r]));
    const resSelfSvc = (resConvRes.data || []).filter(r => String(r.id || "").startsWith("WEB-") && esPagada(r));
    // resConvList = reservas self-service del segmento seleccionado.
    //  • "Todos" (sin filtro): TODO el self-service pagado, de cualquier
    //    origen → cuadra exacto con la suma del panel "🎯 Origen del Cliente"
    //    (ej. 8 Web + 3 Grupos = 11). Antes se limitaba a canales WEB y los
    //    grupos no sumaban en Todos.
    //  • Con filtro de origen: mismo clasificador que ese panel.
    const resConvList = allowedOrig
      ? resSelfSvc.filter(r => inAllowed(o4(clasificarOrigenReserva(r))))
      : resSelfSvc;

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

    // ── Calidad de Atribución (Paid Media) + filas para Meta CAPI / Google ────
    // Por cada venta pagada self-service: resolvemos click-id y fuente vía la
    // sesión de track (track_ingresos.reserva_id → sesion_id → track_sesiones)
    // con fallback a reservas.utms_capturados. Sin click-id ni utm_source =
    // venta NO atribuible (el % que la agencia debe taggear).
    const sesById = new Map(rawSes.map(s => [s.id, s]));
    const ingByReserva = new Map();
    (ingresosRes.data || []).forEach(i => { if (i.reserva_id && !ingByReserva.has(i.reserva_id)) ingByReserva.set(i.reserva_id, i); });
    const atRows = resSelfSvc.map(r => {
      const ing = ingByReserva.get(r.id);
      const ses = ing ? sesById.get(ing.sesion_id) : null;
      const u  = r.utms_capturados || {};
      const su = (ses && ses.utms) || {};
      const gclid   = ses?.gclid   || u.gclid   || su.gclid   || "";
      const fbclid  = ses?.fbclid  || u.fbclid  || su.fbclid  || "";
      const msclkid = ses?.msclkid || u.msclkid || su.msclkid || "";
      const ttclid  = ses?.ttclid  || u.ttclid  || su.ttclid  || "";
      const utm_source   = su.utm_source   || u.utm_source   || "";
      const utm_campaign = su.utm_campaign || u.utm_campaign  || "";
      const via = o4(clasificarOrigenReserva(r));
      const hasClick = !!(gclid || fbclid || msclkid || ttclid);
      const hasSource = !!utm_source;
      return { reserva_id: r.id, ts: r.fecha_pago || r.created_at, value: Number(r.total) || 0,
        gclid, fbclid, msclkid, ttclid, utm_source, utm_campaign, via, hasClick, hasSource };
    });
    const aNone = atRows.filter(x => !x.hasClick && !x.hasSource);
    const byVia = {};
    atRows.forEach(x => {
      const k = x.via;
      byVia[k] = byVia[k] || { n: 0, ing: 0, nofuente: 0 };
      byVia[k].n++; byVia[k].ing += x.value; if (!x.hasClick && !x.hasSource) byVia[k].nofuente++;
    });
    setAtribRows(atRows);
    setAtribQA({
      tot: atRows.length,
      ing: atRows.reduce((s, x) => s + x.value, 0),
      click: atRows.filter(x => x.hasClick).length,
      src: atRows.filter(x => x.hasSource).length,
      none: aNone.length,
      ingNone: aNone.reduce((s, x) => s + x.value, 0),
      byVia,
    });

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

    // ── 🎯 Origen del Cliente (5 buckets: grupo/whatsapp/marketing/staff/web) ──
    // Segmentación limpia que pediste: separa Web vs WhatsApp vs Grupo.
    // Sesiones: usa origen_tipo persistido (ya backfilled en BD) o lo deriva.
    // Conversiones: TODAS las reservas confirmadas (no solo WEB_CANALES) —
    // clasificarOrigenReserva mira id (WEB-/R-), canal, grupo_id, utms.
    const origenMap = {};
    ORIGEN_BUCKETS.forEach(b => {
      origenMap[b] = { bucket: b, label: ORIGEN_LABELS[b], sesiones: 0, conversiones: 0, ingreso: 0 };
    });
    rawSes.forEach(s => {  // comparativo: SIEMPRE todos los orígenes (no se filtra)
      const b = s.origen_tipo || clasificarOrigen({
        utms: s.utms, referrer: s.referrer, canal: s.canal,
        landing_page: s.primer_landing || s.entrada_url,
      });
      if (origenMap[b]) origenMap[b].sesiones++;
    });
    resSelfSvc.forEach(r => {  // solo self-service (id WEB-), no reservas manuales
      const b = clasificarOrigenReserva(r);
      if (origenMap[b]) {
        origenMap[b].conversiones++;
        origenMap[b].ingreso += r.total || 0;
      }
    });
    // Web Directo + Marketing = mismo grupo (todo el tráfico que llega al
    // booking público, orgánico o por campañas). Se fusionan en "web".
    if (origenMap.marketing) {
      origenMap.web.sesiones     += origenMap.marketing.sesiones;
      origenMap.web.conversiones += origenMap.marketing.conversiones;
      origenMap.web.ingreso      += origenMap.marketing.ingreso;
      delete origenMap.marketing;
    }
    if (origenMap.web) origenMap.web.label = "🌐 Web (directo + marketing)";
    // Externo: el comparativo solo muestra Web+Mkt y WhatsApp.
    if (externo) { delete origenMap.grupo; delete origenMap.staff; delete origenMap.otros; }
    setOrigenes(Object.values(origenMap).map(o => ({
      ...o,
      convRate: o.sesiones ? ((o.conversiones / o.sesiones) * 100).toFixed(1) : "—",
    })));

    // ── Embudo de conversión ──────────────────────────────────────────────────
    // Orden REAL del widget (BookingPopup): el cliente primero elige PAQUETE
    // (paso_3) y LUEGO la fecha (paso_2) — nunca al revés. En grupos paquete y
    // fecha vienen pre-fijados por el link (se registran al abrir). Acumulado
    // sobre el orden lógico → monotónico. WhatsApp reserva vía el bot (no toca
    // el widget): no hay filas de embudo, por eso normalizamos abajo.
    const FUNNEL = [
      { k: 1, label: "Vio widget" },
      { k: 3, label: "Eligió paquete" },
      { k: 2, label: "Eligió fecha" },
      { k: 4, label: "Datos personales" },
      { k: 5, label: "Llegó a pago" },
      { k: 6, label: "Completó pago" },
    ];
    const pasos = FUNNEL.map((f, i) => ({
      paso:  f.k,
      label: f.label,
      count: embList.filter(e => FUNNEL.slice(i).some(s => e[`paso_${s.k}_ts`])).length,
    }));
    // "Completó pago" = SIEMPRE las conversiones reales del segmento → cuadra
    // exacto con el KPI Conversiones y el panel "Origen del Cliente". Luego
    // propagamos hacia arriba (cada paso ≥ el siguiente) para garantizar
    // monotonía en TODOS los segmentos:
    //  • web / grupo (pasan por el widget): se ve el embudo real del widget,
    //    nunca por debajo de las conversiones.
    //  • whatsapp (reserva vía el bot de IA, sin widget): no hay filas de
    //    embudo, así que queda plano en las conversiones — honesto: entraron
    //    por el link del bot y convirtieron, sin pasos de widget que medir.
    if (pasos[5]) pasos[5].count = sesConv;
    for (let i = pasos.length - 2; i >= 0; i--) {
      pasos[i].count = Math.max(pasos[i].count, pasos[i + 1].count);
    }
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
    // Orden real del widget: paquete (paso_3) antes que fecha (paso_2). El
    // número de "paso" que ve el usuario es la POSICIÓN lógica (1..6), no el
    // id interno de la columna — si no, salía "paso 1, 3, 2, 4, 5" (confuso).
    const FUNNEL_RANK = { 1: 0, 3: 1, 2: 2, 4: 3, 5: 4, 6: 5 };
    const abandArr = Object.entries(abandByStep)
      .map(([paso, count]) => ({
        paso:  Number(paso),
        orden: (FUNNEL_RANK[Number(paso)] ?? (Number(paso) - 1)) + 1,
        label: stepLabels[paso] || `Paso ${paso}`,
        count,
      }))
      .sort((a, b) => a.orden - b.orden);
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
    // Método REAL desde reservas.forma_pago (track_ingresos.metodo_pago trae
    // "stripe" que NO usamos). Estado = ¿pasó el pago? Si la transacción no
    // tiene reserva enlazada → "Sin reserva" (fila huérfana/test).
    const metodoLabel = (m) =>
      ({ wompi: "Wompi", zoho_pay: "Zoho", tarjeta_internacional: "Tarjeta intl.", stripe: "Stripe" }[String(m || "").toLowerCase()] || m);
    // Filtra por el MISMO origen que los paneles Conversiones/Origen:
    // clasifica la RESERVA enlazada (ve grupo_id/canal/utms), no la sesión
    // del track_ingreso — así "Web/Grupo" filtra consistente con el resto.
    // Transacción sin reserva (huérfana) → cae al origen de la sesión.
    const txOrigen = (i) => {
      const r = reservaMap.get(i.reserva_id);
      return r ? o4(clasificarOrigenReserva(r)) : recOrigen(i);
    };
    const txList = (ingresosRes.data || []).filter(i => inAllowed(txOrigen(i)));
    setIngresos(txList.slice(0,30).reverse().map(i => {
      const r  = reservaMap.get(i.reserva_id);
      const fp = r?.forma_pago;
      const est = r
        ? ({ confirmado: ["Pagada", B.success], check_in: ["Pagada", B.success],
             no_show: ["Pagada", B.success], cancelado: ["Cancelada", B.danger],
             pendiente: ["Pendiente", B.sand] }[r.estado] || [r.estado, B.muted])
        : ["Sin reserva", B.danger];
      return {
        ...i,
        _metodo:   fp ? metodoLabel(fp) : (i.metodo_pago || "—"),
        _estLabel: est[0],
        _estColor: est[1],
      };
    }));

    setSesiones(sesList.slice(-50).reverse());
    setLoading(false);
  }

  const fmt = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  // Export de conversiones para Meta CAPI / Google Offline Conversions.
  // 1 fila por venta pagada: event + valor + click-id + fuente. Esto es lo
  // que la agencia sube a Meta/Google para que optimicen hacia compradores.
  const exportarConversiones = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cols = ["event_name", "event_time", "reserva_id", "value", "currency", "gclid", "fbclid", "msclkid", "ttclid", "utm_source", "utm_campaign", "via"];
    const lines = [cols.join(",")];
    atribRows.forEach(x => {
      lines.push([
        "Purchase",
        x.ts ? new Date(x.ts).toISOString() : "",
        x.reserva_id, x.value, "COP",
        x.gclid, x.fbclid, x.msclkid, x.ttclid,
        x.utm_source, x.utm_campaign, x.via,
      ].map(esc).join(","));
    });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `conversiones_capi_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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
          {externo ? (
            <img src="/atolon-logo-white.png" alt="Atolón" style={{ height: 42, width: "auto", display: "block" }} />
          ) : (
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff" }}>📊 AtolonTrack</h1>
          )}
          <div style={{ fontSize: 13, color: B.muted, marginTop: externo ? 8 : 4 }}>
            Analítica de conversión en tiempo real
            {!externo && <span style={{ marginLeft: 10, fontSize: 10, color: B.muted, opacity: 0.6 }}>build embudo-v3 · 2026-05-18</span>}
          </div>
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

      {/* Filtro global por ORIGEN de cliente — re-segmenta TODOS los paneles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
        <span style={{ fontSize: 11, color: B.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>Origen del cliente:</span>
        {(externo
          ? [
              { val: "ambos",    label: "Web+Mkt y WhatsApp", icon: "📊" },
              { val: "web",      label: "Web + Mkt",          icon: "🌐" },
              { val: "whatsapp", label: "WhatsApp",           icon: "💬" },
            ]
          : [
              { val: "all",      label: "Todos",        icon: "📊" },
              { val: "web",      label: "Web + Mkt",    icon: "🌐" },
              { val: "whatsapp", label: "WhatsApp",     icon: "💬" },
              { val: "grupo",    label: "Grupo",        icon: "🎉" },
              { val: "otros",    label: "Otros",        icon: "🔗" },
            ]
        ).map(o => (
          <button key={o.val} onClick={() => setOrigen(o.val)}
            style={{
              padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700,
              background: origen === o.val ? B.sand : B.navyLight,
              color: origen === o.val ? B.navy : B.text,
            }}>
            {o.icon} {o.label}
          </button>
        ))}
        {origen !== "all" && (
          <span style={{ fontSize: 11, color: B.sand, marginLeft: 4 }}>
            ▸ todos los paneles filtrados por este origen
          </span>
        )}
      </div>

      {/* Tracking & Pixels — config editable por la agencia */}
      <TrackingConfigPanel />

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
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#fff" }}>🔽 Embudo de Conversión</h3>
          {/* AtolonTrack = self-service: TODA conversión pasó por el widget,
              también las de grupo (abren el link y siguen los pasos). En grupo
              el paquete y la fecha vienen pre-fijados por el link, así que esos
              pasos se completan automáticamente al abrir. El embudo aplica a
              todos los segmentos. */}
          <div style={{ fontSize: 11, color: B.muted, marginBottom: 18 }}>
            Embudo <strong>self-service</strong>. Grupos: paquete y fecha vienen pre-fijados por el link. WhatsApp: reserva por el bot de IA (sin pasos de widget) → el embudo queda plano en las conversiones. El último paso siempre = Conversiones.
          </div>
          {embudos.map((p, i) => {
            const maxCount = embudos[0]?.count || 1;
            const pct = Math.max(0, Math.min(100, maxCount ? ((p.count / maxCount) * 100) : 0));
            const dropPct = i > 0 && embudos[i-1].count > 0
              ? Math.max(0, Math.round(((embudos[i-1].count - p.count) / embudos[i-1].count) * 100))
              : null;
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

      {/* 🎯 Origen del Cliente — segmentación Web / WhatsApp / Grupo / Marketing / Staff */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#fff" }}>🎯 Origen del Cliente</h3>
        <div style={{ fontSize: 12, color: B.muted, marginBottom: 18 }}>
          Segmentación real: Web (directo + marketing) · WhatsApp · Grupos · Staff/Manual.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
          {origenes.map(o => {
            const colores = { grupo: B.purple, whatsapp: B.success, marketing: B.pink, staff: B.sand, web: B.sky };
            const c = colores[o.bucket] || B.sky;
            return (
              <div key={o.bucket} style={{ background: B.navyLight, borderRadius: 12, padding: 16, borderLeft: `4px solid ${c}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{o.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{fmt(o.ingreso)}</div>
                <div style={{ fontSize: 11, color: B.muted, marginTop: 6, lineHeight: 1.7 }}>
                  {o.conversiones} reservas · {o.sesiones} sesiones<br />
                  conv {o.convRate}%
                </div>
              </div>
            );
          })}
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
                <div style={{ fontSize: 11, color: B.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Abandonó en paso {a.orden}</div>
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
                  {["ID Reserva","Paquete","Monto","Método","Estado","Adultos","Niños","Fecha Visita","Canal","Creado"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: B.sand, fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ingresos.map(ing => (
                  <tr key={ing.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11 }}>
                      {ing.reserva_id && ing._estLabel !== "Sin reserva" ? (
                        <span
                          onClick={() => window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "reservas", reservaId: ing.reserva_id } }))}
                          title="Abrir reserva"
                          style={{ color: B.sky, cursor: "pointer", textDecoration: "underline" }}
                        >
                          {ing.reserva_id.slice(0,18)}
                        </span>
                      ) : (
                        <span style={{ color: B.muted }}>{ing.reserva_id?.slice(0,18) || "—"}</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", color: B.text }}>{ing.package_type || "—"}</td>
                    <td style={{ padding: "8px 12px", color: B.success, fontWeight: 700 }}>{fmt(ing.monto)}</td>
                    <td style={{ padding: "8px 12px", color: B.muted }}>{ing._metodo || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "rgba(255,255,255,0.06)", color: ing._estColor }}>{ing._estLabel || "—"}</span>
                    </td>
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

      {atribQA && !externo && (
        <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, border: "1px solid rgba(255,255,255,0.07)", marginTop: 20, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>🎯 Calidad de Atribución · Paid Media</h3>
            <button onClick={exportarConversiones} disabled={!atribRows.length}
              style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: atribRows.length ? "pointer" : "default" }}>
              ⬇ Exportar conversiones (Meta CAPI / Google Offline)
            </button>
          </div>
          <div style={{ fontSize: 11, color: B.muted, marginBottom: 16 }}>
            Ventas pagadas del período y si son atribuibles a una pauta. Sin click-id ni utm_source = la agencia NO puede probar ROI de ese gasto.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 16 }}>
            <KPI label="Ventas pagadas" value={atribQA.tot} />
            <KPI label="Con click-id" value={`${atribQA.tot ? Math.round(atribQA.click / atribQA.tot * 100) : 0}%`} sub={`${atribQA.click}/${atribQA.tot}`} color={B.success} />
            <KPI label="Con fuente (utm)" value={`${atribQA.tot ? Math.round(atribQA.src / atribQA.tot * 100) : 0}%`} sub={`${atribQA.src}/${atribQA.tot}`} color={B.success} />
            <KPI label="Sin fuente ⚠" value={atribQA.none} sub="no atribuible" color={atribQA.none ? B.danger : B.success} />
            <KPI label="Ingreso no atribuible" value={fmt(atribQA.ingNone)} color={atribQA.ingNone ? B.danger : B.success} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {Object.entries(atribQA.byVia).sort((a, b) => b[1].ing - a[1].ing).map(([via, d]) => (
              <div key={via} style={{ background: B.navyLight, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em" }}>{via === "web" ? "🌐 Web / Social" : via === "whatsapp" ? "💬 WhatsApp" : via === "grupo" ? "👥 Grupo" : "Otros"}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 4 }}>{d.n} · {fmt(d.ing)}</div>
                <div style={{ fontSize: 11, color: d.nofuente ? B.danger : B.muted, marginTop: 2 }}>{d.nofuente} sin fuente</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11, color: B.muted, textAlign: "center" }}>
        {externo
          ? "Atolón · Analítica en tiempo real"
          : "AtolonTrack v2.1 · GTM/GA4/Meta Pixel · Server-side fallback · Datos en tiempo real desde Supabase"}
      </div>
    </div>
  );
}

// ─── Tracking & Pixels (config editable por la agencia) ──────────────────────
// Guarda los IDs en `configuracion`. gtm.js (vía AtolanTrack.init) los lee y
// arranca Meta Pixel / GA4 / GTM / Google Ads / TikTok en el booking engine.
const TRK_FIELDS = [
  { k: "meta_pixel_id",   label: "Meta Pixel ID",          ph: "Ej: 1234567890123456",  hint: "Solo el número del Pixel (Eventos → Orígenes de datos)." },
  { k: "ga4_id",          label: "GA4 Measurement ID",     ph: "G-XXXXXXXXXX",          hint: "Admin → Flujos de datos → ID de medición." },
  { k: "gtm_id",          label: "Google Tag Manager ID",  ph: "GTM-XXXXXXX",           hint: "Opcional. Si lo usas, GA4/Ads/Meta pueden ir dentro del contenedor." },
  { k: "google_ads_id",   label: "Google Ads Conversion",  ph: "AW-123456789",          hint: "ID de conversión de Google Ads." },
  { k: "tiktok_pixel_id", label: "TikTok Pixel ID",        ph: "Ej: C1A2B3...",         hint: "Eventos → Administrar → ID del pixel." },
];

function TrackingConfigPanel() {
  const [open, setOpen]     = useState(false);
  const [form, setForm]     = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    supabase.from("configuracion")
      .select("meta_pixel_id, gtm_id, ga4_id, google_ads_id, tiktok_pixel_id")
      .eq("id", "atolon").single()
      .then(({ data }) => setForm(data || {}))
      .catch(() => setForm({}));
  }, []);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };

  const guardar = async () => {
    setSaving(true);
    const payload = {};
    TRK_FIELDS.forEach(({ k }) => { payload[k] = (form?.[k] || "").trim() || null; });
    payload.updated_at = new Date().toISOString();
    const { error } = await supabase.from("configuracion").update(payload).eq("id", "atolon");
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 4000); }
    else alert("No se pudo guardar: " + error.message);
  };

  const algunoActivo = form && TRK_FIELDS.some(({ k }) => (form[k] || "").trim());

  return (
    <div style={{ background: B.navyMid, borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", marginBottom: 24, overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          background: "transparent", border: "none", cursor: "pointer", color: "#fff", padding: "16px 20px", textAlign: "left" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>
          🎯 Tracking &amp; Pixels
          <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600,
            color: algunoActivo ? B.success : B.sand }}>
            {form == null ? "…" : algunoActivo ? "● configurado" : "○ sin configurar"}
          </span>
        </span>
        <span style={{ color: B.muted, fontSize: 13 }}>{open ? "▲ ocultar" : "▼ configurar"}</span>
      </button>

      {open && form && (
        <div style={{ padding: "4px 20px 22px" }}>
          <div style={{ fontSize: 12, color: B.muted, marginBottom: 18, lineHeight: 1.5 }}>
            Pega aquí los IDs de la agencia. Se aplican automáticamente en el booking engine
            (<code>www.atolon.co/booking</code>) — dispara <strong>PageView</strong>, <strong>InitiateCheckout</strong> y
            <strong> Purchase</strong> con valor. Deja un campo vacío para desactivar esa plataforma.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {TRK_FIELDS.map(({ k, label, ph, hint }) => (
              <div key={k}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: B.sand, marginBottom: 6 }}>{label}</label>
                <input value={form[k] || ""} onChange={e => set(k, e.target.value)} placeholder={ph}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.12)", background: B.navy, color: "#fff", fontSize: 13, outline: "none" }} />
                <div style={{ fontSize: 11, color: B.muted, marginTop: 5 }}>{hint}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20 }}>
            <button onClick={guardar} disabled={saving}
              style={{ padding: "10px 22px", borderRadius: 8, border: "none", cursor: saving ? "default" : "pointer",
                background: B.success, color: "#fff", fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            {saved && <span style={{ fontSize: 13, color: B.success, fontWeight: 700 }}>✓ Guardado · activo en el próximo ingreso al booking</span>}
          </div>
        </div>
      )}
    </div>
  );
}
