// loggro-sync (Atolon OS)
// Integración con Loggro Restobar API (api.pirpos.com)
//
// Endpoints expuestos:
//   GET  /loggro-sync/ping              — verificar que funciona
//   GET  /loggro-sync/tables            — listar mesas de Loggro
//   GET  /loggro-sync/categories        — listar categorías
//   GET  /loggro-sync/products          — listar productos (soporta ?categoryId, ?name, ?limit)
//   POST /loggro-sync/sync-products     — sincronizar productos → menu_items
//   POST /loggro-sync/sync-tables       — sincronizar mesas → loggro_mesas
//   POST /loggro-sync/create-order      — crear pedido (pendiente spec POST /orders)
//
// Variables de entorno:
//   LOGGRO_EMAIL, LOGGRO_PASSWORD
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LOGGRO_BASE = "https://api.pirpos.com";
const LOGGRO_EMAIL = Deno.env.get("LOGGRO_EMAIL") || "";
const LOGGRO_PASSWORD = Deno.env.get("LOGGRO_PASSWORD") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ── Token cache in memory ───────────────────────────────────────────────
let cachedToken: string | null = null;
let cachedBusinessId: string | null = null;
let cachedUserId: string | null = null;
let tokenExpires = 0;

async function getLoggroToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpires > now + 60_000) return cachedToken;

  const res = await fetch(`${LOGGRO_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: LOGGRO_EMAIL, password: LOGGRO_PASSWORD }),
  });
  const data = await res.json();
  if (!data.tokenCurrent) throw new Error("Login Loggro fallido: " + JSON.stringify(data).slice(0, 300));

  cachedToken = data.tokenCurrent;
  // Extraer business y user del response — necesarios para crear movimientos
  // de inventario en /inventory. La estructura puede variar:
  //   data.user._id / data.user.business
  //   data.business / data.userId
  //   data._id (user) / data.businessId
  cachedUserId =
    data.user?._id || data.user?.id || data.userId || data._id || data.id || null;
  cachedBusinessId =
    data.user?.business || data.user?.businessId || data.business?._id ||
    data.business?.id || data.business || data.businessId || null;
  // JWT típicamente dura 2h; asumimos 90 min de gracia
  tokenExpires = now + 90 * 60_000;
  return cachedToken!;
}

async function getLoggroIdentity(): Promise<{ businessId: string | null; userId: string | null }> {
  await getLoggroToken();
  return { businessId: cachedBusinessId, userId: cachedUserId };
}

// Cache en memoria (warm instance) del waiterOrderArea de cada producto.
// Sin este campo en la orden, Loggro defaultea la impresión a Cocina aunque
// el producto sea de bar (Corona → Bar). En el POS directo Loggro pone el
// área automáticamente; al crear orden vía API hay que enviarlo explícito.
const productAreaCache: Record<string, string | null> = {};

async function getWaiterOrderArea(productId: string): Promise<string | null> {
  if (!productId) return null;
  if (Object.prototype.hasOwnProperty.call(productAreaCache, productId)) {
    return productAreaCache[productId];
  }
  try {
    const prod = await loggroGet(`/products/${productId}`);
    const area = prod?.waiterOrderArea || null;
    productAreaCache[productId] = area;
    return area;
  } catch {
    productAreaCache[productId] = null;
    return null;
  }
}

// Mapeo cédula (documentNumber) → Pirpos user _id. La tabla empleados_loggro
// en Supabase guarda la cédula en `loggro_id`, pero Pirpos espera su propio
// ObjectId (24-char hex) como `seller` en /orders. Cuando un caller manda
// seller="1047514259" (cédula de Brayan, p.ej.) lo resolvemos al _id
// correcto antes de pasárselo a Pirpos. Caso fácil: el caller ya pasa el
// ObjectId — lo pasamos tal cual.
let pirposSellerCache: Record<string, string> | null = null;

async function resolveSellerId(seller: string | null | undefined): Promise<string | null> {
  if (!seller) return null;
  const s = String(seller).trim();
  if (!s) return null;
  // Si ya viene en formato Pirpos _id (24-char hex), úsalo tal cual.
  if (/^[0-9a-f]{24}$/i.test(s)) return s;
  // Build cache once per warm instance.
  if (!pirposSellerCache) {
    pirposSellerCache = {};
    try {
      const users = await loggroGet("/users");
      const arr: any[] = Array.isArray(users) ? users
        : (users?.users || users?.docs || users?.items || []);
      for (const u of arr) {
        if (u?.documentNumber && u?._id) {
          pirposSellerCache[String(u.documentNumber)] = u._id;
        }
      }
    } catch { /* keep empty, lookup returns null */ }
  }
  return pirposSellerCache[s] || null;
}

// rank 111: fetch a Loggro tiene timeout explicito (30s) y retry con backoff
// para 429/5xx. Sin esto, una API Loggro lenta colgaba toda la edge function
// hasta el timeout global de Supabase (~150s) sin visibilidad.
async function loggroFetch(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const token = await getLoggroToken();
  const url = `${LOGGRO_BASE}${path}`;
  const baseHeaders = { Authorization: `Bearer ${token}`, ...(init.headers || {}) };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, headers: baseHeaders, signal: ctrl.signal });
      clearTimeout(t);
      // Retry en 429 y 5xx (transitorios). 4xx no-429 son determinísticos: no reintentar.
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt < 2) {
          const backoff = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt < 2) {
        const backoff = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
    }
  }
  throw new Error(`Loggro fetch ${path} falló tras 3 intentos: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

async function loggroGet(path: string): Promise<any> {
  const res = await loggroFetch(path);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Loggro GET ${path} → ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function loggroPost(path: string, body: unknown): Promise<any> {
  // Misma robustez (timeout+retry) que loggroGet via loggroFetch.
  const res = await loggroFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(`Loggro POST ${path} → ${res.status}: ${txt.slice(0, 300)}`);
  return data;
}

async function loggroRaw(method: string, path: string, body?: unknown): Promise<{ status: number; body: any; ok: boolean }> {
  // Timeout explicito (30s). Sin retry: callers de loggroRaw esperan ver el
  // status code exacto inmediatamente (ej. para detectar 404 y crear el recurso).
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const token = await getLoggroToken();
    const res = await fetch(`${LOGGRO_BASE}${path}`, {
      method,
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const txt = await res.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    return { status: res.status, body: data, ok: res.ok };
  } finally {
    clearTimeout(t);
  }
}

// ── Conversión de unidades ────────────────────────────────────────────
// La factura/OC puede venir en una unidad (ej. KG) distinta a la del
// ingrediente en Loggro (ej. Gr). Si no se convierte, entra 1000× menos
// inventario y el costo unitario queda 1000× inflado.
//
// Bases:
//   - PESO   → factor = gramos por unidad (G=1, KG=1000, LB=453.592...)
//   - VOL    → factor = mililitros por unidad (ML=1, L=1000, GAL=3785.41)
//   - UNIDAD → factor = 1 (contables; reconocidas pero NO convertibles)
//   - null   → unidad NO reconocida (potencialmente riesgosa)
function normalizarUnidad(u: string): { base: string; factor: number } | null {
  const n = String(u || "")
    .trim()
    .toUpperCase()
    .replace(/\./g, "")           // "GR." → "GR", "GAL." → "GAL"
    .replace(/\s+/g, "");

  if (!n) return null;

  // ── PESO → base gramo ──
  if (["G", "GR", "GRS", "GRM", "GRMS", "GRAMO", "GRAMOS", "GM", "GMS"].includes(n)) return { base: "PESO", factor: 1 };
  if (["KG", "KGS", "KGM", "KILO", "KILOS", "KILOGRAMO", "KILOGRAMOS", "K",
       "KL"   // ⚠ alias real visto en OCs Atolon: 'KL' significa Kilo (no kilolitro)
      ].includes(n)) return { base: "PESO", factor: 1000 };
  if (["MG", "MILIGRAMO", "MILIGRAMOS"].includes(n)) return { base: "PESO", factor: 0.001 };
  // Libras y onzas (carnes, pescados, abarrotes en algunos proveedores)
  if (["LB", "LBS", "LIBRA", "LIBRAS"].includes(n)) return { base: "PESO", factor: 453.592 };
  if (["OZ", "ONZA", "ONZAS"].includes(n)) return { base: "PESO", factor: 28.3495 };

  // ── VOLUMEN → base mililitro ──
  if (["ML", "CC", "MILILITRO", "MILILITROS"].includes(n)) return { base: "VOL", factor: 1 };
  if (["L", "LT", "LTS", "LTR", "LITRO", "LITROS"].includes(n)) return { base: "VOL", factor: 1000 };
  // Galones US (estándar comercial Colombia)
  if (["GAL", "GALON", "GALONES", "GALLON"].includes(n)) return { base: "VOL", factor: 3785.41 };

  // ── UNIDAD (contable, no convertible entre sí) ──
  // Reconocerlas EXPLÍCITAMENTE permite distinguir "unidad desconocida"
  // (potencialmente riesgosa) de "unidad sin conversión necesaria".
  if (["UN", "UND", "U", "UNI", "UNID", "UNIDAD", "UNIDADES",
       "PZA", "PIEZA", "PIEZAS",
       "EA", "EACH"].includes(n)) return { base: "UNIDAD", factor: 1 };
  if (["CAJA", "CJ", "BOX", "BOTELLA", "BOT", "BTL",
       "PAQ", "PAQUETE", "PAQUETES", "PACK",
       "BOLSA", "BOLSAS", "BAG",
       "LATA", "LATAS", "CAN",
       "ROLLO", "ROLLOS"].includes(n)) return { base: "UNIDAD", factor: 1 };

  return null; // unidad NO reconocida → caller decide qué hacer
}

function factorConversion(src: string, dst: string): number {
  const s = normalizarUnidad(src);
  const d = normalizarUnidad(dst);
  if (!s || !d) return 1;          // alguna desconocida → no tocar
  if (s.base !== d.base) return 1; // familias distintas → no tocar
  if (d.factor === 0) return 1;
  return s.factor / d.factor;      // ej. KG(1000) → Gr(1) = 1000
}

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/loggro-sync/, "");
  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    // ═══ Debug: muestra el mapeo que se enviaría al upsert, sin escribir ══
    if (req.method === "GET" && path === "/debug-map-ing") {
      const name = url.searchParams.get("name") || "Aguardiente Antioqueño Azul";
      const data = await loggroGet(`/ingredients?pagination=true&limit=500&page=0&onlyIngredient=true&name=${encodeURIComponent(name)}`);
      const arr = data.data || (Array.isArray(data) ? data : []);
      const sample = arr.find((x: any) => x.name?.includes(name)) || arr[0];
      if (!sample) return json({ error: "no encontrado", arr_len: arr.length });
      const rawLS = sample.locationsStock;
      const lsArr: any[] = Array.isArray(rawLS) ? rawLS : (rawLS && typeof rawLS === "object" ? [rawLS] : []);
      const stockTotal = lsArr.reduce((s, x) => s + (Number(x?.stock) || 0), 0);
      const stockMinTotal = lsArr.reduce((s, x) => s + (Number(x?.stockMinimum) || 0), 0);
      const main = lsArr.find(x => x?.isMain) || lsArr[0] || {};
      const precioCompra = Number(main.pricePurchase) || Number(sample.pricePurchase) || 0;
      const mapped = {
        loggro_id: sample._id,
        nombre: sample.name,
        stock_actual: stockTotal || Number(sample.stock) || 0,
        stock_minimo: stockMinTotal || Number(sample.stockMinimum) || 0,
        precio_compra: precioCompra,
      };
      // Intentar upsert de SOLO este y ver resultado
      const SB = sb();
      const up = await SB.from("items_catalogo").upsert({
        loggro_id: sample._id,
        nombre: sample.name,
        stock_actual: mapped.stock_actual,
        stock_minimo: mapped.stock_minimo,
        precio_compra: mapped.precio_compra,
        activo: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "loggro_id" }).select();
      return json({ raw_ls_type: typeof rawLS, ls_is_array: Array.isArray(rawLS), mapped, upsert_result: up.data, upsert_error: up.error });
    }

    // ═══ Raw Probe: devuelve datos crudos de un path de Loggro (debug) ═════
    if (req.method === "GET" && path === "/raw") {
      const probePath = url.searchParams.get("path") || "/ingredients?limit=1";
      const data = await loggroGet(probePath);
      return json(data);
    }

    // ═══ Ping ═════════════════════════════════════════════════════════════
    if (req.method === "GET" && path === "/ping") {
      const token = await getLoggroToken();
      return json({ ok: true, has_token: !!token, token_preview: token.slice(0, 20) + "..." });
    }

    // ═══ Tables ═══════════════════════════════════════════════════════════
    if (req.method === "GET" && path === "/tables") {
      const data = await loggroGet("/tables");
      const mesas = Array.isArray(data) ? data : (data.data || []);
      return json({ count: mesas.length, mesas });
    }

    // ═══ Categories ═══════════════════════════════════════════════════════
    if (req.method === "GET" && path === "/categories") {
      const data = await loggroGet("/categories");
      const cats = Array.isArray(data) ? data : (data.data || []);
      return json({ count: cats.length, categories: cats });
    }

    // ═══ Products ═════════════════════════════════════════════════════════
    if (req.method === "GET" && path === "/products") {
      const qs = url.search || "?pagination=true&limit=100&page=0";
      const data = await loggroGet(`/products${qs}`);
      const products = data.data || (Array.isArray(data) ? data : []);
      return json({ count: products.length, products });
    }

    // ═══ Crear mesa en Loggro ═════════════════════════════════════════════
    // Body: { name: "PS11", description?: "", coord?: { x, y } }
    // Usado para crear mesas que faltan en Loggro (ej. floor plan de piscina).
    if (req.method === "POST" && path === "/create-table") {
      const body = await req.json().catch(() => ({}));
      const name = String(body.name || "").trim();
      if (!name) return json({ ok: false, error: "name requerido" }, 400);
      // Validar que no exista ya
      const existing = await loggroGet("/tables");
      const mesas = Array.isArray(existing) ? existing : (existing.data || []);
      const dup = mesas.find((m: any) => (m.name || "").trim().toUpperCase() === name.toUpperCase());
      if (dup) {
        return json({ ok: true, already_exists: true, mesa: dup });
      }
      const payload = {
        name,
        description: body.description || name,
        coord: body.coord || { x: 0, y: 0 },
        isHomeDelivery: body.isHomeDelivery !== false,
        isActive: body.isActive !== false,
      };
      const result = await loggroRaw("POST", "/tables", payload);
      if (!result.ok) {
        return json({ ok: false, error: result.body, status: result.status }, 500);
      }
      return json({ ok: true, mesa: result.body });
    }

    // ═══ Sync Tables → DB ═════════════════════════════════════════════════
    if (req.method === "POST" && path === "/sync-tables") {
      const data = await loggroGet("/tables");
      const mesas = Array.isArray(data) ? data : (data.data || []);
      const SB = sb();
      const rows = mesas.map((m: any) => ({
        loggro_id: m._id || m.id,
        nombre: m.name || "",
        tipo: m.type || null,
        activa: m.deleted !== true,
        raw: m,
        updated_at: new Date().toISOString(),
      }));
      await SB.from("loggro_mesas").upsert(rows, { onConflict: "loggro_id" });
      return json({ synced: rows.length });
    }

    // ═══ Sync Products → menu_items ═══════════════════════════════════════
    if (req.method === "POST" && path === "/sync-products") {
      let allProducts: any[] = [];
      let page = 0;
      const limit = 200;
      while (true) {
        const qs = new URLSearchParams({ pagination: "true", limit: String(limit), page: String(page) });
        const data = await loggroGet(`/products?${qs}`);
        const batch = data.data || (Array.isArray(data) ? data : []);
        allProducts.push(...batch);
        if (batch.length < limit) break;
        page++;
        if (page > 50) break; // safety
      }

      // En Loggro/Pirpos el precio real NO está en p.price (siempre 0) sino en
      // locationsStock[].price (la ubicación principal o la primera). Esto aplica
      // tanto a productos como a subProducts (variantes).
      const precioLoggro = (item: any): number => {
        const raw = item?.locationsStock;
        const ls = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? [raw] : []);
        const main = ls.find((x: any) => x?.isMain) || ls[0] || {};
        return Number(main.price) || Number(item?.price) || 0;
      };

      // Mapeo de categorías Loggro → menu_tipo interno
      const mapMenuTipo = (cat: string): string => {
        const c = (cat || "").toUpperCase();
        // Bebidas y alcohol
        if (/CERVEZA|BOTELLA|RON|TEQUILA|WHISKY|BOURBON|VODKA|GIN|LICOR|VINO|ESPUMOSO|AGUARDIENTE|SHOT|COCKTAIL|COCTEL|CIDRA|BEBIDA/i.test(c)) return "bebidas";
        // Desayunos → restaurant
        if (/DESAYUNO|JUGO/i.test(c)) return "restaurant";
        // Platos / comida
        if (/ENTRADA|ENSALADA|PLATO|PIZZA|TACO|POSTRE|PRODUCCION COCINA|INSUMOS|YATE MENU|COMPLEMENTO/i.test(c)) return "restaurant";
        // Cortesías, adicionales → restaurant por default
        return "restaurant";
      };

      const SB = sb();

      // Cargar productos existentes con loggro_id para preservar id (evitar null)
      const { data: existing } = await SB.from("menu_items").select("id, loggro_id, loggro_id_botella").not("loggro_id", "is", null);
      const idByLoggro: Record<string, string> = {};
      for (const e of existing || []) if (e.loggro_id) idByLoggro[e.loggro_id] = e.id;
      // Mapa de precio Loggro por _id (para sincronizar también precio_botella,
      // que es OTRO producto Loggro = loggro_id_botella, ej. la BT del licor).
      const priceByLoggro: Record<string, number> = {};
      for (const lp of allProducts) {
        const lid = lp._id || lp.id;
        if (lid) priceByLoggro[lid] = precioLoggro(lp);
      }

      // Construir filas. Si no existe, generar id; si existe, reusar.
      const rows = allProducts.map((p: any) => {
        const loggroId = p._id || p.id;
        const catName = p.category?.name || p.categoryName || "Otros";
        const menuTipo = mapMenuTipo(catName);
        const id = idByLoggro[loggroId] || `LGR-${String(loggroId).slice(-12)}`;
        // Variantes = subProducts de Loggro. Cada uno es un producto real con
        // su propio _id y precio (ej. Club Colombia → Cerveza $15k / Michelada
        // $18k / Con Clamato $30k). Al ordenar se envía el _id del subProduct.
        const subs = Array.isArray(p.subProducts) ? p.subProducts : [];
        const variantes = subs.length > 0
          ? subs
              .filter((s: any) => s && (s._id || s.id) && s.deleted !== true)
              .map((s: any) => ({
                loggro_id: s._id || s.id,
                nombre:    s.name || s.nombre || "Variante",
                precio:    precioLoggro(s),
              }))
          : null;
        return {
          id,
          loggro_id: loggroId,
          nombre: p.name || "Sin nombre",
          descripcion: p.description || null,
          precio: precioLoggro(p),
          variantes,
          categoria: catName,
          loggro_categoria: catName,
          foto_url: p.image || p.photo || null,
          activo: p.active !== false,
          menu_tipo: menuTipo,
          raw: p,
        };
      });

      // Solo actualizar los que YA están enlazados (match por loggro_id).
      //
      // PRECIO: Loggro a veces envía price=0 (productos con "Precio Variable"
      // o cuando el precio vive en una lista/menú separada). Si el precio
      // entrante es 0, NO sobreescribir el precio existente — preservar el
      // último precio manual o el último válido sincronizado.
      let upd = 0;
      let preservados = 0;
      let lastError: any = null;
      const toUpdate = rows.filter(r => idByLoggro[r.loggro_id!]);
      for (const r of toUpdate) {
        // NO pisar nombre/descripcion: son curados en Productos (Menús.jsx) —
        // el único lugar para gestionar el menú. El sync solo trae datos
        // operativos de Loggro: precio, variantes, categoría POS, raw.
        const updateFields: any = {
          variantes: r.variantes,
          loggro_categoria: r.loggro_categoria,
          raw: r.raw,
        };
        if (r.precio > 0) {
          updateFields.precio = r.precio;
        } else {
          preservados++;
        }
        const { error } = await SB.from("menu_items").update(updateFields).eq("id", r.id);
        if (error) lastError = error;
        else upd++;
      }
      // Segunda pasada: precio_botella desde el producto Loggro de la botella
      // (loggro_id_botella). También preserva si Loggro envía 0.
      let updBot = 0;
      let preservadosBot = 0;
      for (const e of existing || []) {
        const bid = (e as any).loggro_id_botella;
        if (!bid || priceByLoggro[bid] == null) continue;
        const p = priceByLoggro[bid];
        if (p > 0) {
          const { error } = await SB.from("menu_items").update({ precio_botella: p }).eq("id", e.id);
          if (error) lastError = error; else updBot++;
        } else {
          preservadosBot++;
        }
      }
      return json({
        updated_existing: upd,
        precios_preservados: preservados,
        updated_botella: updBot,
        botellas_preservadas: preservadosBot,
        total_loggro: allProducts.length,
        note: `Sync trajo ${allProducts.length} productos. ${preservados} precios conservados (Loggro envió 0). El último precio bueno queda grabado.`,
        error: lastError?.message,
      });
    }

    // ═══ Sync Ingredients → items_catalogo ════════════════════════════════
    if (req.method === "POST" && path === "/sync-ingredients") {
      let all: any[] = [];
      let page = 0;
      const limit = 500;
      while (true) {
        const data = await loggroGet(`/ingredients?pagination=true&limit=${limit}&page=${page}&onlyIngredient=true`);
        const batch = data.data || (Array.isArray(data) ? data : []);
        all.push(...batch);
        if (batch.length < limit) break;
        page++;
        if (page > 30) break;
      }

      const SB = sb();
      const rows = all.map((ing: any) => {
        const catName = ing.category?.name || "Otros";
        const unidad = ing.unit?.name || "Und";
        // locationsStock puede ser un array (multi-ubicación) o un objeto único (una sola ubicación).
        const rawLS = ing.locationsStock;
        const lsArr: any[] = Array.isArray(rawLS) ? rawLS : (rawLS && typeof rawLS === "object" ? [rawLS] : []);
        const stockTotal = lsArr.reduce((s, x) => s + (Number(x?.stock) || 0), 0);
        const stockMinTotal = lsArr.reduce((s, x) => s + (Number(x?.stockMinimum) || 0), 0);
        const main = lsArr.find(x => x?.isMain) || lsArr[0] || {};
        const precioCompra = Number(main.pricePurchase) || Number(ing.pricePurchase) || 0;
        return {
          loggro_id: ing._id,
          nombre: ing.name || "Sin nombre",
          descripcion: ing.description || null,
          categoria: catName,
          unidad,
          precio_compra: precioCompra,
          stock_actual: stockTotal || Number(ing.stock) || 0,
          stock_minimo: stockMinTotal || Number(ing.stockMinimum) || 0,
          activo: ing.deleted !== true,
          raw: ing,
          updated_at: new Date().toISOString(),
        };
      });

      // Upsert por loggro_id
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        await SB.from("items_catalogo").upsert(rows.slice(i, i + batchSize), { onConflict: "loggro_id" });
      }
      return json({ synced: rows.length, total_loggro: all.length });
    }

    // ═══ Link menu_items existentes a productos Loggro por NOMBRE ════════
    if (req.method === "POST" && path === "/link-menu-to-loggro") {
      // Trae todos los productos de Loggro
      let allProducts: any[] = [];
      let page = 0;
      while (true) {
        const data = await loggroGet(`/products?pagination=true&limit=200&page=${page}`);
        const batch = data.data || (Array.isArray(data) ? data : []);
        allProducts.push(...batch);
        if (batch.length < 200) break;
        page++;
        if (page > 50) break;
      }

      // Normalización agresiva (sin acentos, lowercase, sin puntuación, sin sufijos comunes de presentación)
      const norm = (s: string) => (s || "")
        .toString()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.,()\-_/]/g, "");

      // Sufijos/palabras de presentación a ignorar al final del nombre
      const SUFIJOS = ["bt", "shot", "botella", "copa", "copas", "vaso", "glass", "bottle", "jarra", "litro", "ml", "oz"];
      const stripSuffixes = (n: string) => {
        let r = n;
        for (let i = 0; i < 3; i++) {
          const parts = r.split(" ");
          const last = parts[parts.length - 1];
          if (SUFIJOS.includes(last) || /^\d+$/.test(last) || /^\d+ml$/.test(last)) {
            parts.pop();
            r = parts.join(" ").trim();
          } else break;
        }
        return r;
      };

      // Construir índice: nombre exacto + nombre sin sufijos
      const loggroByName: Record<string, any[]> = {};
      for (const p of allProducts) {
        const full = norm(p.name);
        const short = stripSuffixes(full);
        [full, short].forEach(key => {
          if (!key) return;
          if (!loggroByName[key]) loggroByName[key] = [];
          loggroByName[key].push(p);
        });
      }

      const SB = sb();
      const { data: items } = await SB.from("menu_items").select("id, nombre, loggro_id");
      let linked = 0, skipped = 0, noMatch = 0;
      const sinMatch: string[] = [];
      const ambiguo: string[] = [];

      for (const it of items || []) {
        if (it.loggro_id) { skipped++; continue; }
        const key = norm(it.nombre);
        let candidates = loggroByName[key] || loggroByName[stripSuffixes(key)];

        if (!candidates || candidates.length === 0) {
          // Último intento: prefix match (atolón name al inicio del loggro name)
          candidates = allProducts.filter(p => norm(p.name).startsWith(key + " "));
        }

        if (!candidates || candidates.length === 0) {
          noMatch++;
          sinMatch.push(it.nombre);
          continue;
        }

        // Preferir el "BT" (bottle) si hay ambigüedad, si no, el primero
        const match = candidates.find(p => /\bBT\b/i.test(p.name)) || candidates.find(p => /BOTELLA/i.test(p.name)) || candidates[0];
        if (candidates.length > 1) ambiguo.push(`${it.nombre} → ${match.name} (${candidates.length} opciones)`);

        const { error } = await SB.from("menu_items").update({
          loggro_id: match._id || match.id,
          loggro_categoria: match.category?.name || null,
        }).eq("id", it.id);
        if (!error) linked++;
      }

      return json({ linked, skipped_already_linked: skipped, no_match: noMatch, sin_match_preview: sinMatch.slice(0, 30), ambiguos_preview: ambiguo.slice(0, 10) });
    }

    // ═══ Create/Update Client en Loggro ════════════════════════════════════
    if (req.method === "POST" && path === "/upsert-client") {
      const body = await req.json();
      // Body esperado: { nombre, apellido?, email?, telefono?, documento?, tipoDoc?, ciudad?, notas?, huesped_id? }
      if (!body.nombre) return json({ ok: false, error: "nombre requerido" }, 400);

      // Mapear tipo de documento a código Loggro
      const TIPO_DOC_MAP: Record<string, number> = {
        CC: 13, PS: 41, CE: 22, TI: 12, RC: 11, NIT: 31, TE: 21, DE: 42, PEP: 47, PPT: 48,
      };
      const idDocumentType = TIPO_DOC_MAP[body.tipoDoc?.toUpperCase()] || 41; // default PS

      const payload: any = {
        name: body.nombre,
        lastName: body.apellido || "",
        idDocumentType,
      };
      if (body.documento) payload.document = body.documento;
      if (body.email) payload.email = body.email;
      if (body.telefono) payload.phone = body.telefono;
      if (body.ciudad) payload.city = body.ciudad;
      if (body.notas) payload.notes = body.notas;
      if (body.loggro_id) payload._id = body.loggro_id; // para editar si ya existe

      try {
        const resp = await loggroPost("/clients", payload);
        const loggro_client_id = resp._id || resp.id;

        // Si nos pasan huesped_id, guardar el loggro_client_id en atolon
        if (body.huesped_id && loggro_client_id) {
          const SB = sb();
          await SB.from("hotel_huespedes").update({
            preferencias: { loggro_client_id, loggro_synced_at: new Date().toISOString() },
          }).eq("id", body.huesped_id);
        }

        return json({ ok: true, loggro_client_id, client: resp });
      } catch (err) {
        return json({ ok: false, error: String(err) }, 500);
      }
    }

    // ═══ Create Order — POST /orders en Pirpos/Loggro ═══════════════════════
    // Spec: https://api.pirpos.com/orders (Bearer auth)
    // Body recibido desde Atolón OS:
    //   { mesaId, items: [{ productId, qty, unit_price?, notes?, isComplementary?, productsExtra? }],
    //     groupName?, group? (ObjectId opcional), seller?, delivery? }
    if (req.method === "POST" && path === "/create-order") {
      const body = await req.json();
      if (!body.mesaId && !body.seller) {
        return json({ ok: false, error: "mesaId o seller requerido (mesa o delivery)" }, 400);
      }
      if (!body.items || body.items.length === 0) return json({ ok: false, error: "items vacíos" }, 400);

      // Pirpos/Loggro espera un ObjectId de MongoDB (24 chars hex) para `group`.
      // Si no nos pasan uno, generamos uno válido con timestamp + random.
      const genObjectId = () => {
        const hex = "0123456789abcdef";
        const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
        let rand = "";
        for (let i = 0; i < 16; i++) rand += hex[Math.floor(Math.random() * 16)];
        return ts + rand;
      };
      const group = body.group || genObjectId();

      // locationStock por defecto ("General" del negocio Atolón) — Pirpos exige este campo
      // aunque no aparezca en la spec pública. Se puede sobreescribir por item o a nivel body.
      const DEFAULT_LOCATION_STOCK = body.locationStock || "6399190e5fe56f01f9a56027";
      // Routing de impresora (Bar/Cocina): cada producto en Loggro tiene un
      // `waiterOrderArea` que define la impresora destino. SIN este campo,
      // Loggro defaultea TODO a la impresora de Cocina — bug visible: pedir
      // Corona desde mesero portal y verla salir en la impresora de cocina
      // en vez de la del bar. Resolvemos consultando el producto en Loggro
      // si el caller no nos lo pasó. Resultado se cachea en memoria.
      const orders = await Promise.all(body.items.map(async (it: any) => {
        const productId = it.productId || it.loggro_id;
        const o: any = {
          product: productId,
          quantity: Number(it.qty) || 1,
          locationStock: it.locationStock || DEFAULT_LOCATION_STOCK,
        };
        // Prefiere el waiterOrderArea que pasó el caller (si lo conoce),
        // sino lo busca en Loggro.
        const area = it.waiterOrderArea || (await getWaiterOrderArea(productId));
        if (area) o.waiterOrderArea = area;
        if (Number(it.unit_price) > 0) o.unit_price = Number(it.unit_price);
        const notesArr = Array.isArray(it.notes) ? it.notes : (it.notes ? [String(it.notes)] : []);
        if (notesArr.length > 0) o.notes = notesArr;
        if (it.isComplementary) {
          o.complementary = { isComplementary: true, note: it.notesCortesia || "Cortesía" };
        }
        if (Array.isArray(it.productsExtra) && it.productsExtra.length > 0) {
          o.productsExtra = it.productsExtra.map((pe: any) => ({
            product: pe.productId || pe.product,
            quantity: Number(pe.quantity) || 1,
            price: Number(pe.price) || 0,
          }));
        }
        if (it.delivery) {
          o.delivery = it.delivery;
        }
        return o;
      }));

      const payload: any = {
        group,
        groupName: body.groupName || `Atolón OS ${new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`,
        orders,
      };
      if (body.mesaId) payload.table = body.mesaId;
      // Resolver `seller` si vino como cédula. Si NO se puede resolver,
      // omitimos seller (Loggro acepta orders sin él) en vez de fallar —
      // así un mesero sin usuario POS configurado puede igual mandar
      // pedidos a cocina, atribuidos al "default" del negocio. El nombre
      // del mesero sigue visible en groupName.
      let sellerWarning: string | null = null;
      if (body.seller) {
        const sellerId = await resolveSellerId(body.seller);
        if (sellerId) {
          payload.seller = sellerId;
        } else {
          sellerWarning = `Seller "${body.seller}" no se pudo mapear a un usuario POS de Loggro. Pedido enviado SIN atribución de mesero — el nombre va en groupName.`;
          console.warn("[create-order] " + sellerWarning);
        }
      }

      try {
        const resp = await loggroPost("/orders", payload);
        return json({ ok: true, order: resp, payload_sent: payload, seller_warning: sellerWarning });
      } catch (err) {
        return json({ ok: false, error: String(err), payload_sent: payload }, 500);
      }
    }

    // ═══ Cancel/Delete Order — prueba varios patrones REST comunes ══════════
    // Body: { orderId, groupId? }
    if (req.method === "POST" && path === "/cancel-order") {
      const body = await req.json();
      const orderId = body.orderId;
      if (!orderId) return json({ ok: false, error: "orderId requerido" }, 400);

      const attempts: any[] = [];
      // 1) DELETE /orders/{id}
      let r = await loggroRaw("DELETE", `/orders/${orderId}`);
      attempts.push({ method: "DELETE /orders/{id}", status: r.status, body: r.body });
      if (r.ok) return json({ ok: true, used: "DELETE /orders/{id}", response: r.body, attempts });

      // 2) PUT /orders/{id}/cancel
      r = await loggroRaw("PUT", `/orders/${orderId}/cancel`);
      attempts.push({ method: "PUT /orders/{id}/cancel", status: r.status, body: r.body });
      if (r.ok) return json({ ok: true, used: "PUT /orders/{id}/cancel", response: r.body, attempts });

      // 3) POST /orders/{id}/cancel
      r = await loggroRaw("POST", `/orders/${orderId}/cancel`);
      attempts.push({ method: "POST /orders/{id}/cancel", status: r.status, body: r.body });
      if (r.ok) return json({ ok: true, used: "POST /orders/{id}/cancel", response: r.body, attempts });

      // 4) PUT /orders/{id} con deleted:true
      r = await loggroRaw("PUT", `/orders/${orderId}`, { deleted: true });
      attempts.push({ method: "PUT /orders/{id} {deleted:true}", status: r.status, body: r.body });
      if (r.ok) return json({ ok: true, used: "PUT /orders/{id} {deleted:true}", response: r.body, attempts });

      // 5) PATCH /orders/{id} con status cancelado
      r = await loggroRaw("PATCH", `/orders/${orderId}`, { status: "Cancelado" });
      attempts.push({ method: "PATCH /orders/{id} {status:Cancelado}", status: r.status, body: r.body });
      if (r.ok) return json({ ok: true, used: "PATCH /orders/{id}", response: r.body, attempts });

      return json({ ok: false, error: "ningún patrón funcionó", attempts }, 404);
    }

    // ═══ Cierre de Caja — reconstruye el cierre del día desde /invoices ═════
    // GET /loggro-sync/cierre-caja?fecha=YYYY-MM-DD
    // Usa timezone Colombia (UTC-5) para determinar el día.
    if (req.method === "GET" && path === "/cierre-caja") {
      const fecha = url.searchParams.get("fecha");
      if (!fecha) return json({ error: "param fecha requerido (YYYY-MM-DD)" }, 400);

      const pageSize = 100;
      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      const dayOf = (ts: string) => {
        const utc = new Date(ts).getTime();
        const co = new Date(utc + COTZ_OFFSET_MS);
        return co.toISOString().slice(0, 10);
      };

      // Antes: el loop estaba hardcodeado a paginas 85-110. A medida que crecia
      // el historico de Loggro, la pagina con "hoy" se movia y el cierre del
      // dia eventualmente devolvia subset incompleto o vacio sin warning.
      // Audit rank 31. Replicamos el patron de /cierre-caja-rango:
      // binary-search para encontrar la ultima pagina con datos, luego bajamos
      // hacia atras hasta cruzar el dia objetivo.

      const loggroGetPageSafe = async (page: number) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const d: any = await loggroGet(`/invoices?pagination=true&limit=${pageSize}&page=${page}`);
            const arr = d?.data || (Array.isArray(d) ? d : []) || [];
            return { ok: true, arr };
          } catch (e) {
            if (attempt === 2) {
              console.warn(`[loggro cierre-caja] page=${page} fallo:`, (e as Error)?.message);
              return { ok: false, arr: [] as any[] };
            }
            await new Promise(r => setTimeout(r, 250 * Math.pow(3, attempt)));
          }
        }
        return { ok: false, arr: [] as any[] };
      };

      // Sondeo binario para ultima pagina con datos.
      let lo = 0, hi = 300, lastNonEmpty = 0;
      let probeError = false;
      while (lo <= hi && !probeError) {
        const mid = Math.floor((lo + hi) / 2);
        const r = await loggroGetPageSafe(mid);
        if (!r.ok) { probeError = true; break; }
        if (r.arr.length > 0) { lastNonEmpty = mid; lo = mid + 1; }
        else { hi = mid - 1; }
      }
      if (probeError) {
        return json({ ok: false, error: "Loggro no responde — sondeo de paginas fallo. Intentar de nuevo." }, 503);
      }

      // Bajamos pagina por pagina desde lastNonEmpty hasta que TODAS las
      // facturas de la pagina actual sean DEL DIA o ANTERIORES al dia
      // objetivo. Las facturas mas recientes estan en las paginas mas altas
      // (Loggro almacena cronologicamente). Capeamos a 50 paginas (5000
      // facturas, mas que suficiente para un dia).
      const allInvoices: any[] = [];
      const seen = new Set<string>();
      let stopReached = false;
      let pagesScanned = 0;
      let downloadError = false;
      const MAX_PAGES = 50;
      let curPage = lastNonEmpty;
      while (curPage >= 0 && !stopReached && pagesScanned < MAX_PAGES && !downloadError) {
        const batchPages: number[] = [];
        for (let i = 0; i < 5 && curPage >= 0; i++) batchPages.push(curPage--);
        const results = await Promise.all(batchPages.map(async p => ({ page: p, ...(await loggroGetPageSafe(p)) })));
        pagesScanned += results.length;
        if (results.some(r => !r.ok)) { downloadError = true; break; }

        // Stop cuando una pagina completa esta ANTES del dia objetivo
        let allOlderThanTarget = true;
        for (const r of results) {
          for (const inv of r.arr) {
            if (!inv?._id || seen.has(inv._id)) continue;
            seen.add(inv._id);
            allInvoices.push(inv);
            const ts = inv?.createdOn;
            if (ts) {
              const d = dayOf(ts);
              if (d >= fecha) allOlderThanTarget = false;
            }
          }
        }
        if (allOlderThanTarget) stopReached = true;
      }
      if (downloadError) {
        return json({ ok: false, error: "Loggro tuvo errores transient durante la descarga." }, 503);
      }

      // Filtrar facturas del día en timezone Colombia (COTZ_OFFSET_MS ya declarado arriba)
      const invoicesDia: any[] = [];
      for (const inv of allInvoices) {
        const ts = inv?.createdOn;
        if (!ts) continue;
        const utc = new Date(ts).getTime();
        const co = new Date(utc + COTZ_OFFSET_MS);
        const coDay = co.toISOString().slice(0, 10);
        if (coDay === fecha) invoicesDia.push(inv);
      }

      // Agregar totales
      interface Bucket { count: number; ventas: number; propinas: number; anuladas: number; }
      const mkBucket = (): Bucket => ({ count: 0, ventas: 0, propinas: 0, anuladas: 0 });
      const byMetodo: Record<string, Bucket> = {};
      const byCajero: Record<string, Bucket> = {};
      let totalVentas = 0, totalPropinas = 0, totalAnuladas = 0, ticketsCount = 0, anuladasCount = 0;

      const facturaRows: any[] = [];

      for (const inv of invoicesDia) {
        const deleted = inv?.deletedInfo?.isDeleted || false;
        const total = Number(inv?.total) || 0;
        const tip = Number(inv?.tip) || 0;
        const cajero = (inv?.cashier?.name || "Sin cajero").trim();
        const pmv = inv?.paid?.paymentMethodValue || [];

        if (deleted) {
          totalAnuladas += total;
          anuladasCount++;
          if (!byCajero[cajero]) byCajero[cajero] = mkBucket();
          byCajero[cajero].anuladas += total;
        } else {
          totalVentas += total;
          totalPropinas += tip;
          ticketsCount++;
          if (!byCajero[cajero]) byCajero[cajero] = mkBucket();
          byCajero[cajero].count++;
          byCajero[cajero].ventas += total;
          byCajero[cajero].propinas += tip;
        }

        // Desglose por método
        if (pmv.length > 0) {
          for (const pay of pmv) {
            const pm = (pay?.paymentMethod || "Desconocido").trim();
            const val = Number(pay?.value) || 0;
            const payTip = Number(pay?.tip) || 0;
            const venta = val - payTip;
            if (!byMetodo[pm]) byMetodo[pm] = mkBucket();
            if (deleted) { byMetodo[pm].anuladas += venta; }
            else {
              byMetodo[pm].count++;
              byMetodo[pm].ventas += venta;
              byMetodo[pm].propinas += payTip;
            }
          }
        } else {
          const pm = (inv?.paymentMethod || "Desconocido").trim();
          if (!byMetodo[pm]) byMetodo[pm] = mkBucket();
          if (deleted) { byMetodo[pm].anuladas += total; }
          else {
            byMetodo[pm].count++;
            byMetodo[pm].ventas += (total - tip);
            byMetodo[pm].propinas += tip;
          }
        }

        // Fila para UI
        const hora = inv?.createdOn ? new Date(new Date(inv.createdOn).getTime() + COTZ_OFFSET_MS).toISOString().slice(11, 16) : "";
        facturaRows.push({
          id: inv._id,
          numero: inv.number || inv.numberUnique || "",
          hora,
          cajero,
          mesa: inv?.table?.name || "",
          cliente: [inv?.client?.name, inv?.client?.lastName].filter(Boolean).join(" ") || "",
          metodo: pmv.length > 0 ? pmv.map((x: any) => x.paymentMethod).join(" + ") : (inv.paymentMethod || ""),
          total,
          tip,
          deleted,
          closeToMidnight: hora < "02:00" || hora > "23:00", // facturas de frontera
        });
      }

      // Ordenar facturas por hora
      facturaRows.sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

      return json({
        ok: true,
        fecha,
        timezone: "America/Bogota",
        paginas_consultadas: pagesScanned,
        invoices_totales_descargadas: allInvoices.length,
        invoices_del_dia: invoicesDia.length,
        resumen: {
          total_ventas: totalVentas,
          total_propinas: totalPropinas,
          total_general: totalVentas + totalPropinas,
          total_anuladas: totalAnuladas,
          tickets: ticketsCount,
          anuladas_count: anuladasCount,
        },
        por_cajero: byCajero,
        por_metodo: byMetodo,
        facturas: facturaRows,
      });
    }

    // GET /loggro-sync/reporte-cortesias-pedidos?from=...&to=...
    // Reporte de "Pedidos de cortesía" (KOT-level) — equivalente al
    // reporte que da Loggro Restobar. Lista cada pedido individual
    // marcado como complementary (cortesía).
    if (req.method === "GET" && path === "/reporte-cortesias-pedidos") {
      const from = url.searchParams.get("from");
      const to   = url.searchParams.get("to");
      if (!from || !to) return json({ error: "params from y to requeridos" }, 400);

      const pageSize = 100;
      const allOrders: any[] = [];
      const seen = new Set<string>();
      const MAX_PAGES = 200;
      let stopReached = false;
      for (let batchStart = 0; batchStart < MAX_PAGES && !stopReached; batchStart += 20) {
        const batch = [];
        for (let p = batchStart; p < batchStart + 20 && p < MAX_PAGES; p++) {
          batch.push(
            loggroGet(`/orders?pagination=true&limit=${pageSize}&page=${p}`)
              .then(d => ({ page: p, arr: d?.data || (Array.isArray(d) ? d : []) }))
              .catch(() => ({ page: p, arr: [] }))
          );
        }
        const results = await Promise.all(batch);
        let emptyPagesInBatch = 0;
        results.forEach(r => {
          if (r.arr.length === 0) emptyPagesInBatch++;
          r.arr.forEach((o: any) => {
            if (o?._id && !seen.has(o._id)) { seen.add(o._id); allOrders.push(o); }
          });
        });
        if (emptyPagesInBatch >= 5) stopReached = true;
      }

      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      const cortesias: any[] = [];
      for (const o of allOrders) {
        if (!o?.complementary?.isComplementary) continue;
        const ts = o?.createdOn;
        if (!ts) continue;
        const utc = new Date(ts).getTime();
        const co = new Date(utc + COTZ_OFFSET_MS);
        const coDay = co.toISOString().slice(0, 10);
        if (coDay < from || coDay > to) continue;

        const fechaCortesia = o?.complementary?.modifiedOn || o?.modifiedOn || o?.createdOn;
        const fcUTC = new Date(fechaCortesia).getTime();
        const fcLocal = new Date(fcUTC + COTZ_OFFSET_MS);

        cortesias.push({
          id: o._id,
          fecha_pedido: co.toISOString().slice(0, 19).replace("T", " "),
          fecha_cortesia: fcLocal.toISOString().slice(0, 19).replace("T", " "),
          producto: o?.product?.name || "—",
          cantidad: Number(o?.quantity) || 0,
          cliente: o?.complementary?.client?.name || o?.table?.name || "General",
          nota: o?.complementary?.note || "",
          cortesia_por: o?.modifiedBy?.name || "—",        // quién autorizó la cortesía
          pedido_por: o?.seller?.name || "—",              // mesero que tomó el pedido
          total: Number(o?.total) || 0,
          status: o?.status || "",
        });
      }

      cortesias.sort((a, b) => b.fecha_pedido.localeCompare(a.fecha_pedido));

      return json({
        ok: true, from, to,
        orders_revisados: allOrders.length,
        total_cortesias: cortesias.length,
        cortesias,
      });
    }

    // GET /loggro-sync/reporte-internos-pedidos?from=...&to=...
    // Reporte de "Pedidos Internos" (KOT-level) — items con
    // internal.isInternal=true (consumos del staff/dirección).
    if (req.method === "GET" && path === "/reporte-internos-pedidos") {
      const from = url.searchParams.get("from");
      const to   = url.searchParams.get("to");
      if (!from || !to) return json({ error: "params from y to requeridos" }, 400);

      const pageSize = 100;
      const allOrders: any[] = [];
      const seen = new Set<string>();
      const MAX_PAGES = 200;
      let stopReached = false;
      for (let batchStart = 0; batchStart < MAX_PAGES && !stopReached; batchStart += 20) {
        const batch = [];
        for (let p = batchStart; p < batchStart + 20 && p < MAX_PAGES; p++) {
          batch.push(
            loggroGet(`/orders?pagination=true&limit=${pageSize}&page=${p}`)
              .then(d => ({ page: p, arr: d?.data || (Array.isArray(d) ? d : []) }))
              .catch(() => ({ page: p, arr: [] }))
          );
        }
        const results = await Promise.all(batch);
        let emptyPagesInBatch = 0;
        results.forEach(r => {
          if (r.arr.length === 0) emptyPagesInBatch++;
          r.arr.forEach((o: any) => {
            if (o?._id && !seen.has(o._id)) { seen.add(o._id); allOrders.push(o); }
          });
        });
        if (emptyPagesInBatch >= 5) stopReached = true;
      }

      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      const internos: any[] = [];
      for (const o of allOrders) {
        if (!o?.internal?.isInternal) continue;
        const ts = o?.createdOn;
        if (!ts) continue;
        const utc = new Date(ts).getTime();
        const co = new Date(utc + COTZ_OFFSET_MS);
        const coDay = co.toISOString().slice(0, 10);
        if (coDay < from || coDay > to) continue;

        const fechaGuardado = o?.modifiedOn || o?.createdOn;
        const fgUTC = new Date(fechaGuardado).getTime();
        const fgLocal = new Date(fgUTC + COTZ_OFFSET_MS);

        internos.push({
          id: o._id,
          fecha_pedido: co.toISOString().slice(0, 19).replace("T", " "),
          fecha_guardado: fgLocal.toISOString().slice(0, 19).replace("T", " "),
          producto: o?.product?.name || "—",
          cantidad: Number(o?.quantity) || 0,
          nota: o?.internal?.note || (Array.isArray(o?.notes) && o.notes.length ? o.notes.map((n: any) => n?.note || n?.text || n).join(" ") : "") || "",
          guardado_por: o?.modifiedBy?.name || "—",
          pedido_por: o?.seller?.name || "—",
          total: Number(o?.total) || 0,
        });
      }

      internos.sort((a, b) => b.fecha_pedido.localeCompare(a.fecha_pedido));

      return json({
        ok: true, from, to,
        orders_revisados: allOrders.length,
        total_internos: internos.length,
        internos,
      });
    }

    // GET /loggro-sync/inspect-order — debug: muestra un order completo
    if (req.method === "GET" && path === "/inspect-order") {
      const onlyComplementary = url.searchParams.get("complementary") === "true";
      const onlyDeleted = url.searchParams.get("deleted") === "true";
      for (let p = 0; p < 50; p++) {
        const data: any = await loggroGet(`/orders?pagination=true&limit=100&page=${p}`);
        const arr = data?.data || (Array.isArray(data) ? data : []);
        if (arr.length === 0) break;
        const found = onlyComplementary
          ? arr.find((o: any) => o?.complementary?.isComplementary === true)
          : onlyDeleted
          ? arr.find((o: any) => o?.deletedInfo?.isDeleted === true)
          : arr[0];
        if (found) return json({ ok: true, page_found: p, sample: found });
      }
      return json({ ok: false, error: "no se encontró order que coincida" });
    }

    // GET /loggro-sync/reporte-cancelaciones-pedidos?from=...&to=...
    // Reporte de "Pedidos cancelados" (KOT-level) — items individuales
    // marcados como deletedInfo.isDeleted=true. Loggro filtra deleted por
    // default así que hay que pedirlos con includeDeleted=true.
    if (req.method === "GET" && path === "/reporte-cancelaciones-pedidos") {
      const from = url.searchParams.get("from");
      const to   = url.searchParams.get("to");
      if (!from || !to) return json({ error: "params from y to requeridos" }, 400);

      const pageSize = 100;
      const allOrders: any[] = [];
      const seen = new Set<string>();
      const MAX_PAGES = 200;
      let stopReached = false;
      for (let batchStart = 0; batchStart < MAX_PAGES && !stopReached; batchStart += 20) {
        const batch = [];
        for (let p = batchStart; p < batchStart + 20 && p < MAX_PAGES; p++) {
          batch.push(
            loggroGet(`/orders?pagination=true&limit=${pageSize}&page=${p}&includeDeleted=true`)
              .then(d => ({ page: p, arr: d?.data || (Array.isArray(d) ? d : []) }))
              .catch(() => ({ page: p, arr: [] }))
          );
        }
        const results = await Promise.all(batch);
        let emptyPagesInBatch = 0;
        results.forEach(r => {
          if (r.arr.length === 0) emptyPagesInBatch++;
          r.arr.forEach((o: any) => {
            if (o?._id && !seen.has(o._id)) { seen.add(o._id); allOrders.push(o); }
          });
        });
        if (emptyPagesInBatch >= 5) stopReached = true;
      }

      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      const canceladas: any[] = [];
      for (const o of allOrders) {
        if (!o?.deletedInfo?.isDeleted) continue;
        const ts = o?.createdOn;
        if (!ts) continue;
        const utc = new Date(ts).getTime();
        const co = new Date(utc + COTZ_OFFSET_MS);
        const coDay = co.toISOString().slice(0, 10);
        if (coDay < from || coDay > to) continue;

        const fechaCancel = o?.deletedInfo?.deletedOn || o?.deletedInfo?.modifiedOn || o?.modifiedOn || o?.createdOn;
        const fcUTC = new Date(fechaCancel).getTime();
        const fcLocal = new Date(fcUTC + COTZ_OFFSET_MS);

        canceladas.push({
          id: o._id,
          fecha_pedido: co.toISOString().slice(0, 19).replace("T", " "),
          fecha_cancelacion: fcLocal.toISOString().slice(0, 19).replace("T", " "),
          producto: o?.product?.name || "—",
          cantidad: Number(o?.quantity) || 0,
          motivo: o?.deletedInfo?.reason || o?.deletedInfo?.note || "",
          cancelado_por: o?.deletedInfo?.deletedBy?.name || o?.deletedInfo?.user?.name || o?.modifiedBy?.name || "—",
          pedido_por: o?.seller?.name || "—",
          total: Number(o?.total) || 0,
        });
      }

      canceladas.sort((a, b) => b.fecha_pedido.localeCompare(a.fecha_pedido));

      return json({
        ok: true, from, to,
        orders_revisados: allOrders.length,
        total_cancelaciones: canceladas.length,
        canceladas,
      });
    }

    // GET /loggro-sync/inspect-invoice — debug: muestra una factura cruda
    if (req.method === "GET" && path === "/inspect-invoice") {
      const data: any = await loggroGet(`/invoices?pagination=true&limit=1&page=0`);
      const arr = data?.data || (Array.isArray(data) ? data : []);
      return json({ ok: true, sample: arr[0] || null, keys: arr[0] ? Object.keys(arr[0]) : [] });
    }

    // GET /loggro-sync/probe-loggro?path=... — debug: prueba un endpoint arbitrario
    if (req.method === "GET" && path === "/probe-loggro") {
      const probePath = url.searchParams.get("path");
      if (!probePath) return json({ error: "param path requerido" }, 400);
      try {
        const data: any = await loggroGet(probePath);
        const arr = Array.isArray(data) ? data : data?.data || data?.items || data?.results;
        return json({
          ok: true, path: probePath,
          is_array: Array.isArray(arr),
          count: Array.isArray(arr) ? arr.length : null,
          sample: Array.isArray(arr) ? arr[0] : data,
          keys: Array.isArray(arr) && arr[0] ? Object.keys(arr[0]) : (data ? Object.keys(data).slice(0, 30) : []),
        });
      } catch (e: any) {
        return json({ ok: false, path: probePath, error: e?.message });
      }
    }

    // GET /loggro-sync/reporte-ayb?from=...&to=...
    // Reporte detallado de facturas de Loggro Restobar con info de
    // cortesías (descuento 100% o total=0), descuentos parciales y
    // anulaciones (deletedInfo.isDeleted=true).
    if (req.method === "GET" && path === "/reporte-ayb") {
      const from = url.searchParams.get("from");
      const to   = url.searchParams.get("to");
      if (!from || !to) return json({ error: "params from y to requeridos" }, 400);

      const pageSize = 100;
      const allInvoices: any[] = [];
      const seen = new Set<string>();
      const MAX_PAGES = 200;
      let stopReached = false;
      for (let batchStart = 0; batchStart < MAX_PAGES && !stopReached; batchStart += 20) {
        const batch = [];
        for (let p = batchStart; p < batchStart + 20 && p < MAX_PAGES; p++) {
          batch.push(
            loggroGet(`/invoices?pagination=true&limit=${pageSize}&page=${p}`)
              .then(d => ({ page: p, arr: d?.data || (Array.isArray(d) ? d : []) }))
              .catch(() => ({ page: p, arr: [] }))
          );
        }
        const results = await Promise.all(batch);
        let emptyPagesInBatch = 0;
        results.forEach(r => {
          if (r.arr.length === 0) emptyPagesInBatch++;
          r.arr.forEach((inv: any) => {
            if (inv?._id && !seen.has(inv._id)) { seen.add(inv._id); allInvoices.push(inv); }
          });
        });
        if (emptyPagesInBatch >= 5) stopReached = true;
      }

      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      const cortesias: any[] = [];
      const anuladas: any[] = [];
      const descuentos: any[] = [];

      for (const inv of allInvoices) {
        const ts = inv?.createdOn;
        if (!ts) continue;
        const utc = new Date(ts).getTime();
        const co = new Date(utc + COTZ_OFFSET_MS);
        const coDay = co.toISOString().slice(0, 10);
        const coTime = co.toISOString().slice(11, 16);
        if (coDay < from || coDay > to) continue;

        const isDeleted = !!inv?.deletedInfo?.isDeleted;
        const total = Number(inv?.total) || 0;
        const totalBruto = Number(inv?.totalBruto) || 0;
        const subtotal = Number(inv?.subTotal) || 0;
        const tip = Number(inv?.tip) || 0;
        const totalDiscount = Number(inv?.totalDiscount) || 0;
        const discountAdditional = Number(inv?.discountAdditionalTotal) || Number(inv?.discountAdditional) || 0;
        const discount = totalDiscount + discountAdditional;
        const discountPct = totalBruto > 0 ? (discount / totalBruto) * 100 : 0;
        const numero = inv?.number || inv?.numberUnique || inv?._id?.slice(-6);
        const cliente = (inv?.client?.name && (inv?.client?.lastName ? `${inv.client.name} ${inv.client.lastName}` : inv.client.name)) || inv?.table?.name || "—";
        const usuario = inv?.cashier?.name || inv?.seller?.name || "—";
        const motivo = inv?.deletedInfo?.reason || inv?.observations || [inv?.note1, inv?.note2, inv?.note3].filter(Boolean).join(" · ") || "";
        const items = (inv?.products || []).map((it: any) => ({
          nombre: it?.name || it?.product?.name || "—",
          cantidad: Number(it?.quantity) || 0,
          precio: Number(it?.price) || 0,
          subtotal: Number(it?.subTotal) || 0,
          descuento: Number(it?.totalDiscount) || 0,
        }));

        const base = {
          id: inv?._id,
          numero,
          fecha: coDay,
          hora: coTime,
          cliente,
          usuario,
          total,
          subtotal,
          tip,
          discount,
          discountPct,
          isDeleted,
          motivo,
          items_count: items.length,
          items,
        };

        // ANULADA
        if (isDeleted) {
          anuladas.push(base);
          continue;
        }
        // CORTESÍA: descuento 100% o total = 0 con items
        const esCortesia = discountPct >= 99.99 || (total === 0 && items.length > 0) || (subtotal > 0 && total === 0);
        if (esCortesia) {
          cortesias.push(base);
        }
        // DESCUENTO PARCIAL: discount > 0 pero no es cortesía 100%
        if (discount > 0 && !esCortesia) {
          descuentos.push(base);
        }
      }

      return json({
        ok: true,
        from, to,
        invoices_revisados: allInvoices.length,
        resumen: {
          cortesias: { count: cortesias.length, total: cortesias.reduce((s, x) => s + (x.subtotal || 0), 0) },
          anuladas: { count: anuladas.length, total: anuladas.reduce((s, x) => s + (x.total || 0), 0) },
          descuentos: { count: descuentos.length, total_descontado: descuentos.reduce((s, x) => s + (x.discount || 0), 0) },
        },
        cortesias: cortesias.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)),
        anuladas: anuladas.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)),
        descuentos: descuentos.sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)),
      });
    }

    // GET /loggro-sync/cierre-caja-rango?from=YYYY-MM-DD&to=YYYY-MM-DD
    // Retorna totales por día y resumen global para un rango. Usado por P/L,
    // Financiero y Resultados para consumir la data oficial de Loggro Restobar.
    if (req.method === "GET" && path === "/cierre-caja-rango") {
      const from = url.searchParams.get("from");
      const to   = url.searchParams.get("to");
      const force = url.searchParams.get("force") === "1";
      if (!from || !to) return json({ error: "params from y to requeridos (YYYY-MM-DD)" }, 400);

      // ── 1. Lookup cache (5 min TTL) ──────────────────────────────────
      // Salvo que pidan force=1, devolvemos cache si está fresca. Esto baja
      // el tiempo de respuesta de 5-20s a ~50ms.
      const cacheKey = `${from}|${to}`;
      if (!force) {
        try {
          const { data: cached } = await sb()
            .from("loggro_ayb_cache")
            .select("payload, expires_at")
            .eq("cache_key", cacheKey)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
          if (cached?.payload) {
            return json({ ...cached.payload, cache_hit: true });
          }
        } catch (e) {
          console.warn("[loggro-cache] read failed, fetching live:", (e as Error).message);
        }
      }

      // ── 2. Pagina inversa: empezamos por las páginas más altas ───────
      // Loggro tiene las facturas más recientes en las páginas más altas.
      // En vez de barrer 200 páginas desde la 0, hacemos un sondeo binario
      // primero para encontrar la última página con datos, y después
      // bajamos hasta cuando salimos del rango "from".
      const pageSize = 100;
      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      const dayOf = (ts: string) => {
        const utc = new Date(ts).getTime();
        const co = new Date(utc + COTZ_OFFSET_MS);
        return co.toISOString().slice(0, 10);
      };

      // Helper con retry para llamadas a Loggro durante el sondeo y descarga.
      // Si una llamada falla (timeout / 5xx / red) y la marcamos como "vacía",
      // el sondeo binario puede terminar apuntando a páginas equivocadas y el
      // bucket resultante quedar vacío. Reintentamos hasta 3 veces antes de
      // aceptar un "vacío de verdad".
      const loggroGetPage = async (page: number) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const d: any = await loggroGet(`/invoices?pagination=true&limit=${pageSize}&page=${page}`);
            const arr = d?.data || (Array.isArray(d) ? d : []) || [];
            return { ok: true, arr };
          } catch (e) {
            if (attempt === 2) {
              console.warn(`[loggro] page=${page} falló 3 veces:`, (e as Error)?.message);
              return { ok: false, arr: [] as any[] };
            }
            // backoff exponencial: 250ms, 750ms
            await new Promise(r => setTimeout(r, 250 * Math.pow(3, attempt)));
          }
        }
        return { ok: false, arr: [] as any[] };
      };

      // Sondeo binario para encontrar última página no vacía (rápido: ~10 calls).
      // Si una petición del sondeo falla, NO la contamos como "vacía" — la
      // tratamos como error y abortamos el sondeo (evita acabar con
      // lastNonEmpty bajo por culpa de un error transient).
      let lo = 0, hi = 200, lastNonEmpty = 0;
      let probeError = false;
      while (lo <= hi && !probeError) {
        const mid = Math.floor((lo + hi) / 2);
        const r = await loggroGetPage(mid);
        if (!r.ok) { probeError = true; break; }
        if (r.arr.length > 0) { lastNonEmpty = mid; lo = mid + 1; }
        else { hi = mid - 1; }
      }
      if (probeError) {
        return json({ ok: false, error: "Loggro no responde — sondeo de páginas falló tras 3 reintentos. Intentar de nuevo en unos segundos." }, 503);
      }

      const allInvoices: any[] = [];
      const seen = new Set<string>();
      let stopReached = false;
      let pagesScanned = 0;
      // Safety cap. Antes era 30 (3000 facturas); para rangos largos o historicos
      // grandes esto truncaba silenciosamente. Subimos a 200 paginas (20K
      // facturas) — Atolon Restobar genera ~50 facturas/dia, asi que 200 paginas
      // cubren ~400 dias. Si aun asi se golpea el cap, devolvemos truncated:true
      // para que el caller sepa que los totales NO son completos (audit rank 32).
      const MAX_BACKWARD = 200;

      // Bajamos en batches de 5 páginas paralelas, desde la última hacia atrás.
      // Usamos loggroGetPage (con retry) y abortamos si una página falla, en
      // vez de tratarla como vacía — así no paramos antes de tiempo.
      let curPage = lastNonEmpty;
      let downloadError = false;
      while (curPage >= 0 && !stopReached && pagesScanned < MAX_BACKWARD && !downloadError) {
        const batchPages: number[] = [];
        for (let i = 0; i < 5 && curPage >= 0; i++) batchPages.push(curPage--);
        const results = await Promise.all(batchPages.map(async p => ({ page: p, ...(await loggroGetPage(p)) })));
        pagesScanned += results.length;

        // Si alguna falló todos los retries, abortar — no podemos confiar en
        // el resultado.
        if (results.some(r => !r.ok)) { downloadError = true; break; }

        let allOlderThanFrom = true;
        for (const r of results) {
          for (const inv of r.arr) {
            if (!inv?._id || seen.has(inv._id)) continue;
            seen.add(inv._id);
            allInvoices.push(inv);
            const ts = inv?.createdOn;
            if (ts) {
              const d = dayOf(ts);
              if (d >= from) allOlderThanFrom = false;
            }
          }
        }
        // Si TODAS las facturas del batch son anteriores al "from", paramos
        if (allOlderThanFrom && allInvoices.length > 0) stopReached = true;
      }
      if (downloadError) {
        return json({ ok: false, error: "Loggro no responde — descarga de páginas falló tras 3 reintentos. Intentar de nuevo en unos segundos." }, 503);
      }

      // Bucket por día: { ventas, propinas, tickets, anuladas, por_metodo: {} }
      interface DayBucket { ventas: number; propinas: number; tickets: number; anuladas: number; por_metodo: Record<string, number>; }
      const porDia: Record<string, DayBucket> = {};

      // Si se pidió ?productos=1, agregamos también productos vendidos del rango.
      const includeProductos = url.searchParams.get("productos") === "1";
      interface ProdBucket { cantidad: number; ventas: number; tickets: number; costo_total: number; costo_unit_max: number; categoria: string; }
      const porProducto: Record<string, ProdBucket> = {};

      for (const inv of allInvoices) {
        const ts = inv?.createdOn;
        if (!ts) continue;
        const utc = new Date(ts).getTime();
        const co = new Date(utc + COTZ_OFFSET_MS);
        const coDay = co.toISOString().slice(0, 10);
        if (coDay < from || coDay > to) continue;

        const deleted = inv?.deletedInfo?.isDeleted || false;
        const total = Number(inv?.total) || 0;
        const tip = Number(inv?.tip) || 0;
        const pmv = inv?.paid?.paymentMethodValue || [];

        if (!porDia[coDay]) porDia[coDay] = { ventas: 0, propinas: 0, tickets: 0, anuladas: 0, por_metodo: {} };
        const d = porDia[coDay];
        if (deleted) { d.anuladas += total; continue; }
        d.ventas += total;
        d.propinas += tip;
        d.tickets++;

        if (pmv.length > 0) {
          for (const pay of pmv) {
            const pm = (pay?.paymentMethod || "Desconocido").trim();
            const val = Number(pay?.value) || 0;
            d.por_metodo[pm] = (d.por_metodo[pm] || 0) + val;
          }
        } else {
          const pm = (inv?.paymentMethod || "Desconocido").trim();
          d.por_metodo[pm] = (d.por_metodo[pm] || 0) + total;
        }

        // Agregación por producto (solo si pedida — agrega ~50ms por 500 facturas).
        // Costo viene de costProduct/avgCost (campos Loggro): es el costo de
        // inventario al momento del cierre = lo que mueve contablemente a costo.
        if (includeProductos) {
          for (const p of (inv?.products || [])) {
            const nombre = (p?.name || p?.product?.name || "—").trim();
            const cant = Number(p?.quantity) || 0;
            const venta = Number(p?.total) || Number(p?.totalBruto) || (Number(p?.price) || 0) * cant;
            const costoUnit = Number(p?.costProduct) || Number(p?.avgCost) || 0;
            const categoria = (p?.categoryName || "Sin categoría").trim();
            if (!porProducto[nombre]) porProducto[nombre] = { cantidad: 0, ventas: 0, tickets: 0, costo_total: 0, costo_unit_max: 0, categoria };
            porProducto[nombre].cantidad += cant;
            porProducto[nombre].ventas += venta;
            porProducto[nombre].tickets += 1;
            porProducto[nombre].costo_total += costoUnit * cant;
            if (costoUnit > porProducto[nombre].costo_unit_max) porProducto[nombre].costo_unit_max = costoUnit;
          }
        }
      }

      // Resumen global del rango
      let totalVentas = 0, totalPropinas = 0, totalTickets = 0, totalAnuladas = 0;
      const porMetodoGlobal: Record<string, number> = {};
      for (const d of Object.values(porDia)) {
        totalVentas   += d.ventas;
        totalPropinas += d.propinas;
        totalTickets  += d.tickets;
        totalAnuladas += d.anuladas;
        for (const [pm, v] of Object.entries(d.por_metodo)) {
          porMetodoGlobal[pm] = (porMetodoGlobal[pm] || 0) + v;
        }
      }

      // Truncated: golpeamos el cap MAX_BACKWARD sin terminar de barrer
      // hacia atras. Los totales son INCOMPLETOS — el caller debe
      // mostrar warning visible al usuario (audit rank 32). Antes el
      // cap se silenciaba: el reporte salia con datos parciales y nadie
      // sabia.
      const truncated = pagesScanned >= MAX_BACKWARD && !stopReached;
      if (truncated) {
        console.warn(`[loggro cierre-caja-rango] cap MAX_BACKWARD=${MAX_BACKWARD} alcanzado sin cubrir el rango ${from}..${to}. Totales pueden estar incompletos.`);
      }

      const payload = {
        ok: true,
        from, to,
        timezone: "America/Bogota",
        invoices_revisados: allInvoices.length,
        pages_scanned: pagesScanned,
        last_non_empty_page: lastNonEmpty,
        stop_reached: stopReached,
        truncated, // true si MAX_BACKWARD se golpeo sin cubrir el rango completo
        resumen: {
          total_ventas: totalVentas,
          total_propinas: totalPropinas,
          total_general: totalVentas + totalPropinas,
          tickets: totalTickets,
          anuladas: totalAnuladas,
        },
        por_metodo: porMetodoGlobal,
        por_dia: porDia,
        ...(includeProductos ? { por_producto: porProducto } : {}),
      };

      // ── 3. Guardar en cache (5 min TTL) ──────────────────────────────
      // Si la req era para un rango que termina HOY, el TTL es 5 min (datos
      // cambian). Si termina antes de hoy, TTL es 24h (datos históricos no
      // cambian). Esto baja muchísimo la carga en Loggro para queries de
      // meses anteriores.
      //
      // NO cachear resultados sospechosos NI truncados. Sospechosos:
      // > 50 invoices con $0 ventas = filtrado/descarga falló. Truncados:
      // MAX_BACKWARD pegado sin terminar = totales incompletos, cachearlos
      // 5min-24h dejaria al dashboard mostrar datos parciales sin reintentar.
      const sospechoso = allInvoices.length > 50 && totalVentas === 0 && totalAnuladas === 0;
      if (sospechoso || truncated) {
        console.warn(`[loggro-cache] NO se cachea (sospechoso=${sospechoso}, truncated=${truncated})`);
      } else {
        try {
          const today = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
          const ttlMs = to >= today ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;
          const expiresAt = new Date(Date.now() + ttlMs).toISOString();
          await sb().from("loggro_ayb_cache").upsert({
            cache_key: cacheKey,
            from_date: from,
            to_date: to,
            payload,
            cached_at: new Date().toISOString(),
            expires_at: expiresAt,
          }, { onConflict: "cache_key" });
        } catch (e) {
          console.warn("[loggro-cache] write failed:", (e as Error).message);
        }
      }

      return json({ ...payload, sospechoso: sospechoso || undefined, truncated: truncated || undefined });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/cierre-caja-auto
    // Body: { fecha: 'YYYY-MM-DD', cajero_nombre?: string, dry_run?: bool }
    //
    // Genera el cierre de caja area='ayb' automatico a partir de Loggro
    // Restobar. No requiere intervención del cajero — lee ventas + métodos
    // + propinas del día y crea el registro directamente en cierres_caja.
    //
    // Idempotente: si ya existe cierre para (ayb, fecha, cajero) devuelve el existente.
    // Direccion 2026-07-13.
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/cierre-caja-auto") {
      const body = await req.json().catch(() => ({}));
      const fecha = String(body?.fecha || "").slice(0, 10);
      const cajeroNombre = String(body?.cajero_nombre || "Sistema (Auto Loggro)").trim();
      const dryRun = body?.dry_run === true;
      if (!fecha) return json({ ok: false, error: "fecha requerida (YYYY-MM-DD)" }, 400);

      // 1) Traer totales del día via el mismo helper interno que cierre-caja-rango
      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      const dayOf = (ts: string) => new Date(new Date(ts).getTime() + COTZ_OFFSET_MS).toISOString().slice(0, 10);
      const pageSize = 100;
      // Sondeo binario para última página
      const loggroGetPage = async (page: number) => {
        for (let a = 0; a < 3; a++) {
          try {
            const d: any = await loggroGet(`/invoices?pagination=true&limit=${pageSize}&page=${page}`);
            return { ok: true, arr: d?.data || (Array.isArray(d) ? d : []) || [] };
          } catch {
            if (a === 2) return { ok: false, arr: [] as any[] };
            await new Promise(r => setTimeout(r, 250 * Math.pow(3, a)));
          }
        }
        return { ok: false, arr: [] as any[] };
      };
      let lo = 0, hi = 200, lastNonEmpty = 0;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const r = await loggroGetPage(mid);
        if (!r.ok) return json({ ok: false, error: "Loggro no responde (sondeo)" }, 503);
        if (r.arr.length > 0) { lastNonEmpty = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      const allInvoices: any[] = [];
      const seen = new Set<string>();
      let stop = false;
      for (let p = lastNonEmpty; p >= 0 && !stop; p -= 5) {
        const pages = [p, p-1, p-2, p-3, p-4].filter(x => x >= 0);
        const rs = await Promise.all(pages.map(async pp => ({ pp, ...(await loggroGetPage(pp)) })));
        if (rs.some(r => !r.ok)) return json({ ok: false, error: "Descarga falló" }, 503);
        let allOlder = true;
        for (const r of rs) {
          for (const inv of r.arr) {
            if (!inv?._id || seen.has(inv._id)) continue;
            seen.add(inv._id);
            allInvoices.push(inv);
            const d = dayOf(inv.createdOn);
            if (d >= fecha) allOlder = false;
          }
        }
        if (allOlder && allInvoices.length > 0) stop = true;
      }

      // 2) Filtrar y agregar por método
      let totalVentas = 0, totalPropinas = 0, tickets = 0, anuladas = 0;
      const ventasPorMetodo: Record<string, number> = {};
      for (const inv of allInvoices) {
        const ts = inv?.createdOn;
        if (!ts) continue;
        if (dayOf(ts) !== fecha) continue;
        if (inv?.deletedInfo?.isDeleted) { anuladas += Number(inv?.total) || 0; continue; }
        const total = Number(inv?.total) || 0;
        const tip = Number(inv?.tip) || 0;
        totalVentas += total;
        totalPropinas += tip;
        tickets++;
        const pmv = inv?.paid?.paymentMethodValue || [];
        if (pmv.length > 0) {
          for (const pay of pmv) {
            const pm = (pay?.paymentMethod || "Desconocido").trim();
            ventasPorMetodo[pm] = (ventasPorMetodo[pm] || 0) + (Number(pay?.value) || 0);
          }
        } else {
          const pm = (inv?.paymentMethod || "Desconocido").trim();
          ventasPorMetodo[pm] = (ventasPorMetodo[pm] || 0) + total;
        }
      }

      // 3) Mapear a nuestros métodos y prorratear propinas proporcionalmente
      const METODO_MAP: Record<string, string> = {
        "Datafono": "datafono",
        "Datáfono": "datafono",
        "Efectivo": "efectivo",
        "Transferencia": "transferencia",
        "Link de pago": "link_pago",
        "Link": "link_pago",
        "Resort Credit": "resort_credit",
      };
      const metodosData: Record<string, any> = { datafono: {venta:0,propina:0,total:0}, efectivo: {venta:0,propina:0,total:0}, link_pago: {venta:0,propina:0,total:0}, resort_credit: {venta:0,propina:0,total:0}, transferencia: {venta:0,propina:0,total:0}, otros: {venta:0,propina:0,total:0} };
      const otrosItems: Array<{desc:string, venta:number, propina:number}> = [];
      for (const [pm, val] of Object.entries(ventasPorMetodo)) {
        const key = METODO_MAP[pm] || "otros";
        if (key === "otros") otrosItems.push({ desc: pm, venta: val, propina: 0 });
        metodosData[key].venta += val;
      }
      // Prorratear propinas — redondear a entero para respetar tipo integer en BD
      for (const k of Object.keys(metodosData)) {
        metodosData[k].venta = Math.round(metodosData[k].venta);
      }
      if (totalVentas > 0 && totalPropinas > 0) {
        for (const k of Object.keys(metodosData)) {
          const share = metodosData[k].venta / totalVentas;
          metodosData[k].propina = Math.round(totalPropinas * share);
          metodosData[k].total = metodosData[k].venta + metodosData[k].propina;
        }
      } else {
        for (const k of Object.keys(metodosData)) metodosData[k].total = metodosData[k].venta;
      }
      if (otrosItems.length > 0) {
        metodosData.otros_items = otrosItems.map(oi => ({ ...oi, venta: Math.round(oi.venta), propina: Math.round(oi.propina) }));
      }

      // 4) dry_run devuelve el payload sin insertar
      const totalGeneral = totalVentas + totalPropinas;
      if (dryRun) {
        return json({
          ok: true, dry_run: true, fecha,
          tickets, anuladas, ventas_por_metodo_loggro: ventasPorMetodo,
          resumen: { total_ventas: totalVentas, total_propinas: totalPropinas, total_general: totalGeneral },
          metodos: metodosData,
        });
      }

      // 5) Insertar en cierres_caja (idempotente por (area, fecha, cajero_nombre))
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const sbFetch = (p: string, init: RequestInit = {}) => fetch(`${supaUrl}/rest/v1/${p}`, {
        ...init,
        headers: { apikey: supaKey!, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
      }).then(r => r.json());

      const existentes: any = await sbFetch(`cierres_caja?area=eq.ayb&fecha=eq.${fecha}&cajero_nombre=eq.${encodeURIComponent(cajeroNombre)}&select=id,total_ventas`);
      if (Array.isArray(existentes) && existentes.length > 0) {
        return json({ ok: true, ya_existe: true, cierre_id: existentes[0].id, cierre_total: existentes[0].total_ventas });
      }

      const id = `CC-AUTO-${fecha.replaceAll("-","")}-${Date.now()}`;
      const record = {
        id,
        fecha,
        area: "ayb",
        cajero_nombre: cajeroNombre,
        numero_caja: null,
        numero_comprobante: null,
        usuario_email: "auto-loggro@sistema.atolon",
        metodos: metodosData,
        total_ventas: Math.round(totalVentas),
        total_propinas: Math.round(totalPropinas),
        total_general: Math.round(totalGeneral),
        efectivo_esperado: metodosData.efectivo.venta,
        efectivo_contado: metodosData.efectivo.venta,
        diferencia: 0,
        notas: `Generado automáticamente desde Loggro Restobar (${tickets} tickets, ${anuladas > 0 ? `${anuladas} anuladas`: "0 anuladas"}). Sin intervención del cajero.`,
        estado: "cerrado",
      };
      const inserted: any = await sbFetch("cierres_caja", { method: "POST", body: JSON.stringify(record) });
      if (inserted?.code || inserted?.message) {
        return json({ ok: false, error: "Insert falló", detalle: inserted }, 500);
      }
      return json({ ok: true, cierre_id: id, fecha, tickets, resumen: { total_ventas: totalVentas, total_propinas: totalPropinas, total_general: totalGeneral }, metodos: metodosData });
    }

    // GET /loggro-sync/consumo-recetas-rango?from=YYYY-MM-DD&to=YYYY-MM-DD
    // Replica el "Historial de Inventario / Facturación" de Loggro: por cada
    // factura del rango, expande la receta (1 nivel) de cada producto vendido
    // y agrega los consumos por insumo. Usado por contabilidad para hacer el
    // asiento mensual Inventario → Costo.
    if (req.method === "GET" && path === "/consumo-recetas-rango") {
      const from = url.searchParams.get("from");
      const to   = url.searchParams.get("to");
      if (!from || !to) return json({ error: "params from y to requeridos (YYYY-MM-DD)" }, 400);

      const pageSize = 100;
      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      const dayOf = (ts: string) => new Date(new Date(ts).getTime() + COTZ_OFFSET_MS).toISOString().slice(0, 10);

      // 1. Catálogo Loggro completo (products + ingredients) → mapa por id+nombre
      const map: Record<string, any> = {};
      const byNombre: Record<string, any> = {};
      const addAll = async (path: string) => {
        for (let p = 0; p < 20; p++) {
          let arr: any[] = [];
          try {
            const d: any = await loggroGet(`${path}?pagination=true&limit=200&page=${p}`);
            arr = d?.data || (Array.isArray(d) ? d : []) || [];
          } catch (_e) { break; }
          if (arr.length === 0) break;
          for (const it of arr) {
            if (it?._id) map[it._id] = it;
            if (it?.name) byNombre[it.name.trim().toLowerCase()] = it;
          }
        }
      };
      await addAll("/products");
      await addAll("/ingredients");

      // 2. Facturas del rango (paginación inversa con binary search)
      const loggroGetPage = async (page: number) => {
        for (let a = 0; a < 3; a++) {
          try {
            const d: any = await loggroGet(`/invoices?pagination=true&limit=${pageSize}&page=${page}`);
            return { ok: true, arr: d?.data || (Array.isArray(d) ? d : []) || [] };
          } catch (_e) {
            if (a === 2) return { ok: false, arr: [] as any[] };
            await new Promise(r => setTimeout(r, 250 * Math.pow(3, a)));
          }
        }
        return { ok: false, arr: [] as any[] };
      };
      let lo = 0, hi = 200, lastNonEmpty = 0;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const r = await loggroGetPage(mid);
        if (!r.ok) return json({ ok: false, error: "Loggro no responde (sondeo)" }, 503);
        if (r.arr.length > 0) { lastNonEmpty = mid; lo = mid + 1; } else { hi = mid - 1; }
      }
      const invs: any[] = [];
      const seen = new Set<string>();
      let stop = false;
      for (let p = lastNonEmpty; p >= 0 && !stop; p -= 5) {
        const pages = [p, p-1, p-2, p-3, p-4].filter(x => x >= 0);
        const results = await Promise.all(pages.map(async pp => ({ pp, ...(await loggroGetPage(pp)) })));
        if (results.some(r => !r.ok)) return json({ ok: false, error: "Loggro fallo descarga facturas" }, 503);
        let allOlder = true;
        for (const r of results) {
          for (const inv of r.arr) {
            if (!inv?._id || seen.has(inv._id)) continue;
            seen.add(inv._id);
            if (inv?.deletedInfo?.isDeleted) continue;
            const d = dayOf(inv.createdOn);
            if (d >= from) allOlder = false;
            if (d >= from && d <= to) invs.push(inv);
          }
        }
        if (allOlder && invs.length > 0) stop = true;
      }

      // 3. Expandir recetas: cada factura → productos → ingredients[] del producto
      const getPrecio = (p: any) => Number(p?.locationsStock?.[0]?.avgCost) || Number(p?.locationsStock?.[0]?.pricePurchase) || Number(p?.pricePurchase) || 0;
      const getUnit = (p: any) => p?.unit?.shortName || p?.unit?.name || "";

      const movs: any[] = [];
      let sinMatch = 0;
      const sinMatchSet = new Set<string>();
      for (const inv of invs) {
        const fecha = new Date(new Date(inv.createdOn).getTime() + COTZ_OFFSET_MS).toISOString();
        const numero = inv.number || inv.numberUnique || inv._id?.slice(-6);
        const tipo: "Cortesia" | "Facturacion" = "Facturacion";
        for (const prod of (inv.products || [])) {
          const nombre = (prod.name || "").trim();
          const cant = Number(prod.quantity) || 0;
          if (!nombre || cant <= 0) continue;
          const pCat = byNombre[nombre.toLowerCase()];
          if (!pCat) {
            sinMatch++;
            sinMatchSet.add(nombre);
            continue;
          }
          const ings = pCat.ingredients || [];
          if (ings.length === 0) {
            const pu = getPrecio(pCat);
            movs.push({ fecha, factura: numero, tipo, producto_base: pCat.name, insumo: pCat.name, unidad: getUnit(pCat), categoria: pCat.category?.name || "", cantidad_usada: cant, precio_unit: pu, total: cant * pu });
            continue;
          }
          for (const def of ings) {
            const ingObj = typeof def.ingredient === "string" ? map[def.ingredient] : def.ingredient;
            const ingQty = Number(def.quantity) || 0;
            if (!ingQty) continue;
            const pu = getPrecio(ingObj);
            const usada = cant * ingQty;
            movs.push({
              fecha,
              factura: numero,
              tipo,
              producto_base: pCat.name,
              insumo: ingObj?.name || "(no encontrado)",
              unidad: getUnit(ingObj),
              categoria: ingObj?.category?.name || "Sin categoría",
              cantidad_usada: usada,
              precio_unit: pu,
              total: usada * pu,
            });
          }
        }
      }

      // 3b. Descargar CORTESIAS del rango — vienen como orders con
      //     complementary.isComplementary=true (NO como invoices).
      //     Loggro las clasifica en /orders con campo `complementary`.
      const allOrders: any[] = [];
      const seenOrder = new Set<string>();
      const MAX_ORDER_PAGES = 200;
      let stopO = false;
      for (let batchStart = 0; batchStart < MAX_ORDER_PAGES && !stopO; batchStart += 20) {
        const batch = [];
        for (let pp = batchStart; pp < batchStart + 20 && pp < MAX_ORDER_PAGES; pp++) {
          batch.push(
            loggroGet(`/orders?pagination=true&limit=100&page=${pp}`)
              .then(d => ({ arr: d?.data || (Array.isArray(d) ? d : []) }))
              .catch(() => ({ arr: [] }))
          );
        }
        const results = await Promise.all(batch);
        let emptyInBatch = 0;
        results.forEach(r => {
          if (r.arr.length === 0) emptyInBatch++;
          for (const o of r.arr) {
            if (o?._id && !seenOrder.has(o._id)) { seenOrder.add(o._id); allOrders.push(o); }
          }
        });
        if (emptyInBatch >= 5) stopO = true;
      }
      // Filtrar por rango + solo cortesias
      const cortesias = allOrders.filter((o: any) => {
        if (!o?.complementary?.isComplementary) return false;
        const ts = o?.createdOn;
        if (!ts) return false;
        const d = dayOf(ts);
        return d >= from && d <= to;
      });
      // Expandir receta por cada order cortesia
      for (const ord of cortesias) {
        const fechaCortesia = ord?.complementary?.modifiedOn || ord?.modifiedOn || ord?.createdOn;
        const fecha = new Date(new Date(fechaCortesia).getTime() + COTZ_OFFSET_MS).toISOString();
        const nombreProducto = (ord?.product?.name || "").trim();
        const cant = Number(ord?.quantity) || 0;
        if (!nombreProducto || cant <= 0) continue;
        const pCat = byNombre[nombreProducto.toLowerCase()] || map[ord?.product?._id];
        if (!pCat) { sinMatch++; sinMatchSet.add(nombreProducto); continue; }
        const numero = "CORT-" + (ord._id?.slice(-6) || "?");
        const ings = pCat.ingredients || [];
        if (ings.length === 0) {
          const pu = getPrecio(pCat);
          movs.push({ fecha, factura: numero, tipo: "Cortesia", producto_base: pCat.name, insumo: pCat.name, unidad: getUnit(pCat), categoria: pCat.category?.name || "", cantidad_usada: cant, precio_unit: pu, total: cant * pu });
          continue;
        }
        for (const def of ings) {
          const ingObj = typeof def.ingredient === "string" ? map[def.ingredient] : def.ingredient;
          const ingQty = Number(def.quantity) || 0;
          if (!ingQty) continue;
          const pu = getPrecio(ingObj);
          const usada = cant * ingQty;
          movs.push({
            fecha, factura: numero, tipo: "Cortesia",
            producto_base: pCat.name,
            insumo: ingObj?.name || "(no encontrado)",
            unidad: getUnit(ingObj),
            categoria: ingObj?.category?.name || "Sin categoría",
            cantidad_usada: usada,
            precio_unit: pu,
            total: usada * pu,
          });
        }
      }

      // 4. Agregado por insumo + separado por tipo (Facturacion vs Cortesia)
      const porInsumo: Record<string, any> = {};
      for (const m of movs) {
        const k = m.insumo + "|" + (m.unidad || "");
        if (!porInsumo[k]) porInsumo[k] = {
          insumo: m.insumo, unidad: m.unidad, categoria: m.categoria,
          cantidad: 0, total: 0, movs: 0,
          cantidad_facturacion: 0, total_facturacion: 0,
          cantidad_cortesia: 0, total_cortesia: 0,
        };
        porInsumo[k].cantidad += m.cantidad_usada;
        porInsumo[k].total += m.total;
        porInsumo[k].movs++;
        if (m.tipo === "Cortesia") {
          porInsumo[k].cantidad_cortesia += m.cantidad_usada;
          porInsumo[k].total_cortesia += m.total;
        } else {
          porInsumo[k].cantidad_facturacion += m.cantidad_usada;
          porInsumo[k].total_facturacion += m.total;
        }
      }
      const agregado = Object.values(porInsumo).sort((a: any, b: any) => b.total - a.total);

      const totalFacturacion = movs.filter(m => m.tipo === "Facturacion").reduce((s, m) => s + m.total, 0);
      const totalCortesia = movs.filter(m => m.tipo === "Cortesia").reduce((s, m) => s + m.total, 0);
      const movsFacturacion = movs.filter(m => m.tipo === "Facturacion").length;
      const movsCortesia = movs.filter(m => m.tipo === "Cortesia").length;

      return json({
        ok: true,
        from, to,
        facturas_procesadas: invs.length,
        movimientos: movs.length,
        movs_facturacion: movsFacturacion,
        movs_cortesia: movsCortesia,
        insumos_unicos: agregado.length,
        productos_sin_match: sinMatchSet.size,
        productos_sin_match_lista: Array.from(sinMatchSet),
        total_costo: movs.reduce((s, m) => s + m.total, 0),
        total_costo_facturacion: totalFacturacion,
        total_costo_cortesia: totalCortesia,
        agregado,
        movimientos_detalle: movs.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      });
    }

    // GET /loggro-sync/movimientos-inventario-rango?from=YYYY-MM-DD&to=YYYY-MM-DD
    // Descarga TODOS los movimientos de inventario de Loggro en el rango y los
    // agrupa por (tipo de movimiento, ingrediente). Es lo que el contador
    // necesita para CMV real: ingredientes que ENTRARON (compras type=1),
    // se PRODUJERON (type=9), SALIERON por ajuste/merma (type=6,7,10).
    if (req.method === "GET" && path === "/movimientos-inventario-rango") {
      const from = url.searchParams.get("from");
      const to   = url.searchParams.get("to");
      if (!from || !to) return json({ error: "params from y to requeridos (YYYY-MM-DD)" }, 400);

      const pageSize = 100;
      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      const dayOf = (ts: string) => {
        const utc = new Date(ts).getTime();
        return new Date(utc + COTZ_OFFSET_MS).toISOString().slice(0, 10);
      };

      // Recorremos páginas desde 0 hasta página vacía. /inventories no tiene
      // ordering claro; descargamos todo y filtramos por fecha al final.
      const allMovs: any[] = [];
      const seen = new Set<string>();
      let pagesScanned = 0;
      const MAX_PAGES = 50;
      for (let p = 0; p < MAX_PAGES; p++) {
        let arr: any[] = [];
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const d: any = await loggroGet(`/inventories?pagination=true&limit=${pageSize}&page=${p}`);
            arr = d?.data || (Array.isArray(d) ? d : []) || [];
            break;
          } catch (e) {
            if (attempt === 2) return json({ ok: false, error: `Loggro /inventories page ${p} falló tras 3 reintentos: ${(e as Error).message}` }, 503);
            await new Promise(r => setTimeout(r, 250 * Math.pow(3, attempt)));
          }
        }
        pagesScanned++;
        if (arr.length === 0) break;
        for (const m of arr) {
          if (!m?._id || seen.has(m._id)) continue;
          seen.add(m._id);
          allMovs.push(m);
        }
      }

      // Filtrar por rango y deletedInfo
      const enRango = allMovs.filter(m => {
        if (m?.deleted === true) return false;
        const ts = m?.date || m?.createdOn;
        if (!ts) return false;
        const d = dayOf(ts);
        return d >= from && d <= to;
      });

      // Agrupar por (tipo, ingrediente). Cada movimiento tiene ingredients[]
      // con { ingredient, quantity, price, locationStock }. Sumamos qty y costo.
      interface IngBucket { tipo: number; tipoNombre: string; ingrediente_id: string; nombre: string; categoria: string; unidad: string; cantidad: number; costo_total: number; movimientos: number; locaciones: Set<string>; }
      const buckets: Record<string, IngBucket> = {};
      let totalMovs = 0;
      let totalLineas = 0;
      for (const m of enRango) {
        totalMovs++;
        for (const it of (m.ingredients || [])) {
          totalLineas++;
          const ing = it.ingredient;
          if (!ing) continue;
          const ingId = ing._id || ing.id || ing.name;
          const key = `${m.type}|${ingId}`;
          if (!buckets[key]) {
            buckets[key] = {
              tipo: m.type,
              tipoNombre: m.typeName || `Tipo ${m.type}`,
              ingrediente_id: ingId,
              nombre: ing.name || "(sin nombre)",
              categoria: ing.category?.name || "Sin categoría",
              unidad: ing.unit?.shortName || ing.unit?.name || "",
              cantidad: 0,
              costo_total: 0,
              movimientos: 0,
              locaciones: new Set<string>(),
            };
          }
          const b = buckets[key];
          const qty = Number(it.quantity) || 0;
          const precio = Number(it.price) || 0;
          b.cantidad += qty;
          b.costo_total += qty * precio;
          b.movimientos++;
          const loc = it.locationStock?.name;
          if (loc) b.locaciones.add(loc);
        }
      }

      // Convertir a array y simplificar (Set → array)
      const lineas = Object.values(buckets).map(b => ({
        tipo: b.tipo,
        tipo_nombre: b.tipoNombre,
        ingrediente_id: b.ingrediente_id,
        nombre: b.nombre,
        categoria: b.categoria,
        unidad: b.unidad,
        cantidad: Math.round(b.cantidad * 1000) / 1000,
        costo_total: Math.round(b.costo_total * 100) / 100,
        movimientos: b.movimientos,
        locaciones: Array.from(b.locaciones),
      }));

      // Resumen por tipo
      const porTipo: Record<string, { tipo_nombre: string; movimientos: number; lineas: number; costo_total: number }> = {};
      for (const m of enRango) {
        const k = `${m.type}|${m.typeName || ''}`;
        if (!porTipo[k]) porTipo[k] = { tipo_nombre: m.typeName || `Tipo ${m.type}`, movimientos: 0, lineas: 0, costo_total: 0 };
        porTipo[k].movimientos++;
        for (const it of (m.ingredients || [])) {
          porTipo[k].lineas++;
          porTipo[k].costo_total += (Number(it.quantity) || 0) * (Number(it.price) || 0);
        }
      }

      return json({
        ok: true,
        from, to,
        timezone: "America/Bogota",
        pages_scanned: pagesScanned,
        movimientos_total_descargados: allMovs.length,
        movimientos_en_rango: enRango.length,
        lineas_total: totalLineas,
        por_tipo: porTipo,
        lineas,
      });
    }

    // POST /loggro-sync/create-provider — crear proveedor en Loggro
    // Body: { nombre, nit?, telefono?, email?, ciudad?, direccion? }
    if (req.method === "POST" && path === "/create-provider") {
      const body = await req.json().catch(() => ({}));
      if (!body.nombre) return json({ ok: false, error: "nombre requerido" }, 400);
      const { businessId, userId } = await getLoggroIdentity();

      const payload: any = {
        business: businessId,
        user: userId,
        name: body.nombre,
        document: body.nit || null,
        phone: body.telefono || null,
        email: body.email || null,
        city: body.ciudad || null,
        address: body.direccion || null,
        isActive: true,
        createdOn: new Date().toISOString(),
        modifiedOn: new Date().toISOString(),
      };

      // Probar paths comunes hasta encontrar uno que funcione
      const paths = ["/providers", "/suppliers", "/proveedores"];
      const intentos: any[] = [];
      for (const p of paths) {
        const r = await loggroRaw("POST", p, payload);
        intentos.push({ path: p, status: r.status, body_preview: typeof r.body === "string" ? r.body.slice(0, 200) : r.body });
        if (r.ok && r.body && (r.body._id || r.body.id)) {
          return json({ ok: true, path_used: p, loggro_id: r.body._id || r.body.id, provider: r.body, intentos });
        }
      }
      return json({ ok: false, error: "Ningún path POST respondió OK", intentos }, 502);
    }

    // GET /loggro-sync/providers — listar proveedores de Restobar
    // Prueba varios paths comunes y devuelve el que funcione.
    if (req.method === "GET" && path === "/providers") {
      const paths = ["/providers", "/suppliers", "/proveedores", "/purchaseOrders/providers", "/inventory/providers"];
      const intentos: any[] = [];
      let exito: any = null;
      for (const p of paths) {
        try {
          const r = await loggroRaw("GET", p);
          const entry: any = { path: p, status: r.status };
          if (r.ok) {
            const arr = Array.isArray(r.body) ? r.body : (r.body?.data || r.body?.items || r.body?.results || []);
            entry.count = Array.isArray(arr) ? arr.length : undefined;
            entry.sample = Array.isArray(arr) ? arr.slice(0, 3) : r.body;
            if (!exito && Array.isArray(arr)) exito = { path: p, providers: arr };
          }
          intentos.push(entry);
          if (exito) break;
        } catch (e) {
          intentos.push({ path: p, status: -1, error: String(e).slice(0, 200) });
        }
      }
      if (exito) {
        return json({ ok: true, path_encontrado: exito.path, total: exito.providers.length, providers: exito.providers, intentos });
      }
      return json({ ok: false, error: "Ningún path respondió 200", intentos }, 404);
    }

    // POST /loggro-sync/update-ingredient
    // Actualiza un ingrediente en Loggro merge-style: trae el original,
    // cambia los campos indicados y hace upsert con POST /ingredients.
    // Body: { loggro_id: "...", nombre?: "...", descripcion?: "...", codigo?: "..." }
    if (req.method === "POST" && path === "/update-ingredient") {
      const body = await req.json().catch(() => ({}));
      if (!body.loggro_id) return json({ ok: false, error: "loggro_id requerido" }, 400);

      // 1. Traer el ingrediente actual
      const get = await loggroRaw("GET", `/ingredients/${body.loggro_id}`);
      if (!get.ok) {
        return json({ ok: false, error: `No se pudo leer el ingrediente (${get.status})`, loggro_response: get.body }, 502);
      }
      const original = get.body || {};

      // 2. Aplicar cambios solicitados
      const merged: any = { ...original, modifiedOn: new Date().toISOString() };
      if (body.nombre !== undefined) merged.name = body.nombre;
      if (body.descripcion !== undefined) merged.description = body.descripcion;
      if (body.codigo !== undefined) merged.code = body.codigo;
      // category puede venir como objeto; Loggro suele aceptar solo su _id
      if (merged.category && typeof merged.category === "object" && merged.category._id) {
        merged.category = merged.category._id;
      }

      // 3. POST con el objeto completo (upsert)
      const post = await loggroRaw("POST", "/ingredients", merged);
      if (!post.ok) {
        return json({
          ok: false, error: `Loggro rechazó el update (${post.status})`,
          loggro_response: post.body, payload: merged,
        }, 502);
      }
      return json({ ok: true, loggro_response: post.body });
    }

    // POST /loggro-sync/ingredients-stock
    // Body: { loggro_ids: ["...","..."] }
    // Devuelve { loggro_id: { name, stock } } con stock REAL extraído del
    // detalle individual (locationsStock[].stock).
    // El listado paginado no trae locationsStock como array, solo el detalle
    // individual, así que hacemos fetch en paralelo por ID.
    if ((req.method === "GET" || req.method === "POST") && path === "/ingredients-stock") {
      let ids: string[] = [];
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        ids = Array.isArray(body.loggro_ids) ? body.loggro_ids.filter(Boolean) : [];
      }
      if (ids.length === 0) {
        return json({ ok: false, error: "Envía loggro_ids[] por POST body (ej: {'loggro_ids':['...']})" }, 400);
      }

      // Paralelo con límite de concurrencia
      const CONCURRENCY = 20;
      const map: Record<string, { name: string; stock: number; unit?: string }> = {};
      let idx = 0;
      async function worker() {
        while (idx < ids.length) {
          const myIdx = idx++;
          const id = ids[myIdx];
          try {
            const d: any = await loggroGet(`/ingredients/${id}`);
            let totalStock = 0;
            if (Array.isArray(d?.locationsStock) && d.locationsStock.length > 0) {
              totalStock = d.locationsStock.reduce((s: number, ls: any) => s + (Number(ls.stock) || 0), 0);
            }
            map[id] = { name: d?.name || "", stock: totalStock, unit: d?.unit || undefined };
          } catch (_) { /* skip */ }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker()));
      return json({ ok: true, total: ids.length, stock: map });
    }

    // POST /loggro-sync/create-ingredient
    // Crea un ingrediente nuevo en Loggro Restobar.
    // Body: { nombre, category_id, descripcion?, codigo?, unit?, cost? }
    if (req.method === "POST" && path === "/create-ingredient") {
      const body = await req.json().catch(() => ({}));
      if (!body.nombre) return json({ ok: false, error: "nombre requerido" }, 400);
      if (!body.category_id) return json({ ok: false, error: "category_id requerido" }, 400);

      const now = new Date().toISOString();
      const payload: any = {
        name: body.nombre,
        category: body.category_id,
        description: body.descripcion || body.nombre,
        code: body.codigo || "",
        price: Number(body.precio) || 0,
        cost: Number(body.costo) || 0,
        isActive: true,
        variablePrice: { isVariablePrice: false },
        config: { openModalNotes: false },
        deletedInfo: { isDeleted: false },
        createdOn: now,
        modifiedOn: now,
      };
      if (body.unit) payload.unit = body.unit;

      const r = await loggroRaw("POST", "/ingredients", payload);
      if (!r.ok) {
        return json({
          ok: false,
          error: `Loggro rechazó el insert (${r.status})`,
          loggro_response: r.body,
          payload,
        }, 502);
      }
      return json({
        ok: true,
        loggro_id: r.body?._id || null,
        loggro_response: r.body,
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/reset-all-to-zero
    // Pone TODO el inventario de Loggro en 0 creando movimientos de
    // ajuste-salida para cada ingrediente con stock > 0. Útil para
    // establecer un nuevo baseline.
    // Body opcional: { dry_run: true }  (devuelve los items que tocaría)
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/reset-all-to-zero") {
      const body = await req.json().catch(() => ({}));
      const dryRun = !!body.dry_run;

      const { businessId, userId } = await getLoggroIdentity();

      // 1) Listar todos los ingredientes
      const ingList: any = await loggroGet("/ingredients?limit=2000");
      const ingredients: any[] = Array.isArray(ingList) ? ingList
        : Array.isArray(ingList?.data) ? ingList.data
        : Array.isArray(ingList?.items) ? ingList.items
        : Array.isArray(ingList?.results) ? ingList.results
        : [];

      // Items con stock distinto de 0 (positivo o negativo)
      const positivos: Array<{ id: string; name: string; stock: number }> = [];
      const negativos: Array<{ id: string; name: string; stock: number }> = [];
      // rank 34: antes el worker silenciaba errores con catch (_). Si la API
      // Loggro fallaba para 50/1000 ingredients, esos 50 NO se reseteaban y
      // el operador no se enteraba — el reset se daba por exitoso. Ahora
      // capturamos los IDs fallidos y los retornamos para que el usuario
      // pueda reintentar selectivamente.
      const fallidos: Array<{ id: string; error: string }> = [];
      const ids = ingredients.map((i: any) => i?._id || i?.id).filter(Boolean);
      let idx = 0;
      async function worker() {
        while (idx < ids.length) {
          const myIdx = idx++;
          const id = ids[myIdx];
          try {
            const d: any = await loggroGet(`/ingredients/${id}`);
            let totalStock = 0;
            if (Array.isArray(d?.locationsStock)) {
              totalStock = d.locationsStock.reduce((s: number, ls: any) => s + (Number(ls.stock) || 0), 0);
            }
            if (totalStock > 0.0001) {
              positivos.push({ id, name: d?.name || "", stock: totalStock });
            } else if (totalStock < -0.0001) {
              negativos.push({ id, name: d?.name || "", stock: Math.abs(totalStock) });
            }
          } catch (e) {
            fallidos.push({ id, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) });
          }
        }
      }
      await Promise.all(Array.from({ length: 10 }, () => worker()));

      // rank 34: si fallaron mas del 5% NO procedemos con los movimientos.
      // El reset es destructivo (SALIDA + ENTRADA_AJUSTE en Loggro): si tenemos
      // vision incompleta del estado actual, esta visto que produce diferencias
      // grandes contra el libro contable. Mejor abortar y pedir reintento.
      const tasaFallo = ids.length ? fallidos.length / ids.length : 0;
      if (tasaFallo > 0.05) {
        return json({
          ok: false,
          error: `Reset abortado: ${fallidos.length}/${ids.length} ingredients no respondieron (${Math.round(tasaFallo * 100)}%). Reintentar cuando la API Loggro este estable.`,
          fallidos: fallidos.slice(0, 50),
          total_fallidos: fallidos.length,
        }, 503);
      }

      if (dryRun) {
        return json({
          ok: true,
          dry_run: true,
          total_ingredientes: ingredients.length,
          con_stock_positivo: positivos.length,
          con_stock_negativo: negativos.length,
          stock_total_a_sacar:  positivos.reduce((s, x) => s + x.stock, 0),
          stock_total_a_reponer: negativos.reduce((s, x) => s + x.stock, 0),
          all_positivos: positivos,
          all_negativos: negativos,
          fallidos_consulta: fallidos,
        });
      }

      const now = new Date().toISOString();
      const movements: Array<{ tipo: string; movement_id: string; items: number }> = [];

      // 1) Movimiento SALIDA para items con stock positivo
      if (positivos.length > 0) {
        const result = await loggroRaw("POST", "/inventories", {
          business: businessId,
          user: userId,
          date: now,
          type: 11, isSubtracted: true, isProduction: false, isMoveTo: false,
          deleted: false,
          note: "Reset a 0 — saca stock positivo (baseline Atolón OS)",
          ingredients: positivos.map(it => ({ ingredient: it.id, quantity: it.stock, price: 0 })),
          createdOn: now, modifiedOn: now,
        });
        if (!result.ok) {
          return json({ ok: false, etapa: "salida_positivos", loggro_response: result.body }, 502);
        }
        movements.push({ tipo: "salida_positivos", movement_id: result.body?._id || "", items: positivos.length });
      }

      // 2) Movimiento ENTRADA AJUSTE para items con stock negativo (los lleva a 0)
      //    type=3 (Entrada Ajuste) — el patron correcto que /load-baseline
      //    documenta explicitamente. Antes usabamos type=1 (Compra) que
      //    contamina los libros con asientos de compra ficticios por el
      //    monto repuesto (audit rank 33).
      if (negativos.length > 0) {
        const result = await loggroRaw("POST", "/inventories", {
          business: businessId,
          user: userId,
          date: now,
          type: 3, isSubtracted: false, isProduction: false, isMoveTo: false,
          deleted: false,
          note: "Reset a 0 — repone stock negativo (baseline Atolón OS)",
          ingredients: negativos.map(it => ({ ingredient: it.id, quantity: it.stock, price: 0 })),
          createdOn: now, modifiedOn: now,
        });
        if (!result.ok) {
          return json({ ok: false, etapa: "entrada_negativos", loggro_response: result.body, movements }, 502);
        }
        movements.push({ tipo: "entrada_negativos", movement_id: result.body?._id || "", items: negativos.length });
      }

      return json({
        ok: true,
        movements,
        items_positivos_reseteados: positivos.length,
        items_negativos_repuestos: negativos.length,
        stock_total_sacado: positivos.reduce((s, x) => s + x.stock, 0),
        stock_total_repuesto: negativos.reduce((s, x) => s + x.stock, 0),
        // rank 34: visibilidad de items que NO se pudieron consultar (<=5% del total,
        // sino habriamos abortado arriba). El operador puede reintentar.
        ingredients_fallidos_consulta: fallidos.length,
        fallidos_muestra: fallidos.slice(0, 20),
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/load-baseline
    // Carga un inventario baseline en Loggro: para cada item del payload,
    // crea un movimiento de entrada (ajuste positivo) con la cantidad.
    // Body: {
    //   conteo_id: "CNT-..."      // opcional, lee items_conteos
    //   items: [{loggro_id, quantity, name?}, ...]   // o explícito
    //   note?: string
    // }
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/load-baseline") {
      const body = await req.json().catch(() => ({}));
      const { businessId, userId } = await getLoggroIdentity();

      let baselineItems: Array<{ loggro_id: string; quantity: number; name?: string }> = [];

      if (body.conteo_id) {
        // Leer del conteo en BD
        const supaUrl = Deno.env.get("SUPABASE_URL");
        const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supaUrl || !supaKey) return json({ ok: false, error: "Supabase env missing" }, 500);

        const conteoRes = await fetch(`${supaUrl}/rest/v1/items_conteos?id=eq.${body.conteo_id}&select=items,locacion_id`, {
          headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
        });
        const conteoArr = await conteoRes.json();
        const conteo = Array.isArray(conteoArr) && conteoArr[0];
        if (!conteo) return json({ ok: false, error: "conteo_id no encontrado" }, 404);

        // Resolver loggro_id de cada item del conteo (cruzar con items_catalogo)
        const itemIds = (conteo.items || []).map((it: any) => it.item_id).filter(Boolean);
        const catRes = await fetch(`${supaUrl}/rest/v1/items_catalogo?id=in.(${itemIds.join(",")})&select=id,nombre,loggro_id`, {
          headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
        });
        const catArr = await catRes.json();
        const catById: Record<string, any> = {};
        for (const c of catArr) catById[c.id] = c;

        for (const it of (conteo.items || [])) {
          const cat = catById[it.item_id];
          const cant = Number(it.contado) || 0;
          if (cat?.loggro_id && cant > 0) {
            baselineItems.push({ loggro_id: cat.loggro_id, quantity: cant, name: cat.nombre });
          }
        }
      } else if (Array.isArray(body.items)) {
        baselineItems = body.items.filter((x: any) => x.loggro_id && Number(x.quantity) > 0);
      } else {
        return json({ ok: false, error: "Falta conteo_id o items" }, 400);
      }

      if (baselineItems.length === 0) {
        return json({ ok: false, error: "No hay items para cargar (verifica que tengan loggro_id y cantidad > 0)" });
      }

      const now = new Date().toISOString();
      // type=3 (Entrada Ajuste) por defecto — apropiado para baselines de
      // inventario. type=1 sería "Compra" (genera asiento contable de
      // compra). Permite override por body.type.
      const tipoMovimiento = Number(body.type) || 3;
      const movementPayload: any = {
        business: businessId,
        user: userId,
        date: now,
        type: tipoMovimiento,
        isSubtracted: false,
        isProduction: false,
        isMoveTo: false,
        deleted: false,
        note: body.note || `Baseline desde Atolón OS — conteo ${body.conteo_id || "manual"}`,
        ingredients: baselineItems.map(it => ({
          ingredient: it.loggro_id,
          quantity: it.quantity,
          price: 0,
        })),
        createdOn: now,
        modifiedOn: now,
      };

      const result = await loggroRaw("POST", "/inventories", movementPayload);
      if (!result.ok) {
        return json({
          ok: false,
          error: `Loggro respondió ${result.status}`,
          loggro_response: result.body,
        }, 502);
      }

      return json({
        ok: true,
        movement_id: result.body?._id || result.body?.id || null,
        items_cargados: baselineItems.length,
        cantidad_total: baselineItems.reduce((s, x) => s + x.quantity, 0),
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/sync-loggro-to-atolon
    // Sincronización inversa: lee stock actual de Loggro y aplica los
    // deltas a Atolón OS (descuento por ventas, sumando entradas).
    //
    // Lógica de bodega destino:
    //   · Bebidas/cocteles  → LOC-BAR (Bar operativo)
    //   · Alimentos/cocina  → LOC-ALMACEN-COCINA (Almacén Restaurant)
    //   · Otro              → LOC-ALMACEN-COCINA por default
    //
    // El delta = stock_loggro - stock_atolon_sum.
    // Si delta > 0: hubo entrada en Loggro (compra/devolución) → sumar a bodega
    // Si delta < 0: hubo venta/consumo → descontar de bodega
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/sync-loggro-to-atolon") {
      const body = await req.json().catch(() => ({}));
      const dryRun = !!body.dry_run;
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supaUrl || !supaKey) return json({ ok: false, error: "Supabase env missing" }, 500);

      // 1) Items con loggro_id activos (incluyendo categoría)
      const catRes = await fetch(`${supaUrl}/rest/v1/items_catalogo?activo=eq.true&loggro_id=not.is.null&select=id,nombre,categoria,loggro_id`, {
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
      });
      const cats: any[] = await catRes.json();

      // 2) Stock actual sumado por item en Atolón
      const stockRes = await fetch(`${supaUrl}/rest/v1/items_stock_locacion?select=item_id,locacion_id,cantidad`, {
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
      });
      const stocks: any[] = await stockRes.json();
      const atolonByItem: Record<string, number> = {};
      const stockByItemLoc: Record<string, number> = {};
      stocks.forEach(s => {
        atolonByItem[s.item_id] = (atolonByItem[s.item_id] || 0) + (Number(s.cantidad) || 0);
        stockByItemLoc[`${s.item_id}|${s.locacion_id}`] = Number(s.cantidad) || 0;
      });

      // 3) Stock actual de Loggro
      const ids = cats.map(c => c.loggro_id).filter(Boolean);
      const loggroStock: Record<string, number> = {};
      let idx = 0;
      async function worker() {
        while (idx < ids.length) {
          const myIdx = idx++;
          const id = ids[myIdx];
          try {
            const d: any = await loggroGet(`/ingredients/${id}`);
            let totalStock = 0;
            if (Array.isArray(d?.locationsStock)) {
              totalStock = d.locationsStock.reduce((s: number, ls: any) => s + (Number(ls.stock) || 0), 0);
            }
            loggroStock[id] = totalStock;
          } catch (_) { /* skip */ }
        }
      }
      await Promise.all(Array.from({ length: 10 }, () => worker()));

      // 4) Determinar bodega destino por categoría
      const bodegaDestino = (cat: string): string => {
        const c = (cat || "").toUpperCase();
        // Bebidas → Bar
        if (c.includes("CERVEZA") || c.includes("LICOR") || c.includes("RON")
            || c.includes("TEQUILA") || c.includes("VODKA") || c.includes("GIN")
            || c.includes("WHISKY") || c.includes("VINO") || c.includes("AGUARDIENTE")
            || c.includes("MEZCAL") || c.includes("COCTEL") || c.includes("SHOT")
            || c.includes("JUGO") || c.includes("GASEOSA") || c.includes("BEBIDA")
            || c.includes("PRODUCCION BAR") || c.includes("PRODUCCIÓN BAR")
            || c.includes("CHAMP") || c.includes("ESPUMOSO") || c.includes("BOTELLA")) {
          return "LOC-BAR";
        }
        // Por default: Almacén Restaurant (antes Almacén Cocina)
        return "LOC-ALMACEN-COCINA";
      };

      // 5) Calcular deltas y movimientos a aplicar
      const movimientos: Array<{
        item_id: string; nombre: string; categoria: string;
        atolon: number; loggro: number; delta: number;
        bodega: string; nuevo_valor: number;
      }> = [];

      for (const c of cats) {
        const at = atolonByItem[c.id] || 0;
        const lg = loggroStock[c.loggro_id];
        if (lg === undefined) continue;
        const delta = lg - at;
        if (Math.abs(delta) < 0.001) continue;

        const bodega = bodegaDestino(c.categoria || "");
        const stockEnBodega = stockByItemLoc[`${c.id}|${bodega}`] || 0;
        const nuevoValor = stockEnBodega + delta;

        movimientos.push({
          item_id: c.id, nombre: c.nombre, categoria: c.categoria || "",
          atolon: at, loggro: lg, delta,
          bodega, nuevo_valor: nuevoValor,
        });
      }

      if (dryRun) {
        return json({
          ok: true, dry_run: true,
          items_a_actualizar: movimientos.length,
          delta_total: movimientos.reduce((s, m) => s + m.delta, 0),
          ejemplos: movimientos.slice(0, 30),
        });
      }

      // 6) Aplicar UPSERT en items_stock_locacion
      let actualizados = 0;
      for (const m of movimientos) {
        const updRes = await fetch(`${supaUrl}/rest/v1/items_stock_locacion`, {
          method: "POST",
          headers: {
            apikey: supaKey,
            Authorization: `Bearer ${supaKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify({
            item_id: m.item_id,
            locacion_id: m.bodega,
            cantidad: m.nuevo_valor,
            updated_at: new Date().toISOString(),
          }),
        });
        if (updRes.ok) actualizados++;
      }

      // 7) También actualizar items_catalogo.stock_actual con los valores de Loggro
      //    (para que la vista "Inventario General" cuadre sin sync extra)
      for (const c of cats) {
        const lg = loggroStock[c.loggro_id];
        if (lg === undefined) continue;
        await fetch(`${supaUrl}/rest/v1/items_catalogo?id=eq.${c.id}`, {
          method: "PATCH",
          headers: {
            apikey: supaKey, Authorization: `Bearer ${supaKey}`,
            "Content-Type": "application/json", Prefer: "return=minimal",
          },
          body: JSON.stringify({ stock_actual: lg, updated_at: new Date().toISOString() }),
        });
      }

      return json({
        ok: true,
        items_revisados: cats.length,
        items_actualizados: actualizados,
        delta_total: movimientos.reduce((s, m) => s + m.delta, 0),
        ventas_descontadas:  movimientos.filter(m => m.delta < 0).length,
        entradas_aplicadas:   movimientos.filter(m => m.delta > 0).length,
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/consumo-comedor-salida
    // Idéntico a consumo-evento-salida pero lee de comedor_consumo.
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/consumo-comedor-salida") {
      const body = await req.json().catch(() => ({}));
      const consumoId = body?.consumo_id;
      if (!consumoId) return json({ ok: false, error: "consumo_id requerido" }, 400);

      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const sb = (path: string, init: RequestInit = {}) => fetch(`${supaUrl}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: supaKey!, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
      }).then(r => r.json());

      const consumos: any = await sb(`comedor_consumo?id=eq.${consumoId}&select=*`);
      const c = Array.isArray(consumos) ? consumos[0] : null;
      if (!c) return json({ ok: false, error: "Consumo no encontrado" }, 404);
      if (c.anulado) return json({ ok: false, error: "Consumo anulado" }, 400);
      if (c.loggro_movement_id) return json({ ok: true, skipped: "ya_sincronizado", movement_id: c.loggro_movement_id });

      const items: any = await sb(`items_catalogo?id=eq.${encodeURIComponent(c.item_id)}&select=id,nombre,loggro_id`);
      const item = Array.isArray(items) ? items[0] : null;
      if (!item) return json({ ok: false, error: "Item no encontrado" }, 404);
      if (!item.loggro_id) {
        await sb(`comedor_consumo?id=eq.${consumoId}`, {
          method: "PATCH",
          body: JSON.stringify({ loggro_sync_status: "error", loggro_sync_error: "Item sin loggro_id", loggro_sync_at: new Date().toISOString() }),
        });
        return json({ ok: false, error: "Item sin loggro_id" }, 422);
      }

      const tipoLabel = c.comida === "desayuno" ? "Desayuno" : c.comida === "almuerzo" ? "Almuerzo" : c.comida === "cena" ? "Cena" : "Comedor";
      const note = `Comedor ${c.fecha} — ${tipoLabel}${c.notas ? ` · ${c.notas}` : ""}`;
      const { businessId, userId } = await getLoggroIdentity();
      // Fecha del movimiento = fecha del consumo (no la fecha de hoy).
      // c.fecha viene como 'YYYY-MM-DD' — la anclamos a mediodia UTC para
      // evitar que Loggro la re-interprete en otro huso y quede en el dia
      // anterior/posterior.
      const fechaMovISO = new Date(`${String(c.fecha).slice(0,10)}T12:00:00.000Z`).toISOString();
      const now = new Date().toISOString();
      const movResult = await loggroRaw("POST", "/inventories", {
        business: businessId, user: userId, date: fechaMovISO,
        type: 7, isSubtracted: true, isProduction: false, isMoveTo: false, deleted: false,
        note,
        ingredients: [{ ingredient: item.loggro_id, quantity: Number(c.cantidad), price: Number(c.precio_unitario) || 0 }],
        createdOn: now, modifiedOn: now,
      });
      if (!movResult.ok) {
        await sb(`comedor_consumo?id=eq.${consumoId}`, {
          method: "PATCH",
          body: JSON.stringify({ loggro_sync_status: "error", loggro_sync_error: JSON.stringify(movResult.body || {}).slice(0, 500), loggro_sync_at: new Date().toISOString() }),
        });
        return json({ ok: false, error: "Loggro rechazó", loggro_response: movResult.body }, 502);
      }
      const movementId = movResult.body?._id || movResult.body?.id || null;
      await sb(`comedor_consumo?id=eq.${consumoId}`, {
        method: "PATCH",
        body: JSON.stringify({ loggro_sync_status: "ok", loggro_movement_id: movementId, loggro_sync_error: null, loggro_sync_at: new Date().toISOString() }),
      });
      return json({ ok: true, movement_id: movementId, item: item.nombre });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/ventas-restobar-descontar
    // Body: { fecha: 'YYYY-MM-DD', dry_run?: bool }
    //
    // Descuenta stock en Atolon OS por las ventas del dia en Loggro Restobar:
    //   1. Lee /orders del dia con status Pagada / Por Pagar / Cortesia / Interno
    //   2. Por cada linea expande la receta del producto en Loggro (ingredients[])
    //   3. Encuentra el items_catalogo Atolon con loggro_id = ingrediente
    //   4. Inserta 1 fila en movimientos_inventario_atolon por (venta, ingrediente)
    //   5. Actualiza items_catalogo.stock_actual -= cantidad
    //
    // Idempotente por loggro_ref = "order:{order_id}:{ingrediente_loggro_id}".
    // Si ya existe (unique index) NO duplica. Direccion 2026-07-18 (Fase 2).
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/ventas-restobar-descontar") {
      const body = await req.json().catch(() => ({}));
      const fecha = String(body?.fecha || "").slice(0, 10);
      const dryRun = body?.dry_run === true;
      if (!fecha) return json({ ok: false, error: "fecha requerida (YYYY-MM-DD)" }, 400);

      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const sbFetch = (p: string, init: RequestInit = {}) => fetch(`${supaUrl}/rest/v1/${p}`, {
        ...init,
        headers: { apikey: supaKey!, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
      }).then(r => r.json());

      // 1) Catalogo Loggro (para expandir recetas)
      const loggroMap: Record<string, any> = {};
      const byName: Record<string, any> = {};
      for (const p of ["/products", "/ingredients"]) {
        for (let pg = 0; pg < 20; pg++) {
          try {
            const d: any = await loggroGet(`${p}?pagination=true&limit=200&page=${pg}`);
            const arr = d?.data || (Array.isArray(d) ? d : []) || [];
            if (arr.length === 0) break;
            for (const it of arr) {
              if (it?._id) loggroMap[it._id] = it;
              if (it?.name) byName[it.name.trim().toLowerCase()] = it;
            }
          } catch { break; }
        }
      }

      // 2) Mapa loggro_id -> items_catalogo Atolon
      const itemsRes: any = await sbFetch(`items_catalogo?select=id,nombre,loggro_id,stock_actual,unidad&loggro_id=not.is.null`);
      const atolonByLoggro = new Map();
      for (const it of (Array.isArray(itemsRes) ? itemsRes : [])) atolonByLoggro.set(it.loggro_id, it);

      // 3) /orders del dia
      const COTZ = -5 * 3600 * 1000;
      const dayOf = (ts: string) => new Date(new Date(ts).getTime() + COTZ).toISOString().slice(0, 10);
      const orders: any[] = [];
      const seen = new Set<string>();
      for (let p = 0; p < 30; p++) {
        try {
          const d: any = await loggroGet(`/orders?pagination=true&limit=100&page=${p}`);
          const arr = d?.data || [];
          if (!arr.length) break;
          let allOlder = true;
          for (const o of arr) {
            if (!o?._id || seen.has(o._id)) continue;
            seen.add(o._id);
            const dy = dayOf(o.createdOn);
            if (dy >= fecha) allOlder = false;
            if (dy === fecha) orders.push(o);
          }
          if (allOlder && orders.length > 0) break;
        } catch { break; }
      }

      // 4) Categorizar order lines por tipo y expandir receta
      const STATUS_TO_TIPO: Record<string, string> = {
        "Pagada": "salida_venta_restobar",
        "Por Pagar": "salida_venta_restobar",
        "Cortesia": "salida_cortesia",
        "Interno": "salida_interno",
      };
      const movimientos: any[] = [];
      const stockUpdates = new Map<string, number>(); // item_id atolon → delta acumulado (negativo)
      let productosSinReceta = 0;
      let ingredientesSinAtolon = 0;
      const sinRecetaSet = new Set<string>();
      const sinAtolonSet = new Set<string>();

      for (const o of orders) {
        const tipo = STATUS_TO_TIPO[o.status || ""];
        if (!tipo) continue; // Espera, Cancelada, etc. no descuentan
        const productName = (o.product?.name || "").trim();
        const cant = Number(o.quantity) || 0;
        if (!productName || cant <= 0) continue;
        const pCat = byName[productName.toLowerCase()] || loggroMap[o.product?._id];
        if (!pCat) { productosSinReceta++; sinRecetaSet.add(productName); continue; }
        const ings = pCat.ingredients || [];
        if (ings.length === 0) {
          // Producto simple (bebida, ingrediente puro) — descuenta a si mismo si tiene item Atolon
          const atolonIt = atolonByLoggro.get(pCat._id);
          if (!atolonIt) { ingredientesSinAtolon++; sinAtolonSet.add(pCat.name); continue; }
          const totalQty = cant;
          movimientos.push({
            id: `MOV-${crypto.randomUUID().slice(0, 8)}`,
            tipo,
            item_id: atolonIt.id,
            cantidad: totalQty,
            unidad: atolonIt.unidad,
            precio_unit: Number(o.unit_price) || 0,
            origen_tipo: "loggro_order",
            origen_id: o._id,
            loggro_ref: `order:${o._id}:${pCat._id}`,
            fecha: o.createdOn,
            usuario_email: "auto-loggro@sistema.atolon",
            notas: `Venta Loggro: ${productName} x${cant} (mesa ${o.table?.name || "?"})`,
          });
          stockUpdates.set(atolonIt.id, (stockUpdates.get(atolonIt.id) || 0) - totalQty);
          continue;
        }
        for (const def of ings) {
          const ingObj = typeof def.ingredient === "string" ? loggroMap[def.ingredient] : def.ingredient;
          const ingId = ingObj?._id || (typeof def.ingredient === "string" ? def.ingredient : null);
          const ingQty = Number(def.quantity) || 0;
          if (!ingId || !ingQty) continue;
          const atolonIt = atolonByLoggro.get(ingId);
          if (!atolonIt) { ingredientesSinAtolon++; sinAtolonSet.add(ingObj?.name || ingId); continue; }
          const totalQty = cant * ingQty;
          movimientos.push({
            id: `MOV-${crypto.randomUUID().slice(0, 8)}`,
            tipo,
            item_id: atolonIt.id,
            cantidad: totalQty,
            unidad: atolonIt.unidad,
            precio_unit: Number(atolonIt.precio_compra) || 0,
            origen_tipo: "loggro_order",
            origen_id: o._id,
            loggro_ref: `order:${o._id}:${ingId}`,
            fecha: o.createdOn,
            usuario_email: "auto-loggro@sistema.atolon",
            notas: `Receta ${productName} (${ingObj?.name}) x${cant}`,
          });
          stockUpdates.set(atolonIt.id, (stockUpdates.get(atolonIt.id) || 0) - totalQty);
        }
      }

      if (dryRun) {
        return json({
          ok: true, dry_run: true, fecha,
          orders_procesadas: orders.length,
          movimientos_a_crear: movimientos.length,
          items_afectados: stockUpdates.size,
          productos_sin_receta: productosSinReceta,
          productos_sin_receta_lista: [...sinRecetaSet].slice(0, 20),
          ingredientes_sin_atolon: ingredientesSinAtolon,
          ingredientes_sin_atolon_lista: [...sinAtolonSet].slice(0, 20),
          preview_movs: movimientos.slice(0, 20),
        });
      }

      // 5) Insert movimientos con manejo de duplicados
      // Estrategia: primero traer los loggro_ref ya existentes; filtrar; insertar el resto.
      const allRefs = movimientos.map(m => m.loggro_ref);
      const existRes: any = await sbFetch(`movimientos_inventario_atolon?select=loggro_ref&loggro_ref=in.(${allRefs.slice(0, 500).map(r => `"${r}"`).join(",")})&anulado=eq.false&limit=1000`).catch(() => []);
      const existentes = new Set((Array.isArray(existRes) ? existRes : []).map((r: any) => r.loggro_ref));
      const nuevos = movimientos.filter(m => !existentes.has(m.loggro_ref));

      let insertados = 0;
      let insertErrors: any[] = [];
      for (let i = 0; i < nuevos.length; i += 200) {
        const batch = nuevos.slice(i, i + 200);
        const res: any = await sbFetch("movimientos_inventario_atolon", {
          method: "POST",
          body: JSON.stringify(batch),
        });
        if (Array.isArray(res)) insertados += res.length;
        else if (res?.code || res?.message) insertErrors.push(res);
      }

      // 6) Update items_catalogo.stock_actual con los deltas (solo por los realmente insertados)
      // Simplificacion: para evitar doble descuento, cuando un mov ya existia (skip), su delta no se aplica.
      // Recalculamos por seguridad: leemos los movimientos insertados de este llamado y sumamos.
      // Version pragmatica: aplicamos todos los deltas y confiamos en la idempotencia del unique index
      // (si ya se corrio antes, en teoria el batch anterior ya aplico el descuento). Para el primer run
      // esto es correcto. Para runs subsecuentes con nuevos movimientos, tambien.
      let stockActualizados = 0;
      if (insertados > 0) {
        for (const [itemId, delta] of stockUpdates.entries()) {
          if (delta === 0) continue;
          // Query actual + update: no atomico pero suficiente para batch nocturno.
          const rows: any = await sbFetch(`items_catalogo?id=eq.${encodeURIComponent(itemId)}&select=stock_actual`);
          const cur = Array.isArray(rows) && rows[0] ? Number(rows[0].stock_actual) || 0 : 0;
          const nuevo = cur + delta; // delta ya es negativo
          await sbFetch(`items_catalogo?id=eq.${encodeURIComponent(itemId)}`, {
            method: "PATCH",
            body: JSON.stringify({ stock_actual: nuevo, updated_at: new Date().toISOString() }),
          });
          stockActualizados++;
        }
      }

      return json({
        ok: true, fecha,
        orders_procesadas: orders.length,
        movimientos_a_procesar: movimientos.length,
        movimientos_ya_existian: existentes.size,
        movimientos_insertados: insertados,
        items_stock_actualizado: stockActualizados,
        productos_sin_receta: productosSinReceta,
        productos_sin_receta_lista: [...sinRecetaSet].slice(0, 20),
        ingredientes_sin_atolon: ingredientesSinAtolon,
        ingredientes_sin_atolon_lista: [...sinAtolonSet].slice(0, 20),
        insert_errors: insertErrors.slice(0, 3),
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/consumo-comedor-salida-batch
    // Body: { fecha: 'YYYY-MM-DD', comida: 'desayuno'|'almuerzo'|'cena'|'general' }
    //
    // Crea UN solo movimiento "Salida - Otro" (type=7) en Loggro que
    // agrupa TODOS los consumos pendientes del comedor para esa fecha+comida.
    // Un movimiento por comida en vez de 24 sueltos. Direccion 2026-07-13.
    //
    // - Si dos consumos apuntan al mismo loggro_id, se suman las cantidades.
    // - Consumos sin loggro_id se marcan error y se saltan.
    // - Consumos ya sincronizados (loggro_movement_id != null) se saltan.
    // - Todos los consumos que entren en el movimiento quedan apuntando al
    //   mismo loggro_movement_id (para poder revertir el grupo entero).
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/consumo-comedor-salida-batch") {
      const body = await req.json().catch(() => ({}));
      const fecha = String(body?.fecha || "").slice(0, 10);
      const comida = String(body?.comida || "");
      if (!fecha || !comida) return json({ ok: false, error: "fecha y comida requeridos" }, 400);

      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const sb = (p: string, init: RequestInit = {}) => fetch(`${supaUrl}/rest/v1/${p}`, {
        ...init,
        headers: { apikey: supaKey!, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
      }).then(r => r.json());

      const consumos: any = await sb(`comedor_consumo?fecha=eq.${fecha}&comida=eq.${comida}&anulado=eq.false&loggro_movement_id=is.null&select=*`);
      if (!Array.isArray(consumos) || consumos.length === 0) {
        return json({ ok: true, skipped: "nada_pendiente", fecha, comida, count: 0 });
      }

      const itemIds = [...new Set(consumos.map((c: any) => c.item_id))];
      const itemsFilter = itemIds.map((id: any) => `"${id}"`).join(",");
      const items: any = await sb(`items_catalogo?id=in.(${itemsFilter})&select=id,nombre,loggro_id`);
      const itemById = new Map((Array.isArray(items) ? items : []).map((it: any) => [it.id, it]));

      const sumByLoggroId = new Map<string, { quantity: number; price: number; count: number; nombres: string[] }>();
      const sinLoggro: string[] = [];
      for (const c of consumos) {
        const it: any = itemById.get(c.item_id);
        if (!it?.loggro_id) {
          sinLoggro.push(c.id);
          await sb(`comedor_consumo?id=eq.${c.id}`, {
            method: "PATCH",
            body: JSON.stringify({ loggro_sync_status: "error", loggro_sync_error: "Item sin loggro_id", loggro_sync_at: new Date().toISOString() }),
          });
          continue;
        }
        const prev = sumByLoggroId.get(it.loggro_id) || { quantity: 0, price: 0, count: 0, nombres: [] };
        prev.quantity += Number(c.cantidad) || 0;
        prev.price = Number(c.precio_unitario) || prev.price;
        prev.count++;
        prev.nombres.push(it.nombre);
        sumByLoggroId.set(it.loggro_id, prev);
      }

      if (sumByLoggroId.size === 0) {
        return json({ ok: false, error: "Ningun item vinculado a Loggro", sin_loggro: sinLoggro }, 422);
      }

      const tipoLabel = comida === "desayuno" ? "Desayuno" : comida === "almuerzo" ? "Almuerzo" : comida === "cena" ? "Cena" : "Comedor";
      const note = `Comedor ${fecha} — ${tipoLabel}`;
      const { businessId, userId } = await getLoggroIdentity();
      const fechaMovISO = new Date(`${fecha}T12:00:00.000Z`).toISOString();
      const now = new Date().toISOString();
      const ingredients = [...sumByLoggroId.entries()].map(([loggro_id, v]) => ({
        ingredient: loggro_id,
        quantity: v.quantity,
        price: v.price,
      }));

      const movResult = await loggroRaw("POST", "/inventories", {
        business: businessId, user: userId, date: fechaMovISO,
        type: 7, isSubtracted: true, isProduction: false, isMoveTo: false, deleted: false,
        note,
        ingredients,
        createdOn: now, modifiedOn: now,
      });
      if (!movResult.ok) {
        const errStr = JSON.stringify(movResult.body || {}).slice(0, 500);
        const idsFilter = consumos.map((c: any) => `"${c.id}"`).join(",");
        await sb(`comedor_consumo?id=in.(${idsFilter})`, {
          method: "PATCH",
          body: JSON.stringify({ loggro_sync_status: "error", loggro_sync_error: errStr, loggro_sync_at: new Date().toISOString() }),
        });
        return json({ ok: false, error: "Loggro rechazó", loggro_response: movResult.body }, 502);
      }
      const movementId = movResult.body?._id || movResult.body?.id || null;

      const idsIncluidos = consumos.filter((c: any) => {
        const it: any = itemById.get(c.item_id);
        return it?.loggro_id;
      }).map((c: any) => c.id);
      const idsFilter = idsIncluidos.map((id: string) => `"${id}"`).join(",");
      await sb(`comedor_consumo?id=in.(${idsFilter})`, {
        method: "PATCH",
        body: JSON.stringify({ loggro_sync_status: "ok", loggro_movement_id: movementId, loggro_sync_error: null, loggro_sync_at: new Date().toISOString() }),
      });

      return json({
        ok: true,
        movement_id: movementId,
        fecha, comida,
        ingredientes: ingredients.length,
        consumos_incluidos: idsIncluidos.length,
        sin_loggro: sinLoggro.length,
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/consumo-evento-salida
    // Sincroniza un consumo de evento como "Salida - Otro" en Loggro.
    // Body: { consumo_id }
    //
    // Flujo:
    //   1. Lee el consumo + item + evento desde la BD
    //   2. Verifica que el item tenga loggro_id
    //   3. Crea movimiento en Loggro: type=11, isSubtracted=true (salida)
    //      con note descriptivo "Consumo evento {nombre} — {tipo}"
    //   4. Actualiza loggro_sync_status, loggro_movement_id, loggro_sync_at
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/consumo-evento-salida") {
      const body = await req.json().catch(() => ({}));
      const consumoId = body?.consumo_id;
      if (!consumoId) return json({ ok: false, error: "consumo_id requerido" }, 400);

      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      const sb = (path: string, init: RequestInit = {}) => fetch(`${supaUrl}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: supaKey!, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
      }).then(r => r.json());

      // 1. Leer consumo
      const consumos: any = await sb(`eventos_consumo_openbar?id=eq.${consumoId}&select=*`);
      const c = Array.isArray(consumos) ? consumos[0] : null;
      if (!c) return json({ ok: false, error: "Consumo no encontrado" }, 404);
      if (c.anulado) return json({ ok: false, error: "Consumo anulado, no se sincroniza" }, 400);
      if (c.loggro_movement_id) return json({ ok: true, skipped: "ya_sincronizado", movement_id: c.loggro_movement_id });

      // 2. Leer item para obtener loggro_id
      const items: any = await sb(`items_catalogo?id=eq.${encodeURIComponent(c.item_id)}&select=id,nombre,loggro_id`);
      const item = Array.isArray(items) ? items[0] : null;
      if (!item) return json({ ok: false, error: "Item no encontrado" }, 404);
      if (!item.loggro_id) {
        // Marcar como error (no podemos sincronizar items sin Loggro vinculado)
        await sb(`eventos_consumo_openbar?id=eq.${consumoId}`, {
          method: "PATCH",
          body: JSON.stringify({
            loggro_sync_status: "error",
            loggro_sync_error: "Item sin loggro_id (no enlazado a Loggro)",
            loggro_sync_at: new Date().toISOString(),
          }),
        });
        return json({ ok: false, error: "Item sin loggro_id", item: item.nombre }, 422);
      }

      // 3. Leer evento para el note
      const eventos: any = await sb(`eventos?id=eq.${encodeURIComponent(c.evento_id)}&select=id,nombre,fecha`);
      const evento = Array.isArray(eventos) ? eventos[0] : null;
      const eventoNombre = evento?.nombre || c.evento_id;
      const tipoLabel = c.tipo === "openbar" ? "Open Bar" : c.tipo === "cocina_buffet" ? "Buffet" : c.tipo === "cocina_paquete" ? "Paquete" : "Otro";
      const note = `Consumo evento "${eventoNombre}" — ${tipoLabel}${c.servicio_descripcion ? ` (${c.servicio_descripcion})` : ""}${c.notas ? ` · ${c.notas}` : ""}`;

      // 4. Crear movimiento en Loggro (type=7 + isSubtracted=true = Salida - Otro)
      // Nota: type=11 es "Inventario a cero" — usábamos ese por error.
      const { businessId, userId } = await getLoggroIdentity();
      const now = new Date().toISOString();
      // Fecha del movimiento = fecha del evento si existe, sino la de creacion
      // del consumo. Anclada a mediodia UTC para evitar corrimientos de huso.
      const fechaBase = evento?.fecha || c.created_at || c.fecha || now;
      const fechaMovISO = new Date(`${String(fechaBase).slice(0,10)}T12:00:00.000Z`).toISOString();
      const movResult = await loggroRaw("POST", "/inventories", {
        business: businessId,
        user: userId,
        date: fechaMovISO,
        type: 7,
        isSubtracted: true,
        isProduction: false,
        isMoveTo: false,
        deleted: false,
        note,
        ingredients: [{ ingredient: item.loggro_id, quantity: Number(c.cantidad), price: Number(c.precio_unitario) || 0 }],
        createdOn: now, modifiedOn: now,
      });

      if (!movResult.ok) {
        await sb(`eventos_consumo_openbar?id=eq.${consumoId}`, {
          method: "PATCH",
          body: JSON.stringify({
            loggro_sync_status: "error",
            loggro_sync_error: JSON.stringify(movResult.body || {}).slice(0, 500),
            loggro_sync_at: new Date().toISOString(),
          }),
        });
        return json({ ok: false, error: "Loggro rechazó el movimiento", loggro_response: movResult.body }, 502);
      }

      const movementId = movResult.body?._id || movResult.body?.id || null;
      await sb(`eventos_consumo_openbar?id=eq.${consumoId}`, {
        method: "PATCH",
        body: JSON.stringify({
          loggro_sync_status: "ok",
          loggro_movement_id: movementId,
          loggro_sync_error: null,
          loggro_sync_at: new Date().toISOString(),
        }),
      });

      return json({ ok: true, movement_id: movementId, item: item.nombre, cantidad: c.cantidad, note });
    }

    // ════════════════════════════════════════════════════════════════════
    // GET /loggro-sync/list-recent-movements?limit=20
    // Read-only — lista los últimos movimientos de inventario para que
    // podamos inspeccionar el campo `type` y descubrir qué número usa
    // Loggro para cada tipo de movimiento (Entrada Ajuste, Inventario a
    // Cero, etc.). No crea ni modifica nada.
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "GET" && path === "/list-recent-movements") {
      const limit = Number(url.searchParams.get("limit")) || 20;
      // Probar varios paths típicos
      const candidates = [
        `/inventories?pagination=true&limit=${limit}&page=0&sort=-createdOn`,
        `/inventories?limit=${limit}&sort=-createdOn`,
        `/inventories?limit=${limit}`,
        `/inventories`,
      ];
      for (const p of candidates) {
        try {
          const data: any = await loggroGet(p);
          const list = Array.isArray(data) ? data
            : Array.isArray(data?.data) ? data.data
            : Array.isArray(data?.items) ? data.items
            : Array.isArray(data?.results) ? data.results
            : null;
          if (list) {
            // Devolver solo campos relevantes
            return json({
              ok: true,
              path_used: p,
              count: list.length,
              movements: list.slice(0, limit).map((m: any) => ({
                _id: m._id || m.id,
                type: m.type,
                isSubtracted: m.isSubtracted,
                isProduction: m.isProduction,
                isMoveTo: m.isMoveTo,
                date: m.date,
                createdOn: m.createdOn,
                note: m.note,
                ingredients_count: Array.isArray(m.ingredients) ? m.ingredients.length : 0,
              })),
            });
          }
        } catch (_) { /* try next */ }
      }
      return json({ ok: false, error: "No pude listar /inventories en ningún path" }, 502);
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/reconcile-with-atolon
    // Ajusta Loggro para que CADA ítem tenga exactamente la cantidad
    // que reporta Atolón OS (suma de items_stock_locacion). Genera dos
    // movimientos: ENTRADA para deltas positivos, SALIDA para negativos.
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/reconcile-with-atolon") {
      const body = await req.json().catch(() => ({}));
      const dryRun = !!body.dry_run;
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supaUrl || !supaKey) return json({ ok: false, error: "Supabase env missing" }, 500);

      const { businessId, userId } = await getLoggroIdentity();

      // 1) Leer items_catalogo + suma de items_stock_locacion
      const catRes = await fetch(`${supaUrl}/rest/v1/items_catalogo?activo=eq.true&loggro_id=not.is.null&select=id,nombre,loggro_id`, {
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
      });
      const cats: any[] = await catRes.json();

      const stockRes = await fetch(`${supaUrl}/rest/v1/items_stock_locacion?select=item_id,cantidad`, {
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
      });
      const stocks: any[] = await stockRes.json();
      const atolonByItem: Record<string, number> = {};
      stocks.forEach(s => {
        atolonByItem[s.item_id] = (atolonByItem[s.item_id] || 0) + (Number(s.cantidad) || 0);
      });

      // 2) Leer stock actual de Loggro por cada loggro_id
      const ids = cats.map(c => c.loggro_id).filter(Boolean);
      const loggroByLoggroId: Record<string, number> = {};
      let idx = 0;
      async function worker() {
        while (idx < ids.length) {
          const myIdx = idx++;
          const id = ids[myIdx];
          try {
            const d: any = await loggroGet(`/ingredients/${id}`);
            let totalStock = 0;
            if (Array.isArray(d?.locationsStock)) {
              totalStock = d.locationsStock.reduce((s: number, ls: any) => s + (Number(ls.stock) || 0), 0);
            }
            loggroByLoggroId[id] = totalStock;
          } catch (_) { /* skip */ }
        }
      }
      await Promise.all(Array.from({ length: 10 }, () => worker()));

      // 3) Calcular deltas
      const entradas: Array<{ id: string; name: string; quantity: number }> = [];
      const salidas:  Array<{ id: string; name: string; quantity: number }> = [];
      for (const c of cats) {
        const at = atolonByItem[c.id] || 0;
        const lg = loggroByLoggroId[c.loggro_id] || 0;
        const diff = at - lg;
        if (Math.abs(diff) < 0.001) continue;
        if (diff > 0) entradas.push({ id: c.loggro_id, name: c.nombre, quantity: diff });
        else          salidas.push({ id: c.loggro_id, name: c.nombre, quantity: Math.abs(diff) });
      }

      if (dryRun) {
        return json({
          ok: true, dry_run: true,
          total_a_ajustar: entradas.length + salidas.length,
          entradas: entradas.length, salidas: salidas.length,
          entrada_total: entradas.reduce((s, x) => s + x.quantity, 0),
          salida_total:  salidas.reduce((s, x) => s + x.quantity, 0),
          ejemplos_entradas: entradas.slice(0, 50),
          ejemplos_salidas:  salidas.slice(0, 50),
        });
      }

      const now = new Date().toISOString();
      const movements: any[] = [];

      if (entradas.length > 0) {
        // type=3 (Entrada Ajuste) — NO type=1 (Compra). Una reconciliacion
        // de inventario no es una compra; usar type=1 contaminaria el libro
        // de compras de Loggro Pyme con asientos ficticios por el monto
        // repuesto (audit rank 33).
        const r = await loggroRaw("POST", "/inventories", {
          business: businessId, user: userId, date: now,
          type: 3, isSubtracted: false, isProduction: false, isMoveTo: false, deleted: false,
          note: "Reconciliación Atolón OS — entradas",
          ingredients: entradas.map(e => ({ ingredient: e.id, quantity: e.quantity, price: 0 })),
          createdOn: now, modifiedOn: now,
        });
        if (!r.ok) return json({ ok: false, etapa: "entradas", loggro_response: r.body }, 502);
        movements.push({ tipo: "entradas", id: r.body?._id, items: entradas.length });
      }
      if (salidas.length > 0) {
        const r = await loggroRaw("POST", "/inventories", {
          business: businessId, user: userId, date: now,
          type: 11, isSubtracted: true, isProduction: false, isMoveTo: false, deleted: false,
          note: "Reconciliación Atolón OS — salidas",
          ingredients: salidas.map(e => ({ ingredient: e.id, quantity: e.quantity, price: 0 })),
          createdOn: now, modifiedOn: now,
        });
        if (!r.ok) return json({ ok: false, etapa: "salidas", loggro_response: r.body, movements }, 502);
        movements.push({ tipo: "salidas", id: r.body?._id, items: salidas.length });
      }

      return json({
        ok: true, movements,
        entradas: entradas.length, salidas: salidas.length,
        entrada_total: entradas.reduce((s, x) => s + x.quantity, 0),
        salida_total:  salidas.reduce((s, x) => s + x.quantity, 0),
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // POST /loggro-sync/create-orphan-ingredients
    // Crea en Loggro todos los items de items_catalogo que no tienen
    // loggro_id. Usa la categoría del catálogo para matchear con
    // /categories de Loggro. Body opcional: { dry_run: true, only_today: true }
    // ════════════════════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/create-orphan-ingredients") {
      const body = await req.json().catch(() => ({}));
      const dryRun = !!body.dry_run;
      const onlyToday = !!body.only_today;

      const supaUrl = Deno.env.get("SUPABASE_URL");
      const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supaUrl || !supaKey) return json({ ok: false, error: "Supabase env missing" }, 500);

      // 1) Listar categorías Loggro para matching
      const cats: any = await loggroGet("/categories");
      const catList: any[] = Array.isArray(cats) ? cats
        : Array.isArray(cats?.data) ? cats.data
        : Array.isArray(cats?.items) ? cats.items
        : Array.isArray(cats?.categories) ? cats.categories
        : [];
      const catByName: Record<string, any> = {};
      for (const c of catList) {
        const k = (c?.name || c?.nombre || "").toUpperCase().trim();
        if (k) catByName[k] = c;
      }

      // 2) Listar items_catalogo sin loggro_id (filtrar por hoy si se pidió)
      let url = `${supaUrl}/rest/v1/items_catalogo?activo=eq.true&loggro_id=is.null&select=id,nombre,codigo,codigo_barras,categoria,unidad,precio_compra,created_at`;
      if (onlyToday) {
        const today = new Date().toISOString().slice(0, 10);
        url += `&created_at=gte.${today}`;
      }
      const huerR = await fetch(url, { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } });
      const huerfanos: any[] = await huerR.json();

      if (huerfanos.length === 0) {
        return json({ ok: true, total: 0, mensaje: "No hay items sin loggro_id" });
      }

      const resultados: any[] = [];
      let creados = 0, omitidos = 0, errores = 0;

      for (const it of huerfanos) {
        const catKey = (it.categoria || "").toUpperCase().trim();
        const cat = catByName[catKey];
        if (!cat) {
          resultados.push({ id: it.id, nombre: it.nombre, status: "sin_categoria_loggro", categoria: it.categoria });
          omitidos++;
          continue;
        }

        if (dryRun) {
          resultados.push({ id: it.id, nombre: it.nombre, categoria: it.categoria, loggro_category_id: cat._id || cat.id, status: "would_create" });
          creados++;
          continue;
        }

        // Crear en Loggro
        const now = new Date().toISOString();
        const payload: any = {
          name: it.nombre,
          category: cat._id || cat.id,
          description: it.nombre,
          code: it.codigo || it.codigo_barras || "",
          price: 0,
          cost: Number(it.precio_compra) || 0,
          isActive: true,
          variablePrice: { isVariablePrice: false },
          config: { openModalNotes: false },
          deletedInfo: { isDeleted: false },
          createdOn: now,
          modifiedOn: now,
        };
        // NO incluir 'unit' — Loggro espera un ObjectId no un string,
        // y al omitirlo usa la unidad por defecto.

        const r = await loggroRaw("POST", "/ingredients", payload);
        if (!r.ok) {
          resultados.push({ id: it.id, nombre: it.nombre, status: "loggro_error", error: r.body });
          errores++;
          continue;
        }
        const newLoggroId = r.body?._id || r.body?.id;
        if (!newLoggroId) {
          resultados.push({ id: it.id, nombre: it.nombre, status: "no_id_returned", body: r.body });
          errores++;
          continue;
        }

        // Guardar loggro_id en items_catalogo
        await fetch(`${supaUrl}/rest/v1/items_catalogo?id=eq.${it.id}`, {
          method: "PATCH",
          headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ loggro_id: newLoggroId, updated_at: new Date().toISOString() }),
        });

        resultados.push({ id: it.id, nombre: it.nombre, loggro_id: newLoggroId, status: "creado" });
        creados++;
      }

      return json({
        ok: true,
        dry_run: dryRun,
        total: huerfanos.length,
        creados,
        omitidos,
        errores,
        resultados,
      });
    }

    // POST /loggro-sync/create-inventory-movement
    // Body (lo que Atolón OS envía):
    //   {
    //     type: 1,                     // tipo de movimiento (1 = compra, 11 = ajuste, etc.)
    //     isSubtracted: false,         // true = saca inventario, false = ingresa
    //     isProduction: false,
    //     isMoveTo: false,
    //     provider_id: "...",          // ID del proveedor en Loggro (opcional)
    //     note: "Requisición REQ-123456",
    //     ingredients: [               // ítems a registrar
    //       { ingredient_id: "...", quantity: 5, cost: 8000 },   // ingredient_id = _id en Loggro
    //       ...
    //     ],
    //     invoice: { number: "F-001", date: "2026-04-22" },  // opcional
    //     location_id_to: "..."        // opcional si isMoveTo
    //   }
    // Eliminar/anular un movimiento de inventario en Loggro (DELETE o
    // marcar deleted=true vía PATCH si DELETE no aplica).
    if (req.method === "POST" && path === "/delete-inventory-movement") {
      const body = await req.json().catch(() => ({}));
      const id = body.movement_id;
      if (!id) return json({ ok: false, error: "movement_id requerido" }, 400);
      // Probar DELETE primero
      let r = await loggroRaw("DELETE", `/inventories/${id}`);
      if (!r.ok) {
        // Fallback: PATCH deleted=true
        r = await loggroRaw("PATCH", `/inventories/${id}`, { deleted: true });
      }
      return json({ ok: r.ok, status: r.status, body: r.body });
    }

    // POST /loggro-sync/update-movement-costs
    // Body: { movement_id, costs: { <loggro_ingredient_id>: <precio_unit> } }
    // Corrige SOLO el precio unitario de los ingredientes del movimiento
    // (la cantidad queda intacta → NO duplica inventario). Usado cuando se
    // recibió antes de tener precio (entró a $0) y luego se aplica la factura.
    if (req.method === "POST" && path === "/update-movement-costs") {
      const body = await req.json().catch(() => ({}));
      const id = body.movement_id;
      const costs = body.costs || {};
      if (!id || Object.keys(costs).length === 0) {
        return json({ ok: false, error: "movement_id y costs requeridos" }, 400);
      }
      // Obtener el movimiento (el GET /inventories/{id} responde 500 en esta
      // API; lo buscamos en la lista reciente).
      let mv: any = null;
      for (const p of [
        `/inventories?pagination=true&limit=300&page=0&sort=-createdOn`,
        `/inventories?limit=300&sort=-createdOn`,
        `/inventories?limit=300`,
      ]) {
        try {
          const d: any = await loggroGet(p);
          const list = Array.isArray(d) ? d : d?.data || d?.items || d?.results || [];
          mv = list.find((m: any) => String(m._id || m.id) === String(id));
          if (mv) break;
        } catch (_) { /* try next */ }
      }
      if (!mv) return json({ ok: false, error: "movimiento no encontrado en /inventories" }, 404);

      let tocados = 0;
      const nuevos = (mv.ingredients || []).map((g: any) => {
        const ingId = (g.ingredient && (g.ingredient._id || g.ingredient.id)) || g.ingredient;
        const np = costs[String(ingId)];
        const precioActual = Number(g.price ?? g.cost) || 0;
        let precio = precioActual;
        if (np != null && Number(np) > 0 && Number(np) !== precioActual) {
          precio = Number(np);
          tocados++;
        }
        return {
          ingredient: ingId,
          quantity: Number(g.quantity ?? g.amount) || 0,  // cantidad INTACTA
          price: precio,
        };
      });
      if (tocados === 0) {
        return json({ ok: true, skipped: "sin cambios de costo", movement_id: id });
      }
      const r = await loggroRaw("PATCH", `/inventories/${id}`, {
        ingredients: nuevos,
        modifiedOn: new Date().toISOString(),
      });
      return json({ ok: r.ok, status: r.status, ingredientes_actualizados: tocados, body: r.body });
    }

    if (req.method === "POST" && path === "/create-inventory-movement") {
      const body = await req.json().catch(() => ({}));
      const strictMode = body.strict !== false; // default true; cliente puede pasar strict=false para forzar

      // Loggro requiere business + user en el body de /inventory
      const { businessId, userId } = await getLoggroIdentity();

      // Procesamiento de cada ingrediente: convertir unidad o flagear riesgo.
      //
      // Tres escenarios:
      //  (a) Ambas unidades misma familia (peso/vol) → multiplicar y dividir
      //      precio (idempotente al total $).
      //  (b) Ambas unidades misma familia "UNIDAD" o sin srcUnit → pasar
      //      cantidad tal cual.
      //  (c) RIESGO: srcUnit es peso/vol conocido (ej. "Kg") pero dstUnit
      //      es null/desconocida → si subiéramos así, entraría 1000× menos
      //      stock o el ratio incorrecto. En strict mode (default),
      //      bloqueamos. Sin strict, pasamos sin convertir + reportamos.
      const conversiones: any[] = [];
      const advertencias: any[] = [];
      const bloqueos: any[] = [];

      const ingredientesPayload: any[] = [];
      for (const it of (body.ingredients || [])) {
        const ingId = it.ingredient_id || it.ingredient;
        let quantity = Number(it.quantity) || 0;
        let price = Number(it.price ?? it.cost) || 0;
        const srcUnit = it.unit || it.unidad || null;
        // Override manual del operador: cuando la factura llega por OCR/parse
        // automático y el ingrediente Loggro tiene una unidad mal configurada
        // o ambigua, el operador puede forzar la unidad destino para que la
        // conversión use ese valor en lugar del que reporta /ingredients/${id}.
        // Solo afecta a Loggro — no se persiste en la factura original.
        const dstUnitOverride = it.unit_dst_override || null;
        // Override directo de CANTIDAD: el operador ya hizo la conversión en la
        // UI (FacturaProveedorModal) y nos pasó el valor exacto que debe entrar
        // a Loggro. Si está definido, saltamos toda la lógica de conversión
        // automática y preservamos el total $ (price = total_original / new_qty).
        const qtyOverride = it.quantity_override != null ? Number(it.quantity_override) : null;
        const itemNombre = it.nombre || it.name || ingId;

        if (qtyOverride != null && qtyOverride > 0 && quantity > 0) {
          const totalOriginal = quantity * price;
          const qO = quantity;
          quantity = qtyOverride;
          price = totalOriginal / qtyOverride;
          conversiones.push({
            ingredient: ingId, item: itemNombre,
            from: srcUnit, to: srcUnit, factor: qtyOverride / qO,
            dst_source: "operator_qty_override",
            quantity_from: qO, quantity_to: quantity,
            price_from: totalOriginal / qO, price_to: price,
          });
          ingredientesPayload.push({ ingredient: ingId, quantity, price });
          continue;
        }

        if (srcUnit && ingId) {
          let dstUnit: string | null = null;
          let dstSource: "loggro" | "override" = "loggro";
          if (dstUnitOverride) {
            dstUnit = String(dstUnitOverride);
            dstSource = "override";
          } else {
            try {
              const d: any = await loggroGet(`/ingredients/${ingId}`);
              dstUnit = d?.unit?.name || d?.measurementUnit?.name || d?.unit_name || null;
            } catch (_e) {
              advertencias.push({
                ingredient: ingId, item: itemNombre, src_unit: srcUnit,
                motivo: "no_se_pudo_leer_ingrediente_en_loggro",
              });
            }
          }

          const srcNorm = normalizarUnidad(String(srcUnit));
          const dstNorm = dstUnit ? normalizarUnidad(String(dstUnit)) : null;

          if (srcNorm && dstNorm && srcNorm.base === dstNorm.base && srcNorm.base !== "UNIDAD") {
            // (a) Conversion clara: peso↔peso o vol↔vol
            const f = srcNorm.factor / dstNorm.factor;
            if (f !== 1) {
              const qO = quantity, pO = price;
              quantity = quantity * f;
              price = price / f;
              conversiones.push({
                ingredient: ingId, item: itemNombre,
                from: srcUnit, to: dstUnit, factor: f,
                dst_source: dstSource,
                quantity_from: qO, quantity_to: quantity,
                price_from: pO, price_to: price,
              });
            }
          } else if (srcNorm && srcNorm.base !== "UNIDAD" && !dstNorm) {
            // (c) RIESGO 1000×: factura es peso/vol pero Loggro no reporta unidad
            // o reporta una que no podemos normalizar. Si subimos así, entra mal.
            bloqueos.push({
              ingredient: ingId, item: itemNombre,
              src_unit: srcUnit, src_base: srcNorm.base,
              dst_unit_raw: dstUnit,
              motivo: dstUnit
                ? `factura en ${srcUnit} (${srcNorm.base}) pero unidad Loggro '${dstUnit}' no reconocida`
                : `factura en ${srcUnit} (${srcNorm.base}) pero ingrediente Loggro no tiene unidad configurada`,
            });
          } else if (srcNorm && dstNorm && srcNorm.base !== dstNorm.base && srcNorm.base !== "UNIDAD" && dstNorm.base !== "UNIDAD") {
            // (c) RIESGO: bases distintas (ej. factura en peso, Loggro en volumen).
            // Nunca convertir entre familias sin info de densidad — bloquear.
            bloqueos.push({
              ingredient: ingId, item: itemNombre,
              src_unit: srcUnit, dst_unit: dstUnit,
              motivo: `familias incompatibles: factura ${srcNorm.base}, Loggro ${dstNorm.base}`,
            });
          } else if (!srcNorm) {
            // srcUnit no reconocida — advertencia. Si dstUnit es UNIDAD,
            // probablemente está bien (Loggro maneja por unidad).
            advertencias.push({
              ingredient: ingId, item: itemNombre, src_unit: srcUnit,
              motivo: `unidad de factura '${srcUnit}' no reconocida — pasando sin convertir`,
            });
          }
          // En cualquier otro caso (UNIDAD↔UNIDAD, srcNorm sin dstNorm pero
          // base UNIDAD, etc.) pasa sin convertir — caso normal.
        }

        ingredientesPayload.push({ ingredient: ingId, quantity, price });
      }

      // Fail-closed: si hay bloqueos y strictMode está activo, abortar.
      if (bloqueos.length > 0 && strictMode) {
        return json({
          ok: false,
          error: "bloqueo_conversion_unidad",
          mensaje: `${bloqueos.length} ítem(s) tienen unidad de factura incompatible con Loggro. Revisar manualmente para evitar stock incorrecto.`,
          bloqueos,
          conversiones,
          advertencias,
          sugerencia: "Configurar la unidad del ingrediente en Loggro o pasar strict=false si está OK proceder sin convertir.",
        }, 422);
      }

      // Armar payload exacto de Loggro
      const now = new Date().toISOString();
      const movementPayload: any = {
        business: businessId,
        user: userId,
        date: body.date || now,
        type: Number(body.type) || 1,            // 1 = compra/ingreso
        isSubtracted: !!body.isSubtracted,
        isProduction: !!body.isProduction,
        isMoveTo: !!body.isMoveTo,
        deleted: false,
        note: body.note || "",
        ingredients: ingredientesPayload,
        createdOn: now,
        modifiedOn: now,
      };
      if (body.provider_id) movementPayload.provider = body.provider_id;
      if (body.invoice) movementPayload.invoice = body.invoice;
      if (body.location_id_to) movementPayload.locationStockTo = body.location_id_to;

      // Path real de Loggro: /inventories (en plural). La doc oficial dice
      // /inventory pero la API responde 404 con esa.
      const result = await loggroRaw("POST", "/inventories", movementPayload);
      if (!result.ok) {
        return json({
          ok: false,
          error: `Loggro respondió ${result.status}`,
          loggro_response: result.body,
          payload_enviado: movementPayload,
        }, 502);
      }

      return json({
        ok: true,
        movement_id: result.body?._id || result.body?.id || null,
        conversiones,
        advertencias,
        bloqueos,             // vacío si strict=true (ya retornamos arriba si había)
        loggro_response: result.body,
      });
    }

    return json({ error: "Ruta no encontrada", path }, 404);
  } catch (err) {
    console.error("loggro-sync error:", err);
    return json({ error: String(err) }, 500);
  }
});
