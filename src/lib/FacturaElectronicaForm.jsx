// ── Facturación Electrónica (Colombia / DIAN) ────────────────────────────────
// Componente reutilizable para capturar datos de FE en cualquier flujo
// (Reservas internas, BookingPopup web, AgenciaPortal B2B, etc.)

export const FE_TIPO_DOC_NATURAL = ["CC", "CE", "Pasaporte", "TI", "RC", "PEP"];
export const FE_TIPO_DOC_JURIDICA = ["NIT"];
export const FE_REGIMENES = [
  { key: "no_responsable_iva", label: "No responsable de IVA" },
  { key: "responsable_iva",    label: "Responsable de IVA" },
  { key: "gran_contribuyente", label: "Gran contribuyente" },
  { key: "simple",             label: "Régimen simple" },
];

// Defaults para inicializar un form con campos FE
export const FE_EMPTY = {
  factura_electronica: false,
  fe_tipo_persona:    "natural",
  fe_tipo_documento:  "CC",
  fe_numero_documento: "",
  fe_dv:              "",
  fe_razon_social:    "",
  fe_nombres:         "",
  fe_apellidos:       "",
  fe_email:           "",
  fe_telefono:        "",
  fe_direccion:       "",
  fe_ciudad:          "",
  fe_departamento:    "",
  fe_pais:            "Colombia",
  fe_regimen:         "no_responsable_iva",
};

// Validación: devuelve array de campos faltantes (vacío si OK)
export function feValidate(form) {
  if (!form.factura_electronica) return [];
  const req = ["fe_tipo_persona", "fe_tipo_documento", "fe_numero_documento", "fe_email", "fe_telefono", "fe_direccion", "fe_ciudad", "fe_departamento", "fe_pais", "fe_regimen"];
  const esJuridica = form.fe_tipo_persona === "juridica";
  if (esJuridica) req.push("fe_razon_social", "fe_dv");
  else req.push("fe_nombres", "fe_apellidos");
  return req.filter(k => !form[k] || String(form[k]).trim() === "");
}

// Construye el payload de campos FE para insertar/actualizar en reservas
export function fePayload(form) {
  const on = !!form.factura_electronica;
  return {
    factura_electronica: on,
    fe_tipo_persona:     on ? form.fe_tipo_persona     : null,
    fe_tipo_documento:   on ? form.fe_tipo_documento   : null,
    fe_numero_documento: on ? form.fe_numero_documento : null,
    fe_dv:               on ? (form.fe_dv || null)      : null,
    fe_razon_social:     on ? (form.fe_razon_social || null) : null,
    fe_nombres:          on ? (form.fe_nombres || null) : null,
    fe_apellidos:        on ? (form.fe_apellidos || null) : null,
    fe_email:            on ? form.fe_email            : null,
    fe_telefono:         on ? form.fe_telefono         : null,
    fe_direccion:        on ? form.fe_direccion        : null,
    fe_ciudad:           on ? form.fe_ciudad           : null,
    fe_departamento:     on ? form.fe_departamento     : null,
    fe_pais:             on ? (form.fe_pais || "Colombia") : null,
    fe_regimen:          on ? form.fe_regimen          : null,
  };
}

// Tema claro/oscuro — auto-detecta por prop theme
const themes = {
  dark: {
    bg:      "rgba(251,191,36,0.06)",
    border:  "rgba(251,191,36,0.2)",
    title:   "#fbbf24",
    inputBg: "#0A1A3C",
    inputBorder: "rgba(255,255,255,0.1)",
    inputColor: "#fff",
    labelColor: "rgba(255,255,255,0.5)",
    hint:    "rgba(255,255,255,0.3)",
  },
  light: {
    bg:      "rgba(251,191,36,0.1)",
    border:  "rgba(251,191,36,0.3)",
    title:   "#a16207",
    inputBg: "#fff",
    inputBorder: "rgba(0,0,0,0.1)",
    inputColor: "#1A2740",
    labelColor: "rgba(0,0,0,0.55)",
    hint:    "rgba(0,0,0,0.4)",
  },
};

