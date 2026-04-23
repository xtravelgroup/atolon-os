import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";

const B = {
  navy: "#0D1B3E", navyMid: "#172554", navyLight: "#1e293b",
  sky: "#8ECAE6", sand: "#C8B99A", white: "#F8FAFC",
  success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
  hotel: "#a78bfa",
};

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const HK_ESTADOS = [
  { key: "limpia",         label: "Limpia",          color: B.success, icon: "✓" },
  { key: "sucia",          label: "Sucia",           color: B.danger,  icon: "✕" },
  { key: "en_limpieza",    label: "En limpieza",     color: B.warning, icon: "🧹" },
  { key: "inspeccionada",  label: "Inspeccionada",   color: B.sky,     icon: "★" },
  { key: "fuera_servicio", label: "Fuera servicio",  color: "#64748b", icon: "⛔" },
];
const hkColor = (e) => HK_ESTADOS.find(x => x.key === e)?.color || B.success;
const hkLabel = (e) => HK_ESTADOS.find(x => x.key === e)?.label || e;
const hkIcon  = (e) => HK_ESTADOS.find(x => x.key === e)?.icon || "•";

const TIPO_SERVICIO = [
  { key: "limpieza",   label: "Limpieza",     icon: "🧹" },
  { key: "turndown",   label: "Turndown",     icon: "🛏" },
  { key: "check_out",  label: "Check-out",    icon: "🗝" },
  { key: "inspeccion", label: "Inspección",   icon: "🔍" },
];

const NOV_TIPOS = [
  { key: "dano",              label: "Daño",                color: B.danger,  icon: "💥" },
  { key: "olvidado",          label: "Objeto olvidado",     color: B.sand,    icon: "🎒" },
  { key: "mantenimiento",     label: "Mantenimiento",       color: B.warning, icon: "🔧" },
  { key: "amenidad_faltante", label: "Amenidad faltante",   color: B.sky,     icon: "📦" },
  { key: "otro",              label: "Otro",                color: "#64748b", icon: "•" },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function HotelHousekeeping() {
  const [tab, setTab] = useState("estado");
  const [habs, setHabs] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [novedades, setNovedades] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [fecha, setFecha] = useState(todayStr());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [hR, eR, aR, nR, sR] = await Promise.all([
      supabase.from("hotel_habitaciones").select("*").order("numero"),
      supabase.from("rh_empleados").select("id,nombres,apellidos,cargo,departamento_id,activo").eq("activo", true).order("apellidos"),
      supabase.from("hk_asignaciones").select("*").eq("fecha", fecha),
      supabase.from("hk_novedades").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("hotel_room_service_pedidos")
        .select("id,codigo,habitacion_num,habitacion_id,items,notas,estado,canal,tipo,created_at")
        .eq("tipo", "servicio")
        .order("created_at", { ascending: false }).limit(100),
    ]);
    setHabs(hR.data || []);
    setEmpleados(eR.data || []);
    setAsignaciones(aR.data || []);
    setNovedades(nR.data || []);
    setSolicitudes(sR.data || []);
    setLoading(false);
  }, [fecha]);
  useEffect(() => { load(); }, [load]);

  // Realtime para novedades + solicitudes nuevas
  useEffect(() => {
    if (!supabase) return;
    const c1 = supabase.channel("hk-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "hk_novedades" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "hk_asignaciones" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(c1); };
  }, [load]);

  // Camareras = empleados de housekeeping (filtro por cargo o departamento)
  const camareras = useMemo(() => empleados.filter(e => /camarera|housekeep|cama|limpieza/i.test(`${e.cargo} ${e.departamento_id || ""}`)), [empleados]);
  const camarerasOpciones = camareras.length > 0 ? camareras : empleados;

  // KPIs
  const totalHabs = habs.length;
  const limpias = habs.filter(h => h.estado_hk === "limpia" || !h.estado_hk).length;
  const sucias = habs.filter(h => h.estado_hk === "sucia").length;
  const enLimpieza = habs.filter(h => h.estado_hk === "en_limpieza").length;
  const novAbiertas = novedades.filter(n => n.estado === "abierta" || n.estado === "en_proceso").length;
  const solicitudesAbiertas = solicitudes.filter(s => !["entregado", "cancelado"].includes(s.estado)).length;

  const setEstadoHk = async (habId, estado) => {
    await supabase.from("hotel_habitaciones").update({
      estado_hk: estado,
      hk_ultima_limpieza: estado === "limpia" || estado === "inspeccionada" ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    }).eq("id", habId);
    load();
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1300, margin: "0 auto", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800 }}>🧺 Housekeeping</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Estado de habitaciones · Asignaciones · Novedades</div>
        </div>
        <a href="/housekeeping/inspeccion" target="_blank" rel="noopener noreferrer"
          style={{ ...BTN(B.hotel), textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          ⭐ Inspección de habitación
        </a>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total habitaciones", val: totalHabs, color: B.hotel },
          { label: "Limpias", val: limpias, color: B.success },
          { label: "Sucias", val: sucias, color: B.danger },
          { label: "En limpieza", val: enLimpieza, color: B.warning },
          { label: "Novedades abiertas", val: novAbiertas, color: B.sand },
          { label: "Solicitudes guest", val: solicitudesAbiertas, color: B.sky },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navy, borderRadius: 12, padding: "14px 18px", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: `1px solid ${B.navyLight}` }}>
        {[
          ["estado", "🏨 Estado de habitaciones"],
          ["asignaciones", `📋 Asignaciones (${asignaciones.length})`],
          ["solicitudes", `🛎 Solicitudes guest (${solicitudesAbiertas})`],
          ["novedades", `⚠ Novedades (${novAbiertas})`],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === k ? 700 : 400,
              background: "none", color: tab === k ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: tab === k ? `2px solid ${B.hotel}` : "2px solid transparent" }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : tab === "estado" ? (
        <EstadoHabitaciones habs={habs} setEstadoHk={setEstadoHk} />
      ) : tab === "asignaciones" ? (
        <Asignaciones habs={habs} camareras={camarerasOpciones} asignaciones={asignaciones} fecha={fecha} setFecha={setFecha} reload={load} />
      ) : tab === "solicitudes" ? (
        <SolicitudesGuest items={solicitudes} reload={load} />
      ) : (
        <Novedades items={novedades} habs={habs} reload={load} />
      )}
    </div>
  );
}

