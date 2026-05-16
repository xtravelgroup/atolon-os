import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B, COP, todayStr } from "../brand";

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const REPORTES = [
  { key: "facturacion",  label: "Facturación Diaria", icon: "🧾", desc: "Ventas del día para contabilidad · Quiénes pidieron factura electrónica · Exportable" },
  { key: "transacciones",label: "Transacciones",      icon: "💸", desc: "Todos los pagos procesados · Filtro por Wompi / Zoho / Stripe / Efectivo / etc." },
  { key: "cortesias",    label: "Cortesías",         icon: "🎁", desc: "Reservas entregadas como cortesía · Quién autoriza · Motivo · Impacto" },
  { key: "ventas",       label: "Ventas por periodo", icon: "📊", desc: "Ingresos por producto, canal, aliado B2B, vendedor" },
  { key: "pagos",        label: "Pagos por método",   icon: "💳", desc: "Desglose de pagos por Efectivo / Datáfono / Transferencia / Wompi / CXC" },
  { key: "ocupacion",    label: "Ocupación diaria",   icon: "📅", desc: "Pax por día · Ocupación vs. capacidad · Tendencia mensual" },
  { key: "cancelaciones",label: "Cancelaciones",      icon: "✕",  desc: "Reservas canceladas · Razón · Reembolsos" },
  { key: "ayb",          label: "Reportes A&B",       icon: "🍽️", desc: "Cortesías · Anulaciones · Descuentos del Restaurant/Bar (Loggro)" },
];

