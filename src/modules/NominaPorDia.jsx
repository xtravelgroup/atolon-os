// Nómina por Día — Flujo Solicitud → Aprobación → Ejecución.
//
// 3 estados en cada registro:
//   - solicitado  → supervisor del depto planifica (empleado, día, horas est., tarifa)
//   - aprobado    → gerente/admin/contabilidad revisa y OK'a (puede ajustar valores)
//   - ejecutado   → tras el turno, se registran horas reales (pueden diferir de las solicitadas)
//   - rechazado   → el aprobador descarta (con motivo)
// Solo lo `ejecutado` cuenta para el pago.
//
// Roles:
//   - Supervisor del depto (rh_departamentos.supervisor_email = user.email): solicita, marca ejecutado
//   - Admin (super_admin, gerente_general_*, contabilidad, admin, direccion): aprueba, ajusta valores,
//     ve todos los deptos, puede desaprobar/rechazar/pagar.

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";
import { logAccion } from "../lib/logAccion";

const IS = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${B.navyLight}`,
  color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box",
};
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const startOfMonth = () => { const d = new Date(); d.setDate(1); return d.toLocaleDateString("en-CA"); };
const endOfMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return d.toLocaleDateString("en-CA"); };

const ROLES_ADMIN_EXACTOS = new Set(["super_admin", "admin", "administrador", "contabilidad", "direccion"]);
const ROLES_ADMIN_PREFIJOS = ["gerente_general"];
function esRolAdmin(rolId) {
  const r = String(rolId || "").toLowerCase();
  if (ROLES_ADMIN_EXACTOS.has(r)) return true;
  return ROLES_ADMIN_PREFIJOS.some(p => r.startsWith(p));
}

const ESTADO_META = {
  solicitado: { label: "Solicitado", color: B.warning, icon: "⏳" },
  aprobado:   { label: "Aprobado",   color: B.sky,     icon: "✓" },
  ejecutado:  { label: "Ejecutado",  color: B.success, icon: "✅" },
  rechazado:  { label: "Rechazado",  color: B.danger,  icon: "✕" },
};

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${color || B.sand}`, minWidth: 180, flex: "1 1 180px" }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: B.white }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Badge({ estado }) {
  const m = ESTADO_META[estado] || ESTADO_META.solicitado;
  return (
    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: m.color + "22", color: m.color, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
      {m.icon} {m.label}
    </span>
  );
}

const emptyForm = {
  fecha: today(),
  nombre: "", documento: "", cargo: "", area: "", departamento_id: "",
  valor_dia: "", horas_solicitadas: 8, horas: 0,
  transporte: 0, bonificacion: 0,
  metodo_pago: "efectivo", notas: "",
  empleado_loggro_id: null,
};

