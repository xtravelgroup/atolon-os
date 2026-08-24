/**
 * nps-responder — Edge function pública
 *
 * POST /nps-responder { token, score, comentario, google_review_click }
 *   → valida token, graba score + categoría, marca responded_at
 *
 * GET /nps-responder?token=xxx
 *   → devuelve estado (para que la página muestre el nombre)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Content-Type": "application/json",
  };
}

function categorizar(score: number): string {
  if (score >= 9) return "promotor";
  if (score >= 7) return "pasivo";
  return "detractor";
}

async function dbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return r.ok ? r.json() : null;
}
async function dbPatch(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

  const url = new URL(req.url);
  const method = req.method;

  // GET: devuelve status del token para renderizar página
  if (method === "GET") {
    const token = url.searchParams.get("token") || "";
    if (!token) return new Response(JSON.stringify({ ok: false, error: "no_token" }), { status: 400, headers: corsHeaders() });
    const rows = await dbGet(`nps_respuestas?token=eq.${encodeURIComponent(token)}&select=cliente_nombre,responded_at,score`);
    const row = Array.isArray(rows) && rows[0];
    if (!row) return new Response(JSON.stringify({ ok: false, error: "token_invalido" }), { status: 404, headers: corsHeaders() });
    return new Response(JSON.stringify({
      ok: true,
      nombre: row.cliente_nombre?.split(" ")[0] || "",
      ya_respondio: !!row.responded_at,
      score_previo: row.score ?? null,
    }), { headers: corsHeaders() });
  }

  // POST: graba respuesta
  if (method === "POST") {
    let body: { token?: string; score?: number; comentario?: string; google_review_click?: boolean } = {};
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ ok: false, error: "bad_json" }), { status: 400, headers: corsHeaders() }); }

    const token = body.token?.trim() || "";
    const score = Number(body.score);
    if (!token) return new Response(JSON.stringify({ ok: false, error: "no_token" }), { status: 400, headers: corsHeaders() });
    if (isNaN(score) || score < 0 || score > 10) return new Response(JSON.stringify({ ok: false, error: "score_invalido" }), { status: 400, headers: corsHeaders() });

    // Verificar token existe y no está respondido (permitimos update si aún no respondió)
    const rows = await dbGet(`nps_respuestas?token=eq.${encodeURIComponent(token)}&select=id,responded_at`);
    const row = Array.isArray(rows) && rows[0];
    if (!row) return new Response(JSON.stringify({ ok: false, error: "token_invalido" }), { status: 404, headers: corsHeaders() });
    // Permitimos re-responder si el usuario cambia de opinión → sobrescribir.

    const patch: Record<string, unknown> = {
      score,
      categoria: categorizar(score),
      comentario: (body.comentario || "").slice(0, 500) || null,
      responded_at: new Date().toISOString(),
    };
    if (body.google_review_click === true) patch.google_review_click = true;

    const updated = await dbPatch(`nps_respuestas?token=eq.${encodeURIComponent(token)}`, patch);
    return new Response(JSON.stringify({ ok: true, categoria: patch.categoria, resultado: updated }), { headers: corsHeaders() });
  }

  return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: corsHeaders() });
});
