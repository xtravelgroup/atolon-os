import { useState, useCallback } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

export default function EmpleadoPortal() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [cedula, setCedula] = useState("");
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState("horario");
  const [emp, setEmp] = useState(null);
  const [loginError, setLoginError] = useState("");

  const handleLogin = useCallback(async () => {
    if (!cedula) return;
    if (supabase) {
      const { data, error } = await supabase.from("empleados").select("*").eq("cedula", cedula).eq("activo", true).single();
      if (error || !data) { setLoginError("Cedula no encontrada o empleado inactivo"); return; }
      setEmp({ id: data.id, nombre: data.nombre, cedula: data.cedula, cargo: data.cargo || "", area: data.area || "", salario: data.salario || 0, desde: data.fecha_ingreso || "", horarios: data.horarios || [] });
      setLoggedIn(true); setLoginError("");
    } else {
      setLoginError("Base de datos no conectada");
    }
  }, [cedula]);

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
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${B.navyLight}` }}>
              <h3 style={{ fontSize: 16 }}>Horario Semanal</h3>
            </div>
            {(emp?.horarios || []).map((s, i) => (
              <div key={i} style={{
                padding: "14px 20px", borderBottom: i < (emp?.horarios || []).length - 1 ? `1px solid ${B.navyLight}` : "none",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: s.turno === "Descanso" ? "rgba(255,255,255,0.02)" : "transparent",
              }}>
                <span style={{ fontWeight: 600, fontSize: 14, minWidth: 100 }}>{s.dia}</span>
                <span style={{ fontSize: 13, color: s.turno === "Descanso" ? B.sand : B.white }}>{s.turno}</span>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", minWidth: 100, textAlign: "right" }}>{s.bote}</span>
              </div>
            ))}
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
