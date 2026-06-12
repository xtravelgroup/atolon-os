// AuditLog — visor del log de auditoría de cambios sensibles.
//
// Backend: tabla public.audit_log poblada por trigger genérico
// public.audit_log_trigger() aplicado a 10 tablas críticas
// (requisiciones, ordenes_compra, proveedores, cotizaciones,
// cajas_evento_ventas, pool_service_pedidos, empleados, usuarios,
// roles, eventos, pagos).
//
// Cada UPDATE/INSERT/DELETE en esas tablas se registra con:
//   - tabla, row_id, accion, cambios (diff jsonb), fila_before/after
//   - usuario_email del JWT (si vino de PostgREST), created_at
//
// La tabla es append-only: UPDATE y DELETE están revocados a nivel
// de privilegios PostgreSQL, así que ni siquiera un usuario malicioso
// con sesión válida puede borrar evidencia.

import { useEffect, useMemo, useState } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const TABLAS_LABEL = {
  requisiciones:        "Requisiciones",
  ordenes_compra:       "Órdenes de Compra",
  cotizaciones:         "Cotizaciones",
  proveedores:          "Proveedores",
  cajas_evento_ventas:  "Ventas Cajas Express",
  pool_service_pedidos: "Pool Service",
  empleados:            "Empleados",
  usuarios:             "Usuarios del sistema",
  roles:                "Roles",
  eventos:              "Eventos",
  pagos:                "Pagos",
};

