// ── Helper para exportar audiencias en formato Meta Custom Audiences / Google Customer Match ──
// Meta espera CSV con headers: email, phone, fn, ln, dob, ct, st, country, zip
//   → todos SHA256 excepto los headers. Meta también acepta el CSV en crudo
//   (Ads Manager hashea al subir) — usaremos crudo para facilitar upload manual.
// Google Customer Match: mismo formato base — Email, Phone, Country Code, Zip.

import { supabase } from "./supabase.js";

// Normaliza teléfono a E.164 (Colombia por default). Meta acepta con o sin +.
export function normalizeTelE164(raw) {
  if (!raw) return "";
  let t = String(raw).replace(/[^0-9+]/g, "");
  if (t.startsWith("00")) t = "+" + t.slice(2);
  if (!t.startsWith("+")) {
    // Si es de 10 dígitos y empieza con 3 → celular Colombia
    if (t.length === 10 && t.startsWith("3")) t = "+57" + t;
    else if (t.length === 12 && t.startsWith("57")) t = "+" + t;
    else t = "+" + t;
  }
  return t;
}

export function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

// Parte nombre completo → { fn: primer nombre, ln: apellido(s) }
function splitNombre(full) {
  const parts = String(full || "").trim().toLowerCase().split(/\s+/);
  if (parts.length === 0) return { fn: "", ln: "" };
  if (parts.length === 1) return { fn: parts[0], ln: "" };
  return { fn: parts[0], ln: parts.slice(1).join(" ") };
}

// Descarga un CSV al navegador
function downloadCSV(nombre, rows, headers) {
  const escape = (s) => {
    if (s === null || s === undefined) return "";
    const str = String(s);
    if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  };
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `atolon-${nombre}-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Convierte filas de audiencia BD → filas Meta-compatibles (crudo, sin hashear)
function toMetaRows(clientes) {
  return clientes
    .filter(c => c.email || c.telefono)
    .map(c => {
      const { fn, ln } = splitNombre(c.nombre);
      return {
        email:   normalizeEmail(c.email),
        phone:   normalizeTelE164(c.telefono),
        fn, ln,
        country: "co",
      };
    });
}

// Convierte filas → formato Google Customer Match
function toGoogleRows(clientes) {
  return clientes
    .filter(c => c.email || c.telefono)
    .map(c => {
      const { fn, ln } = splitNombre(c.nombre);
      return {
        Email:         normalizeEmail(c.email),
        Phone:         normalizeTelE164(c.telefono),
        "First Name":  fn,
        "Last Name":   ln,
        "Country":     "CO",
      };
    });
}

// ── Loader por audiencia ─────────────────────────────────────────────────
const VISTAS = {
  vips_digital:         { view: "v_aud_vips_digital",         label: "VIPs Digitales (LTV≥$500k)" },
  recurrentes:          { view: "v_aud_recurrentes_digital",  label: "Recurrentes (2+ visitas)" },
  reservas_sin_pago:    { view: "v_aud_reservas_sin_pago_30d",label: "Reservas iniciadas sin pago 30d" },
  leads_wa_sin_conv:    { view: "v_aud_leads_wa_sin_conv",    label: "Leads WhatsApp sin conversión" },
  extranjeros:          { view: "v_aud_extranjeros",          label: "Turistas Extranjeros" },
};

export async function cargarAudiencia(key) {
  const cfg = VISTAS[key];
  if (!cfg) throw new Error("Audiencia desconocida: " + key);
  const { data, error } = await supabase.from(cfg.view).select("*");
  if (error) throw error;
  return data || [];
}

export async function exportarMeta(key) {
  const clientes = await cargarAudiencia(key);
  const rows = toMetaRows(clientes);
  if (rows.length === 0) return alert("Sin datos exportables (esta audiencia no tiene emails ni teléfonos).");
  downloadCSV(`meta-${key}`, rows, ["email", "phone", "fn", "ln", "country"]);
}

export async function exportarGoogle(key) {
  const clientes = await cargarAudiencia(key);
  const rows = toGoogleRows(clientes);
  if (rows.length === 0) return alert("Sin datos exportables.");
  downloadCSV(`google-${key}`, rows, ["Email", "Phone", "First Name", "Last Name", "Country"]);
}

export const AUDIENCIAS = VISTAS;
