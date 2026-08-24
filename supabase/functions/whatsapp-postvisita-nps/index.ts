/**
 * whatsapp-postvisita-nps — Edge function cron
 *
 * Corre diariamente a las 10am Colombia (15:00 UTC). Para cada reserva
 * WEB-* o WhatsApp cuya fecha = AYER, aún no se pidió NPS y tenga
 * teléfono → genera token único, inserta fila en nps_respuestas,
 * envía plantilla WA con:
 *   - link Google Review directo
 *   - link /nps?t=<token> para responder 0-10
 *
 * Suggested cron: "0 15 * * *"
 *
 * REQUIERE plantilla WA aprobada en Meta:
 *   name: nps_post_visita_es
 *   idioma: es
 *   parámetros body:
 *     {{1}} = nombre
 *     {{2}} = fecha visita
 *     {{3}} = link Google review
 *     {{4}} = link NPS (0-10)
 */

const PHONE_NUMBER_ID = "555249284336728";
const META_TOKEN      = Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC_APP_URL  = Deno.env.get("PUBLIC_APP_URL") ?? "https://www.atolon.co";
const GOOGLE_REVIEW_URL = Deno.env.get("GOOGLE_REVIEW_URL") ?? "https://g.page/r/atolon-beach-club/review";

function normalizePhone(raw: string): string {
  if (!raw) return "";
  let num = raw.replace(/[\s\-\(\)]/g, "");
  if (/^3\d{9}$/.test(num)) num = "+57" + num;
  if (!num.startsWith("+")) num = "+" + num;
  return num;
}

function ayerISO(): string {
  const now = new Date();
  const bogota = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  bogota.setDate(bogota.getDate() - 1);
  return bogota.toISOString().slice(0, 10);
}

function genToken(): string {
  // Token de 24 chars — suficiente para link único
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    .slice(0, 24);
}

async function fetchTO(url: string, init: RequestInit, ms = 15_000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); }
  finally { clearTimeout(t); }
}

async function dbGet(path: string) {
  const r = await fetchTO(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return r.ok ? r.json() : [];
}

async function dbInsert(path: string, body: unknown) {
  const r = await fetchTO(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : null;
}

async function dbPatch(path: string, body: unknown) {
  await fetchTO(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function sendWhatsApp(to: string, name: string, params: string[]) {
  if (!META_TOKEN || !to) return { error: "no_token" };
  const phone = normalizePhone(to);
  if (!phone) return { error: "bad_phone" };
  try {
    const res = await fetchTO(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "template",
          template: {
            name,
            language: { code: "es" },
            components: [{ type: "body", parameters: params.map(p => ({ type: "text", text: p })) }],
          },
        }),
      }
    );
    return res.json();
  } catch (e) {
    return { error: e instanceof Error && e.name === "AbortError" ? "timeout" : "fetch_error" };
  }
}

Deno.serve(async () => {
  const ayer = ayerISO();
  // Reservas de ayer, digitales (WEB-* o canal WA), con teléfono, sin NPS
  // solicitado, no canceladas.
  const reservas = await dbGet(
    `reservas?select=id,nombre,telefono,fecha,canal,tipo,pax&fecha=eq.${ayer}` +
    `&nps_solicitado_at=is.null&telefono=not.is.null` +
    `&estado=not.in.(cancelado,anulado,reembolsado,no_show)` +
    `&or=(id.like.WEB-*,canal.in.(tatiana,concierge_ai,whatsapp,wa,WhatsApp,Wa))`
  );

  const arr = Array.isArray(reservas) ? reservas : [];
  const results: unknown[] = [];

  for (const r of arr) {
    if (!r.telefono || !r.nombre) continue;

    const token = genToken();
    const canal = String(r.canal || "").toLowerCase();
    const canalOrigen = ["tatiana", "concierge_ai", "whatsapp", "wa"].includes(canal) ? "whatsapp" : "web";

    // Insertar fila pendiente
    await dbInsert("nps_respuestas", {
      reserva_id: r.id,
      token,
      cliente_nombre: r.nombre,
      telefono: r.telefono,
      canal_origen: canalOrigen,
    });

    const nombre = r.nombre.split(" ")[0];
    const fechaTxt = new Date(r.fecha + "T12:00:00").toLocaleDateString("es-CO", {
      day: "numeric", month: "long",
    });
    const npsLink = `${PUBLIC_APP_URL}/nps?t=${token}`;

    const res = await sendWhatsApp(r.telefono, "nps_post_visita_es", [
      nombre,
      fechaTxt,
      GOOGLE_REVIEW_URL,
      npsLink,
    ]);

    const enviado = res && !("error" in res) && (res as { messages?: [{ id: string }] }).messages?.[0]?.id;
    if (enviado) {
      await dbPatch(`reservas?id=eq.${encodeURIComponent(r.id)}`, {
        nps_solicitado_at: new Date().toISOString(),
      });
    }

    results.push({ reserva: r.id, sent: !!enviado, ...(res && "error" in res ? { error: (res as { error: string }).error } : {}) });
  }

  return new Response(JSON.stringify({
    ayer, procesados: arr.length, enviados: results.filter((x: unknown) => (x as { sent?: boolean }).sent).length, results,
  }), { headers: { "Content-Type": "application/json" } });
});
