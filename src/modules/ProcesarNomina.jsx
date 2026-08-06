// ProcesarNomina — nómina quincenal por empleado.
// Modelo Colombia: salario_base prorrateado + novedades del período.
//
// Devengado:  salario_base/2 + aux. transporte + bonos/extras/recargos
// Deducido:   aportes 8% (salud + pensión) + faltas + anticipos + préstamos
// Neto = Devengado - Deducido
//
// Las novedades viven en `empleados_loggro_novedades`. El operador puede
// agregar manualmente desde el drawer del empleado, o el sistema las
// puede auto-generar más adelante desde las marcaciones biométricas.

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B, COP } from "../brand";
import { useMobile } from "../lib/useMobile";
import { logAccion } from "../lib/logAccion";
import {
  quincenaActual, quincenaAnterior, diasDelPeriodo,
  calcularNominaEmpleado, calcularHorasDia, desglosarPeriodo, ventanaNovedades,
  tarifaHoraEmpleado, NOVEDAD_TIPOS, SMMLV_2026, AUX_TRANSPORTE_2026, FESTIVOS_CO_2026,
  REC_NOCTURNO, REC_FESTIVO, REC_NOCTURNO_FESTIVO,
  EXTRA_DIURNA, EXTRA_NOCTURNA, EXTRA_FESTIVA_DIURNA, EXTRA_FESTIVA_NOCTURNA,
} from "../lib/nominaCalculator.js";

const PCT = (f) => `${Math.round(f * 100)}%`;
const MUL = (f) => `×${(+f.toFixed(2))}`;

// Ventana de novedades del período (desfasada). Defensivo si es "Personalizado".
function ventanaDe(periodo) {
  if (periodo && periodo.numero && periodo.anio != null && periodo.mes != null) {
    return ventanaNovedades(periodo);
  }
  return { desde: periodo?.desde, hasta: periodo?.hasta };
}

const IS = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${B.navyLight}`,
  color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box",
};
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const thStyle = { textAlign: "left", padding: "10px 12px", fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 };
const tdStyle = { padding: "10px 12px", color: B.white, fontSize: 12 };

// ── KPI ──────────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${color || B.sand}`, minWidth: 180, flex: "1 1 180px" }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: B.white }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Drawer detalle empleado ──────────────────────────────────────────────────
// Diferencia en minutos entre dos "HH:MM" (b-a). null si alguno falta.
function diffMin(a, b) {
  if (!a || !b) return null;
  const [ha, ma] = a.split(":").map(Number);
  const [hb, mb] = b.split(":").map(Number);
  return (hb * 60 + mb) - (ha * 60 + ma);
}
function fmtDelta(min) {
  if (min == null) return null;
  const s = min > 0 ? "+" : (min < 0 ? "−" : "");
  return `${s}${Math.abs(min)}min`;
}

