-- contratistas_documentos: agregar columna de auditoría para sabe quién
-- subió el documento desde el admin (vs el portal del contratista).
-- ──────────────────────────────────────────────────────────────────
-- El UI de DetailModal incluye este campo en el INSERT (commit 1afc484
-- "admin puede subir/reemplazar/eliminar docs directo") pero la columna
-- nunca se agregó al schema. PostgREST refresca el cache de schema cada
-- N segundos así que aparecía el error:
--   "Could not find the 'subido_por_admin' column of
--    'contratistas_documentos' in the schema cache"
-- y la subida fallaba.

ALTER TABLE contratistas_documentos
  ADD COLUMN IF NOT EXISTS subido_por_admin text;

COMMENT ON COLUMN contratistas_documentos.subido_por_admin IS
  'Email/nombre del admin que subió el doc desde DetailModal. NULL si lo cargó el contratista vía portal público.';

-- Refrescar el cache de schema de PostgREST inmediatamente
NOTIFY pgrst, 'reload schema';
