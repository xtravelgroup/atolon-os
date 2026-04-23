// Vista de un módulo educativo del curso
import { parseBold } from "./cursoContent";

const C = {
  navy: "#0D1B3E",
  navyLight: "#1E2D5C",
  sand: "#C8B99A",
  sky: "#8ECAE6",
  skyLight: "#C9E4F0",
  cream: "#FAF6EE",
  white: "#FFFFFF",
  success: "#3D8B5E",
  error: "#B84545",
  warn: "#D4A147",
};

function RichText({ text, style }) {
  const parts = parseBold(text);
  return (
    <span style={style}>
      {parts.map((p) =>
        p.bold ? (
          <strong key={p.key} style={{ fontWeight: 700, color: C.navy }}>
            {p.text}
          </strong>
        ) : (
          <span key={p.key}>{p.text}</span>
        )
      )}
    </span>
  );
}

function Section({ section }) {
  if (section.type === "text") {
    return (
      <p style={{ fontSize: 16, lineHeight: 1.6, color: C.navy, marginBottom: 16 }}>
        <RichText text={section.content} />
      </p>
    );
  }
  if (section.type === "heading") {
    return (
      <p style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: "18px 0 8px" }}>
        {section.text}
      </p>
    );
  }
  if (section.type === "list") {
    return (
      <ul style={{ listStyle: "none", padding: 0, marginBottom: 16 }}>
        {section.items.map((item, i) => (
          <li
            key={i}
            style={{
              position: "relative",
              paddingLeft: 24,
              marginBottom: 10,
              lineHeight: 1.55,
              fontSize: 15,
              color: C.navy,
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 2,
                top: 10,
                width: 10,
                height: 3,
                background: C.sky,
              }}
            />
            <RichText text={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (section.type === "callout") {
    const bg =
      section.variant === "warn"
        ? "#FCECC4"
        : section.variant === "danger"
        ? "#F6D5CC"
        : section.variant === "success"
        ? "#D2E9DC"
        : C.skyLight;
    const border =
      section.variant === "warn"
        ? C.warn
        : section.variant === "danger"
        ? C.error
        : section.variant === "success"
        ? C.success
        : C.navy;
    return (
      <div
        style={{
          background: bg,
          borderLeft: `4px solid ${border}`,
          padding: "18px 20px",
          margin: "22px 0",
          fontSize: 15,
          lineHeight: 1.5,
          color: C.navy,
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            marginBottom: 8,
            color: C.navy,
          }}
        >
          {section.title}
        </div>
        <RichText text={section.content} />
      </div>
    );
  }
  if (section.type === "rule") {
    const isDo = section.variant === "do";
    return (
      <div
        style={{
          background: isDo ? "#ECF4EF" : "#FDF0EE",
          padding: "16px 18px",
          marginBottom: 10,
          borderLeft: `3px solid ${isDo ? C.success : C.error}`,
          boxShadow: "0 2px 8px rgba(13,27,62,0.04)",
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: 1,
            marginBottom: 4,
            color: isDo ? C.success : C.error,
          }}
        >
          {isDo ? "✓ SÍ" : "✕ NO"}
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.45, color: C.navy }}>{section.text}</div>
      </div>
    );
  }
  if (section.type === "step") {
    return (
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            background: C.navy,
            color: C.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 18,
          }}
        >
          {section.num}
        </div>
        <div style={{ flex: 1, paddingTop: 8, fontSize: 15, lineHeight: 1.5, color: C.navy }}>
          <RichText text={section.text} />
        </div>
      </div>
    );
  }
  return null;
}

export default function CursoModulo({ modulo }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: 2.5,
          color: C.sand,
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {modulo.num}
      </div>
      <h2
        style={{
          fontSize: 26,
          fontWeight: 900,
          lineHeight: 1.2,
          color: C.navy,
          margin: 0,
          letterSpacing: "-0.3px",
        }}
      >
        {modulo.titulo}
      </h2>
      <div
        style={{
          width: 40,
          height: 3,
          background: C.sky,
          marginTop: 12,
          marginBottom: 20,
        }}
      />
      {modulo.intro && (
        <p style={{ fontSize: 16, lineHeight: 1.6, color: C.navy, marginBottom: 20 }}>
          <RichText text={modulo.intro} />
        </p>
      )}
      {modulo.sections.map((s, i) => (
        <Section key={i} section={s} />
      ))}
    </div>
  );
}
