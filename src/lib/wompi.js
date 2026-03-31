// ═══════════════════════════════════════════════
// WOMPI — Configuración y helpers
// ═══════════════════════════════════════════════

export const WOMPI_PUB_KEY = "pub_prod_j2kColsiNhfHj27SWbi62nQpUTNFPZc1";
export const WOMPI_INTEGRITY_KEY = import.meta.env.VITE_WOMPI_INTEGRITY_KEY || "";

// Computa SHA256 usando la Web Crypto API (nativa del browser)
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Genera la URL del checkout hospedado de Wompi.
 * Los parámetros con ":" (signature:integrity, customer-data:email)
 * deben ir literales — NO codificados como %3A.
 */
export async function wompiCheckoutUrl({ referencia, totalCOP, email = "", redirectUrl = "" }) {
  const amountCentavos = Math.round(totalCOP * 100).toString();
  const currency = "COP";

  // Firma de integridad: SHA256(referencia + amountCentavos + currency + integrity_key)
  let signature = "";
  if (WOMPI_INTEGRITY_KEY) {
    const raw = `${referencia}${amountCentavos}${currency}${WOMPI_INTEGRITY_KEY}`;
    signature = await sha256(raw);
  }

  const parts = [
    `public-key=${WOMPI_PUB_KEY}`,
    `currency=${currency}`,
    `amount-in-cents=${amountCentavos}`,
    `reference=${referencia}`,
  ];

  if (signature)   parts.push(`signature:integrity=${signature}`);
  if (email)       parts.push(`customer-data:email=${encodeURIComponent(email)}`);
  // Wompi production blocks localhost redirects — only include in real domains
  const isLocalhost = redirectUrl.includes("localhost") || redirectUrl.includes("127.0.0.1");
  if (redirectUrl && !isLocalhost) parts.push(`redirect-url=${encodeURIComponent(redirectUrl)}`);

  const url = `https://checkout.wompi.co/p/?${parts.join("&")}`;
  console.log("🟣 Wompi URL:", url);
  return url;
}

/**
 * Consulta el estado de una transacción Wompi (API pública, sin auth).
 * Retorna "APPROVED" | "DECLINED" | "VOIDED" | "ERROR" | null
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
