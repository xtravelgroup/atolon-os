-- Permitir el estado "Recibida Parcial" en requisiciones.
-- El CHECK previo lo rechazaba, por lo que la propagación de recepción
-- parcial (Requisiciones.jsx) fallaba silenciosamente.
ALTER TABLE requisiciones DROP CONSTRAINT IF EXISTS requisiciones_estado_check;
ALTER TABLE requisiciones ADD CONSTRAINT requisiciones_estado_check
  CHECK (estado = ANY (ARRAY[
    'Borrador','Pendiente','Aprobada','En Compra',
    'Recibida','Recibida Parcial','Rechazada'
  ]));
