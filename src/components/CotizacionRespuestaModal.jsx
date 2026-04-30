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
      nombre_anterior: it.item || it.nombre,                // ← para detectar rename del proveedor
      cantidad: it.cant || 0,
      cantidad_anterior: Number(it.cant) || 0,              // ← para detectar cambio de cantidad
      unidad: it.unidad || "UND",
      precio_unitario: Number(it.precioU) || 0,
      precio_anterior: Number(it.precioU) || 0,
      item_id: it.item_id || null,                          // ← para sync a catálogo + Loggro
      loggro_id: it.loggro_id || null,
      tiempo_entrega: "",
      disponibilidad: "inmediata",
    }));
  });
  const [syncingNombreIdx, setSyncingNombreIdx] = useState(null);
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
        const nombreOrig = ocIt.item || ocIt.nombre;
        const cantOrig   = Number(ocIt.cant) || 0;
        if (aiIt) {
          return {
            oc_idx: i,
            nombre:           aiIt.nombre || nombreOrig,
            nombre_anterior:  nombreOrig,
            cantidad:         Number(aiIt.cantidad) || cantOrig,
            cantidad_anterior: cantOrig,
            unidad:           aiIt.unidad || ocIt.unidad,
            precio_unitario:  Number(aiIt.precio_unitario) || Number(ocIt.precioU) || 0,
            precio_anterior:  Number(ocIt.precioU) || 0,
            item_id:          ocIt.item_id || null,
            loggro_id:        ocIt.loggro_id || null,
            disponibilidad:   aiIt.disponibilidad || "inmediata",
          };
        }
        return {
          oc_idx: i,
          nombre:           nombreOrig,
          nombre_anterior:  nombreOrig,
          cantidad:         cantOrig,
          cantidad_anterior: cantOrig,
          unidad:           ocIt.unidad,
          precio_unitario:  Number(ocIt.precioU) || 0,
          precio_anterior:  Number(ocIt.precioU) || 0,
          item_id:          ocIt.item_id || null,
          loggro_id:        ocIt.loggro_id || null,
          disponibilidad:   "inmediata",
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

  // ── Diff detection ──────────────────────────────────────────────────
  // Detectar todos los cambios del proveedor vs la OC original. El usuario
  // los ve en una banner arriba + cada fila resalta sus campos cambiados.
  const eqStr = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
  const itemDiffs = items.map(it => ({
    nombreCambio: !eqStr(it.nombre, it.nombre_anterior),
    cantidadCambio: Math.abs((Number(it.cantidad) || 0) - (Number(it.cantidad_anterior) || 0)) > 0.0001,
    precioCambio: Math.abs((Number(it.precio_unitario) || 0) - (Number(it.precio_anterior) || 0)) > 0.01,
  }));
  const totDiffNombres   = itemDiffs.filter(d => d.nombreCambio).length;
  const totDiffCantidad  = itemDiffs.filter(d => d.cantidadCambio).length;
  const totDiffPrecio    = itemDiffs.filter(d => d.precioCambio).length;
  const totalCambios     = totDiffNombres + totDiffCantidad + totDiffPrecio;

  // ── Sync nombre con catálogo + Loggro ──────────────────────────────
  // Cuando el proveedor renombra un producto, el usuario puede confirmar
  // que el nuevo nombre se propague a items_catalogo y a Loggro.
  const sincronizarNombre = async (idx) => {
    const it = items[idx];
    if (!it) return;
    const nuevo = (it.nombre || "").trim();
    const previo = (it.nombre_anterior || "").trim();
    if (!nuevo || eqStr(nuevo, previo)) return;
    if (!it.item_id && !it.loggro_id) {
      alert("Este producto no está conectado al catálogo ni a Loggro — no hay nombre que sincronizar.");
      return;
    }
    if (!confirm(`¿Renombrar "${previo}" → "${nuevo}" en Atolón${it.loggro_id ? " + Loggro" : ""}?`)) return;
    setSyncingNombreIdx(idx);
    try {
      // 1. Actualizar items_catalogo
      if (it.item_id) {
        const { error } = await supabase.from("items_catalogo")
          .update({ nombre: nuevo, updated_at: new Date().toISOString() })
          .eq("id", it.item_id);
        if (error) throw error;
      }
      // 2. Actualizar ingrediente en Loggro (mismo endpoint que usa Recepciones)
      if (it.loggro_id) {
        const { error } = await supabase.functions.invoke("loggro-sync/update-ingredient", {
          body: { loggro_id: it.loggro_id, nombre: nuevo },
        });
        if (error) throw error;
      }
      // 3. Marcar local: nombre_anterior = nombre nuevo (deja de ser un diff)
      setItems(arr => arr.map((p, j) => j === idx ? { ...p, nombre_anterior: nuevo } : p));
      setProgress(`✅ Nombre sincronizado: "${nuevo}"`);
    } catch (e) {
      setError(`Error al sincronizar nombre: ${e.message || e}`);
    } finally {
      setSyncingNombreIdx(null);
    }
  };

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

            {/* ── Banner de diferencias detectadas ────────────────────── */}
            {totalCambios > 0 && (
              <div style={{
                marginBottom: 14, padding: "12px 14px", borderRadius: 10,
                background: "rgba(245,158,11,0.12)", border: `1px solid ${B.warning}55`,
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: B.warning, marginBottom: 2 }}>
                    {totalCambios} {totalCambios === 1 ? "diferencia detectada" : "diferencias detectadas"} vs OC original
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {totDiffNombres   > 0 && <span>📝 {totDiffNombres} {totDiffNombres === 1 ? "nombre" : "nombres"}</span>}
                    {totDiffCantidad  > 0 && <span>📦 {totDiffCantidad} {totDiffCantidad === 1 ? "cantidad" : "cantidades"}</span>}
                    {totDiffPrecio    > 0 && <span>💰 {totDiffPrecio} {totDiffPrecio === 1 ? "precio" : "precios"}</span>}
                  </div>
                </div>
                {totDiffNombres > 0 && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", maxWidth: 220, lineHeight: 1.4 }}>
                    Si el proveedor renombró un producto, usa el botón 🔄 para actualizar Atolón + Loggro.
                  </div>
                )}
              </div>
            )}

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
                    const diff = itemDiffs[i] || {};
                    const cambioAlguno = diff.nombreCambio || diff.cantidadCambio || diff.precioCambio;
                    const c = d > 0 ? B.danger : d < 0 ? B.success : "rgba(255,255,255,0.4)";
                    const cantD = (Number(it.cantidad) || 0) - (Number(it.cantidad_anterior) || 0);
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${B.navyLight}`, background: cambioAlguno ? "rgba(245,158,11,0.06)" : "transparent" }}>
                        <td style={{ padding: "8px 10px" }}>
                          <input value={it.nombre || ""}
                            onChange={e => setItems(arr => arr.map((p, j) => j === i ? { ...p, nombre: e.target.value } : p))}
                            style={{ ...INP, padding: "4px 8px", fontSize: 12, minWidth: 180,
                              borderColor: diff.nombreCambio ? B.warning : B.navyLight,
                              color: diff.nombreCambio ? B.warning : "#fff" }} />
                          {diff.nombreCambio && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                                Antes: <s>{it.nombre_anterior}</s>
                              </span>
                              {(it.item_id || it.loggro_id) && (
                                <button
                                  onClick={() => sincronizarNombre(i)}
                                  disabled={syncingNombreIdx === i}
                                  title={`Renombrar en catálogo${it.loggro_id ? " + Loggro" : ""}`}
                                  style={{
                                    padding: "2px 8px", fontSize: 10, fontWeight: 700,
                                    borderRadius: 5, border: `1px solid ${B.sky}`,
                                    background: B.sky + "22", color: B.sky,
                                    cursor: syncingNombreIdx === i ? "wait" : "pointer",
                                    opacity: syncingNombreIdx === i ? 0.6 : 1,
                                  }}>
                                  {syncingNombreIdx === i ? "⏳…" : `🔄 Sync${it.loggro_id ? " + Loggro" : ""}`}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <input type="number" value={it.cantidad} onChange={e => setItems(arr => arr.map((p, j) => j === i ? { ...p, cantidad: Number(e.target.value) || 0 } : p))}
                            style={{ ...INP, padding: "4px 6px", fontSize: 11, width: 60, textAlign: "right",
                              borderColor: diff.cantidadCambio ? B.warning : B.navyLight,
                              color: diff.cantidadCambio ? B.warning : "#fff" }} />
                          {diff.cantidadCambio && (
                            <div style={{ fontSize: 9, color: cantD > 0 ? B.danger : B.success, fontWeight: 700, textAlign: "right", marginTop: 2 }}>
                              {cantD > 0 ? "+" : ""}{cantD} (antes {it.cantidad_anterior})
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.5)" }}>{it.unidad}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: "rgba(255,255,255,0.5)" }}>{COP(it.precio_anterior)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>
                          <input type="number" value={it.precio_unitario} onChange={e => setItems(arr => arr.map((p, j) => j === i ? { ...p, precio_unitario: Number(e.target.value) || 0 } : p))}
                            style={{ ...INP, padding: "4px 6px", fontSize: 11, width: 90, textAlign: "right",
                              borderColor: diff.precioCambio ? B.warning : B.navyLight, color: diff.precioCambio ? B.warning : "#fff" }} />
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: c, fontWeight: 700 }}>{diff.precioCambio ? `${d > 0 ? "+" : ""}${COP(d)}` : "—"}</td>
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
