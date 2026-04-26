// motorPDF.js — Generación PDF de Orden de Trabajo de motor
// Usa jsPDF (ya instalado). Layout corporativo Atolón con header,
// datos del motor, checklist, repuestos, costos y firmas.

import { jsPDF } from "jspdf";

const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

// Carga una imagen y la convierte a base64 (para insertarla en el PDF)
async function urlToBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function generarPDFOT({ ot, motor, lancha }) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14; // margen
  let y = M;

  // ── Header ─────────────────────────────────────────────────────────────
  doc.setFillColor(13, 27, 62); // navy
  doc.rect(0, 0, pageW, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ATOLÓN", M, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Beach Club & Hotel · Cartagena", M, 20);
  doc.setFontSize(8);
  doc.text("Orden de Trabajo · Mantenimiento de Motor", M, 25);
  // Número de OT a la derecha
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(ot.numero || ot.id, pageW - M, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text((ot.estado || "").toUpperCase(), pageW - M, 20, { align: "right" });
  doc.text(ot.fecha_apertura || "", pageW - M, 25, { align: "right" });

  y = 36;
  doc.setTextColor(0, 0, 0);

  // ── Datos del motor ────────────────────────────────────────────────────
  doc.setFillColor(245, 245, 250);
  doc.rect(M, y, pageW - 2 * M, 32, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("MOTOR", M + 3, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const datos = [
    ["Embarcación", lancha?.nombre || ot.lancha_id || "—"],
    ["Motor", `${motor?.codigo || ot.motor_id} · ${motor?.marca || "—"} ${motor?.modelo || ""}`],
    ["Serie", motor?.numero_serie || "—"],
    ["Tipo de mantenimiento", String(ot.tipo || "").toUpperCase()],
    ["Horas motor (apertura)", `${ot.horas_motor_apertura || 0} h`],
    ["Horas motor (cierre)", ot.horas_motor_cierre != null ? `${ot.horas_motor_cierre} h` : "—"],
  ];
  let dy = y + 11;
  datos.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + 3 + col * ((pageW - 2 * M) / 2);
    const yLine = dy + row * 6;
    doc.setFont("helvetica", "bold");
    doc.text(k + ":", x, yLine);
    doc.setFont("helvetica", "normal");
    doc.text(String(v), x + 38, yLine);
  });
  y += 36;

  // ── Responsables ───────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("RESPONSABLES", M, y + 4);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Supervisor: ${ot.responsable || "—"}`, M, y);
  doc.text(`Técnico: ${ot.tecnico_nombre || "—"}`, M + 90, y);
  y += 8;

  // ── Checklist ──────────────────────────────────────────────────────────
  if (ot.checklist && Object.keys(ot.checklist).length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("CHECKLIST TÉCNICO", M, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    Object.entries(ot.checklist).forEach(([item, val]) => {
      if (item.startsWith("_")) return;
      const ok = (val && typeof val === "object") ? val.ok : !!val;
      const nota = (val && typeof val === "object") ? val.nota : "";
      const linea = `${ok ? "[X]" : "[ ]"} ${item}${nota ? "  · " + nota : ""}`;
      const lineas = doc.splitTextToSize(linea, pageW - 2 * M - 5);
      lineas.forEach(l => {
        if (y > pageH - 30) { doc.addPage(); y = M; }
        doc.text(l, M + 3, y);
        y += 4.5;
      });
    });
    y += 4;
  }

  // ── Repuestos ──────────────────────────────────────────────────────────
  const reps = Array.isArray(ot.repuestos) ? ot.repuestos : [];
  if (reps.length > 0) {
    if (y > pageH - 60) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("REPUESTOS Y CONSUMIBLES", M, y);
    y += 6;
    doc.setFontSize(8);
    // Cabeceras
    doc.setFillColor(220, 220, 230);
    doc.rect(M, y - 4, pageW - 2 * M, 6, "F");
    doc.text("Producto", M + 2, y);
    doc.text("Cant", M + 80, y);
    doc.text("$ Unit", M + 100, y);
    doc.text("Subtotal", M + 130, y);
    doc.text("Proveedor", M + 160, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    let totalRep = 0;
    reps.forEach(r => {
      if (y > pageH - 30) { doc.addPage(); y = M; }
      const sub = (Number(r.cantidad) || 0) * (Number(r.costo_unit) || 0);
      totalRep += sub;
      doc.text(String(r.nombre || "—").slice(0, 35), M + 2, y);
      doc.text(String(r.cantidad || 0), M + 80, y);
      doc.text(COP(r.costo_unit), M + 100, y);
      doc.text(COP(sub), M + 130, y);
      doc.text(String(r.proveedor || "—").slice(0, 18), M + 160, y);
      y += 4.5;
    });
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Total repuestos:", M + 100, y);
    doc.text(COP(totalRep), M + 130, y);
    y += 6;
  }

  // ── Costos ──────────────────────────────────────────────────────────────
  if (y > pageH - 50) { doc.addPage(); y = M; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("COSTOS", M, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Repuestos: ${COP(ot.costo_repuestos)}`, M, y); y += 5;
  doc.text(`Mano de obra: ${COP(ot.costo_mano_obra)}`, M, y); y += 5;
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL: ${COP(ot.costo_total)}`, M, y);
  y += 7;

  if (ot.factura_numero) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Factura: ${ot.factura_numero} · ${ot.factura_proveedor || ""}`, M, y);
    y += 6;
  }

  // ── Observaciones ───────────────────────────────────────────────────────
  if (ot.observaciones) {
    if (y > pageH - 30) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "bold");
    doc.text("OBSERVACIONES", M, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lineas = doc.splitTextToSize(ot.observaciones, pageW - 2 * M);
    lineas.forEach(l => {
      if (y > pageH - 30) { doc.addPage(); y = M; }
      doc.text(l, M, y);
      y += 4.5;
    });
    y += 4;
  }

  // ── Firmas (en página nueva si no hay espacio) ──────────────────────────
  if (y > pageH - 60) { doc.addPage(); y = M; }
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("FIRMAS", M, y);
  y += 6;

  const firmas = [
    { url: ot.firma_tecnico_url, label: "Técnico", name: ot.tecnico_nombre },
    { url: ot.firma_supervisor_url, label: "Supervisor", name: ot.responsable },
  ];

  let fx = M;
  for (const fm of firmas) {
    const b64 = fm.url ? await urlToBase64(fm.url) : null;
    const w = (pageW - 2 * M - 10) / 2;
    if (b64) {
      try { doc.addImage(b64, "PNG", fx, y, w, 25); } catch (_) { /* skip si no puede */ }
    } else {
      doc.setDrawColor(180, 180, 200);
      doc.rect(fx, y, w, 25);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.line(fx, y + 28, fx + w, y + 28);
    doc.text(`${fm.label}: ${fm.name || ""}`, fx, y + 32);
    fx += w + 10;
  }
  y += 36;

  // ── Footer ──────────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generado: ${new Date().toLocaleString("es-CO")}`, M, pageH - 8);
  doc.text(`Atolón Beach Club & Hotel · Cartagena`, pageW - M, pageH - 8, { align: "right" });

  // Descargar
  doc.save(`OT-${ot.numero || ot.id}.pdf`);
}
