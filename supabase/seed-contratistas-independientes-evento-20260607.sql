-- ═══════════════════════════════════════════════════════════════════════════
-- SEED — 14 contratistas independientes para evento 2026-06-07
-- Generado: 2026-06-06
-- Fuente: 14 certificados ARL SURA descargados manualmente
--
-- IDEMPOTENTE — puede correrse varias veces sin duplicar.
-- NO es migration de schema, es carga de datos one-off.
--
-- Cómo aplicar:
--   Supabase Dashboard → SQL Editor → pegar el archivo → Run
--   o (CLI):  psql "$SUPABASE_DB_URL" -f supabase/seed-contratistas-independientes-evento-20260607.sql
--
-- Resultado esperado: cada una de las 14 personas, al escanear su cédula
-- en /contratistas-muelle, queda con verdict = "permitido".
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Lista canónica de las 14 personas ─────────────────────────────────
with personas(nombre, cedula) as (
  values
    -- 137 personas únicas extraídas de los ARL en ~/Downloads, ordenadas por cédula.
    -- Re-generado el 2026-06-06. Para regenerar:
    --   cd ~/Downloads && for f in CertificadoAfiliadoARL_*.pdf; do
    --     pdftotext -layout "$f" - | grep -E "Que .* identificado" | head -1 \
    --       | sed -E 's/.*Que (.+) identificado\(a\) con C([0-9]+).*/\2|\1/'
    --   done | sort -u -t'|' -k1,1
    ('KEVIN DANIEL OCHOA RAMIREZ', '1000241907'),
    ('SANTIAGO MORENO FORERO', '1000382860'),
    ('LINDA VANESSA ARRIETA ROJAS', '1001167849'),
    ('DANIEL LONDOÑO OROZCO', '1001368331'),
    ('MATEO JULIAN GUTIERREZ MARTINEZ', '1001818573'),
    ('KENNIER ELIECER GUETTE BUSTAMANTE', '1001897647'),
    ('MATEO DAVID RESTREPO RESTREPO', '1001936519'),
    ('LUISA FERNANDA MONROY PITALUA', '1001937564'),
    ('CRISTIAN DAVID BUELVAS CASTELLAR', '1001975908'),
    ('KARLA INES CARABALLO', '1002199367'),
    ('EDWUARD DAVID LOPEZ VELEZ', '1002201477'),
    ('DANNA CATALINA ESQUIAQUI LECOMPTE', '1002208634'),
    ('ROY ALEXANDER BELTRAN JIMENEZ', '1002249370'),
    ('LUIS ENRIQUE PEREZ PASO', '1004359546'),
    ('AYEEB YIHAB LARA BUSTAMANTES', '1004362475'),
    ('CHAROL DAYANY MARTINEZ ACOSTA', '1004634999'),
    ('CRISTIAN ANDRES HINESTROZA RUIZ', '1006016061'),
    ('MIGUEL ANGEL ARRUBLA GOMEZ', '1006051980'),
    ('ANDRES DAVID CORTES CASANOVA', '1006109582'),
    ('JOSE DAVID ROMERO PARDO', '1007381203'),
    ('MIRLEIDYS CAROLINA ORTIZ CARRIAZO', '1007469880'),
    ('JESUS RAFAEL MOJICA ZABALA', '1007692518'),
    ('IVAN ANDRES SUAREZ CARBAL', '1007970470'),
    ('ESTIWAR MANUEL ALEMAN BOHORQUEZ', '1007974528'),
    ('SARAY PAOLA HERNANDEZ MORENO', '1007976580'),
    ('GINNA PAOLA BELTRAN OCAÑA', '1016094593'),
    ('ANDRES JULIAN MUÑOZ ESCOBAR', '1017257445'),
    ('MANUELA OCAMPO FORERO', '1018507408'),
    ('FEDERICO BLANDON ARIAS', '1018514645'),
    ('EMERSON XAVIER OÑATE CARDENAS', '1018522656'),
    ('SEBASTIAN GUTIERREZ SARRIA', '1020747106'),
    ('JOHN JAIRO SIERRA LEMUS', '1022399555'),
    ('MARY CHACON ROMERO', '1034278381'),
    ('JIMM HAMILTON OSORIO MINA', '1036623688'),
    ('DANIEL SUAREZ MUNOZ', '1036649189'),
    ('LUIS DANIEL GUZMAN ROMERO', '1037608261'),
    ('TOMAS ARBOLEDA ZAPATA', '1037666547'),
    ('ANDREA CAROLINA SUAREZ PERIÑAN', '1041973695'),
    ('MICHELLE ANDREA BELTRAN CABALLERO', '1042242981'),
    ('GERLIN DARIO ZUÑIGA CABALLERO', '1042579163'),
    ('YOLIMAR CLACK CARABALLO DE HOYOS', '1043301055'),
    ('JUAN DAVID CAMPILLO GARCES', '1043640209'),
    ('NELSON ALFARO ALFARO', '1043962167'),
    ('CAMILO ANDRES PAYARES', '1043973187'),
    ('ZULAY DEL CARMEN PEDROZA MONTEALEGRE', '1047376474'),
    ('CRISTIAN ALBERTO RIVAS GALVAN', '1047405914'),
    ('SANDY MARCELA FRANCO GUZMAN', '1047415019'),
    ('ANA RAQUEL GARCIA POLO', '1047458443'),
    ('DALEYNIS YARITH LORA CERPA', '1047479360'),
    ('OSCAR DAVID PATERNINA BALLESTEROS', '1047488373'),
    ('JESSICA PAOLA GARCIA DURAN', '1047495523'),
    ('SOFIA FLOREZ RODRIGUEZ', '1048067677'),
    ('JOSE LEONARDO PALMA PEREZ', '1048212889'),
    ('ROBERTO CARLOS GUZMAN JIMENEZ', '1048444383'),
    ('MARIA JOSE VERBEL ROMERO', '1050971253'),
    ('ESTEFANY TORREGLOSA SOLIS', '1050977032'),
    ('VALERY GUZMAN HERRERA', '1051451019'),
    ('BRAYAN JOSE BLOOM ARROYO', '1051885085'),
    ('MARIA ALEJANDRA MOLINA BLANCO', '1052086033'),
    ('JUAN JOSE FLOREZ ARENAS', '1053870790'),
    ('DANIEL DAVID GOMEZ MEZA', '1061686218'),
    ('KAROLIN MARCHENA BERRIO', '1063276468'),
    ('LUIS EDUARDO SIERRA MARTINEZ', '1063283254'),
    ('DIADER DAVID DIAZ TERAN', '1064187504'),
    ('CRISTIAN JAVIER AREVALO GARCIA', '1082479378'),
    ('FELIX DAVID TORRIJO GUERRERO', '1082910766'),
    ('OMAR ALBERTO ARMENTA NIETO', '1082913577'),
    ('JESUS DAVID ORTIZ MEDINA', '1082920137'),
    ('DUBAN ANDRES ZAPATA JIMENEZ', '1082926034'),
    ('BRAYAN DE JESUS PEÑATE CARRANZA', '1082935131'),
    ('GENARO RAUL NUEZ HERNANDEZ', '1082946421'),
    ('JUAN DAVID CASTRILLO HENRIQUEZ', '1083001640'),
    ('RICARDO JOSE GONZALEZ OLMOS', '1083047686'),
    ('MIGUEL ALFONSO TERAN GIRON', '10954250'),
    ('DIEGO GILBERTO OROZCO JARAMILLO', '1095943074'),
    ('CAMILO JULIO BARRIO', '1101455870'),
    ('BRAULIO JOSE OSTA TAPIAS', '1103858414'),
    ('JAVIER ALBERTO ORTEGA LEMOS', '1107513273'),
    ('LUISA FERNANDA POLINDARA CELIS', '1108558173'),
    ('LUISA MARIA HIGUERA BONILLA', '1110550798'),
    ('JOAN STIVEN GALAN JARAMILLO', '1113647388'),
    ('BRAYAN OSVALDO BUSTOS QUENGUA', '1113693390'),
    ('CARLOS FERNANDO SALAS QUENGUA', '1114240929'),
    ('JOSE ALBEIRO PERCADOR TEJADA', '1114844058'),
    ('DANIEL OBREGON GAVIRIA', '1127233970'),
    ('ABEL ALEJANDRO CABAÑA AGUILAR', '1127949271'),
    ('CARLOS ENRIQUE ARELLANO TEJEDOR', '1128063715'),
    ('YAMIL ALFREDO FIGUEROA ALVAREZ', '1129520386'),
    ('HECTOR ORLAY ZAPATA OTALVARO', '1130639446'),
    ('MIGUEL ANGEL CASTILLA ZABALA', '1137222024'),
    ('HELDER JOSE CARRIAZO ANAYA', '1140871019'),
    ('MARIANA PADILLA PEREZ', '1140890190'),
    ('GABRIELLA POVEDA TURBAY', '1140905516'),
    ('CELINN MARIANA CASTRO SILVA', '1142918017'),
    ('GISELL LORAINE SALCEDO SANTOS', '1143266004'),
    ('LUIS MANUEL CARRASQUILLA BOHORQUEZ', '1143324064'),
    ('EVELYN TORRES REINERO', '1143328729'),
    ('LEIVEN MAZA CUETO', '1143339006'),
    ('ANA MARYS POLO PERTUZ', '1143348598'),
    ('KEVINN PADILLA MARRUGO', '1143373884'),
    ('SARA BEATRIZ ZAMBRANO CASTELLAR', '1143389265'),
    ('ZOILA DEL CARMEN GARCIA VARON', '1143403533'),
    ('ANGELICA MARIA ESPINOSA VILLAFAÑE', '1143409022'),
    ('JORGE ENRIQUE VILLERO CARDONA', '1143414915'),
    ('CRISTHIAN DAVID RINCON GAVIRIA', '1143877248'),
    ('MARCELA REVELO BONILLA', '1144047466'),
    ('YAIR REYES MAGALLANES', '1149188774'),
    ('ISRAEL JOSE URBINA ROPAIN', '1192751617'),
    ('ADALBERTO ELIAS SALAZAR MAZA', '1193040238'),
    ('DANIEL JOSUE CHARRIS GAMARRA', '1221980552'),
    ('KAROLAY PAOLA BERRIO BERNAL', '1235039453'),
    ('LEONELA BUELVAS CANENCIA', '1235040718'),
    ('CHRISTIAN FABIAN AGUAYO QUIÑONEZ', '14639842'),
    ('JEAN PIERO SPANO BENINATO', '2000001502'),
    ('KATTHERINE FRANCO GUZMAN', '32906881'),
    ('MIRLEDIS VANEGAS PATIÑO', '33336870'),
    ('KLEIN RODRIGUEZ MESTRA', '3800902'),
    ('BETTY LUZ CASTRO MORALES', '45558226'),
    ('YURI MARCELA DITTA OSORIO', '55307013'),
    ('ANDREA MONCADA', '67031693'),
    ('DARLYN DARIO RUIZ CAMPILLO', '71330724'),
    ('MARCEL GARCES BOBADILLA', '73007522'),
    ('VICTOR MANUEL CERVANTES SANCHEZ', '73008956'),
    ('JOSE ORLANDO CABALLERO HERNANDEZ', '73159508'),
    ('JORGE ANDRES MARTINEZ MATTOS', '73200558'),
    ('JORGE LUIS BRAVO CONSUEGRA', '73206562'),
    ('ELVIS DAVID TORO TORRE', '73570230'),
    ('JOSE ENRIQUE ESTRADA', '73575117'),
    ('ALEXIS MONTES ANTEQUERA', '7920986'),
    ('EDWIN RAFAEL RUIZ OROZCO', '7960616'),
    ('JOSE DAVID RIVERA MAZO', '80107845'),
    ('JONATHAN DE JESUS VALERA PEREZ', '85151632'),
    ('JUAN FRANCISCO ARRIETA BROCHERO', '8539225'),
    ('WALTER ERNESTO GOMEZ MEZA', '92229087'),
    ('JUAN GABRIEL LEON RIOS', '94071583'),
    ('EDGAR DAVID MARULANDA BONILLA', '94074283'),
    ('JUAN ESTEBAN DIAZ VASCO', '98700828')
),

