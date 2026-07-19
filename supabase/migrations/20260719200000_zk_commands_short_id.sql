-- El terminal ZKTeco MB10-VL (pushver 2.4.1) tiene un límite de ~35 chars
-- para el ID del comando en el protocolo ADMS. Cuando el endpoint envía
-- "C:{uuid}:comando", el terminal trunca el UUID (36 chars con guiones) y
-- el ACK subsecuente llega con un ID inválido → no matchea con la fila →
-- Return=-1002 corrompe el flujo completo.
--
-- Fix: agregar short_id serial (int corto) que se envía al terminal en
-- vez del UUID. El id UUID sigue como PK para compatibilidad histórica.

ALTER TABLE public.zk_terminal_commands
  ADD COLUMN IF NOT EXISTS short_id bigserial;

CREATE UNIQUE INDEX IF NOT EXISTS idx_zk_commands_short_id
  ON public.zk_terminal_commands(short_id);

COMMENT ON COLUMN public.zk_terminal_commands.short_id IS
  'ID numérico corto que se envía al terminal ZKTeco en el protocolo ADMS. UUID+guiones son truncados por el firmware. Se busca por acá en /devicecmd.';
