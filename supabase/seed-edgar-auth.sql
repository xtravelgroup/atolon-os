-- Crear/asegurar acceso de Edgar Guaita con clave Atolon26
DO $$
DECLARE
  v_user_id uuid;
  v_email   text := 'guaitaedgar55@gmail.com';
  v_pass    text := 'Atolon26';
BEGIN
  -- Si ya existe en auth, sólo resetear contraseña + confirmar
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, last_sign_in_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated', v_email,
      crypt(v_pass, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('nombre', 'Edgar Guaita'),
      now(), now(), null
    );

    -- Identity
    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(), now(), now()
    );
  ELSE
    -- Existe → resetear password y confirmar email
    UPDATE auth.users
       SET encrypted_password = crypt(v_pass, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  -- Asegurar que está activo
  UPDATE public.usuarios
     SET activo = true
   WHERE email = v_email;
END $$;

-- Verificación
SELECT
  u.email,
  u.id as auth_id,
  u.email_confirmed_at IS NOT NULL as confirmado,
  pu.nombre, pu.rol_id, pu.activo as activo_publico
FROM auth.users u
LEFT JOIN public.usuarios pu ON pu.email = u.email
WHERE u.email = 'guaitaedgar55@gmail.com';
