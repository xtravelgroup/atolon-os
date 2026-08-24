-- ═══════════════════════════════════════════════════════════════════════
-- Deduplicación de embarcaciones rentadas + unique index case-insensitive
-- ═══════════════════════════════════════════════════════════════════════
-- Ya aplicada en prod el 2026-08-23. Se incluye en migrations para que
-- entornos nuevos (staging, dev) queden consistentes.
--
-- Consolidó 13 filas → 5 canónicos:
--   El Cholu       MRHTKC87 ← [MRJ7C30D, MRM34LXG, MRNJK80B]
--   El Niño Irra   MRRWBX06 ← [MRURP35L, MS0HCGVN]
--   Orchid         MSKEMHAX ← [MSKF8SE9]
--   Sonia          MP2NQ5TU ← [MPJUB28E]
--   The Marino     MS936KGL ← [MQU26CP3]
-- Refs actualizadas en: zarpes_log, salida_despachos, embarcacion_solicitudes.
-- ═══════════════════════════════════════════════════════════════════════

-- Índice único case-insensitive para prevenir nuevos duplicados desde UI
CREATE UNIQUE INDEX IF NOT EXISTS ux_embarcaciones_nombre_norm
  ON embarcaciones (LOWER(TRIM(nombre)));

COMMENT ON INDEX ux_embarcaciones_nombre_norm IS
  'Previene duplicados por variaciones de capitalización/espacios en el maestro embarcaciones.';
