// ProcesarNomina — nómina quincenal por empleado.
// Modelo Colombia: salario_base prorrateado + novedades del período.
//
// Devengado:  salario_base/2 + aux. transporte + bonos/extras/recargos
// Deducido:   aportes 8% (salud + pensión) + faltas + anticipos + préstamos
// Neto = Devengado - Deducido
//
// Las novedades viven en `empleados_loggro_novedades`. El operador puede
// agregar manualmente desde el drawer del empleado, o el sistema las
// puede auto-generar más adelante desde las marcaciones biométricas.

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";
import { useMobile } from "../lib/useMobile";
import { logAccion } from "../lib/logAccion";
import {
  quincenaActual, quincenaAnterior, diasDelPeriodo,
  calcularNominaEmpleado, calcularHorasDia, ventanaNovedades, tarifaHoraEmpleado,
  NOVEDAD_TIPOS, SMMLV_2026, AUX_TRANSPORTE_2026, FESTIVOS_CO_2026,
} from "../lib/nominaCalculator.js";

// Ventana de novedades del período (desfasada). Defensivo si es "Personalizado".
function ventanaDe(periodo) {
  if (periodo && periodo.numero && periodo.anio != null && periodo.mes != null) {
    return ventanaNovedades(periodo);
  }
  return { desde: periodo?.desde, hasta: periodo?.hasta };
}

