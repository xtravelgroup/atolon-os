-- Cada tarea puede ahora vincularse a un punto específico de la agenda.
-- Si agenda_item_id es NULL, la tarea es a nivel briefing (legacy).
ALTER TABLE briefing_tareas
  ADD COLUMN IF NOT EXISTS agenda_item_id text;

CREATE INDEX IF NOT EXISTS idx_briefing_tareas_agenda_item
  ON briefing_tareas(briefing_id, agenda_item_id)
  WHERE agenda_item_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
