import { useState, useEffect, useCallback } from "react";
import { B, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { logAccion } from "../lib/logAccion";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navyLight, border: `1px solid rgba(255,255,255,0.1)`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

const fmtHora = (h) => h ? h.slice(0, 5) : "—";

// "08:30" → "8:30 AM" · "16:30" → "4:30 PM"
const fmtHora12 = (h) => {
  if (!h || h === "—") return "—";
  const [H, M] = String(h).slice(0, 5).split(":").map(Number);
  if (isNaN(H)) return "—";
  const ampm = H >= 12 ? "PM" : "AM";
  const h12 = H % 12 === 0 ? 12 : H % 12;
  return `${h12}:${String(M || 0).padStart(2, "0")} ${ampm}`;
};
// Las salidas se nombran por su HORA, no "Primera/Segunda Salida".
const labelSalida = (s) => s ? `Salida ${fmtHora12(s.hora)}` : "Salida";

// Departure times per salida
const HORARIO_REGRESO = {
  S1: "15:30",
  S2: "16:30",
  S3: "17:30",
  S4: "18:30",
};

// ─── Tarjeta de reserva individual ───────────────────────────────────────────
const SEL = { background: B.navyLight, color: "#fff", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 11, padding: "4px 6px", outline: "none", maxWidth: 150 };

function ReservaRow({ r, isMobile, salidas = [], embarcaciones = [], onReasignar, zarpado, onDragStart, onDragEnd, embsHoy = [], salidasOpen = [] }) {
  const emb = r.embarcacion_asignada;
  const [editing, setEditing] = useState(false);
  const propiaEmb = embarcaciones.find(x => x.nombre === emb)?.propiedad === "propia";
  // Solo mostrar opciones que existen HOY y que son distintas a la actual.
  const embNamesHoy = [...new Set((embsHoy || []).filter(Boolean))];
  const otrasEmb = embNamesHoy.filter(n => n !== emb);
  const otrasSal = (salidasOpen || []).filter(s => s.id !== r.salida_id);
  const puedeCambiarEmb = otrasEmb.length > 0 || !emb;     // hay otro barco, o falta asignar
  const puedeCambiarSal = otrasSal.length > 0;             // hay otra salida abierta
  const hayAlternativas = puedeCambiarEmb || puedeCambiarSal;
  return (
    <div
      draggable={!zarpado}
      onDragStart={!zarpado && onDragStart ? (e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(r); } : undefined}
      onDragEnd={onDragEnd}
      style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap",
      cursor: zarpado ? "default" : "grab",
    }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
        {r.estado === "check_in" || r.checkin_at ? "✓" : "·"}
      </div>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.nombre}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1, display: "flex", gap: 10 }}>
          <span>👥 {r.pax_a || r.pax || 1}A{r.pax_n > 0 ? ` + ${r.pax_n}N` : ""}</span>
          {r.canal && <span>· {r.canal}</span>}
          {r.aliado_id && <span>· 🤝 Agencia</span>}
        </div>
      </div>
      {zarpado ? (
        emb && (
          <div style={{ fontSize: 11, background: B.sky + "22", color: B.sky, padding: "3px 10px", borderRadius: 20, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
            ⛵ {emb}
          </div>
        )
      ) : editing ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
          {puedeCambiarEmb && (
            <select value={emb || ""} title="Embarcación" autoFocus
              onChange={e => onReasignar && onReasignar(r, { embarcacion_asignada: e.target.value || null })}
              style={SEL}>
              <option value="">⛵ Sin embarcación</option>
              {embNamesHoy.map(n => {
                const p = embarcaciones.find(x => x.nombre === n)?.propiedad === "propia";
                return <option key={n} value={n}>{n}{p ? " ★" : ""}</option>;
              })}
            </select>
          )}
          {puedeCambiarSal && (
            <select value={r.salida_id || ""} title="Horario / salida (solo abiertas)"
              onChange={e => onReasignar && onReasignar(r, { salida_id: e.target.value })}
              style={SEL}>
              {salidasOpen.map(s => <option key={s.id} value={s.id}>Salida {fmtHora12(s.hora_regreso || HORARIO_REGRESO[s.id])}</option>)}
            </select>
          )}
          {!hayAlternativas && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>No hay otras opciones para hoy</span>
          )}
          <button onClick={() => setEditing(false)} title="Listo"
            style={{ background: B.success, border: "none", color: "#fff", borderRadius: 8, fontSize: 11, padding: "5px 10px", fontWeight: 700, cursor: "pointer" }}>✓ Listo</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {emb
            ? <span style={{ fontSize: 11, background: B.sky + "22", color: B.sky, padding: "3px 10px", borderRadius: 20, fontWeight: 600, whiteSpace: "nowrap" }}>⛵ {emb}{propiaEmb ? " ★" : ""}</span>
            : <span style={{ fontSize: 11, background: B.warning + "22", color: B.warning, padding: "3px 10px", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap" }}>⚠ Sin embarcación</span>}
          {hayAlternativas && (
            <button onClick={() => setEditing(true)} title="Cambiar embarcación u horario"
              style={{ background: "transparent", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.7)", borderRadius: 8, fontSize: 11, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>✎ Cambiar</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Bloque por salida ────────────────────────────────────────────────────────
function SalidaBloque({ salida, reservas, zarpoAt, onZarpo, isMobile, salidas = [], embarcacionesAll = [], onReasignar, onEditCap, embsHoy = [], salidasOpen = [] }) {
  const capDe = (nombre) => {
    const e = embarcacionesAll.find(x => x.nombre === nombre);
    return e && e.capacidad != null ? Number(e.capacidad) : null;
  };
  const [dragR, setDragR] = useState(null);          // reserva en arrastre
  const [overEmb, setOverEmb] = useState(undefined); // grupo bajo el cursor (drop highlight)
  const [extraEmbs, setExtraEmbs] = useState([]);    // embarcaciones agregadas sin pax aún
  const horaRegreso = salida.hora_regreso || HORARIO_REGRESO[salida.id] || "—";
  const paxTotal = reservas.reduce((t, r) => t + (r.pax_a || r.pax || 1) + (r.pax_n || 0), 0);
  const conCheckin = reservas.filter(r => r.checkin_at || r.estado === "check_in").length;

  // Agrupar por embarcacion asignada
  const embGrupos = {};
  reservas.forEach(r => {
    const k = r.embarcacion_asignada || "__sin__";
    if (!embGrupos[k]) embGrupos[k] = [];
    embGrupos[k].push(r);
  });
  const embarcaciones = Object.keys(embGrupos).filter(k => k !== "__sin__");
  const sinEmb = embGrupos["__sin__"] || [];
  const paxDe = (rs) => (rs || []).reduce((t, r) => t + (r.pax_a || r.pax || 1) + (r.pax_n || 0), 0);
  const paxSin = paxDe(sinEmb);
  const paxAsig = paxTotal - paxSin;

  const zarpado = !!zarpoAt;
  const ahoraMin = (() => {
    const now = new Date();
    const bog = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
    return bog.getHours() * 60 + bog.getMinutes();
  })();
  const [hh, mm] = (horaRegreso || "99:99").split(":").map(Number);
  const minRegreso = hh * 60 + mm;
  const proxima = Math.abs(ahoraMin - minRegreso) <= 30 && !zarpado;

  return (
    <div style={{
      background: B.navyMid,
      borderRadius: 16,
      marginBottom: 20,
      border: zarpado
        ? `1px solid ${B.success}33`
        : proxima
          ? `1px solid ${B.warning}66`
          : "1px solid rgba(255,255,255,0.07)",
      overflow: "hidden",
    }}>
      {/* Cabecera */}
      <div style={{
        padding: "16px 20px",
        background: zarpado ? B.success + "18" : proxima ? B.warning + "12" : "rgba(255,255,255,0.03)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 18, fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: 0.5, color: zarpado ? B.success : "#fff" }}>
              {zarpado ? "✓ " : proxima ? "🔔 " : "⛵ "}Salida {fmtHora12(horaRegreso)}
            </span>
            {proxima && !zarpado && (
              <span style={{ fontSize: 11, background: B.warning + "33", color: B.warning, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>PRÓXIMA SALIDA</span>
            )}
            {zarpado && (
              <span style={{ fontSize: 11, background: B.success + "33", color: B.success, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>ZARPÓ ✓</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <span>⛵ Hora de salida: <strong style={{ color: B.sky }}>{fmtHora12(horaRegreso)}</strong></span>
            <span>👥 {paxTotal} pax{reservas.length > 1 ? ` · ${reservas.length} reservas` : ""}</span>
            {conCheckin > 0 && <span style={{ color: B.success }}>✓ {conCheckin} con check-in</span>}
            {embarcaciones.length > 0 && (
              <span>⛵ {embarcaciones.map(e => `${e} (${paxDe(embGrupos[e])})`).join(" · ")}</span>
            )}
            {paxSin > 0 && <span style={{ color: B.warning }}>⚠ {paxSin} sin embarcación</span>}
          </div>
        </div>

        {!zarpado ? (
          <button
            onClick={onZarpo}
            style={{
              padding: "9px 18px", borderRadius: 10, border: "none", cursor: "pointer",
              background: proxima ? B.warning : B.success,
              color: proxima ? B.navy : "#fff",
              fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", flexShrink: 0,
            }}>
            ✓ Marcar zarpado
          </button>
        ) : (
          <div style={{ fontSize: 11, color: B.success, fontWeight: 600 }}>
            Zarpó {zarpoAt ? `a las ${fmtHora(zarpoAt)}` : ""}
          </div>
        )}
      </div>

      {/* Lista de clientes — arrastra una tarjeta a otra embarcación */}
      <div>
        {(() => {
          const gruposVacios = extraEmbs.filter(e => !embarcaciones.includes(e));
          const dropProps = (emb) => zarpado ? {} : {
            onDragOver: (e) => { e.preventDefault(); if (overEmb !== emb) setOverEmb(emb); },
            onDragLeave: () => setOverEmb(u => (u === emb ? undefined : u)),
            onDrop: () => {
              if (dragR && (dragR.embarcacion_asignada || null) !== (emb || null)) {
                onReasignar(dragR, { embarcacion_asignada: emb });
              }
              setDragR(null); setOverEmb(undefined);
            },
          };
          const startProps = {
            onDragStart: setDragR,
            onDragEnd: () => { setDragR(null); setOverEmb(undefined); },
          };
          const Grupo = ({ emb, rows }) => {
            const paxEmb = rows.reduce((t, r) => t + (r.pax_a || r.pax || 1) + (r.pax_n || 0), 0);
            const cap = capDe(emb);
            const propia = embarcacionesAll.find(x => x.nombre === emb)?.propiedad === "propia";
            const excede = cap != null && paxEmb > cap;
            const isOver = overEmb === emb && dragR;
            return (
              <div key={emb} {...dropProps(emb)}
                style={{ outline: isOver ? `2px dashed ${B.sky}` : "none", outlineOffset: -2, background: isOver ? B.sky + "10" : "transparent", transition: "background .1s" }}>
                <div style={{ padding: "8px 14px 4px", fontSize: 10, color: excede ? B.danger : B.sky, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", background: (excede ? B.danger : B.sky) + "08", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>⛵ {emb}{propia ? " ★" : ""} · {paxEmb} pax{cap != null ? ` / cap ${cap}` : ""}{excede ? " ⚠ EXCEDE" : ""}</span>
                  {!zarpado && onEditCap && (
                    <button onClick={() => onEditCap(emb, cap)} title="Editar capacidad de esta embarcación"
                      style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 11, padding: 0 }}>✎ capacidad</button>
                  )}
                </div>
                {rows.length === 0
                  ? <div style={{ padding: "12px 14px", fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>Arrastra pasajeros aquí…</div>
                  : rows.map(r => <ReservaRow key={r.id} r={r} isMobile={isMobile} salidas={salidas} embarcaciones={embarcacionesAll} onReasignar={onReasignar} zarpado={zarpado} embsHoy={embsHoy} salidasOpen={salidasOpen} {...startProps} />)}
              </div>
            );
          };
          return (
            <>
              {embarcaciones.map(emb => <Grupo key={emb} emb={emb} rows={embGrupos[emb]} />)}
              {gruposVacios.map(emb => <Grupo key={emb} emb={emb} rows={[]} />)}

              {/* Sin embarcación — también es zona de drop (para desasignar) */}
              {(sinEmb.length > 0 || (!zarpado && embarcaciones.length > 0)) && (
                <div {...dropProps(null)}
                  style={{ outline: (overEmb === null && dragR) ? `2px dashed ${B.warning}` : "none", outlineOffset: -2, background: (overEmb === null && dragR) ? B.warning + "10" : "transparent" }}>
                  {embarcaciones.length > 0 && (
                    <div style={{ padding: "8px 14px 4px", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Sin embarcación asignada
                    </div>
                  )}
                  {sinEmb.length === 0
                    ? <div style={{ padding: "10px 14px", fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>(suelta aquí para quitar embarcación)</div>
                    : sinEmb.map(r => <ReservaRow key={r.id} r={r} isMobile={isMobile} salidas={salidas} embarcaciones={embarcacionesAll} onReasignar={onReasignar} zarpado={zarpado} embsHoy={embsHoy} salidasOpen={salidasOpen} {...startProps} />)}
                </div>
              )}

              {/* Agregar embarcación a esta salida */}
              {!zarpado && (
                <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>➕ Agregar embarcación:</span>
                  <select value="" style={SEL}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      if (v === "__manual__") {
                        const n = window.prompt("Nombre de la embarcación (manual):");
                        if (n && n.trim() && !embarcaciones.includes(n.trim())) setExtraEmbs(p => [...new Set([...p, n.trim()])]);
                      } else if (!embarcaciones.includes(v)) {
                        setExtraEmbs(p => [...new Set([...p, v])]);
                      }
                    }}>
                    <option value="">— elegir —</option>
                    {embarcacionesAll.filter(em => !embarcaciones.includes(em.nombre) && !extraEmbs.includes(em.nombre))
                      .map(em => <option key={em.nombre} value={em.nombre}>{em.nombre}{em.propiedad === "propia" ? " ★" : ""}{em.capacidad != null ? ` (cap ${em.capacidad})` : ""}</option>)}
                    <option value="__manual__">+ Otra (manual)…</option>
                  </select>
                </div>
              )}

              {reservas.length === 0 && extraEmbs.length === 0 && (
                <div style={{ padding: "16px 20px", fontSize: 12, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
                  Sin reservas para esta salida
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─── MAIN MODULE ─────────────────────────────────────────────────────────────
export default function MuelleSalidas() {
  const { isMobile } = useMobile();
  const [fecha, setFecha] = useState(todayStr());

  const [salidas,  setSalidas]  = useState([]);
  const [reservas, setReservas] = useState([]);
  const [zarpos,   setZarpos]   = useState({}); // { salida_id: hora_real }
  const [zarpesFlota, setZarpesFlota] = useState([]); // zarpes de Castillete/Naturalle
  const [lanchas, setLanchas] = useState([]); // para lookup de costo_viaje_sencillo
  const [embarcacionesAll, setEmbarcacionesAll] = useState([]); // master: nombre, capacidad, propiedad
  const [loading,  setLoading]  = useState(false);
  const [modalZarpe, setModalZarpe] = useState(null); // { embarcacion }
  const [expandidas, setExpandidas] = useState(() => new Set()); // salidas vacías expandidas a bloque

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [{ data: sals }, { data: res }, { data: zrps }, { data: zfl }, { data: lch }, { data: embs }] = await Promise.all([
      supabase.from("salidas").select("id, nombre, hora, hora_regreso, activo").eq("activo", true).order("hora"),
      supabase.from("reservas")
        .select("id, nombre, salida_id, pax, pax_a, pax_n, estado, canal, aliado_id, checkin_at, embarcacion_asignada")
        .eq("fecha", fecha)
        .neq("estado", "cancelado")
        .neq("estado", "no_show")
        .order("nombre"),
      supabase.from("muelle_salidas").select("salida_id, hora_real, estado").eq("fecha", fecha).eq("estado", "zarpo"),
      supabase.from("muelle_zarpes_flota").select("*").eq("fecha", fecha).order("hora_zarpe"),
      supabase.from("lanchas").select("nombre, costo_viaje_sencillo").eq("activo", true),
      supabase.from("embarcaciones").select("nombre, capacidad, estado, propiedad").eq("estado", "activo").order("nombre"),
    ]);
    setSalidas(sals || []);
    setReservas(res || []);
    setEmbarcacionesAll(embs || []);
    // Build zarpos map { salida_id → hora_real }
    const zm = {};
    (zrps || []).forEach(z => { zm[z.salida_id] = z.hora_real || true; });
    setZarpos(zm);
    setZarpesFlota(zfl || []);
    setLanchas(lch || []);
    setLoading(false);
  }, [fecha]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const guardarZarpeFlota = async (data) => {
    if (!supabase) return;
    const id = `ZF-${Date.now().toString(36).toUpperCase()}`;
    const lancha = lanchas.find(l => l.nombre === data.embarcacion);

    // Validación de motores: si la lancha tiene motor crítico vencido sin
    // autorización vigente, bloquear el zarpe (a menos que el supervisor
    // confirme con autorización previa)
    if (lancha?.id) {
      try {
        const { data: chk } = await supabase.rpc("lancha_puede_operar", { p_lancha_id: lancha.id });
        if (chk && chk.puede_operar === false) {
          const motivos = (chk.motivos || []).map(m => `· ${m.codigo}: ${m.estado} a ${m.horas_actuales}h`).join("\n");
          const ok = confirm(
            `🚨 BLOQUEO OPERATIVO\n\n${data.embarcacion} tiene mantenimiento crítico vencido en:\n${motivos}\n\n` +
            `No debería operar sin autorización gerencial.\n\n` +
            `¿Continuar de todas formas? (Acción quedará registrada)`
          );
          if (!ok) return new Error("Zarpe bloqueado por motor crítico");
        }
      } catch (_) { /* función puede no existir todavía si la migration no corrió, no bloquear */ }
    }

    const costoAuto = Number(lancha?.costo_viaje_sencillo) || 0;
    // Si va a Boca Chica → costo 0 SIEMPRE (no es un viaje real).
    const costoOperativo = data.boca_chica
      ? 0
      : (data.costo_operativo != null && data.costo_operativo !== ""
        ? Number(data.costo_operativo)
        : costoAuto);
    const insertPayload = {
      id,
      fecha,
      embarcacion: data.embarcacion,
      hora_zarpe: data.hora_zarpe || new Date().toTimeString().slice(0, 8),
      motivo: data.motivo,
      pax_a: Number(data.pax_a) || 0,
      pax_n: Number(data.pax_n) || 0,
      costo_operativo: costoOperativo,
      notas: data.notas || null,
      boca_chica: !!data.boca_chica,
    };
    if (data.odometro_foto_url) insertPayload.odometro_foto_url = data.odometro_foto_url;
    if (data.motores_horas) insertPayload.motores_horas = data.motores_horas;
    const { error } = await supabase.from("muelle_zarpes_flota").insert(insertPayload);
    if (!error) {
      setModalZarpe(null);
      fetchData();
    }
    return error;
  };

  const borrarZarpeFlota = async (id) => {
    if (!supabase) return;
    if (!confirm("¿Eliminar este zarpe?")) return;
    await supabase.from("muelle_zarpes_flota").delete().eq("id", id);
    fetchData();
  };

  // Reasignar embarcación y/o salida(horario) de una reserva. Valida cupo
  // contra embarcaciones.capacidad y deja auditoría de quién lo hizo.
  const reasignar = async (r, patch) => {
    if (!supabase) return;
    // Validar cupo si se está asignando una embarcación
    const nuevaEmb = "embarcacion_asignada" in patch ? patch.embarcacion_asignada : r.embarcacion_asignada;
    const nuevaSal = "salida_id" in patch ? patch.salida_id : r.salida_id;
    if (nuevaEmb) {
      const em = embarcacionesAll.find(x => x.nombre === nuevaEmb);
      const cap = em && em.capacidad != null ? Number(em.capacidad) : null;
      if (cap != null) {
        const paxOtros = (reservas || [])
          .filter(x => x.id !== r.id && x.salida_id === nuevaSal && x.embarcacion_asignada === nuevaEmb)
          .reduce((t, x) => t + (x.pax_a || x.pax || 1) + (x.pax_n || 0), 0);
        const paxEsta = (r.pax_a || r.pax || 1) + (r.pax_n || 0);
        if (paxOtros + paxEsta > cap) {
          alert(`⚠️ Sin cupo: ${nuevaEmb} tiene capacidad ${cap} y quedaría en ${paxOtros + paxEsta} pax para esa salida.\n\nAjusta la capacidad (✎) o usa otra embarcación.`);
          return;
        }
      }
    }
    const datosAntes = { embarcacion_asignada: r.embarcacion_asignada || null, salida_id: r.salida_id };
    const upd = { updated_at: new Date().toISOString(), ...patch };
    const { error } = await supabase.from("reservas").update(upd).eq("id", r.id);
    if (error) { alert("Error al reasignar: " + error.message); return; }
    const accion = "salida_id" in patch && !("embarcacion_asignada" in patch) ? "cambiar_salida" : "reasignar_embarcacion";
    logAccion({
      modulo: "salidas", accion, tabla: "reservas", registroId: r.id,
      datosAntes, datosDespues: { ...datosAntes, ...patch },
      notas: `${r.nombre}: ${accion === "cambiar_salida"
        ? `salida ${datosAntes.salida_id} → ${patch.salida_id}`
        : `embarcación "${datosAntes.embarcacion_asignada || "—"}" → "${patch.embarcacion_asignada || "—"}"`}`,
    });
    fetchData();
  };

  // Editar capacidad de una embarcación (manual por embarcación) + auditoría.
  const editarCapacidad = async (nombre, capActual) => {
    if (!supabase) return;
    const val = window.prompt(`Capacidad (pax) de "${nombre}":`, capActual != null ? String(capActual) : "");
    if (val == null) return;
    const cap = parseInt(val, 10);
    if (isNaN(cap) || cap < 0) { alert("Capacidad inválida."); return; }
    const { error } = await supabase.from("embarcaciones").update({ capacidad: cap, updated_at: new Date().toISOString() }).eq("nombre", nombre);
    if (error) { alert("Error: " + error.message); return; }
    logAccion({ modulo: "salidas", accion: "editar_capacidad_embarcacion", tabla: "embarcaciones", registroId: nombre,
      datosAntes: { capacidad: capActual }, datosDespues: { capacidad: cap }, notas: `${nombre}: capacidad ${capActual ?? "—"} → ${cap}` });
    fetchData();
  };

  const marcarZarpo = async (salidaId) => {
    if (!supabase) return;
    const horaReal = new Date().toTimeString().slice(0, 5);
    // Upsert — one record per salida/date
    const id = `MS-${salidaId}-${fecha}`;
    await supabase.from("muelle_salidas").upsert({
      id,
      fecha,
      salida_id: salidaId,
      hora_real: horaReal,
      estado: "zarpo",
      pax_a: 0, pax_n: 0, pax_total: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    setZarpos(prev => ({ ...prev, [salidaId]: horaReal }));

    // Si la salida lleva embarcación(es) PROPIA(s), registrar también el
    // zarpe en el módulo Lancha (muelle_zarpes_flota), una vez por embarcación.
    try {
      const salObj = (salidas || []).find(s => s.id === salidaId);
      const resSal = (reservas || []).filter(r => r.salida_id === salidaId && r.embarcacion_asignada);
      const porEmb = {};
      resSal.forEach(r => { (porEmb[r.embarcacion_asignada] = porEmb[r.embarcacion_asignada] || []).push(r); });
      for (const [emb, rs] of Object.entries(porEmb)) {
        const meta = embarcacionesAll.find(x => x.nombre === emb);
        if (!meta || meta.propiedad !== "propia") continue;
        const marker = `[salida:${salidaId}]`;
        const yaExiste = (zarpesFlota || []).some(z => z.embarcacion === emb && (z.notas || "").includes(marker));
        if (yaExiste) continue;
        const paxA = rs.reduce((t, r) => t + (r.pax_a || r.pax || 1), 0);
        const paxN = rs.reduce((t, r) => t + (r.pax_n || 0), 0);
        const costo = Number((lanchas.find(l => l.nombre === emb) || {}).costo_viaje_sencillo) || 0;
        const zfId = `ZF-${Date.now().toString(36).toUpperCase()}-${emb.replace(/\W/g, "").slice(0, 4)}`;
        await supabase.from("muelle_zarpes_flota").insert({
          id: zfId, fecha, embarcacion: emb,
          hora_zarpe: new Date().toTimeString().slice(0, 8),
          motivo: "pasajeros",
          pax_a: paxA, pax_n: paxN, costo_operativo: costo,
          notas: `Auto desde Salidas · ${salObj ? labelSalida(salObj) : salidaId} ${marker}`,
          boca_chica: false,
        });
        logAccion({ modulo: "salidas", accion: "zarpe_flota_auto", tabla: "muelle_zarpes_flota", registroId: zfId,
          datosDespues: { embarcacion: emb, salida_id: salidaId, pax_a: paxA, pax_n: paxN, costo_operativo: costo },
          notas: `Zarpe propia auto-registrado en Lancha: ${emb} (${salObj ? labelSalida(salObj) : salidaId})` });
      }
      fetchData();
    } catch (e) { /* no romper el zarpado si falla el registro en Lancha */ }
  };

  const normHora = (h) => {
    const m = String(h || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const H = Number(m[1]), M = Number(m[2]);
    if (H > 23 || M > 59) return null;
    return `${String(H).padStart(2, "0")}:${m[2]}`;
  };

  const agregarSalida = async () => {
    if (!supabase) return;
    const hIn = window.prompt("Hora de SALIDA del muelle (HH:MM, 24h). Ej: 14:00");
    if (hIn == null) return;
    const hora = normHora(hIn);
    if (!hora) { alert("Hora inválida. Usa HH:MM 24h (ej. 14:00)."); return; }
    const rIn = window.prompt("Hora de REGRESO al muelle (HH:MM, 24h). Ej: 20:00");
    if (rIn == null) return;
    const horaRegreso = normHora(rIn);
    if (!horaRegreso) { alert("Hora de regreso inválida. Usa HH:MM 24h."); return; }
    const id = `S-${Date.now().toString(36).toUpperCase()}`;
    const { error } = await supabase.from("salidas").insert({
      id, nombre: `Salida ${hora}`, hora, hora_regreso: horaRegreso, activo: true,
    });
    if (error) { alert("Error al crear salida: " + error.message); return; }
    logAccion({ modulo: "salidas", accion: "crear_salida", tabla: "salidas", registroId: id,
      datosDespues: { hora, hora_regreso: horaRegreso }, notas: `Nueva salida ${hora} → regreso ${horaRegreso}` });
    setExpandidas(prev => new Set([...prev, id]));
    fetchData();
  };

  // Salidas that have reservas today (or all if no reservas yet)
  const reservasPorSalida = {};
  (reservas || []).forEach(r => {
    if (!reservasPorSalida[r.salida_id]) reservasPorSalida[r.salida_id] = [];
    reservasPorSalida[r.salida_id].push(r);
  });

  const salidasConRes = (salidas || []).filter(s => reservasPorSalida[s.id]?.length > 0);
  const salidasVacias = (salidas || []).filter(s => !reservasPorSalida[s.id]?.length);
  // Bloques completos = con reservas o expandidas manualmente (para asignar
  // embarcaciones aunque no tengan reservas, ej. salida recién creada).
  const salidasFull  = (salidas || []).filter(s => reservasPorSalida[s.id]?.length > 0 || expandidas.has(s.id));
  const salidasChips = (salidas || []).filter(s => !reservasPorSalida[s.id]?.length && !expandidas.has(s.id));
  // Opciones reales de HOY para el botón "Cambiar":
  //  - embarcaciones efectivamente en uso hoy (asignadas a alguna reserva)
  //  - salidas que están operando hoy y aún NO han zarpado (abiertas)
  const embsHoy = [...new Set((reservas || []).map(r => r.embarcacion_asignada).filter(Boolean))];
  const salidasOpen = salidasFull.filter(s => !zarpos[s.id]);

  // KPIs
  const totalPax    = reservas.reduce((t, r) => t + (r.pax_a || r.pax || 1) + (r.pax_n || 0), 0);
  const conCheckin  = reservas.filter(r => r.checkin_at || r.estado === "check_in").length;
  const nZarpos     = Object.keys(zarpos).length;
  const pendientes  = salidasConRes.filter(s => !zarpos[s.id]).length;

  return (
    <div style={{ padding: isMobile ? "16px 12px" : "24px", fontFamily: "'Inter','Segoe UI',sans-serif", color: "#e2e8f0", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "#fff" }}>⛵ Salidas de Isla</h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Programación automática de zarpes · Tierra Bomba</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={agregarSalida}
            style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: B.sky, color: B.navy, fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
            ➕ Agregar salida
          </button>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ ...IS, width: "auto", fontSize: 14, padding: "8px 14px" }} />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 10, marginBottom: 24 }}>
        {[
          { label: "Pax en isla",    value: totalPax,    color: B.sky },
          { label: "Con check-in",   value: conCheckin,  color: B.success },
          { label: "Grupos zarpados", value: nZarpos,    color: B.sand },
          { label: "Pendientes",      value: pendientes, color: pendientes > 0 ? B.warning : "rgba(255,255,255,0.3)" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Cargando...</div>
      ) : (
        <>
          {salidasFull.length === 0 && (
            <div style={{ textAlign: "center", padding: "50px 0", color: "rgba(255,255,255,0.2)", fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⛵</div>
              No hay reservas para este día
            </div>
          )}

          {salidasFull.map(sal => (
            <SalidaBloque
              key={sal.id}
              salida={sal}
              reservas={reservasPorSalida[sal.id] || []}
              zarpoAt={zarpos[sal.id]}
              onZarpo={() => marcarZarpo(sal.id)}
              isMobile={isMobile}
              salidas={salidas}
              embarcacionesAll={embarcacionesAll}
              onReasignar={reasignar}
              onEditCap={editarCapacidad}
              embsHoy={embsHoy}
              salidasOpen={salidasOpen}
            />
          ))}

          {/* ═══ Zarpes de flota (Castillete / Naturalle) ═══ */}
          <div style={{ marginTop: 30, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                  ⛵ Zarpes de flota a Cartagena
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  Cada vez que Castillete, Naturalle o Blue Apple salen de la isla. Pasajeros, tripulación, vacío, provisiones…
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setModalZarpe({ embarcacion: "Castillete" })}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: B.navyMid, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  + Castillete
                </button>
                <button onClick={() => setModalZarpe({ embarcacion: "Naturalle" })}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: B.navyMid, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  + Naturalle
                </button>
                <button onClick={() => setModalZarpe({ embarcacion: "Blue Apple" })}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: B.navyMid, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  + Blue Apple
                </button>
                <button onClick={() => {
                  const nombre = window.prompt("Nombre de la embarcación:");
                  if (nombre && nombre.trim()) setModalZarpe({ embarcacion: nombre.trim() });
                }}
                  style={{ padding: "9px 14px", borderRadius: 10, border: `1px dashed ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  + Otra
                </button>
              </div>
            </div>
            {zarpesFlota.length === 0 ? (
              <div style={{ padding: 20, background: B.navyMid, borderRadius: 10, textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                Sin zarpes registrados hoy.
              </div>
            ) : (
              <div style={{ background: B.navyMid, borderRadius: 10, overflow: "hidden" }}>
                {zarpesFlota.map(z => (
                  <div key={z.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}>
                    <span style={{ fontSize: 18 }}>⛵</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{z.embarcacion}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                        <span>🕐 {fmtHora(z.hora_zarpe)}</span>
                        <span>· {z.motivo}</span>
                        {(z.pax_a + z.pax_n) > 0 && <span>· 👥 {z.pax_a}A{z.pax_n ? ` + ${z.pax_n}N` : ""}</span>}
                        {z.notas && <span>· {z.notas}</span>}
                      </div>
                    </div>
                    <button onClick={() => borrarZarpeFlota(z.id)}
                      style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 14, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Salidas sin reservas (colapsadas) */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              {salidasChips.length > 0 ? "Sin reservas hoy · toca para asignar embarcaciones" : "Salidas"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={agregarSalida}
                title="Crear una salida con hora manual (la que quieras)"
                style={{ background: B.sky, border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 12, color: B.navy, fontWeight: 800, cursor: "pointer" }}>
                ➕ Agregar salida (hora manual)
              </button>
              {salidasChips.map(s => (
                <button key={s.id}
                  onClick={() => setExpandidas(prev => new Set([...prev, s.id]))}
                  title="Expandir para asignar embarcaciones"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "rgba(255,255,255,0.45)", cursor: "pointer" }}>
                  ➕ Salida {fmtHora12(s.hora_regreso || HORARIO_REGRESO[s.id])}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {modalZarpe && (
        <ModalZarpeFlota
          embarcacion={modalZarpe.embarcacion}
          costoDefault={Number(lanchas.find(l => l.nombre === modalZarpe.embarcacion)?.costo_viaje_sencillo) || 0}
          onClose={() => setModalZarpe(null)}
          onSave={guardarZarpeFlota}
        />
      )}
    </div>
  );
}

function ModalZarpeFlota({ embarcacion, costoDefault = 0, onClose, onSave }) {
  const [f, setF] = useState({
    embarcacion,
    hora_zarpe: new Date().toTimeString().slice(0, 5),
    motivo: "pasajeros",
    pax_a: 0,
    pax_n: 0,
    costo_operativo: costoDefault,
    notas: "",
    horas_babor: "",
    horas_estribor: "",
    horas_centro: "",
    boca_chica: false, // ← cuando va a Boca Chica no cuenta como viaje
  });
  // Cuando se marca/desmarca Boca Chica: forzar costo 0 si está marcado,
  // restaurar el costoDefault si se desmarca.
  useEffect(() => {
    setF(p => p.boca_chica
      ? { ...p, costo_operativo: 0 }
      : (p.costo_operativo === 0 ? { ...p, costo_operativo: costoDefault } : p)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.boca_chica]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [odometroFile, setOdometroFile] = useState(null);
  const [odometroPreview, setOdometroPreview] = useState(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const esNaturalle = (embarcacion || "").toLowerCase().includes("nat");
  const esCastillete = (embarcacion || "").toLowerCase().includes("castillete");
  const esLanchaPropia = esNaturalle || esCastillete;

  async function handleSave() {
    setSaving(true); setErr("");
    // Construir motores_horas
    const motoresHoras = {};
    if (esNaturalle) {
      if (f.horas_babor) motoresHoras.Babor = Number(f.horas_babor);
      if (f.horas_estribor) motoresHoras.Estribor = Number(f.horas_estribor);
    } else if (esCastillete) {
      if (f.horas_centro) motoresHoras.Centro = Number(f.horas_centro);
    }

    // Subir foto de odómetro si existe
    let odometro_foto_url = null;
    if (odometroFile) {
      try {
        const tempId = `odom-zarpe-${Date.now()}`;
        const ext = odometroFile.name.split(".").pop();
        const path = `${tempId}.${ext}`;
        const { data: upData, error: upErr } = await supabase.storage
          .from("muelle-fotos")
          .upload(path, odometroFile, { upsert: true });
        if (!upErr && upData) {
          const { data: urlData } = supabase.storage.from("muelle-fotos").getPublicUrl(path);
          odometro_foto_url = urlData?.publicUrl || null;
        }
      } catch (_) {}
    }

    const enrichedData = {
      ...f,
      odometro_foto_url,
      motores_horas: Object.keys(motoresHoras).length > 0 ? motoresHoras : null,
    };
    const error = await onSave(enrichedData);
    setSaving(false);
    if (error) setErr(error.message || "Error");
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 24, width: 440, maxWidth: "100%" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>⛵ {embarcacion} zarpa a Cartagena</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>Registra el viaje a Cartagena.</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Hora zarpe</label>
            <input type="time" value={f.hora_zarpe} onChange={e => set("hora_zarpe", e.target.value)} style={IS} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Motivo</label>
            <select value={f.motivo} onChange={e => set("motivo", e.target.value)} style={IS}>
              <option value="pasajeros">Pasajeros</option>
              <option value="tripulacion">Tripulación</option>
              <option value="provisiones">Provisiones</option>
              <option value="vacio">Vacío</option>
              <option value="mantenimiento">Mantenimiento</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          {f.motivo === "pasajeros" && (
            <>
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Adultos</label>
                <input type="number" min="0" value={f.pax_a} onChange={e => set("pax_a", e.target.value)} style={IS} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Niños</label>
                <input type="number" min="0" value={f.pax_n} onChange={e => set("pax_n", e.target.value)} style={IS} />
              </div>
            </>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Notas</label>
            <input value={f.notas} onChange={e => set("notas", e.target.value)} placeholder="Observaciones..." style={IS} />
          </div>
          {/* Boca Chica: si la lancha va a Boca Chica para parquear cerca del
              hotel no es un viaje real → costo operativo = 0, no cuenta. */}
          <div style={{ gridColumn: "1 / -1" }}>
            <label
              title="La lancha va a Boca Chica (parqueo cerca del hotel). No cuenta como viaje real, costo operativo = 0."
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 8,
                background: f.boca_chica ? "rgba(56,189,248,0.12)" : B.navyLight,
                border: `1px solid ${f.boca_chica ? B.sky : "rgba(255,255,255,0.08)"}`,
                cursor: "pointer", fontSize: 13,
              }}>
              <input type="checkbox" checked={!!f.boca_chica}
                onChange={e => set("boca_chica", e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer" }} />
              <span style={{ flex: 1, color: f.boca_chica ? B.sky : "#fff", fontWeight: f.boca_chica ? 700 : 500 }}>
                🏝 Va a Boca Chica
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textAlign: "right", lineHeight: 1.3 }}>
                no cuenta<br/>como viaje
              </span>
            </label>
          </div>
        </div>

        {/* Sección odómetro y horas motor — solo Natturale/Castillete (opcional) */}
        {esLanchaPropia && (
          <div style={{ background: B.navy, border: `1px solid ${B.sand}33`, borderRadius: 10, padding: 12, marginTop: 14 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>
              ⚙️ Odómetro y horas motor (opcional)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: esCastillete ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
              {esNaturalle && (
                <>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Horas Babor</label>
                    <input type="number" step="0.1" min="0" value={f.horas_babor}
                      onChange={e => set("horas_babor", e.target.value)} placeholder="ej: 1005" style={IS} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Horas Estribor</label>
                    <input type="number" step="0.1" min="0" value={f.horas_estribor}
                      onChange={e => set("horas_estribor", e.target.value)} placeholder="ej: 1004" style={IS} />
                  </div>
                </>
              )}
              {esCastillete && (
                <div>
                  <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Horas Motor</label>
                  <input type="number" step="0.1" min="0" value={f.horas_centro}
                    onChange={e => set("horas_centro", e.target.value)} placeholder="ej: 250" style={IS} />
                </div>
              )}
            </div>
            {odometroPreview ? (
              <div style={{ position: "relative" }}>
                <img src={odometroPreview} alt="odómetro" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, border: `1px solid rgba(255,255,255,0.12)` }} />
                <button type="button" onClick={() => { setOdometroFile(null); setOdometroPreview(null); }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", fontSize: 12 }}>✕</button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px", borderRadius: 8, border: `2px dashed rgba(255,255,255,0.15)`, background: B.navyLight, cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: 12, boxSizing: "border-box" }}>
                <span style={{ fontSize: 18 }}>📸</span>
                <span>Foto del odómetro</span>
                <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setOdometroFile(file);
                    const reader = new FileReader();
                    reader.onload = (ev) => setOdometroPreview(ev.target.result);
                    reader.readAsDataURL(file);
                  }} />
              </label>
            )}
          </div>
        )}

        {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: "#ef4444", borderRadius: 8, fontSize: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: 11, borderRadius: 10, border: "none", background: B.success, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            {saving ? "Guardando..." : "✓ Registrar zarpe"}
          </button>
        </div>
      </div>
    </div>
  );
}
