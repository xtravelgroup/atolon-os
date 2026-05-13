// ReclutamientoPortal.jsx — Portal público en /carreras
// Lista vacantes publicadas + formulario de aplicación
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const fmtCOP = (n) => "COP " + Math.round(Number(n) || 0).toLocaleString("es-CO");
const TIPOS = { indefinido: "Tiempo completo", temporal: "Temporal", obra_labor: "Obra/labor", practicas: "Prácticas" };
const MODALIDADES = { presencial: "Presencial", hibrido: "Híbrido", remoto: "Remoto" };

const splitLines = (s) => (s || "").split("\n").map(x => x.trim()).filter(Boolean);

export default function ReclutamientoPortal() {
  const route = (window.location.pathname || "/").replace(/^\/+/, "").replace(/\/+$/, "");
  // /carreras → lista; /carreras/:slug → detalle
  const [, slug] = route.match(/^carreras\/?(.*)?$/) || [];

  const [vacantes, setVacantes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [activa, setActiva]     = useState(null); // vacante seleccionada

  useEffect(() => {
    document.title = slug ? "Postularme — Atolón Beach Club" : "Carreras — Atolón Beach Club";
    supabase.from("rh_vacantes")
      .select("id, codigo, slug, titulo, descripcion, responsabilidades, requisitos, beneficios, salario_min, salario_max, salario_visible, tipo_contrato, modalidad, ubicacion, vacantes_qty, fecha_apertura, fecha_cierre, departamento_id")
      .eq("publicada", true)
      .eq("estado", "abierta")
      .order("fecha_apertura", { ascending: false })
      .then(({ data }) => {
        setVacantes(data || []);
        if (slug) {
          const found = (data || []).find(v => v.slug === slug || v.id === slug);
          if (found) setActiva(found);
        }
        setLoading(false);
      });
  }, [slug]);

  if (loading) return <Wrapper><div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.5)" }}>Cargando vacantes…</div></Wrapper>;
  if (activa) return <Wrapper><DetalleVacante vacante={activa} onBack={() => { setActiva(null); window.history.pushState({}, "", "/carreras"); }} /></Wrapper>;

  return <Wrapper><ListaVacantes vacantes={vacantes} onSelect={v => { setActiva(v); window.history.pushState({}, "", `/carreras/${v.slug || v.id}`); }} /></Wrapper>;
}

