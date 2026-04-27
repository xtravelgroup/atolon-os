// Cron Vercel: cada 15 minutos sincroniza Loggro → Atolón OS
// Llama al edge function /loggro-sync/sync-loggro-to-atolon que descuenta
// del stock_locacion las ventas/consumos que pasaron en Loggro Restobar.

export default async function handler(req, res) {
  // Vercel cron envía un GET con el header user-agent: vercel-cron
  // En desarrollo aceptamos también GET/POST normales.
  const isCron = req.headers["user-agent"]?.includes("vercel-cron")
              || req.query?.cron === "1";

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey) {
    return res.status(500).json({ ok: false, error: "Supabase env missing" });
  }

  try {
    const r = await fetch(`${sbUrl}/functions/v1/loggro-sync/sync-loggro-to-atolon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sbKey}`,
        apikey: sbKey,
      },
      body: JSON.stringify({}),
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : 500).json({
      ok: r.ok,
      cron: isCron,
      timestamp: new Date().toISOString(),
      result: data,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
