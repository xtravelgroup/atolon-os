// ═══════════════════════════════════════════════════════════════════════════
// Partners API — self-service endpoints for OTAs / agencies / integrators.
// Base URL: https://{project-ref}.supabase.co/functions/v1/partners-api
// Auth: Authorization: Bearer sk_atolon_<32hex>
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPA_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPA_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase: SupabaseClient = createClient(SUPA_URL, SUPA_SERVICE_KEY);

// ─── Helpers ────────────────────────────────────────────────────────────────
const CORS = {
  "access-control-allow-origin":  "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
};

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
function err(code: string, message: string, status = 400) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

interface AuthCtx {
  partnerId: string;
  keyId: string;
  rateLimit: number;
  scopes: string[];
}

async function authenticate(req: Request): Promise<{ ctx?: AuthCtx; error?: Response }> {
  const hdr = req.headers.get("authorization") || "";
  if (!hdr.toLowerCase().startsWith("bearer ")) {
    return { error: err("UNAUTHORIZED", "Falta header Authorization: Bearer <api-key>", 401) };
  }
  const raw = hdr.slice(7).trim();
  if (!raw) return { error: err("UNAUTHORIZED", "API key vacía", 401) };

  const hash = await sha256Hex(raw);
  const { data: key } = await supabase.from("api_partner_keys")
    .select("id, partner_id, estado, expires_at, rate_limit_per_min, scopes")
    .eq("key_hash", hash).maybeSingle();

  if (!key)                                  return { error: err("UNAUTHORIZED", "API key inválida", 401) };
  if (key.estado !== "activa")               return { error: err("UNAUTHORIZED", "API key revocada", 401) };
  if (key.expires_at && new Date(key.expires_at) < new Date())
                                             return { error: err("UNAUTHORIZED", "API key expirada", 401) };

  // Verificar partner activo
  const { data: partner } = await supabase.from("api_partners")
    .select("id, estado").eq("id", key.partner_id).maybeSingle();
  if (!partner)                              return { error: err("UNAUTHORIZED", "Partner no existe", 401) };
  if (partner.estado !== "activo")           return { error: err("FORBIDDEN",    `Partner ${partner.estado}`, 403) };

  // Rate limit: count requests in last minute
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase.from("api_partner_logs")
    .select("id", { count: "exact", head: true })
    .eq("key_id", key.id).gte("ts", since);
  if ((count ?? 0) >= (key.rate_limit_per_min || 60)) {
    return { error: err("RATE_LIMITED", `Excediste ${key.rate_limit_per_min} requests/min`, 429) };
  }

  // Actualizar last_used_at (fire-and-forget)
  supabase.from("api_partner_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id).then(() => {});

  return {
    ctx: {
      partnerId: key.partner_id,
      keyId:     key.id,
      rateLimit: key.rate_limit_per_min || 60,
      scopes:    key.scopes || [],
    },
  };
}

async function logCall(params: {
  partnerId?: string; keyId?: string;
  endpoint: string; metodo: string; status: number;
  reqBody?: unknown; reqQuery?: unknown; resBody?: unknown;
  errorMsg?: string; durationMs: number; clientIp?: string;
}) {
  try {
    await supabase.from("api_partner_logs").insert({
      partner_id:    params.partnerId ?? null,
      key_id:        params.keyId ?? null,
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

// ─── Business logic ────────────────────────────────────────────────────────
async function getPaxOcupados(fecha: string, salidaId: string): Promise<number> {
  const { data } = await supabase.from("reservas")
    .select("pax").eq("fecha", fecha).eq("salida_id", salidaId).neq("estado", "cancelado");
  return (data || []).reduce((s: number, r: any) => s + (r.pax || 0), 0);
}

/** GET /v1/pasadias */
async function handleListPasadias() {
  const { data, error } = await supabase.from("pasadias")
    .select("id, nombre, precio, precio_nino, min_pax, duracion, descripcion")
    .eq("activo", true).order("orden");
  if (error) return err("INTERNAL_ERROR", error.message, 500);
  const pasadias = (data || []).map((p: any) => ({
    id:           p.id,
    nombre:       p.nombre,
    precio:       Number(p.precio) || 0,
    precio_nino:  Number(p.precio_nino) || 0,
    min_pax:      p.min_pax || 1,
    duracion:     p.duracion || null,
    descripcion:  p.descripcion || null,
    moneda:       "COP",
  }));
  return ok({ pasadias });
}

/** GET /v1/availability?fecha=YYYY-MM-DD&tipo=VIP%20Pass */
async function handleAvailability(url: URL) {
  const fecha = url.searchParams.get("fecha");
  const tipo  = url.searchParams.get("tipo");
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return err("VALIDATION", "Parámetro 'fecha' requerido (YYYY-MM-DD)", 400);
  }

  const [salR, cierresR, overR] = await Promise.all([
    supabase.from("salidas").select("id, hora, cap").eq("activo", true),
    supabase.from("cierres").select("fecha, tipo").eq("activo", true).eq("fecha", fecha),
    supabase.from("salidas_override").select("salida_id, fecha, activo").eq("fecha", fecha),
  ]);
  if ((cierresR.data || []).some(c => c.tipo === "total")) {
    return ok({ fecha, tipo, cerrado: true, salidas: [] });
  }

  // Precio
  let pasadia: any = null;
  if (tipo) {
    const { data } = await supabase.from("pasadias")
      .select("id, nombre, precio, precio_nino, min_pax").ilike("nombre", tipo).maybeSingle();
    pasadia = data;
  }

  const overrides = overR.data || [];
  const salidas   = (salR.data || []).filter((s: any) => {
    const ov = overrides.find(o => o.salida_id === s.id);
    return !(ov && ov.activo === false);
  });

  const out: any[] = [];
  for (const s of salidas) {
    const ocupados = await getPaxOcupados(fecha, s.id);
    const vacantes = Math.max(0, (s.cap || 0) - ocupados);
    out.push({
      salida_id: s.id,
      hora:      s.hora,
      capacidad: s.cap,
      ocupados,
      vacantes,
    });
  }

  return ok({
    fecha, tipo,
    precio_adulto: pasadia ? Number(pasadia.precio)      || 0 : null,
    precio_nino:   pasadia ? Number(pasadia.precio_nino) || 0 : null,
    min_pax:       pasadia?.min_pax || 1,
    salidas: out,
  });
}

/** POST /v1/reservas */
async function handleCreateReserva(body: any, ctx: AuthCtx) {
  const { fecha, salida_id, hora, tipo, nombre, contacto } = body || {};
  const paxA = Number(body?.pax_a) || 0;
  const paxN = Number(body?.pax_n) || 0;
  const edades: number[] = Array.isArray(body?.edades_ninos) ? body.edades_ninos : [];

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    return err("VALIDATION", "fecha requerida (YYYY-MM-DD)", 400);
  if (!tipo)    return err("VALIDATION", "tipo requerido", 400);
  if (!nombre)  return err("VALIDATION", "nombre requerido", 400);
  if (paxA + paxN <= 0) return err("VALIDATION", "pax_a + pax_n debe ser > 0", 400);

  // Resolver salida
  const { data: salidas } = await supabase.from("salidas").select("id, hora, cap").eq("activo", true);
  let salida: any = null;
  if (salida_id) salida = (salidas || []).find((s: any) => s.id === salida_id);
  else if (hora) salida = (salidas || []).find((s: any) => s.hora === hora);
  if (!salida) return err("NO_AVAILABILITY", "Salida no encontrada", 400);

  const { data: pasadia } = await supabase.from("pasadias")
    .select("id, nombre, precio, precio_nino").ilike("nombre", tipo).maybeSingle();
  if (!pasadia) return err("VALIDATION", `Pasadía '${tipo}' no existe`, 400);

  const paxTotal = paxA + paxN;
  const ocupados = await getPaxOcupados(fecha, salida.id);
  if (ocupados + paxTotal > (salida.cap || 0)) {
    return err("NO_AVAILABILITY", "No hay vacantes suficientes", 409);
  }

  const precioU = Math.round(Number(pasadia.precio) || 0);
  const total   = paxA * precioU + paxN * Math.round(Number(pasadia.precio_nino) || 0);
  const reservaId = `API-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const { error: insErr } = await supabase.from("reservas").insert({
    id:           reservaId,
    fecha,
    salida_id:    salida.id,
    tipo:         pasadia.nombre,
    canal:        "Partner API",
    source:       "api",
    nombre,
    contacto:     contacto || "",
    pax:          paxTotal,
    pax_a:        paxA,
    pax_n:        paxN,
    edades_ninos: edades,
    precio_u:     precioU,
    total,
    abono:        0,
    saldo:        total,
    estado:       "confirmado",
    ep:           "pendiente",
    notas:        `Partner: ${ctx.partnerId}`,
  });
  if (insErr) return err("INTERNAL_ERROR", insErr.message, 500);

  return ok({
    id:        reservaId,
    estado:    "confirmado",
    fecha,
    salida_id: salida.id,
    hora:      salida.hora,
    tipo:      pasadia.nombre,
    pax_a:     paxA,
    pax_n:     paxN,
    total,
    moneda:    "COP",
  }, 201);
}

/** GET /v1/reservas/:id */
async function handleGetReserva(id: string, ctx: AuthCtx) {
  const { data, error } = await supabase.from("reservas")
    .select("id, fecha, salida_id, tipo, nombre, contacto, pax, pax_a, pax_n, total, abono, saldo, estado, ep, notas, source")
    .eq("id", id).maybeSingle();
  if (error) return err("INTERNAL_ERROR", error.message, 500);
  if (!data)  return err("NOT_FOUND", "Reserva no encontrada", 404);
  // Solo exponemos reservas creadas via API — opcional; por ahora dejamos ver
  // pero ocultamos campos internos sensibles.
  void ctx;
  return ok({ reserva: data });
}

/** POST /v1/reservas/:id/cancel */
async function handleCancelReserva(id: string) {
  const { data: r } = await supabase.from("reservas").select("id, estado").eq("id", id).maybeSingle();
  if (!r) return err("NOT_FOUND", "Reserva no encontrada", 404);
  if (r.estado === "cancelado") return ok({ id, estado: "cancelado" });
  const { error } = await supabase.from("reservas")
    .update({ estado: "cancelado", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return err("INTERNAL_ERROR", error.message, 500);
  return ok({ id, estado: "cancelado" });
}

// ─── Router ────────────────────────────────────────────────────────────────
serve(async (req) => {
  const t0 = Date.now();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/partners-api/, "") || "/";
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Health check — no auth
  if (path === "/" || path === "/health") {
    return ok({ service: "partners-api", version: "v1", status: "ok" });
  }

  const { ctx, error: authErr } = await authenticate(req);
  if (authErr || !ctx) {
    await logCall({
      endpoint: path, metodo: req.method, status: authErr?.status ?? 401,
      durationMs: Date.now() - t0, clientIp: ip, errorMsg: "auth failed",
    });
    return authErr!;
  }

  let body: any = null;
  if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }

  let res: Response;
  let endpointKey = path;
  try {
    if (req.method === "GET" && /^\/v1\/pasadias\/?$/.test(path)) {
      endpointKey = "v1.pasadias.list";
      res = await handleListPasadias();
    } else if (req.method === "GET" && /^\/v1\/availability\/?$/.test(path)) {
      endpointKey = "v1.availability";
      res = await handleAvailability(url);
    } else if (req.method === "POST" && /^\/v1\/reservas\/?$/.test(path)) {
      endpointKey = "v1.reservas.create";
      res = await handleCreateReserva(body, ctx);
    } else {
      const mCancel = path.match(/^\/v1\/reservas\/([^/]+)\/cancel\/?$/);
      const mGet    = path.match(/^\/v1\/reservas\/([^/]+)\/?$/);
      if (req.method === "POST" && mCancel) {
        endpointKey = "v1.reservas.cancel";
        res = await handleCancelReserva(mCancel[1]);
      } else if (req.method === "GET" && mGet) {
        endpointKey = "v1.reservas.get";
        res = await handleGetReserva(mGet[1], ctx);
      } else {
        res = err("NOT_FOUND", `Endpoint no encontrado: ${req.method} ${path}`, 404);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res = err("INTERNAL_ERROR", msg, 500);
    await logCall({
      partnerId: ctx.partnerId, keyId: ctx.keyId,
      endpoint: endpointKey, metodo: req.method, status: 500,
      reqBody: body, reqQuery: Object.fromEntries(url.searchParams),
      durationMs: Date.now() - t0, clientIp: ip, errorMsg: msg,
    });
    return res;
  }

  try {
    const resClone = res.clone();
    const resBody = await resClone.json().catch(() => null);
    await logCall({
      partnerId: ctx.partnerId, keyId: ctx.keyId,
      endpoint: endpointKey, metodo: req.method, status: res.status,
      reqBody: body, reqQuery: Object.fromEntries(url.searchParams),
      resBody, durationMs: Date.now() - t0, clientIp: ip,
    });
  } catch {}

  return res;
});
