import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";

const B = {
  navy: "#0D1B3E", navyMid: "#172554", navyLight: "#1e293b",
  sky: "#8ECAE6", sand: "#C8B99A", white: "#F8FAFC",
  success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
  hotel: "#a78bfa",
};

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const TIPOS = [
  { key: "general",        label: "General",        color: B.sky },
  { key: "semanal",        label: "Semanal",        color: B.success },
  { key: "mensual",        label: "Mensual",        color: B.sand },
  { key: "extraordinario", label: "Extraordinario", color: B.warning },
];
const ESTADOS_BR = [
  { k: "programado", l: "Programado", c: B.sky },
  { k: "en_curso",   l: "En curso",   c: B.warning },
  { k: "cerrado",    l: "Cerrado",    c: B.success },
  { k: "cancelado",  l: "Cancelado",  c: B.danger },
];
const PRIO = [
  { k: "baja",    l: "Baja",    c: "rgba(255,255,255,0.4)" },
  { k: "normal",  l: "Normal",  c: B.sky },
  { k: "alta",    l: "Alta",    c: B.warning },
  { k: "critica", l: "Crítica", c: B.danger },
];
const ESTADOS_T = [
  { k: "pendiente",   l: "Pendiente",   c: "rgba(255,255,255,0.5)" },
  { k: "en_progreso", l: "En progreso", c: B.warning },
  { k: "completada",  l: "Completada",  c: B.success },
  { k: "cancelada",   l: "Cancelada",   c: B.danger },
];

const uid = () => Math.random().toString(36).slice(2, 11);
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtFecha = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";

