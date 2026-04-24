// Lancha.jsx — Reservas de cupos en lancha para hoteles/B2B
// Rutas: IDA / VUELTA / IDA+VUELTA · por salida · con control de capacidad
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { B } from "../brand";

const todayStr = () => {
  const bogota = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  return `${bogota.getFullYear()}-${String(bogota.getMonth()+1).padStart(2,"0")}-${String(bogota.getDate()).padStart(2,"0")}`;
};

const fmtFecha = (f) =>
  f ? new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" }) : "";

const DIR = {
  ida:        { label: "Solo Ida",     icon: "→", color: B.sky      },
  vuelta:     { label: "Solo Vuelta",  icon: "←", color: "#34d399"  },
  ida_vuelta: { label: "Ida y Vuelta", icon: "↔", color: B.sand     },
};

const EMPTY_FORM = {
  aliado_id: "", nombre: "", contacto: "",
  pax_a: 1, pax_n: 0,
  direccion: "ida_vuelta",
  salida_ida_id: "", salida_vuelta_id: "",
  notas: "", estado: "confirmado",
};

// ─── Barra de ocupación ──────────────────────────────────────────────────────
function BaraCapacidad({ ocupado, total, color = B.sky }) {
  const pct = total > 0 ? Math.min(100, Math.round(ocupado / total * 100)) : 0;
  const libre = Math.max(0, total - ocupado);
  const warn  = pct >= 90;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 6, background: B.navyLight, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: warn ? "#f87171" : color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 11, color: warn ? "#f87171" : "rgba(255,255,255,0.5)", whiteSpace: "nowrap", minWidth: 70, textAlign: "right" }}>
        {libre} libre{libre !== 1 ? "s" : ""} / {total}
      </span>
    </div>
  );
}

