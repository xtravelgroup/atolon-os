-- briefings: lista privada de "puntos a discutir" del solicitante.
-- ──────────────────────────────────────────────────────────────────
-- El creador del briefing puede tener una lista privada de temas que
-- está pensando llevar — cada uno con un checkbox "agregar a agenda".
-- Solo los items con en_agenda=true se promueven a `agenda` (que es
-- pública para todos los participantes). Así el creador puede tener
-- borradores sin que el equipo los vea.
--
-- Estructura por punto:
--   { id, titulo, descripcion, en_agenda: bool, orden }

ALTER TABLE briefings
  ADD COLUMN IF NOT EXISTS puntos_discutir jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN briefings.puntos_discutir IS
  'Lista privada de puntos del solicitante. Solo visible para creado_por. Cada item tiene en_agenda:bool — si true, se refleja también en agenda (pública).';

NOTIFY pgrst, 'reload schema';
