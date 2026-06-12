-- KPMG D-3 · NIIF para PYMES (Colombia)
-- =====================================================================
-- Marco legal:
--   - Ley 1314/2009 — Convergencia normas internacionales
--   - Decreto 2420/2015 + 2483/2018 + 2270/2019 — anexos NIIF
--   - Atolón aplica Grupo 2: NIIF para PYMES (IFRS for SMEs)
--
-- Controles auditados:
--   1. Política contable documentada (sec. 10.4 NIIF Pymes)
--   2. Vidas útiles + métodos de depreciación (sec. 17)
--   3. Reconocimiento de ingresos (sec. 23)
--   4. Provisiones (sec. 21)
--   5. Cuentas por cobrar y deterioro (sec. 11)
-- =====================================================================

-- ── 1) Política contable (single-row) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.niif_policy (
  id                          int PRIMARY KEY DEFAULT 1,
  grupo                       text NOT NULL DEFAULT 'Grupo 2 (NIIF Pymes)',
  marco_normativo             text NOT NULL DEFAULT 'NIIF para PYMES — Decreto 2420/2015 y modificatorios',
  moneda_funcional            text NOT NULL DEFAULT 'COP',
  periodo_contable            text NOT NULL DEFAULT 'Calendario (1 enero — 31 diciembre)',
  base_medicion               text NOT NULL DEFAULT 'Costo histórico, salvo instrumentos financieros y activos biológicos a valor razonable',
  metodo_depreciacion_default text NOT NULL DEFAULT 'linea_recta',
  reconocimiento_ingresos     text,
  politica_inventarios        text,
  politica_provisiones        text,
  politica_deterioro          text,
  politica_arrendamientos     text,
  ultima_revision             timestamptz,
  revisado_por                text,
  vigente_desde               date,
  proximo_review              date,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO public.niif_policy (id, reconocimiento_ingresos, politica_inventarios, politica_provisiones, politica_deterioro, politica_arrendamientos, vigente_desde, proximo_review) VALUES (1,
$ING$Los ingresos se reconocen cuando se satisface la obligación de
desempeño con el cliente (NIIF Pymes sec. 23):

  - Pasadías y servicios diarios: en la fecha de prestación.
  - Eventos: se reconoce proporcionalmente al servicio prestado
    durante el evento (servicios > 1 día) o en la fecha del evento
    para servicios de 1 día.
  - Hospedaje: por noche prestada (línea recta sobre estadía).
  - Comisiones de agencias: cuando el cliente confirma la reserva
    y se cobra el primer abono.
  - Anticipos: pasivo (cuenta por pagar a clientes) hasta que se
    presta el servicio.

Cuotas mínimas de reconocimiento:
  - El cliente debe haber pagado al menos 30% (separación)
  - El servicio debe estar contratado por escrito (BEO o cotización
    aprobada)$ING$,
$INV$Inventarios valuados al menor entre costo y valor neto de
realización (sec. 13). Método: promedio ponderado para insumos de
F&B; identificación específica para botellas y vinos premium.
Inventarios físicos: trimestral. Diferencias > 2% del costo son
investigadas y aprobadas por contabilidad antes del ajuste contable.$INV$,
$PRO$Las provisiones se reconocen cuando (sec. 21):
  (a) existe obligación presente como consecuencia de hecho pasado,
  (b) es probable que requiera salida de recursos económicos,
  (c) el monto puede estimarse con fiabilidad.

Casos típicos en Atolón:
  - Cesantías + intereses + vacaciones: provisión mensual del 12%
    de la nómina (Código Sustantivo del Trabajo).
  - Contingencias legales: provisión cuando probabilidad > 50%
    según concepto del abogado externo.
  - Garantías por servicios: no aplica (servicios consumidos al
    momento).$PRO$,
$DET$Las cuentas por cobrar se evalúan trimestralmente por deterioro
(sec. 11). Se reconoce pérdida cuando:
  - Aging > 90 días sin gestión documentada → 25%
  - Aging > 180 días sin gestión             → 50%
  - Aging > 365 días o cliente en quiebra    → 100%

Activos fijos: se evalúan anualmente al cierre por indicios de
deterioro (sec. 27).$DET$,
$ARR$Arrendamientos operativos (Atolón como arrendatario):
  - Se reconoce gasto en línea recta durante el plazo del contrato.
  - Los pagos contingentes (variables por ocupación) se reconocen
    cuando se causan.

Arrendamientos financieros: no aplica por ahora.
Posición de Atolón como arrendador: aplica para alquiler de
espacios en eventos — se reconoce ingreso en línea recta sobre
la duración del evento.$ARR$,
CURRENT_DATE,
(CURRENT_DATE + interval '1 year')::date
) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, UPDATE ON public.niif_policy TO authenticated;

COMMENT ON TABLE public.niif_policy IS
  'KPMG D-3 · Política contable NIIF Pymes. Single-row. Review anual obligatorio.';

-- ── 2) Catálogo de vidas útiles por categoría de activo ──────────────
CREATE TABLE IF NOT EXISTS public.niif_vidas_utiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria           text UNIQUE NOT NULL,
  vida_util_min       int NOT NULL,         -- años
  vida_util_max       int NOT NULL,
  vida_util_default   int NOT NULL,
  valor_residual_pct  numeric(5,2) NOT NULL DEFAULT 0,
  metodo_default      text NOT NULL DEFAULT 'linea_recta',
  base_legal          text,                  -- referencia DIAN / IFRS
  notas               text,
  CHECK (vida_util_min <= vida_util_default AND vida_util_default <= vida_util_max)
);

