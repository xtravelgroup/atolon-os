// Paso 4 (Empresa) — lista de trabajadores + modal de edición.

import { useState } from "react";
import { C, ARL_LIST, CLASES_SHORT, RH_LIST } from "./constants";
import { Field, Select, FormRow, Callout, SectionTitle } from "./FormField";

const empty = {
  nombre: "", cedula: "", cargo: "", celular: "", rh: "",
  eps: "", afp: "", arl: "", clase_riesgo: "",
  emerg_nombre: "", emerg_tel: "",
  curso_completado: false, codigo_curso: "",
};

export default function WizardTrabajadores({ workers, onChange }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [draft, setDraft] = useState(empty);
  const [errors, setErrors] = useState({});

  const openAdd = () => { setDraft({ ...empty }); setEditingIdx(null); setErrors({}); setModalOpen(true); };
  const openEdit = (i) => { setDraft({ ...empty, ...workers[i] }); setEditingIdx(i); setErrors({}); setModalOpen(true); };
  const remove = (i) => {
    if (!confirm("¿Eliminar este trabajador?")) return;
    const next = workers.slice(); next.splice(i, 1); onChange(next);
  };

  const update = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const validate = () => {
    const e = {};
    ["nombre","cedula","cargo","celular","eps","afp","arl","clase_riesgo","emerg_nombre","emerg_tel"].forEach(k => {
      if (!String(draft[k] || "").trim()) e[k] = "Requerido";
    });
    if (draft.curso_completado && !String(draft.codigo_curso || "").trim()) e.codigo_curso = "Requerido si ya completó";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    const next = workers.slice();
    const row = { ...draft };
    if (editingIdx !== null) next[editingIdx] = { ...next[editingIdx], ...row };
    else next.push(row);
    onChange(next);
    setModalOpen(false);
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: C.navyLight, fontWeight: 700 }}>
          <strong style={{ color: C.navy, fontSize: 18 }}>{workers.length}</strong> trabajador(es) registrado(s)
        </div>
      </div>

      {workers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.navyLight, background: C.sandPale, border: `1px dashed ${C.sand}`, marginBottom: 16 }}>
          No hay trabajadores registrados aún. Agregue al menos un trabajador para continuar.
        </div>
      ) : (
        <div>
          {workers.map((w, i) => (
            <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, padding: "20px 22px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ background: C.navy, color: C.white, width: 28, height: 28, borderRadius: "50%", textAlign: "center", lineHeight: "28px", fontWeight: 900, fontSize: 13 }}>{i + 1}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>{w.nombre}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => openEdit(i)} style={btnIcon}>Editar</button>
                  <button onClick={() => remove(i)} style={{ ...btnIcon, color: C.error }}>Eliminar</button>
                </div>
              </div>
              <div style={{ fontSize: 13, color: C.navyLight, marginTop: 8, lineHeight: 1.6, paddingLeft: 40 }}>
                <div><span style={labelSmall}>Cédula:</span> {w.cedula} · <span style={labelSmall}>Cargo:</span> {w.cargo}</div>
                <div><span style={labelSmall}>ARL:</span> {w.arl} ({w.clase_riesgo}) · <span style={labelSmall}>EPS:</span> {w.eps}</div>
                <div><span style={labelSmall}>Emergencia:</span> {w.emerg_nombre} ({w.emerg_tel})</div>
                {w.curso_completado && <div style={{ color: C.success, fontWeight: 700 }}>✓ Curso completado · {w.codigo_curso}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={openAdd} style={{
        width: "100%", padding: 20, background: C.sandPale, border: `2px dashed ${C.sand}`,
        cursor: "pointer", fontSize: 13, fontWeight: 800, letterSpacing: 1.5,
        textTransform: "uppercase", color: C.navy, fontFamily: "inherit",
      }}>+ Agregar trabajador</button>

      <Callout title="Qué información vamos a pedir">
        De cada trabajador necesitamos: nombres, cédula, cargo/oficio, EPS, AFP, ARL y clase de riesgo, contacto de emergencia, y si ya completó el curso interactivo previo.
      </Callout>

      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(13, 27, 62, 0.7)",
            zIndex: 200, overflowY: "auto", padding: 20,
            display: "flex", alignItems: "flex-start", justifyContent: "center",
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: C.cream, maxWidth: 640, width: "100%", margin: "20px 0",
            padding: 32, position: "relative", boxShadow: "0 20px 60px rgba(13,27,62,0.4)",
          }}>
            <button onClick={() => setModalOpen(false)} style={{
              position: "absolute", top: 16, right: 16, background: "transparent",
              border: "none", fontSize: 24, cursor: "pointer", color: C.navy, padding: "4px 10px", lineHeight: 1,
            }}>×</button>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.navy, marginBottom: 6, letterSpacing: -0.5, paddingRight: 40 }}>
              {editingIdx !== null ? "Editar trabajador" : "Agregar trabajador"}
            </div>
            <div style={{ fontSize: 13, color: C.navyLight, marginBottom: 24 }}>
              Información del trabajador que ingresará a Atolon. Todos los campos son obligatorios salvo los indicados como opcionales.
            </div>

            <SectionTitle>Datos personales</SectionTitle>
            <FormRow full>
              <Field label="Nombres y apellidos" required value={draft.nombre} onChange={v => update("nombre", v)} placeholder="Como aparece en la cédula" maxLength={100} error={errors.nombre} />
            </FormRow>
            <FormRow>
              <Field label="Cédula" required value={draft.cedula} onChange={v => update("cedula", v)} placeholder="Sin puntos" maxLength={15} inputMode="numeric" error={errors.cedula} />
              <Field label="Cargo / oficio" required value={draft.cargo} onChange={v => update("cargo", v)} placeholder="Ej: Plomero" maxLength={60} error={errors.cargo} />
            </FormRow>
            <FormRow>
              <Field label="Celular" required value={draft.celular} onChange={v => update("celular", v)} placeholder="3001234567" maxLength={15} error={errors.celular} />
              <Select label="RH" value={draft.rh} onChange={v => update("rh", v)} options={RH_LIST} placeholder="— Opcional —" />
            </FormRow>

            <SectionTitle>Seguridad social</SectionTitle>
            <FormRow>
              <Field label="EPS" required value={draft.eps} onChange={v => update("eps", v)} placeholder="Ej: Sura" maxLength={60} error={errors.eps} />
              <Field label="AFP" required value={draft.afp} onChange={v => update("afp", v)} placeholder="Ej: Porvenir" maxLength={60} error={errors.afp} />
            </FormRow>
            <FormRow>
              <Select label="ARL" required value={draft.arl} onChange={v => update("arl", v)} options={ARL_LIST} error={errors.arl} />
              <Select label="Clase de riesgo" required value={draft.clase_riesgo} onChange={v => update("clase_riesgo", v)} options={CLASES_SHORT} error={errors.clase_riesgo} />
            </FormRow>

            <SectionTitle>Contacto de emergencia</SectionTitle>
            <FormRow>
              <Field label="Nombre" required value={draft.emerg_nombre} onChange={v => update("emerg_nombre", v)} placeholder="Nombre completo" maxLength={100} error={errors.emerg_nombre} />
              <Field label="Teléfono" required value={draft.emerg_tel} onChange={v => update("emerg_tel", v)} placeholder="3001234567" maxLength={15} error={errors.emerg_tel} />
            </FormRow>

            <SectionTitle>Curso de inducción</SectionTitle>
            <FormRow>
              <Select
                label="¿Ya completó el curso?" required
                value={draft.curso_completado ? "si" : draft.curso_completado === false && (draft.curso_completado_set) ? "no" : ""}
                onChange={v => setDraft(d => ({ ...d, curso_completado: v === "si", curso_completado_set: true }))}
                options={[{ value: "si", label: "Sí, ya lo completó" }, { value: "no", label: "No, lo hará después" }]}
              />
              {draft.curso_completado && (
                <Field label="Código del certificado" required value={draft.codigo_curso} onChange={v => update("codigo_curso", v)} placeholder="ATL-XXXXXXXX-XXXXXXXX" maxLength={40} error={errors.codigo_curso} />
              )}
            </FormRow>

            <div style={{ display: "flex", gap: 12, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => setModalOpen(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={save} style={{ ...btnPrimary, flex: 2 }}>Guardar trabajador</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const btnIcon = {
  background: "transparent", border: `1px solid ${C.border}`, padding: "6px 10px",
  fontSize: 11, cursor: "pointer", color: C.navy, fontWeight: 700,
  letterSpacing: 0.5, textTransform: "uppercase", fontFamily: "inherit",
};
const labelSmall = { color: C.sand, fontWeight: 700, textTransform: "uppercase", fontSize: 10, letterSpacing: 1, marginRight: 4 };
const btnPrimary = { flex: 1, padding: "15px 28px", fontSize: 13, fontWeight: 800, letterSpacing: 1.8, textTransform: "uppercase", border: "none", cursor: "pointer", background: C.navy, color: C.white, fontFamily: "inherit" };
const btnSecondary = { flex: 1, padding: "15px 28px", fontSize: 13, fontWeight: 800, letterSpacing: 1.8, textTransform: "uppercase", cursor: "pointer", background: "transparent", color: C.navy, border: `1.5px solid ${C.navy}`, fontFamily: "inherit" };
