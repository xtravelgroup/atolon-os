-- Fix Violeta Simancas auth — v2
-- usuarios.id = 063e8cd2-85f0-4bd4-84f0-0c278eecbd78
-- email: vsimancas@atoloncartagena.com

DO $$
DECLARE
  v_id   uuid := '063e8cd2-85f0-4bd4-84f0-0c278eecbd78';
  v_email text := 'vsimancas@atoloncartagena.com';
BEGIN
  -- 1. Limpiar identidades existentes
  DELETE FROM auth.identities WHERE user_id = v_id;

  -- 2. Limpiar usuario existente
  DELETE FROM auth.users WHERE id = v_id;

  -- 3. Recrear auth.users con solo columnas necesarias
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user,
    created_at, updated_at
  ) VALUES (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt('Atolon2025*', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false,
    false,
    now(),
    now()
  );

  -- 4. Crear identidad correcta
  INSERT INTO auth.identities (
    id, user_id, provider_id, provider,
    identity_data, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_id,
    v_email,
    'email',
    jsonb_build_object(
      'sub',            v_id::text,
      'email',          v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    now(), now(), now()
  );

END $$;
