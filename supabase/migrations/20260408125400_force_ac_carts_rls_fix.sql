-- Force recreate RLS policies on ac_carts to allow anon inserts/updates from BookingPopup

DROP POLICY IF EXISTS anon_insert_cart ON ac_carts;
DROP POLICY IF EXISTS anon_update_cart ON ac_carts;
DROP POLICY IF EXISTS anon_select_cart_by_token ON ac_carts;

CREATE POLICY anon_insert_cart ON ac_carts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY anon_update_cart ON ac_carts FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY anon_select_cart_by_token ON ac_carts FOR SELECT TO anon USING (recovery_token IS NOT NULL);