// ─── ESTADO DE HABITACIONES ───────────────────────────────────────────────────
function EstadoHabitaciones({ habs, setEstadoHk }) {
  const [filtroCat, setFiltroCat] = useState("");
  const [filtroEst, setFiltroEst] = useState("");
  const cats = useMemo(() => Array.from(new Set(habs.map(h => h.categoria).filter(Boolean))).sort(), [habs]);
  const filtrados = useMemo(() => habs.filter(h => {
    if (filtroCat && h.categoria !== filtroCat) return false;
    if (filtroEst && (h.estado_hk || "limpia") !== filtroEst) return false;
    return true;
  }).sort((a, b) => (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true })), [habs, filtroCat, filtroEst]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          style={{ ...IS, width: "auto", padding: "8px 12px", cursor: "pointer" }}>
          <option value="">Todas las categorías</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {HK_ESTADOS.map(e => (
          <button key={e.key} onClick={() => setFiltroEst(filtroEst === e.key ? "" : e.key)}
            style={{ padding: "6px 14px", borderRadius: 18, border: `1px solid ${filtroEst === e.key ? e.color : B.navyLight}`,
              background: filtroEst === e.key ? `${e.color}22` : "transparent", color: filtroEst === e.key ? e.color : "rgba(255,255,255,0.55)",
              cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            {e.icon} {e.label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        {filtrados.map(h => {
          const est = h.estado_hk || "limpia";
          const c = hkColor(est);
          return (
            <div key={h.id} style={{ background: B.navy, borderRadius: 12, padding: "14px 12px", border: `1px solid ${B.navyLight}`, borderTop: `4px solid ${c}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>#{h.numero}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h.categoria || ""}</div>
                </div>
                <div style={{ fontSize: 18, color: c }}>{hkIcon(est)}</div>
              </div>
              <select value={est} onChange={e => setEstadoHk(h.id, e.target.value)}
                style={{ width: "100%", background: `${c}11`, border: `1px solid ${c}55`, color: c, borderRadius: 6, padding: "4px 6px", fontSize: 11, outline: "none", cursor: "pointer", appearance: "none", fontWeight: 700, textAlign: "center" }}>
                {HK_ESTADOS.map(e => <option key={e.key} value={e.key} style={{ background: B.navy, color: "#fff" }}>{e.label}</option>)}
              </select>
              <a href={`/housekeeping/inspeccion?hab=${encodeURIComponent(h.numero || "")}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", marginTop: 6, padding: "5px 6px", borderRadius: 6, background: `${B.hotel}15`, border: `1px solid ${B.hotel}55`, color: B.hotel, fontSize: 10, fontWeight: 700, textAlign: "center", textDecoration: "none" }}>
                ⭐ Inspeccionar
              </a>
              {h.hk_ultima_limpieza && (
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 6, textAlign: "center" }}>
                  Últ: {new Date(h.hk_ultima_limpieza).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ASIGNACIONES ─────────────────────────────────────────────────────────────
function Asignaciones({ habs, camareras, asignaciones, fecha, setFecha, reload }) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ habitacion_id: "", camarera_id: "", tipo_servicio: "limpieza", notas: "" });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSel, setBulkSel] = useState(new Set());
  const [bulkCamarera, setBulkCamarera] = useState("");

  const habsMap = useMemo(() => Object.fromEntries(habs.map(h => [h.id, h])), [habs]);
  const camMap = useMemo(() => Object.fromEntries(camareras.map(c => [c.id, c])), [camareras]);

  const porCamarera = useMemo(() => {
    const map = {};
    asignaciones.forEach(a => {
      const k = a.camarera_id || "_sin";
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return map;
  }, [asignaciones]);

  const guardarNueva = async () => {
    if (!form.habitacion_id) return alert("Selecciona habitación");
    const hab = habsMap[form.habitacion_id];
    await supabase.from("hk_asignaciones").upsert({
      fecha,
      habitacion_id: form.habitacion_id,
      camarera_id: form.camarera_id || null,
      tipo_servicio: form.tipo_servicio,
      notas: form.notas,
      estado: "pendiente",
    }, { onConflict: "fecha,habitacion_id,tipo_servicio" });
    setShowNew(false);
    setForm({ habitacion_id: "", camarera_id: "", tipo_servicio: "limpieza", notas: "" });
    reload();
  };

  const cambiarEstado = async (id, estado) => {
    const patch = { estado, updated_at: new Date().toISOString() };
    if (estado === "en_progreso") patch.inicio_at = new Date().toISOString();
    if (estado === "completada") patch.fin_at = new Date().toISOString();
    await supabase.from("hk_asignaciones").update(patch).eq("id", id);
    reload();
  };
  const eliminarAsig = async (id) => {
    if (!confirm("¿Eliminar asignación?")) return;
    await supabase.from("hk_asignaciones").delete().eq("id", id);
    reload();
  };
  const reasignar = async (id, camarera_id) => {
    await supabase.from("hk_asignaciones").update({ camarera_id: camarera_id || null, updated_at: new Date().toISOString() }).eq("id", id);
    reload();
  };

  const asignarBulk = async () => {
    if (!bulkCamarera || bulkSel.size === 0) return;
    const rows = Array.from(bulkSel).map(habId => ({
      fecha,
      habitacion_id: habId,
      camarera_id: bulkCamarera,
      tipo_servicio: "limpieza",
      estado: "pendiente",
    }));
    await supabase.from("hk_asignaciones").upsert(rows, { onConflict: "fecha,habitacion_id,tipo_servicio" });
    setBulkSel(new Set()); setBulkCamarera(""); setBulkMode(false);
    reload();
  };

  const habsSinAsignar = useMemo(() => {
    const ids = new Set(asignaciones.map(a => a.habitacion_id));
    return habs.filter(h => !ids.has(h.id));
  }, [habs, asignaciones]);

  const ESTADOS_ASIG = [
    { k: "pendiente",   l: "Pendiente",   c: "rgba(255,255,255,0.5)" },
    { k: "en_progreso", l: "En progreso", c: B.warning },
    { k: "completada",  l: "Completada",  c: B.success },
    { k: "omitida",     l: "Omitida",     c: B.danger },
  ];
  const estC = (e) => ESTADOS_ASIG.find(x => x.k === e)?.c || "rgba(255,255,255,0.5)";
  const estL = (e) => ESTADOS_ASIG.find(x => x.k === e)?.l || e;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          style={{ ...IS, width: "auto", padding: "8px 12px" }} />
        <button onClick={() => setShowNew(true)} style={BTN(B.hotel)}>+ Nueva asignación</button>
        <button onClick={() => { setBulkMode(!bulkMode); setBulkSel(new Set()); }}
          style={BTN(bulkMode ? B.warning : B.navyLight)}>
          {bulkMode ? "✕ Cancelar selección" : "📋 Asignación masiva"}
        </button>
      </div>

      {bulkMode && (
        <div style={{ background: B.navyMid, borderRadius: 10, padding: "12px 16px", marginBottom: 14, border: `1px dashed ${B.warning}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: B.warning, fontWeight: 700 }}>{bulkSel.size} habitaciones seleccionadas</div>
          <select value={bulkCamarera} onChange={e => setBulkCamarera(e.target.value)}
            style={{ ...IS, width: "auto", padding: "8px 12px", cursor: "pointer" }}>
            <option value="">Asignar a camarera…</option>
            {camareras.map(c => <option key={c.id} value={c.id}>{c.nombres} {c.apellidos}</option>)}
          </select>
          <button onClick={asignarBulk} disabled={!bulkCamarera || bulkSel.size === 0}
            style={{ ...BTN(B.success), opacity: !bulkCamarera || bulkSel.size === 0 ? 0.4 : 1 }}>
            Asignar {bulkSel.size}
          </button>
        </div>
      )}

      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 460, maxWidth: "100%", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>Nueva asignación</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={LS}>Habitación</label>
                <select value={form.habitacion_id} onChange={e => setForm(f => ({ ...f, habitacion_id: e.target.value }))} style={{ ...IS, cursor: "pointer" }}>
                  <option value="">Seleccionar…</option>
                  {habs.map(h => <option key={h.id} value={h.id}>#{h.numero} — {h.categoria || ""}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Camarera</label>
                <select value={form.camarera_id} onChange={e => setForm(f => ({ ...f, camarera_id: e.target.value }))} style={{ ...IS, cursor: "pointer" }}>
                  <option value="">Sin asignar</option>
                  {camareras.map(c => <option key={c.id} value={c.id}>{c.nombres} {c.apellidos}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Tipo de servicio</label>
                <select value={form.tipo_servicio} onChange={e => setForm(f => ({ ...f, tipo_servicio: e.target.value }))} style={{ ...IS, cursor: "pointer" }}>
                  {TIPO_SERVICIO.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setShowNew(false)} style={BTN(B.navyLight)}>Cancelar</button>
              <button onClick={guardarNueva} style={BTN(B.success)}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista por camarera */}
      {asignaciones.length === 0 && !bulkMode && (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12, border: `1px dashed ${B.navyLight}`, marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <div>Sin asignaciones para {fecha}</div>
        </div>
      )}

      {asignaciones.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Object.entries(porCamarera).map(([camId, items]) => {
            const cam = camMap[camId];
            const completadas = items.filter(x => x.estado === "completada").length;
            return (
              <div key={camId} style={{ background: B.navy, borderRadius: 12, padding: "14px 18px", border: `1px solid ${B.navyLight}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
                      {cam ? `${cam.nombres} ${cam.apellidos}` : "Sin asignar"}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {items.length} habitaciones · {completadas} completadas
                    </div>
                  </div>
                  {camId !== "_sin" && (
                    <button onClick={async () => {
                      const r = await supabase.from("hk_camarera_tokens").insert({
                        token: "hk-" + Math.random().toString(36).slice(2, 14),
                        camarera_id: camId,
                        expira_at: new Date(Date.now() + 16 * 60 * 60 * 1000).toISOString(),
                      }).select().single();
                      if (r.data) {
                        const url = `${window.location.origin}/housekeeping/${r.data.token}`;
                        try { await navigator.clipboard.writeText(url); alert(`✓ Enlace copiado:\n${url}`); }
                        catch { prompt("Enlace de la camarera:", url); }
                      }
                    }} style={{ ...BTN(B.sand + "22"), color: B.sand, border: `1px solid ${B.sand}55`, padding: "6px 10px", fontSize: 11 }}>
                      🔗 Enlace
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                  {items.map(a => {
                    const hab = habsMap[a.habitacion_id];
                    const tipo = TIPO_SERVICIO.find(t => t.key === a.tipo_servicio);
                    return (
                      <div key={a.id} style={{ background: B.navyLight, borderRadius: 10, padding: "10px 12px", borderLeft: `3px solid ${estC(a.estado)}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>
                            #{hab?.numero || "?"} {tipo?.icon}
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <select value={a.estado} onChange={e => cambiarEstado(a.id, e.target.value)}
                              style={{ background: "transparent", border: `1px solid ${estC(a.estado)}55`, color: estC(a.estado), borderRadius: 5, padding: "2px 6px", fontSize: 9, outline: "none", cursor: "pointer", appearance: "none", fontWeight: 700 }}>
                              {ESTADOS_ASIG.map(e => <option key={e.k} value={e.k} style={{ background: B.navy, color: "#fff" }}>{e.l}</option>)}
                            </select>
                            <button onClick={() => eliminarAsig(a.id)} style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 11 }}>✕</button>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                          {hab?.categoria || ""} · {tipo?.label}
                        </div>
                        {a.notas && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4, fontStyle: "italic" }}>{a.notas}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Habitaciones sin asignar (modo bulk) */}
      {bulkMode && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 700 }}>
            Habitaciones disponibles ({habsSinAsignar.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {habsSinAsignar.map(h => {
              const sel = bulkSel.has(h.id);
              return (
                <div key={h.id} onClick={() => {
                  const next = new Set(bulkSel);
                  sel ? next.delete(h.id) : next.add(h.id);
                  setBulkSel(next);
                }}
                  style={{ background: sel ? `${B.warning}33` : B.navy, borderRadius: 10, padding: "10px 12px", border: `2px solid ${sel ? B.warning : B.navyLight}`, cursor: "pointer", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>#{h.numero}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{h.categoria || ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SOLICITUDES GUEST ────────────────────────────────────────────────────────
function SolicitudesGuest({ items, reload }) {
  const cambiarEstado = async (id, estado) => {
    await supabase.from("hotel_room_service_pedidos").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
    reload();
  };
  const ESTADOS_S = [
    { k: "pendiente", l: "Pendiente", c: "rgba(255,255,255,0.5)" },
    { k: "preparando", l: "En proceso", c: B.warning },
    { k: "en_camino", l: "En camino", c: B.sky },
    { k: "entregado", l: "Entregado", c: B.success },
    { k: "cancelado", l: "Cancelado", c: B.danger },
  ];
  const cE = (e) => ESTADOS_S.find(x => x.k === e)?.c || "rgba(255,255,255,0.5)";
  const lE = (e) => ESTADOS_S.find(x => x.k === e)?.l || e;

  if (items.length === 0) return <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12 }}>
    <div style={{ fontSize: 40, marginBottom: 10 }}>🛎</div>
    Sin solicitudes del guest portal todavía
  </div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(s => {
        const item0 = (s.items || [])[0];
        return (
          <div key={s.id} style={{ background: B.navy, borderRadius: 12, padding: "14px 18px", border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${cE(s.estado)}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>
                  🚪 Hab. #{s.habitacion_num || "—"}
                </div>
                <span style={{ fontSize: 10, color: cE(s.estado), border: `1px solid ${cE(s.estado)}44`, borderRadius: 16, padding: "2px 10px", fontWeight: 700, textTransform: "uppercase" }}>
                  {lE(s.estado)}
                </span>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{s.codigo}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, marginBottom: 4 }}>
                {item0?.nombre || "Solicitud"}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                {s.created_at && new Date(s.created_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
              {s.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4, fontStyle: "italic" }}>{s.notas}</div>}
            </div>
            <select value={s.estado} onChange={e => cambiarEstado(s.id, e.target.value)}
              style={{ background: "transparent", border: `1px solid ${cE(s.estado)}55`, color: cE(s.estado), borderRadius: 6, padding: "5px 10px", fontSize: 11, outline: "none", cursor: "pointer", appearance: "none", fontWeight: 700 }}>
              {ESTADOS_S.map(e => <option key={e.k} value={e.k} style={{ background: B.navy, color: "#fff" }}>{e.l}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

// ─── NOVEDADES ────────────────────────────────────────────────────────────────
function Novedades({ items, habs, reload }) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ habitacion_id: "", tipo: "dano", prioridad: "normal", descripcion: "" });
  const [filtro, setFiltro] = useState("abierta");

  const visibles = items.filter(i => filtro === "todas" || i.estado === filtro);

  const guardar = async () => {
    if (!form.descripcion.trim()) return alert("Descripción obligatoria");
    const hab = habs.find(h => h.id === form.habitacion_id);
    await supabase.from("hk_novedades").insert({
      habitacion_id: form.habitacion_id || null,
      habitacion_num: hab?.numero || "",
      tipo: form.tipo,
      prioridad: form.prioridad,
      descripcion: form.descripcion.trim(),
      reportada_por: "Gobernanta",
      estado: "abierta",
    });
    setShowNew(false);
    setForm({ habitacion_id: "", tipo: "dano", prioridad: "normal", descripcion: "" });
    reload();
  };

  const cambiarEstado = async (id, estado) => {
    const patch = { estado, updated_at: new Date().toISOString() };
    if (estado === "resuelta") { patch.resuelta_at = new Date().toISOString(); patch.resuelta_por = "Gobernanta"; }
    await supabase.from("hk_novedades").update(patch).eq("id", id);
    reload();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[["abierta", "Abiertas"], ["en_proceso", "En proceso"], ["resuelta", "Resueltas"], ["todas", "Todas"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)}
            style={{ padding: "6px 14px", borderRadius: 18, border: `1px solid ${filtro === k ? B.hotel : B.navyLight}`,
              background: filtro === k ? `${B.hotel}22` : "transparent", color: filtro === k ? B.hotel : "rgba(255,255,255,0.55)",
              cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
            {l}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNew(true)} style={BTN(B.hotel)}>+ Nueva novedad</button>
      </div>

      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 460, maxWidth: "100%", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>Nueva novedad</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={LS}>Habitación</label>
                <select value={form.habitacion_id} onChange={e => setForm(f => ({ ...f, habitacion_id: e.target.value }))} style={{ ...IS, cursor: "pointer" }}>
                  <option value="">Sin habitación específica</option>
                  {habs.map(h => <option key={h.id} value={h.id}>#{h.numero} — {h.categoria || ""}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={LS}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ ...IS, cursor: "pointer" }}>
                    {NOV_TIPOS.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Prioridad</label>
                  <select value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))} style={{ ...IS, cursor: "pointer" }}>
                    <option value="baja">Baja</option>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={LS}>Descripción</label>
                <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={3}
                  placeholder="Detalles de la novedad…"
                  style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setShowNew(false)} style={BTN(B.navyLight)}>Cancelar</button>
              <button onClick={guardar} style={BTN(B.success)}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {visibles.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
          Sin novedades {filtro !== "todas" ? `(${filtro})` : ""}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibles.map(n => {
            const tipo = NOV_TIPOS.find(t => t.key === n.tipo);
            const prioColor = { critica: B.danger, alta: B.warning, normal: B.sky, baja: "rgba(255,255,255,0.4)" }[n.prioridad] || "rgba(255,255,255,0.4)";
            return (
              <div key={n.id} style={{ background: B.navy, borderRadius: 12, padding: "14px 18px", border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${tipo?.color || "#64748b"}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16 }}>{tipo?.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: tipo?.color }}>{tipo?.label?.toUpperCase()}</span>
                    {n.habitacion_num && <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>#{n.habitacion_num}</span>}
                    <span style={{ fontSize: 9, color: prioColor, border: `1px solid ${prioColor}55`, borderRadius: 12, padding: "1px 8px", textTransform: "uppercase", fontWeight: 700 }}>{n.prioridad}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#fff", marginBottom: 4 }}>{n.descripcion}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                    {n.reportada_por && `${n.reportada_por} · `}
                    {new Date(n.created_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <select value={n.estado} onChange={e => cambiarEstado(n.id, e.target.value)}
                  style={{ background: "transparent", border: `1px solid ${B.sand}55`, color: B.sand, borderRadius: 6, padding: "5px 10px", fontSize: 11, outline: "none", cursor: "pointer", appearance: "none", fontWeight: 700 }}>
                  <option value="abierta" style={{ background: B.navy }}>Abierta</option>
                  <option value="en_proceso" style={{ background: B.navy }}>En proceso</option>
                  <option value="resuelta" style={{ background: B.navy }}>Resuelta</option>
                  <option value="descartada" style={{ background: B.navy }}>Descartada</option>
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
