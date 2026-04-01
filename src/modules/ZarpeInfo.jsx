// ZarpeInfo.jsx — Public page for clients to view QR + complete zarpe data
// Route: /zarpe-info?id=RESERVA_ID

import { useState, useEffect } from "react";
import { COP } from "../brand";
import { supabase } from "../lib/supabase";

// Light theme palette matching PagoCliente
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

function getReservaId() {
  const p = new URLSearchParams(window.location.search);
  return p.get("id") || p.get("reserva") || "";
}

function qrUrl(data, size = 200) {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data)}&size=${size}x${size}&bgcolor=0D1B3E&color=C8B99A&margin=10&format=png`;
}

export default function ZarpeInfo() {
  const reservaId = getReservaId();
  const [reserva, setReserva]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [pasajeros, setPasajeros] = useState([]);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    if (!supabase || !reservaId) { setError("Link inválido"); setLoading(false); return; }
    (async () => {
      const { data, error: err } = await supabase.from("reservas").select("*").eq("id", reservaId).single();
      if (err || !data) { setError("Reserva no encontrada"); setLoading(false); return; }
      setReserva(data);
      // Initialize passenger form from existing data or blank
      const count = (data.pax_a || 0) + (data.pax_n || 0) || data.pax || 1;
      const existing = data.pasajeros || [];
      const rows = Array.from({ length: count }, (_, i) => ({
        nombre:          existing[i]?.nombre || "",
        identificacion:  existing[i]?.identificacion || "",
        nacionalidad:    existing[i]?.nacionalidad || "Colombiana",
        tipo:            i < (data.pax_a || data.pax || 1) ? "Adulto" : "Niño",
      }));
      setPasajeros(rows);
      setLoading(false);
    })();
  }, [reservaId]);

  const setPax = (i, field, value) => {
    setPasajeros(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  const allFilled = pasajeros.every(p => p.nombre.trim() && p.identificacion.trim());

  const guardar = async () => {
    if (!allFilled) return;
    setSaving(true);
    await supabase.from("reservas").update({ pasajeros }).eq("id", reservaId);
    setSaving(false);
    setSaved(true);
  };

  const wrap = (content) => (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: `linear-gradient(135deg, ${C.sand}, ${C.sky})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 22, fontWeight: 700, color: C.bg }}>A</div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, letterSpacing: 1, color: C.textMid }}>ATOLON BEACH CLUB</div>
      </div>
      <div style={{ width: "100%", maxWidth: 460 }}>{content}</div>
    </div>
  );

  if (loading) return wrap(<div style={{ textAlign: "center", color: C.textLight, padding: 60 }}>Cargando...</div>);
  if (error)   return wrap(<div style={{ textAlign: "center", color: C.danger, padding: 60 }}>{error}</div>);

  const fechaDisplay = new Date(reserva.fecha + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return wrap(
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* QR Card */}
      <div style={{ background: C.bgCard, borderRadius: 20, padding: 28, textAlign: "center", border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, color: C.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Tu código de embarque</div>
        <div style={{ display: "inline-block", padding: 12, background: "#0D1B3E", borderRadius: 16, border: `2px solid ${C.sand}`, marginBottom: 16 }}>
          <img
            src={qrUrl(reservaId, 180)}
            alt={`QR ${reservaId}`}
            width={180} height={180}
            style={{ display: "block", borderRadius: 8 }}
          />
        </div>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 2, color: C.sand }}>{reservaId}</div>
        <div style={{ fontSize: 12, color: C.textLight, marginTop: 6 }}>Muestra este código al llegar al muelle</div>
      </div>

      {/* Reservation details */}
      <div style={{ background: C.bgCard, borderRadius: 16, padding: 20, border: `1px solid ${C.border}`, fontSize: 14, lineHeight: 2 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>📋 Detalle de tu reserva</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMid }}>Nombre</span><span style={{ fontWeight: 600 }}>{reserva.nombre}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMid }}>Fecha</span><span style={{ textTransform: "capitalize" }}>{fechaDisplay}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMid }}>Pasadía</span><span>{reserva.tipo}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMid }}>Personas</span><span>{reserva.pax}</span></div>
        {reserva.salida && (
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMid }}>Salida</span><span>{reserva.salida}</span></div>
        )}
      </div>

      {/* Embarkation info */}
      <div style={{ background: "#1A2E1A", borderRadius: 16, padding: 20, border: `1px solid rgba(52,211,153,0.2)` }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: C.success }}>🚢 Información de embarque</div>
        <div style={{ fontSize: 13, lineHeight: 2.2, color: "rgba(255,255,255,0.8)" }}>
          <div>📍 <strong>Muelle de La Bodeguita — Puerta 1</strong></div>
          <div>⏰ Llegar <strong>20 minutos antes</strong> de la salida</div>
          <div>💵 Impuesto de muelle: <strong style={{ color: C.sand }}>COP 18.000</strong> (no incluido)</div>
          <div>🆔 Traer documento de identidad original</div>
        </div>
      </div>

      {/* Suggestions */}
      <div style={{ background: C.bgCard, borderRadius: 16, padding: 20, border: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: C.sand }}>☀️ Recomendaciones</div>
        <div style={{ fontSize: 13, lineHeight: 2.2, color: C.textMid }}>
          <div>🧴 Bloqueador solar</div>
          <div>👙 Traje de baño y ropa ligera</div>
          <div>🕶️ Gafas de sol y sombrero</div>
          <div>👟 Sandalias cómodas</div>
          <div>📸 ¡Cámara o celular para las fotos!</div>
        </div>
      </div>

      {/* Zarpe data form */}
      <div style={{ background: C.bgCard, borderRadius: 16, padding: 20, border: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>📄 Datos para el zarpe</div>
        <div style={{ fontSize: 12, color: C.textLight, marginBottom: 16, lineHeight: 1.5 }}>
          Requeridos por Capitanía de Puerto. Completa los datos de todos los viajeros para agilizar el embarque.
        </div>

        {saved && (
          <div style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: C.success }}>
            ✅ Datos guardados. ¡Gracias! Llegarás más rápido al zarpe.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pasajeros.map((p, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.sand, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {p.tipo} {i + 1}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.textMid, display: "block", marginBottom: 4 }}>Nombre completo *</label>
                  <input
                    value={p.nombre}
                    onChange={e => setPax(i, "nombre", e.target.value)}
                    placeholder="Como aparece en el documento"
                    style={IS}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: C.textMid, display: "block", marginBottom: 4 }}>N° identificación *</label>
                    <input
                      value={p.identificacion}
                      onChange={e => setPax(i, "identificacion", e.target.value)}
                      placeholder="Cédula / Pasaporte"
                      style={IS}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.textMid, display: "block", marginBottom: 4 }}>Nacionalidad</label>
                    <input
                      value={p.nacionalidad}
                      onChange={e => setPax(i, "nacionalidad", e.target.value)}
                      placeholder="Colombiana"
                      style={IS}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={guardar}
          disabled={saving || !allFilled || saved}
          style={{
            marginTop: 16, width: "100%", padding: "14px", borderRadius: 12,
            background: saved ? "rgba(52,211,153,0.15)" : (!allFilled ? "rgba(200,185,154,0.2)" : C.sand),
            color: saved ? C.success : (!allFilled ? C.textLight : C.bg),
            border: "none", fontSize: 15, fontWeight: 700, cursor: saved || !allFilled ? "default" : "pointer",
          }}
        >
          {saving ? "Guardando..." : saved ? "✅ Datos guardados" : "Guardar datos del zarpe"}
        </button>
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: C.textLight, paddingBottom: 32 }}>
        Atolon Beach Club · Cartagena de Indias · atolon.co
      </div>
    </div>
  );
}
