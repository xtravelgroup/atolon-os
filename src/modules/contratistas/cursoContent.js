// Contenido del curso de inducción SST Atolón Beach Club
// Módulos educativos + banco de 15 preguntas
// IMPORTANTE: los índices de respuesta correcta DEBEN coincidir con
// supabase/functions/contratistas-submit-curso/index.ts

export const MODULOS = [
  {
    id: "m1",
    num: "Módulo 1 de 6",
    titulo: "Bienvenido a Atolón",
    intro: "Atolón Beach Club es un club de playa ubicado en Isla Tierra Bomba, frente a Cartagena de Indias. Recibimos huéspedes de Colombia y del mundo.",
    sections: [
      {
        type: "text",
        content: "Para entrar hay que llegar en lancha. El acceso es únicamente por mar. Esto significa que:",
      },
      {
        type: "list",
        items: [
          "El viaje se coordina con anticipación",
          "Si el clima está malo, se suspende",
          "Llevar chaleco salvavidas durante el viaje es **obligatorio**",
          "No se puede improvisar el regreso: hay horarios de lanchas",
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Recuerde",
        content: "Una vez en la isla no hay carreteras, ni farmacias, ni tiendas cerca. Traiga lo que necesite para trabajar: herramientas, agua, protector solar, gorra.",
      },
    ],
  },
  {
    id: "m2",
    num: "Módulo 2 de 6",
    titulo: "Reglas básicas",
    intro: "Estas son las reglas principales mientras está en Atolón:",
    sections: [
      { type: "rule", variant: "do", text: "Use su distintivo (escarapela o brazalete) visible todo el tiempo." },
      { type: "rule", variant: "do", text: "Quédese en las zonas autorizadas para su trabajo. Si necesita ir a otra zona, pida permiso." },
      { type: "rule", variant: "do", text: "Use los baños y el comedor del personal (back of house), no los de huéspedes." },
      { type: "rule", variant: "do", text: "Trabaje con sus propias herramientas y EPP (guantes, gafas, botas según el caso)." },
      { type: "rule", variant: "dont", text: "No consuma alcohol ni sustancias psicoactivas. Ni antes de venir, ni durante." },
      { type: "rule", variant: "dont", text: "No fume fuera de las zonas designadas." },
      { type: "rule", variant: "dont", text: "No porte armas (salvo personal de seguridad con credencial vigente)." },
      { type: "rule", variant: "dont", text: "No ingrese a zonas restringidas sin autorización: cocina, habitaciones, cuartos técnicos, bodega." },
      { type: "rule", variant: "dont", text: "No traiga personal adicional que no esté previamente registrado con Atolón." },
    ],
  },
  {
    id: "m3",
    num: "Módulo 3 de 6",
    titulo: "Con los huéspedes",
    intro: "Atolón es un lugar de lujo. Los huéspedes pagan por una experiencia exclusiva. Su presencia profesional es parte de esa experiencia.",
    sections: [
      { type: "heading", text: "Fotos y redes sociales" },
      {
        type: "list",
        items: [
          "No tome fotos ni videos de huéspedes",
          "No tome fotos ni videos de las instalaciones cuando haya huéspedes",
          "No publique nada en redes sobre Atolón, sus huéspedes o empleados",
          "Si quiere una foto de su trabajo para portafolio, pida permiso por escrito",
        ],
      },
      { type: "heading", text: "Comportamiento" },
      {
        type: "list",
        items: [
          'Si un huésped le pide algo, diga: "Permítame llamar a alguien del club que le pueda ayudar" y avise al anfitrión',
          "No ofrezca ni venda servicios propios o de terceros a huéspedes",
          "No acepte propinas. Los pagos son solo a través de factura",
          "No comente sobre huéspedes ni con compañeros ni fuera de Atolón",
        ],
      },
      {
        type: "callout",
        variant: "danger",
        title: "Confidencialidad",
        content: "Toda información que vea u oiga sobre huéspedes (nombres, situaciones, conversaciones) es confidencial. Divulgarla puede generar acciones legales contra usted y su empresa.",
      },
    ],
  },
  {
    id: "m4",
    num: "Módulo 4 de 6",
    titulo: "Riesgos a tener en cuenta",
    intro: "",
    sections: [
      { type: "heading", text: "Sol y calor" },
      {
        type: "list",
        items: [
          "Use gorra, protector solar y manga larga cuando sea posible",
          "Tome agua cada 30 minutos — la hidratación previene golpe de calor",
          "Descanse a la sombra cuando pueda",
        ],
      },
      { type: "heading", text: "Mar y muelle" },
      {
        type: "list",
        items: [
          "El muelle puede estar mojado y resbaloso — camine con cuidado",
          "Use el chaleco salvavidas en la lancha siempre",
          "No se acerque a la orilla con equipos eléctricos",
        ],
      },
      { type: "heading", text: "Piscina" },
      {
        type: "list",
        items: [
          "El piso alrededor es resbaloso",
          "Nunca bote químicos, restos de comida o grasa en la piscina",
          "Si su trabajo es en el cuarto de máquinas de la piscina, espere autorización",
        ],
      },
      { type: "heading", text: "Cocina" },
      {
        type: "list",
        items: [
          "Hay superficies calientes, aceites, cuchillos y equipos en uso",
          "Si entra a la cocina, el chef le dirá dónde pararse",
          "No toque equipos encendidos ni alimentos",
        ],
      },
      { type: "heading", text: "Eléctrico" },
      {
        type: "list",
        items: [
          "Si su trabajo es eléctrico, desenergice primero — no confíe en etiquetas",
          "Use herramientas dieléctricas",
          "Avise al anfitrión antes de cortar energía",
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Pregunta de oro",
        content: 'Antes de empezar cada tarea, pregúntese: "¿Lo que voy a hacer ahora podría lastimarme a mí, a un compañero o a un huésped?" Si la respuesta es sí, pare y busque la forma segura.',
      },
    ],
  },
  {
    id: "m5",
    num: "Módulo 5 de 6",
    titulo: "Si ocurre algo",
    intro: "En una isla, atender un accidente toma más tiempo que en tierra firme. Por eso, la prevención es clave. Pero si algo pasa:",
    sections: [
      { type: "step", num: 1, text: "**Mantenga la calma.** Ponga a salvo a las personas primero — usted mismo, luego compañeros, luego bienes." },
      { type: "step", num: 2, text: "**Avise inmediatamente.** Llame a su anfitrión de Atolón o al Coordinador SST. Los teléfonos se los dan al llegar." },
      { type: "step", num: 3, text: "**No mueva la escena.** A menos que sea estrictamente necesario para atender a un herido, no toque ni mueva nada." },
      { type: "step", num: 4, text: "**Espere instrucciones.** Atolón tiene brigada de emergencias y lancha de evacuación disponibles todo el día." },
      { type: "step", num: 5, text: "**Llene el reporte F-04.** Aunque el incidente sea menor, el reporte escrito es obligatorio. Lo recibe el Coordinador SST." },
      {
        type: "callout",
        variant: "success",
        title: "Incidente sin lesión también se reporta",
        content: "Si algo estuvo a punto de pasar pero no pasó (se cayó una herramienta, se rompió un tubo, se disparó un breaker), igual se reporta. Esto nos ayuda a prevenir el accidente real la próxima vez.",
      },
    ],
  },
  {
    id: "m6",
    num: "Módulo 6 de 6",
    titulo: "ARL y seguridad social",
    intro: "La ley colombiana exige que todo trabajador esté afiliado al sistema de seguridad social (EPS para salud, AFP para pensión y **ARL para riesgos laborales**).",
    sections: [
      {
        type: "text",
        content: "En Atolón **NO se permite el ingreso** de ningún trabajador sin ARL vigente. Esta regla nos protege a todos:",
      },
      {
        type: "list",
        items: [
          "Si usted se accidenta en el trabajo, la ARL cubre atención médica, incapacidad e indemnizaciones",
          "Si no tiene ARL, usted y su empresa tendrían que cubrir todo de su bolsillo",
          "Atolón también tendría problemas legales, por eso verificamos",
        ],
      },
      { type: "heading", text: "¿Quién paga la ARL?" },
      {
        type: "list",
        items: [
          "Si trabaja para una empresa: la empresa paga su ARL",
          "Si es independiente con contrato corto: usted paga su ARL",
          "Si es independiente con contrato de más de un mes con Atolón: Atolón paga su ARL (usted escoge la ARL)",
        ],
      },
      {
        type: "callout",
        variant: "warn",
        title: "Clase de riesgo",
        content: "La ARL se paga según la clase de riesgo de su actividad. Si hace trabajo eléctrico o en mar, la clase es más alta. Asegúrese de que su ARL corresponda al trabajo real — no una clase inferior para ahorrar. Si no coincide, la ARL puede negar cubrir un accidente.",
      },
      {
        type: "text",
        content: "En el muelle el día del trabajo le verificaremos:",
      },
      {
        type: "list",
        items: [
          "Certificado de ARL vigente (o PILA del mes)",
          "Consulta en el sistema RUAF con su cédula",
          "Correspondencia de la clase de riesgo con la actividad",
        ],
      },
    ],
  },
];

// Banco de 15 preguntas. El índice (0-based) de la respuesta correcta
// DEBE coincidir con supabase/functions/contratistas-submit-curso/index.ts
export const PREGUNTAS = [
  {
    id: "q1",
    q: "¿Cómo se llega a Atolón Beach Club?",
    options: [
      "En carro desde Cartagena",
      "En lancha desde el muelle asignado",
      "Nadando desde la playa",
      "En helicóptero",
    ],
    correct: 1,
    explain: "Atolón está en Isla Tierra Bomba. El único acceso es marítimo, en lancha desde el muelle que Atolón le asigna.",
  },
  {
    id: "q2",
    q: "Durante el viaje en lancha, ¿qué es obligatorio?",
    options: [
      "Usar gorra",
      "Tomar fotos del recorrido",
      "Usar el chaleco salvavidas",
      "Sentarse al frente",
    ],
    correct: 2,
    explain: "El chaleco salvavidas es obligatorio por ley (DIMAR) durante todo el trayecto marítimo.",
  },
  {
    id: "q3",
    q: "Un huésped le pregunta algo mientras trabaja. ¿Qué hace?",
    options: [
      "Le responde con todo detalle",
      "Lo ignora",
      "Responde cortés y avisa al anfitrión",
      "Le pide una propina",
    ],
    correct: 2,
    explain: 'Responda con cortesía breve y diga: "Permítame llamar a alguien del club que le pueda ayudar". Luego avise al anfitrión.',
  },
  {
    id: "q4",
    q: "¿Puede tomar fotos o videos de los huéspedes o las instalaciones?",
    options: [
      "Sí, siempre",
      "Solo si el huésped lo permite",
      "No, bajo ninguna circunstancia sin autorización escrita",
      "Solo los fines de semana",
    ],
    correct: 2,
    explain: "Tomar fotos o videos de huéspedes o de áreas con huéspedes está prohibido. Si quiere fotos de su trabajo, pida permiso por escrito.",
  },
  {
    id: "q5",
    q: "¿Puede publicar fotos de Atolón en sus redes sociales?",
    options: [
      "Sí, para promocionar su trabajo",
      "Solo fotos del paisaje",
      "No, sin autorización expresa por escrito",
      "Solo en Instagram",
    ],
    correct: 2,
    explain: "Toda publicación sobre Atolón, sus huéspedes o empleados requiere autorización escrita. La confidencialidad es parte del acuerdo.",
  },
  {
    id: "q6",
    q: "¿Qué hace si siente que una tarea puede ser peligrosa?",
    options: [
      "La hace rápido para salir pronto",
      "Pregunta a un compañero y sigue",
      "Para, consulta con el anfitrión y busca la forma segura",
      "La hace con los ojos cerrados",
    ],
    correct: 2,
    explain: "Si hay duda, pare. Consulte con el anfitrión. Es preferible demorar una hora que atender un accidente.",
  },
  {
    id: "q7",
    q: "¿Puede consumir alcohol mientras está en Atolón?",
    options: [
      "Sí, con moderación",
      "Solo al terminar el trabajo",
      "Solo si un huésped le invita",
      "No, bajo ninguna circunstancia",
    ],
    correct: 3,
    explain: "El consumo de alcohol o sustancias psicoactivas está totalmente prohibido antes de ingresar y durante toda la permanencia.",
  },
  {
    id: "q8",
    q: "¿Qué es la ARL y por qué la necesita vigente?",
    options: [
      "Es un seguro opcional de viaje",
      "Es la afiliación que cubre accidentes de trabajo — es obligatoria",
      "Es un impuesto",
      "Es la licencia de conducir",
    ],
    correct: 1,
    explain: "La ARL (Administradora de Riesgos Laborales) cubre la atención médica e indemnizaciones si usted se accidenta trabajando. Es obligatoria y Atolón la verifica antes de dejarlo ingresar.",
  },
  {
    id: "q9",
    q: "Ocurre un accidente pequeño mientras trabaja. ¿Qué hace primero?",
    options: [
      "Sigue trabajando como si nada",
      "Se toma una foto para redes sociales",
      "Pone a salvo a las personas y avisa al anfitrión o Coordinador SST",
      "Llama a su familia",
    ],
    correct: 2,
    explain: "El orden es: primero poner a salvo a las personas, luego avisar al anfitrión de Atolón o al Coordinador SST. No mueva la escena si no es necesario.",
  },
  {
    id: "q10",
    q: "¿A qué zonas NO puede ingresar sin autorización?",
    options: [
      "Al muelle",
      "Al punto de encuentro",
      "A cocina, habitaciones, cuartos técnicos y bodega",
      "A los baños del personal",
    ],
    correct: 2,
    explain: "Cocina, habitaciones de huéspedes, cuartos técnicos, bodega y oficina administrativa son zonas restringidas. Solo ingrese si su trabajo lo requiere y con autorización.",
  },
  {
    id: "q11",
    q: "¿Qué debe hacer con sus residuos al terminar el trabajo?",
    options: [
      "Dejarlos donde está",
      "Tirarlos al mar",
      "Llevárselos o depositarlos donde le indiquen",
      "Enterrarlos en la arena",
    ],
    correct: 2,
    explain: "Los residuos generados son responsabilidad del contratista. Los lleva de vuelta o los deposita donde Atolón le indique. Nunca al mar o la arena.",
  },
  {
    id: "q12",
    q: "¿Puede traer trabajadores adicionales el día del trabajo sin avisar?",
    options: [
      "Sí, si los necesita",
      "Sí, si llevan su propia comida",
      "No, todo trabajador debe estar previamente registrado",
      "Sí, pero solo uno",
    ],
    correct: 2,
    explain: "Ningún trabajador puede abordar la lancha si no fue registrado previamente con su cédula, ARL y certificado del curso.",
  },
  {
    id: "q13",
    q: "Su trabajo genera mucho ruido (taladrar, cortar). ¿Cuándo lo hace?",
    options: [
      "A cualquier hora",
      "En horario acordado con Atolón, normalmente fuera de operación con huéspedes",
      "Solo al amanecer",
      "Mientras hay huéspedes para que se distraigan",
    ],
    correct: 1,
    explain: "Los trabajos ruidosos o invasivos se programan fuera del horario de operación con huéspedes: típicamente entre 7:00 p.m. y 7:00 a.m. o los días de cierre.",
  },
  {
    id: "q14",
    q: "Si se pasa a una zona restringida sin autorización, ¿qué pasa?",
    options: [
      "Nada",
      "Se le entrega un detalle",
      "Se considera falta grave y puede terminar con la expulsión",
      "Le piden disculpas",
    ],
    correct: 2,
    explain: "Ingresar a zonas restringidas sin autorización es falta grave y puede terminar en retiro inmediato de la propiedad.",
  },
  {
    id: "q15",
    q: "¿Qué pasa si no reporta un incidente o casi-accidente?",
    options: [
      "Nada, si nadie se dio cuenta",
      "Se pierde la oportunidad de prevenir un accidente real",
      "Le dan un premio por ser discreto",
      "Lo agradecen los huéspedes",
    ],
    correct: 1,
    explain: "Los casi-accidentes (eventos sin lesión pero que pudieron ser graves) son oro para prevenir accidentes futuros. Reportarlos siempre.",
  },
];

export const PASSING_SCORE = 70; // porcentaje mínimo para aprobar
export const SUBMIT_URL = "https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/contratistas-submit-curso";

// Pequeño helper para renderizar **bold** dentro de un string como JSX
export function parseBold(text) {
  if (!text) return "";
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return { bold: true, text: p.slice(2, -2), key: i };
    }
    return { bold: false, text: p, key: i };
  });
}
