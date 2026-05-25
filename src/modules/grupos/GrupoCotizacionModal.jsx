// GrupoCotizacionModal.jsx — Cotización Ritz-style para grupos
// Reutiliza el lenguaje visual del CotizacionModal de Eventos.jsx
// pero alimentado con pasadias_org, servicios_contratados, extras_data y cotizacion_data.
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { B, COP } from "../../brand";
import { supabase } from "../../lib/supabase";

// Helpers duplicados para aislar este modal
function calcLine(l) {
  const cantidad   = Number(l.cantidad)   || 0;
  const noches     = Number(l.noches)     || 1;
  const valor_unit = Number(l.valor_unit) || 0;
  const iva        = Number(l.iva)        || 0;
  const sub  = cantidad * noches * valor_unit;
  const tax  = sub * (iva / 100);
  return { sub, tax, total: sub + tax };
}

const fmtFechaLarga = (d, lang = "es") => {
  if (!d) return "";
  try {
    const dt = new Date(d + (String(d).length === 10 ? "T12:00:00" : ""));
    const locale = lang === "en" ? "en-US" : "es-CO";
    return dt.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
  } catch { return d; }
};

export default function GrupoCotizacionModal({ evento, pasadiasOrg = [], servicios = [], pasadiasMap = {}, onClose }) {
  // ── Idioma: "es" o "en". Solo afecta el contenido del PDF/impresión.
  // La UI del modal (botones, resumen previo) se queda en español siempre.
  const [lang, setLang] = useState("es");
  const t = (es, en) => lang === "en" ? en : es;
  // Lookup vendedor (nombre + tel + email) para "Esta propuesta es preparada por:"
  const [vendedor, setVendedor] = useState({ nombre: evento?.vendedor || "Atolon Eventos", tel: "", email: "" });
  useEffect(() => {
    const nombre = evento?.vendedor;
    if (!nombre || !supabase) return;
    (async () => {
      let { data } = await supabase.from("usuarios").select("nombre, telefono, email").ilike("nombre", nombre).limit(1);
      if (!data || data.length === 0) {
        ({ data } = await supabase.from("usuarios").select("nombre, telefono, email").or(`email.ilike.%${nombre}%,nombre.ilike.%${nombre}%`).limit(1));
      }
      if (data && data[0]) setVendedor({ nombre: data[0].nombre || nombre, tel: data[0].telefono || "", email: data[0].email || "" });
    })();
  }, [evento?.vendedor]);

  // ── Resolver precios de pasadías ──
  const precioTipo = evento?.precio_tipo || "publico";
  const resolverPrecio = (p) => {
    if (Number(p.precio_manual) > 0) return Number(p.precio_manual);
    const match = pasadiasMap[(p.tipo || "").toLowerCase()];
    if (match) return precioTipo === "neto" ? (match.precio_neto_agencia || 0) : (match.precio || 0);
    return 0;
  };
  const resolverPrecioNino = (p) => {
    const match = pasadiasMap[(p.tipo || "").toLowerCase()];
    if (match) return precioTipo === "neto" ? (match.precio_neto_nino || 0) : (match.precio_nino || 0);
    return 0;
  };

  // ── Pasadías: separar cobrables de cortesías ──
  const pasadiasCobrables = pasadiasOrg.filter(p => !p.cortesia);
  const cortesias         = pasadiasOrg.filter(p => p.cortesia);

  const pasadiasRows = pasadiasCobrables.map(p => {
    const adultos  = Number(p.adultos) || 0;
    const ninos    = Number(p.ninos)   || 0;
    const personas = Number(p.personas) || 0;
    const precioA  = resolverPrecio(p);
    const precioN  = resolverPrecioNino(p);
    let totalAdul, totalNin, subtotal, adultosShown, ninosShown;
    if (adultos > 0 || ninos > 0) {
      adultosShown = adultos;
      ninosShown   = ninos;
      totalAdul    = adultos * precioA;
      totalNin     = ninos   * precioN;
      subtotal     = totalAdul + totalNin;
    } else {
      adultosShown = personas;
      ninosShown   = 0;
      totalAdul    = personas * precioA;
      totalNin     = 0;
      subtotal     = totalAdul;
    }
    const match = pasadiasMap[(p.tipo || "").toLowerCase()] || {};
    // incluye = array si viene array, o string; descripcion como string. Unimos ambos en una lista.
    let descripcion = null;
    if (Array.isArray(match.incluye) && match.incluye.length > 0) {
      descripcion = match.incluye;
      if (match.descripcion) descripcion = [match.descripcion, ...descripcion];
    } else if (match.incluye || match.descripcion) {
      descripcion = [match.descripcion, match.incluye].filter(Boolean).join(" · ");
    }
    return { tipo: p.tipo, adultos: adultosShown, ninos: ninosShown, precioA, precioN, subtotal, descripcion };
  });

  const totalPasadias = pasadiasRows.reduce((s, r) => s + r.subtotal, 0);

  // ── Servicios contratados ──
  const serviciosRows = (servicios || []).filter(s => Number(s.valor) !== 0 || s.descripcion);
  const totalServicios = serviciosRows.reduce((s, x) => s + (Number(x.valor) || 0), 0);

  // ── Extras data ──
  const extras = evento?.extras_data || {};
  const extrasTransporte = extras.transporte || [];
  const extrasAlimentos  = extras.alimentos  || [];
  const extrasServicios  = extras.servicios  || [];
  const sumSec = (rows) => rows.reduce((a, l) => a + calcLine(l).total, 0);
  const totExtrasTrans = sumSec(extrasTransporte);
  const totExtrasAli   = sumSec(extrasAlimentos);
  const totExtrasSer   = sumSec(extrasServicios);
  const totalExtras    = totExtrasTrans + totExtrasAli + totExtrasSer;

  // ── Cotizacion data (otros servicios cotizados) ──
  const cot = evento?.cotizacion_data || {};
  const cotEspacios  = cot.espacios  || [];
  const cotHospedaje = cot.hospedaje || cot.alojamientos || [];
  const cotAlimentos = cot.alimentos || [];
  const cotServicios = cot.servicios || [];
  const totCotEsp  = sumSec(cotEspacios);
  const totCotHos  = sumSec(cotHospedaje);
  const totCotAli  = sumSec(cotAlimentos);
  const totCotSer  = sumSec(cotServicios);
  const totalCotizacion = totCotEsp + totCotHos + totCotAli + totCotSer;

  const grandTotal = totalPasadias + totalServicios + totalExtras + totalCotizacion;

  const header = {
    empresa:   evento?.empresa   || evento?.contacto || "",
    nit:       evento?.nit       || "",
    contacto:  evento?.contacto  || "",
    cargo:     evento?.cargo     || "",
    telefono:  evento?.tel       || "",
    email:     evento?.email     || "",
    direccion: evento?.direccion || "",
    montaje:   evento?.montaje   || "",
    hora_ini:  evento?.hora_ini  || "",
    hora_fin:  evento?.hora_fin  || "",
  };

  const aliadoNombre = evento?.aliado?.nombre || evento?.aliado_nombre || "";

  const notas = evento?.notas || "";
  const totalPaxPasadias = pasadiasOrg.reduce((s, p) => {
    const a = Number(p.adultos) || 0;
    const n = Number(p.ninos)   || 0;
    const per = Number(p.personas) || 0;
    return s + (a + n > 0 ? a + n : per);
  }, 0);

  // Imprime/descarga usando un IFRAME aislado con solo la cotización.
  // Esto elimina conflictos con CSS de la app y garantiza paginación correcta.
  function printViaIframe() {
    const source = document.getElementById("grupo-cotizacion-print");
    if (!source) { alert("Contenido no encontrado"); return; }
    const origin = window.location.origin;
    const nombreArchivo = `Cotizacion_${(evento?.nombre || header.empresa || "grupo").replace(/[^a-zA-Z0-9]/g, "_")}_${evento?.id || ""}`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const CREAM2 = "#FAF6EE";
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${nombreArchivo}</title>
<base href="${origin}/">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Barlow:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 18mm 16mm; }
  html, body { margin: 0; padding: 0; background: ${CREAM2}; color: #0D1B3E; font-family: 'Barlow', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cot-page {
    display: block;
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    break-inside: avoid;
    min-height: 0 !important;
    height: auto !important;
    width: 100%;
    box-sizing: border-box;
  }
  .cot-page:last-child { page-break-after: auto; break-after: auto; }
  .cot-title { font-family: 'Playfair Display', serif; color: #0D1B3E; }
  .cot-story, .cot-italic { font-family: 'Cormorant Garamond', serif; font-style: italic; color: rgba(30,53,102,0.9); }
  .cot-eyebrow { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #C8B99A; font-weight: 600; }
  .cot-hairline { height: 1px; background: #C8B99A; border: 0; }
  table { page-break-inside: avoid; break-inside: avoid; border-collapse: collapse; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  img { max-width: 100%; }
</style>
</head>
<body>
${source.innerHTML}
</body>
</html>`);
    doc.close();

    const triggerPrint = () => {
      try { iframe.contentWindow.focus(); } catch (e) {}
      try { iframe.contentWindow.print(); } catch (e) { console.error("[print]", e); }
      setTimeout(() => { try { document.body.removeChild(iframe); } catch (e) {} }, 2000);
    };
    // Esperar a que fuentes e imágenes carguen
    setTimeout(triggerPrint, 800);
  }

  const imprimir = printViaIframe;

  // "Descargar PDF" usa html2pdf.js con scale alto — genera el PDF y lo baja directamente
  // sin abrir el diálogo del navegador. La calidad es raster pero a 3x queda nítida.
  //
  // Soporta `targetLang` ("es" | "en"): cambia el state lang, espera el re-render
  // del print area, descarga el PDF, y vuelve al español. El nombre del archivo
  // incluye el idioma (Cotizacion_xx_EN.pdf vs Cotizacion_xx.pdf).
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadingEn, setPdfLoadingEn] = useState(false);
  async function descargarPDF(targetLang = "es") {
    const isEn = targetLang === "en";
    if (isEn) setPdfLoadingEn(true); else setPdfLoading(true);
    // Si la descarga es en inglés, cambiar lang y esperar al re-render del print area
    if (isEn && lang !== "en") {
      setLang("en");
      await new Promise(r => setTimeout(r, 300));
    } else if (!isEn && lang !== "es") {
      setLang("es");
      await new Promise(r => setTimeout(r, 300));
    }
    try {
      const source = document.getElementById("grupo-cotizacion-print");
      if (!source) {
        if (isEn) setPdfLoadingEn(false); else setPdfLoading(false);
        return;
      }

      // Estrategia: clonar el HTML a un iframe visible a opacity 0, esperar a que cargue,
      // renderizar con html2canvas página por página, y armar el PDF con jsPDF.
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:0;top:0;width:816px;height:1056px;border:0;opacity:0;pointer-events:none;z-index:-1;";
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument;
      idoc.open();
      idoc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Barlow:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; background: #FAF6EE; color: #0D1B3E; font-family: 'Barlow', sans-serif; -webkit-print-color-adjust: exact; }
  .cot-page { display: block; width: 816px; background: #FAF6EE; box-sizing: border-box; }
  .cot-title { font-family: 'Playfair Display', serif; color: #0D1B3E; }
  .cot-story, .cot-italic { font-family: 'Cormorant Garamond', serif; font-style: italic; color: rgba(30,53,102,0.9); }
  .cot-eyebrow { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: #C8B99A; font-weight: 600; }
  .cot-hairline { height: 1px; background: #C8B99A; border: 0; }
  table { border-collapse: collapse; }
  img { max-width: 100%; }
</style>
</head><body>${source.innerHTML}</body></html>`);
      idoc.close();

      // Esperar a que cargue fonts e imágenes del iframe
      await new Promise(r => {
        if (idoc.readyState === "complete") r();
        else iframe.addEventListener("load", r, { once: true });
      });
      try { await iframe.contentWindow.document.fonts?.ready; } catch {}
      await new Promise(r => setTimeout(r, 1000));

      // Cargar libs
      const [{ default: jsPDF }, html2canvasMod] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const html2canvas = html2canvasMod.default;

      const pdf = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait", compress: true });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const marginMm = 14;
      const usableH = pdfH - marginMm * 2;

      const pages = iframe.contentDocument.querySelectorAll(".cot-page");
      let firstPageEver = true;

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], {
          scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#FAF6EE", logging: false,
          windowWidth: 816,
        });
        const imgW = pdfW - marginMm * 2;
        const pxPerMm = canvas.width / imgW;
        const sliceHeightPx = Math.floor(usableH * pxPerMm);
        let yOffsetPx = 0;

        while (yOffsetPx < canvas.height) {
          const thisSliceHpx = Math.min(sliceHeightPx, canvas.height - yOffsetPx);
          const tmp = document.createElement("canvas");
          tmp.width = canvas.width;
          tmp.height = thisSliceHpx;
          const ctx = tmp.getContext("2d");
          ctx.fillStyle = "#FAF6EE";
          ctx.fillRect(0, 0, tmp.width, tmp.height);
          ctx.drawImage(canvas, 0, -yOffsetPx);
          const sliceImg = tmp.toDataURL("image/jpeg", 0.92);
          const sliceHmm = thisSliceHpx / pxPerMm;

          if (!firstPageEver) pdf.addPage();
          firstPageEver = false;
          pdf.addImage(sliceImg, "JPEG", marginMm, marginMm, imgW, sliceHmm);
          yOffsetPx += thisSliceHpx;
        }
      }

      const baseName = (isEn ? "Quotation" : "Cotizacion");
      const suffix = isEn ? "_EN" : "";
      const nombreArchivo = `${baseName}_${(evento?.nombre || header.empresa || "grupo").replace(/[^a-zA-Z0-9]/g, "_")}_${evento?.id || ""}${suffix}.pdf`;
      pdf.save(nombreArchivo);
      document.body.removeChild(iframe);
    } catch (err) {
      console.error("[pdf] error:", err);
      alert("Error generando PDF: " + (err.message || err));
    } finally {
      if (isEn) {
        setPdfLoadingEn(false);
        setLang("es"); // restaurar UI a español
      } else {
        setPdfLoading(false);
      }
    }
  }

  // ── Styling helpers ──
  const SAND = "#C8B99A";
  const NAVY = "#0D1B3E";
  const NAVY2 = "#1E3566";
  const CREAM = "#FAF6EE";
  const CREAM2 = "#FFFDF7";
  const HAIR = "#E5DFD0";

  // Tabla con encabezado sand — opcional: filas con descripcion que se renderizan como sub-fila italic
  // rows puede ser array de arrays (celdas) o array de objetos { cells: [], descripcion?: string }
  function PropuestaTable({ title, headers, rows, subtotal }) {
    if (!rows || rows.length === 0) return null;
    return (
      <div style={{ marginBottom: 20, pageBreakInside: "avoid" }}>
        <div className="cot-eyebrow" style={{ marginBottom: 6, textAlign: "left" }}>{title}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Barlow', sans-serif" }}>
          <thead>
            <tr style={{ background: SAND, color: "#FFFFFF" }}>
              {headers.map((h, i) => (
                <th key={i} style={{ padding: "8px 10px", textAlign: h.align || "left", width: h.width, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10, fontWeight: 600 }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, i) => {
              const cells = Array.isArray(entry) ? entry : entry.cells;
              const desc = Array.isArray(entry) ? null : entry.descripcion;
              const bg = i % 2 === 0 ? CREAM : CREAM2;
              return (
                <React.Fragment key={i}>
                  <tr style={{ background: bg, borderBottom: desc ? "none" : `1px solid ${HAIR}` }}>
                    {cells.map((c, j) => (
                      <td key={j} style={{ padding: "8px 10px", textAlign: headers[j]?.align || "left", color: j === cells.length - 1 ? NAVY : NAVY2, fontWeight: j === cells.length - 1 ? 700 : 400 }}>
                        {c}
                      </td>
                    ))}
                  </tr>
                  {desc && (
                    <tr style={{ background: bg, borderBottom: `1px solid ${HAIR}` }}>
                      <td colSpan={headers.length} style={{ padding: "4px 16px 18px 22px" }}>
                        <div style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: SAND, fontWeight: 700, marginBottom: 8 }}>
                          {t("Incluye", "Includes")}
                        </div>
                        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12, lineHeight: 1.7, color: NAVY }}>
                          {(Array.isArray(desc) ? desc : String(desc).split(/\s*[·•;\n]\s*|\s+\-\s+/).filter(Boolean))
                            .map((item, idx) => (
                              <li key={idx} style={{ padding: "3px 0", display: "flex", gap: 10 }}>
                                <span style={{ color: SAND, fontWeight: 700 }}>✓</span>
                                <span>{item}</span>
                              </li>
                            ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            <tr style={{ background: "#EFE7D3" }}>
              <td colSpan={headers.length - 1} style={{ padding: "9px 10px", textAlign: "right", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: NAVY, fontWeight: 600 }}>
                {t("Subtotal", "Subtotal")} {title.toLowerCase()}
              </td>
              <td style={{ padding: "9px 10px", textAlign: "right", color: NAVY, fontWeight: 700 }}>{COP(subtotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Barlow:wght@300;400;500;600;700&display=swap');

        @page { size: letter; margin: 18mm 16mm; }

        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: ${CREAM} !important; }
          body > *:not(#grupo-cotizacion-print) { display: none !important; }
          #grupo-cotizacion-print { display: block !important; background: ${CREAM} !important; color: ${NAVY} !important; font-family: 'Barlow', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; position: static !important; }
          /* Override agresivo de display:flex inline — sin esto los browsers ignoran page breaks */
          #grupo-cotizacion-print section.cot-page,
          section.cot-page,
          .cot-page {
            display: block !important;
            position: static !important;
            float: none !important;
            overflow: visible !important;
            min-height: 0 !important;
            height: auto !important;
            max-height: none !important;
            break-after: page !important;
            page-break-after: always !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          #grupo-cotizacion-print section.cot-page:last-child,
          .cot-page:last-child { break-after: auto !important; page-break-after: auto !important; }
          .cot-title { font-family: 'Playfair Display', serif; }
          .cot-story, .cot-italic { font-family: 'Cormorant Garamond', serif; font-style: italic; }
          table { page-break-inside: avoid; break-inside: avoid; }
          tr { page-break-inside: avoid; break-inside: avoid; }
        }
        #grupo-cotizacion-print { display: none; }
        #grupo-cotizacion-print .cot-story, #grupo-cotizacion-print .cot-italic { font-family: 'Cormorant Garamond', 'Georgia', serif; font-style: italic; color: rgba(30, 53, 102, 0.9); }
        #grupo-cotizacion-print .cot-title { font-family: 'Playfair Display', serif; color: ${NAVY}; }
        #grupo-cotizacion-print .cot-eyebrow { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: ${SAND}; font-weight: 600; }
        #grupo-cotizacion-print .cot-hairline { height: 1px; background: ${SAND}; border: 0; }

        #grupo-cot-preview .cot-story, #grupo-cot-preview .cot-italic { font-family: 'Cormorant Garamond', 'Georgia', serif; font-style: italic; color: rgba(30, 53, 102, 0.9); }
        #grupo-cot-preview .cot-title { font-family: 'Playfair Display', serif; color: ${NAVY}; }
        #grupo-cot-preview .cot-eyebrow { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: ${SAND}; font-weight: 600; }
      `}</style>

      {/* Printable area — rendered to body via portal so page-break works */}
      {typeof document !== "undefined" && createPortal(
      <div id="grupo-cotizacion-print" style={{ background: CREAM, color: NAVY, fontFamily: "'Barlow', sans-serif" }}>

        {/* PAGE 1 — COVER con logo grande al centro + "preparada por" */}
        <section className="cot-page" style={{ background: CREAM, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: "95vh", padding: "30px 30px", textAlign: "center" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
            <img src="/atolon-logo.png" alt="Atolon Beach Club" style={{ maxWidth: 340, width: "70%", height: "auto", display: "block", margin: "0 auto" }} />

            <div style={{ margin: "48px 0 36px", width: 80, height: 1, background: SAND }} />

            <div className="cot-story" style={{ fontSize: 22, color: NAVY2, maxWidth: 480, lineHeight: 1.4 }}>
              {t(
                "Una historia a orillas del Caribe, escrita para ustedes.",
                "A Caribbean story, written for you."
              )}
            </div>

            <div style={{ margin: "56px 0 0" }}>
              <div className="cot-italic" style={{ fontSize: 14, color: NAVY2 }}>{t("Propuesta para", "Proposal for")}</div>
              <div className="cot-title" style={{ fontSize: 36, fontWeight: 700, color: NAVY, marginTop: 6, lineHeight: 1.15 }}>
                {(evento?.nombre || header.empresa || "—").toUpperCase()}
              </div>
              {evento?.tipo && <div className="cot-title" style={{ fontSize: 18, fontWeight: 400, color: NAVY2, marginTop: 8, letterSpacing: "0.05em" }}>{evento.tipo}</div>}
              {evento?.fecha && <div className="cot-italic" style={{ fontSize: 15, color: NAVY2, marginTop: 14 }}>{fmtFechaLarga(evento.fecha, lang)}</div>}
            </div>
          </div>

          <div>
            <hr className="cot-hairline" style={{ width: 220, margin: "0 auto 20px", border: 0, height: 1, background: SAND }} />
            <div className="cot-italic" style={{ fontSize: 13, color: NAVY2, marginBottom: 8 }}>
              {t("Esta propuesta es preparada por:", "This proposal is prepared by:")}
            </div>
            <div className="cot-title" style={{ fontSize: 17, fontWeight: 700, color: NAVY, letterSpacing: "0.03em" }}>
              {vendedor.nombre}
            </div>
            {(vendedor.tel || vendedor.email) && (
              <div style={{ fontSize: 12, color: NAVY2, marginTop: 4, lineHeight: 1.6 }}>
                {[vendedor.tel, vendedor.email].filter(Boolean).join(" · ")}
              </div>
            )}
            <div style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(30,53,102,0.6)", textTransform: "uppercase", marginTop: 14 }}>
              {t("Cotización", "Quotation")} {evento?.id} &nbsp;·&nbsp; {new Date().toLocaleDateString(lang === "en" ? "en-US" : "es-CO", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
          </div>
        </section>

        {/* PAGE 2 — STORYTELLING */}
        <section className="cot-page" style={{ background: CREAM, padding: "60px 40px 40px", minHeight: "95vh", display: "flex", flexDirection: "column", justifyContent: "center", position: "relative" }}>
          <img src="/atolon-logo.png" alt="Atolon" style={{ height: 32, width: "auto", position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)" }} />
          <div style={{ maxWidth: 520, margin: "40px auto 0", textAlign: "center" }}>
            <div className="cot-title" style={{ fontSize: 38, fontWeight: 700, color: NAVY, lineHeight: 1.1, marginBottom: 10 }}>
              Atolon Beach Club
            </div>
            <div className="cot-italic" style={{ fontSize: 19, color: NAVY2, marginBottom: 28 }}>
              {t("Donde comienza tu historia en el Caribe", "Where your Caribbean story begins")}
            </div>
            <div style={{ width: 60, height: 1, background: SAND, margin: "0 auto 32px" }} />

            <div className="cot-italic" style={{ fontSize: 20, lineHeight: 1.5, color: NAVY2, marginBottom: 28, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
              {lang === "en"
                ? <>They say there are places you don't seek…<br/>they find you.</>
                : <>Dicen que hay lugares que no se buscan…<br/>te encuentran.</>}
            </div>

            <div style={{ fontSize: 13, lineHeight: 1.8, color: NAVY2, textAlign: "left", fontFamily: "'Barlow', sans-serif" }}>
              <p style={{ margin: "0 0 18px" }}>{t(
                "A solo minutos de Cartagena, cruzando un breve trayecto sobre el mar, aparece un rincón donde el tiempo pierde prisa y cada detalle parece pensado para un momento que aún no sucede… pero que ya se siente inolvidable.",
                "Just minutes from Cartagena, across a brief journey over the sea, appears a corner where time loses its hurry and every detail seems crafted for a moment that hasn't happened yet… but already feels unforgettable."
              )}</p>

              <p style={{ margin: "0 0 18px" }}>
                <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 17, color: NAVY }}>{t("Atolon no nació como un destino.", "Atolon wasn't born as a destination.")}</span><br/>
                {t(
                  <>Nació como una idea: crear un espacio donde celebrar la vida de una forma distinta.<br/>Más íntima. Más auténtica. Más tuya.</>,
                  <>It was born as an idea: to create a space where life is celebrated differently.<br/>More intimate. More authentic. More yours.</>
                )}
              </p>

              <p style={{ margin: "0 0 18px" }}>{t(
                <>Aquí, el sonido del mar marca el ritmo de cada encuentro,<br/>la brisa acompaña cada brindis,<br/>y los atardeceres no son un cierre… sino el comienzo de algo más.</>,
                <>Here, the sound of the sea sets the rhythm of every gathering,<br/>the breeze accompanies every toast,<br/>and sunsets are not an ending… but the beginning of something more.</>
              )}</p>

              <p style={{ margin: "0 0 18px" }}>{t(
                <>Cada experiencia en Atolon está diseñada para convertirse en memoria:<br/>desde una celebración frente al mar, hasta un reencuentro que merecía un escenario especial.</>,
                <>Every experience at Atolon is designed to become memory:<br/>from a celebration by the sea, to a reunion that deserved a special setting.</>
              )}</p>

              <p style={{ margin: "0 0 24px", fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 17, color: NAVY, textAlign: "center" }}>
                {t(
                  <>Este no es solo un lugar al que vienes.<br/>Es un lugar que se queda contigo.</>,
                  <>This is not just a place you come to.<br/>It's a place that stays with you.</>
                )}
              </p>
            </div>

            <div style={{ width: 60, height: 1, background: SAND, margin: "28px auto 24px" }} />

            <div className="cot-title" style={{ fontSize: 18, fontWeight: 700, color: NAVY, letterSpacing: "0.05em", marginBottom: 6 }}>
              {t("Bienvenido a Atolon Beach Club.", "Welcome to Atolon Beach Club.")}
            </div>
            <div className="cot-italic" style={{ fontSize: 16, color: NAVY2 }}>
              {t("Ahora, la historia continúa contigo.", "Now, the story continues with you.")}
            </div>
          </div>
        </section>

        {/* PAGE 3 — LA PROPUESTA (con mini fact sheet arriba) */}
        <section className="cot-page" style={{ background: CREAM, padding: "30px 18px", minHeight: "95vh" }}>
          <img src="/atolon-logo.png" alt="Atolon" style={{ height: 32, width: "auto", display: "block", margin: "0 auto 18px" }} />

          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div className="cot-eyebrow" style={{ marginBottom: 10 }}>{t("Lo que hemos preparado", "What we've prepared")}</div>
            <div className="cot-title" style={{ fontSize: 34, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{t("La propuesta", "The proposal")}</div>
            <div className="cot-italic" style={{ fontSize: 15, color: NAVY2 }}>{t("Las piezas que dan forma a la visita de su grupo.", "The elements that shape your group's visit.")}</div>
            <div style={{ width: 60, height: 1, background: SAND, margin: "14px auto 0" }} />
          </div>

          {/* Mini fact sheet compacto */}
          <div style={{ maxWidth: 640, margin: "0 auto 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px 20px", padding: "14px 16px", background: CREAM2, border: `1px solid ${HAIR}` }}>
            {[
              [t("Evento", "Event"), evento?.tipo],
              [t("Fecha", "Date"), evento?.fecha ? fmtFechaLarga(evento.fecha, lang) : ""],
              [t("Invitados", "Guests"), evento?.pax ? `${evento.pax} pax` : (totalPaxPasadias ? `${totalPaxPasadias} pax` : "")],
              [t("Horario", "Schedule"), (header.hora_ini || header.hora_fin) ? `${header.hora_ini || "—"} ${t("a","to")} ${header.hora_fin || "—"}` : ""],
              [t("Empresa", "Company"), header.empresa],
              [t("Contacto", "Contact"), header.contacto],
              [t("Teléfono", "Phone"), header.telefono],
              ["Email", header.email],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 8, letterSpacing: "0.22em", textTransform: "uppercase", color: SAND, fontWeight: 600, marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 11, color: NAVY, fontFamily: "'Barlow', sans-serif", fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
          {/* Pasadías */}
          {pasadiasRows.length > 0 && (
            <PropuestaTable
              title={t("PASADÍAS", "DAY PASSES")}
              headers={[
                { label: t("Tipo", "Type"), width: "30%", align: "left" },
                { label: t("Adultos", "Adults"), width: "10%", align: "center" },
                { label: t("Niños", "Children"), width: "10%", align: "center" },
                { label: t("V. Unit. Adulto", "Adult Unit"), width: "16%", align: "right" },
                { label: t("V. Unit. Niño", "Child Unit"), width: "16%", align: "right" },
                { label: t("Subtotal", "Subtotal"), width: "18%", align: "right" },
              ]}
              rows={pasadiasRows.map(r => ({
                cells: [
                  r.tipo,
                  r.adultos || "—",
                  r.ninos || "—",
                  r.precioA > 0 ? COP(r.precioA) : "—",
                  r.precioN > 0 ? COP(r.precioN) : "—",
                  COP(r.subtotal),
                ],
                descripcion: r.descripcion,
              }))}
              subtotal={totalPasadias}
            />
          )}

          {/* Cortesías (sublista aparte) */}
          {cortesias.length > 0 && (
            <div style={{ marginBottom: 24, padding: "12px 14px", background: CREAM2, border: `1px dashed ${SAND}`, borderRadius: 4 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 6 }}>{t("Cortesías incluidas", "Complimentary included")}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12, color: NAVY2, lineHeight: 1.7, fontFamily: "'Barlow', sans-serif" }}>
                {cortesias.map((c, i) => {
                  const cant = (Number(c.adultos) || 0) + (Number(c.ninos) || 0) || Number(c.personas) || 0;
                  return (
                    <li key={i}>· {cant} {t("de tipo", "of type")} {c.tipo}{c.nombre ? ` — ${c.nombre}` : ""}</li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Servicios contratados */}
          {serviciosRows.length > 0 && (
            <PropuestaTable
              title={t("SERVICIOS", "SERVICES")}
              headers={[
                { label: t("Descripción", "Description"), width: "50%", align: "left" },
                { label: t("Cant.", "Qty"), width: "10%", align: "center" },
                { label: t("Valor Unit.", "Unit Price"), width: "18%", align: "right" },
                { label: t("Subtotal", "Subtotal"), width: "22%", align: "right" },
              ]}
              rows={serviciosRows.map(s => {
                const cant = Number(s.cantidad) || 1;
                const unit = Number(s.valor_unit) || (Number(s.valor) / cant) || 0;
                const sub  = Number(s.valor) || cant * unit;
                const desc = [s.categoria, s.descripcion].filter(Boolean).join(" — ");
                return [desc, cant, COP(unit), COP(sub)];
              })}
              subtotal={totalServicios}
            />
          )}

          {/* Cobros adicionales (extras_data) */}
          {totalExtras > 0 && (
            <>
              <div className="cot-eyebrow" style={{ marginTop: 20, marginBottom: 10, textAlign: "left" }}>{t("Cobros adicionales", "Additional charges")}</div>
              {[
                [t("TRANSPORTE", "TRANSPORTATION"), extrasTransporte, totExtrasTrans],
                [t("ALIMENTOS Y BEBIDAS", "FOOD & BEVERAGE"), extrasAlimentos, totExtrasAli],
                [t("SERVICIOS ADICIONALES", "ADDITIONAL SERVICES"), extrasServicios, totExtrasSer],
              ].map(([title, rows, tot]) => (
                <PropuestaTable
                  key={title}
                  title={title}
                  headers={[
                    { label: t("Concepto", "Item"), width: "45%", align: "left" },
                    { label: t("Cant.", "Qty"), width: "8%", align: "center" },
                    { label: t("V. Unit.", "Unit"), width: "15%", align: "right" },
                    { label: t("Subtotal", "Subtotal"), width: "15%", align: "right" },
                    { label: t("IVA", "VAT"), width: "7%", align: "center" },
                    { label: t("Total", "Total"), width: "10%", align: "right" },
                  ]}
                  rows={rows.map(l => {
                    const { sub, total } = calcLine(l);
                    return [l.concepto, l.cantidad, COP(l.valor_unit), COP(sub), `${l.iva || 0}%`, COP(total)];
                  })}
                  subtotal={tot}
                />
              ))}
            </>
          )}

          {/* Otros servicios cotizados (cotizacion_data) */}
          {totalCotizacion > 0 && (
            <>
              <div className="cot-eyebrow" style={{ marginTop: 20, marginBottom: 10, textAlign: "left" }}>{t("Otros servicios cotizados", "Other quoted services")}</div>
              {[
                [t("ESPACIOS", "VENUES"), cotEspacios, totCotEsp, false],
                [t("HOSPEDAJE", "ACCOMMODATION"), cotHospedaje, totCotHos, true],
                [t("ALIMENTOS Y BEBIDAS", "FOOD & BEVERAGE"), cotAlimentos, totCotAli, false],
                [t("SERVICIOS", "SERVICES"), cotServicios, totCotSer, false],
              ].map(([title, rows, tot, showNoches]) => (
                <PropuestaTable
                  key={title}
                  title={title}
                  headers={showNoches ? [
                    { label: t("Concepto", "Item"), width: "38%", align: "left" },
                    { label: t("Cant.", "Qty"), width: "8%", align: "center" },
                    { label: t("Noches", "Nights"), width: "8%", align: "center" },
                    { label: t("V. Unit.", "Unit"), width: "15%", align: "right" },
                    { label: t("Subtotal", "Subtotal"), width: "12%", align: "right" },
                    { label: t("IVA", "VAT"), width: "7%", align: "center" },
                    { label: t("Total", "Total"), width: "12%", align: "right" },
                  ] : [
                    { label: t("Concepto", "Item"), width: "45%", align: "left" },
                    { label: t("Cant.", "Qty"), width: "8%", align: "center" },
                    { label: t("V. Unit.", "Unit"), width: "15%", align: "right" },
                    { label: t("Subtotal", "Subtotal"), width: "15%", align: "right" },
                    { label: t("IVA", "VAT"), width: "7%", align: "center" },
                    { label: t("Total", "Total"), width: "10%", align: "right" },
                  ]}
                  rows={rows.map(l => {
                    const { sub, total } = calcLine(l);
                    return showNoches
                      ? [l.concepto, l.cantidad, l.noches || 1, COP(l.valor_unit), COP(sub), `${l.iva || 0}%`, COP(total)]
                      : [l.concepto, l.cantidad, COP(l.valor_unit), COP(sub), `${l.iva || 0}%`, COP(total)];
                  })}
                  subtotal={tot}
                />
              ))}
            </>
          )}

          {/* TOTAL — mismo estilo que los subtotales de cada tabla */}
          <div style={{ marginTop: 10, pageBreakInside: "avoid", breakInside: "avoid" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Barlow', sans-serif" }}>
              <tbody>
                <tr style={{ background: "#EFE7D3" }}>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: NAVY, fontWeight: 700 }}>
                    {t("Total", "Total")}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: NAVY, fontWeight: 700, width: 140 }}>
                    {COP(grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        </section>

        {/* PAGE — TÉRMINOS Y CONDICIONES (sin título, cláusulas resumidas) */}
        <section className="cot-page" style={{ background: CREAM, padding: "40px 44px", minHeight: "95vh", pageBreakBefore: "always", position: "relative" }}>
          <img src="/atolon-logo.png" alt="Atolon" style={{ height: 30, width: "auto", display: "block", margin: "0 auto 18px" }} />

          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div className="cot-eyebrow" style={{ marginBottom: 10 }}>{t("El marco", "The framework")}</div>
            <div style={{ width: 60, height: 1, background: SAND, margin: "10px auto 18px" }} />
            <div className="cot-italic" style={{ fontSize: 15, color: NAVY2, maxWidth: 540, margin: "0 auto", lineHeight: 1.5 }}>
              {t(
                "Como toda buena historia, la nuestra también necesita un marco — pensado para proteger la experiencia de su grupo tanto como la nuestra.",
                "Like every good story, ours also needs a framework — designed to protect your group's experience as much as our own."
              )}
            </div>
          </div>

          <div style={{ maxWidth: 640, margin: "0 auto", fontSize: 12, lineHeight: 1.7, color: NAVY2 }}>

            <div style={{ marginBottom: 18 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 6 }}>{t("1. Vigencia de la propuesta", "1. Proposal validity")}</div>
              <p style={{ margin: 0 }}>{t(
                <>Esta cotización es válida por <strong>siete (7) días calendario</strong> contados desde su fecha de emisión.</>,
                <>This quotation is valid for <strong>seven (7) calendar days</strong> from the date of issue.</>
              )}</p>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 6 }}>{t("2. Confirmación de la reserva", "2. Reservation confirmation")}</div>
              <p style={{ margin: 0 }}>{t(
                <>La fecha del evento, los espacios y los servicios cotizados <strong>no se consideran reservados ni garantizados</strong> hasta tanto el cliente (i) realice el pago del anticipo del <strong>50%</strong> del valor total, y (ii) suscriba el contrato de servicios correspondiente. Atolon se reserva el derecho de aceptar otras reservas sobre la misma fecha mientras no se cumplan ambas condiciones.</>,
                <>The event date, venues and quoted services <strong>are not considered reserved nor guaranteed</strong> until the client (i) pays the <strong>50%</strong> deposit of the total value, and (ii) signs the corresponding services contract. Atolon reserves the right to accept other reservations on the same date until both conditions are met.</>
              )}</p>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 6 }}>{t("3. Forma de pago", "3. Payment terms")}</div>
              <p style={{ margin: 0 }}>{t(
                <>Anticipo del 50% al momento de confirmar. Saldo del 50% restante al menos <strong>siete (7) días calendario antes</strong> de la fecha del evento. Los consumos adicionales no incluidos en la cotización deberán cancelarse el mismo día del evento. Medios de pago aceptados: transferencia bancaria, consignación o pasarela de pagos autorizada por Atolon.</>,
                <>50% deposit upon confirmation. Remaining 50% balance at least <strong>seven (7) calendar days before</strong> the event date. Additional consumptions not included in the quotation must be paid the same day of the event. Accepted payment methods: bank transfer, deposit, or payment gateway authorized by Atolon.</>
              )}</p>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 6 }}>{t("4. Impuestos y tarifas", "4. Taxes and fees")}</div>
              <p style={{ margin: 0 }}>{t(
                "Los valores expresados están en pesos colombianos (COP) e incluyen IVA e impuesto al consumo (INC) donde aplique. Cualquier modificación tributaria posterior a la firma podrá trasladarse al cliente conforme a la ley.",
                "Values are expressed in Colombian pesos (COP) and include VAT and consumption tax (INC) where applicable. Any tax changes after signing may be passed on to the client as per law."
              )}</p>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 6 }}>{t("5. Términos y condiciones completos", "5. Complete terms and conditions")}</div>
              <p style={{ margin: 0 }}>{t(
                <>Los términos y condiciones íntegros que regirán la prestación de los servicios serán descritos en el <strong>contrato</strong> que suscribirán las partes al confirmar la reserva.</>,
                <>The complete terms and conditions governing the services will be described in the <strong>contract</strong> signed by both parties upon reservation confirmation.</>
              )}</p>
            </div>

            <div style={{ marginTop: 26, padding: "16px 20px", background: "#EFE7D3", textAlign: "center", borderLeft: `3px solid ${SAND}` }}>
              <div className="cot-italic" style={{ fontSize: 13, color: NAVY, lineHeight: 1.6 }}>
                {t(
                  "La aceptación de esta propuesta y/o el pago del anticipo implica la aceptación íntegra de estos términos y condiciones.",
                  "Acceptance of this proposal and/or payment of the deposit implies full acceptance of these terms and conditions."
                )}
              </div>
            </div>

          </div>

          <div style={{ marginTop: 36, textAlign: "center", color: NAVY2, fontFamily: "'Barlow', sans-serif" }}>
            <div style={{ width: 80, height: 1, background: SAND, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", fontWeight: 700, color: NAVY, marginBottom: 6 }}>Atolon Beach Club</div>
            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              {t("Isla Tierra Bomba · Cartagena de Indias · Colombia", "Tierra Bomba Island · Cartagena de Indias · Colombia")}<br/>
              eventos@atoloncartagena.com · www.atolon.co
            </div>
            <div className="cot-italic" style={{ fontSize: 12, marginTop: 12, opacity: 0.85 }}>{t("Escrito a mano en la isla, con vista al Caribe.", "Hand-written on the island, with a view of the Caribbean.")}</div>
          </div>
        </section>

      </div>,
      document.body
      )}

      {/* Modal UI (preview) */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "20px 0" }}>
        <div style={{ background: B.navy, borderRadius: 16, width: "92vw", maxWidth: 960, padding: 24, margin: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Cotización del grupo — {evento?.nombre}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                {evento?.tipo} · {evento?.fecha ? new Date(evento.fecha + "T12:00:00").toLocaleDateString("es-CO") : ""} · {totalPaxPasadias} pax en pasadías
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>✕</button>
          </div>

          {/* Resumen previo */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 12 }}>Resumen</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                ["Pasadías", totalPasadias],
                ["Servicios", totalServicios],
                ["Extras", totalExtras],
                ["Cotización", totalCotizacion],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{k}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: v > 0 ? "#fff" : "rgba(255,255,255,0.3)" }}>{COP(v)}</div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${B.navyLight}`, marginTop: 14, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Inversión total</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: B.sand }}>{COP(grandTotal)}</span>
            </div>
          </div>

          {/* Preview inline (miniatura) */}
          <div id="grupo-cot-preview" style={{ background: CREAM, color: NAVY, borderRadius: 10, padding: 20, maxHeight: "45vh", overflowY: "auto", marginBottom: 16, fontFamily: "'Barlow', sans-serif" }}>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <div className="cot-title" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "0.12em" }}>ATOLÓN</div>
              <div style={{ fontSize: 10, letterSpacing: "0.2em", color: NAVY2, marginTop: 4, textTransform: "uppercase" }}>Propuesta para {evento?.nombre || header.empresa}</div>
            </div>
            <div className="cot-italic" style={{ fontSize: 13, color: NAVY2, textAlign: "center", marginBottom: 10 }}>
              Vista previa — imprime para ver la propuesta completa con el formato final.
            </div>
            <div style={{ fontSize: 12, color: NAVY2 }}>
              <div><strong>Fecha:</strong> {evento?.fecha ? fmtFechaLarga(evento.fecha) : "—"}</div>
              <div><strong>Tipo:</strong> {evento?.tipo || "—"}</div>
              <div><strong>Contacto:</strong> {header.contacto || "—"} · {header.telefono || "—"}</div>
              <div><strong>Pasadías:</strong> {pasadiasCobrables.length} líneas · {cortesias.length} cortesías</div>
              <div><strong>Servicios contratados:</strong> {serviciosRows.length}</div>
              {totalExtras > 0 && <div><strong>Cobros adicionales:</strong> {COP(totalExtras)}</div>}
              {totalCotizacion > 0 && <div><strong>Otros servicios cotizados:</strong> {COP(totalCotizacion)}</div>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button onClick={onClose} style={{ padding: "11px 20px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={() => descargarPDF("es")} disabled={pdfLoading || pdfLoadingEn} title="Descarga el PDF en español" style={{ padding: "11px 22px", background: B.navyLight, color: B.sand, border: `1px solid ${B.sand}44`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: (pdfLoading || pdfLoadingEn) ? "wait" : "pointer", opacity: (pdfLoading || pdfLoadingEn) ? 0.6 : 1 }}>
              {pdfLoading ? "Generando…" : "📥 PDF"}
            </button>
            <button onClick={() => descargarPDF("en")} disabled={pdfLoading || pdfLoadingEn} title="Download PDF in English" style={{ padding: "11px 22px", background: B.navyLight, color: B.sand, border: `1px solid ${B.sand}44`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: (pdfLoading || pdfLoadingEn) ? "wait" : "pointer", opacity: (pdfLoading || pdfLoadingEn) ? 0.6 : 1 }}>
              {pdfLoadingEn ? "Generating…" : "📥 PDF English"}
            </button>
            <button onClick={imprimir} disabled={pdfLoading || pdfLoadingEn} style={{ padding: "11px 22px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: (pdfLoading || pdfLoadingEn) ? 0.6 : 1 }}>
              🖨 Imprimir
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
