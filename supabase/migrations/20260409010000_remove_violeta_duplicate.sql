-- Eliminar registro duplicado de Violeta Simancas
-- El correcto es 063e8cd2... con email vsimancas@atoloncartagena.com
-- El duplicado tiene typo: vsimancas@atloncartagena.com (falta la 'o')

-- Reasignar aliados_b2b que apuntaban al duplicado al registro correcto
UPDATE public.aliados_b2b
SET vendedor_id = '063e8cd2-85f0-4bd4-84f0-0c278eecbd78'
WHERE vendedor_id = 'USR-1775070201671';

-- Ahora sí eliminar el duplicado
DELETE FROM public.usuarios WHERE id = 'USR-1775070201671';
