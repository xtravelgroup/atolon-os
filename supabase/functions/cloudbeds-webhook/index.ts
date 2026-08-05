// Webhook Cloudbeds. Recibe eventos live (reservation/created, updated,
// cancelled, checked_in, checked_out) y actualiza hotel_estancias.
// Se registra en Cloudbeds Marketplace apuntando a la URL de esta función.
import { getValidAccessToken, cbGet, supaAdmin, jr, CORS } from "../_shared/cloudbeds.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jr({ error: "POST only" }, 405);
  const supa = supaAdmin();

  try {
    const body = await req.json().catch(() => ({}));
    // Cloudbeds envía: { event, propertyID, reservationID, timestamp }
    const event = String(body.event || body.type || "");
    const propId = String(body.propertyID || body.property_id || "");
    const cbResId = String(body.reservationID || body.reservation_id || "");
    if (!propId || !cbResId) {
      await supa.from("cloudbeds_sync_log").insert({
        property_id: propId || null, tipo: "webhook",
        status: "error", error: "faltan propertyID o reservationID",
        detalle: body,
      });
      return jr({ ok: false, error: "missing_ids" }, 400);
    }

    // Cancelaciones: solo marcamos estado, no refetcheamos
    if (event.includes("cancel")) {
      await supa.from("hotel_estancias").update({
        estado: "cancelada", cloudbeds_sync_at: new Date().toISOString(),
      }).eq("cloudbeds_reservation_id", cbResId);
      await logWebhook(supa, propId, event, cbResId, "ok");
      return jr({ ok: true, action: "cancelled" });
    }

    // Para otros eventos: refetch la reserva completa desde Cloudbeds
    const token = await getValidAccessToken(supa, propId);
    const detail = await cbGet(token, "/getReservation", {
      propertyID: propId, reservationID: cbResId, includeGuestsDetails: true,
    });
    const r = detail?.data;
    if (!r) {
      await logWebhook(supa, propId, event, cbResId, "error", "getReservation vacío");
      return jr({ ok: false, error: "reservation_not_found" }, 404);
    }

    const guest = (r.guestList || [{}])[0] || {};
    const email = String(guest.email || r.email || "").trim().toLowerCase() || null;

    // Huésped
    let huesped_id: string | null = null;
    if (email || guest.guestID) {
      const { data: existH } = await supa.from("hotel_huespedes")
        .select("id")
        .or([
          email ? `email.eq.${email}` : null,
          guest.guestID ? `cloudbeds_guest_id.eq.${guest.guestID}` : null,
        ].filter(Boolean).join(","))
        .maybeSingle();
      if (existH) {
        huesped_id = existH.id;
      } else {
        const { data: newH } = await supa.from("hotel_huespedes").insert({
          cloudbeds_guest_id: guest.guestID || null,
          nombre:   guest.firstName || guest.first_name || guest.name || "Sin nombre",
          apellido: guest.lastName  || guest.last_name  || null,
          email, telefono: guest.phone || guest.cellphone || null,
          documento: guest.document || null,
          pais: guest.country || null,
        }).select("id").single();
        huesped_id = newH?.id;
      }
    }

    const payload: any = {
      cloudbeds_reservation_id: cbResId,
      cloudbeds_property_id: propId,
      origen: "cloudbeds",
      cloudbeds_source: r.sourceName || r.source || "direct",
      codigo: `CB-${cbResId}`,
      huesped_id,
      check_in_at:  r.startDate ? `${r.startDate}T15:00:00-05:00` : null,
      check_out_at: r.endDate   ? `${r.endDate}T12:00:00-05:00` : null,
      estado:       mapEstado(r.status),
      pax_adultos:  Number(r.adults) || 1,
      pax_ninos:    Number(r.children) || 0,
      total:        Number(r.total) || 0,
      cloudbeds_sync_at: new Date().toISOString(),
    };
    const { data: existE } = await supa.from("hotel_estancias")
      .select("id").eq("cloudbeds_reservation_id", cbResId).maybeSingle();
    if (existE) await supa.from("hotel_estancias").update(payload).eq("id", existE.id);
    else        await supa.from("hotel_estancias").insert(payload);
    await logWebhook(supa, propId, event, cbResId, "ok");
    return jr({ ok: true, action: existE ? "updated" : "created" });
  } catch (e: any) {
    console.error("cb-webhook error:", e);
    return jr({ ok: false, error: e.message || String(e) }, 500);
  }
});

async function logWebhook(supa: any, propId: string, event: string, cbResId: string, status: string, error?: string) {
  await supa.from("cloudbeds_sync_log").insert({
    property_id: propId, tipo: "webhook",
    status, error: error || null,
    detalle: { event, reservationID: cbResId },
  });
}

function mapEstado(s: string): string {
  const k = (s || "").toLowerCase();
  if (k.includes("cancel")) return "cancelada";
  if (k.includes("checked_out") || k === "closed") return "checked_out";
  if (k.includes("in_house") || k === "checked_in") return "in_house";
  if (k.includes("no_show")) return "no_show";
  return "reservada";
}