// ─── Modal / form ────────────────────────────────────────────────────────────
function FormReserva({ form, setForm, salidas, aliados, onSave, onCancel, saving, editId }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const paxTotal = (Number(form.pax_a) || 0) + (Number(form.pax_n) || 0);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{
        background: B.navyMid, borderRadius: 18, padding: 28, width: "100%", maxWidth: 520,
        maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: B.white }}>
            {editId ? "✏️ Editar reserva" : "⛵ Nueva reserva de lancha"}
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Hotel */}
        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Hotel / Aliado *</label>
        <select value={form.aliado_id} onChange={e => set("aliado_id", e.target.value)}
          style={{ width: "100%", marginTop: 4, marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, boxSizing: "border-box" }}>
          <option value="">— Seleccionar hotel —</option>
          {aliados.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>

        {/* Nombre */}
        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Nombre del huésped *</label>
        <input value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Nombre completo"
          style={{ width: "100%", marginTop: 4, marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, boxSizing: "border-box" }} />

        {/* Contacto */}
        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Teléfono / contacto</label>
        <input value={form.contacto} onChange={e => set("contacto", e.target.value)} placeholder="+57 300..."
          style={{ width: "100%", marginTop: 4, marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, boxSizing: "border-box" }} />

        {/* Pax */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          {[["pax_a", "Adultos"], ["pax_n", "Niños"]].map(([k, lbl]) => (
            <div key={k}>
              <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{lbl}</label>
              <input type="number" min={k === "pax_a" ? 0 : 0} value={form[k]} onChange={e => set(k, e.target.value)}
                style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 14, fontWeight: 700, boxSizing: "border-box" }} />
            </div>
          ))}
        </div>

        {/* Dirección */}
        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Dirección *</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 6, marginBottom: 16 }}>
          {Object.entries(DIR).map(([k, d]) => (
            <button key={k} type="button" onClick={() => set("direccion", k)}
              style={{
                padding: "10px 8px", borderRadius: 10, border: `2px solid ${form.direccion === k ? d.color : B.navyLight}`,
                background: form.direccion === k ? d.color + "22" : B.navy,
                color: form.direccion === k ? d.color : "rgba(255,255,255,0.45)",
                fontWeight: 700, fontSize: 12, cursor: "pointer", textAlign: "center",
              }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>{d.icon}</div>
              {d.label}
            </button>
          ))}
        </div>

        {/* Salida IDA */}
        {(form.direccion === "ida" || form.direccion === "ida_vuelta") && (
          <>
            <label style={{ fontSize: 11, color: B.sky, textTransform: "uppercase", letterSpacing: "0.06em" }}>→ Salida IDA *</label>
            <select value={form.salida_ida_id} onChange={e => set("salida_ida_id", e.target.value)}
              style={{ width: "100%", marginTop: 4, marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.sky}44`, color: B.white, fontSize: 13, boxSizing: "border-box" }}>
              <option value="">— Seleccionar salida —</option>
              {salidas.map(s => <option key={s.id} value={s.id}>{s.hora}{s.nombre ? ` · ${s.nombre}` : ""}</option>)}
            </select>
          </>
        )}

        {/* Salida VUELTA */}
        {(form.direccion === "vuelta" || form.direccion === "ida_vuelta") && (
          <>
            <label style={{ fontSize: 11, color: "#34d399", textTransform: "uppercase", letterSpacing: "0.06em" }}>← Salida VUELTA *</label>
            <select value={form.salida_vuelta_id} onChange={e => set("salida_vuelta_id", e.target.value)}
              style={{ width: "100%", marginTop: 4, marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid #34d39944`, color: B.white, fontSize: 13, boxSizing: "border-box" }}>
              <option value="">— Seleccionar salida —</option>
              {salidas.map(s => <option key={s.id} value={s.id}>{s.hora_regreso || s.hora}{s.nombre ? ` · ${s.nombre}` : ""}</option>)}
            </select>
          </>
        )}

        {/* Notas */}
        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Notas</label>
        <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2} placeholder="Habitación, observaciones..."
          style={{ width: "100%", marginTop: 4, marginBottom: 20, padding: "10px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />

        {/* Resumen pax */}
        {paxTotal > 0 && (
          <div style={{ background: B.navy, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "rgba(255,255,255,0.6)", display: "flex", gap: 16 }}>
            <span>👥 {paxTotal} pax total</span>
            <span style={{ color: DIR[form.direccion]?.color }}>{DIR[form.direccion]?.icon} {DIR[form.direccion]?.label}</span>
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={saving}
            style={{ flex: 1, padding: "12px", borderRadius: 10, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 14, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={onSave} disabled={saving || !form.nombre || !form.aliado_id}
            style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: saving ? B.navyLight : B.sky, color: B.navy, fontSize: 14, fontWeight: 800, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Guardando..." : editId ? "💾 Guardar cambios" : "✅ Reservar cupos"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Módulo principal ─────────────────────────────────────────────────────────
export default function Lancha() {
  const [fecha,    setFecha]    = useState(todayStr());
  const [salidas,  setSalidas]  = useState([]);
  const [aliados,  setAliados]  = useState([]);
  const [reservas, setReservas] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [capPas,   setCapPas]   = useState({}); // pax de pasadías por salida_id
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [form,     setForm]     = useState({ ...EMPTY_FORM });
  const [saving,   setSaving]   = useState(false);
  const [cancelId, setCancelId] = useState(null);

  // Cargar estáticos una vez
  useEffect(() => {
    Promise.all([
      supabase.from("salidas").select("*").eq("activo", true).order("orden"),
      supabase.from("aliados_b2b").select("id, nombre").eq("estado", "activo").order("nombre"),
    ]).then(([sal, ali]) => {
      setSalidas(sal.data || []);
      setAliados(ali.data || []);
    });
  }, []);

  // Cargar reservas del día
  const cargar = useCallback(async () => {
    setLoading(true);
    const [resL, resPas] = await Promise.all([
      supabase.from("reservas_lancha").select("*, aliados_b2b(nombre)")
        .eq("fecha", fecha).neq("estado", "cancelado").order("created_at"),
      supabase.from("reservas").select("salida_id, pax")
        .eq("fecha", fecha).neq("estado", "cancelado"),
    ]);
    setReservas(resL.data || []);
    // Mapa capacidad pasadías por salida
    const cp = {};
    for (const r of (resPas.data || [])) {
      if (!r.salida_id) continue;
      cp[r.salida_id] = (cp[r.salida_id] || 0) + (r.pax || 0);
    }
    setCapPas(cp);
    setLoading(false);
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  // Capacidad lancha por salida
  const capLancha = {};
  for (const r of reservas) {
    const p = (Number(r.pax_a) || 0) + (Number(r.pax_n) || 0);
    if (r.salida_ida_id)    capLancha[r.salida_ida_id]    = (capLancha[r.salida_ida_id]    || 0) + p;
    if (r.salida_vuelta_id) capLancha[r.salida_vuelta_id] = (capLancha[r.salida_vuelta_id] || 0) + p;
  }

  const openNew = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (r) => {
    setEditId(r.id);
    setForm({
      aliado_id: r.aliado_id || "", nombre: r.nombre, contacto: r.contacto || "",
      pax_a: r.pax_a, pax_n: r.pax_n,
      direccion: r.direccion,
      salida_ida_id: r.salida_ida_id || "", salida_vuelta_id: r.salida_vuelta_id || "",
      notas: r.notas || "", estado: r.estado,
    });
    setShowForm(true);
  };

  const guardar = async () => {
    if (!form.nombre || !form.aliado_id) return;
    setSaving(true);
    const payload = {
      fecha,
      aliado_id:       form.aliado_id || null,
      nombre:          form.nombre.trim(),
      contacto:        form.contacto || null,
      pax_a:           Number(form.pax_a) || 0,
      pax_n:           Number(form.pax_n) || 0,
      direccion:       form.direccion,
      salida_ida_id:    (form.direccion === "vuelta" ? null : form.salida_ida_id)    || null,
      salida_vuelta_id: (form.direccion === "ida"    ? null : form.salida_vuelta_id) || null,
      notas:           form.notas || null,
      estado:          form.estado,
    };

    if (editId) {
      await supabase.from("reservas_lancha").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editId);
    } else {
      await supabase.from("reservas_lancha").insert({ id: `LAC-${Date.now()}`, ...payload });
    }
    setSaving(false);
    setShowForm(false);
    cargar();
  };

  const cancelarReserva = async (id) => {
    await supabase.from("reservas_lancha").update({ estado: "cancelado" }).eq("id", id);
    setCancelId(null);
    cargar();
  };

  // Totales del día
  const totPax      = reservas.reduce((s, r) => s + (Number(r.pax_a) || 0) + (Number(r.pax_n) || 0), 0);
  const totIda      = reservas.filter(r => r.direccion !== "vuelta").reduce((s, r) => s + (Number(r.pax_a) || 0) + (Number(r.pax_n) || 0), 0);
  const totVuelta   = reservas.filter(r => r.direccion !== "ida").reduce((s, r) => s + (Number(r.pax_a) || 0) + (Number(r.pax_n) || 0), 0);
  const totHoteles  = new Set(reservas.map(r => r.aliado_id)).size;

  const IS = { padding: "8px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13 };

  return (
    <div style={{ padding: "24px 0", maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: B.white, fontFamily: "'Barlow Condensed', sans-serif" }}>⛵ Reservas de Lancha</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Cupos IDA · VUELTA · IDA+VUELTA para hoteles</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={{ ...IS, fontWeight: 600 }} />
          <button onClick={cargar} disabled={loading}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: B.navyMid, color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
            ↻
          </button>
          <button onClick={openNew}
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: B.sky, color: B.navy, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            + Nueva reserva
          </button>
        </div>
      </div>

      {/* Fecha label */}
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 16, paddingInline: 2, textTransform: "capitalize" }}>
        {fmtFecha(fecha)}
      </div>

      {/* Resumen KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Pax IDA",        val: totIda,     color: B.sky,      icon: "→" },
          { label: "Pax VUELTA",     val: totVuelta,  color: "#34d399",  icon: "←" },
          { label: "Total pax",      val: totPax,     color: B.white,    icon: "👥" },
          { label: "Hoteles",        val: totHoteles, color: B.sand,     icon: "🏨" },
        ].map(k => (
          <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 18px", borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Capacidad por salida */}
      <div style={{ background: B.navyMid, borderRadius: 16, padding: "18px 22px", marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          ⚓ Ocupación por salida
        </div>
        {salidas.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No hay salidas configuradas.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {salidas.map(s => {
              const pasPax    = capPas[s.id] || 0;
              const lanPax    = capLancha[s.id] || 0;
              const ocupado   = pasPax + lanPax;
              const total     = s.capacidad_total || 0;
              return (
                <div key={s.id} style={{ background: B.navy, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14, color: B.white }}>{s.hora}</span>
                      {s.hora_regreso && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>→ regreso {s.hora_regreso}</span>}
                      {s.nombre && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>· {s.nombre}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", gap: 14 }}>
                      <span>🏖️ Pasadías: <strong style={{ color: B.sky }}>{pasPax}</strong></span>
                      <span>⛵ Lancha: <strong style={{ color: B.sand }}>{lanPax}</strong></span>
                    </div>
                  </div>
                  <BaraCapacidad ocupado={ocupado} total={total} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reservas del día */}
      <div style={{ background: B.navyMid, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${B.navyLight}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            📋 Reservas del día ({reservas.length})
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Cargando...</div>
        ) : reservas.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
            Sin reservas de lancha para este día.<br />
            <span style={{ fontSize: 11, marginTop: 6, display: "block" }}>Usa "+ Nueva reserva" para agregar.</span>
          </div>
        ) : (
          <div>
            {reservas.map((r, i) => {
              const d      = DIR[r.direccion] || DIR.ida_vuelta;
              const pax    = (Number(r.pax_a) || 0) + (Number(r.pax_n) || 0);
              const salIda = salidas.find(s => s.id === r.salida_ida_id);
              const salVue = salidas.find(s => s.id === r.salida_vuelta_id);
              const hotel  = r.aliados_b2b?.nombre || aliados.find(a => a.id === r.aliado_id)?.nombre || r.aliado_id;
              return (
                <div key={r.id} style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto",
                  gap: 14, padding: "14px 22px", alignItems: "center",
                  borderBottom: i < reservas.length - 1 ? `1px solid ${B.navyLight}` : "none",
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                }}>
                  {/* Dirección badge */}
                  <div style={{ textAlign: "center", minWidth: 54 }}>
                    <div style={{ fontSize: 20, color: d.color }}>{d.icon}</div>
                    <div style={{ fontSize: 9, color: d.color, fontWeight: 700, textTransform: "uppercase" }}>
                      {r.direccion === "ida_vuelta" ? "I+V" : r.direccion === "ida" ? "IDA" : "VTA"}
                    </div>
                  </div>

                  {/* Info */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: B.white }}>{r.nombre}</span>
                      <span style={{ fontSize: 11, background: B.sand + "22", color: B.sand, borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>
                        🏨 {hotel}
                      </span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                        👥 {pax} pax{r.pax_a > 0 && r.pax_n > 0 ? ` (${r.pax_a}A + ${r.pax_n}N)` : ""}
                      </span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.35)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {salIda  && <span style={{ color: B.sky + "cc" }}>→ Ida: {salIda.hora}</span>}
                      {salVue  && <span style={{ color: "#34d39999" }}>← Vuelta: {salVue.hora_regreso || salVue.hora}</span>}
                      {r.contacto && <span>📞 {r.contacto}</span>}
                      {r.notas && <span>💬 {r.notas}</span>}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(r)}
                      style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>
                      ✏️
                    </button>
                    {cancelId === r.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => cancelarReserva(r.id)}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "#f87171", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          Confirmar
                        </button>
                        <button onClick={() => setCancelId(null)}
                          style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer" }}>
                          No
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setCancelId(r.id)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #f8717133", background: "transparent", color: "#f87171", fontSize: 12, cursor: "pointer" }}>
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal form */}
      {showForm && (
        <FormReserva
          form={form} setForm={setForm}
          salidas={salidas} aliados={aliados}
          onSave={guardar} onCancel={() => setShowForm(false)}
          saving={saving} editId={editId}
        />
      )}
    </div>
  );
}
