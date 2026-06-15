/**
 * whatsapp-recordatorios — Supabase Edge Function (cron)
 * Se ejecuta diariamente a las 8am (Colombia) via pg_cron o cron trigger.
 * Envía recordatorios 24h y 2h antes de cada reserva confirmada.
 *
 * Cron schedule: "0 13 * * *"  (8am Colombia = 13:00 UTC)
 */

const PHONE_NUMBER_ID = "555249284336728";
const META_TOKEN      = Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function normalizePhone(raw: string): string {
  if (!raw) return "";
  let num = raw.replace(/[\s\-\(\)]/g, "");
  if (/^3\d{9}$/.test(num)) num = "+57" + num;
  if (!num.startsWith("+")) num = "+" + num;
  return num;
}

// ── Calcular hora llegada muelle (20 min antes) ──────────────────────────────
function horaLlegada(horaStr: string | null): string {
  if (!horaStr) return "";
  const [h, m] = horaStr.split(":").map(Number);
  const total = h * 60 + m - 20;
  const norm  = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
}

// Helper para fetch con timeout. Antes los fetch a Meta Graph y Supabase
// colgaban si la API se ponia lenta — el cron se quedaba esperando
// indefinidamente y bloqueaba ejecuciones posteriores.
async function fetchConTimeout(url: string, init: RequestInit, timeoutMs = 15_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function sendWhatsApp(to: string, template: string, params: string[]) {
  if (!META_TOKEN || !to) return null;
  const phone = normalizePhone(to);
  if (!phone) return null;

  try {
    const res = await fetchConTimeout(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${META_TOKEN}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type:    "individual",
          to:                phone,
          type:              "template",
          template: {
            name:     template,
            language: { code: "es" },
            components: [{
              type:       "body",
              parameters: params.map(p => ({ type: "text", text: p })),
            }],
          },
        }),
      }
    );
    return res.json();
  } catch (e) {
    return { error: e instanceof Error && e.name === "AbortError" ? "meta_timeout" : "meta_error" };
  }
}

async function dbGet(path: string) {
  try {
    const res = await fetchConTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        "apikey":        SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });
    return res.json();
  } catch (e) {
    return [];
  }
}

async function dbInsertSilent(path: string, body: unknown) {
  try {
    await fetchConTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "POST",
      headers: {
        "apikey":        SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
      },
      body: JSON.stringify(body),
    });
  } catch (_) { /* best effort */ }
}

