// wompi-webhook (Atolón OS)
// Recibe eventos de Wompi y actualiza reservas / pedidos cuando el pago
// se aprueba o rechaza. Antes solo confirmábamos via redirect post-pago,
// lo que dejaba reservas colgadas si el cliente cerraba el navegador.
//
// Configurar en Wompi → Comercio → Eventos:
//   URL: https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/wompi-webhook
//   Evento: transaction.updated
//
// Variables de entorno requeridas:
//   WOMPI_EVENTS_KEY      — Llave de eventos (firma del payload)
//   SUPABASE_URL          — auto
//   SUPABASE_SERVICE_ROLE_KEY — auto
//
// Estructura del payload de Wompi (transaction.updated):
//   {
//     "event": "transaction.updated",
//     "data": {
//       "transaction": {
//         "id": "...",
//         "reference": "WEB-1777480823458",
//         "amount_in_cents": 192000000,
//         "currency": "COP",
//         "status": "APPROVED" | "DECLINED" | "VOIDED" | "ERROR",
//         "status_message": "...",
//         "payment_method_type": "PSE" | "CARD" | ...,
//         "customer_email": "...",
//         "finalized_at": "2026-04-29T16:43:00.000Z",
//         "created_at": "...",
//         "payment_link_id": null
//       }
//     },
//     "sent_at": "...",
//     "timestamp": 1714402980,
//     "signature": {
//       "checksum": "...",          // SHA256 hex de propiedades + timestamp + events_key
//       "properties": ["transaction.id", "transaction.status", "transaction.amount_in_cents"]
//     },
//     "environment": "prod"
//   }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVENTS_KEY = Deno.env.get("WOMPI_EVENTS_KEY") || "";

// Public key de Wompi — primero env, luego BD (configuracion.wompi_pub_key).
// Solo se usa para consultas read-only via /poll-recent.
async function loadWompiPubKey(SB: any): Promise<string> {
  const fromEnv = Deno.env.get("WOMPI_PUBLIC_KEY") || Deno.env.get("VITE_WOMPI_PUBLIC_KEY") || "";
  if (fromEnv) return fromEnv;
  try {
    const { data } = await SB.from("configuracion").select("wompi_pub_key").eq("id", "atolon").single();
    if (data?.wompi_pub_key) return data.wompi_pub_key;
  } catch { /* ignore */ }
  return "";
}

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ── Validar firma del evento ────────────────────────────────────────────
// Wompi calcula: SHA256( <prop1_value><prop2_value>...<propN_value><timestamp><events_key> )
async function validarFirma(payload: any): Promise<boolean> {
  if (!EVENTS_KEY) {
    console.warn("WOMPI_EVENTS_KEY no configurada — saltando validación");
    return true; // permitir mientras el secret no esté seteado (modo dev)
  }
  const signature = payload?.signature;
  if (!signature?.checksum || !Array.isArray(signature.properties)) return false;

  // Concatena el valor de cada propiedad listada (paths como "transaction.id")
  const concatProps = signature.properties.map((path: string) => {
    const parts = path.split(".");
    let v: any = payload?.data;
    for (const p of parts) v = v?.[p];
    return String(v ?? "");
  }).join("");

  const message = concatProps + String(payload.timestamp) + EVENTS_KEY;
  const msgBytes = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBytes);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex === signature.checksum.toLowerCase();
}

