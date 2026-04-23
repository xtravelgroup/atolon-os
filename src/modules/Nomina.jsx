// Nómina — Lista de empleados sincronizados desde Loggro Nómina
// Data: tabla `empleados_loggro` (populada por Edge Function loggro-nomina-sync).

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";

const SYNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-nomina-sync`;

const IS = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${B.navyLight}`,
  color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box",
};

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{
      background: B.navyMid, borderRadius: 12, padding: "16px 20px",
      borderLeft: `4px solid ${color || B.sand}`, minWidth: 200, flex: "1 1 200px",
    }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: B.white }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Nomina() {
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activo");
  const [filtroArea, setFiltroArea] = useState("todas");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [selected, setSelected] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase.from("empleados_loggro").select("*").order("nombre_completo");
    setEmpleados(data || []);
    const { data: syncLog } = await supabase.from("loggro_nomina_sync_log")
      .select("*").order("ts", { ascending: false }).limit(1).maybeSingle();
    setLastSync(syncLog);
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const sync = async (enriquecer = false) => {
    setSyncing(true);
    setSyncMsg("Sincronizando...");
    try {
      const url = `${SYNC_URL}/sync-vinculados${enriquecer ? "?enriquecer=1" : ""}`;
      const res = await window.fetch(url, { method: "POST" });
      const r = await res.json();
      if (r.ok) {
        setSyncMsg(`✓ ${r.nuevos} nuevos, ${r.actualizados} actualizados (${r.total} total)`);
        await fetch();
      } else {
        setSyncMsg("✗ " + (r.error || "error"));
      }
    } catch (e) {
      setSyncMsg("✗ " + e.message);
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(""), 6000);
  };

  const areas = useMemo(() => {
    const s = new Set(empleados.map(e => e.departamento).filter(Boolean));
    return ["todas", ...Array.from(s).sort()];
  }, [empleados]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return empleados.filter(e => {
      if (filtroEstado !== "todos" && e.estado !== filtroEstado) return false;
      if (filtroArea !== "todas" && e.departamento !== filtroArea) return false;
      if (!q) return true;
      return [e.nombre_completo, e.documento, e.cargo, e.email, e.departamento, e.centro_costo]
        .filter(Boolean).some(v => v.toString().toLowerCase().includes(q));
    });
  }, [empleados, search, filtroEstado, filtroArea]);

  const kpis = useMemo(() => {
    const activos = empleados.filter(e => e.estado === "activo");
    const retirados = empleados.filter(e => e.estado === "retirado");
    // Salarios desglosados: integrales vs ordinarios (los integrales NO llevan factor prestacional)
    const totalOrdinarios = activos
      .filter(e => (e.tipo_salario || "Ordinario").toLowerCase() !== "integral")
      .reduce((s, e) => s + (Number(e.salario_base) || 0), 0);
    const totalIntegrales = activos
      .filter(e => (e.tipo_salario || "").toLowerCase() === "integral")
      .reduce((s, e) => s + (Number(e.salario_base) || 0), 0);
    const totalSalario = totalOrdinarios + totalIntegrales;
    // Factor prestacional Colombia ≈ 52% sobre salarios ordinarios
    // (Salud 8.5 + Pensión 12 + Cesantías 8.33 + Intereses 1 + Prima 8.33 + Vacaciones 4.17 + Caja 4 + ICBF 3 + SENA 2 + ARL ~0.52)
    const factorPrestacional = 0.52;
    const costoSocial = Math.round(totalOrdinarios * factorPrestacional);
    const costoTotalEmpresa = totalSalario + costoSocial;
    const areasUnicas = new Set(activos.map(e => e.departamento).filter(Boolean)).size;
    return {
      activos: activos.length, retirados: retirados.length,
      totalSalario, totalOrdinarios, totalIntegrales,
      costoSocial, costoTotalEmpresa, areasUnicas,
    };
  }, [empleados]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: B.sand }}>Cargando empleados...</div>;
  }

  return (
    <div>
      {/* Header actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: B.white, margin: 0 }}>Nómina</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {empleados.length} empleados sincronizados desde Loggro Nómina
            {lastSync && ` · Última sync: ${new Date(lastSync.ts).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {syncMsg && <span style={{ fontSize: 12, color: syncMsg.startsWith("✓") ? B.success : syncMsg.startsWith("✗") ? B.danger : B.sand }}>{syncMsg}</span>}
          <button onClick={() => sync(false)} disabled={syncing}
            style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: syncing ? B.navyLight : B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: syncing ? "default" : "pointer" }}>
            {syncing ? "Sincronizando..." : "↻ Sincronizar"}
          </button>
          <button onClick={() => sync(true)} disabled={syncing} title="Intenta traer salarios y detalles individuales (requiere permisos en Loggro)"
            style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${B.sand}55`, background: "transparent", color: B.sand, fontSize: 12, fontWeight: 600, cursor: syncing ? "default" : "pointer" }}>
            💰 Sync con salarios
          </button>
        </div>
      </div>

      {/* KPIs: conteos */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Kpi label="Activos"   value={kpis.activos}   sub="con contrato vigente" color={B.success} />
        <Kpi label="Retirados" value={kpis.retirados} sub="contratos finalizados" color="rgba(255,255,255,0.3)" />
        <Kpi label="Áreas"     value={kpis.areasUnicas} sub="con personal" color={B.sky} />
      </div>

      {/* KPIs: costos */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Kpi label="Nómina base mensual"
          value={kpis.totalSalario > 0 ? COP(kpis.totalSalario) : "—"}
          sub={kpis.totalIntegrales > 0 ? `${COP(kpis.totalOrdinarios)} ord · ${COP(kpis.totalIntegrales)} integral` : "salarios base activos"}
          color={B.sand} />
        <Kpi label="Costo social (52%)"
          value={kpis.costoSocial > 0 ? COP(kpis.costoSocial) : "—"}
          sub="prestaciones + parafiscales + seg. social"
          color={B.warning} />
        <Kpi label="Costo total empresa"
          value={kpis.costoTotalEmpresa > 0 ? COP(kpis.costoTotalEmpresa) : "—"}
          sub="nómina + costo social"
          color={B.pink} />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          placeholder="🔍 Buscar por nombre, documento, cargo, email…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...IS, flex: "2 1 260px" }}
        />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...IS, flex: "0 0 140px" }}>
          <option value="activo">Activos</option>
          <option value="retirado">Retirados</option>
          <option value="todos">Todos</option>
        </select>
        <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)} style={{ ...IS, flex: "0 0 200px" }}>
          {areas.map(a => <option key={a} value={a}>{a === "todas" ? "Todas las áreas" : a}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: B.navyLight }}>
                {["Empleado", "Documento", "Cargo", "Centro de costo", "Área", "Contrato", "Inicio", "Salario base", "Estado"].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.35)" }}>
                  {empleados.length === 0 ? "Aún no se ha sincronizado. Click en 'Sincronizar'." : "Sin coincidencias"}
                </td></tr>
              )}
              {filtered.map(e => (
                <tr key={e.id} onClick={() => setSelected(e)} style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer" }}
                  onMouseEnter={ev => ev.currentTarget.style.background = B.navyLight}
                  onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600 }}>{e.nombre_completo || `${e.nombres} ${e.apellidos}`}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{e.email || "—"}</div>
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{e.tipo_documento || "CC"} {e.documento}</td>
                  <td style={{ padding: "12px 14px" }}>{e.cargo || "—"}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{e.centro_costo || "—"}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{e.departamento || "—"}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12 }}>{e.tipo_contrato || "—"}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12 }}>{e.fecha_ingreso || "—"}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, fontWeight: 600, color: e.salario_base > 0 ? B.sand : "rgba(255,255,255,0.3)" }}>
                    {e.salario_base > 0 ? COP(e.salario_base) : "—"}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{
                      fontSize: 10, padding: "3px 10px", borderRadius: 20,
                      background: e.estado === "activo" ? B.success + "33" : "rgba(255,255,255,0.08)",
                      color: e.estado === "activo" ? B.success : "rgba(255,255,255,0.5)",
                      fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                    }}>{e.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          Mostrando {filtered.length} de {empleados.length} empleados
        </div>
      </div>

      {/* Modal detalle */}
      {selected && <DetalleModal emp={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DetalleModal({ emp, onClose }) {
  const rows = [
    ["Nombre completo",  emp.nombre_completo || `${emp.nombres || ""} ${emp.apellidos || ""}`.trim()],
    ["Documento",        `${emp.tipo_documento || "CC"} ${emp.documento || "—"}`],
    ["Email",            emp.email],
    ["Teléfono",         emp.telefono],
    ["Cargo",            emp.cargo],
    ["Centro de costo",  emp.centro_costo],
    ["Área / Dept.",     emp.departamento],
    ["Tipo contrato",    emp.tipo_contrato],
    ["Tipo salario",     emp.tipo_salario],
    ["Fecha ingreso",    emp.fecha_ingreso],
    ["Fecha retiro",     emp.fecha_retiro],
    ["Salario base",     emp.salario_base > 0 ? COP(emp.salario_base) : null],
    ["Método de pago",   emp.metodo_pago],
    ["Banco",            emp.banco],
    ["Cuenta bancaria",  emp.cuenta_bancaria],
    ["EPS",              emp.eps],
    ["Fondo pensión",    emp.fondo_pension],
    ["Fondo cesantías",  emp.fondo_cesantias],
    ["ARL",              emp.arl],
    ["Caja compensación", emp.caja_compensacion],
    ["ID Loggro",        emp.loggro_id],
  ].filter(([, v]) => v != null && v !== "");

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, width: 560, maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Empleado</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: B.white }}>
              {emp.nombre_completo}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              {emp.cargo || "—"} · {emp.departamento || "—"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "16px 24px" }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${B.navyLight}40`, fontSize: 13 }}>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>{k}</span>
              <span style={{ color: B.white, fontWeight: 500, textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>{v}</span>
            </div>
          ))}
          {emp.raw_payload && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ cursor: "pointer", fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Payload raw de Loggro</summary>
              <pre style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", background: B.navy, padding: 12, borderRadius: 6, overflowX: "auto", marginTop: 8, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(emp.raw_payload, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
