import { useState } from "react";
import { B, COP, PASADIAS } from "../brand";

// ─── Translations ────────────────────────────────────────────────────────────
const T = {
  ES: {
    header:         "Atolon Beach Club",
    subtitle:       "Reserva tu experiencia de isla",
    step1:          "Tipo de Pass",
    step2:          "Fecha y personas",
    step3:          "Tus datos",
    step4:          "Resumen",
    stepLabels:     ["Pass", "Fecha", "Datos", "Pago"],
    next:           "Continuar",
    back:           "Atrás",
    pay:            "Pagar",
    selectPass:     "Selecciona tu Pass",
    selectDate:     "Selecciona la fecha",
    pax:            "Personas",
    minPax:         "Mínimo",
    nombre:         "Nombre completo",
    email:          "Correo electrónico",
    telefono:       "Teléfono",
    notas:          "Notas / solicitudes especiales",
    orderSummary:   "Resumen de tu pedido",
    passType:       "Pass",
    date:           "Fecha",
    people:         "Personas",
    unitPrice:      "Precio por persona",
    total:          "Total",
    payNotice:      "Pasarela de pago coming soon",
    descs: {
      "VIP Pass":          "Acceso full day a la isla con almuerzo, bebidas y actividades acuáticas incluidas.",
      "Exclusive Pass":    "Experiencia premium con pool cabana: zona privada, open bar y atención personalizada.",
      "Atolon Experience": "Máximo lujo 100% consumible: traslado en yate privado, chef a bordo y acceso VIP a todas las áreas.",
      "After Island":      "Llega en tu propia embarcación: disfruta la isla de noche con música, coctelería y vistas únicas.",
    },
    perPerson:   "por persona",
    minLabel:    pax => `Mínimo ${pax} ${pax === 1 ? "persona" : "personas"}`,
    required:    "Este campo es obligatorio",
    invalidEmail:"Correo inválido",
    invalidPhone:"Teléfono inválido",
  },
  EN: {
    header:         "Atolon Beach Club",
    subtitle:       "Book your island experience",
    step1:          "Pass Type",
    step2:          "Date & Guests",
    step3:          "Your Info",
    step4:          "Summary",
    stepLabels:     ["Pass", "Date", "Info", "Pay"],
    next:           "Continue",
    back:           "Back",
    pay:            "Pay",
    selectPass:     "Select your Pass",
    selectDate:     "Select date",
    pax:            "Guests",
    minPax:         "Minimum",
    nombre:         "Full name",
    email:          "Email address",
    telefono:       "Phone number",
    notas:          "Notes / special requests",
    orderSummary:   "Order summary",
    passType:       "Pass",
    date:           "Date",
    people:         "Guests",
    unitPrice:      "Price per person",
    total:          "Total",
    payNotice:      "Payment gateway coming soon",
    descs: {
      "VIP Pass":          "Full-day island access with lunch, drinks and water activities included.",
      "Exclusive Pass":    "Premium experience with pool cabana: private area, open bar and personalized service.",
      "Atolon Experience": "Maximum luxury 100% consumable: private yacht transfer, on-board chef and VIP access to all areas.",
      "After Island":      "Arrive on your own vessel: enjoy the island at night with music, cocktails and unique views.",
    },
    perPerson:   "per person",
    minLabel:    pax => `Minimum ${pax} ${pax === 1 ? "person" : "people"}`,
    required:    "This field is required",
    invalidEmail:"Invalid email",
    invalidPhone:"Invalid phone number",
  },
  PT: {
    header:         "Atolon Beach Club",
    subtitle:       "Reserve sua experiência na ilha",
    step1:          "Tipo de Pass",
    step2:          "Data e pessoas",
    step3:          "Seus dados",
    step4:          "Resumo",
    stepLabels:     ["Pass", "Data", "Dados", "Pag."],
    next:           "Continuar",
    back:           "Voltar",
    pay:            "Pagar",
    selectPass:     "Escolha seu Pass",
    selectDate:     "Selecione a data",
    pax:            "Pessoas",
    minPax:         "Mínimo",
    nombre:         "Nome completo",
    email:          "Endereço de e-mail",
    telefono:       "Telefone",
    notas:          "Notas / pedidos especiais",
    orderSummary:   "Resumo do pedido",
    passType:       "Pass",
    date:           "Data",
    people:         "Pessoas",
    unitPrice:      "Preço por pessoa",
    total:          "Total",
    payNotice:      "Plataforma de pagamento em breve",
    descs: {
      "VIP Pass":          "Acesso dia inteiro à ilha com almoço, bebidas e atividades aquáticas incluídas.",
      "Exclusive Pass":    "Experiência premium com pool cabana: área privativa, open bar e atendimento personalizado.",
      "Atolon Experience": "Máximo luxo 100% consumível: transfer em iate privado, chef a bordo e acesso VIP a todas as áreas.",
      "After Island":      "Chegue na sua própria embarcação: aproveite a ilha à noite com música, drinks e vistas únicas.",
    },
    perPerson:   "por pessoa",
    minLabel:    pax => `Mínimo ${pax} ${pax === 1 ? "pessoa" : "pessoas"}`,
    required:    "Este campo é obrigatório",
    invalidEmail:"E-mail inválido",
    invalidPhone:"Telefone inválido",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const LANGS = ["ES", "EN", "PT"];

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BookingWidget() {
  const [lang,  setLang]  = useState("ES");
  const [step,  setStep]  = useState(1); // 1–4
  const [pass,  setPass]  = useState(null);
  const [date,  setDate]  = useState("");
  const [pax,   setPax]   = useState(1);
  const [form,  setForm]  = useState({ nombre: "", email: "", telefono: "", notas: "" });
  const [errors, setErrors] = useState({});
  const [paid,  setPaid]  = useState(false);

  const t = T[lang];
  const passData = pass !== null ? PASADIAS[pass] : null;
  const total = passData ? passData.precio * pax : 0;

  // ── styles (shared) ────────────────────────────────────────────────
  const s = {
    page: {
      minHeight:       "100vh",
      background:      `linear-gradient(160deg, ${B.navy} 0%, ${B.navyMid} 55%, ${B.navyLight} 100%)`,
      fontFamily:      "'Segoe UI', Arial, sans-serif",
      color:           B.white,
      display:         "flex",
      flexDirection:   "column",
      alignItems:      "center",
      padding:         "0 0 60px",
    },
    header: {
      width:           "100%",
      background:      `linear-gradient(90deg, ${B.sand}22 0%, ${B.sky}33 100%)`,
      borderBottom:    `1px solid ${B.sand}44`,
      padding:         "18px 24px 14px",
      display:         "flex",
      justifyContent:  "space-between",
      alignItems:      "center",
      boxSizing:       "border-box",
    },
    headerTitle: {
      display:         "flex",
      flexDirection:   "column",
    },
    brandName: {
      fontSize:        "1.5rem",
      fontWeight:      700,
      letterSpacing:   "0.04em",
      background:      `linear-gradient(90deg, ${B.sand}, ${B.sky})`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
    },
    brandSub: {
      fontSize:        "0.8rem",
      color:           `${B.sand}cc`,
      marginTop:       2,
    },
    langSwitcher: {
      display:         "flex",
      gap:             6,
    },
    langBtn: (active) => ({
      background:      active ? B.sand : "transparent",
      color:           active ? B.navy : `${B.sand}99`,
      border:          `1px solid ${active ? B.sand : B.sand + "55"}`,
      borderRadius:    6,
      padding:         "4px 10px",
      fontSize:        "0.75rem",
      fontWeight:      700,
      cursor:          "pointer",
      letterSpacing:   "0.06em",
      transition:      "all 0.15s",
    }),
    container: {
      width:           "100%",
      maxWidth:        580,
      padding:         "0 16px",
      boxSizing:       "border-box",
    },
    progressWrap: {
      margin:          "28px 0 24px",
      position:        "relative",
    },
    progressTrack: {
      display:         "flex",
      justifyContent:  "space-between",
      alignItems:      "center",
      position:        "relative",
    },
    progressLine: {
      position:        "absolute",
      top:             "50%",
      left:            "12%",
      right:           "12%",
      height:          2,
      background:      `${B.sand}33`,
      zIndex:          0,
      transform:       "translateY(-50%)",
    },
    progressFill: {
      position:        "absolute",
      top:             "50%",
      left:            "12%",
      height:          2,
      background:      `linear-gradient(90deg, ${B.sand}, ${B.sky})`,
      zIndex:          1,
      transform:       "translateY(-50%)",
      transition:      "width 0.35s ease",
      width:           `${((step - 1) / 3) * 76}%`,
    },
    stepDot: (active, done) => ({
      width:           36,
      height:          36,
      borderRadius:    "50%",
      border:          `2px solid ${done || active ? B.sand : B.sand + "44"}`,
      background:      done ? B.sand : active ? B.navyLight : "transparent",
      color:           done ? B.navy : active ? B.sand : `${B.sand}66`,
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
      fontWeight:      700,
      fontSize:        "0.8rem",
      zIndex:          2,
      position:        "relative",
      transition:      "all 0.2s",
      flexShrink:      0,
    }),
    stepLabel: (active, done) => ({
      fontSize:        "0.65rem",
      color:           done || active ? B.sand : `${B.sand}55`,
      marginTop:       6,
      textAlign:       "center",
      letterSpacing:   "0.04em",
      textTransform:   "uppercase",
    }),
    stepItem: {
      display:         "flex",
      flexDirection:   "column",
      alignItems:      "center",
      width:           "25%",
    },
    sectionTitle: {
      fontSize:        "1.1rem",
      fontWeight:      600,
      marginBottom:    18,
      color:           B.sand,
      letterSpacing:   "0.03em",
    },
    // ── Pass cards ──────────────────────────────────────────────────
    cardsGrid: {
      display:         "grid",
      gridTemplateColumns: "1fr 1fr",
      gap:             12,
      marginBottom:    24,
    },
    passCard: (selected) => ({
      background:      selected
        ? `linear-gradient(135deg, ${B.navyLight}, ${B.navy})`
        : `${B.navyMid}cc`,
      border:          `2px solid ${selected ? B.sky : B.sand + "30"}`,
      borderRadius:    12,
      padding:         "16px 14px",
      cursor:          "pointer",
      transition:      "all 0.2s",
      boxShadow:       selected ? `0 0 18px ${B.sky}44` : "none",
    }),
    cardBadge: {
      fontSize:        "0.65rem",
      fontWeight:      700,
      letterSpacing:   "0.08em",
      textTransform:   "uppercase",
      color:           B.sky,
      marginBottom:    4,
    },
    cardName: {
      fontSize:        "0.95rem",
      fontWeight:      700,
      color:           B.white,
      marginBottom:    4,
    },
    cardPrice: {
      fontSize:        "1.05rem",
      fontWeight:      800,
      color:           B.sand,
      marginBottom:    6,
    },
    cardDesc: {
      fontSize:        "0.72rem",
      color:           `${B.white}99`,
      lineHeight:      1.5,
    },
    cardMin: {
      fontSize:        "0.68rem",
      color:           `${B.sky}bb`,
      marginTop:       8,
      fontStyle:       "italic",
    },
    // ── Step 2 ──────────────────────────────────────────────────────
    field: {
      marginBottom:    18,
    },
    label: {
      display:         "block",
      fontSize:        "0.78rem",
      color:           `${B.sand}cc`,
      marginBottom:    6,
      letterSpacing:   "0.04em",
      textTransform:   "uppercase",
    },
    input: (err) => ({
      width:           "100%",
      background:      `${B.navyMid}`,
      border:          `1px solid ${err ? B.danger : B.sand + "44"}`,
      borderRadius:    8,
      padding:         "11px 14px",
      color:           B.white,
      fontSize:        "0.95rem",
      outline:         "none",
      boxSizing:       "border-box",
      transition:      "border-color 0.15s",
    }),
    textarea: (err) => ({
      width:           "100%",
      background:      `${B.navyMid}`,
      border:          `1px solid ${err ? B.danger : B.sand + "44"}`,
      borderRadius:    8,
      padding:         "11px 14px",
      color:           B.white,
      fontSize:        "0.95rem",
      outline:         "none",
      resize:          "vertical",
      minHeight:       80,
      boxSizing:       "border-box",
      fontFamily:      "inherit",
    }),
    errorText: {
      color:           B.danger,
      fontSize:        "0.72rem",
      marginTop:       4,
    },
    paxRow: {
      display:         "flex",
      alignItems:      "center",
      gap:             12,
      marginTop:       4,
    },
    paxBtn: {
      width:           36,
      height:          36,
      borderRadius:    8,
      border:          `1px solid ${B.sand}66`,
      background:      `${B.navyLight}`,
      color:           B.white,
      fontSize:        "1.2rem",
      cursor:          "pointer",
      display:         "flex",
      alignItems:      "center",
      justifyContent:  "center",
      userSelect:      "none",
      flexShrink:      0,
    },
    paxNum: {
      fontSize:        "1.3rem",
      fontWeight:      700,
      color:           B.sand,
      minWidth:        28,
      textAlign:       "center",
    },
    paxMin: {
      fontSize:        "0.72rem",
      color:           `${B.sky}aa`,
      fontStyle:       "italic",
    },
    // ── Summary ─────────────────────────────────────────────────────
    summaryBox: {
      background:      `${B.navyMid}cc`,
      border:          `1px solid ${B.sand}33`,
      borderRadius:    12,
      padding:         "18px 20px",
      marginBottom:    20,
    },
    summaryRow: {
      display:         "flex",
      justifyContent:  "space-between",
      alignItems:      "center",
      padding:         "7px 0",
      borderBottom:    `1px solid ${B.sand}18`,
      fontSize:        "0.88rem",
    },
    summaryRowLast: {
      display:         "flex",
      justifyContent:  "space-between",
      alignItems:      "center",
      padding:         "10px 0 0",
      fontSize:        "1.05rem",
      fontWeight:      700,
    },
    summaryKey: {
      color:           `${B.sand}bb`,
    },
    summaryVal: {
      color:           B.white,
      fontWeight:      500,
    },
    totalVal: {
      color:           B.sky,
      fontSize:        "1.2rem",
    },
    // ── Buttons ─────────────────────────────────────────────────────
    btnRow: {
      display:         "flex",
      gap:             12,
      marginTop:       8,
    },
    btnBack: {
      flex:            1,
      padding:         "13px 0",
      borderRadius:    8,
      border:          `1px solid ${B.sand}55`,
      background:      "transparent",
      color:           `${B.sand}cc`,
      fontSize:        "0.95rem",
      fontWeight:      600,
      cursor:          "pointer",
      letterSpacing:   "0.04em",
    },
    btnNext: (disabled) => ({
      flex:            2,
      padding:         "13px 0",
      borderRadius:    8,
      border:          "none",
      background:      disabled
        ? `${B.sand}44`
        : `linear-gradient(90deg, ${B.sand}, ${B.sky})`,
      color:           disabled ? `${B.white}55` : B.navy,
      fontSize:        "0.95rem",
      fontWeight:      700,
      cursor:          disabled ? "not-allowed" : "pointer",
      letterSpacing:   "0.05em",
      textTransform:   "uppercase",
      transition:      "all 0.2s",
    }),
    payNotice: {
      textAlign:       "center",
      padding:         "14px",
      background:      `${B.warning}22`,
      border:          `1px solid ${B.warning}55`,
      borderRadius:    8,
      color:           B.warning,
      fontSize:        "0.85rem",
      fontStyle:       "italic",
    },
    successBox: {
      textAlign:       "center",
      padding:         "40px 24px",
    },
    successIcon: {
      fontSize:        "3rem",
      marginBottom:    16,
    },
    successTitle: {
      fontSize:        "1.3rem",
      fontWeight:      700,
      color:           B.success,
      marginBottom:    10,
    },
    successSub: {
      color:           `${B.white}bb`,
      fontSize:        "0.9rem",
    },
  };

  // ── Validation ───────────────────────────────────────────────────────
  function validateStep3() {
    const e = {};
    if (!form.nombre.trim()) e.nombre = t.required;
    if (!form.email.trim()) {
      e.email = t.required;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = t.invalidEmail;
    }
    if (!form.telefono.trim()) {
      e.telefono = t.required;
    } else if (!/^[\d\s+\-()]{7,}$/.test(form.telefono)) {
      e.telefono = t.invalidPhone;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Navigation ───────────────────────────────────────────────────────
  function handleNext() {
    if (step === 1 && pass === null) return;
    if (step === 2 && !date) return;
    if (step === 3) {
      if (!validateStep3()) return;
    }
    if (step === 4) {
      setPaid(true);
      return;
    }
    setStep(s => s + 1);
  }

  function handleBack() {
    if (step > 1) setStep(s => s - 1);
  }

  function handlePaxChange(delta) {
    const min = passData ? passData.minPax : 1;
    setPax(p => Math.max(min, Math.min(50, p + delta)));
  }

  // When a pass is selected, enforce its minimum pax
  function selectPass(idx) {
    setPass(idx);
    const min = PASADIAS[idx].minPax;
    setPax(p => Math.max(p, min));
  }

  // ── Progress bar ─────────────────────────────────────────────────────
  function ProgressBar() {
    return (
      <div style={s.progressWrap}>
        <div style={s.progressTrack}>
          <div style={s.progressLine} />
          <div style={s.progressFill} />
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={s.stepItem}>
              <div style={s.stepDot(step === n, step > n)}>
                {step > n ? "✓" : n}
              </div>
              <div style={s.stepLabel(step === n, step > n)}>
                {t.stepLabels[n - 1]}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Step 1 ────────────────────────────────────────────────────────────
  function Step1() {
    return (
      <div>
        <div style={s.sectionTitle}>{t.selectPass}</div>
        <div style={s.cardsGrid}>
          {PASADIAS.map((p, idx) => (
            <div
              key={p.tipo}
              style={s.passCard(pass === idx)}
              onClick={() => selectPass(idx)}
            >
              <div style={s.cardBadge}>Pass</div>
              <div style={s.cardName}>{p.tipo}</div>
              <div style={s.cardPrice}>{COP(p.precio)}</div>
              <div style={s.cardDesc}>{t.descs[p.tipo]}</div>
              <div style={s.cardMin}>{t.minLabel(p.minPax)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Step 2 ────────────────────────────────────────────────────────────
  function Step2() {
    const min = passData ? passData.minPax : 1;
    return (
      <div>
        <div style={s.sectionTitle}>{t.step2}</div>
        <div style={s.field}>
          <label style={s.label}>{t.selectDate}</label>
          <input
            type="date"
            value={date}
            min={todayISO()}
            onChange={e => setDate(e.target.value)}
            style={{
              ...s.input(false),
              colorScheme: "dark",
            }}
          />
        </div>
        <div style={s.field}>
          <label style={s.label}>{t.pax}</label>
          <div style={s.paxRow}>
            <button
              style={s.paxBtn}
              onClick={() => handlePaxChange(-1)}
              disabled={pax <= min}
            >−</button>
            <span style={s.paxNum}>{pax}</span>
            <button
              style={s.paxBtn}
              onClick={() => handlePaxChange(1)}
            >+</button>
            <span style={s.paxMin}>{t.minLabel(min)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3 ────────────────────────────────────────────────────────────
  function Step3() {
    return (
      <div>
        <div style={s.sectionTitle}>{t.step3}</div>
        {[
          { key: "nombre",   label: t.nombre,   type: "text",  multi: false },
          { key: "email",    label: t.email,    type: "email", multi: false },
          { key: "telefono", label: t.telefono, type: "tel",   multi: false },
          { key: "notas",    label: t.notas,    type: "text",  multi: true  },
        ].map(({ key, label, type, multi }) => (
          <div key={key} style={s.field}>
            <label style={s.label}>{label}</label>
            {multi ? (
              <textarea
                value={form[key]}
                placeholder=""
                onChange={e => {
                  setForm(f => ({ ...f, [key]: e.target.value }));
                  if (errors[key]) setErrors(er => ({ ...er, [key]: null }));
                }}
                style={s.textarea(!!errors[key])}
              />
            ) : (
              <input
                type={type}
                value={form[key]}
                onChange={e => {
                  setForm(f => ({ ...f, [key]: e.target.value }));
                  if (errors[key]) setErrors(er => ({ ...er, [key]: null }));
                }}
                style={s.input(!!errors[key])}
                autoComplete={key === "email" ? "email" : key === "telefono" ? "tel" : "name"}
              />
            )}
            {errors[key] && <div style={s.errorText}>{errors[key]}</div>}
          </div>
        ))}
      </div>
    );
  }

  // ── Step 4 ────────────────────────────────────────────────────────────
  function Step4() {
    if (paid) {
      return (
        <div style={s.successBox}>
          <div style={s.successIcon}>🏝️</div>
          <div style={s.successTitle}>{t.payNotice}</div>
          <div style={s.successSub}>{form.nombre}</div>
        </div>
      );
    }
    return (
      <div>
        <div style={s.sectionTitle}>{t.orderSummary}</div>
        <div style={s.summaryBox}>
          {[
            [t.passType,  passData?.tipo],
            [t.date,      date],
            [t.people,    pax],
            [t.unitPrice, COP(passData?.precio)],
          ].map(([k, v], i) => (
            <div key={i} style={s.summaryRow}>
              <span style={s.summaryKey}>{k}</span>
              <span style={s.summaryVal}>{v}</span>
            </div>
          ))}
          <div style={s.summaryRowLast}>
            <span style={s.summaryKey}>{t.total}</span>
            <span style={s.totalVal}>{COP(total)}</span>
          </div>
        </div>
        <div style={s.payNotice}>{t.payNotice}</div>
      </div>
    );
  }

  // ── Next button disabled logic ────────────────────────────────────────
  const nextDisabled =
    (step === 1 && pass === null) ||
    (step === 2 && !date);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerTitle}>
          <span style={s.brandName}>{t.header}</span>
          <span style={s.brandSub}>{t.subtitle}</span>
        </div>
        <div style={s.langSwitcher}>
          {LANGS.map(l => (
            <button
              key={l}
              style={s.langBtn(lang === l)}
              onClick={() => setLang(l)}
            >{l}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={s.container}>
        <ProgressBar />

        {step === 1 && <Step1 />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 />}
        {step === 4 && <Step4 />}

        {/* Nav buttons */}
        {!paid && (
          <div style={s.btnRow}>
            {step > 1 && (
              <button style={s.btnBack} onClick={handleBack}>
                {t.back}
              </button>
            )}
            <button
              style={s.btnNext(nextDisabled)}
              onClick={handleNext}
              disabled={nextDisabled}
            >
              {step === 4 ? t.pay : t.next}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
