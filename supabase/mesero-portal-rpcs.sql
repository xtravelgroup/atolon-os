-- ─────────────────────────────────────────────────────────────────────────
-- RPCs del Portal de Meseros (SECURITY DEFINER)
-- empleados_loggro tiene RLS y datos de RH (salarios): NO se expone a anon.
-- Estas funciones corren como owner y SOLO devuelven nombre + validan/actualizan
-- el PIN. anon puede EJECUTARLAS pero nunca ve columnas de RH.
-- ─────────────────────────────────────────────────────────────────────────

-- Lista de meseros habilitados (solo nombre + loggro_id)
create or replace function public.mesero_list()
returns table(loggro_id text, nombre text)
language sql security definer set search_path = public as $$
  select e.loggro_id,
         coalesce(nullif(trim(e.nombre_completo), ''),
                  trim(coalesce(e.nombres,'') || ' ' || coalesce(e.apellidos,''))) as nombre
    from empleados_loggro e
   where e.portal_mesero = true and e.fecha_retiro is null
   order by 2;
$$;

-- Login: valida PIN. Primera vez (sin PIN) acepta 0000 y pide configurar clave.
create or replace function public.mesero_login(p_id text, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select e.loggro_id, e.portal_pin,
         coalesce(nullif(trim(e.nombre_completo), ''),
                  trim(coalesce(e.nombres,'') || ' ' || coalesce(e.apellidos,''))) as nombre
    into e
    from empleados_loggro e
   where e.loggro_id = p_id and e.portal_mesero = true and e.fecha_retiro is null;
  if not found then
    return json_build_object('ok', false, 'error', 'no_habilitado');
  end if;
  if e.portal_pin is null or e.portal_pin = '' then
    if p_pin = '0000' then
      return json_build_object('ok', true, 'needs_setup', true, 'nombre', e.nombre, 'loggro_id', e.loggro_id);
    end if;
    return json_build_object('ok', false, 'error', 'pin_incorrecto');
  end if;
  if e.portal_pin = p_pin then
    return json_build_object('ok', true, 'needs_setup', false, 'nombre', e.nombre, 'loggro_id', e.loggro_id);
  end if;
  return json_build_object('ok', false, 'error', 'pin_incorrecto');
end $$;

-- Configurar / cambiar PIN. Requiere el PIN actual (o 0000 si nunca lo configuró).
create or replace function public.mesero_set_pin(p_id text, p_current text, p_new text)
returns json language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if p_new !~ '^[0-9]{4}$' then
    return json_build_object('ok', false, 'error', 'pin_invalido');
  end if;
  select portal_pin into cur
    from empleados_loggro
   where loggro_id = p_id and portal_mesero = true and fecha_retiro is null;
  if not found then
    return json_build_object('ok', false, 'error', 'no_habilitado');
  end if;
  if coalesce(nullif(cur, ''), '0000') <> p_current then
    return json_build_object('ok', false, 'error', 'pin_actual_incorrecto');
  end if;
  update empleados_loggro set portal_pin = p_new where loggro_id = p_id;
  return json_build_object('ok', true);
end $$;

revoke all on function public.mesero_list()                  from public;
revoke all on function public.mesero_login(text, text)        from public;
revoke all on function public.mesero_set_pin(text, text, text) from public;
grant execute on function public.mesero_list()                  to anon, authenticated;
grant execute on function public.mesero_login(text, text)        to anon, authenticated;
grant execute on function public.mesero_set_pin(text, text, text) to anon, authenticated;
