// RecursosHumanos.jsx — Módulo RRHH Atolon Beach Club
// Legislación: Código Sustantivo del Trabajo (Colombia)
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { B, COP, todayStr, fmtFecha } from "../brand";

// ─── Constantes Legales Colombia 2026 ────────────────────────────────────────
const SMMLV         = 1423500;   // Salario Mínimo Mensual Legal Vigente 2026
const AUX_TRANSPORTE = 200000;  // Auxilio de transporte 2026
const ARL_TASAS     = { 1: 0.00522, 2: 0.01044, 3: 0.02436, 4: 0.04350, 5: 0.06960 };

// ─── Cálculo Nómina Colombiana ────────────────────────────────────────────────
function calcNomina(emp) {
  const s = emp.salario_base || 0;
  if (emp.tipo_contrato === "prestacion_servicios") {
    return { salario: s, esPrestacion: true, salarioNeto: s, costoTotal: s };
  }
  const auxT  = s <= 2 * SMMLV ? AUX_TRANSPORTE : 0;
  const base  = s + auxT;
  // Prestaciones (base incluye aux transporte para cesantías y prima)
  const cesantias    = base * 0.0833;
  const intCesantias = cesantias * 0.01;     // provisión mensual ≈ 1%
  const prima        = base * 0.0833;
  const vacaciones   = s * 0.0417;           // solo salario, sin aux transporte
  // Aportes empleador
  const aEps     = s * 0.085;
  const aPension = s * 0.12;
  const aArl     = s * (ARL_TASAS[emp.nivel_riesgo_arl || 1]);
  const aSena    = s * 0.02;
  const aIcbf    = s * 0.03;
  const aCaja    = s * 0.04;
  // Deducciones empleado
  const dEps     = s * 0.04;
  const dPension = s * 0.04;

  const totalPrest    = cesantias + intCesantias + prima + vacaciones;
  const totalEmpl     = aEps + aPension + aArl + aSena + aIcbf + aCaja;
  const totalDed      = dEps + dPension;
  const salarioNeto   = base - totalDed;
  const costoTotal    = s + auxT + totalPrest + totalEmpl;

  return {
    salario: s, auxT, base, cesantias, intCesantias, prima, vacaciones, totalPrest,
    aEps, aPension, aArl, aSena, aIcbf, aCaja, totalEmpl,
    dEps, dPension, totalDed, salarioNeto, costoTotal, esPrestacion: false,
  };
}

// ─── Helpers Visuales ────────────────────────────────────────────────────────
const IS = { background: "#1E3566", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "9px 12px", color: "#fff", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase",
  letterSpacing: "0.06em", marginBottom: 4, display: "block" };
const BTN = (col = B.sky) => ({
  background: col, color: col === "#fff" ? B.navy : "#fff", border: "none",
  borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
});
const BADGE_COLORS = {
  activo:        { bg: "#1a3d2a", color: B.success },
  inactivo:      { bg: "#3d1a1a", color: B.danger },
  vacaciones:    { bg: "#2a2a1a", color: B.warning },
  licencia:      { bg: "#1a2a3d", color: B.sky },
  prueba:        { bg: "#2a1a3d", color: "#c4b5fd" },
  presente:      { bg: "#1a3d2a", color: B.success },
  ausente:       { bg: "#3d1a1a", color: B.danger },
  tardanza:      { bg: "#3d2a1a", color: B.warning },
  permiso:       { bg: "#1a2a3d", color: B.sky },
  incapacidad:   { bg: "#2a1a1a", color: "#f87171" },
  indefinido:    { bg: "#1a3d2a", color: B.success },
  termino_fijo:  { bg: "#2a2a1a", color: B.warning },
  obra_labor:    { bg: "#1a2a3d", color: B.sky },
  prestacion_servicios: { bg: "#3d1a3d", color: "#d8b4fe" },
  abierta:  { bg: "#1a3d2a", color: B.success },
  pausada:  { bg: "#2a2a1a", color: B.warning },
  cerrada:  { bg: "#1a1a1a", color: "rgba(255,255,255,0.4)" },
  Urgente:  { bg: "#3d1a1a", color: B.danger },
  Alta:     { bg: "#3d2a1a", color: B.warning },
  Media:    { bg: "#1a2a3d", color: B.sky },
  Baja:     { bg: "#1a1a2a", color: "rgba(255,255,255,0.4)" },
  aplicado:          { bg: "#1a2a3d", color: B.sky },
  entrevista_rh:     { bg: "#2a1a3d", color: "#c4b5fd" },
  prueba_tecnica:    { bg: "#2a2a1a", color: B.warning },
  entrevista_final:  { bg: "#1a2a2a", color: "#34d399" },
  oferta:            { bg: "#3d2a1a", color: B.warning },
  contratado:        { bg: "#1a3d2a", color: B.success },
  descartado:        { bg: "#1a1a1a", color: "rgba(255,255,255,0.3)" },
};

function Badge({ val, label }) {
  const c = BADGE_COLORS[val] || { bg: "#1a2a3d", color: B.sky };
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 20, padding: "3px 10px",
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {label || val}
    </span>
  );
}

function Avatar({ nombres, apellidos, color = B.sky, size = 36 }) {
  const initials = ((nombres||"")[0]||"") + ((apellidos||"")[0]||"");
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color + "33",
      border: `2px solid ${color}66`, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 800, color, flexShrink: 0, letterSpacing: -1 }}>
      {initials.toUpperCase()}
    </div>
  );
}

function StatCard({ label, value, sub, color = B.sky, icon }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px",
      borderLeft: `4px solid ${color}`, flex: "1 1 180px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
        {icon && <span style={{ marginRight: 6 }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, width: "100%", maxWidth: 680,
        maxHeight: "90vh", overflowY: "auto", padding: 28 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, half }) {
  return (
    <div style={{ gridColumn: half ? "span 1" : "span 2" }}>
      <label style={LS}>{label}</label>
      {children}
    </div>
  );
}

function Sel({ value, onChange, children, ...rest }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...IS, appearance: "none" }} {...rest}>
      {children}
    </select>
  );
}

function Inp({ value, onChange, type = "text", ...rest }) {
  return (
    <input type={type} value={value || ""} onChange={e => onChange(e.target.value)}
      style={IS} {...rest} />
  );
}

const AVATAR_COLORS = ["#8ECAE6","#4CAF7D","#E8A020","#F4C6D0","#C8B99A","#a78bfa","#34d399","#fb923c"];
const DEPT_COLORS   = ["#8ECAE6","#4CAF7D","#E8A020","#F4C6D0","#C8B99A","#a78bfa","#34d399","#fb923c","#f43f5e","#38bdf8"];

// ─── MODAL EMPLEADO ──────────────────────────────────────────────────────────
const EMPTY_EMP = {
  nombres:"", apellidos:"", cedula:"", fecha_nacimiento:"",
  email:"", telefono:"", direccion:"", ciudad:"Cartagena",
  cargo:"", departamento_id:"", jefe_id:"", tipo_contrato:"indefinido",
  fecha_ingreso:"", fecha_fin_contrato:"", periodo_prueba_fin:"",
  salario_base: SMMLV, modalidad_pago:"quincenal",
  banco:"", cuenta_bancaria:"", tipo_cuenta:"ahorros",
  eps:"", fondo_pension:"", fondo_cesantias:"", arl:"Positiva",
  caja_compensacion:"Comfamiliar", nivel_riesgo_arl:1,
  activo:true, avatar_color: AVATAR_COLORS[0], notas:"", usuario_id:"",
};

