// Landing Despedidas — Atolón Beach Club
// Rutas:
//   /despedidas            → landing hero + CTA
//   /despedidas/nuevo      → formulario crear grupo
//   /despedidas/:codigo    → página del grupo (ver miembros + unirse)

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg:       "#0D1B3E",
  bgCard:   "#162040",
  bgLight:  "#1C2B55",
  sand:     "#C8B99A",
  sky:      "#64B5F6",
  success:  "#34D399",
  danger:   "#F87171",
  text:     "#FFFFFF",
  textMid:  "rgba(255,255,255,0.6)",
  textLight:"rgba(255,255,255,0.35)",
  border:   "rgba(255,255,255,0.1)",
  accent:   "#F5C842",
  rose:     "#f472b6",
};

const IS = {
  width: "100%", padding: "12px 16px", borderRadius: 10,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
  color: C.text, fontSize: 15, outline: "none", boxSizing: "border-box",
};
const LS = { display: "block", fontSize: 11, color: C.sand, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 };
const COP = (n) => "$" + Number(n || 0).toLocaleString("es-CO");

const slugify = (s) => (s || "")
  .toString().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// ═══════════════════════════════════════════════════════════════════════════
// ROUTER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
export default function Despedidas() {
  useEffect(() => { document.title = "Despedida de Soltero/a — Atolón Beach Club"; }, []);
  const path = typeof window !== "undefined" ? window.location.pathname : "";

  // /despedidas/nuevo
  if (/^\/despedidas\/nuevo\/?$/.test(path)) return <CrearGrupo />;
  // /despedidas/:codigo
  const m = path.match(/^\/despedidas\/([^/]+)\/?$/);
  if (m && m[1] !== "nuevo") return <GrupoDetalle codigo={m[1]} />;
  // /despedidas
  return <Landing />;
}

