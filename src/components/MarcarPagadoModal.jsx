// MarcarPagadoModal — Reemplaza el flujo de prompt() por un modal con
// referencia + cuenta origen + upload de comprobante. Lo usa el módulo
// Pagos cuando el usuario marca un pago como completado.
//
// Soporta los 3 flujos:
//   accion = "marcar_anticipo" → ordenes_compra.anticipo_*
//   accion = "marcar_factura"  → cxp_pagos + ordenes_compra.monto_pagado
//   accion = "marcar_gasto"    → pagos_otros.*

import { useState } from "react";
import { B } from "../brand";
import { supabase } from "../lib/supabase";

const COP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

export default function MarcarPagadoModal({ pago, currentUser, onClose, onSaved }) {
  const [referencia, setReferencia] = useState("");
  const [cuentaOrigen, setCuentaOrigen] = useState("");
  const [metodo, setMetodo] = useState("transferencia");
  const [comprobante, setComprobante] = useState(null);
  const [comprobantePreview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setErr("El archivo es muy grande (máx 10MB).");
      return;
    }
    setComprobante(f);
    setErr("");
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview(""); // PDF/otro
    }
  };

  // Sube el archivo y retorna URL pública
  const subirComprobante = async (refId) => {
    if (!comprobante) return null;
    const ext = comprobante.name.split(".").pop() || "bin";
    const path = `pagos/${refId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("comprobantes").upload(path, comprobante, {
      cacheControl: "3600", upsert: false,
    });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from("comprobantes").getPublicUrl(path);
    return pub.publicUrl;
  };

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const guardar = async () => {
    if (!referencia.trim()) { setErr("La referencia del pago es requerida."); return; }
    setSaving(true);
    setErr("");
    try {
      const refId = pago.oc?.id || pago.gasto?.id || `PAGO-${Date.now()}`;
      const comprobante_url = comprobante ? await subirComprobante(refId) : null;

      if (pago.accion === "marcar_anticipo") {
        await supabase.from("ordenes_compra").update({
          anticipo_pagado:           true,
          anticipo_pagado_at:        new Date().toISOString(),
          anticipo_pagado_por:       currentUser?.email || null,
          anticipo_referencia_pago:  referencia.trim(),
          anticipo_comprobante_url:  comprobante_url,
          estado:                    "confirmada",
          updated_at:                new Date().toISOString(),
        }).eq("id", pago.oc.id);
      } else if (pago.accion === "marcar_factura") {
        const monto = Number(pago.monto);
        const id = `PAGO_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await supabase.from("cxp_pagos").insert({
          id,
          oc_id:           pago.oc.id,
          oc_codigo:       pago.oc.codigo,
          fecha_pago:      todayStr(),
          monto,
          metodo,
          cuenta_origen:   cuentaOrigen.trim() || null,
          referencia:      referencia.trim(),
          comprobante_url,
          created_by:      currentUser?.email,
        });
        const nuevoTotal = Number(pago.oc.monto_pagado || 0) + monto;
        const completa   = nuevoTotal >= Number(pago.oc.total || 0) - 0.01;
        await supabase.from("ordenes_compra").update({
          monto_pagado:    nuevoTotal,
          pagada_completa: completa,
          pagada_at:       completa ? new Date().toISOString() : null,
          estado:          completa ? "pagada" : pago.oc.estado,
        }).eq("id", pago.oc.id);
      } else if (pago.accion === "marcar_gasto") {
        await supabase.from("pagos_otros").update({
          pagado:          true,
          pagado_at:       new Date().toISOString(),
          pagado_por:      currentUser?.email || null,
          referencia:      referencia.trim(),
          cuenta_origen:   cuentaOrigen.trim() || null,
          metodo_pago:     metodo,
          comprobante_url,
          updated_at:      new Date().toISOString(),
        }).eq("id", pago.gasto.id);
      }
      onSaved?.();
    } catch (e) {
      setErr("Error al guardar: " + (e.message || e));
      setSaving(false);
    }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose?.()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: B.navyMid, borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "92vh", overflow: "auto" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>💸 Marcar como pagado</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              {pago.proveedor} · <strong style={{ color: B.sand }}>{COP(pago.monto)}</strong>
              {pago.ref && <span> · {pago.ref}</span>}
            </div>
          </div>
          <button onClick={() => onClose?.()} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={LS}>Referencia del pago *</label>
            <input value={referencia} onChange={e => setReferencia(e.target.value)}
              placeholder="Ej: TRX-238472, cheque #123, ZELLE-XYZ"
              style={IS} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LS}>Método</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)} style={IS}>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="zelle">Zelle</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label style={LS}>Cuenta origen</label>
              <input value={cuentaOrigen} onChange={e => setCuentaOrigen(e.target.value)}
                placeholder="Ej: Bancolombia 9876"
                style={IS} />
            </div>
          </div>

          <div>
            <label style={LS}>Comprobante (foto, PDF) — opcional</label>
            <input type="file" accept="image/*,application/pdf" onChange={handleFile}
              style={{ ...IS, padding: "8px 12px" }} />
            {comprobantePreview && (
              <div style={{ marginTop: 8, padding: 8, background: B.navy, borderRadius: 8, border: `1px solid ${B.navyLight}` }}>
                <img src={comprobantePreview} alt="preview"
                  style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 4, display: "block", margin: "0 auto" }} />
              </div>
            )}
            {comprobante && !comprobantePreview && (
              <div style={{ marginTop: 6, fontSize: 11, color: B.sky }}>
                📎 {comprobante.name} ({(comprobante.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          {err && (
            <div style={{ padding: 10, background: B.danger + "22", color: B.danger, borderRadius: 8, fontSize: 12 }}>
              ⚠ {err}
            </div>
          )}
        </div>

        <div style={{ padding: 18, borderTop: `1px solid ${B.navyLight}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={() => onClose?.()}
            style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving || !referencia.trim()}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: saving ? B.navyLight : B.success, color: B.navy, fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: !referencia.trim() ? 0.5 : 1 }}>
            {saving ? "Guardando…" : "💸 Confirmar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" };
