-- ═══════════════════════════════════════════════════════════════════════
-- Dedup v2: El Cholu con doble espacio + índice case+whitespace insensitive
-- ═══════════════════════════════════════════════════════════════════════
-- El índice v1 (LOWER+TRIM) no atrapaba variantes con espacios internos
-- múltiples ("El  cholu" con doble espacio). Esta migración:
--
-- 1) Absorbe "El  cholu" (MRKOKRQT) al canónico "El Cholu" (MRHTKC87).
-- 2) Normaliza embarcacion_nombre en tablas históricas para que reportes
--    (Zarpes, Despachos) muestren consistente "El Cholu" / "The Marino".
-- 3) Reemplaza el índice único agregando REGEXP_REPLACE de espacios.
-- ═══════════════════════════════════════════════════════════════════════

-- Ya aplicado en prod 2026-08-23. Se incluye en migrations para consistencia.

UPDATE zarpes_log            SET embarcacion_id='EMB-RENT-MRHTKC87' WHERE embarcacion_id='EMB-RENT-MRKOKRQT';
UPDATE salida_despachos      SET embarcacion_id='EMB-RENT-MRHTKC87' WHERE embarcacion_id='EMB-RENT-MRKOKRQT';
UPDATE embarcacion_solicitudes SET embarcacion_id='EMB-RENT-MRHTKC87' WHERE embarcacion_id='EMB-RENT-MRKOKRQT';
DELETE FROM embarcaciones WHERE id='EMB-RENT-MRKOKRQT';

-- Normalizar nombres en tablas históricas (para reportes)
UPDATE zarpes_log       SET embarcacion_nombre='El Cholu'   WHERE LOWER(REGEXP_REPLACE(embarcacion_nombre, '\s+', ' ', 'g'))='el cholu';
UPDATE zarpes_log       SET embarcacion_nombre='The Marino' WHERE LOWER(embarcacion_nombre)='the marino';
UPDATE salida_despachos SET embarcacion_nombre='El Cholu'   WHERE LOWER(REGEXP_REPLACE(embarcacion_nombre, '\s+', ' ', 'g'))='el cholu';

-- Índice mejorado: colapsa espacios múltiples + trim + lowercase
DROP INDEX IF EXISTS ux_embarcaciones_nombre_norm;
CREATE UNIQUE INDEX ux_embarcaciones_nombre_norm
  ON embarcaciones (LOWER(REGEXP_REPLACE(TRIM(nombre), '\s+', ' ', 'g')));
