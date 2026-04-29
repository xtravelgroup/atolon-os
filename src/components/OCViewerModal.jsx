// OCViewerModal — Modal read-only para ver una Orden de Compra completa.
// Lo usan: módulo Pagos (click en OC pendiente) y cualquier otro flujo
// que necesite mostrar detalles de una OC sin permitir edición.

import { B } from "../brand";

const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtFecha = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};

const ESTADOS = {
  borrador:        { color: "rgba(255,255,255,0.4)", label: "Borrador" },
  enviada:         { color: B.sky,                   label: "Enviada al proveedor" },
  confirmada:      { color: B.success,               label: "Confirmada" },
  recibida_parcial:{ color: B.warning,               label: "Recibida parcial" },
  recibida:        { color: B.success,               label: "Recibida" },
  pagada:          { color: B.success,               label: "Pagada" },
  cancelada:       { color: B.danger,                label: "Cancelada" },
};

export default function OCViewerModal({ oc, onClose }) {
  if (!oc) return null;

  const estadoInfo = ESTADOS[oc.estado] || { color: "rgba(255,255,255,0.5)", label: oc.estado || "—" };
  const items = Array.isArray(oc.items) ? oc.items : [];
  const subtotal = Number(oc.subtotal || 0) || items.reduce((s, it) => s + (Number(it.cantidad || it.cant || 0) * Number(it.precio_unit || it.precio || 0)), 0);
  const iva      = Number(oc.iva || 0);
  const total    = Number(oc.total || 0) || subtotal + iva;
  const pagado   = Number(oc.monto_pagado || 0);
  const saldo    = total - pagado;

  return (
    <div onClick={e => e.target === e.currentTarget && onClose?.()}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}>
      <div style={{
        background: B.navyMid, borderRadius: 14, width: "100%", maxWidth: 760,
        maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: `1px solid ${B.navyLight}`,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14,
          background: B.navy,
        }}>
          <div>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Orden de Compra
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 4 }}>
              {oc.codigo}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: estadoInfo.color + "22", color: estadoInfo.color, fontWeight: 700 }}>
                {estadoInfo.label}
              </span>
              {oc.pagada_completa && (
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: B.success + "22", color: B.success, fontWeight: 700 }}>
                  ✓ Pagada
                </span>
              )}
              {oc.anticipo_pagado && (
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: B.sky + "22", color: B.sky, fontWeight: 700 }}>
                  🏦 Anticipo {COP(oc.anticipo_monto || 0)} pagado
                </span>
              )}
            </div>
          </div>
          <button onClick={() => onClose?.()}
            style={{ background: "transparent", border: "none", color: "#fff", fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: 24 }}>
          {/* Info proveedor + fechas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
            <Section label="Proveedor">
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{oc.proveedor_nombre || "—"}</div>
              {oc.proveedor_nit      && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>NIT: {oc.proveedor_nit}</div>}
              {oc.proveedor_email    && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{oc.proveedor_email}</div>}
              {oc.proveedor_telefono && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{oc.proveedor_telefono}</div>}
            </Section>
            <Section label="Fechas">
              <Field k="Emisión"      v={fmtFecha(oc.fecha_emision)} />
              <Field k="Entrega"      v={fmtFecha(oc.fecha_entrega)} />
              {oc.fecha_vencimiento_pago && <Field k="Vencimiento pago" v={fmtFecha(oc.fecha_vencimiento_pago)} />}
            </Section>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Ítems ({items.length})
            </div>
            <div style={{ background: B.navy, borderRadius: 8, overflow: "hidden", border: `1px solid ${B.navyLight}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: B.navyLight }}>
                    <th style={th}>#</th>
                    <th style={{ ...th, textAlign: "left" }}>Ítem</th>
                    <th style={{ ...th, textAlign: "right" }}>Cant.</th>
                    <th style={{ ...th, textAlign: "left" }}>Unidad</th>
                    <th style={{ ...th, textAlign: "right" }}>P. unit</th>
                    <th style={{ ...th, textAlign: "right" }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Sin ítems.</td></tr>
                  ) : items.map((it, i) => {
                    const cant = Number(it.cantidad || it.cant || 0);
                    const pu   = Number(it.precio_unit || it.precio || 0);
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${B.navyLight}` }}>
                        <td style={td}>{i + 1}</td>
                        <td style={{ ...td, color: "#fff" }}>{it.item || it.nombre || "—"}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{cant}</td>
                        <td style={td}>{it.unidad || ""}</td>
                        <td style={{ ...td, textAlign: "right" }}>{COP(pu)}</td>
                        <td style={{ ...td, textAlign: "right", color: B.sand, fontWeight: 700 }}>{COP(cant * pu)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
            <div style={{ minWidth: 280, background: B.navy, padding: 14, borderRadius: 8, border: `1px solid ${B.navyLight}` }}>
              <Linea k="Subtotal" v={COP(subtotal)} />
              {iva > 0 && <Linea k="IVA" v={COP(iva)} />}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${B.navyLight}`, marginTop: 8, fontSize: 16, fontWeight: 800 }}>
                <span style={{ color: B.sand }}>Total</span>
                <span style={{ color: B.sand }}>{COP(total)}</span>
              </div>
              {pagado > 0 && (
                <>
                  <Linea k="Pagado"      v={COP(pagado)} c={B.success} mt={6} />
                  <Linea k="Saldo"       v={COP(saldo)}  c={saldo > 0 ? B.warning : B.success} />
                </>
              )}
              {oc.anticipo_monto > 0 && (
                <Linea k={`Anticipo ${oc.anticipo_pagado ? "(pagado)" : "(pendiente)"}`} v={COP(oc.anticipo_monto)} c={oc.anticipo_pagado ? B.success : B.warning} mt={6} />
              )}
            </div>
          </div>

          {/* Notas */}
          {oc.notas && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Notas</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", background: B.navy, padding: 12, borderRadius: 8, border: `1px solid ${B.navyLight}`, whiteSpace: "pre-wrap" }}>
                {oc.notas}
              </div>
            </div>
          )}

          {/* Comprobantes existentes */}
          {(oc.anticipo_comprobante_url || oc.factura_url) && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Documentos</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {oc.anticipo_comprobante_url && (
                  <a href={oc.anticipo_comprobante_url} target="_blank" rel="noreferrer"
                    style={linkBtn}>📎 Comprobante anticipo</a>
                )}
                {oc.factura_url && (
                  <a href={oc.factura_url} target="_blank" rel="noreferrer"
                    style={linkBtn}>📄 Factura</a>
                )}
              </div>
            </div>
          )}

          {/* Cerrar */}
          <div style={{ display: "flex", justifyContent: "flex-end", borderTop: `1px solid ${B.navyLight}`, paddingTop: 16 }}>
            <button onClick={() => onClose?.()}
              style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ background: B.navy, padding: 12, borderRadius: 8, border: `1px solid ${B.navyLight}` }}>
        {children}
      </div>
    </div>
  );
}

function Field({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
      <span style={{ color: "rgba(255,255,255,0.5)" }}>{k}</span>
      <span style={{ color: "#fff", fontWeight: 600 }}>{v}</span>
    </div>
  );
}

function Linea({ k, v, c = "#fff", mt = 0 }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12, marginTop: mt }}>
      <span style={{ color: "rgba(255,255,255,0.65)" }}>{k}</span>
      <span style={{ color: c, fontWeight: 700 }}>{v}</span>
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" };
const td = { padding: "8px 10px", color: "rgba(255,255,255,0.7)" };
const linkBtn = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`,
  background: B.navy, color: B.sky, fontSize: 12, fontWeight: 700,
  textDecoration: "none", cursor: "pointer",
};
