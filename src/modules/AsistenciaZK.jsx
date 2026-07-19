// AsistenciaZK.jsx — Módulo de asistencia que recibe punches del
// terminal ZKTeco MB10-T/VC vía ADMS PUSH a /api/zk-iclock.
// ──────────────────────────────────────────────────────────────────
// Vista por día. Cada empleado muestra:
//   - Primer punch (entrada) y último (salida)
//   - Total horas trabajadas calculado
//   - Punches intermedios (breaks)
// Permite linkear punches huérfanos (zk_user_id no enrolado en
// rh_empleados) a un empleado existente.

import { useState, useEffect, useMemo, useCallback } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive";

const todayBog = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const fmtFecha = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" }) : "";
const fmtHora  = (h) => h ? String(h).slice(0, 5) : "—";

// Diferencia en horas entre dos times "HH:MM:SS"
function diffHoras(entrada, salida) {
  if (!entrada || !salida) return 0;
  const toMin = (h) => {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + mm;
  };
  const e = toMin(entrada);
  const s = toMin(salida);
  return Math.max(0, (s - e) / 60);
}

const TIPO_LABEL = {
  entrada:           "🟢 Entrada",
  salida:            "🔴 Salida",
  break_inicio:      "☕ Break inicio",
  break_fin:         "▶️ Break fin",
  overtime_entrada:  "⏰ OT inicio",
  overtime_salida:   "⏰ OT fin",
  auto:              "↔ Marca",
};

const METODO_ICON = {
  huella:   "👆",
  face:     "🙂",
  tarjeta:  "💳",
  pin:      "🔢",
  "huella+pin": "👆🔢",
};

