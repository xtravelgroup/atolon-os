// Expediente de respuesta a contracargo (chargeback) para enviar al banco.
// Un solo PDF con 3 secciones:
//   1) Compra + autorización del cliente + IP (reserva + Wompi + consentimiento habeas data)
//   2) Confirmación de reserva con datos/pasaportes de las personas (reservas.pasajeros)
//   3) Zarpe del día — manifiesto de embarque (zarpes_log)
// jsPDF se importa LAZY (igual que generarOCPDF) para no inflar el bundle.
import { supabase } from "./supabase";

const EMPRESA = "ATOLÓN";
const fmtCOP = (n) => "$" + (Number(n) || 0).toLocaleString("es-CO");
const fmtDT = (v) => {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }); }
  catch { return String(v); }
};
const fmtD = (v) => (v ? String(v).slice(0, 10) : "—");

// ── Carga de todos los insumos ────────────────────────────────────────────
async function cargarDatos(reservaId) {
  const { data: r } = await supabase.from("reservas").select("*").eq("id", reservaId).single();
  if (!r) throw new Error("Reserva no encontrada: " + reservaId);

  // Transacción Wompi: por referencia_pago o por el id de la reserva; se toma la más reciente aprobada.
  const refs = [r.referencia_pago, r.id].filter(Boolean);
  // Referencias adicionales guardadas en pagos[] (id / reference_id de la pasarela).
  if (Array.isArray(r.pagos)) r.pagos.forEach((p) => { [p.id, p.reference_id, p.reference, p.transaction_id].forEach((x) => x && refs.push(String(x))); });
  let wompi = null;
  if (refs.length) {
    const { data: ws } = await supabase.from("wompi_eventos_log").select("*").or(`referencia.in.(${refs.join(",")}),transaction_id.in.(${refs.join(",")})`).order("created_at", { ascending: false });
    wompi = (ws || []).find((w) => w.status === "APPROVED") || (ws || [])[0] || null;
  }
  // Respaldo SEGURO: por email del titular en la transacción (mismo cliente).
  if (!wompi) {
    const em = (r.email || r.contacto || "").toLowerCase();
    if (em) {
      const { data: byEmail } = await supabase.from("wompi_eventos_log").select("*").eq("raw->data->transaction->>customer_email", em).order("created_at", { ascending: false });
      wompi = (byEmail || []).find((w) => w.status === "APPROVED") || (byEmail || [])[0] || null;
    }
  }

  // Consentimiento (habeas data) con IP: por email del titular; el más reciente.
  let consent = null;
  const email = (r.email || r.contacto || "").toLowerCase();
  if (email) {
    const { data: cs } = await supabase.from("habeas_data_consents").select("*").eq("titular_email", email).order("otorgado_at", { ascending: false }).limit(1);
    consent = (cs || [])[0] || null;
  }

  // Zarpe del día: por fecha + salida.
  let zarpe = null;
  if (r.fecha && r.salida_id) {
    const { data: zs } = await supabase.from("zarpes_log").select("*").eq("fecha", r.fecha).eq("salida_id", r.salida_id).order("created_at", { ascending: false }).limit(1);
    zarpe = (zs || [])[0] || null;
  }

  // Política/términos que aceptó (por versión del consentimiento, o la vigente más reciente).
  let policy = null;
  {
    let pq = supabase.from("habeas_data_policy").select("*");
    if (consent?.version_politica) pq = pq.eq("version", consent.version_politica);
    const { data: ps } = await pq.order("vigente_desde", { ascending: false }).limit(1);
    policy = (ps || [])[0] || null;
    if (!policy) { const { data: p2 } = await supabase.from("habeas_data_policy").select("*").order("vigente_desde", { ascending: false }).limit(1); policy = (p2 || [])[0] || null; }
  }
  return { r, wompi, consent, zarpe, policy };
}

