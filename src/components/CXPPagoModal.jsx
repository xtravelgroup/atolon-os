// CXPPagoModal — Registrar pagos contra una OC con factura aplicada.
// Soporta pagos parciales y múltiples métodos. Marca la OC como pagada
// cuando saldo llega a 0.
import React, { useState, useEffect } from "react";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";
import { useBreakpoint } from "../lib/responsive.js";

const METODOS = [
  { v: "transferencia", l: "Transferencia" },
  { v: "efectivo",      l: "Efectivo" },
  { v: "cheque",        l: "Cheque" },
  { v: "tarjeta",       l: "Tarjeta" },
  { v: "otro",          l: "Otro" },
];

export default function CXPPagoModal({ oc, onClose, currentUser, reload }) {
  const { isMobile } = useBreakpoint();
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // form state
  const [form, setForm] = useState({
    fecha_pago: todayStr(),
    monto: "",
    metodo: "transferencia",
    cuenta_origen: "",
    referencia: "",
    notas: "",
  });

  const cargarPagos = async () => {
    setLoading(true);
    const { data } = await supabase.from("cxp_pagos")
      .select("*").eq("oc_id", oc.id)
      .order("fecha_pago", { ascending: false });
    setPagos(data || []);
    setLoading(false);
  };

  useEffect(() => { cargarPagos(); }, [oc.id]);

  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);
  const saldo = Number(oc.total || 0) - totalPagado;

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    setError("");
    if (saving) return; // guard contra doble-click
    const monto = Number(form.monto);
    if (!monto || monto <= 0) return setError("El monto debe ser mayor a 0.");
    // Tolerancia de redondeo MUY estricta: 0.5 COP (medio centavo).
    // Antes era 0.01 + sin chequear hacia arriba — un monto de saldo+1 COP pasaba
    // como "centavito de redondeo" y generaba pago en exceso silencioso.
    if (monto > saldo + 0.5) {
      return setError(`El monto excede el saldo (${COP(saldo)}). Si querés registrar un pago superior, corregí el total de la OC primero.`);
    }

    setSaving(true);
    try {
      const id = `PAGO_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const { error } = await supabase.from("cxp_pagos").insert({
        id,
        oc_id: oc.id,
        oc_codigo: oc.codigo,
        fecha_pago: form.fecha_pago,
        monto,
        metodo: form.metodo,
        cuenta_origen: form.cuenta_origen || null,
        referencia: form.referencia || null,
        notas: form.notas || null,
        created_by: currentUser?.email || null,
      });
      if (error) throw error;

      // Actualizar OC: monto_pagado + estado pagada_completa si saldo = 0
      const nuevoTotalPagado = totalPagado + monto;
      const completa = nuevoTotalPagado >= Number(oc.total || 0) - 0.01;
      await supabase.from("ordenes_compra").update({
        monto_pagado: nuevoTotalPagado,
        pagada_completa: completa,
        pagada_at: completa ? new Date().toISOString() : null,
        estado: completa ? "pagada" : oc.estado,
      }).eq("id", oc.id);

      await cargarPagos();
      setShowForm(false);
      setForm({ fecha_pago: todayStr(), monto: "", metodo: "transferencia", cuenta_origen: "", referencia: "", notas: "" });
      reload?.();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (pago) => {
    if (!confirm(`¿Eliminar el pago de ${COP(pago.monto)}?`)) return;
    await supabase.from("cxp_pagos").delete().eq("id", pago.id);
    // Recalcular total y revertir estado si necesario
    const { data: restantes } = await supabase.from("cxp_pagos").select("monto").eq("oc_id", oc.id);
    const nuevoTotal = (restantes || []).reduce((s, p) => s + Number(p.monto || 0), 0);
    const completa = nuevoTotal >= Number(oc.total || 0) - 0.01;
    // pagada_at: si pasa de completa→incompleta, preservar el timestamp original
    // (queda como histórico cuando la OC volvía a estar pagada en algún momento).
    // Si sigue completa, conservar el pagada_at existente (no se sobreescribe).
    // Si nunca estuvo completa, queda null.
    const patch = {
      monto_pagado: nuevoTotal,
      pagada_completa: completa,
      estado: completa ? "pagada" : (oc.estado === "pagada" ? "recibida" : oc.estado),
    };
    // No tocamos pagada_at si seguimos pagada (preservar el timestamp original).
    // Si se revierte a no-pagada, dejamos pagada_at NULL para que un nuevo
    // pago genere timestamp fresco (semánticamente: "esta fecha fue cuándo
    // se completó EL CICLO ACTUAL").
    if (!completa && oc.pagada_completa) {
      patch.pagada_at = null;
    }
    await supabase.from("ordenes_compra").update(patch).eq("id", oc.id);
    await cargarPagos();
    reload?.();
  };

  const venceEn = oc.fecha_vencimiento_pago
    ? Math.floor((new Date(oc.fecha_vencimiento_pago) - new Date()) / 86400000)
    : null;

  return (
    <div style={overlay}>
      <div style={{
        background: B.navy, borderRadius: 12, width: isMobile ? "100%" : 700,
        maxWidth: "100%", maxHeight: "92vh", overflow: "auto",
        border: `1px solid ${B.navyLight}`, color: B.white,
      }}>
        <div style={{ padding: 20, borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: B.sand }}>💳 Pagos · {oc.codigo}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
              {oc.proveedor_nombre || "—"} · {oc.factura_data?.factura_numero || "Sin factura"}
            </div>
          </div>
          <button onClick={onClose} style={btnClose}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Resumen financiero */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            <KpiBox label="Total OC"     valor={COP(oc.total || 0)}      color={B.sand} />
            <KpiBox label="Pagado"       valor={COP(totalPagado)}        color={B.success} />
            <KpiBox label="Saldo"        valor={COP(saldo)}              color={saldo > 0 ? B.warning : B.success} />
          </div>

          {oc.fecha_vencimiento_pago && (
            <div style={{
              padding: 10, marginBottom: 14, borderRadius: 6,
              background: venceEn < 0 ? B.danger + "22" : venceEn < 7 ? B.warning + "22" : B.navyMid,
              border: `1px solid ${venceEn < 0 ? B.danger : venceEn < 7 ? B.warning : B.navyLight}`,
              fontSize: 12, color: venceEn < 0 ? B.danger : venceEn < 7 ? B.warning : "rgba(255,255,255,0.7)",
            }}>
              {venceEn < 0
                ? `⚠ Vencida hace ${Math.abs(venceEn)} día${Math.abs(venceEn) !== 1 ? "s" : ""} (${fmtFecha(oc.fecha_vencimiento_pago)})`
                : venceEn === 0
                ? `🔔 Vence hoy (${fmtFecha(oc.fecha_vencimiento_pago)})`
                : `Vence en ${venceEn} día${venceEn !== 1 ? "s" : ""} (${fmtFecha(oc.fecha_vencimiento_pago)})`
              }
            </div>
          )}

          {/* Lista de pagos */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700 }}>
                Pagos registrados ({pagos.length})
              </div>
              {saldo > 0 && !showForm && (
                <button onClick={() => { setShowForm(true); setForm(p => ({ ...p, monto: String(saldo) })); }} style={btnPrimary}>+ Pago</button>
              )}
            </div>

            {loading ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Cargando…</div>
              : pagos.length === 0 ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontStyle: "italic" }}>Sin pagos registrados.</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {pagos.map(p => (
                    <div key={p.id} style={{ background: B.navyMid, padding: "10px 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtFecha(p.fecha_pago)} · {METODOS.find(m => m.v === p.metodo)?.l || p.metodo}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                          {p.cuenta_origen && `${p.cuenta_origen} · `}
                          {p.referencia && `Ref: ${p.referencia}`}
                          {!p.cuenta_origen && !p.referencia && (p.notas || "—")}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: B.success, fontFamily: "'Barlow Condensed', sans-serif" }}>{COP(p.monto)}</div>
                        <button onClick={() => eliminar(p)} style={{ ...btnAccion(B.danger), fontSize: 10, padding: "2px 8px", marginTop: 2 }}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>

          {/* Form de nuevo pago */}
          {showForm && (
            <div style={{ background: B.navyMid, borderRadius: 10, padding: 14, border: `1px solid ${B.sand}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, marginBottom: 10 }}>Nuevo pago</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <Field label="Fecha"><input type="date" value={form.fecha_pago} onChange={e => upd("fecha_pago", e.target.value)} style={input} /></Field>
                <Field label="Monto *"><input type="number" value={form.monto} onChange={e => upd("monto", e.target.value)} style={input} /></Field>
                <Field label="Método"><select value={form.metodo} onChange={e => upd("metodo", e.target.value)} style={input}>{METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}</select></Field>
                <Field label="Cuenta origen"><input value={form.cuenta_origen} onChange={e => upd("cuenta_origen", e.target.value)} placeholder="Bancolombia 12345" style={input} /></Field>
                <Field label="Referencia"><input value={form.referencia} onChange={e => upd("referencia", e.target.value)} placeholder="N° transferencia / cheque" style={input} /></Field>
                <Field label="Notas"><input value={form.notas} onChange={e => upd("notas", e.target.value)} style={input} /></Field>
              </div>
              {error && <div style={errorBox}>{error}</div>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={() => setShowForm(false)} style={btnSecondary}>Cancelar</button>
                <button onClick={guardar} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Guardando…" : "💾 Registrar pago"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiBox({ label, valor, color }) {
  return (
    <div style={{ background: B.navyMid, padding: 10, borderRadius: 8, border: `1px solid ${B.navyLight}`, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Barlow Condensed', sans-serif" }}>{valor}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

const overlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9000, padding: 16,
};
const input = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: `1px solid ${B.navyLight}`, background: B.navy, color: B.white,
  fontSize: 12, boxSizing: "border-box",
};
const btnPrimary = {
  padding: "7px 14px", border: "none", borderRadius: 8,
  background: B.sand, color: B.navy, fontSize: 12, fontWeight: 700, cursor: "pointer",
};
const btnSecondary = {
  padding: "7px 14px", border: `1px solid ${B.navyLight}`, borderRadius: 8,
  background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const btnClose = {
  width: 32, height: 32, borderRadius: 16, border: `1px solid ${B.navyLight}`,
  background: "transparent", color: B.white, fontSize: 22, cursor: "pointer",
};
const errorBox = {
  padding: 10, background: B.danger + "22", border: `1px solid ${B.danger}`,
  borderRadius: 6, fontSize: 12, color: B.danger, marginTop: 10,
};
function btnAccion(color) {
  return {
    padding: "4px 8px", fontSize: 10, fontWeight: 700, borderRadius: 5,
    border: `1px solid ${color}`, background: color + "22", color, cursor: "pointer",
  };
}
