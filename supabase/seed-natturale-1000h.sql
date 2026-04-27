-- Mantenimiento 1000h Natturale (2 motores Yamaha F350)
-- Proveedor: CONE — Centro de Diagnóstico Motores Fuera de Borda
-- Total propuesta: $7.594.560 (repuestos $5.994.560 + mano obra $1.600.000)
-- Aplica para AMBOS motores (babor y estribor) — el costo se prorrateá en 2

-- Actualizar horas y estado de los motores
UPDATE public.lancha_motores
   SET horas_actuales = 1000,
       estado = 'mantenimiento',
       updated_at = now()
 WHERE lancha_id = 'LCH-NATURALLE';

-- Insertar el mantenimiento (1 OT por motor)
WITH repuestos_json AS (
  SELECT '[
    {"item":"LUBRICANTE 20W50 SUPRA 4T","cant":16,"precio_unit":30000,"subtotal":480000},
    {"item":"ACEITE DE TRANSMISION TRANSMILUBE SAE 80W90","cant":6,"precio_unit":14000,"subtotal":84000},
    {"item":"EMPAQUE TAPON DE TRANSMISION","cant":4,"precio_unit":3538,"subtotal":14154},
    {"item":"FILTRO DE ACEITE","cant":2,"precio_unit":162860,"subtotal":325720},
    {"item":"FILTRO BOMBA DE ALTA","cant":2,"precio_unit":273479,"subtotal":546959},
    {"item":"FILTRO BAJA","cant":2,"precio_unit":238434,"subtotal":476868},
    {"item":"BUJIA","cant":12,"precio_unit":42439,"subtotal":509268},
    {"item":"VALVULA TERMOSTATICA","cant":4,"precio_unit":203128,"subtotal":812513},
    {"item":"CORREA DE DISTRIBUCION","cant":2,"precio_unit":945041,"subtotal":1890083},
    {"item":"FILTRO PRIMARIO","cant":2,"precio_unit":121257,"subtotal":242515},
    {"item":"O-RING TAPA ENFRIADOR DE COMBUSTIBLE","cant":2,"precio_unit":89310,"subtotal":178619},
    {"item":"EMPAQUE TAPA ENFRIAMIENTO DE COMBUSTIBLE","cant":2,"precio_unit":174538,"subtotal":349076},
    {"item":"ABRAZADERAS PLASTICAS","cant":10,"precio_unit":226,"subtotal":2261},
    {"item":"WD40","cant":1,"precio_unit":39568,"subtotal":39568},
    {"item":"GRASA MARINA","cant":1,"precio_unit":31654,"subtotal":31654},
    {"item":"VASELINA","cant":1,"precio_unit":11305,"subtotal":11305}
  ]'::jsonb AS items
)
INSERT INTO public.motor_mantenimientos (
  id, numero, motor_id, lancha_id, tipo, estado,
  fecha_apertura, horas_motor_apertura,
  repuestos, costo_repuestos, costo_mano_obra,
  factura_proveedor, observaciones, created_by
)
SELECT
  'OT_' || extract(epoch from now())::bigint || '_' || mot.id,
  'OT-1000H-' || replace(mot.id, 'MOT-NATURALLE-', ''),
  mot.id,
  'LCH-NATURALLE',
  '1000h',
  'abierta',
  CURRENT_DATE,
  1000,
  rj.items,
  2997280,                      -- $5.994.560 / 2 motores
  800000,                        -- $1.600.000 / 2 motores
  'CONE — Centro de Diagnóstico Motores Fuera de Borda',
  E'Servicio mayor 1000h:\n- Mantenimiento al sistema de combustibles\n- Cambio de bujías\n- Cambio de termostato\n- Mantenimiento al enfriador de aceite\n- Cambio de la correa de distribución\n\nNota: Requiere disponibilidad del bote todo el día (8am-6pm).\nPropuesta total CONE: $7.594.560 para los 2 motores.',
  'eric@atoloncartagena.com'
FROM public.lancha_motores mot, repuestos_json rj
WHERE mot.lancha_id = 'LCH-NATURALLE';
