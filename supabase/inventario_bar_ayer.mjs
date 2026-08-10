// Genera JSON con: para cada item del Bar+Almacén Bar,
// stock según Atolón OS a las 2026-08-07 22:00 Bogotá (03:00 UTC del 8-ago)
// vs conteo físico registrado ayer.
import pg from 'pg';
import { writeFileSync } from 'fs';
const { Client } = pg;

const CUTOFF = '2026-08-08 03:00:00+00'; // 10pm Bogotá del 7-ago
const CONTEO_ID = 'CNT-1786145419963';
const LOCACIONES = ['LOC-BAR']; // Solo Bar — el conteo físico fue solo del Bar, no del almacén

const c = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.ncdyttgxuicyruathkxd',
  password: 'MiamiBogota123@',
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// 1) Stock actual consolidado (Bar + Almacén Bar) por item_id
const stockActualQ = `
  SELECT item_id, SUM(cantidad) AS stock_actual
  FROM items_stock_locacion
  WHERE locacion_id = ANY($1)
  GROUP BY item_id
`;
const stockActual = (await c.query(stockActualQ, [LOCACIONES])).rows;

// 2) Movimientos POSTERIORES al cutoff (para revertir stock)
//    Restar entradas, sumar salidas
const movsPostQ = `
  SELECT item_id, tipo, SUM(cantidad) AS total
  FROM movimientos_inventario_atolon
  WHERE almacen_id = ANY($1)
    AND fecha >= $2
    AND (anulado IS NULL OR anulado = false)
  GROUP BY item_id, tipo
`;
const movsPost = (await c.query(movsPostQ, [LOCACIONES, CUTOFF])).rows;

// Agregar movs por item_id → { entradas, salidas }
const movsPorItem = new Map();
for (const m of movsPost) {
  if (!movsPorItem.has(m.item_id)) movsPorItem.set(m.item_id, { entradas: 0, salidas: 0 });
  const bucket = movsPorItem.get(m.item_id);
  const cant = Number(m.total) || 0;
  if (m.tipo.startsWith('entrada')) bucket.entradas += cant;
  else if (m.tipo.startsWith('salida') || m.tipo.startsWith('consumo') || m.tipo.startsWith('transferencia_out')) bucket.salidas += cant;
  else if (m.tipo === 'ajuste_positivo') bucket.entradas += cant;
  else if (m.tipo === 'ajuste_negativo') bucket.salidas += cant;
}

// 3) Stock a las 10pm ayer = stock_actual - entradas_posteriores + salidas_posteriores
const stockAyer = new Map();
for (const s of stockActual) {
  const mv = movsPorItem.get(s.item_id) || { entradas: 0, salidas: 0 };
  const stockAnoche = Number(s.stock_actual) - mv.entradas + mv.salidas;
  stockAyer.set(s.item_id, stockAnoche);
}
// Items que aparecen SOLO en movs posteriores (no en stock actual) — muy raro
for (const [item_id, mv] of movsPorItem.entries()) {
  if (!stockAyer.has(item_id)) {
    stockAyer.set(item_id, 0 - mv.entradas + mv.salidas);
  }
}

// 4) Catálogo (nombre + unidad)
const catQ = `SELECT id, nombre, unidad, categoria FROM items_catalogo WHERE activo = true`;
const catalogo = new Map((await c.query(catQ)).rows.map(r => [r.id, r]));

// 5) Conteo físico del bar (ayer)
const conteoQ = `SELECT items FROM items_conteos WHERE id = $1`;
const conteoRow = (await c.query(conteoQ, [CONTEO_ID])).rows[0];
const conteoPorItem = new Map();
for (const it of (conteoRow?.items || [])) {
  conteoPorItem.set(it.item_id, it);
}

// 6) Unir todo: unión de items con stock ayer > 0 O contados
const allItemIds = new Set([
  ...stockAyer.keys(),
  ...conteoPorItem.keys(),
]);

const rows = [];
for (const item_id of allItemIds) {
  const cat = catalogo.get(item_id);
  const stockAOS = Number(stockAyer.get(item_id) || 0);
  const cont = conteoPorItem.get(item_id);
  const contado = cont ? Number(cont.contado) : null;
  const nombre = cat?.nombre || cont?.nombre || `(sin nombre ${item_id})`;
  const unidad = cat?.unidad || cont?.unidad || '';
  const categoria = cat?.categoria || '';

  // Solo incluir si hay algo: stock ayer > 0 o fue contado
  if (Math.abs(stockAOS) < 0.001 && contado === null) continue;

  const diferencia = contado !== null ? contado - stockAOS : null;
  rows.push({
    item_id,
    nombre,
    unidad,
    categoria,
    stock_atolon_os_10pm: Math.round(stockAOS * 100) / 100,
    conteo_fisico: contado,
    diferencia: diferencia !== null ? Math.round(diferencia * 100) / 100 : null,
  });
}

// Ordenar por categoría + nombre
rows.sort((a, b) => (a.categoria || '').localeCompare(b.categoria || '') || a.nombre.localeCompare(b.nombre));

writeFileSync('/private/tmp/claude-501/-Users-erickern-Desktop-atolon-os-src/7878b7be-4351-4852-a173-b46f10a7be8a/scratchpad/inventario_bar_ayer.json', JSON.stringify(rows, null, 2));
console.log(`Rows: ${rows.length}`);
console.log(`Con conteo: ${rows.filter(r => r.conteo_fisico !== null).length}`);
console.log(`Solo AOS: ${rows.filter(r => r.conteo_fisico === null).length}`);
await c.end();