export default function Briefings() {
  const [briefings, setBriefings] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("activos");
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [bR, tR, eR] = await Promise.all([
      supabase.from("briefings").select("*").order("fecha", { ascending: false }).order("hora", { ascending: false }),
      supabase.from("briefing_tareas").select("*").order("created_at", { ascending: false }),
      supabase.from("rh_empleados").select("id,nombres,apellidos,cargo,departamento_id").eq("activo", true).order("apellidos"),
    ]);
    setBriefings(bR.data || []);
    setTareas(tR.data || []);
    setEmpleados(eR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // KPIs
  const total = briefings.length;
  const activos = briefings.filter(b => b.estado === "programado" || b.estado === "en_curso").length;
  const tareasPend = tareas.filter(t => t.estado === "pendiente" || t.estado === "en_progreso").length;
  const tareasVencidas = tareas.filter(t => t.fecha_limite && t.fecha_limite < todayStr() && (t.estado === "pendiente" || t.estado === "en_progreso")).length;

  // Filtros por tab
  const visibles = useMemo(() => {
    if (tab === "activos") return briefings.filter(b => b.estado === "programado" || b.estado === "en_curso");
    if (tab === "historico") return briefings.filter(b => b.estado === "cerrado" || b.estado === "cancelado");
    return briefings;
  }, [briefings, tab]);

  const tareasPorBriefing = useMemo(() => {
    const map = {};
    tareas.forEach(t => {
      const k = t.briefing_id || "_sin";
      if (!map[k]) map[k] = [];
      map[k].push(t);
    });
    return map;
  }, [tareas]);

  // Crear nuevo briefing
  const crearBriefing = async () => {
    const codigo = `BR-${Date.now().toString().slice(-8)}`;
    // Buscar el más reciente cerrado para enlazar como anterior
    const anterior = briefings.find(b => b.estado === "cerrado");
    const payload = {
      codigo,
      fecha: todayStr(),
      hora: new Date().toTimeString().slice(0, 5),
      titulo: `Briefing ${todayStr()}`,
      tipo: "general",
      asistentes: [],
      agenda: [],
      notas: "",
      estado: "programado",
      briefing_anterior_id: anterior?.id || null,
    };
    const { data, error } = await supabase.from("briefings").insert(payload).select().single();
    if (error) return alert("Error: " + error.message);
    setOpenId(data.id);
    load();
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando…</div>;
  }

  // Vista detalle
  if (openId) {
    const briefing = briefings.find(b => b.id === openId);
    if (!briefing) {
      return <div style={{ padding: 40, textAlign: "center" }}>
        <div>Briefing no encontrado</div>
        <button onClick={() => setOpenId(null)} style={{ ...BTN(B.navyLight), marginTop: 14 }}>← Volver</button>
      </div>;
    }
    return <BriefingDetalle
      briefing={briefing}
      tareas={tareasPorBriefing[briefing.id] || []}
      tareasAnterior={briefing.briefing_anterior_id ? (tareasPorBriefing[briefing.briefing_anterior_id] || []) : []}
      briefingAnterior={briefings.find(b => b.id === briefing.briefing_anterior_id)}
      empleados={empleados}
      onClose={() => { setOpenId(null); load(); }}
      onReload={load}
    />;
  }

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1300, margin: "0 auto", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800 }}>📋 Briefings</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Reuniones con supervisores y gerentes · Asignación y seguimiento de tareas</div>
        </div>
        <button onClick={crearBriefing} style={BTN(B.hotel)}>+ Nuevo briefing</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Briefings totales", val: total, color: B.hotel },
          { label: "Activos", val: activos, color: B.sky },
          { label: "Tareas pendientes", val: tareasPend, color: B.warning },
          { label: "Tareas vencidas", val: tareasVencidas, color: B.danger },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navy, borderRadius: 12, padding: "16px 20px", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${B.navyLight}` }}>
        {[
          ["activos", `📌 Activos (${activos})`],
          ["tareas", `✅ Todas las tareas (${tareas.length})`],
          ["historico", "📚 Histórico"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 700 : 400,
              background: "none", color: tab === k ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: tab === k ? `2px solid ${B.hotel}` : "2px solid transparent" }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "tareas" ? (
        <TareasGlobales tareas={tareas} briefings={briefings} empleados={empleados} reload={load} />
      ) : (
        <ListaBriefings items={visibles} tareasPorBriefing={tareasPorBriefing} onOpen={setOpenId} />
      )}
    </div>
  );
}

// ─── LISTA DE BRIEFINGS ──────────────────────────────────────────────────────
function ListaBriefings({ items, tareasPorBriefing, onOpen }) {
  if (items.length === 0) {
    return <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12, border: `1px dashed ${B.navyLight}` }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
      <div>No hay briefings todavía</div>
      <div style={{ fontSize: 11, marginTop: 6 }}>Crea uno con el botón "Nuevo briefing"</div>
    </div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(b => {
        const t = TIPOS.find(x => x.key === b.tipo) || TIPOS[0];
        const e = ESTADOS_BR.find(x => x.k === b.estado) || ESTADOS_BR[0];
        const tareas = tareasPorBriefing[b.id] || [];
        const tareasPend = tareas.filter(x => x.estado === "pendiente" || x.estado === "en_progreso").length;
        const tareasComp = tareas.filter(x => x.estado === "completada").length;
        return (
          <div key={b.id} onClick={() => onOpen(b.id)}
            style={{ background: B.navy, borderRadius: 12, padding: "16px 20px", border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${t.color}`, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = B.hotel}
            onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
                    {b.titulo || `Briefing ${b.fecha}`}
                  </div>
                  <span style={{ fontSize: 10, color: t.color, border: `1px solid ${t.color}55`, borderRadius: 12, padding: "2px 8px", fontWeight: 700, textTransform: "uppercase" }}>{t.label}</span>
                  <span style={{ fontSize: 10, color: e.c, border: `1px solid ${e.c}55`, borderRadius: 12, padding: "2px 8px", fontWeight: 700, textTransform: "uppercase" }}>{e.l}</span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <span>📅 {fmtFecha(b.fecha)}{b.hora ? ` · ${b.hora.slice(0, 5)}` : ""}</span>
                  <span>👥 {(b.asistentes || []).length} asistentes</span>
                  <span>📌 {(b.agenda || []).length} temas</span>
                  <span>✅ {tareasComp}/{tareas.length} tareas</span>
                  {tareasPend > 0 && <span style={{ color: B.warning }}>⏳ {tareasPend} pendientes</span>}
                </div>
              </div>
              <div style={{ fontSize: 18, color: "rgba(255,255,255,0.3)" }}>›</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TAREAS GLOBALES ─────────────────────────────────────────────────────────