export default function NominaPorDia() {
  const [registros, setRegistros] = useState([]);
  const [trabExtra, setTrabExtra] = useState([]);   // catálogo de trabajadores extra
  const [departamentos, setDepartamentos] = useState([]);
  // Modal nuevo/editar trabajador extra
  const [trabForm, setTrabForm] = useState(null);   // null = cerrado; obj = abierto
  const [savingTrab, setSavingTrab] = useState(false);
  const [currentUser, setCurrentUser] = useState({ email: "", rol: null });
  const [loading, setLoading] = useState(true);
  const [rangeFrom, setRangeFrom] = useState(startOfMonth());
  const [rangeTo, setRangeTo] = useState(endOfMonth());
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroDepto, setFiltroDepto] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  // Modal aprobación (permite ajustar valores)
  const [aprobar, setAprobar] = useState(null);
  const [aprobForm, setAprobForm] = useState({});
  // Modal ejecución (horas reales)
  const [ejecutar, setEjecutar] = useState(null);
  const [ejecForm, setEjecForm] = useState({ horas: 0, notas: "" });
  // Modal rechazo
  const [rechazar, setRechazar] = useState(null);
  const [motivoRech, setMotivoRech] = useState("");

  const esAdmin = esRolAdmin(currentUser.rol);

  // Cargar usuario actual
  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const email = sess?.session?.user?.email || "";
      if (!email) return;
      const { data: u } = await supabase.from("usuarios").select("rol_id, nombre").eq("email", email).maybeSingle();
      setCurrentUser({ email, rol: u?.rol_id || null, nombre: u?.nombre || "" });
    })();
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [regR, trabR, depR] = await Promise.all([
      supabase.from("nomina_por_dia").select("*")
        .gte("fecha", rangeFrom).lte("fecha", rangeTo)
        .order("fecha", { ascending: false }),
      // Catálogo de trabajadores EXTRA (eventuales/por día). NO son empleados
      // de nómina fija — solo aparece aquí lo que se agrega desde el botón
      // "Nuevo trabajador".
      supabase.from("trabajadores_extra")
        .select("id, nombre, documento, cargo, tarifa_dia_default, telefono, notas, activo")
        .eq("activo", true).order("nombre"),
      supabase.from("rh_departamentos").select("id, nombre, supervisor_email").order("nombre"),
    ]);
    setRegistros(regR.data || []);
    setTrabExtra(trabR.data || []);
    setDepartamentos(depR.data || []);
    setLoading(false);
  }, [rangeFrom, rangeTo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Deptos visibles según rol
  const deptosVisibles = useMemo(() => {
    if (esAdmin) return departamentos;
    const em = String(currentUser.email || "").toLowerCase();
    return departamentos.filter(d => String(d.supervisor_email || "").toLowerCase() === em);
  }, [departamentos, esAdmin, currentUser.email]);
  const deptosVisiblesIds = useMemo(() => new Set(deptosVisibles.map(d => d.id)), [deptosVisibles]);

  // Selecciona un trabajador extra del catálogo → pre-llena el form.
  // Solo datos identificatorios; la tarifa/día se define en cada solicitud
  // porque varía (evento distinto, cargo diferente, mercado, etc.).
  const selectTrabExtra = (t) => {
    setForm(f => ({
      ...f,
      empleado_loggro_id: t.id,
      nombre: t.nombre,
      documento: t.documento || "",
      cargo: t.cargo || "",
    }));
  };

  // Crear/editar trabajador extra
  const abrirNuevoTrab = () => setTrabForm({ id: null, nombre: "", documento: "", cargo: "", telefono: "", notas: "" });
  const abrirEditarTrab = (t) => setTrabForm({ id: t.id, nombre: t.nombre, documento: t.documento || "", cargo: t.cargo || "", telefono: t.telefono || "", notas: t.notas || "" });

  const guardarTrab = async () => {
    if (!trabForm) return;
    const nombre = String(trabForm.nombre || "").trim();
    if (!nombre) return alert("Nombre requerido");
    setSavingTrab(true);
    const payload = {
      nombre,
      documento: trabForm.documento?.trim() || null,
      cargo: trabForm.cargo?.trim() || null,
      telefono: trabForm.telefono?.trim() || null,
      notas: trabForm.notas?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (trabForm.id) {
      ({ error } = await supabase.from("trabajadores_extra").update(payload).eq("id", trabForm.id));
    } else {
      payload.created_by = currentUser.email || null;
      ({ error } = await supabase.from("trabajadores_extra").insert(payload));
    }
    setSavingTrab(false);
    if (error) {
      if (String(error.message || "").includes("duplicate") || error.code === "23505") {
        return alert("Ya existe un trabajador con ese documento.");
      }
      return alert("Error: " + error.message);
    }
    logAccion({ modulo: "nomina_por_dia", accion: trabForm.id ? "editar_trabajador_extra" : "crear_trabajador_extra",
                tabla: "trabajadores_extra", registroId: trabForm.id || nombre, notas: nombre });
    setTrabForm(null);
    fetchAll();
  };

  const desactivarTrab = async (t) => {
    if (!confirm(`¿Desactivar a "${t.nombre}" del catálogo? Los registros históricos se conservan.`)) return;
    await supabase.from("trabajadores_extra").update({ activo: false, updated_at: new Date().toISOString() }).eq("id", t.id);
    fetchAll();
  };

  // Crear/editar solicitud
  const guardarSolicitud = async () => {
    if (!form.nombre.trim()) return alert("Nombre es requerido");
    if (!form.valor_dia || Number(form.valor_dia) <= 0) return alert("Valor del día debe ser mayor a 0");
    if (!esAdmin && !form.departamento_id) return alert("Selecciona el departamento de la solicitud");
    if (!esAdmin && !deptosVisiblesIds.has(form.departamento_id)) {
      return alert("Solo puedes solicitar personal para tus departamentos.");
    }
    setSaving(true);
    const totalEstim = (Number(form.valor_dia) || 0) + (Number(form.transporte) || 0) + (Number(form.bonificacion) || 0);
    const horasSol = Number(form.horas_solicitadas) || 0;
    const nowIso = new Date().toISOString();
    const payload = {
      fecha: form.fecha,
      empleado_loggro_id: form.empleado_loggro_id || null,
      nombre: form.nombre.trim(),
      documento: form.documento || null,
      cargo: form.cargo || null,
      area: form.area || null,
      departamento_id: form.departamento_id || null,
      valor_dia: Number(form.valor_dia) || 0,
      horas_solicitadas: horasSol,
      horas: editing ? undefined : 0,     // horas reales se llenan al ejecutar
      transporte: Number(form.transporte) || 0,
      bonificacion: Number(form.bonificacion) || 0,
      total: totalEstim,
      metodo_pago: form.metodo_pago,
      notas: form.notas || null,
      updated_at: nowIso,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("nomina_por_dia").update(payload).eq("id", editing));
    } else {
      payload.estado = "solicitado";
      payload.solicitado_por = currentUser.email || null;
      payload.solicitado_at = nowIso;
      ({ error } = await supabase.from("nomina_por_dia").insert(payload));
    }
    setSaving(false);
    if (error) return alert("Error: " + error.message);
    logAccion({ modulo: "nomina_por_dia", accion: editing ? "editar_solicitud" : "crear_solicitud",
                tabla: "nomina_por_dia", registroId: editing || form.nombre,
                notas: `${form.fecha} · ${form.nombre} · ${COP(totalEstim)}` });
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
    fetchAll();
  };

  const editar = (r) => {
    if (r.estado === "ejecutado") return alert("Este registro ya fue ejecutado. No se puede editar.");
    if (r.estado === "aprobado" && !esAdmin) return alert("Ya está aprobado. Solo un admin puede modificarlo.");
    setEditing(r.id);
    setForm({
      fecha: r.fecha, nombre: r.nombre, documento: r.documento || "", cargo: r.cargo || "", area: r.area || "",
      departamento_id: r.departamento_id || "",
      valor_dia: r.valor_dia || "", horas_solicitadas: r.horas_solicitadas || r.horas || 8, horas: r.horas || 0,
      transporte: r.transporte || 0, bonificacion: r.bonificacion || 0,
      metodo_pago: r.metodo_pago || "efectivo", notas: r.notas || "",
      empleado_loggro_id: r.empleado_loggro_id,
    });
    setShowForm(true);
  };

  const eliminar = async (r) => {
    if (r.estado === "ejecutado") return alert("Ya ejecutado. No se puede eliminar.");
    if (r.estado === "aprobado" && !esAdmin) return alert("Ya aprobado. Solo admin.");
    if (!confirm(`¿Eliminar solicitud de ${r.nombre} del ${r.fecha}?`)) return;
    await supabase.from("nomina_por_dia").delete().eq("id", r.id);
    fetchAll();
  };

  // Abrir modal aprobar
  const abrirAprobar = (r) => {
    setAprobar(r);
    setAprobForm({
      valor_dia: r.valor_dia,
      horas_solicitadas: r.horas_solicitadas || r.horas || 8,
      transporte: r.transporte,
      bonificacion: r.bonificacion,
      notas_aprobacion: "",
    });
  };
  const confirmarAprobar = async () => {
    if (!aprobar) return;
    const totalEstim = (Number(aprobForm.valor_dia) || 0) + (Number(aprobForm.transporte) || 0) + (Number(aprobForm.bonificacion) || 0);
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("nomina_por_dia").update({
      estado: "aprobado",
      valor_dia: Number(aprobForm.valor_dia) || 0,
      horas_solicitadas: Number(aprobForm.horas_solicitadas) || 0,
      transporte: Number(aprobForm.transporte) || 0,
      bonificacion: Number(aprobForm.bonificacion) || 0,
      total: totalEstim,
      aprobado_por: currentUser.email,
      aprobado_at: nowIso,
      notas_aprobacion: aprobForm.notas_aprobacion || null,
      motivo_rechazo: null,
      updated_at: nowIso,
    }).eq("id", aprobar.id);
    if (error) return alert("Error: " + error.message);
    logAccion({ modulo: "nomina_por_dia", accion: "aprobar", tabla: "nomina_por_dia",
                registroId: aprobar.id, notas: `${aprobar.nombre} · ${aprobar.fecha}` });
    setAprobar(null);
    fetchAll();
  };

  // Desaprobar (vuelve a solicitado)
  const desaprobar = async (r) => {
    if (!esAdmin) return;
    if (!confirm(`¿Desaprobar la solicitud de ${r.nombre}? Volverá a estado 'solicitado'.`)) return;
    await supabase.from("nomina_por_dia").update({
      estado: "solicitado", aprobado_por: null, aprobado_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", r.id);
    fetchAll();
  };

  // Modal rechazar
  const confirmarRechazar = async () => {
    if (!rechazar) return;
    if (!motivoRech || motivoRech.trim().length < 3) return alert("Escribe el motivo (mín 3 caracteres)");
    const nowIso = new Date().toISOString();
    await supabase.from("nomina_por_dia").update({
      estado: "rechazado", motivo_rechazo: motivoRech.trim(),
      aprobado_por: currentUser.email, aprobado_at: nowIso, updated_at: nowIso,
    }).eq("id", rechazar.id);
    logAccion({ modulo: "nomina_por_dia", accion: "rechazar", tabla: "nomina_por_dia",
                registroId: rechazar.id, notas: motivoRech.slice(0, 80) });
    setRechazar(null); setMotivoRech("");
    fetchAll();
  };

  // Modal ejecutar
  const abrirEjecutar = (r) => {
    setEjecutar(r);
    setEjecForm({ horas: r.horas_solicitadas || r.horas || 8, notas: "" });
  };
  const confirmarEjecutar = async () => {
    if (!ejecutar) return;
    const horas = Number(ejecForm.horas);
    if (!Number.isFinite(horas) || horas <= 0) return alert("Horas debe ser > 0");
    const nowIso = new Date().toISOString();
    // Total se mantiene igual al aprobado (tarifa día + extras); las horas reales
    // son informativas y quedan auditadas. Si el operador quiere ajustar el valor,
    // el admin debe desaprobar y re-aprobar con nuevo valor.
    await supabase.from("nomina_por_dia").update({
      estado: "ejecutado",
      horas,
      ejecutado_por: currentUser.email,
      ejecutado_at: nowIso,
      notas: [ejecutar.notas, ejecForm.notas].filter(Boolean).join(" · ") || null,
      updated_at: nowIso,
    }).eq("id", ejecutar.id);
    logAccion({ modulo: "nomina_por_dia", accion: "ejecutar", tabla: "nomina_por_dia",
                registroId: ejecutar.id, notas: `${ejecutar.nombre} · ${horas}h reales (sol: ${ejecutar.horas_solicitadas}h)` });
    setEjecutar(null);
    fetchAll();
  };

  const togglePagado = async (r) => {
    if (!esAdmin) return alert("Solo admin puede marcar como pagado");
    await supabase.from("nomina_por_dia").update({ pagado: !r.pagado, updated_at: new Date().toISOString() }).eq("id", r.id);
    fetchAll();
  };

  // Filtros
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return registros.filter(r => {
      // Bloquear vista por depto si NO es admin
      if (!esAdmin && r.departamento_id && !deptosVisiblesIds.has(r.departamento_id)) return false;
      if (filtroDepto && r.departamento_id !== filtroDepto) return false;
      if (filtroEstado !== "todos" && r.estado !== filtroEstado) return false;
      if (!q) return true;
      return [r.nombre, r.documento, r.cargo, r.area].filter(Boolean).some(v => v.toLowerCase().includes(q));
    });
  }, [registros, filtroEstado, filtroDepto, search, esAdmin, deptosVisiblesIds]);

  // KPIs
  const kpis = useMemo(() => {
    const solicitadas = filtered.filter(r => r.estado === "solicitado");
    const aprobadas   = filtered.filter(r => r.estado === "aprobado");
    const ejecutadas  = filtered.filter(r => r.estado === "ejecutado");
    const totalEjec   = ejecutadas.reduce((s, r) => s + (Number(r.total) || 0), 0);
    return {
      solicitadas: solicitadas.length,
      aprobadas: aprobadas.length,
      ejecutadas: ejecutadas.length,
      totalEjec,
      pagado: ejecutadas.filter(r => r.pagado).reduce((s, r) => s + (Number(r.total) || 0), 0),
      pendientePago: ejecutadas.filter(r => !r.pagado).reduce((s, r) => s + (Number(r.total) || 0), 0),
    };
  }, [filtered]);

  const puedeCrear = esAdmin || deptosVisibles.length > 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: B.white, margin: 0 }}>Nómina por Día</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            Flujo: Solicitud (supervisor) → Aprobación (admin) → Ejecución (horas reales) → Pago
          </div>
        </div>
        {puedeCrear && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => { setEditing(null); setForm({ ...emptyForm, fecha: today(), departamento_id: deptosVisibles.length === 1 ? deptosVisibles[0].id : "" }); setShowForm(true); }}
              style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              + Solicitar personal
            </button>
            <button onClick={abrirNuevoTrab}
              title="Registrar un trabajador extra (eventual) en el catálogo"
              style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${B.sand}`, background: "transparent", color: B.sand, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              👥 Nuevo trabajador
            </button>
          </div>
        )}
        {!puedeCrear && (
          <div style={{ fontSize: 12, color: B.warning }}>⚠ No tienes departamentos asignados como supervisor.</div>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Kpi label="⏳ Solicitadas" value={kpis.solicitadas} sub="pendientes de aprobar" color={B.warning} />
        <Kpi label="✓ Aprobadas"    value={kpis.aprobadas}   sub="por ejecutar" color={B.sky} />
        <Kpi label="✅ Ejecutadas" value={kpis.ejecutadas}   sub="turnos realizados" color={B.success} />
        {esAdmin && (
          <>
            <Kpi label="Total ejecutado" value={COP(kpis.totalEjec)} sub="período" color={B.sand} />
            <Kpi label="Pendiente pago"  value={COP(kpis.pendientePago)} sub="ejecutado sin pagar" color={B.warning} />
          </>
        )}
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
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...IS, width: 200 }}>
          <option value="todos">Todos los estados</option>
          <option value="solicitado">Solo Solicitados</option>
          <option value="aprobado">Solo Aprobados</option>
          <option value="ejecutado">Solo Ejecutados</option>
          <option value="rechazado">Rechazados</option>
        </select>
        {(esAdmin || deptosVisibles.length > 1) && (
          <select value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)} style={{ ...IS, width: 200 }}>
            <option value="">Todos los deptos</option>
            {(esAdmin ? departamentos : deptosVisibles).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div style={{ padding: 40, color: B.sand, textAlign: "center" }}>Cargando…</div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
              <thead>
                <tr style={{ background: B.navyLight }}>
                  {["Fecha", "Persona", "Cargo", "Depto", "H. sol", "H. real", "Valor día", "Total", "Estado", "Acciones"].map(h => (
                    <th key={h} style={{ padding: "12px 10px", textAlign: "left", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.35)" }}>
                    {registros.length === 0 ? "Aún no hay solicitudes en este período" : "Sin coincidencias"}
                  </td></tr>
                )}
                {filtered.map(r => {
                  const depNombre = departamentos.find(d => d.id === r.departamento_id)?.nombre || r.area || "—";
                  const soySupervisor = deptosVisiblesIds.has(r.departamento_id) || !r.departamento_id;
                  const hDif = r.horas != null && r.horas_solicitadas != null && r.estado === "ejecutado"
                    ? Number(r.horas) - Number(r.horas_solicitadas) : null;
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                      <td style={{ padding: "10px", fontSize: 12 }}>{r.fecha}</td>
                      <td style={{ padding: "10px", fontWeight: 600 }}>
                        {r.nombre}
                        {r.documento && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>CC {r.documento}</div>}
                      </td>
                      <td style={{ padding: "10px", fontSize: 12 }}>{r.cargo || "—"}</td>
                      <td style={{ padding: "10px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{depNombre}</td>
                      <td style={{ padding: "10px", fontSize: 12 }}>{r.horas_solicitadas || 0}h</td>
                      <td style={{ padding: "10px", fontSize: 12, color: r.estado === "ejecutado" ? B.success : "rgba(255,255,255,0.3)" }}>
                        {r.estado === "ejecutado" ? `${r.horas || 0}h` : "—"}
                        {hDif != null && hDif !== 0 && <div style={{ fontSize: 9, color: hDif > 0 ? B.sand : B.warning }}>{hDif > 0 ? "+" : ""}{hDif.toFixed(1)}h vs sol</div>}
                      </td>
                      <td style={{ padding: "10px", fontSize: 12, fontWeight: 600 }}>{COP(r.valor_dia)}</td>
                      <td style={{ padding: "10px", fontSize: 13, fontWeight: 700, color: B.sand }}>{COP(r.total)}</td>
                      <td style={{ padding: "10px" }}>
                        <Badge estado={r.estado} />
                        {r.estado === "rechazado" && r.motivo_rechazo && (
                          <div style={{ fontSize: 9, color: B.danger, marginTop: 3 }} title={r.motivo_rechazo}>
                            {r.motivo_rechazo.slice(0, 30)}{r.motivo_rechazo.length > 30 ? "…" : ""}
                          </div>
                        )}
                        {r.estado === "ejecutado" && (
                          <button onClick={() => togglePagado(r)} disabled={!esAdmin}
                            style={{ marginTop: 4, display: "block", fontSize: 9, padding: "2px 8px", borderRadius: 20,
                              background: r.pagado ? B.success + "33" : B.warning + "33",
                              color: r.pagado ? B.success : B.warning,
                              fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                              border: "none", cursor: esAdmin ? "pointer" : "default", opacity: esAdmin ? 1 : 0.7 }}>
                            {r.pagado ? "Pagado" : "Sin pagar"}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {/* Estado solicitado */}
                          {r.estado === "solicitado" && esAdmin && (
                            <>
                              <button onClick={() => abrirAprobar(r)} title="Aprobar" style={btnMini(B.success)}>✓ Aprobar</button>
                              <button onClick={() => { setRechazar(r); setMotivoRech(""); }} title="Rechazar" style={btnMini(B.danger)}>✕</button>
                            </>
                          )}
                          {r.estado === "solicitado" && (soySupervisor || esAdmin) && (
                            <>
                              <button onClick={() => editar(r)} title="Editar" style={btnMini(B.navyLight, "rgba(255,255,255,0.6)")}>✎</button>
                              <button onClick={() => eliminar(r)} title="Eliminar" style={btnMini(B.navyLight, B.danger)}>🗑</button>
                            </>
                          )}
                          {/* Estado aprobado */}
                          {r.estado === "aprobado" && (
                            <button onClick={() => abrirEjecutar(r)} title="Marcar ejecutado" style={btnMini(B.sky)}>✅ Ejecutar</button>
                          )}
                          {r.estado === "aprobado" && esAdmin && (
                            <button onClick={() => desaprobar(r)} title="Desaprobar" style={btnMini(B.warning, B.navy)}>↺</button>
                          )}
                          {/* Estado ejecutado o rechazado — solo admin puede eliminar */}
                          {(r.estado === "ejecutado" || r.estado === "rechazado") && esAdmin && (
                            <button onClick={async () => {
                              if (!confirm(`¿Eliminar registro de ${r.nombre}?`)) return;
                              await supabase.from("nomina_por_dia").delete().eq("id", r.id);
                              fetchAll();
                            }} title="Eliminar" style={btnMini(B.navyLight, B.danger)}>🗑</button>
                          )}
                          {r.estado === "rechazado" && (soySupervisor || esAdmin) && (
                            <button onClick={async () => {
                              await supabase.from("nomina_por_dia").update({ estado: "solicitado", motivo_rechazo: null, updated_at: new Date().toISOString() }).eq("id", r.id);
                              fetchAll();
                            }} title="Reabrir" style={btnMini(B.sky)}>↻ Reabrir</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${B.navyLight}`, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            Mostrando {filtered.length} de {registros.length}
          </div>
        </div>
      )}

      {/* Modal SOLICITAR / EDITAR */}
      {showForm && (
        <div onClick={e => e.target === e.currentTarget && setShowForm(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, width: 620, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: B.white }}>{editing ? "Editar solicitud" : "Nueva solicitud de personal"}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "16px 24px" }}>
              {!editing && (
                <div style={{ marginBottom: 14 }}>
                  <label style={LS}>Trabajador extra del catálogo (opcional)</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select onChange={e => { const t = trabExtra.find(x => x.id === e.target.value); if (t) selectTrabExtra(t); }}
                      value={form.empleado_loggro_id || ""} style={{ ...IS, flex: 1 }}>
                      <option value="">— Escribir manualmente —</option>
                      {trabExtra.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}{t.cargo ? ` · ${t.cargo}` : ""}{t.documento ? ` · CC ${t.documento}` : ""}
                        </option>
                      ))}
                    </select>
                    <button onClick={abrirNuevoTrab} type="button"
                      title="Agregar nuevo trabajador al catálogo"
                      style={{ padding: "0 14px", borderRadius: 8, background: B.sand + "22", border: `1px solid ${B.sand}55`, color: B.sand, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      + Nuevo
                    </button>
                  </div>
                  {trabExtra.length === 0 && (
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                      Aún no hay trabajadores extra registrados. Usa "+ Nuevo" para crear el primero.
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={LS}>Fecha *</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={IS} />
                </div>
                <div>
                  <label style={LS}>Horas solicitadas *</label>
                  <input type="number" step="0.5" value={form.horas_solicitadas} onChange={e => setForm(f => ({ ...f, horas_solicitadas: e.target.value }))} style={IS} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={LS}>Departamento *</label>
                <select value={form.departamento_id} onChange={e => setForm(f => ({ ...f, departamento_id: e.target.value }))} style={IS}>
                  <option value="">— Selecciona —</option>
                  {(esAdmin ? departamentos : deptosVisibles).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={LS}>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre completo del trabajador" style={IS} />
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
                <span style={{ fontSize: 12, color: B.sand }}>TOTAL ESTIMADO</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: B.sand }}>
                  {COP((Number(form.valor_dia) || 0) + (Number(form.transporte) || 0) + (Number(form.bonificacion) || 0))}
                </span>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={LS}>Método de pago (referencial)</label>
                <select value={form.metodo_pago} onChange={e => setForm(f => ({ ...f, metodo_pago: e.target.value }))} style={IS}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="nequi">Nequi / Daviplata</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={LS}>Notas / justificación</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Ej: refuerzo para evento Beach Day Sandra y Camilo"
                  style={{ ...IS, resize: "vertical" }} />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: "12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={guardarSolicitud} disabled={saving}
                  style={{ flex: 2, padding: "12px", borderRadius: 8, border: "none", background: saving ? B.navyLight : B.sky, color: B.navy, fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
                  {saving ? "Guardando…" : editing ? "Guardar cambios" : "Enviar solicitud"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal APROBAR */}
      {aprobar && (
        <ModalCentrado onClose={() => setAprobar(null)} title={`Aprobar: ${aprobar.nombre}`}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
            {aprobar.fecha} · {aprobar.cargo || "—"} · Solicitado por {aprobar.solicitado_por || "—"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={LS}>Valor día</label><input type="number" step="0.01" value={aprobForm.valor_dia} onChange={e => setAprobForm(f => ({ ...f, valor_dia: e.target.value }))} style={IS} /></div>
            <div><label style={LS}>Horas solicitadas</label><input type="number" step="0.5" value={aprobForm.horas_solicitadas} onChange={e => setAprobForm(f => ({ ...f, horas_solicitadas: e.target.value }))} style={IS} /></div>
            <div><label style={LS}>Transporte</label><input type="number" step="0.01" value={aprobForm.transporte} onChange={e => setAprobForm(f => ({ ...f, transporte: e.target.value }))} style={IS} /></div>
            <div><label style={LS}>Bonificación</label><input type="number" step="0.01" value={aprobForm.bonificacion} onChange={e => setAprobForm(f => ({ ...f, bonificacion: e.target.value }))} style={IS} /></div>
          </div>
          <div style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: B.sand }}>TOTAL APROBADO</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: B.sand }}>
              {COP((Number(aprobForm.valor_dia) || 0) + (Number(aprobForm.transporte) || 0) + (Number(aprobForm.bonificacion) || 0))}
            </span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={LS}>Notas del aprobador (opcional)</label>
            <textarea rows={2} value={aprobForm.notas_aprobacion} onChange={e => setAprobForm(f => ({ ...f, notas_aprobacion: e.target.value }))}
              style={{ ...IS, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setAprobar(null)} style={{ flex: 1, padding: 12, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.55)", cursor: "pointer" }}>Cancelar</button>
            <button onClick={confirmarAprobar} style={{ flex: 2, padding: 12, borderRadius: 8, border: "none", background: B.success, color: "#fff", fontWeight: 700, cursor: "pointer" }}>✓ Aprobar</button>
          </div>
        </ModalCentrado>
      )}

      {/* Modal EJECUTAR */}
      {ejecutar && (
        <ModalCentrado onClose={() => setEjecutar(null)} title={`Ejecutar turno: ${ejecutar.nombre}`}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
            {ejecutar.fecha} · Aprobado por {ejecutar.aprobado_por || "—"} · Solicitadas {ejecutar.horas_solicitadas}h
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={LS}>Horas reales trabajadas *</label>
            <input type="number" step="0.25" value={ejecForm.horas} onChange={e => setEjecForm(f => ({ ...f, horas: e.target.value }))} style={IS} autoFocus />
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
              Se guardan las horas reales para auditoría. El monto pagado sigue siendo el aprobado ({COP(ejecutar.total)}).
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={LS}>Notas de ejecución (opcional)</label>
            <textarea rows={2} value={ejecForm.notas} onChange={e => setEjecForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Ej: se quedó 1h extra por evento" style={{ ...IS, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setEjecutar(null)} style={{ flex: 1, padding: 12, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.55)", cursor: "pointer" }}>Cancelar</button>
            <button onClick={confirmarEjecutar} style={{ flex: 2, padding: 12, borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontWeight: 700, cursor: "pointer" }}>✅ Confirmar ejecución</button>
          </div>
        </ModalCentrado>
      )}

      {/* Modal TRABAJADOR EXTRA */}
      {trabForm && (
        <ModalCentrado onClose={() => !savingTrab && setTrabForm(null)} title={trabForm.id ? "Editar trabajador" : "Nuevo trabajador extra"}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
            Catálogo de personal eventual (por día). No mezclar con nómina fija.
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={LS}>Nombre completo *</label>
            <input value={trabForm.nombre} onChange={e => setTrabForm(f => ({ ...f, nombre: e.target.value }))} style={IS} autoFocus />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={LS}>Documento</label>
              <input value={trabForm.documento} onChange={e => setTrabForm(f => ({ ...f, documento: e.target.value }))} placeholder="CC / pasaporte" style={IS} />
            </div>
            <div>
              <label style={LS}>Teléfono</label>
              <input value={trabForm.telefono} onChange={e => setTrabForm(f => ({ ...f, telefono: e.target.value }))} style={IS} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={LS}>Cargo típico</label>
            <input value={trabForm.cargo} onChange={e => setTrabForm(f => ({ ...f, cargo: e.target.value }))} placeholder="Ej: mesero refuerzo, oficios varios..." style={IS} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={LS}>Notas</label>
            <textarea rows={2} value={trabForm.notas} onChange={e => setTrabForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Contacto, referencias, especialidad..." style={{ ...IS, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setTrabForm(null)} disabled={savingTrab}
              style={{ flex: 1, padding: 12, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.55)", cursor: savingTrab ? "not-allowed" : "pointer" }}>Cancelar</button>
            {trabForm.id && (
              <button onClick={() => { desactivarTrab({ id: trabForm.id, nombre: trabForm.nombre }); setTrabForm(null); }} disabled={savingTrab}
                style={{ padding: "12px 18px", borderRadius: 8, border: "none", background: B.danger + "22", color: B.danger, fontWeight: 700, cursor: savingTrab ? "not-allowed" : "pointer" }}>Desactivar</button>
            )}
            <button onClick={guardarTrab} disabled={savingTrab}
              style={{ flex: 2, padding: 12, borderRadius: 8, border: "none", background: savingTrab ? B.navyLight : B.sand, color: B.navy, fontWeight: 700, cursor: savingTrab ? "default" : "pointer" }}>
              {savingTrab ? "Guardando…" : trabForm.id ? "Guardar cambios" : "+ Agregar al catálogo"}
            </button>
          </div>
        </ModalCentrado>
      )}

      {/* Modal RECHAZAR */}
      {rechazar && (
        <ModalCentrado onClose={() => setRechazar(null)} title={`Rechazar: ${rechazar.nombre}`}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
            {rechazar.fecha} · {COP(rechazar.total)} · Solicitado por {rechazar.solicitado_por || "—"}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={LS}>Motivo del rechazo *</label>
            <textarea rows={3} value={motivoRech} onChange={e => setMotivoRech(e.target.value)}
              placeholder="Ej: no aprobado — ya está cubierto por planilla" style={{ ...IS, resize: "vertical" }} autoFocus />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setRechazar(null)} style={{ flex: 1, padding: 12, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.55)", cursor: "pointer" }}>Cancelar</button>
            <button onClick={confirmarRechazar} style={{ flex: 2, padding: 12, borderRadius: 8, border: "none", background: B.danger, color: "#fff", fontWeight: 700, cursor: "pointer" }}>✕ Rechazar</button>
          </div>
        </ModalCentrado>
      )}
    </div>
  );
}

// Botón pequeño estándar (píldora)
function btnMini(bg, color = "#fff") {
  return {
    fontSize: 10, padding: "4px 8px", borderRadius: 6,
    background: bg, color,
    fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap",
  };
}

// Modal genérico centrado
function ModalCentrado({ onClose, title, children }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, width: 520, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: B.white }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "16px 24px" }}>{children}</div>
      </div>
    </div>
  );
}
