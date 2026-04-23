// Side panel con detalle de trabajador + reenvío de invitación al curso.
import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { B } from "../../../brand";

const SEND_URL = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/contratistas-send-notification";
const CURSO_BASE = typeof window !== "undefined" ? window.location.origin : "https://atolon.co";

function fmt(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function Row({ label, value, mono }) {
  const empty = value === undefined || value === null || value === "" || value === false;
  return (
    <div style={{ padding: "8px 0", borderBottom: `1px solid ${B.navyLight}` }}>
      <div style={{ fontSize: 10, color: B.sand, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: empty ? "rgba(255,255,255,0.3)" : B.white, fontFamily: mono ? "monospace" : "inherit", fontWeight: mono ? 600 : 400 }}>
        {empty ? "—" : String(value)}
      </div>
    </div>
  );
}

export default function WorkerPanel({ worker, contratista, onClose }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const reenviarCurso = async () => {
    setBusy(true); setMsg(null);
    try {
      const token = worker.curso_token;
      const cursoUrl = `${CURSO_BASE}/contratistas/curso/${token}`;
      const subject = `Invitación al curso SST · ${worker.nombre}`;
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAF6EE;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 6px 30px rgba(13,27,62,0.1);">
  <div style="background:#0D1B3E;padding:28px;text-align:center;">
    <div style="font-size:11px;color:#C8B99A;letter-spacing:3px;text-transform:uppercase;">ATOLÓN · BEACH CLUB</div>
    <div style="font-size:22px;color:white;font-weight:800;margin-top:6px;">Curso de inducción SST</div>
  </div>
  <div style="padding:32px;color:#0D1B3E;font-size:14px;line-height:1.6;">
    <p>Hola <strong>${worker.nombre}</strong>,</p>
    <p>Para ingresar a Atolón Beach Club debes completar el curso interactivo de Seguridad y Salud en el Trabajo.</p>
    <p>Radicado: <strong>${contratista?.radicado || "—"}</strong></p>
    <p style="margin:24px 0;text-align:center;">
      <a href="${cursoUrl}" style="display:inline-block;padding:14px 32px;background:#0D1B3E;color:white;text-decoration:none;border-radius:8px;font-weight:700;">
        Iniciar curso →
      </a>
    </p>
    <p style="font-size:12px;color:#666;">Sin el certificado del curso no se permite el embarque.</p>
  </div>
</div></body></html>`;

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(SEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          to: [contratista?.contacto_principal_email].filter(Boolean),
          subject, html,
          kind: "curso_invite",
          contratista_id: contratista?.id,
          trabajador_id: worker.id,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMsg({ type: "success", text: "Invitación reenviada correctamente." });
    } catch (err) {
      setMsg({ type: "error", text: "Error al reenviar: " + (err.message || err) });
    } finally { setBusy(false); }
  };

  if (!worker) return null;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0,
      width: "100%", maxWidth: 480, background: B.navy,
      boxShadow: "-8px 0 40px rgba(0,0,0,0.5)", zIndex: 1010,
      overflowY: "auto", borderLeft: `2px solid ${B.navyLight}`,
    }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", background: B.navyMid, borderBottom: `1px solid ${B.navyLight}`, position: "sticky", top: 0, zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: B.sand, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
              Trabajador
            </div>
            <div style={{ fontSize: 18, color: B.white, fontWeight: 800, lineHeight: 1.2 }}>
              {worker.nombre}
            </div>
            <div style={{ fontSize: 12, color: B.sand, marginTop: 2 }}>{worker.cargo}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${B.sand}`, color: B.sand, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, borderRadius: 6 }}>
            Cerrar ×
          </button>
        </div>
      </div>

      <div style={{ padding: "16px 24px" }}>
        {/* Curso status */}
        <div style={{
          background: worker.curso_completado ? "rgba(76,175,125,0.1)" : "rgba(232,160,32,0.1)",
          border: `1px solid ${worker.curso_completado ? B.success : B.warning}`,
          borderRadius: 8, padding: 14, marginBottom: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: worker.curso_completado ? B.success : B.warning, letterSpacing: 1, textTransform: "uppercase", fontWeight: 800 }}>
                Curso SST
              </div>
              <div style={{ fontSize: 15, color: B.white, fontWeight: 700, marginTop: 2 }}>
                {worker.curso_completado ? "✅ Completado" : "⏳ Pendiente"}
              </div>
            </div>
            {worker.codigo_curso && (
              <a
                href={`/verificar/${worker.codigo_curso}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, padding: "6px 12px", background: B.sky, color: B.navy, textDecoration: "none", borderRadius: 6, fontWeight: 700 }}
              >
                Verificar ↗
              </a>
            )}
          </div>
          {worker.curso_completado && (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
              Código: <span style={{ fontFamily: "monospace", color: B.sand }}>{worker.codigo_curso || "—"}</span>
              {worker.fecha_curso && <span> · {fmt(worker.fecha_curso)}</span>}
            </div>
          )}
        </div>

        {/* Reenviar invitación */}
        {!worker.curso_completado && worker.curso_token && (
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={reenviarCurso}
              disabled={busy}
              style={{
                width: "100%", padding: "12px 16px", background: B.sand, color: B.navy,
                border: "none", borderRadius: 8, fontSize: 13, fontWeight: 800,
                letterSpacing: 0.5, cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "Enviando…" : "📧 Reenviar invitación al curso"}
            </button>
            {msg && (
              <div style={{
                marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12,
                background: msg.type === "error" ? "rgba(214,69,69,0.15)" : "rgba(76,175,125,0.15)",
                color: msg.type === "error" ? B.danger : B.success,
                border: `1px solid ${msg.type === "error" ? B.danger : B.success}`,
              }}>
                {msg.text}
              </div>
            )}
          </div>
        )}

        {/* Personal data */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: B.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>
            Datos personales
          </div>
          <Row label="Cédula" value={worker.cedula} mono />
          <Row label="Celular" value={worker.celular} />
          <Row label="RH" value={worker.rh} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: B.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>
            Seguridad social
          </div>
          <Row label="EPS" value={worker.eps} />
          <Row label="AFP" value={worker.afp} />
          <Row label="ARL" value={worker.arl} />
          <Row label="Clase riesgo" value={worker.clase_riesgo} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: B.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>
            Contacto emergencia
          </div>
          <Row label="Nombre" value={worker.emerg_nombre} />
          <Row label="Teléfono" value={worker.emerg_tel} />
        </div>

        {worker.curso_token && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: B.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>
              Link del curso
            </div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.6)", wordBreak: "break-all", padding: 8, background: B.navyMid, borderRadius: 6 }}>
              {CURSO_BASE}/contratistas/curso/{worker.curso_token}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
