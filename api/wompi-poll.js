// Cron Vercel: cada 5 min consulta reservas Wompi recientes que estén
// canceladas/pendientes y verifica con Wompi si el pago fue APPROVED.
// Si lo fue, restaura la reserva. Red de seguridad ante webhooks fallidos.

export default async function handler(req, res) {
  const isCron = req.headers["user-agent"]?.includes("vercel-cron")
              || req.query?.cron === "1";

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey) {
    return res.status(500).json({ ok: false, error: "Supabase env missing" });
  }

  try {
    const r = await fetch(`${sbUrl}/functions/v1/wompi-webhook/poll-recent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sbKey}`,
        apikey: sbKey,
      },
      body: JSON.stringify({ hours: 2 }),
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : 500).json({
      ok: r.ok,
      cron: isCron,
      ...data,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
