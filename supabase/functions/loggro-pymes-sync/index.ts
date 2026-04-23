// loggro-pymes-sync (Atolón OS)
// Integración con Loggro Pymes — ERP · Facturación electrónica DIAN · Contabilidad.
//
// Base URL probable: https://api.loggro.com/apik/loggro-pymes
// Auth: Bearer token (generado desde Loggro Pymes → Configuración/Organización → Integraciones)
//
// Endpoints expuestos por esta función (según servicios del producto):
//   GET  /loggro-pymes-sync/ping                    — verifica conexión
//   GET  /loggro-pymes-sync/probe?path=/xxx         — prueba cualquier path en Pymes
//
//   # Catálogos
//   GET  /loggro-pymes-sync/vendedores              — lista de vendedores
//   GET  /loggro-pymes-sync/cuentas-bancarias       — cuentas bancarias
//   GET  /loggro-pymes-sync/consecutivos            — numeración de facturación
//   GET  /loggro-pymes-sync/impuestos               — IVA, INC, saludables
//   GET  /loggro-pymes-sync/formas-pago             — formas y medios de pago
//   GET  /loggro-pymes-sync/productos               — productos
//   GET  /loggro-pymes-sync/lista-precios           — precios
//
//   # Facturación
//   POST /loggro-pymes-sync/factura                 — crear factura de venta
//   GET  /loggro-pymes-sync/factura/:id             — consultar factura
//   POST /loggro-pymes-sync/pago                    — registrar pago sobre factura
//
//   # Productos (admin)
//   POST /loggro-pymes-sync/producto                — crear producto
//   PUT  /loggro-pymes-sync/producto/:id            — modificar producto
//
//   # Vendedores
//   POST /loggro-pymes-sync/vendedor                — crear vendedor
//
// Variables de entorno:
//   LOGGRO_PYMES_TOKEN   (bearer token desde Loggro Pymes)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Loggro Pymes — base URL candidatas para probar
const LOGGRO_BASES = [
  "https://api.loggro.com/apik/loggro-pymes",
  "https://api.loggro.com/apik/loggro-integracionApis",
  "https://api.loggro.com/apik/integracionApis",
  "https://api.loggro.com/apik",
];
const LOGGRO_BASE_DEFAULT = LOGGRO_BASES[0];
const LOGGRO_TOKEN = Deno.env.get("LOGGRO_PYMES_TOKEN") || "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function pymes(path: string, init?: RequestInit, base = LOGGRO_BASE_DEFAULT): Promise<any> {
  if (!LOGGRO_TOKEN) throw new Error("LOGGRO_PYMES_TOKEN no configurado.");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${LOGGRO_TOKEN}`,
      "Content-Type":  "application/json",
      "Accept": "application/json",
      ...(init?.headers || {}),
    },
  });
  const txt = await res.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  return { status: res.status, ok: res.ok, data, url };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/loggro-pymes-sync/, "");
  const json = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    // ═══ Ping — verifica que el token está configurado ═══════════════════════
    if (req.method === "GET" && path === "/ping") {
      return json({
        ok: true,
        service: "loggro-pymes-sync",
        tokenConfigured: !!LOGGRO_TOKEN,
        bases: LOGGRO_BASES,
      });
    }

    // ═══ Probe — descubre endpoints probando varias bases y paths ════════════
    if (req.method === "GET" && path === "/probe") {
      const probePath = url.searchParams.get("path") || "/empresa";
      const results: any[] = [];
      for (const b of LOGGRO_BASES) {
        const r = await pymes(probePath, { method: "GET" }, b);
        results.push({ base: b, path: probePath, status: r.status, ok: r.ok, preview: JSON.stringify(r.data).slice(0, 200) });
      }
      return json({ results });
    }

    // ═══ Catálogos (GET) ═════════════════════════════════════════════════════
    const getPaths: Record<string, string> = {
      "/vendedores":        "/vendedores",
      "/cuentas-bancarias": "/cuentas-bancarias",
      "/consecutivos":      "/consecutivos-facturacion",
      "/impuestos":         "/impuestos",
      "/formas-pago":       "/formas-pago",
      "/productos":         "/productos",
      "/lista-precios":     "/lista-precios",
    };
    if (req.method === "GET" && getPaths[path]) {
      const r = await pymes(getPaths[path]);
      return json({ ok: r.ok, status: r.status, data: r.data });
    }

    // ═══ Factura ─ crear ═════════════════════════════════════════════════════
    if (req.method === "POST" && path === "/factura") {
      const body = await req.json();
      const r = await pymes("/facturas-venta", { method: "POST", body: JSON.stringify(body) });
      return json({ ok: r.ok, status: r.status, data: r.data });
    }

    // ═══ Factura ─ consultar ═════════════════════════════════════════════════
    if (req.method === "GET" && path.startsWith("/factura/")) {
      const id = path.replace("/factura/", "");
      const r = await pymes(`/facturas-venta/${encodeURIComponent(id)}`);
      return json({ ok: r.ok, status: r.status, data: r.data });
    }

    // ═══ Pago sobre factura ══════════════════════════════════════════════════
    if (req.method === "POST" && path === "/pago") {
      const body = await req.json();
      const r = await pymes("/pagos", { method: "POST", body: JSON.stringify(body) });
      return json({ ok: r.ok, status: r.status, data: r.data });
    }

    // ═══ Productos — crear / modificar ═══════════════════════════════════════
    if (req.method === "POST" && path === "/producto") {
      const body = await req.json();
      const r = await pymes("/productos", { method: "POST", body: JSON.stringify(body) });
      return json({ ok: r.ok, status: r.status, data: r.data });
    }
    if (req.method === "PUT" && path.startsWith("/producto/")) {
      const id = path.replace("/producto/", "");
      const body = await req.json();
      const r = await pymes(`/productos/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
      return json({ ok: r.ok, status: r.status, data: r.data });
    }

    // ═══ Vendedores ─ crear ══════════════════════════════════════════════════
    if (req.method === "POST" && path === "/vendedor") {
      const body = await req.json();
      const r = await pymes("/vendedores", { method: "POST", body: JSON.stringify(body) });
      return json({ ok: r.ok, status: r.status, data: r.data });
    }

    return json({ error: "Ruta no encontrada", path }, 404);
  } catch (err) {
    console.error("loggro-pymes-sync error:", err);
    return json({ error: String(err) }, 500);
  }
});
