import React, { useState, useEffect, useMemo, useRef } from "react";
import { B } from "../brand.js";
import { normalizarTelefono } from "../lib/telefono.js";

// Lista de países con bandera, código y nombre (ES). Colombia primero (default),
// luego el resto de Latinoamérica y principales mercados emisores de Atolón.
const COUNTRIES = [
  { code: "57",  name: "Colombia",         flag: "🇨🇴" },
  { code: "1",   name: "Estados Unidos",   flag: "🇺🇸" },
  { code: "1",   name: "Canadá",           flag: "🇨🇦", alias: "canada" },
  { code: "52",  name: "México",           flag: "🇲🇽" },
  { code: "54",  name: "Argentina",        flag: "🇦🇷" },
  { code: "55",  name: "Brasil",           flag: "🇧🇷" },
  { code: "56",  name: "Chile",            flag: "🇨🇱" },
  { code: "51",  name: "Perú",             flag: "🇵🇪" },
  { code: "593", name: "Ecuador",          flag: "🇪🇨" },
  { code: "58",  name: "Venezuela",        flag: "🇻🇪" },
  { code: "591", name: "Bolivia",          flag: "🇧🇴" },
  { code: "595", name: "Paraguay",         flag: "🇵🇾" },
  { code: "598", name: "Uruguay",          flag: "🇺🇾" },
  { code: "506", name: "Costa Rica",       flag: "🇨🇷" },
  { code: "507", name: "Panamá",           flag: "🇵🇦" },
  { code: "502", name: "Guatemala",        flag: "🇬🇹" },
  { code: "503", name: "El Salvador",      flag: "🇸🇻" },
  { code: "504", name: "Honduras",         flag: "🇭🇳" },
  { code: "505", name: "Nicaragua",        flag: "🇳🇮" },
  { code: "509", name: "Haití",            flag: "🇭🇹" },
  { code: "53",  name: "Cuba",             flag: "🇨🇺" },
  { code: "1",   name: "Rep. Dominicana",  flag: "🇩🇴", alias: "dominicana" },
  { code: "1",   name: "Puerto Rico",      flag: "🇵🇷", alias: "puerto rico" },
  { code: "34",  name: "España",           flag: "🇪🇸" },
  { code: "44",  name: "Reino Unido",      flag: "🇬🇧" },
  { code: "33",  name: "Francia",          flag: "🇫🇷" },
  { code: "49",  name: "Alemania",         flag: "🇩🇪" },
  { code: "39",  name: "Italia",           flag: "🇮🇹" },
  { code: "351", name: "Portugal",         flag: "🇵🇹" },
  { code: "31",  name: "Países Bajos",     flag: "🇳🇱" },
  { code: "32",  name: "Bélgica",          flag: "🇧🇪" },
  { code: "41",  name: "Suiza",            flag: "🇨🇭" },
  { code: "43",  name: "Austria",          flag: "🇦🇹" },
  { code: "46",  name: "Suecia",           flag: "🇸🇪" },
  { code: "47",  name: "Noruega",          flag: "🇳🇴" },
  { code: "45",  name: "Dinamarca",        flag: "🇩🇰" },
  { code: "358", name: "Finlandia",        flag: "🇫🇮" },
  { code: "353", name: "Irlanda",          flag: "🇮🇪" },
  { code: "48",  name: "Polonia",          flag: "🇵🇱" },
  { code: "420", name: "Rep. Checa",       flag: "🇨🇿" },
  { code: "30",  name: "Grecia",           flag: "🇬🇷" },
  { code: "90",  name: "Turquía",          flag: "🇹🇷" },
  { code: "972", name: "Israel",           flag: "🇮🇱" },
  { code: "971", name: "Emiratos Árabes",  flag: "🇦🇪" },
  { code: "966", name: "Arabia Saudita",   flag: "🇸🇦" },
  { code: "20",  name: "Egipto",           flag: "🇪🇬" },
  { code: "27",  name: "Sudáfrica",        flag: "🇿🇦" },
  { code: "234", name: "Nigeria",          flag: "🇳🇬" },
  { code: "91",  name: "India",            flag: "🇮🇳" },
  { code: "86",  name: "China",            flag: "🇨🇳" },
  { code: "81",  name: "Japón",            flag: "🇯🇵" },
  { code: "82",  name: "Corea del Sur",    flag: "🇰🇷" },
  { code: "65",  name: "Singapur",         flag: "🇸🇬" },
  { code: "60",  name: "Malasia",          flag: "🇲🇾" },
  { code: "66",  name: "Tailandia",        flag: "🇹🇭" },
  { code: "62",  name: "Indonesia",        flag: "🇮🇩" },
  { code: "63",  name: "Filipinas",        flag: "🇵🇭" },
  { code: "84",  name: "Vietnam",          flag: "🇻🇳" },
  { code: "61",  name: "Australia",        flag: "🇦🇺" },
  { code: "64",  name: "Nueva Zelanda",    flag: "🇳🇿" },
];

function findCountry(code) {
  const c = String(code || "").replace(/\D/g, "");
  return COUNTRIES.find(x => x.code === c) || null;
}

