-- Bug fix: salida_despachos no tenía la columna colaboradores.
-- El módulo CheckIn intenta insertar/actualizar `colaboradores` en
-- salida_despachos cuando se agregan en el check-in, pero el insert
-- falla silenciosamente porque la columna no existe → al generar el
-- zarpe, despacho.colaboradores queda vacío y zarpes_log queda con
-- colaboradores_count=0 aunque el usuario los haya capturado.
--
-- El SQL ya existía en supabase/checkin-colaboradores.sql pero fuera
-- de migrations/. Aplicado ahora como migration trazable.
--
-- Format esperado: [{nombre: text, cedula: text, rol: text, embarcacion: text}]

ALTER TABLE salida_despachos
  ADD COLUMN IF NOT EXISTS colaboradores jsonb DEFAULT '[]'::jsonb;

-- Permitir despachado_at NULL para crear el row solo para guardar
-- colaboradores antes del despacho final.
ALTER TABLE salida_despachos
  ALTER COLUMN despachado_at DROP NOT NULL;

COMMENT ON COLUMN salida_despachos.colaboradores IS
  'Tripulación/colaboradores asignados a la salida. JSON array con nombre, cedula, rol, embarcacion. Se guarda desde el módulo CheckIn antes de generar el zarpe.';
