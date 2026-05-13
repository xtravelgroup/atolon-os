-- Helper para parchear tokens NULL en auth.users tras crear un usuario.
-- El schema antiguo de auth.users tiene 4 columnas con DEFAULT NULL que
-- GoTrue interpreta como inválido, generando "Database error querying
-- schema" al hacer login. Como no tenemos permisos de owner para cambiar
-- el DEFAULT, parchamos cada usuario nuevo via esta función.

CREATE OR REPLACE FUNCTION public.fix_auth_user_tokens(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
     SET confirmation_token        = COALESCE(confirmation_token, ''),
         recovery_token            = COALESCE(recovery_token, ''),
         email_change              = COALESCE(email_change, ''),
         email_change_token_new    = COALESCE(email_change_token_new, ''),
         email_change_token_current= COALESCE(email_change_token_current, ''),
         phone_change              = COALESCE(phone_change, ''),
         phone_change_token        = COALESCE(phone_change_token, ''),
         reauthentication_token    = COALESCE(reauthentication_token, '')
   WHERE email = lower(trim(p_email));
END;
$$;

REVOKE ALL ON FUNCTION public.fix_auth_user_tokens(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fix_auth_user_tokens(text) TO service_role;

NOTIFY pgrst, 'reload schema';
