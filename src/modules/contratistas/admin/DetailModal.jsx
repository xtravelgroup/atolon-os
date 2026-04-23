// Modal de detalle de contratista — readonly + acciones de workflow.
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import { B } from "../../../brand";
import { UPLOAD_EMPRESA, UPLOAD_NATURAL, DECS_EMPRESA, DECS_NATURAL } from "../constants";
import BitacoraTimeline from "./BitacoraTimeline";
import WorkerPanel from "./WorkerPanel";

const CHANGE_STATE_URL = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/contratistas-change-state";

const ESTADO_COLOR = {
  borrador: "rgba(255,255,255,0.3)",
  radicado: B.sky,
  en_revision: B.warning,
  devuelto: "#F97316",
  aprobado: B.success,
  rechazado: B.danger,
  activo: B.sand,
  cerrado: "rgba(255,255,255,0.4)",
  vencido: B.pink,
};

const ESTADO_LABEL = {
  borrador: "Borrador",
  radicado: "Radicado",
  en_revision: "En revisión",
  devuelto: "Devuelto",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  activo: "Activo",
  cerrado: "Cerrado",
  vencido: "Vencido",
};

function fmt(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function fmtDT(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return d; }
}

// PILA vigente = fecha_pila dentro del mes anterior
function isPilaVigente(fechaPila) {
  if (!fechaPila) return null;
  try {
    const d = new Date(fechaPila);
    const diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 45; // dentro de los últimos 45 días
  } catch { return null; }
}