export default function AsistenciaZK() {
  const { isMobile } = useBreakpoint();
  const [tab, setTab] = useState("asistencia"); // asistencia | enrolamiento
  const [fecha, setFecha] = useState(todayBog());
  const [punches, setPunches] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEmpleado, setFiltroEmpleado] = useState("");
  const [linkModal, setLinkModal] = useState(null); // zk_user_id huérfano

  const cargar = useCallback(async () => {
    setLoading(true);
    const [pR, eR] = await Promise.all([
      supabase.from("asistencia_zk")
        .select("*").eq("fecha", fecha)
        .order("timestamp", { ascending: true }),
      supabase.from("rh_empleados")
        .select("id, nombres, apellidos, cedula, cargo, zk_user_id")
        .eq("activo", true).order("nombres"),
    ]);
    setPunches(pR.data || []);
    setEmpleados(eR.data || []);
    setLoading(false);
  }, [fecha]);
  useEffect(() => { cargar(); }, [cargar]);

  // Agrupar punches por empleado (o por zk_user_id si huérfano)
  const filas = useMemo(() => {
    const map = new Map();
    for (const p of punches) {
      const key = p.empleado_id || `ZK:${p.zk_user_id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          empleado_id: p.empleado_id,
          zk_user_id: p.zk_user_id,
          nombre: p.nombre_snapshot || (p.empleado_id ? "" : `(sin enrolar) ${p.zk_user_id}`),
          cedula: p.cedula,
          punches: [],
        });
      }
      map.get(key).punches.push(p);
    }
    // Enriquecer con datos del empleado si existe
    for (const fila of map.values()) {
      if (fila.empleado_id) {
        const emp = empleados.find(e => e.id === fila.empleado_id);
        if (emp) {
          fila.nombre = `${emp.nombres || ""} ${emp.apellidos || ""}`.trim();
          fila.cargo = emp.cargo;
          fila.cedula = emp.cedula;
        }
      }
      // Calcular entrada/salida/horas
      const hs = fila.punches.map(p => p.hora).sort();
      fila.primera = hs[0] || null;
      fila.ultima  = hs[hs.length - 1] || null;
      fila.horas   = (fila.primera && fila.ultima && fila.primera !== fila.ultima)
        ? diffHoras(fila.primera, fila.ultima)
        : 0;
      fila.huerfano = !fila.empleado_id;
    }
    let arr = [...map.values()].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    if (filtroEmpleado) {
      const q = filtroEmpleado.toLowerCase();
      arr = arr.filter(f =>
        (f.nombre || "").toLowerCase().includes(q) ||
        (f.cedula || "").toLowerCase().includes(q) ||
        (f.zk_user_id || "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [punches, empleados, filtroEmpleado]);

  // KPIs del día
  const kpis = useMemo(() => {
    return {
      total_punches: punches.length,
      empleados:     filas.filter(f => !f.huerfano).length,
      huerfanos:     filas.filter(f => f.huerfano).length,
      horas_total:   filas.reduce((s, f) => s + (f.horas || 0), 0),
    };
  }, [filas, punches]);

  return (
    <div style={{ padding: isMobile ? 14 : 20, color: B.white }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>👆 Asistencia · ZKTeco</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            Punches en tiempo real desde el terminal del muelle
          </div>
        </div>
        {tab === "asistencia" && (
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white, fontSize: 13 }} />
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${B.navyLight}` }}>
        {[
          ["asistencia",   "📅 Asistencia del día"],
          ["enrolamiento", "👤 Enrolamiento"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${tab === k ? B.sky : "transparent"}`,
              color: tab === k ? B.sky : "rgba(255,255,255,0.5)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 120ms",
            }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "enrolamiento" ? (
        <TabEnrolamiento empleados={empleados} onReload={cargar} isMobile={isMobile} />
      ) : (
      <>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Empleados",     v: kpis.empleados,                                    c: B.sky },
          { l: "Punches total", v: kpis.total_punches,                                c: B.sand },
          { l: "Horas total",   v: kpis.horas_total.toFixed(1) + " h",                c: B.success },
          { l: "Sin enrolar",   v: kpis.huerfanos, c: kpis.huerfanos > 0 ? B.warning : "rgba(255,255,255,0.3)" },
        ].map(k => (
          <div key={k.l} style={{ background: B.navyMid, borderRadius: 10, padding: 12, borderLeft: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{k.l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.c, marginTop: 2 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {kpis.huerfanos > 0 && (
        <div style={{ marginBottom: 14, padding: 12, background: B.warning + "22", border: `1px solid ${B.warning}55`, borderRadius: 8, fontSize: 12, color: B.warning }}>
          ⚠ Hay {kpis.huerfanos} usuario{kpis.huerfanos === 1 ? "" : "s"} del terminal que no está{kpis.huerfanos === 1 ? "" : "n"} enlazado{kpis.huerfanos === 1 ? "" : "s"} a un empleado.
          Click en cada uno abajo y vinculalo, o asegurate que el campo <code style={{ fontSize: 11 }}>zk_user_id</code> de RH coincida con el PIN del aparato (default: cédula).
        </div>
      )}

      {/* Filtro */}
      <input type="text" placeholder="Buscar empleado / cédula / PIN..."
        value={filtroEmpleado} onChange={e => setFiltroEmpleado(e.target.value)}
        style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }} />

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
      ) : filas.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", background: B.navyMid, borderRadius: 10, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
          Sin punches para {fmtFecha(fecha)}.
          <div style={{ fontSize: 11, marginTop: 6 }}>Si esperabas data, verificá que el terminal esté online y apuntando a www.atolon.co.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filas.map(fila => (
            <FilaEmpleado key={fila.key} fila={fila} empleados={empleados}
              onLink={() => setLinkModal(fila)}
              onReload={cargar} />
          ))}
        </div>
      )}

      {linkModal && (
        <LinkModal
          fila={linkModal}
          empleados={empleados}
          onClose={() => setLinkModal(null)}
          onSaved={() => { setLinkModal(null); cargar(); }}
        />
      )}
      </>
      )}
    </div>
  );
}

function FilaEmpleado({ fila, onLink, onReload }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: B.navyMid,
      borderRadius: 10,
      borderLeft: `4px solid ${fila.huerfano ? B.warning : B.success}`,
      padding: "12px 14px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: fila.huerfano ? B.warning : B.white }}>
            {fila.nombre || `(sin nombre) PIN ${fila.zk_user_id}`}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {fila.cedula && <span>🆔 {fila.cedula}</span>}
            <span>PIN ZK: {fila.zk_user_id}</span>
            <span>{fila.punches.length} marca{fila.punches.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Entrada</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: B.success }}>{fmtHora(fila.primera)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Salida</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: B.danger }}>{fmtHora(fila.ultima)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Horas</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>
              {fila.horas > 0 ? fila.horas.toFixed(2) : "—"}
            </div>
          </div>
          {fila.huerfano && (
            <button onClick={onLink}
              style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${B.warning}`, background: B.warning + "22", color: B.warning, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              🔗 Linkear
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)}
            style={{ background: "transparent", border: "none", color: B.sky, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
            {expanded ? "▲ Ocultar" : "▼ Detalle"}
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.navyLight}`, display: "flex", flexDirection: "column", gap: 4 }}>
          {fila.punches.map(p => (
            <div key={p.id} style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", display: "flex", gap: 12 }}>
              <span style={{ color: B.sand, fontFamily: "monospace", minWidth: 60 }}>{fmtHora(p.hora)}</span>
              <span>{TIPO_LABEL[p.tipo_marca] || p.tipo_marca}</span>
              <span>{METODO_ICON[p.metodo] || ""} {p.metodo}</span>
              {p.workcode && <span style={{ color: "rgba(255,255,255,0.4)" }}>WC: {p.workcode}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab Enrolamiento: mapear cada empleado a su PIN del terminal ──────
// Convención: cédula = PIN. El endpoint zk-iclock hace fallback por
// cédula si zk_user_id no matchea, así que setear zk_user_id = cedula
// deja el matcheo redundante y explícito.
function TabEnrolamiento({ empleados, onReload, isMobile }) {
  const [filtro, setFiltro] = useState("");
  const [saving, setSaving] = useState({});
  const [editando, setEditando] = useState(null); // {id, valor}
  const [confirmMasivo, setConfirmMasivo] = useState(false);

  const stats = useMemo(() => {
    const total = empleados.length;
    const enrolados = empleados.filter(e => e.zk_user_id).length;
    const cedulaMatch = empleados.filter(e => e.zk_user_id && e.zk_user_id === e.cedula).length;
    const pinCustom = empleados.filter(e => e.zk_user_id && e.zk_user_id !== e.cedula).length;
    return { total, enrolados, pendientes: total - enrolados, cedulaMatch, pinCustom };
  }, [empleados]);

  const lista = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return empleados
      .filter(e => {
        if (!q) return true;
        const s = [e.nombres, e.apellidos, e.cedula, e.zk_user_id, e.cargo]
          .map(x => String(x || "").toLowerCase()).join(" ");
        return s.includes(q);
      })
      .sort((a, b) => {
        // Pendientes primero, luego alfabético
        const ap = !a.zk_user_id, bp = !b.zk_user_id;
        if (ap !== bp) return ap ? -1 : 1;
        return (a.nombres || "").localeCompare(b.nombres || "");
      });
  }, [empleados, filtro]);

  const guardarPin = async (empId, pin) => {
    setSaving(s => ({ ...s, [empId]: true }));
    try {
      const emp = empleados.find(e => e.id === empId);
      const valor = String(pin || "").trim() || null;
      const { error: e1 } = await supabase.from("rh_empleados")
        .update({ zk_user_id: valor }).eq("id", empId);
      if (e1) throw e1;
      // Backfill punches existentes con ese PIN
      if (valor) {
        await supabase.from("asistencia_zk").update({
          empleado_id: empId,
          cedula: emp?.cedula || null,
          nombre_snapshot: emp ? `${emp.nombres || ""} ${emp.apellidos || ""}`.trim() : null,
        }).eq("zk_user_id", valor);
      }
      await onReload();
      setEditando(null);
    } catch (err) {
      alert("Error: " + (err.message || err));
    } finally {
      setSaving(s => ({ ...s, [empId]: false }));
    }
  };

  const autoMapearMasivo = async () => {
    setConfirmMasivo(false);
    const pendientes = empleados.filter(e => !e.zk_user_id && e.cedula);
    if (!pendientes.length) return;
    let ok = 0, err = 0;
    for (const emp of pendientes) {
      try {
        const { error } = await supabase.from("rh_empleados")
          .update({ zk_user_id: emp.cedula }).eq("id", emp.id);
        if (error) throw error;
        // Backfill
        await supabase.from("asistencia_zk").update({
          empleado_id: emp.id,
          cedula: emp.cedula,
          nombre_snapshot: `${emp.nombres || ""} ${emp.apellidos || ""}`.trim(),
        }).eq("zk_user_id", emp.cedula);
        ok++;
      } catch { err++; }
    }
    await onReload();
    alert(`✓ ${ok} empleados mapeados${err ? ` · ${err} errores` : ""}`);
  };

  const progresoPct = stats.total ? Math.round((stats.enrolados / stats.total) * 100) : 0;

  return (
    <div>
      {/* Instrucciones */}
      <div style={{ background: B.navyMid, borderLeft: `3px solid ${B.sky}`, borderRadius: 8, padding: 14, marginBottom: 14, fontSize: 12, lineHeight: 1.5 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.sky, marginBottom: 6 }}>
          Convención: cédula = PIN del reloj
        </div>
        <div style={{ color: "rgba(255,255,255,0.7)" }}>
          En el terminal, cada empleado debe estar enrolado con su <strong style={{ color: B.sand }}>cédula como N° de usuario</strong>.
          Con eso, cada marca se vincula al empleado correcto automáticamente. Si algún empleado tiene un PIN diferente en el reloj, edítalo abajo.
        </div>
      </div>

      {/* KPIs + Progreso */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
        {[
          { l: "Total activos",   v: stats.total,        c: B.sky },
          { l: "Enrolados",       v: stats.enrolados,    c: B.success },
          { l: "Pendientes",      v: stats.pendientes,   c: stats.pendientes > 0 ? B.warning : "rgba(255,255,255,0.3)" },
          { l: "Cédula = PIN",    v: stats.cedulaMatch,  c: B.sand },
          { l: "PIN distinto",    v: stats.pinCustom,    c: stats.pinCustom > 0 ? B.warning : "rgba(255,255,255,0.3)" },
        ].map(k => (
          <div key={k.l} style={{ background: B.navyMid, borderRadius: 10, padding: 10, borderLeft: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{k.l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.c, marginTop: 2 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Barra de progreso */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
          <span>Progreso de enrolamiento</span>
          <span style={{ color: B.success, fontWeight: 700 }}>{progresoPct}%</span>
        </div>
        <div style={{ height: 6, background: B.navyMid, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progresoPct}%`, background: B.success, transition: "width 200ms" }} />
        </div>
      </div>

      {/* Acciones + búsqueda */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexDirection: isMobile ? "column" : "row" }}>
        <input type="text" placeholder="Buscar empleado / cédula / PIN..."
          value={filtro} onChange={e => setFiltro(e.target.value)}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white, fontSize: 13, boxSizing: "border-box" }} />
        {stats.pendientes > 0 && (
          <button onClick={() => setConfirmMasivo(true)}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: B.success, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            ⚡ Auto-mapear {stats.pendientes} pendientes (cédula → PIN)
          </button>
        )}
      </div>

      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {lista.map(emp => {
          const enrolado = !!emp.zk_user_id;
          const cedulaMatch = enrolado && emp.zk_user_id === emp.cedula;
          const isEditing = editando?.id === emp.id;
          const isSaving = !!saving[emp.id];
          return (
            <div key={emp.id} style={{
              background: B.navyMid,
              borderRadius: 8,
              borderLeft: `3px solid ${enrolado ? (cedulaMatch ? B.success : B.warning) : "rgba(255,255,255,0.15)"}`,
              padding: "12px 14px",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto",
              gap: 10,
              alignItems: "center",
              opacity: enrolado ? 1 : 0.85,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: B.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {emp.nombres} {emp.apellidos}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>🆔 {emp.cedula || "sin cédula"}</span>
                  {emp.cargo && <span>· {emp.cargo}</span>}
                </div>
              </div>

              {isEditing ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="text" autoFocus value={editando.valor}
                    onChange={e => setEditando({ ...editando, valor: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === "Enter") guardarPin(emp.id, editando.valor);
                      if (e.key === "Escape") setEditando(null);
                    }}
                    placeholder={emp.cedula || "PIN"}
                    style={{ width: 130, padding: "6px 10px", borderRadius: 6, background: B.navy, border: `1px solid ${B.sky}`, color: B.white, fontFamily: "monospace", fontSize: 13 }} />
                  <button onClick={() => guardarPin(emp.id, editando.valor)} disabled={isSaving}
                    style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: B.success, color: B.navy, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {isSaving ? "..." : "✓"}
                  </button>
                  <button onClick={() => setEditando(null)}
                    style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer" }}>
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {enrolado ? (
                    <div style={{
                      fontFamily: "monospace",
                      background: B.navy,
                      color: cedulaMatch ? B.success : B.warning,
                      padding: "5px 10px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 700,
                      border: `1px solid ${cedulaMatch ? B.success + "44" : B.warning + "44"}`,
                    }}>
                      PIN {emp.zk_user_id}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
                      sin PIN
                    </div>
                  )}
                </div>
              )}

              {!isEditing && (
                <div style={{ display: "flex", gap: 6 }}>
                  {!enrolado && emp.cedula && (
                    <button onClick={() => guardarPin(emp.id, emp.cedula)} disabled={isSaving}
                      style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${B.success}44`, background: B.success + "22", color: B.success, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      {isSaving ? "..." : `Usar cédula`}
                    </button>
                  )}
                  <button onClick={() => setEditando({ id: emp.id, valor: emp.zk_user_id || emp.cedula || "" })}
                    style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${B.navyLight}`, background: "transparent", color: B.sky, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {enrolado ? "✏ Editar" : "PIN custom"}
                  </button>
                  {enrolado && (
                    <button onClick={() => { if (confirm(`Quitar PIN de ${emp.nombres}?`)) guardarPin(emp.id, ""); }}
                      style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${B.danger}44`, background: "transparent", color: B.danger, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      Quitar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!lista.length && (
          <div style={{ padding: 40, textAlign: "center", background: B.navyMid, borderRadius: 10, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            {filtro ? "Sin resultados." : "No hay empleados activos."}
          </div>
        )}
      </div>

      {/* Confirmación masivo */}
      {confirmMasivo && (
        <div onClick={e => e.target === e.currentTarget && setConfirmMasivo(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 460, maxWidth: "100%" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>⚡ Auto-mapear masivo</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 16, lineHeight: 1.5 }}>
              Voy a poner <code style={{ color: B.sand }}>zk_user_id = cédula</code> en los <strong style={{ color: B.warning }}>{stats.pendientes}</strong> empleados que aún no tienen PIN asignado.
              Los punches existentes con esa cédula como PIN se re-vinculan automáticamente.
              <br /><br />
              <strong style={{ color: B.sky }}>Importante:</strong> asegúrate que en el reloj esos empleados estén enrolados con la cédula como N° de usuario.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmMasivo(false)}
                style={{ flex: 1, padding: 11, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={autoMapearMasivo}
                style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: B.success, color: B.navy, fontWeight: 700, cursor: "pointer" }}>
                ✓ Sí, mapear {stats.pendientes} empleados
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal: vincular zk_user_id huérfano a un rh_empleados ────────────
function LinkModal({ fila, empleados, onClose, onSaved }) {
  const [empId, setEmpId] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!empId) return;
    setSaving(true);
    try {
      // 1) Setear zk_user_id en el empleado
      const { error: e1 } = await supabase.from("rh_empleados")
        .update({ zk_user_id: fila.zk_user_id })
        .eq("id", empId);
      if (e1) throw e1;
      // 2) Update en bloque de TODOS los punches de ese zk_user_id
      const emp = empleados.find(e => e.id === empId);
      const { error: e2 } = await supabase.from("asistencia_zk")
        .update({
          empleado_id: empId,
          cedula: emp?.cedula || null,
          nombre_snapshot: emp ? `${emp.nombres || ""} ${emp.apellidos || ""}`.trim() : null,
        })
        .eq("zk_user_id", fila.zk_user_id);
      if (e2) throw e2;
      onSaved();
    } catch (err) {
      alert("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, padding: 24, width: 480, maxWidth: "100%" }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>🔗 Vincular usuario del terminal</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
          PIN <strong>{fila.zk_user_id}</strong> tiene {fila.punches.length} marca{fila.punches.length === 1 ? "" : "s"} pero no está enlazado a un empleado.
          Seleccioná a quién corresponde:
        </div>
        <select value={empId} onChange={e => setEmpId(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, marginBottom: 14 }}>
          <option value="">— Seleccionar empleado —</option>
          {empleados
            .filter(e => !e.zk_user_id || e.zk_user_id === fila.zk_user_id)
            .map(e => (
              <option key={e.id} value={e.id}>
                {e.nombres} {e.apellidos} {e.cedula ? `· ${e.cedula}` : ""} {e.cargo ? `· ${e.cargo}` : ""}
              </option>
            ))}
        </select>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.4 }}>
          Al guardar, el campo <code>zk_user_id</code> del empleado quedará en <strong>{fila.zk_user_id}</strong> y todos los punches anteriores con ese PIN se le asignan retroactivamente.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: 11, borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={!empId || saving}
            style={{ flex: 2, padding: 11, borderRadius: 8, border: "none", background: empId ? B.success : B.navyLight, color: empId ? B.navy : "rgba(255,255,255,0.3)", fontWeight: 700, cursor: empId ? "pointer" : "default" }}>
            {saving ? "Guardando…" : "✓ Vincular"}
          </button>
        </div>
      </div>
    </div>
  );
}
