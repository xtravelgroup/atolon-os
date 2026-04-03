import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { wompiCheckoutUrl } from "../lib/wompi";

const NACS = [
  // Prioritarias
  "Colombiana", "Americana", "Mexicana", "Ecuatoriana", "Peruana",
  "Española", "Chilena", "Brasileña", "Argentina", "Francesa", "Alemana",
  // Resto mundo — orden alfabético
  "Afgana", "Albanesa", "Andorrana", "Angoleña", "Antiguense",
  "Argelina", "Armenia", "Australiana", "Austriaca", "Azerbaiyana",
  "Bahameña", "Bangladesí", "Barbadense", "Bareiní", "Belga", "Beliceña",
  "Beninesa", "Bielorrusa", "Birmana", "Boliviana", "Bosnia", "Botsuanesa",
  "Británica", "Bruneana", "Búlgara", "Burkinesa", "Burundesa",
  "Butanesa", "Caboverdiana", "Camboyana", "Camerunesa", "Canadiense",
  "Catarí", "Chadiana", "Checa", "China", "Chipriota", "Congoleña",
  "Costarricense", "Croata", "Cubana", "Danesa", "Dominicana",
  "Egipcia", "Salvadoreña", "Emiratense", "Eritrea", "Eslovaca",
  "Eslovena", "Etíope", "Fiyiana", "Filipina", "Finlandesa",
  "Gabonesa", "Gambiana", "Georgiana", "Ghanesa", "Griega",
  "Guatemalteca", "Guineana", "Guyanesa", "Haitiana",
  "Hondureña", "Húngara", "India", "Indonesia", "Iraní", "Iraquí",
  "Irlandesa", "Islandesa", "Israelí", "Italiana", "Jamaicana",
  "Japonesa", "Jordana", "Kazaja", "Keniana", "Kirguisa", "Kuwaití",
  "Laosiana", "Letona", "Libanesa", "Liberiana", "Libia", "Liechtensteinesa",
  "Lituana", "Luxemburguesa", "Macedonia", "Malgache", "Malasia",
  "Malaui", "Maldiva", "Maliense", "Maltesa", "Mauritana", "Mauriciana",
  "Moldava", "Monegasca", "Mongola", "Montenegrina", "Mozambiqueña",
  "Namibia", "Nepalesa", "Nicaragüense", "Nigeriana", "Nigerina",
  "Noruega", "Neozelandesa", "Omaní", "Pakistaní", "Palestina",
  "Panameña", "Paraguaya", "Polaca", "Portuguesa", "Puertorriqueña",
  "Rumana", "Rusa", "Ruandesa", "Samoana", "Saudi",
  "Senegalesa", "Serbia", "Singapurense", "Siria", "Somalí",
  "Sri Lankesa", "Sudafricana", "Sudanesa", "Sueca", "Suiza",
  "Surinamesa", "Tailandesa", "Tanzana", "Tayika", "Togolesa",
  "Trinitense", "Tunecina", "Turca", "Turkmenistana",
  "Ucraniana", "Ugandesa", "Uruguaya", "Uzbeka",
  "Venezolana", "Vietnamita", "Yemení", "Zambiana", "Zimbabuense",
  "Otra",
];

const B = {
  navy: "#0D1B3E", navyMid: "#152650", navyLight: "#1E3566",
  sand: "#C8B99A", sky: "#8ECAE6", success: "#22c55e",
  danger: "#ef4444", warning: "#E8A020",
};
const IS = {
  width: "100%", padding: "12px 14px", borderRadius: 9,
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
  color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit",
};
const LS = {
  fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em",
};

const PRECIO_EXCLUSIVE = 270000; // COP por persona

