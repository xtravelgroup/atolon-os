import { supabase } from "./supabase";

/**
 * logAccion — registro de auditoría, fire-and-forget.
 *
 * Uso:
 *   logAccion({
 *     modulo:       "reservas",
 *     accion:       "crear_reserva",
 *     tabla:        "reservas",
 *     registroId:   row.id,
 *     datosAntes:   null,
 *     datosDespues: row,
 *     notas:        "Canal: WhatsApp",
 *   });
 */
export async function logAccion({
  modulo,
  accion,
  tabla = null,
  registroId = null,
  datosAntes = null,
  datosDespues = null,
  notas = null,
}) {
  if (!supabase) return;

  // Obtener usuario actual desde la sesión en memoria (sin latencia extra)
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email ?? "sistema";

  const id = `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Non-blocking: no hace await en el sitio de llamada
  supabase.from("historial_acciones").insert({
    id,
    usuario_email: email,
    modulo,
    accion,
    tabla,
    registro_id:   registroId,
    datos_antes:   datosAntes,
    datos_despues: datosDespues,
    notas,
  }).then(({ error }) => {
    if (error) console.warn("[logAccion]", error.message);
  });
}
