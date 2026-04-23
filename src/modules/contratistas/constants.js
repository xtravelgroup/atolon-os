// Catálogos y constantes reutilizables del módulo Contratistas.

export const C = {
  navy:      "#0D1B3E",
  navyLight: "#1E2D5C",
  navyDeep:  "#060F24",
  sand:      "#C8B99A",
  sandLight: "#E4DAC2",
  sandPale:  "#F2EBD9",
  sky:       "#8ECAE6",
  skyLight:  "#C9E4F0",
  cream:     "#FAF6EE",
  white:     "#FFFFFF",
  success:   "#3D8B5E",
  successBg: "#D2E9DC",
  error:     "#B84545",
  errorBg:   "#F6D5CC",
  warn:      "#D4A147",
  warnBg:    "#FCECC4",
  border:    "rgba(13, 27, 62, 0.15)",
  borderStrong: "rgba(13, 27, 62, 0.4)",
};

export const ARL_LIST = [
  "SURA", "Positiva", "Colmena", "AXA Colpatria",
  "Bolívar", "Equidad Seguros", "Mapfre", "La Previsora",
];

export const ARL_NATURAL = [
  ...ARL_LIST,
  "No tengo ARL — necesito que Atolon me afilie",
];

export const CLASES_RIESGO = [
  "Clase I (riesgo mínimo)",
  "Clase II (riesgo bajo)",
  "Clase III (riesgo medio)",
  "Clase IV (riesgo alto)",
  "Clase V (riesgo máximo)",
];

export const CLASES_SHORT = ["Clase I","Clase II","Clase III","Clase IV","Clase V"];

export const TAMANOS_EMPRESA = [
  "Microempresa (1-10 trabajadores)",
  "Pequeña (11-50)",
  "Mediana (51-200)",
  "Grande (+200)",
];

export const SERVICIOS_EMPRESA = [
  "Aire acondicionado y refrigeración",
  "Plomería y tuberías",
  "Mantenimiento general",
  "Eléctrico básico",
  "Catering y gastronomía para eventos",
  "Producción de eventos",
  "Sonido e iluminación",
  "Decoración",
  "Fotografía y video",
  "Jardinería",
  "Fumigación y control de plagas",
  "Proveedor de insumos",
  "Otro",
];

export const OFICIOS_NATURAL = [
  "Técnico aire acondicionado / refrigeración",
  "Plomero / fontanero",
  "Mantenimiento general",
  "Electricista básico",
  "Cocinero / ayudante de cocina",
  "Mesero / salonero (eventos)",
  "Decorador / montador de eventos",
  "Sonidista / iluminador",
  "Fotógrafo / camarógrafo",
  "DJ / músico",
  "Jardinero",
  "Fumigador / control de plagas",
  "Carpintero",
  "Pintor",
  "Otro",
];

export const RH_LIST = ["O+","O-","A+","A-","B+","B-","AB+","AB-","No lo sé"];

export const DURACIONES = [
  "Menos de 1 día",
  "1 día completo",
  "2 a 3 días",
  "Una semana",
  "Varias semanas",
  "Más de un mes",
];

export const REGIMENES = ["Contributivo","Subsidiado","Excepción / Especial"];

export const ARL_ESTADOS = [
  "Ya estoy afiliado y al día",
  "Estoy afiliado pero debo verificar pago",
  "Necesito que Atolon me afilie",
];

export const SST_PUNTAJES = [
  "Superior a 85% (aceptable)",
  "Entre 61% y 85% (moderadamente aceptable)",
  "Inferior a 60% (crítico)",
  "No hemos aplicado la autoevaluación",
];

