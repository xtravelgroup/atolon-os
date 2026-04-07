import { useState, useEffect, useCallback, useRef } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { logAccion } from "../lib/logAccion";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navyLight, border: `1px solid rgba(255,255,255,0.1)`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const hoyHora = () => new Date().toTimeString().slice(0, 5);
const fmtHora = (h) => h ? h.slice(0, 5) : "—";

const ESTADO_COLOR = {
  programada: { bg: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", label: "Programada" },
  en_muelle:  { bg: B.warning + "22",         color: B.warning,               label: "En muelle ⚓" },
  zarpo:      { bg: B.success + "22",          color: B.success,               label: "Zarpó ✓" },
};

// ─── Modal Registrar Zarpe ────────────────────────────────────────────────────
function ModalZarpe({ salidaInfo, fecha, onClose, onSaved }) {
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [f, setF] = useState({
    embarcacion_nombre: "",
    matricula: "",
    pax_a: salidaInfo.pax_checkin_a || 0,
    pax_n: salidaInfo.pax_checkin_n || 0,
    hora_real: hoyHora(),
    notas: "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("embarcaciones").select("*").order("nombre"),
      supabase.from("salidas_override").select("*").eq("fecha", fecha).eq("salida_id", salidaInfo.id),
    ]).then(([{ data: embs }, { data: ovrs }]) => {
      setEmbarcaciones(embs || []);
      // Pre-select embarcacion if only one assigned to this salida
      const baseEmbs = (salidaInfo.embarcaciones || [])
        .map(eid => (embs || []).find(e => e.id === eid))
        .filter(Boolean);
      const ovr = (ovrs || [])[0];
      const extraEmbs = (ovr?.extra_embarcaciones || [])
        .map(e => (embs || []).find(eb => eb.id === e.id) || e)
        .filter(e => !baseEmbs.some(b => b.id === e.id));
      const todas = [...baseEmbs, ...extraEmbs];
      if (todas.length === 1) {
        s("embarcacion_nombre", todas[0].nombre);
        s("matricula", todas[0].matricula || "");
      }
    });
  }, [salidaInfo, fecha]);

  const handleGuardar = async () => {
    if (!f.embarcacion_nombre.trim()) { setErrorMsg("Ingresa el nombre de la embarcación"); return; }
    if (!supabase || saving) return;
    setErrorMsg(null);
    setSaving(true);
    const id = `MS-${Date.now()}`;
    const paxTotal = Number(f.pax_a) + Number(f.pax_n);
    const { error } = await supabase.from("muelle_salidas").insert({
      id,
      fecha,
      salida_id: salidaInfo.id,
      embarcacion_nombre: f.embarcacion_nombre.trim(),
      matricula: f.matricula.trim() || null,
      pax_a: Number(f.pax_a) || 0,
      pax_n: Number(f.pax_n) || 0,
      pax_total: paxTotal,
      hora_programada: salidaInfo.hora_regreso || null,
      hora_real: f.hora_real || null,
      estado: "en_muelle",
      notas: f.notas.trim() || null,
    });
    setSaving(false);
    if (error) { setErrorMsg(error.message); return; }
    await logAccion({ modulo: "muelle_salidas", accion: "registrar_zarpe", tabla: "muelle_salidas", registroId: id,
      datosDespues: { salida: salidaInfo.nombre, embarcacion: f.embarcacion_nombre, pax: paxTotal },
      notas: `Zarpe registrado — ${salidaInfo.nombre} · ${f.embarcacion_nombre}` });
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000B", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 18, padding: 28, width: 480, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>⛵ Registrar Zarpe</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
              {salidaInfo.nombre} · Regreso {salidaInfo.hora_regreso || "—"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Info salida */}
        <div style={{ background: B.sky + "15", border: `1px solid ${B.sky}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>🕐 Hora programada: <strong style={{ color: B.sky }}>{salidaInfo.hora_regreso || "—"}</strong></span>
          <span>👥 Pax en isla: <strong style={{ color: "#fff" }}>{(salidaInfo.pax_checkin_a || 0) + (salidaInfo.pax_checkin_n || 0)}</strong></span>
          {salidaInfo.pax_checkin_n > 0 && <span style={{ color: "rgba(255,255,255,0.4)" }}>{salidaInfo.pax_checkin_a}A + {salidaInfo.pax_checkin_n}N</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          {/* Embarcación */}
          <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
            <label style={LS}>Embarcación *</label>
            {embarcaciones.length > 0 ? (
              <select value={f.embarcacion_nombre} onChange={e => {
                const emb = embarcaciones.find(em => em.nombre === e.target.value);
                s("embarcacion_nombre", e.target.value);
                if (emb) s("matricula", emb.matricula || "");
              }} style={IS}>
                <option value="">— Seleccionar —</option>
                {embarcaciones.map(em => <option key={em.id} value={em.nombre}>{em.nombre}{em.matricula ? ` (${em.matricula})` : ""}</option>)}
                <option value="__manual__">✏️ Escribir manualmente</option>
              </select>
            ) : (
              <input value={f.embarcacion_nombre} onChange={e => s("embarcacion_nombre", e.target.value)} placeholder="Nombre de la embarcación" style={IS} />
            )}
            {f.embarcacion_nombre === "__manual__" && (
              <input value="" onChange={e => s("embarcacion_nombre", e.target.value)} placeholder="Nombre de la embarcación" style={{ ...IS, marginTop: 8 }} autoFocus />
            )}
          </div>

          {/* Matrícula */}
          <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
            <label style={LS}>Matrícula (opcional)</label>
            <input value={f.matricula} onChange={e => s("matricula", e.target.value)} placeholder="Ej: CT-1234" style={IS} />
          </div>

          {/* Pax */}
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Adultos</label>
            <input type="number" min="0" value={f.pax_a} onChange={e => s("pax_a", e.target.value)} style={IS} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Niños</label>
            <input type="number" min="0" value={f.pax_n} onChange={e => s("pax_n", e.target.value)} style={IS} />
          </div>

          {/* Hora real */}
          <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
            <label style={LS}>Hora de zarpe</label>
            <input type="time" value={f.hora_real} onChange={e => s("hora_real", e.target.value)} style={IS} />
          </div>

          {/* Notas */}
          <div style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
            <label style={LS}>Notas (opcional)</label>
            <input value={f.notas} onChange={e => s("notas", e.target.value)} placeholder="Observaciones..." style={IS} />
          </div>
        </div>

        {errorMsg && <div style={{ fontSize: 12, color: B.danger, marginTop: 10, padding: "8px 12px", background: B.danger + "15", borderRadius: 8 }}>{errorMsg}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={saving}
            style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: saving ? B.navyLight : B.sky, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Guardando..." : "⛵ Registrar zarpe"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card de Zarpe ────────────────────────────────────────────────────────────
function ZarpeCard({ zarpe, onEstadoChange, onDelete }) {
  const [saving, setSaving]   = useState(false);
  const [editNotas, setEdit]  = useState(false);
  const [notas, setNotas]     = useState(zarpe.notas || "");
  const [savingN, setSavingN] = useState(false);
  const taRef = useRef(null);
  const est = ESTADO_COLOR[zarpe.estado] || ESTADO_COLOR.programada;

  const FLUJO       = { programada: "en_muelle", en_muelle: "zarpo", zarpo: null };
  const FLUJO_LABEL = { programada: "⚓ En muelle", en_muelle: "⛵ Zarpó", zarpo: null };

  const avanzar = async () => {
    const sig = FLUJO[zarpe.estado];
    if (!sig || !supabase || saving) return;
    setSaving(true);
    const upd = { estado: sig, updated_at: new Date().toISOString() };
    if (sig === "zarpo") upd.hora_real = zarpe.hora_real || hoyHora();
    const { error } = await supabase.from("muelle_salidas").update(upd).eq("id", zarpe.id);
    setSaving(false);
    if (error) { alert(`Error: ${error.message}`); return; }
    onEstadoChange();
  };

  const guardarNota = async () => {
    if (!supabase) return;
    setSavingN(true);
    await supabase.from("muelle_salidas").update({ notas: notas.trim() || null, updated_at: new Date().toISOString() }).eq("id", zarpe.id);
    setSavingN(false);
    setEdit(false);
    onEstadoChange();
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", marginBottom: 10, border: `1px solid ${est.color}33` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 20, flexShrink: 0 }}>⛵</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{zarpe.embarcacion_nombre || "Embarcación"}</span>
            {zarpe.matricula && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{zarpe.matricula}</span>}
            <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 8, background: est.bg, color: est.color, fontWeight: 600 }}>{est.label}</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span>👥 {zarpe.pax_total} pax{zarpe.pax_n > 0 ? ` (${zarpe.pax_a}A + ${zarpe.pax_n}N)` : ""}</span>
            {zarpe.hora_programada && <span>🕐 {fmtHora(zarpe.hora_programada)}</span>}
            {zarpe.hora_real       && <span style={{ color: zarpe.estado === "zarpo" ? B.success : "inherit" }}>⛵ {fmtHora(zarpe.hora_real)}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {FLUJO[zarpe.estado] && (
            <button onClick={avanzar} disabled={saving}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: est.color, color: B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "..." : FLUJO_LABEL[zarpe.estado]}
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete}
              style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${B.danger}33`, background: "none", color: B.danger, fontSize: 12, cursor: "pointer", opacity: 0.6 }}>✕</button>
          )}
        </div>
      </div>

      {/* Notas editables */}
      <div style={{ marginTop: 8 }}>
        {editNotas ? (
          <div>
            <textarea ref={taRef} value={notas} onChange={e => setNotas(e.target.value)} rows={2} autoFocus
              style={{ ...IS, fontSize: 12, resize: "vertical", padding: "8px 10px" }} placeholder="Agregar nota..." />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={guardarNota} disabled={savingN}
                style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                {savingN ? "…" : "✓ Guardar"}
              </button>
              <button onClick={() => { setNotas(zarpe.notas || ""); setEdit(false); }} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: B.navyLight, color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        ) : (
          <div onClick={() => setEdit(true)} style={{ cursor: "pointer", padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.08)", minHeight: 28 }}>
            {notas
              ? <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>{notas}</span>
              : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>+ Agregar nota…</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bitácora ─────────────────────────────────────────────────────────────────
function BitacoraSalidas({ isMobile }) {
  const hoy   = todayStr();
  const hace7 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  const [desde,   setDesde]   = useState(hace7);
  const [hasta,   setHasta]   = useState(hoy);
  const [estado,  setEstado]  = useState("todos");
  const [busca,   setBusca]   = useState("");
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("usuarios").select("modulos, rol_id").eq("email", user.email).maybeSingle();
      if (!data) return;
      const mods = data.modulos;
      if (!mods || mods.length === 0 || mods.length >= 20) { setIsAdmin(true); return; }
      if (data.rol_id) {
        try {
          const { data: rol } = await supabase.from("roles").select("permisos").eq("id", data.rol_id).maybeSingle();
          if (rol?.permisos?.["*"]) setIsAdmin(true);
        } catch (_) {}
      }
    };
    checkAdmin();
  }, []);

  const fetchBitacora = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    let q = supabase.from("muelle_salidas").select("*, salidas(nombre, hora, hora_regreso)")
      .gte("fecha", desde).lte("fecha", hasta)
      .order("fecha", { ascending: false }).order("created_at", { ascending: false })
      .limit(500);
    if (estado !== "todos") q = q.eq("estado", estado);
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  }, [desde, hasta, estado]);

  useEffect(() => { fetchBitacora(); }, [fetchBitacora]);

  const handleDelete = async (id) => {
    if (!supabase) return;
    await supabase.from("muelle_salidas").delete().eq("id", id);
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const filtradas = busca.trim()
    ? rows.filter(r =>
        (r.embarcacion_nombre || "").toLowerCase().includes(busca.toLowerCase()) ||
        (r.matricula || "").toLowerCase().includes(busca.toLowerCase()) ||
        (r.notas || "").toLowerCase().includes(busca.toLowerCase()) ||
        (r.salidas?.nombre || "").toLowerCase().includes(busca.toLowerCase())
      )
    : rows;

  const totalPax = filtradas.reduce((t, r) => t + (r.pax_total || 0), 0);
  const ISsm = { ...IS, padding: "8px 12px", fontSize: 12 };
  const EC = { programada: "rgba(255,255,255,0.4)", en_muelle: B.warning, zarpo: B.success };

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, alignItems: "flex-end" }}>
        <div><label style={{ ...LS, fontSize: 10 }}>Desde</label><input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={ISsm} /></div>
        <div><label style={{ ...LS, fontSize: 10 }}>Hasta</label><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={ISsm} /></div>
        <div>
          <label style={{ ...LS, fontSize: 10 }}>Estado</label>
          <select value={estado} onChange={e => setEstado(e.target.value)} style={ISsm}>
            <option value="todos">Todos</option>
            <option value="programada">Programada</option>
            <option value="en_muelle">En muelle</option>
            <option value="zarpo">Zarpó</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ ...LS, fontSize: 10 }}>Buscar</label>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Embarcación, matrícula, salida..." style={ISsm} />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 10, marginBottom: 18 }}>
        {[
          { label: "Registros",    value: filtradas.length,                                       color: B.sky },
          { label: "Total pax",    value: totalPax,                                               color: B.sand },
          { label: "Zarparon",     value: filtradas.filter(r => r.estado === "zarpo").length,     color: B.success },
          { label: "Días",         value: [...new Set(filtradas.map(r => r.fecha))].length,       color: "rgba(255,255,255,0.5)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: B.navyMid, borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>Sin registros para este período</div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtradas.map(r => (
            <div key={r.id} style={{ background: B.navyMid, borderRadius: 12, padding: "12px 14px", border: `1px solid rgba(255,255,255,0.06)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>⛵ {r.embarcacion_nombre || "—"}</span>
                  {r.matricula && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>{r.matricula}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: EC[r.estado], fontWeight: 700, textTransform: "uppercase" }}>{ESTADO_COLOR[r.estado]?.label || r.estado}</span>
                  {isAdmin && <button onClick={() => { if (window.confirm("¿Eliminar?")) handleDelete(r.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: B.danger, fontSize: 14, padding: "0 2px", opacity: 0.7 }}>×</button>}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>📅 {r.fecha}</span>
                <span>🚢 {r.salidas?.nombre || r.salida_id || "—"}</span>
                {r.hora_programada && <span>🕐 {r.hora_programada?.slice(0,5)}</span>}
                {r.hora_real && <span>⛵ {r.hora_real?.slice(0,5)}</span>}
                <span>👥 {r.pax_total || 0} pax</span>
              </div>
              {r.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4, fontStyle: "italic" }}>{r.notas}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Fecha", "Salida", "Embarcación", "Matr.", "Programada", "Zarpe real", "Pax", "Estado", "Notas", ""].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>{r.fecha}</td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>{r.salidas?.nombre || r.salida_id || "—"}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 600 }}>⛵ {r.embarcacion_nombre || "—"}</td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{r.matricula || "—"}</td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{r.hora_programada ? r.hora_programada.slice(0,5) : "—"}</td>
                  <td style={{ padding: "9px 10px", color: r.estado === "zarpo" ? B.success : "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{r.hora_real ? r.hora_real.slice(0,5) : "—"}</td>
                  <td style={{ padding: "9px 10px", textAlign: "center" }}>{r.pax_total || 0}</td>
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{ fontSize: 10, background: ESTADO_COLOR[r.estado]?.bg, color: ESTADO_COLOR[r.estado]?.color, padding: "3px 8px", borderRadius: 20, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {ESTADO_COLOR[r.estado]?.label || r.estado}
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px", color: "rgba(255,255,255,0.35)", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notas || "—"}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    {isAdmin && <button onClick={() => { if (window.confirm("¿Eliminar?")) handleDelete(r.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: B.danger, fontSize: 16, opacity: 0.7 }}>×</button>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                <td colSpan={6} style={{ padding: "10px", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>TOTAL ({filtradas.length} registros)</td>
                <td style={{ padding: "10px", fontWeight: 800, color: B.sky }}>{totalPax}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MAIN MODULE ─────────────────────────────────────────────────────────────
export default function MuelleSalidas() {
  const { isMobile } = useMobile();
  const [tab,   setTab]   = useState("hoy");
  const [fecha, setFecha] = useState(todayStr());

  // Data
  const [salidas,   setSalidas]   = useState([]); // salidas activas
  const [zarpes,    setZarpes]    = useState([]); // muelle_salidas para la fecha
  const [reservas,  setReservas]  = useState([]); // reservas del día con check-in
  const [modal,     setModal]     = useState(null); // salidaInfo para abrir modal

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    const [{ data: sals }, { data: zrps }, { data: res }] = await Promise.all([
      supabase.from("salidas").select("*, embarcaciones").eq("activo", true).order("hora"),
      supabase.from("muelle_salidas").select("*").eq("fecha", fecha).order("created_at"),
      supabase.from("reservas")
        .select("salida_id, pax_a, pax_n, pax, estado, checkin_at")
        .eq("fecha", fecha)
        .neq("estado", "cancelado"),
    ]);
    setSalidas(sals || []);
    setZarpes(zrps || []);
    setReservas(res || []);
  }, [fecha]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build per-salida stats: pax check-in
  const salidaStats = {};
  (reservas || []).forEach(r => {
    const enIsla = r.checkin_at || r.estado === "check_in" || r.estado === "confirmado";
    if (!enIsla) return;
    if (!salidaStats[r.salida_id]) salidaStats[r.salida_id] = { pax_a: 0, pax_n: 0 };
    salidaStats[r.salida_id].pax_a += Number(r.pax_a || r.pax || 1);
    salidaStats[r.salida_id].pax_n += Number(r.pax_n || 0);
  });

  // Salidas with any reservas today (show even if 0 check-in)
  const reservasPorSalida = {};
  (reservas || []).forEach(r => {
    if (!reservasPorSalida[r.salida_id]) reservasPorSalida[r.salida_id] = 0;
    reservasPorSalida[r.salida_id]++;
  });

  const salidasHoy = (salidas || []).filter(s => reservasPorSalida[s.id] > 0);

  const delZarpe = async (id) => {
    await supabase.from("muelle_salidas").delete().eq("id", id);
    fetchData();
  };

  // KPIs
  const totalPaxEsperado = Object.values(salidaStats).reduce((t, s) => t + s.pax_a + s.pax_n, 0);
  const totalZarpados    = zarpes.filter(z => z.estado === "zarpo").reduce((t, z) => t + (z.pax_total || 0), 0);
  const enMuelle         = zarpes.filter(z => z.estado === "en_muelle").reduce((t, z) => t + (z.pax_total || 0), 0);
  const salidasPendientes = salidasHoy.filter(s => !zarpes.some(z => z.salida_id === s.id && (z.estado === "zarpo" || z.estado === "en_muelle"))).length;

  return (
    <div style={{ padding: isMobile ? "16px 12px" : "24px", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#e2e8f0", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "#fff" }}>⛵ Salidas de Isla</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Control de zarpes · Isla Tierra Bomba</div>
        </div>
        {tab === "hoy" && (
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ ...IS, width: "auto", fontSize: 14, padding: "8px 14px" }} />
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 22, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 0 }}>
        {[{ key: "hoy", label: "📋 Control del día" }, { key: "bitacora", label: "📖 Bitácora" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "9px 18px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
              background: tab === t.key ? B.navyMid : "transparent",
              color: tab === t.key ? "#fff" : "rgba(255,255,255,0.4)",
              borderBottom: tab === t.key ? `2px solid ${B.success}` : "2px solid transparent",
              marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bitacora" && <BitacoraSalidas isMobile={isMobile} />}

      {tab === "hoy" && (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 10, marginBottom: 20 }}>
            {[
              { label: "Pax en isla",       value: totalPaxEsperado,   color: B.sky },
              { label: "En muelle ahora",   value: enMuelle,           color: B.warning },
              { label: "Ya zarparon",       value: totalZarpados,       color: B.success },
              { label: "Salidas pendientes", value: salidasPendientes,   color: salidasPendientes > 0 ? B.sand : "rgba(255,255,255,0.4)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Sin salidas */}
          {salidasHoy.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⛵</div>
              No hay salidas programadas para este día
            </div>
          ) : (
            salidasHoy.map(sal => {
              const stats  = salidaStats[sal.id] || { pax_a: 0, pax_n: 0 };
              const paxTotal = stats.pax_a + stats.pax_n;
              const zarpesSal = zarpes.filter(z => z.salida_id === sal.id);
              const paxZarpado = zarpesSal.filter(z => z.estado === "zarpo").reduce((t, z) => t + (z.pax_total || 0), 0);
              const todosZarparon = paxTotal > 0 && paxZarpado >= paxTotal;
              const salidaConModal = { ...sal, pax_checkin_a: stats.pax_a, pax_checkin_n: stats.pax_n };

              return (
                <div key={sal.id} style={{ marginBottom: 28 }}>
                  {/* Cabecera de salida */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 15, color: todosZarparon ? B.success : "#fff" }}>
                          {todosZarparon ? "✓ " : ""}{sal.nombre}
                        </span>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>
                          ⛵ sale: <strong style={{ color: B.sky }}>{sal.hora}</strong>
                          {sal.hora_regreso && <> · 🏠 regresa: <strong style={{ color: B.sand }}>{sal.hora_regreso}</strong></>}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                        {paxTotal > 0
                          ? `👥 ${paxTotal} pax en isla${paxZarpado > 0 ? ` · ✓ ${paxZarpado} zarparon` : ""}`
                          : "Sin pax con check-in"}
                      </span>
                    </div>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)", minWidth: 20 }} />
                    <button
                      onClick={() => setModal(salidaConModal)}
                      style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: B.success, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                      + Registrar zarpe
                    </button>
                  </div>

                  {/* Zarpes registrados */}
                  {zarpesSal.length === 0 ? (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "8px 0 0 4px", fontStyle: "italic" }}>
                      Ningún zarpe registrado aún
                    </div>
                  ) : (
                    zarpesSal.map(z => (
                      <ZarpeCard key={z.id} zarpe={z} onEstadoChange={fetchData} onDelete={() => delZarpe(z.id)} />
                    ))
                  )}
                </div>
              );
            })
          )}
        </>
      )}

      {/* Modal */}
      {modal && (
        <ModalZarpe
          salidaInfo={modal}
          fecha={fecha}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchData(); }}
        />
      )}
    </div>
  );
}
