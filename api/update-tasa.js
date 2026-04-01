/**
 * Vercel Cron Function: actualiza tasa USD/COP en Supabase
 * Schedule: todos los días a las 8am Colombia (1pm UTC)
 * Configurado en vercel.json → "crons"
 */
export default async function handler(req, res) {
  // Seguridad: solo Vercel Cron o llamadas con CRON_SECRET pueden ejecutar esto
  const secret = req.headers["authorization"];
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 1. Obtener tasa en vivo
    const rateRes = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
    );
    if (!rateRes.ok) throw new Error("Exchange rate API error");
    const rateData = await rateRes.json();
    const cop = rateData?.usd?.cop;
    if (!cop || cop < 1000) throw new Error("Invalid rate: " + cop);
    const tasa = Math.round(cop);

    // 2. Guardar en Supabase
    const sbUrl  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL;
    const sbKey  = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const update = await fetch(`${sbUrl}/rest/v1/configuracion?id=eq.atolon`, {
      method:  "PATCH",
      headers: {
        "apikey":        sbKey,
        "Authorization": `Bearer ${sbKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ tasa_usd: tasa }),
    });

    if (!update.ok) {
      const err = await update.text();
      throw new Error("Supabase error: " + err);
    }

    console.log(`[update-tasa] ✅ Tasa actualizada: ${tasa} COP/USD`);
    return res.status(200).json({ ok: true, tasa_usd: tasa });

  } catch (e) {
    console.error("[update-tasa] ❌", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
