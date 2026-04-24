import { useState, useEffect, useCallback, useRef } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { wompiCheckoutUrl } from "../lib/wompi";
import { logAccion } from "../lib/logAccion";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navyLight, border: `1px solid rgba(255,255,255,0.1)`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const COP = (n) => n ? "$" + Number(n).toLocaleString("es-CO") : "$0";
const hoyHora = () => new Date().toTimeString().slice(0, 5);
const fmtHora = (h) => h ? h.slice(0, 5) : "—";

const ESTADO_COLOR = {
  esperada: { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", label: "Esperada" },
  "llegó":  { bg: B.sky + "22", color: B.sky, label: "Llegó" },
  en_isla:  { bg: B.success + "22", color: B.success, label: "En isla" },
  salió:    { bg: B.navyLight, color: "rgba(255,255,255,0.35)", label: "Salió" },
};

// ─── Precios After Island ─────────────────────────────────────────────────────
const PRECIO_AFTER_A = 170000;
const PRECIO_AFTER_N = 120000;

// ─── Modal Registro Llegada ───────────────────────────────────────────────────
function ModalNuevaLlegada({ tipo, fecha, reserva, onClose, onSaved }) {
  const esLancha = tipo === "lancha_atolon";
  const esWalkin = tipo === "walkin";
  // Para "otras embarcaciones", el usuario selecciona la categoría en el formulario
  const [tipoSeleccionado, setTipoSeleccionado] = useState(tipo);
  const esAfter  = tipoSeleccionado === "after_island";
  const esRest   = tipoSeleccionado === "restaurante";

  // Paso 0: solo para lanchas sin preset (seleccionar salida). Todos los demás van directo a paso 1.
  const [paso, setPaso]       = useState(esLancha && !reserva ? 0 : 1);
  const [salidas,       setSalidas]       = useState([]); // salidas con pax ese día, enriquecidas con lanchas
  const [embarcaciones, setEmbarcaciones] = useState([]); // tabla completa de embarcaciones
  const [salidaInfo,    setSalidaInfo]    = useState(null);

  useEffect(() => {
    if (!esLancha || !supabase) return;
    Promise.all([
      supabase.from("salidas").select("*").eq("activo", true).order("hora"),
      supabase.from("reservas")
        .select("pax, pax_a, pax_n, salida_id, estado, checkin_at, embarcacion_asignada")
        .eq("fecha", fecha).neq("estado", "cancelado").neq("estado", "no_show"),
      supabase.from("embarcaciones").select("*").order("nombre"),
      supabase.from("salidas_override").select("*").eq("fecha", fecha),
      // Grupos que comparten lancha con pasadías ese día
      supabase.from("eventos")
        .select("id, nombre, pax, pasadias_org, salida_compartida_id, salidas_grupo, comparte_lancha_pasadias")
        .eq("fecha", fecha).eq("comparte_lancha_pasadias", true).neq("stage", "Realizado"),
    ]).then(([{ data: sals }, { data: res }, { data: embs }, { data: ovrs }, { data: gpos }]) => {
      // allResMap: TODAS las reservas confirmadas por salida (para mostrar salida aunque no haya c/i)
      const allResMap = {};
      (res || []).forEach(r => {
        if (!allResMap[r.salida_id]) allResMap[r.salida_id] = true;
      });
      // Incluir grupos compartidos — fuerzan a mostrar la salida
      (gpos || []).forEach(g => {
        if (g.salida_compartida_id) allResMap[g.salida_compartida_id] = true;
      });

      // Solo contar pasajeros que hicieron check-in (checkin_at o estado check_in)
      const checkedIn = (res || []).filter(r => r.checkin_at || r.estado === "check_in");

      // reservaMap: pax check-in por salida (para cabecera)
      const reservaMap = {};
      checkedIn.forEach(r => {
        if (!reservaMap[r.salida_id]) reservaMap[r.salida_id] = { pax_a: 0, pax_n: 0 };
        reservaMap[r.salida_id].pax_a += Number(r.pax_a || r.pax || 1);
        reservaMap[r.salida_id].pax_n += Number(r.pax_n || 0);
      });

      // lanchaMap: pax check-in por salida + embarcación asignada
      const lanchaMap = {};
      checkedIn.forEach(r => {
        const emb = r.embarcacion_asignada || "__sin_asignar__";
        if (!lanchaMap[r.salida_id]) lanchaMap[r.salida_id] = {};
        if (!lanchaMap[r.salida_id][emb]) lanchaMap[r.salida_id][emb] = { pax_a: 0, pax_n: 0 };
        lanchaMap[r.salida_id][emb].pax_a += Number(r.pax_a || r.pax || 1);
        lanchaMap[r.salida_id][emb].pax_n += Number(r.pax_n || 0);
      });

      setEmbarcaciones(embs || []);
      // Mostrar salidas con cualquier reserva ese día (no solo las que tienen c/i)
      setSalidas((sals || [])
        .filter(s => !!allResMap[s.id])
        .map(s => {
          const ovr = (ovrs || []).find(o => o.salida_id === s.id);
          const baseEmbs = (s.embarcaciones || [])
            .map(eid => (embs || []).find(e => e.id === eid))
            .filter(Boolean);
          const extraEmbs = (ovr?.extra_embarcaciones || [])
            .map(e => { const full = (embs || []).find(eb => eb.id === e.id); return full || e; })
            .filter(e => !baseEmbs.some(b => b.id === e.id));
          return {
            ...s,
            _pax_a:     reservaMap[s.id]?.pax_a || 0,
            _pax_n:     reservaMap[s.id]?.pax_n || 0,
            _lanchas:   [...baseEmbs, ...extraEmbs],
            _lanchaMap: lanchaMap[s.id] || {},
          };
        }));
    });
  }, [esLancha, fecha]);

  const seleccionarLancha = (sal, lancha) => {
    setSalidaInfo({ ...sal, _lanchaSeleccionada: lancha.nombre });
    // Usar pax de esa embarcación específica (solo check-in)
    const paxLancha = sal._lanchaMap?.[lancha.nombre] || { pax_a: 0, pax_n: 0 };
    setF(p => ({
      ...p,
      embarcacion_nombre: lancha.nombre,
      matricula: lancha.matricula || p.matricula,
      pax_a: paxLancha.pax_a || 0,
      pax_n: paxLancha.pax_n || 0,
    }));
    setPaso(1);
  };

  const [f, setF] = useState({
    embarcacion_nombre: reserva?.embarcacion_asignada || "",
    matricula: "",
    pax_a: reserva ? (reserva.pax_a || reserva.pax || 1) : 1,
    pax_n: reserva ? (reserva.pax_n || 0) : 0,
    hora_llegada: hoyHora(),
    notas: reserva?._notas_preset || "",
  });

  const [fotoFile, setFotoFile]       = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [saving, setSaving]           = useState(false);

  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const paxTotal   = Number(f.pax_a) + Number(f.pax_n);
  const montoAfter = Number(f.pax_a) * PRECIO_AFTER_A + Number(f.pax_n) * PRECIO_AFTER_N;

  const handleFotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const [errorMsg, setErrorMsg] = useState(null);

  const handleGuardar = async () => {
    if (!supabase || saving) return;
    setErrorMsg(null);
    setSaving(true);
    const id = `ML-${Date.now()}`;

    // Subir foto (si falla, igual registramos sin foto)
    let foto_url = null;
    if (fotoFile) {
      setUploadingFoto(true);
      try {
        const ext = fotoFile.name.split(".").pop();
        const path = `${id}.${ext}`;
        const { data: upData, error: upErr } = await supabase.storage
          .from("muelle-fotos")
          .upload(path, fotoFile, { upsert: true });
        if (!upErr && upData) {
          const { data: urlData } = supabase.storage.from("muelle-fotos").getPublicUrl(path);
          foto_url = urlData?.publicUrl || null;
        }
      } catch (_) {}
      setUploadingFoto(false);
    }

    const staff = Number(f.staff) || 0;
    const huespedes = Number(f.huespedes) || 0;
    const notasExtras = [];
    if (staff > 0) notasExtras.push(`[${staff} staff]`);
    if (huespedes > 0) notasExtras.push(`[${huespedes} huéspedes]`);

    // Auto-matching: si la llegada es after_island/restaurante y no tiene reserva explícita,
    // buscar una reserva del día con el mismo nombre de embarcación para vincular.
    let autoReservaId = reserva?.id || null;
    const esAfterOrRest = tipoSeleccionado === "after_island" || tipoSeleccionado === "restaurante";
    if (!autoReservaId && esAfterOrRest && f.embarcacion_nombre) {
      try {
        const { data: match } = await supabase.from("reservas")
          .select("id")
          .eq("fecha", fecha)
          .ilike("nombre_embarcacion", f.embarcacion_nombre.trim())
          .neq("estado", "cancelado")
          .limit(1)
          .maybeSingle();
        if (match?.id) autoReservaId = match.id;
      } catch (_) { /* ignorar */ }
    }

    const payload = {
      id, fecha, tipo: tipoSeleccionado,
      embarcacion_nombre: f.embarcacion_nombre || (esWalkin ? "Walk-in" : null),
      matricula:          esWalkin ? null : (f.matricula || null),
      pax_a:     Number(f.pax_a) || 0,
      pax_n:     Number(f.pax_n) || 0,
      pax_total: paxTotal,
      reserva_id: autoReservaId,
      hora_llegada: f.hora_llegada || null,
      estado: "llegó",
      notas: notasExtras.join(" ") + (notasExtras.length ? " " : "") + (f.notas || ""),
    };
    // Solo incluir foto_url si está disponible (columna puede no existir aún)
    if (foto_url) payload.foto_url = foto_url;

    const { error } = await supabase.from("muelle_llegadas").insert(payload);
    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    onSaved();
  };

  const tipoLabel = esAfter ? "After Island" : esRest ? "Restaurante" : "Lancha Atolon";
  const tipoIcon  = esAfter ? "🌙" : esRest ? "🍽️" : "⛵";

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000B", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 18, padding: 28, width: 500, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{esWalkin ? "🚶" : tipoIcon} {paso === 0 && esLancha ? "¿Cuál lancha llegó?" : paso === 0 ? "¿Qué tipo de visita?" : "Registrar Llegada"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{esWalkin ? "Walk-in Caminando" : tipoLabel}{reserva ? ` — ${reserva.nombre}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* ── PASO 0: Seleccionar lancha por salida (solo lanchas) ── */}
        {paso === 0 && esLancha && (
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
              Selecciona la lancha que está llegando.
            </div>

            {salidas.length === 0 && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "20px 0" }}>
                Cargando...
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
              {salidas.map(sal => (
                <div key={sal.id}>
                  {/* Encabezado de salida */}
                  <div style={{ fontSize: 11, color: B.sky, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>🕐 {fmtHora(sal.hora)}</span>
                    <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
                    <span>{sal.nombre}</span>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                      — {sal._pax_a + sal._pax_n} pax
                    </span>
                  </div>

                  {/* Lanchas de esa salida */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sal._lanchas.length === 0 ? (
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", padding: "10px 14px" }}>
                        Sin embarcaciones asignadas
                      </div>
                    ) : sal._lanchas.map(lancha => {
                      const pl = sal._lanchaMap?.[lancha.nombre] || { pax_a: 0, pax_n: 0 };
                      const plTotal = pl.pax_a + pl.pax_n;
                      return (
                      <button key={lancha.id} onClick={() => seleccionarLancha(sal, lancha)}
                        style={{
                          padding: "13px 16px", borderRadius: 12,
                          border: `2px solid ${plTotal > 0 ? B.sky + "88" : B.navyLight}`,
                          background: plTotal > 0 ? B.navy : B.navyMid + "80",
                          color: "#fff", cursor: "pointer", textAlign: "left",
                          display: "flex", alignItems: "center", gap: 12,
                        }}>
                        <span style={{ fontSize: 24 }}>⛵</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{lancha.nombre}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                            {lancha.matricula && <span>{lancha.matricula}</span>}
                            {lancha.matricula && lancha.capitan && <span style={{ margin: "0 6px" }}>·</span>}
                            {lancha.capitan && <span>Cap: {lancha.capitan}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: plTotal > 0 ? B.sky : "rgba(255,255,255,0.25)", lineHeight: 1 }}>
                            {plTotal}
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>pax c/i</div>
                        </div>
                      </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Embarcaciones no asignadas a ninguna salida (ej: compartidas) */}
            {(() => {
              const yaUsadas = new Set(salidas.flatMap(s => s._lanchas.map(l => l.id)));
              const libres = embarcaciones.filter(e => e.estado === "activo" && !yaUsadas.has(e.id));
              if (libres.length === 0) return null;
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                    Embarcaciones disponibles
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {libres.map(lancha => (
                      <button key={lancha.id} onClick={() => seleccionarLancha({ _lanchaMap: {} }, lancha)}
                        style={{ padding: "13px 16px", borderRadius: 12, border: `2px solid ${B.sand}44`, background: B.navyMid + "80", color: "#fff", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 24 }}>⛵</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{lancha.nombre}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                            {lancha.tipo && <span>{lancha.tipo}</span>}
                            {lancha.capitan && <span> · Cap: {lancha.capitan}</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: B.sand, padding: "2px 8px", borderRadius: 8, background: B.sand + "22" }}>compartida</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <button onClick={() => { setF(p => ({ ...p, embarcacion_nombre: "" })); setPaso(1); }}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid rgba(255,255,255,0.15)`, background: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer" }}>
              ✏️ Agregar manualmente
            </button>
          </div>
        )}

        {/* ── PASO 1: Formulario embarcaciones (no walk-in) ── */}
        {paso === 1 && !esWalkin && (
        <div>
          {/* Info de salida seleccionada */}
          {esLancha && salidaInfo && (
            <div style={{ background: B.sky + "15", border: `1px solid ${B.sky}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>⛵</span>
              <div style={{ flex: 1, fontSize: 13 }}>
                <strong>{salidaInfo._lanchaSeleccionada || salidaInfo.nombre}</strong>
                {salidaInfo.hora && <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 8 }}>· salida {fmtHora(salidaInfo.hora)}</span>}
              </div>
              <button onClick={() => setPaso(0)} style={{ background: "none", border: "none", color: B.sky, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>← Cambiar</button>
            </div>
          )}
          {esLancha && !salidaInfo && (
            <button onClick={() => setPaso(0)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", marginBottom: 14, padding: 0 }}>← Ver lanchas programadas</button>
          )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
            <label style={LS}>Nombre / ID embarcación</label>
            <input value={f.embarcacion_nombre} onChange={e => s("embarcacion_nombre", e.target.value)}
              placeholder={esLancha ? "Ej: Atolon I" : "Ej: Patricia, sin nombre..."} style={IS} />
          </div>
          {!esLancha && (
            <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
              <label style={LS}>Matrícula (opcional)</label>
              <input value={f.matricula} onChange={e => s("matricula", e.target.value)} placeholder="Ej: CT-1234" style={IS} />
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Adultos</label>
            <input type="number" min="0" value={f.pax_a} onChange={e => s("pax_a", e.target.value)} style={IS} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Niños</label>
            <input type="number" min="0" value={f.pax_n} onChange={e => s("pax_n", e.target.value)} style={IS} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Staff a bordo</label>
            <input type="number" min="0" value={f.staff || 0} onChange={e => s("staff", e.target.value)} style={IS} />
            {Number(f.staff) > 0 && <div style={{ fontSize: 10, color: B.success, marginTop: 3 }}>No se cuentan como pasadía</div>}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Huéspedes del hotel</label>
            <input type="number" min="0" value={f.huespedes || 0} onChange={e => s("huespedes", e.target.value)} style={IS} />
            {Number(f.huespedes) > 0 && <div style={{ fontSize: 10, color: "#a78bfa", marginTop: 3 }}>Huéspedes del hotel (no son pasadía)</div>}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Hora llegada</label>
            <input type="time" value={f.hora_llegada} onChange={e => s("hora_llegada", e.target.value)} style={IS} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LS}>Notas</label>
            <input value={f.notas} onChange={e => s("notas", e.target.value)} placeholder="Observaciones..." style={IS} />
          </div>

          <div style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
            <label style={LS}>Foto embarcación (opcional)</label>
            {fotoPreview ? (
              <div style={{ position: "relative" }}>
                <img src={fotoPreview} alt="preview" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, border: `1px solid rgba(255,255,255,0.12)` }} />
                <button onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                <label style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, padding: "4px 10px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                  Cambiar<input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFotoChange} />
                </label>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "20px", borderRadius: 10, border: `2px dashed rgba(255,255,255,0.15)`, background: B.navyLight, cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 13, boxSizing: "border-box" }}>
                <span style={{ fontSize: 24 }}>📷</span>
                <span>Toca para agregar foto</span>
                <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFotoChange} />
              </label>
            )}
          </div>
        </div>


        {errorMsg && (
          <div style={{ background: "#ff000022", border: "1px solid #ff000055", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 12, color: "#ff6b6b" }}>
            ⚠️ {errorMsg}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={saving || uploadingFoto}
            style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: (saving || uploadingFoto) ? B.navyLight : B.sky, color: (saving || uploadingFoto) ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {uploadingFoto ? "Subiendo foto..." : saving ? "Registrando..." : "⚓ Registrar Llegada"}
          </button>
        </div>
        </div>
        )}

        {/* Barra de pasos (solo After Island, no walk-in) */}
        {paso >= 1 && !esWalkin && !esLancha && (
          <div style={{ display: "flex", gap: 6, marginBottom: 22, marginTop: 10 }}>
            {["Verificar datos", "Cobro"].map((lbl, i) => (
              <div key={lbl} style={{ flex: 1, height: 4, borderRadius: 2, background: paso > i ? B.sand : "rgba(255,255,255,0.12)" }} />
            ))}
          </div>
        )}

        {/* ── PASO 1: Walk-in simple ── */}
        {paso === 1 && esWalkin && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                <label style={LS}>Nombre (opcional)</label>
                <input value={f.embarcacion_nombre} onChange={e => s("embarcacion_nombre", e.target.value)} placeholder="Nombre del visitante" style={IS} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Personas</label>
                <input type="number" min="1" value={f.pax_a} onChange={e => s("pax_a", e.target.value)} style={IS} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Hora llegada</label>
                <input type="time" value={f.hora_llegada} onChange={e => s("hora_llegada", e.target.value)} style={IS} />
              </div>
              <div style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
                <label style={LS}>Notas</label>
                <input value={f.notas} onChange={e => s("notas", e.target.value)} placeholder="Observaciones..." style={IS} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={handleGuardar} disabled={saving}
                style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: saving ? B.navyLight : "#34d399", color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {saving ? "Registrando..." : "🚶 Registrar Walk-in"}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Modal Cobro After Island (paso 1: editar datos · paso 2: cobrar) ────────
function ModalCobro({ llegada, onClose, onSaved }) {
  // Paso 0: seleccionar categoría, 1: verificar datos, 2: cobro (solo After Island)
  const [tipoSel, setTipoSel] = useState(llegada.tipo || "after_island");
  const esAfterIsland = tipoSel === "after_island";
  // Si ya tiene tipo definido (no es selección inicial), ir directo a paso 1
  const [paso, setPaso] = useState(llegada.tipo ? 1 : 0);
  const [f, setF] = useState({
    embarcacion_nombre: llegada.embarcacion_nombre || "",
    matricula: llegada.matricula || "",
    pax_a: llegada.pax_a ?? 0,
    pax_n: llegada.pax_n ?? 0,
    hora_llegada: llegada.hora_llegada || "",
    notas: llegada.notas || "",
  });
  const sf = (k, v) => setF(p => ({ ...p, [k]: v }));

  const monto = esAfterIsland ? Number(f.pax_a) * PRECIO_AFTER_A + Number(f.pax_n) * PRECIO_AFTER_N : 0;
  const [cobro, setCobro] = useState({ email: "", linkUrl: "", linkGenerado: false });
  const [saving, setSaving] = useState(false);
  const sc = (k, v) => setCobro(p => ({ ...p, [k]: v }));

  const handleSelTipo = async (tipo) => {
    setTipoSel(tipo);
    if (tipo === "after_island") {
      setPaso(1); // goes to verify data + cobro
    } else {
      // Non-cobrable: update tipo and close
      if (!supabase || saving) return;
      setSaving(true);
      await supabase.from("muelle_llegadas").update({ tipo }).eq("id", llegada.id);
      setSaving(false);
      onSaved();
    }
  };

  const handleConfirmarDatos = async () => {
    if (!supabase || saving) return;
    setSaving(true);
    await supabase.from("muelle_llegadas").update({
      tipo: tipoSel,
      embarcacion_nombre: f.embarcacion_nombre || null,
      matricula: f.matricula || null,
      pax_a: Number(f.pax_a) || 0,
      pax_n: Number(f.pax_n) || 0,
      pax_total: Number(f.pax_a) + Number(f.pax_n),
      hora_llegada: f.hora_llegada || null,
      notas: f.notas || null,
    }).eq("id", llegada.id);
    setSaving(false);
    // Si es after_island, continuar a cobro; si no, guardar y cerrar
    if (esAfterIsland) setPaso(2);
    else onSaved();
  };

  const handleCobro = async (metodo) => {
    if (!supabase || saving) return;
    if (metodo === "link") {
      setSaving(true);
      const url = await wompiCheckoutUrl({ referencia: llegada.id, totalCOP: monto, email: cobro.email || "" });
      await supabase.from("muelle_llegadas").update({ metodo_pago: "link", total_cobrado: monto }).eq("id", llegada.id);
      sc("linkUrl", url);
      sc("linkGenerado", true);
      setSaving(false);
      return;
    }
    setSaving(true);
    await supabase.from("muelle_llegadas").update({ total_cobrado: monto, metodo_pago: metodo }).eq("id", llegada.id);
    setSaving(false);
    onSaved();
  };

  const tipoIconSel = TIPO_ICON[tipoSel] || "📋";
  const tipoLabelSel = TIPO_LABEL[tipoSel] || tipoSel;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000B", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 18, padding: 28, width: 480, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {paso === 0 ? "📋 Registrar embarcación" : `${tipoIconSel} ${tipoLabelSel} — ${paso === 1 ? "Verificar datos" : "Cobro"}`}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{f.embarcacion_nombre || "Embarcación"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* ── PASO 0: Seleccionar categoría ── */}
        {paso === 0 && (
          <>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>¿Qué tipo de visita es?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {OTROS_TIPOS.map(t => (
                <button key={t.value} onClick={() => handleSelTipo(t.value)} disabled={saving}
                  style={{ padding: "14px 18px", borderRadius: 12, border: `1px solid ${B.navyLight}`, background: B.navy, color: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 12, textAlign: "left", transition: "all 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = B.sand}
                  onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
                  <span style={{ fontSize: 22 }}>{t.label.split(" ")[0]}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.label.slice(t.label.indexOf(" ") + 1)}</div>
                    {t.value === "after_island" && <div style={{ fontSize: 11, color: B.sand, marginTop: 2 }}>Incluye cobro de pasadía</div>}
                  </div>
                  {t.value === "after_island" && <span style={{ marginLeft: "auto", fontSize: 12, color: B.sand, fontWeight: 700 }}>💰</span>}
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: `1px solid rgba(255,255,255,0.1)`, background: "none", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer" }}>
              Cancelar
            </button>
          </>
        )}

        {/* ── PASO 1: Verificar datos ── */}
        {paso === 1 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                <label style={LS}>Nombre / ID embarcación</label>
                <input value={f.embarcacion_nombre} onChange={e => sf("embarcacion_nombre", e.target.value)} placeholder="Ej: Patricia..." style={IS} />
              </div>
              <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                <label style={LS}>Matrícula (opcional)</label>
                <input value={f.matricula} onChange={e => sf("matricula", e.target.value)} placeholder="Ej: CT-1234" style={IS} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Adultos</label>
                <input type="number" min="0" value={f.pax_a} onChange={e => sf("pax_a", e.target.value)} style={IS} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Niños</label>
                <input type="number" min="0" value={f.pax_n} onChange={e => sf("pax_n", e.target.value)} style={IS} />
              </div>
              <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                <label style={LS}>Hora estimada de llegada</label>
                <input type="time" value={f.hora_llegada} onChange={e => sf("hora_llegada", e.target.value)} style={IS} />
              </div>
              <div style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
                <label style={LS}>Notas</label>
                <input value={f.notas} onChange={e => sf("notas", e.target.value)} placeholder="Observaciones..." style={IS} />
              </div>
            </div>

            {/* Preview monto */}
            {esAfterIsland && (Number(f.pax_a) + Number(f.pax_n)) > 0 && (
              <div style={{ background: B.sand + "18", border: `1px solid ${B.sand}33`, borderRadius: 10, padding: "12px 16px", margin: "16px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {Number(f.pax_a) > 0 && <span>{f.pax_a}A × {COP(PRECIO_AFTER_A)}</span>}
                    {Number(f.pax_n) > 0 && <span>{f.pax_n}N × {COP(PRECIO_AFTER_N)}</span>}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.sand }}>{COP(monto)}</div>
                </div>
              </div>
            )}

            {/* Mover entre secciones */}
            {(() => {
              const AFTER_GROUP = ["after_island", "restaurante", "a_consumo"];
              const OTRAS_GROUP = ["otras", "huespedes", "inspeccion", "empleados", "otros"];
              const esEnAfter = AFTER_GROUP.includes(llegada.tipo);
              const esEnOtras = OTRAS_GROUP.includes(llegada.tipo);
              if (!esEnAfter && !esEnOtras) return null;
              const nuevoTipo = esEnAfter ? "otras" : "after_island";
              const labelDestino = esEnAfter ? "🚢 Otras Embarcaciones" : "🌙 After Island / Restaurante";
              const handleMover = async () => {
                if (!confirm(`¿Mover esta embarcación a ${labelDestino.replace(/[^\w\s&/]/g, "").trim()}?`)) return;
                setSaving(true);
                const upd = { tipo: nuevoTipo };
                if (OTRAS_GROUP.includes(nuevoTipo)) {
                  upd.total_cobrado = 0;
                  upd.metodo_pago = null;
                }
                await supabase.from("muelle_llegadas").update(upd).eq("id", llegada.id);
                setSaving(false);
                onSaved();
              };
              return (
                <div style={{ marginTop: 20, padding: "12px 14px", background: B.navy, borderRadius: 10, border: `1px dashed rgba(255,255,255,0.15)` }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
                    Mover a otra sección
                  </div>
                  <button onClick={handleMover} disabled={saving}
                    style={{ width: "100%", padding: "9px", borderRadius: 8, border: `1px solid rgba(255,255,255,0.2)`, background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.5 : 1 }}>
                    → {labelDestino}
                  </button>
                </div>
              );
            })()}

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={handleConfirmarDatos} disabled={saving}
                style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: saving ? B.navyLight : B.sand, color: saving ? "rgba(255,255,255,0.4)" : B.navy, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {saving ? "Guardando..." : esAfterIsland ? "Confirmar → Cobrar" : "Guardar"}
              </button>
            </div>
          </>
        )}

        {/* ── PASO 2: Cobro ── */}
        {paso === 2 && (
          <>
            {/* Resumen */}
            <div style={{ background: B.sand + "18", border: `1px solid ${B.sand}33`, borderRadius: 12, padding: "14px 18px", marginBottom: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                    {f.pax_a} adulto{f.pax_a !== 1 ? "s" : ""}{f.pax_n > 0 ? ` + ${f.pax_n} niño${f.pax_n !== 1 ? "s" : ""}` : ""} · ⚓ {fmtHora(llegada.hora_llegada)}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {Number(f.pax_a) > 0 && <span>{f.pax_a} × {COP(PRECIO_AFTER_A)}</span>}
                    {Number(f.pax_n) > 0 && <span>{f.pax_n} × {COP(PRECIO_AFTER_N)}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: B.sand }}>{COP(monto)}</div>
              </div>
            </div>

        {!cobro.linkGenerado ? (
          <>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>¿Cómo se realiza el cobro?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => handleCobro("datafono")} disabled={saving}
                style={{ padding: "16px 20px", borderRadius: 12, border: `2px solid ${B.sky}44`, background: B.navy, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
                <span style={{ fontSize: 28 }}>💳</span>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>Datáfono</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Cobrar con datáfono físico</div></div>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: B.sky }}>{COP(monto)}</span>
              </button>
              <button onClick={() => handleCobro("efectivo")} disabled={saving}
                style={{ padding: "16px 20px", borderRadius: 12, border: `2px solid ${B.success}44`, background: B.navy, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
                <span style={{ fontSize: 28 }}>💵</span>
                <div><div style={{ fontWeight: 700, fontSize: 14 }}>Efectivo</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Cobrar en efectivo</div></div>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: B.success }}>{COP(monto)}</span>
              </button>
              <div style={{ padding: "16px 20px", borderRadius: 12, border: `2px solid ${B.sand}44`, background: B.navy }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                  <span style={{ fontSize: 28 }}>🔗</span>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>Enviar Link de Pago</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Wompi · El cliente paga desde su celular</div></div>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: B.sand }}>{COP(monto)}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={cobro.email} onChange={e => sc("email", e.target.value)}
                    placeholder="Email del cliente (opcional)" style={{ ...IS, flex: 1, fontSize: 12 }} />
                  <button onClick={() => handleCobro("link")} disabled={saving}
                    style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {saving ? "..." : "Generar →"}
                  </button>
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: `1px solid rgba(255,255,255,0.1)`, background: "none", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer" }}>
              Cobrar después
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Link de pago generado</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>Envíalo por WhatsApp o cópialo</div>
            <div style={{ background: B.navy, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 11, wordBreak: "break-all", color: B.sky, textAlign: "left" }}>
              {cobro.linkUrl}
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <button onClick={() => navigator.clipboard.writeText(cobro.linkUrl)}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1px solid ${B.sky}44`, background: "none", color: B.sky, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                📋 Copiar link
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`Hola 👋 Aquí está tu link de pago para el After Island en Atolon Beach Club 🌙\n\n${cobro.linkUrl}`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#25D366", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16"><path fill="#fff" d="M16 2C8.28 2 2 8.28 2 16c0 2.46.66 4.77 1.8 6.77L2 30l7.43-1.76A13.93 13.93 0 0 0 16 30c7.72 0 14-6.28 14-14S23.72 2 16 2Z"/></svg>
                WhatsApp
              </a>
            </div>
            <button onClick={onSaved}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: B.sky, color: B.navy, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              ✓ Listo
            </button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Card de Llegada ──────────────────────────────────────────────────────────
function LlegadaCard({ llegada, onEstadoChange, onDelete, canDelete }) {
  const [saving, setSaving]       = useState(false);
  const [showCobro, setShowCobro] = useState(false);
  const est = ESTADO_COLOR[llegada.estado] || ESTADO_COLOR.esperada;

  // Flujo simplificado: solo registramos llegadas (no marcamos salidas)
  const FLUJO       = { esperada: "llegó", "llegó": null, en_isla: null, salió: null };
  const FLUJO_LABEL = { esperada: "✓ Llegó", "llegó": null, en_isla: null, salió: null };

  const avanzar = async () => {
    const sig = FLUJO[llegada.estado];
    if (!sig || !supabase || saving) return;
    setSaving(true);
    const upd = { estado: sig };
    if (sig === "llegó") upd.hora_llegada = hoyHora();
    const { error } = await supabase.from("muelle_llegadas").update(upd).eq("id", llegada.id);
    setSaving(false);
    if (error) { alert(`Error al actualizar estado: ${error.message}`); return; }
    onEstadoChange();
  };

  const esNoLancha = llegada.tipo !== "lancha_atolon";
  // "Sin registrar" aplica SOLO a after_island (único flujo con cobro obligatorio).
  // Walk-in, restaurante, huéspedes, empleados, otros, etc. no tienen cobro → no aplica.
  const esAfterSinCobro = llegada.tipo === "after_island" && !(llegada.total_cobrado > 0);
  const tipoIcon = TIPO_ICON[llegada.tipo] || "📋";

  return (
    <>
      {showCobro && (
        <ModalCobro
          llegada={llegada}
          onClose={() => setShowCobro(false)}
          onSaved={() => { setShowCobro(false); onEstadoChange(); }}
        />
      )}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", marginBottom: 10, border: `1px solid ${esAfterSinCobro ? B.sand + "55" : est.color + "33"}` }}>
        {llegada.foto_url && (
          <a href={llegada.foto_url} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 10 }}>
            <img src={llegada.foto_url} alt="embarcación" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, border: `1px solid rgba(255,255,255,0.08)` }} />
          </a>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 22, flexShrink: 0 }}>{tipoIcon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{llegada.embarcacion_nombre || "Embarcación"}</span>
              {llegada.matricula && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{llegada.matricula}</span>}
              {esAfterSinCobro && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 8, background: B.sand + "22", color: B.sand, fontWeight: 600 }}>📋 Sin registrar</span>}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>👥 {llegada.pax_total} pax{llegada.pax_n > 0 ? ` (${llegada.pax_a}A + ${llegada.pax_n}N)` : ""}</span>
              {llegada.hora_llegada && <span>⚓ {fmtHora(llegada.hora_llegada)}</span>}
              {llegada.hora_salida  && <span>🏠 {fmtHora(llegada.hora_salida)}</span>}
              {llegada.total_cobrado > 0 && <span style={{ color: B.success }}>✓ {COP(llegada.total_cobrado)} · {llegada.metodo_pago}</span>}
            </div>
            {llegada.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, fontStyle: "italic" }}>{llegada.notas}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {esAfterSinCobro ? (
              <button onClick={() => setShowCobro(true)}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                📋 Registrar
              </button>
            ) : llegada.tipo !== "lancha_atolon" && (
              <button onClick={() => setShowCobro(true)}
                title="Editar"
                style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${B.sand}44`, background: "none", color: B.sand, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                ✎ Editar
              </button>
            )}
            {FLUJO[llegada.estado] && (
              <button onClick={avanzar} disabled={saving}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: est.color, color: llegada.estado === "en_isla" ? "#fff" : B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "..." : FLUJO_LABEL[llegada.estado]}
              </button>
            )}
            {canDelete && (
              <button onClick={onDelete}
                style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${B.danger}33`, background: "none", color: B.danger, fontSize: 12, cursor: "pointer", opacity: 0.6 }}>
                ✕
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── MAIN MODULE ──────────────────────────────────────────────────────────────
// ─── Bitácora ─────────────────────────────────────────────────────────────────
const TIPO_LABEL = { lancha_atolon: "Lancha Atolon", after_island: "After Island", restaurante: "Restaurante", a_consumo: "A Consumo", huespedes: "Huéspedes", inspeccion: "Inspección", empleados: "Empleados", otros: "Otros", walkin: "Walk-in", otras: "Otra embarcación" };
const TIPO_ICON  = { lancha_atolon: "⛵", after_island: "🌙", restaurante: "🍽️", a_consumo: "🍹", huespedes: "🏨", inspeccion: "🔍", empleados: "👷", otros: "📋", walkin: "🚶", otras: "🚢" };

const OTROS_TIPOS = [
  { value: "after_island", label: "🌙 After Island" },
  { value: "restaurante",  label: "🍽️ Restaurante" },
  { value: "a_consumo",    label: "🍹 A Consumo" },
  { value: "huespedes",    label: "🏨 Huésped" },
  { value: "inspeccion",   label: "🔍 Inspección" },
  { value: "otros",        label: "📋 Otro" },
];
const WALKIN_TIPOS = [
  { value: "after_island", label: "🌙 After Island", desc: "Incluye cobro de pasadía" },
  { value: "a_consumo",    label: "🍹 A Consumo",    desc: "Solo consumo en el club" },
  { value: "restaurante",  label: "🍽️ Restaurante",  desc: "Reserva de restaurante" },
];

// Fila con edición inline de notas
function BitacoraFila({ r, onUpdated, onDelete, isMobile }) {
  const [editando, setEditando] = useState(false);
  const [notas,    setNotas]    = useState(r.notas || "");
  const [saving,   setSaving]   = useState(false);
  const [recien,   setRecien]   = useState(false); // flash "editado"
  const taRef = useRef(null);
  const ec = ESTADO_COLOR[r.estado] || ESTADO_COLOR.esperada;

  const guardarNota = async () => {
    if (!supabase) return;
    setSaving(true);
    const notasAntes = r.notas || "";
    await supabase.from("muelle_llegadas").update({ notas: notas.trim() || null }).eq("id", r.id);
    await logAccion({
      modulo: "muelle",
      accion: "editar_nota",
      tabla: "muelle_llegadas",
      registroId: r.id,
      datosAntes: { notas: notasAntes },
      datosDespues: { notas: notas.trim() || null },
      notas: `Nota editada en bitácora — ${r.embarcacion_nombre || r.id}`,
    });
    setSaving(false);
    setEditando(false);
    setRecien(true);
    setTimeout(() => setRecien(false), 4000);
    onUpdated(r.id, notas.trim() || null);
  };

  const cancelar = () => { setNotas(r.notas || ""); setEditando(false); };

  if (isMobile) return (
    <div style={{ background: recien ? B.sky + "12" : B.navyMid, borderRadius: 12, padding: "12px 14px", border: `1px solid ${recien ? B.sky + "44" : "rgba(255,255,255,0.06)"}`, transition: "all 0.4s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{TIPO_ICON[r.tipo]} {r.embarcacion_nombre || "—"}</span>
          {r.matricula && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>{r.matricula}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {recien && <span style={{ fontSize: 9, color: B.sky, fontWeight: 700, textTransform: "uppercase" }}>✎ editado</span>}
          {onDelete && (
            <button onClick={() => { if (window.confirm("¿Eliminar este registro?")) onDelete(r.id); }}
              title="Eliminar"
              style={{ background: "none", border: "none", cursor: "pointer", color: B.danger, fontSize: 14, padding: "0 2px", lineHeight: 1, opacity: 0.7 }}>×</button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 11, color: "rgba(255,255,255,0.45)", flexWrap: "wrap", marginBottom: 8 }}>
        <span>📅 {r.fecha}</span>
        {r.hora_llegada && <span>⚓ {r.hora_llegada?.slice(0,5)}</span>}
        {r.hora_salida  && <span>⛵ {r.hora_salida?.slice(0,5)}</span>}
        <span>👥 {r.pax_total || 0} pax</span>
      </div>
      {/* Notas editables */}
      {editando ? (
        <div style={{ marginTop: 6 }}>
          <textarea ref={taRef} value={notas} onChange={e => setNotas(e.target.value)} rows={2} autoFocus
            style={{ ...IS, fontSize: 12, resize: "vertical", padding: "8px 10px" }} placeholder="Agregar nota..." />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button onClick={guardarNota} disabled={saving}
              style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: B.sky, color: B.navy, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {saving ? "…" : "✓ Guardar"}
            </button>
            <button onClick={cancelar} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: B.navyLight, color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>✕</button>
          </div>
        </div>
      ) : (
        <div onClick={() => setEditando(true)} style={{ cursor: "pointer", padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.08)", minHeight: 28 }}>
          {notas
            ? <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>{notas}</span>
            : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>+ Agregar nota…</span>}
        </div>
      )}
    </div>
  );

  // Desktop: fila de tabla
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: recien ? B.sky + "0a" : "transparent", transition: "background 0.4s" }}>
      <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>{r.fecha}</td>
      <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>{TIPO_ICON[r.tipo]} <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{TIPO_LABEL[r.tipo] || r.tipo}</span></td>
      <td style={{ padding: "9px 10px", fontWeight: 600 }}>{r.embarcacion_nombre || "—"}</td>
      <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{r.matricula || "—"}</td>
      <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{r.hora_llegada ? r.hora_llegada.slice(0,5) : "—"}</td>
      <td style={{ padding: "9px 10px", textAlign: "center" }}>{r.pax_total || 0}</td>
      {/* Borrar */}
      <td style={{ padding: "6px 8px", textAlign: "center" }}>
        {onDelete && (
          <button onClick={() => { if (window.confirm("¿Eliminar este registro?")) onDelete(r.id); }}
            title="Eliminar"
            style={{ background: "none", border: "none", cursor: "pointer", color: B.danger, fontSize: 16, padding: "0 4px", opacity: 0.7 }}>×</button>
        )}
      </td>
      {/* Notas editables inline */}
      <td style={{ padding: "6px 8px", minWidth: 200 }}>
        {editando ? (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} autoFocus
              style={{ ...IS, fontSize: 11, resize: "none", padding: "5px 8px", flex: 1, minWidth: 140 }} placeholder="Nota..." />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={guardarNota} disabled={saving}
                style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: B.sky, color: B.navy, fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                {saving ? "…" : "✓"}
              </button>
              <button onClick={cancelar}
                style={{ padding: "5px 8px", borderRadius: 6, border: "none", background: B.navyLight, color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        ) : (
          <div onClick={() => setEditando(true)}
            style={{ cursor: "pointer", padding: "5px 8px", borderRadius: 6, border: "1px dashed rgba(255,255,255,0.06)", minHeight: 26, display: "flex", alignItems: "center", gap: 6, color: notas ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)", fontSize: 11 }}>
            {notas
              ? <><span style={{ fontStyle: "italic", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{notas}</span>{recien && <span style={{ fontSize: 9, color: B.sky, fontWeight: 700, flexShrink: 0 }}>✎</span>}</>
              : <span>+ nota</span>}
          </div>
        )}
      </td>
    </tr>
  );
}

function BitacoraLlegadas({ isMobile }) {
  const hoy   = todayStr();
  const hace7 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  const [desde,   setDesde]   = useState(hace7);
  const [hasta,   setHasta]   = useState(hoy);
  const [tipo,    setTipo]    = useState("todos");
  const [busca,   setBusca]   = useState("");
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.email) return;
      const { data } = await supabase.from("usuarios").select("rol_id").eq("email", session.user.email.toLowerCase()).single();
      if (data?.rol_id === "super_admin") setIsAdmin(true);
    });
  }, []);

  const fetchBitacora = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    let q = supabase.from("muelle_llegadas").select("*")
      .gte("fecha", desde).lte("fecha", hasta)
      .order("fecha", { ascending: false }).order("created_at", { ascending: false })
      .limit(500);
    if (tipo !== "todos") {
      if (tipo === "after_island") q = q.in("tipo", ["after_island", "restaurante", "a_consumo"]);
      else if (tipo === "otras") q = q.in("tipo", ["otras", "huespedes", "inspeccion", "empleados", "otros"]);
      else q = q.eq("tipo", tipo);
    }
    const { data } = await q;
    setRows(data || []);
    setLoading(false);
  }, [desde, hasta, tipo]);

  useEffect(() => { fetchBitacora(); }, [fetchBitacora]);

  // Actualiza nota localmente sin refetch
  const handleUpdated = (id, nuevaNota) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, notas: nuevaNota } : r));

  // Elimina registro
  const handleDelete = async (id) => {
    if (!supabase) return;
    await supabase.from("muelle_llegadas").delete().eq("id", id);
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const filtradas = busca.trim()
    ? rows.filter(r =>
        (r.embarcacion_nombre || "").toLowerCase().includes(busca.toLowerCase()) ||
        (r.matricula || "").toLowerCase().includes(busca.toLowerCase()) ||
        (r.notas || "").toLowerCase().includes(busca.toLowerCase())
      )
    : rows;

  const totalPax = filtradas.reduce((t, r) => t + (r.pax_total || 0), 0);
  const ISsm = { ...IS, padding: "8px 12px", fontSize: 12 };

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, alignItems: "flex-end" }}>
        <div>
          <label style={{ ...LS, fontSize: 10 }}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={ISsm} />
        </div>
        <div>
          <label style={{ ...LS, fontSize: 10 }}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={ISsm} />
        </div>
        <div>
          <label style={{ ...LS, fontSize: 10 }}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={ISsm}>
            <option value="todos">Todos</option>
            <option value="lancha_atolon">☀️ Pasadías</option>
            <option value="after_island">🌙 After Island / Restaurante</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ ...LS, fontSize: 10 }}>Buscar</label>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Embarcación, matrícula, notas..." style={ISsm} />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 3}, 1fr)`, gap: 10, marginBottom: 18 }}>
        {[
          { label: "Registros", value: filtradas.length, color: B.sky },
          { label: "Total pax", value: totalPax,         color: B.sand },
          { label: "Días",      value: [...new Set(filtradas.map(r => r.fecha))].length, color: "rgba(255,255,255,0.5)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: B.navyMid, borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Lista / Tabla */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>Sin registros para este período</div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtradas.map(r => <BitacoraFila key={r.id} r={r} onUpdated={handleUpdated} onDelete={isAdmin ? handleDelete : undefined} isMobile />)}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Fecha", "Tipo", "Embarcación", "Matr.", "Llegó", "Pax", "", "Notas"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(r => <BitacoraFila key={r.id} r={r} onUpdated={handleUpdated} onDelete={isAdmin ? handleDelete : undefined} isMobile={false} />)}
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

function GruposCheckin({ grupos, grupoAbierto, setGrupoAbierto, checkinPax, checkinTodos, fecha }) {
  // En Llegadas (Muelle) NO se hace check-in. Solo se muestra un resumen informativo.
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>👥</span>
        <span style={{ fontWeight: 700, fontSize: 14, color: B.sand }}>Grupos del día</span>
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: "rgba(200,185,154,0.15)", color: B.sand }}>{fecha} · {grupos.length} grupo{grupos.length !== 1 ? "s" : ""}</span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>(El check-in de grupos se hace en el módulo Check-in)</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
      </div>
      {grupos.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontStyle: "italic", padding: "6px 0" }}>
          Sin grupos para esta fecha
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {grupos.map(g => {
            // Preferir g.pax (calculado por trigger = pasadias_org + reservas vinculadas)
            const totalPaxG = Number(g.pax) > 0
              ? Number(g.pax)
              : (g.pasadias_org || [])
                  .filter(p => p.tipo !== "Impuesto Muelle")
                  .reduce((s, p) => s + (Number(p.personas) || 0), 0);
            const zarpe = g.zarpe_data || [];
            const conNombre = zarpe.filter(z => z.nombre);
            const checkedIn = zarpe.filter(z => z.checkin_at);
            const pct = totalPaxG > 0 ? checkedIn.length / totalPaxG : 0;
            const barCol = pct >= 1 ? B.success : pct > 0 ? B.warning : "rgba(255,255,255,0.15)";
            const isOpen = grupoAbierto === g.id;
            const horas = (g.salidas_grupo || []).map(sg => sg.hora).filter(Boolean).sort();
            return (
              <div key={g.id} style={{ background: "rgba(200,185,154,0.07)", borderRadius: 12, border: `1px solid ${pct >= 1 ? B.success + "55" : "rgba(200,185,154,0.2)"}`, overflow: "hidden" }}>
                <div onClick={() => setGrupoAbierto(isOpen ? null : g.id)}
                  style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: B.white }}>{g.nombre}</div>
                      {g.comparte_lancha_pasadias && (
                        <span title="Los pax de este grupo ya están contados en la lancha de pasadías"
                          style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: `${B.sand}22`, color: B.sand, fontWeight: 700, letterSpacing: 0.5 }}>
                          ⚠ CONTADO EN LANCHA
                        </span>
                      )}
                    </div>
                    <div style={{ height: 6, borderRadius: 6, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginBottom: 5 }}>
                      <div style={{ height: "100%", width: `${pct * 100}%`, background: barCol, borderRadius: 6, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(255,255,255,0.45)", flexWrap: "wrap" }}>
                      <span style={{ color: pct >= 1 ? B.success : B.white, fontWeight: 700 }}>{checkedIn.length}/{totalPaxG} abordaron</span>
                      <span>{conNombre.length}/{totalPaxG} zarpe listo</span>
                      {horas.map(h => <span key={h} style={{ color: B.sky }}>⛵ {h}</span>)}
                    </div>
                    {g.comparte_lancha_pasadias && (
                      <div style={{ fontSize: 10, color: B.sand, marginTop: 5, fontStyle: "italic" }}>
                        ℹ️ Estos pasajeros ya están incluidos en el total de la embarcación — no sumar dos veces
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 18, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "12px 16px" }}>
                    <div style={{ textAlign: "center", padding: "14px 10px", fontSize: 12, color: B.sand, background: "rgba(200,185,154,0.08)", borderRadius: 8 }}>
                      ℹ️ El check-in de grupos se realiza en el módulo <strong>Check-in</strong>.<br/>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>Aquí solo se muestra el resumen de la operación del día.</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MuelleCheckin() {
  const { isMobile } = useMobile();
  const [tab,   setTab]     = useState("hoy");
  const [fecha, setFecha]   = useState(todayStr());
  const [llegadas, setLlegadas] = useState([]);
  const [modal, setModal]   = useState(null);
  const [selectorAfter, setSelectorAfter] = useState(false);
  const [reservasAfter, setReservasAfter] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.email) return;
      const { data } = await supabase.from("usuarios").select("rol_id").eq("email", session.user.email.toLowerCase()).single();
      if (data?.rol_id === "super_admin") setIsSuperAdmin(true);
    });
  }, []);

  const fetchLlegadas = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("muelle_llegadas").select("*").eq("fecha", fecha).order("created_at");
    setLlegadas(data || []);
  }, [fecha]);

  const fetchGrupos = useCallback(async () => {
    try {
      const SURL = "https://ncdyttgxuicyruathkxd.supabase.co";
      const AKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";
      const res = await fetch(
        `${SURL}/rest/v1/eventos?fecha=eq.${fecha}&categoria=eq.grupo&select=id,nombre,fecha,pasadias_org,salidas_grupo,zarpe_data`,
        { headers: { apikey: AKEY, Authorization: `Bearer ${AKEY}` } }
      );
      const data = await res.json();
      setGrupos(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("fetchGrupos error:", e);
      setGrupos([]);
    }
  }, [fecha]);

  const SURL = "https://ncdyttgxuicyruathkxd.supabase.co";
  const AKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";

  const patchEvento = (id, body) => fetch(
    `${SURL}/rest/v1/eventos?id=eq.${id}`,
    { method: "PATCH", headers: { apikey: AKEY, Authorization: `Bearer ${AKEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(body) }
  );

  const checkinPax = async (grupo, slotId) => {
    const now = new Date().toISOString();
    const newZarpe = (grupo.zarpe_data || []).map(z =>
      z.slot_id === slotId ? { ...z, checkin_at: z.checkin_at ? null : now } : z
    );
    await patchEvento(grupo.id, { zarpe_data: newZarpe });
    setGrupos(prev => prev.map(g => g.id === grupo.id ? { ...g, zarpe_data: newZarpe } : g));
  };

  const checkinTodos = async (grupo) => {
    const now = new Date().toISOString();
    let newZarpe = grupo.zarpe_data || [];

    // Si no hay lista de zarpe, crear slots genéricos basados en pasadias_org
    if (newZarpe.length === 0) {
      const slots = [];
      (grupo.pasadias_org || []).forEach(p => {
        if (p.tipo === "Impuesto Muelle" || p.tipo === "STAFF") return;
        const n = Number(p.personas) || 0;
        for (let i = 1; i <= n; i++) {
          slots.push({
            slot_id: `${p.id}-${i}`,
            tipo: p.tipo,
            nombre: `${p.tipo} ${i}`,
            checkin_at: now,
          });
        }
      });
      newZarpe = slots;
    } else {
      newZarpe = newZarpe.map(z =>
        z.nombre && !z.checkin_at ? { ...z, checkin_at: now } : z
      );
    }
    await patchEvento(grupo.id, { zarpe_data: newZarpe });
    setGrupos(prev => prev.map(g => g.id === grupo.id ? { ...g, zarpe_data: newZarpe } : g));
  };

  useEffect(() => { fetchLlegadas(); }, [fetchLlegadas]);
  useEffect(() => { fetchGrupos(); }, [fetchGrupos]);

  // Extraer número desde las notas: "[N staff]" o "[N huéspedes]"
  const extraeEtiqueta = (notas, palabra) => {
    if (!notas) return 0;
    const re = new RegExp(`\\[(\\d+)\\s*${palabra}`, "i");
    const m = notas.match(re);
    return m ? Number(m[1]) : 0;
  };
  const totalPasadias  = llegadas.reduce((t, l) => t + (l.pax_total || 0), 0);
  const totalStaff     = llegadas.reduce((t, l) => t + extraeEtiqueta(l.notas, "staff"), 0);
  const totalHuespedes = llegadas.reduce((t, l) => t + extraeEtiqueta(l.notas, "hu[eé]sped"), 0);
  const totalPax       = totalPasadias + totalStaff + totalHuespedes;
  const totalCobrado   = llegadas.reduce((t, l) => t + (l.total_cobrado || 0), 0);

  const porTipo = (tipos) => llegadas.filter(l => (Array.isArray(tipos) ? tipos : [tipos]).includes(l.tipo));

  const SECCIONES = [
    { tipo: "lancha_atolon",              tipos: ["lancha_atolon"],              icon: "☀️", label: "Pasadías",                 color: B.sky,  btnBg: B.sky,  btnColor: B.navy },
    { tipo: "after_island",               tipos: ["after_island","restaurante","a_consumo"], icon: "🌙", label: "After Island / Restaurante", color: B.sand, btnBg: B.sand, btnColor: B.navy },
    { tipo: "otras",                      tipos: ["otras","huespedes","inspeccion","empleados","otros"], icon: "🚢", label: "Otras Embarcaciones",     color: "#f97316", btnBg: "#f97316", btnColor: "#fff" },
    { tipo: "walkin",                     tipos: ["walkin"],                     icon: "🚶", label: "Walk-in Caminando",       color: "#34d399", btnBg: "#34d399", btnColor: B.navy },
    { tipo: "contratistas",               tipos: [],                             icon: "🦺", label: "Contratistas",            color: "#a78bfa", btnBg: "#a78bfa", btnColor: "#fff", _esContratistas: true },
  ];

  const delLlegada = async (id) => {
    await supabase.from("muelle_llegadas").delete().eq("id", id);
    fetchLlegadas();
  };

  return (
    <div style={{ padding: isMobile ? "16px 12px" : "24px", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#e2e8f0", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "#fff" }}>⚓ Llegadas a Isla</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Control de embarcaciones · Isla Tierra Bomba</div>
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
              borderBottom: tab === t.key ? `2px solid ${B.sky}` : "2px solid transparent",
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bitacora" && <BitacoraLlegadas isMobile={isMobile} />}
      {tab === "hoy" && (<>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total llegados", value: totalPax,        color: B.sky },
          { label: "Pasadías",       value: totalPasadias,   color: B.sand },
          { label: "Huéspedes",      value: totalHuespedes,  color: "#a78bfa" },
          { label: "Staff",          value: totalStaff,      color: B.success },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Check-in Grupos ── */}
      <GruposCheckin grupos={grupos} grupoAbierto={grupoAbierto} setGrupoAbierto={setGrupoAbierto} checkinPax={checkinPax} checkinTodos={checkinTodos} fecha={fecha} />

      {/* Botones de registro */}
      <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        {SECCIONES.map(({ tipo, icon, label, btnBg, btnColor, _esContratistas }) => (
          <button key={tipo} onClick={async () => {
            if (_esContratistas) {
              // Navegar al módulo dedicado de Muelle Contratistas
              window.dispatchEvent(new CustomEvent("atolon-navigate", { detail: { modulo: "contratistas_muelle" } }));
              return;
            }
            // Para After Island: primero mostrar selector de reservas del día
            if (tipo === "after_island") {
              const { data } = await supabase.from("reservas")
                .select("id, nombre, nombre_embarcacion, hora_llegada, pax, pax_a, pax_n, total, abono, saldo, estado, notas, tipo")
                .eq("fecha", fecha)
                .ilike("tipo", "%after%island%")
                .neq("estado", "cancelado")
                .order("hora_llegada");
              const yaLlegadas = new Set(llegadas.filter(l => l.reserva_id).map(l => l.reserva_id));
              const disponibles = (data || []).filter(r => !yaLlegadas.has(r.id));
              setReservasAfter(disponibles);
              setSelectorAfter(true);
              return;
            }
            setModal({ tipo, reserva: null });
          }}
            style={{ flex: 1, minWidth: 120, padding: "12px 16px", borderRadius: 12, border: "none", background: btnBg, color: btnColor, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>{icon}</span> + {label}
          </button>
        ))}
      </div>

      {/* Lista unificada por sección */}
      {SECCIONES.map(({ tipo, tipos, icon, label, color, _esContratistas }) => {
        if (_esContratistas) {
          return (
            <ContratistasSection key={tipo} fecha={fecha} icon={icon} label={label} color={color} />
          );
        }
        const lista = porTipo(tipos);
        return (
          <div key={tipo} style={{ marginBottom: 28 }}>
            {/* Cabecera de sección */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color }}>{label}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                {lista.length > 0
                  ? `${lista.length} embarcación${lista.length !== 1 ? "es" : ""} · ${lista.reduce((t, l) => t + (l.pax_total || 0), 0)} pax`
                  : "Sin llegadas"}
              </span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            </div>

            {/* Cards */}
            {lista.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "10px 0 0 4px", fontStyle: "italic" }}>
                Ninguna registrada todavía
              </div>
            ) : (
              lista.map(l => (
                <LlegadaCard key={l.id} llegada={l} onEstadoChange={fetchLlegadas} onDelete={() => delLlegada(l.id)} canDelete={isSuperAdmin} />
              ))
            )}
          </div>
        );
      })}

      {/* Estado vacío global */}
      {llegadas.length === 0 && grupos.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>
          No hay llegadas registradas para este día
        </div>
      )}

      {/* Modal selector After Island: elige reserva o continúa walk-in */}
      {selectorAfter && (
        <div onClick={e => e.target === e.currentTarget && setSelectorAfter(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, width: 560, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>After Island</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: B.white }}>Registrar llegada</div>
              </div>
              <button onClick={() => setSelectorAfter(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
                {reservasAfter.length > 0
                  ? `Selecciona la reserva que acaba de llegar — el pago se vincula automáticamente:`
                  : "No hay reservas After Island pendientes del día."}
              </div>

              {reservasAfter.map(r => (
                <button key={r.id}
                  onClick={() => { setSelectorAfter(false); setModal({ tipo: "after_island", reserva: r }); }}
                  style={{ width: "100%", textAlign: "left", background: B.navy, border: `1px solid ${B.navyLight}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8, cursor: "pointer", color: B.white }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = B.sand}
                  onMouseLeave={e => e.currentTarget.style.borderColor = B.navyLight}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{r.nombre}</div>
                      <div style={{ fontSize: 12, color: B.sky, marginTop: 2 }}>
                        ⛵ {r.nombre_embarcacion || "Sin embarcación"} {r.hora_llegada ? `· ⚓ ${r.hora_llegada}` : ""}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                        {r.pax} pax ({r.pax_a}A + {r.pax_n}N) · Total {COP(r.total)} · {r.saldo > 0 ? `Saldo ${COP(r.saldo)}` : "Pagado"}
                      </div>
                      {r.notas && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4, fontStyle: "italic" }}>💬 {r.notas}</div>}
                    </div>
                    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 12, background: r.estado === "confirmado" ? B.success + "22" : B.warning + "22", color: r.estado === "confirmado" ? B.success : B.warning, fontWeight: 700, textTransform: "uppercase" }}>
                      {r.estado}
                    </span>
                  </div>
                </button>
              ))}

              <button onClick={() => { setSelectorAfter(false); setModal({ tipo: "after_island", reserva: null }); }}
                style={{ width: "100%", padding: "14px", marginTop: 10, background: "transparent", border: `2px dashed ${B.sand}55`, borderRadius: 10, color: B.sand, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                + Walk-in (sin reserva previa)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal registro */}
      {modal && (
        <ModalNuevaLlegada
          tipo={modal.tipo}
          fecha={fecha}
          reserva={modal.reserva}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchLlegadas(); }}
        />
      )}
      </>)}
    </div>
  );
}

// ─── Sección Contratistas ─────────────────────────────────────────────────
// Muestra los ingresos de hoy (contratistas_ingresos_muelle) y permite
// verificación rápida por cédula — sin salir de la vista de Llegadas.
function ContratistasSection({ fecha, icon, label, color }) {
  const [ingresos, setIngresos] = useState([]);
  const [inputCode, setInputCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { verdict, motivos, trabajador, contratista, certificado, rawCode }
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    const since = new Date(fecha + "T00:00:00"); since.setHours(0,0,0,0);
    const until = new Date(since); until.setDate(until.getDate() + 1);
    const { data } = await supabase
      .from("contratistas_ingresos_muelle")
      .select("id, created_at, cedula, nombre, resultado, motivo, contratista_id, verificado_por")
      .eq("origen", "atolon_isla")
      .gte("created_at", since.toISOString())
      .lt("created_at", until.toISOString())
      .order("created_at", { ascending: false });
    const ids = [...new Set((data || []).map(r => r.contratista_id).filter(Boolean))];
    let emp = {};
    if (ids.length) {
      const { data: cs } = await supabase.from("contratistas").select("id, nombre_display").in("id", ids);
      (cs || []).forEach(c => { emp[c.id] = c.nombre_display; });
    }
    setIngresos((data || []).map(r => ({ ...r, empresa: emp[r.contratista_id] || "" })));
  }, [fecha]);
  useEffect(() => { cargar(); }, [cargar]);

  const extractCode = (s) => {
    const txt = String(s || "").trim();
    const m = txt.match(/\/verificar\/([^/?#]+)/i);
    return (m ? m[1] : txt).trim();
  };

  const verificar = async () => {
    const code = extractCode(inputCode);
    if (!code) { alert("Ingresa una cédula o código de certificado"); return; }
    setLoading(true); setResult(null);
    try {
      const isDigits = /^\d+$/.test(code);
      let trabajador = null, contratista = null, certificado = null;
      const motivos = [];

      if (isDigits) {
        const { data: t } = await supabase
          .from("contratistas_trabajadores")
          .select("id, nombre, cedula, cargo, contratista_id")
          .eq("cedula", code)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        trabajador = t;
      } else {
        const { data: c } = await supabase.from("certificados_curso")
          .select("*").eq("codigo", code).maybeSingle();
        certificado = c;
        if (c?.trabajador_id) {
          const { data: t } = await supabase.from("contratistas_trabajadores")
            .select("id, nombre, cedula, cargo, contratista_id").eq("id", c.trabajador_id).maybeSingle();
          trabajador = t;
        }
      }

      if (trabajador?.contratista_id) {
        const { data: c } = await supabase.from("contratistas")
          .select("id, nombre_display, estado, tipo, emp_fecha_pila")
          .eq("id", trabajador.contratista_id).maybeSingle();
        contratista = c;
      }

      if (trabajador?.id && !certificado) {
        const { data: cert } = await supabase.from("certificados_curso")
          .select("*").eq("trabajador_id", trabajador.id)
          .order("issued_at", { ascending: false }).limit(1).maybeSingle();
        certificado = cert;
      }

      let verdict = "permitido";
      if (!trabajador && !certificado) { verdict = "rechazado"; motivos.push(`No encontrado: ${code}`); }
      else {
        if (!contratista) { verdict = "rechazado"; motivos.push("Sin contratista asociado."); }
        else if (contratista.estado !== "aprobado") { verdict = "rechazado"; motivos.push(`Contratista estado: ${contratista.estado || "—"}`); }
        if (!certificado) { verdict = "rechazado"; motivos.push("Sin certificado SST."); }
        else {
          if (!certificado.passed) { verdict = "rechazado"; motivos.push("Curso SST no aprobado."); }
          if (certificado.expires_at && new Date(certificado.expires_at) < new Date()) {
            verdict = "rechazado"; motivos.push(`Certificado vencido.`);
          }
        }
        if (contratista?.tipo === "empresa" && contratista.emp_fecha_pila) {
          const dias = Math.floor((Date.now() - new Date(contratista.emp_fecha_pila).getTime()) / 86400000);
          if (dias > 45) { verdict = "rechazado"; motivos.push(`PILA vencida (${dias}d).`); }
          else if (dias > 40 && verdict !== "rechazado") { verdict = "advertencia"; motivos.push(`PILA vence en ${45 - dias}d.`); }
        }
      }

      setResult({ verdict, motivos, trabajador, contratista, certificado, rawCode: code });
    } catch (e) { alert("Error: " + e.message); }
    finally { setLoading(false); }
  };

  const registrarIngreso = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("contratistas_ingresos_muelle").insert({
        trabajador_id: result.trabajador?.id || null,
        contratista_id: result.contratista?.id || result.trabajador?.contratista_id || null,
        cedula: result.trabajador?.cedula || null,
        nombre: result.trabajador?.nombre || result.certificado?.nombre || null,
        codigo_certificado: result.certificado?.codigo || null,
        resultado: result.verdict,
        motivo: result.motivos.join(" · ") || null,
        verificado_por: user?.email || null,
        origen: "atolon_isla",
      });
      if (result.trabajador?.id && result.verdict === "permitido") {
        await supabase.from("contratistas_trabajadores")
          .update({ ultimo_ingreso: new Date().toISOString() })
          .eq("id", result.trabajador.id);
      }
      setResult(null); setInputCode("");
      cargar();
    } catch (e) { alert("Error: " + e.message); }
    finally { setSaving(false); }
  };

  const totales = {
    permitidos: ingresos.filter(i => i.resultado === "permitido").length,
    advertencias: ingresos.filter(i => i.resultado === "advertencia").length,
    rechazados: ingresos.filter(i => i.resultado === "rechazado").length,
  };
  const verdictColor = (v) => v === "permitido" ? B.success : v === "advertencia" ? B.warning : B.danger;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color }}>{label}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
          {ingresos.length > 0
            ? `${totales.permitidos} permitidos${totales.advertencias ? ` · ${totales.advertencias} advertencias` : ""}${totales.rechazados ? ` · ${totales.rechazados} rechazos` : ""}`
            : "Sin ingresos aún"}
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
      </div>

      {/* Caja de verificación rápida por cédula */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: "14px 18px", marginBottom: 12, border: "1px solid rgba(167,139,250,0.2)" }}>
        <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Verificar contratista (cédula o código)
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={inputCode} onChange={e => setInputCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && verificar()}
            placeholder="Cédula o CERT-XXX"
            style={{ ...IS, flex: 1 }} />
          <button onClick={verificar} disabled={loading}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#a78bfa", color: "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "…" : "Verificar"}
          </button>
        </div>

        {/* Resultado */}
        {result && (
          <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: verdictColor(result.verdict) + "22", border: `1px solid ${verdictColor(result.verdict)}55` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: verdictColor(result.verdict), textTransform: "uppercase", letterSpacing: 1 }}>
                  {result.verdict === "permitido" ? "✓ PERMITIDO" : result.verdict === "advertencia" ? "⚠ ADVERTENCIA" : "✗ RECHAZADO"}
                </div>
                {result.trabajador && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 6 }}>
                    {result.trabajador.nombre} · CC {result.trabajador.cedula}
                    {result.trabajador.cargo && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginLeft: 8 }}>({result.trabajador.cargo})</span>}
                  </div>
                )}
                {result.contratista && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                    {result.contratista.nombre_display}
                  </div>
                )}
                {result.motivos.length > 0 && (
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
                    {result.motivos.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button onClick={registrarIngreso} disabled={saving}
                  style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: verdictColor(result.verdict), color: "#fff", fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Guardando…" : `Registrar ${result.verdict === "permitido" ? "ingreso" : "rechazo"}`}
                </button>
                <button onClick={() => { setResult(null); setInputCode(""); }}
                  style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 11, cursor: "pointer" }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 8, textAlign: "center" }}>
          Para escanear QR o ver historial completo, abre el módulo <strong>Muelle Contratistas</strong>.
        </div>
      </div>

      {/* Lista de ingresos del día */}
      {ingresos.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "10px 0 0 4px", fontStyle: "italic" }}>
          Aún no hay ingresos de contratistas
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ingresos.map(i => (
            <div key={i.id} style={{ background: B.navyMid, borderRadius: 10, padding: "10px 14px", borderLeft: `3px solid ${verdictColor(i.resultado)}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                  {i.nombre || "Sin nombre"} {i.cedula && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>· CC {i.cedula}</span>}
                </div>
                {i.empresa && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{i.empresa}</div>}
                {i.motivo && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2, fontStyle: "italic" }}>{i.motivo}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: verdictColor(i.resultado), textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {i.resultado === "permitido" ? "✓ Permitido" : i.resultado === "advertencia" ? "⚠ Advertencia" : "✗ Rechazado"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                  {i.created_at ? new Date(i.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