// ─── Wrapper ─────────────────────────────────────────────────────────
function Wrapper({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: B.navy, color: "#fff", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <header style={{ background: B.navyMid, padding: "18px 24px", borderBottom: `1px solid ${B.navyLight}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <a href="https://www.atolon.co" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "#fff" }}>
            <img src="/atolon-logo-sand.png" alt="Atolón" style={{ height: 36 }} />
            <div>
              <div style={{ fontSize: 9, color: "#C8B99A", letterSpacing: "0.25em", textTransform: "uppercase" }}>Atolón · Beach Club</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800 }}>Carreras</div>
            </div>
          </a>
          <a href="https://www.atolon.co" style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", textDecoration: "none" }}>← Volver al sitio</a>
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 60px" }}>
        {children}
      </main>
      <footer style={{ borderTop: `1px solid ${B.navyLight}`, padding: "20px 24px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
        Atolón Beach Club · Cartagena de Indias · Colombia
      </footer>
    </div>
  );
}

// ─── Lista de vacantes ───────────────────────────────────────────────
function ListaVacantes({ vacantes, onSelect }) {
  if (vacantes.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 20px" }}>
        <div style={{ fontSize: 60, marginBottom: 14 }}>🏝️</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, marginBottom: 8 }}>No tenemos vacantes abiertas en este momento</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          Vuelve pronto · Si quieres dejarnos tu hoja de vida, escríbenos a{" "}
          <a href="mailto:rrhh@atolon.co" style={{ color: B.sky }}>rrhh@atolon.co</a>
        </div>
      </div>
    );
  }
  return (
    <>
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#C8B99A", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 10 }}>Únete al equipo</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 38, fontWeight: 800, lineHeight: 1.1 }}>Buscamos talento que ame el mar</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 10, maxWidth: 640, margin: "10px auto 0" }}>
          Trabajar en Atolón es trabajar en un entorno único: una isla a 20 minutos de Cartagena. Encuentra abajo nuestras posiciones abiertas.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {vacantes.map(v => (
          <button key={v.id} type="button" onClick={() => onSelect(v)}
            style={{ background: B.navyMid, borderRadius: 14, padding: 18, border: `1px solid ${B.navyLight}`, color: "#fff", textAlign: "left", cursor: "pointer", transition: "transform 0.15s, border-color 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = B.sky; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = B.navyLight; e.currentTarget.style.transform = "translateY(0)"; }}>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{v.titulo}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, fontSize: 11 }}>
              <Tag>📍 {v.ubicacion || "Cartagena"}</Tag>
              <Tag>{MODALIDADES[v.modalidad] || v.modalidad}</Tag>
              <Tag>{TIPOS[v.tipo_contrato] || v.tipo_contrato}</Tag>
              {v.salario_visible && (v.salario_min || v.salario_max) && (
                <Tag color="#22c55e">💰 {v.salario_min ? fmtCOP(v.salario_min) : ""}{v.salario_max ? ` – ${fmtCOP(v.salario_max)}` : "+"}</Tag>
              )}
            </div>
            {v.descripcion && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 10 }}>
                {v.descripcion}
              </div>
            )}
            <div style={{ fontSize: 11, color: B.sky, fontWeight: 700 }}>Ver detalle y postular →</div>
          </button>
        ))}
      </div>
    </>
  );
}

const Tag = ({ children, color = "rgba(255,255,255,0.45)" }) => (
  <span style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${color}33`, color, padding: "3px 9px", borderRadius: 12, fontWeight: 600 }}>{children}</span>
);

// ─── Detalle + formulario ────────────────────────────────────────────
function DetalleVacante({ vacante, onBack }) {
  return (
    <div>
      <button type="button" onClick={onBack} style={{ background: "none", border: "none", color: B.sky, fontSize: 12, cursor: "pointer", marginBottom: 14, padding: 0 }}>← Ver todas las vacantes</button>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#C8B99A", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8 }}>{vacante.codigo || "Vacante"}</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, marginBottom: 14, lineHeight: 1.15 }}>{vacante.titulo}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <Tag>📍 {vacante.ubicacion || "Cartagena"}</Tag>
          <Tag>{MODALIDADES[vacante.modalidad] || vacante.modalidad}</Tag>
          <Tag>{TIPOS[vacante.tipo_contrato] || vacante.tipo_contrato}</Tag>
          {vacante.salario_visible && (vacante.salario_min || vacante.salario_max) && (
            <Tag color="#22c55e">💰 {vacante.salario_min ? fmtCOP(vacante.salario_min) : ""}{vacante.salario_max ? ` – ${fmtCOP(vacante.salario_max)}` : "+"}</Tag>
          )}
        </div>

        {vacante.descripcion && (
          <Section title="Sobre el rol"><p style={{ margin: 0, lineHeight: 1.7 }}>{vacante.descripcion}</p></Section>
        )}
        {splitLines(vacante.responsabilidades).length > 0 && (
          <Section title="Responsabilidades"><Lista items={splitLines(vacante.responsabilidades)} /></Section>
        )}
        {splitLines(vacante.requisitos).length > 0 && (
          <Section title="Requisitos"><Lista items={splitLines(vacante.requisitos)} /></Section>
        )}
        {splitLines(vacante.beneficios).length > 0 && (
          <Section title="Beneficios"><Lista items={splitLines(vacante.beneficios)} /></Section>
        )}
      </div>

      <FormularioPostulacion vacante={vacante} />
    </div>
  );
}

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ fontSize: 11, color: "#C8B99A", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10, fontWeight: 700 }}>{title}</div>
    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>{children}</div>
  </div>
);
const Lista = ({ items }) => (
  <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
    {items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{it}</li>)}
  </ul>
);

