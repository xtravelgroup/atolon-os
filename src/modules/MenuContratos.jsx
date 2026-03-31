import { useState } from "react";
import { B, COP, PASADIAS } from "../brand";

const EXTRAS = [
  { id: "deco", name: "Decoracion tematica", precio: 850000 },
  { id: "dj", name: "DJ + Sonido (4h)", precio: 1200000 },
  { id: "foto", name: "Fotografo profesional", precio: 950000 },
  { id: "cake", name: "Torta personalizada", precio: 450000 },
  { id: "bar_prem", name: "Bar Premium upgrade", precio: 180000 },
  { id: "lancha_priv", name: "Lancha privada (ida/vuelta)", precio: 2500000 },
];

export default function MenuContratos() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    tipo: "", pax: 4, fecha: "", extras: [],
    nombre: "", email: "", tel: "", empresa: "", notas: "",
  });

  const pass = PASADIAS.find(p => p.tipo === form.tipo);
  const extrasTotal = form.extras.reduce((s, eid) => s + (EXTRAS.find(e => e.id === eid)?.precio || 0), 0);
  const subtotal = (pass?.precio || 0) * form.pax;
  const total = subtotal + extrasTotal;

  const toggleExtra = id => {
    setForm(f => ({ ...f, extras: f.extras.includes(id) ? f.extras.filter(e => e !== id) : [...f.extras, id] }));
  };

  const StepBar = () => (
    <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
      {[1, 2, 3, 4].map(s => (
        <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? B.sand : B.navyLight, transition: "background 0.3s" }} />
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600 }}>Cotizador y Contratos</h2>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Paso {step} de 4</div>
      </div>

      <StepBar />

      <div style={{ background: B.navyMid, borderRadius: 12, padding: 32, maxWidth: 700 }}>
        {step === 1 && (
          <div>
            <h3 style={{ marginBottom: 20, fontSize: 18 }}>Selecciona el Tipo de Pasadia</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {PASADIAS.map(p => (
                <div key={p.tipo} onClick={() => setForm(f => ({ ...f, tipo: p.tipo, pax: Math.max(f.pax, p.minPax) }))}
                  style={{
                    background: form.tipo === p.tipo ? B.navyLight : B.navy, borderRadius: 12, padding: 20,
                    border: `2px solid ${form.tipo === p.tipo ? B.sand : "transparent"}`, cursor: "pointer", transition: "all 0.2s",
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{p.tipo}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(p.precio)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>por persona | Min. {p.minPax} pax</div>
                  {!p.web && <div style={{ fontSize: 11, color: B.warning, marginTop: 4 }}>Solo B2B</div>}
                </div>
              ))}
            </div>
            <button onClick={() => form.tipo && setStep(2)} disabled={!form.tipo}
              style={{ marginTop: 24, width: "100%", padding: "14px", background: form.tipo ? B.sand : B.navyLight, color: form.tipo ? B.navy : "rgba(255,255,255,0.3)", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: form.tipo ? "pointer" : "default" }}>
              Siguiente
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 style={{ marginBottom: 20, fontSize: 18 }}>Detalles y Extras</h3>
            <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 4 }}>Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 4 }}>Personas</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={() => setForm(f => ({ ...f, pax: Math.max(pass?.minPax || 1, f.pax - 1) }))}
                    style={{ width: 36, height: 36, borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 18, cursor: "pointer" }}>-</button>
                  <span style={{ fontSize: 20, fontWeight: 700, minWidth: 30, textAlign: "center" }}>{form.pax}</span>
                  <button onClick={() => setForm(f => ({ ...f, pax: f.pax + 1 }))}
                    style={{ width: 36, height: 36, borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 18, cursor: "pointer" }}>+</button>
                </div>
              </div>
            </div>
            <h4 style={{ fontSize: 14, color: B.sand, marginBottom: 12 }}>Extras</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
              {EXTRAS.map(e => (
                <div key={e.id} onClick={() => toggleExtra(e.id)} style={{
                  padding: "12px 16px", borderRadius: 8, cursor: "pointer",
                  background: form.extras.includes(e.id) ? B.navyLight : B.navy,
                  border: `1px solid ${form.extras.includes(e.id) ? B.sand : B.navyLight}`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontSize: 13 }}>{e.name}</span>
                  <span style={{ fontSize: 13, color: B.sand }}>{COP(e.precio)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: "14px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, cursor: "pointer" }}>Atras</button>
              <button onClick={() => setStep(3)} style={{ flex: 1, padding: "14px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Siguiente</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 style={{ marginBottom: 20, fontSize: 18 }}>Datos del Cliente</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { key: "nombre", label: "Nombre completo", ph: "Juan Perez" },
                { key: "email", label: "Email", ph: "juan@email.com" },
                { key: "tel", label: "Telefono", ph: "+57 300 ..." },
                { key: "empresa", label: "Empresa (opcional)", ph: "Nombre empresa" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.ph}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 4 }}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={3}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button onClick={() => setStep(2)} style={{ flex: 1, padding: "14px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, cursor: "pointer" }}>Atras</button>
              <button onClick={() => setStep(4)} style={{ flex: 1, padding: "14px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Ver Resumen</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h3 style={{ marginBottom: 20, fontSize: 18 }}>Resumen del Contrato</h3>
            <div style={{ background: B.navy, borderRadius: 12, padding: 24, marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 14, lineHeight: 2 }}>
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Tipo:</span> {form.tipo}</div>
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Fecha:</span> {form.fecha || "Por definir"}</div>
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Personas:</span> {form.pax}</div>
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Cliente:</span> {form.nombre || "—"}</div>
              </div>
              {form.extras.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${B.navyLight}` }}>
                  <div style={{ fontSize: 12, color: B.sand, marginBottom: 8, textTransform: "uppercase" }}>Extras</div>
                  {form.extras.map(eid => {
                    const ex = EXTRAS.find(e => e.id === eid);
                    return <div key={eid} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span>{ex?.name}</span><span style={{ color: B.sand }}>{COP(ex?.precio)}</span></div>;
                  })}
                </div>
              )}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>Subtotal pasadia ({form.pax} x {COP(pass?.precio)})</span><span>{COP(subtotal)}</span>
              </div>
              {extrasTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 4 }}><span>Extras</span><span>{COP(extrasTotal)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 700, marginTop: 12, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>
                <span>TOTAL</span><span>{COP(total)}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setStep(3)} style={{ flex: 1, padding: "14px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, cursor: "pointer" }}>Atras</button>
              <button style={{ flex: 1, padding: "14px", background: B.success, color: B.white, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Generar Contrato</button>
              <button style={{ flex: 1, padding: "14px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Enviar al Cliente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