// ── Traducciones ─────────────────────────────────────────────────────────────
const T = {
  es: {
    loading: "Cargando...",
    linkInvalid: "Enlace no válido",
    linkInvalidSub: "Este enlace de check-in no existe o ya expiró. Pídele al personal del muelle un nuevo código.",
    title: "Check-in de Pasajeros",
    passengers: (n) => `${n} pasajero${n !== 1 ? "s" : ""}`,
    passengerLabel: (i) => `Pasajero ${i + 1}`,
    fullName: "Nombre completo",
    fullNamePlaceholder: "Nombre y apellido",
    idNumber: "No. Identificación",
    idPlaceholder: "CC / Pasaporte",
    nationality: "Nacionalidad",
    contact: "📞 Datos de contacto",
    contactSub: "Necesitamos estos datos para enviarte información de tu reserva.",
    phone: "Teléfono / WhatsApp",
    phonePlaceholder: "+57 300 000 0000",
    email: "Correo electrónico",
    emailPlaceholder: "tucorreo@ejemplo.com",
    submit: "Enviar mis datos ✓",
    submitting: "Enviando...",
    errorMissing: "Por favor completa el nombre e identificación de todos los pasajeros.",
    errorPhone: "Por favor ingresa tu número de teléfono.",
    errorEmail: "Por favor ingresa tu correo electrónico.",
    errorSave: "Error al guardar. Intenta de nuevo.",
    thanks: (name) => `¡Gracias, ${name}!`,
    registered: "Tus datos están registrados.",
    confirmed: (n) => `${n} pasajero${n !== 1 ? "s" : ""} confirmado${n !== 1 ? "s" : ""}.`,
    departure: "SALIDA PROGRAMADA",
    dock: "Muelle de La Bodeguita",
    allergies: "Alergias",
    allergiesSub: (hasAllergies) => hasAllergies ? "✓ Ya registradas — toca para editar" : "Indica si alguien en el grupo tiene alergias o condiciones médicas",
    upgrade: "Upgrade",
    upgradeSub: "Mejora tu experiencia: piscina VIP, botellas, masajes y actividades",
    back: "‹ Volver",
    allergiesTitle: "⚠️ Alergias",
    allergiesDesc: "¿Alguien en tu grupo tiene alergias, condiciones médicas o restricciones alimenticias que debamos saber?",
    allergiesLabel: "Describe las alergias o condiciones",
    allergiesPlaceholder: "Ej: Alicia tiene alergia a los mariscos. Juan es diabético.",
    allergyDoneTitle: "Registrado",
    allergyDoneSub: "El personal ya está al tanto.",
    backToMenu: "Volver al menú",
    upgradeTitle: "⬆️ Upgrade",
    upgradeDesc: "Mejora tu experiencia. El staff te contactará en el muelle para coordinar.",
    requested: "✓ Solicitado",
    summary: "Resumen",
    perPerson: (n, price) => `${n} persona${n !== 1 ? "s" : ""} × ${price}`,
    totalToPay: "Total a pagar",
    howToPay: "Elige cómo pagar",
    nationalCard: "Tarjeta Nacional",
    nationalCardSub: "Débito o crédito colombiana — PSE disponible",
    intlCard: "Tarjeta Internacional",
    intlCardSub: "Visa, Mastercard, Amex internacional",
    payAtAtolon: "Pagar en Atolon",
    payAtAtolonSub: "El staff te buscará para coordinar el pago en efectivo o dataphone",
    preparingPayment: "Preparando pago...",
    requestSent: "¡Solicitud registrada!",
    requestSentExclusive: "El staff te buscará en el muelle para coordinar el pago y confirmar tu upgrade Exclusive.",
    requestSentOther: (label) => `El staff te buscará para coordinar tu ${label.toLowerCase()}.`,
    moreOptions: "Ver más opciones",
    request: (label) => `Solicitar ${label} →`,
    sending: "Enviando...",
    saveAllergy: "Registrar alergias",
    saving: "Guardando...",
    footer: "Atolon Beach Club · Cartagena, Colombia",
  },
  en: {
    loading: "Loading...",
    linkInvalid: "Invalid link",
    linkInvalidSub: "This check-in link doesn't exist or has expired. Ask the dock staff for a new code.",
    title: "Passenger Check-in",
    passengers: (n) => `${n} passenger${n !== 1 ? "s" : ""}`,
    passengerLabel: (i) => `Passenger ${i + 1}`,
    fullName: "Full name",
    fullNamePlaceholder: "First and last name",
    idNumber: "ID Number",
    idPlaceholder: "ID / Passport",
    nationality: "Nationality",
    contact: "📞 Contact info",
    contactSub: "We need this information to send you details about your reservation.",
    phone: "Phone / WhatsApp",
    phonePlaceholder: "+1 555 000 0000",
    email: "Email address",
    emailPlaceholder: "youremail@example.com",
    submit: "Submit my info ✓",
    submitting: "Sending...",
    errorMissing: "Please fill in the name and ID of all passengers.",
    errorPhone: "Please enter your phone number.",
    errorEmail: "Please enter your email address.",
    errorSave: "Error saving. Please try again.",
    thanks: (name) => `Thank you, ${name}!`,
    registered: "Your info has been registered.",
    confirmed: (n) => `${n} passenger${n !== 1 ? "s" : ""} confirmed.`,
    departure: "SCHEDULED DEPARTURE",
    dock: "La Bodeguita Dock",
    allergies: "Allergies",
    allergiesSub: (hasAllergies) => hasAllergies ? "✓ Already registered — tap to edit" : "Let us know if anyone in your group has allergies or medical conditions",
    upgrade: "Upgrade",
    upgradeSub: "Enhance your experience: VIP pool, bottles, massages and activities",
    back: "‹ Back",
    allergiesTitle: "⚠️ Allergies",
    allergiesDesc: "Does anyone in your group have allergies, medical conditions or dietary restrictions we should know about?",
    allergiesLabel: "Describe the allergies or conditions",
    allergiesPlaceholder: "E.g.: Alice is allergic to shellfish. John is diabetic.",
    allergyDoneTitle: "Registered",
    allergyDoneSub: "Our staff has been notified.",
    backToMenu: "Back to menu",
    upgradeTitle: "⬆️ Upgrade",
    upgradeDesc: "Enhance your experience. Staff will contact you at the dock to coordinate.",
    requested: "✓ Requested",
    summary: "Summary",
    perPerson: (n, price) => `${n} person${n !== 1 ? "s" : ""} × ${price}`,
    totalToPay: "Total to pay",
    howToPay: "Choose how to pay",
    nationalCard: "Colombian Card",
    nationalCardSub: "Debit or credit Colombian card — PSE available",
    intlCard: "International Card",
    intlCardSub: "Visa, Mastercard, Amex international",
    payAtAtolon: "Pay at Atolon",
    payAtAtolonSub: "Staff will find you to coordinate payment by cash or card reader",
    preparingPayment: "Preparing payment...",
    requestSent: "Request registered!",
    requestSentExclusive: "Staff will find you at the dock to coordinate payment and confirm your Exclusive upgrade.",
    requestSentOther: (label) => `Staff will find you to coordinate your ${label}.`,
    moreOptions: "See more options",
    request: (label) => `Request ${label} →`,
    sending: "Sending...",
    saveAllergy: "Save allergies",
    saving: "Saving...",
    footer: "Atolon Beach Club · Cartagena, Colombia",
  },
};

