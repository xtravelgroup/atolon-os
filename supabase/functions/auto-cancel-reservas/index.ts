// Edge Function: auto-cancel-reservas
// Cancela reservas pendiente_pago con más de 30 minutos sin pagar.
// Se invoca via pg_cron cada 5 minutos desde la base de datos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async () => {
  const threshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("reservas")
    .update({ estado: "cancelado" })
    .eq("estado", "pendiente_pago")
    .lt("created_at", threshold)
    .select("id");

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  const canceladas = data?.length ?? 0;
  console.log(`[auto-cancel] ${new Date().toISOString()} — canceladas: ${canceladas}`);
  return new Response(JSON.stringify({ ok: true, canceladas }), { status: 200 });
});
