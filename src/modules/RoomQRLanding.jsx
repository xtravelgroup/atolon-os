// RoomQRLanding — Public route /room/:habitacion_id_o_numero
// Scanned from physical QR in room → auto-redirects to GuestPortal for current guest

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg:     "#0D1B3E",
  sand:   "#C8B99A",
  white:  "#F8FAFC",
  danger: "#F87171",
};

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export default function RoomQRLanding({ idOrNumero }) {
  const [state, setState] = useState({ loading: true, error: null, habitacion: null });

  useEffect(() => {
    (async () => {
      if (!idOrNumero) { setState({ loading: false, error: "Habitación no especificada" }); return; }

      // Buscar habitación por id o número
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(idOrNumero);
      let habQuery = supabase.from("hotel_habitaciones").select("id, numero, categoria").eq("estado", "activa");
      habQuery = isUuid ? habQuery.eq("id", idOrNumero) : habQuery.eq("numero", idOrNumero);
      const { data: habs } = await habQuery.limit(1);
      const habitacion = habs?.[0];
      if (!habitacion) { setState({ loading: false, error: "Habitación no encontrada" }); return; }

      setState({ loading: true, habitacion });

      // Buscar estancia activa para esa habitación
      // Prioridad: in_house actual → reservada cuyo rango de fechas cubra hoy
      const { data: estancias } = await supabase.from("hotel_estancias")
        .select("id, codigo, check_in_at, check_out_at, huesped_id, estado")
        .eq("habitacion_id", habitacion.id)
        .in("estado", ["in_house", "reservada"])
        .order("check_in_at", { ascending: false })
        .limit(10);

      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;

      // Prioridad 1: cualquier in_house (check-in hecho) gana siempre
      let estancia = (estancias || []).find(e => e.estado === "in_house");

      // Prioridad 2: reservada cuyo rango de fechas cubre hoy (con 12h de gracia)
      if (!estancia) {
        estancia = (estancias || []).find(e => {
          if (e.estado !== "reservada") return false;
          const ci = new Date(e.check_in_at).getTime();
          const co = new Date(e.check_out_at).getTime();
          return (now >= ci - DAY / 2) && (now <= co + DAY / 2);
        });
      }

      if (!estancia) {
        setState({ loading: false, error: `Habitación ${habitacion.numero} no tiene huésped registrado. Pregunta en recepción.`, habitacion });
        return;
      }

      // Buscar token válido existente
      const nowIso = new Date().toISOString();
      const { data: existing } = await supabase.from("hotel_guest_tokens")
        .select("token, expira_at")
        .eq("estancia_id", estancia.id)
        .gt("expira_at", nowIso)
        .order("expira_at", { ascending: false })
        .limit(1);
      let token = existing?.[0]?.token;

      // Si no hay token, crear uno nuevo (dura hasta fin de estancia + 24h)
      if (!token) {
        token = uid();
        const expira = new Date(estancia.check_out_at || Date.now() + 7 * 24 * 60 * 60 * 1000);
        expira.setDate(expira.getDate() + 1);
        await supabase.from("hotel_guest_tokens").insert({
          token,
          estancia_id: estancia.id,
          expira_at: expira.toISOString(),
        });
      }

      // Redirigir
      window.location.href = `/m/${token}`;
    })();
  }, [idOrNumero]);

  if (state.error) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', sans-serif" }}>
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🛏️</div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 10 }}>ATOLÓN</div>
          <div style={{ fontSize: 16, color: C.danger, marginBottom: 8 }}>⚠️ {state.error}</div>
          {state.habitacion && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 16 }}>
              Habitación {state.habitacion.numero}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 800, color: C.sand, marginBottom: 20, letterSpacing: 4 }}>ATOLÓN</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>Bienvenido · Welcome</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 20 }}>Conectando con tu habitación…</div>
      </div>
    </div>
  );
}
