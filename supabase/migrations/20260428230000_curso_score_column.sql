-- Curso de inducción contratistas: agregar curso_score
-- Antes: src/modules/contratistas/Curso.jsx hacía SELECT a curso_score (que no existe),
-- el query fallaba con "column does not exist", retornaba null y el componente
-- mostraba "Enlace inválido" aunque el token fuera correcto. Bug reportado por
-- Gregoria Casanova que no podía abrir su curso.

ALTER TABLE contratistas_trabajadores
  ADD COLUMN IF NOT EXISTS curso_score numeric(5,2);

COMMENT ON COLUMN contratistas_trabajadores.curso_score IS
  'Puntaje obtenido en el curso de inducción SST (0-100). Se llena al completar el quiz.';
