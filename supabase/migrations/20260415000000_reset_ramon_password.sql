-- Reset password for ramon@atolon.com to 'atolon123'
-- Si el usuario no existe en auth.users lo creamos.

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = 'ramon@atolon.com';

  IF v_id IS NULL THEN
    -- Crear usuario con password encriptado
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'ramon@atolon.com',
      extensions.crypt('atolon123', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      false, '', '', '', ''
    );
  ELSE
    -- Actualizar la contraseña existente
    UPDATE auth.users
    SET encrypted_password = extensions.crypt('atolon123', extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_id;
  END IF;
END $$;