function MarcacionesGrid({ empleado, periodo, ventana, marcaciones, horariosProgramados = [], bloqueado = false, onSave }) {
  // Las marcaciones se capturan en la ventana del período (Pago 15 = 26→10,
  // Pago 30 = 11→25), no en la quincena calendario.
  const dias = diasDelPeriodo(ventana.desde, ventana.hasta);
  const norm = (t) => (t ? String(t).slice(0, 5) : "");
  const seed = () => {
    const m = {};
    for (const d of dias) m[d] = { entrada: "", salida: "", entrada_2: "", salida_2: "" };
    for (const r of marcaciones) {
      if (m[r.fecha]) m[r.fecha] = {
        entrada:   norm(r.entrada),
        salida:    norm(r.salida),
        entrada_2: norm(r.entrada_2),
        salida_2:  norm(r.salida_2),
      };
    }
    return m;
  };
  const [grid, setGrid] = useState(seed);
  const [initialGrid] = useState(seed);
  const [guardando, setGuardando] = useState(false);
  const [motivoOpen, setMotivoOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const tarifa = tarifaHoraEmpleado(empleado);
  const almuerzo = empleado?.almuerzo_horas == null ? 1 : Number(empleado.almuerzo_horas);
  const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  // Índice de horarios programados por fecha (rh_horarios) — puede haber 2 turnos.
  const horByFecha = useMemo(() => {
    const m = {};
    for (const h of horariosProgramados) {
      if (!h.hora_ini) continue;   // ignorar descansos sin horas
      if (!m[h.fecha]) m[h.fecha] = [];
      m[h.fecha].push(h);
    }
    return m;
  }, [horariosProgramados]);

  const set = (fecha, campo, val) => setGrid(g => ({ ...g, [fecha]: { ...g[fecha], [campo]: val } }));
  // Para el desglose (horas de nómina), expandimos turnos partidos en 2 "filas
  // sintéticas" por día para que calcularHorasDia procese ambos bloques.
  const filas = dias.map(f => ({ fecha: f, ...grid[f] }));
  const filasParaCalculo = filas.flatMap(f => {
    const out = [{ fecha: f.fecha, entrada: f.entrada, salida: f.salida }];
    if (f.entrada_2 && f.salida_2) out.push({ fecha: f.fecha, entrada: f.entrada_2, salida: f.salida_2 });
    return out;
  });
  const desg = desglosarPeriodo(filasParaCalculo, tarifa, undefined, almuerzo);

  // ¿Hubo cambios vs snapshot original?
  const cambios = dias.reduce((c, d) => {
    const a = initialGrid[d] || {};
    const b = grid[d] || {};
    const diff = (a.entrada !== b.entrada) || (a.salida !== b.salida) ||
                 (a.entrada_2 !== b.entrada_2) || (a.salida_2 !== b.salida_2);
    return c + (diff ? 1 : 0);
  }, 0);

  const iniciarGuardar = () => {
    if (bloqueado) return;
    if (cambios === 0) {
      alert("No hay cambios que guardar.");
      return;
    }
    setMotivo("");
    setMotivoOpen(true);
  };

  const confirmarGuardar = async () => {
    if (!motivo || motivo.trim().length < 3) {
      alert("Escribe la razón del cambio (mínimo 3 caracteres).");
      return;
    }
    setGuardando(true);
    const ok = await onSave(empleado.id, filas, motivo.trim());
    setGuardando(false);
    if (ok) setMotivoOpen(false);
  };

  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 14, opacity: bloqueado ? 0.85 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
          🕑 Marcaciones · {periodo.etiqueta}
          {bloqueado && <span style={{ marginLeft: 8, background: B.warning + "33", color: B.warning, padding: "2px 7px", borderRadius: 6, fontSize: 10 }}>🔒 Aprobado</span>}
        </div>
        <div style={{ fontSize: 12, color: B.sand, fontWeight: 700 }}>
          {desg.horas_ordinarias}h ord · {desg.horas_extra}h extra
        </div>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
        Entrada/salida por día · tarifa {COP(tarifa)}/h · adicionales (recargos + extra): {COP(desg.total_adicional)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filas.map(f => {
          const d = new Date(f.fecha + "T12:00:00");
          const fest = FESTIVOS_CO_2026.has(f.fecha);
          const preB1 = (f.entrada && f.salida)
            ? calcularHorasDia({ fecha: f.fecha, entrada: f.entrada, salida: f.salida, almuerzoHoras: almuerzo })
            : null;
          const preB2 = (f.entrada_2 && f.salida_2)
            ? calcularHorasDia({ fecha: f.fecha, entrada: f.entrada_2, salida: f.salida_2, almuerzoHoras: 0 })
            : null;
          const horasDia = (preB1?.horas || 0) + (preB2?.horas || 0);
          // Horarios programados: pueden ser 1 o 2 rows en rh_horarios para el mismo día
          const progAll = (horByFecha[f.fecha] || []).slice().sort((a, b) => (a.hora_ini || "").localeCompare(b.hora_ini || ""));
          const prog1 = progAll[0];
          const prog2 = progAll[1];
          const p1In = norm(prog1?.hora_ini), p1Out = norm(prog1?.hora_fin);
          const p2In = norm(prog2?.hora_ini), p2Out = norm(prog2?.hora_fin);
          const dIn1 = diffMin(p1In, f.entrada), dOut1 = diffMin(p1Out, f.salida);
          const dIn2 = diffMin(p2In, f.entrada_2), dOut2 = diffMin(p2Out, f.salida_2);
          const tieneBloque2 = !!(f.entrada_2 || f.salida_2 || prog2);

          const renderDelta = (v, tipoIn) => {
            if (v == null) return null;
            const color = Math.abs(v) <= 5 ? B.success
              : tipoIn ? (v > 15 ? B.danger : B.warning)
              : (v < -15 ? B.danger : v > 30 ? B.sky : B.warning);
            return <span style={{ color }}>{tipoIn ? "Entrada" : "Salida"} {fmtDelta(v)}</span>;
          };

          return (
            <div key={f.fecha} style={{ padding: "6px 0", borderBottom: `1px solid ${B.navyLight}33` }}>
              {/* Bloque 1 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 64, fontSize: 11, color: fest ? B.warning : "rgba(255,255,255,0.7)" }}>
                  {DOW[d.getDay()]} {d.getDate()}{fest ? " •" : ""}
                </div>
                <input type="time" value={f.entrada} onChange={e => set(f.fecha, "entrada", e.target.value)}
                  disabled={bloqueado}
                  style={{ ...IS, width: 96, padding: "6px 8px", opacity: bloqueado ? 0.7 : 1 }} />
                <input type="time" value={f.salida} onChange={e => set(f.fecha, "salida", e.target.value)}
                  disabled={bloqueado}
                  style={{ ...IS, width: 96, padding: "6px 8px", opacity: bloqueado ? 0.7 : 1 }} />
                <div style={{ flex: 1, textAlign: "right", fontSize: 11, color: horasDia > 0 ? B.success : "rgba(255,255,255,0.25)" }}>
                  {horasDia > 0 ? `${horasDia.toFixed(2)}h${(preB1?.horas_nocturnas || preB2?.horas_nocturnas) ? ` · ${((preB1?.horas_nocturnas || 0) + (preB2?.horas_nocturnas || 0)).toFixed(2)}h noct` : ""}` : "—"}
                </div>
              </div>
              {(p1In && p1Out) ? (
                <div style={{ paddingLeft: 70, fontSize: 10, color: "rgba(255,255,255,0.45)", display: "flex", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
                  <span>📋 Programado {p1In}–{p1Out}{prog1.tipo ? ` (${prog1.tipo})` : ""}</span>
                  {(f.entrada || f.salida) && (<>{renderDelta(dIn1, true)}{renderDelta(dOut1, false)}</>)}
                </div>
              ) : (
                <div style={{ paddingLeft: 70, fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                  📋 Sin horario programado
                </div>
              )}

              {/* Bloque 2 (turno partido) — solo si existe o si hay botón para agregarlo */}
              {tieneBloque2 ? (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 64, fontSize: 10, color: "rgba(255,255,255,0.4)", paddingLeft: 6 }}>
                      ↳ 2° turno
                    </div>
                    <input type="time" value={f.entrada_2 || ""} onChange={e => set(f.fecha, "entrada_2", e.target.value)}
                      disabled={bloqueado}
                      style={{ ...IS, width: 96, padding: "6px 8px", opacity: bloqueado ? 0.7 : 1, borderColor: B.sky + "55" }} />
                    <input type="time" value={f.salida_2 || ""} onChange={e => set(f.fecha, "salida_2", e.target.value)}
                      disabled={bloqueado}
                      style={{ ...IS, width: 96, padding: "6px 8px", opacity: bloqueado ? 0.7 : 1, borderColor: B.sky + "55" }} />
                    {!bloqueado && (f.entrada_2 || f.salida_2) && (
                      <button onClick={() => { set(f.fecha, "entrada_2", ""); set(f.fecha, "salida_2", ""); }}
                        title="Quitar 2° turno"
                        style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 14, cursor: "pointer", padding: "2px 6px" }}>×</button>
                    )}
                    <div style={{ flex: 1 }} />
                  </div>
                  {(p2In && p2Out) && (
                    <div style={{ paddingLeft: 70, fontSize: 10, color: "rgba(255,255,255,0.45)", display: "flex", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
                      <span>📋 Programado {p2In}–{p2Out}{prog2.tipo ? ` (${prog2.tipo})` : ""}</span>
                      {(f.entrada_2 || f.salida_2) && (<>{renderDelta(dIn2, true)}{renderDelta(dOut2, false)}</>)}
                    </div>
                  )}
                </div>
              ) : !bloqueado ? (
                <div style={{ paddingLeft: 70, marginTop: 2 }}>
                  <button onClick={() => { set(f.fecha, "entrada_2", "00:00"); set(f.fecha, "salida_2", "00:00"); }}
                    title="Agregar 2° turno (turno partido)"
                    style={{ background: "transparent", border: `1px dashed ${B.navyLight}`, borderRadius: 6, padding: "2px 10px", fontSize: 10, color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                    + 2° turno
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {!bloqueado && (
        <button onClick={iniciarGuardar} disabled={guardando || cambios === 0}
          style={{ width: "100%", marginTop: 12, background: (guardando || cambios === 0) ? B.navyLight : B.sky, color: B.navy, border: "none", borderRadius: 10, padding: "11px 18px", cursor: (guardando || cambios === 0) ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, opacity: (guardando || cambios === 0) ? 0.6 : 1 }}>
          {guardando ? "Guardando…" : cambios === 0 ? "Sin cambios" : `💾 Guardar (${cambios} día${cambios===1?"":"s"} modificado${cambios===1?"":"s"})`}
        </button>
      )}

      {/* Modal motivo del cambio */}
      {motivoOpen && (
        <div onClick={() => !guardando && setMotivoOpen(false)}
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: B.navy, borderRadius: 14, padding: 24, width: "min(480px, 100%)", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: B.sand, marginBottom: 6 }}>Razón del cambio</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>
              Vas a modificar {cambios} día{cambios===1?"":"s"} de {empleado.nombres} {empleado.apellidos}. La razón queda auditada.
            </div>
            <textarea autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ej: 'Se olvidó marcar entrada — validé cámara y turno programado'"
              style={{ ...IS, minHeight: 80, resize: "vertical", padding: 10 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={() => setMotivoOpen(false)} disabled={guardando}
                style={{ background: "transparent", color: B.white, border: `1px solid ${B.navyLight}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={confirmarGuardar} disabled={guardando}
                style={{ background: guardando ? B.navyLight : B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "8px 20px", cursor: guardando ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13 }}>
                {guardando ? "Guardando…" : "✓ Confirmar y guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetalleDrawer({ empleado, calc, onClose, onAddNovedad, onDeleteNovedad, allNovedades, periodo, ventana, marcaciones = [], horariosProgramados = [], bloqueado = false, esAdmin = false, onSaveMarcaciones }) {
  if (!empleado || !calc) return null;
  const novedadesDelEmpleado = allNovedades.filter(n => n.empleado_loggro_id === empleado.id);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(640px, 100vw)", height: "100vh", background: B.navy, overflowY: "auto", padding: 24, borderLeft: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{empleado.cargo || "—"}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: B.white }}>{empleado.nombres} {empleado.apellidos}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              CC: {empleado.cedula || "—"}{esAdmin ? ` · Salario base: ${COP(empleado.salario_base)} / mes` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.white, fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* MARCACIONES — entrada/salida por día (ventana 26→10 / 11→25) */}
        {periodo && ventana && onSaveMarcaciones && (
          <MarcacionesGrid
            empleado={empleado}
            periodo={periodo}
            ventana={ventana}
            marcaciones={marcaciones}
            horariosProgramados={horariosProgramados}
            bloqueado={bloqueado}
            onSave={onSaveMarcaciones}
          />
        )}

        {/* DEVENGADO — solo admin */}
        {esAdmin && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: B.success, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>✓ Devengado</div>
          <Row
            label={`Salario ordinario (${calc.marcaciones?.horas_ordinarias ?? 0} de 95.33 h)`}
            value={COP(calc.devengado.salario_ordinario)}
            sub={calc.dias_no_trabajados > 0 ? `−${calc.dias_no_trabajados} día(s) por faltas` : `${calc.dias_trabajados} días · tarifa ${COP(calc.tarifa_hora)}/h`} />

          {(() => {
            const dg = calc.marcaciones; const d = calc.devengado;
            // Recargos: SOLO sobre horas ordinarias (la hora base ya está en el
            // salario; aquí se suma únicamente el % adicional).
            const recargos = dg ? [
              [`Recargo nocturno (+${PCT(REC_NOCTURNO)})`,          dg.h_recargo_nocturno,         d.recargo_nocturno],
              [`Recargo festivo (+${PCT(REC_FESTIVO)})`,            dg.h_recargo_festivo,          d.recargo_festivo],
              [`Recargo nocturno festivo (+${PCT(REC_NOCTURNO_FESTIVO)})`, dg.h_recargo_nocturno_festivo, d.recargo_nocturno_festivo],
            ].filter(([, , v]) => v > 0) : [];
            // Horas extra: pago COMPLETO × factor. El factor ya incluye la
            // nocturnidad/festividad → NO se les suma recargo aparte.
            const extras = dg ? [
              [`Hora extra diurna (${MUL(EXTRA_DIURNA)})`,           dg.h_extra_diurna,           d.extra_diurna],
              [`Hora extra nocturna (${MUL(EXTRA_NOCTURNA)})`,       dg.h_extra_nocturna,         d.extra_nocturna],
              [`Hora extra festiva diurna (${MUL(EXTRA_FESTIVA_DIURNA)})`,   dg.h_extra_festiva_diurna,   d.extra_festiva_diurna],
              [`Hora extra festiva nocturna (${MUL(EXTRA_FESTIVA_NOCTURNA)})`, dg.h_extra_festiva_nocturna, d.extra_festiva_nocturna],
            ].filter(([, , v]) => v > 0) : [];
            return (
              <>
                {recargos.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 12, marginBottom: 6 }}>
                      Recargos · solo horas ordinarias
                    </div>
                    {recargos.map(([label, horas, valor]) => (
                      <Row key={label} label={label} value={"+ " + COP(valor)} sub={`${horas} h ordinarias`} />
                    ))}
                  </>
                )}
                {extras.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 12, marginBottom: 6 }}>
                      Horas extra · pago completo (el factor ya incluye recargo)
                    </div>
                    {extras.map(([label, horas, valor]) => (
                      <Row key={label} label={label} value={"+ " + COP(valor)} sub={`${horas} h`} />
                    ))}
                  </>
                )}
              </>
            );
          })()}

          <Row label="Auxilio transporte" value={COP(calc.devengado.auxilio_transporte)} muted={calc.devengado.auxilio_transporte === 0} sub={calc.devengado.auxilio_transporte === 0 && empleado.salario_base > (2 * SMMLV_2026) ? "no aplica (>2 SMMLV)" : null} />
          {calc.devengado.items.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 12, marginBottom: 6 }}>Bonos / novedades manuales</div>
              {calc.devengado.items.map((n, i) => (
                <Row key={n.id || i} label={n.label} value={"+ " + COP(Math.abs(n.valor))}
                  sub={n.descripcion || `${n.fecha_inicio || ""}`}
                  onDelete={() => onDeleteNovedad?.(n)} />
              ))}
            </>
          )}
          <Total label="Subtotal devengado" value={COP(calc.devengado.subtotal)} color={B.success} />
        </div>
        )}

        {/* DEDUCCIONES — solo admin */}
        {esAdmin && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: B.warning, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>− Deducciones</div>
          <Row label="Aporte salud (4%)" value={"− " + COP(calc.deducciones.aporte_salud)} />
          <Row label="Aporte pensión (4%)" value={"− " + COP(calc.deducciones.aporte_pension)} />
          {calc.deducciones.items.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: 12, marginBottom: 6 }}>Otros descuentos</div>
              {calc.deducciones.items.map((n, i) => (
                <Row key={n.id || i} label={n.label} value={"− " + COP(Math.abs(n.valor))}
                  sub={n.descripcion || `${n.fecha_inicio || ""}`}
                  onDelete={() => onDeleteNovedad?.(n)} />
              ))}
            </>
          )}
          <Total label="Subtotal deducciones" value={"− " + COP(calc.deducciones.subtotal)} color={B.warning} />
        </div>
        )}

        {/* NETO — solo admin */}
        {esAdmin && (
          <div style={{ background: B.sand + "11", border: `2px solid ${B.sand}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 14, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Neto a pagar</span>
              <span style={{ fontSize: 32, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, color: B.sand }}>{COP(calc.neto)}</span>
            </div>
          </div>
        )}

        {/* Resumen para supervisor (solo horas y días) */}
        {!esAdmin && (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>📊 Resumen del período</div>
            <Row label="Días trabajados" value={`${calc.dias_trabajados}`} />
            <Row label="Horas totales (marcaciones)" value={`${calc.marcaciones?.horas || 0} h`} />
            <Row label="Horas ordinarias" value={`${calc.marcaciones?.horas_ordinarias || 0} h`} />
            <Row label="Horas extra" value={`${calc.marcaciones?.horas_extra || 0} h`} muted={(calc.marcaciones?.horas_extra || 0) === 0} />
            <Row label="Horas nocturnas" value={`${calc.marcaciones?.horas_nocturnas || 0} h`} muted={(calc.marcaciones?.horas_nocturnas || 0) === 0} />
            <Row label="Faltas" value={calc.dias_no_trabajados > 0 ? `${calc.dias_no_trabajados} día(s)` : "—"} muted={calc.dias_no_trabajados === 0} />
          </div>
        )}

        {/* INFORMATIVO */}
        {calc.informativo.length > 0 && (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 12 }}>ℹ Informativo (no afecta neto)</div>
            {calc.informativo.map((n, i) => (
              <Row key={n.id || i} label={n.label} value={n.cantidad ? `${n.cantidad} día(s)` : "—"} sub={n.descripcion} />
            ))}
          </div>
        )}

        {/* AGREGAR NOVEDAD */}
        <button onClick={onAddNovedad} style={{ width: "100%", background: B.sky, color: B.navy, border: "none", borderRadius: 10, padding: "12px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
          ➕ Agregar novedad
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, sub, muted, onDelete }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "6px 0", borderBottom: `1px dashed ${B.navyLight}55` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: muted ? "rgba(255,255,255,0.4)" : B.white }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: muted ? "rgba(255,255,255,0.3)" : B.white, fontWeight: 600, fontFamily: "ui-monospace, monospace" }}>{value}</span>
        {onDelete && (
          <button onClick={onDelete} title="Eliminar novedad" style={{ background: "none", border: "none", color: B.warning, fontSize: 14, cursor: "pointer", padding: "0 4px" }}>×</button>
        )}
      </div>
    </div>
  );
}

function Total({ label, value, color }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
      <span style={{ color: color || B.sand }}>{label}</span>
      <span style={{ color: color || B.sand, fontFamily: "ui-monospace, monospace" }}>{value}</span>
    </div>
  );
}

// ── Modal agregar novedad ────────────────────────────────────────────────────
function AddNovedadModal({ empleado, periodo, onSave, onClose }) {
  const [tipo, setTipo] = useState("bonificacion");
  const [fechaInicio, setFechaInicio] = useState(periodo.desde);
  const [fechaFin, setFechaFin] = useState(periodo.hasta);
  const [cantidad, setCantidad] = useState("");
  const [valor, setValor] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const meta = NOVEDAD_TIPOS[tipo];
  const opciones = Object.entries(NOVEDAD_TIPOS);

  const guardar = () => {
    const valorNum = Number(String(valor).replace(/[^0-9.-]/g, "")) || 0;
    if (!valorNum && meta?.categoria !== "informativo") {
      alert("El valor debe ser mayor a 0");
      return;
    }
    onSave({
      empleado_loggro_id: empleado.id,
      tipo,
      fecha_inicio: fechaInicio,
      fecha_fin:    fechaFin || null,
      cantidad:     Number(cantidad) || null,
      valor:        valorNum,
      descripcion:  descripcion || meta?.descripcion || tipo,
    });
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: B.navy, borderRadius: 14, padding: 28, width: "min(520px, 92vw)", border: `1px solid ${B.navyLight}` }}>
        <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{empleado.nombres} {empleado.apellidos}</div>
        <div style={{ fontSize: 18, color: B.white, fontWeight: 700, marginBottom: 16 }}>Agregar novedad</div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={LS}>Tipo *</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={IS}>
              <optgroup label="✓ Devengados (suman)">
                {opciones.filter(([_, m]) => m.categoria === "devengado").map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </optgroup>
              <optgroup label="− Deducciones (restan)">
                {opciones.filter(([_, m]) => m.categoria === "deducido").map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </optgroup>
              <optgroup label="ℹ Informativos">
                {opciones.filter(([_, m]) => m.categoria === "informativo").map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </optgroup>
            </select>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{meta?.descripcion}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Fecha inicio *</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Fecha fin (opcional)</label>
              <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={IS} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Cantidad (días/horas)</label>
              <input type="number" min="0" step="0.01" value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="ej: 2" style={IS} />
            </div>
            <div>
              <label style={LS}>Valor en COP *</label>
              <input type="text" value={valor} onChange={e => setValor(e.target.value.replace(/[^\d]/g, ""))} placeholder="ej: 100000" style={IS} />
            </div>
          </div>

          <div>
            <label style={LS}>Descripción / nota</label>
            <textarea rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder={meta?.descripcion} style={{ ...IS, resize: "vertical" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
          <button onClick={onClose} style={{ background: "none", color: B.sand, padding: "9px 18px", border: `1px solid ${B.navyLight}`, borderRadius: 8, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} style={{ background: B.sky, color: B.navy, padding: "9px 20px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Guardar novedad</button>
        </div>
      </div>
    </div>
  );
}

// ── Main module ──────────────────────────────────────────────────────────────
// Clave única del período para nomina_aprobaciones.
// "YYYY-MM-Q1" = pago 15 del mes (cubre 26/mes-1 → 10/mes)
// "YYYY-MM-Q2" = pago 30 del mes (cubre 11 → 25)
function periodoKeyOf(periodo) {
  if (!periodo?.anio || periodo?.mes == null || !periodo?.numero) {
    return `custom-${periodo?.desde || ""}-${periodo?.hasta || ""}`;
  }
  const mm = String(periodo.mes + 1).padStart(2, "0");
  return `${periodo.anio}-${mm}-Q${periodo.numero}`;
}

// Roles que pueden correr TODA la nómina (ven todos los deptos y pueden
// aprobar/desaprobar cualquiera). El resto solo ve deptos donde figuran
// como supervisor_email. Los rol_id de "gerente general" traen sufijo
// numérico en Loggro — matcheamos por prefijo.
const ROLES_ADMIN_EXACTOS = new Set(["super_admin", "admin", "administrador", "contabilidad", "direccion"]);
const ROLES_ADMIN_PREFIJOS = ["gerente_general"];
function esRolAdmin(rolId) {
  const r = String(rolId || "").toLowerCase();
  if (ROLES_ADMIN_EXACTOS.has(r)) return true;
  return ROLES_ADMIN_PREFIJOS.some(p => r.startsWith(p));
}

export default function ProcesarNomina() {
  const isMobile = useMobile();
  const [empleados, setEmpleados] = useState([]);
  const [novedades, setNovedades] = useState([]);
  const [marcaciones, setMarcaciones] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [aprobaciones, setAprobaciones] = useState([]);
  const [currentUser, setCurrentUser] = useState({ email: "", rol: null });
  const [deptoFiltro, setDeptoFiltro] = useState("");   // "" = todos (solo admin)
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState(() => quincenaActual());
  const [detalleEmpleado, setDetalleEmpleado] = useState(null);
  const [addNovedadEmp, setAddNovedadEmp] = useState(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [aprobando, setAprobando] = useState(false);

  const ventana = useMemo(() => ventanaDe(periodo), [periodo]);
  const periodoKey = useMemo(() => periodoKeyOf(periodo), [periodo]);
  const esAdmin = esRolAdmin(currentUser.rol);

  // Cargar usuario actual + rol (una vez)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const email = sess?.session?.user?.email || "";
      if (!email) return;
      const { data: u } = await supabase.from("usuarios").select("rol_id, nombre").eq("email", email).maybeSingle();
      if (cancelled) return;
      setCurrentUser({ email, rol: u?.rol_id || null, nombre: u?.nombre || "" });
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const ven = ventanaDe(periodo);
    const [empsRes, novsRes, marcsRes, deptosRes, aprobsRes, horsRes, zkRes] = await Promise.all([
      supabase.from("rh_empleados")
        .select("id, nombres, apellidos, cedula, cargo, departamento_id, salario_base, tarifa_hora, modalidad_calculo, almuerzo_horas, activo")
        .eq("activo", true)
        .order("apellidos"),
      // Novedades viven en su ventana DESFASADA (26→10 / 11→25), no en la quincena.
      supabase.from("empleados_loggro_novedades")
        .select("*")
        .or(`fecha_inicio.lte.${ven.hasta},fecha_fin.gte.${ven.desde}`),
      // Marcaciones EDITADAS por supervisor (ajustes manuales)
      supabase.from("rh_marcaciones")
        .select("*")
        .gte("fecha", ven.desde)
        .lte("fecha", ven.hasta),
      supabase.from("rh_departamentos").select("id, nombre, supervisor_email").order("nombre"),
      supabase.from("nomina_aprobaciones").select("*").eq("periodo_key", periodoKeyOf(periodo)),
      // Horarios programados en la misma ventana (para comparar contra marcaciones)
      supabase.from("rh_horarios")
        .select("empleado_id, fecha, hora_ini, hora_fin, tipo")
        .gte("fecha", ven.desde)
        .lte("fecha", ven.hasta),
      // Marcas del reloj biométrico (fuente primaria). Se agrupan por
      // (empleado, fecha) → min=entrada, max=salida. Si el supervisor edita,
      // el registro en rh_marcaciones tiene precedencia.
      supabase.from("asistencia_zk")
        .select("empleado_id, fecha, hora")
        .gte("fecha", ven.desde)
        .lte("fecha", ven.hasta)
        .not("empleado_id", "is", null)
        .order("hora"),
    ]);
    if (empsRes.error) console.error("Error cargando empleados:", empsRes.error);
    if (novsRes.error) console.error("Error cargando novedades:", novsRes.error);
    if (marcsRes.error) console.error("Error cargando marcaciones:", marcsRes.error);
    if (deptosRes.error) console.error("Error cargando departamentos:", deptosRes.error);
    if (aprobsRes.error) console.error("Error cargando aprobaciones:", aprobsRes.error);
    if (horsRes.error) console.error("Error cargando horarios:", horsRes.error);
    if (zkRes.error) console.error("Error cargando asistencia_zk:", zkRes.error);

    // Unir marcas ZK con rh_marcaciones editadas.
    // - rh_marcaciones manda si existe (edición del supervisor)
    // - Sin edición: sintetizar desde asistencia_zk.
    //
    // Regla para detectar TURNO PARTIDO:
    //   - Necesita HABER ENTRADO, SALIDO y VUELTO A ENTRAR el mismo día.
    //   - Es decir: mínimo 3 punches, agrupables en 2 bloques donde el 1er
    //     bloque tenga entrada y salida (≥2 punches) Y exista al menos 1 punch
    //     tras un gap grande (la re-entrada).
    //   - 2 punches simples (aunque estén separados) = 1 solo turno (entrada=min,
    //     salida=max). Es lo normal: entró en la mañana y salió en la tarde.
    //   - 1 punch = día incompleto (entrada=hora, salida vacía).
    const GAP_MIN_TURNO_PARTIDO = 90;
    const toMin = (h) => { const [H, M] = String(h).split(":").map(Number); return H * 60 + M; };
    const rhKeys = new Set((marcsRes.data || []).map(m => `${m.empleado_id}|${m.fecha}`));

    const punchesByKey = {};
    for (const z of (zkRes.data || [])) {
      const k = `${z.empleado_id}|${z.fecha}`;
      if (rhKeys.has(k)) continue;
      const h = String(z.hora || "").slice(0, 5);
      if (!h) continue;
      if (!punchesByKey[k]) punchesByKey[k] = { empleado_id: z.empleado_id, fecha: z.fecha, punches: [] };
      punchesByKey[k].punches.push(h);
    }

    const zkSintetizadas = [];
    for (const k of Object.keys(punchesByKey)) {
      const { empleado_id, fecha, punches } = punchesByKey[k];
      const ordenados = [...new Set(punches)].sort();
      if (ordenados.length === 0) continue;

      // Caso 1 punch: día incompleto
      if (ordenados.length === 1) {
        zkSintetizadas.push({ empleado_id, fecha, entrada: ordenados[0], salida: "", entrada_2: null, salida_2: null, origen: "reloj" });
        continue;
      }

      // ¿Hay evidencia de turno partido? Necesitamos al menos 3 punches Y un
      // gap grande que deje ≥2 punches en b1 (entrada+salida) y ≥1 en b2 (re-entrada).
      // Escanear gaps y elegir el mayor >= GAP_MIN_TURNO_PARTIDO como divisoria.
      let splitIdx = -1;   // ordenados[splitIdx] es el 1er punch del bloque 2
      let mayorGap = 0;
      if (ordenados.length >= 3) {
        for (let i = 1; i < ordenados.length; i++) {
          const gap = toMin(ordenados[i]) - toMin(ordenados[i - 1]);
          if (gap >= GAP_MIN_TURNO_PARTIDO && gap > mayorGap && i >= 2) {
            mayorGap = gap;
            splitIdx = i;
          }
        }
      }

      if (splitIdx > 0) {
        // Turno partido: b1 = ordenados[0..splitIdx-1], b2 = ordenados[splitIdx..fin]
        const b1 = ordenados.slice(0, splitIdx);
        const b2 = ordenados.slice(splitIdx);
        zkSintetizadas.push({
          empleado_id, fecha,
          entrada: b1[0],
          salida:  b1[b1.length - 1],
          entrada_2: b2[0],
          salida_2:  b2.length > 1 ? b2[b2.length - 1] : "",  // 2do bloque en curso
          origen: "reloj",
        });
      } else {
        // 1 solo turno: min = entrada, max = salida (aunque el gap sea grande,
        // como 08:00 y 17:00 sin punches intermedios → entró y salió normal).
        zkSintetizadas.push({
          empleado_id, fecha,
          entrada: ordenados[0],
          salida:  ordenados[ordenados.length - 1],
          entrada_2: null, salida_2: null,
          origen: "reloj",
        });
      }
    }
    const marcacionesUnificadas = [...(marcsRes.data || []), ...zkSintetizadas];

    setEmpleados(empsRes.data || []);
    setNovedades(novsRes.data || []);
    setMarcaciones(marcacionesUnificadas);
    setDepartamentos(deptosRes.data || []);
    setAprobaciones(aprobsRes.data || []);
    setHorarios(horsRes.data || []);
    setLoading(false);
  }, [periodo.desde, periodo.hasta]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calcular nómina por empleado
  const nominaPorEmpleado = useMemo(() => {
    return empleados.map(emp => {
      const novsEmp  = novedades.filter(n => n.empleado_loggro_id === emp.id);
      const marcsEmp = marcaciones.filter(m => m.empleado_id === emp.id);
      const calc = calcularNominaEmpleado({
        empleado: emp,
        periodo,
        novedades: novsEmp,
        marcaciones: marcsEmp,
        ventana,
      });
      return { empleado: emp, calc };
    });
  }, [empleados, novedades, marcaciones, periodo, ventana]);

  // Departamentos visibles según rol/supervisor
  // - super_admin/admin/direccion → todos
  // - resto → solo aquellos donde supervisor_email = mi email
  const deptosVisibles = useMemo(() => {
    if (esAdmin) return departamentos;
    const em = String(currentUser.email || "").toLowerCase();
    return departamentos.filter(d => String(d.supervisor_email || "").toLowerCase() === em);
  }, [departamentos, esAdmin, currentUser.email]);

  const deptosVisiblesIds = useMemo(() => new Set(deptosVisibles.map(d => d.id)), [deptosVisibles]);

  // Aprobaciones indexadas por departamento_id
  const aprobPorDepto = useMemo(() => {
    const m = {};
    for (const a of aprobaciones) m[a.departamento_id] = a;
    return m;
  }, [aprobaciones]);

  // Filtros: por depto (según rol) + búsqueda + selector manual (admin)
  const empleadosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = nominaPorEmpleado.filter(({ empleado: e }) => {
      // Si NO es admin, solo empleados de sus deptos supervisados
      if (!esAdmin && !deptosVisiblesIds.has(e.departamento_id)) return false;
      // Admin puede filtrar por depto opcional
      if (deptoFiltro && e.departamento_id !== deptoFiltro) return false;
      return true;
    });
    if (q) {
      base = base.filter(({ empleado: e }) => {
        const haystack = `${e.nombres} ${e.apellidos} ${e.cargo || ""} ${e.cedula || ""}`.toLowerCase();
        return haystack.includes(q);
      });
    }
    return base;
  }, [nominaPorEmpleado, search, esAdmin, deptosVisiblesIds, deptoFiltro]);

  // Departamento "activo" para las acciones (aprobar/desaprobar).
  // Si el operador filtra por uno específico → ese. Si es supervisor de solo 1 → ese.
  const deptoActivoId = deptoFiltro || (deptosVisibles.length === 1 ? deptosVisibles[0].id : "");
  const deptoActivo = departamentos.find(d => d.id === deptoActivoId);
  const aprobActiva = deptoActivoId ? aprobPorDepto[deptoActivoId] : null;
  const deptoAprobado = aprobActiva?.estado === "aprobado";
  const puedeAprobar = !!deptoActivoId && !deptoAprobado &&
    (esAdmin || (deptoActivo && String(deptoActivo.supervisor_email || "").toLowerCase() === String(currentUser.email || "").toLowerCase()));

  // Aprobar / Desaprobar
  const handleAprobar = async () => {
    if (!deptoActivoId || aprobando) return;
    if (!confirm(`¿Aprobar nómina del departamento "${deptoActivo?.nombre}" para ${periodo.etiqueta}?\n\nDespués de aprobar, no se podrán editar marcaciones ni novedades hasta que un administrador desapruebe.`)) return;
    setAprobando(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("nomina_aprobaciones").upsert({
        periodo_key: periodoKey,
        departamento_id: deptoActivoId,
        estado: "aprobado",
        supervisor_email: currentUser.email,
        aprobado_at: nowIso,
        desaprobado_por: null,
        desaprobado_at: null,
        updated_at: nowIso,
      }, { onConflict: "periodo_key,departamento_id" });
      if (error) throw error;
      logAccion({ modulo: "nomina", accion: "aprobar_depto", tabla: "nomina_aprobaciones",
                  registroId: `${periodoKey}_${deptoActivoId}`,
                  notas: `${deptoActivo?.nombre} · ${periodo.etiqueta}` });
      await fetchData();
    } catch (e) {
      alert(`❌ Error al aprobar: ${e.message || e}`);
    } finally {
      setAprobando(false);
    }
  };

  const handleDesaprobar = async () => {
    if (!deptoActivoId || !esAdmin || aprobando) return;
    if (!confirm(`¿Desaprobar la nómina del departamento "${deptoActivo?.nombre}"?\n\nEl supervisor volverá a poder editar marcaciones y novedades.`)) return;
    setAprobando(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("nomina_aprobaciones").upsert({
        periodo_key: periodoKey,
        departamento_id: deptoActivoId,
        estado: "borrador",
        desaprobado_por: currentUser.email,
        desaprobado_at: nowIso,
        updated_at: nowIso,
      }, { onConflict: "periodo_key,departamento_id" });
      if (error) throw error;
      logAccion({ modulo: "nomina", accion: "desaprobar_depto", tabla: "nomina_aprobaciones",
                  registroId: `${periodoKey}_${deptoActivoId}`,
                  notas: `${deptoActivo?.nombre} · ${periodo.etiqueta}` });
      await fetchData();
    } catch (e) {
      alert(`❌ Error al desaprobar: ${e.message || e}`);
    } finally {
      setAprobando(false);
    }
  };

  // Totales generales
  const totales = useMemo(() => {
    const t = { neto: 0, devengado: 0, deducciones: 0, base: 0, aux: 0, extras: 0, descuentos: 0 };
    for (const { calc } of empleadosFiltrados) {
      t.neto       += calc.neto;
      t.devengado  += calc.devengado.subtotal;
      t.deducciones += calc.deducciones.subtotal;
      t.base       += calc.devengado.salario_base_periodo;
      t.aux        += calc.devengado.auxilio_transporte;
      t.extras     += calc.devengado.extras_recargos_bonos;
      t.descuentos += calc.deducciones.otros_descuentos;
    }
    return t;
  }, [empleadosFiltrados]);

  // Bloqueo por aprobación: si el depto del empleado está aprobado,
  // no se puede editar marcaciones ni novedades hasta que admin desapruebe.
  const empleadoBloqueado = (empleadoId) => {
    const emp = empleados.find(e => e.id === empleadoId);
    if (!emp) return false;
    const a = aprobPorDepto[emp.departamento_id];
    return a?.estado === "aprobado";
  };

  // Agregar novedad
  const handleAddNovedad = async (novedadData) => {
    try {
      if (empleadoBloqueado(novedadData.empleado_loggro_id)) {
        alert("Este departamento ya está aprobado para el período. Un administrador debe desaprobar antes de editar.");
        return;
      }
      const { error } = await supabase.from("empleados_loggro_novedades").insert({
        ...novedadData,
        loggro_novedad_id: `MAN-${Date.now()}`,
        raw_payload: { source: "ProcesarNomina manual", created_at: new Date().toISOString() },
      });
      if (error) throw error;
      setAddNovedadEmp(null);
      await fetchData();
      logAccion({ modulo: "nomina", accion: "agregar_novedad", tabla: "empleados_loggro_novedades",
                  registroId: novedadData.empleado_loggro_id,
                  notas: `${novedadData.tipo} · ${COP(novedadData.valor)}` });
    } catch (e) {
      alert(`❌ Error guardando novedad: ${e.message || e}`);
    }
  };

  const handleDeleteNovedad = async (novedad) => {
    if (empleadoBloqueado(novedad.empleado_loggro_id)) {
      alert("Este departamento ya está aprobado para el período. Un administrador debe desaprobar antes de editar.");
      return;
    }
    if (!confirm(`¿Eliminar novedad "${NOVEDAD_TIPOS[novedad.tipo]?.label || novedad.tipo}" de ${COP(novedad.valor)}?`)) return;
    try {
      const { error } = await supabase.from("empleados_loggro_novedades").delete().eq("id", novedad.id);
      if (error) throw error;
      await fetchData();
    } catch (e) {
      alert(`❌ Error: ${e.message || e}`);
    }
  };

  // Guardar marcaciones — con motivo obligatorio si hay cambios y auditoría.
  // `motivo` viene del modal de MarcacionesGrid; si es null (nunca debería para
  // ediciones), no se guarda.
  const handleSaveMarcaciones = async (empleadoId, filas, motivo) => {
    try {
      if (empleadoBloqueado(empleadoId)) {
        alert("Este departamento ya está aprobado para el período. Un administrador debe desaprobar antes de editar.");
        return false;
      }
      if (!motivo || String(motivo).trim().length < 3) {
        alert("Debes escribir la razón del cambio (mínimo 3 caracteres).");
        return false;
      }
      const nowIso = new Date().toISOString();
      // Guardar cualquier fila con AL MENOS entrada o salida (permite corrección
      // parcial: registra solo la entrada de hoy y la salida se completa después).
      // Antes se requería AMBAS → si el usuario corregía solo entrada, la fila
      // quedaba en limbo (no entraba a `llenas` ni a `vacias`) y el save era
      // silencioso — el modal cerraba, motivo se guardaba en logAccion, pero la
      // marcación no se persistía en rh_marcaciones.
      const llenas = filas
        .filter(f => f.entrada || f.salida || f.entrada_2 || f.salida_2)
        .map(f => ({
          empleado_id: empleadoId, fecha: f.fecha,
          entrada: f.entrada || null,
          salida:  f.salida  || null,
          entrada_2: f.entrada_2 || null,
          salida_2:  f.salida_2  || null,
          periodo: periodo.etiqueta, updated_at: nowIso,
          editado_por: currentUser.email || null,
          editado_at: nowIso,
          motivo_edicion: motivo.trim(),
          origen: "ajuste_supervisor",
        }));
      const vacias = filas.filter(f => !f.entrada && !f.salida && !f.entrada_2 && !f.salida_2).map(f => f.fecha);
      if (llenas.length) {
        const { error } = await supabase.from("rh_marcaciones")
          .upsert(llenas, { onConflict: "empleado_id,fecha" });
        if (error) throw error;
      }
      if (vacias.length) {
        const { error } = await supabase.from("rh_marcaciones")
          .delete().eq("empleado_id", empleadoId).in("fecha", vacias);
        if (error) throw error;
      }
      await fetchData();
      logAccion({ modulo: "nomina", accion: "editar_marcaciones", tabla: "rh_marcaciones",
                  registroId: empleadoId,
                  notas: `${llenas.length} día(s) · ${periodo.etiqueta} · Motivo: ${motivo.slice(0,80)}` });
      return true;
    } catch (e) {
      alert(`❌ Error guardando marcaciones: ${e.message || e}`);
      return false;
    }
  };

  // Guardar nómina consolidada (registros 1 por empleado)
  const procesarYGuardar = async () => {
    if (saving) return;
    if (!confirm(`¿Guardar nómina de ${empleadosFiltrados.length} empleados para ${periodo.etiqueta}?\nNeto total: ${COP(totales.neto)}`)) return;
    setSaving(true);
    try {
      const rows = empleadosFiltrados
        .filter(({ calc }) => calc.neto > 0)
        .map(({ empleado, calc }) => ({
          fecha: periodo.hasta,    // último día del período como referencia
          empleado_loggro_id: empleado.id,
          nombre: `${empleado.nombres} ${empleado.apellidos}`,
          documento: empleado.cedula,
          cargo: empleado.cargo,
          area: empleado.departamento_id,
          valor_dia: calc.devengado.salario_ordinario,
          horas: calc.marcaciones?.horas ?? calc.dias_trabajados * 8,
          transporte: calc.devengado.auxilio_transporte,
          // recargos de ley + horas extra + bonos manuales
          bonificacion: calc.devengado.total_recargos + calc.devengado.total_extras + calc.devengado.extras_recargos_bonos,
          deducciones: calc.deducciones.subtotal,
          total: calc.neto,
          metodo_pago: "transferencia",
          pagado: false,
          notas: [
            periodo.etiqueta,
            calc.marcaciones ? `${calc.marcaciones.horas}h (${calc.dias_trabajados} días)` : null,
            calc.dias_no_trabajados > 0 ? `−${calc.dias_no_trabajados} día(s) faltas` : null,
            `Devengado ${COP(calc.devengado.subtotal)} − Deducciones ${COP(calc.deducciones.subtotal)}`,
          ].filter(Boolean).join(" · "),
          registrado_por: "ProcesarNomina",
        }));
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from("nomina_por_dia").upsert(batch, { onConflict: "fecha,empleado_loggro_id" });
        if (error) throw error;
      }
      logAccion({ modulo: "nomina", accion: "procesar_nomina", tabla: "nomina_por_dia",
                  registroId: `${periodo.desde}_${periodo.hasta}`,
                  notas: `${rows.length} empleados · neto total ${COP(totales.neto)}` });
      alert(`✅ Nómina guardada\n\n${rows.length} empleados · ${COP(totales.neto)} neto total\n\nRevisa el módulo "Nómina Día" para aprobar los pagos.`);
    } catch (e) {
      alert(`❌ Error: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const periodosPresets = useMemo(() => [
    { label: quincenaActual().etiqueta + " (actual)", value: quincenaActual() },
    { label: quincenaAnterior().etiqueta + " (anterior)", value: quincenaAnterior() },
  ], []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? 16 : 24, color: B.white, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, color: B.sand, margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>💵 Procesar Nómina</h1>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
          Salario base + novedades del período · Aportes 8% (salud + pensión) · Aux. transporte si ≤ 2 SMMLV
        </div>
      </div>

      {/* Selector de período */}
      <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 220px" }}>
          <label style={LS}>Período (quincena)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {periodosPresets.map(p => {
              const isActive = p.value.desde === periodo.desde && p.value.hasta === periodo.hasta;
              return (
                <button key={p.label} onClick={() => setPeriodo(p.value)} style={{
                  background: isActive ? B.sand : "rgba(255,255,255,0.06)",
                  color: isActive ? B.navy : B.white,
                  border: `1px solid ${isActive ? B.sand : B.navyLight}`,
                  borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}>{p.label}</button>
              );
            })}
          </div>
        </div>
        <div>
          <label style={LS}>Desde</label>
          <input type="date" value={periodo.desde} onChange={e => setPeriodo(p => ({ ...p, desde: e.target.value, etiqueta: "Personalizado" }))} style={{ ...IS, width: 160 }} />
        </div>
        <div>
          <label style={LS}>Hasta</label>
          <input type="date" value={periodo.hasta} onChange={e => setPeriodo(p => ({ ...p, hasta: e.target.value, etiqueta: "Personalizado" }))} style={{ ...IS, width: 160 }} />
        </div>
        <div style={{ flexBasis: "100%", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
          🗓 {periodo.etiqueta} — marcaciones y novedades del{" "}
          <b style={{ color: B.white }}>{ventana.desde} → {ventana.hasta}</b>
        </div>
      </div>

      {/* Departamento + Aprobación */}
      {(deptosVisibles.length > 0 || esAdmin) && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 16, marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 260px" }}>
            <label style={LS}>Departamento</label>
            {esAdmin ? (
              <select value={deptoFiltro} onChange={e => setDeptoFiltro(e.target.value)} style={{ ...IS, width: "100%" }}>
                <option value="">Todos los departamentos</option>
                {departamentos.map(d => {
                  const a = aprobPorDepto[d.id];
                  const est = a?.estado === "aprobado" ? " · ✅ Aprobado" : " · ⏳ Pendiente";
                  return <option key={d.id} value={d.id}>{d.nombre}{est}</option>;
                })}
              </select>
            ) : deptosVisibles.length > 1 ? (
              <select value={deptoFiltro} onChange={e => setDeptoFiltro(e.target.value)} style={{ ...IS, width: "100%" }}>
                <option value="">Todos mis departamentos</option>
                {deptosVisibles.map(d => {
                  const a = aprobPorDepto[d.id];
                  const est = a?.estado === "aprobado" ? " · ✅ Aprobado" : " · ⏳ Pendiente";
                  return <option key={d.id} value={d.id}>{d.nombre}{est}</option>;
                })}
              </select>
            ) : (
              <div style={{ ...IS, background: "transparent", padding: "9px 12px" }}>
                {deptosVisibles[0]?.nombre || "(sin departamentos asignados)"}
              </div>
            )}
          </div>

          {/* Estado de aprobación del depto activo */}
          {deptoActivoId && (
            <div style={{ flex: "1 1 280px" }}>
              <label style={LS}>Estado</label>
              <div style={{
                padding: "9px 12px", borderRadius: 8,
                background: deptoAprobado ? B.success + "22" : B.warning + "18",
                border: `1px solid ${deptoAprobado ? B.success + "66" : B.warning + "44"}`,
                fontSize: 12, color: deptoAprobado ? B.success : B.warning,
              }}>
                {deptoAprobado
                  ? <>✅ Aprobado por <b>{aprobActiva.supervisor_email}</b> · {new Date(aprobActiva.aprobado_at).toLocaleString("es-CO")}</>
                  : <>⏳ Pendiente de aprobación</>}
              </div>
            </div>
          )}

          {/* Botones aprobar / desaprobar */}
          <div style={{ display: "flex", gap: 8 }}>
            {puedeAprobar && (
              <button onClick={handleAprobar} disabled={aprobando}
                style={{ background: aprobando ? B.navyLight : B.success, color: B.white, border: "none", borderRadius: 10, padding: "10px 18px", cursor: aprobando ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, opacity: aprobando ? 0.6 : 1 }}>
                {aprobando ? "…" : "✓ Aprobar nómina"}
              </button>
            )}
            {esAdmin && deptoAprobado && (
              <button onClick={handleDesaprobar} disabled={aprobando}
                style={{ background: aprobando ? B.navyLight : B.warning, color: B.navy, border: "none", borderRadius: 10, padding: "10px 18px", cursor: aprobando ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, opacity: aprobando ? 0.6 : 1 }}>
                {aprobando ? "…" : "↺ Desaprobar"}
              </button>
            )}
          </div>

          {!esAdmin && deptosVisibles.length === 0 && (
            <div style={{ flexBasis: "100%", fontSize: 12, color: B.warning }}>
              ⚠️ No tienes departamentos asignados como supervisor. Contacta al administrador.
            </div>
          )}
        </div>
      )}

      {/* KPIs — solo admin ve montos. Supervisor solo ve empleados + horas. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <Kpi label="Empleados activos" value={empleadosFiltrados.length} color={B.sky} />
        {(() => {
          const totHoras = empleadosFiltrados.reduce((s, x) => s + (x.calc.marcaciones?.horas || 0), 0);
          const totExtra = empleadosFiltrados.reduce((s, x) => s + (x.calc.marcaciones?.horas_extra || 0), 0);
          const totFaltas = empleadosFiltrados.reduce((s, x) => s + (x.calc.dias_no_trabajados || 0), 0);
          return (
            <>
              <Kpi label="Horas totales" value={`${totHoras.toFixed(1)} h`} sub={`${totExtra.toFixed(1)}h extra`} color={B.sand} />
              <Kpi label="Faltas" value={`${totFaltas} día(s)`} color={totFaltas > 0 ? B.warning : B.success} />
            </>
          );
        })()}
        {esAdmin && (
          <>
            <Kpi label="Salario ordinario" value={COP(totales.base)} sub="95.33 h/quincena × empleados" />
            <Kpi label="Aux. transporte" value={COP(totales.aux)} sub={`${AUX_TRANSPORTE_2026.toLocaleString("es-CO")} máx/mes`} />
            <Kpi label="Novedades + (bonos/extras)" value={COP(totales.extras)} color={B.success} />
            <Kpi label="Novedades − (descuentos)" value={COP(totales.descuentos)} color={B.warning} />
            <Kpi label="NETO A PAGAR" value={COP(totales.neto)} color={B.sand} sub={`Devengado ${COP(totales.devengado)} − Deducciones ${COP(totales.deducciones)}`} />
          </>
        )}
      </div>

      {/* Filtros + acción (guardar nómina consolidada solo admin) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input type="search" placeholder="🔍 Buscar por nombre, cédula, cargo…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...IS, flex: "1 1 280px", maxWidth: 440 }} />
        {esAdmin && (
          <button onClick={procesarYGuardar} disabled={saving || loading || empleadosFiltrados.length === 0} style={{
            background: saving ? B.navyLight : B.success, color: B.white, border: "none", borderRadius: 10,
            padding: "10px 20px", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13,
            opacity: saving ? 0.6 : 1,
          }}>
            {saving ? "Guardando…" : `💾 Guardar nómina (${empleadosFiltrados.length})`}
          </button>
        )}
      </div>

      {/* Tabla — supervisor ve solo horas/faltas; admin ve montos completos */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: B.sand }}>Cargando…</div>
      ) : empleadosFiltrados.length === 0 ? (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center", color: "rgba(255,255,255,0.55)" }}>
          Sin empleados que coincidan.
        </div>
      ) : esAdmin ? (
        // ── Vista admin: tabla completa con montos ──
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <th style={thStyle}>Empleado</th>
                <th style={thStyle}>Cargo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Base período</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Aux. transp.</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Novedades +</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Aportes</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Desc.</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Neto</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {empleadosFiltrados.map(({ empleado, calc }) => (
                <tr key={empleado.id} onClick={() => setDetalleEmpleado(empleado)}
                  style={{ borderTop: `1px solid ${B.navyLight}33`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {empleado.nombres} {empleado.apellidos}
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>CC: {empleado.cedula || "—"}</div>
                  </td>
                  <td style={{ ...tdStyle, color: "rgba(255,255,255,0.6)" }}>{empleado.cargo || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: B.sky }}>
                    {calc.marcaciones?.horas || 0}h
                    {(calc.marcaciones?.horas_extra || 0) > 0 && <div style={{ fontSize: 10, color: B.sand }}>+{calc.marcaciones.horas_extra}h ex</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: calc.dias_no_trabajados > 0 ? B.warning : B.white }}>
                    {COP(calc.devengado.salario_base_periodo)}
                    {calc.dias_no_trabajados > 0 && <div style={{ fontSize: 10, color: B.warning }}>−{calc.dias_no_trabajados} falta(s)</div>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: calc.devengado.auxilio_transporte > 0 ? B.white : "rgba(255,255,255,0.3)" }}>
                    {calc.devengado.auxilio_transporte > 0 ? COP(calc.devengado.auxilio_transporte) : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: calc.devengado.extras_recargos_bonos > 0 ? B.success : "rgba(255,255,255,0.3)" }}>
                    {calc.devengado.extras_recargos_bonos > 0 ? "+" + COP(calc.devengado.extras_recargos_bonos) : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: B.warning + "AA" }}>−{COP(calc.deducciones.aporte_salud + calc.deducciones.aporte_pension)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: calc.deducciones.otros_descuentos > 0 ? B.warning : "rgba(255,255,255,0.3)" }}>
                    {calc.deducciones.otros_descuentos > 0 ? "−" + COP(calc.deducciones.otros_descuentos) : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 15 }}>
                    {COP(calc.neto)}
                  </td>
                  <td style={{ ...tdStyle, color: B.sky }}>→</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "rgba(200,185,154,0.05)", borderTop: `2px solid ${B.sand}` }}>
                <td style={{ ...tdStyle, fontWeight: 700 }} colSpan={2}>TOTAL {empleadosFiltrados.length} empl.</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: B.sky }}>{empleadosFiltrados.reduce((s, x) => s + (x.calc.marcaciones?.horas || 0), 0).toFixed(1)}h</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{COP(totales.base)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{COP(totales.aux)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: B.success, fontWeight: 700 }}>+{COP(totales.extras)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: B.warning, fontWeight: 700 }}>−{COP(totales.deducciones - totales.descuentos)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: B.warning, fontWeight: 700 }}>−{COP(totales.descuentos)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18 }}>
                  {COP(totales.neto)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        // ── Vista supervisor: solo horas, sin ningún monto ──
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ fontSize: 13, minWidth: 560 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <th style={thStyle}>Empleado</th>
                <th style={thStyle}>Cargo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Días trabajados</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Horas ordinarias</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Horas extra</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Faltas</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {empleadosFiltrados.map(({ empleado, calc }) => {
                const horas = calc.marcaciones?.horas || 0;
                const hOrd = calc.marcaciones?.horas_ordinarias || 0;
                const hExt = calc.marcaciones?.horas_extra || 0;
                return (
                  <tr key={empleado.id} onClick={() => setDetalleEmpleado(empleado)}
                    style={{ borderTop: `1px solid ${B.navyLight}33`, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {empleado.nombres} {empleado.apellidos}
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>CC: {empleado.cedula || "—"}</div>
                    </td>
                    <td style={{ ...tdStyle, color: "rgba(255,255,255,0.6)" }}>{empleado.cargo || "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{calc.dias_trabajados}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: B.sky }}>{hOrd}h</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: hExt > 0 ? B.sand : "rgba(255,255,255,0.3)" }}>
                      {hExt > 0 ? `+${hExt}h` : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: calc.dias_no_trabajados > 0 ? B.warning : "rgba(255,255,255,0.3)" }}>
                      {calc.dias_no_trabajados > 0 ? `${calc.dias_no_trabajados} día(s)` : "—"}
                    </td>
                    <td style={{ ...tdStyle, color: B.sky }}>→</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "rgba(200,185,154,0.05)", borderTop: `2px solid ${B.sand}` }}>
                <td style={{ ...tdStyle, fontWeight: 700 }} colSpan={2}>TOTAL {empleadosFiltrados.length} empl.</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{empleadosFiltrados.reduce((s, x) => s + x.calc.dias_trabajados, 0)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: B.sky }}>{empleadosFiltrados.reduce((s, x) => s + (x.calc.marcaciones?.horas_ordinarias || 0), 0).toFixed(1)}h</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: B.sand }}>+{empleadosFiltrados.reduce((s, x) => s + (x.calc.marcaciones?.horas_extra || 0), 0).toFixed(1)}h</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: B.warning }}>{empleadosFiltrados.reduce((s, x) => s + x.calc.dias_no_trabajados, 0)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Drawer detalle */}
      {detalleEmpleado && (
        <DetalleDrawer
          empleado={detalleEmpleado}
          calc={nominaPorEmpleado.find(x => x.empleado.id === detalleEmpleado.id)?.calc}
          allNovedades={novedades}
          periodo={periodo}
          ventana={ventana}
          marcaciones={marcaciones.filter(m => m.empleado_id === detalleEmpleado.id)}
          horariosProgramados={horarios.filter(h => h.empleado_id === detalleEmpleado.id)}
          bloqueado={empleadoBloqueado(detalleEmpleado.id)}
          esAdmin={esAdmin}
          onSaveMarcaciones={handleSaveMarcaciones}
          onClose={() => setDetalleEmpleado(null)}
          onAddNovedad={() => setAddNovedadEmp(detalleEmpleado)}
          onDeleteNovedad={handleDeleteNovedad}
        />
      )}

      {/* Modal agregar novedad — defaults a la ventana de novedades */}
      {addNovedadEmp && (
        <AddNovedadModal
          empleado={addNovedadEmp}
          periodo={ventana}
          onSave={handleAddNovedad}
          onClose={() => setAddNovedadEmp(null)}
        />
      )}
    </div>
  );
}
