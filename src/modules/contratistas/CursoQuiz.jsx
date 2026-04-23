// Vista de una pregunta del quiz
const C = {
  navy: "#0D1B3E",
  sand: "#C8B99A",
  sky: "#8ECAE6",
  skyLight: "#C9E4F0",
  cream: "#FAF6EE",
  white: "#FFFFFF",
  success: "#3D8B5E",
  error: "#B84545",
};

export default function CursoQuiz({
  pregunta,
  currentIndex,
  total,
  selected,
  onSelect,
  answered,
}) {
  const isCorrect = answered && selected === pregunta.correct;

  return (
    <div>
      <div
        style={{
          textAlign: "center",
          marginBottom: 28,
          paddingBottom: 20,
          borderBottom: "1px solid rgba(13,27,62,0.12)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 2.5,
            color: C.sand,
            fontWeight: 700,
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Pregunta {currentIndex + 1} de {total}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            lineHeight: 1.3,
            color: C.navy,
            letterSpacing: "-0.3px",
          }}
        >
          {pregunta.q}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {pregunta.options.map((opt, i) => {
          let bg = C.white;
          let border = "1.5px solid rgba(13,27,62,0.18)";
          let color = C.navy;

          if (answered) {
            if (i === pregunta.correct) {
              bg = "#D2E9DC";
              border = `1.5px solid ${C.success}`;
            } else if (i === selected) {
              bg = "#F6D5CC";
              border = `1.5px solid ${C.error}`;
            }
          } else if (i === selected) {
            bg = C.navy;
            color = C.white;
            border = `1.5px solid ${C.navy}`;
          }

          return (
            <button
              key={i}
              onClick={() => !answered && onSelect(i)}
              disabled={answered}
              style={{
                background: bg,
                border,
                padding: "16px 20px",
                fontSize: 15,
                lineHeight: 1.4,
                color,
                cursor: answered ? "default" : "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                width: "100%",
                transition: "all 0.2s ease",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          style={{
            padding: "16px 18px",
            marginBottom: 20,
            fontSize: 14,
            lineHeight: 1.5,
            background: isCorrect ? "#D2E9DC" : "#F6D5CC",
            borderLeft: `3px solid ${isCorrect ? C.success : C.error}`,
            color: C.navy,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              marginBottom: 4,
              fontSize: 12,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            {isCorrect ? "✓ Correcto" : "✕ Respuesta incorrecta"}
          </div>
          <div>{pregunta.explain}</div>
        </div>
      )}
    </div>
  );
}
