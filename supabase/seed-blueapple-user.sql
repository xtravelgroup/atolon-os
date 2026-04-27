-- Crea el primer usuario de Blue Apple para que puedan probar el portal.
-- Email: reservas@blueapple.co  Clave: Atolon26
DO $$
DECLARE
  v_user_id uuid;
  v_email   text := 'reservas@blueapple.co';
  v_pass    text := 'Atolon26';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, phone_change,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated', v_email,
      crypt(v_pass, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
      jsonb_build_object('nombre', 'Blue Apple Reservas'),
      '', '', '', '', '', '',
      now(), now()
    );

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
    UPDATE auth.users
       SET encrypted_password = crypt(v_pass, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           confirmation_token = COALESCE(confirmation_token, ''),
           recovery_token = COALESCE(recovery_token, ''),
           email_change_token_new = COALESCE(email_change_token_new, ''),
           email_change = COALESCE(email_change, ''),
           email_change_token_current = COALESCE(email_change_token_current, ''),
           phone_change = COALESCE(phone_change, ''),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  -- Vincular en partner_users
  INSERT INTO public.partner_users (partner_id, email, nombre, rol, activo)
  VALUES ('PARTNER-BLUEAPPLE', v_email, 'Blue Apple Reservas', 'admin', true)
  ON CONFLICT (email) DO UPDATE SET
    partner_id = EXCLUDED.partner_id,
    activo = true;
END $$;

SELECT u.email, pu.nombre, pu.rol, p.nombre AS partner
  FROM auth.users u
  JOIN public.partner_users pu ON pu.email = u.email
  JOIN public.partners p ON p.id = pu.partner_id
 WHERE u.email = 'reservas@blueapple.co';
