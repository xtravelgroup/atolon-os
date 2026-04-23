// Portal público de contratistas — wizard completo de auto-registro.
// Rutas:
//   /contratistas           → landing (tipo) + wizard
//   /contratistas/exito     → pantalla de éxito con radicado
//
// También exporta ContratistasWizardAsistido: modal para admins.

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

import {
  C, STEPS_EMPRESA, STEPS_NATURAL,
  DECS_EMPRESA, DECS_NATURAL,
  UPLOAD_EMPRESA, UPLOAD_NATURAL,
  genRadicado, genCursoToken, isEmail, isPhone, isCedula,
} from "./contratistas/constants";

import {
  EmpresaStep1, EmpresaStep2, EmpresaStep3, EmpresaStep6Declaracion,
} from "./contratistas/WizardEmpresa";
import {
  NaturalStep1, NaturalStep2, NaturalStep3, NaturalStep5CursoDeclaracion,
} from "./contratistas/WizardNatural";
import WizardTrabajadores from "./contratistas/WizardTrabajadores";
import WizardDocumentos from "./contratistas/WizardDocumentos";
import WizardRevision from "./contratistas/WizardRevision";
import WizardExito from "./contratistas/WizardExito";

const DRAFT_KEY = "contratistas_draft_v1";

const emptyData = {
  // común
  contacto_principal_email: "",
  contacto_principal_cel: "",
  // empresa
  emp_razon_social: "", emp_nit: "", emp_ciiu: "", emp_direccion: "", emp_ciudad: "",
  emp_tamano: "", emp_telefono: "",
  emp_rl_nombre: "", emp_rl_cedula: "", emp_rl_cel: "", emp_rl_correo: "",
  emp_op_nombre: "", emp_op_cargo: "", emp_op_cel: "", emp_op_correo: "",
  emp_arl: "", emp_clase_riesgo: "", emp_fecha_pila: "", emp_num_pila: "",
  emp_sst_nombre: "", emp_sst_licencia: "", emp_sst_puntaje: "", emp_sst_ano: "",
  // natural
  nat_nombre: "", nat_cedula: "", nat_fecha_nac: "", nat_rh: "",
  nat_direccion: "", nat_ciudad: "", nat_celular: "", nat_correo: "",
  nat_emerg_nombre: "", nat_emerg_parentesco: "", nat_emerg_tel: "",
  nat_oficio: "", nat_experiencia: "",
  nat_eps: "", nat_regimen: "", nat_afp: "", nat_caja: "",
  nat_arl: "", nat_arl_estado: "",
  nat_curso_completado: null, nat_codigo_curso: "",
  // servicio
  servicio_tipo: "", servicio_desc: "",
  fecha_inicio: "", fecha_fin: "", horario: "", num_trabajadores: "", duracion: "",
  // firma
  firma_nombre: "", firma_cedula: "",
};

// ==========================================================================
// COMPONENTE WIZARD (reutilizado por portal público y admin asistido)
// ==========================================================================

