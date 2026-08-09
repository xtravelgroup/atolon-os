import React, { useState, useEffect, useMemo, useRef } from "react";
import { B } from "../brand.js";
import { normalizarTelefono } from "../lib/telefono.js";

// Input teléfono: código de país editable (default "+57") + número.
// Sin dropdown. El staff/cliente puede cambiar manualmente el +CC si es
// extranjero.
//
// Uso mínimo:
//   <PhoneInput value={form.telefono} onChange={v => setForm({...form, telefono: v})} />
// value siempre en E.164 (+573001234567). onChange emite E.164 cuando es
// válido, o el número crudo mientras se tipea.
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
  const parsedInitial = useMemo(() => normalizarTelefono(value), [value]);

  const [cc, setCc] = useState(parsedInitial.countryCode || "57");
  const [national, setNational] = useState(parsedInitial.national || "");
  const [touched, setTouched] = useState(false);
  // Trackea la última cadena que este componente emitió al padre. Si el
  // value que vuelve del padre coincide, NO re-sincronizamos (evitaría que
  // normalizarTelefono interpretara "300" como +30 Grecia mientras el usuario
  // aún está tipeando, borrándole los dígitos parciales).
  const lastEmittedRef = useRef(value || "");

  // Sincronizar solo cuando el value cambia por una razón externa
  // (ej. abrir el modal con una reserva existente).
  useEffect(() => {
    const externalVal = String(value || "");
    if (externalVal === String(lastEmittedRef.current || "")) return;
    const p = normalizarTelefono(externalVal);
    if (p.countryCode) setCc(p.countryCode);
    setNational(p.national || externalVal.replace(/[^\d]/g, ""));
    lastEmittedRef.current = externalVal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const cleanNat = String(national || "").replace(/\D/g, "");
  const cleanCC = String(cc || "").replace(/\D/g, "");
  const e164 = cleanCC && cleanNat ? `+${cleanCC}${cleanNat}` : "";
  const valid = cleanCC.length >= 1 && cleanNat.length >= 6 && cleanNat.length <= 13;
  const showInvalid = touched && national.length > 0 && !valid;

  const emit = (ccVal, natVal) => {
    const c = String(ccVal || "").replace(/\D/g, "");
    const n = String(natVal || "").replace(/\D/g, "");
    const out = (c && n && n.length >= 6) ? `+${c}${n}` : n;
    lastEmittedRef.current = out;
    onChange(out);
  };

  const handleCC = (e) => {
    // Mantiene solo dígitos, max 4 (códigos de país van de 1 a 4 dígitos).
    const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
    setCc(v);
    emit(v, national);
  };
  const handleNat = (e) => {
    setNational(e.target.value);
    emit(cc, e.target.value);
  };
  const handleBlur = () => {
    setTouched(true);
    if (typeof onBlur === "function") onBlur({ e164, valid, countryCode: cleanCC, national: cleanNat });
  };

  const borderColor = showInvalid ? B.danger : "#DDE4EC";

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
        <div
          style={{
            ...baseCtl,
            flex: "0 0 70px",
            display: "flex",
            alignItems: "center",
            gap: 0,
            padding: "0 4px 0 10px",
          }}
        >
          <span style={{ color: "inherit", opacity: 0.7, marginRight: 2 }}>+</span>
          <input
            type="text"
            inputMode="numeric"
            value={cc}
            onChange={handleCC}
            onBlur={handleBlur}
            disabled={disabled}
            aria-label="Código de país"
            style={{
              flex: 1,
              width: "100%",
              minWidth: 0,
              padding: 0,
              margin: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "inherit",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
        </div>
        <input
          type="tel"
          name={name}
          id={id}
          value={national}
          onChange={handleNat}
          onBlur={handleBlur}
          placeholder={String(placeholder || "").replace(/^\+\d{1,4}\s*/, "")}
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
            : "Cambia el código si es de otro país (ej: 1 para USA, 52 para México)"}
        </div>
      )}
    </div>
  );
}
