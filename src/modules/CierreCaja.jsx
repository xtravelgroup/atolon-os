import { useState, useEffect, useCallback, useRef } from "react";
import { B, COP, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";
import { logAccion } from "../lib/logAccion";

const IS = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: B.navy, border: `1px solid rgba(255,255,255,0.1)`,
  color: "#fff", fontSize: 13, outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
};
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const AREAS = [
  { key: "ayb",         label: "A&B",          icon: "🍽️",  desc: "Alimentos y Bebidas" },
  { key: "pasadias",    label: "Pasadías",      icon: "🏖️",  desc: "Taquilla / Muelle" },
  { key: "after_island",label: "After Island",  icon: "🌙",  desc: "Nocturno" },
  { key: "otros",       label: "Otros",         icon: "📦",  desc: "Otro punto de venta" },
];

const METODOS = [
  { key: "datafono",      label: "Datáfono",      icon: "💳" },
  { key: "efectivo",      label: "Efectivo",       icon: "💵" },
  { key: "link_pago",     label: "Link de Pago",   icon: "🔗" },
  { key: "resort_credit", label: "Resort Credit",  icon: "🏨" },
  { key: "transferencia", label: "Transferencia",  icon: "🏦" },
  { key: "otros",         label: "Otros",          icon: "➕" },
];

