-- Vincular Coca Cola Regular 330ml con su ingredient recién creado en Loggro
UPDATE public.items_catalogo
SET loggro_id = '69ea6267f7b80da734abe78b',
    updated_at = now()
WHERE id = 'ITEM-30a39498';
