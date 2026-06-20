// ContratistasRegistro.jsx — Página pública de registro express de contratistas
// Rutas:
//   /contratistas/registro/<eventoId>          → modo "nuevo" registro
//   /contratistas/registro/<eventoId>/<token>  → modo "gestión" (agregar más personal)
//
// Reglas:
//   · El RUT de la empresa es OBLIGATORIO en el primer registro.
//   · Cada persona requiere ARL OBLIGATORIA.
//   · Tras enviar, el contratista recibe un link de gestión persistente
//     para volver y agregar más personas con sus ARL en cualquier momento.
import { useState, useEffect, useCallback } from "react";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const fileToDataUrl = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload  = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(file);
});

const EMPTY_PERSONA = { nombre: "", cedula: "", fecha_nacimiento: "", rol: "", arl_file: null, arl_name: "" };
const EMPTY_EMPRESA = { nombre: "", nit: "", direccion: "", telefono: "", contacto: "", descripcion: "", rut_file: null, rut_name: "" };

async function callFn(path, { method = "GET", body } = {}) {
  const resp = await fetch(`${SUPA_URL}/functions/v1/contratistas-registro${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SUPA_KEY}`,
      apikey: SUPA_KEY,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return resp.json();
}

export default function ContratistasRegistro({ eventoId, token }) {
  const { isMobile } = useBreakpoint();
  const mode = token ? "manage" : "new";

  const [loading, setLoading]       = useState(true);
  const [evento, setEvento]         = useState(null);
  const [contratistaExist, setCE]   = useState(null); // solo en modo manage
  const [error, setError]           = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneInfo, setDoneInfo]     = useState(null); // { gestion_token, personas } (modo new)
  const [agregadoMsg, setAgregadoMsg] = useState(""); // toast en modo manage

  const [empresa, setEmpresa]   = useState(EMPTY_EMPRESA);
  const [personas, setPersonas] = useState([{ ...EMPTY_PERSONA }]);

  const setE = (k, v) => setEmpresa(e => ({ ...e, [k]: v }));
  const setP = (i, k, v) => setPersonas(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const addP = () => setPersonas(p => [...p, { ...EMPTY_PERSONA }]);
  const rmP  = (i) => setPersonas(p => p.length > 1 ? p.filter((_, j) => j !== i) : p);

  useEffect(() => {
    if (mode === "manage") {
      callFn(`/gestion/${encodeURIComponent(eventoId)}/${encodeURIComponent(token)}`)
        .then(d => {
          if (!d?.ok) { setError(d?.error || "token_invalido"); return; }
          setEvento(d.evento);
          setCE(d.contratista);
        })
        .catch(() => setError("network"))
        .finally(() => setLoading(false));
    } else {
      callFn(`/info/${encodeURIComponent(eventoId)}`)
        .then(d => {
          if (!d?.ok) { setError(d?.error || "no_encontrado"); return; }
          setEvento(d.evento);
        })
        .catch(() => setError("network"))
        .finally(() => setLoading(false));
    }
  }, [eventoId, token, mode]);

  // ── Validación + submit (modo nuevo) ───────────────────────────────────
  const validarYEnviar = useCallback(async () => {
    if (submitting) return;
    if (!empresa.nombre.trim()) { alert("Falta el nombre de la empresa."); return; }
    if (!empresa.rut_file)      { alert("El RUT de la empresa es obligatorio."); return; }
    const personasConNombre = personas.filter(p => p.nombre.trim());
    if (personasConNombre.length === 0) { alert("Debes agregar al menos 1 persona."); return; }
    const sinArl = personasConNombre.filter(p => !p.arl_file).map(p => p.nombre);
    if (sinArl.length > 0) { alert(`Falta la ARL de: ${sinArl.join(", ")}`); return; }

    setSubmitting(true);
    try {
      const rut_data_url = await fileToDataUrl(empresa.rut_file);
      const personasPayload = await Promise.all(personasConNombre.map(async (p) => ({
        nombre:           p.nombre.trim(),
        cedula:           p.cedula.trim(),
        fecha_nacimiento: p.fecha_nacimiento || null,
        rol:              p.rol.trim(),
        arl_data_url:     await fileToDataUrl(p.arl_file),
      })));
      const d = await callFn(`/submit/${encodeURIComponent(eventoId)}`, {
        method: "POST",
        body: {
          empresa: {
            nombre: empresa.nombre.trim(), nit: empresa.nit.trim(),
            direccion: empresa.direccion.trim(), telefono: empresa.telefono.trim(),
            contacto: empresa.contacto.trim(), descripcion: empresa.descripcion.trim(),
            rut_data_url,
          },
          personas: personasPayload,
        },
      });
      if (!d?.ok) { alert("No se pudo enviar: " + (d?.error || "error")); setSubmitting(false); return; }
      setDoneInfo({ gestion_token: d.gestion_token, personas: d.personas });
    } catch (e) {
      alert("Error al enviar: " + e.message);
      setSubmitting(false);
    }
  }, [submitting, empresa, personas, eventoId]);

  // ── Agregar más (modo gestión) ─────────────────────────────────────────
  const agregarMas = useCallback(async () => {
    if (submitting) return;
    const personasConNombre = personas.filter(p => p.nombre.trim());
    if (personasConNombre.length === 0) { alert("Agrega al menos una persona para enviar."); return; }
    const sinArl = personasConNombre.filter(p => !p.arl_file).map(p => p.nombre);
    if (sinArl.length > 0) { alert(`Falta la ARL de: ${sinArl.join(", ")}`); return; }

    setSubmitting(true);
    try {
      const personasPayload = await Promise.all(personasConNombre.map(async (p) => ({
        nombre:           p.nombre.trim(),
        cedula:           p.cedula.trim(),
        fecha_nacimiento: p.fecha_nacimiento || null,
        rol:              p.rol.trim(),
        arl_data_url:     await fileToDataUrl(p.arl_file),
      })));
      const d = await callFn(`/gestion/${encodeURIComponent(eventoId)}/${encodeURIComponent(token)}`, {
        method: "POST",
        body: { personas: personasPayload },
      });
      if (!d?.ok) { alert("No se pudo enviar: " + (d?.error || "error")); setSubmitting(false); return; }
      const fresh = await callFn(`/gestion/${encodeURIComponent(eventoId)}/${encodeURIComponent(token)}`);
      if (fresh?.ok) setCE(fresh.contratista);
      setPersonas([{ ...EMPTY_PERSONA }]);
      setAgregadoMsg(`✓ Se agregaron ${d.nuevas_personas} persona(s). Total: ${d.total_personas}.`);
      setTimeout(() => setAgregadoMsg(""), 5000);
      setSubmitting(false);
    } catch (e) {
      alert("Error al enviar: " + e.message);
      setSubmitting(false);
    }
  }, [submitting, personas, eventoId, token]);

  // ── Estados de pantalla ─────────────────────────────────────────────────
  if (loading) return <Centered text="Cargando…" />;
  if (error || !evento) return (
    <Centered>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔗</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Link inválido o evento no encontrado</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Pídele a quien te envió el link que te lo reenvíe.</div>
      </div>
    </Centered>
  );

  // ── Pantalla de éxito tras el primer registro ──────────────────────────
  if (doneInfo) {
    const gestionUrl = `${window.location.origin}/contratistas/registro/${encodeURIComponent(eventoId)}/${encodeURIComponent(doneInfo.gestion_token)}`;
    return (
      <div style={{ minHeight: "100vh", background: B.navy, color: B.text, padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 520, width: "100%", background: B.navyMid, borderRadius: 16, padding: 28, border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 56, textAlign: "center" }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", textAlign: "center", marginTop: 8 }}>¡Registro enviado!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
            {doneInfo.personas} persona{doneInfo.personas !== 1 ? "s" : ""} registrada{doneInfo.personas !== 1 ? "s" : ""} para <strong style={{ color: B.sand }}>{evento.nombre}</strong>.
          </div>

          <div style={{ marginTop: 22, padding: 14, background: B.navy, borderRadius: 10, border: `1px solid ${B.sky}55` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: B.sky, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              📎 Guarda este link
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5, marginBottom: 10 }}>
              Es <strong>tu link personal</strong> para volver y agregar más personal o archivos cuando quieras. Guárdalo en tus notas o mensajes.
            </div>
            <div style={{ wordBreak: "break-all", fontSize: 12, color: "#fff", background: B.navyLight, padding: "10px 12px", borderRadius: 8, fontFamily: "monospace" }}>
              {gestionUrl}
            </div>
            <button
              onClick={() => {
                if (navigator.clipboard?.writeText) navigator.clipboard.writeText(gestionUrl).then(() => alert("✓ Link copiado"));
                else prompt("Copia el link:", gestionUrl);
              }}
              style={{ marginTop: 10, padding: "10px 16px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontWeight: 800, cursor: "pointer", fontSize: 13, width: "100%" }}>
              📋 Copiar link de gestión
            </button>
          </div>

          <button
            onClick={() => window.location.href = gestionUrl}
            style={{ marginTop: 12, padding: "12px 16px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 13, width: "100%" }}>
            Ir a agregar más personas ahora →
          </button>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  const fechaTxt = evento.fecha
    ? new Date(evento.fecha + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  return (
    <div style={{ minHeight: "100vh", background: B.navy, color: B.text, padding: isMobile ? "16px 14px 40px" : "24px 24px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/logo.png" alt="Atolón" style={{ height: 44, marginBottom: 12 }} onError={e => e.target.style.display = "none"} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "0.02em" }}>
            {mode === "manage" ? "Gestión de Registro" : "Registro de Contratistas"}
          </h1>
          <div style={{ fontSize: 13, color: B.sand, marginTop: 6, fontWeight: 700 }}>
            {evento.nombre || `Evento ${evento.id}`} · {fechaTxt}
          </div>
          {mode === "new" && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8, lineHeight: 1.5, maxWidth: 480, margin: "8px auto 0" }}>
              Completa los datos de tu empresa, el <strong>RUT</strong> y las personas que vendrán con su <strong>ARL</strong>. Al final recibirás un link para volver y agregar más personal cuando lo necesites.
            </div>
          )}
        </div>

        {/* Modo gestión: tarjeta con el registro existente */}
        {mode === "manage" && contratistaExist && (
          <Card title={`✅ Registro existente · ${contratistaExist.nombre}`}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
              {contratistaExist.nit && <>NIT: <strong style={{ color: "#fff" }}>{contratistaExist.nit}</strong> · </>}
              {contratistaExist.telefono && <>Tel: <strong style={{ color: "#fff" }}>{contratistaExist.telefono}</strong> · </>}
              Personas registradas: <strong style={{ color: B.success }}>{(contratistaExist.personas || []).length}</strong>
              {contratistaExist.rut_url && <> · <a href={contratistaExist.rut_url} target="_blank" rel="noreferrer" style={{ color: B.sky }}>📎 Ver RUT</a></>}
            </div>
            {(contratistaExist.personas || []).length > 0 && (
              <div style={{ marginTop: 12, background: B.navy, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: B.sand, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Personas ya registradas</div>
                {contratistaExist.personas.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < contratistaExist.personas.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none", fontSize: 12, gap: 8 }}>
                    <span style={{ color: "#fff", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{p.nombre} <span style={{ color: "rgba(255,255,255,0.4)" }}>· {p.cedula || "sin cédula"} · {p.rol || "—"}</span></span>
                    {p.arl_url
                      ? <a href={p.arl_url} target="_blank" rel="noreferrer" style={{ color: B.sky, fontSize: 11, whiteSpace: "nowrap" }}>📎 ARL</a>
                      : <span style={{ color: B.warning, fontSize: 11, whiteSpace: "nowrap" }}>sin ARL</span>}
                  </div>
                ))}
              </div>
            )}
            {agregadoMsg && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: B.success + "22", color: B.success, borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                {agregadoMsg}
              </div>
            )}
          </Card>
        )}

        {/* Empresa: solo en modo nuevo */}
        {mode === "new" && (
          <Card title="🏢 Datos de la empresa">
            <Grid isMobile={isMobile}>
              <Field label="Nombre o Razón Social *">
                <Input value={empresa.nombre} onChange={v => setE("nombre", v)} placeholder="Ej: Eventos XYZ S.A.S." />
              </Field>
              <Field label="NIT">
                <Input value={empresa.nit} onChange={v => setE("nit", v)} placeholder="900123456-7" />
              </Field>
              <Field label="Dirección" full>
                <Input value={empresa.direccion} onChange={v => setE("direccion", v)} placeholder="Calle 1 # 2-3, Cartagena" />
              </Field>
              <Field label="Teléfono">
                <Input value={empresa.telefono} onChange={v => setE("telefono", v)} placeholder="+57 300 123 4567" />
              </Field>
              <Field label="Contacto (nombre)">
                <Input value={empresa.contacto} onChange={v => setE("contacto", v)} placeholder="Persona responsable" />
              </Field>
              <Field label="¿Qué van a hacer en el evento?" full>
                <textarea value={empresa.descripcion} onChange={e => setE("descripcion", e.target.value)}
                  rows={3} placeholder="Ej: Montaje de tarima y luces, animación, decoración floral..."
                  style={textareaStyle} />
              </Field>
              <Field label="RUT (PDF o imagen) — OBLIGATORIO *" full>
                <FileInput required={!empresa.rut_file}
                  fileName={empresa.rut_name}
                  onPick={f => { setE("rut_file", f); setE("rut_name", f?.name || ""); }}
                  accept=".pdf,image/*"
                />
              </Field>
            </Grid>
          </Card>
        )}

        {/* Personas a agregar */}
        <Card title={mode === "manage"
          ? `➕ Agregar más personas (${personas.length})`
          : `👥 Personas que vienen al evento (${personas.length})`}
          right={<button onClick={addP} style={btnSecondary}>+ Agregar persona</button>}>
          {personas.map((p, i) => (
            <div key={i} style={{ background: B.navy, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Persona #{i + 1}
                </div>
                {personas.length > 1 && (
                  <button onClick={() => rmP(i)} style={{ background: "transparent", border: "none", color: B.danger, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
                    Quitar
                  </button>
                )}
              </div>
              <Grid isMobile={isMobile}>
                <Field label="Nombre completo *">
                  <Input value={p.nombre} onChange={v => setP(i, "nombre", v)} placeholder="Nombres y apellidos" />
                </Field>
                <Field label="Cédula">
                  <Input value={p.cedula} onChange={v => setP(i, "cedula", v)} placeholder="1234567890" />
                </Field>
                <Field label="Fecha de nacimiento">
                  <input type="date" value={p.fecha_nacimiento}
                    onChange={e => setP(i, "fecha_nacimiento", e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Rol / Cargo">
                  <Input value={p.rol} onChange={v => setP(i, "rol", v)} placeholder="Ej: Montajista, DJ, Mesero" />
                </Field>
                <Field label="ARL (PDF o imagen) — OBLIGATORIA *" full>
                  <FileInput required={!p.arl_file && p.nombre.trim().length > 0}
                    fileName={p.arl_name}
                    onPick={f => { setP(i, "arl_file", f); setP(i, "arl_name", f?.name || ""); }}
                    accept=".pdf,image/*"
                  />
                </Field>
              </Grid>
            </div>
          ))}
        </Card>

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          <button
            onClick={mode === "manage" ? agregarMas : validarYEnviar}
            disabled={submitting}
            style={{
              padding: "16px 36px", borderRadius: 12, border: "none",
              background: submitting ? B.navyLight : B.success, color: "#fff",
              fontSize: 15, fontWeight: 800, cursor: submitting ? "default" : "pointer",
              minWidth: 240, letterSpacing: "0.02em",
            }}>
            {submitting ? "Enviando…" : mode === "manage" ? "✓ Agregar al registro" : "✓ Enviar registro"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          © {new Date().getFullYear()} Atolón Beach Club · Cartagena de Indias
        </div>
      </div>
    </div>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)", background: B.navyMid, color: "#fff",
  fontSize: 14, outline: "none",
};
const textareaStyle = { ...inputStyle, fontFamily: "inherit", resize: "vertical" };
const btnSecondary = {
  padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.sand}55`,
  background: "transparent", color: B.sand, fontSize: 12, fontWeight: 700, cursor: "pointer",
};

function Centered({ text, children }) {
  return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
      {children || text}
    </div>
  );
}
function Card({ title, right, children }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 14, padding: 18, border: "1px solid rgba(255,255,255,0.07)", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}
function Grid({ isMobile, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
      {children}
    </div>
  );
}
function Field({ label, full, children }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
function Input({ value, onChange, placeholder, type = "text" }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />;
}
function FileInput({ fileName, onPick, accept, required }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 10, padding: "11px 14px", borderRadius: 8,
      border: `1.5px dashed ${required ? B.warning + "88" : "rgba(255,255,255,0.18)"}`,
      background: B.navy, cursor: "pointer", fontSize: 13,
    }}>
      <span style={{ color: fileName ? B.success : (required ? B.warning : "rgba(255,255,255,0.5)"), flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {fileName ? `📎 ${fileName}` : (required ? "⚠️ Falta el archivo (requerido)" : "Toca para subir archivo (PDF o imagen)")}
      </span>
      <input type="file" accept={accept} style={{ display: "none" }}
        onChange={e => onPick(e.target.files?.[0] || null)} />
    </label>
  );
}
