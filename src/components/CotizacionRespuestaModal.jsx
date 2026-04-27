// CotizacionRespuestaModal — El proveedor responde a la OC con SU cotización.
// Compras la sube, AI la lee, revisa diferencias vs OC original, aprueba y
// dispara el flujo de anticipo a contabilidad.
import { useState } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

export default function CotizacionRespuestaModal({ oc, onClose, reload, currentUser }) {
  const [step, setStep] = useState(oc.cotizacion_resp_data ? "review" : "upload"); // upload | parsing | review | approving
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(oc.cotizacion_resp_data || null);
  const [archivo_url, setArchivoUrl] = useState(oc.cotizacion_resp_url || null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const [items, setItems] = useState(() => {
    if (oc.cotizacion_resp_data?.items) return oc.cotizacion_resp_data.items;
    return (oc.items || []).map((it, i) => ({
      oc_idx: i,
      nombre: it.item || it.nombre,
      cantidad: it.cant || 0,
      unidad: it.unidad || "UND",
      precio_unitario: Number(it.precioU) || 0,
      precio_anterior: Number(it.precioU) || 0,
      tiempo_entrega: "",
      disponibilidad: "inmediata",
    }));
  });
  const [requiereAnticipo, setRequiereAnticipo] = useState(oc.anticipo_requerido || false);
  const [porcentajeAnt, setPorcentajeAnt] = useState(oc.anticipo_porcentaje || 50);
  const [notas, setNotas] = useState(oc.cotizacion_resp_notas || "");
  const [tiempoEntrega, setTiempoEntrega] = useState(parsed?.tiempo_entrega || "");
  const [condicionesPago, setCondicionesPago] = useState(parsed?.condiciones_pago || "");

  const fileToBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

  const handleUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setStep("parsing"); setError(""); setProgress("Subiendo archivo…");
    try {
      const safe = f.name.replace(/[^\w.\-]/g, "_");
      const path = `oc/${oc.codigo || oc.id}/cotizacion-resp-${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from("motores").upload(path, f, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("motores").getPublicUrl(path);
      setArchivoUrl(pub.publicUrl);

      setProgress("Leyendo cotización con IA…");
      const isPDF = f.type === "application/pdf";
      const base64 = await fileToBase64(f);
      const reqItems = (oc.items || []).map(it => ({ item: it.item || it.nombre, cant: it.cant, unidad: it.unidad }));
      const body = isPDF
        ? { pdfBase64: base64, mediaType: "application/pdf", reqItems }
        : { imageBase64: base64, mediaType: f.type, reqItems };
      const { data, error } = await supabase.functions.invoke("parse-cotizacion", { body });
      if (error) throw error;
      if (!data?.ok) {
        // Caímos en parser pero el archivo está subido — el usuario revisa manual
        setError(data?.error || "AI no pudo leer la cotización — ajusta manualmente abajo.");
        setStep("review");
        return;
      }

      setParsed(data);
      // Mezclar items del AI con los de la OC: priorizar match_req_idx
      const itemsRich = (oc.items || []).map((ocIt, i) => {
        const aiIt = (data.items || []).find(x => x.match_req_idx === i);
        if (aiIt) {
          return {
            oc_idx: i,
            nombre: aiIt.nombre || ocIt.item || ocIt.nombre,
            cantidad: aiIt.cantidad || ocIt.cant,
            unidad: aiIt.unidad || ocIt.unidad,
            precio_unitario: Number(aiIt.precio_unitario) || Number(ocIt.precioU) || 0,
            precio_anterior: Number(ocIt.precioU) || 0,
            disponibilidad: aiIt.disponibilidad || "inmediata",
          };
        }
        return {
          oc_idx: i,
          nombre: ocIt.item || ocIt.nombre,
          cantidad: ocIt.cant,
          unidad: ocIt.unidad,
          precio_unitario: Number(ocIt.precioU) || 0,
          precio_anterior: Number(ocIt.precioU) || 0,
          disponibilidad: "inmediata",
        };
      });
      setItems(itemsRich);
      setTiempoEntrega(data.tiempo_entrega || "");
      setCondicionesPago(data.condiciones_pago || "");
      setProgress(`✅ Cotización leída — ${itemsRich.length} items`);
      setStep("review");
    } catch (e) {
      setError(String(e?.message || e));
      setStep("upload");
    }
  };

  const subtotalNuevo  = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0);
  const subtotalOrig   = (oc.items || []).reduce((s, it) => s + (Number(it.cant) || 0) * (Number(it.precioU) || 0), 0);
  const delta          = subtotalNuevo - subtotalOrig;
  const montoAnticipo  = Math.round(subtotalNuevo * (porcentajeAnt / 100));

  const aprobar = async () => {
    setStep("approving"); setError("");
    try {
      const newItems = items.map((it, i) => {
        const ocIt = oc.items[i] || {};
        return {
          ...ocIt,
          item: it.nombre, nombre: it.nombre,
          cant: Number(it.cantidad) || 0,
          unidad: it.unidad,
          precioU: Number(it.precio_unitario) || 0,
          subtotal: Math.round((Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0)),
        };
      });
      const newSubtotal = newItems.reduce((s, x) => s + (Number(x.subtotal) || 0), 0);

      const { error: e } = await supabase.from("ordenes_compra").update({
        items: newItems,
        subtotal: newSubtotal,
        total: newSubtotal,                       // sin IVA todavía (la factura final lo trae)
        cotizacion_resp_url:           archivo_url,
        cotizacion_resp_data:          { ...parsed, items, tiempo_entrega: tiempoEntrega, condiciones_pago: condicionesPago },
        cotizacion_resp_subida_at:     parsed?.cotizacion_resp_subida_at || new Date().toISOString(),
        cotizacion_resp_subida_por:    currentUser?.email || null,
        cotizacion_resp_aprobada:      true,
        cotizacion_resp_aprobada_at:   new Date().toISOString(),
        cotizacion_resp_aprobada_por:  currentUser?.email || null,
        cotizacion_resp_notas:         notas || null,
        anticipo_requerido:            requiereAnticipo,
        anticipo_porcentaje:           porcentajeAnt,
        anticipo_monto:                requiereAnticipo ? montoAnticipo : 0,
        anticipo_solicitado_at:        requiereAnticipo ? new Date().toISOString() : null,
        estado:                        requiereAnticipo ? "anticipo_pendiente" : "confirmada",
        updated_at:                    new Date().toISOString(),
      }).eq("id", oc.id);
      if (e) throw e;

      reload?.();
      onClose();
    } catch (e) {
      setError(String(e?.message || e));
      setStep("review");
    }
  };

  const guardarSinAprobar = async () => {
    setStep("approving"); setError("");
    try {
      const { error: e } = await supabase.from("ordenes_compra").update({
        cotizacion_resp_url:        archivo_url,
        cotizacion_resp_data:       { ...parsed, items, tiempo_entrega: tiempoEntrega, condiciones_pago: condicionesPago },
        cotizacion_resp_subida_at:  parsed?.cotizacion_resp_subida_at || new Date().toISOString(),
        cotizacion_resp_subida_por: currentUser?.email || null,
        cotizacion_resp_notas:      notas || null,
        updated_at:                 new Date().toISOString(),
      }).eq("id", oc.id);
      if (e) throw e;
      reload?.();
      onClose();
    } catch (e) {
      setError(String(e?.message || e));
      setStep("review");
    }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 1300, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 12, width: "100%", maxWidth: 880, padding: 24, marginTop: 30, border: `1px solid ${B.navyLight}`, color: B.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📋 Cotización del Proveedor</h3>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {oc.codigo} · {oc.proveedor_nombre} · OC original: {COP(oc.total)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {step === "upload" && (
          <>
            <div style={{ background: B.navy, border: `2px dashed ${B.navyLight}`, borderRadius: 12, padding: 30, textAlign: "center" }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>
                Sube la <strong>cotización-respuesta del proveedor</strong> (PDF o imagen).
                <br/>El AI extrae items, precios, tiempo de entrega y condiciones de pago.
              </div>
              <input type="file" accept="image/*,application/pdf" onChange={handleUpload}
                style={{ background: B.sky, color: B.navy, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none" }} />
            </div>
            {error && <div style={{ marginTop: 12, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{error}</div>}
          </>
        )}

        {step === "parsing" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>{progress}</div>
          </div>
        )}

        {step === "review" && (
          <>
            {progress && <div style={{ marginBottom: 10, padding: 8, background: B.success + "11", color: B.success, borderRadius: 6, fontSize: 12 }}>{progress}</div>}
            {error && <div style={{ marginBottom: 10, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={LBL}>Tiempo de entrega</label>
                <input value={tiempoEntrega} onChange={e => setTiempoEntrega(e.target.value)} style={INP} placeholder="Ej: 5 días hábiles" />
              </div>
              <div>
                <label style={LBL}>Condiciones de pago</label>
                <input value={condicionesPago} onChange={e => setCondicionesPago(e.target.value)} style={INP} placeholder="Ej: 50% anticipo / 50% contraentrega" />
              </div>
            </div>

            <div style={{ background: B.navy, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: B.navyLight }}>
                    {["Item", "Cant", "Unidad", "Precio orig.", "Precio nuevo", "Δ", "Subtotal"].map((h, i) => (
                      <th key={h + i} style={{ padding: "8px 10px", textAlign: i < 3 ? "left" : "right", fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const sub = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
                    const d = (Number(it.precio_unitario) || 0) - (Number(it.precio_anterior) || 0);
                    const cambio = Math.abs(d) > 0.01;
                    const c = d > 0 ? B.danger : d < 0 ? B.success : "rgba(255,255,255,0.4)";
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${B.navyLight}`, background: cambio ? "rgba(245,158,11,0.06)" : "transparent" }}>
                        <td style={{ padding: "8px 10px" }}>{it.nombre}</td>
                        <td style={{ padding: "6px 10px" }}>
                          <input type="number" value={it.cantidad} onChange={e => setItems(arr => arr.map((p, j) => j === i ? { ...p, cantidad: Number(e.target.value) || 0 } : p))}
                            style={{ ...INP, padding: "4px 6px", fontSize: 11, width: 60, textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.5)" }}>{it.unidad}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "rgba(255,255,255,0.5)" }}>{COP(it.precio_anterior)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>
                          <input type="number" value={it.precio_unitario} onChange={e => setItems(arr => arr.map((p, j) => j === i ? { ...p, precio_unitario: Number(e.target.value) || 0 } : p))}
                            style={{ ...INP, padding: "4px 6px", fontSize: 11, width: 90, textAlign: "right",
                              borderColor: cambio ? B.warning : B.navyLight, color: cambio ? B.warning : "#fff" }} />
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: c, fontWeight: 700 }}>{cambio ? `${d > 0 ? "+" : ""}${COP(d)}` : "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: B.sand, fontWeight: 700 }}>{COP(sub)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: B.navyMid }}>
                    <td colSpan={6} style={{ padding: "10px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>Subtotal cotización</td>
                    <td style={{ padding: "10px", textAlign: "right", color: B.sand, fontWeight: 800, fontSize: 14 }}>{COP(subtotalNuevo)}</td>
                  </tr>
                  {Math.abs(delta) > 0.5 && (
                    <tr style={{ background: B.navyMid }}>
                      <td colSpan={6} style={{ padding: "6px 10px", textAlign: "right", color: "rgba(255,255,255,0.5)" }}>Diferencia vs OC original</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", color: delta > 0 ? B.danger : B.success, fontWeight: 700 }}>{delta > 0 ? "+" : ""}{COP(delta)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>

            {/* Anticipo */}
            <div style={{ background: B.navy, borderRadius: 10, padding: 14, marginBottom: 14, border: `1px solid ${B.navyLight}` }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
                <input type="checkbox" checked={requiereAnticipo} onChange={e => setRequiereAnticipo(e.target.checked)} style={{ width: 16, height: 16 }} />
                <span>🏦 Requiere anticipo de contabilidad</span>
              </label>
              {requiereAnticipo && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
                  <div>
                    <label style={LBL}>% del total a anticipar</label>
                    <input type="number" min={1} max={100} value={porcentajeAnt} onChange={e => setPorcentajeAnt(Math.min(100, Math.max(1, Number(e.target.value) || 50)))} style={INP} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700 }}>Monto anticipo</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: B.warning, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(montoAnticipo)}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>de {COP(subtotalNuevo)} total</div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={LBL}>Notas / Observaciones</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} style={{ ...INP, resize: "vertical", fontFamily: "inherit" }} placeholder="Ej: precios incluyen entrega en muelle, descuento por volumen, etc." />
            </div>

            {archivo_url && (
              <a href={archivo_url} target="_blank" rel="noreferrer"
                style={{ display: "inline-block", padding: "6px 12px", borderRadius: 6, border: `1px solid ${B.sky}`, color: B.sky, fontSize: 11, textDecoration: "none", marginBottom: 12 }}>
                📎 Ver cotización adjunta
              </a>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={btnSec}>Cancelar</button>
              <button onClick={guardarSinAprobar} style={{ ...btnSec, borderColor: B.sky, color: B.sky }}>💾 Guardar borrador</button>
              <button onClick={aprobar}
                style={{ padding: "11px 22px", borderRadius: 8, border: "none", background: B.success, color: B.navy, fontSize: 13, cursor: "pointer", fontWeight: 800 }}>
                {requiereAnticipo ? "✓ Aprobar y enviar a Contabilidad" : "✓ Aprobar cotización"}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>
              {requiereAnticipo ? "Aparecerá en Compras → Cuentas x Pagar → Anticipos" : "Pasa a estado 'confirmada' lista para recibir."}
            </div>
          </>
        )}

        {step === "approving" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>Guardando…</div>
          </div>
        )}
      </div>
    </div>
  );
}

const INP = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LBL = { fontSize: 11, color: B.sand, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };
const btnSec = { padding: "11px 18px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer", fontWeight: 600 };
