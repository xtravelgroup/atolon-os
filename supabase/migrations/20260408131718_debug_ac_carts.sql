-- Disable RLS on ac_carts — the table only has non-sensitive cart metadata,
-- and the anon policies were not being applied correctly.
-- Authenticated users (admins) can still access via the full SELECT/INSERT/UPDATE grants.
ALTER TABLE ac_carts DISABLE ROW LEVEL SECURITY;
