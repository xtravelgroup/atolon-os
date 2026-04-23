// Panel admin del módulo Contratistas — Fase 5.
// Kanban + tabla + detalle + bitácora + acciones de workflow.

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive";
import { ContratistasWizardAsistido } from "./ContratistasPortal";
import KanbanCard from "./contratistas/admin/KanbanCard";
import DetailModal from "./contratistas/admin/DetailModal";

// Pipeline: contratistas en proceso (no aprobados aún ni vencidos)
const PIPELINE_COLUMNS = [
  { k: "radicado",    label: "Radicados",    color: B.sky,     accent: "rgba(142,202,230,0.08)" },
  { k: "en_revision", label: "En revisión",  color: B.warning, accent: "rgba(232,160,32,0.08)"  },
  { k: "devuelto",    label: "Devueltos",    color: "#F97316", accent: "rgba(249,115,22,0.08)"  },
  { k: "rechazado",   label: "Rechazados",   color: B.danger,  accent: "rgba(214,69,69,0.08)"   },
];

const PIPELINE_ESTADOS = PIPELINE_COLUMNS.map(c => c.k);
const APROBADOS_ESTADOS = ["aprobado", "vencido"];

const ESTADO_COLOR = {
  borrador: "rgba(255,255,255,0.3)",
  radicado: B.sky,
  en_revision: B.warning,
  devuelto: "#F97316",
  aprobado: B.success,
  rechazado: B.danger,
  activo: B.sand,
  cerrado: "rgba(255,255,255,0.4)",
  vencido: B.pink,
};

const ESTADO_LABEL = {
  borrador: "Borrador",
  radicado: "Radicado",
  en_revision: "En revisión",
  devuelto: "Devuelto",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  activo: "Activo",
  cerrado: "Cerrado",
  vencido: "Vencido",
};

