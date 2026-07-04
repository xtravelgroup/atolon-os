// Generador de PDF de OC para enviar al proveedor.
// IMPORTANTE: el PDF NO incluye precios — solo cantidades. Va como solicitud
// de cotización al proveedor; él responde con sus precios y se aprueba en
// el flujo de cotización-respuesta.
//
// Usado por:
//  * EmailOCModal (envía por Resend)
//  * botón "Descargar PDF" en Compras (para enviar por WhatsApp u otro medio)
//
// jsPDF es ~400KB (130KB gzip) — se importa LAZY para no inflar el bundle.

export async function generarOCPDF(oc) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const m = 14;
  let y = 20;

  // Header
  doc.setFontSize(10).setTextColor(150);
  doc.text("INTEROP COLOMBIA SAS", m, y);
  y += 6;
  doc.setFontSize(18).setTextColor(0);
  doc.text(`Orden de Compra ${oc.codigo}`, m, y);
  y += 8;
  doc.setFontSize(9).setTextColor(100);
  doc.text(`Fecha emisión: ${oc.fecha_emision || "—"}`, m, y);
  y += 10;

  // Proveedor
  doc.setFontSize(10).setTextColor(80);
  doc.text("PROVEEDOR", m, y); y += 5;
  doc.setFontSize(11).setTextColor(0);
  doc.text(oc.proveedor_nombre || "—", m, y); y += 5;
  if (oc.proveedor_nit) { doc.setFontSize(9).setTextColor(80); doc.text(`NIT: ${oc.proveedor_nit}`, m, y); y += 4; }
  if (oc.proveedor_email) { doc.text(oc.proveedor_email, m, y); y += 4; }
  y += 6;

  // Items table header — SOLO cantidades (sin precios).
  doc.setFillColor(13, 27, 62);
  doc.rect(m, y, 182, 7, "F");
  doc.setTextColor(255).setFontSize(9);
  doc.text("#", m + 2, y + 5);
  doc.text("Ítem", m + 10, y + 5);
  doc.text("Cantidad", m + 145, y + 5, { align: "right" });
  doc.text("Unidad", m + 178, y + 5, { align: "right" });
  y += 9;

  doc.setTextColor(0).setFontSize(9);
  (oc.items || []).forEach((it, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(String(i + 1), m + 2, y);
    doc.text(String(it.item || it.nombre || "—").slice(0, 80), m + 10, y);
    doc.text(String(it.cant || 0), m + 145, y, { align: "right" });
    doc.text(String(it.unidad || ""), m + 178, y, { align: "right" });
    y += 5;
  });
  y += 8;

  // Solicitud de cotización (en lugar de total)
  doc.setFontSize(10).setTextColor(13, 27, 62).setFont(undefined, "bold");
  doc.text("Por favor confirme disponibilidad y envíe cotización con sus precios.", m, y);
  doc.setFont(undefined, "normal");
  y += 12;

  // Notas
  if (oc.notas) {
    doc.setFontSize(9).setTextColor(100);
    doc.text("Notas:", m, y); y += 5;
    doc.setTextColor(0);
    doc.text(doc.splitTextToSize(oc.notas, 180), m, y);
    y += 12;
  }

  // Footer
  doc.setFontSize(8).setTextColor(120);
  doc.text("Entrega: Bodeguita (Cartagena). Coordinar con muelle antes de despachar.", m, 285);
  doc.text("Interop Colombia SAS · Cartagena, Colombia", m, 290);

  return doc;
}

export async function descargarOCPDF(oc) {
  const doc = await generarOCPDF(oc);
  const safe = (oc.codigo || "OC").replace(/[^\w.-]/g, "_");
  doc.save(`${safe}.pdf`);
}

export async function generarOCPDFBase64(oc) {
  const doc = await generarOCPDF(oc);
  return doc.output("datauristring").split(",")[1];
}
