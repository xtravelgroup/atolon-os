// ─────────────────────────────────────────────────────────────────────────────
// COMPRAS — Módulo top-level para el equipo de procurement
// Agrupa el ciclo completo: Dashboard, Órdenes, Logística, CXP, Reportes
// Las requisiciones (solicitudes de área) siguen viviendo en /requisiciones.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from "react";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";
import FacturaProveedorModal from "../components/FacturaProveedorModal";
import LogisticaOCModal from "../components/LogisticaOCModal";
import EmailOCModal from "../components/EmailOCModal";
import CXPPagoModal from "../components/CXPPagoModal";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "ordenes",   label: "Órdenes",   icon: "🧾" },
  { key: "logistica", label: "Logística", icon: "🚚" },
  { key: "cxp",       label: "Cuentas x Pagar", icon: "💳" },
  { key: "reportes",  label: "Reportes",  icon: "📑" },
];

const OC_BADGE = {
  emitida:          { bg: "#1E3566", color: B.sky,     label: "Emitida" },
  enviada:          { bg: "#1E3566", color: B.sky,     label: "Enviada" },
  confirmada:       { bg: "#153322", color: B.success, label: "Confirmada" },
  ordenada:         { bg: "#153322", color: B.success, label: "Ordenada" },
  pagada:           { bg: "#2A220A", color: B.warning, label: "Pagada" },
  recibida_parcial: { bg: "#1E3F2A", color: "#a3e635", label: "Recibida parcial" },
  recibida:         { bg: "#153322", color: "#6DD4A0", label: "Recibida" },
  cancelada:        { bg: "#2A0A0A", color: B.danger,  label: "Cancelada" },
};

