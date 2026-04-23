// Pantalla final: certificado aprobado o feedback de error con opción de reintentar
const C = {
  navy: "#0D1B3E",
  navyLight: "#1E2D5C",
  sand: "#C8B99A",
  sandLight: "#E4DAC2",
  sky: "#8ECAE6",
  cream: "#FAF6EE",
  white: "#FFFFFF",
  success: "#3D8B5E",
  error: "#B84545",
  warn: "#D4A147",
};

function formatFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

export default function CursoResultado({
  trabajador,
  result,          // { passed, score, codigo, expires_at }
  preguntas,
  answers,         // [{ qid, option }]
  onRetry,
}) {
  const { passed, score, codigo, expires_at } = result;

  // Preguntas falladas para repaso (solo si no pasó)
  const wrong = !passed
    ? preguntas
        .map((p) => {
          const a = answers.find((x) => x.qid === p.id);
          const selected = a ? a.option : null;
          return selected !== null && selected !== p.correct ? { p, selected } : null;
        })
        .filter(Boolean)
    : [];

  const verifyUrl = codigo ? `https://www.atolon.co/verificar/${codigo}` : "";
  const qrUrl = codigo
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(verifyUrl)}&size=220x220`
    : "";

  return (
    <div>
      {/* Puntaje */}
      <div style={{ textAlign: "center", padding: "20px 0 30px" }}>
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: C.navy,
            lineHeight: 1,
            marginBottom: 8,
            letterSpacing: "-3px",
          }}
        >
          {score}%
        </div>
        <div
          style={{
            fontSize: 12,
            letterSpacing: 2,
            color: C.sand,
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 24,
          }}
        >
          Puntaje final
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 900,
            marginBottom: 10,
            color: passed ? C.success : C.error,
          }}
        >
          {passed ? "¡Aprobado!" : "No aprobado"}
        </div>
        <p
          style={{
            fontSize: 15,
            color: C.navyLight,
            lineHeight: 1.5,
            maxWidth: 360,
            margin: "0 auto",
          }}
        >
          {passed
            ? "Felicitaciones. Su certificado está listo. Guárdelo o preséntelo al ingresar al muelle."
            : "Necesita al menos 70% para aprobar. Repase el material y vuelva a intentarlo — puede hacerlo cuantas veces necesite."}
        </p>
      </div>

      {/* Certificado o repaso */}
      {passed ? (
        <>
          <div
            style={{
              background: C.white,
              padding: "40px 28px",
              border: `3px double ${C.navy}`,
              margin: "20px 0",
              textAlign: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 3,
                color: C.sand,
                fontWeight: 700,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Certificado de inducción
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: 2,
                color: C.navy,
                marginBottom: 4,
              }}
            >
              ATOLÓN BEACH CLUB
            </div>
            <div
              style={{
                fontSize: 10,
                color: C.sand,
                fontStyle: "italic",
                letterSpacing: 1,
                marginBottom: 24,
              }}
            >
              Interop Colombia S.A.S.
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                lineHeight: 1.2,
                color: C.navy,
                margin: "24px 0 8px",
                letterSpacing: "-0.5px",
              }}
            >
              Curso de inducción
              <br />
              para contratistas y proveedores
            </div>

            <p style={{ fontSize: 13, color: C.navyLight, lineHeight: 1.5, marginBottom: 8 }}>
              Se certifica que
            </p>

            <div
              style={{
                fontSize: 24,
                fontWeight: 900,
                color: C.navy,
                padding: "12px 0",
                borderTop: `1px solid ${C.sand}`,
                borderBottom: `1px solid ${C.sand}`,
                margin: "16px 0",
                letterSpacing: "-0.3px",
                lineHeight: 1.2,
              }}
            >
              {(trabajador?.nombre || "").toUpperCase()}
            </div>

            <p style={{ fontSize: 13, color: C.navyLight, marginBottom: 16 }}>
              C.C. {trabajador?.cedula || "—"}
            </p>

            <p style={{ fontSize: 12, lineHeight: 1.55, color: C.navyLight, marginBottom: 20 }}>
              Ha completado satisfactoriamente el curso de inducción obligatorio previo al ingreso
              a la propiedad de Atolón Beach Club, en cumplimiento del Protocolo PR-CON-002 y del
              Decreto 1072 de 2015.
            </p>

            {/* QR */}
            {qrUrl && (
              <div style={{ margin: "20px auto" }}>
                <img
                  src={qrUrl}
                  alt="Código QR del certificado"
                  style={{ width: 180, height: 180, margin: "0 auto", display: "block" }}
                />
                <div style={{ fontSize: 10, color: C.navyLight, marginTop: 6 }}>
                  Escanee para verificar
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: "1px solid rgba(13,27,62,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 1.5,
                  color: C.sand,
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                Código único
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 14,
                  color: C.navy,
                  fontWeight: 700,
                  wordBreak: "break-all",
                }}
              >
                {codigo}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-around",
                gap: 12,
                paddingTop: 16,
                marginTop: 20,
                borderTop: "1px solid rgba(13,27,62,0.08)",
              }}
            >
              <div style={{ flex: 1, textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: 1.5,
                    color: C.sand,
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  Emitido
                </div>
                <div style={{ fontSize: 11, color: C.navy, fontWeight: 700 }}>
                  {formatFecha(new Date().toISOString())}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: 1.5,
                    color: C.sand,
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  Vigencia
                </div>
                <div style={{ fontSize: 11, color: C.navy, fontWeight: 700 }}>
                  {formatFecha(expires_at)}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 9,
                    letterSpacing: 1.5,
                    color: C.sand,
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  Puntaje
                </div>
                <div style={{ fontSize: 11, color: C.navy, fontWeight: 700 }}>{score}%</div>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#D2E9DC",
              borderLeft: `4px solid ${C.success}`,
              padding: "18px 20px",
              margin: "22px 0",
              fontSize: 14,
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
              Qué sigue
            </div>
            Recibirá una copia de su certificado por correo electrónico. Preséntelo o muestre el
            QR al ingresar al muelle. Su certificado es válido por 12 meses.
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              onClick={() => window.print()}
              style={{
                flex: 1,
                padding: "17px 20px",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                fontFamily: "inherit",
                border: `1.5px solid ${C.navy}`,
                background: "transparent",
                color: C.navy,
                cursor: "pointer",
              }}
            >
              Imprimir
            </button>
            <a
              href={verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                padding: "17px 20px",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                fontFamily: "inherit",
                border: "none",
                background: C.navy,
                color: C.white,
                cursor: "pointer",
                textDecoration: "none",
                textAlign: "center",
                display: "block",
              }}
            >
              Verificar
            </a>
          </div>
        </>
      ) : (
        <>
          {wrong.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3
                style={{
                  fontSize: 14,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: C.navy,
                  margin: "24px 0 16px",
                  borderBottom: `1px solid ${C.sand}`,
                  paddingBottom: 8,
                }}
              >
                Preguntas a revisar ({wrong.length})
              </h3>
              {wrong.map(({ p }, i) => (
                <div
                  key={i}
                  style={{
                    background: C.white,
                    marginBottom: 10,
                    borderLeft: `3px solid ${C.warn}`,
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: C.navy,
                      marginBottom: 6,
                    }}
                  >
                    {p.q}
                  </div>
                  <div style={{ fontSize: 13, color: C.navyLight, lineHeight: 1.5 }}>
                    <strong>Respuesta correcta:</strong> {p.options[p.correct]}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.navyLight,
                      lineHeight: 1.5,
                      marginTop: 6,
                    }}
                  >
                    {p.explain}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={onRetry}
            style={{
              display: "block",
              width: "100%",
              marginTop: 24,
              padding: "17px 20px",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontFamily: "inherit",
              border: "none",
              background: C.navy,
              color: C.white,
              cursor: "pointer",
            }}
          >
            Repetir el quiz
          </button>
        </>
      )}
    </div>
  );
}
