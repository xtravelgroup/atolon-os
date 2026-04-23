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
  // JWT típicamente dura 2h; asumimos 90 min de gracia
  tokenExpires = now + 90 * 60_000;
  return cachedToken;
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

    return json({ error: "Ruta no encontrada", path }, 404);
  } catch (err) {
    console.error("loggro-sync error:", err);
    return json({ error: String(err) }, 500);
  }
});
