// analyze-briefing — Extrae datos estructurados de la transcripción de un briefing
// Recibe transcripción (texto) + lista de empleados, devuelve agenda, notas, acuerdos, tareas.

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { transcripcion, empleados, contexto } = await req.json();
    if (!transcripcion || transcripcion.trim().length < 20) {
      return new Response(JSON.stringify({ ok: false, error: "Transcripción muy corta" }), { status: 400, headers: corsHeaders });
    }

    const empleadosTxt = (empleados || [])
      .map((e: any) => `- ${e.id} | ${e.nombre}${e.cargo ? " (" + e.cargo + ")" : ""}`)
      .join("\n");

    const prompt = `Eres un asistente que toma notas en una reunión de gerencia de un beach club hotelero llamado Atolón.
Tu trabajo es extraer información estructurada de la transcripción cruda de la reunión.

CONTEXTO DEL BRIEFING:
${contexto || "Reunión semanal con supervisores y gerentes de departamento"}

EMPLEADOS DISPONIBLES (usa los IDs exactos cuando asignes tareas):
${empleadosTxt || "(sin lista)"}

TRANSCRIPCIÓN CRUDA:
"""
${transcripcion}
"""

Analiza la transcripción y devuelve SOLO un JSON con esta estructura exacta, sin texto adicional:
{
  "resumen": "Resumen ejecutivo de 2-3 frases sobre lo que se discutió.",
  "asistentes_mencionados": ["Nombre completo 1", "Nombre completo 2"],
  "agenda": [
    { "titulo": "Tema 1", "descripcion": "Lo que se discutió sobre este tema." }
  ],
  "notas": "Texto de notas generales más relevantes (puntos importantes, observaciones).",
  "acuerdos": "Lista de acuerdos tomados, separados por saltos de línea.",
  "tareas": [
    {
      "titulo": "Tarea concreta y accionable",
      "descripcion": "Detalles si los hay",
      "asignado_id": "uuid del empleado o vacío si no hay match",
      "asignado_nombre": "Nombre que mencionaron o vacío",
      "fecha_limite": "YYYY-MM-DD o vacío si no se mencionó",
      "prioridad": "baja|normal|alta|critica"
    }
  ]
}

Reglas:
- Identifica acciones concretas que alguien debe hacer y conviértelas en tareas.
- Si mencionan un nombre que coincida con la lista de empleados, usa su ID exacto en asignado_id.
- Si no hay match claro, deja asignado_id vacío y guarda el nombre en asignado_nombre.
- Para fechas relativas ("para mañana", "el viernes"), convierte a YYYY-MM-DD asumiendo hoy = ${new Date().toISOString().slice(0, 10)}.
- Si la prioridad no es explícita, usa "normal". Marca "alta" o "critica" si dicen "urgente", "crítico", "lo antes posible".
- Agenda: agrupa los temas discutidos. Si solo es uno, devuelve un solo item.
- No inventes información que no esté en la transcripción.
- Si la transcripción está vacía o no tiene contenido útil, devuelve arrays/strings vacíos pero mantén la estructura.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(JSON.stringify({ ok: false, error: "Respuesta no parseable", raw: text }), { status: 422, headers: corsHeaders });
    }

    const result = JSON.parse(match[0]);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders });
  }
});
