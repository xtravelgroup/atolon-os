import { readFileSync, existsSync } from 'fs';
import pg from 'pg';
const { Client } = pg;
const arg = process.argv[2];
if (!arg) { console.error('usage'); process.exit(1); }
const sql = existsSync(arg) ? readFileSync(arg, 'utf8') : arg;
const c = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 6543,  // transaction mode pooler — más capacidad
  database: 'postgres',
  user: 'postgres.ncdyttgxuicyruathkxd',
  password: 'MiamiBogota123@',
  ssl: { rejectUnauthorized: false },
});
try {
  await c.connect();
  const r = await c.query(sql);
  if (r.rows && r.rows.length > 0) console.log(JSON.stringify(r.rows, null, 2));
  else console.log('OK');
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await c.end();
}