// Documentos requeridos por tipo de contratista
export const UPLOAD_EMPRESA = [
  { id: "camcom",  name: "Cámara de Comercio", hint: "Certificado de existencia y representación legal, vigencia máx. 30 días", required: true },
  { id: "rut",     name: "RUT de la empresa", hint: "Registro Único Tributario actualizado", required: true },
  { id: "cedulaRL",name: "Cédula representante legal", hint: "Copia legible de la cédula", required: true },
  { id: "cert789", name: "Certificación Ley 789/2002 Art. 50", hint: "Pago al día de seguridad social, firmada por revisor fiscal o representante legal", required: true },
  { id: "pila",    name: "PILA del mes anterior", hint: "Planilla Integrada de Liquidación de Aportes con pago", required: true },
  { id: "arlTrab", name: "Certificados ARL de trabajadores", hint: "Un PDF con todos los certificados, o uno por cada trabajador", required: true },
];

export const UPLOAD_NATURAL = [
  { id: "cedula", name: "Cédula de ciudadanía", hint: "Copia legible por ambos lados", required: true },
  { id: "rut",    name: "RUT", hint: "Registro Único Tributario", required: true },
  { id: "eps",    name: "Certificado EPS", hint: "Afiliación vigente", required: true },
  { id: "afp",    name: "Certificado AFP", hint: "Afiliación vigente", required: true },
  { id: "arl",    name: "Certificado ARL", hint: "Si ya tiene afiliación propia", required: false },
];

export const DECS_EMPRESA = [
  "Declaro bajo juramento que la información suministrada es veraz y está actualizada.",
  "Certifico que la empresa está al día con los aportes al Sistema General de Seguridad Social (salud, pensión, ARL y parafiscales) de todos sus trabajadores.",
  "Confirmo que todos los trabajadores registrados en este portal cuentan con ARL vigente en la clase de riesgo correspondiente a la actividad que realizarán.",
  "Aseguraré que cada trabajador complete el curso interactivo de inducción antes del día del trabajo. Sin certificado del curso no se permite el embarque.",
  "Conozco y acepto las reglas, prohibiciones y procedimientos contenidos en la Guía PR-CON-002 y me comprometo a que todo el personal las cumpla.",
  "Me obligo a reportar de inmediato cualquier incidente, accidente o situación anormal ocurrida durante la ejecución del servicio, mediante el formulario F-04 del protocolo.",
  "Autorizo a Interop Colombia S.A.S. el tratamiento de los datos personales aquí entregados, conforme a la Ley 1581 de 2012, con el fin exclusivo de gestionar el ingreso, control y permanencia de nuestro personal en la propiedad.",
];

export const DECS_NATURAL = [
  "Declaro que la información suministrada es veraz.",
  "Me encuentro físicamente apto para realizar el trabajo que voy a prestar.",
  "Conozco los riesgos propios de mi oficio y los riesgos generales de la operación en Atolon Beach Club (ingreso por mar, exposición solar, trabajo en isla).",
  "Me comprometo a usar los elementos de protección personal apropiados para mi oficio.",
  "Conozco y acepto las reglas de la Guía PR-CON-002.",
  "Autorizo a Interop Colombia S.A.S. el tratamiento de mis datos personales, conforme a la Ley 1581 de 2012, con el fin exclusivo de gestionar mi ingreso a la propiedad.",
];

export const STEPS_EMPRESA = ["Empresa","Servicio","ARL y SG-SST","Trabajadores","Documentos","Declaración","Resumen"];
export const STEPS_NATURAL = ["Personales","Servicio","Seg. social","Documentos","Declaración","Resumen"];

// Genera radicado cliente-side (la Edge Function lo regenerará en Fase 3)
export function genRadicado(tipo) {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const prefix = tipo === "empresa" ? "EMP" : "NAT";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let rand = "";
  for (let i = 0; i < 6; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  return `ATL-${prefix}-${yy}${mm}${dd}-${rand}`;
}

// Genera token único para curso (32 hex)
export function genCursoToken() {
  const arr = new Uint8Array(16);
  (typeof crypto !== "undefined" ? crypto : window.crypto).getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Validaciones comunes
export const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
export const isPhone = v => /^\d{7,15}$/.test(String(v || "").replace(/\D/g, ""));
export const isCedula = v => /^\d{5,15}$/.test(String(v || "").trim());
