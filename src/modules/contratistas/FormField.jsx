// Campos de formulario reutilizables para el Portal de Contratistas.
// Paleta clara (cream/navy/sand). Inline styles.

import { C } from "./constants";

const labelStyle = { display: "block", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.navy, fontWeight: 800, marginBottom: 6 };
const inputBase = {
  width: "100%", padding: "13px 16px", border: `1.5px solid ${C.border}`, background: C.white,
  fontSize: 15, fontFamily: "inherit", color: C.navy, borderRadius: 0, outline: "none",
  boxSizing: "border-box", transition: "all 0.2s ease",
};
const inputError = { borderColor: C.error, background: C.errorBg };
const hintStyle = { fontSize: 12, color: C.navyLight, marginTop: 6, fontStyle: "italic", opacity: 0.8 };
const errorStyle = { fontSize: 12, color: C.error, marginTop: 6, fontWeight: 700 };

export function FormRow({ children, full = false }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: full ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 4 }}>
      {children}
    </div>
  );
}

export function FormGroup({ children }) {
  return <div style={{ marginBottom: 18 }}>{children}</div>;
}

export function Label({ children, required }) {
  return (
    <label style={labelStyle}>
      {children}{required && <span style={{ color: C.error, marginLeft: 2 }}>*</span>}
    </label>
  );
}

export function Field({ label, required, hint, error, type = "text", value, onChange, placeholder, maxLength, min, max, inputMode, disabled, autoComplete }) {
  return (
    <FormGroup>
      {label && <Label required={required}>{label}</Label>}
      <input
        type={type}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        min={min}
        max={max}
        inputMode={inputMode}
        disabled={disabled}
        autoComplete={autoComplete}
        style={{ ...inputBase, ...(error ? inputError : {}), ...(disabled ? { background: C.sandPale, cursor: "not-allowed" } : {}) }}
        onFocus={e => { if (!error) { e.target.style.borderColor = C.navy; e.target.style.boxShadow = `0 0 0 3px rgba(142, 202, 230, 0.35)`; } }}
        onBlur={e => { e.target.style.boxShadow = "none"; e.target.style.borderColor = error ? C.error : C.border; }}
      />
      {error && <div style={errorStyle}>{error}</div>}
      {!error && hint && <div style={hintStyle}>{hint}</div>}
    </FormGroup>
  );
}

export function Select({ label, required, hint, error, value, onChange, options, placeholder = "— Seleccione —", disabled }) {
  return (
    <FormGroup>
      {label && <Label required={required}>{label}</Label>}
      <select
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ ...inputBase, ...(error ? inputError : {}), ...(disabled ? { background: C.sandPale, cursor: "not-allowed" } : {}) }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
      {error && <div style={errorStyle}>{error}</div>}
      {!error && hint && <div style={hintStyle}>{hint}</div>}
    </FormGroup>
  );
}

export function Textarea({ label, required, hint, error, value, onChange, placeholder, maxLength, rows = 4 }) {
  return (
    <FormGroup>
      {label && <Label required={required}>{label}</Label>}
      <textarea
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        style={{ ...inputBase, ...(error ? inputError : {}), minHeight: 100, resize: "vertical", fontFamily: "inherit" }}
      />
      {error && <div style={errorStyle}>{error}</div>}
      {!error && hint && <div style={hintStyle}>{hint}</div>}
    </FormGroup>
  );
}

export function Card({ children, style }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, padding: 28, marginBottom: 20, boxShadow: "0 2px 8px rgba(13, 27, 62, 0.04)", ...style }}>
      {children}
    </div>
  );
}

export function Callout({ children, title, variant }) {
  const bg = { warn: C.warnBg, danger: C.errorBg, success: C.successBg, info: C.skyLight }[variant || "info"];
  const border = { warn: C.warn, danger: C.error, success: C.success, info: C.navy }[variant || "info"];
  return (
    <div style={{ background: bg, borderLeft: `4px solid ${border}`, padding: "18px 22px", margin: "22px 0", fontSize: 14, lineHeight: 1.55 }}>
      {title && <div style={{ fontWeight: 900, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6, color: C.navy }}>{title}</div>}
      <div style={{ color: C.navy }}>{children}</div>
    </div>
  );
}

export function SectionTitle({ children }) {
  return (
    <h3 style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: C.navy, fontWeight: 800, margin: "32px 0 16px", paddingBottom: 8, borderBottom: `1px solid ${C.sand}` }}>
      {children}
    </h3>
  );
}

export function CheckItem({ checked, onToggle, children }) {
  return (
    <label
      onClick={onToggle}
      style={{
        display: "flex", gap: 12, padding: "14px 16px",
        background: checked ? C.skyLight : C.white,
        border: `1px solid ${checked ? C.navy : C.border}`,
        marginBottom: 10, cursor: "pointer", transition: "all 0.2s ease",
      }}
    >
      <div style={{
        width: 22, height: 22, border: `2px solid ${C.navy}`, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1,
        fontWeight: 900, color: checked ? C.white : "transparent",
        background: checked ? C.navy : "transparent",
      }}>✓</div>
      <div style={{ flex: 1, fontSize: 14, lineHeight: 1.55, color: C.navy }}>{children}</div>
    </label>
  );
}
