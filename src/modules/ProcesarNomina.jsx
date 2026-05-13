// ProcesarNomina — calcula nómina quincenal por empleado desde marcaciones
// biométricas (asistencia_zk) con fallback manual y aplica recargos de ley
// Colombia (nocturno +35%, dominical/festivo +75%, extras +25% diurnas /
// +75% nocturnas).
//
// Output: tabla con totales por empleado para revisar. Drawer con detalle
// día-a-día editable (operador puede corregir horas si el biométrico falló).
// Al confirmar, hace upsert en `nomina_por_dia`.

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";
import { useMobile } from "../lib/useMobile";
import { logAccion } from "../lib/logAccion";
import {
  quincenaActual, quincenaAnterior, diasDelPeriodo,
  esDominical, esFestivo, esDominicalOFestivo,
  calcularPeriodoEmpleado, consolidarMarcaciones, agruparMarcaciones,
} from "../lib/nominaCalculator.js";

const IS = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${B.navyLight}`,
  color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box",
};
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// ── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${color || B.sand}`, minWidth: 180, flex: "1 1 180px" }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: B.white }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Detalle drawer ───────────────────────────────────────────────────────────
function DetalleDrawer({ empleado, periodoCalc, desde, hasta, onClose, onEditDia }) {
  if (!empleado || !periodoCalc) return null;
  const dias = periodoCalc.dias;
  const t = periodoCalc.totales;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
      display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(720px, 100vw)", height: "100vh", background: B.navy,
        overflowY: "auto", padding: 24, borderLeft: `1px solid ${B.navyLight}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{empleado.cargo || "—"}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: B.white }}>{empleado.nombres} {empleado.apellidos}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              CC: {empleado.cedula || "—"} · Tarifa: ${Number(empleado.tarifa_hora || 0).toLocaleString("es-CO")}/h · Período: {desde} → {hasta}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.white, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* Totales empleado */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <Stat label="Días trab" value={t.dias_trabajados} />
            <Stat label="Ausencias" value={t.dias_ausencias} color={t.dias_ausencias > 0 ? B.warning : null} />
            <Stat label="Horas tot" value={t.horas_totales.toFixed(1)} />
            <Stat label="H. extras" value={(t.horas_extras_diurnas + t.horas_extras_nocturnas).toFixed(1)} />
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${B.navyLight}`, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, fontSize: 12 }}>
            <Row label="Ordinario" value={COP(t.valor_ordinario)} />
            <Row label="Recargo nocturno" value={COP(t.recargo_nocturno)} muted={t.recargo_nocturno === 0} />
            <Row label="Recargo dom/festivo" value={COP(t.recargo_dominical)} muted={t.recargo_dominical === 0} />
            <Row label="Horas extras" value={COP(t.valor_extras)} muted={t.valor_extras === 0} />
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Total a pagar</span>
            <span style={{ fontSize: 26, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.sand }}>{COP(t.total)}</span>
          </div>
        </div>

        {/* Tabla días */}
        <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontWeight: 700 }}>Detalle por día</div>
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Entrada</th>
                <th style={thStyle}>Salida</th>
                <th style={thStyle}>Horas</th>
                <th style={thStyle}>Extras</th>
                <th style={thStyle}>Recargo</th>
                <th style={thStyle}>Total</th>
              </tr>
            </thead>
            <tbody>
              {dias.map(d => {
                const isWeekendOrHoliday = d.es_dominical || d.es_festivo;
                const bg = d.ausencia ? "rgba(232,160,32,0.06)" : isWeekendOrHoliday ? "rgba(244,198,208,0.04)" : "transparent";
                const fecha = new Date(d.fecha + "T12:00:00");
                const dia = fecha.toLocaleDateString("es-CO", { weekday: "short" });
                const dd = fecha.getDate();
                return (
                  <tr key={d.fecha} style={{ background: bg, borderTop: `1px solid ${B.navyLight}33`, cursor: "pointer" }}
                    onClick={() => onEditDia?.(d.fecha)}>
                    <td style={tdStyle}>
                      <span style={{ color: isWeekendOrHoliday ? B.pink : B.white, fontWeight: 600 }}>{dia} {dd}</span>
                      {d.es_festivo && <span style={{ marginLeft: 6, fontSize: 10, color: B.pink }}>FESTIVO</span>}
                      {d.es_dominical && !d.es_festivo && <span style={{ marginLeft: 6, fontSize: 10, color: B.pink }}>DOM</span>}
                    </td>
                    <td style={tdStyle}>{d.ausencia ? <span style={{ color: B.warning }}>Falta</span> : (d.entrada_real || "—")}</td>
                    <td style={tdStyle}>{d.ausencia ? "—" : (d.salida_real || "—")}</td>
                    <td style={tdStyle}>{d.horas_totales || 0}h</td>
                    <td style={tdStyle}>{(d.horas_extras_diurnas + d.horas_extras_nocturnas).toFixed(1)}h</td>
                    <td style={tdStyle}>{COP(d.recargo_nocturno + d.recargo_dominical)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: d.total > 0 ? B.sand : "rgba(255,255,255,0.3)" }}>{d.total ? COP(d.total) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 12, fontStyle: "italic" }}>
          💡 Click sobre un día para editar entrada/salida manualmente (fallback al biométrico).
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>{value}</div>
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "rgba(255,255,255,0.55)" }}>{label}</span>
      <span style={{ color: muted ? "rgba(255,255,255,0.3)" : B.white, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "10px 12px", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 };
const tdStyle = { padding: "10px 12px", color: B.white, fontSize: 12 };

// ── Modal editar día (fallback manual) ───────────────────────────────────────
function EditDiaModal({ empleado, fecha, currentEntrada, currentSalida, onSave, onClose }) {
  const [entrada, setEntrada] = useState(currentEntrada || "");
  const [salida, setSalida] = useState(currentSalida || "");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navy, borderRadius: 14, padding: 28, width: "min(420px, 92vw)", border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Editar horas — {empleado?.nombres}</div>
        <div style={{ fontSize: 18, color: B.white, fontWeight: 700, marginBottom: 16 }}>{fecha}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={LS}>Entrada</label>
            <input type="time" value={entrada} onChange={e => setEntrada(e.target.value)} style={IS} />
          </div>
          <div>
            <label style={LS}>Salida</label>
            <input type="time" value={salida} onChange={e => setSalida(e.target.value)} style={IS} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={{ background: "none", color: B.sand, padding: "9px 18px", border: `1px solid ${B.navyLight}`, borderRadius: 8, cursor: "pointer" }}>Cancelar</button>
          <button onClick={() => { onSave(entrada || null, salida || null); onClose(); }} style={{ background: B.sky, color: B.navy, padding: "9px 20px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ── Main module ──────────────────────────────────────────────────────────────
export default function ProcesarNomina() {
  const isMobile = useMobile();
  const [empleados, setEmpleados] = useState([]);
  const [marcaciones, setMarcaciones] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState(() => quincenaActual());
  const [detalleEmpleado, setDetalleEmpleado] = useState(null);
  const [editDia, setEditDia] = useState(null);  // { empId, fecha, entrada, salida }
  const [overrides, setOverrides] = useState({});  // key = `${empId}|${fecha}` → { entrada, salida }
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("todos");

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [{ data: emps }, { data: marcs }, { data: hors }] = await Promise.all([
      supabase.from("rh_empleados")
        .select("id, nombres, apellidos, cedula, cargo, departamento_id, salario_base, tarifa_hora, activo, zk_user_id")
        .eq("activo", true)
        .order("apellidos"),
      supabase.from("asistencia_zk")
        .select("empleado_id, zk_user_id, fecha, hora, timestamp, tipo_marca")
        .gte("fecha", periodo.desde)
        .lte("fecha", periodo.hasta)
        .order("timestamp", { ascending: true }),
      supabase.from("rh_horarios")
        .select("empleado_id, fecha, hora_ini, hora_fin, tipo, plantilla_id")
        .gte("fecha", periodo.desde)
        .lte("fecha", periodo.hasta),
    ]);
    setEmpleados(emps || []);
    setMarcaciones(marcs || []);
    setHorarios(hors || []);
    setLoading(false);
  }, [periodo.desde, periodo.hasta]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Index horas por empleado/día (biométrico o fallback horario o override manual)
  const horasPorEmpleadoDia = useMemo(() => {
    const map = new Map();
    // 1. Procesar marcaciones biométricas
    const marcasPorKey = agruparMarcaciones(marcaciones.map(m => ({
      ...m,
      empleado_id: m.empleado_id,  // ya viene resuelto
    })));
    for (const [key, marcas] of marcasPorKey) {
      const consolidado = consolidarMarcaciones(marcas);
      map.set(key, consolidado);
    }
    // 2. Fallback: horario programado donde no hay biométrico
    for (const h of horarios) {
      const key = `${h.empleado_id}|${h.fecha}`;
      if (!map.has(key) && h.hora_ini && h.hora_fin) {
        map.set(key, {
          entrada: String(h.hora_ini).slice(0, 5),
          salida:  String(h.hora_fin).slice(0, 5),
          fuente:  "horario_programado",
        });
      }
    }
    // 3. Aplicar overrides manuales
    for (const [key, val] of Object.entries(overrides)) {
      map.set(key, { ...val, fuente: "manual" });
    }
    return map;
  }, [marcaciones, horarios, overrides]);

  // Calcular nómina por empleado
  const nominaPorEmpleado = useMemo(() => {
    return empleados.map(emp => {
      const horasMap = new Map();
      for (const fecha of diasDelPeriodo(periodo.desde, periodo.hasta)) {
        const key = `${emp.id}|${fecha}`;
        const h = horasPorEmpleadoDia.get(key);
        if (h) horasMap.set(fecha, h);
      }
      const calc = calcularPeriodoEmpleado({
        desde: periodo.desde,
        hasta: periodo.hasta,
        tarifaHora: Number(emp.tarifa_hora || 0),
        horasPorDia: horasMap,
      });
      // Enriquecer cada día con entrada/salida real para UI
      const diasEnriquecidos = calc.dias.map(d => {
        const h = horasMap.get(d.fecha) || {};
        return {
          ...d,
          entrada_real: h.entrada || null,
          salida_real:  h.salida || null,
          fuente: h.fuente || (h.entrada ? "biometrico" : null),
        };
      });
      return { empleado: emp, dias: diasEnriquecidos, totales: calc.totales };
    });
  }, [empleados, periodo.desde, periodo.hasta, horasPorEmpleadoDia]);

  // Filtros
  const empleadosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nominaPorEmpleado.filter(({ empleado: e }) => {
      if (filterDept !== "todos" && e.departamento_id !== filterDept) return false;
      if (!q) return true;
      const haystack = `${e.nombres} ${e.apellidos} ${e.cargo || ""} ${e.cedula || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [nominaPorEmpleado, search, filterDept]);

  // Totales generales
  const totalGeneral = useMemo(() => {
    const t = { total: 0, dias_trabajados: 0, dias_ausencias: 0, horas_totales: 0, valor_extras: 0, recargo_dominical: 0 };
    for (const e of empleadosFiltrados) {
      t.total           += e.totales.total;
      t.dias_trabajados += e.totales.dias_trabajados;
      t.dias_ausencias  += e.totales.dias_ausencias;
      t.horas_totales   += e.totales.horas_totales;
      t.valor_extras    += e.totales.valor_extras;
      t.recargo_dominical += e.totales.recargo_dominical;
    }
    return t;
  }, [empleadosFiltrados]);

  // Departamentos únicos para el filtro
  const departamentos = useMemo(() => {
    const set = new Set();
    for (const e of empleados) if (e.departamento_id) set.add(e.departamento_id);
    return Array.from(set).sort();
  }, [empleados]);

  // Edit día manual
  const onEditDia = (empleadoId, fecha) => {
    const key = `${empleadoId}|${fecha}`;
    const current = horasPorEmpleadoDia.get(key) || { entrada: null, salida: null };
    setEditDia({
      empleadoId,
      fecha,
      empleado: empleados.find(e => e.id === empleadoId),
      entrada: current.entrada,
      salida:  current.salida,
    });
  };
  const onSaveDia = (entrada, salida) => {
    if (!editDia) return;
    const key = `${editDia.empleadoId}|${editDia.fecha}`;
    setOverrides(o => ({ ...o, [key]: { entrada, salida } }));
  };

  // Procesar y guardar en BD
  const procesar = async () => {
    if (saving) return;
    if (!confirm(`¿Procesar nómina de ${empleadosFiltrados.length} empleados para el período ${periodo.desde} → ${periodo.hasta}?\n\nEsto creará/actualizará ${empleadosFiltrados.length * diasDelPeriodo(periodo.desde, periodo.hasta).length} registros en nomina_por_dia.`)) return;
    setSaving(true);
    try {
      const rows = [];
      for (const { empleado, dias, totales } of empleadosFiltrados) {
        if (totales.dias_trabajados === 0) continue;
        for (const d of dias) {
          if (d.ausencia && !d.es_dominical && !d.es_festivo) continue;  // no creamos filas para puras ausencias
          rows.push({
            fecha:      d.fecha,
            empleado_loggro_id: empleado.id,  // usamos rh_empleados.id
            nombre:     `${empleado.nombres} ${empleado.apellidos}`,
            documento:  empleado.cedula,
            cargo:      empleado.cargo,
            area:       empleado.departamento_id,
            valor_dia:  d.valor_ordinario,
            horas:      d.horas_totales,
            transporte: 0,
            bonificacion: d.recargo_nocturno + d.recargo_dominical + d.valor_extras,
            total:      d.total,
            metodo_pago: "transferencia",
            pagado:     false,
            notas:      [
              d.horas_extras_diurnas + d.horas_extras_nocturnas > 0 ? `Extras: ${(d.horas_extras_diurnas + d.horas_extras_nocturnas).toFixed(1)}h` : null,
              d.recargo_nocturno > 0 ? `Recargo noct: ${COP(d.recargo_nocturno)}` : null,
              d.recargo_dominical > 0 ? `Recargo dom/fest: ${COP(d.recargo_dominical)}` : null,
            ].filter(Boolean).join(" · ") || null,
            registrado_por: "ProcesarNomina (auto)",
          });
        }
      }
      // Upsert en lotes de 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from("nomina_por_dia").upsert(batch, { onConflict: "fecha,empleado_loggro_id" });
        if (error) throw error;
      }
      logAccion({
        modulo: "nomina", accion: "procesar_nomina", tabla: "nomina_por_dia",
        registroId: `${periodo.desde}_${periodo.hasta}`,
        notas: `${empleadosFiltrados.length} empleados · ${rows.length} días · ${COP(totalGeneral.total)}`,
      });
      alert(`✅ Nómina procesada\n\n${rows.length} registros guardados en nomina_por_dia\nTotal a pagar: ${COP(totalGeneral.total)}\n\nPodés revisarlos/aprobarlos en el módulo "Nómina Día".`);
    } catch (e) {
      alert(`❌ Error procesando nómina: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  // Períodos disponibles (presets)
  const periodosPresets = useMemo(() => [
    { label: quincenaActual().etiqueta + " (actual)", value: quincenaActual() },
    { label: quincenaAnterior().etiqueta + " (anterior)", value: quincenaAnterior() },
  ], []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? 16 : 24, color: B.white, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, color: B.sand, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>💵 Procesar Nómina</h1>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
            Cálculo automático desde marcaciones biométricas con recargos de ley Colombia
          </div>
        </div>
      </div>

      {/* Selector de período */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={LS}>Período (quincena)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {periodosPresets.map(p => {
              const isActive = p.value.desde === periodo.desde && p.value.hasta === periodo.hasta;
              return (
                <button key={p.label} onClick={() => setPeriodo(p.value)} style={{
                  background: isActive ? B.sand : "rgba(255,255,255,0.06)",
                  color: isActive ? B.navy : B.white,
                  border: `1px solid ${isActive ? B.sand : B.navyLight}`,
                  borderRadius: 8, padding: "8px 14px", cursor: "pointer",
                  fontSize: 12, fontWeight: 600,
                }}>{p.label}</button>
              );
            })}
          </div>
        </div>
        <div>
          <label style={LS}>Desde</label>
          <input type="date" value={periodo.desde} onChange={e => setPeriodo(p => ({ ...p, desde: e.target.value, etiqueta: "Personalizado" }))} style={{ ...IS, width: 160 }} />
        </div>
        <div>
          <label style={LS}>Hasta</label>
          <input type="date" value={periodo.hasta} onChange={e => setPeriodo(p => ({ ...p, hasta: e.target.value, etiqueta: "Personalizado" }))} style={{ ...IS, width: 160 }} />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <Kpi label="Empleados activos" value={empleadosFiltrados.length} color={B.sky} />
        <Kpi label="Días trabajados (total)" value={totalGeneral.dias_trabajados} />
        <Kpi label="Ausencias" value={totalGeneral.dias_ausencias} color={totalGeneral.dias_ausencias > 0 ? B.warning : null} sub={`${(totalGeneral.dias_ausencias / Math.max(1, totalGeneral.dias_trabajados + totalGeneral.dias_ausencias) * 100).toFixed(1)}% del período`} />
        <Kpi label="Horas trabajadas" value={totalGeneral.horas_totales.toFixed(0) + "h"} />
        <Kpi label="Horas extras" value={(totalGeneral.valor_extras > 0 ? "+" : "") + COP(totalGeneral.valor_extras)} color={B.pink} sub="recargo extras 25%/75%" />
        <Kpi label="TOTAL A PAGAR" value={COP(totalGeneral.total)} color={B.sand} sub={`${periodo.desde} → ${periodo.hasta}`} />
      </div>

      {/* Filtros + acción */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input
          type="search"
          placeholder="🔍 Buscar por nombre, cédula, cargo…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...IS, flex: "1 1 280px", maxWidth: 400 }}
        />
        {departamentos.length > 0 && (
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ ...IS, width: 200 }}>
            <option value="todos">Todos los departamentos</option>
            {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <button onClick={procesar} disabled={saving || loading || empleadosFiltrados.length === 0} style={{
          background: saving ? B.navyLight : B.success,
          color: B.white, border: "none", borderRadius: 10, padding: "10px 20px",
          cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13,
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? "Procesando…" : `💾 Guardar nómina (${empleadosFiltrados.length})`}
        </button>
      </div>

      {/* Tabla principal */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: B.sand }}>Cargando empleados y marcaciones…</div>
      ) : empleadosFiltrados.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center", color: "rgba(255,255,255,0.55)" }}>
          Sin empleados que coincidan con los filtros.
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <th style={thStyle}>Empleado</th>
                <th style={thStyle}>Cargo</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Días trab</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Horas</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Extras</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Dom/fest</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {empleadosFiltrados.map(({ empleado, totales }) => (
                <tr key={empleado.id}
                  onClick={() => setDetalleEmpleado(empleado)}
                  style={{ borderTop: `1px solid ${B.navyLight}33`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {empleado.nombres} {empleado.apellidos}
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>CC: {empleado.cedula || "—"}</div>
                  </td>
                  <td style={{ ...tdStyle, color: "rgba(255,255,255,0.6)" }}>{empleado.cargo || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: totales.dias_ausencias > 0 ? B.warning : B.white }}>
                    {totales.dias_trabajados}
                    {totales.dias_ausencias > 0 && <span style={{ fontSize: 10, color: B.warning, marginLeft: 4 }}>⚠ {totales.dias_ausencias} aus</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>{totales.horas_totales.toFixed(0)}h</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: totales.valor_extras > 0 ? B.pink : "rgba(255,255,255,0.3)" }}>{totales.valor_extras > 0 ? COP(totales.valor_extras) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: totales.recargo_dominical > 0 ? B.pink : "rgba(255,255,255,0.3)" }}>{totales.recargo_dominical > 0 ? COP(totales.recargo_dominical) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15 }}>{COP(totales.total)}</td>
                  <td style={{ ...tdStyle, color: B.sky }}>→</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "rgba(200,185,154,0.05)", borderTop: `2px solid ${B.sand}` }}>
                <td style={{ ...tdStyle, fontWeight: 700 }} colSpan={4}>TOTAL {empleadosFiltrados.length} empleado{empleadosFiltrados.length !== 1 ? "s" : ""}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: B.pink, fontWeight: 700 }}>{COP(totalGeneral.valor_extras)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: B.pink, fontWeight: 700 }}>{COP(totalGeneral.recargo_dominical)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>{COP(totalGeneral.total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Drawer detalle */}
      {detalleEmpleado && (
        <DetalleDrawer
          empleado={detalleEmpleado}
          periodoCalc={nominaPorEmpleado.find(x => x.empleado.id === detalleEmpleado.id)}
          desde={periodo.desde}
          hasta={periodo.hasta}
          onClose={() => setDetalleEmpleado(null)}
          onEditDia={fecha => onEditDia(detalleEmpleado.id, fecha)}
        />
      )}

      {/* Modal edit día */}
      {editDia && (
        <EditDiaModal
          empleado={editDia.empleado}
          fecha={editDia.fecha}
          currentEntrada={editDia.entrada}
          currentSalida={editDia.salida}
          onSave={onSaveDia}
          onClose={() => setEditDia(null)}
        />
      )}
    </div>
  );
}
