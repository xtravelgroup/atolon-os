// ContratistasRegistro.jsx — Página pública de registro express de contratistas
// Ruta: /contratistas/registro/<eventoId>
// El admin genera el link desde EventoDetalle → Contratistas y se lo manda
// al contratista. El contratista llena empresa + personas + sube RUT/ARLs.
// Al enviar, el edge function contratistas-registro sube los archivos y
// agrega el contratista a eventos.contratistas (jsonb).
import { useState, useEffect, useCallback } from "react";
import { B } from "../brand";
import { useBreakpoint } from "../lib/responsive";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const EMPTY_PERSONA = { nombre: "", cedula: "", fecha_nacimiento: "", rol: "", arl_file: null, arl_name: "" };

export default function ContratistasRegistro({ eventoId }) {
  const { isMobile } = useBreakpoint();
  const [loading, setLoading] = useState(true);
  const [evento, setEvento]   = useState(null);
  const [error,  setError]    = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [empresa, setEmpresa] = useState({
    nombre: "", nit: "", direccion: "", telefono: "", contacto: "",
    descripcion: "", rut_file: null, rut_name: "",
  });
  const [personas, setPersonas] = useState([{ ...EMPTY_PERSONA }]);

  const setE = (k, v) => setEmpresa(e => ({ ...e, [k]: v }));
  const setP = (i, k, v) => setPersonas(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const addP = () => setPersonas(p => [...p, { ...EMPTY_PERSONA }]);
  const rmP  = (i) => setPersonas(p => p.length > 1 ? p.filter((_, j) => j !== i) : p);

  useEffect(() => {
    fetch(`${SUPA_URL}/functions/v1/contratistas-registro/info/${encodeURIComponent(eventoId)}`, {
      headers: { Authorization: `Bearer ${SUPA_KEY}`, apikey: SUPA_KEY },
    })
      .then(r => r.json())
      .then(d => {
        if (d?.ok) setEvento(d.evento);
        else setError(d?.error || "no_encontrado");
      })
      .catch(() => setError("network"))
      .finally(() => setLoading(false));
  }, [eventoId]);

  const submit = useCallback(async () => {
    if (submitting) return;
    if (!empresa.nombre.trim()) { alert("Falta el nombre de la empresa."); return; }
    const personasValidas = personas.filter(p => p.nombre.trim());
    if (personasValidas.length === 0) {
      if (!confirm("No has agregado personas. ¿Enviar solo con datos de la empresa?")) return;
    }
    setSubmitting(true);
    try {
      const rut_data_url = empresa.rut_file ? await fileToDataUrl(empresa.rut_file) : null;
      const personasPayload = await Promise.all(personasValidas.map(async (p) => ({
        nombre:           p.nombre.trim(),
        cedula:           p.cedula.trim(),
        fecha_nacimiento: p.fecha_nacimiento || null,
        rol:              p.rol.trim(),
        arl_data_url:     p.arl_file ? await fileToDataUrl(p.arl_file) : null,
      })));
      const resp = await fetch(`${SUPA_URL}/functions/v1/contratistas-registro/submit/${encodeURIComponent(eventoId)}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPA_KEY}`, apikey: SUPA_KEY },
        body:    JSON.stringify({
          empresa: {
            nombre:       empresa.nombre.trim(),
            nit:          empresa.nit.trim(),
            direccion:    empresa.direccion.trim(),
            telefono:     empresa.telefono.trim(),
            contacto:     empresa.contacto.trim(),
            descripcion:  empresa.descripcion.trim(),
            rut_data_url,
          },
          personas: personasPayload,
        }),
      });
      const data = await resp.json();
      if (!data?.ok) {
        alert("No se pudo enviar: " + (data?.error || "error"));
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch (e) {
      alert("Error al enviar: " + e.message);
      setSubmitting(false);
    }
  }, [submitting, empresa, personas, eventoId]);

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
  if (done) return (
    <Centered>
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div style={{ fontSize: 56, marginBottom: 14 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 8 }}>¡Registro enviado!</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
          Tu información llegó al equipo de Atolón. Te contactarán para confirmar el acceso al evento.
        </div>
      </div>
    </Centered>
  );

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
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "0.02em" }}>Registro de Contratistas</h1>
          <div style={{ fontSize: 13, color: B.sand, marginTop: 6, fontWeight: 700 }}>
            {evento.nombre || `Evento ${evento.id}`} · {fechaTxt}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8, lineHeight: 1.5, maxWidth: 480, margin: "8px auto 0" }}>
            Completa los datos de tu empresa y de las personas que vendrán al evento. Carga el RUT de la empresa y la ARL de cada persona.
          </div>
        </div>

        {/* Empresa */}
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
            <Field label="RUT (PDF / imagen)" full>
              <FileInput
                fileName={empresa.rut_name}
                onPick={f => { setE("rut_file", f); setE("rut_name", f?.name || ""); }}
                accept=".pdf,image/*"
              />
            </Field>
          </Grid>
        </Card>

        {/* Personas */}
        <Card title={`👥 Personas que vienen al evento (${personas.length})`}
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
                <Field label="ARL (PDF / imagen)" full>
                  <FileInput
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
          <button onClick={submit} disabled={submitting}
            style={{
              padding: "16px 36px", borderRadius: 12, border: "none",
              background: submitting ? B.navyLight : B.success, color: "#fff",
              fontSize: 15, fontWeight: 800, cursor: submitting ? "default" : "pointer",
              minWidth: 240, letterSpacing: "0.02em",
            }}>
            {submitting ? "Enviando…" : "✓ Enviar registro"}
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
function FileInput({ fileName, onPick, accept }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 10, padding: "11px 14px", borderRadius: 8,
      border: "1.5px dashed rgba(255,255,255,0.18)",
      background: B.navy, cursor: "pointer", fontSize: 13,
    }}>
      <span style={{ color: fileName ? B.success : "rgba(255,255,255,0.5)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {fileName ? `📎 ${fileName}` : "Toca para subir archivo (PDF o imagen)"}
      </span>
      <input type="file" accept={accept} style={{ display: "none" }}
        onChange={e => onPick(e.target.files?.[0] || null)} />
    </label>
  );
}
