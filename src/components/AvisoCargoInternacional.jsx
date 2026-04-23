// AvisoCargoInternacional — Muestra un banner cuando el merchant activo
// requiere indicar a nombre de quién saldrá el cargo en el estado de cuenta.
//
// Uso:
//   import AvisoCargoInternacional from "./components/AvisoCargoInternacional";
//   <AvisoCargoInternacional lang="es" />

import { useState, useEffect } from "react";
import { avisoCargoMerchant } from "../lib/internacional";

const COLORS = {
  sand: "#C8B99A",
  navy: "#0D1B3E",
};

const COPY = {
  es: {
    title: "Aviso importante",
    body: (nombre) => (
      <>
        El cargo en tu tarjeta aparecerá en el estado de cuenta a nombre de{" "}
        <strong style={{ color: COLORS.sand }}>{nombre}</strong>.
      </>
    ),
  },
  en: {
    title: "Important notice",
    body: (nombre) => (
      <>
        The charge on your card will appear on your statement as{" "}
        <strong style={{ color: COLORS.sand }}>{nombre}</strong>.
      </>
    ),
  },
};

export default function AvisoCargoInternacional({ lang = "es", compact = false, style = {} }) {
  const [nombre, setNombre] = useState(null);

  useEffect(() => {
    let active = true;
    avisoCargoMerchant().then(n => { if (active) setNombre(n); });
    return () => { active = false; };
  }, []);

  if (!nombre) return null;
  const copy = COPY[lang] || COPY.es;

  if (compact) {
    return (
      <div style={{
        fontSize: 11,
        color: "rgba(200, 185, 154, 0.85)",
        padding: "6px 10px",
        background: `${COLORS.sand}11`,
        border: `1px solid ${COLORS.sand}33`,
        borderRadius: 6,
        lineHeight: 1.4,
        ...style,
      }}>
        💳 {copy.body(nombre)}
      </div>
    );
  }

  return (
    <div style={{
      padding: "10px 14px",
      background: `${COLORS.sand}15`,
      border: `1px solid ${COLORS.sand}44`,
      borderRadius: 8,
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      ...style,
    }}>
      <div style={{ fontSize: 18, marginTop: 1 }}>💳</div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 800,
          color: COLORS.sand,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 3,
        }}>
          {copy.title}
        </div>
        <div style={{
          fontSize: 12,
          color: "rgba(255, 255, 255, 0.8)",
          lineHeight: 1.5,
        }}>
          {copy.body(nombre)}
        </div>
      </div>
    </div>
  );
}
