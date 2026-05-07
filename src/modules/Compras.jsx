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
import CotizacionRespuestaModal from "../components/CotizacionRespuestaModal";
import { TabMesaCompras } from "./Requisiciones";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "mesa",      label: "Mesa de Compras", icon: "🛒" },
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

// Estados editables — una OC se considera editable solo en borrador o emitida.
// Una vez "enviada" al proveedor (o más allá), se bloquea: no se editan items
// ni se le agregan items nuevos desde requisiciones — se debe crear una OC nueva.
// Una OC se puede editar mientras no haya factura aplicada y no esté
// recibida/pagada/cancelada. Esto incluye OCs ya enviadas al proveedor —
// porque el proveedor responde con cambios (no tengo X, cantidad Y, precio Z)
// y Compras debe poder ajustar antes de la recepción/factura.
const OC_EDITABLE = (oc) => {
  if (!oc) return false;
  if (oc.factura_aplicada) return false;
  return ["borrador","emitida","enviada","confirmada","anticipo_pendiente"].includes(oc.estado || "emitida");
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
  const [reqs, setReqs] = useState([]);
  const [proveedores, setProveedores] = useState([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data?.user;
      if (!u) return;
      // Cargar fila de usuarios para tener id + rol (lo necesita TabMesaCompras)
      const { data: row } = await supabase.from("usuarios").select("id, nombre, rol_id").eq("email", u.email).maybeSingle();
      setCurrentUser({
        id: row?.id || u.id,
        email: u.email,
        nombre: row?.nombre || u.user_metadata?.nombre || u.email,
        rol: row?.rol_id || null,
      });
    });
  }, []);

  const reload = async () => {
    setLoading(true);
    // Performance: limitar OCs y entregas a los últimos 90 días para no
    // descargar todo el histórico cada vez que se entra al módulo.
    // Cerradas/canceladas más antiguas se pueden buscar via filtros.
    const noventaDiasAtras = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    const [oc, em, ta, zf, rq, pv] = await Promise.all([
      supabase.from("ordenes_compra").select("*").gte("created_at", noventaDiasAtras).order("created_at", { ascending: false }).limit(500),
      supabase.from("oc_entregas_muelle").select("*").gte("fecha_programada", todayStr()).order("fecha_programada", { ascending: true }).limit(200),
      supabase.from("oc_transporte_atolon").select("*").gte("fecha_zarpe", todayStr()).order("fecha_zarpe", { ascending: true }).limit(200),
      supabase.from("muelle_zarpes_flota").select("*").gte("fecha", todayStr()).order("fecha", { ascending: true }).limit(20),
      supabase.from("requisiciones").select("*").order("fecha", { ascending: false }).limit(300),
      supabase.from("proveedores").select("*").order("nombre"),
    ]);
    setOrdenes(oc.data || []);
    setEntregas(em.data || []);
    setTransportes(ta.data || []);
    setZarpes(zf.data || []);
    setReqs(rq.data || []);
    setProveedores(pv.data || []);
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
        : tab === "dashboard" ? <TabDashboard ordenes={ordenes} entregas={entregas} transportes={transportes} zarpes={zarpes} reqs={reqs} setTab={setTab} />
        : tab === "mesa"      ? <TabMesaCompras reqs={reqs} ordenes={ordenes} proveedores={proveedores} currentUser={currentUser} reload={reload} onNuevoProv={() => alert("Crea proveedores desde el módulo Proveedores")} />
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
function TabDashboard({ ordenes, entregas, transportes, zarpes, reqs = [], setTab }) {
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
  // Items pendientes en mesa: aprobadas + sin oc_id en items
  const itemsMesa = (() => {
    let n = 0;
    reqs.forEach(r => {
      if (!["Aprobada", "En Compra", "Recibida Parcial"].includes(r.estado)) return;
      (r.items || []).forEach(it => { if (!it.oc_id) n++; });
    });
    return n;
  })();
  const reqsAprobadas = reqs.filter(r => r.estado === "Aprobada").length;

  const KPIs = [
    { label: "Mesa de Compras", value: itemsMesa, sub: `${reqsAprobadas} reqs aprobadas`, color: "#FFA500", tab: "mesa" },
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
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [openFactura, setOpenFactura] = useState(null);
  const [openLogistica, setOpenLogistica] = useState(null);
  const [openEmail, setOpenEmail] = useState(null);
  const [openCotizResp, setOpenCotizResp] = useState(null);
  const [openEditar, setOpenEditar] = useState(null);
  const [openUnir,   setOpenUnir]   = useState(null);

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

  // Marcar OC como enviada al proveedor — bloquea edición e impide
  // que se le agreguen más items desde Requisiciones. Si necesitan más
  // items, deben crear una OC nueva.
  const marcarEnviada = async (oc) => {
    if (!confirm(
      `¿Confirmar que la OC ${oc.codigo} fue enviada al proveedor?\n\n` +
      `Una vez marcada, NO se podrán agregar más items a esta orden — ` +
      `los items nuevos crearán una OC nueva.`
    )) return;
    const { error } = await supabase.from("ordenes_compra").update({
      estado:      "enviada",
      enviada_at:  new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    }).eq("id", oc.id);
    if (error) return alert("Error: " + error.message);
    reload?.();
  };

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
                <div key={oc.id}
                  onClick={(e) => {
                    // No abrir si el click fue en un botón/link/input adentro
                    if (e.target.closest("button, a, input, select, textarea")) return;
                    if (OC_EDITABLE(oc)) setOpenEditar(oc);
                  }}
                  style={{
                  background: B.navy, borderRadius: 10, padding: "12px 14px",
                  border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${B.sand}`,
                  display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "space-between",
                  cursor: OC_EDITABLE(oc) ? "pointer" : "default",
                  transition: "background 0.15s",
                }}
                  onMouseEnter={e => { if (OC_EDITABLE(oc)) e.currentTarget.style.background = B.navyMid; }}
                  onMouseLeave={e => { e.currentTarget.style.background = B.navy; }}>
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
                    {/* Acceso directo a archivos adjuntos: cotización / factura.
                        El usuario puede previsualizar el PDF/imagen sin abrir el modal. */}
                    {(oc.cotizacion_resp_url || oc.factura_url) && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                        {oc.cotizacion_resp_url && (
                          <a href={oc.cotizacion_resp_url} target="_blank" rel="noreferrer"
                            title={`Ver cotización del proveedor${oc.cotizacion_resp_subida_at ? " — subida " + fmtFecha(oc.cotizacion_resp_subida_at.slice(0,10)) : ""}`}
                            style={{ color: oc.cotizacion_resp_aprobada ? B.success : "#a78bfa", textDecoration: "none", fontWeight: 600,
                              padding: "2px 8px", borderRadius: 6, border: `1px solid ${(oc.cotizacion_resp_aprobada ? B.success : "#a78bfa") + "55"}`,
                              background: (oc.cotizacion_resp_aprobada ? B.success : "#a78bfa") + "11" }}>
                            📎 Cotización
                          </a>
                        )}
                        {oc.factura_url && (
                          <a href={oc.factura_url} target="_blank" rel="noreferrer"
                            title={`Ver factura${oc.factura_numero ? " " + oc.factura_numero : ""}${oc.factura_fecha ? " — " + fmtFecha(oc.factura_fecha.slice(0,10)) : ""}`}
                            style={{ color: oc.factura_aplicada ? B.success : B.warning, textDecoration: "none", fontWeight: 600,
                              padding: "2px 8px", borderRadius: 6, border: `1px solid ${(oc.factura_aplicada ? B.success : B.warning) + "55"}`,
                              background: (oc.factura_aplicada ? B.success : B.warning) + "11" }}>
                            📎 Factura{oc.factura_numero ? " " + oc.factura_numero : ""}
                          </a>
                        )}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {OC_EDITABLE(oc) && (
                        <button onClick={() => setOpenEditar(oc)}
                          style={btnAccion(B.sand)}
                          title={oc.enviada_at
                            ? "Editar OC tras respuesta del proveedor (cantidades, precios, devolver items a mesa)"
                            : "Editar items, cantidades, proveedor de la OC"}>
                          ✏️ Editar
                        </button>
                      )}
                      {OC_EDITABLE(oc) && (
                        <button onClick={() => setOpenUnir(oc)}
                          style={btnAccion("#a78bfa")}
                          title="Unir esta OC con otra del mismo proveedor (consolida items y reqs)">
                          🔗 Unir
                        </button>
                      )}
                      <button onClick={() => setOpenEmail(oc)}
                        style={btnAccion(B.pink)}
                        title="Enviar OC al proveedor por correo con PDF">
                        📧 Email
                      </button>
                      {OC_EDITABLE(oc) ? (
                        <button onClick={() => marcarEnviada(oc)}
                          style={btnAccion(B.sky)}
                          title="Marcar como enviada al proveedor — bloquea edición y no permite agregar más items">
                          📤 Enviada a proveedor
                        </button>
                      ) : (
                        <span style={{ ...btnAccion(B.success + "44"), cursor: "default", color: B.success, display: "inline-flex", alignItems: "center", gap: 4 }}
                          title={`Enviada${oc.enviada_at ? " el " + fmtFecha(oc.enviada_at.slice(0,10)) : ""} — bloqueada para nuevos items`}>
                          🔒 Enviada
                        </span>
                      )}
                      <button onClick={() => setOpenCotizResp(oc)}
                        style={btnAccion(oc.cotizacion_resp_aprobada ? B.success : oc.cotizacion_resp_data ? B.warning : "#a78bfa")}
                        title="Cotización-respuesta del proveedor">
                        {oc.cotizacion_resp_aprobada ? "📋✓ Cotiz" : oc.cotizacion_resp_data ? "📋⏳ Cotiz" : "📋 Cotiz Resp"}
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
      {openCotizResp && <CotizacionRespuestaModal oc={openCotizResp} onClose={() => setOpenCotizResp(null)} reload={reload} currentUser={currentUser} />}
      {openEditar && <EditarOCModal oc={openEditar} onClose={() => setOpenEditar(null)} reload={reload} currentUser={currentUser} />}
      {openUnir && <UnirOCModal oc={openUnir} ordenes={ordenes} onClose={() => setOpenUnir(null)} reload={reload} currentUser={currentUser} />}
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
  const [subtab, setSubtab] = useState("anticipos");
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${B.navyLight}` }}>
        {[
          ["anticipos", `🏦 Anticipos pendientes`],
          ["facturas",  `💳 Facturas por pagar`],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setSubtab(k)}
            style={{
              padding: "10px 16px", fontSize: 13, fontWeight: 700,
              border: "none", background: "transparent",
              color: subtab === k ? B.sand : "rgba(255,255,255,0.5)",
              borderBottom: `2px solid ${subtab === k ? B.sand : "transparent"}`,
              cursor: "pointer", marginBottom: -1,
            }}>{l}</button>
        ))}
      </div>
      {subtab === "anticipos"
        ? <SubtabAnticipos ordenes={ordenes} reload={reload} currentUser={currentUser} />
        : <SubtabFacturas ordenes={ordenes} reload={reload} currentUser={currentUser} />
      }
    </div>
  );
}