// Descarga una imagen (comprobante) y la devuelve como dataURL para incrustarla; null si no es imagen o falla.
async function fetchImageDataURL(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    if (!blob.type || !blob.type.startsWith("image/")) return null;
    return await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => resolve(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}

// ── Construcción del PDF ───────────────────────────────────────────────────
export async function generarChargebackPDF(reservaId) {
  const { r, wompi, consent, zarpe, policy } = await cargarDatos(reservaId);
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 16;
  let y = M;

  const NAVY = [23, 43, 77], SAND = [193, 154, 107], GREY = [90, 90, 90], LINE = [210, 210, 210];
  const ensure = (h) => { if (y + h > 285) { doc.addPage(); y = M; } };
  const sectionTitle = (n, t) => {
    ensure(14);
    doc.setFillColor(...NAVY); doc.rect(M, y, W - 2 * M, 9, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`${n}.  ${t}`, M + 3, y + 6.2);
    y += 13; doc.setTextColor(30, 30, 30);
  };
  const kv = (k, v) => {
    ensure(6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...GREY);
    doc.text(k, M, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(20, 20, 20);
    const lines = doc.splitTextToSize(String(v ?? "—"), W - 2 * M - 55);
    doc.text(lines, M + 55, y);
    y += Math.max(6, lines.length * 5);
  };
  const note = (t) => { ensure(6); doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(...GREY); doc.text(doc.splitTextToSize(t, W - 2 * M), M, y); y += 6; doc.setTextColor(20, 20, 20); };
  const paxTable = (arr, cols) => {
    ensure(10);
    const colW = (W - 2 * M) / cols.length;
    doc.setFillColor(...SAND); doc.rect(M, y, W - 2 * M, 7, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    cols.forEach((c, i) => doc.text(c.h, M + 2 + i * colW, y + 5));
    y += 7; doc.setTextColor(20, 20, 20); doc.setFont("helvetica", "normal");
    (arr || []).forEach((row, ri) => {
      ensure(7);
      if (ri % 2) { doc.setFillColor(245, 245, 245); doc.rect(M, y, W - 2 * M, 6.5, "F"); }
      cols.forEach((c, i) => { const t = doc.splitTextToSize(String(c.get(row) ?? "—"), colW - 3); doc.text(t[0] || "—", M + 2 + i * colW, y + 4.6); });
      y += 6.5;
    });
    doc.setDrawColor(...LINE); doc.line(M, y, W - M, y); y += 4;
  };

  // ── Portada / encabezado ──
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...NAVY);
  doc.text(EMPRESA, M, y); y += 7;
  doc.setFontSize(13); doc.setTextColor(30, 30, 30);
  doc.text("Expediente de respuesta a contracargo (chargeback)", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GREY);
  doc.text(`Generado: ${fmtDT(new Date().toISOString())}`, M, y); y += 5;
  doc.setDrawColor(...SAND); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 8; doc.setLineWidth(0.2);

  kv("Reserva", r.id);
  kv("Cliente", r.nombre || "—");
  kv("Email", r.email || r.contacto || "—");
  kv("Teléfono", r.telefono || "—");
  kv("Fecha del servicio", fmtD(r.fecha));
  kv("Monto de la compra", fmtCOP(r.total));
  kv("Pagado / Abono", fmtCOP(r.abono));
  y += 4;

  // ── 1) Compra + autorización + IP ──
  sectionTitle(1, "COMPRA, AUTORIZACIÓN DEL CLIENTE E IP");
  kv("Canal de compra", r.canal || "—");
  kv("Forma de pago", r.forma_pago || "—");
  kv("Referencia de pago", r.referencia_pago || "—");
  kv("Fecha de la compra", fmtDT(r.created_at));
  if (wompi) {
    const tx = wompi.raw?.data?.transaction || {};
    kv("Transacción (Wompi) ID", wompi.transaction_id || tx.id || "—");
    kv("Estado transacción", wompi.status || tx.status || "—");
    kv("Método de pago", tx.payment_method_type || "—");
    kv("Monto transacción", tx.amount_in_cents != null ? fmtCOP(tx.amount_in_cents / 100) : fmtCOP(wompi.monto));
    kv("Email en el pago", tx.customer_email || "—");
    kv("Fecha aprobación", fmtDT(tx.finalized_at || wompi.created_at));
  } else {
    note("No se encontró una transacción de pasarela (Wompi) enlazada por la referencia de esta reserva.");
  }
  if (consent) {
    kv("Consentimiento (Habeas Data)", `Otorgado ${fmtDT(consent.otorgado_at)}`);
    kv("IP de origen del cliente", consent.ip_origen || "—");
    kv("Dispositivo (User-Agent)", consent.user_agent || "—");
    kv("Canal de captura", consent.canal_captura || "—");
    kv("Versión de política", consent.version_politica || "—");
  } else {
    note("No se encontró registro de consentimiento/IP asociado al email del cliente.");
  }
  // Comprobante de pago (si existe).
  if (r.comprobante_url) {
    kv("Comprobante de pago", r.comprobante_url);
    const img = await fetchImageDataURL(r.comprobante_url);
    if (img) {
      try {
        const props = doc.getImageProperties(img);
        const w = 85, h = Math.min(120, (props.height / props.width) * w);
        ensure(h + 4); doc.addImage(img, M, y, w, h); y += h + 4;
      } catch { /* si no se puede incrustar, queda la URL */ }
    }
  }
  y += 3;

  // ── 2) Confirmación con pasaportes / datos de personas ──
  sectionTitle(2, "CONFIRMACIÓN DE RESERVA — DATOS DE LAS PERSONAS");
  kv("Nombre de la reserva", r.nombre || "—");
  kv("Tipo / plan", r.tipo || "—");
  kv("Pax (adultos / niños)", `${r.pax || 0}  (${r.pax_a || 0} / ${r.pax_n || 0})`);
  kv("Embarcación", r.nombre_embarcacion || r.embarcacion_asignada || "—");
  y += 1;
  const pax = Array.isArray(r.pasajeros) ? r.pasajeros : [];
  if (pax.length) {
    paxTable(pax, [
      { h: "Nombre", get: (p) => p.nombre },
      { h: "Documento / Pasaporte", get: (p) => p.identificacion },
      { h: "Nacionalidad", get: (p) => p.nacionalidad || "—" },
      { h: "Tipo", get: (p) => (p.tipo === "adult" ? "Adulto" : p.tipo === "child" ? "Niño" : p.tipo || "—") },
    ]);
  } else {
    note("Esta reserva no tiene la lista de pasajeros (documentos/pasaportes) registrada.");
  }
  y += 3;

  // ── 3) Zarpe del día ──
  sectionTitle(3, "ZARPE DEL DÍA — MANIFIESTO DE EMBARQUE");
  if (zarpe) {
    kv("Código de zarpe", zarpe.zarpe_codigo || "—");
    kv("Salida", `${zarpe.salida_nombre || "—"}${zarpe.salida_hora ? " · " + zarpe.salida_hora : ""}`);
    kv("Embarcación", zarpe.embarcacion_nombre || "—");
    kv("Fecha", fmtD(zarpe.fecha));
    kv("Total pax", String(zarpe.pax_total ?? "—"));
    kv("Generado por", zarpe.generado_por_nombre || zarpe.generado_por_email || "—");
    y += 1;
    const zp = Array.isArray(zarpe.pasajeros) ? zarpe.pasajeros : [];
    if (zp.length) {
      paxTable(zp, [
        { h: "Nombre", get: (p) => p.nombre || p.name },
        { h: "Documento", get: (p) => p.identificacion || p.documento || p.doc || "—" },
        { h: "Nacionalidad", get: (p) => p.nacionalidad || "—" },
        { h: "Reserva", get: (p) => p.reserva_id || p.reserva || "—" },
      ]);
    } else {
      note("El zarpe del día no tiene lista de pasajeros registrada.");
    }
  } else {
    note("No se encontró un zarpe generado para la fecha y salida de esta reserva.");
  }
  y += 3;

  // ── 4) Términos, política de cancelación y tratamiento de datos ──
  sectionTitle(4, "TÉRMINOS, POLÍTICA DE CANCELACIÓN Y TRATAMIENTO DE DATOS ACEPTADOS");
  note('Declaración aceptada por el cliente al momento de la compra: "Al continuar, acepto los términos y condiciones. Pago seguro · Aplica política de cancelación / política de no reembolso."');
  if (consent) {
    kv("Aceptado el", fmtDT(consent.otorgado_at));
    kv("Desde IP", consent.ip_origen || "—");
    kv("Dispositivo", consent.user_agent || "—");
  } else {
    note("No hay registro del momento/IP de aceptación para este cliente.");
  }
  if (policy) {
    kv("Versión de la política", policy.version || "—");
    kv("Encargado del tratamiento", policy.encargado_tratamiento || "—");
    kv("Contacto encargado", [policy.encargado_email, policy.encargado_telefono].filter(Boolean).join(" · ") || "—");
    kv("Registro RNBD", policy.registro_rnbd_numero || "—");
    if (policy.texto_politica) {
      y += 1; note("Extracto de la política vigente aceptada:");
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
      doc.splitTextToSize(String(policy.texto_politica).slice(0, 2000), W - 2 * M).forEach((line) => { ensure(4); doc.text(line, M, y); y += 4; });
      doc.setTextColor(20, 20, 20);
    }
  } else {
    note("No se encontró el texto de la política registrada en el sistema.");
  }

  // ── Pie de página con numeración ──
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GREY);
    doc.text(`${EMPRESA} · Expediente de chargeback · Reserva ${r.id}`, M, 292);
    doc.text(`Página ${i} de ${pages}`, W - M, 292, { align: "right" });
  }

  doc.save(`Expediente-Chargeback-${r.id}.pdf`);
}
