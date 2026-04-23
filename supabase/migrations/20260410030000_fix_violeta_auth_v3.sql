-- Fix Violeta auth v3: nuclear wipe + recreate completo
-- usuarios.id = 063e8cd2-85f0-4bd4-84f0-0c278eecbd78
-- email: vsimancas@atoloncartagena.com

DO $$
DECLARE
  v_id   uuid := '063e8cd2-85f0-4bd4-84f0-0c278eecbd78';
  v_email text := 'vsimancas@atoloncartagena.com';
BEGIN
  -- 1. Limpiar tablas relacionadas (orden correcto por FK)
  -- Cast a text para manejar columnas varchar y uuid por igual
  DELETE FROM auth.refresh_tokens   WHERE user_id::text = v_id::text;
  DELETE FROM auth.mfa_factors      WHERE user_id::text = v_id::text;
  DELETE FROM auth.identities       WHERE user_id::text = v_id::text;
  DELETE FROM auth.sessions         WHERE user_id::text = v_id::text;
  DELETE FROM auth.users            WHERE id::text      = v_id::text;

  -- 2. También limpiar cualquier otro usuario con este email (duplicados)
  DELETE FROM auth.identities    WHERE provider_id = v_email;
  DELETE FROM auth.users         WHERE email = v_email AND id::text != v_id::text;

  -- 3. Recrear auth.users completo
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    is_sso_user,
    is_anonymous,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    deleted_at,
    created_at,
    updated_at
  ) VALUES (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt('Atolon2025*', extensions.gen_salt('bf')),
    now(),         -- email_confirmed_at
    null,          -- invited_at
    '',            -- confirmation_token (vacío = ya confirmado)
    null,          -- confirmation_sent_at
    '',            -- recovery_token
    null,          -- recovery_sent_at
    '',            -- email_change_token_new
    '',            -- email_change
    null,          -- email_change_sent_at
    null,          -- last_sign_in_at
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    false,         -- is_super_admin
    false,         -- is_sso_user
    false,         -- is_anonymous
    null,          -- phone
    null,          -- phone_confirmed_at
    '',            -- phone_change
    '',            -- phone_change_token
    null,          -- phone_change_sent_at
    '',            -- email_change_token_current
    0,             -- email_change_confirm_status
    null,          -- banned_until
    '',            -- reauthentication_token
    null,          -- reauthentication_sent_at
    null,          -- deleted_at
    now(),
    now()
  );

  -- 4. Crear identidad
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
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
    now(),
    now(),
    now()
  );

  RAISE NOTICE 'Violeta auth recreada exitosamente: %', v_email;
END $$;
