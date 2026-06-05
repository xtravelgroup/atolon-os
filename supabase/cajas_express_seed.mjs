// Crea las 10 cajas virtuales del evento en Loggro + las seedea en
// cajas_evento_cajas con sus loggro_mesa_id mapeados.
//
// Uso: node supabase/cajas_express_seed.mjs
//
// Pre-req: la migración cajas_express_setup.sql ya aplicada.

import pg from "pg";
const { Client } = pg;

const SUPABASE_URL = "https://ncdyttgxuicyruathkxd.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";

const CAJAS = Array.from({ length: 10 }, (_, i) => ({
  name: `CAJA ${i + 1}`,
  description: `Caja ${i + 1} — Evento Sábado`,
  // Coords no son críticas — Loggro asigna por nombre.
  coord: { x: 10, y: i + 1 },
}));

async function createMesa(spot) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/loggro-sync/create-table`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      apikey:          ANON_KEY,
      Authorization:   `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(spot),
  });
  const data = await res.json();
  return data;
}

async function main() {
  console.log(`Creando ${CAJAS.length} cajas virtuales en Loggro…\n`);

  const results = [];
  for (const spot of CAJAS) {
    process.stdout.write(`  ${spot.name}… `);
    const r = await createMesa(spot);
    if (r.ok) {
      const mesa = r.mesa;
      const id = mesa._id || mesa.id;
      console.log(r.already_exists ? `ya existía (${id})` : `creada (${id})`);
      results.push({ name: spot.name, id, status: r.already_exists ? "existed" : "created" });
    } else {
      console.log(`❌ error: ${JSON.stringify(r.error).slice(0, 100)}`);
      results.push({ name: spot.name, id: null, status: "error", error: r.error });
    }
  }

  const ok = results.filter(r => r.id);
  console.log(`\n✓ ${ok.length}/${CAJAS.length} mesas listas en Loggro`);
  if (ok.length === 0) {
    console.log("Nada que seedear. Salgo.");
    return;
  }

  console.log("\nSeedeando cajas_evento_cajas…");
  const db = new Client({
    host: "aws-1-us-east-1.pooler.supabase.com",
    port: 5432, database: "postgres",
    user: "postgres.ncdyttgxuicyruathkxd",
    password: "MiamiBogota123@",
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  for (let i = 0; i < ok.length; i++) {
    const r = ok[i];
    const id = `CAJA-EVT-${i + 1}`;
    await db.query(`
      INSERT INTO cajas_evento_cajas (id, nombre, loggro_mesa_id, activo)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (id) DO UPDATE SET
        loggro_mesa_id = EXCLUDED.loggro_mesa_id,
        nombre = EXCLUDED.nombre,
        updated_at = now()
    `, [id, r.name, r.id]);
    console.log(`  ${r.name} → ${r.id}`);
  }
  await db.end();

  console.log("\n✅ Listo. 10 cajas creadas en Loggro y seedeadas en BD.");
  console.log("   Próximo paso: /cajas-admin → tab Cajeros (agregar PINs) y Productos.");
}

main().catch(e => { console.error("Error:", e); process.exit(1); });