function jsonResp(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/wompi-webhook/, "");

  // ── GET /diag — diagnóstico público (sin auth) ──────────────────────
  if (req.method === "GET" && path === "/diag") {
    try {
      const SB = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: ultimosEventos } = await SB
        .from("wompi_eventos_log")
        .select("evento, referencia, transaction_id, status, monto, firma_valida, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      const { count: totalEventos } = await SB
        .from("wompi_eventos_log")
        .select("*", { count: "exact", head: true });

      const pubKey = await loadWompiPubKey(SB);
      return jsonResp({
        ok: true,
        timestamp: new Date().toISOString(),
        webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/wompi-webhook`,
        config: {
          events_key_configured: !!EVENTS_KEY,
          public_key_configured: !!pubKey,
          public_key_source: pubKey ? (Deno.env.get("WOMPI_PUBLIC_KEY") ? "env" : "db") : "none",
        },
        stats: { total_eventos_recibidos: totalEventos || 0 },
        ultimos_eventos: ultimosEventos || [],
      });
    } catch (err) {
      return jsonResp({ ok: false, error: String(err) }, 500);
    }
  }

  // ── GET de diagnóstico (legacy) ─────────────────────────────────────
  if (req.method === "GET" && path === "") {
    return jsonResp({
      ok: true,
      service: "wompi-webhook",
      events_key_configured: !!EVENTS_KEY,
      version: "1.1.0",
    });
  }

  // ── POST /poll-recent — safety net mientras webhook no llegue ──────
  // Lista reservas Wompi de últimas N horas (cancelado o pendiente_pago)
  // y consulta Wompi por reference para detectar pagos APPROVED que no
  // confirmaron la reserva por webhook fallido.
  if (req.method === "POST" && path === "/poll-recent") {
    try {
      const body = await req.json().catch(() => ({}));
      const horasAtras = Number(body?.hours) || 4;
      const desdeStr = new Date(Date.now() - horasAtras * 3600 * 1000).toISOString();

      const SB = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const PUBLIC_KEY = await loadWompiPubKey(SB);
      if (!PUBLIC_KEY) {
        return jsonResp({ ok: false, error: "Wompi public key no configurada (configuracion.wompi_pub_key vacía)" }, 500);
      }
      const { data: candidatas } = await SB.from("reservas")
        .select("id, total, abono, estado, forma_pago, created_at, lead_id, notas")
        .eq("forma_pago", "wompi")
        .in("estado", ["cancelado", "pendiente_pago"])
        .gte("created_at", desdeStr)
        .order("created_at", { ascending: false });

      let recovered = 0, notFound = 0, stillPending = 0, errCount = 0;
      const procesadas: any[] = [];

      for (const r of (candidatas || [])) {
        try {
          const wRes = await fetch(
            `https://production.wompi.co/v1/transactions?reference=${encodeURIComponent(r.id)}`,
            { headers: { Authorization: `Bearer ${PUBLIC_KEY}` } }
          );
          const wData = await wRes.json();
          const txs = (wData?.data || []) as any[];
          // Buscar la transacción APPROVED más reciente para esta reference
          const approved = txs.find(t => t.status === "APPROVED");

          if (!approved) {
            if (txs.length === 0) notFound++;
            else stillPending++;
            continue;
          }

          const monto = Math.round((approved.amount_in_cents || 0) / 100);
          const finalizadoAt = (approved.finalized_at || approved.created_at || "").slice(0, 10);
          await SB.from("reservas").update({
            estado: "confirmado",
            forma_pago: "wompi",
            abono: monto,
            saldo: Math.max(0, Number(r.total || 0) - monto),
            fecha_pago: finalizadoAt,
            referencia_pago: approved.id,
            notas: (r.notas ? r.notas + " · " : "") + `Restaurada por safety-net (Wompi tx ${approved.id})`,
            updated_at: new Date().toISOString(),
          }).eq("id", r.id);

          if (r.lead_id) {
            await SB.from("leads").update({
              stage: "Cerrado Ganado", ultimo_contacto: finalizadoAt,
            }).eq("id", r.lead_id).then(() => {}).catch(() => {});
          }
          await SB.from("ac_carts").update({
            estado: "recovered", recovered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("reserva_id", r.id).then(() => {}).catch(() => {});

          await SB.from("wompi_eventos_log").insert({
            evento: "transaction.recovered",
            referencia: r.id,
            transaction_id: approved.id,
            status: "APPROVED",
            monto,
            raw: { _origen: "poll-recent", tx: approved },
            firma_valida: true,
          }).then(() => {}).catch(() => {});

          recovered++;
          procesadas.push({ ref: r.id, txId: approved.id, monto });
        } catch (e) {
          errCount++;
          console.warn("[wompi-poll] error en", r.id, ":", (e as Error).message);
        }
      }

      return jsonResp({
        ok: true,
        candidatas_revisadas: (candidatas || []).length,
        recovered, notFound, stillPending, errCount,
        procesadas,
      });
    } catch (err) {
      return jsonResp({ ok: false, error: String(err) }, 500);
    }
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const raw = await req.text();
    let payload: any;
    try { payload = JSON.parse(raw); } catch { return jsonResp({ error: "Body no es JSON" }, 400); }

    const SB = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Log SIEMPRE el evento para debugging
    const tx = payload?.data?.transaction || {};
    const evento  = payload?.event || "unknown";
    const ref     = tx.reference || null;
    const txId    = tx.id || null;
    const status  = tx.status || null;
    const monto   = tx.amount_in_cents ? Math.round(tx.amount_in_cents / 100) : 0;
    const metodo  = tx.payment_method_type || "wompi";
    const finalizadoAt = tx.finalized_at || tx.updated_at || new Date().toISOString();

    // Persistir log antes de validar firma (debug si la firma falla)
    await SB.from("wompi_eventos_log").insert({
      evento,
      referencia: ref,
      transaction_id: txId,
      status,
      monto,
      raw: payload,
      firma_valida: false, // se actualiza abajo
    }).then(() => {}).catch(() => {});

    // Validar firma — pero retornar 200 igual para que Wompi no reintente
    const firmaOK = await validarFirma(payload);
    if (!firmaOK) {
      console.error("Firma Wompi inválida:", { ref, txId, sig: payload?.signature?.checksum?.slice(0, 12) });
      return jsonResp({ received: true, firma: "invalid" }, 200);
    }
    if (txId) {
      await SB.from("wompi_eventos_log").update({ firma_valida: true }).eq("transaction_id", txId).then(() => {}).catch(() => {});
    }

    // Solo procesamos el evento de transacción
    if (evento !== "transaction.updated" || !ref) {
      return jsonResp({ received: true, processed: false, reason: "evento ignorado" });
    }

    // ── 1) Actualizar reserva ───────────────────────────────────────────
    const { data: reservas } = await SB.from("reservas")
      .select("id, total, abono, estado")
      .eq("id", ref)
      .limit(1);
    const reserva = reservas?.[0];

    if (reserva) {
      const fechaPago = (finalizadoAt || "").slice(0, 10);
      const notaTrx = `Pago Wompi (${metodo}) — Trx #${txId} — ${status}`;

      if (status === "APPROVED") {
        await SB.from("reservas").update({
          abono:       monto,
          saldo:       Math.max(0, Number(reserva.total || 0) - monto),
          estado:      "confirmado",
          forma_pago:  "wompi",
          fecha_pago:  fechaPago,
          referencia_pago: txId,
          updated_at:  new Date().toISOString(),
        }).eq("id", reserva.id);

        // Cerrar lead asociado si existe
        await SB.from("leads").update({
          stage: "Cerrado Ganado",
          ultimo_contacto: fechaPago,
        }).eq("reserva_id", reserva.id).then(() => {}).catch(() => {});

        // Marcar carrito recuperado
        await SB.from("ac_carts").update({
          estado: "recovered",
          recovered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("reserva_id", reserva.id).then(() => {}).catch(() => {});

        console.log(`✓ Reserva ${reserva.id} confirmada vía Wompi (${monto} COP)`);
        return jsonResp({ received: true, processed: true, action: "confirmed", reserva_id: reserva.id });
      }

      if (status === "DECLINED" || status === "VOIDED" || status === "ERROR") {
        await SB.from("reservas").update({
          estado: "pendiente",
          notas:  (reserva as any).notas
            ? (reserva as any).notas + " | " + notaTrx
            : notaTrx,
          updated_at: new Date().toISOString(),
        }).eq("id", reserva.id);

        return jsonResp({ received: true, processed: true, action: "declined", reserva_id: reserva.id });
      }
    }

    // ── 2) Si no era reserva, intentar pedido room service ──────────────
    const { data: pedidos } = await SB.from("hotel_room_service_pedidos")
      .select("id")
      .or(`id.eq.${ref},codigo.eq.${ref}`)
      .limit(1);
    const pedido = pedidos?.[0];

    if (pedido && status === "APPROVED") {
      await SB.from("hotel_room_service_pedidos").update({
        pago_estado: "pagado",
        pos_sync: { provider: "wompi", payment_id: txId, paid_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).eq("id", pedido.id);
      return jsonResp({ received: true, processed: true, action: "pedido_pagado", pedido_id: pedido.id });
    }

    return jsonResp({ received: true, processed: false, reason: "referencia no encontrada", ref });
  } catch (err) {
    console.error("wompi-webhook error:", err);
    // Retornar 200 para evitar reintentos infinitos de Wompi
    return jsonResp({ received: true, error: String((err as Error).message || err) }, 200);
  }
});