const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function Reportes() {
  const [tab, setTab] = useState("cortesias");

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1300, margin: "0 auto", color: "#fff" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800 }}>📑 Reportes</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Análisis financiero y operativo · Exportación CSV</div>
      </div>

      {/* Grid de tarjetas de reportes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12, marginBottom: 24 }}>
        {REPORTES.map(r => (
          <button key={r.key} onClick={() => setTab(r.key)}
            style={{ display: "flex", gap: 14, padding: "16px 18px", background: tab === r.key ? `${B.sand}15` : B.navy, border: `1px solid ${tab === r.key ? B.sand : B.navyLight}`, borderRadius: 12, color: "#fff", cursor: "pointer", textAlign: "left" }}>
            <div style={{ fontSize: 26 }}>{r.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>{r.label}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 3, lineHeight: 1.4 }}>{r.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {tab === "facturacion"   && <ReporteFacturacionDiaria />}
      {tab === "transacciones" && <ReporteTransacciones />}
      {tab === "cortesias"     && <ReporteCortesias />}
      {tab === "ventas"        && <ReporteVentas />}
      {tab === "pagos"         && <ReportePagosPorMetodo />}
      {tab === "ocupacion"     && <ReporteOcupacion />}
      {tab === "cancelaciones" && <ReporteCancelaciones />}
      {tab === "ayb"           && <ReporteAyB />}
    </div>
  );
}

// ─── REPORTE FACTURACIÓN DIARIA ─────────────────────────────────────────────
// Diseñado para que Contabilidad haga su corrida diaria de facturas.
// Muestra:
//   • Reservas con factura electrónica solicitada (datos completos para FE)
//   • Reservas sin FE (resumen por canal/método)
//   • Eventos / grupos del día
//   • Ventas A&B Restobar (Loggro)
//   • Otros (muelle, actividades)
// Permite marcar reservas como "FE emitida" y exportar a CSV.
function ReporteFacturacionDiaria() {
  const [fecha, setFecha] = useState(todayStr());
  const [reservas, setReservas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [muelle, setMuelle] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [aybData, setAybData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEmitirModal, setShowEmitirModal] = useState(null); // reserva object

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const auth = { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` };
      const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync`;

      const [resR, eveR, muelleR, actR, aybRes] = await Promise.all([
        supabase.from("reservas")
          .select("id, nombre, fecha, total, abono, saldo, tipo, pax_a, pax_n, pax, forma_pago, canal, estado, aliado_id, email, telefono, fe_tipo_documento, fe_numero_documento, fe_razon_social, fe_nombres, fe_telefono, fe_estado, fe_numero_factura, fe_emitida_at, grupo_id")
          .eq("fecha", fecha)
          .neq("estado", "cancelado"),
        supabase.from("eventos")
          .select("id, nombre, fecha, valor, valor_extras, pax, categoria, stage, nit, aliado_id, aliado_nombre")
          .eq("fecha", fecha)
          .in("stage", ["Confirmado", "Realizado"])
          .in("categoria", ["grupo", "evento"]),
        supabase.from("muelle_llegadas")
          .select("id, fecha, total_cobrado, pax_total, tipo, reserva_id, observaciones")
          .eq("fecha", fecha)
          .gt("total_cobrado", 0)
          .neq("tipo", "lancha_atolon"),
        supabase.from("actividades_ventas")
          .select("id, fecha, total, actividad, cliente, estado, forma_pago")
          .eq("fecha", fecha)
          .neq("estado", "cancelada"),
        fetch(`${base}/cierre-caja-rango?from=${fecha}&to=${fecha}`, { headers: auth })
          .then(r => r.json()).catch(() => null),
      ]);

      setReservas(resR.data || []);
      setEventos(eveR.data || []);
      setMuelle((muelleR.data || []).filter(m => !m.reserva_id));   // sin reserva = ingreso aparte
      setActividades(actR.data || []);
      setAybData(aybRes?.ok ? aybRes : null);
    } catch (e) {
      console.error("[ReporteFacturacionDiaria]", e);
    }
    setLoading(false);
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Agrupaciones ───────────────────────────────────────────────────────
  const reservasConFE = reservas.filter(r => r.fe_tipo_documento && r.fe_numero_documento);
  const reservasSinFE = reservas.filter(r => !r.fe_tipo_documento || !r.fe_numero_documento);

  const totalReservasFE = reservasConFE.reduce((s, r) => s + Number(r.total || 0), 0);
  const totalReservasSinFE = reservasSinFE.reduce((s, r) => s + Number(r.total || 0), 0);
  const totalEventos = eventos.reduce((s, e) => s + Number(e.valor || 0) + Number(e.valor_extras || 0), 0);
  const totalMuelle = muelle.reduce((s, m) => s + Number(m.total_cobrado || 0), 0);
  const totalActividades = actividades.reduce((s, a) => s + Number(a.total || 0), 0);
  const totalAyB = Number(aybData?.resumen?.total_ventas || 0);
  const totalGeneral = totalReservasFE + totalReservasSinFE + totalEventos + totalMuelle + totalActividades + totalAyB;

  // Pendientes de emitir (FE solicitada pero no emitida)
  const pendientesEmitir = reservasConFE.filter(r => r.fe_estado !== "emitida");
  const yaEmitidas = reservasConFE.filter(r => r.fe_estado === "emitida");

  // Marcar reserva como FE emitida
  const marcarEmitida = async (reservaId, numeroFactura) => {
    if (!numeroFactura?.trim()) return alert("Ingresá el número de factura");
    const { error } = await supabase.from("reservas").update({
      fe_estado: "emitida",
      fe_numero_factura: numeroFactura.trim(),
      fe_emitida_at: new Date().toISOString(),
    }).eq("id", reservaId);
    if (error) return alert("Error: " + error.message);
    setShowEmitirModal(null);
    cargar();
  };

  // ── Export CSV ─────────────────────────────────────────────────────────
  const exportarCSV = () => {
    const rows = [];
    rows.push(["FACTURACIÓN DIARIA", `Fecha: ${fecha}`, "", "", "", "", "", ""].join(","));
    rows.push("");

    // Sección 1: FE solicitadas
    rows.push(`SOLICITARON FACTURA ELECTRÓNICA (${reservasConFE.length})`);
    rows.push(["ID","Cliente","Tipo Doc","Número Doc","Razón Social","Total","Forma Pago","Estado FE","N° Factura"].join(","));
    reservasConFE.forEach(r => {
      rows.push([
        r.id, csv(r.nombre), r.fe_tipo_documento || "",
        r.fe_numero_documento || "", csv(r.fe_razon_social || r.fe_nombres || r.nombre),
        r.total || 0, r.forma_pago || "",
        r.fe_estado || "pendiente", r.fe_numero_factura || ""
      ].join(","));
    });
    rows.push(["","","","","TOTAL FE", totalReservasFE, "", "", ""].join(","));
    rows.push("");

    // Sección 2: Otras reservas
    rows.push(`OTRAS RESERVAS DEL DÍA — CONSUMIDOR FINAL (${reservasSinFE.length})`);
    rows.push(["ID","Cliente","Tipo","Pax","Total","Forma Pago","Canal","Estado","Factura","Emitida"].join(","));
    reservasSinFE.forEach(r => {
      rows.push([
        r.id, csv(r.nombre), r.tipo || "",
        (r.pax_a || r.pax || 0) + (r.pax_n ? `+${r.pax_n}N` : ""),
        r.total || 0, r.forma_pago || "", r.canal || "", r.estado || "",
        r.fe_estado === "emitida" ? "emitida" : "pendiente",
        r.fe_numero_factura || "", r.fe_emitida_at ? new Date(r.fe_emitida_at).toLocaleString("es-CO") : "",
      ].join(","));
    });
    rows.push(["","","","TOTAL OTRAS", totalReservasSinFE, "", "", "", "", ""].join(","));
    rows.push("");

    // Sección 3: Eventos
    if (eventos.length) {
      rows.push(`EVENTOS / GRUPOS (${eventos.length})`);
      rows.push(["ID","Nombre","Categoría","NIT","Aliado","Pax","Valor","Extras","Total"].join(","));
      eventos.forEach(e => {
        const total = Number(e.valor || 0) + Number(e.valor_extras || 0);
        rows.push([
          e.id, csv(e.nombre), e.categoria, e.nit || "", csv(e.aliado_nombre || ""),
          e.pax || 0, e.valor || 0, e.valor_extras || 0, total,
        ].join(","));
      });
      rows.push(["","","","","","TOTAL EVENTOS", totalEventos, "", ""].join(","));
      rows.push("");
    }

    // Sección 4: A&B Loggro
    rows.push(`VENTAS A&B RESTOBAR (LOGGRO)`);
    rows.push(["Tickets","Total Ventas","Propinas","Por Método","",""].join(","));
    if (aybData?.resumen) {
      const porMetodo = Object.entries(aybData.por_metodo || {}).map(([m, v]) => `${m}: ${v}`).join(" | ");
      rows.push([
        aybData.resumen.tickets || 0,
        aybData.resumen.total_ventas || 0,
        aybData.resumen.total_propinas || 0,
        csv(porMetodo), "", ""
      ].join(","));
    }
    rows.push("");

    rows.push(["","","","","","","TOTAL GENERAL", totalGeneral].join(","));

    const csvContent = rows.join("\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `facturacion-diaria-${fecha}.csv`;
    link.click();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>;

  return (
    <div>
      {/* Header con selector de fecha + export */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={LS}>Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...IS, width: 180 }} />
        </div>
        <button onClick={cargar} style={BTN(B.navyLight)}>🔄 Refrescar</button>
        <button onClick={exportarCSV} style={BTN(B.success)}>📥 Exportar CSV</button>
      </div>

      {/* KPIs grandes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 18 }}>
        <Kpi color={B.warning} label="Pendientes FE" val={pendientesEmitir.length} sub={`${reservasConFE.length} solicitudes`} />
        <Kpi color={B.success} label="FE Emitidas" val={yaEmitidas.length} />
        <Kpi color={B.sand}    label="Total reservas" val={COP(totalReservasFE + totalReservasSinFE)} sub={`${reservas.length} reservas`} />
        <Kpi color="#a78bfa"   label="Total eventos" val={COP(totalEventos)} sub={`${eventos.length} eventos`} />
        <Kpi color="#fb923c"   label="A&B Restobar" val={COP(totalAyB)} sub={`${aybData?.resumen?.tickets || 0} tickets`} />
        <Kpi color={B.sky}     label="TOTAL GENERAL" val={COP(totalGeneral)} highlight />
      </div>

      {/* SECCIÓN 1: Pendientes de emitir FE */}
      <Seccion titulo="🧾 Pendientes de emitir Factura Electrónica" color={B.warning} count={pendientesEmitir.length} total={pendientesEmitir.reduce((s, r) => s + Number(r.total || 0), 0)}>
        {pendientesEmitir.length === 0 ? (
          <div style={{ padding: 14, color: "rgba(255,255,255,0.4)", textAlign: "center", fontStyle: "italic" }}>No hay pendientes — todo emitido o no se solicitó FE</div>
        ) : (
          <table style={tablaStyle}>
            <thead>
              <tr style={trHeader}>
                <th style={th}>ID</th>
                <th style={th}>Cliente</th>
                <th style={th}>Tipo doc</th>
                <th style={th}>Número doc</th>
                <th style={th}>Razón social / Nombre</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
                <th style={th}>Forma pago</th>
                <th style={th}>Canal</th>
                <th style={th}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pendientesEmitir.map(r => (
                <tr key={r.id} style={trBody}>
                  <td style={td}>{r.id}</td>
                  <td style={td}>{r.nombre}</td>
                  <td style={{ ...td, fontWeight: 700, color: B.sky }}>{r.fe_tipo_documento}</td>
                  <td style={td}>{r.fe_numero_documento}</td>
                  <td style={td}>{r.fe_razon_social || r.fe_nombres || r.nombre}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(r.total)}</td>
                  <td style={td}>{r.forma_pago}</td>
                  <td style={td}>{r.canal}</td>
                  <td style={td}>
                    <button onClick={() => setShowEmitirModal(r)} style={{ ...BTN(B.success), fontSize: 11, padding: "4px 10px" }}>
                      ✓ Marcar emitida
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      {/* SECCIÓN 2: FE ya emitidas hoy */}
      {yaEmitidas.length > 0 && (
        <Seccion titulo="✅ FE emitidas" color={B.success} count={yaEmitidas.length} total={yaEmitidas.reduce((s, r) => s + Number(r.total || 0), 0)}>
          <table style={tablaStyle}>
            <thead><tr style={trHeader}>
              <th style={th}>ID</th><th style={th}>Cliente</th><th style={th}>Doc</th>
              <th style={th}>N° Factura</th><th style={th}>Emitida</th><th style={{ ...th, textAlign: "right" }}>Total</th>
            </tr></thead>
            <tbody>
              {yaEmitidas.map(r => (
                <tr key={r.id} style={trBody}>
                  <td style={td}>{r.id}</td>
                  <td style={td}>{r.nombre}</td>
                  <td style={td}>{r.fe_tipo_documento} {r.fe_numero_documento}</td>
                  <td style={{ ...td, fontWeight: 700, color: B.success }}>{r.fe_numero_factura}</td>
                  <td style={td}>{r.fe_emitida_at ? new Date(r.fe_emitida_at).toLocaleString("es-CO") : "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccion>
      )}

      {/* SECCIÓN 3: Otras reservas (sin FE solicitada) */}
      <Seccion titulo="📋 Otras reservas del día (sin FE solicitada)" color={B.navyLight} count={reservasSinFE.length} total={totalReservasSinFE}>
        {reservasSinFE.length === 0 ? (
          <div style={{ padding: 14, color: "rgba(255,255,255,0.4)", textAlign: "center", fontStyle: "italic" }}>Sin reservas adicionales</div>
        ) : (
          <table style={tablaStyle}>
            <thead><tr style={trHeader}>
              <th style={th}>ID</th><th style={th}>Cliente</th><th style={th}>Tipo</th>
              <th style={th}>Pax</th><th style={th}>Forma pago</th><th style={th}>Canal</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th>
              <th style={th}>Factura (consumidor final)</th>
            </tr></thead>
            <tbody>
              {reservasSinFE.map(r => (
                <tr key={r.id} style={trBody}>
                  <td style={td}>{r.id}</td>
                  <td style={td}>{r.nombre}</td>
                  <td style={td}>{r.tipo}</td>
                  <td style={td}>{r.pax_a || r.pax || 0}{r.pax_n ? `+${r.pax_n}N` : ""}</td>
                  <td style={td}>{r.forma_pago}</td>
                  <td style={td}>{r.canal}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(r.total)}</td>
                  <td style={td}>
                    {r.fe_estado === "emitida" ? (
                      <span style={{ fontWeight: 700, color: B.success }}>
                        ✓ {r.fe_numero_factura}
                        {r.fe_emitida_at && <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 6 }}>{new Date(r.fe_emitida_at).toLocaleDateString("es-CO")}</span>}
                      </span>
                    ) : (
                      <button onClick={() => setShowEmitirModal(r)} style={{ ...BTN(B.success), fontSize: 11, padding: "4px 10px" }}>
                        ✓ Marcar emitida
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>

      {/* SECCIÓN 4: Eventos */}
      {eventos.length > 0 && (
        <Seccion titulo="🎉 Eventos / Grupos" color="#a78bfa" count={eventos.length} total={totalEventos}>
          <table style={tablaStyle}>
            <thead><tr style={trHeader}>
              <th style={th}>ID</th><th style={th}>Nombre</th><th style={th}>Categoría</th>
              <th style={th}>NIT</th><th style={th}>Aliado</th><th style={th}>Pax</th>
              <th style={{ ...th, textAlign: "right" }}>Valor</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th>
            </tr></thead>
            <tbody>
              {eventos.map(e => (
                <tr key={e.id} style={trBody}>
                  <td style={td}>{e.id}</td>
                  <td style={td}>{e.nombre}</td>
                  <td style={td}>{e.categoria}</td>
                  <td style={td}>{e.nit || "—"}</td>
                  <td style={td}>{e.aliado_nombre || "—"}</td>
                  <td style={td}>{e.pax || 0}</td>
                  <td style={{ ...td, textAlign: "right" }}>{COP(e.valor)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(Number(e.valor || 0) + Number(e.valor_extras || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Seccion>
      )}

      {/* SECCIÓN 5: A&B Loggro */}
      <Seccion titulo="🍽️ Ventas A&B Restobar (Loggro)" color="#fb923c" count={aybData?.resumen?.tickets || 0} total={totalAyB}>
        {!aybData?.resumen ? (
          <div style={{ padding: 14, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>No se pudo cargar Loggro</div>
        ) : (
          <div style={{ padding: "14px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
              <Kpi color={B.sand} label="Tickets" val={aybData.resumen.tickets} compact />
              <Kpi color={B.success} label="Ventas" val={COP(aybData.resumen.total_ventas)} compact />
              <Kpi color={B.warning} label="Propinas" val={COP(aybData.resumen.total_propinas)} compact />
              <Kpi color={B.danger} label="Anuladas" val={COP(aybData.resumen.anuladas || 0)} compact />
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontWeight: 700, textTransform: "uppercase" }}>Por método de pago:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(aybData.por_metodo || {}).map(([m, v]) => (
                <div key={m} style={{ background: B.navy, padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>{m}: </span>
                  <span style={{ fontWeight: 700, color: B.white }}>{COP(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Seccion>

      {/* SECCIÓN 6: Otros (muelle, actividades) */}
      {(muelle.length > 0 || actividades.length > 0) && (
        <Seccion titulo="🛥️ Otros ingresos (Muelle + Actividades)" color={B.sky} count={muelle.length + actividades.length} total={totalMuelle + totalActividades}>
          {muelle.length > 0 && (
            <>
              <div style={{ padding: "8px 14px", fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase" }}>Muelle</div>
              <table style={tablaStyle}>
                <thead><tr style={trHeader}>
                  <th style={th}>ID</th><th style={th}>Tipo</th><th style={th}>Pax</th>
                  <th style={th}>Notas</th><th style={{ ...th, textAlign: "right" }}>Total</th>
                </tr></thead>
                <tbody>
                  {muelle.map(m => (
                    <tr key={m.id} style={trBody}>
                      <td style={td}>{m.id}</td>
                      <td style={td}>{m.tipo}</td>
                      <td style={td}>{m.pax_total}</td>
                      <td style={td}>{m.observaciones || "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(m.total_cobrado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {actividades.length > 0 && (
            <>
              <div style={{ padding: "8px 14px", fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase" }}>Actividades</div>
              <table style={tablaStyle}>
                <thead><tr style={trHeader}>
                  <th style={th}>ID</th><th style={th}>Cliente</th><th style={th}>Actividad</th>
                  <th style={th}>Forma pago</th><th style={{ ...th, textAlign: "right" }}>Total</th>
                </tr></thead>
                <tbody>
                  {actividades.map(a => (
                    <tr key={a.id} style={trBody}>
                      <td style={td}>{a.id}</td>
                      <td style={td}>{a.cliente}</td>
                      <td style={td}>{a.actividad}</td>
                      <td style={td}>{a.forma_pago}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Seccion>
      )}

      {/* Modal: marcar como emitida */}
      {showEmitirModal && (
        <EmitirFEModal reserva={showEmitirModal} onClose={() => setShowEmitirModal(null)} onConfirm={(num) => marcarEmitida(showEmitirModal.id, num)} />
      )}
    </div>
  );
}

// Helpers de UI para FacturacionDiaria
function Kpi({ color, label, val, sub, highlight, compact }) {
  return (
    <div style={{
      background: highlight ? `${color}22` : B.navy,
      border: `1px solid ${highlight ? color : B.navyLight}`,
      borderRadius: 10,
      padding: compact ? "8px 12px" : "12px 16px",
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: compact ? 16 : 22, fontWeight: 800, color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 2 }}>{val}</div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Seccion({ titulo, color, count, total, children }) {
  return (
    <div style={{ background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${color}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {titulo} <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>({count})</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(total)}</div>
      </div>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}

function EmitirFEModal({ reserva, onClose, onConfirm }) {
  const [num, setNum] = useState("");
  const esFE = !!(reserva.fe_tipo_documento && reserva.fe_numero_documento);
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 460, maxWidth: "92vw", border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {esFE ? "Marcar Factura Electrónica como emitida" : "Marcar factura emitida (consumidor final)"}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 16 }}>
          {reserva.nombre} · {esFE ? `${reserva.fe_tipo_documento} ${reserva.fe_numero_documento}` : "Consumidor final"} · <strong>{COP(reserva.total)}</strong>
        </div>
        <label style={LS}>Número de factura *</label>
        <input value={num} onChange={e => setNum(e.target.value)} placeholder="Ej: FE-12345"
          autoFocus
          style={IS} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
          <button onClick={() => onConfirm(num)} disabled={!num.trim()} style={{ ...BTN(B.success), opacity: !num.trim() ? 0.5 : 1 }}>✓ Confirmar emisión</button>
        </div>
      </div>
    </div>
  );
}

const tablaStyle = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const trHeader = { background: B.navyLight };
const trBody = { borderBottom: `1px solid rgba(255,255,255,0.05)` };
const th = { padding: "8px 10px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700 };
const td = { padding: "8px 10px", color: "rgba(255,255,255,0.85)" };
const csv = (s) => `"${String(s || "").replace(/"/g, '""')}"`;

// ─── REPORTE A&B (Loggro Restobar) ──────────────────────────────────────────
function ReporteAyB() {
  const [subTab, setSubTab] = useState("pedidos_cortesia");
  const [fechaIni, setFechaIni] = useState(firstOfMonth());
  const [fechaFin, setFechaFin] = useState(todayStr());
  const [data, setData] = useState({ cortesias: [], anuladas: [], descuentos: [], resumen: null });
  const [pedidosCortesia, setPedidosCortesia] = useState([]);
  const [pedidosInternos, setPedidosInternos] = useState([]);
  const [pedidosCancelados, setPedidosCancelados] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const auth = { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` };
      const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync`;
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`${base}/reporte-ayb?from=${fechaIni}&to=${fechaFin}`, { headers: auth }),
        fetch(`${base}/reporte-cortesias-pedidos?from=${fechaIni}&to=${fechaFin}`, { headers: auth }),
        fetch(`${base}/reporte-internos-pedidos?from=${fechaIni}&to=${fechaFin}`, { headers: auth }),
        fetch(`${base}/reporte-cancelaciones-pedidos?from=${fechaIni}&to=${fechaFin}`, { headers: auth }),
      ]);
      const [j1, j2, j3, j4] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json()]);
      if (j1.ok) setData(j1);
      if (j2.ok) setPedidosCortesia(j2.cortesias || []);
      if (j3.ok) setPedidosInternos(j3.internos || []);
      if (j4.ok) setPedidosCancelados(j4.canceladas || []);
    } catch (e) {
      console.error("[ReporteAyB]", e);
    } finally {
      setLoading(false);
    }
  }, [fechaIni, fechaFin]);
  useEffect(() => { cargar(); }, [cargar]);

  const lista =
    subTab === "pedidos_cortesia" ? pedidosCortesia :
    subTab === "pedidos_internos" ? pedidosInternos :
    subTab === "pedidos_cancelados" ? pedidosCancelados :
    (data[subTab] || []);

  const handleExport = () => {
    if (subTab === "pedidos_cortesia") {
      const rows = [["Fecha pedido", "Fecha cortesía", "Producto", "Cantidad", "Cliente", "Nota", "Cortesía por", "Pedido por"]];
      lista.forEach(r => rows.push([r.fecha_pedido, r.fecha_cortesia, r.producto, r.cantidad, r.cliente, r.nota, r.cortesia_por, r.pedido_por]));
      exportCSV(`ayb_pedidos_cortesia_${fechaIni}_${fechaFin}.csv`, rows);
    } else if (subTab === "pedidos_internos") {
      const rows = [["Fecha pedido", "Fecha guardado", "Producto", "Cantidad", "Nota", "Guardado por", "Pedido por"]];
      lista.forEach(r => rows.push([r.fecha_pedido, r.fecha_guardado, r.producto, r.cantidad, r.nota, r.guardado_por, r.pedido_por]));
      exportCSV(`ayb_pedidos_internos_${fechaIni}_${fechaFin}.csv`, rows);
    } else if (subTab === "pedidos_cancelados") {
      const rows = [["Fecha pedido", "Fecha cancelación", "Producto", "Cantidad", "Motivo", "Cancelado por", "Pedido por"]];
      lista.forEach(r => rows.push([r.fecha_pedido, r.fecha_cancelacion, r.producto, r.cantidad, r.motivo, r.cancelado_por, r.pedido_por]));
      exportCSV(`ayb_pedidos_cancelados_${fechaIni}_${fechaFin}.csv`, rows);
    } else if (subTab === "cortesias") {
      const rows = [["Fecha", "Hora", "Factura", "Cliente", "Cajero", "Subtotal", "Descuento", "Total", "Items"]];
      lista.forEach(r => rows.push([r.fecha, r.hora, r.numero, r.cliente, r.usuario, r.subtotal, r.discount, r.total, r.items_count]));
      exportCSV(`ayb_cortesias_${fechaIni}_${fechaFin}.csv`, rows);
    } else if (subTab === "anuladas") {
      const rows = [["Fecha", "Hora", "Factura", "Cliente", "Cajero", "Total", "Motivo"]];
      lista.forEach(r => rows.push([r.fecha, r.hora, r.numero, r.cliente, r.usuario, r.total, r.motivo]));
      exportCSV(`ayb_anuladas_${fechaIni}_${fechaFin}.csv`, rows);
    } else {
      const rows = [["Fecha", "Hora", "Factura", "Cliente", "Cajero", "Subtotal", "Descuento", "% Desc", "Total"]];
      lista.forEach(r => rows.push([r.fecha, r.hora, r.numero, r.cliente, r.usuario, r.subtotal, r.discount, r.discountPct?.toFixed(1), r.total]));
      exportCSV(`ayb_descuentos_${fechaIni}_${fechaFin}.csv`, rows);
    }
  };

  return (
    <div>
      <FiltroFechas
        fechaIni={fechaIni} setFechaIni={setFechaIni}
        fechaFin={fechaFin} setFechaFin={setFechaFin}
        onExport={handleExport}
      />

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { k: "pedidos_cortesia",  l: "🎁 Pedidos Cortesía",  c: "#a78bfa", count: pedidosCortesia.length, total: null },
          { k: "pedidos_internos",  l: "🏢 Pedidos Internos",  c: "#22d3ee", count: pedidosInternos.length, total: null },
          { k: "pedidos_cancelados",l: "🚫 Pedidos Cancelados",c: B.danger,  count: pedidosCancelados.length, total: null },
          { k: "cortesias",  l: "🧾 Facturas Cortesía",  c: "#c084fc", count: data.resumen?.cortesias?.count, total: data.resumen?.cortesias?.total },
          { k: "anuladas",   l: "✕ Facturas Anuladas",     c: B.danger,  count: data.resumen?.anuladas?.count,  total: data.resumen?.anuladas?.total },
          { k: "descuentos", l: "💰 Descuentos",  c: B.warning, count: data.resumen?.descuentos?.count, total: data.resumen?.descuentos?.total_descontado },
        ].map(t => {
          const active = subTab === t.k;
          return (
            <button key={t.k} onClick={() => setSubTab(t.k)}
              style={{
                padding: "12px 18px", borderRadius: 10,
                border: `2px solid ${active ? t.c : B.navyLight}`,
                background: active ? t.c + "22" : B.navyMid,
                color: active ? t.c : "rgba(255,255,255,0.6)",
                cursor: "pointer", fontSize: 13, fontWeight: 700, textAlign: "left",
              }}>
              <div>{t.l}</div>
              <div style={{ fontSize: 10, marginTop: 4, opacity: 0.8 }}>
                {t.count != null ? `${t.count} casos · ${COP(t.total || 0)}` : "—"}
              </div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando datos de Loggro…</div>
      ) : lista.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", background: B.navyMid, borderRadius: 12, color: "rgba(255,255,255,0.4)" }}>
          Sin {subTab.replace("_", " ")} en este rango.
        </div>
      ) : (subTab === "pedidos_cortesia" || subTab === "pedidos_internos" || subTab === "pedidos_cancelados") ? (
        (() => {
          const cfg = {
            pedidos_cortesia:  { col2: "Fecha cortesía",    col2k: "fecha_cortesia",    extra: "Cliente", extrak: "cliente", who: "Cortesía por", whok: "cortesia_por", color: "#a78bfa" },
            pedidos_internos:  { col2: "Fecha guardado",    col2k: "fecha_guardado",    extra: null,      extrak: null,       who: "Guardado por", whok: "guardado_por", color: "#22d3ee" },
            pedidos_cancelados:{ col2: "Fecha cancelación", col2k: "fecha_cancelacion", extra: null,      extrak: null,       who: "Cancelado por",whok: "cancelado_por",color: B.danger },
          }[subTab];
          const headers = ["Fecha pedido", cfg.col2, "Producto", "Cant"];
          if (cfg.extra) headers.push(cfg.extra);
          headers.push("Nota / Motivo", cfg.who, "Pedido por");
          return (
            <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1000 }}>
                <thead>
                  <tr style={{ background: B.navyLight }}>
                    {headers.map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.map(r => (
                    <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>{r.fecha_pedido}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{r[cfg.col2k]}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{r.producto}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 800, color: cfg.color }}>{r.cantidad}</td>
                      {cfg.extrak && <td style={{ padding: "10px 12px" }}>{r[cfg.extrak]}</td>}
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.55)", maxWidth: 280 }}>{(r.nota || r.motivo) || "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: cfg.color }}>{r[cfg.whok]}</td>
                      <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.6)" }}>{r.pedido_por}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 850 }}>
            <thead>
              <tr style={{ background: B.navyLight }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Fecha</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Factura</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Cliente / Mesa</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Cajero</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Subtotal</th>
                {subTab !== "anuladas" && (
                  <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Descuento</th>
                )}
                <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{subTab === "anuladas" ? "Motivo" : "Items"}</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(r => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700 }}>{r.fecha}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{r.hora}</div>
                  </td>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11 }}>#{r.numero}</td>
                  <td style={{ padding: "10px 12px" }}>{r.cliente}</td>
                  <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.6)" }}>{r.usuario}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{COP(r.subtotal)}</td>
                  {subTab !== "anuladas" && (
                    <td style={{ padding: "10px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: B.warning, fontWeight: 700 }}>
                      −{COP(r.discount)}
                      {r.discountPct > 0 && (
                        <div style={{ fontSize: 10, opacity: 0.7 }}>({r.discountPct.toFixed(1)}%)</div>
                      )}
                    </td>
                  )}
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums",
                    color: subTab === "anuladas" ? B.danger : subTab === "cortesias" ? "#a78bfa" : "#fff" }}>
                    {COP(r.total)}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.5)", maxWidth: 280 }}>
                    {subTab === "anuladas" ? (r.motivo || "—") : `${r.items_count} ítem${r.items_count !== 1 ? "s" : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, padding: 12, background: B.navy, borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
        ℹ️ Datos directos de Loggro Restobar.{" "}
        <strong style={{ color: "#a78bfa" }}>Pedidos Cortesía</strong>: KOTs marcados <code>complementary=true</code>.{" "}
        <strong style={{ color: "#22d3ee" }}>Pedidos Internos</strong>: KOTs marcados <code>internal=true</code> (consumos staff/dirección).{" "}
        <strong style={{ color: B.danger }}>Pedidos Cancelados</strong>: KOTs con <code>deletedInfo.isDeleted=true</code> (Loggro filtra deleted por API — pueden no aparecer todos).{" "}
        <strong style={{ color: "#c084fc" }}>Facturas Cortesía</strong>: facturas completas con descuento ≥99%.{" "}
        <strong style={{ color: B.warning }}>Descuentos</strong>: descuentos parciales aplicados.
      </div>
    </div>
  );
}

// ─── Helpers compartidos ─────────────────────────────────────────────────────
function FiltroFechas({ fechaIni, setFechaIni, fechaFin, setFechaFin, onExport, exportLabel = "📥 Exportar CSV" }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div>
        <label style={LS}>Desde</label>
        <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)} style={IS} />
      </div>
      <div>
        <label style={LS}>Hasta</label>
        <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={IS} />
      </div>
      <div style={{ flex: 1 }} />
      {onExport && (
        <button onClick={onExport} style={{ ...BTN(B.sand), color: B.navy }}>{exportLabel}</button>
      )}
    </div>
  );
}

function KPIRow({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
      {items.map((k, i) => (
        <div key={i} style={{ background: B.navy, borderRadius: 12, padding: "16px 20px", border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</div>
          <div style={{ fontSize: k.small ? 20 : 28, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{k.val}</div>
          {k.sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function exportCSV(filename, rows) {
  const csv = rows.map(row => row.map(c => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

const ESTADOS_NO_CANCEL = "(cancelado,no_show,reembolsado,cancelada)"; // para .not("estado","in",...)

// ─── REPORTE: VENTAS POR PERIODO ─────────────────────────────────────────────
function ReporteVentas() {
  const [fechaIni, setFechaIni] = useState(firstOfMonth());
  const [fechaFin, setFechaFin] = useState(todayStr());
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agruparPor, setAgruparPor] = useState("dia"); // dia | tipo | canal | vendedor

  useEffect(() => {
    if (!supabase) return;
    setLoading(true);
    supabase.from("reservas")
      .select("id, fecha, fecha_pago, nombre, tipo, pax, total, abono, forma_pago, vendedor, canal, estado, created_at")
      .gte("fecha", fechaIni)
      .lte("fecha", fechaFin)
      .order("fecha", { ascending: false })
      .then(({ data }) => {
        // Excluir canceladas para el reporte de ventas
        setReservas((data || []).filter(r => !["cancelado", "cancelada", "no_show", "reembolsado"].includes(r.estado)));
        setLoading(false);
      });
  }, [fechaIni, fechaFin]);

  const stats = useMemo(() => {
    const totalVentas = reservas.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const totalCobrado = reservas.reduce((s, r) => s + (Number(r.abono) || 0), 0);
    const totalPax = reservas.reduce((s, r) => s + (Number(r.pax) || 0), 0);
    const ticket = reservas.length > 0 ? totalVentas / reservas.length : 0;
    return { totalVentas, totalCobrado, totalPax, ticket, count: reservas.length };
  }, [reservas]);

  const grouped = useMemo(() => {
    const map = {};
    reservas.forEach(r => {
      let key;
      if (agruparPor === "dia") key = r.fecha || "Sin fecha";
      else if (agruparPor === "tipo") key = r.tipo || "Sin tipo";
      else if (agruparPor === "canal") key = r.canal || "Sin canal";
      else key = r.vendedor || "Sin vendedor";
      if (!map[key]) map[key] = { count: 0, total: 0, pax: 0 };
      map[key].count += 1;
      map[key].total += Number(r.total) || 0;
      map[key].pax += Number(r.pax) || 0;
    });
    return Object.entries(map)
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => agruparPor === "dia" ? a.key.localeCompare(b.key) : b.total - a.total);
  }, [reservas, agruparPor]);

  const onExport = () => {
    const labels = { dia: "Fecha", tipo: "Tipo", canal: "Canal", vendedor: "Vendedor" };
    exportCSV(`ventas_${fechaIni}_${fechaFin}_por_${agruparPor}.csv`, [
      [labels[agruparPor], "Reservas", "Pax", "Total"],
      ...grouped.map(g => [g.key, g.count, g.pax, g.total]),
    ]);
  };

  return (
    <div>
      <FiltroFechas fechaIni={fechaIni} setFechaIni={setFechaIni} fechaFin={fechaFin} setFechaFin={setFechaFin} onExport={onExport} />
      <KPIRow items={[
        { label: "Reservas",      val: stats.count, color: B.sky },
        { label: "Pax totales",   val: stats.totalPax, color: B.success },
        { label: "Ventas totales", val: COP(stats.totalVentas), color: B.sand, small: true },
        { label: "Cobrado",       val: COP(stats.totalCobrado), color: B.success, small: true, sub: stats.totalVentas > 0 ? `${Math.round(stats.totalCobrado / stats.totalVentas * 100)}%` : "" },
        { label: "Ticket promedio", val: COP(stats.ticket), color: B.warning, small: true },
      ]} />

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { k: "dia", l: "Por día" },
          { k: "tipo", l: "Por producto" },
          { k: "canal", l: "Por canal" },
          { k: "vendedor", l: "Por vendedor" },
        ].map(g => (
          <button key={g.k} onClick={() => setAgruparPor(g.k)}
            style={{ padding: "6px 14px", borderRadius: 18, border: `1px solid ${agruparPor === g.k ? B.sand : B.navyLight}`,
              background: agruparPor === g.k ? `${B.sand}22` : "transparent", color: agruparPor === g.k ? B.sand : "rgba(255,255,255,0.55)",
              cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            {g.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : grouped.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12 }}>Sin ventas en el periodo</div>
      ) : (
        <div style={{ background: B.navy, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: B.navyMid }}>
                {["Agrupación", "Reservas", "Pax", "Total", "% del total"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(g => {
                const pct = stats.totalVentas > 0 ? (g.total / stats.totalVentas * 100) : 0;
                return (
                  <tr key={g.key} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                    <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>{g.key}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{g.count}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: B.sky, fontWeight: 700 }}>{g.pax}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: B.sand, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(g.total)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: B.navyMid, borderRadius: 3, overflow: "hidden", maxWidth: 120 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: B.sand }} />
                        </div>
                        {pct.toFixed(1)}%
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── REPORTE: PAGOS POR MÉTODO ───────────────────────────────────────────────
function ReportePagosPorMetodo() {
  const [fechaIni, setFechaIni] = useState(firstOfMonth());
  const [fechaFin, setFechaFin] = useState(todayStr());
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    setLoading(true);
    // Misma lógica que Transacciones: todas las reservas con abono y no canceladas.
    // Filtro por fecha_pago (o created_at fallback) se aplica client-side, igual que en Transacciones.
    supabase.from("reservas")
      .select("id, fecha, fecha_pago, created_at, total, abono, forma_pago, pagos, estado, vendedor, canal, nombre")
      .gt("abono", 0)
      .neq("estado", "cancelado")
      .order("fecha_pago", { ascending: false, nullsFirst: false })
      .then(({ data }) => { setReservas(data || []); setLoading(false); });
  }, [fechaIni, fechaFin]);

  // Desglose por método — alineado con la lógica de "Transacciones":
  // - filtra por fecha_pago (o p.fecha si viene en el pago individual, fallback created_at)
  // - excluye cortesías del total (se cuentan aparte)
  const desglose = useMemo(() => {
    const map = {};
    reservas.forEach(r => {
      const tienePagosArray = Array.isArray(r.pagos) && r.pagos.length > 0;
      if (tienePagosArray) {
        r.pagos.forEach(p => {
          const fecha = (p.fecha || r.fecha_pago || r.created_at?.slice(0, 10) || "").slice(0, 10);
          if (fecha < fechaIni || fecha > fechaFin) return;
          const m = p.forma_pago || "Sin definir";
          const esCortesia = !!p.es_cortesia || m === "Cortesía";
          if (!map[m]) map[m] = { count: 0, monto: 0, reservas: new Set(), cortesias: 0 };
          map[m].count += 1;
          if (esCortesia) map[m].cortesias += 1;
          else map[m].monto += Number(p.monto) || 0;
          map[m].reservas.add(r.id);
        });
      } else if (Number(r.abono) > 0) {
        const fecha = (r.fecha_pago || r.created_at?.slice(0, 10) || "").slice(0, 10);
        if (fecha < fechaIni || fecha > fechaFin) return;
        const m = r.forma_pago || "Sin definir";
        const esCortesia = m === "Cortesía";
        if (!map[m]) map[m] = { count: 0, monto: 0, reservas: new Set(), cortesias: 0 };
        map[m].count += 1;
        if (esCortesia) map[m].cortesias += 1;
        else map[m].monto += Number(r.abono) || 0;
        map[m].reservas.add(r.id);
      }
    });
    return Object.entries(map)
      .map(([k, v]) => ({ metodo: k, count: v.count, monto: v.monto, reservas: v.reservas.size, cortesias: v.cortesias }))
      .sort((a, b) => b.monto - a.monto);
  }, [reservas, fechaIni, fechaFin]);

  const totalGlobal = desglose.reduce((s, d) => s + d.monto, 0);
  const colorPorMetodo = {
    "Efectivo":      B.success,
    "Datafono":      B.sky,
    "Transferencia": "#a78bfa",
    "Wompi":         "#5B4CF5",
    "stripe":        "#635BFF",
    "zoho_pay":      "#E42527",
    "Tarjeta Internacional": "#E42527",
    "SKY":           B.warning,
    "CXC":           "#64748b",
    "Cortesía":      B.sand,
    "Ajuste Retención": "#64748b",
    "Ajuste Agencia":   "#8b5cf6",
    "Sin definir":   "rgba(255,255,255,0.3)",
  };

  const onExport = () => {
    exportCSV(`pagos_metodo_${fechaIni}_${fechaFin}.csv`, [
      ["Método", "# pagos", "Reservas únicas", "Monto total", "% del total"],
      ...desglose.map(d => [d.metodo, d.count, d.reservas, d.monto, totalGlobal > 0 ? (d.monto / totalGlobal * 100).toFixed(1) + "%" : "0%"]),
    ]);
  };

  return (
    <div>
      <FiltroFechas fechaIni={fechaIni} setFechaIni={setFechaIni} fechaFin={fechaFin} setFechaFin={setFechaFin} onExport={onExport} />
      <KPIRow items={[
        { label: "Total cobrado",   val: COP(totalGlobal),       color: B.sand,    small: true },
        { label: "Métodos usados",  val: desglose.length,         color: B.sky },
        { label: "Reservas pagadas", val: (() => {
          const s = new Set();
          reservas.forEach(r => {
            const pagos = Array.isArray(r.pagos) && r.pagos.length > 0 ? r.pagos : null;
            if (pagos) {
              for (const p of pagos) {
                const f = (p.fecha || r.fecha_pago || r.created_at?.slice(0,10) || "").slice(0,10);
                if (f >= fechaIni && f <= fechaFin) { s.add(r.id); break; }
              }
            } else if (Number(r.abono) > 0) {
              const f = (r.fecha_pago || r.created_at?.slice(0,10) || "").slice(0,10);
              if (f >= fechaIni && f <= fechaFin) s.add(r.id);
            }
          });
          return s.size;
        })(), color: B.success },
      ]} />

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : desglose.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12 }}>Sin pagos en el periodo</div>
      ) : (
        <>
          {/* Cards por método */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 20 }}>
            {desglose.map(d => {
              const c = colorPorMetodo[d.metodo] || B.sky;
              const pct = totalGlobal > 0 ? (d.monto / totalGlobal * 100) : 0;
              return (
                <div key={d.metodo} style={{ background: B.navy, borderRadius: 12, padding: "14px 16px", border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${c}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{d.metodo}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(d.monto)}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{d.count} pago{d.count !== 1 ? "s" : ""} · {d.reservas} reserva{d.reservas !== 1 ? "s" : ""}</div>
                  <div style={{ marginTop: 8, height: 4, background: B.navyMid, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: c }} />
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 3, textAlign: "right" }}>{pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── REPORTE: OCUPACIÓN DIARIA ───────────────────────────────────────────────
function ReporteOcupacion() {
  const [fechaIni, setFechaIni] = useState(firstOfMonth());
  const [fechaFin, setFechaFin] = useState(todayStr());
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [capacidadDia, setCapacidadDia] = useState(150); // capacidad estimada por día

  useEffect(() => {
    if (!supabase) return;
    setLoading(true);
    supabase.from("reservas")
      .select("id, fecha, pax, pax_a, pax_n, tipo, estado, total")
      .gte("fecha", fechaIni)
      .lte("fecha", fechaFin)
      .not("estado", "in", ESTADOS_NO_CANCEL)
      .order("fecha")
      .then(({ data }) => { setReservas(data || []); setLoading(false); });
  }, [fechaIni, fechaFin]);

  // Agrupar por fecha
  const porDia = useMemo(() => {
    const map = {};
    reservas.forEach(r => {
      const d = r.fecha;
      if (!d) return;
      if (!map[d]) map[d] = { fecha: d, pax: 0, paxA: 0, paxN: 0, reservas: 0, total: 0 };
      map[d].pax += Number(r.pax) || 0;
      map[d].paxA += Number(r.pax_a) || 0;
      map[d].paxN += Number(r.pax_n) || 0;
      map[d].reservas += 1;
      map[d].total += Number(r.total) || 0;
    });
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [reservas]);

  const totalPax = porDia.reduce((s, d) => s + d.pax, 0);
  const promedio = porDia.length > 0 ? Math.round(totalPax / porDia.length) : 0;
  const maxDia = porDia.reduce((max, d) => d.pax > (max?.pax || 0) ? d : max, null);
  const ocupacionPromedio = capacidadDia > 0 ? Math.round(promedio / capacidadDia * 100) : 0;

  const onExport = () => {
    exportCSV(`ocupacion_${fechaIni}_${fechaFin}.csv`, [
      ["Fecha", "Reservas", "Adultos", "Niños", "Total Pax", "Ocupación %", "Total ventas"],
      ...porDia.map(d => [d.fecha, d.reservas, d.paxA, d.paxN, d.pax, capacidadDia > 0 ? Math.round(d.pax / capacidadDia * 100) + "%" : "—", d.total]),
    ]);
  };

  return (
    <div>
      <FiltroFechas fechaIni={fechaIni} setFechaIni={setFechaIni} fechaFin={fechaFin} setFechaFin={setFechaFin} onExport={onExport} />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <label style={{ ...LS, marginBottom: 0 }}>Capacidad diaria estimada</label>
        <input type="number" value={capacidadDia} onChange={e => setCapacidadDia(Number(e.target.value) || 0)}
          style={{ ...IS, width: 100 }} />
      </div>

      <KPIRow items={[
        { label: "Días con actividad", val: porDia.length, color: B.sky },
        { label: "Pax totales",        val: totalPax, color: B.success },
        { label: "Promedio diario",    val: promedio, color: B.sand },
        { label: "Ocupación %",        val: `${ocupacionPromedio}%`, color: ocupacionPromedio > 80 ? B.success : ocupacionPromedio > 50 ? B.warning : B.danger },
        { label: "Día pico",           val: maxDia ? `${maxDia.pax} pax` : "—", color: B.warning, sub: maxDia?.fecha || "" },
      ]} />

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : porDia.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12 }}>Sin actividad en el periodo</div>
      ) : (
        <div style={{ background: B.navy, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: B.navyMid }}>
                  {["Fecha", "Reservas", "Adultos", "Niños", "Pax total", "Ocupación", "Ventas"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porDia.map(d => {
                  const ocupPct = capacidadDia > 0 ? Math.round(d.pax / capacidadDia * 100) : 0;
                  const colorOcup = ocupPct > 90 ? B.danger : ocupPct > 70 ? B.warning : ocupPct > 40 ? B.success : B.sky;
                  return (
                    <tr key={d.fecha} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                      <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600 }}>
                        {new Date(d.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>{d.reservas}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>{d.paxA}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>{d.paxN}</td>
                      <td style={{ padding: "10px 12px", fontSize: 14, fontWeight: 800, color: B.sky, fontFamily: "'Barlow Condensed', sans-serif" }}>{d.pax}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: B.navyMid, borderRadius: 3, overflow: "hidden", maxWidth: 120 }}>
                            <div style={{ height: "100%", width: `${Math.min(100, ocupPct)}%`, background: colorOcup }} />
                          </div>
                          <span style={{ color: colorOcup, fontWeight: 700, minWidth: 40, textAlign: "right" }}>{ocupPct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: B.sand, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(d.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REPORTE: CANCELACIONES ──────────────────────────────────────────────────
function ReporteCancelaciones() {
  const [fechaIni, setFechaIni] = useState(firstOfMonth());
  const [fechaFin, setFechaFin] = useState(todayStr());
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    setLoading(true);
    supabase.from("reservas")
      .select("id, fecha, fecha_pago, nombre, tipo, pax, total, abono, forma_pago, vendedor, canal, estado, notas, created_at")
      .gte("fecha", fechaIni)
      .lte("fecha", fechaFin)
      .in("estado", ["cancelado", "cancelada", "no_show", "reembolsado"])
      .order("fecha", { ascending: false })
      .then(({ data }) => { setReservas(data || []); setLoading(false); });
  }, [fechaIni, fechaFin]);

  const stats = useMemo(() => {
    const total = reservas.length;
    const totalPerdido = reservas.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const totalReembolsado = reservas.filter(r => r.estado === "reembolsado" || (r.abono > 0 && r.estado !== "no_show")).reduce((s, r) => s + (Number(r.abono) || 0), 0);
    const noShow = reservas.filter(r => r.estado === "no_show").length;
    const cancel = reservas.filter(r => r.estado === "cancelado" || r.estado === "cancelada").length;
    const reembolso = reservas.filter(r => r.estado === "reembolsado").length;

    const porCanal = {};
    reservas.forEach(r => {
      const c = r.canal || "Sin canal";
      if (!porCanal[c]) porCanal[c] = 0;
      porCanal[c] += 1;
    });
    return { total, totalPerdido, totalReembolsado, noShow, cancel, reembolso, porCanal };
  }, [reservas]);

  const onExport = () => {
    exportCSV(`cancelaciones_${fechaIni}_${fechaFin}.csv`, [
      ["Fecha", "ID", "Cliente", "Tipo", "Pax", "Total", "Abono", "Estado", "Vendedor", "Canal", "Notas"],
      ...reservas.map(r => [r.fecha, r.id, r.nombre, r.tipo, r.pax, r.total, r.abono, r.estado, r.vendedor || "", r.canal || "", (r.notas || "").replace(/[\n,]/g, " ")]),
    ]);
  };

  return (
    <div>
      <FiltroFechas fechaIni={fechaIni} setFechaIni={setFechaIni} fechaFin={fechaFin} setFechaFin={setFechaFin} onExport={onExport} />
      <KPIRow items={[
        { label: "Cancelaciones",  val: stats.cancel,    color: B.danger },
        { label: "No-shows",        val: stats.noShow,    color: B.warning },
        { label: "Reembolsos",     val: stats.reembolso, color: B.sand },
        { label: "Monto perdido",   val: COP(stats.totalPerdido), color: B.danger, small: true },
        { label: "Reembolsado",    val: COP(stats.totalReembolsado), color: B.warning, small: true },
      ]} />

      {Object.keys(stats.porCanal).length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Por canal</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(stats.porCanal).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
              <div key={c} style={{ background: B.navy, borderRadius: 16, padding: "6px 14px", border: `1px solid ${B.navyLight}`, fontSize: 11 }}>
                {c}: <strong style={{ color: B.danger }}>{n}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : reservas.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <div>Sin cancelaciones en el periodo</div>
        </div>
      ) : (
        <div style={{ background: B.navy, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: B.navyMid }}>
                  {["Fecha", "ID", "Cliente", "Tipo", "Pax", "Total", "Abono", "Estado", "Canal", "Notas"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reservas.map(r => {
                  const colorEstado = r.estado === "cancelado" || r.estado === "cancelada" ? B.danger : r.estado === "no_show" ? B.warning : B.sand;
                  return (
                    <tr key={r.id} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.fecha || "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{r.id}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600 }}>{r.nombre}</td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{r.tipo}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.pax}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: B.sand, fontWeight: 700 }}>{COP(r.total)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: r.abono > 0 ? B.warning : "rgba(255,255,255,0.3)" }}>{COP(r.abono)}</td>
                      <td style={{ padding: "10px 12px", fontSize: 10 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 10, background: `${colorEstado}22`, color: colorEstado, fontWeight: 700, textTransform: "uppercase" }}>{r.estado}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{r.canal || "—"}</td>
                      <td style={{ padding: "10px 12px", fontSize: 10, color: "rgba(255,255,255,0.5)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notas || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REPORTE DE CORTESÍAS ────────────────────────────────────────────────────
function ReporteCortesias() {
  const [fechaIni, setFechaIni] = useState(firstOfMonth());
  const [fechaFin, setFechaFin] = useState(todayStr());
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    // Reservas cuya forma_pago es Cortesía (directo o en algún pago del historial)
    const { data } = await supabase
      .from("reservas")
      .select("id, fecha, fecha_pago, nombre, tipo, pax, total, abono, forma_pago, vendedor, canal, aliado_id, notas, pagos, estado, created_at")
      .gte("fecha", fechaIni)
      .lte("fecha", fechaFin)
      .order("fecha", { ascending: false });

    const list = (data || []).filter(r => {
      if (r.forma_pago === "Cortesía") return true;
      if (Array.isArray(r.pagos) && r.pagos.some(p => p?.forma_pago === "Cortesía")) return true;
      return false;
    });
    setReservas(list);
    setLoading(false);
  }, [fechaIni, fechaFin]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const totalCortesia = reservas.reduce((s, r) => {
      if (r.forma_pago === "Cortesía") return s + (Number(r.total) || 0);
      // Si la cortesía es solo un pago parcial, sumar solo ese monto
      const pagosCortesia = (r.pagos || []).filter(p => p?.forma_pago === "Cortesía");
      return s + pagosCortesia.reduce((a, p) => a + (Number(p.monto) || 0), 0);
    }, 0);
    const totalPax = reservas.reduce((s, r) => s + (Number(r.pax) || 0), 0);
    const porVendedor = {};
    reservas.forEach(r => {
      const v = r.vendedor || "Sin asignar";
      if (!porVendedor[v]) porVendedor[v] = { count: 0, monto: 0, pax: 0 };
      porVendedor[v].count += 1;
      porVendedor[v].pax += Number(r.pax) || 0;
      porVendedor[v].monto += r.forma_pago === "Cortesía" ? (Number(r.total) || 0)
        : (r.pagos || []).filter(p => p?.forma_pago === "Cortesía").reduce((a, p) => a + (Number(p.monto) || 0), 0);
    });
    return { totalCortesia, totalPax, porVendedor };
  }, [reservas]);

  const exportCSV = () => {
    const rows = [
      ["Fecha", "ID", "Cliente", "Tipo", "Pax", "Total", "Vendedor", "Canal", "Estado", "Notas"],
      ...reservas.map(r => [
        r.fecha || "",
        r.id,
        r.nombre || "",
        r.tipo || "",
        r.pax || 0,
        r.total || 0,
        r.vendedor || "",
        r.canal || "",
        r.estado || "",
        (r.notas || "").replace(/[\n,]/g, " "),
      ]),
    ];
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cortesias_${fechaIni}_${fechaFin}.csv`;
    a.click();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={LS}>Desde</label>
          <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)} style={IS} />
        </div>
        <div>
          <label style={LS}>Hasta</label>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={IS} />
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={exportCSV} disabled={reservas.length === 0} style={{ ...BTN(B.sand), color: B.navy }}>
          📥 Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Cortesías (reservas)", val: reservas.length, color: B.sand },
          { label: "Pax entregados",       val: stats.totalPax,  color: B.sky },
          { label: "Monto total cortesía", val: COP(stats.totalCortesia), color: B.warning, small: true },
          { label: "Vendedores involucrados", val: Object.keys(stats.porVendedor).length, color: B.success },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navy, borderRadius: 12, padding: "16px 20px", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: k.small ? 20 : 28, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Desglose por vendedor */}
      {Object.keys(stats.porVendedor).length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Por vendedor</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {Object.entries(stats.porVendedor).sort((a, b) => b[1].monto - a[1].monto).map(([v, s]) => (
              <div key={v} style={{ background: B.navy, borderRadius: 10, padding: "12px 14px", border: `1px solid ${B.navyLight}` }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                  {s.count} cortesía{s.count !== 1 ? "s" : ""} · {s.pax} pax
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{COP(s.monto)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : reservas.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎁</div>
          <div>Sin cortesías en el periodo</div>
        </div>
      ) : (
        <div style={{ background: B.navy, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: B.navyMid }}>
                  {["Fecha", "ID", "Cliente", "Tipo", "Pax", "Total", "Vendedor", "Canal", "Estado"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reservas.map(r => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                    <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.fecha || "—"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>{r.id}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600 }}>{r.nombre}</td>
                    <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{r.tipo}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: B.sky, fontWeight: 700 }}>{r.pax}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: B.sand, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(r.total)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{r.vendedor || "—"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{r.canal || "—"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 10 }}>{r.estado || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTE: TRANSACCIONES — todos los pagos procesados con filtro por proveedor
// ═══════════════════════════════════════════════════════════════════════════
function ReservaDetailModal({ reservaId, onClose }) {
  const [data, setData] = useState(null);
  const [salida, setSalida] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!reservaId || !supabase) return;
    setLoading(true);
    (async () => {
      const { data: r } = await supabase.from("reservas").select("*").eq("id", reservaId).maybeSingle();
      setData(r);
      if (r?.salida_id) {
        const { data: s } = await supabase.from("salidas").select("nombre, hora, hora_regreso").eq("id", r.salida_id).maybeSingle();
        setSalida(s);
      }
      setLoading(false);
    })();
  }, [reservaId]);

  const pagos = Array.isArray(data?.pagos) ? data.pagos : [];
  const fmtDate = (d) => {
    if (!d) return "—";
    const s = String(d);
    // Si viene solo fecha (YYYY-MM-DD) sin hora — mostrar solo fecha
    if (s.length === 10) {
      return new Date(s + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
    }
    return new Date(s).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navy, borderRadius: 14, maxWidth: 720, width: "100%", padding: 24, margin: "40px auto", color: "#fff", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: B.sand, textTransform: "uppercase", fontWeight: 700 }}>Reserva</div>
            <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#fff" }}>{reservaId}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 24, cursor: "pointer" }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
        ) : !data ? (
          <div style={{ padding: 40, textAlign: "center", color: B.danger }}>No se encontró la reserva</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: 20 }}>
              {[
                ["Cliente", data.nombre],
                ["Contacto", [data.contacto, data.telefono].filter(Boolean).join(" · ") || data.email],
                ["Email", data.email],
                ["Fecha visita", (() => {
                  const base = fmtDate(data.fecha);
                  const h = data.hora_llegada || salida?.hora;
                  const r = salida?.hora_regreso;
                  if (!h) return base;
                  return `${base} · ${h.slice(0,5)}${r ? ` - ${r.slice(0,5)}` : ""}`;
                })()],
                ["Tipo", data.tipo],
                ["Canal", data.canal],
                ["Vendedor", data.vendedor],
                ["Estado", data.estado],
                ["Pax", [data.pax && `${data.pax} total`, data.pax_a && `${data.pax_a}A`, data.pax_n && `${data.pax_n}N`].filter(Boolean).join(" · ")],
                ["Salida", data.salida],
              ].map(([k, v]) => v ? (
                <div key={k}>
                  <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{k}</div>
                  <div style={{ fontSize: 13, color: "#fff" }}>{String(v)}</div>
                </div>
              ) : null)}
            </div>

            <div style={{ background: B.navyMid, borderRadius: 10, padding: "14px 18px", marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {[
                ["Total", data.total, B.sand],
                ["Abono", data.abono, B.success],
                ["Saldo", data.saldo, data.saldo > 0 ? B.warning : B.success],
              ].map(([k, v, col]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 700 }}>{k}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: col, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(Number(v) || 0)}</div>
                </div>
              ))}
            </div>

            {pagos.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
                  Pagos registrados ({pagos.length})
                </div>
                <div style={{ background: B.navyMid, borderRadius: 8, overflow: "hidden" }}>
                  {pagos.map((p, i) => (
                    <div key={i} style={{ padding: "8px 14px", borderBottom: i < pagos.length - 1 ? `1px solid ${B.navyLight}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.forma_pago || "—"} {p.es_cortesia && "🎁"}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{(p.fecha || "").slice(0,10)} · {p.id || p.reference_id || "—"}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: B.success }}>{COP(Number(p.monto) || 0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.notas && (
              <div style={{ background: B.navyMid, padding: "10px 14px", borderRadius: 8, borderLeft: `3px solid ${B.sand}`, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Notas</div>
                <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{data.notas}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.6)", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Cerrar</button>
              <button onClick={() => {
                window.history.pushState({}, "", `/?modulo=reservas&reserva=${encodeURIComponent(reservaId)}`);
                window.dispatchEvent(new PopStateEvent("popstate"));
              }} style={{ padding: "9px 16px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                Abrir en Reservas →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// Canoniza el proveedor de pago para que variantes de capitalización
// (ej. "wompi" vs "Wompi") no salgan como filas/tarjetas separadas.
function normProveedor(raw) {
  const k = String(raw || "").trim().toLowerCase();
  if (!k) return "Otro";
  if (k === "wompi")                                  return "Wompi";
  if (k === "zoho_pay" || k === "zoho" || k === "zohopay") return "zoho_pay";
  if (k === "stripe")                                 return "stripe";
  if (k === "efectivo" || k === "cash")               return "Efectivo";
  if (k === "transferencia" || k === "transfer")      return "Transferencia";
  if (k === "datafono" || k === "datáfono")           return "Datafono";
  if (k === "sky")                                    return "SKY";
  if (k === "cxc")                                    return "CXC";
  if (k === "cortesía" || k === "cortesia")           return "Cortesía";
  return String(raw).trim();
}

function ReporteTransacciones() {
  const [fechaIni, setFechaIni] = useState(firstOfMonth());
  const [fechaFin, setFechaFin] = useState(todayStr());
  const [proveedor, setProveedor] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [transacciones, setTransacciones] = useState([]);
  const [openReservaId, setOpenReservaId] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    // Reservas con pago realizado en el rango (por fecha_pago O por created_at si no tiene fecha_pago)
    const { data: resRows } = await supabase
      .from("reservas")
      .select("id, fecha, fecha_pago, nombre, email, contacto, total, abono, forma_pago, canal, estado, created_at, pagos, aliado_id")
      .gt("abono", 0)
      .neq("estado", "cancelado")
      .order("fecha_pago", { ascending: false, nullsFirst: false });

    const list = [];
    (resRows || []).forEach(r => {
      const pagos = Array.isArray(r.pagos) && r.pagos.length > 0 ? r.pagos : null;
      if (pagos) {
        // Una transacción por cada entrada en pagos[]
        pagos.forEach(p => {
          const fecha = (p.fecha || r.fecha_pago || r.created_at?.slice(0, 10) || "").slice(0, 10);
          if (fecha < fechaIni || fecha > fechaFin) return;
          list.push({
            fecha,
            reserva_id: r.id,
            cliente: r.nombre,
            email: r.email || r.contacto || "—",
            monto: Number(p.monto) || 0,
            proveedor: normProveedor(p.forma_pago || "Otro"),
            canal: r.canal,
            reference: p.id || p.reference_id || "—",
            estado: r.estado,
            es_cortesia: !!p.es_cortesia,
          });
        });
      } else {
        const fecha = (r.fecha_pago || r.created_at?.slice(0, 10) || "").slice(0, 10);
        if (fecha < fechaIni || fecha > fechaFin) return;
        list.push({
          fecha,
          reserva_id: r.id,
          cliente: r.nombre,
          email: r.email || r.contacto || "—",
          monto: Number(r.abono) || 0,
          proveedor: normProveedor(r.forma_pago || "Otro"),
          canal: r.canal,
          reference: "—",
          estado: r.estado,
          es_cortesia: r.forma_pago === "Cortesía",
        });
      }
    });
    setTransacciones(list);
    setLoading(false);
  }, [fechaIni, fechaFin]);
  useEffect(() => { load(); }, [load]);

  // Filtro por proveedor
  const filtered = useMemo(() => {
    if (proveedor === "todos") return transacciones;
    return transacciones.filter(t => (t.proveedor || "").toLowerCase() === proveedor.toLowerCase());
  }, [transacciones, proveedor]);

  // Stats por proveedor
  const stats = useMemo(() => {
    const m = {};
    transacciones.forEach(t => {
      const k = t.proveedor || "Otro";
      if (!m[k]) m[k] = { count: 0, monto: 0, cortesias: 0, montoCortesias: 0 };
      m[k].count += 1;
      if (t.es_cortesia) {
        m[k].cortesias += 1;
        m[k].montoCortesias += t.monto;
      } else {
        m[k].monto += t.monto;
      }
    });
    return Object.entries(m).sort((a, b) => b[1].monto - a[1].monto);
  }, [transacciones]);

  const totalMonto = filtered.reduce((s, t) => s + (t.es_cortesia ? 0 : t.monto), 0);
  const totalCount = filtered.filter(t => !t.es_cortesia).length;

  const proveedorColor = (p) => {
    const k = (p || "").toLowerCase();
    if (k === "wompi")            return "#00D4B1";
    if (k === "zoho_pay")         return "#E41E26";
    if (k === "stripe")           return "#635BFF";
    if (k === "efectivo")         return B.success;
    if (k === "transferencia")    return B.sky;
    if (k === "datafono")         return B.warning;
    if (k === "sky")              return "#A78BFA";
    if (k === "cxc")              return B.pink;
    if (k === "cortesía")         return B.sand;
    return "rgba(255,255,255,0.4)";
  };

  const proveedorLabel = (p) => {
    const k = (p || "").toLowerCase();
    if (k === "zoho_pay") return "Zoho Pay";
    return p || "—";
  };

  const exportCSV = () => {
    const rows = [["Fecha", "Reserva", "Cliente", "Email", "Monto", "Proveedor", "Canal", "Referencia", "Estado", "Cortesía"]];
    filtered.forEach(t => {
      rows.push([t.fecha, t.reserva_id, t.cliente, t.email, t.monto, t.proveedor, t.canal, t.reference, t.estado, t.es_cortesia ? "Sí" : "No"]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transacciones_${fechaIni}_${fechaFin}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Filtros */}
      <div style={{ background: B.navyMid, padding: "16px 20px", borderRadius: 10, marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <div style={{ minWidth: 150 }}>
          <label style={LS}>Desde</label>
          <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)} style={IS} />
        </div>
        <div style={{ minWidth: 150 }}>
          <label style={LS}>Hasta</label>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={IS} />
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={LS}>Proveedor</label>
          <select value={proveedor} onChange={e => setProveedor(e.target.value)} style={IS}>
            <option value="todos">Todos</option>
            <option value="Wompi">Wompi</option>
            <option value="zoho_pay">Zoho Pay</option>
            <option value="stripe">Stripe</option>
            <option value="Efectivo">Efectivo</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Datafono">Datáfono</option>
            <option value="SKY">SKY</option>
            <option value="CXC">CXC</option>
            <option value="Cortesía">Cortesía</option>
          </select>
        </div>
        <button onClick={exportCSV} disabled={filtered.length === 0} style={{ ...BTN(B.success), opacity: filtered.length === 0 ? 0.4 : 1 }}>
          📥 Exportar CSV
        </button>
      </div>

      {/* Stats por proveedor */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 18 }}>
        {stats.map(([p, s]) => (
          <div key={p} onClick={() => setProveedor(proveedor === p ? "todos" : p)}
            style={{ background: B.navyMid, borderLeft: `4px solid ${proveedorColor(p)}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", opacity: proveedor !== "todos" && proveedor !== p ? 0.4 : 1 }}>
            <div style={{ fontSize: 11, color: proveedorColor(p), textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
              {proveedorLabel(p)}
            </div>
            <div style={{ fontSize: 20, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: "#fff" }}>
              {COP(s.monto)}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {s.count} {s.count === 1 ? "transacción" : "transacciones"}
              {s.cortesias > 0 && <span style={{ color: B.sand, marginLeft: 6 }}>· {s.cortesias} cortesía{s.cortesias !== 1 ? "s" : ""}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* KPIs totales */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, padding: "14px 18px", background: B.navyMid, borderRadius: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Transacciones</div>
          <div style={{ fontSize: 24, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.white }}>{totalCount}</div>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Monto Total</div>
          <div style={{ fontSize: 24, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.success }}>{COP(totalMonto)}</div>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Promedio</div>
          <div style={{ fontSize: 20, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.sky }}>
            {totalCount > 0 ? COP(totalMonto / totalCount) : "—"}
          </div>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: B.sand }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)", background: B.navyMid, borderRadius: 10 }}>
          Sin transacciones en el rango seleccionado
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          <div style={{ overflowX: "auto", maxHeight: 600 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ position: "sticky", top: 0, background: B.navyLight }}>
                <tr>
                  {["Fecha", "Reserva", "Cliente", "Monto", "Proveedor", "Canal", "Referencia", "Estado"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={i}
                    onClick={() => setOpenReservaId(t.reserva_id)}
                    style={{ borderBottom: `1px solid ${B.navyLight}40`, cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.background = B.navyLight + "55"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "8px 12px", fontSize: 12 }}>{t.fecha}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: B.sand, textDecoration: "underline" }}>{t.reserva_id}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ fontWeight: 600 }}>{t.cliente}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{t.email}</div>
                    </td>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: t.es_cortesia ? B.sand : B.success }}>
                      {t.es_cortesia ? `${COP(t.monto)} 🎁` : COP(t.monto)}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, background: proveedorColor(t.proveedor) + "22", color: proveedorColor(t.proveedor), fontSize: 10, fontWeight: 700 }}>
                        {proveedorLabel(t.proveedor)}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{t.canal || "—"}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                      {t.reference !== "—" ? String(t.reference).slice(0, 18) : "—"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: t.estado === "confirmado" ? B.success + "22" : B.navyLight, color: t.estado === "confirmado" ? B.success : "rgba(255,255,255,0.5)", fontWeight: 600 }}>
                        {t.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            Mostrando {filtered.length} de {transacciones.length} transacciones · Click en una fila para ver la reserva
          </div>
        </div>
      )}

      {openReservaId && <ReservaDetailModal reservaId={openReservaId} onClose={() => setOpenReservaId(null)} />}
    </div>
  );
}
