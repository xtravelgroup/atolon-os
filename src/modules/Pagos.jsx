// Módulo Pagos — vista unificada de SALIDAS de dinero (lo que Atolón paga)
// Consolida: facturas a proveedores (CXP) + anticipos OC + nómina + recurrentes
// + gastos sueltos. Conciliación bancaria con Bancolombia.
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";
import OCViewerModal from "../components/OCViewerModal.jsx";
import MarcarPagadoModal from "../components/MarcarPagadoModal.jsx";

const TABS = [
  { key: "dashboard",    label: "Dashboard",       icon: "📊" },
  { key: "porpagar",     label: "Por Pagar",       icon: "📤" },
  { key: "recurrentes",  label: "Recurrentes",     icon: "🔁" },
  { key: "gastos",       label: "Gastos / Otros",  icon: "💸" },
  { key: "calendario",   label: "Calendario",      icon: "📅" },
  { key: "conciliacion", label: "Conciliación",    icon: "🏦" },
  { key: "reportes",     label: "Reportes",        icon: "📑" },
];

const CATEGORIAS_REC = ["arriendo", "servicios", "plataforma", "sueldo_fijo", "seguros", "otro"];
const METODOS_PAGO = ["transferencia", "efectivo", "cheque", "tarjeta", "psE", "otro"];
const FRECUENCIAS  = ["mensual", "bimensual", "trimestral", "semestral", "anual"];

export default function Pagos() {
  const { isMobile } = useBreakpoint();
  const [tab, setTab] = useState("dashboard");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ordenes, setOrdenes] = useState([]);
  const [recurrentes, setRecurrentes] = useState([]);
  const [otros, setOtros] = useState([]);
  const [nominas, setNominas] = useState([]);
  const [extractos, setExtractos] = useState([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data?.user;
      if (!u) return;
      const { data: row } = await supabase.from("usuarios").select("id, nombre, rol_id").eq("email", u.email).maybeSingle();
      setCurrentUser({ id: row?.id || u.id, email: u.email, nombre: row?.nombre || u.email, rol: row?.rol_id || null });
    });
  }, []);

  const reload = async () => {
    setLoading(true);
    const [oc, rec, ot, nom, ext] = await Promise.all([
      supabase.from("ordenes_compra").select("*").order("created_at", { ascending: false }),
      supabase.from("pagos_recurrentes").select("*").order("dia_pago"),
      supabase.from("pagos_otros").select("*").order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
      supabase.from("nomina").select("*").order("fecha_pago", { ascending: false }).limit(50).then(r => r).catch(() => ({ data: [] })),
      supabase.from("banco_extractos").select("*").order("fecha_fin", { ascending: false }).limit(20),
    ]);
    setOrdenes(oc.data || []);
    setRecurrentes(rec.data || []);
    setOtros(ot.data || []);
    setNominas(nom.data || []);
    setExtractos(ext.data || []);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  return (
    <div style={{ padding: isMobile ? 16 : 24, color: B.white, minHeight: "100vh" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, margin: 0, color: B.sand }}>
          💰 Pagos
        </h1>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
          Salidas de dinero · Anticipos · Facturas · Nómina · Recurrentes · Gastos
        </div>
      </div>

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
        : tab === "dashboard"    ? <TabDashboard ordenes={ordenes} otros={otros} recurrentes={recurrentes} nominas={nominas} setTab={setTab} />
        : tab === "porpagar"     ? <TabPorPagar ordenes={ordenes} otros={otros} reload={reload} currentUser={currentUser} />
        : tab === "recurrentes"  ? <TabRecurrentes recurrentes={recurrentes} reload={reload} currentUser={currentUser} />
        : tab === "gastos"       ? <TabGastos otros={otros} reload={reload} currentUser={currentUser} />
        : tab === "calendario"   ? <TabCalendario ordenes={ordenes} otros={otros} />
        : tab === "conciliacion" ? <TabConciliacion extractos={extractos} reload={reload} currentUser={currentUser} />
        : tab === "reportes"     ? <TabReportes ordenes={ordenes} otros={otros} />
        : null}
    </div>
  );
}

function Loading() {
  return <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;
}

