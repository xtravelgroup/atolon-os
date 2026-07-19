import pg from 'pg';
const { Client } = pg;
const c = new Client({ host: 'aws-1-us-east-1.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres.ncdyttgxuicyruathkxd', password: 'MiamiBogota123@', ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`SELECT items, recibidos FROM ordenes_compra WHERE codigo='OC-2026-0271'`);
const oc = r.rows[0];
console.log("=== items (2) ===");
for (const it of (oc.items || [])) {
  console.log(JSON.stringify(it, null, 2));
}
console.log("\n=== recibidos ===");
console.log(JSON.stringify(oc.recibidos, null, 2));

// Buscar los items en catalogo
for (const it of (oc.items || [])) {
  if (!it.item_id) continue;
  const cat = await c.query(`SELECT id, nombre, loggro_id, unidad FROM items_catalogo WHERE id=$1`, [it.item_id]);
  console.log(`\nitem_id=${it.item_id} → catalogo:`, cat.rows[0]);
}
await c.end();
