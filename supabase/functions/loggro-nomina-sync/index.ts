// loggro-nomina-sync (Atolón OS)
// Sincroniza empleados ("vinculados") y nómina desde Loggro Nómina.
//
// Base URL oficial: https://api.loggro.com/apik/loggro-nomina/
// Auth: Bearer token (generado desde Loggro web → Configuración/Organización → Integración APIs)
//
// Endpoints expuestos por esta función:
//   GET  /loggro-nomina-sync/ping              — verifica conexión
//   GET  /loggro-nomina-sync/probe             — descubre endpoints disponibles
//   GET  /loggro-nomina-sync/vinculados        — lista empleados (raw desde Loggro)
//   POST /loggro-nomina-sync/sync-vinculados   — sincroniza a empleados_loggro
//   GET  /loggro-nomina-sync/nominas           — últimas nóminas
//   GET  /loggro-nomina-sync/pagos             — configuración de pagos
//   GET  /loggro-nomina-sync/reportes          — reportes / certificados
//
// Variables de entorno:
//   LOGGRO_NOMINA_TOKEN    (bearer token del usuario)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LOGGRO_BASE  = "https://api.loggro.com/apik/loggro-nomina";
const LOGGRO_TOKEN = Deno.env.get("LOGGRO_NOMINA_TOKEN") || "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function loggro(path: string, init?: RequestInit): Promise<any> {
  if (!LOGGRO_TOKEN) throw new Error("LOGGRO_NOMINA_TOKEN no configurado. Generar token en Loggro → Configuración/Organización → Integración APIs.");
  const url = path.startsWith("http") ? path : `${LOGGRO_BASE}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${LOGGRO_TOKEN}`,
      "Content-Type":  "application/json",
      ...(init?.headers || {}),
    },
  });
  const txt = await res.text();
  let data: any = null;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  if (!res.ok) throw new Error(`${init?.method || "GET"} ${url} → ${res.status}: ${txt.slice(0, 400)}`);
  return data;
}

// ─── Mapeo de campos desde Loggro Nómina → tabla empleados_loggro ─────────
function mapEmpleado(src: any): any {
  const f = (...keys: string[]) => {
    for (const k of keys) {
      const v = k.split(".").reduce((o: any, kk) => (o == null ? null : o[kk]), src);
      if (v != null && v !== "") return v;
    }
    return null;
  };
  const nombres   = f("firstName", "primerNombre", "nombres", "nombre");
  const segundoN  = f("secondName", "segundoNombre");
  const apellido1 = f("lastName", "primerApellido", "apellidos");
  const apellido2 = f("secondLastName", "segundoApellido");
  const nombresFull   = [nombres, segundoN].filter(Boolean).join(" ").trim() || nombres;
  const apellidosFull = [apellido1, apellido2].filter(Boolean).join(" ").trim() || apellido1;
  const nombreCompleto = [nombresFull, apellidosFull].filter(Boolean).join(" ").trim() ||
                         f("fullName", "nombreCompleto");

  const toDate = (v: any) => v ? String(v).slice(0, 10) : null;

  return {
    loggro_id:         String(f("idEmpleado", "id", "uuid", "employeeId", "vinculadoId") || ""),
    documento:         f("idEmpleado", "documentNumber", "numeroDocumento", "documento", "identification"),
    tipo_documento:    f("tipoDocumento", "tipoDocumentoCode", "documentType"),
    nombres:           nombresFull,
    apellidos:         apellidosFull,
    nombre_completo:   nombreCompleto,
    email:             f("email", "correo"),
    telefono:          f("phone", "telefono", "celular", "mobile", "cellphone"),
    direccion:         f("address", "direccion"),
    ciudad:            f("city", "ciudad"),
    fecha_nacimiento:  toDate(f("birthDate", "fechaNacimiento")),
    fecha_ingreso:     toDate(f("fechaInicioContrato", "hireDate", "fechaIngreso", "startDate")),
    fecha_retiro:      toDate(f("fechaFinContrato", "terminationDate", "fechaRetiro", "endDate")),
    cargo:             f("cargo", "position", "jobTitle"),
    departamento:      f("area", "department", "departamento"),
    centro_costo:      f("centro", "costCenter", "centroCosto"),
    salario_base:      Number(f("salarioBase", "baseSalary", "salario") || 0),
    tipo_contrato:     f("tipoContrato", "contractType"),
    tipo_salario:      f("tipoSalario", "salaryType"),
    metodo_pago:       f("paymentMethod", "metodoPago"),
    banco:             f("bank", "banco"),
    cuenta_bancaria:   f("bankAccount", "cuentaBancaria"),
    eps:               f("eps"),
    fondo_pension:     f("pensionFund", "fondoPension"),
    fondo_cesantias:   f("severanceFund", "fondoCesantias"),
    arl:               f("arl"),
    caja_compensacion: f("compensationFund", "cajaCompensacion"),
    estado:            (() => {
      if (f("activo") === true) return "activo";
      if (f("activo") === false) return "retirado";
      if (f("conContratoVigente") === true) return "activo";
      if (f("conContratoVigente") === false) return "retirado";
      if (f("fechaFinContrato", "terminationDate", "fechaRetiro")) return "retirado";
      return "activo";
    })(),
    ultima_sync:  new Date().toISOString(),
    raw_payload:  src,
    updated_at:   new Date().toISOString(),
  };
}