const ACCION_COLOR = {
  INSERT: "#22c55e",
  UPDATE: "#3b82f6",
  DELETE: "#ef4444",
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "medium" });
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tablaFiltro, setTablaFiltro] = useState("");
  const [usuarioFiltro, setUsuarioFiltro] = useState("");
  const [accionFiltro, setAccionFiltro] = useState("");
  const [rango, setRango] = useState("7d"); // 24h | 7d | 30d | all
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    setLoading(true);

    let q = supabase
      .from("audit_log")
      .select("id, tabla, row_id, accion, cambios, usuario_email, contexto, created_at, fila_before, fila_after")
      .order("created_at", { ascending: false })
      .limit(500);

    // Rango
    if (rango !== "all") {
      const horas = rango === "24h" ? 24 : rango === "7d" ? 24 * 7 : 24 * 30;
      const desde = new Date(Date.now() - horas * 3600 * 1000).toISOString();
      q = q.gte("created_at", desde);
    }
    if (tablaFiltro)   q = q.eq("tabla", tablaFiltro);
    if (accionFiltro)  q = q.eq("accion", accionFiltro);
    if (usuarioFiltro) q = q.ilike("usuario_email", `%${usuarioFiltro}%`);

    q.then(({ data }) => {
      setLogs(data || []);
      setLoading(false);
    });
  }, [tablaFiltro, usuarioFiltro, accionFiltro, rango]);

  const kpis = useMemo(() => {
    const k = { total: logs.length, ins: 0, upd: 0, del: 0, usuarios: new Set() };
    logs.forEach(l => {
      if (l.accion === "INSERT") k.ins++;
      if (l.accion === "UPDATE") k.upd++;
      if (l.accion === "DELETE") k.del++;
      if (l.usuario_email) k.usuarios.add(l.usuario_email);
    });
    return { ...k, usuariosCount: k.usuarios.size };
  }, [logs]);

  return (
    <div style={{ padding: 24, color: "#fff", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: B.sand, letterSpacing: "0.2em", fontWeight: 700 }}>
          ATOLÓN · CONTROL INTERNO
        </div>
        <h2 style={{ margin: "4px 0 4px", fontSize: 26, fontWeight: 900, letterSpacing: "-0.01em" }}>
          📋 Audit Log · Trazabilidad de Cambios
        </h2>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          Registro append-only de toda creación, modificación o eliminación en tablas críticas.
          Cumple control interno SOX-404 / NIA 315. La tabla está protegida — nadie puede borrar entradas.
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Kpi label="EVENTOS" valor={kpis.total} color="#fff" />
        <Kpi label="CREACIONES" valor={kpis.ins} color={ACCION_COLOR.INSERT} />
        <Kpi label="MODIFICACIONES" valor={kpis.upd} color={ACCION_COLOR.UPDATE} />
        <Kpi label="ELIMINACIONES" valor={kpis.del} color={ACCION_COLOR.DELETE} />
        <Kpi label="USUARIOS DISTINTOS" valor={kpis.usuariosCount} color={B.sky} />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={rango} onChange={e => setRango(e.target.value)} style={SEL}>
          <option value="24h">Últimas 24h</option>
          <option value="7d">Últimos 7 días</option>
          <option value="30d">Últimos 30 días</option>
          <option value="all">Todo</option>
        </select>
        <select value={tablaFiltro} onChange={e => setTablaFiltro(e.target.value)} style={SEL}>
          <option value="">Todas las tablas</option>
          {Object.entries(TABLAS_LABEL).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <select value={accionFiltro} onChange={e => setAccionFiltro(e.target.value)} style={SEL}>
          <option value="">Cualquier acción</option>
          <option value="INSERT">Solo creaciones</option>
          <option value="UPDATE">Solo modificaciones</option>
          <option value="DELETE">Solo eliminaciones</option>
        </select>
        <input value={usuarioFiltro} onChange={e => setUsuarioFiltro(e.target.value)}
          placeholder="Buscar por email del usuario…"
          style={{ ...SEL, minWidth: 240, flex: "1 1 240px" }} />
      </div>

      {/* Lista */}
      <div style={{
        background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 10,
        overflow: "hidden",
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
            Sin eventos en este rango / filtros.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "150px 90px 1fr 200px 180px 28px", gap: 10,
              padding: "10px 14px", background: B.navyLight, fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", fontWeight: 700 }}>
              <div>FECHA</div>
              <div>ACCIÓN</div>
              <div>TABLA · REGISTRO</div>
              <div>USUARIO</div>
              <div>CONTEXTO</div>
              <div></div>
            </div>
            {logs.map(l => (
              <div key={l.id}>
                <div onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                  style={{
                    display: "grid", gridTemplateColumns: "150px 90px 1fr 200px 180px 28px", gap: 10,
                    padding: "10px 14px", borderTop: `1px solid ${B.navyLight}`,
                    fontSize: 12, cursor: "pointer",
                  }}>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontFamily: "monospace", fontSize: 11 }}>{fmtDate(l.created_at)}</div>
                  <div>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                      padding: "2px 8px", borderRadius: 6,
                      background: ACCION_COLOR[l.accion] + "22",
                      color: ACCION_COLOR[l.accion],
                    }}>{l.accion}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{TABLAS_LABEL[l.tabla] || l.tabla}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
                      {l.row_id}
                    </div>
                  </div>
                  <div style={{ color: l.usuario_email ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)", fontSize: 11 }}>
                    {l.usuario_email || "—  (sin JWT)"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "monospace" }}>
                    {l.contexto || "—"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, textAlign: "right" }}>
                    {expandedId === l.id ? "▾" : "▸"}
                  </div>
                </div>
                {expandedId === l.id && (
                  <div style={{
                    background: "rgba(0,0,0,0.25)", padding: "14px 18px",
                    borderTop: `1px solid ${B.navyLight}`,
                    fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.75)",
                  }}>
                    {l.accion === "UPDATE" && l.cambios && (
                      <DiffView cambios={l.cambios} />
                    )}
                    {l.accion === "INSERT" && (
                      <details>
                        <summary style={{ cursor: "pointer", marginBottom: 6, color: ACCION_COLOR.INSERT, fontWeight: 700 }}>
                          Registro creado (toggle JSON completo)
                        </summary>
                        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                          {JSON.stringify(l.fila_after, null, 2)}
                        </pre>
                      </details>
                    )}
                    {l.accion === "DELETE" && (
                      <details>
                        <summary style={{ cursor: "pointer", marginBottom: 6, color: ACCION_COLOR.DELETE, fontWeight: 700 }}>
                          Registro eliminado (toggle JSON completo)
                        </summary>
                        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                          {JSON.stringify(l.fila_before, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
        Mostrando hasta 500 eventos · Retención sugerida 7 años (norma fiscal Colombia)
      </div>
    </div>
  );
}

function DiffView({ cambios }) {
  const keys = Object.keys(cambios || {});
  if (keys.length === 0) return <div style={{ color: "rgba(255,255,255,0.4)" }}>Sin diff registrado.</div>;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {keys.map(k => {
        const { before, after } = cambios[k] || {};
        const fmt = (v) => {
          if (v === null || v === undefined) return "∅";
          if (typeof v === "object") return JSON.stringify(v);
          return String(v);
        };
        return (
          <div key={k} style={{
            display: "grid", gridTemplateColumns: "160px 1fr 1fr",
            gap: 12, padding: "6px 0", borderBottom: "1px dashed rgba(255,255,255,0.08)",
            alignItems: "baseline",
          }}>
            <div style={{ color: B.sand, fontWeight: 700, fontSize: 11 }}>{k}</div>
            <div style={{ color: "#fca5a5", fontSize: 11, wordBreak: "break-all" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", marginRight: 6 }}>antes:</span>
              {fmt(before)}
            </div>
            <div style={{ color: "#86efac", fontSize: 11, wordBreak: "break-all" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", marginRight: 6 }}>después:</span>
              {fmt(after)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, valor, color }) {
  return (
    <div style={{
      background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8,
      padding: "12px 14px",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.16em", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {valor}
      </div>
    </div>
  );
}

const SEL = {
  padding: "8px 12px", fontSize: 13, fontWeight: 600,
  background: B.navy, color: "#fff",
  border: `1px solid ${B.navyLight}`, borderRadius: 8,
  outline: "none",
};
