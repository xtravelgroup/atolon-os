// ZarpeInfo.jsx — Public page for clients to view QR + complete zarpe data
// Route: /zarpe-info?id=RESERVA_ID
// Bilingual: ES / EN

import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg:        "#0D1B3E",
  bgCard:    "#162040",
  bgLight:   "#1C2B55",
  sand:      "#C8B99A",
  sky:       "#64B5F6",
  success:   "#34D399",
  danger:    "#F87171",
  text:      "#FFFFFF",
  textMid:   "rgba(255,255,255,0.6)",
  textLight: "rgba(255,255,255,0.35)",
  border:    "rgba(255,255,255,0.1)",
};

const IS = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
  color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box",
};

// ── Translations ──────────────────────────────────────────────────────────────
const T = {
  es: {
    downloadPdf:      "⬇ Descargar Confirmación PDF",
    loading:          "Cargando...",
    invalid:          "Link inválido",
    notFound:         "Reserva no encontrada",
    boardingCode:     "Tu código de embarque",
    showAtDock:       "Muestra este código al llegar al muelle",
    reservationTitle: "📋 Detalle de tu reserva",
    name:             "Nombre",
    date:             "Fecha",
    pasadia:          "Pasadía",
    people:           "Personas",
    departure:        "Salida",
    embarkTitle:      "🚢 Información de embarque",
    dock:             "📍 Muelle de La Bodeguita — Puerta 1",
    arrive:           "⏰ Llegar 20 minutos antes de la salida",
    tax:              "💵 Impuesto de muelle: COP 18.000 (no incluido)",
    id:               "🆔 Traer documento de identidad original",
    noFood:           "🚫 No se permite el ingreso de alimentos ni bebidas a Atolón Beach Club",
    tipsTitle:        "☀️ Recomendaciones",
    tip1:             "🧴 Bloqueador solar",
    tip2:             "👙 Traje de baño y ropa ligera",
    tip3:             "🕶️ Gafas de sol y sombrero",
    tip4:             "👟 Sandalias cómodas",
    tip5:             "📸 ¡Cámara o celular para las fotos!",
    zarpeTitle:       "📄 Datos para el zarpe",
    zarpeDesc:        "Requeridos por Capitanía de Puerto. Completa los datos de todos los viajeros para agilizar el embarque.",
    savedMsg:         "✅ Datos guardados. ¡Gracias! Llegarás más rápido al zarpe.",
    adult:            "Adulto",
    child:            "Niño",
    fullName:         "Nombre completo *",
    namePlaceholder:  "Como aparece en el documento",
    idNumber:         "N° identificación *",
    idPlaceholder:    "Cédula / Pasaporte",
    nationality:      "Nacionalidad",
    nationalityPlaceholder: "Colombiana",
    saveBtn:          "Guardar datos del zarpe",
    savingBtn:        "Guardando...",
    savedBtn:         "✅ Datos guardados",
    footer:           "Atolon Beach Club · Cartagena de Indias · atolon.co",
    dateLocale:       "es-CO",
    dateOptions:      { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  },
  en: {
    downloadPdf:      "⬇ Download Confirmation PDF",
    loading:          "Loading...",
    invalid:          "Invalid link",
    notFound:         "Reservation not found",
    boardingCode:     "Your boarding pass",
    showAtDock:       "Show this code when you arrive at the dock",
    reservationTitle: "📋 Reservation details",
    name:             "Name",
    date:             "Date",
    pasadia:          "Day pass",
    people:           "Guests",
    departure:        "Departure",
    embarkTitle:      "🚢 Boarding information",
    dock:             "📍 La Bodeguita Dock — Gate 1",
    arrive:           "⏰ Arrive 20 minutes before departure",
    tax:              "💵 Port tax: COP 18,000 (not included)",
    id:               "🆔 Bring original ID / passport",
    noFood:           "🚫 Outside food and beverages are not allowed at Atolón Beach Club",
    tipsTitle:        "☀️ What to bring",
    tip1:             "🧴 Sunscreen",
    tip2:             "👙 Swimwear and light clothing",
    tip3:             "🕶️ Sunglasses and hat",
    tip4:             "👟 Comfortable sandals",
    tip5:             "📸 Camera or phone for photos!",
    zarpeTitle:       "📄 Passenger manifest",
    zarpeDesc:        "Required by the Port Authority. Fill in all passengers' details to speed up boarding.",
    savedMsg:         "✅ Data saved. Thank you! You'll board faster.",
    adult:            "Adult",
    child:            "Child",
    fullName:         "Full name *",
    namePlaceholder:  "As shown on ID",
    idNumber:         "ID number *",
    idPlaceholder:    "ID / Passport",
    nationality:      "Nationality",
    nationalityPlaceholder: "Colombian",
    saveBtn:          "Save passenger data",
    savingBtn:        "Saving...",
    savedBtn:         "✅ Data saved",
    footer:           "Atolon Beach Club · Cartagena de Indias · atolon.co",
    dateLocale:       "en-US",
    dateOptions:      { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  },
};

function getReservaId() {
  const p = new URLSearchParams(window.location.search);
  return p.get("id") || p.get("reserva") || "";
}

function qrUrl(data, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data)}&size=${size}x${size}&bgcolor=0D1B3E&color=C8B99A&margin=10&format=png`;
}

// ── Print styles (injected once) ──────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  @page { margin: 14mm 12mm; size: A4 portrait; }
  body { background: #fff !important; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  .print-section { break-inside: avoid; }
  /* Force backgrounds */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export default function ZarpeInfo() {
  const reservaId = getReservaId();
  const [reserva, setReserva]     = useState(null);
  const [salida,  setSalida]      = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [pasajeros, setPasajeros] = useState([]);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [lang, setLang]           = useState("es");

  const t = T[lang];

  // Inject print styles once
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = PRINT_STYLE;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const downloadPDF = () => {
    window.print();
  };

  useEffect(() => {
    if (!supabase || !reservaId) { setError("invalid"); setLoading(false); return; }
    (async () => {
      const { data, error: err } = await supabase.from("reservas").select("*").eq("id", reservaId).single();
      if (err || !data) { setError("notFound"); setLoading(false); return; }
      setReserva(data);
      // Fetch salida to show departure time
      if (data.salida_id) {
        const { data: sal } = await supabase.from("salidas").select("id, nombre, hora, hora_regreso").eq("id", data.salida_id).single();
        if (sal) setSalida(sal);
      }
      const count = (data.pax_a || 0) + (data.pax_n || 0) || data.pax || 1;
      const existing = data.pasajeros || [];
      const rows = Array.from({ length: count }, (_, i) => ({
        nombre:         existing[i]?.nombre         || "",
        identificacion: existing[i]?.identificacion || "",
        nacionalidad:   existing[i]?.nacionalidad   || "",
        tipo:           i < (data.pax_a || data.pax || 1) ? "adult" : "child",
      }));
      setPasajeros(rows);
      setLoading(false);
    })();
  }, [reservaId]);

  const setPax = (i, field, value) =>
    setPasajeros(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));

  // At least one passenger must be filled; partial fills allowed (not all must show up)
  const anyFilled = pasajeros.some(p => p.nombre.trim() && p.identificacion.trim());

  const guardar = async () => {
    if (!anyFilled) return;
    setSaving(true);
    // Only save passengers with data; empty slots are excluded
    const paxConDatos = pasajeros.filter(p => p.nombre.trim() || p.identificacion.trim());
    await supabase.from("reservas").update({ pasajeros: paxConDatos }).eq("id", reservaId);
    setSaving(false);
    setSaved(true);
  };

  // ── Lang toggle ──────────────────────────────────────────────────────────
  const LangToggle = () => (
    <div className="no-print" style={{ display: "flex", gap: 4, position: "absolute", top: 20, right: 20 }}>
      {["es", "en"].map(l => (
        <button key={l} onClick={() => setLang(l)} style={{
          padding: "5px 12px", borderRadius: 20, border: `1px solid ${lang === l ? C.sand : C.border}`,
          background: lang === l ? C.sand + "22" : "transparent",
          color: lang === l ? C.sand : C.textLight,
          fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em",
        }}>{l}</button>
      ))}
    </div>
  );

  const wrap = (content) => (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", position: "relative" }}>
      <LangToggle />
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <img src="/atolon-logo-white.png" alt="Atolon Beach Club" style={{ height: 144, objectFit: "contain", display: "block", margin: "0 auto" }} />
      </div>
      <div style={{ width: "100%", maxWidth: 460 }}>{content}</div>
    </div>
  );

  if (loading) return wrap(<div style={{ textAlign: "center", color: C.textLight, padding: 60 }}>{t.loading}</div>);
  if (error)   return wrap(<div style={{ textAlign: "center", color: C.danger, padding: 60 }}>{t[error] || error}</div>);

  const fechaDisplay = new Date(reserva.fecha + "T12:00:00").toLocaleDateString(t.dateLocale, t.dateOptions);

  // Pre-compute departure / arrival times
  let llegadaHora = null;
  if (salida?.hora) {
    const parts = salida.hora.split(":");
    const totalMins = parseInt(parts[0]) * 60 + parseInt(parts[1]) - 20;
    const norm = ((totalMins % 1440) + 1440) % 1440;
    llegadaHora = `${String(Math.floor(norm / 60)).padStart(2,"0")}:${String(norm % 60).padStart(2,"0")}`;
  }

  return wrap(
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Download PDF button */}
      <button
        className="no-print"
        onClick={downloadPDF}
        style={{
          width: "100%", padding: "13px", borderRadius: 12,
          background: C.sand, color: C.bg, border: "none",
          fontSize: 15, fontWeight: 700, cursor: "pointer",
          letterSpacing: "0.01em", boxShadow: `0 4px 18px rgba(200,185,154,0.3)`,
        }}
      >
        {t.downloadPdf}
      </button>

      {/* QR Card */}
      <div className="print-section" style={{ background: C.bgCard, borderRadius: 20, padding: 28, textAlign: "center", border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, color: C.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>{t.boardingCode}</div>
        <div style={{ display: "inline-block", padding: 12, background: "#0D1B3E", borderRadius: 16, border: `2px solid ${C.sand}`, marginBottom: 16 }}>
          <img src={qrUrl(reservaId, 180)} alt={`QR ${reservaId}`} width={180} height={180} style={{ display: "block", borderRadius: 8 }} />
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 2, color: C.sand }}>{reservaId}</div>
        <div style={{ fontSize: 12, color: C.textLight, marginTop: 6 }}>{t.showAtDock}</div>
      </div>

      {/* Reservation details */}
      <div className="print-section" style={{ background: C.bgCard, borderRadius: 16, padding: 20, border: `1px solid ${C.border}`, fontSize: 14, lineHeight: 2 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{t.reservationTitle}</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMid }}>{t.name}</span><span style={{ fontWeight: 600 }}>{reserva.nombre}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMid }}>{t.date}</span><span style={{ textTransform: "capitalize" }}>{fechaDisplay}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMid }}>{t.pasadia}</span><span>{reserva.tipo}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMid }}>{t.people}</span><span>{reserva.pax}</span></div>
        {llegadaHora && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: C.textMid }}>Hora Llegada Muelle</span>
            <span style={{ fontWeight: 700, color: C.sand }}>{llegadaHora}</span>
          </div>
        )}
        {salida?.hora && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: C.textMid }}>{t.departure}</span>
            <span style={{ fontWeight: 700, color: C.sky }}>{salida.hora}</span>
          </div>
        )}
        {salida?.hora_regreso && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: C.textMid }}>Regreso</span>
            <span style={{ fontWeight: 700, color: C.sky }}>{salida.hora_regreso}</span>
          </div>
        )}
      </div>

      {/* Embarkation info */}
      <div className="print-section" style={{ background: "#1A2E1A", borderRadius: 16, padding: 20, border: `1px solid rgba(52,211,153,0.2)` }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: C.success }}>{t.embarkTitle}</div>
        <div style={{ fontSize: 13, lineHeight: 2.2, color: "rgba(255,255,255,0.8)" }}>
          <div>{t.dock}</div>
          <div>{t.arrive}</div>
          <div>{t.tax}</div>
          <div>{t.id}</div>
          <div style={{ color: "#F87171", fontWeight: 600 }}>{t.noFood}</div>
        </div>
      </div>

      {/* Tips */}
      <div className="print-section" style={{ background: C.bgCard, borderRadius: 16, padding: 20, border: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: C.sand }}>{t.tipsTitle}</div>
        <div style={{ fontSize: 13, lineHeight: 2.2, color: C.textMid }}>
          {[t.tip1, t.tip2, t.tip3, t.tip4, t.tip5].map((tip, i) => <div key={i}>{tip}</div>)}
        </div>
      </div>

      {/* Zarpe data form — hidden in print */}
      <div className="no-print" style={{ background: C.bgCard, borderRadius: 16, padding: 20, border: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{t.zarpeTitle}</div>
        <div style={{ fontSize: 12, color: C.textLight, marginBottom: 16, lineHeight: 1.5 }}>{t.zarpeDesc}</div>

        {saved && (
          <div style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.success }}>
            {t.savedMsg}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pasajeros.map((p, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.sand, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {p.tipo === "adult" ? t.adult : t.child} {i + 1}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.textMid, display: "block", marginBottom: 4 }}>{t.fullName}</label>
                  <input value={p.nombre} onChange={e => setPax(i, "nombre", e.target.value)} placeholder={t.namePlaceholder} style={IS} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: C.textMid, display: "block", marginBottom: 4 }}>{t.idNumber}</label>
                    <input value={p.identificacion} onChange={e => setPax(i, "identificacion", e.target.value)} placeholder={t.idPlaceholder} style={IS} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.textMid, display: "block", marginBottom: 4 }}>{t.nationality}</label>
                    <input value={p.nacionalidad} onChange={e => setPax(i, "nacionalidad", e.target.value)} placeholder={t.nationalityPlaceholder} style={IS} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={guardar}
          disabled={saving || !anyFilled || saved}
          style={{
            marginTop: 16, width: "100%", padding: "14px", borderRadius: 12,
            background: saved ? "rgba(52,211,153,0.15)" : (!anyFilled ? "rgba(200,185,154,0.2)" : C.sand),
            color: saved ? C.success : (!anyFilled ? C.textLight : C.bg),
            border: "none", fontSize: 15, fontWeight: 700, cursor: saved || !anyFilled ? "default" : "pointer",
          }}
        >
          {saving ? t.savingBtn : saved ? t.savedBtn : t.saveBtn}
        </button>
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: C.textLight, paddingBottom: 32 }}>{t.footer}</div>
    </div>
  );
}
