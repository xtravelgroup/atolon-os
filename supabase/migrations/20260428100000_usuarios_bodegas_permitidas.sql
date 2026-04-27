-- Permite restringir a un usuario las bodegas que puede ver/contar
-- en el módulo Hacer Inventario. Si el array está vacío o es null,
-- el usuario ve todas las bodegas (comportamiento actual).
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS bodegas_permitidas text[] DEFAULT NULL;

COMMENT ON COLUMN public.usuarios.bodegas_permitidas IS
  'Lista de items_locaciones.id que el usuario puede contar. NULL = todas.';

-- Meris solo puede contar Almacén Cocina
UPDATE public.usuarios
   SET bodegas_permitidas = ARRAY['LOC-ALMACEN-COCINA'],
       modulos = (
         CASE
           WHEN 'hacer_inventario' = ANY(modulos) THEN modulos
           ELSE array_append(modulos, 'hacer_inventario')
         END
       )
 WHERE email = 'cocinacastillete@gmail.com';