function EmpleadoModal({ emp, depts, empleados, usuarios, onSave, onClose }) {
  const isNew = !emp?.id;
  const [form, setForm] = useState(isNew ? EMPTY_EMP : { ...EMPTY_EMP, ...emp });
  const [tabM, setTabM] = useState("personal");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFechaIngreso = (v) => {
    set("fecha_ingreso", v);
    if (v) {
      const d = new Date(v + "T12:00:00");
      d.setDate(d.getDate() + 60);
      set("periodo_prueba_fin", d.toISOString().slice(0, 10));
    }
  };

  const save = async () => {
    if (!form.nombres || !form.apellidos || !form.cargo) return alert("Nombres, apellidos y cargo son obligatorios");
    setSaving(true);
    // Only send known DB columns, converting empty strings to null
    const str  = (v) => v && String(v).trim() ? String(v).trim() : null;
    const payload = {
      nombres:            form.nombres.trim(),
      apellidos:          form.apellidos.trim(),
      cedula:             str(form.cedula),
      fecha_nacimiento:   str(form.fecha_nacimiento) || null,
      email:              str(form.email),
      telefono:           str(form.telefono),
      direccion:          str(form.direccion),
      ciudad:             str(form.ciudad) || "Cartagena",
      cargo:              form.cargo.trim(),
      departamento_id:    str(form.departamento_id) || null,
      jefe_id:            str(form.jefe_id) || null,
      usuario_id:         str(form.usuario_id) || null,
      tipo_contrato:      str(form.tipo_contrato) || "indefinido",
      fecha_ingreso:      str(form.fecha_ingreso) || null,
      fecha_fin_contrato: str(form.fecha_fin_contrato) || null,
      periodo_prueba_fin: str(form.periodo_prueba_fin) || null,
      salario_base:       Number(form.salario_base) || SMMLV,
      modalidad_pago:     str(form.modalidad_pago) || "quincenal",
      banco:              str(form.banco),
      cuenta_bancaria:    str(form.cuenta_bancaria),
      tipo_cuenta:        str(form.tipo_cuenta),
      eps:                str(form.eps),
      fondo_pension:      str(form.fondo_pension),
      fondo_cesantias:    str(form.fondo_cesantias),
      arl:                str(form.arl) || "Positiva",
      caja_compensacion:  str(form.caja_compensacion) || "Comfamiliar",
      nivel_riesgo_arl:   Number(form.nivel_riesgo_arl) || 1,
      activo:             form.activo !== false,
      avatar_color:       form.avatar_color || AVATAR_COLORS[0],
      notas:              str(form.notas),
      updated_at:         new Date().toISOString(),
    };
    console.log("[RH] Payload a guardar:", JSON.stringify(payload));
    const { error } = isNew
      ? await supabase.from("rh_empleados").insert(payload)
      : await supabase.from("rh_empleados").update(payload).eq("id", emp.id);
    setSaving(false);
    if (error) return alert("Error guardando empleado: " + error.message);
    onSave();
  };

  const tabs = [
    { key: "personal", label: "Personal" },
    { key: "laboral",  label: "Laboral" },
    { key: "economia", label: "Económico" },
    { key: "segsal",   label: "Seg. Social" },
  ];

  const col = form.avatar_color || AVATAR_COLORS[0];

  return (
    <Overlay onClose={onClose}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar nombres={form.nombres} apellidos={form.apellidos} color={col} size={44} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{isNew ? "Nuevo Empleado" : `${form.nombres} ${form.apellidos}`}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{isNew ? "Completar información" : form.cargo}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer" }}>✕</button>
      </div>

      {/* Avatar color */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {AVATAR_COLORS.map(c => (
          <div key={c} onClick={() => set("avatar_color", c)}
            style={{ width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer",
              border: col === c ? `3px solid #fff` : "2px solid transparent" }} />
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${B.navyLight}`, paddingBottom: 12 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTabM(t.key)} style={{
            background: tabM === t.key ? B.navyLight : "none",
            border: "none", color: tabM === t.key ? "#fff" : "rgba(255,255,255,0.4)",
            borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {tabM === "personal" && <>
          <Field label="Nombres *" half><Inp value={form.nombres} onChange={v => set("nombres", v)} /></Field>
          <Field label="Apellidos *" half><Inp value={form.apellidos} onChange={v => set("apellidos", v)} /></Field>
          <Field label="Cédula" half><Inp value={form.cedula} onChange={v => set("cedula", v)} /></Field>
          <Field label="Fecha Nacimiento" half><Inp type="date" value={form.fecha_nacimiento} onChange={v => set("fecha_nacimiento", v)} /></Field>
          <Field label="Ciudad" half><Inp value={form.ciudad} onChange={v => set("ciudad", v)} /></Field>
          <Field label="Email" half><Inp type="email" value={form.email} onChange={v => set("email", v)} /></Field>
          <Field label="Teléfono" half><Inp value={form.telefono} onChange={v => set("telefono", v)} /></Field>
          <Field label="Dirección"><Inp value={form.direccion} onChange={v => set("direccion", v)} /></Field>
          <Field label="Estado" half>
            <Sel value={form.activo ? "activo" : "inactivo"} onChange={v => set("activo", v === "activo")}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </Sel>
          </Field>
        </>}

        {tabM === "laboral" && <>
          <Field label="Cargo *"><Inp value={form.cargo} onChange={v => set("cargo", v)} /></Field>
          <Field label="Departamento" half>
            <Sel value={form.departamento_id || ""} onChange={v => set("departamento_id", v)}>
              <option value="">Sin departamento</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </Sel>
          </Field>
          <Field label="Reporta a" half>
            <Sel value={form.jefe_id || ""} onChange={v => set("jefe_id", v)}>
              <option value="">Sin jefe directo</option>
              {empleados.filter(e => e.id !== emp?.id).map(e => (
                <option key={e.id} value={e.id}>{e.nombres} {e.apellidos} — {e.cargo}</option>
              ))}
            </Sel>
          </Field>
          <Field label="Usuario del sistema" half>
            <Sel value={form.usuario_id || ""} onChange={v => set("usuario_id", v)}>
              <option value="">Sin usuario vinculado</option>
              {(usuarios || []).map(u => (
                <option key={u.id} value={u.id}>{u.nombre} — {u.email}</option>
              ))}
            </Sel>
          </Field>
          <Field label="Tipo de Contrato" half>
            <Sel value={form.tipo_contrato} onChange={v => set("tipo_contrato", v)}>
              <option value="indefinido">Término Indefinido</option>
              <option value="termino_fijo">Término Fijo</option>
              <option value="obra_labor">Obra o Labor</option>
              <option value="prestacion_servicios">Prestación de Servicios</option>
            </Sel>
          </Field>
          <Field label="Fecha de Ingreso" half>
            <Inp type="date" value={form.fecha_ingreso} onChange={handleFechaIngreso} />
          </Field>
          {form.tipo_contrato === "termino_fijo" && (
            <Field label="Fin de Contrato" half>
              <Inp type="date" value={form.fecha_fin_contrato} onChange={v => set("fecha_fin_contrato", v)} />
            </Field>
          )}
          <Field label="Fin Período de Prueba (máx. 2 meses)" half>
            <Inp type="date" value={form.periodo_prueba_fin} onChange={v => set("periodo_prueba_fin", v)} />
          </Field>
          <Field label="Notas internas">
            <textarea value={form.notas || ""} onChange={e => set("notas", e.target.value)}
              rows={3} style={{ ...IS, resize: "vertical" }} />
          </Field>
        </>}

        {tabM === "economia" && <>
          <Field label={`Salario Base (SMMLV = ${COP(SMMLV)})`}>
            <Inp type="number" value={form.salario_base} onChange={v => set("salario_base", v)} />
            {Number(form.salario_base) <= 2 * SMMLV && (
              <div style={{ fontSize: 11, color: B.warning, marginTop: 4 }}>
                ✓ Aplica auxilio de transporte {COP(AUX_TRANSPORTE)} — Total devengado {COP(Number(form.salario_base) + AUX_TRANSPORTE)}
              </div>
            )}
            {form.tipo_contrato === "prestacion_servicios" && (
              <div style={{ fontSize: 11, color: "#d8b4fe", marginTop: 4 }}>
                ℹ Prestación de servicios — Sin prestaciones ni aportes de nómina
              </div>
            )}
          </Field>
          <Field label="Periodicidad de Pago" half>
            <Sel value={form.modalidad_pago} onChange={v => set("modalidad_pago", v)}>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
            </Sel>
          </Field>
          <Field label="Banco" half><Inp value={form.banco} onChange={v => set("banco", v)} /></Field>
          <Field label="Número de Cuenta" half><Inp value={form.cuenta_bancaria} onChange={v => set("cuenta_bancaria", v)} /></Field>
          <Field label="Tipo de Cuenta" half>
            <Sel value={form.tipo_cuenta} onChange={v => set("tipo_cuenta", v)}>
              <option value="ahorros">Ahorros</option>
              <option value="corriente">Corriente</option>
            </Sel>
          </Field>
        </>}

        {tabM === "segsal" && <>
          <Field label="EPS (Salud)" half><Inp value={form.eps} onChange={v => set("eps", v)} /></Field>
          <Field label="Fondo de Pensiones (AFP)" half><Inp value={form.fondo_pension} onChange={v => set("fondo_pension", v)} /></Field>
          <Field label="Fondo de Cesantías" half><Inp value={form.fondo_cesantias} onChange={v => set("fondo_cesantias", v)} /></Field>
          <Field label="ARL" half><Inp value={form.arl} onChange={v => set("arl", v)} /></Field>
          <Field label="Nivel de Riesgo ARL (1–5)" half>
            <Sel value={form.nivel_riesgo_arl} onChange={v => set("nivel_riesgo_arl", v)}>
              <option value={1}>Nivel I — 0.522% (Oficina)</option>
              <option value={2}>Nivel II — 1.044% (Comercio)</option>
              <option value={3}>Nivel III — 2.436% (Transporte/Náutico)</option>
              <option value={4}>Nivel IV — 4.350% (Construcción)</option>
              <option value={5}>Nivel V — 6.960% (Alto riesgo)</option>
            </Sel>
          </Field>
          <Field label="Caja de Compensación" half><Inp value={form.caja_compensacion} onChange={v => set("caja_compensacion", v)} /></Field>
        </>}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button onClick={onClose} style={{ ...BTN("transparent"), border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)" }}>Cancelar</button>
        <button onClick={save} disabled={saving} style={BTN(B.success)}>{saving ? "Guardando…" : isNew ? "Crear Empleado" : "Guardar Cambios"}</button>
      </div>
    </Overlay>
  );
}

// ─── TAB: DEPARTAMENTOS ───────────────────────────────────────────────────────
function TabDepartamentos({ depts, empleados, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "", color: DEPT_COLORS[0], jefe_id: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const headcountMap = useMemo(() => {
    const m = {};
    empleados.forEach(e => {
      if (e.departamento_id) m[e.departamento_id] = (m[e.departamento_id] || 0) + 1;
    });
    return m;
  }, [empleados]);

  const openNew = () => { setEditDept(null); setForm({ nombre: "", descripcion: "", color: DEPT_COLORS[0], jefe_id: "" }); setShowModal(true); };
  const openEdit = (d) => { setEditDept(d); setForm({ nombre: d.nombre, descripcion: d.descripcion||"", color: d.color, jefe_id: d.jefe_id||"" }); setShowModal(true); };

  const save = async () => {
    if (!form.nombre) return alert("Nombre del departamento es obligatorio");
    const payload = { ...form, jefe_id: form.jefe_id || null };
    const { error } = editDept
      ? await supabase.from("rh_departamentos").update(payload).eq("id", editDept.id)
      : await supabase.from("rh_departamentos").insert(payload);
    if (error) return alert("Error guardando departamento: " + error.message);
    setShowModal(false);
    onRefresh();
  };

  const jefeName = (d) => {
    const e = empleados.find(x => x.id === d.jefe_id);
    return e ? `${e.nombres} ${e.apellidos}` : "—";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: B.sand }}>Departamentos ({depts.length})</div>
        <button onClick={openNew} style={BTN(B.success)}>+ Nuevo Departamento</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {depts.map(d => (
          <div key={d.id} onClick={() => openEdit(d)}
            style={{ background: B.navy, borderRadius: 14, padding: "20px", borderLeft: `5px solid ${d.color}`,
              cursor: "pointer", transition: "opacity 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.opacity="0.85"}
            onMouseLeave={e => e.currentTarget.style.opacity="1"}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
              <div style={{ fontSize: 16, fontWeight: 800 }}>{d.nombre}</div>
            </div>
            {d.descripcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>{d.descripcion}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>👤 {headcountMap[d.id] || 0} empleados</span>
              <span style={{ color: d.color }}>Jefe: {jefeName(d)}</span>
            </div>
          </div>
        ))}
        {depts.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
            No hay departamentos. Crea el primero.
          </div>
        )}
      </div>

      {showModal && (
        <Overlay onClose={() => setShowModal(false)}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{editDept ? "Editar Departamento" : "Nuevo Departamento"}</div>
            <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Nombre *</label>
              <Inp value={form.nombre} onChange={v => set("nombre", v)} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Descripción</label>
              <Inp value={form.descripcion} onChange={v => set("descripcion", v)} />
            </div>
            <div>
              <label style={LS}>Color</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                {DEPT_COLORS.map(c => (
                  <div key={c} onClick={() => set("color", c)}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer",
                      border: form.color === c ? "3px solid #fff" : "2px solid transparent" }} />
                ))}
              </div>
            </div>
            <div>
              <label style={LS}>Jefe del Departamento</label>
              <Sel value={form.jefe_id || ""} onChange={v => set("jefe_id", v)}>
                <option value="">Sin jefe asignado</option>
                {empleados.filter(e => e.activo).map(e => (
                  <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>
                ))}
              </Sel>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowModal(false)} style={{ ...BTN("transparent"), border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)" }}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── TAB: EMPLEADOS ───────────────────────────────────────────────────────────
function TabEmpleados({ empleados, depts, usuarios, onRefresh }) {
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterContrato, setFilterContrato] = useState("");
  const [filterActivo, setFilterActivo] = useState("activo");
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const hoy = todayStr();
  const filtered = empleados.filter(e => {
    const q = search.toLowerCase();
    const matchQ = !q || `${e.nombres} ${e.apellidos} ${e.cargo} ${e.cedula||""}`.toLowerCase().includes(q);
    const matchD = !filterDept || e.departamento_id === filterDept;
    const matchC = !filterContrato || e.tipo_contrato === filterContrato;
    const matchA = filterActivo === "todos" || (filterActivo === "activo" ? e.activo : !e.activo);
    return matchQ && matchD && matchC && matchA;
  });

  const deptMap = useMemo(() => { const m = {}; depts.forEach(d => m[d.id] = d); return m; }, [depts]);

  const empStatus = (e) => {
    if (!e.activo) return "inactivo";
    if (e.periodo_prueba_fin && e.periodo_prueba_fin >= hoy) return "prueba";
    return "activo";
  };
  const empStatusLabel = { activo: "Activo", inactivo: "Inactivo", prueba: "En Prueba", vacaciones: "Vacaciones" };

  const contratoLabel = {
    indefinido: "Indefinido", termino_fijo: "Término Fijo",
    obra_labor: "Obra/Labor", prestacion_servicios: "Prestación Svcs",
  };

  const openNew  = () => { setSelected(null); setShowModal(true); };
  const openEdit = (e) => { setSelected(e);   setShowModal(true); };

  // Alerta: contratos por vencer en 30 días
  const porVencer = empleados.filter(e => {
    if (!e.fecha_fin_contrato || !e.activo) return false;
    const diff = (new Date(e.fecha_fin_contrato) - new Date(hoy)) / 86400000;
    return diff >= 0 && diff <= 30;
  });

  return (
    <div>
      {porVencer.length > 0 && (
        <div style={{ background: "#3d2a1a", border: `1px solid ${B.warning}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: B.warning }}>
          ⚠️ {porVencer.length} contrato(s) vence(n) en los próximos 30 días:
          {" "}{porVencer.map(e => `${e.nombres} ${e.apellidos} (${fmtFecha(e.fecha_fin_contrato)})`).join(", ")}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="🔍 Buscar empleado, cargo, cédula…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...IS, flex: "1 1 200px" }} />
        <Sel value={filterDept} onChange={setFilterDept}>
          <option value="">Todos los departamentos</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </Sel>
        <Sel value={filterContrato} onChange={setFilterContrato}>
          <option value="">Todos los contratos</option>
          <option value="indefinido">Indefinido</option>
          <option value="termino_fijo">Término Fijo</option>
          <option value="obra_labor">Obra/Labor</option>
          <option value="prestacion_servicios">Prestación Svcs</option>
        </Sel>
        <Sel value={filterActivo} onChange={setFilterActivo}>
          <option value="activo">Solo activos</option>
          <option value="inactivo">Solo inactivos</option>
          <option value="todos">Todos</option>
        </Sel>
        <button onClick={openNew} style={BTN(B.success)}>+ Nuevo Empleado</button>
      </div>

      {/* Tabla */}
      <div style={{ background: B.navyMid, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.4fr 1.2fr 1fr 1.2fr",
          padding: "10px 16px", borderBottom: `1px solid ${B.navyLight}`,
          fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>Empleado</span><span>Cargo</span><span>Departamento</span>
          <span>Contrato</span><span>Salario</span><span>Estado</span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
            No se encontraron empleados
          </div>
        )}
        {filtered.map((e, i) => {
          const dept = deptMap[e.departamento_id];
          const st = empStatus(e);
          return (
            <div key={e.id} onClick={() => openEdit(e)}
              style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.4fr 1.2fr 1fr 1.2fr",
                padding: "12px 16px", borderBottom: i < filtered.length - 1 ? `1px solid ${B.navyLight}` : "none",
                cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={el => el.currentTarget.style.background = B.navyLight}
              onMouseLeave={el => el.currentTarget.style.background = "transparent"}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar nombres={e.nombres} apellidos={e.apellidos} color={e.avatar_color || B.sky} size={32} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{e.nombres} {e.apellidos}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{e.cedula || "—"}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", fontSize: 12 }}>{e.cargo}</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                {dept ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: dept.color, display: "inline-block" }} />
                    {dept.nombre}
                  </span>
                ) : <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>—</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <Badge val={e.tipo_contrato} label={contratoLabel[e.tipo_contrato] || e.tipo_contrato} />
              </div>
              <div style={{ display: "flex", alignItems: "center", fontSize: 12, fontWeight: 700 }}>{COP(e.salario_base)}</div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <Badge val={st} label={empStatusLabel[st] || st} />
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <EmpleadoModal
          emp={selected} depts={depts} empleados={empleados} usuarios={usuarios}
          onSave={() => { setShowModal(false); onRefresh(); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// ─── TAB: ORGANIGRAMA ─────────────────────────────────────────────────────────
function OrgNode({ emp, depts, childrenMap, expanded, onToggle, depth = 0 }) {
  const dept = depts.find(d => d.id === emp.departamento_id);
  const color = dept?.color || B.sky;
  const children = childrenMap[emp.id] || [];
  const isExpanded = expanded.has(emp.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 160 }}>
      {/* Card */}
      <div style={{ background: B.navyMid, border: `2px solid ${color}55`, borderRadius: 12,
        padding: "12px 16px", textAlign: "center", width: 160, position: "relative",
        boxShadow: `0 0 16px ${color}22` }}>
        <Avatar nombres={emp.nombres} apellidos={emp.apellidos} color={emp.avatar_color || color} size={40} />
        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 8, lineHeight: 1.2 }}>{emp.nombres}<br />{emp.apellidos}</div>
        <div style={{ fontSize: 11, color: color, marginTop: 4, fontWeight: 600 }}>{emp.cargo}</div>
        {dept && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{dept.nombre}</div>}
        {children.length > 0 && (
          <button onClick={() => onToggle(emp.id)} style={{
            position: "absolute", bottom: -12, left: "50%", transform: "translateX(-50%)",
            background: color, border: "none", borderRadius: "50%", width: 22, height: 22,
            color: "#fff", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, zIndex: 1,
          }}>{isExpanded ? "−" : "+"}</button>
        )}
      </div>

      {/* Connector vertical */}
      {children.length > 0 && isExpanded && (
        <div style={{ width: 2, height: 28, background: color + "66", marginTop: 12 }} />
      )}

      {/* Children */}
      {children.length > 0 && isExpanded && (
        <div style={{ position: "relative", display: "flex", gap: 24, paddingTop: 0 }}>
          {/* Horizontal line above children */}
          {children.length > 1 && (
            <div style={{
              position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
              width: `calc(100% - 80px)`, height: 2, background: color + "55",
            }} />
          )}
          {children.map(child => (
            <div key={child.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 2, height: 20, background: color + "55" }} />
              <OrgNode emp={child} depts={depts} childrenMap={childrenMap}
                expanded={expanded} onToggle={onToggle} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabOrganigrama({ empleados, depts }) {
  const [expanded, setExpanded] = useState(new Set());
  const [zoom, setZoom] = useState(1);
  const [filterDept, setFilterDept] = useState("");

  const childrenMap = useMemo(() => {
    const m = {};
    empleados.forEach(e => {
      const key = e.jefe_id || "root";
      if (!m[key]) m[key] = [];
      m[key].push(e);
    });
    return m;
  }, [empleados]);

  const roots = childrenMap["root"] || [];

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const expandAll = () => {
    const all = new Set(empleados.map(e => e.id));
    setExpanded(all);
  };

  const filteredRoots = filterDept
    ? roots.filter(e => e.departamento_id === filterDept)
    : roots;

  if (empleados.length === 0) {
    return <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.25)" }}>
      Agrega empleados para ver el organigrama
    </div>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <Sel value={filterDept} onChange={setFilterDept}>
          <option value="">Todos los departamentos</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </Sel>
        <button onClick={expandAll} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Expandir todo</button>
        <button onClick={() => setExpanded(new Set())} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Colapsar todo</button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} style={{ ...BTN(B.navyLight), padding: "6px 12px" }}>−</button>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", width: 40, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} style={{ ...BTN(B.navyLight), padding: "6px 12px" }}>+</button>
        </div>
      </div>

      <div style={{ overflow: "auto", paddingBottom: 32 }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 0.2s",
          display: "flex", gap: 40, justifyContent: "center", paddingTop: 8, paddingBottom: 40 }}>
          {filteredRoots.length === 0
            ? <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>Sin empleados raíz</div>
            : filteredRoots.map(e => (
                <OrgNode key={e.id} emp={e} depts={depts} childrenMap={childrenMap}
                  expanded={expanded} onToggle={toggle} />
              ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── TAB: NÓMINA ─────────────────────────────────────────────────────────────
function TabNomina({ empleados }) {
  const [detalle, setDetalle] = useState(null);

  const activos = empleados.filter(e => e.activo);
  const totals = activos.reduce((acc, e) => {
    const n = calcNomina(e);
    return {
      bruto:    acc.bruto    + (n.base      || n.salario),
      ded:      acc.ded      + (n.totalDed  || 0),
      aEmp:     acc.aEmp     + (n.totalEmpl || 0),
      prest:    acc.prest    + (n.totalPrest|| 0),
      costo:    acc.costo    + n.costoTotal,
      neto:     acc.neto     + n.salarioNeto,
    };
  }, { bruto: 0, ded: 0, aEmp: 0, prest: 0, costo: 0, neto: 0 });

  const NominaRow = ({ e }) => {
    const n = calcNomina(e);
    return (
      <div onClick={() => setDetalle({ e, n })}
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.2fr",
          padding: "12px 16px", borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer" }}
        onMouseEnter={el => el.currentTarget.style.background = B.navyLight}
        onMouseLeave={el => el.currentTarget.style.background = "transparent"}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar nombres={e.nombres} apellidos={e.apellidos} color={e.avatar_color || B.sky} size={30} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{e.nombres} {e.apellidos}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{e.cargo}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 12 }}>{COP(n.base || n.salario)}</div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: B.danger }}>{n.esPrestacion ? "—" : COP(n.totalDed)}</div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: B.success, fontWeight: 700 }}>{COP(n.salarioNeto)}</div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 12 }}>{n.esPrestacion ? "—" : COP(n.totalEmpl + n.totalPrest)}</div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 13, fontWeight: 800, color: B.warning }}>{COP(n.costoTotal)}</div>
      </div>
    );
  };

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Pago a Empleados" value={COP(totals.neto)} sub="Total neto mensual" color={B.success} icon="💸" />
        <StatCard label="Deducciones Empleado" value={COP(totals.ded)} sub="Salud 4% + Pensión 4%" color={B.danger} icon="➖" />
        <StatCard label="Aportes Empleador" value={COP(totals.aEmp + totals.prest)} sub="SS + prestaciones" color={B.warning} icon="🏦" />
        <StatCard label="Costo Total Empresa" value={COP(totals.costo)} sub="Costo real mensual" color={B.sky} icon="🏢" />
      </div>

      <div style={{ background: B.navyMid, borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.2fr",
          padding: "10px 16px", borderBottom: `1px solid ${B.navyLight}`,
          fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>Empleado</span>
          <span>Devengado</span>
          <span>Deducciones</span>
          <span>Neto Pago</span>
          <span>Carga Emp.</span>
          <span>Costo Total</span>
        </div>
        {activos.map(e => <NominaRow key={e.id} e={e} />)}
        {activos.length === 0 && (
          <div style={{ padding: "32px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
            No hay empleados activos
          </div>
        )}
        {/* Totales */}
        {activos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.2fr",
            padding: "12px 16px", background: B.navyLight, borderTop: `2px solid ${B.navyLight}`,
            fontSize: 13, fontWeight: 800 }}>
            <span style={{ color: B.sand }}>TOTALES</span>
            <span>{COP(totals.bruto)}</span>
            <span style={{ color: B.danger }}>{COP(totals.ded)}</span>
            <span style={{ color: B.success }}>{COP(totals.neto)}</span>
            <span>{COP(totals.aEmp + totals.prest)}</span>
            <span style={{ color: B.warning }}>{COP(totals.costo)}</span>
          </div>
        )}
      </div>

      {/* Nota legal */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", lineHeight: 1.8, padding: "8px 0" }}>
        ℹ Cálculos según C.S.T. Colombia. Prestaciones: Cesantías 8.33%, Prima 8.33%, Vacaciones 4.17%, Int. Cesantías ~1%.
        Aportes patronales: EPS 8.5%, Pensión 12%, ARL según nivel riesgo, SENA 2%, ICBF 3%, Caja 4%.
        Empresa &lt;10 empleados puede estar exenta de SENA + ICBF (Ley 590/2000).
      </div>

      {/* Modal detalle */}
      {detalle && (
        <Overlay onClose={() => setDetalle(null)}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{detalle.e.nombres} {detalle.e.apellidos}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{detalle.e.cargo}</div>
            </div>
            <button onClick={() => setDetalle(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>

          {detalle.n.esPrestacion ? (
            <div style={{ padding: 20, textAlign: "center", color: "#d8b4fe" }}>
              Contrato de Prestación de Servicios — Sin liquidación de nómina ni prestaciones.
              Honorarios mensuales: <strong>{COP(detalle.n.salario)}</strong>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: B.success, marginBottom: 12, textTransform: "uppercase" }}>✓ Devengado</div>
                {[
                  ["Salario Base", detalle.n.salario],
                  ["Auxilio Transporte", detalle.n.auxT],
                  ["Cesantías (prov.)", detalle.n.cesantias],
                  ["Int. Cesantías (prov.)", detalle.n.intCesantias],
                  ["Prima (prov.)", detalle.n.prima],
                  ["Vacaciones (prov.)", detalle.n.vacaciones],
                ].map(([l, v]) => v > 0 && (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0",
                    borderBottom: `1px solid ${B.navyLight}`, fontSize: 12 }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span>
                    <span style={{ color: B.success, fontWeight: 600 }}>{COP(v)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: B.danger, marginBottom: 12, textTransform: "uppercase" }}>− Deducciones Empleado</div>
                {[
                  ["Salud (4%)", detalle.n.dEps],
                  ["Pensión (4%)", detalle.n.dPension],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0",
                    borderBottom: `1px solid ${B.navyLight}`, fontSize: 12 }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span>
                    <span style={{ color: B.danger, fontWeight: 600 }}>({COP(v)})</span>
                  </div>
                ))}
                <div style={{ fontSize: 12, fontWeight: 700, color: B.warning, marginTop: 20, marginBottom: 12, textTransform: "uppercase" }}>🏦 Aportes Empleador</div>
                {[
                  [`EPS (8.5%)`, detalle.n.aEps],
                  [`Pensión (12%)`, detalle.n.aPension],
                  [`ARL (${(ARL_TASAS[detalle.e.nivel_riesgo_arl||1]*100).toFixed(3)}%)`, detalle.n.aArl],
                  ["SENA (2%)", detalle.n.aSena],
                  ["ICBF (3%)", detalle.n.aIcbf],
                  ["Caja Compensación (4%)", detalle.n.aCaja],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0",
                    borderBottom: `1px solid ${B.navyLight}`, fontSize: 12 }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span>
                    <span style={{ color: B.warning, fontWeight: 600 }}>{COP(v)}</span>
                  </div>
                ))}
              </div>
              <div style={{ gridColumn: "span 2", background: B.navy, borderRadius: 10, padding: "16px 20px",
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>💸 Pago al Empleado</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(detalle.n.salarioNeto)}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>🏢 Costo Real Empresa</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(detalle.n.costoTotal)}</div>
                </div>
              </div>
            </div>
          )}
        </Overlay>
      )}
    </div>
  );
}

// ─── TAB: ASISTENCIA ─────────────────────────────────────────────────────────
function TabAsistencia({ empleados, asistencia, onRefresh }) {
  const [fecha, setFecha] = useState(todayStr());
  const [showModal, setShowModal] = useState(false);
  const [marcas, setMarcas] = useState({});
  const [saving, setSaving] = useState(false);

  const activos = empleados.filter(e => e.activo);

  const registrosHoy = useMemo(() =>
    asistencia.filter(a => a.fecha === fecha),
  [asistencia, fecha]);

  const getEstado = (empId) => registrosHoy.find(r => r.empleado_id === empId)?.estado || null;

  const counts = useMemo(() => {
    const c = { presente: 0, ausente: 0, tardanza: 0, permiso: 0, vacaciones: 0, incapacidad: 0, sin_registro: 0 };
    activos.forEach(e => {
      const est = getEstado(e.id);
      if (est) c[est] = (c[est] || 0) + 1;
      else c.sin_registro++;
    });
    return c;
  }, [registrosHoy, activos]);

  const openModal = () => {
    const init = {};
    activos.forEach(e => { init[e.id] = getEstado(e.id) || "presente"; });
    setMarcas(init);
    setShowModal(true);
  };

  const guardarAsistencia = async () => {
    setSaving(true);
    const rows = activos.map(e => ({
      empleado_id: e.id, fecha,
      estado: marcas[e.id] || "presente",
      registrado_por: "rrhh",
    }));
    await supabase.from("rh_asistencia").upsert(rows, { onConflict: "empleado_id,fecha" });
    setSaving(false);
    setShowModal(false);
    onRefresh();
  };

  const ESTADOS_ASIST = [
    { val: "presente",   label: "Presente",   color: B.success },
    { val: "tardanza",   label: "Tardanza",   color: B.warning },
    { val: "permiso",    label: "Permiso",    color: B.sky },
    { val: "ausente",    label: "Ausente",    color: B.danger },
    { val: "vacaciones", label: "Vacaciones", color: "#a78bfa" },
    { val: "incapacidad",label: "Incapacidad",color: "#f87171" },
  ];

  const pct = activos.length > 0 ? Math.round((counts.presente + counts.tardanza) / activos.length * 100) : 0;

  return (
    <div>
      {/* Controles */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <label style={{ ...LS, display: "inline" }}>Fecha: </label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...IS, width: 160, display: "inline-block", marginLeft: 8 }} />
        </div>
        <button onClick={openModal} style={BTN(B.success)}>📋 Marcar Asistencia</button>
      </div>

      {/* Resumen */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Asistencia" value={`${pct}%`} sub={`${counts.presente} presentes · ${counts.tardanza} tardanzas`} color={B.success} />
        <StatCard label="Ausentes" value={counts.ausente} sub="Sin justificación" color={B.danger} />
        <StatCard label="Permisos/Vacc." value={counts.permiso + counts.vacaciones} sub="Justificados" color={B.sky} />
        <StatCard label="Sin Registro" value={counts.sin_registro} sub="No marcados" color="rgba(255,255,255,0.2)" />
      </div>

      {/* Lista */}
      <div style={{ background: B.navyMid, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${B.navyLight}`,
          fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em",
          display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr" }}>
          <span>Empleado</span><span>Cargo</span><span>Estado</span>
        </div>
        {activos.map((e, i) => {
          const est = getEstado(e.id);
          return (
            <div key={e.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr",
              padding: "12px 16px", borderBottom: i < activos.length - 1 ? `1px solid ${B.navyLight}` : "none",
              alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar nombres={e.nombres} apellidos={e.apellidos} color={e.avatar_color || B.sky} size={30} />
                <span style={{ fontSize: 13 }}>{e.nombres} {e.apellidos}</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{e.cargo}</div>
              <div>{est ? <Badge val={est} /> : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>Sin registro</span>}</div>
            </div>
          );
        })}
      </div>

      {/* Modal marcar asistencia */}
      {showModal && (
        <Overlay onClose={() => setShowModal(false)}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Asistencia — {fmtFecha(fecha)}</div>
            <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>

          {/* Acceso rápido masivo */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", alignSelf: "center" }}>Todos:</span>
            {ESTADOS_ASIST.map(est => (
              <button key={est.val} onClick={() => {
                const all = {};
                activos.forEach(e => all[e.id] = est.val);
                setMarcas(all);
              }} style={{ ...BTN(est.color + "33"), border: `1px solid ${est.color}44`, color: est.color, padding: "4px 10px", fontSize: 11 }}>
                {est.label}
              </button>
            ))}
          </div>

          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {activos.map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12,
                padding: "10px 4px", borderBottom: `1px solid ${B.navyLight}` }}>
                <Avatar nombres={e.nombres} apellidos={e.apellidos} color={e.avatar_color || B.sky} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.nombres} {e.apellidos}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{e.cargo}</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {ESTADOS_ASIST.map(est => (
                    <button key={est.val} onClick={() => setMarcas(m => ({ ...m, [e.id]: est.val }))}
                      style={{ padding: "4px 10px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        background: marcas[e.id] === est.val ? est.color : est.color + "22",
                        color:      marcas[e.id] === est.val ? "#fff" : est.color }}>
                      {est.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowModal(false)} style={{ ...BTN("transparent"), border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)" }}>Cancelar</button>
            <button onClick={guardarAsistencia} disabled={saving} style={BTN(B.success)}>
              {saving ? "Guardando…" : "Guardar Asistencia"}
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── TAB: RECLUTAMIENTO ───────────────────────────────────────────────────────
const ETAPAS = [
  { key: "aplicado",          label: "Aplicado",           color: B.sky },
  { key: "entrevista_rh",     label: "Entrevista RH",      color: "#c4b5fd" },
  { key: "prueba_tecnica",    label: "Prueba Técnica",     color: B.warning },
  { key: "entrevista_final",  label: "Entrevista Final",   color: "#34d399" },
  { key: "oferta",            label: "Oferta",             color: B.sand },
  { key: "contratado",        label: "Contratado",         color: B.success },
  { key: "descartado",        label: "Descartado",         color: "rgba(255,255,255,0.25)" },
];

function TabReclutamiento({ depts, empleados, onRefresh }) {
  const [vacantes, setVacantes] = useState([]);
  const [candidatos, setCandidatos] = useState([]);
  const [selectedVac, setSelectedVac] = useState(null);
  const [showVacModal, setShowVacModal] = useState(false);
  const [showCandModal, setShowCandModal] = useState(false);
  const [editVac, setEditVac] = useState(null);
  const [editCand, setEditCand] = useState(null);
  const [loadingR, setLoadingR] = useState(true);

  const loadR = useCallback(async () => {
    if (!supabase) return;
    const [vR, cR] = await Promise.all([
      supabase.from("rh_vacantes").select("*").order("created_at", { ascending: false }),
      supabase.from("rh_candidatos").select("*").order("created_at", { ascending: false }),
    ]);
    setVacantes(vR.data || []);
    setCandidatos(cR.data || []);
    setLoadingR(false);
  }, []);

  useEffect(() => { loadR(); }, [loadR]);

  const candDeVacante = candidatos.filter(c => c.vacante_id === selectedVac?.id);
  const deptMap = useMemo(() => { const m = {}; depts.forEach(d => m[d.id] = d); return m; }, [depts]);

  const EMPTY_VAC = { titulo: "", departamento_id: "", tipo_contrato: "indefinido",
    salario_oferta: "", descripcion: "", requisitos: "", estado: "abierta",
    solicitado_por: "", prioridad: "Media", fecha_limite: "" };

  const [vacForm, setVacForm] = useState(EMPTY_VAC);
  const setV = (k, v) => setVacForm(f => ({ ...f, [k]: v }));

  const openVacModal = (vac = null) => {
    setEditVac(vac);
    setVacForm(vac ? { ...EMPTY_VAC, ...vac } : EMPTY_VAC);
    setShowVacModal(true);
  };

  const saveVac = async () => {
    if (!vacForm.titulo) return;
    const payload = { ...vacForm, departamento_id: vacForm.departamento_id || null,
      salario_oferta: Number(vacForm.salario_oferta) || null };
    if (editVac) await supabase.from("rh_vacantes").update(payload).eq("id", editVac.id);
    else         await supabase.from("rh_vacantes").insert(payload);
    setShowVacModal(false);
    loadR();
  };

  const EMPTY_CAND = { nombre: "", email: "", telefono: "", etapa: "aplicado", cv_url: "", notas: "", calificacion: null };
  const [candForm, setCandForm] = useState(EMPTY_CAND);
  const setC = (k, v) => setCandForm(f => ({ ...f, [k]: v }));

  const openCandModal = (c = null) => {
    setEditCand(c);
    setCandForm(c ? { ...EMPTY_CAND, ...c } : EMPTY_CAND);
    setShowCandModal(true);
  };

  const saveCand = async () => {
    if (!candForm.nombre || !selectedVac) return;
    const payload = { ...candForm, vacante_id: selectedVac.id };
    if (editCand) await supabase.from("rh_candidatos").update(payload).eq("id", editCand.id);
    else          await supabase.from("rh_candidatos").insert(payload);
    setShowCandModal(false);
    loadR();
  };

  const moverEtapa = async (cand) => {
    const idx = ETAPAS.findIndex(e => e.key === cand.etapa);
    if (idx < ETAPAS.length - 2) {
      const next = ETAPAS[idx + 1].key;
      await supabase.from("rh_candidatos").update({ etapa: next }).eq("id", cand.id);
      loadR();
    }
  };

  const Stars = ({ val, onChange }) => (
    <div style={{ display: "flex", gap: 4 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} onClick={() => onChange(n)} style={{ cursor: "pointer", fontSize: 16,
          color: n <= (val || 0) ? B.warning : "rgba(255,255,255,0.2)" }}>★</span>
      ))}
    </div>
  );

  const prioColors = { Urgente: B.danger, Alta: B.warning, Media: B.sky, Baja: "rgba(255,255,255,0.25)" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
      {/* Panel izquierdo: Vacantes */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: B.sand }}>Vacantes ({vacantes.filter(v => v.estado === "abierta").length} abiertas)</div>
          <button onClick={() => openVacModal()} style={{ ...BTN(B.success), padding: "6px 12px", fontSize: 12 }}>+ Nueva</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "70vh", overflowY: "auto" }}>
          {vacantes.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 12 }}>No hay vacantes</div>
          )}
          {vacantes.map(v => {
            const dept = deptMap[v.departamento_id];
            const cnt = candidatos.filter(c => c.vacante_id === v.id).length;
            const isSelected = selectedVac?.id === v.id;
            return (
              <div key={v.id} onClick={() => setSelectedVac(v)}
                style={{ background: isSelected ? B.navyLight : B.navyMid, borderRadius: 12, padding: "14px 16px",
                  cursor: "pointer", borderLeft: `4px solid ${prioColors[v.prioridad] || B.sky}`,
                  transition: "background 0.15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{v.titulo}</div>
                  <Badge val={v.estado} />
                </div>
                {dept && <div style={{ fontSize: 11, color: dept.color, marginBottom: 4 }}>● {dept.nombre}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  <span><Badge val={v.prioridad} /> {v.tipo_contrato}</span>
                  <span>👤 {cnt} candidatos</span>
                </div>
                {v.salario_oferta && <div style={{ fontSize: 12, color: B.sand, marginTop: 4 }}>{COP(v.salario_oferta)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel derecho: Kanban */}
      <div>
        {!selectedVac ? (
          <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
            Selecciona una vacante para ver el pipeline de candidatos
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{selectedVac.titulo}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{candDeVacante.length} candidatos</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => openVacModal(selectedVac)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}`, fontSize: 12 }}>✏ Editar</button>
                <button onClick={() => openCandModal()} style={BTN(B.sky)}>+ Candidato</button>
              </div>
            </div>

            {/* Kanban board */}
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16 }}>
              {ETAPAS.map(etapa => {
                const cands = candDeVacante.filter(c => c.etapa === etapa.key);
                return (
                  <div key={etapa.key} style={{ minWidth: 180, flex: "0 0 180px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: etapa.color, textTransform: "uppercase",
                      letterSpacing: "0.07em", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                      <span>{etapa.label}</span>
                      <span style={{ background: etapa.color + "33", padding: "1px 7px", borderRadius: 10 }}>{cands.length}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {cands.map(c => (
                        <div key={c.id} style={{ background: B.navyMid, borderRadius: 10, padding: "12px", border: `1px solid ${B.navyLight}` }}>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{c.nombre}</div>
                          {c.email    && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>✉ {c.email}</div>}
                          {c.telefono && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>📱 {c.telefono}</div>}
                          {c.calificacion && (
                            <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
                              {[1,2,3,4,5].map(n => (
                                <span key={n} style={{ fontSize: 12, color: n <= c.calificacion ? B.warning : "rgba(255,255,255,0.15)" }}>★</span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <button onClick={() => openCandModal(c)} style={{ ...BTN(B.navyLight), padding: "3px 8px", fontSize: 10, border: `1px solid ${B.navyLight}` }}>✏</button>
                            {etapa.key !== "contratado" && etapa.key !== "descartado" && (
                              <button onClick={() => moverEtapa(c)} style={{ ...BTN(etapa.color + "33"), padding: "3px 8px", fontSize: 10, color: etapa.color, border: `1px solid ${etapa.color}44` }}>→</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal Vacante */}
      {showVacModal && (
        <Overlay onClose={() => setShowVacModal(false)}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{editVac ? "Editar Vacante" : "Nueva Vacante"}</div>
            <button onClick={() => setShowVacModal(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Cargo / Título *</label><Inp value={vacForm.titulo} onChange={v => setV("titulo", v)} /></div>
            <div><label style={LS}>Departamento</label>
              <Sel value={vacForm.departamento_id||""} onChange={v => setV("departamento_id", v)}>
                <option value="">Sin departamento</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </Sel>
            </div>
            <div><label style={LS}>Tipo de Contrato</label>
              <Sel value={vacForm.tipo_contrato} onChange={v => setV("tipo_contrato", v)}>
                <option value="indefinido">Indefinido</option>
                <option value="termino_fijo">Término Fijo</option>
                <option value="obra_labor">Obra/Labor</option>
                <option value="prestacion_servicios">Prestación de Servicios</option>
              </Sel>
            </div>
            <div><label style={LS}>Salario Ofrecido</label><Inp type="number" value={vacForm.salario_oferta} onChange={v => setV("salario_oferta", v)} /></div>
            <div><label style={LS}>Prioridad</label>
              <Sel value={vacForm.prioridad} onChange={v => setV("prioridad", v)}>
                <option value="Urgente">🔴 Urgente</option>
                <option value="Alta">🟠 Alta</option>
                <option value="Media">🔵 Media</option>
                <option value="Baja">⚪ Baja</option>
              </Sel>
            </div>
            <div><label style={LS}>Estado</label>
              <Sel value={vacForm.estado} onChange={v => setV("estado", v)}>
                <option value="abierta">Abierta</option>
                <option value="pausada">Pausada</option>
                <option value="cerrada">Cerrada</option>
              </Sel>
            </div>
            <div><label style={LS}>Fecha Límite</label><Inp type="date" value={vacForm.fecha_limite} onChange={v => setV("fecha_limite", v)} /></div>
            <div><label style={LS}>Solicitado por</label><Inp value={vacForm.solicitado_por} onChange={v => setV("solicitado_por", v)} /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Descripción del cargo</label>
              <textarea value={vacForm.descripcion||""} onChange={e => setV("descripcion", e.target.value)} rows={3} style={{ ...IS, resize: "vertical" }} /></div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Requisitos</label>
              <textarea value={vacForm.requisitos||""} onChange={e => setV("requisitos", e.target.value)} rows={3} style={{ ...IS, resize: "vertical" }} /></div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowVacModal(false)} style={{ ...BTN("transparent"), border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)" }}>Cancelar</button>
            <button onClick={saveVac} style={BTN(B.success)}>Guardar Vacante</button>
          </div>
        </Overlay>
      )}

      {/* Modal Candidato */}
      {showCandModal && (
        <Overlay onClose={() => setShowCandModal(false)}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{editCand ? "Editar Candidato" : "Nuevo Candidato"}</div>
            <button onClick={() => setShowCandModal(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Nombre Completo *</label><Inp value={candForm.nombre} onChange={v => setC("nombre", v)} /></div>
            <div><label style={LS}>Email</label><Inp type="email" value={candForm.email} onChange={v => setC("email", v)} /></div>
            <div><label style={LS}>Teléfono</label><Inp value={candForm.telefono} onChange={v => setC("telefono", v)} /></div>
            <div><label style={LS}>Etapa</label>
              <Sel value={candForm.etapa} onChange={v => setC("etapa", v)}>
                {ETAPAS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
              </Sel>
            </div>
            <div><label style={LS}>Link CV / Portafolio</label><Inp value={candForm.cv_url} onChange={v => setC("cv_url", v)} /></div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={LS}>Calificación</label>
              <div style={{ display: "flex", gap: 4 }}>
                {[1,2,3,4,5].map(n => (
                  <span key={n} onClick={() => setC("calificacion", n)} style={{ cursor: "pointer", fontSize: 24,
                    color: n <= (candForm.calificacion || 0) ? B.warning : "rgba(255,255,255,0.2)" }}>★</span>
                ))}
              </div>
            </div>
            <div style={{ gridColumn: "span 2" }}><label style={LS}>Notas</label>
              <textarea value={candForm.notas||""} onChange={e => setC("notas", e.target.value)} rows={3} style={{ ...IS, resize: "vertical" }} /></div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button onClick={() => setShowCandModal(false)} style={{ ...BTN("transparent"), border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)" }}>Cancelar</button>
            <button onClick={saveCand} style={BTN(B.success)}>Guardar Candidato</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── TAB HORARIOS ────────────────────────────────────────────────────────────
const DIA_NOMBRES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIA_CORTOS  = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Dado un Date, retornar el lunes de esa semana (ISO week start)
function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = lun
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function toISODate(d) { return d.toISOString().slice(0, 10); }
function fmtWeekLabel(ini) {
  const fin = addDays(ini, 6);
  const mes = (d) => d.toLocaleDateString("es-CO", { month: "short" });
  const mm = ini.getMonth() === fin.getMonth() ? mes(ini) : `${mes(ini)} – ${mes(fin)}`;
  return `${ini.getDate()} – ${fin.getDate()} ${mm} ${fin.getFullYear()}`;
}

function TabHorarios({ empleados }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [plantillas, setPlantillas] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroDept, setFiltroDept] = useState("");
  const [showPlantillaModal, setShowPlantillaModal] = useState(false);
  const [editingPlantilla, setEditingPlantilla] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(null); // { empId, fecha }
  const [copySrc, setCopySrc] = useState(null); // fecha string from which to copy

  const dias = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { date: d, iso: toISODate(d), label: DIA_CORTOS[i], dayNum: d.getDate() };
    });
  }, [weekStart]);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const ini = toISODate(weekStart);
    const fin = toISODate(addDays(weekStart, 6));
    const [pR, hR] = await Promise.all([
      supabase.from("rh_turno_plantillas").select("*").eq("activo", true).order("orden"),
      supabase.from("rh_horarios").select("*").gte("fecha", ini).lte("fecha", fin),
    ]);
    setPlantillas(pR.data || []);
    setHorarios(hR.data || []);
    setLoading(false);
  }, [weekStart]);
  useEffect(() => { load(); }, [load]);

  const horariosMap = useMemo(() => {
    const m = {};
    horarios.forEach(h => { m[`${h.empleado_id}|${h.fecha}`] = h; });
    return m;
  }, [horarios]);

  const plantillasMap = useMemo(() => {
    const m = {};
    plantillas.forEach(p => { m[p.id] = p; });
    return m;
  }, [plantillas]);

  const empleadosFiltrados = useMemo(() => {
    const base = empleados.filter(e => e.activo);
    if (!filtroDept) return base;
    return base.filter(e => e.departamento_id === filtroDept);
  }, [empleados, filtroDept]);

  const departamentos = useMemo(() => {
    const set = new Map();
    empleados.forEach(e => {
      if (e.departamento_id && e.departamento_nombre) set.set(e.departamento_id, e.departamento_nombre);
    });
    return Array.from(set.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [empleados]);

  const asignar = async (empleado_id, fecha, plantilla_id) => {
    if (!supabase) return;
    const existing = horariosMap[`${empleado_id}|${fecha}`];
    if (plantilla_id === null) {
      // Clear
      if (existing) await supabase.from("rh_horarios").delete().eq("id", existing.id);
    } else {
      const p = plantillasMap[plantilla_id];
      const payload = {
        empleado_id, fecha, plantilla_id,
        tipo: p?.tipo || "turno",
        hora_ini: p?.hora_ini || null,
        hora_fin: p?.hora_fin || null,
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        await supabase.from("rh_horarios").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("rh_horarios").insert(payload);
      }
    }
    setPickerOpen(null);
    load();
  };

  const duplicarSemana = async () => {
    if (!supabase) return;
    const nextWeek = addDays(weekStart, 7);
    const srcIni = toISODate(weekStart);
    const srcFin = toISODate(addDays(weekStart, 6));
    const src = await supabase.from("rh_horarios").select("*").gte("fecha", srcIni).lte("fecha", srcFin);
    if (!src.data || src.data.length === 0) return alert("No hay horarios esta semana para duplicar");
    if (!confirm(`¿Copiar los ${src.data.length} turnos de esta semana a la siguiente (${fmtWeekLabel(nextWeek)})?`)) return;
    const rows = src.data.map(h => {
      const oldDate = new Date(h.fecha + "T12:00:00");
      const newDate = addDays(oldDate, 7);
      return {
        empleado_id: h.empleado_id,
        fecha: toISODate(newDate),
        plantilla_id: h.plantilla_id,
        tipo: h.tipo,
        hora_ini: h.hora_ini,
        hora_fin: h.hora_fin,
        notas: h.notas || "",
      };
    });
    await supabase.from("rh_horarios").upsert(rows, { onConflict: "empleado_id,fecha" });
    setWeekStart(nextWeek);
  };

  const limpiarSemana = async () => {
    if (!supabase) return;
    if (!confirm(`¿Borrar todos los turnos de la semana ${fmtWeekLabel(weekStart)}?`)) return;
    const ini = toISODate(weekStart);
    const fin = toISODate(addDays(weekStart, 6));
    await supabase.from("rh_horarios").delete().gte("fecha", ini).lte("fecha", fin);
    load();
  };

  // Calcular horas de trabajo estimadas por empleado
  const calcHoras = (empId) => {
    return dias.reduce((total, d) => {
      const h = horariosMap[`${empId}|${d.iso}`];
      if (!h || h.tipo !== "turno") return total;
      if (!h.hora_ini || !h.hora_fin) return total;
      const [hi, mi] = h.hora_ini.split(":").map(Number);
      const [hf, mf] = h.hora_fin.split(":").map(Number);
      let diff = (hf * 60 + mf) - (hi * 60 + mi);
      if (diff < 0) diff += 24 * 60; // cruza medianoche
      return total + diff / 60;
    }, 0);
  };

  return (
    <div>
      {/* Header controles */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={BTN(B.navyLight)}>‹ Semana anterior</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} style={BTN(B.sky)}>Hoy</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={BTN(B.navyLight)}>Siguiente ›</button>
          <div style={{ fontSize: 14, fontWeight: 700, marginLeft: 10, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.03em" }}>
            {fmtWeekLabel(weekStart)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={filtroDept} onChange={e => setFiltroDept(e.target.value)}
            style={{ ...IS, padding: "8px 12px", cursor: "pointer" }}>
            <option value="">Todos los departamentos</option>
            {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <button onClick={() => { setEditingPlantilla(null); setShowPlantillaModal(true); }} style={BTN(B.navyLight)}>⚙ Plantillas</button>
          <button onClick={duplicarSemana} style={BTN(B.success)}>📋 Copiar a próx. semana</button>
          <button onClick={limpiarSemana} style={BTN(B.danger + "33")}>🗑 Limpiar semana</button>
        </div>
      </div>

      {/* Leyenda plantillas */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 700, marginRight: 6 }}>PLANTILLAS:</div>
        {plantillas.map(p => (
          <div key={p.id} onClick={() => { setEditingPlantilla(p); setShowPlantillaModal(true); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 14, background: `${p.color}22`, border: `1px solid ${p.color}66`, cursor: "pointer" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }}></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{p.codigo || p.nombre}</span>
            {p.hora_ini && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{p.hora_ini.slice(0, 5)}-{p.hora_fin?.slice(0, 5)}</span>}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando horarios…</div>
      ) : empleadosFiltrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Sin empleados</div>
      ) : (
        <div style={{ overflowX: "auto", background: B.navyMid, borderRadius: 12, border: `1px solid ${B.navyLight}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: B.navy }}>
                <th style={{ ...THS, minWidth: 180, position: "sticky", left: 0, background: B.navy, zIndex: 1 }}>Empleado</th>
                {dias.map(d => {
                  const isToday = d.iso === toISODate(new Date());
                  return (
                    <th key={d.iso} style={{ ...THS, minWidth: 110, background: isToday ? `${B.sky}22` : B.navy }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{d.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? B.sky : "#fff", fontFamily: "'Barlow Condensed', sans-serif" }}>{d.dayNum}</div>
                    </th>
                  );
                })}
                <th style={{ ...THS, minWidth: 70 }}>Horas</th>
              </tr>
            </thead>
            <tbody>
              {empleadosFiltrados.map(emp => {
                const horas = calcHoras(emp.id);
                return (
                  <tr key={emp.id} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                    <td style={{ ...TDS, position: "sticky", left: 0, background: B.navyMid, zIndex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{emp.nombres} {emp.apellidos}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{emp.cargo || ""}</div>
                    </td>
                    {dias.map(d => {
                      const h = horariosMap[`${emp.id}|${d.iso}`];
                      const p = h?.plantilla_id ? plantillasMap[h.plantilla_id] : null;
                      const isOpen = pickerOpen?.empId === emp.id && pickerOpen?.fecha === d.iso;
                      return (
                        <td key={d.iso} style={{ ...TDS, padding: 4, position: "relative" }}>
                          <div onClick={() => setPickerOpen(isOpen ? null : { empId: emp.id, fecha: d.iso })}
                            style={{
                              padding: "8px 6px",
                              borderRadius: 8,
                              background: p ? `${p.color}22` : "rgba(255,255,255,0.03)",
                              border: `1px solid ${p ? p.color + "55" : "transparent"}`,
                              cursor: "pointer",
                              minHeight: 44,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 2,
                            }}>
                            {p ? (
                              <>
                                <div style={{ fontSize: 13, fontWeight: 800, color: p.color, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.05em" }}>{p.codigo || p.nombre}</div>
                                {p.hora_ini && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{p.hora_ini.slice(0, 5)}</div>}
                              </>
                            ) : (
                              <div style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>+</div>
                            )}
                          </div>
                          {isOpen && (
                            <div onClick={e => e.stopPropagation()}
                              style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 10, padding: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", minWidth: 170 }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {plantillas.map(pl => (
                                  <button key={pl.id} onClick={() => asignar(emp.id, d.iso, pl.id)}
                                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: `${pl.color}15`, border: `1px solid ${pl.color}44`, color: "#fff", cursor: "pointer", fontSize: 12, textAlign: "left" }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: pl.color }}></span>
                                    <span style={{ fontWeight: 700, color: pl.color }}>{pl.codigo}</span>
                                    <span style={{ color: "rgba(255,255,255,0.7)" }}>{pl.nombre}</span>
                                  </button>
                                ))}
                                {p && (
                                  <button onClick={() => asignar(emp.id, d.iso, null)}
                                    style={{ marginTop: 4, padding: "6px 8px", borderRadius: 6, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                                    ✕ Quitar
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ ...TDS, textAlign: "center", color: B.sand, fontWeight: 800, fontSize: 13, fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {horas > 0 ? `${horas.toFixed(1)}h` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal plantilla */}
      {showPlantillaModal && (
        <PlantillaModal
          plantilla={editingPlantilla}
          onClose={() => { setShowPlantillaModal(false); setEditingPlantilla(null); }}
          onSaved={() => { setShowPlantillaModal(false); setEditingPlantilla(null); load(); }}
        />
      )}
    </div>
  );
}

const THS = { padding: "10px 8px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };
const TDS = { padding: "10px 8px", fontSize: 13, verticalAlign: "middle" };

function PlantillaModal({ plantilla, onClose, onSaved }) {
  const isEdit = !!plantilla?.id;
  const [form, setForm] = useState(
    isEdit ? { ...plantilla }
    : { nombre: "", codigo: "", hora_ini: "08:00", hora_fin: "16:00", color: "#8ECAE6", tipo: "turno", activo: true, orden: 0 }
  );
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.nombre.trim() || !form.codigo.trim()) return alert("Nombre y código requeridos");
    const payload = {
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim().toUpperCase(),
      hora_ini: form.hora_ini || null,
      hora_fin: form.hora_fin || null,
      color: form.color,
      tipo: form.tipo,
      notas: form.notas || "",
      activo: form.activo !== false,
      orden: Number(form.orden) || 0,
    };
    if (isEdit) await supabase.from("rh_turno_plantillas").update(payload).eq("id", plantilla.id);
    else        await supabase.from("rh_turno_plantillas").insert(payload);
    onSaved();
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar plantilla "${plantilla.nombre}"? Los horarios que la usan quedarán sin plantilla.`)) return;
    await supabase.from("rh_turno_plantillas").update({ activo: false }).eq("id", plantilla.id);
    onSaved();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 460, maxWidth: "100%", border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 18, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {isEdit ? `Editar plantilla — ${plantilla.nombre}` : "Nueva plantilla de turno"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div>
              <label style={LS}>Nombre</label>
              <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS} placeholder="Ej: Mañana" />
            </div>
            <div>
              <label style={LS}>Código</label>
              <input value={form.codigo} onChange={e => set("codigo", e.target.value.toUpperCase())} maxLength={3} style={IS} placeholder="M" />
            </div>
          </div>
          <div>
            <label style={LS}>Tipo</label>
            <select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={{ ...IS, cursor: "pointer" }}>
              <option value="turno">Turno de trabajo</option>
              <option value="descanso">Descanso</option>
              <option value="vacacion">Vacación</option>
              <option value="ausencia">Ausencia / Incapacidad</option>
            </select>
          </div>
          {form.tipo === "turno" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={LS}>Hora inicio</label>
                <input type="time" value={form.hora_ini || ""} onChange={e => set("hora_ini", e.target.value)} style={IS} />
              </div>
              <div>
                <label style={LS}>Hora fin</label>
                <input type="time" value={form.hora_fin || ""} onChange={e => set("hora_fin", e.target.value)} style={IS} />
              </div>
            </div>
          )}
          <div>
            <label style={LS}>Color</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["#8ECAE6", "#F5C842", "#F59E0B", "#8b5cf6", "#22c55e", "#ef4444", "#64748b", "#ec4899"].map(c => (
                <div key={c} onClick={() => set("color", c)}
                  style={{ width: 32, height: 32, borderRadius: 8, background: c, cursor: "pointer",
                    border: form.color === c ? `3px solid #fff` : "3px solid transparent" }}></div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 22 }}>
          <div>
            {isEdit && <button onClick={remove} style={{ ...BTN(B.danger + "33"), color: B.danger }}>Eliminar</button>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
            <button onClick={save} style={BTN(B.success)}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MÓDULO PRINCIPAL ─────────────────────────────────────────────────────────
export default function RecursosHumanos() {
  const [tab, setTab]         = useState("empleados");
  const [empleados, setEmpleados] = useState([]);
  const [depts, setDepts]     = useState([]);
  const [asistencia, setAsistencia] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const hoy = todayStr();
    const mesIni = hoy.slice(0, 7) + "-01";
    const [eR, dR, aR, uR] = await Promise.all([
      supabase.from("rh_empleados").select("*").order("apellidos"),
      supabase.from("rh_departamentos").select("*").eq("activo", true).order("nombre"),
      supabase.from("rh_asistencia").select("*").gte("fecha", mesIni).order("fecha", { ascending: false }),
      supabase.from("usuarios").select("id, nombre, email, rol_id, activo").eq("activo", true).order("nombre"),
    ]);
    setEmpleados(eR.data || []);
    setDepts(dR.data || []);
    setAsistencia(aR.data || []);
    setUsuarios(uR.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activos = empleados.filter(e => e.activo).length;
  const nomMensual = empleados.filter(e => e.activo).reduce((s, e) => s + calcNomina(e).costoTotal, 0);
  const hoy = todayStr();
  const asistHoy = asistencia.filter(a => a.fecha === hoy);
  const pctAsist = activos > 0 ? Math.round(asistHoy.filter(a => ["presente","tardanza"].includes(a.estado)).length / activos * 100) : 0;

  const TABS = [
    { key: "empleados",     label: "👥 Empleados" },
    { key: "organigrama",   label: "🌳 Organigrama" },
    { key: "horarios",      label: "🗓 Horarios" },
    { key: "asistencia",    label: "📅 Asistencia" },
    { key: "nomina",        label: "💰 Nómina" },
    { key: "reclutamiento", label: "🎯 Reclutamiento" },
    { key: "departamentos", label: "🏢 Departamentos" },
  ];

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, fontFamily: "'Barlow Condensed', sans-serif" }}>
          👷 Recursos Humanos
        </h1>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Gestión del talento humano · Legislación colombiana (C.S.T.)
        </div>
      </div>

      {/* KPIs */}
      {!loading && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <StatCard label="Empleados Activos" value={activos} sub={`${empleados.length} total`} color={B.success} icon="👥" />
          <StatCard label="Costo Nómina/Mes" value={COP(nomMensual)} sub="Costo total empresa" color={B.warning} icon="💸" />
          <StatCard label="Asistencia Hoy" value={`${pctAsist}%`} sub={`${asistHoy.filter(a => a.estado === "tardanza").length} tardanzas`} color={B.sky} icon="📅" />
          <StatCard label="Departamentos" value={depts.length} sub="Áreas activas" color={B.sand} icon="🏢" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${B.navyLight}`,
        paddingBottom: 12, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: tab === t.key ? B.navyLight : "none",
            border: "none", color: tab === t.key ? "#fff" : "rgba(255,255,255,0.4)",
            borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
            borderBottom: tab === t.key ? `2px solid ${B.sky}` : "2px solid transparent",
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
          Cargando datos de RRHH…
        </div>
      ) : (
        <>
          {tab === "empleados"     && <TabEmpleados    empleados={empleados} depts={depts} usuarios={usuarios} onRefresh={load} />}
          {tab === "organigrama"   && <TabOrganigrama  empleados={empleados} depts={depts} />}
          {tab === "horarios"      && <TabHorarios     empleados={empleados.map(e => ({ ...e, departamento_nombre: depts.find(d => d.id === e.departamento_id)?.nombre }))} />}
          {tab === "nomina"        && <TabNomina       empleados={empleados} />}
          {tab === "asistencia"    && <TabAsistencia   empleados={empleados} asistencia={asistencia} onRefresh={load} />}
          {tab === "reclutamiento" && <TabReclutamiento depts={depts} empleados={empleados} onRefresh={load} />}
          {tab === "departamentos" && <TabDepartamentos depts={depts} empleados={empleados} onRefresh={load} />}
        </>
      )}
    </div>
  );
}