// ── Toggle idioma ─────────────────────────────────────────────────────────────
function LangToggle({ lang, setLang }) {
  return (
    <div style={{ position: "absolute", top: 16, right: 16, display: "flex", borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.15)" }}>
      {[["es", "🇨🇴 ES"], ["en", "🇺🇸 EN"]].map(([l, label]) => (
        <button key={l} onClick={() => setLang(l)}
          style={{
            padding: "6px 12px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
            background: lang === l ? "rgba(255,255,255,0.18)" : "transparent",
            color: lang === l ? "#fff" : "rgba(255,255,255,0.35)",
            fontFamily: "inherit",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}

const UPGRADES = [
  { key: "exclusive",   emoji: "⭐", label: "Exclusive",      sub: "Upgrade",    desc: "Acceso a zona Exclusive con servicio premium, open bar y áreas privadas.", pago: true },
  { key: "piscina",    emoji: "🏊", label: "Área Piscina",   sub: "VIP PASS",   desc: "Acceso exclusivo al área de piscina con servicio personalizado." },
  { key: "botellas",  emoji: "🍾", label: "Botellas",        sub: "Promo",      desc: "Paquete de botellas con mezclas a bordo y en destino." },
  { key: "masajes",   emoji: "💆", label: "Masajes",         sub: "Relajación", desc: "Masajes profesionales disponibles durante el recorrido." },
  { key: "actividades", emoji: "🏄", label: "Actividades",  sub: "Diversión",  desc: "Deportes acuáticos, snorkel y más actividades en Tierra Bomba." },
];

// ── Pantalla: Gracias + menú post check-in ──────────────────────────────────
function PostCheckin({ reserva, salida, paxCount, rid, lang, setLang }) {
  const t = T[lang] || T.es;
  const [vista,          setVista]          = useState("menu"); // menu | alergias | upgrade | upgrade_item
  const [upgradeItem,    setUpgradeItem]    = useState(null);
  const [alergiaTexto,   setAlergiaTexto]   = useState(reserva.alergias || "");
  const [alergiaSaving,  setAlergiaSaving]  = useState(false);
  const [alergiaDone,    setAlergiaDone]    = useState(false);
  const [upgradeSending, setUpgradeSending] = useState(false);
  const [upgradeDone,    setUpgradeDone]    = useState(false);

  const horaDisplay = salida?.hora
    ? salida.hora.slice(0, 5)  // "08:30"
    : null;

  const saveAlergia = async () => {
    if (!alergiaTexto.trim()) return;
    setAlergiaSaving(true);
    await supabase.from("reservas").update({ alergias: alergiaTexto.trim() }).eq("id", rid);
    setAlergiaSaving(false);
    setAlergiaDone(true);
  };

  const sendUpgrade = async (item) => {
    setUpgradeSending(true);
    const prev = reserva.extras_solicitados || [];
    const next = [...prev, { tipo: item.key, label: item.label, solicitado_at: new Date().toISOString() }];
    await supabase.from("reservas").update({ extras_solicitados: next }).eq("id", rid);
    setUpgradeSending(false);
    setUpgradeDone(true);
  };

  const Wrap = ({ children }) => (
    <div style={{ minHeight: "100vh", background: B.navy, fontFamily: "'Inter','Segoe UI',sans-serif", padding: "28px 16px 48px", boxSizing: "border-box", position: "relative" }}>
      <LangToggle lang={lang} setLang={setLang} />
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <img src="/atolon-logo-white.png" alt="Atolon" style={{ height: 34, display: "block", margin: "0 auto 24px", objectFit: "contain" }}
          onError={e => { e.target.style.display = "none"; }} />
        {children}
      </div>
    </div>
  );

  /* ── MENÚ PRINCIPAL ── */
  if (vista === "menu") return (
    <Wrap>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🌴</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
          {t.thanks(reserva.nombre.split(" ")[0])}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
          {t.registered}<br />{t.confirmed(paxCount)}
        </div>
        {horaDisplay && (
          <div style={{ marginTop: 18, display: "inline-block", background: B.navyMid, borderRadius: 16, padding: "14px 28px", border: `1px solid ${B.sky}33` }}>
            <div style={{ fontSize: 11, color: B.sky, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>{t.departure}</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", fontFamily: "'Barlow Condensed','Barlow',sans-serif" }}>{horaDisplay}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{t.dock}</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button onClick={() => setVista("alergias")}
          style={{ display: "flex", alignItems: "center", gap: 16, background: B.navyMid, borderRadius: 16, padding: "18px 20px", border: `1px solid ${B.warning}33`, cursor: "pointer", textAlign: "left", width: "100%" }}>
          <div style={{ fontSize: 32, flexShrink: 0 }}>⚠️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{t.allergies}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>{t.allergiesSub(!!reserva.alergias)}</div>
          </div>
          <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.2)", fontSize: 18 }}>›</div>
        </button>

        <button onClick={() => setVista("upgrade")}
          style={{ display: "flex", alignItems: "center", gap: 16, background: B.navyMid, borderRadius: 16, padding: "18px 20px", border: `1px solid ${B.sand}33`, cursor: "pointer", textAlign: "left", width: "100%" }}>
          <div style={{ fontSize: 32, flexShrink: 0 }}>⬆️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{t.upgrade}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>{t.upgradeSub}</div>
          </div>
          <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.2)", fontSize: 18 }}>›</div>
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 28, fontSize: 11, color: "rgba(255,255,255,0.18)" }}>{t.footer}</div>
    </Wrap>
  );

  /* ── ALERGIAS ── */
  if (vista === "alergias") return (
    <Wrap>
      <button onClick={() => setVista("menu")}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {t.back}
      </button>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{t.allergiesTitle}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24, lineHeight: 1.6 }}>{t.allergiesDesc}</div>
      {alergiaDone ? (
        <div style={{ background: B.success + "22", border: `1px solid ${B.success}44`, borderRadius: 14, padding: "20px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: B.success }}>{t.allergyDoneTitle}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{t.allergyDoneSub}</div>
          <button onClick={() => { setAlergiaDone(false); setVista("menu"); }}
            style={{ marginTop: 16, padding: "10px 24px", borderRadius: 10, background: B.navyLight, color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>
            {t.backToMenu}
          </button>
        </div>
      ) : (
        <>
          <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px" }}>
            <label style={LS}>{t.allergiesLabel}</label>
            <textarea value={alergiaTexto} onChange={e => setAlergiaTexto(e.target.value)}
              placeholder={t.allergiesPlaceholder} rows={4} style={{ ...IS, resize: "vertical", lineHeight: 1.6 }} />
          </div>
          <button onClick={saveAlergia} disabled={alergiaSaving || !alergiaTexto.trim()}
            style={{ marginTop: 16, width: "100%", padding: "15px", borderRadius: 12,
              background: !alergiaTexto.trim() ? B.navyLight : B.warning,
              color: !alergiaTexto.trim() ? "rgba(255,255,255,0.3)" : B.navy,
              border: "none", fontWeight: 800, fontSize: 15, cursor: !alergiaTexto.trim() ? "default" : "pointer" }}>
            {alergiaSaving ? t.saving : t.saveAllergy}
          </button>
        </>
      )}
    </Wrap>
  );

  /* ── UPGRADE — sub-menú ── */
  if (vista === "upgrade") return (
    <Wrap>
      <button onClick={() => setVista("menu")}
        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {t.back}
      </button>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{t.upgradeTitle}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 24, lineHeight: 1.6 }}>{t.upgradeDesc}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {UPGRADES.map(item => {
          const yaSolicitado = (reserva.extras_solicitados || []).some(s => s.tipo === item.key);
          return (
            <button key={item.key} onClick={() => { setUpgradeItem(item); setUpgradeDone(false); setVista("upgrade_item"); }}
              style={{ display: "flex", alignItems: "center", gap: 16, background: yaSolicitado ? B.success + "18" : B.navyMid, borderRadius: 14, padding: "16px 18px", border: `1px solid ${yaSolicitado ? B.success + "55" : B.navyLight}`, cursor: "pointer", textAlign: "left", width: "100%" }}>
              <div style={{ fontSize: 30, flexShrink: 0 }}>{item.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: yaSolicitado ? B.success : "#fff" }}>
                  {item.label}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: yaSolicitado ? B.success + "aa" : "rgba(255,255,255,0.35)", background: yaSolicitado ? B.success + "22" : B.navyLight, borderRadius: 6, padding: "1px 7px" }}>
                    {yaSolicitado ? t.requested : item.sub}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, lineHeight: 1.4 }}>{item.desc}</div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 18, flexShrink: 0 }}>›</div>
            </button>
          );
        })}
      </div>
    </Wrap>
  );

  /* ── UPGRADE — detalle del item ── */
  if (vista === "upgrade_item" && upgradeItem) {
    const esExclusive  = upgradeItem.key === "exclusive";
    const totalPago    = PRECIO_EXCLUSIVE * paxCount;
    const COP          = n => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

    const pagarConTarjeta = async (tipo) => {
      setUpgradeSending(true);
      // Guardar solicitud primero
      const prev = reserva.extras_solicitados || [];
      const next = [...prev, { tipo: "exclusive", label: "Exclusive", metodo_pago: tipo, total: totalPago, solicitado_at: new Date().toISOString() }];
      await supabase.from("reservas").update({ extras_solicitados: next }).eq("id", rid);
      // Generar URL de pago Wompi
      const ref = `UPG-EXC-${rid}-${Date.now()}`;
      const email = reserva.email || reserva.contacto || "";
      const redirectUrl = `${window.location.origin}/checkin-pax?rid=${rid}&upg=ok`;
      const url = await wompiCheckoutUrl({ referencia: ref, totalCOP: totalPago, email, redirectUrl });
      setUpgradeSending(false);
      window.location.href = url; // redirect a Wompi
    };

    const pagarEnAtolon = async () => {
      setUpgradeSending(true);
      const prev = reserva.extras_solicitados || [];
      const next = [...prev, { tipo: "exclusive", label: "Exclusive", metodo_pago: "presencial", total: totalPago, solicitado_at: new Date().toISOString() }];
      await supabase.from("reservas").update({ extras_solicitados: next }).eq("id", rid);
      setUpgradeSending(false);
      setUpgradeDone(true);
    };

    return (
      <Wrap>
        <button onClick={() => { setVista("upgrade"); setUpgradeDone(false); }}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
          {t.back}
        </button>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>{upgradeItem.emoji}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{upgradeItem.label}</div>
          <div style={{ display: "inline-block", background: B.navyMid, borderRadius: 20, padding: "3px 14px", fontSize: 12, color: B.sand, marginBottom: 12 }}>
            {upgradeItem.sub}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, maxWidth: 320, margin: "0 auto" }}>
            {upgradeItem.desc}
          </div>
        </div>

        {upgradeDone ? (
          /* ── Confirmación ── */
          <div style={{ background: B.success + "22", border: `1px solid ${B.success}44`, borderRadius: 16, padding: "28px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: B.success, marginBottom: 6 }}>{t.requestSent}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
              {esExclusive ? t.requestSentExclusive : t.requestSentOther(upgradeItem.label)}
            </div>
            <button onClick={() => setVista("upgrade")}
              style={{ marginTop: 20, padding: "11px 28px", borderRadius: 10, background: B.navyLight, color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>
              {t.moreOptions}
            </button>
          </div>
        ) : esExclusive ? (
          /* ── Pago Exclusive ── */
          <>
            {/* Resumen de precio */}
            <div style={{ background: B.navyMid, borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>{t.summary}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{t.perPerson(paxCount, COP(PRECIO_EXCLUSIVE))}</span>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}>{COP(totalPago)}</span>
              </div>
              <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{t.totalToPay}</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: B.sand }}>{COP(totalPago)}</span>
              </div>
            </div>

            {/* Opciones de pago */}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              {t.howToPay}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Tarjeta Nacional */}
              <button
                onClick={() => pagarConTarjeta("nacional")}
                disabled={upgradeSending}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: B.navyMid, borderRadius: 14, padding: "16px 18px",
                  border: `1px solid ${B.sky}44`, cursor: upgradeSending ? "default" : "pointer",
                  width: "100%", textAlign: "left", opacity: upgradeSending ? 0.6 : 1,
                }}>
                <div style={{ fontSize: 28 }}>🏦</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{t.nationalCard}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.nationalCardSub}</div>
                </div>
                <div style={{ marginLeft: "auto", color: B.sky, fontSize: 18 }}>›</div>
              </button>

              {/* Tarjeta Internacional */}
              <button
                onClick={() => pagarConTarjeta("internacional")}
                disabled={upgradeSending}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: B.navyMid, borderRadius: 14, padding: "16px 18px",
                  border: `1px solid ${B.sky}44`, cursor: upgradeSending ? "default" : "pointer",
                  width: "100%", textAlign: "left", opacity: upgradeSending ? 0.6 : 1,
                }}>
                <div style={{ fontSize: 28 }}>🌍</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{t.intlCard}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.intlCardSub}</div>
                </div>
                <div style={{ marginLeft: "auto", color: B.sky, fontSize: 18 }}>›</div>
              </button>

              {/* Pagar en Atolon */}
              <button
                onClick={pagarEnAtolon}
                disabled={upgradeSending}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: B.navyMid, borderRadius: 14, padding: "16px 18px",
                  border: `1px solid ${B.sand}33`, cursor: upgradeSending ? "default" : "pointer",
                  width: "100%", textAlign: "left", opacity: upgradeSending ? 0.6 : 1,
                }}>
                <div style={{ fontSize: 28 }}>🏝️</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{t.payAtAtolon}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{t.payAtAtolonSub}</div>
                </div>
                <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.2)", fontSize: 18 }}>›</div>
              </button>
            </div>

            {upgradeSending && (
              <div style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                {t.preparingPayment}
              </div>
            )}
          </>
        ) : (
          /* ── Otros upgrades: solo solicitar ── */
          <button
            onClick={() => sendUpgrade(upgradeItem)}
            disabled={upgradeSending}
            style={{
              width: "100%", padding: "16px", borderRadius: 12,
              background: upgradeSending ? B.navyLight : B.sand,
              color: upgradeSending ? "rgba(255,255,255,0.3)" : B.navy,
              border: "none", fontWeight: 800, fontSize: 16,
              cursor: upgradeSending ? "default" : "pointer",
            }}>
            {upgradeSending ? t.sending : t.request(upgradeItem.label)}
          </button>
        )}
      </Wrap>
    );
  }

  return null;
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function SelfCheckIn() {
  const rid = new URLSearchParams(window.location.search).get("rid");
  const [lang,     setLang]     = useState("es");
  const [reserva,  setReserva]  = useState(null);
  const [salida,   setSalida]   = useState(null);
  const [pax,      setPax]      = useState([]);
  const [telefono, setTelefono] = useState("");
  const [email,    setEmail]    = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState("");
  const t = T[lang] || T.es;

  const faltaTel      = !reserva?.telefono?.trim();
  const faltaEmail    = !reserva?.email?.trim() && !(reserva?.contacto?.trim().includes("@"));
  const pedirContacto = faltaTel || faltaEmail;

  useEffect(() => {
    if (!rid) { setLoading(false); return; }
    supabase.from("reservas")
      .select("id,nombre,pax,pax_a,pax_n,pasajeros,fecha,salida_id,telefono,email,contacto,alergias,extras_solicitados")
      .eq("id", rid).single()
      .then(async ({ data, error: e }) => {
        if (e || !data) { setError("not_found"); setLoading(false); return; }
        setReserva(data);
        const total = (data.pax_a || 0) + (data.pax_n || 0) || data.pax || 1;
        const init = data.pasajeros?.length > 0
          ? [...data.pasajeros]
          : Array.from({ length: total }, (_, i) => ({
              nombre: i === 0 ? (data.nombre || "") : "",
              identificacion: "",
              nacionalidad: "Colombiana",
            }));
        setPax(init);
        // Fetch salida para obtener la hora
        if (data.salida_id) {
          const { data: sal } = await supabase.from("salidas").select("id,nombre,hora").eq("id", data.salida_id).single();
          if (sal) setSalida(sal);
        }
        setLoading(false);
      });
  }, [rid]);

  const set = (i, k, v) => setPax(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));

  const save = async () => {
    const missing = pax.some(p => !p.nombre?.trim() || !p.identificacion?.trim());
    if (missing) { setError(t.errorMissing); return; }
    if (pedirContacto) {
      if (faltaTel  && !telefono.trim()) { setError(t.errorPhone); return; }
      if (faltaEmail && !email.trim())   { setError(t.errorEmail); return; }
    }
    setSaving(true); setError("");
    const upd = { pasajeros: pax };
    if (faltaTel  && telefono.trim()) upd.telefono = telefono.trim();
    if (faltaEmail && email.trim())   { upd.email = email.trim(); upd.contacto = email.trim(); }
    const { error: e } = await supabase.from("reservas").update(upd).eq("id", rid);
    if (e) { setError(t.errorSave); setSaving(false); return; }
    setSaving(false);
    setDone(true);
  };

  /* ── Loading ── */
  if (loading) return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
      <LangToggle lang={lang} setLang={setLang} />
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 15 }}>{t.loading}</div>
    </div>
  );

  /* ── Not found ── */
  if (!rid || error === "not_found") return (
    <div style={{ minHeight: "100vh", background: B.navy, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, position: "relative" }}>
      <LangToggle lang={lang} setLang={setLang} />
      <div style={{ fontSize: 56 }}>⚓</div>
      <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>{t.linkInvalid}</div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", maxWidth: 300 }}>{t.linkInvalidSub}</div>
    </div>
  );

  /* ── Post check-in (gracias + menú) — también si regresa de Wompi con ?upg=ok ── */
  const upgOk = new URLSearchParams(window.location.search).get("upg") === "ok";
  if (done || (upgOk && reserva)) return (
    <PostCheckin reserva={reserva} salida={salida} paxCount={pax.length || reserva?.pax || 1} rid={rid} lang={lang} setLang={setLang} />
  );

  /* ── Formulario ── */
  return (
    <div style={{ minHeight: "100vh", background: B.navy, fontFamily: "'Inter','Segoe UI',sans-serif", padding: "28px 16px 40px", boxSizing: "border-box", position: "relative" }}>
      <LangToggle lang={lang} setLang={setLang} />
      <div style={{ maxWidth: 500, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/atolon-logo-white.png" alt="Atolon Beach Club"
            style={{ height: 42, marginBottom: 14, objectFit: "contain" }}
            onError={e => { e.target.style.display = "none"; }} />
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
            {t.title}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
            {reserva.nombre}
          </div>
          <div style={{ display: "inline-block", marginTop: 8, background: B.navyMid, borderRadius: 20, padding: "4px 16px", fontSize: 12, color: B.sand }}>
            {t.passengers(pax.length)}
          </div>
        </div>

        {/* Pasajeros */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pax.map((p, i) => (
            <div key={i} style={{ background: B.navyMid, borderRadius: 16, padding: "20px 18px" }}>
              <div style={{ fontSize: 12, color: B.sand, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {t.passengerLabel(i)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={LS}>{t.fullName}</label>
                  <input value={p.nombre} onChange={e => set(i, "nombre", e.target.value)}
                    style={IS} placeholder={t.fullNamePlaceholder} autoComplete="name" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={LS}>{t.idNumber}</label>
                    <input value={p.identificacion} onChange={e => set(i, "identificacion", e.target.value)}
                      style={IS} placeholder={t.idPlaceholder} inputMode="text" />
                  </div>
                  <div>
                    <label style={LS}>{t.nationality}</label>
                    <select value={p.nacionalidad} onChange={e => set(i, "nacionalidad", e.target.value)} style={IS}>
                      {NACS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Contacto — solo si falta */}
        {pedirContacto && (
          <div style={{ background: B.navyMid, borderRadius: 16, padding: "20px 18px", marginTop: 16 }}>
            <div style={{ fontSize: 12, color: B.sky, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {t.contact}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16, lineHeight: 1.5 }}>
              {t.contactSub}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {faltaTel && (
                <div>
                  <label style={LS}>{t.phone}</label>
                  <input value={telefono} onChange={e => setTelefono(e.target.value)}
                    style={IS} placeholder={t.phonePlaceholder} inputMode="tel" type="tel" autoComplete="tel" />
                </div>
              )}
              {faltaEmail && (
                <div>
                  <label style={LS}>{t.email}</label>
                  <input value={email} onChange={e => setEmail(e.target.value)}
                    style={IS} placeholder={t.emailPlaceholder} inputMode="email" type="email" autoComplete="email" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && error !== "not_found" && (
          <div style={{ marginTop: 14, background: "#ef444422", border: "1px solid #ef444444", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#f87171" }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button onClick={save} disabled={saving} style={{
          marginTop: 22, width: "100%", padding: "16px", borderRadius: 12,
          background: saving ? B.navyLight : B.sand,
          color: saving ? "rgba(255,255,255,0.3)" : B.navy,
          border: "none", fontWeight: 800, fontSize: 16,
          cursor: saving ? "default" : "pointer", transition: "background 0.2s",
        }}>
          {saving ? t.submitting : t.submit}
        </button>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
          {t.footer}
        </div>
      </div>
    </div>
  );
}
