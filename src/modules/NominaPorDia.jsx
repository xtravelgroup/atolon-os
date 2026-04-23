// Nómina por Día — registros de jornales diarios
// Data: tabla `nomina_por_dia`.

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";

const IS = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${B.navyLight}`,
  color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box",
};
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const startOfMonth = () => { const d = new Date(); d.setDate(1); return d.toLocaleDateString("en-CA"); };
const endOfMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return d.toLocaleDateString("en-CA"); };

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${color || B.sand}`, minWidth: 200, flex: "1 1 200px" }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: B.white }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const emptyForm = {
  fecha: today(),
  nombre: "", documento: "", cargo: "", area: "",
  valor_dia: "", horas: 8, transporte: 0, bonificacion: 0,
  metodo_pago: "efectivo", pagado: false, notas: "",
  empleado_loggro_id: null,
};

export default function NominaPorDia() {
  const [registros, setRegistros] = useState([]);
  const [empleadosLoggro, setEmpleadosLoggro] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rangeFrom, setRangeFrom] = useState(startOfMonth());
  const [rangeTo, setRangeTo] = useState(endOfMonth());
  const [filtroPagado, setFiltroPagado] = useState("todos");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase.from("nomina_por_dia")
      .select("*")
      .gte("fecha", rangeFrom).lte("fecha", rangeTo)
      .order("fecha", { ascending: false });
    setRegistros(data || []);
    setLoading(false);
  };

  const fetchEmp = async () => {
    const { data } = await supabase.from("empleados_loggro")
      .select("id, nombre_completo, documento, cargo, departamento")
      .order("nombre_completo");
    setEmpleadosLoggro(data || []);
  };

  useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [rangeFrom, rangeTo]);
  useEffect(() => { fetchEmp(); }, []);

  const selectEmpleado = (emp) => {
    setForm(f => ({
      ...f,
      empleado_loggro_id: emp.id,
      nombre: emp.nombre_completo,
      documento: emp.documento,
      cargo: emp.cargo || "",
      area: emp.departamento || "",
    }));
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return alert("Nombre es requerido");
    if (!form.valor_dia || Number(form.valor_dia) <= 0) return alert("Valor del día debe ser mayor a 0");
    setSaving(true);
    const payload = {
      fecha: form.fecha,
      empleado_loggro_id: form.empleado_loggro_id || null,
      nombre: form.nombre.trim(),
      documento: form.documento || null,
      cargo: form.cargo || null,
      area: form.area || null,
      valor_dia: Number(form.valor_dia) || 0,
      horas: Number(form.horas) || 8,
      transporte: Number(form.transporte) || 0,
      bonificacion: Number(form.bonificacion) || 0,
      metodo_pago: form.metodo_pago,
      pagado: !!form.pagado,
      notas: form.notas || null,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      await supabase.from("nomina_por_dia").update(payload).eq("id", editing);
    } else {
      await supabase.from("nomina_por_dia").insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    fetch();
  };

  const editar = (r) => {
    setEditing(r.id);
    setForm({
      fecha: r.fecha, nombre: r.nombre, documento: r.documento || "", cargo: r.cargo || "", area: r.area || "",
      valor_dia: r.valor_dia || "", horas: r.horas || 8, transporte: r.transporte || 0, bonificacion: r.bonificacion || 0,
      metodo_pago: r.metodo_pago || "efectivo", pagado: r.pagado, notas: r.notas || "",
      empleado_loggro_id: r.empleado_loggro_id,
    });
    setShowForm(true);
  };

  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar registro de ${r.nombre} del ${r.fecha}?`)) return;
    await supabase.from("nomina_por_dia").delete().eq("id", r.id);
    fetch();
  };

  const togglePagado = async (r) => {
    await supabase.from("nomina_por_dia").update({ pagado: !r.pagado, updated_at: new Date().toISOString() }).eq("id", r.id);
    fetch();
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return registros.filter(r => {
      if (filtroPagado === "pagados" && !r.pagado) return false;
      if (filtroPagado === "pendientes" && r.pagado) return false;
      if (!q) return true;
      return [r.nombre, r.documento, r.cargo, r.area].filter(Boolean).some(v => v.toLowerCase().includes(q));
    });
  }, [registros, filtroPagado, search]);

  const kpis = useMemo(() => {
    const jornadas = registros.length;
    const personasUnicas = new Set(registros.map(r => r.documento || r.nombre)).size;
    const totalPagado = registros.filter(r => r.pagado).reduce((s, r) => s + (Number(r.total) || 0), 0);
    const totalPendiente = registros.filter(r => !r.pagado).reduce((s, r) => s + (Number(r.total) || 0), 0);
    return { jornadas, personasUnicas, totalPagado, totalPendiente, total: totalPagado + totalPendiente };
  }, [registros]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: B.white, margin: 0 }}>Nómina por Día</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Registra jornales, horas extras y pagos diarios
          </div>
        </div>
        <button onClick={() => { setEditing(null); setForm({ ...emptyForm, fecha: today() }); setShowForm(true); }}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          + Registrar jornal
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Kpi label="Jornadas"   value={kpis.jornadas}        sub="en el período" color={B.sky} />
        <Kpi label="Personas"   value={kpis.personasUnicas}  sub="diferentes"     color={B.sand} />
        <Kpi label="Pagado"     value={COP(kpis.totalPagado) || "$0"} sub={`${registros.filter(r => r.pagado).length} registros`} color={B.success} />
        <Kpi label="Pendiente"  value={COP(kpis.totalPendiente) || "$0"} sub={`${registros.filter(r => !r.pagado).length} registros`} color={B.warning} />
        <Kpi label="Total período" value={COP(kpis.total) || "$0"} sub="pagado + pendiente" color={B.pink} />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>Período</span>
          <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={{ ...IS, width: 150 }} />
          <span style={{ color: "rgba(255,255,255,0.3)" }}>→</span>
          <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} style={{ ...IS, width: 150 }} />
        </div>
        <input placeholder="🔍 Buscar nombre, doc, cargo…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...IS, flex: "1 1 200px", minWidth: 180 }} />
        <select value={filtroPagado} onChange={e => setFiltroPagado(e.target.value)} style={{ ...IS, width: 160 }}>
          <option value="todos">Todos</option>
          <option value="pagados">Pagados</option>
          <option value="pendientes">Pendientes</option>
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ padding: 40, color: B.sand, textAlign: "center" }}>Cargando…</div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: B.navyLight }}>
                  {["Fecha", "Persona", "Documento", "Cargo", "Área", "Horas", "Valor día", "Transporte", "Bonif.", "Total", "Método", "Estado", ""].map(h => (
                    <th key={h} style={{ padding: "12px 10px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={13} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.35)" }}>
                    {registros.length === 0 ? "Aún no hay jornales registrados en este período" : "Sin coincidencias"}
                  </td></tr>
                )}
                {filtered.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                    <td style={{ padding: "10px", fontSize: 12 }}>{r.fecha}</td>
                    <td style={{ padding: "10px", fontWeight: 600 }}>{r.nombre}</td>
                    <td style={{ padding: "10px", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{r.documento || "—"}</td>
                    <td style={{ padding: "10px", fontSize: 12 }}>{r.cargo || "—"}</td>
                    <td style={{ padding: "10px", fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{r.area || "—"}</td>
                    <td style={{ padding: "10px", fontSize: 12 }}>{r.horas}h</td>
                    <td style={{ padding: "10px", fontSize: 12, fontWeight: 600 }}>{COP(r.valor_dia)}</td>
                    <td style={{ padding: "10px", fontSize: 12, color: r.transporte > 0 ? B.sky : "rgba(255,255,255,0.3)" }}>{r.transporte > 0 ? COP(r.transporte) : "—"}</td>
                    <td style={{ padding: "10px", fontSize: 12, color: r.bonificacion > 0 ? B.sky : "rgba(255,255,255,0.3)" }}>{r.bonificacion > 0 ? COP(r.bonificacion) : "—"}</td>
                    <td style={{ padding: "10px", fontSize: 13, fontWeight: 700, color: B.sand }}>{COP(r.total)}</td>
                    <td style={{ padding: "10px", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{r.metodo_pago}</td>
                    <td style={{ padding: "10px" }}>
                      <button onClick={() => togglePagado(r)} style={{
                        fontSize: 10, padding: "3px 10px", borderRadius: 20,
                        background: r.pagado ? B.success + "33" : B.warning + "33",
                        color: r.pagado ? B.success : B.warning,
                        fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                        border: "none", cursor: "pointer",
                      }}>{r.pagado ? "Pagado" : "Pendiente"}</button>
                    </td>
                    <td style={{ padding: "10px", display: "flex", gap: 6 }}>
                      <button onClick={() => editar(r)} title="Editar" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13 }}>✎</button>
                      <button onClick={() => eliminar(r)} title="Eliminar" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 13 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            Mostrando {filtered.length} de {registros.length} jornales
          </div>
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div onClick={e => e.target === e.currentTarget && setShowForm(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, width: 600, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: B.white }}>{editing ? "Editar jornal" : "Nuevo jornal"}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "16px 24px" }}>
              {/* Selector de empleado existente (opcional) */}
              {empleadosLoggro.length > 0 && !editing && (
                <div style={{ marginBottom: 14 }}>
                  <label style={LS}>Empleado del catálogo (opcional)</label>
                  <select onChange={e => { const emp = empleadosLoggro.find(x => x.id === e.target.value); if (emp) selectEmpleado(emp); }}
                    value={form.empleado_loggro_id || ""} style={IS}>
                    <option value="">— Escribir manualmente —</option>
                    {empleadosLoggro.map(e => <option key={e.id} value={e.id}>{e.nombre_completo} · {e.cargo || "—"}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={LS}>Fecha *</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={IS} />
                </div>
                <div>
                  <label style={LS}>Horas</label>
                  <input type="number" step="0.5" value={form.horas} onChange={e => setForm(f => ({ ...f, horas: e.target.value }))} style={IS} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={LS}>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre completo" style={IS} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={LS}>Documento</label>
                  <input value={form.documento} onChange={e => setForm(f => ({ ...f, documento: e.target.value }))} style={IS} />
                </div>
                <div>
                  <label style={LS}>Cargo</label>
                  <input value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} style={IS} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={LS}>Área / Centro de costo</label>
                <input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="Ej: A&B, Mantenimiento, Lanchas…" style={IS} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={LS}>Valor día *</label>
                  <input type="number" step="0.01" value={form.valor_dia} onChange={e => setForm(f => ({ ...f, valor_dia: e.target.value }))} placeholder="0" style={IS} />
                </div>
                <div>
                  <label style={LS}>Transporte</label>
                  <input type="number" step="0.01" value={form.transporte} onChange={e => setForm(f => ({ ...f, transporte: e.target.value }))} style={IS} />
                </div>
                <div>
                  <label style={LS}>Bonificación</label>
                  <input type="number" step="0.01" value={form.bonificacion} onChange={e => setForm(f => ({ ...f, bonificacion: e.target.value }))} style={IS} />
                </div>
              </div>

              <div style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: B.sand }}>TOTAL</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: B.sand }}>
                  {COP((Number(form.valor_dia) || 0) + (Number(form.transporte) || 0) + (Number(form.bonificacion) || 0))}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={LS}>Método de pago</label>
                  <select value={form.metodo_pago} onChange={e => setForm(f => ({ ...f, metodo_pago: e.target.value }))} style={IS}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="nequi">Nequi / Daviplata</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label style={LS}>Estado</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setForm(f => ({ ...f, pagado: false }))}
                      style={{ flex: 1, padding: "10px", borderRadius: 8, border: `2px solid ${!form.pagado ? B.warning : "transparent"}`, background: !form.pagado ? B.warning + "22" : B.navyLight, color: !form.pagado ? B.warning : B.white, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Pendiente
                    </button>
                    <button onClick={() => setForm(f => ({ ...f, pagado: true }))}
                      style={{ flex: 1, padding: "10px", borderRadius: 8, border: `2px solid ${form.pagado ? B.success : "transparent"}`, background: form.pagado ? B.success + "22" : B.navyLight, color: form.pagado ? B.success : B.white, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Pagado
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={LS}>Notas</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ ...IS, resize: "vertical" }} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: "12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={guardar} disabled={saving}
                  style={{ flex: 2, padding: "12px", borderRadius: 8, border: "none", background: saving ? B.navyLight : B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
                  {saving ? "Guardando..." : editing ? "Guardar cambios" : "Registrar jornal"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
