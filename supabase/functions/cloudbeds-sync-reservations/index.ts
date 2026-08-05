// Sync incremental de reservas Cloudbeds → hotel_estancias.
// - Se llama con { property_id, desde?, hasta? } o sin body para sincronizar
//   TODAS las propiedades activas desde su last_sync_at.
// - Corre desde pg_cron cada 15 min y también manualmente desde la UI.
import { getValidAccessToken, cbGet, supaAdmin, jr, CORS } from "../_shared/cloudbeds.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const supa = supaAdmin();

  let targets: any[] = [];
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (body.property_id) {
      const { data } = await supa.from("cloudbeds_credentials")
        .select("*").eq("property_id", body.property_id).eq("activo", true).maybeSingle();
      if (data) targets = [{ ...data, _desde: body.desde, _hasta: body.hasta }];
    } else {
      const { data } = await supa.from("cloudbeds_credentials").select("*").eq("activo", true);
      targets = data || [];
    }

    const results: any[] = [];
    for (const cred of targets) {
      const started = Date.now();
      const desde = cred._desde || cred.last_sync_at ||
                    new Date(Date.now() - 30 * 864e5).toISOString(); // últimos 30d por defecto
      const hasta = cred._hasta || new Date(Date.now() + 365 * 864e5).toISOString();
      try {
        await supa.from("cloudbeds_credentials").update({
          last_sync_status: "running", updated_at: new Date().toISOString(),
        }).eq("property_id", cred.property_id);
        const token = await getValidAccessToken(supa, cred.property_id);
        const stats = await syncPropReservations(supa, token, cred.property_id, desde, hasta);
        await supa.from("cloudbeds_credentials").update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "ok",
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("property_id", cred.property_id);
        await supa.from("cloudbeds_sync_log").insert({
          property_id: cred.property_id, tipo: "reservations",
          desde, hasta, ...stats, duracion_ms: Date.now() - started, status: "ok",
        });
        results.push({ property_id: cred.property_id, ok: true, ...stats });
      } catch (e: any) {
        await supa.from("cloudbeds_credentials").update({
          last_sync_status: "error",
          last_error: String(e.message || e).slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq("property_id", cred.property_id);
        await supa.from("cloudbeds_sync_log").insert({
          property_id: cred.property_id, tipo: "reservations",
          desde, hasta, duracion_ms: Date.now() - started,
          status: "error", error: String(e.message || e).slice(0, 500),
        });
        results.push({ property_id: cred.property_id, ok: false, error: e.message });
      }
    }
    return jr({ ok: true, count: results.length, results });
  } catch (e: any) { return jr({ ok: false, error: e.message }, 500); }
});

async function syncPropReservations(supa: any, token: string, propId: string, desde: string, hasta: string) {
  let registros_in = 0, registros_up = 0, registros_new = 0;
  let pageNumber = 1;
  const pageSize = 100;
  const fmtDate = (iso: string) => iso.slice(0, 10);

  while (true) {
    const data = await cbGet(token, "/getReservations", {
      propertyID: propId,
      checkInFrom: fmtDate(desde),
      checkOutTo:  fmtDate(hasta),
      resultsFrom: (pageNumber - 1) * pageSize + 1,
      resultsTo:   pageNumber * pageSize,
      includeGuestsDetails: true,
    });
    const rows: any[] = data?.data || [];
    if (rows.length === 0) break;
    registros_in += rows.length;

    for (const r of rows) {
      // Upsert huesped por email (fallback a cloudbeds_guest_id)
      const guest = (r.guestList || [{}])[0] || {};
      const email = String(guest.email || r.email || "").trim().toLowerCase() || null;
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
          await supa.from("hotel_huespedes").update({
            cloudbeds_guest_id: guest.guestID || null,
            nombre:   guest.firstName || guest.first_name || null,
            apellido: guest.lastName  || guest.last_name  || null,
            telefono: guest.phone || guest.cellphone || null,
            pais:     guest.country || null,
            updated_at: new Date().toISOString(),
          }).eq("id", huesped_id);
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

      // Upsert estancia
      const cbId = String(r.reservationID);
      const payload: any = {
        cloudbeds_reservation_id: cbId,
        cloudbeds_property_id: propId,
        origen: "cloudbeds",
        cloudbeds_source: r.sourceName || r.source || "direct",
        codigo: `CB-${cbId}`,
        huesped_id,
        check_in_at:  r.startDate ? `${r.startDate}T15:00:00-05:00` : null,
        check_out_at: r.endDate   ? `${r.endDate}T12:00:00-05:00` : null,
        estado:       mapEstado(r.status),
        pax_adultos:  Number(r.adults)   || 1,
        pax_ninos:    Number(r.children) || 0,
        total:        Number(r.total) || 0,
        deposito:     Number(r.balance !== undefined ? (Number(r.total) - Number(r.balance)) : 0) || 0,
        canal:        r.sourceName || "cloudbeds",
        cloudbeds_sync_at: new Date().toISOString(),
      };

      const { data: existE } = await supa.from("hotel_estancias")
        .select("id").eq("cloudbeds_reservation_id", cbId).maybeSingle();
      if (existE) {
        await supa.from("hotel_estancias").update(payload).eq("id", existE.id);
        registros_up++;
      } else {
        await supa.from("hotel_estancias").insert(payload);
        registros_new++;
      }
    }

    if (rows.length < pageSize) break;
    pageNumber++;
    if (pageNumber > 100) break; // safety
  }
  return { registros_in, registros_up, registros_new };
}

function mapEstado(s: string): string {
  const k = (s || "").toLowerCase();
  if (k.includes("cancel")) return "cancelada";
  if (k.includes("checked_out") || k === "closed") return "checked_out";
  if (k.includes("in_house") || k === "checked_in") return "in_house";
  if (k.includes("no_show")) return "no_show";
  return "reservada";
}
