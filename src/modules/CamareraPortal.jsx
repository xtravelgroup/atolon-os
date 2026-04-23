import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";

const B = {
  bg:        "#070F1F",
  navy:      "#0D1B3E",
  navyMid:   "#152448",
  navyLight: "#1E2C52",
  sky:       "#8ECAE6",
  sand:      "#C8B99A",
  hotel:     "#a78bfa",
  white:     "#F8FAFC",
  success:   "#22c55e",
  danger:    "#ef4444",
  warning:   "#f59e0b",
  text:      "#F8FAFC",
  textDim:   "rgba(248,250,252,0.6)",
  textFaint: "rgba(248,250,252,0.35)",
};

const TIPO_SERVICIO = {
  limpieza:   { label: "Limpieza",   icon: "🧹" },
  turndown:   { label: "Turndown",   icon: "🛏" },
  check_out:  { label: "Check-out",  icon: "🗝" },
  inspeccion: { label: "Inspección", icon: "🔍" },
};

const NOV_TIPOS = [
  { key: "dano",              label: "Daño",                icon: "💥" },
  { key: "olvidado",          label: "Objeto olvidado",     icon: "🎒" },
  { key: "mantenimiento",     label: "Mantenimiento",       icon: "🔧" },
  { key: "amenidad_faltante", label: "Amenidad faltante",   icon: "📦" },
  { key: "otro",              label: "Otro",                icon: "•" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function CamareraPortal({ token }) {
  useEffect(() => { document.title = "Housekeeping — Atolón"; }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [camarera, setCamarera] = useState(null);
  const [asignaciones, setAsignaciones] = useState([]);
  const [habsMap, setHabsMap] = useState({});
  const [novedadOpen, setNovedadOpen] = useState(null); // habitacion_id

  // Validar token
  useEffect(() => {
    if (!token) { setError("Token inválido"); setLoading(false); return; }
    (async () => {
      const { data: t } = await supabase
        .from("hk_camarera_tokens")
        .select("*, camarera:rh_empleados(*)")
        .eq("token", token)
        .maybeSingle();
      if (!t) { setError("Enlace no válido"); setLoading(false); return; }
      if (new Date(t.expira_at) < new Date()) { setError("Tu enlace ha expirado. Pídele otro a la gobernanta."); setLoading(false); return; }
      setCamarera(t.camarera);
      setLoading(false);
    })();
  }, [token]);

  // Cargar asignaciones del día
  const loadAsig = async () => {
    if (!camarera?.id) return;
    const fecha = todayStr();
    const aR = await supabase.from("hk_asignaciones").select("*").eq("camarera_id", camarera.id).eq("fecha", fecha).order("created_at");
    setAsignaciones(aR.data || []);
    const habIds = (aR.data || []).map(a => a.habitacion_id);
    if (habIds.length > 0) {
      const hR = await supabase.from("hotel_habitaciones").select("*").in("id", habIds);
      const map = {};
      (hR.data || []).forEach(h => { map[h.id] = h; });
      setHabsMap(map);
    }
  };
  useEffect(() => { loadAsig(); }, [camarera?.id]);

  // Realtime
  useEffect(() => {
    if (!camarera?.id || !supabase) return;
    const ch = supabase.channel(`hk-cam-${camarera.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hk_asignaciones", filter: `camarera_id=eq.${camarera.id}` }, () => loadAsig())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [camarera?.id]);

  const cambiarEstado = async (asig, estado) => {
    const patch = { estado, updated_at: new Date().toISOString() };
    if (estado === "en_progreso") patch.inicio_at = new Date().toISOString();
    if (estado === "completada") {
      patch.fin_at = new Date().toISOString();
      // Actualiza también el estado HK de la habitación
      await supabase.from("hotel_habitaciones").update({
        estado_hk: "limpia",
        hk_ultima_limpieza: new Date().toISOString(),
        hk_camarera_id: camarera.id,
      }).eq("id", asig.habitacion_id);
    }
    if (estado === "en_progreso") {
      await supabase.from("hotel_habitaciones").update({ estado_hk: "en_limpieza", hk_camarera_id: camarera.id }).eq("id", asig.habitacion_id);
    }
    await supabase.from("hk_asignaciones").update(patch).eq("id", asig.id);
    loadAsig();
  };

  const stats = useMemo(() => {
    const total = asignaciones.length;
    const pendientes = asignaciones.filter(a => a.estado === "pendiente").length;
    const enProgreso = asignaciones.filter(a => a.estado === "en_progreso").length;
    const completadas = asignaciones.filter(a => a.estado === "completada").length;
    return { total, pendientes, enProgreso, completadas };
  }, [asignaciones]);

  if (loading) {
    return <Centered icon="🧺" title="Cargando…" />;
  }
  if (error) {
    return <Centered icon="⚠️" title="Enlace no válido" sub={error} />;
  }

  const nombre = `${camarera.nombres || ""} ${camarera.apellidos || ""}`.trim();

  return (
    <div style={{ background: B.bg, minHeight: "100vh", color: B.text, fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 60 }}>
      {/* Header */}
      <header style={{ position: "sticky", top: 0, background: `linear-gradient(180deg, ${B.navy} 0%, ${B.navyMid} 100%)`, zIndex: 10, padding: "14px 16px", borderBottom: `1px solid ${B.sand}22`, boxShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img src="/atolon-logo-sand.png" alt="Atolón" style={{ height: 32, width: "auto" }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: B.sand, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>Housekeeping</div>
            <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>{nombre}</div>
          </div>
        </div>
      </header>

      <div style={{ padding: "18px 16px" }}>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          <KPI label="Total asignadas" val={stats.total} color={B.sand} />
          <KPI label="Pendientes" val={stats.pendientes} color={B.warning} />
          <KPI label="En progreso" val={stats.enProgreso} color={B.sky} />
          <KPI label="Completadas" val={stats.completadas} color={B.success} />
        </div>

        {/* Lista de asignaciones */}
        {asignaciones.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: B.textFaint, background: B.navy, borderRadius: 12, border: `1px dashed ${B.navyLight}` }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧺</div>
            <div style={{ fontSize: 14 }}>No tienes habitaciones asignadas hoy</div>
            <div style={{ fontSize: 11, marginTop: 6 }}>Pídele asignaciones a la gobernanta</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {asignaciones.map(a => {
              const hab = habsMap[a.habitacion_id];
              const tipo = TIPO_SERVICIO[a.tipo_servicio] || TIPO_SERVICIO.limpieza;
              const isProg = a.estado === "en_progreso";
              const isDone = a.estado === "completada";
              return (
                <div key={a.id} style={{
                  background: isDone ? `${B.success}11` : isProg ? `${B.warning}11` : B.navy,
                  borderRadius: 14,
                  padding: "16px 18px",
                  border: `1px solid ${isDone ? `${B.success}55` : isProg ? `${B.warning}66` : B.navyLight}`,
                  borderLeft: `5px solid ${isDone ? B.success : isProg ? B.warning : B.sand}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>
                        #{hab?.numero || "?"}
                      </div>
                      <div style={{ fontSize: 11, color: B.textDim, marginTop: 4 }}>
                        {hab?.categoria || ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22 }}>{tipo.icon}</div>
                      <div style={{ fontSize: 10, color: B.textFaint, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{tipo.label}</div>
                    </div>
                  </div>

                  {a.notas && (
                    <div style={{ fontSize: 11, color: B.textDim, marginBottom: 12, fontStyle: "italic", padding: "8px 10px", background: B.navyLight, borderRadius: 8 }}>
                      📝 {a.notas}
                    </div>
                  )}

                  {/* Botones de acción según estado */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {a.estado === "pendiente" && (
                      <button onClick={() => cambiarEstado(a, "en_progreso")}
                        style={btnLg(B.warning, B.navy)}>▶ Iniciar limpieza</button>
                    )}
                    {a.estado === "en_progreso" && (
                      <>
                        <button onClick={() => cambiarEstado(a, "completada")}
                          style={btnLg(B.success, "#fff")}>✓ Marcar completada</button>
                        <button onClick={() => cambiarEstado(a, "pendiente")}
                          style={btnSm(B.navyLight)}>⟲ Pausar</button>
                      </>
                    )}
                    {a.estado === "completada" && (
                      <button onClick={() => cambiarEstado(a, "en_progreso")}
                        style={btnSm(B.navyLight)}>⟲ Reabrir</button>
                    )}
                    <button onClick={() => setNovedadOpen(a)}
                      style={{ ...btnSm("transparent"), border: `1px solid ${B.danger}55`, color: B.danger }}>
                      ⚠ Reportar novedad
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal novedad */}
      {novedadOpen && (
        <NovedadModal asignacion={novedadOpen} habitacion={habsMap[novedadOpen.habitacion_id]} camarera={camarera}
          onClose={() => setNovedadOpen(null)}
          onSaved={() => { setNovedadOpen(null); loadAsig(); }} />
      )}
    </div>
  );
}

function KPI({ label, val, color }) {
  return (
    <div style={{ background: B.navy, borderRadius: 12, padding: "12px 14px", border: `1px solid ${B.navyLight}` }}>
      <div style={{ fontSize: 9, color: B.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4, lineHeight: 1 }}>{val}</div>
    </div>
  );
}

function btnLg(bg, color) {
  return { width: "100%", padding: "16px", borderRadius: 12, background: bg, color, border: "none", fontSize: 15, fontWeight: 800, cursor: "pointer" };
}
function btnSm(bg) {
  return { width: "100%", padding: "10px", borderRadius: 10, background: bg, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" };
}

function NovedadModal({ asignacion, habitacion, camarera, onClose, onSaved }) {
  const [tipo, setTipo] = useState("dano");
  const [prioridad, setPrioridad] = useState("normal");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!descripcion.trim()) return alert("Describe la novedad");
    setSaving(true);
    await supabase.from("hk_novedades").insert({
      habitacion_id: asignacion.habitacion_id,
      habitacion_num: habitacion?.numero || "",
      asignacion_id: asignacion.id,
      camarera_id: camarera.id,
      reportada_por: `${camarera.nombres || ""} ${camarera.apellidos || ""}`.trim(),
      tipo,
      prioridad,
      descripcion: descripcion.trim(),
      estado: "abierta",
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: B.navy, width: "100%", maxHeight: "90vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px" }}>
        <div style={{ width: 40, height: 4, background: B.navyLight, borderRadius: 2, margin: "0 auto 16px" }}></div>
        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 4 }}>
          Reportar novedad
        </div>
        <div style={{ fontSize: 12, color: B.textDim, marginBottom: 18 }}>
          Habitación #{habitacion?.numero || "?"}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Tipo</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {NOV_TIPOS.map(t => (
              <button key={t.key} onClick={() => setTipo(t.key)}
                style={{ padding: "12px 10px", borderRadius: 10, background: tipo === t.key ? `${B.sand}22` : B.navyLight, border: `1px solid ${tipo === t.key ? B.sand : "transparent"}`, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Prioridad</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { k: "baja", l: "Baja", c: "rgba(255,255,255,0.4)" },
              { k: "normal", l: "Normal", c: B.sky },
              { k: "alta", l: "Alta", c: B.warning },
              { k: "critica", l: "Crítica", c: B.danger },
            ].map(p => (
              <button key={p.k} onClick={() => setPrioridad(p.k)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, background: prioridad === p.k ? `${p.c}22` : B.navyLight, border: `1px solid ${prioridad === p.k ? p.c : "transparent"}`, color: prioridad === p.k ? p.c : "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                {p.l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Descripción</div>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4}
            placeholder="Describe lo que encontraste…"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>

        <button onClick={guardar} disabled={saving || !descripcion.trim()}
          style={{ ...btnLg(B.danger, "#fff"), opacity: saving || !descripcion.trim() ? 0.5 : 1 }}>
          {saving ? "Enviando…" : "📤 Enviar reporte"}
        </button>
        <button onClick={onClose} style={{ ...btnSm("transparent"), marginTop: 8, color: B.textDim }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Centered({ icon, title, sub }) {
  return (
    <div style={{ background: B.bg, minHeight: "100vh", color: B.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div>
        <div style={{ fontSize: 64, marginBottom: 16 }}>{icon}</div>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em", marginBottom: 8 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: B.textDim, maxWidth: 300 }}>{sub}</div>}
      </div>
    </div>
  );
}
