-- Fix RLS policy for cierres_caja
-- Allow authenticated users (logged-in staff) to read and write

DROP POLICY IF EXISTS "allow_all" ON cierres_caja;

CREATE POLICY "allow_all" ON cierres_caja
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