// ════════════════════════════════════════════════════════════════════════
// TAB DASHBOARD
// ════════════════════════════════════════════════════════════════════════
function TabDashboard({ ordenes, otros, recurrentes, nominas, setTab }) {
  const today = todayStr();
  const month = today.slice(0, 7);
  const en7Dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // Anticipos pendientes (de Compras)
  const anticipos = ordenes.filter(o => o.anticipo_requerido && !o.anticipo_pagado);
  // Facturas con factura aplicada y no pagada completa
  const facturas = ordenes.filter(o => o.factura_aplicada && !o.pagada_completa)
    .map(o => ({ ...o, _saldo: Number(o.total || 0) - Number(o.monto_pagado || 0) }));
  // Otros gastos pendientes
  const gastosPend = otros.filter(o => !o.pagado);

  const totalAnticipos = anticipos.reduce((s, o) => s + Number(o.anticipo_monto || 0), 0);
  const totalFacturas  = facturas.reduce((s, o) => s + (Number(o.total || 0) - Number(o.monto_pagado || 0)), 0);
  const totalGastos    = gastosPend.reduce((s, o) => s + Number(o.monto || 0), 0);
  const totalRecurrentes = recurrentes.filter(r => r.activo).reduce((s, r) => s + Number(r.monto || 0), 0);
  const totalPendiente = totalAnticipos + totalFacturas + totalGastos;

  // Vencen en 7 días
  const vencen7 = [
    ...facturas.filter(o => o.fecha_vencimiento_pago && o.fecha_vencimiento_pago <= en7Dias && o.fecha_vencimiento_pago >= today)
      .map(o => ({ tipo: "Factura", proveedor: o.proveedor_nombre, fecha: o.fecha_vencimiento_pago, monto: o._saldo, ref: o.codigo, tab: "porpagar" })),
    ...gastosPend.filter(o => o.fecha_vencimiento && o.fecha_vencimiento <= en7Dias && o.fecha_vencimiento >= today)
      .map(o => ({ tipo: "Gasto", proveedor: o.proveedor || o.concepto, fecha: o.fecha_vencimiento, monto: Number(o.monto), ref: o.concepto, tab: "gastos" })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Vencidos
  const vencidos = [
    ...facturas.filter(o => o.fecha_vencimiento_pago && o.fecha_vencimiento_pago < today),
    ...gastosPend.filter(o => o.fecha_vencimiento && o.fecha_vencimiento < today),
  ];
  const totalVencido = vencidos.reduce((s, o) => s + Number(o._saldo || o.monto || 0), 0);

  const KPIs = [
    { label: "Total por pagar",    value: COP(totalPendiente),  sub: `${anticipos.length + facturas.length + gastosPend.length} pendientes`, color: B.sand,    tab: "porpagar" },
    { label: "Vencidos",            value: COP(totalVencido),    sub: `${vencidos.length} factura${vencidos.length !== 1 ? "s" : ""}`,         color: B.danger,  tab: "porpagar" },
    { label: "Vencen en 7 días",    value: COP(vencen7.reduce((s, x) => s + Number(x.monto || 0), 0)), sub: `${vencen7.length} pagos`,         color: B.warning, tab: "calendario" },
    { label: "Anticipos pendientes",value: COP(totalAnticipos),  sub: `${anticipos.length} OCs`,                                                color: B.sky,     tab: "porpagar" },
    { label: "Recurrentes activos", value: COP(totalRecurrentes),sub: `${recurrentes.filter(r => r.activo).length} pagos/mes`,                  color: "#a78bfa", tab: "recurrentes" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        {KPIs.map(k => (
          <div key={k.label} onClick={() => k.tab && setTab(k.tab)}
            style={{
              background: B.navyMid, border: `1px solid ${B.navyLight}`,
              borderLeft: `4px solid ${k.color}`, borderRadius: 12, padding: 16,
              cursor: k.tab ? "pointer" : "default",
            }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginTop: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Próximos 7 días */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, marginBottom: 10 }}>📅 Vencen en los próximos 7 días</div>
        {vencen7.length === 0
          ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, padding: 12, textAlign: "center" }}>Nada vence próximo</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {vencen7.map((x, i) => (
                <div key={i} style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${B.warning}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{x.proveedor}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{x.tipo} · {x.ref}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(x.monto)}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{fmtFecha(x.fecha)}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB POR PAGAR — consolida anticipos + facturas + gastos
// ════════════════════════════════════════════════════════════════════════
function TabPorPagar({ ordenes, otros, reload, currentUser }) {
  const [filtro, setFiltro] = useState("todos"); // todos | anticipos | facturas | gastos | vencidos | proximos
  const [pagoActivo, setPagoActivo] = useState(null);  // pago siendo marcado como pagado
  const [ocVer, setOcVer] = useState(null);            // OC abierta en visor read-only
  const today = todayStr();
  const en7   = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const items = useMemo(() => {
    const list = [];
    // Anticipos
    ordenes.filter(o => o.anticipo_requerido && !o.anticipo_pagado).forEach(o => list.push({
      tipo: "anticipo", icon: "🏦", color: B.warning,
      ref: o.codigo, proveedor: o.proveedor_nombre || "—",
      monto: Number(o.anticipo_monto || 0),
      vence: o.anticipo_solicitado_at?.slice(0, 10),
      oc: o, accion: "marcar_anticipo",
    }));
    // Facturas
    ordenes.filter(o => o.factura_aplicada && !o.pagada_completa).forEach(o => {
      const saldo = Number(o.total || 0) - Number(o.monto_pagado || 0);
      list.push({
        tipo: "factura", icon: "📄", color: B.sand,
        ref: o.factura_data?.factura_numero || o.codigo,
        proveedor: o.proveedor_nombre || "—",
        monto: saldo,
        vence: o.fecha_vencimiento_pago,
        oc: o, accion: "marcar_factura",
      });
    });
    // Gastos
    otros.filter(o => !o.pagado).forEach(o => list.push({
      tipo: "gasto", icon: "💸", color: "#a78bfa",
      ref: o.concepto, proveedor: o.proveedor || "—",
      monto: Number(o.monto || 0),
      vence: o.fecha_vencimiento,
      gasto: o, accion: "marcar_gasto",
    }));

    return list;
  }, [ordenes, otros]);

  const filtrados = items.filter(x => {
    if (filtro === "todos") return true;
    if (filtro === "anticipos") return x.tipo === "anticipo";
    if (filtro === "facturas")  return x.tipo === "factura";
    if (filtro === "gastos")    return x.tipo === "gasto";
    if (filtro === "vencidos")  return x.vence && x.vence < today;
    if (filtro === "proximos")  return x.vence && x.vence >= today && x.vence <= en7;
    return true;
  }).sort((a, b) => {
    if (a.vence && b.vence) return a.vence.localeCompare(b.vence);
    if (a.vence) return -1;
    if (b.vence) return 1;
    return 0;
  });

  const total = filtrados.reduce((s, x) => s + Number(x.monto || 0), 0);

  // Abre el modal de marcar pagado (que incluye upload de comprobante)
  const marcarPagado = (x) => setPagoActivo(x);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {[
          ["todos",      `Todos (${items.length})`],
          ["vencidos",   `⚠ Vencidos`],
          ["proximos",   `🟡 Próximos 7d`],
          ["anticipos",  `🏦 Anticipos`],
          ["facturas",   `📄 Facturas`],
          ["gastos",     `💸 Gastos`],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)}
            style={{
              padding: "6px 12px", borderRadius: 8, border: `1px solid ${filtro === k ? B.sand : B.navyLight}`,
              background: filtro === k ? B.sand + "22" : "transparent",
              color: filtro === k ? B.sand : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          Total: <strong style={{ color: B.sand }}>{COP(total)}</strong>
        </div>
      </div>

      {filtrados.length === 0
        ? <div style={{ textAlign: "center", padding: 50, color: "rgba(255,255,255,0.3)" }}>Sin pagos pendientes con ese filtro.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtrados.map((x, i) => {
              const dias = x.vence ? Math.floor((new Date(x.vence) - new Date(today)) / 86400000) : null;
              const venceColor = dias === null ? "rgba(255,255,255,0.4)" : dias < 0 ? B.danger : dias <= 7 ? B.warning : B.sky;
              const tieneOC = !!x.oc;
              return (
                <div key={i}
                  onClick={() => tieneOC && setOcVer(x.oc)}
                  title={tieneOC ? "Click para ver OC" : ""}
                  style={{
                    background: B.navy, borderRadius: 10, padding: "12px 14px",
                    border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${x.color}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
                    cursor: tieneOC ? "pointer" : "default",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={tieneOC ? e => e.currentTarget.style.background = B.navyMid : undefined}
                  onMouseLeave={tieneOC ? e => e.currentTarget.style.background = B.navy : undefined}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>
                      <span style={{ marginRight: 6 }}>{x.icon}</span>
                      {x.proveedor}
                      <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", background: x.color + "22", color: x.color, borderRadius: 12, fontWeight: 700 }}>
                        {x.tipo.toUpperCase()}
                      </span>
                      {tieneOC && (
                        <span style={{ marginLeft: 8, fontSize: 10, color: B.sky, opacity: 0.6 }}>
                          👁 ver OC
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      {x.ref}
                      {x.vence && (
                        <span style={{ marginLeft: 8, color: venceColor }}>
                          · {dias < 0 ? `⚠ Vencido hace ${Math.abs(dias)}d` : dias === 0 ? "🔔 Vence hoy" : `Vence en ${dias}d`} ({fmtFecha(x.vence)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(x.monto)}</div>
                    <button onClick={(e) => { e.stopPropagation(); marcarPagado(x); }}
                      style={{ marginTop: 6, padding: "5px 12px", borderRadius: 6, border: "none", background: B.success, color: B.navy, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                      💸 Marcar pagado
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      }

      {/* Modales */}
      {ocVer && (
        <OCViewerModal oc={ocVer} onClose={() => setOcVer(null)} />
      )}
      {pagoActivo && (
        <MarcarPagadoModal
          pago={pagoActivo}
          currentUser={currentUser}
          onClose={() => setPagoActivo(null)}
          onSaved={() => { setPagoActivo(null); reload(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB RECURRENTES — CRUD de pagos fijos
// ════════════════════════════════════════════════════════════════════════
function TabRecurrentes({ recurrentes, reload, currentUser }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const total = recurrentes.filter(r => r.activo).reduce((s, r) => s + Number(r.monto || 0), 0);

  const generar = async () => {
    if (!confirm("¿Generar pagos pendientes para este mes desde los recurrentes activos?")) return;
    const { data, error } = await supabase.rpc("generar_pagos_recurrentes_mes");
    if (error) return alert(`Error: ${error.message}`);
    alert(`✓ ${data || 0} pagos generados. Revisa la pestaña "Por Pagar".`);
    reload();
  };

  const eliminar = async (id) => {
    if (!confirm("¿Eliminar este pago recurrente? Los pagos ya generados no se borran.")) return;
    await supabase.from("pagos_recurrentes").delete().eq("id", id);
    reload();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            {recurrentes.filter(r => r.activo).length} recurrentes activos · Total mensual <strong style={{ color: B.sand }}>{COP(total)}</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={generar} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            🔄 Generar pagos del mes
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            + Nuevo recurrente
          </button>
        </div>
      </div>

      {recurrentes.length === 0
        ? <div style={{ textAlign: "center", padding: 50, color: "rgba(255,255,255,0.3)" }}>
            <div style={{ fontSize: 36 }}>🔁</div>
            <div style={{ marginTop: 10 }}>Sin recurrentes registrados</div>
            <div style={{ fontSize: 12, marginTop: 4, color: "rgba(255,255,255,0.4)" }}>Crea uno para automatizar arriendo, servicios, plataformas, etc.</div>
          </div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recurrentes.map(r => (
              <div key={r.id} style={{
                background: B.navy, borderRadius: 10, padding: "12px 14px",
                border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${r.activo ? "#a78bfa" : B.navyLight}`,
                opacity: r.activo ? 1 : 0.5,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>
                    {r.nombre}
                    <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", background: B.navyLight, color: "rgba(255,255,255,0.7)", borderRadius: 12 }}>
                      {r.categoria}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                    {r.proveedor || "—"} · Día {r.dia_pago} · {r.frecuencia}
                    {r.siguiente_vencimiento && ` · Próximo: ${fmtFecha(r.siguiente_vencimiento)}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(r.monto)}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                    <button onClick={() => { setEditing(r); setShowForm(true); }}
                      style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, borderRadius: 5, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, cursor: "pointer" }}>✏️</button>
                    <button onClick={() => eliminar(r.id)}
                      style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, borderRadius: 5, border: `1px solid ${B.danger}`, background: B.danger + "22", color: B.danger, cursor: "pointer" }}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      }

      {showForm && <RecurrenteFormModal recurrente={editing}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSaved={() => { setShowForm(false); setEditing(null); reload(); }}
        currentUser={currentUser} />}
    </div>
  );
}

function RecurrenteFormModal({ recurrente, onClose, onSaved, currentUser }) {
  const isEdit = !!recurrente;
  const [f, setF] = useState({
    nombre: recurrente?.nombre || "",
    categoria: recurrente?.categoria || "servicios",
    proveedor: recurrente?.proveedor || "",
    monto: recurrente?.monto || 0,
    moneda: recurrente?.moneda || "COP",
    frecuencia: recurrente?.frecuencia || "mensual",
    dia_pago: recurrente?.dia_pago || 1,
    metodo_pago_default: recurrente?.metodo_pago_default || "transferencia",
    cuenta_origen: recurrente?.cuenta_origen || "",
    notas: recurrente?.notas || "",
    activo: recurrente?.activo ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!f.nombre.trim() || !f.monto) return setErr("Nombre y monto son obligatorios");
    setSaving(true); setErr("");
    try {
      if (isEdit) {
        const { error } = await supabase.from("pagos_recurrentes").update({
          ...f, monto: Number(f.monto), dia_pago: Math.min(31, Math.max(1, Number(f.dia_pago) || 1)),
          updated_at: new Date().toISOString(),
        }).eq("id", recurrente.id);
        if (error) throw error;
      } else {
        const id = `REC_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const { error } = await supabase.from("pagos_recurrentes").insert({
          id, ...f, monto: Number(f.monto),
          dia_pago: Math.min(31, Math.max(1, Number(f.dia_pago) || 1)),
          created_by: currentUser?.email,
        });
        if (error) throw error;
      }
      onSaved();
    } catch (e) { setErr(e.message || String(e)); } finally { setSaving(false); }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 1300, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 12, width: "100%", maxWidth: 540, padding: 22, marginTop: 30, border: `1px solid ${B.navyLight}`, color: B.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{isEdit ? "Editar recurrente" : "Nuevo recurrente"}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Nombre *</label>
            <input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={INP} placeholder="Ej: Arriendo Beach Club, Loggro suscripción" autoFocus />
          </div>
          <div>
            <label style={LBL}>Categoría</label>
            <select value={f.categoria} onChange={e => set("categoria", e.target.value)} style={INP}>
              {CATEGORIAS_REC.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Proveedor</label>
            <input value={f.proveedor} onChange={e => set("proveedor", e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Monto *</label>
            <input type="number" value={f.monto} onChange={e => set("monto", e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Moneda</label>
            <select value={f.moneda} onChange={e => set("moneda", e.target.value)} style={INP}>
              <option value="COP">COP</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label style={LBL}>Frecuencia</label>
            <select value={f.frecuencia} onChange={e => set("frecuencia", e.target.value)} style={INP}>
              {FRECUENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Día de pago (1-31)</label>
            <input type="number" min={1} max={31} value={f.dia_pago} onChange={e => set("dia_pago", e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Método</label>
            <select value={f.metodo_pago_default} onChange={e => set("metodo_pago_default", e.target.value)} style={INP}>
              {METODOS_PAGO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Cuenta origen</label>
            <input value={f.cuenta_origen} onChange={e => set("cuenta_origen", e.target.value)} style={INP} placeholder="Bancolombia 12345" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Notas</label>
            <textarea value={f.notas} onChange={e => set("notas", e.target.value)} rows={2} style={{ ...INP, resize: "vertical" }} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={f.activo} onChange={e => set("activo", e.target.checked)} style={{ width: 16, height: 16 }} />
              <span>Activo (genera pagos automáticamente)</span>
            </label>
          </div>
        </div>
        {err && <div style={{ marginTop: 12, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={saving}
            style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 13, cursor: "pointer", fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : isEdit ? "💾 Guardar" : "+ Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB GASTOS — agregar gastos sueltos
// ════════════════════════════════════════════════════════════════════════
function TabGastos({ otros, reload, currentUser }) {
  const [showForm, setShowForm] = useState(false);
  const [verPagados, setVerPagados] = useState(false);

  const lista = otros.filter(o => verPagados ? o.pagado : !o.pagado);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, background: B.navyMid, borderRadius: 8, padding: 3 }}>
          <button onClick={() => setVerPagados(false)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: !verPagados ? B.sand : "transparent", color: !verPagados ? B.navy : "rgba(255,255,255,0.6)" }}>
            Pendientes ({otros.filter(o => !o.pagado).length})
          </button>
          <button onClick={() => setVerPagados(true)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: verPagados ? B.sand : "transparent", color: verPagados ? B.navy : "rgba(255,255,255,0.6)" }}>
            Pagados ({otros.filter(o => o.pagado).length})
          </button>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
          + Nuevo gasto
        </button>
      </div>

      {lista.length === 0
        ? <div style={{ textAlign: "center", padding: 50, color: "rgba(255,255,255,0.3)" }}>Sin gastos {verPagados ? "pagados" : "pendientes"}.</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {lista.map(o => (
              <div key={o.id} style={{ background: B.navy, borderRadius: 10, padding: "10px 14px", border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${o.pagado ? B.success : "#a78bfa"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>💸 {o.concepto}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                    {o.proveedor || "—"} · {o.categoria || "—"}
                    {o.fecha_vencimiento && ` · vence ${fmtFecha(o.fecha_vencimiento)}`}
                    {o.pagado_at && ` · pagado ${fmtFecha(o.pagado_at?.slice(0, 10))}`}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(o.monto)}</div>
              </div>
            ))}
          </div>
        )
      }

      {showForm && <GastoFormModal
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); reload(); }}
        currentUser={currentUser} />}
    </div>
  );
}

function GastoFormModal({ onClose, onSaved, currentUser }) {
  const [f, setF] = useState({
    fecha: todayStr(), fecha_vencimiento: "",
    concepto: "", categoria: "gasto_admin",
    proveedor: "", monto: 0, metodo_pago: "transferencia",
    cuenta_origen: "", notas: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!f.concepto.trim() || !f.monto) return setErr("Concepto y monto son obligatorios");
    setSaving(true);
    try {
      const id = `PO_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await supabase.from("pagos_otros").insert({
        id, ...f, monto: Number(f.monto),
        fecha_vencimiento: f.fecha_vencimiento || null,
        created_by: currentUser?.email,
      });
      if (error) throw error;
      onSaved();
    } catch (e) { setErr(e.message || String(e)); } finally { setSaving(false); }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 1300, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 12, width: "100%", maxWidth: 480, padding: 22, marginTop: 40, border: `1px solid ${B.navyLight}`, color: B.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>+ Nuevo gasto</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Concepto *</label>
            <input value={f.concepto} onChange={e => set("concepto", e.target.value)} style={INP} placeholder="Ej: Taxi para mensajería" autoFocus />
          </div>
          <div>
            <label style={LBL}>Categoría</label>
            <select value={f.categoria} onChange={e => set("categoria", e.target.value)} style={INP}>
              <option value="gasto_admin">Gasto admin</option>
              <option value="reembolso">Reembolso</option>
              <option value="servicio_puntual">Servicio puntual</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label style={LBL}>Proveedor</label>
            <input value={f.proveedor} onChange={e => set("proveedor", e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Monto *</label>
            <input type="number" value={f.monto} onChange={e => set("monto", e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Método</label>
            <select value={f.metodo_pago} onChange={e => set("metodo_pago", e.target.value)} style={INP}>
              {METODOS_PAGO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Fecha del gasto</label>
            <input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Vencimiento (si aplica)</label>
            <input type="date" value={f.fecha_vencimiento} onChange={e => set("fecha_vencimiento", e.target.value)} style={INP} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Notas</label>
            <textarea value={f.notas} onChange={e => set("notas", e.target.value)} rows={2} style={{ ...INP, resize: "vertical" }} />
          </div>
        </div>
        {err && <div style={{ marginTop: 12, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={saving}
            style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 13, cursor: "pointer", fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "+ Crear gasto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB CALENDARIO
// ════════════════════════════════════════════════════════════════════════
function TabCalendario({ ordenes, otros }) {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const eventos = useMemo(() => {
    const list = [];
    ordenes.filter(o => o.anticipo_requerido && !o.anticipo_pagado).forEach(o => {
      if (o.anticipo_solicitado_at) list.push({ fecha: o.anticipo_solicitado_at.slice(0, 10), tipo: "🏦", monto: o.anticipo_monto, ref: o.codigo, color: B.warning });
    });
    ordenes.filter(o => o.factura_aplicada && !o.pagada_completa && o.fecha_vencimiento_pago).forEach(o => {
      const saldo = Number(o.total || 0) - Number(o.monto_pagado || 0);
      list.push({ fecha: o.fecha_vencimiento_pago, tipo: "📄", monto: saldo, ref: o.factura_data?.factura_numero || o.codigo, color: B.sand });
    });
    otros.filter(o => !o.pagado && o.fecha_vencimiento).forEach(o => {
      list.push({ fecha: o.fecha_vencimiento, tipo: "💸", monto: o.monto, ref: o.concepto, color: "#a78bfa" });
    });
    return list;
  }, [ordenes, otros]);

  const eventosPorDia = useMemo(() => {
    const map = {};
    eventos.forEach(e => {
      if (!map[e.fecha]) map[e.fecha] = [];
      map[e.fecha].push(e);
    });
    return map;
  }, [eventos]);

  // Generar matriz del mes
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startWD  = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const cells = [];
  for (let i = 0; i < startWD; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthName = firstDay.toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  const totalMes = eventos
    .filter(e => e.fecha.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`)
    .reduce((s, e) => s + Number(e.monto || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { const m = month - 1; if (m < 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m); }}
            style={btnNav}>‹</button>
          <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, textTransform: "capitalize", minWidth: 180, textAlign: "center" }}>{monthName}</div>
          <button onClick={() => { const m = month + 1; if (m > 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m); }}
            style={btnNav}>›</button>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          Total del mes: <strong style={{ color: B.sand }}>{COP(totalMes)}</strong>
        </div>
      </div>

      <div style={{ background: B.navyMid, borderRadius: 12, padding: 14, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(d => (
            <div key={d} style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700, padding: 4, textAlign: "center" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const fecha = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const evs = eventosPorDia[fecha] || [];
            const isToday = fecha === todayStr();
            const totalDia = evs.reduce((s, e) => s + Number(e.monto || 0), 0);
            return (
              <div key={i} style={{
                background: isToday ? B.sand + "22" : B.navy,
                border: `1px solid ${isToday ? B.sand : B.navyLight}`,
                borderRadius: 6, padding: 6, minHeight: 70, fontSize: 11,
                display: "flex", flexDirection: "column",
              }}>
                <div style={{ fontWeight: 700, color: isToday ? B.sand : "rgba(255,255,255,0.7)", marginBottom: 4 }}>{d}</div>
                {evs.length > 0 && (
                  <>
                    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                      {evs.slice(0, 3).map((e, j) => (
                        <span key={j} title={`${e.ref} · ${COP(e.monto)}`} style={{ fontSize: 10 }}>{e.tipo}</span>
                      ))}
                      {evs.length > 3 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>+{evs.length - 3}</span>}
                    </div>
                    <div style={{ marginTop: "auto", fontSize: 9, color: B.sand, fontWeight: 700 }}>{COP(totalDia)}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB CONCILIACIÓN BANCARIA
// ════════════════════════════════════════════════════════════════════════
function TabConciliacion({ extractos, reload, currentUser }) {
  return (
    <div>
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 20, border: `1px dashed ${B.sky}`, marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🏦</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: B.sky }}>Conciliación bancaria con Bancolombia</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8, lineHeight: 1.6, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
          Próximamente: integración directa con la API de Bancolombia (Open Banking) para sincronizar movimientos automáticamente.
          <br/><br/>
          <strong>Por ahora:</strong> sube el extracto bancario en PDF/Excel y el AI lo procesa para cruzar con los pagos registrados.
        </div>
        <button disabled
          style={{ marginTop: 14, padding: "10px 20px", borderRadius: 8, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, fontSize: 13, fontWeight: 700, cursor: "not-allowed", opacity: 0.6 }}>
          📎 Subir extracto (próximamente)
        </button>
      </div>

      <h3 style={{ fontSize: 14, color: B.sand, marginTop: 0 }}>Extractos importados</h3>
      {extractos.length === 0
        ? <div style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Sin extractos importados todavía</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {extractos.map(e => (
              <div key={e.id} style={{ background: B.navy, padding: "10px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}` }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{e.banco} · {e.cuenta}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{fmtFecha(e.fecha_inicio)} → {fmtFecha(e.fecha_fin)} · {e.total_movimientos} movimientos</div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB REPORTES
// ════════════════════════════════════════════════════════════════════════
function TabReportes({ ordenes, otros }) {
  const month = todayStr().slice(0, 7);
  const ocFacturadas = ordenes.filter(o => o.factura_aplicada);

  // Por método de pago (este mes)
  const porMetodo = {};
  // Por proveedor
  const porProveedor = {};

  // Reconstruir por proveedor (facturas)
  ocFacturadas.forEach(o => {
    const k = o.proveedor_nombre || "Sin proveedor";
    porProveedor[k] = (porProveedor[k] || 0) + Number(o.monto_pagado || 0);
  });

  // Otros gastos pagados
  otros.filter(o => o.pagado).forEach(o => {
    const k = o.proveedor || o.concepto || "Otros";
    porProveedor[k] = (porProveedor[k] || 0) + Number(o.monto || 0);
    if (o.metodo_pago) porMetodo[o.metodo_pago] = (porMetodo[o.metodo_pago] || 0) + Number(o.monto || 0);
  });

  const totalProv = Object.values(porProveedor).reduce((s, v) => s + v, 0);
  const provOrd = Object.entries(porProveedor).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, border: `1px solid ${B.navyLight}` }}>
        <h3 style={{ fontSize: 13, color: B.sand, margin: 0, marginBottom: 6 }}>📊 Total pagado</h3>
        <div style={{ fontSize: 32, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(totalProv)}</div>
      </div>

      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, border: `1px solid ${B.navyLight}` }}>
        <h3 style={{ fontSize: 13, color: B.sand, margin: 0, marginBottom: 6 }}>🏢 Top proveedores</h3>
        {provOrd.length === 0
          ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Sin pagos registrados</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {provOrd.map(([nombre, monto]) => (
                <div key={nombre} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${B.navyLight}`, fontSize: 12 }}>
                  <span>{nombre}</span>
                  <strong style={{ color: B.sand }}>{COP(monto)}</strong>
                </div>
              ))}
            </div>
          )
        }
      </div>

      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, border: `1px solid ${B.navyLight}` }}>
        <h3 style={{ fontSize: 13, color: B.sand, margin: 0, marginBottom: 6 }}>💳 Por método de pago</h3>
        {Object.keys(porMetodo).length === 0
          ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Sin datos</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
              {Object.entries(porMetodo).map(([m, v]) => (
                <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${B.navyLight}`, fontSize: 12 }}>
                  <span style={{ textTransform: "capitalize" }}>{m}</span>
                  <strong style={{ color: B.sand }}>{COP(v)}</strong>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// styles
// ════════════════════════════════════════════════════════════════════════
const INP = { width: "100%", padding: "8px 11px", borderRadius: 7, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, outline: "none", boxSizing: "border-box" };
const LBL = { fontSize: 10, color: "rgba(255,255,255,0.55)", display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };
const btnNav = { padding: "6px 12px", borderRadius: 6, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white, fontSize: 16, cursor: "pointer", fontWeight: 700 };
