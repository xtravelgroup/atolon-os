// Normalizador de teléfonos a formato E.164 (+CC XXXXXXXXXX).
// Requerido para que Meta WhatsApp Cloud API entregue mensajes:
// sin +CC el mensaje se acepta pero no entrega.
//
// Reglas:
//   - Si viene con "+" al inicio y luego 8-15 dígitos → válido, se limpia.
//   - Si viene sin "+" y son 10 dígitos que empiezan con 3 → Colombia (auto +57).
//   - Si viene sin "+" y son 7 dígitos → fijo Bogotá (auto +571).
//   - Cualquier otro caso → invalid.
//
// display() devuelve "+CC ### ### ####" para UI amigable.

// Códigos de país conocidos que aceptamos como prefijos válidos.
// (No exhaustivo — la mayor parte del tráfico es CO/US/MX/AR/CL/PE/EC/VE.)
const COUNTRY_CODES = [
  "1", "7",
  "20", "27", "30", "31", "32", "33", "34", "36", "39",
  "40", "41", "43", "44", "45", "46", "47", "48", "49",
  "51", "52", "53", "54", "55", "56", "57", "58",
  "60", "61", "62", "63", "64", "65", "66",
  "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98",
  "212", "213", "216", "218", "220", "221", "222", "223", "224",
  "225", "226", "227", "228", "229", "230", "231", "232", "233",
  "234", "235", "236", "237", "238", "239",
  "240", "241", "242", "243", "244", "245", "246", "247", "248",
  "249", "250", "251", "252", "253", "254", "255", "256", "257",
  "258", "260", "261", "262", "263", "264", "265", "266", "267",
  "268", "269",
  "290", "291", "297", "298", "299",
  "350", "351", "352", "353", "354", "355", "356", "357", "358",
  "359", "370", "371", "372", "373", "374", "375", "376", "377",
  "378", "379", "380", "381", "382", "383", "385", "386", "387",
  "389",
  "420", "421", "423",
  "500", "501", "502", "503", "504", "505", "506", "507", "508",
  "509",
  "590", "591", "592", "593", "594", "595", "596", "597", "598",
  "599",
  "670", "672", "673", "674", "675", "676", "677", "678", "679",
  "680", "681", "682", "683", "685", "686", "687", "688", "689",
  "690", "691", "692",
  "800", "808", "850", "852", "853", "855", "856", "870", "878",
  "880", "881", "882", "883", "886", "888",
  "960", "961", "962", "963", "964", "965", "966", "967", "968",
  "970", "971", "972", "973", "974", "975", "976", "977", "979",
  "992", "993", "994", "995", "996", "998",
];

// Sort desc por longitud para matchear "593" antes de "59"/"5".
const CC_SORTED = [...COUNTRY_CODES].sort((a, b) => b.length - a.length);

function extractCountryCode(digits) {
  for (const cc of CC_SORTED) {
    if (digits.startsWith(cc)) return cc;
  }
  return null;
}

// Entrada libre → { e164, display, valid, countryCode, national }
export function normalizarTelefono(input) {
  if (!input) return { e164: "", display: "", valid: false, countryCode: null, national: "" };

  const raw = String(input).trim();
  const hadPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");

  if (!digits) return { e164: "", display: "", valid: false, countryCode: null, national: "" };

  // Caso 1 — venía con "+": es E.164 completo, solo hay que separar CC.
  if (hadPlus) {
    if (digits.length < 8 || digits.length > 15) {
      return { e164: "+" + digits, display: "+" + digits, valid: false, countryCode: null, national: digits };
    }
    const cc = extractCountryCode(digits);
    if (!cc) {
      return { e164: "+" + digits, display: "+" + digits, valid: false, countryCode: null, national: digits };
    }
    const nat = digits.slice(cc.length);
    return {
      e164: "+" + digits,
      display: `+${cc} ${formatNational(nat)}`,
      valid: nat.length >= 6 && nat.length <= 13,
      countryCode: cc,
      national: nat,
    };
  }

  // Caso 2 — 10 dígitos que empiezan con 3 → móvil Colombia.
  if (digits.length === 10 && digits.startsWith("3")) {
    return {
      e164: "+57" + digits,
      display: `+57 ${formatNational(digits)}`,
      valid: true,
      countryCode: "57",
      national: digits,
    };
  }

  // Caso 3 — 12 dígitos que empiezan con 57 → móvil Colombia sin +.
  if (digits.length === 12 && digits.startsWith("57")) {
    const nat = digits.slice(2);
    return {
      e164: "+" + digits,
      display: `+57 ${formatNational(nat)}`,
      valid: nat.length === 10,
      countryCode: "57",
      national: nat,
    };
  }

  // Caso 4 — 7 dígitos → fijo Bogotá (raro pero legado).
  if (digits.length === 7) {
    return {
      e164: "+571" + digits,
      display: `+57 1 ${formatNational(digits)}`,
      valid: true,
      countryCode: "57",
      national: "1" + digits,
    };
  }

  // Cualquier otro caso sin + → intentamos detectar cc pero marcamos como
  // potencialmente inválido para que la UI muestre warning.
  const cc = extractCountryCode(digits);
  if (cc) {
    const nat = digits.slice(cc.length);
    return {
      e164: "+" + digits,
      display: `+${cc} ${formatNational(nat)}`,
      valid: nat.length >= 6 && nat.length <= 13,
      countryCode: cc,
      national: nat,
    };
  }

  return { e164: digits, display: digits, valid: false, countryCode: null, national: digits };
}

function formatNational(digits) {
  const s = String(digits || "");
  if (s.length <= 4) return s;
  if (s.length <= 7) return `${s.slice(0, 3)} ${s.slice(3)}`;
  if (s.length <= 10) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`;
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 10)} ${s.slice(10)}`;
}

// Atajos para la mayoría de call sites.
export const telE164   = (v) => normalizarTelefono(v).e164;
export const telValido = (v) => normalizarTelefono(v).valid;
export const telDisplay = (v) => normalizarTelefono(v).display;
