import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

// Import del componente desde EventoDetalle vía lazy export helper.
// En lugar de importarlo directo (está dentro de EventoDetalle.jsx como función interna),
// expongo una mini-implementación que solo renderiza el ModoStaff via detalle existente.
// Para no duplicar ModoStaff, re-exporto desde EventoDetalle.jsx.
import { ModoStaffReadOnly } from "./EventoDetalle";

export default function StaffView({ eventoId }) {
  useEffect(() => { document.title = "Staff · Atolón"; }, []);
  const [evento, setEvento] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!eventoId) { setError("ID de evento no válido"); setLoading(false); return; }
    (async () => {
      const { data, error: err } = await supabase
        .from("eventos")
        .select("*")
        .eq("id", eventoId)
        .maybeSingle();
      if (err || !data) {
        setError("Evento no encontrado o enlace no válido");
        setLoading(false);
        return;
      }
      setEvento({
        ...data,
        timeline_items: data.timeline_items || [],
        contactos_rapidos: data.contactos_rapidos || [],
        transporte_detalle: data.transporte_detalle || [],
        incidentes: data.incidentes || [],
        restricciones_dieteticas: data.restricciones_dieteticas || [],
      });
      document.title = `${data.nombre || "Evento"} — Staff · Atolón`;
      setLoading(false);
    })();
  }, [eventoId]);

  if (loading) {
    return (
      <div style={{ background: B.navy, minHeight: "100vh", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div>Cargando evento…</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ background: B.navy, minHeight: "100vh", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, fontFamily: "'Barlow Condensed', sans-serif" }}>Enlace no válido</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: B.navy, minHeight: "100vh", padding: 16, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: B.sand, fontWeight: 700, letterSpacing: "0.15em" }}>ATOLÓN · STAFF</div>
        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em", textAlign: "right" }}>{evento.nombre}</div>
      </div>
      <ModoStaffReadOnly
        evento={evento}
        timeline={evento.timeline_items || []}
        contactos={evento.contactos_rapidos || []}
        transporte={evento.transporte_detalle || []}
        incidentes={evento.incidentes || []}
      />
    </div>
  );
}
