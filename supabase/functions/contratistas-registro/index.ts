// contratistas-registro — Registro express público de contratistas por evento
//
// URL del contratista: https://www.atolon.co/contratistas/registro/<eventoId>
// Tras enviar, el contratista recibe un link de GESTIÓN que apunta a
// /contratistas/registro/<eventoId>/<token> para volver y agregar más
// personal / archivos a SU mismo registro.
//
// GET  /info/<eventoId>                          → datos básicos del evento
// POST /submit/<eventoId>                        → nuevo registro (RUT y ARLs obligatorios)
// GET  /gestion/<eventoId>/<token>               → trae el registro existente
// POST /gestion/<eventoId>/<token>               → agrega más personas (ARL obligatoria) / actualiza empresa o RUT
//
// verify_jwt = false (público; lo invoca el navegador del contratista)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "b2b-docs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function safeName(name: string): string {
  return (name || "archivo")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string; ext: string } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  const b64  = m[2];
  const bin  = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const map: Record<string, string> = {
    "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/heic": "heic",
  };
  const ext = map[mime] || (mime.split("/")[1] || "bin").toLowerCase();
  return { bytes, mime, ext };
}

async function uploadDataUrl(SB: any, dataUrl: string, eventoId: string, prefix: string): Promise<string | null> {
  const dec = decodeDataUrl(dataUrl);
  if (!dec) return null;
  const path = `contratistas/${eventoId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${dec.ext}`;
  const { error } = await SB.storage.from(BUCKET).upload(path, dec.bytes, {
    upsert: false, contentType: dec.mime,
  });
  if (error) return null;
  const { data } = SB.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

function randToken(): string {
  // 24 chars alfanuméricos (base36 + base16)
  const a = crypto.randomUUID().replace(/-/g, "");
  return a.slice(0, 24);
}

// Procesa array de personas: valida ARL obligatoria, sube archivos.
// Devuelve { personas, faltantes } — faltantes es índices+nombre sin ARL.
async function procesarPersonas(SB: any, eventoId: string, personasIn: any[]): Promise<{ personas: any[]; faltantes: string[] }> {
  const personas: any[] = [];
  const faltantes: string[] = [];
  for (let i = 0; i < personasIn.length; i++) {
    const p = personasIn[i] || {};
    const nombre = String(p.nombre || "").trim();
    if (!nombre) continue; // ignorar personas sin nombre
    if (!p.arl_data_url) {
      faltantes.push(`${nombre || `Persona ${i + 1}`}`);
      continue;
    }
    const arl_url = await uploadDataUrl(SB, p.arl_data_url, eventoId, `arl-${safeName(p.cedula || String(i))}`);
    if (!arl_url) {
      faltantes.push(`${nombre} (error subiendo ARL)`);
      continue;
    }
    personas.push({
      nombre,
      cedula:           String(p.cedula || "").trim(),
      fecha_nacimiento: p.fecha_nacimiento || null,
      rol:              String(p.rol || "").trim(),
      arl_url,
      agregado_at:      new Date().toISOString(),
    });
  }
  return { personas, faltantes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // ["contratistas-registro", "info"|"submit"|"gestion", "<eventoId>", "<token>"?]
  const action   = parts[1];
  const eventoId = parts[2];
  const token    = parts[3] || null;

  if (!eventoId) return json({ ok: false, error: "missing_evento" }, 400);

  try {
    const SB = sb();

    // ── GET /info/<eventoId> ────────────────────────────────────────────
    if (req.method === "GET" && action === "info") {
      const { data: evento, error } = await SB
        .from("eventos")
        .select("id, nombre, fecha, hora_ini, hora_fin")
        .eq("id", eventoId)
        .maybeSingle();
      if (error || !evento) return json({ ok: false, error: "not_found" }, 404);
      return json({
        ok: true,
        evento: {
          id:       evento.id,
          nombre:   evento.nombre   || null,
          fecha:    evento.fecha    || null,
          hora_ini: evento.hora_ini || null,
          hora_fin: evento.hora_fin || null,
        },
      });
    }

    // ── POST /submit/<eventoId> ─────────────────────────────────────────
    if (req.method === "POST" && action === "submit") {
      const body = await req.json().catch(() => ({}));
      const empresa = body.empresa || {};
      const personasIn = Array.isArray(body.personas) ? body.personas : [];

      if (!empresa.nombre || !String(empresa.nombre).trim()) {
        return json({ ok: false, error: "Falta el nombre de la empresa" }, 400);
      }
      if (!empresa.rut_data_url) {
        return json({ ok: false, error: "El RUT de la empresa es obligatorio" }, 400);
      }
      const personasConNombre = personasIn.filter((p: any) => p?.nombre && String(p.nombre).trim());
      if (personasConNombre.length === 0) {
        return json({ ok: false, error: "Debes agregar al menos 1 persona" }, 400);
      }
      const sinArl = personasConNombre.filter((p: any) => !p.arl_data_url).map((p: any) => p.nombre);
      if (sinArl.length > 0) {
        return json({ ok: false, error: `Falta la ARL de: ${sinArl.join(", ")}` }, 400);
      }

      const { data: evento } = await SB
        .from("eventos")
        .select("id, contratistas")
        .eq("id", eventoId)
        .maybeSingle();
      if (!evento) return json({ ok: false, error: "evento_no_encontrado" }, 404);

      const rut_url = await uploadDataUrl(SB, empresa.rut_data_url, eventoId, "rut");
      if (!rut_url) return json({ ok: false, error: "No se pudo subir el RUT" }, 500);

      const { personas, faltantes } = await procesarPersonas(SB, eventoId, personasConNombre);
      if (faltantes.length > 0) {
        return json({ ok: false, error: `Error con ARL: ${faltantes.join(", ")}` }, 400);
      }

      const nuevoId = `CTR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const gestion_token = randToken();
      const contratista = {
        id:          nuevoId,
        nombre:      String(empresa.nombre).trim(),
        tipo:        "externo",
        cargo:       "",
        funcion:     String(empresa.descripcion || "").trim(),
        costo:       "",
        contacto:    String(empresa.contacto || "").trim(),
        personas,
        notas:       "",
        nit:         String(empresa.nit || "").trim(),
        direccion:   String(empresa.direccion || "").trim(),
        telefono:    String(empresa.telefono || "").trim(),
        rut_url,
        descripcion: String(empresa.descripcion || "").trim(),
        registro_express: true,
        registrado_at:    new Date().toISOString(),
        gestion_token,
      };

      const lista = Array.isArray(evento.contratistas) ? evento.contratistas : [];
      lista.push(contratista);
      const { error: upErr } = await SB
        .from("eventos")
        .update({ contratistas: lista })
        .eq("id", eventoId);
      if (upErr) return json({ ok: false, error: upErr.message }, 500);

      return json({
        ok: true,
        contratista_id: nuevoId,
        gestion_token,
        personas: personas.length,
      });
    }

    // ── GET /gestion/<eventoId>/<token> ─────────────────────────────────
    if (req.method === "GET" && action === "gestion" && token) {
      const { data: evento } = await SB
        .from("eventos")
        .select("id, nombre, fecha, contratistas")
        .eq("id", eventoId)
        .maybeSingle();
      if (!evento) return json({ ok: false, error: "evento_no_encontrado" }, 404);
      const lista = Array.isArray(evento.contratistas) ? evento.contratistas : [];
      const c = lista.find((x: any) => x?.gestion_token === token);
      if (!c) return json({ ok: false, error: "token_invalido" }, 404);
      // Devolvemos el contratista (sin filtrar el token; el dueño del link ya lo conoce)
      return json({
        ok: true,
        evento: { id: evento.id, nombre: evento.nombre, fecha: evento.fecha },
        contratista: c,
      });
    }

    // ── POST /gestion/<eventoId>/<token> ────────────────────────────────
    if (req.method === "POST" && action === "gestion" && token) {
      const body = await req.json().catch(() => ({}));
      const empresaUpd: any = body.empresa || {};
      const personasIn: any[] = Array.isArray(body.personas) ? body.personas : [];

      const { data: evento } = await SB
        .from("eventos")
        .select("id, contratistas")
        .eq("id", eventoId)
        .maybeSingle();
      if (!evento) return json({ ok: false, error: "evento_no_encontrado" }, 404);
      const lista: any[] = Array.isArray(evento.contratistas) ? evento.contratistas : [];
      const idx = lista.findIndex((x: any) => x?.gestion_token === token);
      if (idx < 0) return json({ ok: false, error: "token_invalido" }, 404);
      const c = { ...lista[idx] };

      // Personas nuevas (todas requieren ARL)
      let nuevasPersonas: any[] = [];
      if (personasIn.length > 0) {
        const personasConNombre = personasIn.filter(p => p?.nombre && String(p.nombre).trim());
        const sinArl = personasConNombre.filter(p => !p.arl_data_url).map(p => p.nombre);
        if (sinArl.length > 0) {
          return json({ ok: false, error: `Falta la ARL de: ${sinArl.join(", ")}` }, 400);
        }
        const res = await procesarPersonas(SB, eventoId, personasConNombre);
        if (res.faltantes.length > 0) {
          return json({ ok: false, error: `Error con ARL: ${res.faltantes.join(", ")}` }, 400);
        }
        nuevasPersonas = res.personas;
      }

      // Empresa: actualizar campos opcionalmente. RUT solo si reemplazan.
      const camposEmpresa = ["nombre", "nit", "direccion", "telefono", "contacto", "descripcion"];
      for (const k of camposEmpresa) {
        if (empresaUpd[k] != null && String(empresaUpd[k]).trim() !== "") {
          c[k] = String(empresaUpd[k]).trim();
          if (k === "descripcion") c.funcion = c[k];
        }
      }
      if (empresaUpd.rut_data_url) {
        const nuevoRut = await uploadDataUrl(SB, empresaUpd.rut_data_url, eventoId, "rut");
        if (nuevoRut) c.rut_url = nuevoRut;
      }

      // Personas: append (no se modifican las existentes)
      c.personas = [...(Array.isArray(c.personas) ? c.personas : []), ...nuevasPersonas];
      c.actualizado_at = new Date().toISOString();

      lista[idx] = c;
      const { error: upErr } = await SB
        .from("eventos")
        .update({ contratistas: lista })
        .eq("id", eventoId);
      if (upErr) return json({ ok: false, error: upErr.message }, 500);

      return json({
        ok: true,
        nuevas_personas: nuevasPersonas.length,
        total_personas: c.personas.length,
      });
    }

    return json({ ok: false, error: "ruta_invalida" }, 404);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