INSERT INTO public.niif_vidas_utiles (categoria, vida_util_min, vida_util_max, vida_util_default, valor_residual_pct, base_legal, notas) VALUES
  ('Construcciones',           20, 50, 30, 10, 'NIIF Pymes sec. 17.21 / Art. 137 ET (45 años fiscal)', 'Cabañas, kiosko, ranchones'),
  ('Maquinaria y equipo',       5, 15, 10,  0, 'NIIF Pymes sec. 17 / Art. 137 ET (10 años fiscal)',   'Equipos de cocina, generadores'),
  ('Muebles y enseres',         5, 10,  7,  0, 'NIIF Pymes sec. 17 / Art. 137 ET (10 años fiscal)',   'Mesas, sillas, sofás'),
  ('Equipo de cómputo',         3,  5,  3,  0, 'NIIF Pymes sec. 17 / Art. 137 ET (5 años fiscal)',    'Laptops, impresoras, POS'),
  ('Equipo de comunicaciones',  3,  5,  5,  0, 'NIIF Pymes sec. 17',                                  'Routers, teléfonos, walkies'),
  ('Embarcaciones',            10, 25, 20, 10, 'NIIF Pymes sec. 17',                                  'Lanchas, jet skis'),
  ('Vehículos',                 5, 10,  5,  0, 'NIIF Pymes sec. 17 / Art. 137 ET (5 años fiscal)',    'Carros, motos'),
  ('Software',                  3,  5,  3,  0, 'NIIF Pymes sec. 18',                                  'Activo intangible'),
  ('Menaje y vajilla',          2,  5,  3,  0, 'NIIF Pymes sec. 17',                                  'Vasos, platos — alta rotación'),
  ('Decoración y arte',        10, 25, 15,  0, 'NIIF Pymes sec. 17',                                  NULL),
  ('Otros',                     3, 20,  5,  0, NULL,                                                   'Categoría genérica')
ON CONFLICT (categoria) DO NOTHING;

GRANT SELECT ON public.niif_vidas_utiles TO authenticated;

COMMENT ON TABLE public.niif_vidas_utiles IS
  'KPMG D-3 · Catálogo de vidas útiles por categoría conforme NIIF Pymes sec. 17 y referencias DIAN.';

-- ── 3) Vista de depreciación calculada ────────────────────────────────
-- Calcula depreciación acumulada y valor en libros para activos
-- que tengan los campos NIIF completos (fecha_compra, costo, vida_util,
-- método). Los demás aparecen como "incompleto".
CREATE OR REPLACE VIEW public.niif_activos_depreciacion AS
SELECT
  a.id,
  a.codigo,
  a.nombre,
  a.cat AS categoria,
  a.fecha_compra,
  COALESCE(a.costo_adquisicion, a.valor, 0)::numeric AS costo,
  a.vida_util_anios,
  COALESCE(a.metodo_depreciacion, 'sin_definir') AS metodo,
  COALESCE(a.valor_residual, 0)::numeric AS valor_residual,
  CASE
    WHEN a.fecha_compra IS NULL THEN 'sin_fecha'
    WHEN a.vida_util_anios IS NULL OR a.vida_util_anios = 0 THEN 'sin_vida_util'
    WHEN COALESCE(a.costo_adquisicion, a.valor, 0) = 0 THEN 'sin_costo'
    WHEN a.metodo_depreciacion IS NULL THEN 'sin_metodo'
    ELSE 'ok'
  END AS niif_status,
  -- Meses transcurridos desde compra (cap a vida útil completa)
  LEAST(
    EXTRACT(EPOCH FROM (now() - a.fecha_compra::timestamp)) / (30.44 * 86400),
    COALESCE(a.vida_util_anios, 0) * 12.0
  ) AS meses_transcurridos,
  -- Depreciación acumulada (línea recta) si todos los datos están
  CASE
    WHEN a.fecha_compra IS NOT NULL
     AND a.vida_util_anios IS NOT NULL AND a.vida_util_anios > 0
     AND COALESCE(a.costo_adquisicion, a.valor, 0) > 0
    THEN
      (COALESCE(a.costo_adquisicion, a.valor, 0)::numeric - COALESCE(a.valor_residual, 0)::numeric)
      * LEAST(
          EXTRACT(EPOCH FROM (now() - a.fecha_compra::timestamp)) / (a.vida_util_anios * 365.25 * 86400),
          1.0
        )
    ELSE NULL
  END AS depreciacion_acumulada,
  -- Valor en libros = costo - depreciación acumulada
  CASE
    WHEN a.fecha_compra IS NOT NULL
     AND a.vida_util_anios IS NOT NULL AND a.vida_util_anios > 0
     AND COALESCE(a.costo_adquisicion, a.valor, 0) > 0
    THEN
      COALESCE(a.costo_adquisicion, a.valor, 0)::numeric
      - (COALESCE(a.costo_adquisicion, a.valor, 0)::numeric - COALESCE(a.valor_residual, 0)::numeric)
        * LEAST(
            EXTRACT(EPOCH FROM (now() - a.fecha_compra::timestamp)) / (a.vida_util_anios * 365.25 * 86400),
            1.0
          )
    ELSE NULL
  END AS valor_en_libros
FROM public.activos a;

GRANT SELECT ON public.niif_activos_depreciacion TO authenticated;

COMMENT ON VIEW public.niif_activos_depreciacion IS
  'KPMG D-3 · Depreciación NIIF calculada por activo. Status indica si la fila está lista para reportería contable.';