// Dedup en memoria + DB: registramos cada envio en wa_recordatorios_log
// con UNIQUE(reserva_id, tipo, fecha_envio). Si el cron corre dos veces
// el mismo dia, el segundo INSERT falla por UNIQUE y NO re-enviamos.
async function yaEnviado(reservaId: string, tipo: string, fechaISO: string): Promise<boolean> {
  const rows = await dbGet(`wa_recordatorios_log?select=reserva_id&reserva_id=eq.${reservaId}&tipo=eq.${tipo}&fecha_envio=eq.${fechaISO}&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

Deno.serve(async () => {
  if (!META_TOKEN) {
    return new Response("META_WHATSAPP_TOKEN not configured", { status: 500 });
  }

  const now       = new Date();
  const bogota    = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const todayISO  = bogota.toLocaleDateString("en-CA");

  // Calcular fecha de mañana
  const tmr      = new Date(bogota);
  tmr.setDate(tmr.getDate() + 1);
  const tmrISO   = tmr.toLocaleDateString("en-CA");

  const results: unknown[] = [];

  // ── Recordatorio 24h: reservas de mañana ────────────────────────────────
  const reservas24 = await dbGet(
    `reservas?select=id,nombre,telefono,fecha,tipo,pax,salida_id&estado=eq.confirmado&fecha=eq.${tmrISO}`
  );

  for (const r of (Array.isArray(reservas24) ? reservas24 : [])) {
    if (!r.telefono) continue;

    // Dedup: si ya enviamos el recordatorio 24h para esta reserva hoy, skip.
    // El cron puede re-ejecutarse (reschedule, retry, clock skew) y el
    // cliente recibia el mismo mensaje 2 o 3 veces.
    if (await yaEnviado(r.id, "24h", todayISO)) {
      results.push({ reserva: r.id, tipo: "24h", skipped: "ya_enviado" });
      continue;
    }

    // Fetch salida
    let salida: { hora?: string; hora_regreso?: string } = {};
    if (r.salida_id) {
      const sals = await dbGet(`salidas?select=hora,hora_regreso&id=eq.${r.salida_id}`);
      if (Array.isArray(sals) && sals[0]) salida = sals[0];
    }

    const llegada = horaLlegada(salida.hora ?? null);
    const nombre  = r.nombre?.split(" ")[0] ?? r.nombre;
    const fecha   = new Date(r.fecha + "T12:00:00").toLocaleDateString("es-CO", {
      weekday: "long", day: "numeric", month: "long",
    });

    const res = await sendWhatsApp(r.telefono, "recordatorio_visita", [
      nombre,
      fecha,
      r.tipo ?? "Pasadía",
      String(r.pax ?? 1),
      llegada || salida.hora || "ver confirmación",
      salida.hora ?? "ver confirmación",
    ]);

    // Registrar envío SOLO si Meta lo aceptó (no marcar errores como enviados).
    const enviado = res && !res.error && res.messages?.[0]?.id;
    if (enviado) {
      await dbInsertSilent("wa_recordatorios_log",
        { reserva_id: r.id, tipo: "24h", fecha_envio: todayISO, meta_message_id: res.messages[0].id }
      );
    }

    results.push({ reserva: r.id, tipo: "24h", result: res });
  }

  // ── Recordatorio 2h: reservas de HOY (lanzado a las 8am, salida típica 10am) ──
  // Solo enviar si la salida es dentro de 2-4 horas desde ahora
  const reservasHoy = await dbGet(
    `reservas?select=id,nombre,telefono,fecha,tipo,pax,salida_id&estado=eq.confirmado&fecha=eq.${todayISO}`
  );

  const nowMins = bogota.getHours() * 60 + bogota.getMinutes();

  for (const r of (Array.isArray(reservasHoy) ? reservasHoy : [])) {
    if (!r.telefono || !r.salida_id) continue;

    // Dedup 2h también — el cron puede correr varias veces dentro de la
    // ventana 90-150 min y disparar el mismo mensaje 2-3 veces.
    if (await yaEnviado(r.id, "2h", todayISO)) {
      results.push({ reserva: r.id, tipo: "2h", skipped: "ya_enviado" });
      continue;
    }

    const sals = await dbGet(`salidas?select=hora,hora_regreso&id=eq.${r.salida_id}`);
    const salida = (Array.isArray(sals) && sals[0]) ? sals[0] : {};

    if (!salida.hora) continue;

    const [sh, sm] = (salida.hora as string).split(":").map(Number);
    const salidaMins = sh * 60 + sm;
    const diffMins   = salidaMins - nowMins;

    // Solo enviar si la salida es entre 90 y 150 minutos desde ahora
    if (diffMins < 90 || diffMins > 150) continue;

    const llegada = horaLlegada(salida.hora);
    const nombre  = r.nombre?.split(" ")[0] ?? r.nombre;

    const res = await sendWhatsApp(r.telefono, "recordatorio_muelle", [
      nombre,
      llegada || salida.hora,
      salida.hora,
    ]);

    const enviado = res && !res.error && res.messages?.[0]?.id;
    if (enviado) {
      await dbInsertSilent("wa_recordatorios_log",
        { reserva_id: r.id, tipo: "2h", fecha_envio: todayISO, meta_message_id: res.messages[0].id }
      );
    }

    results.push({ reserva: r.id, tipo: "2h", result: res });
  }

  return new Response(JSON.stringify({ sent: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
