-- ROLLBACK del RLS endurecido. NO aplicar a menos que la app rompa.
-- Restaura el estado anterior (qual:true para anon + authenticated).
--
-- Para ejecutar: node supabase/run-sql.mjs supabase/migrations/20260614020001_requisiciones_rls_ROLLBACK.sql

DROP POLICY IF EXISTS "deny_anon_requisiciones"   ON requisiciones;
DROP POLICY IF EXISTS "auth_select_requisiciones" ON requisiciones;
DROP POLICY IF EXISTS "auth_insert_requisiciones" ON requisiciones;
DROP POLICY IF EXISTS "auth_update_requisiciones" ON requisiciones;
DROP POLICY IF EXISTS "deny_delete_requisiciones" ON requisiciones;

CREATE POLICY "Allow all for anon"
  ON requisiciones FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_all_requisiciones"
  ON requisiciones FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
