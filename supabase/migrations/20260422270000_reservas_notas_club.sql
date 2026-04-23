-- Campo de notas internas para el Club (diferente de notas del cliente)
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS notas_club text;