const IS = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${B.navyLight}`,
  color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box",
};
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const thStyle = { textAlign: "left", padding: "10px 12px", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 };
const tdStyle = { padding: "10px 12px", color: B.white, fontSize: 12 };

// ── KPI ──────────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${color || B.sand}`, minWidth: 180, flex: "1 1 180px" }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: B.white }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Drawer detalle empleado ──────────────────────────────────────────────────
function MarcacionesGrid({ empleado, periodo, marcaciones, onSave }) {
  const dias = diasDelPeriodo(periodo.desde, periodo.hasta);
  const norm = (t) => (t ? String(t).slice(0, 5) : "");
  const seed = () => {
    const m = {};
    for (const d of dias) m[d] = { entrada: "", salida: "" };
    for (const r of marcaciones) {
      if (m[r.fecha]) m[r.fecha] = { entrada: norm(r.entrada), salida: norm(r.salida) };
    }
    return m;
  };
  const [grid, setGrid] = useState(seed);
  const [guardando, setGuardando] = useState(false);
  const tarifa = tarifaHoraEmpleado(empleado);
  const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  const set = (fecha, campo, val) => setGrid(g => ({ ...g, [fecha]: { ...g[fecha], [campo]: val } }));
  const filas = dias.map(f => ({ fecha: f, ...grid[f] }));
  const totalValor = filas.reduce((s, f) =>
    s + (f.entrada && f.salida ? calcularHorasDia({ fecha: f.fecha, entrada: f.entrada, salida: f.salida, tarifaHora: tarifa }).valor : 0), 0);

  const guardar = async () => {
    setGuardando(true);
    await onSave(empleado.id, filas);
    setGuardando(false);
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
          🕑 Marcaciones · {periodo.etiqueta}
        </div>
        <div style={{ fontSize: 12, color: B.sand, fontWeight: 700 }}>{COP(totalValor)}</div>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
        Hora de entrada/salida por día trabajado · tarifa {COP(tarifa)}/h
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filas.map(f => {
          const d = new Date(f.fecha + "T12:00:00");
          const dom = d.getDay() === 0;
          const fest = FESTIVOS_CO_2026.has(f.fecha);
          const pre = (f.entrada && f.salida)
            ? calcularHorasDia({ fecha: f.fecha, entrada: f.entrada, salida: f.salida, tarifaHora: tarifa })
            : null;
          return (
            <div key={f.fecha} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${B.navyLight}33` }}>
              <div style={{ width: 64, fontSize: 11, color: (dom || fest) ? B.warning : "rgba(255,255,255,0.7)" }}>
                {DOW[d.getDay()]} {d.getDate()}{(dom || fest) ? " •" : ""}
              </div>
              <input type="time" value={f.entrada} onChange={e => set(f.fecha, "entrada", e.target.value)}
                style={{ ...IS, width: 96, padding: "6px 8px" }} />
              <input type="time" value={f.salida} onChange={e => set(f.fecha, "salida", e.target.value)}
                style={{ ...IS, width: 96, padding: "6px 8px" }} />
              <div style={{ flex: 1, textAlign: "right", fontSize: 11, color: pre ? B.success : "rgba(255,255,255,0.25)" }}>
                {pre ? `${pre.horas}h · ${COP(pre.valor)}` : "—"}
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={guardar} disabled={guardando}
        style={{ width: "100%", marginTop: 12, background: guardando ? B.navyLight : B.sky, color: B.navy, border: "none", borderRadius: 10, padding: "11px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
        {guardando ? "Guardando…" : "💾 Guardar marcaciones"}
      </button>
    </div>
  );
}

function DetalleDrawer({ empleado, calc, onClose, onAddNovedad, onDeleteNovedad, allNovedades, periodo, marcaciones = [], onSaveMarcaciones }) {
  if (!empleado || !calc) return null;
  const novedadesDelEmpleado = allNovedades.filter(n => n.empleado_loggro_id === empleado.id);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(640px, 100vw)", height: "100vh", background: B.navy, overflowY: "auto", padding: 24, borderLeft: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{empleado.cargo || "—"}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: B.white }}>{empleado.nombres} {empleado.apellidos}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              CC: {empleado.cedula || "—"} · Salario base: {COP(empleado.salario_base)} / mes
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.white, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* MARCACIONES — entrada/salida por día de la quincena */}
        {periodo && onSaveMarcaciones && (
          <MarcacionesGrid
            empleado={empleado}
            periodo={periodo}
            marcaciones={marcaciones}
            onSave={onSaveMarcaciones}
          />
        )}

        {/* DEVENGADO */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: B.success, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>✓ Devengado</div>
          <Row label="Salario base período" value={COP(calc.devengado.salario_base_periodo)} sub={calc.dias_no_trabajados > 0 ? `−${calc.dias_no_trabajados} día(s) por faltas` : `${calc.dias_trabajados} días trabajados`} />
          <Row label="Auxilio transporte" value={COP(calc.devengado.auxilio_transporte)} muted={calc.devengado.auxilio_transporte === 0} sub={calc.devengado.auxilio_transporte === 0 && empleado.salario_base > (2 * SMMLV_2026) ? "no aplica (>2 SMMLV)" : null} />
          {calc.devengado.items.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 12, marginBottom: 6 }}>Bonos / extras / recargos</div>
              {calc.devengado.items.map((n, i) => (
                <Row key={n.id || i} label={n.label} value={"+ " + COP(Math.abs(n.valor))}
                  sub={n.descripcion || `${n.fecha_inicio || ""}`}
                  onDelete={() => onDeleteNovedad?.(n)} />
              ))}
            </>
          )}
          <Total label="Subtotal devengado" value={COP(calc.devengado.subtotal)} color={B.success} />
        </div>

        {/* DEDUCCIONES */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: B.warning, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>− Deducciones</div>
          <Row label="Aporte salud (4%)" value={"− " + COP(calc.deducciones.aporte_salud)} />
          <Row label="Aporte pensión (4%)" value={"− " + COP(calc.deducciones.aporte_pension)} />
          {calc.deducciones.items.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 12, marginBottom: 6 }}>Otros descuentos</div>
              {calc.deducciones.items.map((n, i) => (
                <Row key={n.id || i} label={n.label} value={"− " + COP(Math.abs(n.valor))}
                  sub={n.descripcion || `${n.fecha_inicio || ""}`}
                  onDelete={() => onDeleteNovedad?.(n)} />
              ))}
            </>
          )}
          <Total label="Subtotal deducciones" value={"− " + COP(calc.deducciones.subtotal)} color={B.warning} />
        </div>

        {/* NETO */}
        <div style={{ background: B.sand + "11", border: `2px solid ${B.sand}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 14, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Neto a pagar</span>
            <span style={{ fontSize: 32, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.sand }}>{COP(calc.neto)}</span>
          </div>
        </div>

        {/* INFORMATIVO */}
        {calc.informativo.length > 0 && (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>ℹ Informativo (no afecta neto)</div>
            {calc.informativo.map((n, i) => (
              <Row key={n.id || i} label={n.label} value={n.cantidad ? `${n.cantidad} día(s)` : "—"} sub={n.descripcion} />
            ))}
          </div>
        )}

        {/* AGREGAR NOVEDAD */}
        <button onClick={onAddNovedad} style={{ width: "100%", background: B.sky, color: B.navy, border: "none", borderRadius: 10, padding: "12px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          ➕ Agregar novedad
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, sub, muted, onDelete }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "6px 0", borderBottom: `1px dashed ${B.navyLight}55` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: muted ? "rgba(255,255,255,0.4)" : B.white }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: muted ? "rgba(255,255,255,0.3)" : B.white, fontWeight: 600, fontFamily: "ui-monospace, monospace" }}>{value}</span>
        {onDelete && (
          <button onClick={onDelete} title="Eliminar novedad" style={{ background: "none", border: "none", color: B.warning, fontSize: 14, cursor: "pointer", padding: "0 4px" }}>×</button>
        )}
      </div>
    </div>
  );
}

function Total({ label, value, color }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
      <span style={{ color: color || B.sand }}>{label}</span>
      <span style={{ color: color || B.sand, fontFamily: "ui-monospace, monospace" }}>{value}</span>
    </div>
  );
}