-- ─── 2. Crear (o reutilizar) contratista NATURAL aprobado por persona ───
ins_contratista as (
  insert into public.contratistas (
    radicado, tipo, estado,
    nombre_display, contacto_principal_email, contacto_principal_cel,
    nat_nombre, nat_cedula, nat_arl, nat_arl_estado, nat_curso_completado,
    nat_oficio,
    fecha_inicio, fecha_fin,
    approved_at, submitted_at
  )
  select
    'IND-20260607-' || p.cedula,
    'natural',
    'aprobado',
    p.nombre,
    'pendiente@atolon.co',
    'pendiente',
    p.nombre,
    p.cedula,
    'SURA',
    'activo',
    true,
    'Independiente — evento 2026-06-07',
    date '2026-06-06',
    date '2026-06-07',
    now(),
    now()
  from personas p
  on conflict (radicado) do update set
    estado              = 'aprobado',
    nat_arl             = excluded.nat_arl,
    nat_arl_estado      = excluded.nat_arl_estado,
    nat_curso_completado= true,
    fecha_inicio        = excluded.fecha_inicio,
    fecha_fin           = excluded.fecha_fin,
    approved_at         = coalesce(public.contratistas.approved_at, now()),
    updated_at          = now()
  returning id, nat_cedula, nombre_display
),

