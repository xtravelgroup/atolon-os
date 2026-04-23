// Áreas para vista Cobertura. Mapean departamento + (opcional) actividad.
// La key es estable — no cambiar.
//
// source:
//   - "manual"    → demanda se edita por usuario (tabla rh_cobertura_demanda)
//   - "staffing"  → demanda se calcula desde módulo Staffing (pax del día).
//                   Requiere staffingRole (ver src/modules/staffing/calc.js).
export const AREAS = [
  { key: "cocina",              label: "Cocina",           deptNombre: "Cocina", source: "manual" },
  { key: "bar.bartenders",      label: "Bar › Bartenders", deptNombre: "Bar", actividadNombre: "Bartender", source: "staffing", staffingRole: "bartenders" },
  { key: "bar.runners",         label: "Bar › Runners",    deptNombre: "Bar", actividadNombre: "Runner Bar", source: "staffing", staffingRole: "runnersBeb" },
  { key: "meseros.playa",       label: "Servicio › Playa",       deptNombre: "Meseros", actividadNombre: "Playa",          source: "staffing", staffingRole: "mesPlaya" },
  { key: "meseros.piscina",     label: "Servicio › Piscina",     deptNombre: "Meseros", actividadNombre: "Piscina",        source: "staffing", staffingRole: "mesPool" },
  { key: "meseros.restaurant",  label: "Servicio › Restaurant",  deptNombre: "Meseros", actividadNombre: "Restaurant",     source: "staffing", staffingRole: "mesRest" },
  { key: "meseros.runners",     label: "Servicio › Runners Comida", deptNombre: "Meseros", actividadNombre: "Runners Comida", source: "staffing", staffingRole: "runnersCom" },
  { key: "playeros",            label: "Playeros",         deptNombre: "Playeros", source: "manual" },
  { key: "flota",               label: "Flota",            deptNombre: "Flota", source: "manual" },
  { key: "mantenimiento",       label: "Mantenimiento",    deptNombre: "Mantenimiento", source: "manual" },
  { key: "housekeeping",        label: "Housekeeping",     deptNombre: "Housekeeping", source: "manual" },
  { key: "admin",               label: "Administración",   deptNombre: "Administración", source: "manual" },
  { key: "comercial",           label: "Comercial/Eventos", deptNombre: "Comercial/Eventos", source: "manual" },
];

export const FRANJAS = [
  { key: "07-09", ini: "07:00", fin: "09:00", label: "07–09" },
  { key: "09-11", ini: "09:00", fin: "11:00", label: "09–11" },
  { key: "11-13", ini: "11:00", fin: "13:00", label: "11–13" },
  { key: "13-15", ini: "13:00", fin: "15:00", label: "13–15" },
  { key: "15-17", ini: "15:00", fin: "17:00", label: "15–17" },
  { key: "17-19", ini: "17:00", fin: "19:00", label: "17–19" },
  { key: "19-21", ini: "19:00", fin: "21:00", label: "19–21" },
  { key: "21-23", ini: "21:00", fin: "23:00", label: "21–23" },
];

// Ventana de "pico" (almuerzo) — basada en BLOQUES de Staffing (12:00–15:00).
export const PICO_INI = "12:00";
export const PICO_FIN = "15:00";

// Una franja es "pico" si se solapa con [12:00, 15:00).
export function franjaEsPico(franja) {
  const toMin = (s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const a1 = toMin(franja.ini), a2 = toMin(franja.fin);
  const b1 = toMin(PICO_INI), b2 = toMin(PICO_FIN);
  return Math.max(a1, b1) < Math.min(a2, b2);
}