// ═══════════════════════════════════════════════════════════════════════════
// LANDING
// ═══════════════════════════════════════════════════════════════════════════
function Landing() {
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'Inter', sans-serif" }}>
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, rgba(13,27,62,0.85) 0%, rgba(22,32,64,0.9) 100%), url('https://www.atolon.co/og-image.jpg') center/cover`,
        padding: "60px 24px", textAlign: "center",
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ fontSize: 12, letterSpacing: "0.3em", color: C.sand, marginBottom: 16, fontWeight: 600 }}>
            ATOLÓN · BEACH CLUB · CARTAGENA
          </div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(36px, 8vw, 64px)", fontWeight: 900, lineHeight: 1, margin: "0 0 18px", letterSpacing: "0.02em" }}>
            TU DESPEDIDA EN EL PARAÍSO
          </h1>
          <div style={{ fontSize: 18, color: C.textMid, marginBottom: 30, lineHeight: 1.5 }}>
            Playa privada · Bebida de bienvenida · Música · Cama balinesa · Almuerzo VIP<br />
            <strong style={{ color: C.rose }}>🥳 El/la festejado/a entra GRATIS si reúnen 10 amigos</strong>
          </div>
          <a href="/despedidas/nuevo"
            style={{ display: "inline-block", padding: "16px 36px", background: C.rose, color: C.bg, fontWeight: 800, fontSize: 16, letterSpacing: "0.06em", borderRadius: 12, textDecoration: "none", textTransform: "uppercase", boxShadow: "0 8px 24px rgba(244,114,182,0.3)" }}>
            🎉 Crear mi grupo
          </a>
        </div>
      </div>

      {/* Cómo funciona */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "60px 24px" }}>
        <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 34, fontWeight: 800, textAlign: "center", marginBottom: 40, letterSpacing: "0.03em" }}>
          ¿Cómo funciona?
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20 }}>
          {[
            { n: "1", t: "Crea tu grupo", d: "Cuéntanos quién es el festejado, la fecha y si tú pagas o cada quien paga lo suyo. Tarda 2 minutos." },
            { n: "2", t: "Comparte el link", d: "Envía a tus amigos el link único del grupo. Cada uno entra, reserva y confirma." },
            { n: "3", t: "Llegan a 10 → festejado gratis", d: "Cuando el grupo complete 10 personas pagadas, el festejado entra SIN COSTO." },
            { n: "4", t: "¡A celebrar!", d: "Playa privada, DJ, bebidas y la mejor vista de Cartagena. Inolvidable." },
          ].map(s => (
            <div key={s.n} style={{ background: C.bgCard, borderRadius: 14, padding: "24px 20px", border: `1px solid ${C.border}` }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.rose + "22", color: C.rose, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, marginBottom: 12 }}>{s.n}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{s.t}</div>
              <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.6 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Beneficios */}
      <div style={{ background: C.bgCard, padding: "50px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 800, textAlign: "center", marginBottom: 30, letterSpacing: "0.03em" }}>
            Incluido en tu experiencia
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {[
              { icon: "🚤", text: "Transporte ida y vuelta en lancha" },
              { icon: "🍹", text: "Bebida de bienvenida" },
              { icon: "🏖️", text: "Cama balinesa en la playa" },
              { icon: "🎵", text: "Música ambiente todo el día" },
              { icon: "🍽️", text: "Almuerzo VIP (opcional)" },
              { icon: "📸", text: "Las mejores fotos" },
            ].map((b, i) => (
              <div key={i} style={{ background: C.bg, borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 28 }}>{b.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA final */}
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 38, fontWeight: 800, marginBottom: 20, letterSpacing: "0.02em" }}>
          ¿Listo para organizar tu despedida?
        </div>
        <a href="/despedidas/nuevo"
          style={{ display: "inline-block", padding: "18px 42px", background: C.rose, color: C.bg, fontWeight: 800, fontSize: 16, letterSpacing: "0.06em", borderRadius: 12, textDecoration: "none", textTransform: "uppercase" }}>
          🎉 Crear mi grupo ahora
        </a>
      </div>

      <Footer />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREAR GRUPO
// ═══════════════════════════════════════════════════════════════════════════
function CrearGrupo() {
  const [form, setForm] = useState({
    tipo: "soltera",
    organizador_nombre: "",
    organizador_email: "",
    organizador_telefono: "",
    fecha_evento: "",
    pasadia_tipo: "",
    precio_por_persona: 0,
    modalidad_pago: "individual",
    pax_total: 11, // solo se usa si modalidad = "organizador"
    hora_salida: "",
    mensaje_anfitrion: "",
  });
  const [saving, setSaving] = useState(false);
  const [pasadias, setPasadias] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("pasadias")
        .select("id, nombre, precio, web_publica")
        .eq("web_publica", true)
        .order("precio", { ascending: true });
      const list = (data || []).filter(p => Number(p.precio) > 0);
      setPasadias(list);
      // Preseleccionar el primero
      if (list.length && !form.pasadia_tipo) {
        setForm(f => ({ ...f, pasadia_tipo: list[0].nombre, precio_por_persona: Number(list[0].precio) }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const crear = async () => {
    if (!form.organizador_nombre.trim()) return alert("Tu nombre es requerido");
    if (!form.fecha_evento) return alert("Selecciona la fecha");
    if (!form.hora_salida) return alert("Selecciona la hora de salida");
    if (form.modalidad_pago === "organizador" && (!form.pax_total || Number(form.pax_total) < 2)) {
      return alert("Ingresa el número de personas (mínimo 2)");
    }
    setSaving(true);
    try {
      const codigo = slugify(form.organizador_nombre) + "-" + Math.random().toString(36).slice(2, 8);
      const { data, error } = await supabase.from("grupos_despedidas").insert({
        codigo,
        tipo: form.tipo,
        organizador_nombre: form.organizador_nombre.trim(),
        organizador_email: form.organizador_email.trim() || null,
        organizador_telefono: form.organizador_telefono.trim() || null,
        fecha_evento: form.fecha_evento,
        pasadia_tipo: form.pasadia_tipo,
        precio_por_persona: Number(form.precio_por_persona) || 320000,
        modalidad_pago: form.modalidad_pago,
        pax_objetivo: form.modalidad_pago === "organizador" ? (Number(form.pax_total) || 11) : 10,
        hora_salida: form.hora_salida || null,
        mensaje_anfitrion: form.mensaje_anfitrion.trim() || null,
      }).select().single();
      if (error) throw error;

      // Insertar al organizador como primer miembro
      await supabase.from("grupos_despedidas_miembros").insert({
        grupo_id: data.id,
        nombre: form.organizador_nombre.trim(),
        email: form.organizador_email.trim() || null,
        telefono: form.organizador_telefono.trim() || null,
        es_organizador: true,
        estado: "confirmado",
      });

      // Crear evento correspondiente en el módulo Eventos (categoría grupo)
      try {
        const eventoId = `EVT-DSP-${Date.now()}`;
        const tipoLabel = form.tipo === "soltera" ? "Soltera" : "Soltero";
        const paxEvento = form.modalidad_pago === "organizador"
          ? (Number(form.pax_total) || 11)
          : 11; // organizador + 10 invitados
        const valorEvento = form.modalidad_pago === "organizador"
          ? (Number(form.precio_por_persona) || 0) * paxEvento // organizador paga por todos
          : (Number(form.precio_por_persona) || 0) * 10;        // 10 invitados pagan, organizador gratis
        await supabase.from("eventos").insert({
          id: eventoId,
          nombre: `Despedida ${tipoLabel} · ${form.organizador_nombre.trim()}`,
          tipo: form.pasadia_tipo,
          fecha: form.fecha_evento,
          hora_ini: form.hora_salida || "",
          pax: paxEvento,
          valor: valorEvento,
          salidas_grupo: [],
          contacto: form.organizador_nombre.trim(),
          tel: form.organizador_telefono.trim() || "",
          email: form.organizador_email.trim() || "",
          stage: "Consulta",
          categoria: "grupo",
          modalidad_pago: form.modalidad_pago,
          pasadias_org: [{ id: "org", tipo: form.pasadia_tipo, personas: String(paxEvento) }],
          precio_tipo: "publico",
          notas: `Despedida creada desde landing · /despedidas/${codigo}${form.mensaje_anfitrion ? "\n\n" + form.mensaje_anfitrion.trim() : ""}`,
        });
        // Link bidireccional: guardar evento_id en grupos_despedidas
        await supabase.from("grupos_despedidas").update({ evento_id: eventoId }).eq("id", data.id);
      } catch (e) {
        console.warn("No se pudo crear evento asociado:", e);
      }

      window.location.href = `/despedidas/${codigo}`;
    } catch (err) {
      alert("Error: " + (err.message || err));
      setSaving(false);
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'Inter', sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <a href="/despedidas" style={{ color: C.textMid, fontSize: 13, textDecoration: "none" }}>← Volver</a>
        <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 36, fontWeight: 900, marginTop: 10, marginBottom: 8, letterSpacing: "0.02em" }}>
          🎉 Crear tu grupo
        </h1>
        <p style={{ color: C.textMid, fontSize: 14, marginBottom: 32 }}>
          Completa estos datos y te damos un link único para compartir con tus amigos.
        </p>

        <div style={{ background: C.bgCard, borderRadius: 14, padding: 28, border: `1px solid ${C.border}` }}>
          {/* Tipo de despedida */}
          <div style={{ marginBottom: 20 }}>
            <label style={LS}>¿De quién es la despedida?</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { val: "soltera", emoji: "👰", label: "Soltera" },
                { val: "soltero", emoji: "🤵", label: "Soltero" },
              ].map(o => (
                <button key={o.val} onClick={() => set("tipo", o.val)} style={{
                  padding: "16px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700,
                  background: form.tipo === o.val ? C.rose + "22" : C.bgLight,
                  border: `2px solid ${form.tipo === o.val ? C.rose : "transparent"}`,
                  color: form.tipo === o.val ? C.rose : C.text,
                }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{o.emoji}</div>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={LS}>Tu nombre (organizador) *</label>
            <input value={form.organizador_nombre} onChange={e => set("organizador_nombre", e.target.value)} placeholder="Nombre y apellido" style={IS} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div>
              <label style={LS}>Email</label>
              <input type="email" value={form.organizador_email} onChange={e => set("organizador_email", e.target.value)} placeholder="tu@email.com" style={IS} />
            </div>
            <div>
              <label style={LS}>WhatsApp</label>
              <input value={form.organizador_telefono} onChange={e => set("organizador_telefono", e.target.value)} placeholder="+57 300..." style={IS} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div>
              <label style={LS}>Fecha del evento *</label>
              <input type="date" value={form.fecha_evento} onChange={e => set("fecha_evento", e.target.value)}
                min={new Date().toISOString().slice(0, 10)} style={IS} />
            </div>
            <div>
              <label style={LS}>Hora de salida *</label>
              <select value={form.hora_salida} onChange={e => set("hora_salida", e.target.value)} style={IS}>
                <option value="">Selecciona…</option>
                <option value="08:30">8:30 AM</option>
                <option value="10:00">10:00 AM</option>
                <option value="11:30">11:30 AM</option>
                <option value="12:30">12:30 PM</option>
              </select>
            </div>
          </div>

          {/* Tipo de pasadía — precios desde BD */}
          <div style={{ marginBottom: 20 }}>
            <label style={LS}>Tipo de pasadía</label>
            {pasadias.length === 0 ? (
              <div style={{ ...IS, color: C.textMid, fontSize: 13 }}>Cargando pasadías…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(pasadias.length, 3)}, 1fr)`, gap: 8 }}>
                {pasadias.map(p => (
                  <button key={p.id} onClick={() => { set("pasadia_tipo", p.nombre); set("precio_por_persona", Number(p.precio)); }} style={{
                    padding: "12px 8px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700, textAlign: "center",
                    background: form.pasadia_tipo === p.nombre ? C.sand + "22" : C.bgLight,
                    border: `2px solid ${form.pasadia_tipo === p.nombre ? C.sand : "transparent"}`,
                    color: form.pasadia_tipo === p.nombre ? C.sand : C.text,
                  }}>
                    <div style={{ marginBottom: 4 }}>{p.nombre}</div>
                    <div style={{ fontSize: 11, color: C.textMid, fontWeight: 600 }}>{COP(p.precio)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pago */}
          <div style={{ marginBottom: 20 }}>
            <label style={LS}>¿Cómo van a pagar?</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { val: "individual", title: "💳 Cada quien paga lo suyo", desc: "Cada invitado entra con su propio link y paga por separado" },
                { val: "organizador", title: "🎁 Yo pago por todos", desc: "Tú como organizador asumes el pago total del grupo" },
              ].map(o => (
                <button key={o.val} onClick={() => set("modalidad_pago", o.val)} style={{
                  padding: "14px 16px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  background: form.modalidad_pago === o.val ? C.sky + "22" : C.bgLight,
                  border: `2px solid ${form.modalidad_pago === o.val ? C.sky : "transparent"}`,
                  color: C.text,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{o.title}</div>
                  <div style={{ fontSize: 12, color: C.textMid }}>{o.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {form.modalidad_pago === "organizador" && (
            <div style={{ marginBottom: 20 }}>
              <label style={LS}>¿Cuántas personas en total? *</label>
              <input type="number" min={2} max={200} value={form.pax_total}
                onChange={e => set("pax_total", e.target.value)}
                placeholder="Ej: 15" style={IS} />
              <div style={{ fontSize: 12, color: C.textMid, marginTop: 6 }}>
                Total a pagar: <strong style={{ color: C.sand }}>{COP((Number(form.pax_total) || 0) * (Number(form.precio_por_persona) || 0))}</strong>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <label style={LS}>Mensaje para tus invitados (opcional)</label>
            <textarea value={form.mensaje_anfitrion} onChange={e => set("mensaje_anfitrion", e.target.value)}
              rows={3} placeholder="Ej: ¡Nos vamos a despedir a Ana en grande! Necesitamos mínimo 10 personas para que yo entre gratis 😉"
              style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
          </div>

          {/* Recordatorio */}
          <div style={{ background: C.rose + "15", border: `1px solid ${C.rose}44`, borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: 13, color: C.textMid }}>
            ✨ Si tu grupo llega a <strong style={{ color: C.rose }}>10 invitados pagados</strong>, el/la festejado/a entra <strong style={{ color: C.rose }}>GRATIS</strong>.
          </div>

          <button onClick={crear} disabled={saving}
            style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: saving ? C.bgLight : C.rose, color: C.bg, fontWeight: 800, fontSize: 15, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer" }}>
            {saving ? "Creando..." : "🎉 Crear mi grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DETALLE DEL GRUPO + UNIRSE
// ═══════════════════════════════════════════════════════════════════════════
function GrupoDetalle({ codigo }) {
  const [grupo, setGrupo] = useState(null);
  const [miembros, setMiembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "" });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: g } = await supabase.from("grupos_despedidas").select("*").eq("codigo", codigo).maybeSingle();
    if (!g) { setError("Grupo no encontrado"); setLoading(false); return; }
    const { data: m } = await supabase.from("grupos_despedidas_miembros").select("*").eq("grupo_id", g.id).order("created_at");
    setGrupo(g);
    setMiembros(m || []);
    setLoading(false);
  }, [codigo]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <CenteredMsg icon="⏳" title="Cargando..." />;
  if (error) return <CenteredMsg icon="❌" title={error} />;
  if (!grupo) return null;

  const invitadosPagados = miembros.filter(m => !m.es_organizador && (m.estado === "pagado" || m.estado === "confirmado")).length;
  const metaGratis = 10;
  const organizadorGratis = invitadosPagados >= metaGratis;
  const progreso = Math.min(100, (invitadosPagados / metaGratis) * 100);

  const unirse = async () => {
    if (!form.nombre.trim()) return alert("Tu nombre es requerido");
    setSaving(true);
    try {
      const { error } = await supabase.from("grupos_despedidas_miembros").insert({
        grupo_id: grupo.id,
        nombre: form.nombre.trim(),
        email: form.email.trim() || null,
        telefono: form.telefono.trim() || null,
        estado: "confirmado",
      });
      if (error) throw error;
      // Si modalidad individual, redirigir a booking con el grupo referenciado
      if (grupo.modalidad_pago === "individual") {
        const params = new URLSearchParams({
          tipo: grupo.pasadia_tipo,
          fecha: grupo.fecha_evento,
          nombre: form.nombre,
          email: form.email || "",
          tel: form.telefono || "",
          grupo: grupo.codigo,
        });
        window.location.href = `/booking?${params.toString()}`;
        return;
      }
      setShowJoinForm(false);
      setForm({ nombre: "", email: "", telefono: "" });
      load();
    } catch (err) {
      alert("Error: " + (err.message || err));
      setSaving(false);
    }
  };

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/despedidas/${codigo}` : "";
  const copiarLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { prompt("Copia este link:", shareUrl); }
  };
  const compartirWhatsapp = () => {
    const txt = encodeURIComponent(`🎉 ¡Te invito a la despedida de ${grupo.tipo === "soltera" ? "soltera" : "soltero"} de ${grupo.organizador_nombre}!\n\n📅 ${new Date(grupo.fecha_evento + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}\n📍 Atolón Beach Club, Cartagena\n\n👉 ${shareUrl}`);
    window.open(`https://wa.me/?text=${txt}`, "_blank");
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "30px 20px 60px" }}>
        <a href="/despedidas" style={{ color: C.textMid, fontSize: 13, textDecoration: "none" }}>← Atolón Beach Club</a>

        {/* Header del grupo */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <div style={{ fontSize: 60, marginBottom: 12 }}>{grupo.tipo === "soltera" ? "👰🎉" : "🤵🎉"}</div>
          <div style={{ fontSize: 11, color: C.sand, letterSpacing: "0.15em", marginBottom: 8 }}>
            DESPEDIDA DE {grupo.tipo === "soltera" ? "SOLTERA" : "SOLTERO"}
          </div>
          <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 40, fontWeight: 900, margin: 0, lineHeight: 1 }}>
            {grupo.organizador_nombre}
          </h1>
          <div style={{ fontSize: 15, color: C.textMid, marginTop: 8 }}>
            📅 {new Date(grupo.fecha_evento + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {grupo.hora_salida ? ` · 🛥️ ${grupo.hora_salida}` : ""}
          </div>
          <div style={{ fontSize: 14, color: C.sand, marginTop: 4 }}>
            🏖️ Atolón Beach Club · {grupo.pasadia_tipo}
          </div>
        </div>

        {grupo.mensaje_anfitrion && (
          <div style={{ marginTop: 20, background: C.rose + "15", border: `1px solid ${C.rose}33`, borderRadius: 12, padding: "14px 18px", fontSize: 14, color: C.text, lineHeight: 1.5, fontStyle: "italic" }}>
            💬 "{grupo.mensaje_anfitrion}"
          </div>
        )}

        {/* Progreso */}
        <div style={{ marginTop: 24, background: C.bgCard, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: C.textMid }}>Invitados pagados</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800 }}>
              <span style={{ color: organizadorGratis ? C.success : C.rose }}>{invitadosPagados}</span>
              <span style={{ color: C.textLight }}> / {metaGratis}</span>
            </div>
          </div>
          <div style={{ height: 10, background: C.bg, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progreso}%`, background: organizadorGratis ? C.success : C.rose, transition: "width 0.4s" }} />
          </div>
          <div style={{ fontSize: 12, color: organizadorGratis ? C.success : C.textMid, marginTop: 10, textAlign: "center", fontWeight: 600 }}>
            {organizadorGratis
              ? `🎁 ¡${grupo.organizador_nombre} entra GRATIS!`
              : `Faltan ${metaGratis - invitadosPagados} para que ${grupo.organizador_nombre} entre gratis`}
          </div>
        </div>

        {/* Precio + modalidad */}
        <div style={{ marginTop: 16, background: C.bgCard, borderRadius: 14, padding: "16px 18px", border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: C.textLight, textTransform: "uppercase", letterSpacing: 1 }}>Precio por persona</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 800, color: C.sand }}>{COP(grupo.precio_por_persona)}</div>
          </div>
          <div style={{ padding: "6px 12px", borderRadius: 20, background: grupo.modalidad_pago === "organizador" ? C.accent + "22" : C.sky + "22", color: grupo.modalidad_pago === "organizador" ? C.accent : C.sky, fontSize: 12, fontWeight: 700 }}>
            {grupo.modalidad_pago === "organizador" ? "🎁 Paga el organizador" : "💳 Cada quien paga"}
          </div>
        </div>

        {/* CTA Unirse */}
        <div style={{ marginTop: 20 }}>
          {!showJoinForm ? (
            <button onClick={() => setShowJoinForm(true)}
              style={{ width: "100%", padding: "18px", borderRadius: 12, border: "none", background: C.rose, color: C.bg, fontWeight: 800, fontSize: 16, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", boxShadow: "0 8px 24px rgba(244,114,182,0.2)" }}>
              🎉 Unirme al grupo
            </button>
          ) : (
            <div style={{ background: C.bgCard, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Tus datos</div>
              <div style={{ marginBottom: 12 }}>
                <label style={LS}>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre completo" style={IS} autoFocus />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={LS}>Email</label>
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email" style={IS} />
                </div>
                <div>
                  <label style={LS}>WhatsApp</label>
                  <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="+57..." style={IS} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowJoinForm(false)} style={{ flex: 1, padding: "14px", borderRadius: 10, background: C.bgLight, color: C.textMid, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button onClick={unirse} disabled={saving}
                  style={{ flex: 2, padding: "14px", borderRadius: 10, background: C.rose, color: C.bg, border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  {saving ? "Uniendo..." : grupo.modalidad_pago === "individual" ? "Continuar al pago →" : "Confirmar asistencia"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Compartir */}
        <div style={{ marginTop: 20, background: C.bgCard, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, color: C.textMid, marginBottom: 10 }}>📣 Comparte con tus amigos</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={compartirWhatsapp} style={{ flex: 1, padding: "12px", borderRadius: 10, background: "#25D366", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              📱 WhatsApp
            </button>
            <button onClick={copiarLink} style={{ flex: 1, padding: "12px", borderRadius: 10, background: C.bgLight, color: C.text, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {copied ? "✓ Copiado" : "🔗 Copiar link"}
            </button>
          </div>
        </div>

        {/* Miembros */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.sand, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            Personas en el grupo ({miembros.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {miembros.map(m => (
              <div key={m.id} style={{ background: C.bgCard, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", border: m.es_organizador ? `1px solid ${C.rose}55` : `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.bgLight, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C.sand }}>
                    {(m.nombre || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.nombre}</div>
                    {m.es_organizador && <div style={{ fontSize: 10, color: C.rose, fontWeight: 700 }}>🎉 ORGANIZADOR</div>}
                  </div>
                </div>
                <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, background: m.estado === "pagado" ? C.success + "22" : C.sand + "22", color: m.estado === "pagado" ? C.success : C.sand, fontWeight: 700, letterSpacing: 1 }}>
                  {m.estado.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function CenteredMsg({ icon, title }) {
  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.text, textAlign: "center", padding: 24, fontFamily: "'Inter', sans-serif" }}>
      <div>
        <div style={{ fontSize: 60, marginBottom: 12 }}>{icon}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px 20px", fontSize: 11, color: C.textLight, letterSpacing: "0.1em" }}>
      ATOLÓN · BEACH CLUB · CARTAGENA DE INDIAS · atolon.co
    </div>
  );
}
