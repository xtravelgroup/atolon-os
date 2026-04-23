-- Fix: apply missing RLS policies for ac_carts so the booking popup can create abandoned cart records

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_insert_cart' AND tablename = 'ac_carts') THEN
    CREATE POLICY anon_insert_cart ON ac_carts FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_update_cart' AND tablename = 'ac_carts') THEN
    CREATE POLICY anon_update_cart ON ac_carts FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_select_cart_by_token' AND tablename = 'ac_carts') THEN
    CREATE POLICY anon_select_cart_by_token ON ac_carts FOR SELECT TO anon USING (recovery_token IS NOT NULL);
  END IF;
END $$;