// ─── Formulario ──────────────────────────────────────────────────────
function FormularioPostulacion({ vacante }) {
  const [f, setF] = useState({
    nombre: "", email: "", telefono: "", cedula: "", ciudad: "Cartagena",
    experiencia_anos: "", educacion: "",
    linkedin_url: "", portfolio_url: "",
    carta_motivacion: "",
    cv: null,
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState("");

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const enviar = async (ev) => {
    ev.preventDefault();
    setError("");
    if (!f.nombre.trim()) return setError("El nombre es obligatorio.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setError("Email no válido.");
    if (!f.telefono.trim()) return setError("El teléfono es obligatorio.");

    setSaving(true);
    try {
      // Subir CV si hay
      let cv_url = null, cv_nombre = null;
      if (f.cv) {
        if (f.cv.size > 10 * 1024 * 1024) {
          setError("El CV no puede pesar más de 10 MB.");
          setSaving(false);
          return;
        }
        const ext = f.cv.name.split(".").pop();
        const path = `${vacante.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("cv-postulaciones").upload(path, f.cv, { contentType: f.cv.type });
        if (upErr) {
          setError("No se pudo subir el CV: " + upErr.message);
          setSaving(false);
          return;
        }
        cv_url = path;
        cv_nombre = f.cv.name;
      }

      const codigo = `POS-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const { error: insErr } = await supabase.from("rh_postulaciones").insert({
        codigo,
        vacante_id: vacante.id,
        nombre: f.nombre.trim(),
        email: f.email.trim().toLowerCase(),
        telefono: f.telefono.trim(),
        cedula: f.cedula.trim() || null,
        ciudad: f.ciudad.trim() || null,
        experiencia_anos: f.experiencia_anos ? Number(f.experiencia_anos) : null,
        educacion: f.educacion.trim() || null,
        linkedin_url: f.linkedin_url.trim() || null,
        portfolio_url: f.portfolio_url.trim() || null,
        carta_motivacion: f.carta_motivacion.trim() || null,
        cv_url, cv_nombre,
        fuente: "portal",
        estado: "recibida",
        user_agent: navigator.userAgent.slice(0, 500),
      });
      if (insErr) {
        setError(insErr.message);
        setSaving(false);
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err.message || "Error al enviar.");
    }
    setSaving(false);
  };

  if (done) {
    return (
      <div style={{ background: B.navyMid, borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 14 }}>✅</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 8 }}>¡Postulación recibida!</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
          Gracias por tu interés en <strong>{vacante.titulo}</strong>. Nuestro equipo de RRHH revisará tu información y, si tu perfil coincide, nos contactaremos al correo que registraste.
        </div>
        <a href="/carreras" style={{ display: "inline-block", marginTop: 24, padding: "10px 22px", background: B.sky, color: B.navy, borderRadius: 10, textDecoration: "none", fontWeight: 700, fontSize: 13 }}>Ver más vacantes</a>
      </div>
    );
  }

  const FS = { ...IS_PORTAL };
  return (
    <form onSubmit={enviar} style={{ background: B.navyMid, borderRadius: 16, padding: 22 }}>
      <div style={{ fontSize: 11, color: "#C8B99A", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Postularme</div>
      <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 800, marginBottom: 18 }}>Cuéntanos de ti</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Field label="Nombre completo *">
          <input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={FS} required />
        </Field>
        <Field label="Cédula">
          <input value={f.cedula} onChange={e => set("cedula", e.target.value)} style={FS} placeholder="(opcional)" />
        </Field>
        <Field label="Email *">
          <input type="email" value={f.email} onChange={e => set("email", e.target.value)} style={FS} required />
        </Field>
        <Field label="Teléfono *">
          <input value={f.telefono} onChange={e => set("telefono", e.target.value)} style={FS} placeholder="+57 300 ..." required />
        </Field>
        <Field label="Ciudad">
          <input value={f.ciudad} onChange={e => set("ciudad", e.target.value)} style={FS} />
        </Field>
        <Field label="Años de experiencia">
          <input type="number" value={f.experiencia_anos} onChange={e => set("experiencia_anos", e.target.value)} style={FS} min="0" max="60" />
        </Field>
      </div>

      <Field label="Educación">
        <input value={f.educacion} onChange={e => set("educacion", e.target.value)} style={FS} placeholder="Ej: Profesional en Hotelería, Universidad XYZ" />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, marginBottom: 12 }}>
        <Field label="LinkedIn (opcional)">
          <input value={f.linkedin_url} onChange={e => set("linkedin_url", e.target.value)} style={FS} placeholder="https://linkedin.com/in/..." />
        </Field>
        <Field label="Portfolio (opcional)">
          <input value={f.portfolio_url} onChange={e => set("portfolio_url", e.target.value)} style={FS} placeholder="https://..." />
        </Field>
      </div>

      <Field label="Hoja de vida (PDF, DOC) — máximo 10 MB">
        <input type="file" accept=".pdf,.doc,.docx,.jpg,.png" onChange={e => set("cv", e.target.files?.[0] || null)}
          style={{ ...FS, padding: "8px 10px" }} />
      </Field>

      <Field label="Carta de motivación (opcional)">
        <textarea value={f.carta_motivacion} onChange={e => set("carta_motivacion", e.target.value)} rows={4}
          placeholder="Cuéntanos por qué te interesa unirte a Atolón…"
          style={{ ...FS, resize: "vertical", fontFamily: "inherit" }} />
      </Field>

      {error && (
        <div style={{ background: "#ef444422", border: "1px solid #ef444466", color: "#ef4444", padding: "10px 12px", borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
          ⚠️ {error}
        </div>
      )}

      <button type="submit" disabled={saving}
        style={{ width: "100%", padding: "14px", background: saving ? "rgba(34,197,94,0.5)" : "#22c55e", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: saving ? "default" : "pointer", marginTop: 6 }}>
        {saving ? "Enviando…" : "Enviar postulación"}
      </button>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: 10 }}>
        Al enviar aceptas que Atolón Beach Club almacene y procese tus datos para fines de selección de personal.
      </div>
    </form>
  );
}

const IS_PORTAL = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
};
const Field = ({ label, children }) => (
  <div>
    <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</label>
    {children}
  </div>
);