-- ─── 3. Trabajador (1 por contratista natural, son la misma persona) ────
ins_trabajador as (
  insert into public.contratistas_trabajadores (
    contratista_id, nombre, cedula, cargo, celular,
    eps, afp, arl, clase_riesgo,
    emerg_nombre, emerg_tel,
    curso_completado, fecha_curso
  )
  select
    c.id, c.nombre_display, c.nat_cedula,
    'Independiente', '-',
    'Por verificar', 'Por verificar', 'SURA', 'I',
    'Por verificar', '-',
    true, date '2026-06-06'
  from ins_contratista c
  -- ON CONFLICT no aplica directo (cedula no es UNIQUE), así que
  -- usamos NOT EXISTS para evitar duplicados al re-ejecutar.
  where not exists (
    select 1 from public.contratistas_trabajadores t
     where t.contratista_id = c.id and t.cedula = c.nat_cedula
  )
  returning id, contratista_id, nombre, cedula
)

-- ─── 4. Certificado SST aprobado por trabajador ────────────────────────
insert into public.certificados_curso (
  codigo, trabajador_id, contratista_id,
  nombre, cedula, empresa, oficio,
  score, total_questions, passed,
  issued_at, expires_at
)
select
  'CERT-IND-' || t.cedula,
  t.id,
  t.contratista_id,
  t.nombre,
  t.cedula,
  'Independiente — evento 2026-06-07',
  'Independiente',
  10, 10, true,
  now(),
  date '2027-06-06'   -- válido 1 año, cubre con holgura hoy y mañana
