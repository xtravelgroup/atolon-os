import React, { useState, useEffect, useMemo } from "react";
import { B } from "../brand.js";
import { normalizarTelefono } from "../lib/telefono.js";

// Países más comunes en el tráfico de Atolón Beach Club (turistas + LatAm).
// Colombia primero. Ordenados por probabilidad. El resto va bajo "Otro pais".
const COUNTRIES = [
  { code: "57",  flag: "🇨🇴", name: "Colombia" },
  { code: "1",   flag: "🇺🇸", name: "USA / Canadá" },
  { code: "52",  flag: "🇲🇽", name: "México" },
  { code: "51",  flag: "🇵🇪", name: "Perú" },
  { code: "58",  flag: "🇻🇪", name: "Venezuela" },
  { code: "593", flag: "🇪🇨", name: "Ecuador" },
  { code: "56",  flag: "🇨🇱", name: "Chile" },
  { code: "54",  flag: "🇦🇷", name: "Argentina" },
  { code: "55",  flag: "🇧🇷", name: "Brasil" },
  { code: "34",  flag: "🇪🇸", name: "España" },
  { code: "44",  flag: "🇬🇧", name: "UK" },
  { code: "33",  flag: "🇫🇷", name: "Francia" },
  { code: "49",  flag: "🇩🇪", name: "Alemania" },
  { code: "39",  flag: "🇮🇹", name: "Italia" },
  { code: "31",  flag: "🇳🇱", name: "Países Bajos" },
  { code: "506", flag: "🇨🇷", name: "Costa Rica" },
  { code: "507", flag: "🇵🇦", name: "Panamá" },
  { code: "502", flag: "🇬🇹", name: "Guatemala" },
  { code: "503", flag: "🇸🇻", name: "El Salvador" },
  { code: "504", flag: "🇭🇳", name: "Honduras" },
  { code: "505", flag: "🇳🇮", name: "Nicaragua" },
  { code: "591", flag: "🇧🇴", name: "Bolivia" },
  { code: "595", flag: "🇵🇾", name: "Paraguay" },
  { code: "598", flag: "🇺🇾", name: "Uruguay" },
  { code: "61",  flag: "🇦🇺", name: "Australia" },
  { code: "81",  flag: "🇯🇵", name: "Japón" },
  { code: "82",  flag: "🇰🇷", name: "Corea del Sur" },
  { code: "86",  flag: "🇨🇳", name: "China" },
  { code: "OTHER", flag: "🌐", name: "Otro país" },
];

// Uso mínimo:
//   <PhoneInput value={form.telefono} onChange={v => setForm({...form, telefono: v})} />
// value siempre en E.164 (+573001234567). onChange emite E.164 cuando es válido
// o el string crudo del número mientras se tipea.
export default function PhoneInput({
  value = "",
  onChange = () => {},
  onBlur,
  label,
  placeholder = "300 123 4567",
  required = false,
  disabled = false,
  showHint = false,
  style = {},
  inputStyle = {},
  autoFocus = false,
  name = "telefono",
  id,
}) {
  // Parsear valor inicial para decidir country code y national.
  const parsedInitial = useMemo(() => normalizarTelefono(value), [value]);
  const initialCC = parsedInitial.countryCode
    ? (COUNTRIES.find(c => c.code === parsedInitial.countryCode) ? parsedInitial.countryCode : "OTHER")
    : "57";

  const [ccCode, setCcCode] = useState(initialCC);
  const [customCC, setCustomCC] = useState(
    initialCC === "OTHER" && parsedInitial.countryCode ? parsedInitial.countryCode : ""
  );
  const [national, setNational] = useState(parsedInitial.national || "");
  const [touched, setTouched] = useState(false);

  // Sincronizar cuando el padre cambia value externamente.
  useEffect(() => {
    const p = normalizarTelefono(value);
    const cc = p.countryCode
      ? (COUNTRIES.find(c => c.code === p.countryCode) ? p.countryCode : "OTHER")
      : ccCode;
    setCcCode(cc);
    if (cc === "OTHER" && p.countryCode) setCustomCC(p.countryCode);
    setNational(p.national || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const effectiveCC = ccCode === "OTHER" ? String(customCC || "").replace(/\D/g, "") : ccCode;
  const cleanNat = String(national || "").replace(/\D/g, "");
  const e164 = effectiveCC && cleanNat ? `+${effectiveCC}${cleanNat}` : "";
  const valid = effectiveCC.length >= 1 && cleanNat.length >= 6 && cleanNat.length <= 13;
  const showInvalid = touched && (national.length > 0 || customCC.length > 0) && !valid;

  const emit = (cc, nat, custom) => {
    const effCC = cc === "OTHER" ? String(custom || "").replace(/\D/g, "") : cc;
    const cleanN = String(nat || "").replace(/\D/g, "");
    if (effCC && cleanN && cleanN.length >= 6) {
      onChange(`+${effCC}${cleanN}`);
    } else {
      onChange(cleanN);
    }
  };

  const handleCC = (e) => {
    const v = e.target.value;
    setCcCode(v);
    emit(v, national, customCC);
  };
  const handleCustomCC = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setCustomCC(v);
    emit(ccCode, national, v);
  };
  const handleNat = (e) => {
    const v = e.target.value;
    setNational(v);
    emit(ccCode, v, customCC);
  };
  const handleBlur = () => {
    setTouched(true);
    if (typeof onBlur === "function") onBlur({ e164, valid, countryCode: effectiveCC, national: cleanNat });
  };

  const borderColor = showInvalid ? B.danger : "#DDE4EC";

  // Merge de estilos: aplicamos el inputStyle del padre a AMBOS controles
  // (dropdown + input) para respetar theming (dark navy vs light) sin duplicar.
  const baseCtl = {
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${borderColor}`,
    fontSize: 14,
    minHeight: 44,
    outline: "none",
    background: disabled ? "#F5F5F5" : "#FFF",
    color: B.navy,
    boxSizing: "border-box",
    ...inputStyle,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      {label && (
        <label
          htmlFor={id}
          style={{ fontSize: 12, fontWeight: 600, color: B.navy, letterSpacing: 0.3 }}
        >
          {label} {required && <span style={{ color: B.danger }}>*</span>}
        </label>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <select
          value={ccCode}
          onChange={handleCC}
          disabled={disabled}
          style={{
            ...baseCtl,
            flex: "0 0 auto",
            minWidth: 110,
            maxWidth: 130,
            appearance: "auto",
            paddingRight: 6,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.code === "OTHER" ? "Otro" : `+${c.code}`}
            </option>
          ))}
        </select>
        {ccCode === "OTHER" && (
          <input
            type="text"
            inputMode="numeric"
            value={customCC}
            onChange={handleCustomCC}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder="+ código"
            style={{ ...baseCtl, flex: "0 0 80px" }}
          />
        )}
        <input
          type="tel"
          name={name}
          id={id}
          value={national}
          onChange={handleNat}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          inputMode="tel"
          autoComplete="tel-national"
          style={{ ...baseCtl, flex: 1, minWidth: 0 }}
        />
      </div>
      {(showHint || showInvalid) && (
        <div
          style={{
            fontSize: 11,
            color: showInvalid ? B.danger : "#7A8B99",
            lineHeight: 1.4,
          }}
        >
          {showInvalid
            ? "Número inválido. Escribe solo dígitos (ej: 300 123 4567)"
            : "Elige tu país y escribe el número sin el código de país"}
        </div>
      )}
    </div>
  );
}