async function probeNominaEndpoints(): Promise<any> {
  const paths = [
    "/vinculados",
    "/vinculados/activos",
    "/empleados",
    "/nomina",
    "/nominas",
    "/pagos",
    "/reportes",
    "/certificados",
  ];
  const results: Record<string, any> = {};
  for (const p of paths) {
    try {
      const url = `${LOGGRO_BASE}${p}`;
      const res = await fetch(url, { headers: { "Authorization": `Bearer ${LOGGRO_TOKEN}` } });
      const txt = await res.text();
      results[p] = {
        status: res.status,
        ok: res.ok,
        preview: txt.slice(0, 300),
      };
    } catch (e) {
      results[p] = { error: (e as Error).message };
    }
  }
  return { base: LOGGRO_BASE, endpoints: results };
}

function buildVinculadosUrl(opts?: { masivo?: boolean; conPrestaciones?: boolean; eliminados?: string[] }): string {
  const requestData = {
    masivo:          opts?.masivo ?? true,
    conPrestaciones: opts?.conPrestaciones ?? true,
    eliminados:      opts?.eliminados ?? [],
  };
  return `/vinculados?requestData=${encodeURIComponent(JSON.stringify(requestData))}`;
}

async function syncVinculados(enriquecer = false): Promise<any> {
  const t0 = Date.now();
  let rawResponse: any = null;
  let empleados: any[] = [];

  const data = await loggro(buildVinculadosUrl());
  rawResponse = { endpoint: "/vinculados", preview: JSON.stringify(data).slice(0, 500) };
  if (Array.isArray(data))                    empleados = data;
  else if (Array.isArray(data?.contenido))    empleados = data.contenido;   // Loggro Nómina formato real
  else if (Array.isArray(data?.data))         empleados = data.data;
  else if (Array.isArray(data?.content))      empleados = data.content;
  else if (Array.isArray(data?.items))        empleados = data.items;
  else if (Array.isArray(data?.vinculados))   empleados = data.vinculados;
  else if (Array.isArray(data?.empleados))    empleados = data.empleados;

  if (empleados.length === 0) {
    const err = "No se pudo obtener empleados. Ver /probe para el endpoint exacto.";
    await sb().from("loggro_nomina_sync_log").insert({
      resultado: "error", error_msg: err, duration_ms: Date.now() - t0, raw_response: rawResponse,
    });
    throw new Error(err);
  }

  let nuevos = 0, actualizados = 0;
  const supa = sb();
  for (const src of empleados) {
    // Enriquecer con detalle (trae salarioBase, banco, EPS, etc.) — requiere rol con permisos
    let detalle: any = null;
    if (enriquecer) {
      const tipoDoc = src.tipoDocumento || src.tipoDocumentoCode;
      const idEmp = src.idEmpleado || src.documento;
      if (tipoDoc && idEmp) {
        try {
          detalle = await loggro(`/vinculados/integracion/empleado/${tipoDoc}/${idEmp}`);
        } catch (_) { /* detalle opcional — ignorar si no hay permiso */ }
      }
    }
    const merged = { ...src, ...(detalle || {}) };
    const mapped = mapEmpleado(merged);
    if (!mapped.loggro_id) continue;
    const { data: existing } = await supa.from("empleados_loggro").select("id").eq("loggro_id", mapped.loggro_id).maybeSingle();
    if (existing) {
      await supa.from("empleados_loggro").update(mapped).eq("id", existing.id);
      actualizados++;
    } else {
      await supa.from("empleados_loggro").insert(mapped);
      nuevos++;
    }
  }

  const durationMs = Date.now() - t0;
  await supa.from("loggro_nomina_sync_log").insert({
    resultado: "ok",
    empleados_new:   nuevos,
    empleados_upd:   actualizados,
    empleados_total: empleados.length,
    duration_ms:     durationMs,
    raw_response:    rawResponse,
  });

  return { ok: true, nuevos, actualizados, total: empleados.length, durationMs };
}

