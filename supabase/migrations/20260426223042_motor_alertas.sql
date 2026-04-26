-- Tracking de alertas de motor enviadas por email (idempotente: 1 por motor/día/tipo)
CREATE TABLE IF NOT EXISTS public.motor_alertas_enviadas (
  id              text PRIMARY KEY,
  motor_id        text NOT NULL REFERENCES public.lancha_motores(id) ON DELETE CASCADE,
  fecha           date NOT NULL DEFAULT CURRENT_DATE,
  tipo            text NOT NULL,           -- proximo | vencido | vencido_critico
  destinatarios   text[] NOT NULL,
  asunto          text,
  resend_id       text,
  enviada_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertas_motor_fecha ON public.motor_alertas_enviadas(motor_id, fecha, tipo);

ALTER TABLE public.motor_alertas_enviadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "motor_alertas_all" ON public.motor_alertas_enviadas;
CREATE POLICY "motor_alertas_all" ON public.motor_alertas_enviadas
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.motor_alertas_enviadas TO anon, authenticated;
