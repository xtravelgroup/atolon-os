// Pantalla de éxito — muestra radicado + próximos pasos.

import { C } from "./constants";

export default function WizardExito({ radicado, tipo, workers, onRestart }) {
  const haveWorkers = tipo === "empresa" && workers && workers.length > 0;

  return (
    <div style={{ textAlign: "center", padding: "80px 28px 120px", maxWidth: 640, margin: "0 auto" }}>
      <div style={{
        width: 80, height: 80, background: C.success, color: C.white, borderRadius: "50%",
        margin: "0 auto 28px", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 40, fontWeight: 900,
      }}>✓</div>

      <h1 style={{ fontSize: 36, fontWeight: 900, color: C.navy, letterSpacing: -1, marginBottom: 12 }}>
        ¡Registro recibido!
      </h1>
      <p style={{ fontSize: 15, color: C.navyLight, lineHeight: 1.6, marginBottom: 28 }}>
        Su registro fue recibido correctamente. Nuestro Coordinador SST revisará la información y los documentos adjuntos, y le notificará la aprobación o cualquier corrección necesaria por correo electrónico.
      </p>

      <div style={{ background: C.white, border: `2px solid ${C.navy}`, padding: 24, marginBottom: 28 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.sand, fontWeight: 800, marginBottom: 8 }}>
          Número de radicado
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: C.navy, letterSpacing: 1, fontFamily: "monospace" }}>
          {radicado}
        </div>
        <div style={{ fontSize: 11, color: C.navyLight, marginTop: 10 }}>
          Guarde este número para consultar el estado de su solicitud.
        </div>
      </div>

      <div style={{ textAlign: "left", background: C.skyLight, borderLeft: `4px solid ${C.navy}`, padding: "18px 22px", marginBottom: 28 }}>
        <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, color: C.navy }}>
          Próximos pasos
        </div>
        <ol style={{ fontSize: 14, lineHeight: 1.7, color: C.navy, margin: 0, paddingLeft: 20 }}>
          <li>Recibirá un correo con el detalle de su registro.</li>
          {haveWorkers && <li>Cada trabajador recibirá un enlace personal al curso interactivo de inducción.</li>}
          {!haveWorkers && <li>Recibirá un enlace para completar el curso interactivo de inducción.</li>}
          <li>Nuestro Coordinador SST revisará sus documentos (≤ 24 horas hábiles).</li>
          <li>Cuando el registro sea aprobado, recibirá confirmación para el día del trabajo.</li>
        </ol>
      </div>

      <button
        onClick={onRestart}
        style={{
          padding: "15px 28px", fontSize: 13, fontWeight: 800, letterSpacing: 1.8,
          textTransform: "uppercase", border: `1.5px solid ${C.navy}`, background: "transparent",
          color: C.navy, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Registrar otro contratista
      </button>
    </div>
  );
}
