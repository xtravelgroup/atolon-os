// Cron Vercel: cada 15 minutos sincroniza Loggro → Atolón OS
// Llama al edge function /loggro-sync/sync-loggro-to-atolon que descuenta
// del stock_locacion las ventas/consumos que pasaron en Loggro Restobar.

export default async function handler(req, res) {
  // Auth: CRON_SECRET via Authorization header. user-agent es falsificable.
  // Mismo patron que wompi-poll/zoho-poll (PR #188).
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    // Fail-closed si no hay secret configurado.
    return res.status(500).json({ ok: false, error: "CRON_SECRET not configured" });
  }
  const auth = req.headers["x-atolon-cron-secret"] || req.headers["authorization"]?.replace(/^Bearer\s+/i, "");
  if (auth !== expectedSecret) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  const isCron = req.headers["user-agent"]?.includes("vercel-cron")
              || req.query?.cron === "1";

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey) {
    return res.status(500).json({ ok: false, error: "Supabase env missing" });
  }

  // Timeout 30s en fetch a Supabase para evitar cuelgues que bloqueen el cron.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(`${sbUrl}/functions/v1/loggro-sync/sync-loggro-to-atolon`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sbKey}`,
        apikey: sbKey,
      },
      body: JSON.stringify({}),
    });
    clearTimeout(timer);
    const data = await r.json();
    return res.status(r.ok ? 200 : 500).json({
      ok: r.ok,
      cron: isCron,
      timestamp: new Date().toISOString(),
      result: data,
    });
  } catch (e) {
    clearTimeout(timer);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
