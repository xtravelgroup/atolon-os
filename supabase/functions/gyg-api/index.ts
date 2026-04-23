// ═══════════════════════════════════════════════════════════════════════════
// GetYourGuide Partner API — Supplier Endpoints
// Single Edge Function con routing interno. GYG configura base URL:
//   https://{project-ref}.supabase.co/functions/v1/gyg-api
// Luego GYG llama: /1/get-availabilities/, /1/reserve/, /1/book/, etc.
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPA_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GYG_USER         = Deno.env.get("GYG_BASIC_AUTH_USER") ?? "gyg";
const GYG_PASS         = Deno.env.get("GYG_BASIC_AUTH_PASS") ?? "";

const supabase: SupabaseClient = createClient(SUPA_URL, SUPA_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── In-memory caches ────────────────────────────────────────────────────
const productCache = new Map<string, { data: any; ts: number }>();
const availCache   = new Map<string, { body: string; ts: number }>();
const CACHE_TTL_MS = 60_000;       // producto: 1 min
const AVAIL_CACHE_TTL_MS = 30_000; // disponibilidad: 30 seg
async function getProductWithPasadia(productId: string) {
  const now = Date.now();
  const cached = productCache.get(productId);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.data;
  const { data: gygProd } = await supabase.from("gyg_productos")
    .select("*").eq("gyg_product_id", productId).maybeSingle();
  if (!gygProd) return null;
  const { data: pasadia } = await supabase.from("pasadias")
    .select("precio, precio_nino, min_pax, nombre").eq("id", gygProd.pasadia_id).maybeSingle();
  const combined = { gygProd, pasadia };
  productCache.set(productId, { data: combined, ts: now });
  return combined;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function err(code: string, message: string, status = 400) {
  return new Response(JSON.stringify({ errorCode: code, errorMessage: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function checkBasicAuth(req: Request): boolean {
  if (!GYG_PASS) return true; // sandbox sin auth configurada aún
  const hdr = req.headers.get("authorization") || "";
  if (!hdr.startsWith("Basic ")) return false;
  try {
    const decoded = atob(hdr.slice(6));
    const [u, p] = decoded.split(":");
    return u === GYG_USER && p === GYG_PASS;
  } catch {
    return false;
  }
}

async function logCall(params: {
  endpoint: string;
  metodo: string;
  status: number;
  reqBody?: unknown;
  reqQuery?: unknown;
  resBody?: unknown;
  errorMsg?: string;
  durationMs: number;
  clientIp?: string;
}) {
  try {
    await supabase.from("gyg_api_log").insert({
      endpoint:      params.endpoint,
      metodo:        params.metodo,
      status_code:   params.status,
      request_body:  params.reqBody ?? null,
      request_query: params.reqQuery ?? null,
      response_body: params.resBody ?? null,
      error_msg:     params.errorMsg ?? null,
      duration_ms:   params.durationMs,
      client_ip:     params.clientIp ?? null,
    });
  } catch (e) {
    console.error("logCall failed:", e);
  }
}

// ─── Business logic ─────────────────────────────────────────────────────────

/** Cuenta pax ya reservados para una fecha+salida (reservas confirmadas + holds pending) */
async function getPaxOcupados(fecha: string, salidaId: string): Promise<number> {
  const [rRes, hRes] = await Promise.all([
    supabase.from("reservas")
      .select("pax")
      .eq("fecha", fecha)
      .eq("salida_id", salidaId)
      .neq("estado", "cancelado"),
    supabase.from("gyg_holds")
      .select("pax_total")
      .eq("fecha", fecha)
      .eq("salida_id", salidaId)
      .eq("estado", "pending")
      .gt("expira_at", new Date().toISOString()),
  ]);
  const resPax = (rRes.data || []).reduce((s: number, r: any) => s + (r.pax || 0), 0);
  const holdPax = (hRes.data || []).reduce((s: number, h: any) => s + (h.pax_total || 0), 0);
  return resPax + holdPax;
}

/** GET /1/get-availabilities/?productId=X&fromDateTime=...&toDateTime=... */
async function handleAvailabilities(url: URL) {
  const productId    = url.searchParams.get("productId");
  const fromDateTime = url.searchParams.get("fromDateTime");
  const toDateTime   = url.searchParams.get("toDateTime");
  if (!productId || !fromDateTime || !toDateTime) {
    return err("VALIDATION_FAILURE", "productId, fromDateTime y toDateTime son requeridos", 400);
  }

  // Cache hit → devolver al instante
  const cacheKey = `${productId}|${fromDateTime}|${toDateTime}`;
  const cached = availCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < AVAIL_CACHE_TTL_MS) {
    return new Response(cached.body, { status: 200, headers: { "content-type": "application/json" } });
  }

  const combined = await getProductWithPasadia(productId);
  if (!combined || !combined.gygProd) return err("INVALID_PRODUCT", "Producto no mapeado", 404);
  if (!combined.pasadia) return err("INVALID_PRODUCT", "Pasadía no encontrada", 404);
  const { gygProd, pasadia } = combined;

  // Rango de fechas
  const from = new Date(fromDateTime).toISOString().slice(0, 10);
  const to   = new Date(toDateTime).toISOString().slice(0, 10);

  // OPTIMIZACIÓN: traer TODAS las reservas y holds del rango en 2 queries (no N×M)
  const nowIso = new Date().toISOString();
  const [salidasR, cierresR, overridesR, reservasR, holdsR] = await Promise.all([
    supabase.from("salidas").select("id, hora, capacidad_total").eq("activo", true),
    supabase.from("cierres").select("fecha, tipo").eq("activo", true).gte("fecha", from).lte("fecha", to),
    supabase.from("salidas_override").select("salida_id, fecha, activo").gte("fecha", from).lte("fecha", to),
    supabase.from("reservas").select("fecha, salida_id, pax").gte("fecha", from).lte("fecha", to).neq("estado", "cancelado"),
    supabase.from("gyg_holds").select("fecha, salida_id, pax_total").gte("fecha", from).lte("fecha", to).eq("estado", "pending").gt("expira_at", nowIso),
  ]);

  const salidas   = salidasR.data   || [];
  const cierres   = cierresR.data   || [];
  const overrides = overridesR.data || [];

  // Mapa [fecha+salida_id → pax ocupados] hecho en memoria, un solo pase
  const ocupadosMap = new Map<string, number>();
  for (const r of (reservasR.data || [])) {
    const key = `${r.fecha}|${r.salida_id}`;
    ocupadosMap.set(key, (ocupadosMap.get(key) || 0) + (r.pax || 0));
  }
  for (const h of (holdsR.data || [])) {
    const key = `${h.fecha}|${h.salida_id}`;
    ocupadosMap.set(key, (ocupadosMap.get(key) || 0) + (h.pax_total || 0));
  }

  const availabilities: any[] = [];

  // Iterar día por día
  const d0 = new Date(from + "T00:00:00Z");
  const d1 = new Date(to   + "T00:00:00Z");
  for (let d = new Date(d0); d <= d1; d.setUTCDate(d.getUTCDate() + 1)) {
    const fecha = d.toISOString().slice(0, 10);
    const cierre = cierres.find(c => c.fecha === fecha && c.tipo === "total");
    if (cierre) continue;

    for (const s of salidas) {
      const ovr = overrides.find(o => o.salida_id === s.id && o.fecha === fecha);
      if (ovr && ovr.activo === false) continue;

      const ocupados = ocupadosMap.get(`${fecha}|${s.id}`) || 0;
      const vacantes = Math.max(0, (s.capacidad_total || 0) - ocupados);
      if (vacantes <= 0) continue;

      const dateTime = `${fecha}T${s.hora}:00-05:00`;

      // Precios por categoría: INFANT (gratis), CHILD, ADULT
      availabilities.push({
        dateTime,
        vacancies: Math.min(vacantes, 5000),
        cutoffSeconds: gygProd.cutoff_seconds || 3600,
        pricesByCategory: {
          INFANT:                        0,
          [gygProd.categoria_nino_id]:   Math.round(Number(pasadia.precio_nino) || 0),
          [gygProd.categoria_adulto_id]: Math.round(Number(pasadia.precio) || 0),
        },
      });
    }
  }

  // Guardar en cache
  const bodyStr = JSON.stringify({ availabilities });
  availCache.set(cacheKey, { body: bodyStr, ts: Date.now() });
  return new Response(bodyStr, { status: 200, headers: { "content-type": "application/json" } });
}

/** POST /1/reserve/ */
async function handleReserve(body: any) {
  const { productId, dateTime, bookingItems } = body || {};
  if (!productId || !dateTime || !Array.isArray(bookingItems)) {
    return err("VALIDATION_FAILURE", "productId, dateTime y bookingItems son requeridos", 400);
  }

  const { data: gygProd } = await supabase.from("gyg_productos")
    .select("*").eq("gyg_product_id", productId).maybeSingle();
  if (!gygProd) return err("INVALID_PRODUCT", "Producto no mapeado", 404);

  const fecha = dateTime.slice(0, 10);
  const hora  = dateTime.slice(11, 16); // HH:MM

  // Encontrar salida correspondiente
  const { data: salidas } = await supabase.from("salidas").select("id, hora, capacidad_total").eq("activo", true);
  const salida = (salidas || []).find((s: any) => s.hora === hora);
  if (!salida) return err("NO_AVAILABILITY", "Salida no encontrada para esa hora", 400);

  const paxAdultos = bookingItems.filter((b: any) => b.categoryId === gygProd.categoria_adulto_id)
                      .reduce((s: number, b: any) => s + (Number(b.count) || 0), 0);
  const paxNinos   = bookingItems.filter((b: any) => b.categoryId === gygProd.categoria_nino_id)
                      .reduce((s: number, b: any) => s + (Number(b.count) || 0), 0);
  const paxInfants = bookingItems.filter((b: any) => b.categoryId === "INFANT")
                      .reduce((s: number, b: any) => s + (Number(b.count) || 0), 0);
  // INFANT no ocupa vacante ni cobra — es un bebé en brazos
  const paxTotal = paxAdultos + paxNinos;
  if (paxTotal + paxInfants <= 0) return err("VALIDATION_FAILURE", "bookingItems debe tener al menos 1 pasajero", 400);

  const ocupados = await getPaxOcupados(fecha, salida.id);
  if (ocupados + paxTotal > (salida.capacidad_total || 0)) {
    return err("NO_AVAILABILITY", "No hay vacantes suficientes", 409);
  }

  const { data: pasadia } = await supabase.from("pasadias")
    .select("precio, precio_nino").eq("id", gygProd.pasadia_id).maybeSingle();
  const precioTotal = paxAdultos * (Number(pasadia?.precio) || 0) + paxNinos * (Number(pasadia?.precio_nino) || 0);

  const reservationRef = `GYG-R-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const expiraAt = new Date(Date.now() + (gygProd.reservation_ttl_secs || 1800) * 1000).toISOString();

  const { error } = await supabase.from("gyg_holds").insert({
    id:             reservationRef,
    gyg_product_id: productId,
    pasadia_id:     gygProd.pasadia_id,
    fecha,
    salida_id:      salida.id,
    pax_adultos:    paxAdultos,
    pax_ninos:      paxNinos,
    pax_total:      paxTotal,
    precio_total:   precioTotal,
    moneda:         gygProd.moneda || "COP",
    estado:         "pending",
    expira_at:      expiraAt,
    gyg_payload:    body,
  });
  if (error) return err("INTERNAL_SYSTEM_FAILURE", error.message, 500);

  return ok({
    reservationReference: reservationRef,
    expiresAt: expiraAt,
    status: "RESERVED",
  });
}

/** POST /1/cancel-reservation/ */
async function handleCancelReservation(body: any) {
  const ref = body?.reservationReference;
  if (!ref) return err("VALIDATION_FAILURE", "reservationReference requerido", 400);

  const { data: hold } = await supabase.from("gyg_holds").select("*").eq("id", ref).maybeSingle();
  if (!hold) return err("INVALID_RESERVATION", "Reserva no encontrada", 404);
  if (hold.estado === "booked") return err("INVALID_RESERVATION", "Ya fue confirmada como booking", 409);

  await supabase.from("gyg_holds").update({ estado: "cancelled", updated_at: new Date().toISOString() }).eq("id", ref);
  return ok({ status: "CANCELLED" });
}

/** POST /1/book/ */
async function handleBook(body: any) {
  const { reservationReference, bookingReference, travelerFirstName, travelerLastName, travelerEmail, travelerPhone, comment } = body || {};
  if (!reservationReference || !bookingReference) {
    return err("VALIDATION_FAILURE", "reservationReference y bookingReference requeridos", 400);
  }

  const { data: hold } = await supabase.from("gyg_holds").select("*").eq("id", reservationReference).maybeSingle();
  if (!hold) return err("INVALID_RESERVATION", "Reserva no encontrada", 404);
  if (hold.estado === "booked")    return err("INVALID_RESERVATION", "Ya fue confirmada", 409);
  if (hold.estado === "cancelled") return err("INVALID_RESERVATION", "Está cancelada", 409);
  if (hold.estado === "expired" || new Date(hold.expira_at) < new Date()) {
    return err("INVALID_RESERVATION", "Reserva expirada", 410);
  }

  const { data: pasadia } = await supabase.from("pasadias").select("nombre").eq("id", hold.pasadia_id).maybeSingle();

  // Crear reserva real en la tabla reservas
  const reservaId = `GYG-${bookingReference}`;
  const fullName = [travelerFirstName, travelerLastName].filter(Boolean).join(" ").trim() || "Cliente GYG";

  const precioU = hold.pax_total > 0 ? Math.round(Number(hold.precio_total) / hold.pax_total) : 0;

  const { error: resErr } = await supabase.from("reservas").insert({
    id:                         reservaId,
    fecha:                      hold.fecha,
    salida_id:                  hold.salida_id,
    tipo:                       pasadia?.nombre || "GYG",
    canal:                      "GetYourGuide",
    source:                     "gyg",
    nombre:                     fullName,
    contacto:                   travelerPhone || travelerEmail || "",
    pax:                        hold.pax_total,
    pax_a:                      hold.pax_adultos,
    pax_n:                      hold.pax_ninos,
    precio_u:                   precioU,
    total:                      Math.round(Number(hold.precio_total) || 0),
    abono:                      Math.round(Number(hold.precio_total) || 0), // GYG ya cobró al cliente
    saldo:                      0,
    estado:                     "confirmado",
    ep:                         "pagado",
    notas:                      [`Reserva GYG`, travelerEmail, comment].filter(Boolean).join(" · "),
    gyg_booking_reference:      bookingReference,
    gyg_reservation_reference:  reservationReference,
  });
  if (resErr) return err("INTERNAL_SYSTEM_FAILURE", resErr.message, 500);

  await supabase.from("gyg_holds").update({
    estado:     "booked",
    reserva_id: reservaId,
    updated_at: new Date().toISOString(),
  }).eq("id", reservationReference);

  // Generar código de ticket simple
  const ticketCode = `ATOLON-${bookingReference}`;

  return ok({
    bookingReference,
    status: "CONFIRMED",
    tickets: [{
      ticketCode,
      renderType: "QR_CODE",
      qrCodeContent: ticketCode,
    }],
  });
}

/** POST /1/cancel-booking/ */
async function handleCancelBooking(body: any) {
  const ref = body?.bookingReference;
  if (!ref) return err("VALIDATION_FAILURE", "bookingReference requerido", 400);

  const reservaId = `GYG-${ref}`;
  const { data: reserva } = await supabase.from("reservas").select("id, estado")
    .eq("id", reservaId).maybeSingle();
  if (!reserva) return err("INVALID_BOOKING", "Booking no encontrado", 404);
  if (reserva.estado === "cancelado") return ok({ status: "CANCELLED" }); // idempotente

  await supabase.from("reservas").update({ estado: "cancelado", updated_at: new Date().toISOString() }).eq("id", reservaId);
  await supabase.from("gyg_holds").update({ estado: "cancelled", updated_at: new Date().toISOString() })
    .eq("gyg_product_id", reservaId); // por si acaso
  return ok({ status: "CANCELLED" });
}

/** GET /1/suppliers/{id}/products/ */
async function handleProductList() {
  const { data } = await supabase.from("gyg_productos").select("*").eq("activo", true);
  const products = (data || []).map((p: any) => ({
    productId:   p.gyg_product_id,
    productName: p.nombre,
    description: p.descripcion || "",
    currency:    p.moneda || "COP",
  }));
  return ok({ products });
}

/** GET /1/products/{productId} */
async function handleProductDetails(productId: string) {
  const { data: gygProd } = await supabase.from("gyg_productos").select("*").eq("gyg_product_id", productId).maybeSingle();
  if (!gygProd) return err("INVALID_PRODUCT", "Producto no encontrado", 404);
  return ok({
    productId:     gygProd.gyg_product_id,
    productName:   gygProd.nombre,
    description:   gygProd.descripcion || "",
    currency:      gygProd.moneda || "COP",
    cutoffSeconds: gygProd.cutoff_seconds || 3600,
    reservationTtlSeconds: gygProd.reservation_ttl_secs || 1800,
  });
}

/** GET /1/products/{productId}/pricing-categories/ */
async function handlePricingCategories(productId: string) {
  const { data: gygProd } = await supabase.from("gyg_productos").select("*").eq("gyg_product_id", productId).maybeSingle();
  if (!gygProd) return err("INVALID_PRODUCT", "Producto no encontrado", 404);
  const categories = [
    { id: "INFANT",                    label: "Infant", minAge: 0, maxAge: 2 },
    { id: gygProd.categoria_nino_id,   label: "Child",  minAge: 3, maxAge: 11 },
    { id: gygProd.categoria_adulto_id, label: "Adult",  minAge: 12, maxAge: 99 },
  ];
  return ok({ categories });
}

/** GET /1/products/{productId}/addons/ */
async function handleAddons(_productId: string) {
  // No manejamos add-ons todavía
  return ok({ addons: [] });
}

/** POST /1/notify/  → GYG nos avisa que desactiva un producto */
async function handleNotify(body: any) {
  const { productId, status } = body || {};
  if (!productId) return err("VALIDATION_FAILURE", "productId requerido", 400);
  await supabase.from("gyg_productos").update({
    activo:     status !== "DEACTIVATED",
    updated_at: new Date().toISOString(),
  }).eq("gyg_product_id", productId);
  return ok({ status: "ACKNOWLEDGED" });
}

// ─── Router ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  const t0 = Date.now();
  const url = new URL(req.url);
  // El path viene con prefijo /functions/v1/gyg-api — lo extraemos
  // Supabase puede entregar el path con o sin el prefijo /functions/v1/gyg-api
  const path = url.pathname
    .replace(/^\/functions\/v1\/gyg-api/, "")
    .replace(/^\/gyg-api/, "") || "/";
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";

  // CORS preflight
  // Health check: sin auth, super rápido (para keep-warm)
  if (req.method === "GET" && (path === "/health" || path === "/")) {
    return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin":  "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "authorization,content-type",
      },
    });
  }

  // Auth
  if (!checkBasicAuth(req)) {
    const r = err("AUTHORIZATION_FAILURE", "Credenciales inválidas", 401);
    logCall({ endpoint: path, metodo: req.method, status: 401, durationMs: Date.now() - t0, clientIp: ip, errorMsg: "auth failed" });
    return r;
  }

  let body: any = null;
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }

  let res: Response;
  let endpointKey = path;

  try {
    if (req.method === "GET" && /^\/1\/get-availabilities\/?$/.test(path)) {
      endpointKey = "get-availabilities";
      res = await handleAvailabilities(url);
    } else if (req.method === "POST" && /^\/1\/reserve\/?$/.test(path)) {
      endpointKey = "reserve";
      res = await handleReserve(body);
    } else if (req.method === "POST" && /^\/1\/cancel-reservation\/?$/.test(path)) {
      endpointKey = "cancel-reservation";
      res = await handleCancelReservation(body);
    } else if (req.method === "POST" && /^\/1\/book\/?$/.test(path)) {
      endpointKey = "book";
      res = await handleBook(body);
    } else if (req.method === "POST" && /^\/1\/cancel-booking\/?$/.test(path)) {
      endpointKey = "cancel-booking";
      res = await handleCancelBooking(body);
    } else if (req.method === "POST" && /^\/1\/notify\/?$/.test(path)) {
      endpointKey = "notify";
      res = await handleNotify(body);
    } else if (req.method === "GET" && /^\/1\/suppliers\/[^/]+\/products\/?$/.test(path)) {
      endpointKey = "product-list";
      res = await handleProductList();
    } else {
      // Matchers con parámetros
      const mProdCat = path.match(/^\/1\/products\/([^/]+)\/pricing-categories\/?$/);
      const mProdAdd = path.match(/^\/1\/products\/([^/]+)\/addons\/?$/);
      const mProd    = path.match(/^\/1\/products\/([^/]+)\/?$/);

      if (req.method === "GET" && mProdCat) {
        endpointKey = "pricing-categories";
        res = await handlePricingCategories(mProdCat[1]);
      } else if (req.method === "GET" && mProdAdd) {
        endpointKey = "addons";
        res = await handleAddons(mProdAdd[1]);
      } else if (req.method === "GET" && mProd) {
        endpointKey = "product-details";
        res = await handleProductDetails(mProd[1]);
      } else {
        res = err("NOT_FOUND", `Endpoint no encontrado: ${req.method} ${path}`, 404);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res = err("INTERNAL_SYSTEM_FAILURE", msg, 500);
    logCall({ endpoint: endpointKey, metodo: req.method, status: 500, reqBody: body, reqQuery: Object.fromEntries(url.searchParams), durationMs: Date.now() - t0, clientIp: ip, errorMsg: msg });
    return res;
  }

  // Log exitoso — fire-and-forget, sin bloquear la respuesta.
  // EdgeRuntime.waitUntil deja que la tarea termine DESPUÉS de enviar la respuesta.
  const statusVal = res.status;
  const endpointFinal = endpointKey;
  const methodVal = req.method;
  const logTask = (async () => {
    try {
      logCall({
        endpoint:   endpointFinal,
        metodo:     methodVal,
        status:     statusVal,
        reqBody:    body,
        reqQuery:   Object.fromEntries(url.searchParams),
        resBody:    null, // no clonar response por perf
        durationMs: Date.now() - t0,
        clientIp:   ip,
      });
    } catch {}
  })();
  // @ts-ignore — EdgeRuntime global en Supabase
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(logTask);
  }

  return res;
});
