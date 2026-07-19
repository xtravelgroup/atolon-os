import pg from 'pg';
const { Client } = pg;
const SUPA = "https://ncdyttgxuicyruathkxd.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjc4ODcyOTIsImV4cCI6MjA0MzQ2MzI5Mn0.gXt1O1KKPz-1IuXR4iEEQE59HkC9RQXfxeYK-6RgqoU";
const raw = async (p) => (await fetch(`${SUPA}/functions/v1/loggro-sync/raw?path=${encodeURIComponent(p)}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })).json();

const c = new Client({ host: 'aws-1-us-east-1.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres.ncdyttgxuicyruathkxd', password: 'MiamiBogota123@', ssl: { rejectUnauthorized: false } });
await c.connect();

// 1) Loggro: set de ingrediente_ids usados en receta
const usados = new Set();
for (let p = 0; p < 20; p++) {
  const d = await raw(`/products?pagination=true&limit=200&page=${p}`);
  const arr = d?.data || [];
  if (!arr.length) break;
  for (const prod of arr) {
    for (const def of (prod.ingredients || [])) {
      const id = typeof def.ingredient === "string" ? def.ingredient : def.ingredient?._id;
      if (id) usados.add(id);
    }
  }
}
console.log(`Ingredientes usados en receta: ${usados.size}`);

// 2) Items Atolón activos con nombre normalizado para agrupar duplicados
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const items = (await c.query(`SELECT id, nombre, unidad, loggro_id, stock_actual, categoria FROM items_catalogo WHERE activo=true ORDER BY nombre`)).rows;

// Stock por locación por item
const stock = new Map();
const stockRows = (await c.query(`SELECT item_id, sum(cantidad) as total FROM items_stock_locacion GROUP BY item_id`)).rows;
for (const r of stockRows) stock.set(r.item_id, Number(r.total) || 0);

// Movimientos por item
const movs = new Map();
const movRows = (await c.query(`SELECT item_id, count(*)::int as n FROM movimientos_inventario_atolon GROUP BY item_id`)).rows;
for (const r of movRows) movs.set(r.item_id, r.n);

// Agrupar por nombre normalizado
const byNorm = new Map();
for (const it of items) {
  const n = norm(it.nombre);
  if (!byNorm.has(n)) byNorm.set(n, []);
  byNorm.get(n).push(it);
}
const dups = [...byNorm.entries()].filter(([_, arr]) => arr.length >= 2);
console.log(`\nGrupos de duplicados por nombre: ${dups.length}\n`);

// Decidir cuál borrar en cada par/grupo
const eliminar = []; // {item, motivo}
const revisar = [];  // grupos donde ninguno es borrable con seguridad

for (const [nombreNorm, grupo] of dups) {
  // Anotar cada item con: en_receta, stock, movs
  const anotados = grupo.map(it => ({
    ...it,
    en_receta: it.loggro_id ? usados.has(it.loggro_id) : false,
    stock: stock.get(it.id) || 0,
    movs: movs.get(it.id) || 0,
  }));
  const enReceta = anotados.filter(x => x.en_receta);
  const noReceta = anotados.filter(x => !x.en_receta);

  // Si hay al menos uno en receta y al menos uno huerfano → borrar los huerfanos
  if (enReceta.length >= 1 && noReceta.length >= 1) {
    for (const x of noReceta) {
      eliminar.push({ item: x, motivo: `huerfano (existe otro en receta: ${enReceta[0].nombre})` });
    }
  } else if (noReceta.length === grupo.length) {
    // Ninguno en receta — mantener el que tenga MAS stock; si empate, el que tenga MAS movimientos
    const ordenados = [...noReceta].sort((a, b) => (b.stock - a.stock) || (b.movs - a.movs));
    for (const x of ordenados.slice(1)) {
      if (x.stock === 0 && x.movs <= ordenados[0].movs) {
        eliminar.push({ item: x, motivo: `duplicado sin receta, stock 0 (mantengo: ${ordenados[0].nombre})` });
      }
    }
  } else {
    // Todos en receta — no tocar
    revisar.push({ nombreNorm, grupo: anotados });
  }
}

console.log(`=== PLAN ===`);
console.log(`A eliminar: ${eliminar.length}`);
for (const e of eliminar.slice(0, 40)) {
  console.log(`  ✗ ${e.item.nombre.padEnd(30)} id=${e.item.id.slice(0,10)} stock=${e.item.stock} loggro=${e.item.loggro_id?e.item.loggro_id.slice(0,10):"—"}  ← ${e.motivo}`);
}
if (eliminar.length > 40) console.log(`  … +${eliminar.length - 40}`);

console.log(`\nA revisar manual (todos en receta): ${revisar.length}`);
for (const r of revisar.slice(0, 10)) {
  console.log(`  · [${r.nombreNorm}]`);
  for (const g of r.grupo) console.log(`      ${g.nombre.padEnd(30)} stock=${g.stock} movs=${g.movs} loggro=${g.loggro_id?g.loggro_id.slice(0,10):"—"}`);
}
if (revisar.length > 10) console.log(`  … +${revisar.length - 10}`);

await c.end();
