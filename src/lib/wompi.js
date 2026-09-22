// ═══════════════════════════════════════════════
// WOMPI — Configuración y helpers (multi-merchant)
// ═══════════════════════════════════════════════
//
// El proyecto usa 2 comercios Wompi distintos:
//   - default: pasadías, eventos, agencia, B2B, cualquier venta que no sea
//     exclusivamente habitación. Sus llaves están hardcoded (pub) o en env
//     de Vercel (integrity).
//   - hotel: reservas 100% habitación (HotelReservas staff, HotelGrupoPublico).
//     Sus llaves viven en la tabla configuracion (columnas wompi_hotel_*)
//     para poder rotarlas desde /track sin redeploy.
//
// Regla confirmada: reservas mixtas (pasadía + habitación) → default.

import { supabase } from "./supabase";

export const WOMPI_PUB_KEY = "pub_prod_j2kColsiNhfHj27SWbi62nQpUTNFPZc1";
export const WOMPI_INTEGRITY_KEY = import.meta.env.VITE_WOMPI_INTEGRITY_KEY || "";

// Cache promise: las llaves de hotel se leen una sola vez por sesión de
// navegador. Si el admin las rota en /track, tocará recargar la SPA — es
// aceptable porque son cambios muy poco frecuentes y evita hacer un fetch a
// Supabase por cada checkout.
let _hotelKeysPromise = null;

async function loadHotelKeys() {
  if (_hotelKeysPromise) return _hotelKeysPromise;
  _hotelKeysPromise = (async () => {
    try {
      const { data } = await supabase
        .from("configuracion")
        .select("wompi_hotel_pub_key, wompi_hotel_integrity_key")
        .eq("id", "atolon")
        .single();
      return {
        pub:       data?.wompi_hotel_pub_key       || "",
        integrity: data?.wompi_hotel_integrity_key || "",
      };
    } catch {
      return { pub: "", integrity: "" };
    }
  })();
  return _hotelKeysPromise;
}

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Genera la URL del checkout hospedado de Wompi.
 *
 * @param {object} opts
 * @param {string} opts.referencia
 * @param {number} opts.totalCOP
 * @param {string} [opts.email]
 * @param {string} [opts.redirectUrl]
 * @param {"default"|"hotel"} [opts.merchant="default"]  Elige el comercio.
 *   "hotel" solo debe usarse cuando la reserva es 100% habitación.
 */
export async function wompiCheckoutUrl({
  referencia,
  totalCOP,
  email = "",
  redirectUrl = "",
  merchant = "default",
}) {
  const amountCentavos = Math.round(totalCOP * 100).toString();
  const currency = "COP";

  let pubKey = WOMPI_PUB_KEY;
  let integrityKey = WOMPI_INTEGRITY_KEY;

  if (merchant === "hotel") {
    const h = await loadHotelKeys();
    if (!h.pub || !h.integrity) {
      throw new Error(
        "Wompi Hotel: llaves no configuradas (configuracion.wompi_hotel_pub_key / wompi_hotel_integrity_key)",
      );
    }
    pubKey = h.pub;
    integrityKey = h.integrity;
  }

  // Firma de integridad: SHA256(referencia + amountCentavos + currency + integrity_key)
  let signature = "";
  if (integrityKey) {
    const raw = `${referencia}${amountCentavos}${currency}${integrityKey}`;
    signature = await sha256(raw);
  }

  const parts = [
    `public-key=${pubKey}`,
    `currency=${currency}`,
    `amount-in-cents=${amountCentavos}`,
    `reference=${referencia}`,
  ];

  // Los parámetros con ":" deben ir literales — NO codificados como %3A.
  if (signature) parts.push(`signature:integrity=${signature}`);
  if (email)     parts.push(`customer-data:email=${encodeURIComponent(email)}`);
  const isLocalhost = redirectUrl.includes("localhost") || redirectUrl.includes("127.0.0.1");
  if (redirectUrl && !isLocalhost) parts.push(`redirect-url=${encodeURIComponent(redirectUrl)}`);

  const url = `https://checkout.wompi.co/p/?${parts.join("&")}`;
  console.log(`🟣 Wompi URL (${merchant}):`, url);
  return url;
}

/**
 * Consulta el estado de una transacción Wompi (API pública, sin auth).
 * Retorna "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | null.
 * El endpoint público sirve para transacciones de cualquiera de los 2 comercios,
 * así que no hace falta pasar `merchant` aquí.
 */
export async function wompiTransactionStatus(transactionId) {
  try {
    const res = await fetch(`https://production.wompi.co/v1/transactions/${transactionId}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.status || null;
  } catch {
    return null;
  }
}
