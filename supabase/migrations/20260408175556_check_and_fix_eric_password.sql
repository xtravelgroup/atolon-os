-- If user doesn't exist in auth.users, create them; otherwise update password
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'eric@lasamericas.com';

  IF v_user_id IS NULL THEN
    -- Create the user
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      aud, role
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'eric@lasamericas.com',
      extensions.crypt('1010', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      'authenticated',
      'authenticated'
    );
    RAISE NOTICE 'Created user eric@lasamericas.com with id %', v_user_id;
  ELSE
    -- Update password
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt('1010', extensions.gen_salt('bf')),
      updated_at = now()
    WHERE id = v_user_id;
    RAISE NOTICE 'Updated password for eric@lasamericas.com id %', v_user_id;
  END IF;
END $$;
