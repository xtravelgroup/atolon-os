-- Zarpes de flota: cada vez que Castillete o Naturalle salen de la isla a Cartagena
CREATE TABLE IF NOT EXISTS public.muelle_zarpes_flota (
  id            text PRIMARY KEY,
  fecha         date NOT NULL,
  embarcacion   text NOT NULL,                    -- Castillete | Naturalle | otra
  hora_zarpe    time,
  destino       text DEFAULT 'Cartagena',
  motivo        text DEFAULT 'pasajeros',         -- pasajeros|tripulacion|provisiones|vacio|mantenimiento|otro
  pax_a         int DEFAULT 0,
  pax_n         int DEFAULT 0,
  notas         text,
  created_at    timestamptz DEFAULT now(),
  created_by    text
);

CREATE INDEX IF NOT EXISTS idx_zarpes_flota_fecha       ON public.muelle_zarpes_flota(fecha);
CREATE INDEX IF NOT EXISTS idx_zarpes_flota_embarcacion ON public.muelle_zarpes_flota(embarcacion);

ALTER TABLE public.muelle_zarpes_flota ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_zarpes_flota" ON public.muelle_zarpes_flota;
DROP POLICY IF EXISTS "anon_all_zarpes_flota" ON public.muelle_zarpes_flota;
CREATE POLICY "auth_all_zarpes_flota" ON public.muelle_zarpes_flota FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_zarpes_flota" ON public.muelle_zarpes_flota FOR ALL TO anon          USING (true) WITH CHECK (true);
GRANT ALL ON public.muelle_zarpes_flota TO anon, authenticated;
