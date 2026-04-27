// CotizacionModal — Cargar cotizaciones de proveedor (con AI) y compararlas.
// Flujo: foto/PDF → parser AI → revisar items → guardar como cotización
// asociada a una requisición. Después se pueden comparar varias y elegir.
import React, { useState, useEffect } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";

export default function CotizacionModal({ requisicion, onClose, currentUser, reload }) {
  const { isMobile } = useBreakpoint();
  const [step, setStep] = useState("list"); // list | upload | parsing | review | saving
  const [error, setError] = useState("");
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  // upload state
  const [imageBase64, setImageBase64] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [parsed, setParsed] = useState(null);

  const reqItems = requisicion?.items || [];

  const cargarCotizaciones = async () => {
    setLoading(true);
    const { data } = await supabase.from("cotizaciones")
      .select("*").eq("requisicion_id", requisicion.id)
      .order("created_at", { ascending: false });
    setCotizaciones(data || []);
    setLoading(false);
  };

  useEffect(() => { cargarCotizaciones(); }, [requisicion?.id]);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMediaType(f.type);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result).split(",")[1];
      setImageBase64(b64);
      setStep("parsing");
      parseDocument(b64, f.type);
    };
    reader.readAsDataURL(f);
  };

  const parseDocument = async (b64, mt) => {
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke("parse-cotizacion", {
        body: { imageBase64: b64, mediaType: mt, reqItems },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "El parser no pudo leer la cotización");
      setParsed(data);
      setStep("review");
    } catch (e) {
      setError(String(e?.message || e));
      setStep("upload");
    }
  };

  const guardar = async () => {
    setStep("saving");
    setError("");
    try {
      const id = `COT_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await supabase.from("cotizaciones").insert({
        id,
        requisicion_id: requisicion.id,
        proveedor_nombre:   parsed.proveedor_nombre,
        proveedor_nit:      parsed.proveedor_nit,
        proveedor_email:    parsed.proveedor_email,
        proveedor_telefono: parsed.proveedor_telefono,
        cotizacion_numero:  parsed.cotizacion_numero,
        fecha_cotizacion:   parsed.fecha_cotizacion,
        fecha_vencimiento:  parsed.fecha_vencimiento,
        validez_dias:       parsed.validez_dias,
        condiciones_pago:   parsed.condiciones_pago,
        tiempo_entrega:     parsed.tiempo_entrega,
        items:              parsed.items || [],
        subtotal:           parsed.subtotal || 0,
        iva:                parsed.iva || 0,
        total:              parsed.total || 0,
        notas:              parsed.notas,
        parsed_data:        parsed,
        estado:             "recibida",
        created_by:         currentUser?.email || null,
      });
      await cargarCotizaciones();
      setParsed(null);
      setImageBase64(null);
      setStep("list");
      reload?.();
    } catch (e) {
      setError(String(e?.message || e));
      setStep("review");
    }
  };

  const seleccionar = async (cot) => {
    if (!confirm(`¿Marcar "${cot.proveedor_nombre || cot.cotizacion_numero}" como seleccionada y descartar las demás?`)) return;
    // Marcar todas como descartadas excepto esta
    const ids = cotizaciones.map(c => c.id);
    await supabase.from("cotizaciones").update({ estado: "descartada" }).in("id", ids);
    await supabase.from("cotizaciones").update({ estado: "seleccionada" }).eq("id", cot.id);
    await cargarCotizaciones();
  };

  const eliminar = async (cot) => {
    if (!confirm("¿Eliminar esta cotización?")) return;
    await supabase.from("cotizaciones").delete().eq("id", cot.id);
    await cargarCotizaciones();
  };

  // ── Vista de comparación ──────────────────────────────────────────────
  const totalMin = cotizaciones.length ? Math.min(...cotizaciones.map(c => Number(c.total || Infinity))) : 0;

  return (
    <div style={overlay}>
      <div style={{
        background: B.navy, borderRadius: 12, width: isMobile ? "100%" : 900,
        maxWidth: "100%", maxHeight: "92vh", overflow: "auto",
        border: `1px solid ${B.navyLight}`, color: B.white,
      }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: B.sand }}>📋 Cotizaciones</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              {requisicion.id} · {requisicion.titulo || requisicion.area} · {reqItems.length} ítems
            </div>
          </div>
          <button onClick={onClose} style={btnClose}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          {step === "list" && (
            <>
              {loading ? <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
                : cotizaciones.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40 }}>
                    <div style={{ fontSize: 36 }}>📄</div>
                    <div style={{ fontSize: 14, marginTop: 10, color: "rgba(255,255,255,0.6)" }}>Sin cotizaciones todavía.</div>
                    <button onClick={() => setStep("upload")} style={{ ...btnPrimary, marginTop: 16 }}>📎 Cargar cotización</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{cotizaciones.length} cotización{cotizaciones.length !== 1 ? "es" : ""}</div>
                      <button onClick={() => setStep("upload")} style={btnPrimary}>+ Nueva</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {cotizaciones.map(c => (
                        <div key={c.id} style={{
                          background: c.estado === "seleccionada" ? B.success + "11" : B.navyMid,
                          border: `1px solid ${c.estado === "seleccionada" ? B.success : B.navyLight}`,
                          borderRadius: 10, padding: 14,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <div style={{ fontSize: 14, fontWeight: 800 }}>
                                {c.proveedor_nombre || "—"}
                                {c.estado === "seleccionada" && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", background: B.success, color: B.navy, borderRadius: 12, fontWeight: 700 }}>SELECCIONADA</span>}
                                {c.estado === "descartada" && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", background: B.navyLight, color: "rgba(255,255,255,0.5)", borderRadius: 12, fontWeight: 700 }}>descartada</span>}
                              </div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                                {c.cotizacion_numero || "—"} · {fmtFecha(c.fecha_cotizacion)} · vence {fmtFecha(c.fecha_vencimiento)}
                              </div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                                {c.condiciones_pago || "—"} · Entrega: {c.tiempo_entrega || "—"}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{
                                fontSize: 18, fontWeight: 800,
                                color: Number(c.total) === totalMin ? B.success : B.sand,
                                fontFamily: "'Barlow Condensed', sans-serif",
                              }}>
                                {COP(c.total || 0)} {Number(c.total) === totalMin && cotizaciones.length > 1 ? "🏆" : ""}
                              </div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{(c.items || []).length} ítems</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                                {c.estado !== "seleccionada" && (
                                  <button onClick={() => seleccionar(c)} style={btnAccion(B.success)}>✓ Seleccionar</button>
                                )}
                                <button onClick={() => eliminar(c)} style={btnAccion(B.danger)}>🗑</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {cotizaciones.length > 1 && (
                      <div style={{ marginTop: 20, padding: 14, background: B.navyMid, borderRadius: 8, border: `1px solid ${B.navyLight}`, fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                        💡 Comparativa: la opción más económica está marcada con 🏆 ({COP(totalMin)}).
                        Diferencia con la más cara: <span style={{ color: B.warning, fontWeight: 700 }}>{COP(Math.max(...cotizaciones.map(c => Number(c.total || 0))) - totalMin)}</span>
                      </div>
                    )}
                  </>
                )
              }
            </>
          )}

          {step === "upload" && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40 }}>📎</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 12 }}>Carga la cotización</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6, marginBottom: 20 }}>
                PDF, foto o screenshot. Claude AI extrae los datos automáticamente.
              </div>
              <input type="file" accept="image/*,application/pdf" onChange={onFile} style={{ display: "none" }} id="cot-file" />
              <label htmlFor="cot-file" style={{ ...btnPrimary, display: "inline-block", cursor: "pointer" }}>
                Seleccionar archivo
              </label>
              {error && <div style={errorBox}>{error}</div>}
              <div style={{ marginTop: 16 }}>
                <button onClick={() => setStep("list")} style={btnSecondary}>← Volver</button>
              </div>
            </div>
          )}

          {step === "parsing" && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 12 }}>Claude AI leyendo la cotización…</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>Puede tomar 5–15 segundos.</div>
            </div>
          )}

          {step === "review" && parsed && (
            <ReviewSection parsed={parsed} setParsed={setParsed} onSave={guardar} onCancel={() => { setParsed(null); setStep("upload"); }} reqItems={reqItems} error={error} />
          )}

          {step === "saving" && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40 }}>💾</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 12 }}>Guardando cotización…</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Review ────────────────────────────────────────────────────────────────
function ReviewSection({ parsed, setParsed, onSave, onCancel, reqItems, error }) {
  const upd = (path, value) => {
    setParsed(p => ({ ...p, [path]: value }));
  };

  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: B.sand }}>📋 Revisa los datos extraídos</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <Field label="Proveedor"><input value={parsed.proveedor_nombre || ""} onChange={e => upd("proveedor_nombre", e.target.value)} style={input} /></Field>
        <Field label="NIT"><input value={parsed.proveedor_nit || ""} onChange={e => upd("proveedor_nit", e.target.value)} style={input} /></Field>
        <Field label="Email"><input value={parsed.proveedor_email || ""} onChange={e => upd("proveedor_email", e.target.value)} style={input} /></Field>
        <Field label="Teléfono"><input value={parsed.proveedor_telefono || ""} onChange={e => upd("proveedor_telefono", e.target.value)} style={input} /></Field>
        <Field label="N° Cotización"><input value={parsed.cotizacion_numero || ""} onChange={e => upd("cotizacion_numero", e.target.value)} style={input} /></Field>
        <Field label="Fecha"><input type="date" value={parsed.fecha_cotizacion || ""} onChange={e => upd("fecha_cotizacion", e.target.value)} style={input} /></Field>
        <Field label="Vencimiento"><input type="date" value={parsed.fecha_vencimiento || ""} onChange={e => upd("fecha_vencimiento", e.target.value)} style={input} /></Field>
        <Field label="Validez (días)"><input type="number" value={parsed.validez_dias || ""} onChange={e => upd("validez_dias", Number(e.target.value))} style={input} /></Field>
        <Field label="Condiciones de pago"><input value={parsed.condiciones_pago || ""} onChange={e => upd("condiciones_pago", e.target.value)} style={input} /></Field>
        <Field label="Tiempo entrega"><input value={parsed.tiempo_entrega || ""} onChange={e => upd("tiempo_entrega", e.target.value)} style={input} /></Field>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginTop: 14, marginBottom: 6 }}>
        Items ({(parsed.items || []).length})
      </div>
      <div style={{ background: B.navyMid, borderRadius: 8, padding: 8, maxHeight: 240, overflow: "auto" }}>
        {(parsed.items || []).map((it, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 60px 60px 110px 110px", gap: 6, padding: "6px 4px", borderBottom: `1px solid ${B.navyLight}`, fontSize: 11, alignItems: "center" }}>
            <div>{it.nombre}</div>
            <div style={{ textAlign: "right" }}>{it.cantidad}</div>
            <div style={{ color: "rgba(255,255,255,0.5)" }}>{it.unidad}</div>
            <div style={{ textAlign: "right" }}>{COP(it.precio_unitario || 0)}</div>
            <div style={{ textAlign: "right", fontWeight: 700, color: B.sand }}>{COP(it.subtotal || 0)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12, fontSize: 13 }}>
        <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Subtotal:</span> <strong>{COP(parsed.subtotal || 0)}</strong></div>
        <div><span style={{ color: "rgba(255,255,255,0.5)" }}>IVA:</span> <strong>{COP(parsed.iva || 0)}</strong></div>
        <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Total:</span> <strong style={{ color: B.sand, fontSize: 16 }}>{COP(parsed.total || 0)}</strong></div>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={btnSecondary}>← Volver</button>
        <button onClick={onSave} style={btnPrimary}>💾 Guardar cotización</button>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9000, padding: 16,
};
const input = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: `1px solid ${B.navyLight}`, background: B.navyMid, color: B.white,
  fontSize: 12, boxSizing: "border-box",
};
const btnPrimary = {
  padding: "9px 16px", border: "none", borderRadius: 8,
  background: B.sand, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const btnSecondary = {
  padding: "9px 16px", border: `1px solid ${B.navyLight}`, borderRadius: 8,
  background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnClose = {
  width: 32, height: 32, borderRadius: 16, border: `1px solid ${B.navyLight}`,
  background: "transparent", color: B.white, fontSize: 22, cursor: "pointer",
};
const errorBox = {
  padding: 10, background: B.danger + "22", border: `1px solid ${B.danger}`,
  borderRadius: 6, fontSize: 12, color: B.danger, marginTop: 12,
};
function btnAccion(color) {
  return {
    padding: "5px 10px", fontSize: 11, fontWeight: 700, borderRadius: 6,
    border: `1px solid ${color}`, background: color + "22", color, cursor: "pointer",
  };
}
