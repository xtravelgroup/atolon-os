-- Aldair: quitar rol_id de admin para que respete el array de modulos
-- (si rol_id apunta a un rol con permisos '*', ve todo sin importar modulos)
UPDATE public.usuarios
SET rol_id = NULL
WHERE (lower(nombre) LIKE '%aldair%' OR lower(email) LIKE '%aldair%')
  AND rol_id IN (
    SELECT id FROM public.roles WHERE permisos ? '*'
  );
