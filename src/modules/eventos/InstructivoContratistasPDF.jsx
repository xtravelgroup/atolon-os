// Instructivo en PDF para contratistas/proveedores de un evento.
// Se genera desde la pestaña Contratistas en EventoDetalle.
import React, { useState } from "react";
import { createPortal } from "react-dom";

const NAVY = "#0D1B3E";
const NAVY2 = "#1E3566";
const SAND = "#C8B99A";
const CREAM = "#FAF6EE";
const CREAM2 = "#FFFDF7";
const HAIR = "#E5DFD0";

const fmtFechaLarga = (d) => {
  if (!d) return "";
  try {
    const dt = new Date(d + (String(d).length === 10 ? "T12:00:00" : ""));
    return dt.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return d; }
};

export default function InstructivoContratistasPDF({ evento, onClose }) {
  const [pdfLoading, setPdfLoading] = useState(false);

  function imprimir() {
    const source = document.getElementById("instructivo-print");
    if (!source) return;
    const origin = window.location.origin;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Instructivo_Contratistas_${(evento?.nombre||"").replace(/[^a-zA-Z0-9]/g,"_")}</title>
<base href="${origin}/">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Barlow:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 18mm 16mm; }
  html, body { margin: 0; padding: 0; background: ${CREAM}; color: ${NAVY}; font-family: 'Barlow', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cot-page { display: block; page-break-after: always; break-after: page; min-height: 0 !important; height: auto !important; width: 100%; box-sizing: border-box; }
  .cot-page:last-child { page-break-after: auto; break-after: auto; }
  .cot-title { font-family: 'Playfair Display', serif; color: ${NAVY}; }
  .cot-italic { font-family: 'Cormorant Garamond', serif; font-style: italic; color: rgba(30,53,102,0.9); }
  .cot-eyebrow { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: ${SAND}; font-weight: 600; }
  img { max-width: 100%; }
</style>
</head><body>${source.innerHTML}</body></html>`);
    doc.close();
    setTimeout(() => {
      try { iframe.contentWindow.focus(); } catch {}
      try { iframe.contentWindow.print(); } catch {}
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 2000);
    }, 800);
  }

  async function descargarPDF() {
    setPdfLoading(true);
    try {
      const source = document.getElementById("instructivo-print");
      if (!source) { setPdfLoading(false); return; }

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:0;top:0;width:816px;height:1056px;border:0;opacity:0;pointer-events:none;z-index:-1;";
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument;
      idoc.open();
      idoc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Barlow:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; background: ${CREAM}; color: ${NAVY}; font-family: 'Barlow', sans-serif; -webkit-print-color-adjust: exact; }
  .cot-page { display: block; width: 816px; background: ${CREAM}; box-sizing: border-box; page-break-after: always; }
  .cot-title { font-family: 'Playfair Display', serif; color: ${NAVY}; }
  .cot-italic { font-family: 'Cormorant Garamond', serif; font-style: italic; color: rgba(30,53,102,0.9); }
  .cot-eyebrow { font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: ${SAND}; font-weight: 600; }
  img { max-width: 100%; }
</style>
</head><body>${source.innerHTML}</body></html>`);
      idoc.close();

      await new Promise(r => {
        if (idoc.readyState === "complete") r();
        else iframe.addEventListener("load", r, { once: true });
      });
      try { await iframe.contentWindow.document.fonts?.ready; } catch {}
      await new Promise(r => setTimeout(r, 1000));

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
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, allowTaint: true, backgroundColor: CREAM, logging: false, windowWidth: 816 });
        const imgW = pdfW - marginMm * 2;
        const pxPerMm = canvas.width / imgW;
        const sliceHeightPx = Math.floor(usableH * pxPerMm); // altura máx por página en pixeles del canvas

        let yOffsetPx = 0;
        while (yOffsetPx < canvas.height) {
          const remainingPx = canvas.height - yOffsetPx;
          const thisSliceHpx = Math.min(sliceHeightPx, remainingPx);

          // Crear canvas temporal con solo esta porción
          const tmp = document.createElement("canvas");
          tmp.width = canvas.width;
          tmp.height = thisSliceHpx;
          const ctx = tmp.getContext("2d");
          ctx.fillStyle = CREAM;
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

      const nombreArchivo = `Instructivo_Contratistas_${(evento?.nombre || "evento").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      pdf.save(nombreArchivo);
      document.body.removeChild(iframe);
    } catch (err) {
      console.error("[instructivo pdf]", err);
      alert("Error generando PDF: " + (err.message || err));
    } finally {
      setPdfLoading(false);
    }
  }

  const nombreEvento = evento?.nombre || "su evento";
  const fechaEvento = evento?.fecha ? fmtFechaLarga(evento.fecha) : "";
  const empresa = evento?.empresa || evento?.contacto || "";

  return (
    <>
      {/* Printable area (portal to body) */}
      {typeof document !== "undefined" && createPortal(
        <div id="instructivo-print" style={{ display: "none", background: CREAM, color: NAVY, fontFamily: "'Barlow', sans-serif" }}>

          {/* PÁGINA 1 — Portada */}
          <section className="cot-page" style={{ background: CREAM, padding: "60px 50px 80px", textAlign: "center" }}>
            <img src="/atolon-logo.png" alt="Atolon" style={{ maxWidth: 260, width: "60%", height: "auto", display: "block", margin: "20px auto 28px" }} />
            <div style={{ width: 80, height: 1, background: SAND, margin: "24px auto" }} />
            <div className="cot-eyebrow" style={{ marginBottom: 10 }}>Instructivo para contratistas</div>
            <div className="cot-title" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1, marginBottom: 10, maxWidth: 560, margin: "0 auto 10px" }}>
              Cómo acceder y trabajar en Atolon
            </div>
            <div className="cot-italic" style={{ fontSize: 17, color: NAVY2, maxWidth: 500, margin: "8px auto 0" }}>
              Una guía breve para preparar a su equipo antes del gran día.
            </div>

            <div style={{ marginTop: 48, background: CREAM2, border: `1px solid ${HAIR}`, borderLeft: `3px solid ${SAND}`, borderRadius: 4, padding: "18px 22px", maxWidth: 520, margin: "48px auto 0", textAlign: "left" }}>
              <div className="cot-eyebrow" style={{ marginBottom: 8 }}>Su evento</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{nombreEvento}</div>
              {empresa && <div style={{ fontSize: 12, color: NAVY2, marginBottom: 2 }}>{empresa}</div>}
              {fechaEvento && <div className="cot-italic" style={{ fontSize: 14, color: NAVY2, marginTop: 4 }}>{fechaEvento}</div>}
            </div>

            <div style={{ marginTop: 40, fontSize: 12, color: NAVY2, lineHeight: 1.7, maxWidth: 520, margin: "40px auto 0" }}>
              Este documento explica, paso a paso, lo que su equipo debe hacer para ingresar a Atolon Beach Club el día del evento. Compártalo con su event planner, con los proveedores externos y con el personal propio que vendrá a trabajar.
            </div>
          </section>

          {/* PÁGINA 2 — Paso 1: Registro en el portal */}
          <section className="cot-page" style={{ background: CREAM, padding: "50px 50px" }}>
            <img src="/atolon-logo.png" alt="Atolon" style={{ height: 32, width: "auto", display: "block", margin: "0 auto 30px" }} />

            <div className="cot-eyebrow" style={{ marginBottom: 10 }}>Paso 1</div>
            <div className="cot-title" style={{ fontSize: 30, fontWeight: 700, marginBottom: 18 }}>Registro previo en el portal</div>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: NAVY2, margin: 0 }}>
              Toda empresa contratista o proveedor, así como el event planner y su equipo de trabajo, debe registrarse <strong>antes del día del evento</strong> en el portal oficial de Atolon.
            </p>

            <div style={{ background: CREAM2, border: `1px dashed ${SAND}`, borderRadius: 6, padding: "22px 26px", marginTop: 28, display: "flex", alignItems: "center", gap: 24 }}>
              <img
                src="https://api.qrserver.com/v1/create-qr-code/?data=https%3A%2F%2Fatolon.co%2Fcontratistas&size=300x300&margin=4&color=0D1B3E&bgcolor=FFFDF7"
                alt="QR atolon.co/contratistas"
                crossOrigin="anonymous"
                style={{ width: 130, height: 130, flexShrink: 0, borderRadius: 4 }}
              />
              <div style={{ flex: 1, textAlign: "left" }}>
                <div className="cot-eyebrow" style={{ marginBottom: 6 }}>Portal de contratistas</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, fontFamily: "monospace", letterSpacing: "0.03em" }}>
                  atolon.co/contratistas
                </div>
                <div className="cot-italic" style={{ fontSize: 13, color: NAVY2, marginTop: 8 }}>
                  Escanea el código o abre el enlace
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, lineHeight: 1.8, color: NAVY2, marginTop: 24 }}>
              El registro es <strong>gratuito</strong> y toma aproximadamente <strong>15 minutos</strong>. Una vez radicado, nuestro equipo de SST lo revisa en un lapso de <strong>24 a 48 horas</strong> y envía la confirmación por correo electrónico.
            </p>
          </section>

          {/* PÁGINA 3 — Paso 2: Documentos */}
          <section className="cot-page" style={{ background: CREAM, padding: "50px 50px" }}>
            <img src="/atolon-logo.png" alt="Atolon" style={{ height: 32, width: "auto", display: "block", margin: "0 auto 30px" }} />

            <div className="cot-eyebrow" style={{ marginBottom: 10 }}>Paso 2</div>
            <div className="cot-title" style={{ fontSize: 30, fontWeight: 700, marginBottom: 18 }}>Documentos requeridos</div>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: NAVY2, margin: "0 0 24px" }}>
              Dependiendo del tipo de vinculación del contratista, deberá cargar en el portal los siguientes documentos:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ background: CREAM2, border: `1px solid ${HAIR}`, borderLeft: `3px solid ${SAND}`, padding: "18px 20px", borderRadius: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: NAVY }}>Si registra como empresa</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: NAVY2, lineHeight: 1.9 }}>
                  <li>Cámara de Comercio vigente</li>
                  <li>RUT</li>
                  <li>Cédula del representante legal</li>
                  <li>Pago PILA del último mes</li>
                  <li>Afiliación ARL vigente</li>
                  <li>Listado de trabajadores con sus datos</li>
                </ul>
              </div>
              <div style={{ background: CREAM2, border: `1px solid ${HAIR}`, borderLeft: `3px solid ${SAND}`, padding: "18px 20px", borderRadius: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: NAVY }}>Si registra como persona natural</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: NAVY2, lineHeight: 1.9 }}>
                  <li>Cédula de ciudadanía</li>
                  <li>Certificado EPS</li>
                  <li>Certificado AFP</li>
                  <li>Afiliación ARL vigente</li>
                  <li>Pago PILA del último mes</li>
                </ul>
              </div>
            </div>

            <p className="cot-italic" style={{ fontSize: 13, color: NAVY2, marginTop: 28, textAlign: "center" }}>
              Todos los soportes se cargan digitalmente — no se requiere enviar documentos físicos.
            </p>
          </section>

          {/* PÁGINA 4 — Paso 3: Curso SST */}
          <section className="cot-page" style={{ background: CREAM, padding: "50px 50px" }}>
            <img src="/atolon-logo.png" alt="Atolon" style={{ height: 32, width: "auto", display: "block", margin: "0 auto 30px" }} />

            <div className="cot-eyebrow" style={{ marginBottom: 10 }}>Paso 3</div>
            <div className="cot-title" style={{ fontSize: 30, fontWeight: 700, marginBottom: 18 }}>Curso de inducción SST</div>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: NAVY2, margin: "0 0 16px" }}>
              Cada trabajador registrado recibirá automáticamente, por correo electrónico, un <strong>enlace al curso virtual</strong> de inducción en Seguridad y Salud en el Trabajo de Atolon.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: NAVY2, margin: "0 0 16px" }}>
              El curso toma aproximadamente <strong>20 minutos</strong> e incluye un examen final que debe aprobarse con <strong>70% o más</strong>.
            </p>

            <div style={{ background: CREAM2, border: `1px solid ${HAIR}`, borderLeft: `3px solid ${SAND}`, padding: "20px 22px", borderRadius: 4, marginTop: 24 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 10 }}>Al aprobar</div>
              <div style={{ fontSize: 14, color: NAVY, lineHeight: 1.7 }}>
                Cada trabajador recibe un <strong>certificado con código QR único</strong>, válido por <strong>12 meses</strong>.
              </div>
              <div className="cot-italic" style={{ fontSize: 13, color: NAVY2, marginTop: 10 }}>
                Sin este certificado no se permite el ingreso a la isla.
              </div>
            </div>
          </section>

          {/* PÁGINA 3 — Día del evento e ingreso */}
          <section className="cot-page" style={{ background: CREAM, padding: "40px 44px" }}>
            <img src="/atolon-logo.png" alt="Atolon" style={{ height: 30, width: "auto", display: "block", margin: "0 auto 24px" }} />

            <div>
              <div className="cot-eyebrow" style={{ marginBottom: 8 }}>Paso 4</div>
              <div className="cot-title" style={{ fontSize: 26, fontWeight: 700, marginBottom: 14 }}>El día del evento — ingreso a la isla</div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: NAVY2, margin: "0 0 14px" }}>
                Cada trabajador debe presentarse en el muelle de La Bodeguita con:
              </p>
              <ul style={{ fontSize: 13, color: NAVY2, lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
                <li><strong>Documento de identidad</strong> (cédula o pasaporte)</li>
                <li><strong>Certificado del curso SST</strong> — código QR en el celular o impreso</li>
                <li>Uniforme o vestimenta acorde al rol</li>
                <li>Herramientas, equipos y materiales propios del trabajo</li>
              </ul>
              <div style={{ background: CREAM2, border: `1px dashed ${SAND}`, borderRadius: 6, padding: "16px 20px", marginTop: 22 }}>
                <div className="cot-eyebrow" style={{ marginBottom: 8 }}>Verificación en muelle</div>
                <p style={{ fontSize: 12, color: NAVY2, margin: 0, lineHeight: 1.7 }}>
                  Nuestro personal escaneará el código QR del certificado y validará el documento. El sistema confirma automáticamente que la persona está autorizada, su ARL está vigente y el contratista está aprobado.
                </p>
              </div>
            </div>
          </section>

          {/* PÁGINA 4 — Reglas + Contactos */}
          <section className="cot-page" style={{ background: CREAM, padding: "40px 44px" }}>
            <img src="/atolon-logo.png" alt="Atolon" style={{ height: 30, width: "auto", display: "block", margin: "0 auto 24px" }} />

            <div style={{ marginBottom: 36 }}>
              <div className="cot-eyebrow" style={{ marginBottom: 8 }}>Paso 5</div>
              <div className="cot-title" style={{ fontSize: 26, fontWeight: 700, marginBottom: 14 }}>Reglas durante la permanencia</div>
              <ul style={{ fontSize: 13, color: NAVY2, lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
                <li>Uso obligatorio de <strong>chaleco salvavidas</strong> durante la travesía en lancha</li>
                <li>Respeto a <strong>zonas restringidas</strong> (cocina, habitaciones, zonas privadas)</li>
                <li><strong>Prohibido consumo de alcohol</strong> durante el turno de trabajo</li>
                <li><strong>Prohibido tomar fotos o videos</strong> de huéspedes sin autorización</li>
                <li>Conducta discreta, profesional y sin interacción innecesaria con huéspedes</li>
                <li>Accidentes o incidentes se reportan <strong>de inmediato</strong> al coordinador SST</li>
                <li>Toda basura y residuos deben ser retirados al final de la jornada</li>
              </ul>
            </div>

            <div>
              <div className="cot-eyebrow" style={{ marginBottom: 8 }}>Contactos</div>
              <div className="cot-title" style={{ fontSize: 26, fontWeight: 700, marginBottom: 14 }}>¿Dudas? Estamos para ayudar.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
                <div style={{ background: CREAM2, border: `1px solid ${HAIR}`, padding: "14px 18px", borderRadius: 4 }}>
                  <div className="cot-eyebrow" style={{ marginBottom: 6 }}>Registro y SST</div>
                  <div style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>contratistas@atolon.co</div>
                </div>
                <div style={{ background: CREAM2, border: `1px solid ${HAIR}`, padding: "14px 18px", borderRadius: 4 }}>
                  <div className="cot-eyebrow" style={{ marginBottom: 6 }}>Eventos</div>
                  <div style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>eventos@atoloncartagena.com</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 44, width: 80, height: 1, background: SAND, marginLeft: "auto", marginRight: "auto" }} />
            <div className="cot-italic" style={{ fontSize: 14, color: NAVY2, textAlign: "center", marginTop: 18 }}>
              Gracias por hacer posible un evento inolvidable en Atolon.
            </div>
          </section>

        </div>,
        document.body
      )}

      {/* UI del modal */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "20px 0" }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div style={{ background: "#0D1B3E", borderRadius: 16, width: "92vw", maxWidth: 720, padding: 28, margin: "auto", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 2, color: SAND, textTransform: "uppercase", fontWeight: 700 }}>Instructivo</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Contratistas · {nombreEvento}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                3 páginas · Genera un documento con los requisitos y pasos para que sus contratistas accedan a Atolon.
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ background: "#152650", borderRadius: 10, padding: "16px 18px", marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: SAND, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>El documento incluye</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: "rgba(255,255,255,0.85)" }}>
              <li>Portada con nombre y fecha del evento</li>
              <li>Paso 1 · Registro en el portal atolon.co/contratistas</li>
              <li>Paso 2 · Documentos requeridos (empresa y persona natural)</li>
              <li>Paso 3 · Curso de inducción SST y certificado QR</li>
              <li>Paso 4 · Qué llevar el día del evento e ingreso al muelle</li>
              <li>Paso 5 · Reglas durante la permanencia en la isla</li>
              <li>Contactos de soporte</li>
            </ul>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button onClick={onClose} style={{ padding: "11px 20px", background: "none", border: `1px solid #1E3566`, borderRadius: 8, color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
              Cerrar
            </button>
            <button onClick={descargarPDF} disabled={pdfLoading}
              style={{ padding: "11px 22px", background: "#1E3566", color: SAND, border: `1px solid ${SAND}44`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: pdfLoading ? "wait" : "pointer", opacity: pdfLoading ? 0.6 : 1 }}>
              {pdfLoading ? "Generando…" : "📥 Descargar PDF"}
            </button>
            <button onClick={imprimir} style={{ padding: "11px 22px", background: SAND, color: NAVY, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              🖨 Imprimir
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
