// Crea las 12 mesas PS faltantes en Loggro vía el endpoint /create-table
// (deployado en supabase/functions/loggro-sync/) y luego actualiza
// floorplan_spots.loggro_mesa_id con los IDs recién creados.
//
// Pre-requisito: la versión actualizada de loggro-sync debe estar deployada
// en Supabase Dashboard → Functions (rama claude/floorplan-pool-service).
//
// Uso: node supabase/create-ps-mesas-loggro.mjs

import pg from 'pg';
const { Client } = pg;

const SUPABASE_URL = "https://ncdyttgxuicyruathkxd.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTY4NDksImV4cCI6MjA5MDQ3Mjg0OX0.ppK_J1BUI8lrEZ-iQWNb0imO_ZwOGbF3MDyv7nct6bs";

// 12 PS spots por crear, con coords aproximadas tipo grid de Loggro
const PS_SPOTS = [
  // Piscina Derecha — Pool Side
  { name: "PS11", coord: { x: 2, y: 1 } },
  { name: "PS12", coord: { x: 2, y: 2 } },
  { name: "PS13", coord: { x: 2, y: 3 } },
  { name: "PS14", coord: { x: 2, y: 4 } },
  // Piscina Izquierda — Pool Side
  { name: "PS21", coord: { x: 4, y: 1 } },
  { name: "PS22", coord: { x: 4, y: 2 } },
  { name: "PS23", coord: { x: 4, y: 3 } },
  { name: "PS24", coord: { x: 4, y: 4 } },
  // Piscina Central
  { name: "PS31", coord: { x: 3, y: 0 } },
  { name: "PS32", coord: { x: 3, y: 0 } },
  { name: "PS33", coord: { x: 3, y: 0 } },
  { name: "PS34", coord: { x: 3, y: 0 } },
];

async function createMesa(spot) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/loggro-sync/create-table`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      apikey:          ANON_KEY,
      Authorization:   `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      name:        spot.name,
      description: `Cama ${spot.name} — Piscina`,
      coord:       spot.coord,
    }),
  });
  const data = await res.json();
  return data;
}

async function main() {
  console.log(`Creando ${PS_SPOTS.length} mesas PS en Loggro…\n`);

  const results = [];
  for (const spot of PS_SPOTS) {
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
  console.log(`\n✓ ${ok.length}/${PS_SPOTS.length} mesas listas en Loggro`);

  if (ok.length === 0) {
    console.log("Nada que mapear. Salgo.");
    return;
  }

  console.log("\nMapeando floorplan_spots.loggro_mesa_id…");
  const db = new Client({
    host: 'aws-1-us-east-1.pooler.supabase.com',
    port: 5432, database: 'postgres',
    user: 'postgres.ncdyttgxuicyruathkxd',
    password: 'MiamiBogota123@',
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  for (const r of ok) {
    await db.query(
      `UPDATE floorplan_spots SET loggro_mesa_id = $1, updated_at = now() WHERE id = $2`,
      [r.id, r.name],
    );
    console.log(`  ${r.name} → ${r.id}`);
  }
  await db.end();

  console.log("\n✅ Listo. Todas las camas de piscina mapeadas a Loggro.");
}

main().catch(e => { console.error("Error:", e); process.exit(1); });