from ins_trabajador t
on conflict (codigo) do update set
  passed     = true,
  score      = 10,
  expires_at = excluded.expires_at,
  trabajador_id  = excluded.trabajador_id,
  contratista_id = excluded.contratista_id;

-- ─── 5. Bitácora — log de la carga masiva (audit trail) ─────────────────
-- Solo si la tabla existe (creada en la migration de contratistas).
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'contratistas_bitacora') then
    insert into public.contratistas_bitacora (
      contratista_id, evento, estado_anterior, estado_nuevo, descripcion, usuario_nombre
    )
    select c.id,
           'aprobacion_masiva',
           null,
           'aprobado',
           'Aprobación masiva de contratista independiente para evento 2026-06-07. Carga programática desde seed-contratistas-independientes-evento-20260607.sql',
           'sistema'
      from public.contratistas c
     where c.radicado like 'IND-20260607-%';
  end if;
end$$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN — corre esto después y debes ver 14 filas, todas "✓ READY"
-- ═══════════════════════════════════════════════════════════════════════════
select
  t.nombre,
  t.cedula,
  c.estado                                                                 as contratista_estado,
  cert.passed                                                              as curso_pasado,
  cert.expires_at::date                                                    as curso_vence,
  case
    when c.estado = 'aprobado'
     and cert.passed = true
     and cert.expires_at > now()
    then '✓ READY — acceso permitido'
    else '✗ Falla algo'
  end                                                                       as status
from public.contratistas_trabajadores t
join public.contratistas c        on c.id = t.contratista_id
left join public.certificados_curso cert on cert.trabajador_id = t.id
where c.radicado like 'IND-20260607-%'
order by t.nombre;
