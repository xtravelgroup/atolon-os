// FacturaProveedorModal.jsx — Adjuntar factura de proveedor a una OC
// Flujo: subir PDF/imagen → AI parsea → tabla editable de items+precios+IVA →
// "Aplicar" → actualiza OC items + total + items_catalogo.precio_compra

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

// ── Conversión de unidades para preview de qué se carga en Loggro ────────
// Loggro mantiene el stock en una unidad fija por ingrediente. Si la factura
// viene en otra (ej. 1 Kg) y Loggro está en Gr, el edge function convierte
// (×1000) al aplicar. Esta misma lógica la mostramos en UI para que el
// operario vea ANTES de aplicar qué cantidad va a entrar a Loggro.
function normUnidad(u) {
  return String(u || "").toLowerCase().trim().replace(/\.$/, "");
}
// Factor de conversión origen → destino. Retorna null si no son compatibles.
function factorConversion(origen, destino) {
  const a = normUnidad(origen);
  const b = normUnidad(destino);
  if (!a || !b) return null;
  if (a === b) return 1;
  // Tablas: base = gramo (peso), mililitro (volumen), unidad (cuenta)
  const peso = { g: 1, gr: 1, gramo: 1, gramos: 1, kg: 1000, kilo: 1000, kilos: 1000, lb: 453.592, libra: 453.592, oz: 28.3495 };
  const volumen = { ml: 1, mililitro: 1, mililitros: 1, cc: 1, l: 1000, lt: 1000, litro: 1000, litros: 1000, gal: 3785.41, galon: 3785.41 };
  const cuenta = { un: 1, und: 1, unidad: 1, unidades: 1, u: 1 };
  for (const tabla of [peso, volumen, cuenta]) {
    if (tabla[a] != null && tabla[b] != null) return tabla[a] / tabla[b];
  }
  return null;
}
function convertir(qty, origen, destino) {
  const f = factorConversion(origen, destino);
  if (f == null) return null;
  return qty * f;
}

function blankData() {
  return {
    factura_numero: "",
    factura_fecha: new Date().toISOString().slice(0, 10),
    fecha_vencimiento: "",
    forma_pago: "",
    subtotal: 0, subtotal_base: 0,
    iva: 0, iva_total: 0, consumo_total: 0,
    total: 0,
    factura_url: null,
    items: [],
  };
}

const detectarPackDelNombre = (nombre) => {
  if (!nombre) return 1;
  const n = String(nombre).toUpperCase();
  if (/\bBANDEJA\s*X\s*24\b|\bX\s*24\b|\bX24\b/.test(n)) return 24;
  if (/\bBANDEJA\s*X\s*12\b|\bX\s*12\s*U?N?D?\b|\bX12\b/.test(n)) return 12;
  if (/\bSIXPACK\b|\b6\s*PACK\b|\b6PK\b|\bX\s*6\b|\bX6\b/.test(n)) return 6;
  return 1;
};

// ── Matching heurístico OC ↔ factura ─────────────────────────────────────
// El AI (parse-factura) intenta matchear pero suele dejar items sin asociar
// cuando el nombre difiere ligeramente entre OC y factura (ej. "CORONA 330 ML"
// vs "Cerveza Corona Botella 330ml"). El heurístico cubre ese gap usando
// token overlap + bonificaciones por barcode/referencia.

