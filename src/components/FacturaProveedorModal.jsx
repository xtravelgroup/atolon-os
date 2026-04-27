// FacturaProveedorModal.jsx — Adjuntar factura de proveedor a una OC
// Flujo: subir PDF/imagen → AI parsea → tabla editable de items+precios+IVA →
// "Aplicar" → actualiza OC items + total + items_catalogo.precio_compra

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

export default function FacturaProveedorModal({ oc, onClose, reload, currentUser }) {
  const [step, setStep] = useState("upload"); // upload | parsing | review | applying | done
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [data, setData] = useState({
    factura_numero: oc.factura_numero || "",
    factura_fecha: oc.factura_fecha?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    subtotal: 0,
    iva: 0,
    total: 0,
    items: [],
  });
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState("");

  // Pre-cargar items de la OC (items y cantidades) — el usuario sólo edita el precio_unit
  useEffect(() => {
    setData(d => ({
      ...d,
      items: (oc.items || []).map((it, i) => ({
        oc_idx: i,
        nombre: it.item || it.nombre,
        cantidad: Number(it.cant) || 0,
        unidad: it.unidad || "",
        precio_unitario: Number(it.precioU) || 0,
        precio_anterior: Number(it.precioU) || 0,
        iva: 0,
        item_id: it.item_id || null,
      })),
    }));
  }, [oc.id]);

  async function fileToBase64(f) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        // Quitar el prefijo "data:.../...;base64,"
        const base64 = String(result).split(",")[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  async function handleUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setStep("parsing");
    setErr("");
    setProgress("Subiendo archivo…");

    try {
      // Subir al bucket
      const safe = f.name.replace(/[^\w.\-]/g, "_");
      const path = `oc/${oc.codigo || oc.id}/factura-${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from("motores").upload(path, f, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("motores").getPublicUrl(path);
      data.factura_url = pub.publicUrl;

      // Parsear con AI tanto imágenes como PDFs (Claude soporta ambos)
      const isImage = f.type.startsWith("image/");
      const isPDF = f.type === "application/pdf";

      if (isImage || isPDF) {
        setProgress(isPDF ? "Leyendo PDF con IA…" : "Leyendo factura con IA…");
        const base64 = await fileToBase64(f);
        const payload = isPDF
          ? { pdfBase64: base64, mediaType: "application/pdf", ocItems: oc.items || [] }
          : { imageBase64: base64, mediaType: f.type, ocItems: oc.items || [] };

        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-factura`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (result.ok) {
          setParsed(result);
          // Pre-rellenar con datos de AI. Items de la factura se enriquecen con
          // los rich fields del parser (código de barras, ICO, IVA, etc).
          // Para los items que matchean con la OC, los completamos con el oc_idx
          // y el item_id del catálogo. Los items extra de la factura se agregan
          // al final como items "nuevos" para revisión.
          const ocItemsCount = (oc.items || []).length;
          const matched = new Set();
          const itemsRich = (result.items || []).map((aiItem, aiIdx) => {
            const ocIdx = aiItem.match_oc_idx;
            const matchOc = (typeof ocIdx === "number" && ocIdx >= 0 && ocIdx < ocItemsCount) ? oc.items[ocIdx] : null;
            if (matchOc) matched.add(ocIdx);

            const precioCostoUnit = Number(aiItem.precio_costo_unit) || 0;
            const precioBase      = Number(aiItem.precio_base_unit) || precioCostoUnit;
            const ivaUnit         = Number(aiItem.iva_valor_unit) || 0;
            const cant            = Number(aiItem.cantidad) || 0;

            return {
              oc_idx: matchOc ? ocIdx : null,        // null si no matchea con la OC
              ai_idx: aiIdx,
              codigo_barras:        aiItem.codigo_barras || null,
              referencia_proveedor: aiItem.referencia_proveedor || null,
              nombre:               aiItem.nombre || matchOc?.item || matchOc?.nombre || "—",
              cantidad:             cant,
              unidad:               aiItem.unidad || matchOc?.unidad || "UND",
              precio_base_unit:     precioBase,
              descuento_pct:        Number(aiItem.descuento_pct) || 0,
              iva_pct:              Number(aiItem.iva_pct) || 0,
              iva_valor_unit:       ivaUnit,
              ico_valor_unit:       Number(aiItem.ico_valor_unit) || 0,
              icl_valor_unit:       Number(aiItem.icl_valor_unit) || 0,
              adv_valor_unit:       Number(aiItem.adv_valor_unit) || 0,
              precio_costo_unit:    precioCostoUnit,           // base + ICO + ICL + ADV (no deducibles)
              precio_final_unit:    Number(aiItem.precio_final_unit) || (precioCostoUnit + ivaUnit),
              subtotal_renglon:     Number(aiItem.subtotal_renglon) || cant * precioCostoUnit,
              iva_total_renglon:    cant * ivaUnit,
              // Para compatibilidad con flujo anterior:
              precio_unitario:      precioCostoUnit,           // lo que va al precio_compra
              precio_anterior:      matchOc ? Number(matchOc.precioU) || 0 : 0,
              iva:                  cant * ivaUnit,
              item_id:              matchOc?.item_id || null,
              es_nuevo_oc:          !matchOc,                   // bandera: este item no estaba en la OC
            };
          });

          // Items de la OC que no fueron matcheados (la factura no los trae)
          const ocNoMatcheados = (oc.items || []).map((it, i) => {
            if (matched.has(i)) return null;
            return {
              oc_idx: i, ai_idx: null,
              nombre: it.item || it.nombre,
              cantidad: Number(it.cant) || 0,
              unidad: it.unidad || "",
              precio_unitario: Number(it.precioU) || 0,
              precio_anterior: Number(it.precioU) || 0,
              precio_costo_unit: Number(it.precioU) || 0,
              precio_base_unit: Number(it.precioU) || 0,
              iva: 0, iva_valor_unit: 0,
              item_id: it.item_id || null,
              no_facturado: true,
            };
          }).filter(Boolean);

          setData(d => ({
            ...d,
            factura_numero:    result.factura_numero || d.factura_numero,
            factura_fecha:     result.factura_fecha || d.factura_fecha,
            fecha_vencimiento: result.fecha_vencimiento || null,
            forma_pago:        result.forma_pago || null,
            no_pedido:         result.no_pedido || null,
            no_remision:       result.no_remision || null,
            subtotal_base:     Number(result.subtotal_base) || 0,
            iva_total:         Number(result.iva_total) || 0,
            consumo_total:     Number(result.consumo_total) || 0,
            ico_total:         Number(result.ico_total) || 0,
            icl_total:         Number(result.icl_total) || 0,
            adv_total:         Number(result.adv_total) || 0,
            descuentos_total:  Number(result.descuentos_total) || 0,
            // Compat: campos antiguos
            subtotal:          Number(result.subtotal_base) || 0,
            iva:               Number(result.iva_total) || 0,
            total:             Number(result.total) || 0,
            items:             [...itemsRich, ...ocNoMatcheados],
            factura_url:       pub.publicUrl,
          }));
          setProgress(`✅ Factura leída — ${itemsRich.length} items extraídos${ocNoMatcheados.length ? ` · ${ocNoMatcheados.length} de la OC no facturados` : ""}`);
        } else {
          setErr(result.error || "No se pudo leer la factura — ingresa los datos manualmente");
          setData(d => ({ ...d, factura_url: pub.publicUrl }));
        }
      } else {
        // Otros tipos (no imagen ni PDF): solo adjunto, manual
        setData(d => ({ ...d, factura_url: pub.publicUrl }));
        setProgress("📎 Archivo adjuntado — ingresa los datos manualmente abajo");
      }
      setStep("review");
    } catch (e) {
      setErr(e.message || String(e));
      setStep("upload");
    }
  }

  function setField(k, v) { setData(d => ({ ...d, [k]: v })); }
  function setItemField(i, k, v) {
    setData(d => ({ ...d, items: d.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  }

  // Recalcular subtotales en vivo
  const subtotalCalc = data.items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0);
  const ivaCalc      = data.items.reduce((s, it) => s + (Number(it.iva) || 0), 0) || Number(data.iva) || 0;
  const totalCalc    = subtotalCalc + ivaCalc;
  const usarSubtotal = Number(data.subtotal) || subtotalCalc;
  const usarIva      = Number(data.iva)      || ivaCalc;
  const usarTotal    = Number(data.total)    || (usarSubtotal + usarIva);

  async function aplicar() {
    if (!data.factura_numero) { setErr("Número de factura obligatorio"); return; }
    setStep("applying");
    setErr("");
    try {
      // 1. Construir items actualizados de la OC con los precios reales (costo = base + ICO+ICL+ADV)
      const ocItemsOriginal = oc.items || [];
      const itemsActualizados = ocItemsOriginal.map((it, i) => {
        const f = data.items.find(x => x.oc_idx === i && !x.no_facturado);
        if (!f) return it;
        const precioU = Number(f.precio_costo_unit ?? f.precio_unitario) || Number(it.precioU) || 0;
        const cant = Number(it.cant) || 0;
        return {
          ...it,
          precioU,
          subtotal: Math.round(cant * precioU),
          // metadata extra para auditoría
          factura_codigo_barras: f.codigo_barras || it.codigo_barras || null,
          factura_iva_unit:      Number(f.iva_valor_unit) || 0,
          factura_consumo_unit:  (Number(f.ico_valor_unit) || 0) + (Number(f.icl_valor_unit) || 0) + (Number(f.adv_valor_unit) || 0),
        };
      });

      // 1b. Items de la factura que NO estaban en la OC original — los agregamos
      const itemsNuevosOC = data.items.filter(f => f.es_nuevo_oc && f.codigo_barras).map(f => ({
        item: f.nombre, nombre: f.nombre,
        cant: Number(f.cantidad) || 0,
        unidad: f.unidad || "UND",
        precioU: Number(f.precio_costo_unit) || 0,
        subtotal: Math.round((Number(f.cantidad) || 0) * (Number(f.precio_costo_unit) || 0)),
        item_id: null,                        // se asigna abajo si lo creamos en catálogo
        codigo_barras: f.codigo_barras,
        referencia_proveedor: f.referencia_proveedor,
        agregado_post_factura: true,
        factura_iva_unit:     Number(f.iva_valor_unit) || 0,
        factura_consumo_unit: (Number(f.ico_valor_unit) || 0) + (Number(f.icl_valor_unit) || 0) + (Number(f.adv_valor_unit) || 0),
      }));

      // 2. Match / crear items en items_catalogo por código de barras
      // Para cada item de la factura que tenga código de barras:
      //   a) Buscar en items_catalogo por codigo_barras
      //   b) Si existe → actualizar precio_compra con precio_costo_unit
      //   c) Si NO existe → crear nuevo item con los datos de la factura
      const facturados = data.items.filter(f => !f.no_facturado);
      const updatesCatalogo = [];
      const creadosCatalogo = []; // {codigo_barras → nuevo id}

      for (const f of facturados) {
        const cb = (f.codigo_barras || "").trim();
        if (!cb) continue;
        const precioCosto = Number(f.precio_costo_unit) || 0;
        if (precioCosto <= 0) continue;

        const { data: existente } = await supabase.from("items_catalogo")
          .select("id, codigo_barras, precio_compra").eq("codigo_barras", cb).maybeSingle();

        if (existente?.id) {
          await supabase.from("items_catalogo").update({
            precio_compra: precioCosto,
            referencia_proveedor: f.referencia_proveedor || null,
            proveedor_principal_id: oc.proveedor_id || null,
            updated_at: new Date().toISOString(),
          }).eq("id", existente.id);
          updatesCatalogo.push(existente.id);
          // Si el item de la factura no tenía item_id pero ahora lo encontramos por barcode, asignarlo
          if (!f.item_id && f.es_nuevo_oc) {
            const idx = itemsNuevosOC.findIndex(x => x.codigo_barras === cb);
            if (idx >= 0) itemsNuevosOC[idx].item_id = existente.id;
          }
        } else {
          // Crear nuevo en catálogo
          const newId = `ITM_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const { error: ec } = await supabase.from("items_catalogo").insert({
            id: newId,
            codigo: cb,
            codigo_barras: cb,
            referencia_proveedor: f.referencia_proveedor || null,
            proveedor_principal_id: oc.proveedor_id || null,
            nombre: f.nombre,
            unidad: f.unidad || "UND",
            precio_compra: precioCosto,
            activo: true,
          });
          if (!ec) {
            creadosCatalogo.push({ id: newId, nombre: f.nombre });
            const idx = itemsNuevosOC.findIndex(x => x.codigo_barras === cb);
            if (idx >= 0) itemsNuevosOC[idx].item_id = newId;
          }
        }
      }

      // 3. Construir items finales de la OC (matcheados + nuevos)
      const itemsFinales = [...itemsActualizados, ...itemsNuevosOC];
      const subtotalOC = itemsFinales.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);

      // 4. Update OC con factura aplicada + vencimiento
      const updateOC = {
        items: itemsFinales,
        subtotal: subtotalOC,
        iva: data.iva_total || usarIva,
        total: Number(data.total) || (subtotalOC + (data.iva_total || 0)),
        factura_numero: data.factura_numero,
        factura_fecha: data.factura_fecha,
        factura_url: data.factura_url || null,
        factura_subtotal: data.subtotal_base || usarSubtotal,
        factura_iva: data.iva_total || usarIva,
        factura_data: parsed || null,
        factura_aplicada: true,
        factura_aplicada_at: new Date().toISOString(),
        factura_aplicada_por: currentUser?.email || currentUser?.nombre || "sistema",
        updated_at: new Date().toISOString(),
      };
      if (data.fecha_vencimiento) {
        updateOC.fecha_vencimiento_pago = data.fecha_vencimiento;
        const dc = Math.floor((new Date(data.fecha_vencimiento) - new Date(data.factura_fecha || new Date())) / 86400000);
        if (dc >= 0) updateOC.dias_credito = dc;
      }
      const { error: e1 } = await supabase.from("ordenes_compra").update(updateOC).eq("id", oc.id);
      if (e1) throw e1;

      // 5. Para items de la OC original que vienen de catálogo (item_id) pero el AI no extrajo barcode
      //    aún así actualizamos su precio_compra usando el precio_costo_unit
      for (const f of facturados) {
        if (f.item_id && !f.codigo_barras && Number(f.precio_costo_unit) > 0) {
          await supabase.from("items_catalogo").update({
            precio_compra: f.precio_costo_unit,
            updated_at: new Date().toISOString(),
          }).eq("id", f.item_id);
        }
      }

      // 4. Si la OC viene de una requisición, también actualizar items de la req
      if (oc.requisicion_id) {
        const { data: req } = await supabase.from("requisiciones").select("items, timeline").eq("id", oc.requisicion_id).single();
        if (req?.items) {
          const reqItemsActualizados = req.items.map(rit => {
            const match = data.items.find(f => f.item_id && rit.item_id === f.item_id);
            if (match) {
              const cant = Number(rit.cant) || 0;
              const precioU = Number(match.precio_unitario) || Number(rit.precioU) || 0;
              return { ...rit, precioU, subtotal: Math.round(cant * precioU) };
            }
            return rit;
          });
          const reqTotal = reqItemsActualizados.reduce((s, x) => s + (Number(x.subtotal) || 0), 0);
          await supabase.from("requisiciones").update({
            items: reqItemsActualizados,
            total: reqTotal,
            timeline: [...(req.timeline || []), {
              quien: currentUser?.nombre || currentUser?.email || "sistema",
              accion: "factura_aplicada",
              fecha: new Date().toLocaleString("es-CO"),
              comentario: `Factura ${data.factura_numero} aplicada — precios actualizados con valores reales (${itemsActualizados.length} items)`,
            }],
          }).eq("id", oc.requisicion_id);
        }
      }

      setStep("done");
      setTimeout(() => { reload(); onClose(); }, 1200);
    } catch (e) {
      setErr(e.message || String(e));
      setStep("review");
    }
  }

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 1300, background: "#000B", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 16, width: "100%", maxWidth: 880, padding: 24, marginTop: 30, border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>📎 Adjuntar Factura del Proveedor</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {oc.codigo} · {oc.proveedor_nombre} · OC original: {COP(oc.total)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* STEP 1: Upload */}
        {step === "upload" && (
          <div style={{ marginTop: 20 }}>
            <div style={{ background: B.navy, border: `2px dashed ${B.navyLight}`, borderRadius: 12, padding: 30, textAlign: "center" }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>
                Sube una <strong>foto/PDF</strong> de la factura del proveedor.
                <br/>Las imágenes se procesan con IA para extraer precios, IVA y total.
                <br/>Los PDF se adjuntan; los datos se ingresan manualmente.
              </div>
              <input type="file" accept="image/*,application/pdf" onChange={handleUpload}
                style={{ background: B.sky, color: B.navy, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none" }} />
            </div>
            <div style={{ marginTop: 18, padding: 12, background: B.navy, borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
              ℹ️ Al aplicar la factura, los precios reales sobreescriben los de cotización en la OC y en la requisición. Además se actualiza el <strong>precio_compra del catálogo</strong> para que próximas compras tengan el precio correcto.
            </div>
          </div>
        )}

        {/* STEP 2: Parsing */}
        {step === "parsing" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>{progress}</div>
          </div>
        )}

        {/* STEP 3: Review */}
        {step === "review" && (
          <div style={{ marginTop: 14 }}>
            {progress && <div style={{ marginBottom: 10, padding: 8, background: B.success + "11", color: B.success, borderRadius: 6, fontSize: 12 }}>{progress}</div>}
            {err && <div style={{ marginBottom: 10, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{err}</div>}

            {/* Datos de la factura */}
            <div style={{ background: B.navy, borderRadius: 10, padding: 14, marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={LS}>Nº factura</label>
                <input value={data.factura_numero} onChange={e => setField("factura_numero", e.target.value)} style={IS} placeholder="Ej: FE-001" autoFocus />
              </div>
              <div>
                <label style={LS}>Fecha emisión</label>
                <input type="date" value={data.factura_fecha} onChange={e => setField("factura_fecha", e.target.value)} style={IS} />
              </div>
              <div>
                <label style={LS}>Vence pago</label>
                <input type="date" value={data.fecha_vencimiento || ""} onChange={e => setField("fecha_vencimiento", e.target.value)} style={IS} />
              </div>
              <div>
                <label style={LS}>Forma de pago</label>
                <input value={data.forma_pago || ""} onChange={e => setField("forma_pago", e.target.value)} style={IS} placeholder="Contado/Crédito" />
              </div>
            </div>

            {/* Resumen de impuestos (si vienen del parser) */}
            {(data.consumo_total > 0 || data.iva_total > 0) && (
              <div style={{ background: B.navy, borderRadius: 10, padding: 12, marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, fontSize: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700 }}>Subtotal base</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{COP(data.subtotal_base || 0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700 }}>Consumo (no deducible)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: B.warning }}>{COP(data.consumo_total || 0)}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>ICO+ICL+ADV → al costo</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700 }}>IVA (deducible)</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: B.sky }}>{COP(data.iva_total || 0)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700 }}>TOTAL</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: B.sand }}>{COP(data.total || 0)}</div>
                </div>
              </div>
            )}

            {/* Tabla items */}
            <div style={{ background: B.navy, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${B.navyLight}`, fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase" }}>
                Precios reales por item ({data.items.length})
              </div>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: B.navyLight }}>
                    {["Item", "Cant", "Costo unit", "IVA unit", "Δ vs cotiz", "Subtotal"].map((h, i) => (
                      <th key={h + i} style={{ padding: "8px 10px", textAlign: i < 1 ? "left" : "right", fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it, i) => {
                    const costoUnit = Number(it.precio_costo_unit ?? it.precio_unitario) || 0;
                    const sub = (Number(it.cantidad) || 0) * costoUnit;
                    const delta = costoUnit - (Number(it.precio_anterior) || 0);
                    const cambio = !it.no_facturado && !it.es_nuevo_oc && (it.precio_anterior > 0) && Math.abs(delta) > 0.01;
                    const color = delta > 0 ? B.danger : delta < 0 ? B.success : "rgba(255,255,255,0.4)";
                    const bg = it.no_facturado ? "rgba(220,220,220,0.05)"
                             : it.es_nuevo_oc ? "rgba(34,197,94,0.08)"
                             : cambio ? "rgba(245,158,11,0.06)" : "transparent";
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${B.navyLight}`, background: bg }}>
                        <td style={{ padding: "8px 10px" }}>
                          <div>
                            {it.nombre}
                            {it.no_facturado && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", background: B.danger + "33", color: B.danger, borderRadius: 8, fontWeight: 700 }}>NO FACTURADO</span>}
                            {it.es_nuevo_oc && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", background: B.success + "33", color: B.success, borderRadius: 8, fontWeight: 700 }}>NUEVO</span>}
                          </div>
                          {(it.codigo_barras || it.referencia_proveedor) && (
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                              {it.codigo_barras && <span>📊 {it.codigo_barras}</span>}
                              {it.codigo_barras && it.referencia_proveedor && " · "}
                              {it.referencia_proveedor && <span>Ref {it.referencia_proveedor}</span>}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          {it.cantidad} {it.unidad ? <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{it.unidad}</span> : null}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>
                          <input type="number" value={costoUnit}
                            onChange={e => setItemField(i, "precio_costo_unit", e.target.value)}
                            style={{ ...IS, padding: "5px 8px", fontSize: 12, width: 110, textAlign: "right",
                              borderColor: cambio ? B.warning : B.navyLight,
                              color: cambio ? B.warning : "#fff",
                              fontWeight: cambio ? 700 : 400 }} />
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: B.sky, fontSize: 11 }}>
                          {it.iva_valor_unit ? COP(it.iva_valor_unit) : "—"}
                          {it.iva_pct > 0 && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{it.iva_pct}%</div>}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color, fontWeight: 700, fontSize: 11 }}>
                          {cambio ? `${delta > 0 ? "+" : ""}${COP(delta)}` : "—"}
                          {it.precio_anterior > 0 && cambio && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>cotiz {COP(it.precio_anterior)}</div>}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: B.sand, fontWeight: 700 }}>{COP(sub)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: B.navyMid, fontWeight: 700 }}>
                    <td colSpan={5} style={{ padding: "10px 14px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>Subtotal costo (sin IVA)</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: B.sky }}>{COP(data.items.reduce((s, x) => s + (Number(x.cantidad) || 0) * (Number(x.precio_costo_unit ?? x.precio_unitario) || 0), 0))}</td>
                  </tr>
                  <tr style={{ background: B.navyMid }}>
                    <td colSpan={5} style={{ padding: "6px 14px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>+ IVA (deducible)</td>
                    <td style={{ padding: "6px 14px", textAlign: "right", color: "#fbbf24" }}>{COP(data.iva_total || usarIva)}</td>
                  </tr>
                  <tr style={{ background: B.navy }}>
                    <td colSpan={5} style={{ padding: "10px 14px", textAlign: "right", color: "#fff", fontSize: 13, fontWeight: 800 }}>TOTAL FACTURA</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: B.success, fontWeight: 800, fontSize: 14 }}>{COP(data.total || (usarSubtotal + usarIva))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {data.factura_url && (
              <a href={data.factura_url} target="_blank" rel="noreferrer"
                style={{ display: "inline-block", padding: "6px 12px", borderRadius: 6, border: `1px solid ${B.sky}`, color: B.sky, fontSize: 11, textDecoration: "none", marginBottom: 12 }}>
                📎 Ver archivo adjunto
              </a>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={() => setStep("upload")} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.warning}`, background: B.warning + "22", color: B.warning, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
                ↺ Subir otra
              </button>
              <button onClick={aplicar} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: B.success, color: B.navy, fontSize: 13, cursor: "pointer", fontWeight: 800 }}>
                ✓ Aplicar Factura
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>
              Al aplicar: actualiza precios de OC, requisición y precio_compra del catálogo
            </div>
          </div>
        )}

        {/* STEP 4: Applying */}
        {step === "applying" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>Aplicando factura y actualizando precios…</div>
          </div>
        )}

        {/* STEP 5: Done */}
        {step === "done" && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: B.success }}>Factura aplicada con éxito</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
              Precios actualizados en OC, requisición y catálogo.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const IS = { width: "100%", padding: "8px 11px", borderRadius: 7, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 12, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 3 };