function parseCOP(v) { return parseInt(String(v).replace(/[^0-9-]/g, ""), 10) || 0; }
function fmtFecha(d) {
  if (!d) return "—";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

// ─── Historial de Cierres ─────────────────────────────────────────────────────
function HistorialCierres({ refresh }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase.from("cierres_caja").select("*")
      .order("created_at", { ascending: false }).limit(50);
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refresh]);

  if (loading) return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "20px 0" }}>Cargando historial…</div>;
  if (rows.length === 0) return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "20px 0" }}>Sin cierres registrados.</div>;

  const AREA_LABEL = Object.fromEntries(AREAS.map(a => [a.key, a.label]));
  const AREA_ICON  = Object.fromEntries(AREAS.map(a => [a.key, a.icon]));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {["Fecha", "Área", "Cajero", "Caja", "No. Comp.", "Total Vtas.", "Propinas", "Total", "Efect. Dif.", ""].map(h => (
              <th key={h} style={{ padding: "7px 10px", textAlign: "left", color: "rgba(255,255,255,0.4)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const dif = c.diferencia || 0;
            const difColor = dif === 0 ? "#4ade80" : dif < 0 ? "#f87171" : "#fbbf24";
            const isExp = expanded === c.id;
            const metodos = c.metodos || {};
            return (
              <>
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                  onClick={() => setExpanded(isExp ? null : c.id)}>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap", color: "rgba(255,255,255,0.7)" }}>{fmtFecha(c.fecha)}</td>
                  <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                    {AREA_ICON[c.area] || "📦"} <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{AREA_LABEL[c.area] || c.area || "—"}</span>
                  </td>
                  <td style={{ padding: "9px 10px", fontWeight: 600 }}>{c.cajero_nombre || "—"}</td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{c.numero_caja || "—"}</td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{c.numero_comprobante || "—"}</td>
                  <td style={{ padding: "9px 10px", color: B.sky, fontWeight: 600 }}>{COP(c.total_ventas || 0)}</td>
                  <td style={{ padding: "9px 10px", color: B.sand }}>{COP(c.total_propinas || 0)}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 700 }}>{COP(c.total_general || 0)}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 700, color: difColor }}>
                    {dif >= 0 ? "+" : ""}{COP(dif)}
                  </td>
                  <td style={{ padding: "9px 10px", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{isExp ? "▲" : "▼"}</td>
                </tr>
                {isExp && (
                  <tr key={`${c.id}-exp`} style={{ background: "rgba(255,255,255,0.02)" }}>
                    <td colSpan={10} style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                        {/* Métodos */}
                        <div style={{ flex: 2, minWidth: 280 }}>
                          <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Detalle por método</div>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                <th style={{ padding: "4px 8px", textAlign: "left", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Método</th>
                                <th style={{ padding: "4px 8px", textAlign: "right", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Venta</th>
                                <th style={{ padding: "4px 8px", textAlign: "right", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Propina</th>
                                <th style={{ padding: "4px 8px", textAlign: "right", color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(metodos).filter(([, v]) => (v.venta || v.propina)).map(([k, v]) => (
                                <tr key={k} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                  <td style={{ padding: "5px 8px", color: "rgba(255,255,255,0.6)" }}>
                                    {METODOS.find(m => m.key === k)?.label || k}
                                  </td>
                                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{COP(v.venta || 0)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", color: B.sand }}>{COP(v.propina || 0)}</td>
                                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>{COP((v.venta || 0) + (v.propina || 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Meta */}
                        <div style={{ flex: 1, minWidth: 180, fontSize: 12 }}>
                          <div style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Info del cierre</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "rgba(255,255,255,0.5)" }}>
                            <div><span style={{ color: "rgba(255,255,255,0.3)" }}>Usuario: </span>{c.usuario_email}</div>
                            <div><span style={{ color: "rgba(255,255,255,0.3)" }}>Efect. esperado: </span>{COP(c.efectivo_esperado || 0)}</div>
                            <div><span style={{ color: "rgba(255,255,255,0.3)" }}>Efect. contado: </span>{COP(c.efectivo_contado || 0)}</div>
                            {c.notas && <div><span style={{ color: "rgba(255,255,255,0.3)" }}>Notas: </span>{c.notas}</div>}
                            {c.comprobante_url && (
                              <a href={c.comprobante_url} target="_blank" rel="noopener noreferrer"
                                style={{ color: B.sky, textDecoration: "none", marginTop: 4 }}>
                                📎 Ver comprobante
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CierreCaja() {
  const { isMobile } = useMobile();
  const fileRef   = useRef(null);
  const cameraRef = useRef(null);

  // Form state
  const [area, setArea]         = useState("ayb");
  const [fecha, setFecha]       = useState(todayStr());
  const [cajero, setCajero]     = useState("");
  const [numCaja, setNumCaja]   = useState("");
  const [numComp, setNumComp]   = useState("");
  const [file, setFile]         = useState(null);           // File object
  const [fileUrl, setFileUrl]   = useState("");             // after upload

  // Métodos: { datafono: { venta: "", propina: "" }, ... }
  const initMetodos = () => Object.fromEntries(METODOS.map(m => [m.key, { venta: "", propina: "" }]));
  const [metodos, setMetodos] = useState(initMetodos());

  // INC 8%
  const [incBase,     setIncBase]     = useState("");
  const [incImpuesto, setIncImpuesto] = useState("");

  // Efectivo cuadre
  const [efectivoContado, setEfectivoContado] = useState("");

  const [notas, setNotas]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [saved, setSaved]       = useState(false);
  const [savedId, setSavedId]   = useState(null);
  const [error, setError]       = useState(null);
  const [historialKey, setHistorialKey] = useState(0);

  const setM = (key, field, val) =>
    setMetodos(p => ({ ...p, [key]: { ...p[key], [field]: val } }));

  // ── Computed ────────────────────────────────────────────────────────────────
  const computed = Object.fromEntries(
    METODOS.map(m => {
      const v = parseCOP(metodos[m.key].venta);
      const p = parseCOP(metodos[m.key].propina);
      return [m.key, { venta: v, propina: p, total: v + p }];
    })
  );

  const totalVentas   = METODOS.reduce((s, m) => s + computed[m.key].venta, 0);
  const totalPropinas = METODOS.reduce((s, m) => s + computed[m.key].propina, 0);
  const totalGeneral  = totalVentas + totalPropinas;

  const efectivoEsperado = computed.efectivo.total;
  const efectivoContadoNum = parseCOP(efectivoContado);
  const diferencia = efectivoContadoNum - efectivoEsperado;
  const difColor = diferencia === 0 ? "#4ade80" : diferencia < 0 ? "#f87171" : "#fbbf24";

  // ── Upload + AI parse ────────────────────────────────────────────────────────
  const [parseStatus, setParseStatus] = useState(null); // null | "parsing" | "ok" | "fail"
  const [parseMsg, setParseMsg]       = useState("");

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    setParseStatus(null);
    setParseMsg("");
    if (!supabase) return;

    setUploadingFile(true);

    // 1. Upload to Storage
    const path = `cierres/${Date.now()}-${f.name.replace(/\s+/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("cierres-docs").upload(path, f, { upsert: true });
    if (!upErr) {
      const { data: { publicUrl } } = supabase.storage.from("cierres-docs").getPublicUrl(path);
      setFileUrl(publicUrl);
    }
    setUploadingFile(false);

    // 2. AI parse (only for images, not PDFs — Claude Vision needs image)
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      setParseStatus("fail");
      setParseMsg("PDF cargado. Ingresa los datos manualmente.");
      return;
    }

    setParseStatus("parsing");
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(",")[1];
        const mediaType = f.type || "image/jpeg";

        const { data: fnData, error: fnErr } = await supabase.functions.invoke("parse-comprobante", {
          body: { imageBase64: base64, mediaType },
        });

        if (fnErr || !fnData?.ok) {
          setParseStatus("fail");
          setParseMsg("No se pudo leer automáticamente. Ingresa los datos manualmente.");
          return;
        }

        // Auto-fill form
        if (fnData.cajero)              setCajero(fnData.cajero);
        if (fnData.numero_comprobante)  setNumComp(fnData.numero_comprobante);
        if (fnData.fecha)               setFecha(fnData.fecha);
        if (fnData.inc_base)            setIncBase(String(fnData.inc_base));
        if (fnData.inc_impuesto)        setIncImpuesto(String(fnData.inc_impuesto));

        if (fnData.metodos) {
          setMetodos(prev => {
            const next = { ...prev };
            for (const k of Object.keys(fnData.metodos)) {
              if (next[k]) {
                next[k] = {
                  venta:   String(fnData.metodos[k].venta   || ""),
                  propina: String(fnData.metodos[k].propina || ""),
                };
              }
            }
            return next;
          });
        }

        setParseStatus("ok");
        setParseMsg("✅ Datos cargados automáticamente. Revisa y corrige si es necesario.");
      };
      reader.readAsDataURL(f);
    } catch {
      setParseStatus("fail");
      setParseMsg("Error al analizar la imagen. Ingresa los datos manualmente.");
    }
  };

  // ── Guardar Cierre ───────────────────────────────────────────────────────────
  const guardar = async () => {
    if (!supabase) return;
    if (!cajero.trim()) { setError("Ingresa el nombre del cajero."); return; }
    setSaving(true);
    setError(null);

    const session = await supabase.auth.getSession();
    const email = session?.data?.session?.user?.email || "sistema";

    const metodosData = Object.fromEntries(
      METODOS.map(m => [m.key, { venta: computed[m.key].venta, propina: computed[m.key].propina, total: computed[m.key].total }])
    );

    const id = `CC-${Date.now()}`;
    const record = {
      id,
      fecha,
      area,
      cajero_nombre: cajero.trim(),
      numero_caja: numCaja.trim() || null,
      numero_comprobante: numComp.trim() || null,
      comprobante_url: fileUrl || null,
      usuario_email: email,
      metodos: metodosData,
      total_ventas: totalVentas,
      total_propinas: totalPropinas,
      total_general: totalGeneral,
      inc_base: parseCOP(incBase) || null,
      inc_impuesto: parseCOP(incImpuesto) || null,
      efectivo_esperado: efectivoEsperado,
      efectivo_contado: efectivoContadoNum,
      diferencia,
      notas: notas.trim() || null,
      estado: "cerrado",
    };

    const { error: err } = await supabase.from("cierres_caja").insert(record);
    if (err) { setError("Error guardando: " + err.message); setSaving(false); return; }

    await logAccion({ modulo: "cierre_caja", accion: "cierre_caja", tabla: "cierres_caja", registroId: id, datosDespues: record });

    setSaved(true);
    setSavedId(id);
    setSaving(false);
    setHistorialKey(k => k + 1);
  };

  const reset = () => {
    setSaved(false); setSavedId(null); setError(null);
    setCajero(""); setNumCaja(""); setNumComp(""); setFile(null); setFileUrl("");
    setMetodos(initMetodos()); setIncBase(""); setIncImpuesto("");
    setEfectivoContado(""); setNotas("");
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ color: "#fff", fontFamily: "inherit", maxWidth: 860, margin: "0 auto", paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>💵 Cierre de Caja</h2>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Registro de ingresos por punto de venta</div>
      </div>

      {saved ? (
        /* ── Éxito ── */
        <div style={{ background: "#4ade8018", border: "1px solid #4ade8033", borderRadius: 16, padding: "28px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#4ade80", marginBottom: 6 }}>Cierre guardado exitosamente</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>ID: {savedId}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", margin: "12px 0" }}>
            Total ventas <strong style={{ color: B.sky }}>{COP(totalVentas)}</strong>
            {" · "}Propinas <strong style={{ color: B.sand }}>{COP(totalPropinas)}</strong>
            {" · "}Total <strong style={{ color: "#fff" }}>{COP(totalGeneral)}</strong>
          </div>
          <button onClick={reset}
            style={{ marginTop: 8, background: B.sand, color: B.navy, border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            + Nuevo Cierre
          </button>
        </div>
      ) : (
        <>
          {/* ── 1. Área ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Área / Punto de venta</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {AREAS.map(a => (
                <button key={a.key} onClick={() => setArea(a.key)}
                  style={{
                    padding: "10px 18px", borderRadius: 10, border: `1px solid ${area === a.key ? B.sky : "rgba(255,255,255,0.1)"}`,
                    background: area === a.key ? B.sky + "22" : "transparent",
                    color: area === a.key ? B.sky : "rgba(255,255,255,0.5)",
                    fontWeight: area === a.key ? 700 : 500, cursor: "pointer", fontSize: 13,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                  <span>{a.icon}</span> {a.label}
                  {!isMobile && <span style={{ fontSize: 10, opacity: 0.6 }}>— {a.desc}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* ── 2. Datos del comprobante ── */}
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Datos del comprobante</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 14 }}>
              <div>
                <label style={LS}>Cajero *</label>
                <input value={cajero} onChange={e => setCajero(e.target.value)} placeholder="Nombre del cajero" style={IS} />
              </div>
              <div>
                <label style={LS}>Caja #</label>
                <input value={numCaja} onChange={e => setNumCaja(e.target.value)} placeholder="Ej: Caja 1" style={IS} />
              </div>
              <div>
                <label style={LS}>No. Comprobante</label>
                <input value={numComp} onChange={e => setNumComp(e.target.value)} placeholder="Ej: 1353" style={IS} />
              </div>
              <div>
                <label style={LS}>Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={IS} />
              </div>
            </div>

            {/* Upload */}
            <div style={{ marginTop: 14 }}>
              <label style={LS}>Comprobante</label>

              {/* Si ya hay archivo cargado */}
              {fileUrl ? (
                <div style={{ border: "1px solid #4ade8044", borderRadius: 10, padding: "12px 16px", background: "#4ade8010", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 22 }}>✅</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 600 }}>Comprobante cargado</div>
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: B.sky, textDecoration: "none", marginTop: 2, display: "block" }}>
                      Ver archivo ↗
                    </a>
                  </div>
                  <button onClick={() => { setFile(null); setFileUrl(""); setParseStatus(null); setParseMsg(""); }}
                    style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 18, cursor: "pointer" }}>✕</button>
                </div>
              ) : uploadingFile ? (
                <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 22 }}>⏳</span>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Subiendo y analizando…</div>
                </div>
              ) : (
                /* Botones: Tomar foto + Adjuntar archivo */
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button onClick={() => cameraRef.current?.click()}
                    style={{ padding: "14px 12px", borderRadius: 10, border: "1px dashed rgba(142,202,230,0.35)", background: "rgba(142,202,230,0.06)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 26 }}>📷</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: B.sky }}>Tomar foto</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Cámara → IA auto-completa</span>
                  </button>
                  <button onClick={() => fileRef.current?.click()}
                    style={{ padding: "14px 12px", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.12)", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 26 }}>📎</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>Adjuntar archivo</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>PDF, JPG o PNG</span>
                  </button>
                </div>
              )}

              {/* Inputs ocultos */}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files[0])} />
              <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files[0])} />
              {/* Parse status */}
              {parseStatus === "parsing" && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: B.sky + "15", border: `1px solid ${B.sky}33`, fontSize: 12, color: B.sky, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                  Analizando comprobante con IA…
                </div>
              )}
              {parseStatus === "ok" && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#4ade8015", border: "1px solid #4ade8033", fontSize: 12, color: "#4ade80" }}>
                  {parseMsg}
                </div>
              )}
              {parseStatus === "fail" && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 12, color: "#fbbf24" }}>
                  {parseMsg}
                </div>
              )}
            </div>
          </div>

          {/* ── 3. Métodos de pago ── */}
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Métodos de pago</div>

            {/* Column headers */}
            {!isMobile && (
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 120px", gap: 10, marginBottom: 8, padding: "0 4px" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Método</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Ventas (sin propina)</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Propinas</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>Total</div>
              </div>
            )}

            {METODOS.map(m => {
              const isEfectivo = m.key === "efectivo";
              const tot = computed[m.key].total;
              return (
                <div key={m.key} style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "160px 1fr 1fr 120px",
                  gap: 10, alignItems: "center",
                  padding: "10px 12px", borderRadius: 10, marginBottom: 6,
                  background: isEfectivo ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isEfectivo ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.04)"}`,
                }}>
                  {/* Label */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, gridColumn: isMobile ? "1 / -1" : undefined }}>
                    <span style={{ fontSize: 16 }}>{m.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: isEfectivo ? 700 : 500, color: isEfectivo ? "#fbbf24" : "rgba(255,255,255,0.8)" }}>
                      {m.label}
                    </span>
                  </div>
                  {/* Venta */}
                  <input
                    type="number" min="0" placeholder="0"
                    value={metodos[m.key].venta}
                    onChange={e => setM(m.key, "venta", e.target.value)}
                    style={{ ...IS, fontSize: 13, textAlign: "right" }}
                  />
                  {/* Propina */}
                  <input
                    type="number" min="0" placeholder="0"
                    value={metodos[m.key].propina}
                    onChange={e => setM(m.key, "propina", e.target.value)}
                    style={{ ...IS, fontSize: 13, textAlign: "right", background: "rgba(200,185,154,0.06)", borderColor: "rgba(200,185,154,0.1)" }}
                  />
                  {/* Total */}
                  <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: tot > 0 ? (isEfectivo ? "#fbbf24" : "#fff") : "rgba(255,255,255,0.2)" }}>
                    {tot > 0 ? COP(tot) : "—"}
                  </div>
                </div>
              );
            })}

            {/* Totals row */}
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "160px 1fr 1fr 120px",
              gap: 10, alignItems: "center",
              padding: "12px 12px", borderRadius: 10, marginTop: 8,
              background: "rgba(142,202,230,0.08)", border: `1px solid ${B.sky}33`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.sky, gridColumn: isMobile ? "1 / -1" : undefined }}>TOTAL</div>
              <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: B.sky }}>{COP(totalVentas)}</div>
              <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: B.sand }}>{COP(totalPropinas)}</div>
              <div style={{ textAlign: "right", fontSize: 16, fontWeight: 800, color: "#fff" }}>{COP(totalGeneral)}</div>
            </div>
          </div>

          {/* ── 4. INC 8% + Resumen ── */}
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Impuestos y resumen</div>

            {/* INC 8% */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>INC (8%)</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10, alignItems: "end" }}>
                <div>
                  <label style={LS}>Base gravable</label>
                  <input type="number" min="0" placeholder="0" value={incBase}
                    onChange={e => {
                      setIncBase(e.target.value);
                      const base = parseInt(e.target.value, 10) || 0;
                      setIncImpuesto(base ? String(Math.round(base * 0.08)) : "");
                    }}
                    style={{ ...IS, textAlign: "right" }} />
                </div>
                <div>
                  <label style={LS}>INC (8%)</label>
                  <input type="number" min="0" placeholder="0" value={incImpuesto}
                    onChange={e => setIncImpuesto(e.target.value)}
                    style={{ ...IS, textAlign: "right", color: "#fbbf24" }} />
                </div>
                <div style={{ padding: "10px 0" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Auto-calculado</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Base × 8% = Imp. — editable si difiere</div>
                </div>
              </div>
            </div>

            {/* Resumen tipo comprobante */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Resumen</div>
              {[
                { label: "Total Ventas (sin propina)",       value: totalVentas,               color: B.sky },
                { label: "Propinas",                         value: totalPropinas,              color: B.sand },
                { label: "INC (8%)",                         value: parseCOP(incImpuesto),      color: "#fbbf24", skip: !incImpuesto },
                { label: "Total General (Debe tener)",       value: totalGeneral,               color: "#fff", bold: true, sep: true },
                { label: "Total Efectivo",                   value: computed.efectivo.total,    color: "#fbbf24" },
              ].filter(r => !r.skip).map(r => (
                <div key={r.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0",
                  borderTop: r.sep ? "1px solid rgba(255,255,255,0.08)" : "none",
                  marginTop: r.sep ? 4 : 0,
                }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{r.label}</span>
                  <span style={{ fontSize: r.bold ? 16 : 13, fontWeight: r.bold ? 800 : 600, color: r.color }}>
                    {COP(r.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 5. Cuadre de efectivo ── */}
          {efectivoEsperado > 0 && (
            <div style={{ background: "rgba(251,191,36,0.07)", borderRadius: 14, padding: "18px 20px", marginBottom: 20, border: "1px solid rgba(251,191,36,0.15)" }}>
              <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>💵 Cuadre de Efectivo</div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ ...LS, color: "#fbbf2480" }}>Efectivo en sistema</label>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fbbf24" }}>{COP(efectivoEsperado)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ ...LS, color: "#fbbf2480" }}>Efectivo contado</label>
                  <input type="number" min="0" placeholder="0" value={efectivoContado}
                    onChange={e => setEfectivoContado(e.target.value)}
                    style={{ ...IS, fontSize: 15, fontWeight: 700, textAlign: "right" }} />
                </div>
                {efectivoContado !== "" && (
                  <div style={{ padding: "10px 18px", borderRadius: 10, background: difColor + "18", border: `1px solid ${difColor}33`, minWidth: 140, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>Diferencia</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: difColor }}>{diferencia >= 0 ? "+" : ""}{COP(diferencia)}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {diferencia === 0 ? "Cuadrado ✓" : diferencia > 0 ? "Sobrante" : "Faltante"}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 5. Notas ── */}
          <div style={{ marginBottom: 20 }}>
            <label style={LS}>Notas / Observaciones</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Inconsistencias, novedades del día, gastos de caja…"
              rows={2} style={{ ...IS, resize: "vertical", lineHeight: 1.5 }} />
          </div>

          {error && (
            <div style={{ background: "#f8717122", border: "1px solid #f8717144", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#f87171" }}>
              {error}
            </div>
          )}

          {/* ── Guardar ── */}
          <button onClick={guardar} disabled={saving || !cajero.trim() || uploadingFile}
            style={{
              width: "100%", padding: "15px", borderRadius: 12, border: "none",
              background: (saving || !cajero.trim() || uploadingFile) ? "rgba(255,255,255,0.06)" : B.sand,
              color: (saving || !cajero.trim() || uploadingFile) ? "rgba(255,255,255,0.25)" : B.navy,
              fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 36,
            }}>
            {saving ? "Guardando…" : uploadingFile ? "Subiendo archivo…" : "Guardar Cierre de Caja"}
          </button>
        </>
      )}

      {/* ── Historial ── */}
      <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Historial de Cierres</div>
        <HistorialCierres refresh={historialKey} />
      </div>

    </div>
  );
}
