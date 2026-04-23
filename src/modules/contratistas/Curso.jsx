// Orquestador del curso de inducción SST — Fase 4
// Flow: Landing → Módulos educativos → Quiz → Resultado (certificado o reintento)
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { MODULOS, PREGUNTAS, SUBMIT_URL } from "./cursoContent";
import CursoModulo from "./CursoModulo";
import CursoQuiz from "./CursoQuiz";
import CursoResultado from "./CursoResultado";

const C = {
  navy: "#0D1B3E",
  navyLight: "#1E2D5C",
  sand: "#C8B99A",
  sandLight: "#E4DAC2",
  sky: "#8ECAE6",
  skyLight: "#C9E4F0",
  cream: "#FAF6EE",
  white: "#FFFFFF",
  success: "#3D8B5E",
  error: "#B84545",
};

// Stages: "landing" | "modulo-0..5" | "quiz" | "submitting" | "result"
export default function Curso({ token }) {
  const [trabajador, setTrabajador] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState("landing");
  const [moduloIdx, setModuloIdx] = useState(0);
  const [quizIdx, setQuizIdx] = useState(0);
  const [answers, setAnswers] = useState([]); // [{ qid, option }]
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  const storageKey = `curso_progress_${token}`;

  const isDemo = token === "demo" || token === "preview";

  // Cargar trabajador + progreso local
  useEffect(() => {
    (async () => {
      if (!token) { setLoading(false); return; }

      // Modo demo/preview — no requiere trabajador en DB
      if (isDemo) {
        setTrabajador({ nombre: "Demo", cedula: "0", correo: "", id: "demo", curso_completado: false });
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("contratistas_trabajadores")
        .select("id, nombre, cedula, correo, curso_completado, curso_score, curso_codigo")
        .eq("curso_token", token)
        .maybeSingle();
      setTrabajador(data);

      if (data?.curso_completado) {
        setAlreadyCompleted(true);
      } else {
        // Restaurar progreso
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.stage) setStage(saved.stage);
            if (typeof saved.moduloIdx === "number") setModuloIdx(saved.moduloIdx);
            if (typeof saved.quizIdx === "number") setQuizIdx(saved.quizIdx);
            if (Array.isArray(saved.answers)) setAnswers(saved.answers);
          }
        } catch {}
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Persistir progreso
  useEffect(() => {
    if (!token || loading) return;
    if (stage === "result" || alreadyCompleted) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ stage, moduloIdx, quizIdx, answers })
      );
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, moduloIdx, quizIdx, answers, loading]);

  // Progress bar (0-100%)
  const progress = useMemo(() => {
    if (stage === "landing") return 0;
    if (stage.startsWith("modulo")) {
      // Módulos ocupan 0-60%
      return Math.round(((moduloIdx + 1) / MODULOS.length) * 60);
    }
    if (stage === "quiz" || stage === "submitting") {
      // Quiz ocupa 60-95%
      return 60 + Math.round((quizIdx / PREGUNTAS.length) * 35);
    }
    if (stage === "result") return 100;
    return 0;
  }, [stage, moduloIdx, quizIdx]);

  const scrollTop = () => {
    // Multi-target scroll — algunos browsers scrollean body, otros documentElement, y si hay
    // contenedor scrollable interno lo buscamos también.
    const doScroll = () => {
      try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch {}
      try { document.documentElement.scrollTop = 0; } catch {}
      try { document.body.scrollTop = 0; } catch {}
      // Scroll cualquier contenedor con overflow auto/scroll al inicio
      try {
        document.querySelectorAll("[data-curso-scroll], main, .curso-scroll").forEach(el => { el.scrollTop = 0; });
      } catch {}
    };
    // Ejecutar ya + después del próximo paint para asegurar que sucede post-render
    doScroll();
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 100);
  };

  // Auto-scroll al tope cuando cambia de página/módulo/pregunta
  useEffect(() => { scrollTop(); }, [stage, moduloIdx, quizIdx]);

  // Handlers
  function startCurso() {
    setStage("modulo");
    setModuloIdx(0);
    scrollTop();
  }

  function nextModulo() {
    if (moduloIdx < MODULOS.length - 1) {
      setModuloIdx(moduloIdx + 1);
      scrollTop();
    } else {
      // Ir al quiz
      setStage("quiz");
      setQuizIdx(0);
      setAnswers([]);
      setSelected(null);
      setAnswered(false);
      scrollTop();
    }
  }

  function prevModulo() {
    if (moduloIdx > 0) {
      setModuloIdx(moduloIdx - 1);
      scrollTop();
    } else {
      setStage("landing");
      scrollTop();
    }
  }

  function selectOption(i) {
    if (answered) return;
    setSelected(i);
  }

  function confirmAnswer() {
    if (selected === null) return;
    const q = PREGUNTAS[quizIdx];
    setAnswers((prev) => {
      const filtered = prev.filter((a) => a.qid !== q.id);
      return [...filtered, { qid: q.id, option: selected }];
    });
    setAnswered(true);
  }

  async function nextQuestion() {
    if (quizIdx < PREGUNTAS.length - 1) {
      setQuizIdx(quizIdx + 1);
      setSelected(null);
      setAnswered(false);
      scrollTop();
    } else {
      // Submit
      await submitQuiz();
    }
  }

  async function submitQuiz() {
    setStage("submitting");
    setSubmitError(null);

    // Modo demo: puntuar localmente sin llamar a la Edge Function
    if (isDemo) {
      const total = PREGUNTAS.length;
      let correct = 0;
      PREGUNTAS.forEach(q => {
        const user = answers.find(a => a.qid === q.id);
        if (user && user.option === q.correct) correct++;
      });
      const score = Math.round((correct / total) * 100);
      const passed = score >= 70;
      setTimeout(() => {
        setResult({ ok: true, passed, score, total_questions: total, correct_answers: correct, codigo: passed ? "DEMO-PREVIEW" : null, demo: true });
        setStage("result");
        scrollTop();
      }, 600);
      return;
    }

    try {
      const res = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answers }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error al enviar");
      setResult(data);
      setStage("result");
      // Limpiar progreso guardado si aprobó
      if (data.passed) {
        try { localStorage.removeItem(storageKey); } catch {}
      }
      scrollTop();
    } catch (e) {
      setSubmitError(e.message || "No pudimos enviar sus respuestas");
      setStage("quiz");
    }
  }

  function retryQuiz() {
    setQuizIdx(0);
    setAnswers([]);
    setSelected(null);
    setAnswered(false);
    setResult(null);
    setStage("quiz");
    scrollTop();
  }

  // ===================== RENDER =====================
  if (loading) {
    return (
      <Shell progress={0}>
        <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Cargando…</div>
      </Shell>
    );
  }

  if (!trabajador) {
    return (
      <Shell progress={0}>
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ color: C.navy, fontWeight: 900, fontSize: 22, margin: "0 0 10px" }}>
            Enlace inválido
          </h2>
          <p style={{ color: "#666", lineHeight: 1.5 }}>
            Este enlace no es válido o ha expirado. Contacta a tu empleador para obtener un nuevo
            enlace.
          </p>
        </div>
      </Shell>
    );
  }

  if (alreadyCompleted) {
    const verifyUrl = trabajador.curso_codigo
      ? `https://www.atolon.co/verificar/${trabajador.curso_codigo}`
      : null;
    return (
      <Shell progress={100}>
        <div style={{ padding: "30px 24px 120px", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <h2 style={{ color: C.navy, fontWeight: 900, fontSize: 24, margin: "0 0 10px" }}>
            Ya completaste el curso
          </h2>
          <p style={{ color: C.navyLight, lineHeight: 1.5, marginBottom: 20 }}>
            <strong>{trabajador.nombre}</strong> — CC {trabajador.cedula}
          </p>
          {trabajador.curso_score != null && (
            <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
              Puntaje: <strong>{trabajador.curso_score}%</strong>
            </p>
          )}
          {verifyUrl && (
            <div style={{ marginTop: 20 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 2,
                  color: C.sand,
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                Código del certificado
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.navy,
                  marginBottom: 20,
                }}
              >
                {trabajador.curso_codigo}
              </div>
              <a
                href={verifyUrl}
                style={{
                  display: "inline-block",
                  padding: "14px 28px",
                  background: C.navy,
                  color: C.white,
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                }}
              >
                Ver certificado
              </a>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // Landing
  if (stage === "landing") {
    return (
      <Shell progress={progress}>
        <div style={{ padding: "28px 24px 120px" }}>
          <div style={{ textAlign: "center", padding: "20px 0 40px" }}>
            <div style={{ fontSize: 24, letterSpacing: 3, fontWeight: 900, color: C.navy, marginBottom: 4 }}>
              ATOLÓN
            </div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 2,
                color: C.sand,
                fontWeight: 600,
                textTransform: "uppercase",
                marginBottom: 30,
              }}
            >
              Beach Club · Cartagena
            </div>

            <h1
              style={{
                fontSize: 28,
                fontWeight: 900,
                lineHeight: 1.15,
                marginBottom: 14,
                color: C.navy,
                letterSpacing: "-0.5px",
              }}
            >
              Curso de inducción
            </h1>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                color: C.navyLight,
                marginBottom: 20,
                padding: "0 10px",
              }}
            >
              Hola <strong style={{ color: C.navy }}>{trabajador.nombre}</strong>. Este curso
              toma unos 15 minutos y es obligatorio antes de ingresar a la isla. Al terminar
              recibirás tu certificado.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 24,
                marginBottom: 30,
                padding: "18px 0",
                borderTop: "1px solid rgba(13,27,62,0.12)",
                borderBottom: "1px solid rgba(13,27,62,0.12)",
              }}
            >
              <Meta num="6" label="Módulos" />
              <Meta num="15" label="Preguntas" />
              <Meta num="15'" label="Minutos" />
            </div>

            <div
              style={{
                background: C.skyLight,
                borderLeft: `4px solid ${C.navy}`,
                padding: "18px 20px",
                fontSize: 14,
                lineHeight: 1.5,
                color: C.navy,
                textAlign: "left",
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Antes de empezar
              </div>
              Lee con calma cada módulo. Al final habrá un quiz de 15 preguntas. Necesitas acertar
              al menos el 70% para aprobar. Tu nombre y cédula aparecerán en el certificado.
            </div>
          </div>
        </div>
        <ActionBar>
          <PrimaryBtn onClick={startCurso}>Empezar curso →</PrimaryBtn>
        </ActionBar>
      </Shell>
    );
  }

  // Módulo educativo
  if (stage === "modulo") {
    const modulo = MODULOS[moduloIdx];
    const isLast = moduloIdx === MODULOS.length - 1;
    return (
      <Shell progress={progress}>
        <div style={{ padding: "28px 24px 120px" }}>
          <CursoModulo modulo={modulo} />
        </div>
        <ActionBar>
          <div style={{ display: "flex", gap: 10 }}>
            <SecondaryBtn onClick={prevModulo}>Atrás</SecondaryBtn>
            <PrimaryBtn onClick={nextModulo}>
              {isLast ? "Ir al quiz →" : "Siguiente →"}
            </PrimaryBtn>
          </div>
        </ActionBar>
      </Shell>
    );
  }

  // Quiz
  if (stage === "quiz" || stage === "submitting") {
    const pregunta = PREGUNTAS[quizIdx];
    const isLast = quizIdx === PREGUNTAS.length - 1;
    const submitting = stage === "submitting";

    return (
      <Shell progress={progress}>
        <div style={{ padding: "28px 24px 120px" }}>
          <CursoQuiz
            pregunta={pregunta}
            currentIndex={quizIdx}
            total={PREGUNTAS.length}
            selected={selected}
            onSelect={selectOption}
            answered={answered}
          />
          {submitError && (
            <div
              style={{
                background: "#F6D5CC",
                borderLeft: `3px solid ${C.error}`,
                padding: "14px 16px",
                color: C.navy,
                fontSize: 13,
                marginTop: 10,
              }}
            >
              {submitError}. Toca "{isLast ? "Enviar" : "Siguiente"}" de nuevo para reintentar.
            </div>
          )}
        </div>
        <ActionBar>
          {!answered ? (
            <PrimaryBtn onClick={confirmAnswer} disabled={selected === null || submitting}>
              Responder
            </PrimaryBtn>
          ) : (
            <PrimaryBtn onClick={nextQuestion} disabled={submitting}>
              {submitting ? "Enviando…" : isLast ? "Enviar respuestas →" : "Siguiente pregunta →"}
            </PrimaryBtn>
          )}
        </ActionBar>
      </Shell>
    );
  }

  // Resultado
  if (stage === "result" && result) {
    return (
      <Shell progress={100}>
        <div style={{ padding: "28px 24px 120px" }}>
          <CursoResultado
            trabajador={trabajador}
            result={result}
            preguntas={PREGUNTAS}
            answers={answers}
            onRetry={retryQuiz}
          />
        </div>
      </Shell>
    );
  }

  return null;
}

// ---------- Subcomponentes de layout ----------
function Shell({ children, progress }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.cream,
        backgroundImage:
          "radial-gradient(circle at 10% 10%, rgba(142,202,230,0.08) 0%, transparent 40%),radial-gradient(circle at 90% 90%, rgba(200,185,154,0.12) 0%, transparent 50%)",
        backgroundAttachment: "fixed",
        fontFamily: "Arial, system-ui, sans-serif",
        color: C.navy,
      }}
    >
      <div
        style={{
          maxWidth: 500,
          margin: "0 auto",
          minHeight: "100vh",
          background: C.cream,
          boxShadow: "0 0 60px rgba(13,27,62,0.08)",
          position: "relative",
        }}
      >
        {/* Topbar */}
        <div
          style={{
            background: C.navy,
            color: C.white,
            padding: "18px 20px 14px",
            position: "sticky",
            top: 0,
            zIndex: 100,
            boxShadow: "0 2px 12px rgba(13,27,62,0.25)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              letterSpacing: 2,
              fontWeight: 700,
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            ATOLÓN BEACH CLUB
          </div>
          <div style={{ fontSize: 11, color: C.sand, letterSpacing: 0.5, fontStyle: "italic" }}>
            Curso de inducción para contratistas · PR-CON-002
          </div>
          <div
            style={{
              marginTop: 14,
              height: 3,
              background: "rgba(255,255,255,0.15)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: C.sky,
                width: `${progress}%`,
                transition: "width 0.5s cubic-bezier(0.65,0,0.35,1)",
                boxShadow: `0 0 8px ${C.sky}`,
              }}
            />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function ActionBar({ children }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 500,
        background: C.cream,
        padding: "16px 24px 20px",
        borderTop: "1px solid rgba(13,27,62,0.08)",
        zIndex: 50,
      }}
    >
      {children}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block",
        width: "100%",
        padding: "17px 20px",
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        fontFamily: "inherit",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? "#999" : C.navy,
        color: C.white,
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.2s ease",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "17px 20px",
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        fontFamily: "inherit",
        border: `1.5px solid ${C.navy}`,
        cursor: "pointer",
        background: "transparent",
        color: C.navy,
        transition: "all 0.2s ease",
      }}
    >
      {children}
    </button>
  );
}

function Meta({ num, label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: C.navy }}>{num}</div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.2,
          color: C.sand,
          textTransform: "uppercase",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
