import pg from 'pg';
const { Client } = pg;
const SUPA = "https://ncdyttgxuicyruathkxd.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc4ODcyOTIsImV4cCI6MjA0MzQ2MzI5Mn0.gXt1O1KKPz-1IuXR4iEEQE59HkC9RQXfxeYK-6RgqoU";
const raw = async (p) => (await fetch(`${SUPA}/functions/v1/loggro-sync/raw?path=${encodeURIComponent(p)}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })).json();

const c = new Client({ host: 'aws-1-us-east-1.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres.ncdyttgxuicyruathkxd', password: 'MiamiBogota123@', ssl: { rejectUnauthorized: false } });
await c.connect();

// 1) Set de ingredientes usados en receta
const usados = new Set();
for (let p = 0; p < 20; p++) {
  const d = await raw(`/products?pagination=true&limit=200&page=${p}`);
  const arr = d?.data || [];
  if (!arr.length) break;
  for (const prod of arr) for (const def of (prod.ingredients || [])) {
    const id = typeof def.ingredient === "string" ? def.ingredient : def.ingredient?._id;
    if (id) usados.add(id);
  }
}

// 2) Items activos + stock
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const items = (await c.query(`SELECT id, nombre, unidad, loggro_id FROM items_catalogo WHERE activo=true`)).rows;
const stockRows = (await c.query(`SELECT item_id, sum(cantidad) as total FROM items_stock_locacion GROUP BY item_id`)).rows;
const stock = new Map(stockRows.map(r => [r.item_id, Number(r.total) || 0]));

// 3) Agrupar y decidir borrado (solo si huerfano + stock 0 + otro miembro del grupo existe)
const byNorm = new Map();
for (const it of items) {
  const n = norm(it.nombre);
  if (!byNorm.has(n)) byNorm.set(n, []);
  byNorm.get(n).push(it);
}
const eliminar = [];
for (const [nombreNorm, grupo] of byNorm) {
  if (grupo.length < 2) continue;
  for (const it of grupo) {
    const enReceta = it.loggro_id && usados.has(it.loggro_id);
    const st = stock.get(it.id) || 0;
    if (!enReceta && st === 0) eliminar.push(it);
  }
  // Si TODOS del grupo caen en la regla, hay que dejar al menos uno
  const enGrupoBorrar = grupo.filter(it => eliminar.some(e => e.id === it.id));
  if (enGrupoBorrar.length === grupo.length) {
    // Mantener el que tenga movimientos (o el primero) — quitarlo de eliminar
    const conservar = grupo[0];
    const idx = eliminar.findIndex(e => e.id === conservar.id);
    if (idx !== -1) eliminar.splice(idx, 1);
  }
}

console.log(`Total a eliminar: ${eliminar.length}\n`);

// 4) Ejecutar
const tablasFK = ["items_stock_locacion","items_stock_snapshot","items_proveedores","items_transferencias","minibar_stock_habitacion","minibar_ventas","items_ajustes","eventos_consumo_openbar","comedor_consumo","movimientos_inventario_atolon"];

let okLoggro = 0, okAtolon = 0, errores = 0;
for (const it of eliminar) {
  try {
    // Loggro DELETE (si tiene loggro_id)
    if (it.loggro_id) {
      const r = await fetch(`${SUPA}/functions/v1/loggro-sync/eliminar-ingrediente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ ingredient_id: it.loggro_id, dry_run: false }),
      });
      if (r.ok) okLoggro++;
    }
    // FK cleanup (delete relations puesto que el huerfano no tenia uso real)
    for (const t of tablasFK) {
      await c.query(`DELETE FROM ${t} WHERE item_id = $1`, [it.id]);
    }
    // Delete catalogo
    await c.query(`DELETE FROM items_catalogo WHERE id = $1`, [it.id]);
    okAtolon++;
    console.log(`  ✓ ${it.nombre.padEnd(30)} ${it.id.slice(0,10)}${it.loggro_id?" loggro="+it.loggro_id.slice(0,10):""}`);
  } catch (e) {
    errores++;
    console.log(`  ✗ ${it.nombre} → ${e.message}`);
  }
}

console.log(`\n=== RESUMEN ===`);
console.log(`  Eliminados en Atolón:  ${okAtolon}/${eliminar.length}`);
console.log(`  Eliminados en Loggro:  ${okLoggro}`);
console.log(`  Errores:               ${errores}`);
await c.end();