function ContratistasWizard({ assisted = false, onClose, adminUser }) {
  const [tipo, setTipo] = useState(null);              // null | "empresa" | "natural"
  const [step, setStep] = useState(-1);                // -1 = landing
  const [data, setData] = useState(emptyData);
  const [workers, setWorkers] = useState([]);
  const [uploads, setUploads] = useState({});          // { [docId]: { id, name, path } }
  const [decs, setDecs] = useState({});                // { [i]: true }
  const [sameContact, setSameContact] = useState(false);
  const [contratistaId, setContratistaId] = useState(null);
  const [radicado, setRadicado] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [doneRadicado, setDoneRadicado] = useState(null); // al terminar, guardado para la pantalla éxito
  const hydratedRef = useRef(false);

  // -------- Draft: cargar al montar --------
  useEffect(() => {
    if (assisted) return; // modo asistido inicia limpio
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d?.tipo) setTipo(d.tipo);
      if (typeof d?.step === "number") setStep(d.step);
      if (d?.data) setData({ ...emptyData, ...d.data });
      if (Array.isArray(d?.workers)) setWorkers(d.workers);
      if (d?.uploads) setUploads(d.uploads);
      if (d?.decs) setDecs(d.decs);
      if (d?.sameContact) setSameContact(d.sameContact);
      if (d?.contratistaId) setContratistaId(d.contratistaId);
      if (d?.radicado) setRadicado(d.radicado);
    } catch { /* ignore */ }
    hydratedRef.current = true;
  }, [assisted]);

  // -------- Draft: guardar en cambios --------
  useEffect(() => {
    if (assisted) return;
    if (!hydratedRef.current) return;
    if (doneRadicado) return; // ya terminó
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        tipo, step, data, workers, uploads, decs, sameContact, contratistaId, radicado,
      }));
    } catch { /* ignore */ }
  }, [assisted, tipo, step, data, workers, uploads, decs, sameContact, contratistaId, radicado, doneRadicado]);

  const steps = useMemo(() => (tipo === "empresa" ? STEPS_EMPRESA : STEPS_NATURAL), [tipo]);
  const stepsCount = steps.length;

  const setField = useCallback((k, v) => {
    setData(d => ({ ...d, [k]: v }));
    setErrors(e => { if (!e[k]) return e; const next = { ...e }; delete next[k]; return next; });
  }, []);

  const toggleDec = (i) => setDecs(d => ({ ...d, [i]: !d[i] }));

  // -------- Validación por paso --------
  const validateCurrent = () => {
    const e = {};
    if (tipo === "empresa") {
      if (step === 0) {
        ["emp_razon_social","emp_nit","emp_direccion","emp_ciudad","emp_tamano","contacto_principal_email",
         "emp_rl_nombre","emp_rl_cedula","emp_rl_cel","emp_rl_correo"].forEach(k => { if (!String(data[k] || "").trim()) e[k] = "Requerido"; });
        if (data.contacto_principal_email && !isEmail(data.contacto_principal_email)) e.contacto_principal_email = "Correo no válido";
        if (data.emp_rl_correo && !isEmail(data.emp_rl_correo)) e.emp_rl_correo = "Correo no válido";
        if (data.emp_rl_cedula && !isCedula(data.emp_rl_cedula)) e.emp_rl_cedula = "Cédula no válida";
        if (data.emp_rl_cel && !isPhone(data.emp_rl_cel)) e.emp_rl_cel = "Celular no válido";
      } else if (step === 1) {
        ["emp_op_nombre","emp_op_cargo","emp_op_cel","emp_op_correo",
         "servicio_tipo","servicio_desc"].forEach(k => { if (!String(data[k] || "").trim()) e[k] = "Requerido"; });
        if (data.emp_op_correo && !isEmail(data.emp_op_correo)) e.emp_op_correo = "Correo no válido";
      } else if (step === 2) {
        ["emp_arl","emp_clase_riesgo","emp_fecha_pila","emp_sst_nombre","emp_sst_licencia","emp_sst_puntaje"].forEach(k => { if (!String(data[k] || "").trim()) e[k] = "Requerido"; });
      } else if (step === 3) {
        if (workers.length === 0) e._workers = "Debe agregar al menos un trabajador";
      } else if (step === 4) {
        // documentos: se recomienda pero se permite completar después
      } else if (step === 5) {
        if (!DECS_EMPRESA.every((_, i) => decs[i])) e._decs = "Debe marcar todas las declaraciones";
        if (!String(data.firma_nombre || "").trim()) e.firma_nombre = "Requerido";
        if (!String(data.firma_cedula || "").trim()) e.firma_cedula = "Requerido";
      }
    } else if (tipo === "natural") {
      if (step === 0) {
        ["nat_nombre","nat_cedula","nat_fecha_nac","nat_rh","nat_ciudad","nat_direccion",
         "nat_celular","nat_correo","nat_emerg_nombre","nat_emerg_parentesco","nat_emerg_tel"].forEach(k => { if (!String(data[k] || "").trim()) e[k] = "Requerido"; });
        if (data.nat_correo && !isEmail(data.nat_correo)) e.nat_correo = "Correo no válido";
        if (data.nat_cedula && !isCedula(data.nat_cedula)) e.nat_cedula = "Cédula no válida";
      } else if (step === 1) {
        ["nat_oficio","nat_experiencia","servicio_desc","fecha_inicio","duracion"].forEach(k => { if (!String(data[k] || "").trim()) e[k] = "Requerido"; });
      } else if (step === 2) {
        ["nat_eps","nat_regimen","nat_afp","nat_arl","nat_arl_estado"].forEach(k => { if (!String(data[k] || "").trim()) e[k] = "Requerido"; });
      } else if (step === 3) {
        // documentos opcional
      } else if (step === 4) {
        if (data.nat_curso_completado === null || data.nat_curso_completado === undefined || data.nat_curso_completado === "")
          e.nat_curso_completado = "Requerido";
        if (data.nat_curso_completado === true && !String(data.nat_codigo_curso || "").trim())
          e.nat_codigo_curso = "Requerido";
        if (!DECS_NATURAL.every((_, i) => decs[i])) e._decs = "Debe marcar todas las declaraciones";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // -------- Crear borrador en DB al pasar del paso 0 al 1 --------
  const ensureDraftRow = async () => {
    if (contratistaId) return contratistaId;
    const rad = radicado || genRadicado(tipo);
    setRadicado(rad);
    const nombre_display = tipo === "empresa" ? data.emp_razon_social : data.nat_nombre;
    const email = tipo === "empresa" ? data.contacto_principal_email : data.nat_correo;
    const cel = tipo === "empresa" ? (data.emp_op_cel || data.emp_rl_cel) : data.nat_celular;
    const payload = { ...buildDbPayload(tipo, data), radicado: rad, tipo, estado: "borrador", nombre_display, contacto_principal_email: email, contacto_principal_cel: cel || "pendiente" };

    const { data: row, error } = await supabase
      .from("contratistas")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    setContratistaId(row.id);
    return row.id;
  };

  // -------- Update borrador existente --------
  const updateDraftRow = async (cid) => {
    const payload = buildDbPayload(tipo, data);
    // Mantener campos básicos en sync
    payload.nombre_display = tipo === "empresa" ? data.emp_razon_social : data.nat_nombre;
    payload.contacto_principal_email = tipo === "empresa" ? data.contacto_principal_email : data.nat_correo;
    payload.contacto_principal_cel = tipo === "empresa" ? (data.emp_op_cel || data.emp_rl_cel) : data.nat_celular;
    const { error } = await supabase.from("contratistas").update(payload).eq("id", cid);
    if (error) throw error;
  };

  // -------- Sincronizar trabajadores con la tabla --------
  const syncWorkers = async (cid) => {
    // Borra y recrea — más simple para el borrador
    await supabase.from("contratistas_trabajadores").delete().eq("contratista_id", cid);
    if (workers.length === 0) return;
    const rows = workers.map(w => ({
      contratista_id: cid,
      nombre: w.nombre, cedula: w.cedula, cargo: w.cargo, celular: w.celular, rh: w.rh || null,
      eps: w.eps, afp: w.afp, arl: w.arl, clase_riesgo: w.clase_riesgo,
      emerg_nombre: w.emerg_nombre, emerg_tel: w.emerg_tel,
      curso_completado: !!w.curso_completado,
      codigo_curso: w.codigo_curso || null,
      curso_token: genCursoToken(),
    }));
    const { error } = await supabase.from("contratistas_trabajadores").insert(rows);
    if (error) throw error;
  };

  // -------- Navegación --------
  const next = async () => {
    if (!validateCurrent()) {
      // scroll al primer error
      setTimeout(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, 50);
      return;
    }

    // Al pasar del paso 0 al 1, crear el borrador en DB
    if (step === 0 && !contratistaId) {
      try {
        setSaveMsg({ type: "info", text: "Guardando borrador…" });
        await ensureDraftRow();
        setSaveMsg({ type: "success", text: "Borrador guardado." });
      } catch (err) {
        console.error(err);
        setSaveMsg({ type: "error", text: "Error al guardar borrador: " + (err.message || err) });
        return;
      }
    } else if (contratistaId) {
      // Update silencioso en cada paso
      try { await updateDraftRow(contratistaId); } catch (err) { console.warn("update draft:", err); }
    }

    if (step === stepsCount - 1) {
      await submit();
      return;
    }

    setStep(s => s + 1);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const back = () => {
    if (step <= 0) {
      if (confirm("¿Volver a la selección inicial? Los datos ingresados se conservan.")) {
        setStep(-1);
      }
      return;
    }
    setStep(s => s - 1);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const jumpTo = (s) => { setStep(s); window.scrollTo({ top: 0 }); };

  // -------- Submit final --------
  const submit = async () => {
    setSubmitting(true);
    try {
      const cid = await ensureDraftRow();
      await updateDraftRow(cid);
      if (tipo === "empresa") await syncWorkers(cid);

      // firma electrónica — IP lo dejamos null (la Edge Function lo capturará en Fase 3)
      const firma = {
        firma_nombre: tipo === "empresa" ? data.firma_nombre : data.nat_nombre,
        firma_cedula: tipo === "empresa" ? data.firma_cedula : data.nat_cedula,
        firma_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        firma_timestamp: new Date().toISOString(),
        declaraciones: (tipo === "empresa" ? DECS_EMPRESA : DECS_NATURAL).map((t, i) => ({ texto: t, aceptada: !!decs[i] })),
      };
      const { error: upErr } = await supabase
        .from("contratistas")
        .update({
          ...firma,
          estado: "radicado",
          submitted_at: new Date().toISOString(),
        })
        .eq("id", cid);
      if (upErr) throw upErr;

      // Bitácora
      try {
        await supabase.from("contratistas_bitacora").insert({
          contratista_id: cid,
          evento: "registro_enviado",
          estado_anterior: "borrador",
          estado_nuevo: "radicado",
          descripcion: assisted ? `Registro radicado (modo asistido por ${adminUser?.email || "admin"})` : "Registro radicado desde portal público",
          usuario_nombre: assisted ? (adminUser?.email || "admin") : null,
        });
      } catch (err) { console.warn("bitacora:", err); }

      // Disparar Edge Function Fase 3: genera radicado final server-side, asegura tokens y envía 3 emails.
      // Fire-and-forget — si falla, el registro ya está en 'radicado' en BD, el SST lo verá y podrá actuar.
      try {
        fetch("https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/contratistas-submit-registro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contratista_id: contratistaId }),
        }).catch(e => console.warn("submit-registro:", e));
      } catch (e) { console.warn("submit-registro dispatch:", e); }

      setDoneRadicado(radicado || "");
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }

      if (!assisted) {
        // Redirigir a /contratistas/exito?radicado=XXX
        window.history.pushState({}, "", `/contratistas/exito?radicado=${encodeURIComponent(radicado || "")}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    } catch (err) {
      console.error("[submit]", err);
      alert("Error al enviar registro: " + (err.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  // -------- Retomar borrador desde DB (cross-device) --------
  const resumeDraft = useCallback(async ({ row, workersRows, docsRows }) => {
    // Rehidratar campos
    const nextData = { ...emptyData };
    Object.keys(emptyData).forEach(k => {
      if (row[k] !== undefined && row[k] !== null) nextData[k] = row[k];
    });
    // firma
    if (row.firma_nombre) nextData.firma_nombre = row.firma_nombre;
    if (row.firma_cedula) nextData.firma_cedula = row.firma_cedula;

    setTipo(row.tipo);
    setContratistaId(row.id);
    setRadicado(row.radicado || null);
    setData(nextData);

    // Trabajadores (solo empresa)
    if (Array.isArray(workersRows) && workersRows.length) {
      setWorkers(workersRows.map(w => ({
        nombre: w.nombre || "", cedula: w.cedula || "", cargo: w.cargo || "",
        celular: w.celular || "", rh: w.rh || "",
        eps: w.eps || "", afp: w.afp || "", arl: w.arl || "", clase_riesgo: w.clase_riesgo || "",
        emerg_nombre: w.emerg_nombre || "", emerg_tel: w.emerg_tel || "",
        curso_completado: !!w.curso_completado,
        codigo_curso: w.codigo_curso || "",
      })));
    } else {
      setWorkers([]);
    }

    // Uploads
    if (Array.isArray(docsRows)) {
      const up = {};
      docsRows.forEach(d => {
        up[d.tipo] = { id: d.id, name: d.nombre_original, path: d.storage_path };
      });
      setUploads(up);
    }

    // Declaraciones — si ya firmó, marcar todas
    if (Array.isArray(row.declaraciones)) {
      const ds = {};
      row.declaraciones.forEach((dec, i) => { if (dec?.aceptada) ds[i] = true; });
      setDecs(ds);
    } else {
      setDecs({});
    }

    setSameContact(false);
    setErrors({});
    setSaveMsg({ type: "success", text: `Borrador retomado (${row.radicado || "sin radicado"}). Continúe en el paso que desee.` });
    setStep(0);
    hydratedRef.current = true;
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }, []);

  // -------- Reset --------
  const restart = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setTipo(null); setStep(-1); setData(emptyData); setWorkers([]); setUploads({});
    setDecs({}); setSameContact(false); setContratistaId(null); setRadicado(null);
    setErrors({}); setDoneRadicado(null); setSaveMsg(null);
  };

  // ==========================================================
  // RENDER
  // ==========================================================

  // Éxito
  if (doneRadicado) {
    if (assisted) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16, color: C.success }}>✓</div>
          <h3 style={{ fontSize: 20, color: C.navy, margin: "0 0 8px" }}>Registro creado</h3>
          <div style={{ fontSize: 14, color: C.navyLight, marginBottom: 16 }}>Radicado:</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.navy, fontFamily: "monospace", marginBottom: 24 }}>{doneRadicado}</div>
          <button onClick={() => { onClose?.(); }} style={btnPrimary}>Cerrar</button>
        </div>
      );
    }
    return (
      <div style={shellStyle}>
        <WizardExito
          radicado={doneRadicado}
          tipo={tipo}
          workers={workers}
          onRestart={restart}
        />
        <Footer />
      </div>
    );
  }

  // Landing (solo para modo público; modo asistido fuerza elegir tipo)
  if (step === -1 && !assisted) {
    return (
      <div style={shellStyle}>
        <Topbar />
        <Landing onPick={(t) => { setTipo(t); setStep(0); }} onResume={resumeDraft} />
        <Footer />
      </div>
    );
  }

  // En modo asistido, si no hay tipo, mostrar selector inline
  if (step === -1 && assisted) {
    return (
      <Landing assisted onPick={(t) => { setTipo(t); setStep(0); }} />
    );
  }

  // Pasos
  const isLast = step === stepsCount - 1;
  const labels = steps;

  return (
    <div style={assisted ? {} : shellStyle}>
      {!assisted && <Topbar step={step + 1} total={stepsCount} />}
      {!assisted && <ProgressBar value={(step + 1) / stepsCount} />}
      {!assisted && <Breadcrumb labels={labels} current={step} />}

      {assisted && (
        <div style={{ background: C.skyLight, borderLeft: `4px solid ${C.navy}`, padding: "10px 14px", fontSize: 12, marginBottom: 14 }}>
          <strong>Modo asistido</strong> — está llenando el registro en nombre del contratista ({adminUser?.email || "admin"}).
        </div>
      )}

      <div style={{ padding: assisted ? 0 : "40px 28px 160px", maxWidth: 900, margin: "0 auto" }}>
        {/* Header del paso */}
        <div style={{ marginBottom: 36, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, letterSpacing: 2.5, color: C.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 10 }}>
            Paso {step + 1} de {stepsCount} · {tipo === "empresa" ? "Empresa" : "Persona natural"}
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.12, color: C.navy, letterSpacing: -1, marginBottom: 10 }}>
            {labels[step]}
          </h1>
        </div>

        {saveMsg && (
          <div style={{
            padding: "10px 14px", marginBottom: 14,
            background: saveMsg.type === "error" ? C.errorBg : saveMsg.type === "success" ? C.successBg : C.skyLight,
            border: `1px solid ${saveMsg.type === "error" ? C.error : saveMsg.type === "success" ? C.success : C.navy}`,
            color: saveMsg.type === "error" ? C.error : C.navy,
            fontSize: 13, fontWeight: 700,
          }}>
            {saveMsg.text}
          </div>
        )}

        {/* Contenido del paso */}
        {tipo === "empresa" && step === 0 && <EmpresaStep1 data={data} setField={setField} errors={errors} />}
        {tipo === "empresa" && step === 1 && <EmpresaStep2 data={data} setField={setField} errors={errors} sameContact={sameContact} setSameContact={setSameContact} />}
        {tipo === "empresa" && step === 2 && <EmpresaStep3 data={data} setField={setField} errors={errors} />}
        {tipo === "empresa" && step === 3 && (
          <>
            <WizardTrabajadores workers={workers} onChange={setWorkers} />
            {errors._workers && <div style={errorMsgStyle}>{errors._workers}</div>}
          </>
        )}
        {tipo === "empresa" && step === 4 && (
          <WizardDocumentos tipo="empresa" contratistaId={contratistaId} uploads={uploads} onChange={setUploads} />
        )}
        {tipo === "empresa" && step === 5 && (
          <>
            <EmpresaStep6Declaracion data={data} setField={setField} decs={decs} toggleDec={toggleDec} errors={errors} />
            {errors._decs && <div style={errorMsgStyle}>{errors._decs}</div>}
          </>
        )}
        {tipo === "empresa" && step === 6 && (
          <WizardRevision tipo="empresa" data={data} workers={workers} uploads={uploads} decs={decs} jumpTo={jumpTo} />
        )}

        {tipo === "natural" && step === 0 && <NaturalStep1 data={data} setField={setField} errors={errors} />}
        {tipo === "natural" && step === 1 && <NaturalStep2 data={data} setField={setField} errors={errors} />}
        {tipo === "natural" && step === 2 && <NaturalStep3 data={data} setField={setField} errors={errors} />}
        {tipo === "natural" && step === 3 && (
          <WizardDocumentos tipo="natural" contratistaId={contratistaId} uploads={uploads} onChange={setUploads} />
        )}
        {tipo === "natural" && step === 4 && (
          <>
            <NaturalStep5CursoDeclaracion data={data} setField={setField} decs={decs} toggleDec={toggleDec} errors={errors} />
            {errors._decs && <div style={errorMsgStyle}>{errors._decs}</div>}
          </>
        )}
        {tipo === "natural" && step === 5 && (
          <WizardRevision tipo="natural" data={data} workers={[]} uploads={uploads} decs={decs} jumpTo={jumpTo} />
        )}

        {/* Barra de acción */}
        <div style={{ display: "flex", gap: 12, marginTop: 36, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
          <button onClick={back} style={btnSecondary} disabled={submitting}>← Atrás</button>
          <button onClick={next} style={{ ...btnPrimary, flex: 2, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>
            {submitting ? "Enviando…" : isLast ? "Enviar registro ✓" : "Continuar →"}
          </button>
        </div>
      </div>

      {!assisted && <Footer />}
    </div>
  );
}

// ==========================================================================
// BUILD DB PAYLOAD
// ==========================================================================
function buildDbPayload(tipo, d) {
  const payload = {};
  const keys = tipo === "empresa"
    ? [
        "emp_razon_social","emp_nit","emp_ciiu","emp_direccion","emp_ciudad","emp_tamano","emp_telefono",
        "emp_rl_nombre","emp_rl_cedula","emp_rl_cel","emp_rl_correo",
        "emp_op_nombre","emp_op_cargo","emp_op_cel","emp_op_correo",
        "emp_arl","emp_clase_riesgo","emp_fecha_pila","emp_num_pila",
        "emp_sst_nombre","emp_sst_licencia","emp_sst_puntaje","emp_sst_ano",
        "servicio_tipo","servicio_desc",
      ]
    : [
        "nat_nombre","nat_cedula","nat_fecha_nac","nat_rh","nat_direccion","nat_ciudad","nat_celular","nat_correo",
        "nat_emerg_nombre","nat_emerg_parentesco","nat_emerg_tel",
        "nat_oficio","nat_experiencia","nat_eps","nat_regimen","nat_afp","nat_caja","nat_arl","nat_arl_estado",
        "nat_curso_completado","nat_codigo_curso",
        "servicio_desc","fecha_inicio","duracion",
      ];
  keys.forEach(k => {
    let v = d[k];
    if (v === "" || v === undefined) v = null;
    if (["emp_fecha_pila","emp_sst_ano","num_trabajadores","nat_fecha_nac","fecha_inicio","fecha_fin","nat_experiencia"].includes(k)) {
      // dates pueden ser null; enteros convertir
      if (["emp_sst_ano","num_trabajadores","nat_experiencia"].includes(k)) {
        v = v === null ? null : Number.isFinite(Number(v)) ? Number(v) : null;
      }
    }
    payload[k] = v;
  });
  return payload;
}

// ==========================================================================
// SUBCOMPONENTES DE LAYOUT
// ==========================================================================

const shellStyle = {
  minHeight: "100vh",
  background: C.cream,
  color: C.navy,
  fontFamily: "'Barlow', Arial, system-ui, sans-serif",
  backgroundImage: "radial-gradient(circle at 5% 5%, rgba(142, 202, 230, 0.1) 0%, transparent 35%), radial-gradient(circle at 95% 95%, rgba(200, 185, 154, 0.15) 0%, transparent 45%)",
};

function Topbar({ step, total }) {
  return (
    <div style={{
      background: C.navy, color: C.white, padding: "20px 28px",
      position: "sticky", top: 0, zIndex: 100,
      boxShadow: "0 2px 16px rgba(13, 27, 62, 0.2)",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div>
        <div style={{ fontSize: 14, letterSpacing: 3, fontWeight: 900, textTransform: "uppercase" }}>Atolon</div>
        <div style={{ fontSize: 10, color: C.sand, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>Portal de Contratistas</div>
      </div>
      {step && total && (
        <div style={{ fontSize: 11, color: C.sand, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
          Paso {step} de {total}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value }) {
  return (
    <div style={{ background: C.navy, padding: "0 28px 12px", position: "sticky", top: 72, zIndex: 99 }}>
      <div style={{ height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", background: C.sky, width: `${Math.min(100, value * 100)}%`, transition: "width 0.6s cubic-bezier(0.65, 0, 0.35, 1)", boxShadow: `0 0 10px ${C.sky}` }} />
      </div>
    </div>
  );
}

function Breadcrumb({ labels, current }) {
  return (
    <div style={{
      padding: "0 28px", background: C.sandPale, borderBottom: `1px solid ${C.border}`,
      fontSize: 11, letterSpacing: 1, color: C.navy,
      display: "flex", alignItems: "center", gap: 8, height: 36,
      textTransform: "uppercase", fontWeight: 700, overflowX: "auto",
    }}>
      {labels.map((l, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <span style={{ opacity: i === current ? 1 : 0.5 }}>{l}</span>
          {i < labels.length - 1 && <span style={{ color: C.sand, opacity: 0.6 }}>→</span>}
        </span>
      ))}
    </div>
  );
}

function Landing({ onPick, onResume, assisted }) {
  return (
    <div style={{ padding: assisted ? "0" : "50px 28px 80px", maxWidth: 900, margin: "0 auto" }}>
      {!assisted && (
        <div style={{ textAlign: "center", marginBottom: 50 }}>
          <div style={{ fontSize: 12, letterSpacing: 3, color: C.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 14 }}>
            Atolon Beach Club · Cartagena
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.05, color: C.navy, letterSpacing: -1.5, marginBottom: 18, maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
            Registro de Contratistas y Proveedores
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: C.navyLight, maxWidth: 560, margin: "0 auto" }}>
            Para ingresar a la propiedad en Isla Tierra Bomba, todo contratista o proveedor debe registrar su información, documentos de ley y completar el curso de inducción SST.
          </p>
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: 11, letterSpacing: 2.5, color: C.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 24 }}>
        ¿Cómo presta el servicio?
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, maxWidth: 700, margin: "0 auto" }}>
        {[
          { k: "empresa",  title: "Empresa", desc: "Representa una persona jurídica que enviará uno o varios trabajadores.", ex: "Ej: Servicios Técnicos del Caribe S.A.S., Catering Mar Azul Ltda." },
          { k: "natural",  title: "Persona natural", desc: "Trabaja como independiente o profesional autónomo.", ex: "Ej: Plomero, electricista, fotógrafo, DJ, decorador." },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => onPick(t.k)}
            style={{
              background: C.white, border: `2px solid ${C.border}`, padding: "32px 24px",
              cursor: "pointer", textAlign: "left", position: "relative", overflow: "hidden",
              transition: "all 0.25s ease", fontFamily: "inherit",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 30px rgba(13,27,62,0.15)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <div style={{ fontSize: 22, fontWeight: 900, color: C.navy, marginBottom: 8, letterSpacing: -0.3 }}>{t.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C.navyLight, marginBottom: 14 }}>{t.desc}</div>
            <div style={{ fontSize: 11, color: C.sand, fontStyle: "italic", lineHeight: 1.4, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>{t.ex}</div>
          </button>
        ))}
      </div>

      {!assisted && onResume && <ResumeBox onResume={onResume} />}

      {!assisted && (
        <div style={{ marginTop: 40, textAlign: "center", fontSize: 12, color: C.navyLight, lineHeight: 1.6 }}>
          ¿Dudas? Escríbanos a <a href="mailto:contratistas@atolon.co" style={{ color: C.navy, textDecoration: "underline" }}>contratistas@atolon.co</a>
        </div>
      )}
    </div>
  );
}

function ResumeBox({ onResume }) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("empresa");
  const [doc, setDoc] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const buscar = async () => {
    setMsg(null);
    const d = String(doc || "").trim();
    const e = String(email || "").trim().toLowerCase();
    if (!d || !e) { setMsg({ type: "error", text: "Ingrese documento y correo." }); return; }
    if (!isEmail(e)) { setMsg({ type: "error", text: "Correo no válido." }); return; }

    setBusy(true);
    try {
      let query = supabase.from("contratistas").select("*").eq("tipo", tipo).in("estado", ["borrador", "devuelto"]);
      if (tipo === "empresa") {
        query = query.eq("emp_nit", d).or(`contacto_principal_email.ilike.${e},emp_rl_correo.ilike.${e}`);
      } else {
        query = query.eq("nat_cedula", d).or(`contacto_principal_email.ilike.${e},nat_correo.ilike.${e}`);
      }
      const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      if (!rows || rows.length === 0) {
        setMsg({ type: "error", text: "No encontramos un borrador con esos datos. Verifique el documento y correo." });
        return;
      }
      const row = rows[0];
      const [w, docs] = await Promise.all([
        supabase.from("contratistas_trabajadores").select("*").eq("contratista_id", row.id),
        supabase.from("contratistas_documentos").select("*").eq("contratista_id", row.id),
      ]);
      onResume({ row, workersRows: w.data || [], docsRows: docs.data || [] });
    } catch (err) {
      console.error("[resume]", err);
      setMsg({ type: "error", text: "Error al buscar: " + (err.message || err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 40, maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 28, textAlign: "center" }}>
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            style={{
              background: "transparent", border: `1.5px solid ${C.navy}`, color: C.navy,
              padding: "12px 24px", fontSize: 12, fontWeight: 800, letterSpacing: 1.5,
              textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ¿Ya iniciaste un registro? Retómalo aquí
          </button>
        ) : (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, padding: 24, textAlign: "left" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: C.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 10 }}>
              Retomar registro
            </div>
            <div style={{ fontSize: 13, color: C.navyLight, lineHeight: 1.5, marginBottom: 18 }}>
              Ingresa el documento y correo que usaste al comenzar. Te llevaremos a donde quedaste, aunque estés en otro dispositivo.
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[{ k: "empresa", l: "Empresa" }, { k: "natural", l: "Persona natural" }].map(t => (
                <button
                  key={t.k}
                  onClick={() => setTipo(t.k)}
                  style={{
                    flex: 1, padding: "10px 12px", fontSize: 12, fontWeight: 800,
                    letterSpacing: 1, textTransform: "uppercase", cursor: "pointer",
                    background: tipo === t.k ? C.navy : C.white,
                    color: tipo === t.k ? C.white : C.navy,
                    border: `1px solid ${C.navy}`, fontFamily: "inherit",
                  }}
                >
                  {t.l}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: C.navy }}>
                {tipo === "empresa" ? "NIT" : "Cédula"}
                <input
                  value={doc}
                  onChange={e => setDoc(e.target.value)}
                  placeholder={tipo === "empresa" ? "900123456-7" : "Sin puntos"}
                  style={{
                    display: "block", width: "100%", marginTop: 6,
                    padding: "12px 14px", fontSize: 14, border: `1px solid ${C.border}`,
                    background: C.white, color: C.navy, fontFamily: "inherit",
                  }}
                />
              </label>
              <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: C.navy }}>
                Correo electrónico usado
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  style={{
                    display: "block", width: "100%", marginTop: 6,
                    padding: "12px 14px", fontSize: 14, border: `1px solid ${C.border}`,
                    background: C.white, color: C.navy, fontFamily: "inherit",
                  }}
                />
              </label>
            </div>

            {msg && (
              <div style={{
                padding: "10px 14px", marginBottom: 12, fontSize: 13, fontWeight: 700,
                background: msg.type === "error" ? C.errorBg : C.successBg,
                border: `1px solid ${msg.type === "error" ? C.error : C.success}`,
                color: msg.type === "error" ? C.error : C.navy,
              }}>
                {msg.text}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setOpen(false); setMsg(null); }}
                disabled={busy}
                style={{
                  flex: 1, padding: "12px 18px", fontSize: 12, fontWeight: 800,
                  letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer",
                  background: "transparent", color: C.navy, border: `1.5px solid ${C.navy}`,
                  fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={buscar}
                disabled={busy}
                style={{
                  flex: 2, padding: "12px 18px", fontSize: 12, fontWeight: 800,
                  letterSpacing: 1.5, textTransform: "uppercase", cursor: busy ? "wait" : "pointer",
                  background: C.navy, color: C.white, border: "none",
                  fontFamily: "inherit", opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "Buscando…" : "Retomar mi registro"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ padding: "24px 28px", textAlign: "center", fontSize: 11, color: C.navyLight }}>
      🔒 Tus datos se procesan bajo la Ley 1581/2012 (Habeas Data) y el Decreto 1377/2013.<br/>
      © {new Date().getFullYear()} Atolón Beach Club · Interop Colombia S.A.S.<br/>
      <span style={{ fontSize: 10, opacity: 0.7 }}>Conforme a Decreto 1072/2015 Art. 2.2.4.6.28 · CST Art. 34 · Decreto 723/2013 · Ley 527/1999</span>
    </div>
  );
}

// ==========================================================================
// ESTILOS COMPARTIDOS
// ==========================================================================
const btnPrimary = {
  padding: "15px 28px", fontSize: 13, fontWeight: 800, letterSpacing: 1.8,
  textTransform: "uppercase", border: "none", cursor: "pointer",
  background: C.navy, color: C.white, fontFamily: "inherit", flex: 1,
};
const btnSecondary = {
  padding: "15px 28px", fontSize: 13, fontWeight: 800, letterSpacing: 1.8,
  textTransform: "uppercase", cursor: "pointer",
  background: "transparent", color: C.navy, border: `1.5px solid ${C.navy}`,
  fontFamily: "inherit", flex: 1,
};
const errorMsgStyle = {
  marginTop: 14, padding: "10px 14px", background: C.errorBg,
  border: `1px solid ${C.error}`, color: C.error, fontSize: 13, fontWeight: 700,
};

// ==========================================================================
// ENTRYPOINTS
// ==========================================================================

// Portal público (/contratistas)
export default function ContratistasPortal() {
  // Si la ruta es /contratistas/exito, leer radicado de query y renderizar pantalla éxito standalone
  const route = typeof window !== "undefined" ? window.location.pathname : "";
  if (route === "/contratistas/exito") {
    const params = new URLSearchParams(window.location.search);
    const radicado = params.get("radicado") || "—";
    return (
      <div style={shellStyle}>
        <Topbar />
        <WizardExito
          radicado={radicado}
          tipo={null}
          workers={[]}
          onRestart={() => {
            window.history.pushState({}, "", "/contratistas");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        />
        <Footer />
      </div>
    );
  }
  return <ContratistasWizard assisted={false} />;
}

// Wrapper para modo asistido (abre en modal desde el admin)
export function ContratistasWizardAsistido({ onClose, adminUser }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 999,
      overflowY: "auto", padding: 20,
    }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.cream, maxWidth: 900, margin: "20px auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)", position: "relative",
          fontFamily: "'Barlow', Arial, system-ui, sans-serif", color: C.navy,
        }}
      >
        <div style={{ padding: "16px 24px", background: C.navy, color: C.white, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>Registro asistido · Contratista</div>
            <div style={{ fontSize: 11, color: C.sand, marginTop: 2 }}>Complete el registro en nombre del contratista</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${C.sand}`, color: C.sand, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            Cerrar ×
          </button>
        </div>
        <div style={{ padding: 24 }}>
          <ContratistasWizard assisted onClose={onClose} adminUser={adminUser} />
        </div>
      </div>
    </div>
  );
}