function SubtabAnticipos({ ordenes, reload, currentUser }) {
  const pendientes = ordenes.filter(o => o.anticipo_requerido && !o.anticipo_pagado);
  const pagados    = ordenes.filter(o => o.anticipo_requerido && o.anticipo_pagado);
  const totalPend  = pendientes.reduce((s, o) => s + Number(o.anticipo_monto || 0), 0);
  const totalPag   = pagados.reduce((s, o) => s + Number(o.anticipo_monto || 0), 0);

  const marcarPagado = async (oc) => {
    const referencia = prompt(`Referencia del pago del anticipo (Nº de transferencia, cheque, etc.):`);
    if (referencia === null) return;
    // El anticipo cuenta como pago parcial → se acumula en monto_pagado.
    // Cuando luego se aplique la factura completa, el saldo a pagar se calcula
    // como total - monto_pagado (que ya incluye el anticipo). Esto evita
    // doble-pago si Contabilidad olvida que ya se pagó el anticipo.
    const montoAnticipo = Number(oc.anticipo_monto || 0);
    const montoPagadoActual = Number(oc.monto_pagado || 0);
    const nuevoMontoPagado = montoPagadoActual + montoAnticipo;
    const total = Number(oc.total || 0);
    const pagadaCompleta = total > 0 && nuevoMontoPagado >= total;

    await supabase.from("ordenes_compra").update({
      anticipo_pagado: true,
      anticipo_pagado_at: new Date().toISOString(),
      anticipo_pagado_por: currentUser?.email || null,
      anticipo_referencia_pago: referencia || null,
      estado: "confirmada",
      monto_pagado: nuevoMontoPagado,
      pagada_completa: pagadaCompleta,
      pagada_at: pagadaCompleta ? new Date().toISOString() : oc.pagada_at || null,
      updated_at: new Date().toISOString(),
    }).eq("id", oc.id);
    reload?.();
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <KpiCXP label="Anticipos pendientes" count={pendientes.length} total={totalPend} color={B.warning} active />
        <KpiCXP label="Anticipos pagados" count={pagados.length} total={totalPag} color={B.success} />
      </div>

      {pendientes.length === 0
        ? <div style={{ textAlign: "center", padding: 50, color: "rgba(255,255,255,0.4)" }}>
            <div style={{ fontSize: 36 }}>🏦</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>Sin anticipos pendientes</div>
            <div style={{ fontSize: 11, marginTop: 4, color: "rgba(255,255,255,0.3)" }}>Las OCs con cotización aprobada y anticipo requerido aparecen aquí.</div>
          </div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pendientes.map(oc => (
              <div key={oc.id} style={{
                background: B.navy, borderRadius: 8, padding: "12px 14px",
                border: `1px solid ${B.warning}`, borderLeft: `4px solid ${B.warning}`,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>
                    🏦 {oc.codigo} · {oc.proveedor_nombre || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
                    Total OC: {COP(oc.total || 0)} · Anticipo {oc.anticipo_porcentaje}%
                    {oc.anticipo_solicitado_at && ` · solicitado ${fmtFecha(oc.anticipo_solicitado_at?.slice(0, 10))}`}
                  </div>
                  {oc.cotizacion_resp_url && (
                    <a href={oc.cotizacion_resp_url} target="_blank" rel="noreferrer"
                      style={{ display: "inline-block", marginTop: 4, fontSize: 11, color: B.sky, textDecoration: "none" }}>
                      📎 Ver cotización
                    </a>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>
                    {COP(oc.anticipo_monto || 0)}
                  </div>
                  <button onClick={() => marcarPagado(oc)}
                    style={{ marginTop: 6, padding: "6px 14px", borderRadius: 6, border: "none", background: B.success, color: B.navy, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    💸 Marcar como pagado
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

function SubtabFacturas({ ordenes, reload, currentUser }) {
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

// ════════════════════════════════════════════════════════════════════════════
// EditarOCModal — Editar items, cantidades, proveedor de una OC
// Bloqueado si la OC ya tiene factura aplicada (lógica contable congelada)
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// UnirOCModal — Consolidar 2 OCs en 1 (mismo proveedor)
// Caso: el proveedor factura 2 OCs juntas. Compras une ambas para que el
// flujo de factura/recepción/pago sea sobre una sola OC consolidada.
// La OC "fuente" se cancela con referencia a la OC "destino".
// ════════════════════════════════════════════════════════════════════════════
function UnirOCModal({ oc, ordenes, onClose, reload, currentUser }) {
  const { isMobile } = useBreakpoint();
  const [seleccionada, setSeleccionada] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Solo se puede unir con OCs del MISMO proveedor que NO estén recibidas,
  // pagadas, canceladas o con factura ya aplicada.
  const candidatas = useMemo(() => {
    const sameProv = (a, b) =>
      (a.proveedor_id && b.proveedor_id && a.proveedor_id === b.proveedor_id) ||
      ((a.proveedor_nombre || "").trim().toLowerCase() === (b.proveedor_nombre || "").trim().toLowerCase());
    return ordenes.filter(o =>
      o.id !== oc.id &&
      sameProv(o, oc) &&
      !o.factura_aplicada &&
      !["recibida", "pagada", "cancelada"].includes(o.estado)
    );
  }, [ordenes, oc]);

  const consolidar = (a, b) => {
    const map = new Map();
    const all = [...(a || []), ...(b || [])];
    for (const it of all) {
      const nombre = (it.item || it.nombre || "").trim().toLowerCase();
      const unidad = (it.unidad || "").toLowerCase();
      const precio = Number(it.precio_unit || it.precioU || it.precio || 0);
      // Si dos items tienen mismo nombre+unidad+precio → suman cantidades
      const key = `${nombre}|${unidad}|${precio}`;
      if (map.has(key)) {
        const ex = map.get(key);
        ex.cant = (Number(ex.cant) || 0) + (Number(it.cant) || 0);
        ex.subtotal = ex.cant * precio;
        ex.req_ids = [...new Set([...(ex.req_ids || []), ...(it.req_ids || (it.req_id ? [it.req_id] : []))])];
      } else {
        map.set(key, {
          ...it,
          item: it.item || it.nombre,
          nombre: it.item || it.nombre,
          cant: Number(it.cant) || 0,
          unidad: it.unidad,
          precio_unit: precio,
          precioU: precio,
          subtotal: (Number(it.cant) || 0) * precio,
          req_ids: it.req_ids || (it.req_id ? [it.req_id] : []),
        });
      }
    }
    return Array.from(map.values());
  };

  const unir = async () => {
    if (!seleccionada) return;
    setSaving(true); setErr("");
    try {
      // Items consolidados — la OC actual (oc) es la "destino" (queda)
      // y `seleccionada` es la "fuente" (se cancela con link a destino)
      const merged = consolidar(oc.items, seleccionada.items);
      const subtotal = merged.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
      const newReqIds = [...new Set([
        ...(Array.isArray(oc.requisicion_ids) ? oc.requisicion_ids : (oc.requisicion_id ? [oc.requisicion_id] : [])),
        ...(Array.isArray(seleccionada.requisicion_ids) ? seleccionada.requisicion_ids : (seleccionada.requisicion_id ? [seleccionada.requisicion_id] : [])),
      ])];

      const cambioEntry = {
        evento: "merge_oc",
        at: new Date().toISOString(),
        por: currentUser?.email || currentUser?.nombre || "—",
        merged_from_oc_id: seleccionada.id,
        merged_from_codigo: seleccionada.codigo,
        items_antes: oc.items || [],
        items_despues: merged,
        delta_total: subtotal - Number(oc.total || 0),
      };
      const cambiosNuevos = [
        ...(Array.isArray(oc.cambios_historial) ? oc.cambios_historial : []),
        cambioEntry,
      ];

      // 1. Update destino (oc) con items consolidados
      const { error: e1 } = await supabase.from("ordenes_compra").update({
        items: merged,
        subtotal,
        total: subtotal,
        requisicion_ids: newReqIds,
        cambios_historial: cambiosNuevos,
        notas: `${oc.notas || ""}\n[${new Date().toLocaleString("es-CO")}] Unida con ${seleccionada.codigo} por ${currentUser?.nombre || "—"}`,
        updated_at: new Date().toISOString(),
      }).eq("id", oc.id);
      if (e1) throw e1;

      // 2. Update fuente (seleccionada) → cancelada con referencia
      const { error: e2 } = await supabase.from("ordenes_compra").update({
        estado: "cancelada",
        notas: `${seleccionada.notas || ""}\n[${new Date().toLocaleString("es-CO")}] Unida con ${oc.codigo} (consolidada). Cancelada por ${currentUser?.nombre || "—"}`,
        cambios_historial: [
          ...(Array.isArray(seleccionada.cambios_historial) ? seleccionada.cambios_historial : []),
          {
            evento: "merged_into",
            at: new Date().toISOString(),
            por: currentUser?.email || currentUser?.nombre || "—",
            merged_into_oc_id: oc.id,
            merged_into_codigo: oc.codigo,
          },
        ],
        updated_at: new Date().toISOString(),
      }).eq("id", seleccionada.id);
      if (e2) throw e2;

      // 3. Reqs de origen de la fuente: actualizar oc_id/oc_codigo de sus items
      //    para que apunten a la OC destino (no a la cancelada)
      const reqIdsFuente = Array.isArray(seleccionada.requisicion_ids) ? seleccionada.requisicion_ids
                        : (seleccionada.requisicion_id ? [seleccionada.requisicion_id] : []);
      for (const reqId of reqIdsFuente) {
        const { data: req } = await supabase.from("requisiciones").select("items, timeline").eq("id", reqId).maybeSingle();
        if (!req) continue;
        const newItems = (req.items || []).map(it => {
          if (it.oc_id === seleccionada.id) {
            return { ...it, oc_id: oc.id, oc_codigo: oc.codigo };
          }
          return it;
        });
        await supabase.from("requisiciones").update({
          items: newItems,
          timeline: [...(req.timeline || []), {
            quien: currentUser?.nombre || "—",
            accion: "OC reasignada por unión",
            fecha: new Date().toLocaleString("es-CO"),
            comentario: `${seleccionada.codigo} unida con ${oc.codigo}`,
          }],
          updated_at: new Date().toISOString(),
        }).eq("id", reqId);
      }

      reload?.();
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navy, borderRadius: 14, width: isMobile ? "100%" : 640, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", border: `1px solid ${B.navyLight}`, color: B.white }}>

        <div style={{ padding: 18, borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: B.sand }}>🔗 Unir OC {oc.codigo}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              {oc.proveedor_nombre} · Selecciona otra OC del mismo proveedor para consolidarla
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ marginBottom: 14, padding: "10px 14px", background: `${B.sky}11`, border: `1px solid ${B.sky}55`, borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: B.sky, lineHeight: 1.5 }}>
              ℹ️ Esta OC ({oc.codigo}) queda como la <strong>OC consolidada</strong>. La que selecciones se <strong>cancela</strong> con referencia y sus items + requisiciones origen pasan a esta OC.
              Items con mismo nombre + unidad + precio se suman.
            </div>
          </div>

          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8 }}>
            Candidatas ({candidatas.length})
          </div>

          {candidatas.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 10, fontSize: 13 }}>
              No hay otras OCs activas del proveedor <strong>{oc.proveedor_nombre}</strong> para unir.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {candidatas.map(c => {
                const sel = seleccionada?.id === c.id;
                const badge = OC_BADGE[c.estado] || { bg: B.navyLight, color: "rgba(255,255,255,0.5)", label: c.estado };
                return (
                  <button key={c.id} onClick={() => setSeleccionada(c)}
                    style={{
                      padding: "12px 14px", borderRadius: 8,
                      background: sel ? `${B.sand}22` : B.navyMid,
                      border: `1px solid ${sel ? B.sand : B.navyLight}`,
                      color: B.white, cursor: "pointer", textAlign: "left",
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                    }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, display: "flex", gap: 8, alignItems: "center" }}>
                        🧾 {c.codigo}
                        <span style={{ background: badge.bg, color: badge.color, padding: "1px 7px", borderRadius: 10, fontSize: 9, fontWeight: 700 }}>{badge.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                        {(c.items || []).length} líneas · {fmtFecha(c.fecha_emision)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(c.total || 0)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {seleccionada && (
            <div style={{ marginTop: 14, padding: "12px 14px", background: B.navyMid, borderRadius: 8, border: `1px solid ${B.sand}33` }}>
              <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Resumen tras unión</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
                <div>• OC consolidada: <strong style={{ color: B.white }}>{oc.codigo}</strong></div>
                <div>• OC cancelada: <strong style={{ color: B.danger }}>{seleccionada.codigo}</strong></div>
                <div>• Items totales: <strong>{(oc.items || []).length} + {(seleccionada.items || []).length}</strong> (consolidados por nombre+unidad+precio)</div>
                <div>• Total combinado: <strong style={{ color: B.sand, fontFamily: "monospace" }}>{COP(Number(oc.total || 0) + Number(seleccionada.total || 0))}</strong></div>
              </div>
            </div>
          )}

          {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: "#ef4444", borderRadius: 8, fontSize: 12 }}>⚠ {err}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={onClose} disabled={saving}
              style={{ flex: 1, padding: 11, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 13 }}>
              Cancelar
            </button>
            <button onClick={unir} disabled={saving || !seleccionada}
              style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: seleccionada ? B.sand : B.navyLight, color: seleccionada ? B.navy : "rgba(255,255,255,0.3)", cursor: seleccionada ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 800 }}>
              {saving ? "Uniendo…" : seleccionada ? `🔗 Unir ${seleccionada.codigo} → ${oc.codigo}` : "Selecciona una OC"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditarOCModal({ oc, onClose, reload, currentUser }) {
  const { isMobile } = useBreakpoint();
  const [items, setItems] = useState(() => (oc.items || []).map(it => ({ ...it })));
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState(oc.proveedor_id || "");
  const [proveedorNombre, setProveedorNombre] = useState(oc.proveedor_nombre || "");
  const [notas, setNotas] = useState(oc.notas || "");
  const [fechaEmision, setFechaEmision] = useState(oc.fecha_emision || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    supabase.from("proveedores").select("id, nombre, nit, email, telefono").order("nombre")
      .then(({ data }) => setProveedores(data || []));
  }, []);

  const setItem = (idx, k, v) => setItems(arr => arr.map((it, i) => {
    if (i !== idx) return it;
    const next = { ...it, [k]: v };
    // Recalcular subtotal cuando cambia cant o precio
    if (k === "cant" || k === "precio_unit" || k === "precio") {
      const cant = Number(k === "cant" ? v : (next.cant || 0));
      const pu = Number(k === "precio_unit" ? v : (next.precio_unit || next.precio || 0));
      next.subtotal = cant * pu;
    }
    return next;
  }));

  const removeItem = (idx) => setItems(arr => arr.filter((_, i) => i !== idx));

  const addItem = () => setItems(arr => [...arr, {
    item: "", nombre: "", cant: 1, unidad: "und", precio_unit: 0, subtotal: 0,
  }]);

  const subtotal = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);

  // Devolver un item a la mesa de compra (requisición original) para
  // que Compras lo asigne a otro proveedor. El item se quita de esta OC
  // y vuelve a las reqs origen con oc_id=null para que se pueda generar
  // otra OC con un proveedor distinto.
  const devolverAMesa = async (idx) => {
    const item = items[idx];
    if (!item) return;
    const reqIds = Array.isArray(item.req_ids) ? item.req_ids : (item.req_id ? [item.req_id] : []);
    const motivo = prompt(
      `¿Devolver "${item.item || item.nombre}" a la mesa de compra?\n\n` +
      `Motivo (queda en historial):`,
      "Proveedor no tiene este item"
    );
    if (motivo === null) return;

    // 1) Quitarlo de items local — queda persistido al darle Guardar
    const newItems = items.filter((_, i) => i !== idx);
    setItems(newItems);

    // 2) Marcar en cambios_historial al guardar (lo hacemos dentro de guardar)
    // Para no perder el motivo, lo guardamos en una nota local
    setNotas(n => `${n || ""}\n[${new Date().toLocaleString("es-CO")}] Devuelto a mesa: "${item.item || item.nombre}" — ${motivo}`);

    // 3) Para cada req_id, limpiar oc_id de ese item y poner req en "Aprobada"
    //    si ya no le quedan items con oc_id (o sea, todos volvieron a la mesa)
    for (const reqId of reqIds) {
      const { data: req } = await supabase.from("requisiciones").select("items, estado, timeline").eq("id", reqId).maybeSingle();
      if (!req) continue;
      const itemsReq = (req.items || []).map(it => {
        // Match por id si lo tiene, sino por nombre+unidad
        const sameById = it.id && item.id && it.id === item.id;
        const sameByName = !sameById && (it.item || it.nombre || "").toLowerCase() === (item.item || item.nombre || "").toLowerCase()
          && (it.unidad || "").toLowerCase() === (item.unidad || "").toLowerCase();
        if (sameById || sameByName) {
          const { oc_id, oc_codigo, ...rest } = it;
          return rest;
        }
        return it;
      });
      const tieneItemsConOC = itemsReq.some(it => it.oc_id);
      const nuevoEstadoReq = tieneItemsConOC ? req.estado : "Aprobada";
      await supabase.from("requisiciones").update({
        items: itemsReq,
        estado: nuevoEstadoReq,
        timeline: [...(req.timeline || []), {
          quien: currentUser?.nombre || "—",
          accion: "Item devuelto a mesa",
          fecha: new Date().toLocaleString("es-CO"),
          comentario: `OC ${oc.codigo} · "${item.item || item.nombre}" · ${motivo}`,
        }],
        updated_at: new Date().toISOString(),
      }).eq("id", reqId);
    }
  };

  const guardar = async () => {
    setSaving(true); setErr("");
    try {
      // Bloquear si ya hay factura aplicada o si está en estados finales
      if (oc.factura_aplicada) {
        throw new Error("La OC tiene factura aplicada — no se puede editar.");
      }
      if (["recibida", "pagada", "cancelada"].includes(oc.estado)) {
        throw new Error(`La OC está en estado ${oc.estado} — no se puede editar.`);
      }
      if (!proveedorNombre.trim()) throw new Error("Debe seleccionar un proveedor");
      // Si no quedan items, cancelar la OC en vez de bloquear
      const cancelarOC = items.length === 0;

      const prov = proveedores.find(p => p.id === proveedorId);
      // Snapshot de cambios para auditoría
      const cambioEntry = {
        evento: "edit_post_envio",
        at: new Date().toISOString(),
        por: currentUser?.email || currentUser?.nombre || "—",
        items_antes: oc.items || [],
        items_despues: items,
        delta_total: subtotal - Number(oc.total || 0),
      };
      const cambiosNuevos = [...(Array.isArray(oc.cambios_historial) ? oc.cambios_historial : []), cambioEntry];

      const updates = {
        items,
        subtotal,
        total: subtotal,
        proveedor_id: proveedorId || null,
        proveedor_nombre: proveedorNombre,
        proveedor_nit: prov?.nit || null,
        proveedor_email: prov?.email || null,
        proveedor_telefono: prov?.telefono || null,
        fecha_emision: fechaEmision || oc.fecha_emision,
        notas: (notas || "") + `\n[${new Date().toLocaleString("es-CO")}] Editada por ${currentUser?.nombre || "—"}`,
        cambios_historial: cambiosNuevos,
        updated_at: new Date().toISOString(),
      };
      if (cancelarOC) {
        updates.estado = "cancelada";
        updates.notas += `\n[${new Date().toLocaleString("es-CO")}] OC cancelada — todos los items devueltos a la mesa de compra.`;
      }
      const { error } = await supabase.from("ordenes_compra").update(updates).eq("id", oc.id);
      if (error) throw error;
      reload?.();
      onClose();
    } catch (e) {
      setErr(e.message || String(e));
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navy, borderRadius: 14, width: isMobile ? "100%" : 720, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", border: `1px solid ${B.navyLight}`, color: B.white }}>

        <div style={{ padding: 18, borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: B.sand }}>✏️ Editar OC {oc.codigo}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              Estado: {oc.estado} · {(oc.items || []).length} líneas originales
              {oc.enviada_at && ` · ya enviada al proveedor`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 18 }}>
          {oc.enviada_at && (
            <div style={{ marginBottom: 14, padding: "10px 14px", background: `${B.warning}11`, border: `1px solid ${B.warning}55`, borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: B.warning, marginBottom: 4 }}>
                ⚠️ Esta OC ya fue enviada al proveedor
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
                Cualquier cambio queda registrado en el historial de la OC. Si el proveedor no tiene un item, usá <strong style={{ color: B.warning }}>↩️ Mesa</strong> para devolverlo a la requisición original — ahí Compras lo puede asignar a otro proveedor. Después del ajuste, recordá <strong>volver a enviar la OC actualizada al proveedor</strong>.
              </div>
            </div>
          )}
          {/* Proveedor */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>Proveedor</label>
            <select value={proveedorId}
              onChange={e => {
                setProveedorId(e.target.value);
                const p = proveedores.find(x => x.id === e.target.value);
                if (p) setProveedorNombre(p.nombre);
              }}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13 }}>
              <option value="">— Selecciona proveedor —</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          {/* Fecha emisión */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>Fecha emisión</label>
            <input type="date" value={(fechaEmision || "").slice(0, 10)} onChange={e => setFechaEmision(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13 }} />
          </div>

          {/* Items */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 700 }}>Ítems</label>
              <button type="button" onClick={addItem}
                style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${B.success}`, background: "transparent", color: B.success, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                + Agregar línea
              </button>
            </div>

            <div style={{ background: B.navyMid, borderRadius: 8, padding: 10, maxHeight: 380, overflowY: "auto" }}>
              {items.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Sin ítems. Agrega uno.</div>
              ) : items.map((it, idx) => {
                const tieneReq = (Array.isArray(it.req_ids) && it.req_ids.length > 0) || it.req_id;
                return (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2.3fr 0.7fr 0.7fr 1fr 1fr auto auto", gap: 6, marginBottom: 8, padding: 8, background: B.navy, borderRadius: 6, alignItems: "center" }}>
                  <input value={it.item || it.nombre || ""}
                    onChange={e => { setItem(idx, "item", e.target.value); setItem(idx, "nombre", e.target.value); }}
                    placeholder="Nombre del ítem"
                    style={{ padding: "7px 10px", borderRadius: 6, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12 }} />
                  <input type="number" step="0.01" min="0" value={it.cant || 0}
                    onChange={e => setItem(idx, "cant", e.target.value)}
                    placeholder="Cant"
                    style={{ padding: "7px 10px", borderRadius: 6, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, textAlign: "right" }} />
                  <input value={it.unidad || ""} onChange={e => setItem(idx, "unidad", e.target.value)}
                    placeholder="und"
                    style={{ padding: "7px 10px", borderRadius: 6, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12 }} />
                  <input type="number" min="0" value={it.precio_unit || it.precio || 0}
                    onChange={e => setItem(idx, "precio_unit", e.target.value)}
                    placeholder="Precio"
                    style={{ padding: "7px 10px", borderRadius: 6, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, textAlign: "right" }} />
                  <div style={{ padding: "7px 8px", textAlign: "right", color: B.sand, fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>
                    {COP(Number(it.subtotal) || 0)}
                  </div>
                  {tieneReq && (
                    <button type="button" onClick={() => devolverAMesa(idx)}
                      title="Devolver este item a la requisición original (mesa de compra) para asignar a otro proveedor"
                      style={{ padding: "5px 8px", border: `1px solid ${B.warning}`, background: "transparent", color: B.warning, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                      ↩️ Mesa
                    </button>
                  )}
                  <button type="button" onClick={() => removeItem(idx)}
                    title="Eliminar línea (sin devolver a mesa)"
                    style={{ padding: "5px 8px", border: `1px solid ${B.danger}`, background: "transparent", color: B.danger, borderRadius: 6, cursor: "pointer", fontSize: 14 }}>
                    🗑
                  </button>
                </div>
                );
              })}
            </div>

            <div style={{ marginTop: 10, padding: "8px 12px", background: B.navyMid, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: B.sand, fontFamily: "monospace" }}>{COP(subtotal)}</span>
            </div>
          </div>

          {/* Notas */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
              placeholder="Notas internas..."
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          {err && <div style={{ marginBottom: 10, padding: 10, background: "rgba(239,68,68,0.15)", color: "#ef4444", borderRadius: 8, fontSize: 12 }}>⚠ {err}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} disabled={saving}
              style={{ flex: 1, padding: 11, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 13 }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving}
              style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: saving ? B.navyLight : B.success, color: "#fff", cursor: saving ? "default" : "pointer", fontSize: 13, fontWeight: 700 }}>
              {saving ? "Guardando..." : "✓ Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
