// contratistas-registro — Registro express público de contratistas por evento
//
// URL pública: https://www.atolon.co/contratistas/registro/<eventoId>
//
// GET  /info/<eventoId>        → datos mínimos del evento (nombre, fecha) o 404
// POST /submit/<eventoId>      → { empresa: {...}, personas: [...] }
//   - Sube archivos (RUT base64, ARLs base64) a bucket b2b-docs con service role
//   - Hace append del contratista a eventos.contratistas (jsonb array)
//
// verify_jwt = false (es público; lo invoca el navegador del contratista)

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const action   = parts[1]; // "info" | "submit"
  const eventoId = parts[2];

  if (!eventoId) return json({ ok: false, error: "missing_evento" }, 400);

  try {
    const SB = sb();

    if (req.method === "GET" && action === "info") {
      const { data: evento, error } = await SB
        .from("eventos")
        .select("id, cliente, fecha, hora_inicio, hora_fin, lugar")
        .eq("id", eventoId)
        .maybeSingle();
      if (error || !evento) return json({ ok: false, error: "not_found" }, 404);
      return json({
        ok: true,
        evento: {
          id:          evento.id,
          cliente:     evento.cliente || null,
          fecha:       evento.fecha   || null,
          hora_inicio: evento.hora_inicio || null,
          hora_fin:    evento.hora_fin || null,
          lugar:       evento.lugar  || null,
        },
      });
    }

    if (req.method === "POST" && action === "submit") {
      const body = await req.json().catch(() => ({}));
      const empresa = body.empresa || {};
      const personasIn = Array.isArray(body.personas) ? body.personas : [];

      if (!empresa.nombre || !String(empresa.nombre).trim()) {
        return json({ ok: false, error: "empresa.nombre requerido" }, 400);
      }

      const { data: evento } = await SB
        .from("eventos")
        .select("id, contratistas")
        .eq("id", eventoId)
        .maybeSingle();
      if (!evento) return json({ ok: false, error: "evento_no_encontrado" }, 404);

      let rut_url: string | null = null;
      if (empresa.rut_data_url) {
        rut_url = await uploadDataUrl(SB, empresa.rut_data_url, eventoId, "rut");
      }

      const personas: any[] = [];
      for (let i = 0; i < personasIn.length; i++) {
        const p = personasIn[i] || {};
        if (!p.nombre || !String(p.nombre).trim()) continue;
        let arl_url: string | null = null;
        if (p.arl_data_url) {
          arl_url = await uploadDataUrl(SB, p.arl_data_url, eventoId, `arl-${safeName(p.cedula || String(i))}`);
        }
        personas.push({
          nombre:           String(p.nombre).trim(),
          cedula:           String(p.cedula || "").trim(),
          fecha_nacimiento: p.fecha_nacimiento || null,
          rol:              String(p.rol || "").trim(),
          arl_url,
        });
      }

      const nuevoId = `CTR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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
      };

      const lista = Array.isArray(evento.contratistas) ? evento.contratistas : [];
      lista.push(contratista);
      const { error: upErr } = await SB
        .from("eventos")
        .update({ contratistas: lista })
        .eq("id", eventoId);
      if (upErr) return json({ ok: false, error: upErr.message }, 500);

      return json({ ok: true, contratista_id: nuevoId, personas: personas.length });
    }

    return json({ ok: false, error: "ruta_invalida" }, 404);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
