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
          // Helpers: detectar pack del nombre y arreglar errores del AI
          const detectarPackDelNombre = (nombre) => {
            if (!nombre) return 1;
            const n = String(nombre).toUpperCase();
            // Orden importa: detectar primero los más específicos
            if (/\bBANDEJA\s*X\s*24\b|\bX\s*24\b|\bX24\b/.test(n)) return 24;
            if (/\bBANDEJA\s*X\s*12\b|\bX\s*12\s*U?N?D?\b|\bX12\b/.test(n)) return 12;
            if (/\bSIXPACK\b|\b6\s*PACK\b|\b6PK\b|\bX\s*6\b|\bX6\b/.test(n)) return 6;
            return 1;
          };

          const itemsRich = (result.items || []).map((aiItem, aiIdx) => {
            const ocIdx = aiItem.match_oc_idx;
            const matchOc = (typeof ocIdx === "number" && ocIdx >= 0 && ocIdx < ocItemsCount) ? oc.items[ocIdx] : null;
            if (matchOc) matched.add(ocIdx);

            const nombre = aiItem.nombre || matchOc?.item || matchOc?.nombre || "—";
            // ── Post-proceso del factor de empaque ──────────────────────
            // Si el AI dice unidades_por_paquete=1 pero el nombre tiene SIXPACK/X12/etc,
            // confiamos en la regex y reajustamos cantidad_paquete.
            let cantPack    = Number(aiItem.cantidad_paquete ?? aiItem.cantidad) || 0;
            let unPorPack   = Math.max(1, Number(aiItem.unidades_por_paquete) || 1);
            const totalAI   = Number(aiItem.cantidad_individual_total) || 0;
            const packReg   = detectarPackDelNombre(nombre);

            if (packReg > 1 && unPorPack === 1) {
              // AI no detectó el pack pero el nombre lo dice claramente
              unPorPack = packReg;
              // Si el AI ya pre-multiplicó (cantPack es divisible por packReg), corregimos
              if (cantPack > 0 && cantPack % packReg === 0 && totalAI === cantPack) {
                cantPack = cantPack / packReg;
              }
            } else if (packReg > 1 && unPorPack !== packReg && totalAI > 0) {
              // AI detectó un pack distinto al del nombre → confiar en regex
              unPorPack = packReg;
              cantPack  = Math.round(totalAI / packReg);
            }

            const cantTotal   = cantPack * unPorPack;
            // ── Precios: si el AI nos dejó $0 pero hay subtotal_renglon, lo derivamos ──
            const subRen      = Number(aiItem.subtotal_renglon) || 0;
            let costoPack     = Number(aiItem.precio_costo_pack ?? aiItem.precio_costo_unit) || 0;
            const ivaPack     = Number(aiItem.iva_valor_pack ?? aiItem.iva_valor_unit) || 0;
            const finalPackAI = Number(aiItem.precio_final_pack ?? aiItem.precio_final_unit) || 0;
            if (costoPack === 0 && subRen > 0 && cantPack > 0) {
              // Estimamos costoPack desde el subtotal (asumiendo subRen ≈ cantPack × finalPack)
              const finalPack = finalPackAI || (subRen / cantPack);
              // Restamos IVA si lo conocemos para llegar al costo neto
              costoPack = Math.max(0, Math.round(finalPack - ivaPack));
            }
            const costoIndiv  = Number(aiItem.precio_costo_unit_individual) || (unPorPack > 0 ? Math.round(costoPack / unPorPack) : 0);
            const basePack    = Number(aiItem.precio_base_pack ?? aiItem.precio_base_unit) || costoPack;
            const finalPack   = finalPackAI || (costoPack + ivaPack);
            const esBonif     = !!aiItem.es_bonificacion || (costoPack === 0 && subRen === 0 && cantPack > 0);
            const reqRevision = !!aiItem.requiere_revision;

            return {
              oc_idx: matchOc ? ocIdx : null,
              ai_idx: aiIdx,
              codigo_barras:        aiItem.codigo_barras || null,
              referencia_proveedor: aiItem.referencia_proveedor || null,
              nombre:               aiItem.nombre || matchOc?.item || matchOc?.nombre || "—",
              // Empaque y unidad
              cantidad_paquete:     cantPack,
              unidad_compra:        aiItem.unidad_compra || matchOc?.unidad || "UND",
              unidades_por_paquete: unPorPack,
              unidad_individual:    aiItem.unidad_individual || "UND",
              cantidad_individual_total: cantTotal,
              // Impuestos por PAQUETE
              descuento_pct:        Number(aiItem.descuento_pct) || 0,
              iva_pct:              Number(aiItem.iva_pct) || 0,
              precio_base_pack:     basePack,
              iva_valor_pack:       ivaPack,
              ico_valor_pack:       Number(aiItem.ico_valor_pack ?? aiItem.ico_valor_unit) || 0,
              icl_valor_pack:       Number(aiItem.icl_valor_pack ?? aiItem.icl_valor_unit) || 0,
              adv_valor_pack:       Number(aiItem.adv_valor_pack ?? aiItem.adv_valor_unit) || 0,
              precio_costo_pack:    costoPack,            // costo por sixpack/bandeja
              precio_costo_unit_individual: Math.round(costoIndiv), // costo por cerveza/botella → al catálogo
              precio_final_pack:    finalPack,
              subtotal_renglon:     Number(aiItem.subtotal_renglon) || cantPack * finalPack,
              // Flags
              es_bonificacion:      esBonif,
              requiere_revision:    reqRevision,
              es_nuevo_oc:          !matchOc,
              // Compat con flujo anterior:
              cantidad:             cantPack,
              unidad:               aiItem.unidad_compra || matchOc?.unidad || "UND",
              precio_costo_unit:    costoPack,
              precio_unitario:      Math.round(costoIndiv),  // ← lo que va al precio_compra del catálogo
              precio_anterior:      matchOc ? Number(matchOc.precioU) || 0 : 0,
              iva_valor_unit:       ivaPack,
              ico_valor_unit:       Number(aiItem.ico_valor_pack ?? aiItem.ico_valor_unit) || 0,
              icl_valor_unit:       Number(aiItem.icl_valor_pack ?? aiItem.icl_valor_unit) || 0,
              adv_valor_unit:       Number(aiItem.adv_valor_pack ?? aiItem.adv_valor_unit) || 0,
              iva:                  cantPack * ivaPack,
              item_id:              matchOc?.item_id || null,
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
          // Mostrar el error real con un poco de detalle del raw para diagnóstico
          const detalle = result.stop_reason === "max_tokens"
            ? " · Factura muy larga, contacta soporte."
            : result.raw_first_chars
              ? ` · Inicio: ${result.raw_first_chars.slice(0, 80)}…`
              : "";
          setErr((result.error || "No se pudo leer la factura") + detalle + " — Puedes ingresar los datos manualmente abajo.");
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
      // 1. Construir items actualizados de la OC.
      //    El INVENTARIO se cuenta en unidades individuales, así que:
      //    - cant_individual = cantidad_paquete × unidades_por_paquete
      //    - precioU (costo individual) = precio_costo_pack / unidades_por_paquete
      //    Las BONIFICACIONES suman al inventario pero NO actualizan precio_compra ni
      //    afectan el costo (precioU=0 en la OC pero metadata en factura_data).
      const ocItemsOriginal = oc.items || [];
      const itemsActualizados = ocItemsOriginal.map((it, i) => {
        const f = data.items.find(x => x.oc_idx === i && !x.no_facturado);
        if (!f) return it;
        const unPorPack       = Math.max(1, Number(f.unidades_por_paquete) || 1);
        const cantPaquete     = Number(f.cantidad_paquete) || Number(it.cant) || 0;
        const cantIndividual  = cantPaquete * unPorPack;
        const costoPack       = Number(f.precio_costo_pack) || 0;
        const precioUIndiv    = f.es_bonificacion ? 0 : Math.round(unPorPack > 0 ? costoPack / unPorPack : 0);
        return {
          ...it,
          // El campo `cant` queda en unidades INDIVIDUALES (lo que va al inventario)
          cant: cantIndividual,
          unidad: f.unidad_individual || "UND",
          precioU: precioUIndiv,
          subtotal: Math.round(cantIndividual * precioUIndiv),
          // Empaque (audit + recepción)
          unidades_por_paquete: unPorPack,
          unidad_compra:        f.unidad_compra || "UND",
          cantidad_paquete:     cantPaquete,
          factura_costo_pack:   costoPack,
          // Impuestos por paquete (audit)
          factura_codigo_barras: f.codigo_barras || it.codigo_barras || null,
          factura_iva_pack:      Number(f.iva_valor_pack) || 0,
          factura_consumo_pack:  (Number(f.ico_valor_pack) || 0) + (Number(f.icl_valor_pack) || 0) + (Number(f.adv_valor_pack) || 0),
          es_bonificacion:       !!f.es_bonificacion,
          requiere_revision:     !!f.requiere_revision,
        };
      });

      // 1b. Items de la factura que NO estaban en la OC original — los agregamos.
      //    Aceptamos items con codigo_barras (auto-creados en catálogo) o
      //    manuales sin codigo (bonificaciones con nombre libre).
      const itemsNuevosOC = data.items.filter(f => f.es_nuevo_oc && (f.codigo_barras || (f.nombre && f.nombre.trim()))).map(f => {
        const unPorPack      = Math.max(1, Number(f.unidades_por_paquete) || 1);
        const cantPaquete    = Number(f.cantidad_paquete) || Number(f.cantidad) || 0;
        const cantIndividual = cantPaquete * unPorPack;
        const costoPack      = Number(f.precio_costo_pack) || 0;
        const precioUIndiv   = f.es_bonificacion ? 0 : Math.round(unPorPack > 0 ? costoPack / unPorPack : 0);
        return {
          item: f.nombre, nombre: f.nombre,
          cant: cantIndividual,
          unidad: f.unidad_individual || "UND",
          precioU: precioUIndiv,
          subtotal: Math.round(cantIndividual * precioUIndiv),
          item_id: null,
          codigo_barras: f.codigo_barras,
          referencia_proveedor: f.referencia_proveedor,
          unidades_por_paquete: unPorPack,
          unidad_compra:        f.unidad_compra || "UND",
          cantidad_paquete:     cantPaquete,
          factura_costo_pack:   costoPack,
          agregado_post_factura: true,
          factura_iva_pack:     Number(f.iva_valor_pack) || 0,
          factura_consumo_pack: (Number(f.ico_valor_pack) || 0) + (Number(f.icl_valor_pack) || 0) + (Number(f.adv_valor_pack) || 0),
          es_bonificacion:      !!f.es_bonificacion,
          requiere_revision:    !!f.requiere_revision,
        };
      });

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
        const unPorPack    = Math.max(1, Number(f.unidades_por_paquete) || 1);
        const costoPack    = Number(f.precio_costo_pack) || 0;
        const precioUIndiv = unPorPack > 0 ? Math.round(costoPack / unPorPack) : 0;

        const { data: existente } = await supabase.from("items_catalogo")
          .select("id, codigo_barras, precio_compra, unidades_por_paquete").eq("codigo_barras", cb).maybeSingle();

        if (existente?.id) {
          // Bonificación: NO toca precio_compra (mantiene el costo regular)
          // Compra normal: actualiza precio_compra al costo individual nuevo
          const updates = {
            referencia_proveedor: f.referencia_proveedor || null,
            proveedor_principal_id: oc.proveedor_id || null,
            updated_at: new Date().toISOString(),
          };
          if (!f.es_bonificacion && precioUIndiv > 0) {
            updates.precio_compra = precioUIndiv;
            updates.unidades_por_paquete = unPorPack;
            updates.unidad_compra = f.unidad_compra || null;
            updates.unidad_individual = f.unidad_individual || existente.unidad_individual || "UND";
          }
          await supabase.from("items_catalogo").update(updates).eq("id", existente.id);
          updatesCatalogo.push(existente.id);
          if (!f.item_id && f.es_nuevo_oc) {
            const idx = itemsNuevosOC.findIndex(x => x.codigo_barras === cb);
            if (idx >= 0) itemsNuevosOC[idx].item_id = existente.id;
          }
        } else {
          // Crear nuevo en catálogo (sólo si no es bonificación O si lo es pero sí tiene un costo derivable de otra línea)
          // Si es bonificación con costo 0 y no existe en catálogo, lo creamos pero con precio_compra=0 marcado para revisión.
          const newId = `ITM_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const { error: ec } = await supabase.from("items_catalogo").insert({
            id: newId,
            codigo: cb,
            codigo_barras: cb,
            referencia_proveedor: f.referencia_proveedor || null,
            proveedor_principal_id: oc.proveedor_id || null,
            nombre: f.nombre,
            unidad: f.unidad_compra || f.unidad || "UND",
            unidad_compra: f.unidad_compra || null,
            unidad_individual: f.unidad_individual || "UND",
            unidades_por_paquete: unPorPack,
            precio_compra: f.es_bonificacion ? 0 : precioUIndiv,
            activo: true,
          });
          if (!ec) {
            creadosCatalogo.push({ id: newId, nombre: f.nombre, bonif: !!f.es_bonificacion });
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

      // 5. Para items de la OC original que vienen de catálogo (item_id) pero el AI no extrajo barcode,
      //    aún así actualizamos su precio_compra con el costo individual.
      //    Bonificaciones NO actualizan precio_compra (mantienen el costo regular).
      for (const f of facturados) {
        if (f.es_bonificacion) continue;
        if (f.item_id && !f.codigo_barras) {
          const unPorPack    = Math.max(1, Number(f.unidades_por_paquete) || 1);
          const costoPack    = Number(f.precio_costo_pack) || 0;
          const precioUIndiv = unPorPack > 0 ? Math.round(costoPack / unPorPack) : 0;
          if (precioUIndiv > 0) {
            await supabase.from("items_catalogo").update({
              precio_compra:        precioUIndiv,
              unidades_por_paquete: unPorPack,
              unidad_compra:        f.unidad_compra || null,
              unidad_individual:    f.unidad_individual || "UND",
              updated_at:           new Date().toISOString(),
            }).eq("id", f.item_id);
          }
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
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${B.navyLight}`, fontSize: 11, color: B.sand, fontWeight: 700, textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Precios reales por item ({data.items.length})</span>
                <button onClick={() => {
                  setData(d => ({
                    ...d,
                    items: [...d.items, {
                      oc_idx: null, ai_idx: null,
                      codigo_barras: null, referencia_proveedor: null,
                      nombre: "", cantidad_paquete: 1, unidades_por_paquete: 1,
                      unidad_compra: "UND", unidad_individual: "UND",
                      precio_base_pack: 0, iva_pct: 0, iva_valor_pack: 0,
                      ico_valor_pack: 0, icl_valor_pack: 0, adv_valor_pack: 0,
                      precio_costo_pack: 0, precio_final_pack: 0, subtotal_renglon: 0,
                      cantidad: 1, unidad: "UND", precio_costo_unit: 0,
                      precio_unitario: 0, precio_anterior: 0, iva: 0,
                      es_bonificacion: true, requiere_revision: false,
                      es_nuevo_oc: true, item_id: null,
                    }],
                  }));
                }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 700, borderRadius: 6, border: `1px solid ${B.success}`, background: B.success + "22", color: B.success, cursor: "pointer", textTransform: "none" }}>
                  + 🎁 Agregar bonificación
                </button>
              </div>
              </div>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: B.navyLight }}>
                    {["Item", "Pack", "× Unid", "Inv total", "Costo/pack", "Costo/unid", "Subtotal"].map((h, i) => (
                      <th key={h + i} style={{ padding: "8px 8px", textAlign: i < 1 ? "left" : "right", fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it, i) => {
                    const cantPack    = Number(it.cantidad_paquete ?? it.cantidad) || 0;
                    const unPorPack   = Math.max(1, Number(it.unidades_por_paquete) || 1);
                    const costoPack   = Number(it.precio_costo_pack ?? it.precio_costo_unit) || 0;
                    const costoIndiv  = unPorPack > 0 ? Math.round(costoPack / unPorPack) : 0;
                    const cantTotal   = cantPack * unPorPack;
                    const sub         = cantPack * costoPack;
                    const delta       = costoIndiv - (Number(it.precio_anterior) || 0);
                    const cambio      = !it.no_facturado && !it.es_nuevo_oc && (it.precio_anterior > 0) && Math.abs(delta) > 0.01;
                    const deltaColor  = delta > 0 ? B.danger : delta < 0 ? B.success : "rgba(255,255,255,0.4)";
                    const bg = it.es_bonificacion ? "rgba(34,197,94,0.10)"
                             : it.requiere_revision ? "rgba(245,158,11,0.10)"
                             : it.no_facturado ? "rgba(220,220,220,0.05)"
                             : it.es_nuevo_oc ? "rgba(56,189,248,0.06)"
                             : cambio ? "rgba(245,158,11,0.06)" : "transparent";
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${B.navyLight}`, background: bg }}>
                        <td style={{ padding: "8px 8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <button onClick={() => setItemField(i, "es_bonificacion", !it.es_bonificacion)}
                              title={it.es_bonificacion ? "Desmarcar como bonificación" : "Marcar como bonificación (regalo)"}
                              style={{
                                fontSize: 12, padding: "2px 6px", borderRadius: 5,
                                border: `1px solid ${it.es_bonificacion ? B.success : "rgba(255,255,255,0.2)"}`,
                                background: it.es_bonificacion ? B.success + "33" : "transparent",
                                cursor: "pointer", lineHeight: 1,
                              }}>
                              🎁
                            </button>
                            {it.es_nuevo_oc && !it.codigo_barras ? (
                              <input value={it.nombre || ""} onChange={e => setItemField(i, "nombre", e.target.value)}
                                placeholder="Nombre del item…"
                                style={{ ...IS, padding: "4px 8px", fontSize: 12, minWidth: 200, flex: 1 }} />
                            ) : (
                              <span>{it.nombre}</span>
                            )}
                            {it.es_bonificacion && <span style={{ fontSize: 9, padding: "1px 6px", background: B.success, color: B.navy, borderRadius: 8, fontWeight: 800 }}>BONIF</span>}
                            {it.requiere_revision && <span style={{ fontSize: 9, padding: "1px 6px", background: B.warning, color: B.navy, borderRadius: 8, fontWeight: 800 }}>⚠ COMBO</span>}
                            {it.no_facturado && <span style={{ fontSize: 9, padding: "1px 6px", background: B.danger + "33", color: B.danger, borderRadius: 8, fontWeight: 700 }}>NO FACT</span>}
                            {it.es_nuevo_oc && !it.es_bonificacion && <span style={{ fontSize: 9, padding: "1px 6px", background: B.sky + "33", color: B.sky, borderRadius: 8, fontWeight: 700 }}>NUEVO</span>}
                          </div>
                          {(it.codigo_barras || it.referencia_proveedor) && (
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                              {it.codigo_barras && <span>📊 {it.codigo_barras}</span>}
                              {it.codigo_barras && it.referencia_proveedor && " · "}
                              {it.referencia_proveedor && <span>Ref {it.referencia_proveedor}</span>}
                            </div>
                          )}
                          {it.unidad_compra && (
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                              {it.unidad_compra} · {it.unidad_individual || "UND"}
                            </div>
                          )}
                        </td>
                        {/* Pack: cantidad de paquetes */}
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          <input type="number" value={cantPack}
                            onChange={e => setItemField(i, "cantidad_paquete", Number(e.target.value))}
                            style={{ ...IS, padding: "4px 6px", fontSize: 11, width: 50, textAlign: "right" }} />
                        </td>
                        {/* unidades por paquete (editable) */}
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          <input type="number" value={unPorPack} min={1}
                            onChange={e => setItemField(i, "unidades_por_paquete", Math.max(1, Number(e.target.value)))}
                            style={{ ...IS, padding: "4px 6px", fontSize: 11, width: 45, textAlign: "right",
                              borderColor: unPorPack > 1 ? B.sky : B.navyLight,
                              color: unPorPack > 1 ? B.sky : "#fff" }} />
                        </td>
                        {/* Total individual al inventario */}
                        <td style={{ padding: "8px 8px", textAlign: "right", color: B.sand, fontWeight: 700, fontSize: 12 }}>
                          {cantTotal}
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{(it.unidad_individual || "und").toLowerCase()}</div>
                        </td>
                        {/* Costo por paquete */}
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          <input type="number" value={costoPack}
                            onChange={e => setItemField(i, "precio_costo_pack", Number(e.target.value))}
                            disabled={it.es_bonificacion}
                            style={{ ...IS, padding: "4px 6px", fontSize: 11, width: 90, textAlign: "right",
                              opacity: it.es_bonificacion ? 0.4 : 1,
                              borderColor: cambio ? B.warning : B.navyLight,
                              color: cambio ? B.warning : it.es_bonificacion ? B.success : "#fff" }} />
                        </td>
                        {/* Costo por unidad individual (calculado) */}
                        <td style={{ padding: "8px 8px", textAlign: "right", fontSize: 11 }}>
                          {it.es_bonificacion ? (
                            <span style={{ color: B.success, fontWeight: 700 }}>$0 🎁</span>
                          ) : (
                            <>
                              <div style={{ fontWeight: 700, color: B.sand }}>{COP(costoIndiv)}</div>
                              {cambio && (
                                <div style={{ fontSize: 9, color: deltaColor, fontWeight: 700 }}>
                                  {delta > 0 ? "+" : ""}{COP(delta)}
                                </div>
                              )}
                              {it.iva_pct > 0 && <div style={{ fontSize: 9, color: B.sky }}>+{it.iva_pct}% IVA</div>}
                            </>
                          )}
                        </td>
                        {/* Subtotal */}
                        <td style={{ padding: "8px 8px", textAlign: "right", color: it.es_bonificacion ? B.success : B.sand, fontWeight: 700 }}>
                          {it.es_bonificacion ? "$0" : COP(sub)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: B.navyMid, fontWeight: 700 }}>
                    <td colSpan={6} style={{ padding: "8px 8px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>Subtotal costo (sin IVA)</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", color: B.sky }}>{COP(data.items.reduce((s, x) => s + (x.es_bonificacion ? 0 : (Number(x.cantidad_paquete ?? x.cantidad) || 0) * (Number(x.precio_costo_pack ?? x.precio_costo_unit) || 0)), 0))}</td>
                  </tr>
                  <tr style={{ background: B.navyMid }}>
                    <td colSpan={6} style={{ padding: "6px 8px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>+ IVA (deducible)</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "#fbbf24" }}>{COP(data.iva_total || usarIva)}</td>
                  </tr>
                  <tr style={{ background: B.navy }}>
                    <td colSpan={6} style={{ padding: "10px 8px", textAlign: "right", color: "#fff", fontSize: 13, fontWeight: 800 }}>TOTAL FACTURA</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: B.success, fontWeight: 800, fontSize: 14 }}>{COP(data.total || (usarSubtotal + usarIva))}</td>
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
