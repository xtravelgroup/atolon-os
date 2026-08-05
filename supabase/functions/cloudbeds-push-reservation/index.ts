// Push de una reserva creada en Atolón (Concierge AI / grupo / web) hacia
// Cloudbeds. Body: { estancia_id }.
import { getValidAccessToken, cbPost, supaAdmin, jr, CORS } from "../_shared/cloudbeds.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jr({ error: "POST only" }, 405);
  const supa = supaAdmin();

  try {
    const { estancia_id, property_id } = await req.json();
    if (!estancia_id) return jr({ error: "estancia_id requerido" }, 400);

    const { data: est } = await supa.from("hotel_estancias")
      .select("*, huesped:hotel_huespedes(*), habitacion:hotel_habitaciones(*)")
      .eq("id", estancia_id).maybeSingle();
    if (!est) return jr({ error: "Estancia no encontrada" }, 404);
    if (est.cloudbeds_reservation_id) {
      return jr({ ok: true, skipped: "ya sincronizada", reservationID: est.cloudbeds_reservation_id });
    }

    // Tomar propiedad: la de la estancia o la primera activa
    let propId = property_id || est.cloudbeds_property_id;
    if (!propId) {
      const { data: first } = await supa.from("cloudbeds_credentials")
        .select("property_id").eq("activo", true).limit(1).maybeSingle();
      propId = first?.property_id;
    }
    if (!propId) return jr({ error: "No hay property Cloudbeds conectada" }, 400);

    const token = await getValidAccessToken(supa, propId);
    const g = est.huesped || {};
    const startDate = est.check_in_at?.slice(0, 10);
    const endDate   = est.check_out_at?.slice(0, 10);

    // Cloudbeds requiere roomID; si no lo tenemos, mandamos roomTypeID y ellos asignan
    const payload: any = {
      propertyID: propId,
      startDate, endDate,
      guestFirstName: g.nombre   || "Sin",
      guestLastName:  g.apellido || "nombre",
      guestCountry:   g.pais || "CO",
      guestGender:    "N",
      adults:   est.pax_adultos || 1,
      children: est.pax_ninos   || 0,
      sourceName: "Atolon OS Concierge",
    };
    if (g.email)    payload.guestEmail = g.email;
    if (g.telefono) payload.guestPhone = g.telefono;
    if (est.habitacion?.cloudbeds_room_id) payload.roomID = est.habitacion.cloudbeds_room_id;

    const res = await cbPost(token, "/postReservation", payload);
    const cbId = String(res?.reservationID || res?.data?.reservationID || "");
    if (!cbId) throw new Error("Cloudbeds no retornó reservationID");

    await supa.from("hotel_estancias").update({
      cloudbeds_reservation_id: cbId,
      cloudbeds_property_id: propId,
      cloudbeds_sync_at: new Date().toISOString(),
    }).eq("id", estancia_id);

    return jr({ ok: true, reservationID: cbId, propertyID: propId });
  } catch (e: any) {
    return jr({ ok: false, error: e.message || String(e) }, 500);
  }
});