// ── Modal agregar novedad ────────────────────────────────────────────────────
function AddNovedadModal({ empleado, periodo, onSave, onClose }) {
  const [tipo, setTipo] = useState("bonificacion");
  const [fechaInicio, setFechaInicio] = useState(periodo.desde);
  const [fechaFin, setFechaFin] = useState(periodo.hasta);
  const [cantidad, setCantidad] = useState("");
  const [valor, setValor] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const meta = NOVEDAD_TIPOS[tipo];
  const opciones = Object.entries(NOVEDAD_TIPOS);

  const guardar = () => {
    const valorNum = Number(String(valor).replace(/[^0-9.-]/g, "")) || 0;
    if (!valorNum && meta?.categoria !== "informativo") {
      alert("El valor debe ser mayor a 0");
      return;
    }
    onSave({
      empleado_loggro_id: empleado.id,
      tipo,
      fecha_inicio: fechaInicio,
      fecha_fin:    fechaFin || null,
      cantidad:     Number(cantidad) || null,
      valor:        valorNum,
      descripcion:  descripcion || meta?.descripcion || tipo,
    });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navy, borderRadius: 14, padding: 28, width: "min(520px, 92vw)", border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{empleado.nombres} {empleado.apellidos}</div>
        <div style={{ fontSize: 18, color: B.white, fontWeight: 700, marginBottom: 16 }}>Agregar novedad</div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={LS}>Tipo *</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={IS}>
              <optgroup label="✓ Devengados (suman)">
                {opciones.filter(([_, m]) => m.categoria === "devengado").map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </optgroup>
              <optgroup label="− Deducciones (restan)">
                {opciones.filter(([_, m]) => m.categoria === "deducido").map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </optgroup>
              <optgroup label="ℹ Informativos">
                {opciones.filter(([_, m]) => m.categoria === "informativo").map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </optgroup>
            </select>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{meta?.descripcion}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Fecha inicio *</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Fecha fin (opcional)</label>
              <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={IS} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Cantidad (días/horas)</label>
              <input type="number" min="0" step="0.01" value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="ej: 2" style={IS} />
            </div>
            <div>
              <label style={LS}>Valor en COP *</label>
              <input type="text" value={valor} onChange={e => setValor(e.target.value.replace(/[^\d]/g, ""))} placeholder="ej: 100000" style={IS} />
            </div>
          </div>

          <div>
            <label style={LS}>Descripción / nota</label>
            <textarea rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder={meta?.descripcion} style={{ ...IS, resize: "vertical" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
          <button onClick={onClose} style={{ background: "none", color: B.sand, padding: "9px 18px", border: `1px solid ${B.navyLight}`, borderRadius: 8, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} style={{ background: B.sky, color: B.navy, padding: "9px 20px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Guardar novedad</button>
        </div>
      </div>
    </div>
  );
}

// ── Main module ──────────────────────────────────────────────────────────────
export default function ProcesarNomina() {
  const isMobile = useMobile();
  const [empleados, setEmpleados] = useState([]);
  const [novedades, setNovedades] = useState([]);
  const [marcaciones, setMarcaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState(() => quincenaActual());
  const [detalleEmpleado, setDetalleEmpleado] = useState(null);
  const [addNovedadEmp, setAddNovedadEmp] = useState(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const ventana = useMemo(() => ventanaDe(periodo), [periodo]);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const ven = ventanaDe(periodo);
    const [empsRes, novsRes, marcsRes] = await Promise.all([
      supabase.from("rh_empleados")
        .select("id, nombres, apellidos, cedula, cargo, departamento_id, salario_base, tarifa_hora, modalidad_calculo, activo")
        .eq("activo", true)
        .order("apellidos"),
      // Novedades viven en su ventana DESFASADA (26→10 / 11→25), no en la quincena.
      supabase.from("empleados_loggro_novedades")
        .select("*")
        .or(`fecha_inicio.lte.${ven.hasta},fecha_fin.gte.${ven.desde}`),
      // Marcaciones (entrada/salida) de los días trabajados de la quincena.
      supabase.from("rh_marcaciones")
        .select("*")
        .gte("fecha", periodo.desde)
        .lte("fecha", periodo.hasta),
    ]);
    if (empsRes.error) console.error("Error cargando empleados:", empsRes.error);
    if (novsRes.error) console.error("Error cargando novedades:", novsRes.error);
    if (marcsRes.error) console.error("Error cargando marcaciones:", marcsRes.error);
    setEmpleados(empsRes.data || []);
    setNovedades(novsRes.data || []);
    setMarcaciones(marcsRes.data || []);
    setLoading(false);
  }, [periodo.desde, periodo.hasta]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calcular nómina por empleado
  const nominaPorEmpleado = useMemo(() => {
    return empleados.map(emp => {
      const novsEmp  = novedades.filter(n => n.empleado_loggro_id === emp.id);
      const marcsEmp = marcaciones.filter(m => m.empleado_id === emp.id);
      const calc = calcularNominaEmpleado({
        empleado: emp,
        periodo,
        novedades: novsEmp,
        marcaciones: marcsEmp,
        ventana,
      });
      return { empleado: emp, calc };
    });
  }, [empleados, novedades, marcaciones, periodo, ventana]);

  // Filtros
  const empleadosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nominaPorEmpleado;
    return nominaPorEmpleado.filter(({ empleado: e }) => {
      const haystack = `${e.nombres} ${e.apellidos} ${e.cargo || ""} ${e.cedula || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [nominaPorEmpleado, search]);

  // Totales generales
  const totales = useMemo(() => {
    const t = { neto: 0, devengado: 0, deducciones: 0, base: 0, aux: 0, extras: 0, descuentos: 0 };
    for (const { calc } of empleadosFiltrados) {
      t.neto       += calc.neto;
      t.devengado  += calc.devengado.subtotal;
      t.deducciones += calc.deducciones.subtotal;
      t.base       += calc.devengado.salario_base_periodo;
      t.aux        += calc.devengado.auxilio_transporte;
      t.extras     += calc.devengado.extras_recargos_bonos;
      t.descuentos += calc.deducciones.otros_descuentos;
    }
    return t;
  }, [empleadosFiltrados]);

  // Agregar novedad
  const handleAddNovedad = async (novedadData) => {
    try {
      const { error } = await supabase.from("empleados_loggro_novedades").insert({
        ...novedadData,
        loggro_novedad_id: `MAN-${Date.now()}`,
        raw_payload: { source: "ProcesarNomina manual", created_at: new Date().toISOString() },
      });
      if (error) throw error;
      setAddNovedadEmp(null);
      await fetchData();
      logAccion({ modulo: "nomina", accion: "agregar_novedad", tabla: "empleados_loggro_novedades",
                  registroId: novedadData.empleado_loggro_id,
                  notas: `${novedadData.tipo} · ${COP(novedadData.valor)}` });
    } catch (e) {
      alert(`❌ Error guardando novedad: ${e.message || e}`);
    }
  };

  const handleDeleteNovedad = async (novedad) => {
    if (!confirm(`¿Eliminar novedad "${NOVEDAD_TIPOS[novedad.tipo]?.label || novedad.tipo}" de ${COP(novedad.valor)}?`)) return;
    try {
      const { error } = await supabase.from("empleados_loggro_novedades").delete().eq("id", novedad.id);
      if (error) throw error;
      await fetchData();
    } catch (e) {
      alert(`❌ Error: ${e.message || e}`);
    }
  };

  // Guardar las marcaciones (entrada/salida) de un empleado para la quincena.
  const handleSaveMarcaciones = async (empleadoId, filas) => {
    try {
      const llenas = filas
        .filter(f => f.entrada && f.salida)
        .map(f => ({
          empleado_id: empleadoId, fecha: f.fecha,
          entrada: f.entrada, salida: f.salida,
          periodo: periodo.etiqueta, updated_at: new Date().toISOString(),
        }));
      const vacias = filas.filter(f => !f.entrada && !f.salida).map(f => f.fecha);
      if (llenas.length) {
        const { error } = await supabase.from("rh_marcaciones")
          .upsert(llenas, { onConflict: "empleado_id,fecha" });
        if (error) throw error;
      }
      if (vacias.length) {
        const { error } = await supabase.from("rh_marcaciones")
          .delete().eq("empleado_id", empleadoId).in("fecha", vacias);
        if (error) throw error;
      }
      await fetchData();
      logAccion({ modulo: "nomina", accion: "guardar_marcaciones", tabla: "rh_marcaciones",
                  registroId: empleadoId, notas: `${llenas.length} día(s) · ${periodo.etiqueta}` });
      return true;
    } catch (e) {
      alert(`❌ Error guardando marcaciones: ${e.message || e}`);
      return false;
    }
  };

  // Guardar nómina consolidada (registros 1 por empleado)
  const procesarYGuardar = async () => {
    if (saving) return;
    if (!confirm(`¿Guardar nómina de ${empleadosFiltrados.length} empleados para ${periodo.etiqueta}?\nNeto total: ${COP(totales.neto)}`)) return;
    setSaving(true);
    try {
      const rows = empleadosFiltrados
        .filter(({ calc }) => calc.neto > 0)
        .map(({ empleado, calc }) => ({
          fecha: periodo.hasta,    // último día del período como referencia
          empleado_loggro_id: empleado.id,
          nombre: `${empleado.nombres} ${empleado.apellidos}`,
          documento: empleado.cedula,
          cargo: empleado.cargo,
          area: empleado.departamento_id,
          valor_dia: calc.devengado.salario_base_periodo,
          horas: calc.marcaciones?.horas ?? calc.dias_trabajados * 8,
          transporte: calc.devengado.auxilio_transporte,
          bonificacion: calc.devengado.extras_recargos_bonos,
          deducciones: calc.deducciones.subtotal,
          total: calc.neto,
          metodo_pago: "transferencia",
          pagado: false,
          notas: [
            periodo.etiqueta,
            calc.marcaciones ? `${calc.marcaciones.horas}h (${calc.dias_trabajados} días)` : null,
            calc.dias_no_trabajados > 0 ? `−${calc.dias_no_trabajados} día(s) faltas` : null,
            `Devengado ${COP(calc.devengado.subtotal)} − Deducciones ${COP(calc.deducciones.subtotal)}`,
          ].filter(Boolean).join(" · "),
          registrado_por: "ProcesarNomina",
        }));
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from("nomina_por_dia").upsert(batch, { onConflict: "fecha,empleado_loggro_id" });
        if (error) throw error;
      }
      logAccion({ modulo: "nomina", accion: "procesar_nomina", tabla: "nomina_por_dia",
                  registroId: `${periodo.desde}_${periodo.hasta}`,
                  notas: `${rows.length} empleados · neto total ${COP(totales.neto)}` });
      alert(`✅ Nómina guardada\n\n${rows.length} empleados · ${COP(totales.neto)} neto total\n\nRevisa el módulo "Nómina Día" para aprobar los pagos.`);
    } catch (e) {
      alert(`❌ Error: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const periodosPresets = useMemo(() => [
    { label: quincenaActual().etiqueta + " (actual)", value: quincenaActual() },
    { label: quincenaAnterior().etiqueta + " (anterior)", value: quincenaAnterior() },
  ], []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? 16 : 24, color: B.white, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, color: B.sand, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>💵 Procesar Nómina</h1>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
          Salario base + novedades del período · Aportes 8% (salud + pensión) · Aux. transporte si ≤ 2 SMMLV
        </div>
      </div>

      {/* Selector de período */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 220px" }}>
          <label style={LS}>Período (quincena)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {periodosPresets.map(p => {
              const isActive = p.value.desde === periodo.desde && p.value.hasta === periodo.hasta;
              return (
                <button key={p.label} onClick={() => setPeriodo(p.value)} style={{
                  background: isActive ? B.sand : "rgba(255,255,255,0.06)",
                  color: isActive ? B.navy : B.white,
                  border: `1px solid ${isActive ? B.sand : B.navyLight}`,
                  borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
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
        <div style={{ flexBasis: "100%", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
          📅 Días trabajados: <b style={{ color: B.white }}>{periodo.desde} → {periodo.hasta}</b>
          {"   ·   "}
          🗒 Novedades: <b style={{ color: B.white }}>{ventana.desde} → {ventana.hasta}</b>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <Kpi label="Empleados activos" value={empleadosFiltrados.length} color={B.sky} />
        <Kpi label="Salario base período" value={COP(totales.base)} sub="base/2 × empleados" />
        <Kpi label="Aux. transporte" value={COP(totales.aux)} sub={`${AUX_TRANSPORTE_2026.toLocaleString("es-CO")} máx/mes`} />
        <Kpi label="Novedades + (bonos/extras)" value={COP(totales.extras)} color={B.success} />
        <Kpi label="Novedades − (descuentos)" value={COP(totales.descuentos)} color={B.warning} />
        <Kpi label="NETO A PAGAR" value={COP(totales.neto)} color={B.sand} sub={`Devengado ${COP(totales.devengado)} − Deducciones ${COP(totales.deducciones)}`} />
      </div>

      {/* Filtros + acción */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input type="search" placeholder="🔍 Buscar por nombre, cédula, cargo…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...IS, flex: "1 1 280px", maxWidth: 440 }} />
        <button onClick={procesarYGuardar} disabled={saving || loading || empleadosFiltrados.length === 0} style={{
          background: saving ? B.navyLight : B.success, color: B.white, border: "none", borderRadius: 10,
          padding: "10px 20px", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13,
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? "Guardando…" : `💾 Guardar nómina (${empleadosFiltrados.length})`}
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: B.sand }}>Cargando…</div>
      ) : empleadosFiltrados.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center", color: "rgba(255,255,255,0.55)" }}>
          Sin empleados que coincidan.
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <th style={thStyle}>Empleado</th>
                <th style={thStyle}>Cargo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Base período</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Aux. transp.</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Novedades +</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Aportes</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Desc.</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Neto</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {empleadosFiltrados.map(({ empleado, calc }) => (
                <tr key={empleado.id} onClick={() => setDetalleEmpleado(empleado)}
                  style={{ borderTop: `1px solid ${B.navyLight}33`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {empleado.nombres} {empleado.apellidos}
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>CC: {empleado.cedula || "—"}</div>
                  </td>
                  <td style={{ ...tdStyle, color: "rgba(255,255,255,0.6)" }}>{empleado.cargo || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: calc.dias_no_trabajados > 0 ? B.warning : B.white }}>
                    {COP(calc.devengado.salario_base_periodo)}
                    {calc.dias_no_trabajados > 0 && <div style={{ fontSize: 10, color: B.warning }}>−{calc.dias_no_trabajados} falta(s)</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: calc.devengado.auxilio_transporte > 0 ? B.white : "rgba(255,255,255,0.3)" }}>
                    {calc.devengado.auxilio_transporte > 0 ? COP(calc.devengado.auxilio_transporte) : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: calc.devengado.extras_recargos_bonos > 0 ? B.success : "rgba(255,255,255,0.3)" }}>
                    {calc.devengado.extras_recargos_bonos > 0 ? "+" + COP(calc.devengado.extras_recargos_bonos) : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: B.warning + "AA" }}>−{COP(calc.deducciones.aporte_salud + calc.deducciones.aporte_pension)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: calc.deducciones.otros_descuentos > 0 ? B.warning : "rgba(255,255,255,0.3)" }}>
                    {calc.deducciones.otros_descuentos > 0 ? "−" + COP(calc.deducciones.otros_descuentos) : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15 }}>
                    {COP(calc.neto)}
                  </td>
                  <td style={{ ...tdStyle, color: B.sky }}>→</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "rgba(200,185,154,0.05)", borderTop: `2px solid ${B.sand}` }}>
                <td style={{ ...tdStyle, fontWeight: 700 }} colSpan={2}>TOTAL {empleadosFiltrados.length} empl.</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{COP(totales.base)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{COP(totales.aux)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: B.success, fontWeight: 700 }}>+{COP(totales.extras)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: B.warning, fontWeight: 700 }}>−{COP(totales.deducciones - totales.descuentos)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: B.warning, fontWeight: 700 }}>−{COP(totales.descuentos)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>
                  {COP(totales.neto)}
                </td>
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
          calc={nominaPorEmpleado.find(x => x.empleado.id === detalleEmpleado.id)?.calc}
          allNovedades={novedades}
          periodo={periodo}
          marcaciones={marcaciones.filter(m => m.empleado_id === detalleEmpleado.id)}
          onSaveMarcaciones={handleSaveMarcaciones}
          onClose={() => setDetalleEmpleado(null)}
          onAddNovedad={() => setAddNovedadEmp(detalleEmpleado)}
          onDeleteNovedad={handleDeleteNovedad}
        />
      )}

      {/* Modal agregar novedad — defaults a la ventana de novedades */}
      {addNovedadEmp && (
        <AddNovedadModal
          empleado={addNovedadEmp}
          periodo={ventana}
          onSave={handleAddNovedad}
          onClose={() => setAddNovedadEmp(null)}
        />
      )}
    </div>
  );
}