export default function FacturaElectronicaForm({ form, set, editing = true, theme = "dark" }) {
  const t = themes[theme] || themes.dark;
  const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.inputColor, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const LS = { fontSize: 11, color: t.labelColor, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

  const esJuridica = form.fe_tipo_persona === "juridica";
  const tiposDoc = esJuridica ? FE_TIPO_DOC_JURIDICA : FE_TIPO_DOC_NATURAL;

  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 12, padding: "16px 18px", marginTop: 12 }}>
      <div style={{ fontSize: 11, color: t.title, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
        📄 Datos para Facturación Electrónica
      </div>
      {!editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 12, color: t.inputColor }}>
          <div><span style={{ color: t.labelColor }}>Tipo: </span>{esJuridica ? "Jurídica" : "Natural"}</div>
          <div><span style={{ color: t.labelColor }}>{form.fe_tipo_documento}: </span>{form.fe_numero_documento}{form.fe_dv && "-" + form.fe_dv}</div>
          <div style={{ gridColumn: "1 / -1" }}><span style={{ color: t.labelColor }}>Razón social: </span>{form.fe_razon_social || `${form.fe_nombres || ""} ${form.fe_apellidos || ""}`.trim()}</div>
          <div><span style={{ color: t.labelColor }}>Email: </span>{form.fe_email}</div>
          <div><span style={{ color: t.labelColor }}>Tel: </span>{form.fe_telefono}</div>
          <div style={{ gridColumn: "1 / -1" }}><span style={{ color: t.labelColor }}>Dirección: </span>{form.fe_direccion}, {form.fe_ciudad}, {form.fe_departamento}, {form.fe_pais}</div>
          <div><span style={{ color: t.labelColor }}>Régimen: </span>{FE_REGIMENES.find(r => r.key === form.fe_regimen)?.label || "—"}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LS}>Tipo de persona *</label>
            <select style={IS} value={form.fe_tipo_persona || "natural"} onChange={e => {
              set("fe_tipo_persona", e.target.value);
              set("fe_tipo_documento", e.target.value === "juridica" ? "NIT" : "CC");
            }}>
              <option value="natural">Natural</option>
              <option value="juridica">Jurídica</option>
            </select>
          </div>
          <div>
            <label style={LS}>Tipo documento *</label>
            <select style={IS} value={form.fe_tipo_documento || "CC"} onChange={e => set("fe_tipo_documento", e.target.value)}>
              {tiposDoc.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: esJuridica ? "span 1" : "1 / -1" }}>
            <label style={LS}>Número de documento *</label>
            <input style={IS} value={form.fe_numero_documento || ""} onChange={e => set("fe_numero_documento", e.target.value)} placeholder="Sin puntos ni guiones" />
          </div>
          {esJuridica && (
            <div>
              <label style={LS}>DV (dígito verificación) *</label>
              <input style={IS} value={form.fe_dv || ""} maxLength={1} onChange={e => set("fe_dv", e.target.value.replace(/[^0-9]/g, ""))} placeholder="0-9" />
            </div>
          )}
          {esJuridica ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LS}>Razón social *</label>
              <input style={IS} value={form.fe_razon_social || ""} onChange={e => set("fe_razon_social", e.target.value)} placeholder="EJ: ATOLÓN BEACH CLUB S.A.S" />
            </div>
          ) : (
            <>
              <div>
                <label style={LS}>Nombres *</label>
                <input style={IS} value={form.fe_nombres || ""} onChange={e => set("fe_nombres", e.target.value)} />
              </div>
              <div>
                <label style={LS}>Apellidos *</label>
                <input style={IS} value={form.fe_apellidos || ""} onChange={e => set("fe_apellidos", e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label style={LS}>Email facturación *</label>
            <input type="email" style={IS} value={form.fe_email || ""} onChange={e => set("fe_email", e.target.value)} placeholder="correo@ejemplo.com" />
          </div>
          <div>
            <label style={LS}>Teléfono *</label>
            <input style={IS} value={form.fe_telefono || ""} onChange={e => set("fe_telefono", e.target.value)} placeholder="+57 300 000 0000" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LS}>Dirección *</label>
            <input style={IS} value={form.fe_direccion || ""} onChange={e => set("fe_direccion", e.target.value)} placeholder="Cra 7 #12-34" />
          </div>
          <div>
            <label style={LS}>Ciudad *</label>
            <input style={IS} value={form.fe_ciudad || ""} onChange={e => set("fe_ciudad", e.target.value)} placeholder="Cartagena" />
          </div>
          <div>
            <label style={LS}>Departamento *</label>
            <input style={IS} value={form.fe_departamento || ""} onChange={e => set("fe_departamento", e.target.value)} placeholder="Bolívar" />
          </div>
          <div>
            <label style={LS}>País *</label>
            <input style={IS} value={form.fe_pais || "Colombia"} onChange={e => set("fe_pais", e.target.value)} />
          </div>
          <div>
            <label style={LS}>Régimen tributario *</label>
            <select style={IS} value={form.fe_regimen || "no_responsable_iva"} onChange={e => set("fe_regimen", e.target.value)}>
              {FE_REGIMENES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
        </div>
      )}
      <div style={{ fontSize: 10, color: t.hint, marginTop: 10 }}>
        La factura se enviará al email indicado. Los campos marcados con * son obligatorios.
      </div>
    </div>
  );
}

// Checkbox compact que encapsula la activación del FE
export function FacturaElectronicaToggle({ checked, onChange, theme = "dark" }) {
  const t = themes[theme] || themes.dark;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", background: t.bg, border: `1px solid ${checked ? "#fbbf24" : t.inputBorder}`, borderRadius: 10 }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#fbbf24" }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: checked ? "#fbbf24" : t.inputColor }}>📄 Requiere facturación electrónica</div>
        <div style={{ fontSize: 11, color: t.labelColor, marginTop: 2 }}>Marca si necesitas factura electrónica DIAN</div>
      </div>
    </label>
  );
}