// Input teléfono: selector de país (bandera + nombre) + código editable + número.
// El usuario ve claramente que "+57" es Colombia. Al click en el país abre un
// picker con buscador (por nombre o código) que cubre los principales mercados.
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pickerRef = useRef(null);
  // Trackea la última cadena que este componente emitió al padre. Si el
  // `value` que vuelve del padre es la misma que emitimos, NO re-sync
  // (evita que `normalizarTelefono` interprete "300" como Grecia +30 mientras
  // el usuario aún está tipeando, borrando dígitos parciales).
  const lastEmittedRef = useRef(value || "");

  useEffect(() => {
    const externalVal = String(value || "");
    if (externalVal === String(lastEmittedRef.current || "")) return;
    // value cambió desde afuera (ej. al abrir el modal con una reserva existente).
    const p = normalizarTelefono(externalVal);
    if (p.countryCode) setCc(p.countryCode);
    setNational(p.national || externalVal.replace(/[^\d]/g, ""));
    lastEmittedRef.current = externalVal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Cerrar picker al click fuera
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  const cleanNat = String(national || "").replace(/\D/g, "");
  const cleanCC = String(cc || "").replace(/\D/g, "");
  const valid = cleanCC.length >= 1 && cleanNat.length >= 6 && cleanNat.length <= 13;
  const showInvalid = touched && national.length > 0 && !valid;
  const currentCountry = findCountry(cleanCC);

  const emit = (ccVal, natVal) => {
    const c = String(ccVal || "").replace(/\D/g, "");
    const n = String(natVal || "").replace(/\D/g, "");
    const out = (c && n && n.length >= 6) ? `+${c}${n}` : n;
    lastEmittedRef.current = out;
    onChange(out);
  };

  const handleCC = (e) => {
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
    if (typeof onBlur === "function") {
      onBlur({ e164: cleanCC && cleanNat ? `+${cleanCC}${cleanNat}` : "", valid, countryCode: cleanCC, national: cleanNat });
    }
  };

  const pickCountry = (country) => {
    setCc(country.code);
    setPickerOpen(false);
    setQuery("");
    emit(country.code, national);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.alias || "").toLowerCase().includes(q) ||
      c.code.includes(q.replace(/\D/g, ""))
    );
  }, [query]);

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
        <label htmlFor={id} style={{ fontSize: 12, fontWeight: 600, color: B.navy, letterSpacing: 0.3 }}>
          {label} {required && <span style={{ color: B.danger }}>*</span>}
        </label>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "stretch", position: "relative" }} ref={pickerRef}>
        {/* Selector de país (bandera + nombre corto + +CC) */}
        <button
          type="button"
          onClick={() => !disabled && setPickerOpen(o => !o)}
          disabled={disabled}
          style={{
            ...baseCtl,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 10px",
            cursor: disabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            fontWeight: 600,
            whiteSpace: "nowrap",
            minWidth: 128,
          }}
          aria-label="Elegir país"
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>{currentCountry?.flag || "🌐"}</span>
          <span style={{ fontSize: 13 }}>
            {currentCountry ? currentCountry.name : "País"}
          </span>
          <span style={{ marginLeft: "auto", opacity: 0.6, fontSize: 11 }}>▾</span>
        </button>

        {/* Input +CC editable */}
        <div
          style={{
            ...baseCtl,
            flex: "0 0 64px",
            display: "flex",
            alignItems: "center",
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
              flex: 1, width: "100%", minWidth: 0, padding: 0, margin: 0,
              border: "none", outline: "none", background: "transparent",
              color: "inherit", fontSize: 14, fontFamily: "inherit",
            }}
          />
        </div>

        {/* Input número */}
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

        {/* Dropdown picker de país */}
        {pickerOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 1000,
              background: "#FFF",
              border: `1px solid #DDE4EC`,
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              maxHeight: 320,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 8, borderBottom: `1px solid #EEF2F6` }}>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="🔎 Buscar país (nombre o código)…"
                autoFocus
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6,
                  border: `1px solid #DDE4EC`, fontSize: 13, outline: "none",
                  color: B.navy, background: "#F7FAFC", boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {filtered.length === 0 && (
                <div style={{ padding: "16px 12px", fontSize: 12, color: "#7A8B99", textAlign: "center" }}>
                  Sin resultados
                </div>
              )}
              {filtered.map((c, i) => {
                const active = c.code === cleanCC && c.name === currentCountry?.name;
                return (
                  <button
                    key={`${c.code}-${c.name}-${i}`}
                    type="button"
                    onClick={() => pickCountry(c)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "9px 12px", background: active ? "#E6F0FA" : "transparent",
                      border: "none", cursor: "pointer", fontSize: 13, color: B.navy,
                      fontFamily: "inherit", textAlign: "left",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#F5F8FB"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{c.flag}</span>
                    <span style={{ flex: 1 }}>{c.name}</span>
                    <span style={{ color: "#7A8B99", fontVariantNumeric: "tabular-nums" }}>+{c.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {(showHint || showInvalid) && (
        <div style={{ fontSize: 11, color: showInvalid ? B.danger : "#7A8B99", lineHeight: 1.4 }}>
          {showInvalid
            ? "Número inválido. Escribe solo dígitos (ej: 300 123 4567)"
            : "Click en la bandera para cambiar de país"}
        </div>
      )}
    </div>
  );
}
