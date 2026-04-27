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
  return cachedToken;
}

async function getLoggroIdentity(): Promise<{ businessId: string | null; userId: string | null }> {
  await getLoggroToken();
  return { businessId: cachedBusinessId, userId: cachedUserId };
}

async function loggroGet(path: string): Promise<any> {
  const token = await getLoggroToken();
  const res = await fetch(`${LOGGRO_BASE}${path}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Loggro GET ${path} → ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function loggroPost(path: string, body: unknown): Promise<any> {
  const token = await getLoggroToken();
  const res = await fetch(`${LOGGRO_BASE}${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(`Loggro POST ${path} → ${res.status}: ${txt.slice(0, 300)}`);
  return data;
}

async function loggroRaw(method: string, path: string, body?: unknown): Promise<{ status: number; body: any; ok: boolean }> {
  const token = await getLoggroToken();
  const res = await fetch(`${LOGGRO_BASE}${path}`, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  return { status: res.status, body: data, ok: res.ok };
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
      const { data: existing } = await SB.from("menu_items").select("id, loggro_id").not("loggro_id", "is", null);
      const idByLoggro: Record<string, string> = {};
      for (const e of existing || []) if (e.loggro_id) idByLoggro[e.loggro_id] = e.id;

      // Construir filas. Si no existe, generar id; si existe, reusar.
      const rows = allProducts.map((p: any) => {
        const loggroId = p._id || p.id;
        const catName = p.category?.name || p.categoryName || "Otros";
        const menuTipo = mapMenuTipo(catName);
        const id = idByLoggro[loggroId] || `LGR-${String(loggroId).slice(-12)}`;
        return {
          id,
          loggro_id: loggroId,
          nombre: p.name || "Sin nombre",
          descripcion: p.description || null,
          precio: Number(p.price) || 0,
          categoria: catName,
          loggro_categoria: catName,
          foto_url: p.image || p.photo || null,
          activo: p.active !== false,
          menu_tipo: menuTipo,
          raw: p,
        };
      });

      // Solo actualizar los que YA están enlazados (match por loggro_id)
      let upd = 0;
      let lastError: any = null;
      const toUpdate = rows.filter(r => idByLoggro[r.loggro_id!]);
      for (const r of toUpdate) {
        const { error } = await SB.from("menu_items").update({
          nombre: r.nombre,
          descripcion: r.descripcion,
          precio: r.precio,
          loggro_categoria: r.loggro_categoria,
          raw: r.raw,
        }).eq("id", r.id);
        if (error) lastError = error;
        else upd++;
      }
      return json({ updated_existing: upd, total_loggro: allProducts.length, note: "Solo actualiza menu_items ya enlazados. Usa /link-menu-to-loggro para enlazar por nombre primero.", error: lastError?.message });
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
      const orders = body.items.map((it: any) => {
        const o: any = {
          product: it.productId || it.loggro_id,
          quantity: Number(it.qty) || 1,
          locationStock: it.locationStock || DEFAULT_LOCATION_STOCK,
        };
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
      });

      const payload: any = {
        group,
        groupName: body.groupName || `Atolón OS ${new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`,
        orders,
      };
      if (body.mesaId) payload.table = body.mesaId;
      if (body.seller) payload.seller = body.seller;

      try {
        const resp = await loggroPost("/orders", payload);
        return json({ ok: true, order: resp, payload_sent: payload });
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

      // Traer varias páginas para cubrir ~30 días (invoices API no acepta filtros por fecha,
      // así que descargamos hasta encontrar facturas fuera del rango).
      const pageSize = 100;
      const target = new Date(fecha + "T00:00:00-05:00");
      const diaSig = new Date(target.getTime() + 24 * 3600 * 1000);

      // Estrategia: bajar páginas en paralelo cubriendo las últimas ~2500 facturas
      // (≈2 meses). La API no acepta filtros por fecha, así que descargamos y filtramos.
      const PAGE_RANGE_SIZE = 25;
      const pagePromises = [];
      // Iteramos pages 85–110 (cubre recent history, incluye hoy)
      for (let p = 85; p < 85 + PAGE_RANGE_SIZE; p++) {
        pagePromises.push(
          loggroGet(`/invoices?pagination=true&limit=${pageSize}&page=${p}`)
            .then(d => ({ page: p, arr: d?.data || (Array.isArray(d) ? d : []) }))
            .catch(() => ({ page: p, arr: [] }))
        );
      }
      const results = await Promise.all(pagePromises);
      const allInvoices: any[] = [];
      const seen = new Set<string>();
      results.forEach(r => r.arr.forEach((inv: any) => {
        if (inv?._id && !seen.has(inv._id)) { seen.add(inv._id); allInvoices.push(inv); }
      }));

      // Filtrar facturas del día en timezone Colombia
      const COTZ_OFFSET_MS = -5 * 3600 * 1000; // UTC-5
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
        paginas_consultadas: PAGE_RANGE_SIZE,
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

    // GET /loggro-sync/cierre-caja-rango?from=YYYY-MM-DD&to=YYYY-MM-DD
    // Retorna totales por día y resumen global para un rango. Usado por P/L,
    // Financiero y Resultados para consumir la data oficial de Loggro Restobar.
    if (req.method === "GET" && path === "/cierre-caja-rango") {
      const from = url.searchParams.get("from");
      const to   = url.searchParams.get("to");
      if (!from || !to) return json({ error: "params from y to requeridos (YYYY-MM-DD)" }, 400);

      // Bajar un rango de páginas lo suficientemente grande. Loggro no filtra
      // por fecha, así que pagineamos y filtramos.
      const pageSize = 100;
      const PAGE_RANGE_SIZE = 40; // ~4000 facturas ≈ 3-4 meses
      const pagePromises = [];
      for (let p = 70; p < 70 + PAGE_RANGE_SIZE; p++) {
        pagePromises.push(
          loggroGet(`/invoices?pagination=true&limit=${pageSize}&page=${p}`)
            .then(d => ({ page: p, arr: d?.data || (Array.isArray(d) ? d : []) }))
            .catch(() => ({ page: p, arr: [] }))
        );
      }
      const results = await Promise.all(pagePromises);
      const allInvoices: any[] = [];
      const seen = new Set<string>();
      results.forEach(r => r.arr.forEach((inv: any) => {
        if (inv?._id && !seen.has(inv._id)) { seen.add(inv._id); allInvoices.push(inv); }
      }));

      const COTZ_OFFSET_MS = -5 * 3600 * 1000;
      // Bucket por día: { ventas, propinas, tickets, anuladas, por_metodo: {} }
      interface DayBucket { ventas: number; propinas: number; tickets: number; anuladas: number; por_metodo: Record<string, number>; }
      const porDia: Record<string, DayBucket> = {};

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

      return json({
        ok: true,
        from, to,
        timezone: "America/Bogota",
        paginas_consultadas: PAGE_RANGE_SIZE,
        resumen: {
          total_ventas: totalVentas,
          total_propinas: totalPropinas,
          total_general: totalVentas + totalPropinas,
          tickets: totalTickets,
          anuladas: totalAnuladas,
        },
        por_metodo: porMetodoGlobal,
        por_dia: porDia,
      });
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
          } catch (_) { /* skip */ }
        }
      }
      await Promise.all(Array.from({ length: 10 }, () => worker()));

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

      // 2) Movimiento ENTRADA para items con stock negativo (los lleva a 0)
      //    Usamos type=1 (compra/ingreso) ya que type=11 con isSubtracted=false
      //    no funciona como entrada en Loggro (siempre resta).
      if (negativos.length > 0) {
        const result = await loggroRaw("POST", "/inventories", {
          business: businessId,
          user: userId,
          date: now,
          type: 1, isSubtracted: false, isProduction: false, isMoveTo: false,
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
      // type=1 (compra/ingreso) para que sí entre el stock — type=11 con
      // isSubtracted=false no funciona como entrada en Loggro.
      const movementPayload: any = {
        business: businessId,
        user: userId,
        date: now,
        type: 1,                       // compra/ingreso
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
        const r = await loggroRaw("POST", "/inventories", {
          business: businessId, user: userId, date: now,
          type: 1, isSubtracted: false, isProduction: false, isMoveTo: false, deleted: false,
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

    if (req.method === "POST" && path === "/create-inventory-movement") {
      const body = await req.json().catch(() => ({}));

      // Loggro requiere business + user en el body de /inventory
      const { businessId, userId } = await getLoggroIdentity();

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
        ingredients: (body.ingredients || []).map((it: any) => ({
          ingredient: it.ingredient_id || it.ingredient,
          quantity:   Number(it.quantity) || 0,
          // Loggro usa 'price' para el costo unitario, no 'cost'.
          // Aceptamos ambos en el body por compatibilidad.
          price:      Number(it.price ?? it.cost) || 0,
        })),
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
        loggro_response: result.body,
      });
    }

    return json({ error: "Ruta no encontrada", path }, 404);
  } catch (err) {
    console.error("loggro-sync error:", err);
    return json({ error: String(err) }, 500);
  }
});