// ─── Router ────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/loggro-nomina-sync/, "") || "/";

  try {
    if (req.method === "GET" && (path === "/" || path === "/ping")) {
      return new Response(JSON.stringify({
        ok: true,
        base: LOGGRO_BASE,
        tokenConfigured: Boolean(LOGGRO_TOKEN),
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (req.method === "GET" && path === "/probe") {
      const result = await probeNominaEndpoints();
      return new Response(JSON.stringify(result, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (req.method === "GET" && path === "/vinculados") {
      const data = await loggro(buildVinculadosUrl());
      return new Response(JSON.stringify(data, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (req.method === "POST" && path === "/sync-vinculados") {
      const enriquecer = url.searchParams.get("enriquecer") === "1";
      const result = await syncVinculados(enriquecer);
      return new Response(JSON.stringify(result), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    // /empleado/CC/123456
    const mEmp = path.match(/^\/empleado\/([A-Z]+)\/([^/]+)\/?$/);
    if (req.method === "GET" && mEmp) {
      const data = await loggro(`/vinculados/integracion/empleado/${mEmp[1]}/${mEmp[2]}`);
      return new Response(JSON.stringify(data, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    // /vacaciones?anoDesde=2025&mesDesde=1&anoHasta=2026&mesHasta=4
    if (req.method === "GET" && path === "/vacaciones") {
      const qs = url.searchParams.toString();
      const data = await loggro(`/reporte/historicoVacaciones${qs ? "?" + qs : ""}`);
      return new Response(JSON.stringify(data, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    // /salarios  →  histórico de salarios (reportes)
    if (req.method === "GET" && path === "/salarios") {
      const qs = url.searchParams.toString();
      const data = await loggro(`/reporte/historicoSalarios${qs ? "?" + qs : ""}`);
      return new Response(JSON.stringify(data, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    // /incapacidades?anoDesde=2025&mesDesde=1&anoHasta=2026&mesHasta=4
    if (req.method === "GET" && path === "/incapacidades") {
      const qs = url.searchParams.toString();
      const data = await loggro(`/reporte/historicoIncapacidades${qs ? "?" + qs : ""}`);
      return new Response(JSON.stringify(data, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    // /entidades-ss  →  histórico de entidades de seguridad social
    if (req.method === "GET" && path === "/entidades-ss") {
      const qs = url.searchParams.toString();
      const data = await loggro(`/reporte/historicoEntidadesSeguridadSocial${qs ? "?" + qs : ""}`);
      return new Response(JSON.stringify(data, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    // /ausentismos?anoDesde=2025&mesDesde=1&anoHasta=2026&mesHasta=4
    if (req.method === "GET" && path === "/ausentismos") {
      const qs = url.searchParams.toString();
      const data = await loggro(`/reporte/historicoAusentismos${qs ? "?" + qs : ""}`);
      return new Response(JSON.stringify(data, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    // Pass-through genérico a cualquier reporte: /raw?path=/reporte/xxx&...
    if (req.method === "GET" && path === "/raw") {
      const targetPath = url.searchParams.get("path");
      if (!targetPath) {
        return new Response(JSON.stringify({ error: "falta query param 'path'" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const forwardedParams = new URLSearchParams();
      for (const [k, v] of url.searchParams) if (k !== "path") forwardedParams.append(k, v);
      const qs = forwardedParams.toString();
      const data = await loggro(`${targetPath}${qs ? "?" + qs : ""}`);
      return new Response(JSON.stringify(data, null, 2), { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "endpoint no encontrado", path }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
