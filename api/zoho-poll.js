// Cron Vercel: cada 5 min consulta pagos exitosos en Zoho Pay y marca las
// reservas como confirmadas si encuentra match. Safety net mientras se
// arregla la config del webhook de Zoho.

export default async function handler(req, res) {
  const isCron = req.headers["user-agent"]?.includes("vercel-cron")
              || req.query?.cron === "1";

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const cronSecret = process.env.CRON_SECRET;
  if (!sbUrl || !sbKey) {
    return res.status(500).json({ ok: false, error: "Supabase env missing" });
  }
  if (!cronSecret) {
    return res.status(500).json({ ok: false, error: "CRON_SECRET no configurado en Vercel env" });
  }

  try {
    const r = await fetch(`${sbUrl}/functions/v1/zoho-payments/poll-recent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sbKey}`,
        apikey: sbKey,
        // El endpoint /poll-recent exige este header desde el fix de seguridad.
        // Debe coincidir con CRON_SECRET en Supabase Functions Secrets.
        "x-atolon-cron-secret": cronSecret,
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