function Row({ label, value, mono }) {
  const empty = value === undefined || value === null || value === "" || value === false;
  return (
    <div>
      <div style={{ fontSize: 10, color: B.sand, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: empty ? "rgba(255,255,255,0.3)" : B.white, fontFamily: mono ? "monospace" : "inherit", lineHeight: 1.4 }}>
        {empty ? "—" : String(value)}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: B.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${B.navyLight}` }}>
        {title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px 20px" }}>
        {children}
      </div>
    </div>
  );
}

const TABS_EMPRESA = ["Datos generales", "Servicio", "ARL y SST", "Trabajadores", "Documentos", "Declaraciones", "Bitácora"];
const TABS_NATURAL = ["Datos personales", "Servicio", "Seg. social", "Documentos", "Declaraciones", "Bitácora"];

export default function DetailModal({ contratistaId, adminUser, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [certs, setCerts] = useState([]);
  const [signedUrls, setSignedUrls] = useState({});
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [actionMode, setActionMode] = useState(null); // "aprobado" | "devuelto" | "rechazado" | "en_revision" | null
  const [actionNote, setActionNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, wRes, dRes] = await Promise.all([
        supabase.from("contratistas").select("*").eq("id", contratistaId).single(),
        supabase.from("contratistas_trabajadores").select("*").eq("contratista_id", contratistaId).order("created_at"),
        supabase.from("contratistas_documentos").select("*").eq("contratista_id", contratistaId).order("created_at"),
      ]);
      if (cRes.error) throw cRes.error;
      setC(cRes.data);
      setWorkers(wRes.data || []);
      setDocs(dRes.data || []);

      // Certificados de trabajadores
      const workerIds = (wRes.data || []).map(w => w.id);
      if (workerIds.length) {
        const { data: cr } = await supabase
          .from("certificados_curso")
          .select("*")
          .in("trabajador_id", workerIds);
        setCerts(cr || []);
      } else {
        setCerts([]);
      }

      // Firmar URLs de documentos
      const urls = {};
      await Promise.all((dRes.data || []).map(async (d) => {
        try {
          const { data: s } = await supabase.storage.from("contratistas-docs").createSignedUrl(d.storage_path, 3600);
          if (s?.signedUrl) urls[d.id] = s.signedUrl;
        } catch { /* ignore */ }
      }));
      setSignedUrls(urls);
    } catch (err) {
      console.error("detail load:", err);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (contratistaId) load(); /* eslint-disable-next-line */ }, [contratistaId]);

  const tabs = useMemo(() => c?.tipo === "empresa" ? TABS_EMPRESA : TABS_NATURAL, [c]);
  const isEmp = c?.tipo === "empresa";
  const uploadList = isEmp ? UPLOAD_EMPRESA : UPLOAD_NATURAL;
  const decList = isEmp ? DECS_EMPRESA : DECS_NATURAL;

  const pilaVigente = useMemo(() => isPilaVigente(c?.emp_fecha_pila), [c]);

  const changeState = async (nuevo_estado) => {
    if (!contratistaId || !nuevo_estado) return;
    setActionBusy(true); setActionMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sin sesión activa");
      const res = await fetch(CHANGE_STATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ contratista_id: contratistaId, nuevo_estado, notas: actionNote.trim() || null }),
      });
      const js = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(js.error || `HTTP ${res.status}`);
      setActionMsg({ type: "success", text: `Estado cambiado a "${ESTADO_LABEL[nuevo_estado]}" y email enviado al contratista.` });
      setActionMode(null); setActionNote("");
      await load();
      onChanged?.();
    } catch (err) {
      setActionMsg({ type: "error", text: "Error: " + (err.message || err) });
    } finally { setActionBusy(false); }
  };

  if (!contratistaId) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, overflowY: "auto", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: B.navy, maxWidth: 1100, margin: "20px auto",
        borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        color: B.white, fontFamily: "'Barlow', Arial, system-ui, sans-serif",
        position: "relative", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 24px", background: B.navyMid, borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{
                padding: "3px 10px", borderRadius: 12,
                background: (c?.tipo === "empresa" ? B.sky : B.pink) + "22",
                color: c?.tipo === "empresa" ? B.sky : B.pink,
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
              }}>
                {c?.tipo === "empresa" ? "Empresa" : "Natural"}
              </span>
              <span style={{
                padding: "3px 10px", borderRadius: 12,
                background: (ESTADO_COLOR[c?.estado] || B.sand) + "22",
                color: ESTADO_COLOR[c?.estado] || B.sand,
                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
              }}>
                {ESTADO_LABEL[c?.estado] || c?.estado}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: B.sand }}>{c?.radicado}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: B.white, lineHeight: 1.2 }}>
              {c?.nombre_display || "Cargando…"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {c?.contacto_principal_email} · {c?.contacto_principal_cel}
              {c?.submitted_at && <span> · radicado {fmtDT(c.submitted_at)}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${B.sand}`, color: B.sand, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, borderRadius: 6 }}>
            Cerrar ×
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: B.sand }}>Cargando…</div>
        ) : !c ? (
          <div style={{ padding: 60, textAlign: "center", color: B.danger }}>No se pudo cargar el contratista.</div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 2, padding: "0 24px", background: B.navyMid, borderBottom: `1px solid ${B.navyLight}`, overflowX: "auto" }}>
              {tabs.map((t, i) => (
                <button
                  key={t}
                  onClick={() => setTab(i)}
                  style={{
                    padding: "12px 14px", background: "transparent",
                    border: "none", borderBottom: `2px solid ${tab === i ? B.sky : "transparent"}`,
                    color: tab === i ? B.sky : "rgba(255,255,255,0.6)",
                    fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                    textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ padding: "20px 24px", maxHeight: "60vh", overflowY: "auto" }}>
              {/* EMPRESA */}
              {isEmp && tab === 0 && (
                <>
                  <Section title="Empresa">
                    <Row label="Razón social" value={c.emp_razon_social} />
                    <Row label="NIT" value={c.emp_nit} mono />
                    <Row label="CIIU" value={c.emp_ciiu} />
                    <Row label="Tamaño" value={c.emp_tamano} />
                    <Row label="Dirección" value={c.emp_direccion} />
                    <Row label="Ciudad" value={c.emp_ciudad} />
                    <Row label="Teléfono" value={c.emp_telefono} />
                    <Row label="Correo empresa" value={c.contacto_principal_email} />
                  </Section>
                  <Section title="Representante legal">
                    <Row label="Nombre" value={c.emp_rl_nombre} />
                    <Row label="Cédula" value={c.emp_rl_cedula} mono />
                    <Row label="Celular" value={c.emp_rl_cel} />
                    <Row label="Correo" value={c.emp_rl_correo} />
                  </Section>
                  <Section title="Contacto operativo">
                    <Row label="Nombre" value={c.emp_op_nombre} />
                    <Row label="Cargo" value={c.emp_op_cargo} />
                    <Row label="Celular" value={c.emp_op_cel} />
                    <Row label="Correo" value={c.emp_op_correo} />
                  </Section>
                </>
              )}
              {isEmp && tab === 1 && (
                <Section title="Servicio">
                  <Row label="Tipo" value={c.servicio_tipo} />
                  <Row label="Fecha inicio" value={fmt(c.fecha_inicio)} />
                  <Row label="Fecha fin" value={fmt(c.fecha_fin)} />
                  <Row label="Horario" value={c.horario} />
                  <Row label="N° trabajadores" value={c.num_trabajadores} />
                  <div style={{ gridColumn: "1/-1" }}>
                    <Row label="Descripción" value={c.servicio_desc} />
                  </div>
                </Section>
              )}
              {isEmp && tab === 2 && (
                <>
                  <Section title="ARL y PILA">
                    <Row label="ARL" value={c.emp_arl} />
                    <Row label="Clase riesgo" value={c.emp_clase_riesgo} />
                    <Row label="Fecha PILA" value={fmt(c.emp_fecha_pila)} />
                    <Row label="N° PILA" value={c.emp_num_pila} mono />
                    <div>
                      <div style={{ fontSize: 10, color: B.sand, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>
                        PILA vigente
                      </div>
                      <span style={{
                        padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: (pilaVigente === true ? B.success : pilaVigente === false ? B.danger : B.sand) + "22",
                        color: pilaVigente === true ? B.success : pilaVigente === false ? B.danger : B.sand,
                      }}>
                        {pilaVigente === true ? "✓ Vigente" : pilaVigente === false ? "⚠ Vencida" : "— Sin datos"}
                      </span>
                    </div>
                  </Section>
                  <Section title="SG-SST">
                    <Row label="Responsable" value={c.emp_sst_nombre} />
                    <Row label="Licencia" value={c.emp_sst_licencia} />
                    <Row label="Puntaje" value={c.emp_sst_puntaje} />
                    <Row label="Año autoeval." value={c.emp_sst_ano} />
                  </Section>
                </>
              )}
              {isEmp && tab === 3 && (
                <div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
                    {workers.length} trabajadores registrados
                  </div>
                  {workers.length === 0 ? (
                    <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Sin trabajadores</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {workers.map(w => {
                        const cert = certs.find(ct => ct.trabajador_id === w.id);
                        return (
                          <div key={w.id}
                            onClick={() => setSelectedWorker(w)}
                            style={{
                              padding: 14, background: B.navyLight, borderRadius: 8,
                              cursor: "pointer", display: "flex", justifyContent: "space-between",
                              alignItems: "center", gap: 12, flexWrap: "wrap",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = B.navyMid}
                            onMouseLeave={e => e.currentTarget.style.background = B.navyLight}
                          >
                            <div style={{ flex: 1, minWidth: 180 }}>
                              <div style={{ fontWeight: 700, color: B.white, fontSize: 14 }}>{w.nombre}</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                                {w.cedula} · {w.cargo} · {w.arl}
                              </div>
                            </div>
                            <span style={{
                              padding: "4px 10px", borderRadius: 12, fontSize: 10,
                              fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                              background: (w.curso_completado ? B.success : B.warning) + "22",
                              color: w.curso_completado ? B.success : B.warning,
                            }}>
                              {w.curso_completado ? "✓ Curso OK" : "⏳ Pendiente"}
                            </span>
                            {cert && (
                              <span style={{ fontSize: 10, fontFamily: "monospace", color: B.sand }}>
                                {cert.codigo}
                              </span>
                            )}
                            <span style={{ color: B.sky, fontSize: 11 }}>Ver →</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {isEmp && tab === 4 && <DocumentosTab docs={docs} urls={signedUrls} uploadList={uploadList} />}
              {isEmp && tab === 5 && <DeclaracionesTab c={c} decList={decList} />}
              {isEmp && tab === 6 && <BitacoraTimeline contratistaId={contratistaId} adminUser={adminUser} />}

              {/* NATURAL */}
              {!isEmp && tab === 0 && (
                <>
                  <Section title="Datos personales">
                    <Row label="Nombre" value={c.nat_nombre} />
                    <Row label="Cédula" value={c.nat_cedula} mono />
                    <Row label="Fecha nac." value={fmt(c.nat_fecha_nac)} />
                    <Row label="RH" value={c.nat_rh} />
                    <Row label="Ciudad" value={c.nat_ciudad} />
                    <Row label="Dirección" value={c.nat_direccion} />
                    <Row label="Celular" value={c.nat_celular} />
                    <Row label="Correo" value={c.nat_correo} />
                  </Section>
                  <Section title="Contacto emergencia">
                    <Row label="Nombre" value={c.nat_emerg_nombre} />
                    <Row label="Parentesco" value={c.nat_emerg_parentesco} />
                    <Row label="Teléfono" value={c.nat_emerg_tel} />
                  </Section>
                  <Section title="Curso SST">
                    <Row label="Completado" value={c.nat_curso_completado ? "Sí" : "No"} />
                    <Row label="Código" value={c.nat_codigo_curso} mono />
                  </Section>
                </>
              )}
              {!isEmp && tab === 1 && (
                <Section title="Oficio y servicio">
                  <Row label="Oficio" value={c.nat_oficio} />
                  <Row label="Experiencia (años)" value={c.nat_experiencia} />
                  <Row label="Fecha inicio" value={fmt(c.fecha_inicio)} />
                  <Row label="Duración" value={c.duracion} />
                  <div style={{ gridColumn: "1/-1" }}>
                    <Row label="Descripción" value={c.servicio_desc} />
                  </div>
                </Section>
              )}
              {!isEmp && tab === 2 && (
                <Section title="Seguridad social">
                  <Row label="EPS" value={c.nat_eps} />
                  <Row label="Régimen" value={c.nat_regimen} />
                  <Row label="AFP" value={c.nat_afp} />
                  <Row label="Caja" value={c.nat_caja} />
                  <Row label="ARL" value={c.nat_arl} />
                  <Row label="Estado ARL" value={c.nat_arl_estado} />
                </Section>
              )}
              {!isEmp && tab === 3 && <DocumentosTab docs={docs} urls={signedUrls} uploadList={uploadList} />}
              {!isEmp && tab === 4 && <DeclaracionesTab c={c} decList={decList} />}
              {!isEmp && tab === 5 && <BitacoraTimeline contratistaId={contratistaId} adminUser={adminUser} />}
            </div>

            {/* Action bar */}
            <ActionBar
              c={c}
              actionMode={actionMode}
              setActionMode={setActionMode}
              actionNote={actionNote}
              setActionNote={setActionNote}
              actionBusy={actionBusy}
              actionMsg={actionMsg}
              onConfirm={changeState}
            />
          </>
        )}
      </div>

      {selectedWorker && (
        <WorkerPanel
          worker={selectedWorker}
          contratista={c}
          onClose={() => setSelectedWorker(null)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function DocumentosTab({ docs, urls, uploadList }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
        {docs.length} archivos subidos
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {uploadList.map(spec => {
          const doc = docs.find(d => d.tipo === spec.id);
          const url = doc ? urls[doc.id] : null;
          return (
            <div key={spec.id} style={{
              padding: 14, background: B.navyLight, borderRadius: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 12, flexWrap: "wrap",
            }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, color: B.white, fontSize: 13 }}>
                  {spec.name} {spec.required && <span style={{ color: B.danger, fontSize: 11 }}>*</span>}
                </div>
                {doc && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                    {doc.nombre_original} · {(doc.size_bytes / 1024).toFixed(0)} KB
                  </div>
                )}
              </div>
              {doc ? (
                url ? (
                  <a href={url} target="_blank" rel="noreferrer" style={{
                    padding: "6px 14px", background: B.sky, color: B.navy,
                    textDecoration: "none", borderRadius: 6, fontSize: 11, fontWeight: 700,
                  }}>
                    Descargar ↓
                  </a>
                ) : (
                  <span style={{ fontSize: 11, color: B.sand }}>Cargando URL…</span>
                )
              ) : (
                <span style={{
                  padding: "4px 10px", borderRadius: 12,
                  background: (spec.required ? B.danger : B.sand) + "22",
                  color: spec.required ? B.danger : B.sand,
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
                }}>
                  {spec.required ? "Pendiente" : "Opcional"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeclaracionesTab({ c, decList }) {
  const firmadas = Array.isArray(c.declaraciones) ? c.declaraciones : [];
  return (
    <div>
      <Section title="Firma electrónica">
        <Row label="Firmante" value={c.firma_nombre} />
        <Row label="Cédula" value={c.firma_cedula} mono />
        <Row label="Timestamp" value={fmtDT(c.firma_timestamp)} />
        <Row label="User Agent" value={c.firma_user_agent?.slice(0, 60)} />
      </Section>
      <div style={{ fontSize: 11, letterSpacing: 2, color: B.sand, fontWeight: 800, textTransform: "uppercase", marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${B.navyLight}` }}>
        Declaraciones
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {decList.map((txt, i) => {
          const f = firmadas[i];
          const ok = f?.aceptada;
          return (
            <div key={i} style={{
              padding: 12, background: B.navyLight, borderRadius: 8,
              display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <div style={{
                flex: "0 0 20px", width: 20, height: 20, borderRadius: 4,
                background: ok ? B.success : "rgba(255,255,255,0.1)",
                color: B.white, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800,
              }}>
                {ok ? "✓" : ""}
              </div>
              <div style={{ fontSize: 12, color: ok ? B.white : "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
                {txt}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionBar({ c, actionMode, setActionMode, actionNote, setActionNote, actionBusy, actionMsg, onConfirm }) {
  const estado = c.estado;
  const canReview = ["radicado", "en_revision"].includes(estado);
  const isAprobado = estado === "aprobado";
  const isDevuelto = estado === "devuelto";
  const isRechazado = estado === "rechazado";

  return (
    <div style={{ padding: "16px 24px", background: B.navyMid, borderTop: `1px solid ${B.navyLight}`, position: "sticky", bottom: 0 }}>
      {actionMsg && (
        <div style={{
          padding: "10px 14px", marginBottom: 12, borderRadius: 6, fontSize: 13, fontWeight: 600,
          background: actionMsg.type === "error" ? "rgba(214,69,69,0.15)" : "rgba(76,175,125,0.15)",
          color: actionMsg.type === "error" ? B.danger : B.success,
          border: `1px solid ${actionMsg.type === "error" ? B.danger : B.success}`,
        }}>
          {actionMsg.text}
        </div>
      )}

      {actionMode ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
            {actionMode === "aprobado" && "Confirmar aprobación"}
            {actionMode === "devuelto" && "Observaciones para el contratista"}
            {actionMode === "rechazado" && "Motivo de rechazo"}
            {actionMode === "en_revision" && "Marcar en revisión"}
          </div>
          <textarea
            value={actionNote}
            onChange={e => setActionNote(e.target.value)}
            placeholder={
              actionMode === "devuelto" ? "Explique qué debe corregir el contratista…" :
              actionMode === "rechazado" ? "Explique por qué se rechaza…" :
              "Nota opcional"
            }
            rows={3}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 6,
              background: B.navy, border: `1px solid ${B.navyLight}`,
              color: B.white, fontSize: 13, outline: "none",
              fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
              marginBottom: 10,
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setActionMode(null); setActionNote(""); }}
              disabled={actionBusy}
              style={{ padding: "10px 18px", background: "transparent", color: B.sand, border: `1px solid ${B.sand}`, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(actionMode)}
              disabled={actionBusy || ((actionMode === "devuelto" || actionMode === "rechazado") && !actionNote.trim())}
              style={{
                padding: "10px 18px",
                background: actionMode === "aprobado" ? B.success : actionMode === "rechazado" ? B.danger : actionMode === "devuelto" ? "#F97316" : B.warning,
                color: B.white, border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: actionBusy ? "wait" : "pointer", opacity: actionBusy ? 0.6 : 1,
              }}
            >
              {actionBusy ? "Procesando…" : "Confirmar"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {canReview && (
            <>
              <button onClick={() => setActionMode("en_revision")} style={btn(B.warning)}>🔍 Marcar en revisión</button>
              <button onClick={() => setActionMode("devuelto")} style={btn("#F97316")}>↩ Devolver</button>
              <button onClick={() => setActionMode("rechazado")} style={btn(B.danger)}>⛔ Rechazar</button>
              <button onClick={() => setActionMode("aprobado")} style={btn(B.success)}>✅ Aprobar</button>
            </>
          )}
          {isAprobado && (
            <>
              <button onClick={() => setActionMode("rechazado")} style={btn(B.danger)}>Marcar rechazado</button>
              <span style={{ padding: "10px 14px", fontSize: 12, color: B.success, fontWeight: 700 }}>
                ✓ Aprobado — ya tiene acceso a la propiedad
              </span>
            </>
          )}
          {isDevuelto && (
            <span style={{ padding: "10px 14px", fontSize: 12, color: "#F97316", fontWeight: 700 }}>
              ↩ Devuelto al contratista — pendiente su corrección
            </span>
          )}
          {isRechazado && (
            <span style={{ padding: "10px 14px", fontSize: 12, color: B.danger, fontWeight: 700 }}>
              ⛔ Rechazado
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function btn(color) {
  return {
    padding: "10px 16px", background: color, color: B.white,
    border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700,
    cursor: "pointer", letterSpacing: 0.3,
  };
}