function TareasGlobales({ tareas, briefings, empleados, reload }) {
  const [filtroEst, setFiltroEst] = useState("activas");
  const [filtroEmp, setFiltroEmp] = useState("");

  const visibles = useMemo(() => {
    let arr = tareas;
    if (filtroEst === "activas") arr = arr.filter(t => t.estado === "pendiente" || t.estado === "en_progreso");
    else if (filtroEst === "completadas") arr = arr.filter(t => t.estado === "completada");
    if (filtroEmp) arr = arr.filter(t => t.asignado_id === filtroEmp);
    return arr.sort((a, b) => {
      // Vencidas primero
      const aVenc = a.fecha_limite && a.fecha_limite < todayStr() && a.estado !== "completada";
      const bVenc = b.fecha_limite && b.fecha_limite < todayStr() && b.estado !== "completada";
      if (aVenc !== bVenc) return aVenc ? -1 : 1;
      return (a.fecha_limite || "9999").localeCompare(b.fecha_limite || "9999");
    });
  }, [tareas, filtroEst, filtroEmp]);

  const cambiarEstado = async (id, estado) => {
    const patch = { estado, updated_at: new Date().toISOString() };
    if (estado === "completada") patch.completada_at = new Date().toISOString();
    await supabase.from("briefing_tareas").update(patch).eq("id", id);
    reload();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["activas", "Activas"], ["completadas", "Completadas"], ["todas", "Todas"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltroEst(k)}
            style={{ padding: "6px 14px", borderRadius: 18, border: `1px solid ${filtroEst === k ? B.hotel : B.navyLight}`,
              background: filtroEst === k ? `${B.hotel}22` : "transparent", color: filtroEst === k ? B.hotel : "rgba(255,255,255,0.55)",
              cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            {l}
          </button>
        ))}
        <select value={filtroEmp} onChange={e => setFiltroEmp(e.target.value)}
          style={{ ...IS, width: "auto", padding: "6px 12px", cursor: "pointer" }}>
          <option value="">Todos los responsables</option>
          {empleados.map(e => <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>)}
        </select>
      </div>

      {visibles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Sin tareas</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibles.map(t => {
            const p = PRIO.find(x => x.k === t.prioridad) || PRIO[1];
            const e = ESTADOS_T.find(x => x.k === t.estado) || ESTADOS_T[0];
            const venc = t.fecha_limite && t.fecha_limite < todayStr() && t.estado !== "completada";
            const briefing = briefings.find(b => b.id === t.briefing_id);
            return (
              <div key={t.id} style={{ background: B.navy, borderRadius: 12, padding: "12px 16px", border: `1px solid ${venc ? B.danger : B.navyLight}`, borderLeft: `4px solid ${p.c}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t.titulo}</div>
                    <span style={{ fontSize: 9, color: p.c, border: `1px solid ${p.c}55`, borderRadius: 10, padding: "1px 7px", fontWeight: 700, textTransform: "uppercase" }}>{p.l}</span>
                    {venc && <span style={{ fontSize: 9, color: B.danger, background: `${B.danger}22`, borderRadius: 10, padding: "1px 7px", fontWeight: 700, textTransform: "uppercase" }}>VENCIDA</span>}
                  </div>
                  {t.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{t.descripcion}</div>}
                  <div style={{ display: "flex", gap: 12, fontSize: 10, color: "rgba(255,255,255,0.4)", flexWrap: "wrap" }}>
                    {t.asignado_nombre && <span>👤 {t.asignado_nombre}</span>}
                    {t.fecha_limite && <span style={{ color: venc ? B.danger : "rgba(255,255,255,0.4)" }}>📅 {fmtFecha(t.fecha_limite)}</span>}
                    {briefing && <span>📋 {briefing.titulo || briefing.codigo}</span>}
                  </div>
                </div>
                <select value={t.estado} onChange={e => cambiarEstado(t.id, e.target.value)}
                  style={{ background: "transparent", border: `1px solid ${e.c}55`, color: e.c, borderRadius: 6, padding: "5px 10px", fontSize: 11, outline: "none", cursor: "pointer", appearance: "none", fontWeight: 700 }}>
                  {ESTADOS_T.map(opt => <option key={opt.k} value={opt.k} style={{ background: B.navy, color: "#fff" }}>{opt.l}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AI RECORDER ─────────────────────────────────────────────────────────────
function BriefingAIRecorder({ briefing, empleados, onApply }) {
  const [estado, setEstado] = useState("idle"); // idle | recording | processing | preview
  const [transcripcion, setTranscripcion] = useState(briefing.transcripcion || "");
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [tiempo, setTiempo] = useState(0);
  const recogRef = React.useRef(null);
  const startTimeRef = React.useRef(null);
  const timerRef = React.useRef(null);
  const interimRef = React.useRef("");

  const supportsSpeech = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const startRecording = () => {
    if (!supportsSpeech) {
      setError("Tu navegador no soporta reconocimiento de voz. Usa Chrome, Edge o Safari.");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "es-CO";
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (event) => {
      let finalChunk = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalChunk += transcript + " ";
        else interim += transcript;
      }
      if (finalChunk) {
        setTranscripcion(prev => (prev ? prev + " " : "") + finalChunk.trim());
        interimRef.current = "";
      } else {
        interimRef.current = interim;
      }
    };
    r.onerror = (e) => {
      console.error("Speech error", e);
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError("Error de reconocimiento: " + e.error);
    };
    r.onend = () => {
      // Auto-restart si seguimos en estado recording (Chrome corta cada ~30s)
      if (estado === "recording") {
        try { r.start(); } catch {}
      }
    };

    try {
      r.start();
      recogRef.current = r;
      startTimeRef.current = Date.now();
      setEstado("recording");
      setError(null);
      timerRef.current = setInterval(() => {
        setTiempo(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      setError("No se pudo iniciar: " + err.message);
    }
  };

  const stopRecording = () => {
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch {}
      recogRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setEstado("idle");
  };

  React.useEffect(() => {
    return () => {
      if (recogRef.current) try { recogRef.current.stop(); } catch {}
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const procesarConIA = async () => {
    if (!transcripcion.trim()) return setError("Sin transcripción");
    setEstado("processing");
    setError(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-briefing`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          transcripcion: transcripcion.trim(),
          empleados: empleados.map(e => ({
            id: e.id,
            nombre: `${e.nombres || ""} ${e.apellidos || ""}`.trim(),
            cargo: e.cargo || "",
          })),
          contexto: `Briefing "${briefing.titulo || briefing.codigo}" del ${briefing.fecha}.`,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error de IA");
      setResultado(data);
      setEstado("preview");
    } catch (e) {
      setError("Error procesando: " + e.message);
      setEstado("idle");
    }
  };

  const aplicar = async () => {
    if (!resultado) return;
    // Guardar transcripción + ai_data en briefing
    await supabase.from("briefings").update({
      transcripcion,
      ai_resumen: resultado.resumen || "",
      ai_data: resultado,
      updated_at: new Date().toISOString(),
    }).eq("id", briefing.id);

    // Crear tareas extraídas
    if (Array.isArray(resultado.tareas) && resultado.tareas.length > 0) {
      const rows = resultado.tareas.map(t => ({
        briefing_id: briefing.id,
        titulo: t.titulo || "Tarea sin título",
        descripcion: t.descripcion || "",
        asignado_id: t.asignado_id || null,
        asignado_nombre: t.asignado_nombre || "",
        fecha_limite: t.fecha_limite || null,
        prioridad: t.prioridad || "normal",
        estado: "pendiente",
      }));
      await supabase.from("briefing_tareas").insert(rows);
    }

    // Aplicar agenda + notas + acuerdos al briefing (merge con lo existente)
    onApply({
      agenda: resultado.agenda || [],
      notas: resultado.notas || "",
      acuerdos: resultado.acuerdos || "",
    });
    setResultado(null);
    setTranscripcion("");
    setEstado("idle");
  };

  const fmtMin = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{ background: `${B.hotel}11`, border: `1px solid ${B.hotel}55`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: B.hotel, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            🤖 Asistente IA · Toma de notas en vivo
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Habla naturalmente y la IA llenará el briefing automáticamente
          </div>
        </div>
        {estado === "idle" && !resultado && (
          <button onClick={startRecording} style={BTN(B.danger)}>🎙️ Iniciar grabación</button>
        )}
        {estado === "recording" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: B.danger, animation: "pulse 1s infinite" }}></div>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: B.danger }}>REC {fmtMin(tiempo)}</span>
            </div>
            <button onClick={stopRecording} style={BTN(B.navyLight)}>⏹ Detener</button>
          </div>
        )}
        {estado === "idle" && transcripcion && !resultado && (
          <button onClick={procesarConIA} style={BTN(B.success)}>✨ Procesar con IA</button>
        )}
        {estado === "processing" && (
          <div style={{ fontSize: 12, color: B.hotel, fontWeight: 700 }}>⏳ Analizando con Claude…</div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 11, color: B.danger, background: `${B.danger}15`, padding: "8px 12px", borderRadius: 6, marginBottom: 10 }}>
          ⚠ {error}
        </div>
      )}

      {/* Transcripción en vivo / editable */}
      {(estado === "recording" || transcripcion) && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 700 }}>
            Transcripción {estado === "recording" && "(en vivo)"}
          </div>
          <textarea
            value={transcripcion}
            onChange={e => setTranscripcion(e.target.value)}
            placeholder="La transcripción aparecerá aquí mientras hablas…"
            rows={6}
            style={{ ...IS, resize: "vertical", fontFamily: "inherit", fontSize: 12, lineHeight: 1.5 }}
          />
          {transcripcion && (
            <button onClick={() => setTranscripcion("")} style={{ ...BTN("transparent"), color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 4 }}>
              Limpiar
            </button>
          )}
        </div>
      )}

      {/* Preview de extracción */}
      {resultado && (
        <div style={{ marginTop: 14, background: B.navy, borderRadius: 10, padding: "14px 16px", border: `1px solid ${B.success}55` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: B.success, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              ✓ Análisis listo
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setResultado(null)} style={{ ...BTN(B.navyLight), fontSize: 11, padding: "5px 10px" }}>Descartar</button>
              <button onClick={aplicar} style={{ ...BTN(B.success), fontSize: 11, padding: "5px 12px" }}>✓ Aplicar al briefing</button>
            </div>
          </div>

          {resultado.resumen && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 12, fontStyle: "italic", padding: "10px 12px", background: B.navyLight, borderRadius: 8, borderLeft: `3px solid ${B.sand}` }}>
              💡 {resultado.resumen}
            </div>
          )}

          {Array.isArray(resultado.agenda) && resultado.agenda.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>📌 Temas detectados ({resultado.agenda.length})</div>
              {resultado.agenda.map((t, i) => (
                <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                  <strong>{t.titulo}</strong>{t.descripcion && ` — ${t.descripcion}`}
                </div>
              ))}
            </div>
          )}

          {Array.isArray(resultado.tareas) && resultado.tareas.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>✅ Tareas detectadas ({resultado.tareas.length})</div>
              {resultado.tareas.map((t, i) => {
                const p = PRIO.find(x => x.k === t.prioridad) || PRIO[1];
                return (
                  <div key={i} style={{ fontSize: 11, padding: "6px 10px", background: B.navyLight, borderRadius: 6, marginBottom: 4, borderLeft: `3px solid ${p.c}` }}>
                    <div style={{ fontWeight: 700, color: "#fff" }}>{t.titulo}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {t.asignado_nombre && `👤 ${t.asignado_nombre} · `}
                      {t.fecha_limite && `📅 ${t.fecha_limite} · `}
                      <span style={{ color: p.c, fontWeight: 700, textTransform: "uppercase" }}>{p.l}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {resultado.notas && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>📝 Notas</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{resultado.notas}</div>
            </div>
          )}

          {resultado.acuerdos && (
            <div>
              <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>🤝 Acuerdos</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{resultado.acuerdos}</div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}

// ─── DETALLE DE BRIEFING ─────────────────────────────────────────────────────
function BriefingDetalle({ briefing, tareas, tareasAnterior, briefingAnterior, empleados, onClose, onReload }) {
  const [form, setForm] = useState({ ...briefing });
  const [saving, setSaving] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showAddAttendee, setShowAddAttendee] = useState(false);

  useEffect(() => { setForm({ ...briefing }); }, [briefing.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = async (extras = {}) => {
    setSaving(true);
    const payload = {
      titulo: form.titulo,
      fecha: form.fecha,
      hora: form.hora || null,
      tipo: form.tipo,
      asistentes: form.asistentes || [],
      agenda: form.agenda || [],
      notas: form.notas || "",
      acuerdos: form.acuerdos || "",
      estado: form.estado,
      updated_at: new Date().toISOString(),
      ...extras,
    };
    await supabase.from("briefings").update(payload).eq("id", briefing.id);
    setSaving(false);
    onReload();
  };

  const cerrarBriefing = async () => {
    if (!confirm("¿Cerrar el briefing? Las tareas pendientes se mantendrán en seguimiento.")) return;
    await guardar({ estado: "cerrado", cerrado_at: new Date().toISOString() });
    onClose();
  };

  const iniciar = () => guardar({ estado: "en_curso" });

  // Asistentes
  const addAsistente = (emp) => {
    const exists = (form.asistentes || []).find(a => a.id === emp.id);
    if (exists) return;
    const nueva = { id: emp.id, nombre: `${emp.nombres} ${emp.apellidos}`.trim(), cargo: emp.cargo || "", presente: true };
    set("asistentes", [...(form.asistentes || []), nueva]);
    setShowAddAttendee(false);
  };
  const removeAsistente = (id) => set("asistentes", (form.asistentes || []).filter(a => a.id !== id));
  const togglePresente = (id) => set("asistentes", (form.asistentes || []).map(a => a.id === id ? { ...a, presente: !a.presente } : a));

  // Agenda
  const addAgenda = () => set("agenda", [...(form.agenda || []), { id: uid(), titulo: "", descripcion: "", orden: (form.agenda || []).length + 1 }]);
  const updateAgenda = (id, k, v) => set("agenda", (form.agenda || []).map(t => t.id === id ? { ...t, [k]: v } : t));
  const removeAgenda = (id) => set("agenda", (form.agenda || []).filter(t => t.id !== id));

  const t = TIPOS.find(x => x.key === form.tipo) || TIPOS[0];
  const e = ESTADOS_BR.find(x => x.k === form.estado) || ESTADOS_BR[0];

  const tareasPend = tareas.filter(x => x.estado === "pendiente" || x.estado === "en_progreso").length;
  const tareasComp = tareas.filter(x => x.estado === "completada").length;

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto", color: "#fff" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button onClick={onClose} style={{ ...BTN(B.navyLight), marginBottom: 12 }}>← Volver a briefings</button>
          <input value={form.titulo || ""} onChange={ev => set("titulo", ev.target.value)} onBlur={() => guardar()}
            placeholder="Título del briefing"
            style={{ background: "transparent", border: "none", color: "#fff", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: "0.02em", padding: 0, outline: "none", width: "100%" }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{briefing.codigo}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {form.estado === "programado" && <button onClick={iniciar} style={BTN(B.warning)}>▶ Iniciar</button>}
          {form.estado !== "cerrado" && <button onClick={cerrarBriefing} style={BTN(B.success)}>✓ Cerrar briefing</button>}
          <span style={{ fontSize: 11, color: e.c, border: `1px solid ${e.c}55`, borderRadius: 16, padding: "6px 14px", fontWeight: 700, textTransform: "uppercase", alignSelf: "flex-start" }}>{e.l}</span>
        </div>
      </div>

      {/* Datos básicos */}
      <div style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", marginBottom: 16, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <div>
            <label style={LS}>Fecha</label>
            <input type="date" value={form.fecha || ""} onChange={ev => set("fecha", ev.target.value)} onBlur={() => guardar()} style={IS} />
          </div>
          <div>
            <label style={LS}>Hora</label>
            <input type="time" value={form.hora ? form.hora.slice(0, 5) : ""} onChange={ev => set("hora", ev.target.value)} onBlur={() => guardar()} style={IS} />
          </div>
          <div>
            <label style={LS}>Tipo</label>
            <select value={form.tipo || "general"} onChange={ev => { set("tipo", ev.target.value); setTimeout(guardar, 100); }} style={{ ...IS, cursor: "pointer" }}>
              {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          {briefingAnterior && (
            <div>
              <label style={LS}>Briefing anterior</label>
              <button onClick={() => onClose() || setTimeout(() => location.reload(), 50)}
                style={{ ...IS, cursor: "pointer", textAlign: "left", color: B.sky }}>
                ↗ {briefingAnterior.titulo || briefingAnterior.codigo}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI Recorder */}
      <BriefingAIRecorder
        briefing={briefing}
        empleados={empleados}
        onApply={async (extracted) => {
          // Merge con la agenda existente
          const agendaActual = form.agenda || [];
          const agendaIA = (extracted.agenda || []).map(t => ({
            id: uid(),
            titulo: t.titulo || "",
            descripcion: t.descripcion || "",
            orden: agendaActual.length + 1,
          }));
          const notasMerge = form.notas
            ? `${form.notas}\n\n--- IA ---\n${extracted.notas}`
            : extracted.notas;
          const acuerdosMerge = form.acuerdos
            ? `${form.acuerdos}\n\n--- IA ---\n${extracted.acuerdos}`
            : extracted.acuerdos;
          const newForm = {
            ...form,
            agenda: [...agendaActual, ...agendaIA],
            notas: notasMerge,
            acuerdos: acuerdosMerge,
          };
          setForm(newForm);
          await supabase.from("briefings").update({
            agenda: newForm.agenda,
            notas: newForm.notas,
            acuerdos: newForm.acuerdos,
            updated_at: new Date().toISOString(),
          }).eq("id", briefing.id);
          onReload();
        }}
      />

      {/* Revisión de tareas del anterior */}
      {tareasAnterior.length > 0 && (
        <div style={{ background: `${B.sky}11`, border: `1px solid ${B.sky}44`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: B.sky, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            🔄 Revisión del briefing anterior — {tareasAnterior.length} tareas asignadas
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tareasAnterior.map(t => {
              const est = ESTADOS_T.find(x => x.k === t.estado) || ESTADOS_T[0];
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: B.navy, borderRadius: 8, borderLeft: `3px solid ${est.c}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{t.titulo}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>👤 {t.asignado_nombre || "—"}{t.fecha_limite ? ` · 📅 ${fmtFecha(t.fecha_limite)}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 9, color: est.c, border: `1px solid ${est.c}55`, borderRadius: 10, padding: "2px 8px", fontWeight: 700, textTransform: "uppercase" }}>{est.l}</span>
                  <select value={t.estado} onChange={async e => {
                    const patch = { estado: e.target.value, updated_at: new Date().toISOString() };
                    if (e.target.value === "completada") patch.completada_at = new Date().toISOString();
                    await supabase.from("briefing_tareas").update(patch).eq("id", t.id);
                    onReload();
                  }} style={{ background: "transparent", border: `1px solid ${est.c}55`, color: est.c, borderRadius: 6, padding: "3px 8px", fontSize: 10, outline: "none", cursor: "pointer", appearance: "none", fontWeight: 700 }}>
                    {ESTADOS_T.map(opt => <option key={opt.k} value={opt.k} style={{ background: B.navy }}>{opt.l}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Asistentes */}
      <div style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", marginBottom: 16, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            👥 Asistentes ({(form.asistentes || []).length})
          </div>
          <button onClick={() => setShowAddAttendee(true)} style={{ ...BTN(B.navyLight), fontSize: 11, padding: "5px 10px" }}>+ Agregar</button>
        </div>
        {(form.asistentes || []).length === 0 ? (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Sin asistentes asignados</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(form.asistentes || []).map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: a.presente ? `${B.success}22` : B.navyLight, border: `1px solid ${a.presente ? B.success : "transparent"}`, borderRadius: 16, fontSize: 11 }}>
                <button onClick={() => { togglePresente(a.id); setTimeout(guardar, 100); }}
                  style={{ background: "transparent", border: "none", color: a.presente ? B.success : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, padding: 0 }}>
                  {a.presente ? "✓" : "○"}
                </button>
                <span style={{ fontWeight: 700 }}>{a.nombre}</span>
                {a.cargo && <span style={{ color: "rgba(255,255,255,0.4)" }}>· {a.cargo}</span>}
                <button onClick={() => { removeAsistente(a.id); setTimeout(guardar, 100); }}
                  style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 11, padding: 0, marginLeft: 4 }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {showAddAttendee && (
          <div onClick={() => setShowAddAttendee(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={ev => ev.stopPropagation()} style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 460, maxWidth: "100%", maxHeight: "80vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14, fontFamily: "'Barlow Condensed', sans-serif" }}>Agregar asistentes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {empleados.filter(emp => !(form.asistentes || []).find(a => a.id === emp.id)).map(emp => (
                  <button key={emp.id} onClick={() => { addAsistente(emp); setTimeout(guardar, 100); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "#fff", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: B.hotel, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                      {(emp.nombres || "?")[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{emp.nombres} {emp.apellidos}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{emp.cargo || ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Agenda */}
      <div style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", marginBottom: 16, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            📌 Agenda ({(form.agenda || []).length})
          </div>
          <button onClick={addAgenda} style={{ ...BTN(B.navyLight), fontSize: 11, padding: "5px 10px" }}>+ Tema</button>
        </div>
        {(form.agenda || []).length === 0 ? (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Sin temas en la agenda</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(form.agenda || []).map((tema, idx) => (
              <div key={tema.id} style={{ background: B.navyLight, borderRadius: 8, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: B.hotel, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input value={tema.titulo || ""} onChange={ev => updateAgenda(tema.id, "titulo", ev.target.value)} onBlur={() => guardar()}
                    placeholder="Tema a tratar"
                    style={{ background: "transparent", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, padding: 0, outline: "none", width: "100%" }} />
                  <textarea value={tema.descripcion || ""} onChange={ev => updateAgenda(tema.id, "descripcion", ev.target.value)} onBlur={() => guardar()}
                    placeholder="Notas del tema…" rows={2}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 11, padding: "4px 0 0", outline: "none", width: "100%", resize: "vertical", fontFamily: "inherit" }} />
                </div>
                <button onClick={() => { removeAgenda(tema.id); setTimeout(guardar, 100); }}
                  style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notas + Acuerdos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>📝 Notas</div>
          <textarea value={form.notas || ""} onChange={ev => set("notas", ev.target.value)} onBlur={() => guardar()}
            placeholder="Notas generales del briefing…" rows={5}
            style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
        </div>
        <div style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", border: `1px solid ${B.navyLight}` }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>🤝 Acuerdos</div>
          <textarea value={form.acuerdos || ""} onChange={ev => set("acuerdos", ev.target.value)} onBlur={() => guardar()}
            placeholder="Acuerdos tomados en la reunión…" rows={5}
            style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
        </div>
      </div>

      {/* Tareas asignadas en este briefing */}
      <div style={{ background: B.navy, borderRadius: 12, padding: "16px 18px", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: B.sand, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            ✅ Tareas asignadas ({tareas.length}) · {tareasComp} completadas · {tareasPend} pendientes
          </div>
          <button onClick={() => setShowNewTask(true)} style={BTN(B.hotel)}>+ Nueva tarea</button>
        </div>
        {tareas.length === 0 ? (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic", padding: "10px 0" }}>Sin tareas asignadas todavía</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tareas.map(t => <TareaRow key={t.id} tarea={t} reload={onReload} />)}
          </div>
        )}
        {showNewTask && (
          <NewTaskModal briefingId={briefing.id} empleados={empleados}
            onClose={() => setShowNewTask(false)}
            onSaved={() => { setShowNewTask(false); onReload(); }} />
        )}
      </div>
    </div>
  );
}

function TareaRow({ tarea, reload }) {
  const p = PRIO.find(x => x.k === tarea.prioridad) || PRIO[1];
  const e = ESTADOS_T.find(x => x.k === tarea.estado) || ESTADOS_T[0];
  const venc = tarea.fecha_limite && tarea.fecha_limite < todayStr() && tarea.estado !== "completada";

  const cambiarEstado = async (estado) => {
    const patch = { estado, updated_at: new Date().toISOString() };
    if (estado === "completada") patch.completada_at = new Date().toISOString();
    await supabase.from("briefing_tareas").update(patch).eq("id", tarea.id);
    reload();
  };
  const eliminar = async () => {
    if (!confirm("¿Eliminar tarea?")) return;
    await supabase.from("briefing_tareas").delete().eq("id", tarea.id);
    reload();
  };

  return (
    <div style={{ background: B.navyLight, borderRadius: 10, padding: "10px 14px", borderLeft: `3px solid ${p.c}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{tarea.titulo}</div>
          <span style={{ fontSize: 9, color: p.c, border: `1px solid ${p.c}55`, borderRadius: 10, padding: "1px 7px", fontWeight: 700, textTransform: "uppercase" }}>{p.l}</span>
          {venc && <span style={{ fontSize: 9, color: B.danger, background: `${B.danger}22`, borderRadius: 10, padding: "1px 7px", fontWeight: 700, textTransform: "uppercase" }}>VENCIDA</span>}
        </div>
        {tarea.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 3 }}>{tarea.descripcion}</div>}
        <div style={{ display: "flex", gap: 12, fontSize: 10, color: "rgba(255,255,255,0.4)", flexWrap: "wrap" }}>
          {tarea.asignado_nombre && <span>👤 {tarea.asignado_nombre}</span>}
          {tarea.fecha_limite && <span style={{ color: venc ? B.danger : "rgba(255,255,255,0.4)" }}>📅 {fmtFecha(tarea.fecha_limite)}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select value={tarea.estado} onChange={ev => cambiarEstado(ev.target.value)}
          style={{ background: "transparent", border: `1px solid ${e.c}55`, color: e.c, borderRadius: 6, padding: "4px 8px", fontSize: 10, outline: "none", cursor: "pointer", appearance: "none", fontWeight: 700 }}>
          {ESTADOS_T.map(opt => <option key={opt.k} value={opt.k} style={{ background: B.navy, color: "#fff" }}>{opt.l}</option>)}
        </select>
        <button onClick={eliminar} style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 12 }}>✕</button>
      </div>
    </div>
  );
}

function NewTaskModal({ briefingId, empleados, onClose, onSaved }) {
  const [form, setForm] = useState({ titulo: "", descripcion: "", asignado_id: "", fecha_limite: "", prioridad: "normal" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const guardar = async () => {
    if (!form.titulo.trim()) return alert("Título obligatorio");
    const emp = empleados.find(e => e.id === form.asignado_id);
    await supabase.from("briefing_tareas").insert({
      briefing_id: briefingId,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim(),
      asignado_id: form.asignado_id || null,
      asignado_nombre: emp ? `${emp.nombres} ${emp.apellidos}`.trim() : "",
      fecha_limite: form.fecha_limite || null,
      prioridad: form.prioridad,
      estado: "pendiente",
    });
    onSaved();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 480, maxWidth: "100%", border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>Nueva tarea</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={LS}>Título *</label>
            <input value={form.titulo} onChange={e => set("titulo", e.target.value)} style={IS} placeholder="Ej: Revisar inventario de bar" autoFocus />
          </div>
          <div>
            <label style={LS}>Descripción</label>
            <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={2}
              placeholder="Detalles de la tarea…" style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div>
              <label style={LS}>Asignar a</label>
              <select value={form.asignado_id} onChange={e => set("asignado_id", e.target.value)} style={{ ...IS, cursor: "pointer" }}>
                <option value="">Sin asignar</option>
                {empleados.map(e => <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}{e.cargo ? ` — ${e.cargo}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Prioridad</label>
              <select value={form.prioridad} onChange={e => set("prioridad", e.target.value)} style={{ ...IS, cursor: "pointer" }}>
                {PRIO.map(p => <option key={p.k} value={p.k}>{p.l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={LS}>Fecha límite</label>
            <input type="date" value={form.fecha_limite} onChange={e => set("fecha_limite", e.target.value)} style={IS} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
          <button onClick={guardar} style={BTN(B.success)}>Crear tarea</button>
        </div>
      </div>
    </div>
  );
}
