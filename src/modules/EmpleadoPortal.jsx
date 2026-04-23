import React, { useState, useCallback, useEffect, useMemo } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const DIA_NOMBRES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
function startOfWeekEP(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDaysEP(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function toISODateEP(d) { return d.toISOString().slice(0, 10); }

export default function EmpleadoPortal() {
  useEffect(() => { document.title = "Portal Empleados — Atolón"; }, []);
  const [loggedIn, setLoggedIn] = useState(false);
  const [cedula, setCedula] = useState("");
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState("horario");
  const [emp, setEmp] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeekEP(new Date()));
  const [horariosSemana, setHorariosSemana] = useState([]);
  const [plantillas, setPlantillas] = useState([]);

  const handleLogin = useCallback(async () => {
    if (!cedula) return;
    if (!supabase) { setLoginError("Base de datos no conectada"); return; }
    // Nueva tabla rh_empleados
    const { data, error } = await supabase
      .from("rh_empleados")
      .select("*")
      .eq("cedula", cedula)
      .eq("activo", true)
      .maybeSingle();
    if (error || !data) { setLoginError("Cédula no encontrada o empleado inactivo"); return; }
    const nombre = `${data.nombres || ""} ${data.apellidos || ""}`.trim();
    setEmp({
      id: data.id,
      nombre,
      cedula: data.cedula,
      cargo: data.cargo || "",
      area: data.departamento_nombre || data.area || "",
      salario: data.salario_base || 0,
      desde: data.fecha_ingreso || "",
    });
    document.title = `${nombre.split(" ")[0] || "Empleado"} — Portal · Atolón`;
    setLoggedIn(true);
    setLoginError("");
  }, [cedula]);

  // Cargar horarios de la semana
  useEffect(() => {
    if (!loggedIn || !emp?.id || !supabase) return;
    const ini = toISODateEP(weekStart);
    const fin = toISODateEP(addDaysEP(weekStart, 6));
    Promise.all([
      supabase.from("rh_horarios").select("*").eq("empleado_id", emp.id).gte("fecha", ini).lte("fecha", fin),
      supabase.from("rh_turno_plantillas").select("*").eq("activo", true),
    ]).then(([hR, pR]) => {
      setHorariosSemana(hR.data || []);
      setPlantillas(pR.data || []);
    });
  }, [loggedIn, emp?.id, weekStart]);

  const semanaData = useMemo(() => {
    const pMap = {};
    plantillas.forEach(p => { pMap[p.id] = p; });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDaysEP(weekStart, i);
      const iso = toISODateEP(d);
      const h = horariosSemana.find(x => x.fecha === iso);
      const p = h?.plantilla_id ? pMap[h.plantilla_id] : null;
      return { fecha: d, iso, dia: DIA_NOMBRES[i], horario: h, plantilla: p };
    });
  }, [weekStart, horariosSemana, plantillas]);

  const horasSemana = useMemo(() => {
    return semanaData.reduce((total, d) => {
      const h = d.horario;
      if (!h || h.tipo !== "turno" || !h.hora_ini || !h.hora_fin) return total;
      const [hi, mi] = h.hora_ini.split(":").map(Number);
      const [hf, mf] = h.hora_fin.split(":").map(Number);
      let diff = (hf * 60 + mf) - (hi * 60 + mi);
      if (diff < 0) diff += 24 * 60;
      return total + diff / 60;
    }, 0);
  }, [semanaData]);

  const fmtWeekLabelEP = (ini) => {
    const fin = addDaysEP(ini, 6);
    const mes = (dt) => dt.toLocaleDateString("es-CO", { month: "short" });
    return `${ini.getDate()} – ${fin.getDate()} ${mes(fin)} ${fin.getFullYear()}`;
  };

  if (!loggedIn) {
    return (
      <div style={{ minHeight: "100vh", background: B.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: B.navyMid, borderRadius: 16, padding: 40, width: 380, textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 12,
            background: `linear-gradient(135deg, ${B.sand}, ${B.sky})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", fontSize: 28, fontWeight: 700, color: B.navy,
          }}>A</div>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, marginBottom: 4 }}>Portal Empleados</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 28 }}>Atolon Beach Club</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input value={cedula} onChange={e => setCedula(e.target.value)} placeholder="Cedula"
              style={{ padding: "12px 16px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, textAlign: "center" }} />
            <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN (4 digitos)"
              maxLength={4}
              style={{ padding: "12px 16px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, textAlign: "center", letterSpacing: 8 }} />
            {loginError && <div style={{ color: B.danger, fontSize: 13, textAlign: "center" }}>{loginError}</div>}
            <button onClick={handleLogin}
              style={{ padding: "14px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 8 }}>
              Ingresar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: B.navy }}>
      <div style={{
        padding: "16px 28px", background: B.navyMid, display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${B.navyLight}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `linear-gradient(135deg, ${B.sand}, ${B.sky})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: B.navy }}>A</div>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 600 }}>Portal Empleados</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13 }}>{emp.nombre}</span>
          <button onClick={() => setLoggedIn(false)} style={{ padding: "6px 14px", borderRadius: 6, background: B.navyLight, color: B.white, border: "none", fontSize: 12, cursor: "pointer" }}>Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: 28 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {[
            { key: "horario", label: "Mi Horario" },
            { key: "nomina", label: "Nomina" },
            { key: "solicitudes", label: "Solicitudes" },
            { key: "perfil", label: "Mi Perfil" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: tab === t.key ? B.sand : B.navyMid, color: tab === t.key ? B.navy : B.white,
            }}>{t.label}</button>
          ))}
        </div>

        {tab === "horario" && (
          <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: 16, margin: 0 }}>Horario Semanal</h3>
                <div style={{ fontSize: 11, color: B.sand, marginTop: 4, fontWeight: 700, letterSpacing: "0.03em" }}>{fmtWeekLabelEP(weekStart)}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setWeekStart(addDaysEP(weekStart, -7))}
                  style={{ padding: "6px 12px", borderRadius: 6, background: B.navyLight, color: "#fff", border: "none", cursor: "pointer", fontSize: 12 }}>‹</button>
                <button onClick={() => setWeekStart(startOfWeekEP(new Date()))}
                  style={{ padding: "6px 12px", borderRadius: 6, background: B.sand, color: B.navy, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Hoy</button>
                <button onClick={() => setWeekStart(addDaysEP(weekStart, 7))}
                  style={{ padding: "6px 12px", borderRadius: 6, background: B.navyLight, color: "#fff", border: "none", cursor: "pointer", fontSize: 12 }}>›</button>
              </div>
            </div>
            {semanaData.map((d, i) => {
              const isToday = d.iso === toISODateEP(new Date());
              const p = d.plantilla;
              const h = d.horario;
              const isDescanso = h?.tipo === "descanso";
              const isVacacion = h?.tipo === "vacacion";
              const isAusencia = h?.tipo === "ausencia";
              const isOff = isDescanso || isVacacion || isAusencia;
              return (
                <div key={d.iso} style={{
                  padding: "16px 20px",
                  borderBottom: i < semanaData.length - 1 ? `1px solid ${B.navyLight}` : "none",
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                  background: isToday ? `${B.sky}11` : isOff ? "rgba(255,255,255,0.02)" : "transparent",
                  borderLeft: isToday ? `3px solid ${B.sky}` : "3px solid transparent",
                }}>
                  <div style={{ minWidth: 120 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{d.dia}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{d.fecha.getDate()}/{d.fecha.getMonth() + 1}</div>
                  </div>
                  {!h ? (
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Sin asignar</div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: p?.color || B.white }}>
                          {p?.nombre || (isDescanso ? "Descanso" : isVacacion ? "Vacación" : isAusencia ? "Ausencia" : "Turno")}
                        </div>
                        {h.hora_ini && h.hora_fin && (
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                            {h.hora_ini.slice(0, 5)} – {h.hora_fin.slice(0, 5)}
                          </div>
                        )}
                      </div>
                      {p && (
                        <div style={{
                          width: 44, height: 44, borderRadius: 10,
                          background: `${p.color}22`, border: `2px solid ${p.color}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 15, fontWeight: 800, color: p.color,
                          fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em",
                        }}>
                          {p.codigo || p.nombre[0]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ padding: "14px 20px", background: B.navy, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Total horas semana</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>
                {horasSemana > 0 ? `${horasSemana.toFixed(1)} h` : "—"}
              </span>
            </div>
          </div>
        )}

        {tab === "nomina" && (
          <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${B.navyLight}` }}>
              <h3 style={{ fontSize: 16 }}>Comprobantes de Nomina</h3>
            </div>
            {[].map((p, i) => (
              <div key={i} style={{ padding: "16px 20px", borderBottom: i < [].length - 1 ? `1px solid ${B.navyLight}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{p.periodo}</span>
                <div style={{ display: "flex", gap: 24, fontSize: 13 }}>
                  <span>Bruto: {COP(p.bruto)}</span>
                  <span style={{ color: B.danger }}>Deduc: {COP(p.deducciones)}</span>
                  <span style={{ color: B.success, fontWeight: 700 }}>Neto: {COP(p.neto)}</span>
                </div>
                <button style={{ padding: "6px 12px", borderRadius: 6, background: B.navyLight, color: B.white, border: "none", fontSize: 12, cursor: "pointer" }}>PDF</button>
              </div>
            ))}
          </div>
        )}

        {tab === "solicitudes" && (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>Nueva Solicitud</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <select style={{ padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white }}>
                <option>Permiso personal</option>
                <option>Vacaciones</option>
                <option>Incapacidad</option>
                <option>Cambio de turno</option>
                <option>Otro</option>
              </select>
              <div style={{ display: "flex", gap: 12 }}>
                <input type="date" style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white }} />
                <input type="date" style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white }} />
              </div>
              <textarea placeholder="Descripcion..." rows={3} style={{ padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, resize: "vertical" }} />
              <button style={{ padding: "14px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Enviar Solicitud</button>
            </div>
          </div>
        )}

        {tab === "perfil" && (
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>Mi Perfil</h3>
            <div style={{ fontSize: 14, lineHeight: 2.5 }}>
              <div><span style={{ color: "rgba(255,255,255,0.5)", minWidth: 120, display: "inline-block" }}>Nombre:</span> {emp.nombre}</div>
              <div><span style={{ color: "rgba(255,255,255,0.5)", minWidth: 120, display: "inline-block" }}>Cedula:</span> {emp.cedula}</div>
              <div><span style={{ color: "rgba(255,255,255,0.5)", minWidth: 120, display: "inline-block" }}>Cargo:</span> {emp.cargo}</div>
              <div><span style={{ color: "rgba(255,255,255,0.5)", minWidth: 120, display: "inline-block" }}>Area:</span> {emp.area}</div>
              <div><span style={{ color: "rgba(255,255,255,0.5)", minWidth: 120, display: "inline-block" }}>Salario:</span> {COP(emp.salario)}</div>
              <div><span style={{ color: "rgba(255,255,255,0.5)", minWidth: 120, display: "inline-block" }}>Desde:</span> {emp.desde}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
