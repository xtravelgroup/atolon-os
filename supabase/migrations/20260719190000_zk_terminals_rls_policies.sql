-- El endpoint /api/zk-iclock (Vercel) hace SELECT y UPDATE contra
-- zk_terminals_autorizados usando la anon key (no siempre está la
-- service_role_key en el entorno de Vercel). RLS estaba encendida
-- sin policies → SELECT devolvía vacío → todo SN se rechazaba con
-- sn_no_autorizado aunque estuviera registrado y activo.
--
-- Abrimos SELECT/UPDATE para anon y authenticated. Los campos que
-- actualiza el endpoint son solo last_seen_ip / last_seen_at — no hay
-- datos sensibles en esta whitelist. El INSERT/DELETE queda restringido
-- a service_role para que no se puedan agregar terminales fake desde
-- el cliente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = 'public.zk_terminals_autorizados'::regclass
                    AND polname  = 'zk_terminals_read_anon') THEN
    CREATE POLICY zk_terminals_read_anon
      ON public.zk_terminals_autorizados
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = 'public.zk_terminals_autorizados'::regclass
                    AND polname  = 'zk_terminals_update_lastseen_anon') THEN
    CREATE POLICY zk_terminals_update_lastseen_anon
      ON public.zk_terminals_autorizados
      FOR UPDATE
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