export default function Compras() {
  const { isMobile } = useBreakpoint();
  const [tab, setTab] = useState("dashboard");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState([]);
  const [entregas, setEntregas] = useState([]);
  const [transportes, setTransportes] = useState([]);
  const [zarpes, setZarpes] = useState([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (u) setCurrentUser({ id: u.id, email: u.email, nombre: u.user_metadata?.nombre || u.email });
    });
  }, []);

  const reload = async () => {
    setLoading(true);
    const [oc, em, ta, zf] = await Promise.all([
      supabase.from("ordenes_compra").select("*").order("created_at", { ascending: false }),
      supabase.from("oc_entregas_muelle").select("*").order("fecha_programada", { ascending: true }),
      supabase.from("oc_transporte_atolon").select("*").order("fecha_zarpe", { ascending: true }),
      supabase.from("muelle_zarpes_flota").select("*").gte("fecha", todayStr()).order("fecha", { ascending: true }).limit(20),
    ]);
    setOrdenes(oc.data || []);
    setEntregas(em.data || []);
    setTransportes(ta.data || []);
    setZarpes(zf.data || []);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  return (
    <div style={{ padding: isMobile ? 16 : 24, color: B.white, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, margin: 0, color: B.sand }}>
          🛒 Compras
        </h1>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          Procurement, órdenes, logística muelle → Atolón y cuentas por pagar
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${B.navyLight}`,
        overflowX: "auto", scrollbarWidth: "none",
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: "10px 16px", fontSize: 13, fontWeight: 700,
              border: "none", background: "transparent",
              color: tab === t.key ? B.sand : "rgba(255,255,255,0.5)",
              borderBottom: `2px solid ${tab === t.key ? B.sand : "transparent"}`,
              cursor: "pointer", whiteSpace: "nowrap", marginBottom: -1,
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading
        ? <Loading />
        : tab === "dashboard" ? <TabDashboard ordenes={ordenes} entregas={entregas} transportes={transportes} zarpes={zarpes} setTab={setTab} />
        : tab === "ordenes"   ? <TabOrdenes ordenes={ordenes} reload={reload} currentUser={currentUser} />
        : tab === "logistica" ? <TabLogistica ordenes={ordenes} entregas={entregas} transportes={transportes} zarpes={zarpes} reload={reload} currentUser={currentUser} />
        : tab === "cxp"       ? <TabCXP ordenes={ordenes} reload={reload} currentUser={currentUser} />
        : tab === "reportes"  ? <TabReportes ordenes={ordenes} />
        : null}
    </div>
  );
}

function Loading() {
  return <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB DASHBOARD — KPIs
// ═══════════════════════════════════════════════════════════════════════════
function TabDashboard({ ordenes, entregas, transportes, zarpes, setTab }) {
  const today = todayStr();
  const month = today.slice(0, 7);

  const ocAbiertas       = ordenes.filter(o => !["recibida", "cancelada"].includes(o.estado));
  const ocMes            = ordenes.filter(o => (o.fecha_emision || "").startsWith(month));
  const totalAbierto     = ocAbiertas.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalMes         = ocMes.reduce((s, o) => s + Number(o.total || 0), 0);
  const sinFactura       = ocAbiertas.filter(o => !o.factura_aplicada).length;
  const entregasHoy      = entregas.filter(e => e.fecha_programada === today && e.estado !== "cancelada");
  const entregasPendMuel = entregas.filter(e => ["programada", "en_camino", "demorada"].includes(e.estado));
  const enTransito       = transportes.filter(t => ["programado", "zarpado"].includes(t.estado));

  const KPIs = [
    { label: "OCs abiertas", value: ocAbiertas.length, sub: COP(totalAbierto), color: B.sky, tab: "ordenes" },
    { label: "OCs del mes",  value: ocMes.length, sub: COP(totalMes), color: B.sand, tab: "ordenes" },
    { label: "Sin factura aplicada", value: sinFactura, sub: "abiertas pendientes", color: B.warning, tab: "ordenes" },
    { label: "Entregas hoy en muelle", value: entregasHoy.length, sub: "Bodeguita / Marina", color: B.success, tab: "logistica" },
    { label: "En tránsito a Atolón",   value: enTransito.length, sub: "muelle → isla", color: B.pink, tab: "logistica" },
    { label: "Pendientes en muelle",   value: entregasPendMuel.length, sub: "esperando recepción", color: "#a3e635", tab: "logistica" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {KPIs.map(k => (
          <div key={k.label} onClick={() => k.tab && setTab(k.tab)}
            style={{
              background: B.navyMid, border: `1px solid ${B.navyLight}`,
              borderLeft: `4px solid ${k.color}`, borderRadius: 12, padding: 16,
              cursor: k.tab ? "pointer" : "default",
            }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, marginTop: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Próximos zarpes con carga */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: B.sand, marginBottom: 10 }}>⛵ Próximos zarpes con carga asignada</h3>
        {zarpes.length === 0
          ? <div style={{ background: B.navyMid, padding: 16, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Sin zarpes programados.</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {zarpes.slice(0, 5).map(z => {
                const cargaOC = transportes.filter(t => t.zarpe_flota_id === z.id);
                const totalCarga = cargaOC.reduce((s, t) => s + Number(t.costo_transporte || 0), 0);
                return (
                  <div key={z.id} style={{ background: B.navyMid, padding: "10px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtFecha(z.fecha)} · {z.hora_zarpe || "—"} · {z.embarcacion || "Sin lancha"}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                        {cargaOC.length === 0 ? "Sin carga asignada" : `${cargaOC.length} OC asignada${cargaOC.length > 1 ? "s" : ""}`}
                      </div>
                    </div>
                    {totalCarga > 0 && <div style={{ fontSize: 13, fontWeight: 800, color: B.sand }}>{COP(totalCarga)}</div>}
                  </div>
                );
              })}
            </div>
          )
        }
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB ÓRDENES — Vista global de OCs
// ═══════════════════════════════════════════════════════════════════════════
function TabOrdenes({ ordenes, reload, currentUser }) {
  const { isMobile } = useBreakpoint();
  const [filtroEstado, setFiltroEstado] = useState("abiertas");
  const [busqueda, setBusqueda] = useState("");
  const [openFactura, setOpenFactura] = useState(null);
  const [openLogistica, setOpenLogistica] = useState(null);
  const [openEmail, setOpenEmail] = useState(null);

  const filtradas = useMemo(() => {
    let list = ordenes;
    if (filtroEstado === "abiertas") list = list.filter(o => !["recibida", "cancelada"].includes(o.estado));
    else if (filtroEstado === "cerradas") list = list.filter(o => ["recibida", "cancelada"].includes(o.estado));
    else if (filtroEstado !== "todas") list = list.filter(o => o.estado === filtroEstado);
    if (busqueda) {
      const q = busqueda.toLowerCase();
      list = list.filter(o =>
        (o.codigo || "").toLowerCase().includes(q) ||
        (o.proveedor_nombre || "").toLowerCase().includes(q) ||
        (o.requisicion_id || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [ordenes, filtroEstado, busqueda]);

  const totalFiltradas = filtradas.reduce((s, o) => s + Number(o.total || 0), 0);

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <input type="text" placeholder="Buscar código, proveedor, requisición…" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white, fontSize: 13 }} />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white, fontSize: 13 }}>
          <option value="abiertas">Abiertas</option>
          <option value="todas">Todas</option>
          <option value="emitida">Emitidas</option>
          <option value="enviada">Enviadas</option>
          <option value="confirmada">Confirmadas</option>
          <option value="recibida_parcial">Recibida parcial</option>
          <option value="recibida">Recibidas</option>
          <option value="cancelada">Canceladas</option>
          <option value="cerradas">Cerradas (recibida/cancelada)</option>
        </select>
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>
        {filtradas.length} OC · Total: <span style={{ color: B.sand, fontWeight: 700 }}>{COP(totalFiltradas)}</span>
      </div>

      {filtradas.length === 0
        ? <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>Sin órdenes con esos filtros.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtradas.map(oc => {
              const badge = OC_BADGE[oc.estado] || { bg: B.navyLight, color: "rgba(255,255,255,0.5)", label: oc.estado };
              const totalLineas = (oc.items || []).length;
              return (
                <div key={oc.id} style={{
                  background: B.navy, borderRadius: 10, padding: "12px 14px",
                  border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${B.sand}`,
                  display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "space-between",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      🧾 {oc.codigo}
                      <span style={{ background: badge.bg, color: badge.color, padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700 }}>{badge.label}</span>
                      {oc.factura_aplicada && <span style={{ background: B.success + "22", color: B.success, padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700 }}>📄 Facturada</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                      {oc.proveedor_nombre || "Sin proveedor"} · {fmtFecha(oc.fecha_emision)} · {totalLineas} líneas
                    </div>
                  </div>
                  <div style={{ textAlign: isMobile ? "left" : "right", display: "flex", flexDirection: "column", gap: 6, alignItems: isMobile ? "flex-start" : "flex-end" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(oc.total || 0)}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => setOpenEmail(oc)}
                        style={btnAccion(B.pink)}
                        title="Enviar OC al proveedor por correo con PDF">
                        📧 Email
                      </button>
                      <button onClick={() => setOpenFactura(oc)}
                        style={btnAccion(oc.factura_aplicada ? B.success : B.warning)}>
                        {oc.factura_aplicada ? "📄✓ Factura" : "📎 Factura"}
                      </button>
                      <button onClick={() => setOpenLogistica(oc)}
                        style={btnAccion(B.sky)}>
                        🚚 Logística
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {openFactura && <FacturaProveedorModal oc={openFactura} onClose={() => setOpenFactura(null)} reload={reload} currentUser={currentUser} />}
      {openLogistica && <LogisticaOCModal oc={openLogistica} onClose={() => setOpenLogistica(null)} reload={reload} currentUser={currentUser} />}
      {openEmail && <EmailOCModal oc={openEmail} onClose={() => setOpenEmail(null)} reload={reload} currentUser={currentUser} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB LOGÍSTICA — Vista global de entregas en muelle + zarpes con carga
// ═══════════════════════════════════════════════════════════════════════════
function TabLogistica({ ordenes, entregas, transportes, zarpes, reload, currentUser }) {
  const { isMobile } = useBreakpoint();
  const [openLogistica, setOpenLogistica] = useState(null);
  const today = todayStr();

  // Index para resolver oc por id
  const ocById = useMemo(() => Object.fromEntries(ordenes.map(o => [o.id, o])), [ordenes]);

  // Hoy y siguientes 7 días
  const hoy        = entregas.filter(e => e.fecha_programada === today && e.estado !== "cancelada");
  const proximas   = entregas.filter(e => e.fecha_programada > today && e.estado !== "cancelada").slice(0, 10);
  const pendientes = entregas.filter(e => e.fecha_programada < today && !["entregada", "cancelada"].includes(e.estado));

  const enTransito = transportes.filter(t => ["zarpado", "en_atolon"].includes(t.estado));
  const programadas = transportes.filter(t => t.estado === "programado");

  const openOC = (ocId) => {
    const oc = ocById[ocId];
    if (oc) setOpenLogistica(oc);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
      {/* Columna izquierda: Muelle (Bodeguita) */}
      <Section titulo="🚚 Entregas en muelle" subtitulo="Equipo Bodeguita / Cartagena">
        <SubSection titulo="Hoy" count={hoy.length}>
          {hoy.length === 0 ? <Empty texto="Sin entregas programadas para hoy" />
            : hoy.map(e => <EntregaRow key={e.id} entrega={e} oc={ocById[e.oc_id]} onClick={() => openOC(e.oc_id)} />)}
        </SubSection>
        {pendientes.length > 0 && (
          <SubSection titulo="⚠ Atrasadas" count={pendientes.length} color={B.danger}>
            {pendientes.map(e => <EntregaRow key={e.id} entrega={e} oc={ocById[e.oc_id]} onClick={() => openOC(e.oc_id)} atrasada />)}
          </SubSection>
        )}
        <SubSection titulo="Próximas" count={proximas.length}>
          {proximas.length === 0 ? <Empty texto="Sin entregas próximas" />
            : proximas.map(e => <EntregaRow key={e.id} entrega={e} oc={ocById[e.oc_id]} onClick={() => openOC(e.oc_id)} />)}
        </SubSection>
      </Section>

      {/* Columna derecha: Transporte muelle → Atolón */}
      <Section titulo="⛵ Transporte muelle → Atolón" subtitulo="Carga en lancha">
        <SubSection titulo="En tránsito" count={enTransito.length}>
          {enTransito.length === 0 ? <Empty texto="Sin OC en tránsito" />
            : enTransito.map(t => <TransporteRow key={t.id} transporte={t} oc={ocById[t.oc_id]} onClick={() => openOC(t.oc_id)} />)}
        </SubSection>
        <SubSection titulo="Programadas" count={programadas.length}>
          {programadas.length === 0 ? <Empty texto="Sin programaciones" />
            : programadas.map(t => <TransporteRow key={t.id} transporte={t} oc={ocById[t.oc_id]} onClick={() => openOC(t.oc_id)} />)}
        </SubSection>
        {zarpes.length > 0 && (
          <SubSection titulo="📅 Próximos zarpes" count={zarpes.length}>
            {zarpes.slice(0, 6).map(z => {
              const carga = transportes.filter(t => t.zarpe_flota_id === z.id);
              return (
                <div key={z.id} style={rowStyle}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtFecha(z.fecha)} · {z.hora_zarpe || "—"}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                      {z.embarcacion || "Sin lancha"} · {carga.length} OC{carga.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </SubSection>
        )}
      </Section>

      {openLogistica && <LogisticaOCModal oc={openLogistica} onClose={() => setOpenLogistica(null)} reload={reload} currentUser={currentUser} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB CXP — Cuentas por Pagar con aging, vencimientos y registro de pagos
// ═══════════════════════════════════════════════════════════════════════════
function TabCXP({ ordenes, reload, currentUser }) {
  const [openPago, setOpenPago] = useState(null);
  const [filtro, setFiltro] = useState("pendientes"); // pendientes | vencidas | proximas | pagadas | todas
  const today = new Date();

  const conFactura = ordenes.filter(o => o.factura_aplicada);

  // Calcular aging por OC
  const enriquecidas = conFactura.map(oc => {
    const total = Number(oc.total || 0);
    const pagado = Number(oc.monto_pagado || 0);
    const saldo = total - pagado;
    const venceEnDias = oc.fecha_vencimiento_pago
      ? Math.floor((new Date(oc.fecha_vencimiento_pago) - today) / 86400000)
      : null;
    const bucket = oc.pagada_completa ? "pagadas"
      : venceEnDias === null ? "pendientes"
      : venceEnDias < 0 ? "vencidas"
      : venceEnDias <= 7 ? "proximas"
      : "pendientes";
    return { ...oc, _saldo: saldo, _pagado: pagado, _vence: venceEnDias, _bucket: bucket };
  });

  // KPIs por bucket
  const buckets = {
    vencidas:   enriquecidas.filter(o => o._bucket === "vencidas"),
    proximas:   enriquecidas.filter(o => o._bucket === "proximas"),
    pendientes: enriquecidas.filter(o => o._bucket === "pendientes"),
    pagadas:    enriquecidas.filter(o => o._bucket === "pagadas"),
  };

  const sum = (list) => list.reduce((s, o) => s + Number(o._saldo || 0), 0);
  const sumPagado = (list) => list.reduce((s, o) => s + Number(o._pagado || 0), 0);

  // Aging buckets
  const aging = {
    al_dia:    enriquecidas.filter(o => o._bucket !== "pagadas" && (o._vence === null || o._vence >= 0)),
    "1-30":    enriquecidas.filter(o => o._bucket !== "pagadas" && o._vence !== null && o._vence < 0 && o._vence >= -30),
    "31-60":   enriquecidas.filter(o => o._bucket !== "pagadas" && o._vence !== null && o._vence < -30 && o._vence >= -60),
    "61-90":   enriquecidas.filter(o => o._bucket !== "pagadas" && o._vence !== null && o._vence < -60 && o._vence >= -90),
    "+90":     enriquecidas.filter(o => o._bucket !== "pagadas" && o._vence !== null && o._vence < -90),
  };

  const filtradas = filtro === "todas" ? enriquecidas : (buckets[filtro] || []);
  const sortFn = (a, b) => {
    if (a._vence === null && b._vence !== null) return 1;
    if (b._vence === null && a._vence !== null) return -1;
    return (a._vence ?? 0) - (b._vence ?? 0);
  };
  filtradas.sort(sortFn);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
        <KpiCXP label="Vencidas"      count={buckets.vencidas.length}   total={sum(buckets.vencidas)}   color={B.danger}  onClick={() => setFiltro("vencidas")}   active={filtro === "vencidas"} />
        <KpiCXP label="Vencen ≤ 7d"   count={buckets.proximas.length}   total={sum(buckets.proximas)}   color={B.warning} onClick={() => setFiltro("proximas")}   active={filtro === "proximas"} />
        <KpiCXP label="Pendientes"    count={buckets.pendientes.length} total={sum(buckets.pendientes)} color={B.sky}     onClick={() => setFiltro("pendientes")} active={filtro === "pendientes"} />
        <KpiCXP label="Pagadas (mes)" count={buckets.pagadas.length}    total={sumPagado(buckets.pagadas)} color={B.success} onClick={() => setFiltro("pagadas")} active={filtro === "pagadas"} />
      </div>

      {/* Aging */}
      <div style={{ background: B.navyMid, borderRadius: 10, padding: 12, marginBottom: 14, border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Aging (días vencidos)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {[
            ["al_dia", "Al día", B.success],
            ["1-30",   "1-30",   B.warning],
            ["31-60",  "31-60",  "#FF8C42"],
            ["61-90",  "61-90",  B.danger],
            ["+90",    "+90",    "#8B0000"],
          ].map(([k, l, c]) => (
            <div key={k} style={{ background: B.navy, padding: 8, borderRadius: 6, borderTop: `2px solid ${c}` }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: "'Barlow Condensed', sans-serif" }}>{aging[k].length}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{COP(sum(aging[k]))}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtradas.length === 0
        ? <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>
            {filtro === "pagadas" ? "Sin pagos registrados todavía." : "Sin facturas pendientes."}
          </div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtradas.map(oc => {
              const f = oc.factura_data || {};
              const venceColor =
                oc._bucket === "vencidas" ? B.danger
                : oc._bucket === "proximas" ? B.warning
                : oc._bucket === "pagadas" ? B.success
                : B.sky;
              return (
                <div key={oc.id} style={{
                  background: B.navy, borderRadius: 8, padding: "10px 14px",
                  border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${venceColor}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>
                      📄 {f.factura_numero || "—"} · {oc.codigo}
                      {oc.pagada_completa && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", background: B.success, color: B.navy, borderRadius: 12, fontWeight: 700 }}>PAGADA</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      {oc.proveedor_nombre} · NIT {oc.proveedor_nit || "—"} · {fmtFecha(f.factura_fecha || oc.fecha_emision)}
                    </div>
                    {oc.fecha_vencimiento_pago && (
                      <div style={{ fontSize: 11, color: venceColor, marginTop: 2, fontWeight: 700 }}>
                        {oc._vence < 0 ? `⚠ Vencida hace ${Math.abs(oc._vence)}d` : oc._vence === 0 ? "🔔 Vence hoy" : `Vence en ${oc._vence}d`} · {fmtFecha(oc.fecha_vencimiento_pago)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(oc.total || 0)}</div>
                    {oc._pagado > 0 && <div style={{ fontSize: 10, color: B.success }}>Pagado: {COP(oc._pagado)}</div>}
                    {oc._saldo > 0 && <div style={{ fontSize: 11, color: B.warning, fontWeight: 700 }}>Saldo: {COP(oc._saldo)}</div>}
                    <button onClick={() => setOpenPago(oc)}
                      style={{ ...btnAccion(B.warning), marginTop: 4 }}>
                      💳 {oc.pagada_completa ? "Ver pagos" : "Registrar pago"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {openPago && <CXPPagoModal oc={openPago} onClose={() => setOpenPago(null)} reload={reload} currentUser={currentUser} />}
    </div>
  );
}

function KpiCXP({ label, count, total, color, onClick, active }) {
  return (
    <div onClick={onClick} style={{
      background: active ? color + "22" : B.navyMid,
      border: `1px solid ${active ? color : B.navyLight}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 10, padding: 12, cursor: "pointer",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 2 }}>{count}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{COP(total)}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB REPORTES — Compras del mes, por proveedor, por estado
// ═══════════════════════════════════════════════════════════════════════════
function TabReportes({ ordenes }) {
  const month = todayStr().slice(0, 7);
  const ocMes = ordenes.filter(o => (o.fecha_emision || "").startsWith(month));

  // Por proveedor
  const porProveedor = {};
  ocMes.forEach(o => {
    const k = o.proveedor_nombre || "Sin proveedor";
    if (!porProveedor[k]) porProveedor[k] = { total: 0, count: 0 };
    porProveedor[k].total += Number(o.total || 0);
    porProveedor[k].count += 1;
  });
  const proveedoresOrdenados = Object.entries(porProveedor).sort((a, b) => b[1].total - a[1].total);

  // Por estado
  const porEstado = {};
  ordenes.forEach(o => {
    const k = o.estado || "—";
    if (!porEstado[k]) porEstado[k] = { count: 0, total: 0 };
    porEstado[k].count += 1;
    porEstado[k].total += Number(o.total || 0);
  });

  const totalMes = ocMes.reduce((s, o) => s + Number(o.total || 0), 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>📅 Compras del mes ({month})</h3>
        <div style={{ fontSize: 32, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(totalMes)}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{ocMes.length} OC emitida{ocMes.length !== 1 ? "s" : ""}</div>
      </div>

      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>🏢 Top proveedores del mes</h3>
        {proveedoresOrdenados.length === 0
          ? <Empty texto="Sin OCs este mes" />
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
              {proveedoresOrdenados.slice(0, 8).map(([nombre, data]) => (
                <div key={nombre} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${B.navyLight}`, fontSize: 12 }}>
                  <div style={{ flex: 1 }}>{nombre} <span style={{ color: "rgba(255,255,255,0.4)" }}>({data.count})</span></div>
                  <div style={{ color: B.sand, fontWeight: 700 }}>{COP(data.total)}</div>
                </div>
              ))}
            </div>
          )
        }
      </div>

      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>📊 OCs por estado</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
          {Object.entries(porEstado).map(([estado, data]) => {
            const badge = OC_BADGE[estado] || { color: "rgba(255,255,255,0.5)", label: estado };
            return (
              <div key={estado} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${B.navyLight}`, fontSize: 12 }}>
                <div style={{ color: badge.color, fontWeight: 700 }}>{badge.label}</div>
                <div>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>{data.count} · </span>
                  <span style={{ color: B.sand, fontWeight: 700 }}>{COP(data.total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE UI
// ═══════════════════════════════════════════════════════════════════════════
function Section({ titulo, subtitulo, children }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, border: `1px solid ${B.navyLight}` }}>
      <div style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: B.sand, margin: 0 }}>{titulo}</h3>
        {subtitulo && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{subtitulo}</div>}
      </div>
      {children}
    </div>
  );
}

function SubSection({ titulo, count, color, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, color: color || "rgba(255,255,255,0.5)",
        fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
        marginBottom: 6, display: "flex", justifyContent: "space-between",
      }}>
        <span>{titulo}</span>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>{count}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function EntregaRow({ entrega, oc, onClick, atrasada }) {
  const estado = entrega.estado;
  const colors = {
    programada: B.sky, en_camino: B.warning, entregada: B.success, demorada: B.danger, cancelada: "rgba(255,255,255,0.3)",
  };
  return (
    <div onClick={onClick} style={{ ...rowStyle, cursor: "pointer", borderLeft: `3px solid ${atrasada ? B.danger : colors[estado] || B.sky}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          {entrega.oc_codigo} · <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{oc?.proveedor_nombre || "—"}</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
          {fmtFecha(entrega.fecha_programada)} {entrega.hora_programada || ""} · {entrega.ubicacion || "Bodeguita"} · <span style={{ color: colors[estado] || B.sky }}>{estado}</span>
        </div>
      </div>
      {oc?.total && <div style={{ fontSize: 12, fontWeight: 700, color: B.sand }}>{COP(oc.total)}</div>}
    </div>
  );
}

function TransporteRow({ transporte, oc, onClick }) {
  const estado = transporte.estado;
  const colors = {
    programado: B.sky, zarpado: B.warning, en_atolon: B.pink, recibido: B.success, cancelado: "rgba(255,255,255,0.3)",
  };
  return (
    <div onClick={onClick} style={{ ...rowStyle, cursor: "pointer", borderLeft: `3px solid ${colors[estado] || B.sky}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          {transporte.oc_codigo} · <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{oc?.proveedor_nombre || "—"}</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
          {fmtFecha(transporte.fecha_zarpe)} {transporte.hora_zarpe || ""} · {transporte.embarcacion_nombre || "—"} · <span style={{ color: colors[estado] || B.sky }}>{estado}</span>
        </div>
      </div>
      {transporte.costo_transporte > 0 && <div style={{ fontSize: 11, color: B.sand }}>{COP(transporte.costo_transporte)}</div>}
    </div>
  );
}

function Empty({ texto }) {
  return <div style={{ padding: "10px 12px", color: "rgba(255,255,255,0.3)", fontSize: 11, fontStyle: "italic" }}>{texto}</div>;
}

const rowStyle = {
  background: B.navy, padding: "8px 10px", borderRadius: 6,
  border: `1px solid ${B.navyLight}`,
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
};

const cardStyle = {
  background: B.navyMid, borderRadius: 12, padding: 16,
  border: `1px solid ${B.navyLight}`,
};

const cardTitleStyle = {
  fontSize: 13, fontWeight: 700, color: B.sand, margin: 0, marginBottom: 6,
};

function btnAccion(color) {
  return {
    padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 6,
    border: `1px solid ${color}`, background: color + "22", color, cursor: "pointer",
  };
}