function fmt(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function isPilaVigente(fechaPila) {
  if (!fechaPila) return null;
  try {
    const diffDays = (Date.now() - new Date(fechaPila).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 45;
  } catch { return null; }
}

function exportCSV(filename, rows) {
  const csv = rows.map(row => row.map(c => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function ContratistasAdmin() {
  const { isMobile } = useBreakpoint();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pipeline"); // "pipeline" | "aprobados"
  const [view, setView] = useState("kanban"); // "kanban" | "table" (solo en pipeline)
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("todos"); // "todos" | "empresa" | "natural"
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState("submitted_at");
  const [sortDir, setSortDir] = useState("desc");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [workerCounts, setWorkerCounts] = useState({}); // { contratista_id: count }
  const [activeWorkersCount, setActiveWorkersCount] = useState(0);
  const [ingresosByContratista, setIngresosByContratista] = useState({}); // { id: { count, last, permitidos, rechazados } }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAdminUser(data?.user || null));
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contratistas")
      .select("id, radicado, tipo, estado, nombre_display, contacto_principal_email, contacto_principal_cel, fecha_inicio, fecha_fin, submitted_at, created_at, num_trabajadores, emp_fecha_pila")
      .order("submitted_at", { ascending: false, nullsFirst: false });
    if (error) console.error(error);
    const list = data || [];
    setRows(list);

    // Count trabajadores per contratista + activos totales
    const ids = list.map(r => r.id);
    if (ids.length) {
      const { data: ws } = await supabase
        .from("contratistas_trabajadores")
        .select("id, contratista_id, curso_completado")
        .in("contratista_id", ids);
      const counts = {};
      let active = 0;
      (ws || []).forEach(w => {
        counts[w.contratista_id] = (counts[w.contratista_id] || 0) + 1;
      });
      // Activos: trabajadores pertenecientes a contratistas aprobados
      const aprobadosIds = new Set(list.filter(r => r.estado === "aprobado").map(r => r.id));
      (ws || []).forEach(w => { if (aprobadosIds.has(w.contratista_id)) active++; });
      setWorkerCounts(counts);
      setActiveWorkersCount(active);

      // Ingresos de muelle por contratista (para vista Aprobados)
      const { data: ingresos } = await supabase
        .from("contratistas_ingresos_muelle")
        .select("contratista_id, resultado, created_at")
        .in("contratista_id", ids)
        .order("created_at", { ascending: false });
      const iMap = {};
      (ingresos || []).forEach(ing => {
        const k = ing.contratista_id;
        if (!k) return;
        if (!iMap[k]) iMap[k] = { count: 0, last: null, permitidos: 0, rechazados: 0, advertencias: 0 };
        iMap[k].count += 1;
        if (!iMap[k].last) iMap[k].last = ing.created_at;
        if (ing.resultado === "permitido") iMap[k].permitidos += 1;
        else if (ing.resultado === "rechazado") iMap[k].rechazados += 1;
        else if (ing.resultado === "advertencia") iMap[k].advertencias += 1;
      });
      setIngresosByContratista(iMap);
    } else {
      setWorkerCounts({});
      setActiveWorkersCount(0);
      setIngresosByContratista({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59") : null;
    const allowedEstados = tab === "pipeline" ? PIPELINE_ESTADOS : APROBADOS_ESTADOS;
    return rows.filter(r => {
      if (!allowedEstados.includes(r.estado)) return false;
      if (tipoFilter !== "todos" && r.tipo !== tipoFilter) return false;
      if (q) {
        const hay = [r.radicado, r.nombre_display, r.contacto_principal_email, r.contacto_principal_cel]
          .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
        if (!hay) return false;
      }
      const d = r.submitted_at || r.created_at;
      if (from && (!d || new Date(d) < from)) return false;
      if (to && (!d || new Date(d) > to)) return false;
      return true;
    });
  }, [rows, search, tipoFilter, dateFrom, dateTo, tab]);

  const byEstado = useMemo(() => {
    const g = {};
    PIPELINE_COLUMNS.forEach(c => { g[c.k] = []; });
    filtered.forEach(r => {
      if (g[r.estado]) g[r.estado].push(r);
    });
    return g;
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const pendientes = rows.filter(r => ["radicado", "en_revision"].includes(r.estado)).length;
    const aprobados = rows.filter(r => r.estado === "aprobado").length;
    const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const venceSemana = rows.filter(r => {
      if (r.estado !== "aprobado" || !r.fecha_fin) return false;
      const fin = new Date(r.fecha_fin).getTime();
      return fin > 0 && fin <= weekFromNow;
    }).length;
    return { pendientes, aprobados, venceSemana };
  }, [rows]);

  const tableRows = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const va = a[sortKey]; const vb = b[sortKey];
      const na = va == null ? "" : va; const nb = vb == null ? "" : vb;
      if (na < nb) return sortDir === "asc" ? -1 : 1;
      if (na > nb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const downloadCSV = () => {
    const headers = ["Radicado", "Tipo", "Nombre", "Estado", "Email", "Celular", "Fecha inicio", "Fecha fin", "Submitted", "Trabajadores", "PILA vigente"];
    const body = filtered.map(r => [
      r.radicado, r.tipo, r.nombre_display, ESTADO_LABEL[r.estado] || r.estado,
      r.contacto_principal_email, r.contacto_principal_cel,
      r.fecha_inicio, r.fecha_fin,
      r.submitted_at ? new Date(r.submitted_at).toISOString() : "",
      workerCounts[r.id] || 0,
      r.tipo === "empresa" ? (isPilaVigente(r.emp_fecha_pila) === true ? "Sí" : isPilaVigente(r.emp_fecha_pila) === false ? "No" : "—") : "—",
    ]);
    exportCSV(`contratistas_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...body]);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 800, color: B.white, margin: 0 }}>
            🦺 Contratistas
          </h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {rows.length} registros · SST · Decreto 1072/2015
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/contratistas" target="_blank" rel="noreferrer"
            style={{ padding: "10px 14px", borderRadius: 8, background: "transparent", border: `1px solid ${B.sand}`, color: B.sand, fontSize: 11, fontWeight: 700, textDecoration: "none", cursor: "pointer", letterSpacing: 0.5 }}>
            🔗 Portal público
          </a>
          <button onClick={downloadCSV}
            style={{ padding: "10px 14px", borderRadius: 8, background: "transparent", border: `1px solid ${B.sky}`, color: B.sky, fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5 }}>
            ⬇ CSV
          </button>
          <button onClick={() => setWizardOpen(true)}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 12, fontWeight: 800, cursor: "pointer", letterSpacing: 0.5 }}>
            + Registro asistido
          </button>
        </div>
      </div>

      {/* Tab switcher Pipeline / Aprobados */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: `1px solid ${B.navyLight}`, maxWidth: 460 }}>
        {[
          { k: "pipeline", label: "Pipeline", icon: "📥", count: rows.filter(r => PIPELINE_ESTADOS.includes(r.estado)).length, color: B.warning },
          { k: "aprobados", label: "Aprobados · Historial", icon: "✓", count: rows.filter(r => APROBADOS_ESTADOS.includes(r.estado)).length, color: B.success },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{
              flex: 1, padding: "12px 14px",
              background: tab === t.k ? t.color : B.navyMid,
              color: tab === t.k ? B.navy : B.white,
              border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer",
              letterSpacing: 0.6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
            <span style={{ background: tab === t.k ? "rgba(13,27,62,0.15)" : "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
        {tab === "pipeline" ? (
          <>
            <Kpi label="Pendientes de revisión" value={kpis.pendientes} color={B.warning} />
            <Kpi label="Radicados" value={rows.filter(r => r.estado === "radicado").length} color={B.sky} />
            <Kpi label="Devueltos" value={rows.filter(r => r.estado === "devuelto").length} color="#F97316" />
            <Kpi label="Rechazados" value={rows.filter(r => r.estado === "rechazado").length} color={B.danger} />
          </>
        ) : (
          <>
            <Kpi label="Aprobados activos" value={kpis.aprobados} color={B.success} />
            <Kpi label="Trabajadores activos" value={activeWorkersCount} color={B.sky} />
            <Kpi label="Vencen esta semana" value={kpis.venceSemana} color={B.pink} />
            <Kpi label="Ingresos registrados" value={Object.values(ingresosByContratista).reduce((s, v) => s + v.count, 0)} color={B.sand} />
          </>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="🔍 Radicado, nombre, email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: "1 1 240px", padding: "10px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none" }}
        />
        <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, outline: "none" }}>
          <option value="todos">Todos los tipos</option>
          <option value="empresa">Empresa</option>
          <option value="natural">Persona natural</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: "10px 10px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, outline: "none", colorScheme: "dark" }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: "10px 10px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 12, outline: "none", colorScheme: "dark" }} />

        {tab === "pipeline" && (
          <div style={{ display: "flex", gap: 0, marginLeft: "auto", borderRadius: 8, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
            <button onClick={() => setView("kanban")}
              style={{ padding: "10px 14px", background: view === "kanban" ? B.sky : B.navyMid, color: view === "kanban" ? B.navy : B.white, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" }}>
              ▦ Kanban
            </button>
            <button onClick={() => setView("table")}
              style={{ padding: "10px 14px", background: view === "table" ? B.sky : B.navyMid, color: view === "table" ? B.navy : B.white, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase" }}>
              ☰ Tabla
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: B.sand }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 12, border: `1px solid ${B.navyLight}` }}>
          {rows.length === 0 ? "Aún no hay contratistas registrados." : "Sin coincidencias con los filtros."}
        </div>
      ) : tab === "pipeline" && view === "kanban" ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}>
          {PIPELINE_COLUMNS.map(col => (
            <div key={col.k} style={{ background: col.accent, border: `1px solid ${B.navyLight}`, borderRadius: 10, padding: 10, minHeight: 200 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${B.navyLight}` }}>
                <div style={{ color: col.color, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
                  {col.label}
                </div>
                <div style={{ background: col.color + "22", color: col.color, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 800 }}>
                  {byEstado[col.k]?.length || 0}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(byEstado[col.k] || []).map(r => (
                  <KanbanCard key={r.id} c={{ ...r, num_trabajadores: r.num_trabajadores || workerCounts[r.id] }} onClick={() => setDetailId(r.id)} />
                ))}
                {(byEstado[col.k] || []).length === 0 && (
                  <div style={{ padding: 14, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 11, fontStyle: "italic" }}>
                    —
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : tab === "aprobados" ? (
        <AprobadosTable
          rows={tableRows}
          workerCounts={workerCounts}
          ingresosByContratista={ingresosByContratista}
          onOpen={setDetailId}
          isPilaVigente={isPilaVigente}
        />
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}`, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
            <thead>
              <tr style={{ background: B.navyLight }}>
                {[
                  { k: "radicado", label: "Radicado" },
                  { k: "tipo", label: "Tipo" },
                  { k: "nombre_display", label: "Nombre" },
                  { k: "estado", label: "Estado" },
                  { k: "submitted_at", label: "Radicado" },
                  { k: "num_trabajadores", label: "# Trab." },
                  { k: "fecha_fin", label: "Fin servicio" },
                  { k: "emp_fecha_pila", label: "PILA" },
                ].map(h => (
                  <th key={h.k}
                    onClick={() => toggleSort(h.k)}
                    style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, cursor: "pointer", userSelect: "none" }}>
                    {h.label} {sortKey === h.k && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map(r => {
                const pila = r.tipo === "empresa" ? isPilaVigente(r.emp_fecha_pila) : null;
                return (
                  <tr key={r.id} onClick={() => setDetailId(r.id)}
                    style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 11, color: B.sand }}>{r.radicado}</td>
                    <td style={{ padding: "12px 14px", fontSize: 11 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, background: (r.tipo === "empresa" ? B.sky : B.pink) + "22", color: r.tipo === "empresa" ? B.sky : B.pink, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
                        {r.tipo === "empresa" ? "Empresa" : "Natural"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 600, color: B.white }}>{r.nombre_display}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 12, background: (ESTADO_COLOR[r.estado] || B.sand) + "22", color: ESTADO_COLOR[r.estado] || B.sand, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
                        {ESTADO_LABEL[r.estado] || r.estado}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 12 }}>{fmt(r.submitted_at)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12, color: B.sand }}>{workerCounts[r.id] || (r.tipo === "natural" ? 1 : 0)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 12 }}>{fmt(r.fecha_fin)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 11 }}>
                      {pila === null ? <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span> :
                        <span style={{ color: pila ? B.success : B.danger, fontWeight: 700 }}>
                          {pila ? "✓" : "⚠"}
                        </span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer legal */}
      <div style={{ marginTop: 20, padding: "14px 18px", background: "rgba(200,185,154,0.05)", borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
        📜 Marco legal: <strong>Decreto 1072/2015 Art. 2.2.4.6.28</strong> · <strong>CST Art. 34</strong> · <strong>Decreto 723/2013</strong> · <strong>Ley 527/1999</strong> (firma electrónica)
      </div>

      {/* Wizard asistido */}
      {wizardOpen && (
        <ContratistasWizardAsistido
          adminUser={adminUser}
          onClose={() => { setWizardOpen(false); load(); }}
        />
      )}

      {/* Detail modal */}
      {detailId && (
        <DetailModal
          contratistaId={detailId}
          adminUser={adminUser}
          onClose={() => { setDetailId(null); }}
          onChanged={() => { load(); }}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div style={{ background: B.navyMid, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function AprobadosTable({ rows, workerCounts, ingresosByContratista, onOpen, isPilaVigente }) {
  const fmtDateTime = (d) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return d; }
  };
  const diasDesde = (d) => {
    if (!d) return null;
    try { return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)); } catch { return null; }
  };

  if (rows.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 12, border: `1px solid ${B.navyLight}` }}>
        Sin contratistas aprobados con los filtros actuales.
      </div>
    );
  }

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}`, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1000 }}>
        <thead>
          <tr style={{ background: B.navyLight }}>
            {["Radicado", "Tipo", "Nombre", "Estado", "Aprobado", "Trabajadores", "Ingresos totales", "Último ingreso", "PILA", "Curso SST"].map((h, i) => (
              <th key={i} style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const ing = ingresosByContratista[r.id] || { count: 0, last: null, permitidos: 0, rechazados: 0, advertencias: 0 };
            const pila = r.tipo === "empresa" ? isPilaVigente(r.emp_fecha_pila) : null;
            const workers = workerCounts[r.id] || (r.tipo === "natural" ? 1 : 0);
            const dias = diasDesde(ing.last);
            const isVencido = r.estado === "vencido";
            return (
              <tr key={r.id} onClick={() => onOpen(r.id)}
                style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", opacity: isVencido ? 0.6 : 1 }}
                onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 11, color: B.sand }}>{r.radicado}</td>
                <td style={{ padding: "12px 14px", fontSize: 11 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 10, background: (r.tipo === "empresa" ? B.sky : B.pink) + "22", color: r.tipo === "empresa" ? B.sky : B.pink, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
                    {r.tipo === "empresa" ? "Empresa" : "Natural"}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: B.white }}>{r.nombre_display}</td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 12,
                    background: (isVencido ? B.pink : B.success) + "22",
                    color: isVencido ? B.pink : B.success,
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                  }}>
                    {isVencido ? "Vencido" : "Aprobado"}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", fontSize: 12 }}>
                  {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 12, color: B.sand, textAlign: "center" }}>{workers}</td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: ing.count > 0 ? B.success : "rgba(255,255,255,0.3)" }}>
                    {ing.count}
                  </div>
                  {ing.count > 0 && (
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                      ✓ {ing.permitidos}
                      {ing.rechazados > 0 && <span style={{ color: B.danger, marginLeft: 6 }}>✗ {ing.rechazados}</span>}
                      {ing.advertencias > 0 && <span style={{ color: B.warning, marginLeft: 6 }}>⚠ {ing.advertencias}</span>}
                    </div>
                  )}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 11 }}>
                  {ing.last ? (
                    <>
                      <div>{fmtDateTime(ing.last)}</div>
                      <div style={{ fontSize: 10, color: dias === 0 ? B.success : dias <= 7 ? B.sky : "rgba(255,255,255,0.4)", marginTop: 2 }}>
                        {dias === 0 ? "Hoy" : dias === 1 ? "Ayer" : `Hace ${dias} días`}
                      </div>
                    </>
                  ) : <span style={{ color: "rgba(255,255,255,0.3)" }}>Nunca</span>}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 11 }}>
                  {pila === null ? <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span> :
                    <span style={{ color: pila ? B.success : B.danger, fontWeight: 700 }}>
                      {pila ? "✓ Vigente" : "⚠ Vencida"}
                    </span>
                  }
                </td>
                <td style={{ padding: "12px 14px", fontSize: 11 }}>
                  <CursoStatus contratistaId={r.id} totalWorkers={workers} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CursoStatus({ contratistaId, totalWorkers }) {
  const [done, setDone] = useState(null);
  useEffect(() => {
    let cancel = false;
    supabase.from("contratistas_trabajadores")
      .select("curso_completado")
      .eq("contratista_id", contratistaId)
      .then(({ data }) => {
        if (cancel) return;
        const completados = (data || []).filter(w => w.curso_completado).length;
        setDone(completados);
      });
    return () => { cancel = true; };
  }, [contratistaId]);
  if (done === null) return <span style={{ color: "rgba(255,255,255,0.3)" }}>…</span>;
  const all = totalWorkers > 0 && done === totalWorkers;
  return (
    <span style={{ color: all ? B.success : done === 0 ? B.danger : B.warning, fontWeight: 700 }}>
      {done} / {totalWorkers}
    </span>
  );
}
