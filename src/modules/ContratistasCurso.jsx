// Curso interactivo de inducción SST — /contratistas/curso/:token
// Fase 4: delega al orquestador Curso.jsx (en subcarpeta contratistas/)
import Curso from "./contratistas/Curso";

export default function ContratistasCurso({ token }) {
  return <Curso token={token} />;
}