function normalizarTextoMatch(s) {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // quitar diacríticos
    // Quitar qualifiers de pack/unidad que generan ruido
    .replace(/\bX\s*\d+\s*(PK|PACK|UN|UND|UNIDADES|BTL|BTLS|BOTELLAS|CC|ML|L|GR|GRS|KG|GAL|LB|OZ)?\b/gi, " ")
    .replace(/\b\d+(\.\d+)?\s*(ML|CC|L|GR|GRS|KG|GAL|LB|OZ|UN|UND)\b/gi, " ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Score 0-1 por similitud de tokens. 1.0 = idénticos tras normalizar.
function scoreSimilitud(facName, ocName) {
  const facNorm = normalizarTextoMatch(facName);
  const ocNorm = normalizarTextoMatch(ocName);
  if (!facNorm || !ocNorm) return 0;
  if (facNorm === ocNorm) return 1.0;
  // Tokens significativos (longitud > 2 — descarta "DE", "EL", "LA")
  const facTokens = facNorm.split(" ").filter(t => t.length > 2);
  const ocTokens = ocNorm.split(" ").filter(t => t.length > 2);
  if (facTokens.length === 0 || ocTokens.length === 0) return 0;
  const facSet = new Set(facTokens);
  const matches = ocTokens.filter(t => facSet.has(t)).length;
  // Promedio de recall y precision → penaliza nombres muy distintos en longitud
  const recall    = matches / facTokens.length;
  const precision = matches / ocTokens.length;
  return (recall + precision) / 2;
}

// Encuentra el mejor match en ocItems para facItem. Retorna { idx, score, source }.
// takenIndices: Set de indices ya tomados por matches previos (evita doble match).
function findBestOcMatch(facItem, ocItems, takenIndices) {
  let best = { idx: null, score: 0, source: null };
  for (let i = 0; i < ocItems.length; i++) {
    if (takenIndices.has(i)) continue;
    const it = ocItems[i];
    const nombreOC = it.item || it.nombre || "";

    // Barcode = match deterministico, score 1.0 inmediato
    if (facItem.codigo_barras && it.codigo_barras && facItem.codigo_barras === it.codigo_barras) {
      return { idx: i, score: 1.0, source: "barcode" };
    }
    // Referencia del proveedor = casi deterministico
    if (facItem.referencia_proveedor && it.referencia && facItem.referencia_proveedor === it.referencia) {
      const s = 0.95;
      if (s > best.score) best = { idx: i, score: s, source: "ref_proveedor" };
      continue;
    }
    // Token overlap
    const s = scoreSimilitud(facItem.nombre, nombreOC);
    if (s > best.score) best = { idx: i, score: s, source: "nombre" };
  }
  // Threshold: 0.6 → tokens significativamente compartidos.
  return best.score >= 0.6 ? best : { idx: null, score: 0, source: null };
}

// Construye el objeto `data` (cabecera + items) a partir del resultado del
// parser. SOLO incluye los items que vienen en la factura — los items de la
// OC/cotización que NO se facturaron NO aparecen (requerimiento del negocio).
// El match con la OC sólo enriquece "precio_anterior"/oc_idx para mostrar Δ;
// la preservación de items no facturados ocurre en aplicar() (if (!f) return it).
// Construir `data` para el step "review" tomando los items DIRECTOS de la OC.
// Usado cuando el operario elige hacer la carga manual (sin AI) o cuando el
// parser falla: traemos todo lo que está en la OC para que solo revise cantidades
// y precios contra la factura física, sin tener que tipear todos los items.
function buildDataFromOC(oc, factura_url) {
  const items = (oc.items || []).map((it, idx) => {
    const cant       = Number(it.cant || it.cantidad) || 0;
    const precioU    = Number(it.precioU || it.precio_unitario) || 0;
    const ivaPct     = Number(it.iva_pct) || 0;
    const unPorPack  = Math.max(1, Number(it.unidades_por_paquete) || 1);
    const ivaUnit    = Math.round(precioU * ivaPct / 100);
    return {
      oc_idx:               idx,
      ai_idx:               null,
      codigo_barras:        it.codigo_barras || null,
      referencia_proveedor: it.referencia_proveedor || null,
      nombre:               it.item || it.nombre || "—",
      nombre_anterior:      it.item || it.nombre || null,
      cantidad_anterior:    cant,
      loggro_id:            it.loggro_id || null,
      cantidad_paquete:     cant,
      unidad_compra:        it.unidad || "UND",
      unidades_por_paquete: unPorPack,
      unidad_individual:    it.unidad_individual || "UND",
      cantidad_individual_total: cant * unPorPack,
      descuento_pct:        0,
      iva_pct:              ivaPct,
      precio_base_pack:     precioU,
      iva_valor_pack:       ivaUnit,
      ico_valor_pack:       0,
      icl_valor_pack:       0,
      adv_valor_pack:       0,
      precio_costo_pack:    precioU,
      precio_costo_unit_individual: unPorPack > 0 ? Math.round(precioU / unPorPack) : precioU,
      precio_final_pack:    precioU + ivaUnit,
      subtotal_renglon:     cant * (precioU + ivaUnit),
      es_bonificacion:      false,
      requiere_revision:    false,
      es_nuevo_oc:          false,
      match_source:         "manual_oc",
      cantidad:             cant,
      unidad:               it.unidad || "UND",
      precio_costo_unit:    precioU,
      precio_unitario:      precioU,
      precio_anterior:      precioU,
      iva_valor_unit:       ivaUnit,
      ico_valor_unit:       0,
      icl_valor_unit:       0,
      adv_valor_unit:       0,
      iva:                  cant * ivaUnit,
      item_id:              it.item_id || null,
    };
  });
  const subtotalBase = items.reduce((s, it) => s + it.cantidad * it.precio_costo_pack, 0);
  const ivaTotal     = items.reduce((s, it) => s + it.iva, 0);
  return {
    factura_numero:    "",
    factura_fecha:     new Date().toISOString().slice(0, 10),
    fecha_vencimiento: "",
    forma_pago:        "",
    no_pedido:         null,
    no_remision:       null,
    subtotal_base:     subtotalBase,
    iva_total:         ivaTotal,
    consumo_total:     0,
    ico_total:         0,
    icl_total:         0,
    adv_total:         0,
    descuentos_total:  0,
    subtotal:          subtotalBase,
    iva:               ivaTotal,
    total:             subtotalBase + ivaTotal,
    items,
    factura_url:       factura_url || null,
  };
}

function buildDataFromParsed(result, ocItems, factura_url) {
  const items = ocItems || [];
  const ocItemsCount = items.length;
  const aiItems = result.items || [];

  // Tracking de qué índices de OC ya están tomados (por AI primero, después
  // por heurístico) para que cada OC item se asigne a máximo UN item factura.
  const takenByAI = new Set();
  for (const aiItem of aiItems) {
    if (typeof aiItem.match_oc_idx === "number" && aiItem.match_oc_idx >= 0 && aiItem.match_oc_idx < ocItemsCount) {
      takenByAI.add(aiItem.match_oc_idx);
    }
  }
  // Segunda pasada: rellenamos con heurístico los items que el AI no asoció.
  // Pre-computa los matches sugeridos por heurístico de forma estable (no
  // depende del orden de procesamiento de aiItems).
  const heuristicMatches = new Map();   // ai_idx → { idx, score, source }
  const taken = new Set(takenByAI);
  // Ordenamos los AI items por orden de proceso: los que tengan barcode o
  // referencia primero (matches más confiables), después por nombre largo
  // (más información disponible).
  const aiOrdenProceso = aiItems
    .map((ai, idx) => ({ ai, idx }))
    .filter(x => !(typeof x.ai.match_oc_idx === "number" && x.ai.match_oc_idx >= 0))
    .sort((a, b) => {
      const aBC = !!(a.ai.codigo_barras || a.ai.referencia_proveedor);
      const bBC = !!(b.ai.codigo_barras || b.ai.referencia_proveedor);
      if (aBC !== bBC) return bBC - aBC;  // los con barcode/ref primero
      return (b.ai.nombre || "").length - (a.ai.nombre || "").length;
    });
  for (const { ai, idx } of aiOrdenProceso) {
    const m = findBestOcMatch(ai, items, taken);
    if (m.idx !== null) {
      heuristicMatches.set(idx, m);
      taken.add(m.idx);
    }
  }

  const itemsRich = aiItems.map((aiItem, aiIdx) => {
    // 1) Primero respetar match del AI si lo dio.
    let ocIdx = aiItem.match_oc_idx;
    let matchSource = (typeof ocIdx === "number" && ocIdx >= 0 && ocIdx < ocItemsCount) ? "ai" : null;
    // 2) Si AI no matcheó, usar heurístico.
    if (matchSource === null && heuristicMatches.has(aiIdx)) {
      const h = heuristicMatches.get(aiIdx);
      ocIdx = h.idx;
      matchSource = `heur_${h.source}_${Math.round(h.score * 100)}`;
    }
    const matchOc = (typeof ocIdx === "number" && ocIdx >= 0 && ocIdx < ocItemsCount) ? items[ocIdx] : null;
    const nombre = aiItem.nombre || matchOc?.item || matchOc?.nombre || "—";
    let cantPack    = Number(aiItem.cantidad_paquete ?? aiItem.cantidad) || 0;
    let unPorPack   = Math.max(1, Number(aiItem.unidades_por_paquete) || 1);
    const totalAI   = Number(aiItem.cantidad_individual_total) || 0;
    const packReg   = detectarPackDelNombre(nombre);
    if (packReg > 1 && unPorPack === 1) {
      unPorPack = packReg;
      if (cantPack > 0 && cantPack % packReg === 0 && totalAI === cantPack) cantPack = cantPack / packReg;
    } else if (packReg > 1 && unPorPack !== packReg && totalAI > 0) {
      unPorPack = packReg;
      cantPack  = Math.round(totalAI / packReg);
    }
    const subRen      = Number(aiItem.subtotal_renglon) || 0;
    let costoPack     = Number(aiItem.precio_costo_pack ?? aiItem.precio_costo_unit) || 0;
    const ivaPack     = Number(aiItem.iva_valor_pack ?? aiItem.iva_valor_unit) || 0;
    const finalPackAI = Number(aiItem.precio_final_pack ?? aiItem.precio_final_unit) || 0;
    if (costoPack === 0 && subRen > 0 && cantPack > 0) {
      const finalPack = finalPackAI || (subRen / cantPack);
      costoPack = Math.max(0, Math.round(finalPack - ivaPack));
    }
    const costoIndiv  = Number(aiItem.precio_costo_unit_individual) || (unPorPack > 0 ? Math.round(costoPack / unPorPack) : 0);
    const basePack    = Number(aiItem.precio_base_pack ?? aiItem.precio_base_unit) || costoPack;
    const finalPack   = finalPackAI || (costoPack + ivaPack);
    const esBonif     = !!aiItem.es_bonificacion || (costoPack === 0 && subRen === 0 && cantPack > 0);
    return {
      oc_idx: matchOc ? ocIdx : null,
      ai_idx: aiIdx,
      codigo_barras:        aiItem.codigo_barras || null,
      referencia_proveedor: aiItem.referencia_proveedor || null,
      nombre:               aiItem.nombre || matchOc?.item || matchOc?.nombre || "—",
      nombre_anterior:      matchOc ? (matchOc.item || matchOc.nombre) : null,
      cantidad_anterior:    matchOc ? (Number(matchOc.cant) || 0) : null,
      loggro_id:            matchOc?.loggro_id || null,
      cantidad_paquete:     cantPack,
      unidad_compra:        aiItem.unidad_compra || matchOc?.unidad || "UND",
      unidades_por_paquete: unPorPack,
      unidad_individual:    aiItem.unidad_individual || "UND",
      cantidad_individual_total: cantPack * unPorPack,
      descuento_pct:        Number(aiItem.descuento_pct) || 0,
      iva_pct:              Number(aiItem.iva_pct) || 0,
      precio_base_pack:     basePack,
      iva_valor_pack:       ivaPack,
      ico_valor_pack:       Number(aiItem.ico_valor_pack ?? aiItem.ico_valor_unit) || 0,
      icl_valor_pack:       Number(aiItem.icl_valor_pack ?? aiItem.icl_valor_unit) || 0,
      adv_valor_pack:       Number(aiItem.adv_valor_pack ?? aiItem.adv_valor_unit) || 0,
      precio_costo_pack:    costoPack,
      precio_costo_unit_individual: Math.round(costoIndiv),
      precio_final_pack:    finalPack,
      subtotal_renglon:     Number(aiItem.subtotal_renglon) || cantPack * finalPack,
      es_bonificacion:      esBonif,
      requiere_revision:    !!aiItem.requiere_revision,
      es_nuevo_oc:          !matchOc,
      match_source:         matchSource, // "ai" | "heur_nombre_85" | "heur_barcode_100" | "heur_ref_proveedor_95" | null
      cantidad:             cantPack,
      unidad:               aiItem.unidad_compra || matchOc?.unidad || "UND",
      precio_costo_unit:    costoPack,
      precio_unitario:      Math.round(costoIndiv),
      precio_anterior:      matchOc ? Number(matchOc.precioU) || 0 : 0,
      iva_valor_unit:       ivaPack,
      ico_valor_unit:       Number(aiItem.ico_valor_pack ?? aiItem.ico_valor_unit) || 0,
      icl_valor_unit:       Number(aiItem.icl_valor_pack ?? aiItem.icl_valor_unit) || 0,
      adv_valor_unit:       Number(aiItem.adv_valor_pack ?? aiItem.adv_valor_unit) || 0,
      iva:                  cantPack * ivaPack,
      item_id:              matchOc?.item_id || null,
    };
  });

  // Agregar los items de la OC que el AI NO matcheó — quedan como
  // "no_facturado" y el operador decide: (a) pone precio+cant si el
  // proveedor sí los mandó pero el AI no los detectó, o (b) los deja
  // en cant=0, entonces al aplicar la factura vuelven a la mesa de
  // compra (reasignables a otro proveedor).
  const ocIdxsCubiertos = new Set(itemsRich.filter(it => it.oc_idx != null).map(it => it.oc_idx));
  const itemsSinFacturar = (items || []).map((ocIt, ocIdx) => {
    if (ocIdxsCubiertos.has(ocIdx)) return null;
    const cantOrig = Number(ocIt.cant) || 0;
    const precioOrig = Number(ocIt.precioU) || 0;
    return {
      oc_idx: ocIdx,
      ai_idx: null,
      codigo_barras: ocIt.codigo_barras || null,
      referencia_proveedor: ocIt.referencia_proveedor || null,
      nombre: ocIt.item || ocIt.nombre || "—",
      nombre_anterior: ocIt.item || ocIt.nombre || null,
      cantidad_anterior: cantOrig,
      loggro_id: ocIt.loggro_id || null,
      cantidad_paquete: 0,             // ← 0: el operador debe llenar o dejarlo así
      unidad_compra: ocIt.unidad || "UND",
      unidades_por_paquete: Math.max(1, Number(ocIt.unidades_por_paquete) || 1),
      unidad_individual: ocIt.unidad_individual || ocIt.unidad || "UND",
      cantidad_individual_total: 0,
      descuento_pct: 0, iva_pct: Number(ocIt.iva_pct) || 0,
      precio_base_pack: precioOrig,
      iva_valor_pack: 0, ico_valor_pack: 0, icl_valor_pack: 0, adv_valor_pack: 0,
      precio_costo_pack: precioOrig,
      precio_costo_unit_individual: precioOrig,
      precio_final_pack: precioOrig,
      subtotal_renglon: 0,
      es_bonificacion: false,
      requiere_revision: false,
      es_nuevo_oc: false,
      match_source: "oc_sin_match_ai",
      cantidad: 0,
      unidad: ocIt.unidad || "UND",
      precio_costo_unit: precioOrig,
      precio_unitario: precioOrig,
      precio_anterior: precioOrig,
      iva_valor_unit: 0, ico_valor_unit: 0, icl_valor_unit: 0, adv_valor_unit: 0,
      iva: 0,
      item_id: ocIt.item_id || null,
      no_facturado: true,              // ← inicial: si operador lo deja en 0 al aplicar, vuelve a mesa
    };
  }).filter(Boolean);

  return {
    factura_numero:    result.factura_numero || "",
    factura_fecha:     result.factura_fecha || new Date().toISOString().slice(0, 10),
    fecha_vencimiento: result.fecha_vencimiento || "",
    forma_pago:        result.forma_pago || "",
    no_pedido:         result.no_pedido || null,
    no_remision:       result.no_remision || null,
    subtotal_base:     Number(result.subtotal_base) || 0,
    iva_total:         Number(result.iva_total) || 0,
    consumo_total:     Number(result.consumo_total) || 0,
    ico_total:         Number(result.ico_total) || 0,
    icl_total:         Number(result.icl_total) || 0,
    adv_total:         Number(result.adv_total) || 0,
    descuentos_total:  Number(result.descuentos_total) || 0,
    subtotal:          Number(result.subtotal_base) || 0,
    iva:               Number(result.iva_total) || 0,
    total:             Number(result.total) || 0,
    items:             [...itemsRich, ...itemsSinFacturar],
    factura_url:       factura_url || null,
  };
}

export default function FacturaProveedorModal({ oc, onClose, reload, currentUser }) {
  // Una OC puede tener VARIAS facturas independientes (tabla oc_facturas).
  // Si ya hay alguna, abrimos en la lista; si no, directo a subir.
  const [step, setStep] = useState(oc.factura_aplicada || oc.factura_url ? "list" : "upload"); // list | upload | parsing | review | applying | done
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [data, setData] = useState(blankData());
  const [facturas, setFacturas] = useState([]);
  const [loadingFacturas, setLoadingFacturas] = useState(true);
  const [editingFacturaId, setEditingFacturaId] = useState(null);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState("");

  async function cargarFacturas() {
    setLoadingFacturas(true);
    const { data: fs } = await supabase
      .from("oc_facturas").select("*").eq("oc_id", oc.id).order("created_at");
    setFacturas(fs || []);
    setLoadingFacturas(false);
    return fs || [];
  }

  // Cargar la lista de facturas de la OC al abrir.
  useEffect(() => { cargarFacturas(); /* eslint-disable-next-line */ }, [oc.id]);

  // Cargar items_catalogo (los que están linked a Loggro) para mostrar bajo
  // cada item de la factura el ingrediente Loggro al que apunta + su unidad.
  // Esto permite al operario verificar el match y la conversión ANTES de
  // aplicar (ej. factura en Kg, Loggro en Gr → muestra que entrará ×1000).
  const [loggroCatMap, setLoggroCatMap] = useState({});       // loggro_id → {id, nombre, unidad}
  const [loggroCatList, setLoggroCatList] = useState([]);     // lista linkeada a Loggro para buscador
  const [catalogoById, setCatalogoById] = useState({});       // items_catalogo.id → row (todos)
  const [catalogoByNombre, setCatalogoByNombre] = useState({}); // lower(nombre) → row (todos)
  useEffect(() => {
    (async () => {
      // Traemos TODO items_catalogo (no solo los con loggro_id) para poder
      // resolver via item_id o por nombre cuando el OC item no trae loggro_id.
      const { data: items } = await supabase
        .from("items_catalogo")
        .select("id, nombre, unidad, loggro_id, categoria")
        .order("nombre");
      const mapByLoggro = {}, mapById = {}, mapByNombre = {};
      const conLoggro = [];
      (items || []).forEach(it => {
        if (it.id) mapById[it.id] = it;
        if (it.nombre) mapByNombre[it.nombre.trim().toLowerCase()] = it;
        if (it.loggro_id) {
          mapByLoggro[it.loggro_id] = { id: it.id, nombre: it.nombre, unidad: it.unidad, categoria: it.categoria };
          conLoggro.push(it);
        }
      });
      setLoggroCatMap(mapByLoggro);
      setLoggroCatList(conLoggro);
      setCatalogoById(mapById);
      setCatalogoByNombre(mapByNombre);
    })();
  }, []);

  // Resolver el loggro_id de un item de la OC: primero campo directo, luego
  // via item_id en items_catalogo, luego por nombre exacto. Devuelve { loggro_id, nombre_catalogo, unidad_catalogo, fuente } o null.
  const resolveOCItem = (ocIt) => {
    if (ocIt.loggro_id) {
      const cat = loggroCatMap[ocIt.loggro_id];
      return { loggro_id: ocIt.loggro_id, nombre_catalogo: cat?.nombre || ocIt.item || ocIt.nombre, unidad_catalogo: cat?.unidad, item_id: cat?.id || ocIt.item_id || null, fuente: "directo" };
    }
    if (ocIt.item_id && catalogoById[ocIt.item_id]) {
      const cat = catalogoById[ocIt.item_id];
      if (cat.loggro_id) return { loggro_id: cat.loggro_id, nombre_catalogo: cat.nombre, unidad_catalogo: cat.unidad, item_id: cat.id, fuente: "item_id" };
    }
    const nombre = (ocIt.item || ocIt.nombre || "").trim().toLowerCase();
    if (nombre && catalogoByNombre[nombre]?.loggro_id) {
      const cat = catalogoByNombre[nombre];
      return { loggro_id: cat.loggro_id, nombre_catalogo: cat.nombre, unidad_catalogo: cat.unidad, item_id: cat.id, fuente: "nombre" };
    }
    return null;
  };

  // Items de la OC con su resolución a Loggro (incluye los que NO se pueden
  // resolver, marcados con loggro_id=null, para que el operador los vea en el
  // dropdown y sepa qué hay en la OC).
  const ocItemsResolved = (oc.items || []).map(ocIt => ({
    ocIt,
    resolved: resolveOCItem(ocIt),
  }));
  const ocItemsConLoggro = ocItemsResolved.filter(x => x.resolved?.loggro_id);

  // Auto-resolver loggro_id cuando el catálogo se carga DESPUÉS del parser.
  // El AI hace match item.factura ↔ item.OC pero el item de la OC no trae
  // loggro_id directo. Esta resolución cierra el bucle: si el item de la
  // factura tiene oc_idx (matcheó con OC) y no tiene loggro_id todavía,
  // intentamos resolverlo via catalog by id/nombre del item OC. Solo actúa
  // sobre items que NO tienen loggro_id (idempotente — no pisa los que ya
  // están vinculados manual o por AI directo).
  useEffect(() => {
    if (Object.keys(catalogoById).length === 0 && Object.keys(catalogoByNombre).length === 0) return;
    if (!data.items || data.items.length === 0) return;
    setData(d => {
      let changed = false;
      const items = d.items.map(it => {
        if (it.loggro_id) return it;            // ya vinculado, dejar
        if (it.oc_idx == null) return it;       // no matcheó con OC, manual
        const ocIt = oc.items?.[it.oc_idx];
        if (!ocIt) return it;
        const res = resolveOCItem(ocIt);
        if (!res?.loggro_id) return it;
        changed = true;
        return {
          ...it,
          loggro_id: res.loggro_id,
          item_id: res.item_id || it.item_id,
          nombre_anterior: res.nombre_catalogo,
          match_source: it.match_source || "auto_oc_catalog",
        };
      });
      return changed ? { ...d, items } : d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.items, catalogoById, catalogoByNombre]);

  // Estado local del buscador en el catálogo Loggro completo (por nombre).
  // Indexado por idx del item de la factura para soportar varios abiertos.
  const [buscarLoggroTxt, setBuscarLoggroTxt] = useState({});

  // Cuando el operador elige un item Loggro para vincular, copiamos los
  // metadatos al item de la factura (loggro_id, item_id, nombre del catálogo
  // como nombre_anterior para mostrar matching) y reseteamos el buscador.
  const vincularAItemLoggro = (i, item) => {
    setData(d => ({
      ...d,
      items: d.items.map((p, j) => j === i ? {
        ...p,
        loggro_id: item.loggro_id,
        item_id: item.id || p.item_id,
        nombre_anterior: item.nombre,
        es_nuevo_oc: false,
        match_source: "vinculado_manual",
      } : p),
    }));
    setBuscarLoggroTxt(s => ({ ...s, [i]: "" }));
  };
  const [syncingNombreIdx, setSyncingNombreIdx] = useState(null);

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
          // Solo se muestran los items que vienen EN la factura (no los de la
          // cotización/OC que no fueron facturados). Multi-factura: cada
          // factura es independiente.
          setParsed(result);
          setEditingFacturaId(null);
          const built = buildDataFromParsed(result, oc.items || [], pub.publicUrl);
          setData(built);
          setProgress(`✅ Factura leída — ${built.items.length} items extraídos`);
        } else {
          // Mostrar el error real con un poco de detalle del raw para diagnóstico
          const detalle = result.stop_reason === "max_tokens"
            ? " · Factura muy larga, contacta soporte."
            : result.raw_first_chars
              ? ` · Inicio: ${result.raw_first_chars.slice(0, 80)}…`
              : "";
          setErr((result.error || "No se pudo leer la factura") + detalle + " — Cargamos los items de la OC abajo: revisa cantidades y precios contra la factura.");
          // Fallback: traer los items de la OC con sus cantidades y precios
          // actuales, así el operario revisa contra la factura física en vez
          // de tener que tipear todo desde cero.
          setData(buildDataFromOC(oc, pub.publicUrl));
        }
      } else {
        // Otros tipos (no imagen ni PDF): solo adjunto, manual con items OC.
        setData(buildDataFromOC(oc, pub.publicUrl));
        setProgress("📎 Archivo adjuntado — items de la OC cargados abajo, revisa cantidades y precios");
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

  // Recalcular subtotales en vivo — usar cantidad_paquete × precio_costo_pack
  // que es la fuente de verdad (unidad de compra del proveedor). Antes
  // usabamos cantidad × precio_unitario que daba resultados distintos por
  // items donde cantidad_paquete != cantidad o precio_unitario != precio_costo_pack.
  // El display de la tabla ya usa esta formula (linea Subtotal costo).
  const subtotalCalc = data.items.reduce((s, it) =>
    s + (it.es_bonificacion ? 0 :
      (Number(it.cantidad_paquete ?? it.cantidad) || 0) *
      (Number(it.precio_costo_pack ?? it.precio_costo_unit) || 0)), 0);
  const ivaCalc      = data.items.reduce((s, it) => s + (Number(it.iva) || 0), 0) || Number(data.iva) || 0;
  const totalCalc    = subtotalCalc + ivaCalc;
  const usarSubtotal = subtotalCalc;  // ignorar data.subtotal (raw AI puede tener errores)
  const usarIva      = ivaCalc;
  const usarTotal    = totalCalc;

  // ── Diff detection ──────────────────────────────────────────────────
  // Detectamos qué cambió contra la OC original. Solo para items que están
  // matcheados (oc_idx != null) y no son nuevos. Cantidad se compara en
  // unidades INDIVIDUALES (cantidad_paquete × unidades_por_paquete) porque
  // la OC original guarda `cant` en unidades individuales.
  const eqStr = (a, b) => String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
  const itemDiffs = data.items.map(it => {
    if (it.es_nuevo_oc || it.no_facturado || it.oc_idx == null) return { nombreCambio: false, cantidadCambio: false, precioCambio: false };
    const cantTotal = (Number(it.cantidad_paquete ?? it.cantidad) || 0) * Math.max(1, Number(it.unidades_por_paquete) || 1);
    const costoIndiv = (() => {
      const unPP = Math.max(1, Number(it.unidades_por_paquete) || 1);
      const cp = Number(it.precio_costo_pack ?? it.precio_costo_unit) || 0;
      return unPP > 0 ? Math.round(cp / unPP) : 0;
    })();
    const isBonif = !!it.es_bonificacion;
    return {
      nombreCambio:   it.nombre_anterior != null && !eqStr(it.nombre, it.nombre_anterior),
      cantidadCambio: it.cantidad_anterior != null && Math.abs(cantTotal - (Number(it.cantidad_anterior) || 0)) > 0.0001,
      // Bonificaciones: precio cambia naturalmente a $0, no es un "cambio del proveedor"
      precioCambio:   !isBonif && it.precio_anterior > 0 && Math.abs(costoIndiv - (Number(it.precio_anterior) || 0)) > 0.01,
    };
  });
  const totDiffNombres   = itemDiffs.filter(d => d.nombreCambio).length;
  const totDiffCantidad  = itemDiffs.filter(d => d.cantidadCambio).length;
  const totDiffPrecio    = itemDiffs.filter(d => d.precioCambio).length;
  const totalCambios     = totDiffNombres + totDiffCantidad + totDiffPrecio;
  const itemsNuevosCount   = data.items.filter(x => x.es_nuevo_oc).length;
  const itemsNoFactCount   = data.items.filter(x => x.no_facturado).length;

  // ── Sync nombre con catálogo + Loggro ──────────────────────────────
  // Cuando el proveedor renombra un producto en su factura, propagamos el
  // cambio a items_catalogo y a Loggro (mismo flujo que en Recepciones).
  async function sincronizarNombre(idx) {
    const it = data.items[idx];
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
      if (it.item_id) {
        const { error } = await supabase.from("items_catalogo")
          .update({ nombre: nuevo, updated_at: new Date().toISOString() })
          .eq("id", it.item_id);
        if (error) throw error;
      }
      if (it.loggro_id) {
        const { error } = await supabase.functions.invoke("loggro-sync/update-ingredient", {
          body: { loggro_id: it.loggro_id, nombre: nuevo },
        });
        if (error) throw error;
      }
      setData(d => ({
        ...d,
        items: d.items.map((p, j) => j === idx ? { ...p, nombre_anterior: nuevo } : p),
      }));
      setProgress(`✅ Nombre sincronizado: "${nuevo}"`);
    } catch (e) {
      setErr(`Error al sincronizar nombre: ${e.message || e}`);
    } finally {
      setSyncingNombreIdx(null);
    }
  }

  async function aplicar() {
    if (!data.factura_numero) { setErr("Número de factura obligatorio"); return; }

    // Validación 1: fecha factura no futura. Sin esto un OCR podía extraer
    // una fecha mal (ej. 2026 → 2027) y entraban días de crédito negativos.
    const hoy = new Date().toISOString().slice(0, 10);
    if (data.factura_fecha && data.factura_fecha > hoy) {
      setErr(`Fecha de factura no puede ser futura (${data.factura_fecha}). Verifica el dato del OCR.`);
      return;
    }

    // Validación 2: factura duplicada del MISMO proveedor (en otra OC).
    // El UNIQUE en oc_facturas(oc_id, factura_numero) solo previene dups
    // dentro de la misma OC. Un proveedor podía facturar dos veces el mismo
    // número en OCs distintas y entraban ambas (CxP duplicado).
    if (oc.proveedor_id) {
      const { data: dupsOC } = await supabase
        .from("ordenes_compra")
        .select("id, codigo, factura_numero")
        .eq("proveedor_id", oc.proveedor_id)
        .eq("factura_numero", data.factura_numero)
        .neq("id", oc.id);
      const dups = (dupsOC || []).filter(d => d.factura_numero === data.factura_numero);
      if (dups.length > 0) {
        const lista = dups.slice(0, 3).map(d => d.codigo).join(", ");
        const ok = window.confirm(
          `⚠️ FACTURA YA EXISTE\n\nEl proveedor ya tiene la factura ${data.factura_numero} aplicada en:\n${lista}${dups.length > 3 ? `\n... (+${dups.length - 3} más)` : ""}\n\n¿Aplicarla igual? Confirma que NO es el mismo documento del proveedor — generar duplicado en CxP es serio.`
        );
        if (!ok) { setErr("Aplicación cancelada — verifica número de factura."); return; }
      }
    }

    // Validación 3: total factura vs total OC. Warning si difiere >5%.
    const totalFacturaCalc = Number(data.total) || 0;
    const totalOC = Number(oc.total) || 0;
    if (totalFacturaCalc > 0 && totalOC > 0) {
      const difAbs = Math.abs(totalFacturaCalc - totalOC);
      const difPct = (difAbs / totalOC) * 100;
      if (difPct > 5) {
        const ok = window.confirm(
          `⚠️ Diferencia de total\n\nFactura: ${totalFacturaCalc.toLocaleString("es-CO")}\nOC esperaba: ${totalOC.toLocaleString("es-CO")}\nDiferencia: ${difPct.toFixed(1)}% (${difAbs.toLocaleString("es-CO")})\n\n¿Aplicar igual? Verifica que la factura corresponda exactamente a esta OC.`
        );
        if (!ok) { setErr("Aplicación cancelada — revisar totales."); return; }
      }
    }

    setStep("applying");
    setErr("");
    try {
      // 1. Construir items actualizados de la OC.
      //    El INVENTARIO se cuenta en unidades individuales, así que:
      //    - cant_individual = cantidad_paquete × unidades_por_paquete
      //    - precioU (costo individual) = precio_costo_pack / unidades_por_paquete
      //    Las BONIFICACIONES suman al inventario pero NO actualizan precio_compra ni
      //    afectan el costo (precioU=0 en la OC pero metadata en factura_data).
      // Re-leer items frescos de la OC: si ya se aplicó otra factura a esta
      // misma OC, NO debemos pisar sus cambios. Cada factura es independiente
      // y sólo toca sus propios items.
      const { data: freshOC } = await supabase
        .from("ordenes_compra").select("items").eq("id", oc.id).single();
      const ocItemsOriginal = freshOC?.items || oc.items || [];

      // Resolver el id de la fila oc_facturas (editar existente o crear nueva).
      // Una factura con el mismo número en la misma OC se EDITA en su sitio
      // (no se duplica → no se doble-cuenta en el agregado).
      let facturaId = editingFacturaId;
      if (!facturaId) {
        const { data: exF } = await supabase.from("oc_facturas")
          .select("id").eq("oc_id", oc.id).eq("factura_numero", data.factura_numero).maybeSingle();
        facturaId = exF?.id || `OCF_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      }

      const itemsActualizados = ocItemsOriginal.map((it, i) => {
        const f = data.items.find(x => x.oc_idx === i && !x.no_facturado);
        if (!f) return it;
        const unPorPack       = Math.max(1, Number(f.unidades_por_paquete) || 1);
        const cantPaquete     = Number(f.cantidad_paquete) || Number(it.cant) || 0;
        const cantIndividual  = cantPaquete * unPorPack;
        const costoPack       = Number(f.precio_costo_pack) || 0;
        const precioUIndiv    = f.es_bonificacion ? 0 : Math.round(unPorPack > 0 ? costoPack / unPorPack : 0);
        // Preservar nombre original de la requisición para trazabilidad.
        // Si el proveedor factura con nombre distinto (ej. req 'CORONA 330 ML'
        // → factura 'Cerveza Corona Botella 330ml'), guardamos ambos.
        // La relación con la req se mantiene por item_id/loggro_id/req_ids.
        const nombreFactura  = (f.nombre || "").trim();
        const nombrePrevio   = (it.item || it.nombre || "").trim();
        const nombreOriginal = it.nombre_original || nombrePrevio;  // primera vez
        const renombrado     = nombreFactura && nombreOriginal && nombreFactura !== nombreOriginal;
        return {
          ...it,
          // El campo `cant` queda en unidades INDIVIDUALES (lo que va al inventario)
          cant: cantIndividual,
          unidad: f.unidad_individual || "UND",
          precioU: precioUIndiv,
          subtotal: Math.round(cantIndividual * precioUIndiv),
          // Trazabilidad de renombrado (factura vs requisición)
          item: nombreFactura || it.item,
          nombre: nombreFactura || it.nombre,
          nombre_original:  nombreOriginal || null,
          nombre_proveedor: renombrado ? nombreFactura : (it.nombre_proveedor || null),
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
          factura_origen_id:     facturaId,
        };
      });

      // 1b. Items de la factura que NO estaban en la OC original — los agregamos.
      //    Aceptamos items con codigo_barras (auto-creados en catálogo) o
      //    manuales sin codigo (bonificaciones con nombre libre).
      //    Dedupe: si una factura anterior ya agregó este código de barras a la
      //    OC, NO lo volvemos a agregar (evita inflar inventario/total).
      const cbYaEnOC = new Set(
        ocItemsOriginal
          .filter(it => it.agregado_post_factura && it.codigo_barras)
          .map(it => String(it.codigo_barras))
      );
      const itemsNuevosOC = data.items
        .filter(f => f.es_nuevo_oc && (f.codigo_barras || (f.nombre && f.nombre.trim())))
        .filter(f => !(f.codigo_barras && cbYaEnOC.has(String(f.codigo_barras))))
        .map(f => {
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
          factura_origen_id:    facturaId,
          factura_iva_pack:     Number(f.iva_valor_pack) || 0,
          factura_consumo_pack: (Number(f.ico_valor_pack) || 0) + (Number(f.icl_valor_pack) || 0) + (Number(f.adv_valor_pack) || 0),
          es_bonificacion:      !!f.es_bonificacion,
          requiere_revision:    !!f.requiere_revision,
          motivo_manual:        f.motivo_manual || null,
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
        const nombre = (f.nombre || "").trim();
        if (!cb && !nombre) continue;
        const unPorPack    = Math.max(1, Number(f.unidades_por_paquete) || 1);
        const costoPack    = Number(f.precio_costo_pack) || 0;
        const precioUIndiv = unPorPack > 0 ? Math.round(costoPack / unPorPack) : 0;

        // Match inteligente vía RPC: codigo_barras → codigo → nombre similar
        const { data: matches } = await supabase.rpc("find_item_match", {
          p_codigo_barras: cb || null,
          p_codigo:        f.referencia_proveedor || null,
          p_nombre:        nombre || null,
        });
        const existente = (matches && matches[0]) || null;

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
          // Si el match fue por nombre similar, también guardar el codigo_barras
          // para que la próxima factura sí matchee directo.
          if (existente.match_method === "nombre_similar" && cb) {
            updates.codigo_barras = cb;
          }
          await supabase.from("items_catalogo").update(updates).eq("id", existente.id);
          updatesCatalogo.push(existente.id);
          if (!f.item_id && f.es_nuevo_oc) {
            const idx = itemsNuevosOC.findIndex(x => (cb && x.codigo_barras === cb) || x.nombre === f.nombre);
            if (idx >= 0) itemsNuevosOC[idx].item_id = existente.id;
          }
        } else if (cb) {
          // Solo crear nuevo si tenemos código de barras (caso item totalmente nuevo
          // que no existe en catálogo). Si no hay código de barras y no matcheó por
          // nombre, mejor omitir para evitar pollution.
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
            const idx = itemsNuevosOC.findIndex(x => (cb && x.codigo_barras === cb) || x.nombre === f.nombre);
            if (idx >= 0) itemsNuevosOC[idx].item_id = newId;
          }
        }
      }

      // 3. Construir items finales de la OC (matcheados + nuevos)
      const itemsFinales = [...itemsActualizados, ...itemsNuevosOC];
      const subtotalOC = itemsFinales.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);

      // 4a. Upsert de ESTA factura en oc_facturas (independiente de las demás).
      // Recalculamos SIEMPRE desde los items editados por el operador — antes
      // se persistia data.subtotal / data.total (raw del AI del PDF) y si el
      // operador editaba cantidades, precios o quitaba items la suma real no
      // coincidia con el total guardado. Politica IVA-incluido: total = subtotal.
      const facturaSubtotal = subtotalCalc;
      const facturaIva      = ivaCalc;
      const facturaTotal    = facturaSubtotal + facturaIva;
      const aplicadaPor     = currentUser?.email || currentUser?.nombre || "sistema";
      const { error: efu } = await supabase.from("oc_facturas").upsert({
        id: facturaId,
        oc_id: oc.id,
        oc_codigo: oc.codigo || null,
        factura_numero: data.factura_numero,
        factura_fecha: data.factura_fecha || null,
        fecha_vencimiento_pago: data.fecha_vencimiento || null,
        forma_pago: data.forma_pago || null,
        subtotal: facturaSubtotal,
        iva: facturaIva,
        consumo: data.consumo_total || 0,
        total: facturaTotal,
        // Guardar items EDITADOS por el operador (con loggro_qty_override,
        // vínculos manuales a Loggro, etc.) — antes se guardaba `parsed`
        // (raw del AI) y los edits del operador se descartaban silenciosamente.
        // RecepcionOCModal lee factura_data.items[].loggro_qty_override para
        // entrar la cantidad correcta a Loggro.
        factura_data: { ...(parsed || {}), items: data.items },
        factura_url: data.factura_url || null,
        aplicada: true,
        aplicada_at: new Date().toISOString(),
        aplicada_por: aplicadaPor,
        created_by: aplicadaPor,
      }, { onConflict: "id" });
      if (efu) throw efu;

      // 4b. Agregado: total/subtotal/iva de la OC = SUMA de todas sus facturas
      //     aplicadas. Las columnas singulares factura_* quedan como ESPEJO de
      //     la última factura (la recién aplicada) para compat con CxP/listados.
      const { data: allF } = await supabase.from("oc_facturas")
        .select("subtotal, iva, total").eq("oc_id", oc.id).eq("aplicada", true);
      const sumSub   = (allF || []).reduce((s, x) => s + (Number(x.subtotal) || 0), 0);
      const sumIva   = (allF || []).reduce((s, x) => s + (Number(x.iva) || 0), 0);
      const sumTotal = (allF || []).reduce((s, x) => s + (Number(x.total) || 0), 0);

      // 4c. Update OC: items mergeados + espejo de la última factura + agregado.
      const updateOC = {
        items: itemsFinales,
        subtotal: subtotalOC,
        iva: sumIva,
        total: sumTotal,
        factura_numero: data.factura_numero,
        factura_fecha: data.factura_fecha,
        factura_url: data.factura_url || null,
        factura_subtotal: sumSub,
        factura_iva: sumIva,
        // Guardar items EDITADOS por el operador (con loggro_qty_override,
        // vínculos manuales a Loggro, etc.) — antes se guardaba `parsed`
        // (raw del AI) y los edits del operador se descartaban silenciosamente.
        // RecepcionOCModal lee factura_data.items[].loggro_qty_override para
        // entrar la cantidad correcta a Loggro.
        factura_data: { ...(parsed || {}), items: data.items },
        factura_aplicada: true,
        factura_aplicada_at: new Date().toISOString(),
        factura_aplicada_por: aplicadaPor,
        updated_at: new Date().toISOString(),
      };
      // Transicionar el estado si la OC está en estados pre-recibo. Una OC con
      // factura aplicada pero estado='aprobada' o 'enviada' es inconsistente —
      // si llegó factura, la mercancía/servicio ya se movió. Pasamos a
      // 'confirmada' como bridge hacia recepción. No tocamos estados
      // posteriores (recibida, recibida_parcial, pagada, cancelada).
      if (oc.estado === "aprobada" || oc.estado === "enviada") {
        updateOC.estado = "confirmada";
      }
      if (data.fecha_vencimiento) {
        updateOC.fecha_vencimiento_pago = data.fecha_vencimiento;
        const dc = Math.floor((new Date(data.fecha_vencimiento) - new Date(data.factura_fecha || new Date())) / 86400000);
        if (dc >= 0) updateOC.dias_credito = dc;
      }
      // Agregar entries a cambios_historial para items nuevos con motivo manual.
      // Esto deja trazabilidad de por que un item que no estaba en la OC original
      // se agrego al recibir la factura.
      const itemsConMotivo = itemsNuevosOC.filter(x => x.motivo_manual);
      if (itemsConMotivo.length > 0) {
        const nowIso = new Date().toISOString();
        const nuevasEntradas = itemsConMotivo.map(it => ({
          fecha: nowIso,
          quien: aplicadaPor,
          accion: `Item manual agregado desde factura #${data.factura_numero || "-"}: "${it.item || it.nombre}"`,
          motivo: it.motivo_manual,
          detalle: {
            item: it.item || it.nombre,
            cantidad: it.cant,
            precio_unit: it.precioU,
            subtotal: it.subtotal,
            factura_id: facturaId,
          },
        }));
        updateOC.cambios_historial = [...(oc.cambios_historial || []), ...nuevasEntradas];
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

      // 6. Insertar / actualizar la relación items_proveedores
      //    Esto alimenta el panel "Proveedores & Precios" de cada producto.
      //    Para cada item facturado que tenga item_id (matcheado o creado),
      //    insertamos una fila con el precio de este proveedor.
      if (oc.proveedor_id || oc.proveedor_nombre) {
        for (const f of facturados) {
          if (f.es_bonificacion) continue;     // bonificaciones no establecen precio
          // Buscar item_id real (matcheado o recién creado por código de barras)
          let realItemId = f.item_id;
          if (!realItemId && f.codigo_barras) {
            const { data: cat } = await supabase.from("items_catalogo")
              .select("id").eq("codigo_barras", f.codigo_barras).maybeSingle();
            realItemId = cat?.id || null;
          }
          if (!realItemId) continue;
          const unPorPack    = Math.max(1, Number(f.unidades_por_paquete) || 1);
          const costoPack    = Number(f.precio_costo_pack) || 0;
          const precioUIndiv = unPorPack > 0 ? Math.round(costoPack / unPorPack) : 0;
          if (precioUIndiv <= 0) continue;

          // ¿Ya existe la relación con este proveedor?
          const { data: existRel } = await supabase.from("items_proveedores")
            .select("id, es_principal")
            .eq("item_id", realItemId)
            .eq("proveedor_id", oc.proveedor_id || "")
            .maybeSingle();

          // ¿Hay otros proveedores ya marcados como principales?
          const { data: hasPrincipal } = await supabase.from("items_proveedores")
            .select("id").eq("item_id", realItemId).eq("es_principal", true).limit(1).maybeSingle();
          const debeSerPrincipal = !hasPrincipal || existRel?.es_principal;

          if (existRel?.id) {
            await supabase.from("items_proveedores").update({
              proveedor_nombre: oc.proveedor_nombre || existRel.proveedor_nombre,
              precio:           precioUIndiv,
              es_principal:     debeSerPrincipal,
              notas:            `Factura ${data.factura_numero} (${data.factura_fecha})`,
              updated_at:       new Date().toISOString(),
            }).eq("id", existRel.id);
          } else {
            await supabase.from("items_proveedores").insert({
              id:               `IPV_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              item_id:          realItemId,
              proveedor_id:     oc.proveedor_id || null,
              proveedor_nombre: oc.proveedor_nombre || null,
              precio:           precioUIndiv,
              es_principal:     debeSerPrincipal,
              notas:            `Factura ${data.factura_numero} (${data.factura_fecha})`,
            });
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

      // 5. Si la OC YA tenía movimiento en Loggro (se recibió ANTES de tener
      //    precio → entró con costo $0), re-empujar el costo correcto a ese
      //    movimiento. Solo corrige precio, cantidad intacta → NO duplica
      //    inventario. Best-effort: si falla, NO rompe la factura.
      if (oc.loggro_movement_id) {
        try {
          const costos = {};
          for (const f of facturados) {
            if (f.es_bonificacion || !f.loggro_id) continue;
            const unPP = Math.max(1, Number(f.unidades_por_paquete) || 1);
            const cPack = Number(f.precio_costo_pack) || 0;
            const pIndiv = unPP > 0 ? Math.round(cPack / unPP) : 0;
            if (pIndiv > 0) costos[f.loggro_id] = pIndiv;
          }
          if (Object.keys(costos).length > 0) {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/update-movement-costs`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
              body: JSON.stringify({ movement_id: oc.loggro_movement_id, costs: costos }),
            });
          }
        } catch (_e) { /* best-effort: no romper la aplicación de la factura */ }
      }

      // 6b. Items NO FACTURADOS (cant=0) → devolver a la mesa de compra.
      //     El operador confirmó con cant=0 que el proveedor NO mandó este
      //     item. Se limpia oc_id/oc_codigo en la req origen y la req vuelve
      //     a "Aprobada" si ya no le quedan items con OC. Trazabilidad queda
      //     en cambios_historial + timeline de la req.
      const noFacturadosOC = data.items.filter(f =>
        f.oc_idx != null && (f.no_facturado || (Number(f.cantidad_paquete) || 0) === 0)
      );
      if (noFacturadosOC.length > 0) {
        // Recopilar reqs afectadas (por req_ids en cada item de la OC)
        const reqIdsPorItem = new Map();
        for (const f of noFacturadosOC) {
          const ocIt = ocItemsOriginal[f.oc_idx];
          if (!ocIt) continue;
          const rids = Array.isArray(ocIt.req_ids) ? ocIt.req_ids : (ocIt.req_id ? [ocIt.req_id] : []);
          for (const rid of rids) {
            if (!reqIdsPorItem.has(rid)) reqIdsPorItem.set(rid, []);
            reqIdsPorItem.get(rid).push(ocIt);
          }
        }
        for (const [rid, items] of reqIdsPorItem.entries()) {
          const { data: reqRow } = await supabase.from("requisiciones")
            .select("items, estado, timeline").eq("id", rid).maybeSingle();
          if (!reqRow) continue;
          const idsOC = new Set(items.map(x => x.id).filter(Boolean));
          const nombresOC = new Set(items.map(x => (x.item || x.nombre || "").toLowerCase().trim()));
          const nuevosItemsReq = (reqRow.items || []).map(it => {
            const matchId = it.id && idsOC.has(it.id);
            const matchNombre = !matchId && nombresOC.has((it.item || it.nombre || "").toLowerCase().trim()) && it.oc_id === oc.id;
            if (matchId || matchNombre) {
              const { oc_id, oc_codigo, ...rest } = it;
              return rest;
            }
            return it;
          });
          const tieneItemsConOC = nuevosItemsReq.some(x => x.oc_id);
          const nuevoEstadoReq = tieneItemsConOC ? reqRow.estado : "Aprobada";
          await supabase.from("requisiciones").update({
            items: nuevosItemsReq,
            estado: nuevoEstadoReq,
            timeline: [
              ...(reqRow.timeline || []),
              {
                quien: aplicadaPor || currentUser?.nombre || "—",
                accion: `${items.length} item(s) devueltos a mesa`,
                fecha: new Date().toLocaleString("es-CO"),
                comentario: `Factura ${data.factura_numero} · OC ${oc.codigo} · NO facturados por proveedor` + (nuevoEstadoReq !== reqRow.estado ? " · estado → Aprobada" : ""),
              },
            ],
            updated_at: new Date().toISOString(),
          }).eq("id", rid);
        }
      }

      // Refrescar la lista de facturas y volver a ella (NO cerrar el modal:
      // el usuario puede adjuntar otra factura a esta misma OC).
      reload();
      await cargarFacturas();
      setEditingFacturaId(null);
      setData(blankData());
      setParsed(null);
      setProgress(`✅ Factura ${data.factura_numero} aplicada`);
      setStep("list");
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
            <div style={{ fontSize: 18, fontWeight: 800 }}>📎 Facturas del Proveedor</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {oc.codigo} · {oc.proveedor_nombre} · OC original: {COP(oc.total)}
              {facturas.length > 0 && ` · ${facturas.length} factura${facturas.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* STEP 0: Lista de facturas de la OC */}
        {step === "list" && (
          <div style={{ marginTop: 18 }}>
            {progress && <div style={{ marginBottom: 10, padding: 8, background: B.success + "11", color: B.success, borderRadius: 6, fontSize: 12 }}>{progress}</div>}
            {loadingFacturas ? (
              <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Cargando facturas…</div>
            ) : facturas.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                Esta OC aún no tiene facturas adjuntas.
              </div>
            ) : (
              <div style={{ background: B.navy, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: B.navyLight }}>
                      {["N° Factura", "Fecha", "Subtotal", "IVA", "Total", "Estado", ""].map((h, i) => (
                        <th key={h + i} style={{ padding: "8px 10px", textAlign: i < 1 || i === 5 ? "left" : i === 6 ? "center" : "right", fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {facturas.map((f) => (
                      <tr key={f.id} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>
                          {f.factura_numero}
                          {f.factura_url && (
                            <a href={f.factura_url} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: B.sky, fontSize: 11, textDecoration: "none" }}>📎 ver</a>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.7)" }}>{f.factura_fecha ? String(f.factura_fecha).slice(0, 10) : "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{COP(f.subtotal)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", color: B.sky }}>{COP(f.iva)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: B.sand }}>{COP(f.total)}</td>
                        <td style={{ padding: "8px 10px" }}>
                          {f.aplicada
                            ? <span style={{ fontSize: 9, padding: "2px 7px", background: B.success + "33", color: B.success, borderRadius: 8, fontWeight: 700 }}>APLICADA</span>
                            : <span style={{ fontSize: 9, padding: "2px 7px", background: B.warning + "33", color: B.warning, borderRadius: 8, fontWeight: 700 }}>PENDIENTE</span>}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          <button onClick={() => {
                            const fd = f.factura_data || {};
                            setParsed(fd);
                            setEditingFacturaId(f.id);
                            setData({
                              ...buildDataFromParsed(fd, oc.items || [], f.factura_url),
                              factura_numero: f.factura_numero || "",
                              factura_fecha: f.factura_fecha ? String(f.factura_fecha).slice(0, 10) : new Date().toISOString().slice(0, 10),
                              fecha_vencimiento: f.fecha_vencimiento_pago ? String(f.fecha_vencimiento_pago).slice(0, 10) : "",
                            });
                            setProgress("");
                            setErr("");
                            setStep("review");
                          }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 700, borderRadius: 6, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, cursor: "pointer" }}>
                            👁 Revisar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: B.navyMid, fontWeight: 800 }}>
                      <td colSpan={2} style={{ padding: "8px 10px", textAlign: "right", color: "rgba(255,255,255,0.6)" }}>TOTALES</td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>{COP(facturas.reduce((s, x) => s + (Number(x.subtotal) || 0), 0))}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: B.sky }}>{COP(facturas.reduce((s, x) => s + (Number(x.iva) || 0), 0))}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: B.success }}>{COP(facturas.reduce((s, x) => s + (Number(x.total) || 0), 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
                Cerrar
              </button>
              <button onClick={() => { setEditingFacturaId(null); setData(blankData()); setParsed(null); setErr(""); setProgress(""); setStep("upload"); }}
                style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: B.success, color: B.navy, fontSize: 13, cursor: "pointer", fontWeight: 800 }}>
                + Adjuntar otra factura
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: Upload */}
        {step === "upload" && (
          <div style={{ marginTop: 20 }}>
            <div style={{ background: B.navy, border: `2px dashed ${B.navyLight}`, borderRadius: 12, padding: 30, textAlign: "center" }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>
                Sube una <strong>foto/PDF</strong> de la factura del proveedor.
                <br/>Las imágenes y PDF se procesan con IA para extraer items, precios, IVA y total.
                <br/>Solo aparecerán los items que vengan <strong>en esta factura</strong>.
              </div>
              <input type="file" accept="image/*,application/pdf" onChange={handleUpload}
                style={{ background: B.sky, color: B.navy, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none" }} />
              <div style={{ marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                — o —
              </div>
              <button
                onClick={() => {
                  setErr(""); setProgress("");
                  setEditingFacturaId(null);
                  setParsed(null);
                  setData(buildDataFromOC(oc, null));
                  setStep("review");
                }}
                style={{ marginTop: 10, background: "transparent", color: B.sand, padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${B.sand}` }}>
                ✏️ Cargar manual (revisar items de la OC)
              </button>
              <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                Trae cantidades y precios de la OC para que los revises contra la factura física.
              </div>
            </div>
            {facturas.length > 0 && (
              <button onClick={() => { setErr(""); setProgress(""); setStep("list"); }}
                style={{ marginTop: 12, padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>
                ← Volver a facturas ({facturas.length})
              </button>
            )}
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

            {/* ── Banner de diferencias detectadas ────────────────────── */}
            {(totalCambios > 0 || itemsNuevosCount > 0 || itemsNoFactCount > 0) && (
              <div style={{
                marginBottom: 14, padding: "12px 14px", borderRadius: 10,
                background: "rgba(245,158,11,0.12)", border: `1px solid ${B.warning}55`,
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: B.warning, marginBottom: 2 }}>
                    {totalCambios > 0
                      ? `${totalCambios} ${totalCambios === 1 ? "diferencia detectada" : "diferencias detectadas"} vs OC original`
                      : "Revisa diferencias vs OC original"}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {totDiffNombres   > 0 && <span>📝 {totDiffNombres} {totDiffNombres === 1 ? "nombre" : "nombres"}</span>}
                    {totDiffCantidad  > 0 && <span>📦 {totDiffCantidad} {totDiffCantidad === 1 ? "cantidad" : "cantidades"}</span>}
                    {totDiffPrecio    > 0 && <span>💰 {totDiffPrecio} {totDiffPrecio === 1 ? "precio" : "precios"}</span>}
                    {itemsNuevosCount > 0 && <span style={{ color: B.sky }}>➕ {itemsNuevosCount} item{itemsNuevosCount === 1 ? "" : "s"} nuevo{itemsNuevosCount === 1 ? "" : "s"}</span>}
                    {itemsNoFactCount > 0 && <span style={{ color: "#fca5a5" }}>⊘ {itemsNoFactCount} no facturado{itemsNoFactCount === 1 ? "" : "s"}</span>}
                  </div>
                </div>
                {totDiffNombres > 0 && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", maxWidth: 230, lineHeight: 1.4 }}>
                    Si el proveedor renombró un producto, usa el botón 🔄 para actualizar Atolón + Loggro.
                  </div>
                )}
              </div>
            )}

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
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => {
                    const motivo = window.prompt(
                      "Motivo del item nuevo (obligatorio):\n\n" +
                      "Este item llegó en la factura pero no estaba en la OC original. Explica por qué:\n" +
                      "• Proveedor incluyó producto extra\n" +
                      "• Cambio de producto solicitado\n" +
                      "• Muestra o degustación\n" +
                      "• Otro (especificar)"
                    );
                    if (!motivo || !motivo.trim()) return;
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
                        es_bonificacion: false, requiere_revision: true,
                        es_nuevo_oc: true, item_id: null,
                        motivo_manual: motivo.trim(),
                      }],
                    }));
                  }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 700, borderRadius: 6, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, cursor: "pointer", textTransform: "none" }}>
                    + ➕ Item nuevo
                  </button>
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
                    + 🎁 Bonificación
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
                            {/* Badge indicando origen del match con la OC.
                                Permite al operador saber si confiar (AI/barcode/ref) o revisar (heurístico por nombre). */}
                            {it.match_source && it.match_source !== "ai" && !it.es_nuevo_oc && (() => {
                              const isHeur = it.match_source.startsWith("heur_");
                              const source = isHeur ? it.match_source.slice(5).split("_")[0] : it.match_source;
                              const score = isHeur ? it.match_source.split("_").pop() : null;
                              const label = source === "barcode" ? "📊 BARCODE"
                                          : source === "ref" ? "📑 REF PROV"
                                          : source === "nombre" ? `🔎 NOMBRE ${score}%`
                                          : source;
                              const color = source === "barcode" || source === "ref" ? B.success : (Number(score) >= 80 ? B.success : B.warning);
                              return (
                                <span
                                  title={`Match heurístico (no AI): ${source}${score ? ` · score ${score}%` : ""}. Verifica que sea el item correcto.`}
                                  style={{ fontSize: 9, padding: "1px 6px", background: color + "22", color, borderRadius: 8, fontWeight: 700, border: `1px dashed ${color}66` }}>
                                  {label}
                                </span>
                              );
                            })()}
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
                          {/* ── Vínculo a Loggro + conversión de unidad ── */}
                          {(() => {
                            const loggroIng = it.loggro_id ? loggroCatMap[it.loggro_id] : null;
                            if (!it.loggro_id) {
                              const txt = (buscarLoggroTxt[i] || "").toLowerCase().trim();
                              const sugeridos = txt.length >= 2
                                ? loggroCatList
                                    .filter(x => (x.nombre || "").toLowerCase().includes(txt))
                                    .slice(0, 8)
                                : [];
                              return (
                                <div style={{ marginTop: 4, padding: "6px 8px", background: B.danger + "11", border: `1px dashed ${B.danger}66`, borderRadius: 6, fontSize: 10 }}>
                                  <div style={{ color: B.danger, fontWeight: 600, marginBottom: 5 }}>
                                    ⚠ Sin vincular a Loggro — no se cargará en Restobar
                                  </div>
                                  {/* Opción 1: dropdown con items de la OC (resueltos a Loggro) */}
                                  {ocItemsConLoggro.length > 0 ? (
                                    <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
                                        1️⃣ Vincular a item de esta OC ({ocItemsConLoggro.length}):
                                      </span>
                                      <select
                                        value=""
                                        onChange={e => {
                                          const sel = ocItemsConLoggro.find(x => x.resolved.loggro_id === e.target.value);
                                          if (sel) vincularAItemLoggro(i, {
                                            loggro_id: sel.resolved.loggro_id,
                                            id: sel.resolved.item_id,
                                            nombre: sel.resolved.nombre_catalogo || sel.ocIt.item || sel.ocIt.nombre,
                                          });
                                        }}
                                        style={{ ...IS, padding: "3px 6px", fontSize: 10, minWidth: 220 }}>
                                        <option value="">— elige item de la OC —</option>
                                        {ocItemsConLoggro.map((x, idx) => (
                                          <option key={x.resolved.loggro_id + "-" + idx} value={x.resolved.loggro_id}>
                                            {x.ocIt.item || x.ocIt.nombre} → {x.resolved.nombre_catalogo} ({x.resolved.unidad_catalogo || "?"})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : (
                                    (oc.items || []).length > 0 && (
                                      <div style={{ marginBottom: 6, padding: "3px 6px", fontSize: 10, color: B.warning, background: B.warning + "11", borderRadius: 4 }}>
                                        ⓘ Esta OC tiene {(oc.items || []).length} item(s) pero ninguno está mapeado a Loggro. Usa el buscador abajo.
                                      </div>
                                    )
                                  )}
                                  {/* Opción 2: buscador en catálogo Loggro completo */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ color: "rgba(255,255,255,0.6)" }}>2️⃣ O buscar en todo Loggro:</span>
                                    <input
                                      value={buscarLoggroTxt[i] || ""}
                                      onChange={e => setBuscarLoggroTxt(s => ({ ...s, [i]: e.target.value }))}
                                      placeholder="ej. queso mozarella…"
                                      style={{ ...IS, padding: "3px 6px", fontSize: 10, minWidth: 200, flex: 1 }} />
                                  </div>
                                  {sugeridos.length > 0 && (
                                    <div style={{ marginTop: 5, background: B.navy, borderRadius: 5, maxHeight: 160, overflowY: "auto" }}>
                                      {sugeridos.map(x => (
                                        <div key={x.id} onClick={() => vincularAItemLoggro(i, x)}
                                          style={{ padding: "5px 8px", fontSize: 10, color: "#fff", cursor: "pointer", borderBottom: `1px solid ${B.navyLight}` }}
                                          onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                          <span style={{ color: B.sand }}>{x.nombre}</span>
                                          <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>· {x.unidad || "?"} {x.categoria ? `· ${x.categoria}` : ""}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {txt.length >= 2 && sugeridos.length === 0 && (
                                    <div style={{ marginTop: 5, fontSize: 9, color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
                                      No hay coincidencias en el catálogo Loggro. Verifica el nombre o crea el ingrediente primero.
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            const unidadFactura = (it.unidad_individual || it.unidad_compra || "UND").toLowerCase();
                            const unidadLoggro  = (loggroIng?.unidad || "").toLowerCase() || unidadFactura;
                            const cantPack      = Number(it.cantidad_paquete ?? it.cantidad) || 0;
                            const unPorPack     = Math.max(1, Number(it.unidades_por_paquete) || 1);
                            const cantFactura   = cantPack * unPorPack;
                            const factor        = factorConversion(unidadFactura, unidadLoggro);
                            const cantLoggroAuto = factor != null ? cantFactura * factor : null;
                            // Si el operador editó manualmente, usar ese valor.
                            // Si no, usar la conversión auto (cuando existe).
                            // Si no hay conversión (ej. 1 UND → ?? Gr porque el salchichón
                            // pesa 1500 g por unidad), dejamos el campo en blanco — el
                            // operador escribe la cantidad real.
                            const cantLoggro    = it.loggro_qty_override != null
                              ? Number(it.loggro_qty_override)
                              : (cantLoggroAuto != null ? cantLoggroAuto : "");
                            const necesitaConversion = unidadFactura !== unidadLoggro && factor != null;
                            const sinConversionAuto = unidadFactura !== unidadLoggro && factor == null;
                            const requiereInput = sinConversionAuto && (it.loggro_qty_override == null);
                            return (
                              <div style={{ marginTop: 4, padding: "5px 8px", background: sinConversionAuto ? B.warning + "11" : B.sky + "08", border: `1px solid ${sinConversionAuto ? B.warning + "55" : B.sky + "33"}`, borderRadius: 6, fontSize: 10 }}>
                                <div style={{ color: B.sky, fontWeight: 600, marginBottom: 3, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <span>🔗 Loggro: <span style={{ color: "#fff" }}>{loggroIng?.nombre || "(no encontrado en catálogo)"}</span></span>
                                  <button
                                    onClick={() => {
                                      if (!window.confirm("¿Desvincular este item de Loggro? Podrás elegir otro.")) return;
                                      setData(d => ({
                                        ...d,
                                        items: d.items.map((p, j) => j === i ? {
                                          ...p,
                                          loggro_id: null,
                                          item_id: null,
                                          nombre_anterior: null,
                                          match_source: null,
                                          loggro_qty_override: null,
                                        } : p),
                                      }));
                                    }}
                                    title="Desvincular y elegir otro item de Loggro"
                                    style={{ background: "transparent", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.6)", borderRadius: 5, padding: "1px 7px", fontSize: 9, cursor: "pointer", whiteSpace: "nowrap" }}>
                                    ✕ cambiar
                                  </button>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", color: "rgba(255,255,255,0.7)" }}>
                                  <span>Factura: <b style={{ color: B.sand }}>{cantFactura} {unidadFactura}</b></span>
                                  <span style={{ color: necesitaConversion ? B.warning : sinConversionAuto ? B.warning : "rgba(255,255,255,0.4)" }}>→</span>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                    Restobar:
                                    <input type="number" value={cantLoggro}
                                      onChange={e => setItemField(i, "loggro_qty_override", e.target.value === "" ? null : Number(e.target.value))}
                                      placeholder={sinConversionAuto ? "?" : ""}
                                      style={{ ...IS, padding: "2px 5px", fontSize: 11, width: 90, textAlign: "right",
                                        borderColor: requiereInput ? B.warning : B.navyLight,
                                        color: requiereInput ? B.warning : "#fff" }} />
                                    <b style={{ color: B.sand }}>{unidadLoggro}</b>
                                  </span>
                                  {necesitaConversion && (
                                    <span style={{ color: B.warning, fontSize: 9 }}>(×{factor})</span>
                                  )}
                                  {it.loggro_qty_override != null && cantLoggroAuto != null && (
                                    <button onClick={() => setItemField(i, "loggro_qty_override", null)}
                                      title="Volver al cálculo automático"
                                      style={{ background: "transparent", border: `1px solid ${B.navyLight}`, color: "rgba(255,255,255,0.5)", borderRadius: 5, padding: "1px 6px", fontSize: 9, cursor: "pointer" }}>↺ auto</button>
                                  )}
                                </div>
                                {sinConversionAuto && (
                                  <div style={{ marginTop: 3, color: B.warning, fontSize: 9, fontWeight: 600 }}>
                                    ⚠ Sin conversión automática {unidadFactura} → {unidadLoggro}. Escribe cuánto entra a Loggro (ej. 1 salchichón = 1500 gr).
                                  </div>
                                )}
                              </div>
                            );
                          })()}
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
                    <td style={{ padding: "10px 8px", textAlign: "right", color: B.success, fontWeight: 800, fontSize: 14 }}>{COP(usarTotal)}</td>
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
              <button onClick={() => { setErr(""); setProgress(""); setStep(facturas.length > 0 ? "list" : "upload"); }} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
                {facturas.length > 0 ? "← Facturas" : "Cancelar"}
              </button>
              <button onClick={() => setStep("upload")} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.warning}`, background: B.warning + "22", color: B.warning, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
                ↺ Subir otro archivo
              </button>
              <button onClick={aplicar} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: B.success, color: B.navy, fontSize: 13, cursor: "pointer", fontWeight: 800 }}>
                {editingFacturaId ? "✓ Re-aplicar esta factura" : "✓ Aplicar esta factura"}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>
              Cada factura es independiente. Al aplicar: actualiza precios de OC, catálogo y proveedor con los items de ESTA factura.
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
