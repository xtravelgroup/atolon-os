// Usage: node supabase/run-sql.mjs supabase/archivo.sql
// Or:    node supabase/run-sql.mjs "SELECT * FROM tabla"
import { readFileSync, existsSync } from 'fs';
import pg from 'pg';
const { Client } = pg;

const arg = process.argv[2];
if (!arg) { console.error('Usage: node supabase/run-sql.mjs <file.sql | "SQL string">'); process.exit(1); }

const sql = existsSync(arg) ? readFileSync(arg, 'utf8') : arg;
const c = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.ncdyttgxuicyruathkxd',
  password: 'MiamiBogota123@',
  ssl: { rejectUnauthorized: false },
});

try {
  await c.connect();
  const r = await c.query(sql);
  if (r.rows && r.rows.length > 0) console.log(JSON.stringify(r.rows, null, 2));
  else console.log('OK — executed successfully');
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await c.end();
}
