import { useState, useEffect, useCallback } from "react";
import { B, COP, SALIDAS, FLOTA, PASADIAS, todayStr, fmtFecha, colNowMins } from "../brand";
import { supabase } from "../lib/supabase";
import { useMobile } from "../lib/useMobile";

// ── helpers ──────────────────────────────────────────────────────────────────

const CANALES = ["Web", "WhatsApp", "B2B", "Teléfono", "Walk-in"];

const ESTADO_STYLE = {
  confirmado: { bg: B.success + "22", color: B.success, label: "Confirmado" },
  pendiente:  { bg: B.warning + "22", color: B.warning, label: "Pendiente"  },
  cancelado:  { bg: B.danger  + "22", color: B.danger,  label: "Cancelado"  },
};

// pax already booked per salida from reservas data
function paxPorSalida(reservas) {
  const map = {};
  SALIDAS.forEach(s => (map[s.id] = 0));
  reservas.forEach(r => {
    if (r.estado !== "cancelado" && map[r.salida] !== undefined)
      map[r.salida] += r.pax;
  });
  return map;
}

const EMPTY_FORM = {
  nombre: "", tipo: PASADIAS[0].tipo, pax: 1, salida: SALIDAS[0].id,
  canal: CANALES[0], precio: PASADIAS[0].precio, abono: 0, notas: "",
};

// ── sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ estado }) {
  const s = ESTADO_STYLE[estado] || ESTADO_STYLE.pendiente;
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}44`,
      borderRadius: 20,
      padding: "3px 10px",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: 0.3,
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function DepartureCard({ salida, paxCount }) {
  const pct = paxCount / salida.cap;
  const full = pct >= 1;
  const almostFull = pct >= 0.75;
  const barColor = full ? B.danger : almostFull ? B.warning : B.success;
  const statusLabel = full ? "LLENO" : almostFull ? "CASI LLENO" : "DISPONIBLE";
  const statusColor = full ? B.danger : almostFull ? B.warning : B.success;

  return (
    <div style={{
      background: B.navyMid,
      border: `1px solid ${B.navyLight}`,
      borderRadius: 12,
      padding: "18px 20px",
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: B.sand, letterSpacing: 1 }}>
            {salida.id}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: B.white, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1.1 }}>
            {salida.hora}
          </div>
          <div style={{ fontSize: 12, color: B.sky, marginTop: 2 }}>
            Regreso {salida.regreso}
          </div>
        </div>
        <span style={{
          background: statusColor + "22",
          color: statusColor,
          border: `1px solid ${statusColor}44`,
          borderRadius: 20,
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}>
          {statusLabel}
        </span>
      </div>

      {/* boats */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {salida.botes.map(b => (
          <span key={b} style={{
            background: B.navyLight,
            color: B.sky,
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 12,
            fontWeight: 600,
          }}>
            {b}
          </span>
        ))}
      </div>

      {/* capacity bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: B.sand }}>Pasajeros</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: B.white }}>
            {paxCount} / {salida.cap}
          </span>
        </div>
        <div style={{ background: B.navyLight, borderRadius: 4, height: 6, overflow: "hidden" }}>
          <div style={{
            width: `${Math.min(pct * 100, 100)}%`,
            height: "100%",
            background: barColor,
            borderRadius: 4,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>
    </div>
  );
}

// ── ReservaDetalle ────────────────────────────────────────────────────────────

function ReservaDetalle({ reserva: r0, onClose, onUpdated, isMobile }) {
  const [tab, setTab]       = useState("detalles"); // detalles | pasajeros | historial
  const [editing, setEdit]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState({
    nombre:    r0.nombre    || "",
    contacto:  r0.contacto  || "",
    fecha:     r0.fecha     || "",
    salida_id: r0.salida    || "",
    tipo:      r0.tipo      || "",
    canal:     r0.canal     || "",
    pax_a:     r0.pax_a     ?? r0.pax ?? 1,
    pax_n:     r0.pax_n     ?? 0,
    abono:     r0.abono     || 0,
    total:     r0.total     || 0,
    estado:    r0.estado    || "pendiente",
    notas:     r0.notas     || "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const saldo = form.total - form.abono;
  const salida = SALIDAS.find(s => s.id === form.salida_id);

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true);
    const pax = Number(form.pax_a) + Number(form.pax_n);
    await supabase.from("reservas").update({
      nombre:    form.nombre.trim(),
      contacto:  form.contacto.trim(),
      fecha:     form.fecha,
      salida_id: form.salida_id,
      tipo:      form.tipo,
      canal:     form.canal,
      pax_a:     Number(form.pax_a),
      pax_n:     Number(form.pax_n),
      pax,
      abono:     Number(form.abono),
      total:     Number(form.total),
      saldo:     Number(form.total) - Number(form.abono),
      estado:    form.estado,
      notas:     form.notas,
    }).eq("id", r0.id);
    setSaving(false);
    setEdit(false);
    onUpdated();
  };

  const handleEstado = async (estado) => {
    if (!supabase) return;
    await supabase.from("reservas").update({ estado }).eq("id", r0.id);
    set("estado", estado);
    onUpdated();
  };

  const IS = {
    background: "#0D1B3E",
    border: `1px solid ${B.navyLight}`,
    borderRadius: 8,
    color: B.white,
    padding: "9px 12px",
    fontSize: 14,
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const LS = { fontSize: 11, color: B.sand, fontWeight: 600, marginBottom: 4, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" };

  const ESTADO_BTNS = [
    { key: "confirmado", label: "✓ Confirmado", color: B.success },
    { key: "pendiente",  label: "⏳ Pendiente",  color: B.warning },
    { key: "cancelado",  label: "✕ Cancelado",   color: B.danger  },
  ];

  const fmtDT = (ts) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: B.navyMid,
        border: isMobile ? "none" : `1px solid ${B.navyLight}`,
        borderRadius: isMobile ? "20px 20px 0 0" : 16,
        width: "100%",
        maxWidth: isMobile ? "100%" : 680,
        maxHeight: isMobile ? "93dvh" : "90vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{ padding: "18px 24px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: B.sky, fontFamily: "monospace", marginBottom: 3 }}>{r0.id}</div>
              <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: B.white }}>{r0.nombre}</div>
              <div style={{ fontSize: 13, color: B.sand, marginTop: 2 }}>
                {r0.fecha ? new Date(r0.fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : "—"}
                {salida && <> &nbsp;·&nbsp; ⛵ {salida.hora}</>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!editing && <button onClick={() => setEdit(true)} style={{ background: B.navyLight, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.sky, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>✏️ Editar</button>}
              <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 24, cursor: "pointer", lineHeight: 1, padding: "2px 6px" }}>×</button>
            </div>
          </div>

          {/* Estado buttons */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {ESTADO_BTNS.map(b => (
              <button key={b.key} onClick={() => handleEstado(b.key)} style={{
                background: form.estado === b.key ? b.color + "33" : "transparent",
                border: `1px solid ${form.estado === b.key ? b.color : B.navyLight}`,
                borderRadius: 20,
                color: form.estado === b.key ? b.color : "rgba(255,255,255,0.4)",
                padding: "4px 14px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}>{b.label}</button>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${B.navyLight}` }}>
            {["detalles", "pasajeros", "historial"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: "none", border: "none", borderBottom: tab === t ? `2px solid ${B.sky}` : "2px solid transparent",
                color: tab === t ? B.sky : "rgba(255,255,255,0.4)",
                padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                textTransform: "capitalize", marginBottom: -1,
              }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 24px" }}>

          {/* ── Tab: Detalles ── */}
          {tab === "detalles" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* Datos principales */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LS}>Titular</label>
                  {editing ? <input style={IS} value={form.nombre} onChange={e => set("nombre", e.target.value)} /> :
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{r0.nombre}</div>}
                </div>
                <div>
                  <label style={LS}>Contacto (email/tel)</label>
                  {editing ? <input style={IS} value={form.contacto} onChange={e => set("contacto", e.target.value)} placeholder="email o teléfono" /> :
                    <div style={{ fontSize: 14, color: r0.contacto ? B.white : "rgba(255,255,255,0.3)" }}>{r0.contacto || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Canal</label>
                  {editing ? (
                    <select style={IS} value={form.canal} onChange={e => set("canal", e.target.value)}>
                      {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : <div style={{ fontSize: 14 }}>{r0.canal || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Tipo de pase</label>
                  {editing ? (
                    <select style={IS} value={form.tipo} onChange={e => set("tipo", e.target.value)}>
                      {PASADIAS.map(p => <option key={p.tipo} value={p.tipo}>{p.tipo}</option>)}
                    </select>
                  ) : <div style={{ fontSize: 14 }}>{r0.tipo || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Pax adultos</label>
                  {editing ? <input type="number" min={0} style={IS} value={form.pax_a} onChange={e => set("pax_a", Number(e.target.value))} /> :
                    <div style={{ fontSize: 14 }}>{r0.pax_a ?? r0.pax ?? "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Pax niños (0–12)</label>
                  {editing ? <input type="number" min={0} style={IS} value={form.pax_n} onChange={e => set("pax_n", Number(e.target.value))} /> :
                    <div style={{ fontSize: 14 }}>{r0.pax_n ?? 0}</div>}
                </div>
                <div>
                  <label style={LS}>Fecha</label>
                  {editing ? <input type="date" style={IS} value={form.fecha} onChange={e => set("fecha", e.target.value)} /> :
                    <div style={{ fontSize: 14 }}>{r0.fecha || "—"}</div>}
                </div>
                <div>
                  <label style={LS}>Horario de salida</label>
                  {editing ? (
                    <select style={IS} value={form.salida_id} onChange={e => set("salida_id", e.target.value)}>
                      <option value="">Sin asignar</option>
                      {SALIDAS.map(s => <option key={s.id} value={s.id}>{s.id} — {s.hora}</option>)}
                    </select>
                  ) : <div style={{ fontSize: 14 }}>{r0.salida ? `${r0.salida}${salida ? ` — ${salida.hora}` : ""}` : "—"}</div>}
                </div>
                {r0.agencia && <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LS}>Agencia</label>
                  <div style={{ fontSize: 14, color: B.sky }}>{r0.agencia}</div>
                </div>}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LS}>Notas</label>
                  {editing ? <textarea rows={3} style={{ ...IS, resize: "vertical" }} value={form.notas} onChange={e => set("notas", e.target.value)} placeholder="Observaciones especiales…" /> :
                    <div style={{ fontSize: 13, color: r0.notas ? B.sand : "rgba(255,255,255,0.3)" }}>{r0.notas || "Sin notas"}</div>}
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: `1px solid ${B.navyLight}` }} />

              {/* Pagos */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>💳 Pagos</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Total", value: COP(form.total), color: B.white },
                    { label: "Abonado", value: COP(form.abono), color: B.success },
                    { label: "Saldo", value: COP(Math.max(0, saldo)), color: saldo > 0 ? B.warning : B.success },
                  ].map(p => (
                    <div key={p.label} style={{ background: "#0D1B3E", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{p.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: p.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{p.value}</div>
                    </div>
                  ))}
                </div>
                {editing && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={LS}>Total (COP)</label>
                      <input type="number" min={0} style={IS} value={form.total} onChange={e => set("total", Number(e.target.value))} />
                    </div>
                    <div>
                      <label style={LS}>Abono (COP)</label>
                      <input type="number" min={0} style={IS} value={form.abono} onChange={e => set("abono", Number(e.target.value))} />
                    </div>
                  </div>
                )}
                {r0.forma_pago && (
                  <div style={{ marginTop: 10, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                    Método de pago: <strong style={{ color: B.sky }}>{r0.forma_pago}</strong>
                  </div>
                )}
              </div>

              {/* Save / Cancel */}
              {editing && (
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
                  <button onClick={() => { setEdit(false); setForm({ nombre: r0.nombre||"", contacto: r0.contacto||"", fecha: r0.fecha||"", salida_id: r0.salida||"", tipo: r0.tipo||"", canal: r0.canal||"", pax_a: r0.pax_a??r0.pax??1, pax_n: r0.pax_n??0, abono: r0.abono||0, total: r0.total||0, estado: r0.estado||"pendiente", notas: r0.notas||"" }); }} style={{ background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.sand, padding: "9px 20px", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button onClick={handleSave} disabled={saving} style={{ background: B.sky, border: "none", borderRadius: 8, color: B.navy, padding: "9px 24px", fontSize: 14, cursor: "pointer", fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
                    {saving ? "Guardando…" : "💾 Guardar cambios"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Pasajeros ── */}
          {tab === "pasajeros" && (
            <div>
              {(!r0.pasajeros || r0.pasajeros.length === 0) ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🧍</div>
                  <div style={{ fontSize: 14 }}>No hay datos de pasajeros registrados</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {r0.pasajeros.map((p, i) => (
                    <div key={i} style={{ background: "#0D1B3E", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.nombre || `Pasajero ${i + 1}`}</div>
                      <div style={{ fontSize: 13, color: B.sand, display: "flex", gap: 16, flexWrap: "wrap" }}>
                        {p.identificacion && <span>🪪 {p.identificacion}</span>}
                        {p.nacionalidad && <span>🌍 {p.nacionalidad}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Historial ── */}
          {tab === "historial" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { icon: "🗓", label: "Reserva creada",    value: fmtDT(r0.created_at), color: B.sky    },
                { icon: "✏️", label: "Última modificación", value: fmtDT(r0.updated_at), color: B.sand   },
                r0.forma_pago && { icon: "💳", label: "Método de pago", value: r0.forma_pago, color: B.white },
                r0.canal && { icon: "📡", label: "Canal de venta",    value: r0.canal, color: B.white },
                r0.agencia && { icon: "🏢", label: "Agencia",           value: r0.agencia, color: B.sky },
                r0.ci && { icon: "✅", label: "Check-in realizado",  value: fmtDT(r0.ci), color: B.success },
                r0.co && { icon: "🏁", label: "Check-out",            value: fmtDT(r0.co), color: B.sand },
                r0.ep && { icon: "🌅", label: "Llegada temprana",     value: "Activado",   color: B.warning },
                r0.extension && { icon: "🌙", label: "Extensión",         value: `${r0.extension} día(s) · Regreso ${r0.ext_regreso || "—"}`, color: B.sand },
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{ background: "#0D1B3E", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: item.color }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── modal ─────────────────────────────────────────────────────────────────────

function ReservaModal({ onClose, onSave, isMobile }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === "tipo") {
        const p = PASADIAS.find(p => p.tipo === v);
        if (p) next.precio = p.precio;
      }
      return next;
    });
    setErrors(e => ({ ...e, [k]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = "Requerido";
    if (form.pax < 1)        e.pax    = "Min 1";
    if (form.precio < 0)     e.precio = "Inválido";
    if (form.abono < 0)      e.abono  = "Inválido";
    return e;
  };

  const handleSave = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
    onClose();
  };

  const inputStyle = (err) => ({
    background: B.navyLight,
    border: `1px solid ${err ? B.danger : B.navyLight + "80"}`,
    borderRadius: 8,
    color: B.white,
    padding: "9px 12px",
    fontSize: 14,
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  });

  const labelStyle = { fontSize: 12, color: B.sand, fontWeight: 600, marginBottom: 4, display: "block" };
  const fieldStyle = { display: "flex", flexDirection: "column", gap: 4 };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "#00000088",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: B.navyMid,
        border: `1px solid ${B.navyLight}`,
        borderRadius: isMobile ? 0 : 16,
        width: "100%",
        maxWidth: isMobile ? "100%" : 560,
        maxHeight: isMobile ? "100%" : "90vh",
        height: isMobile ? "100%" : "auto",
        overflowY: "auto",
        padding: isMobile ? "20px 16px" : 28,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        {/* title */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 700, color: B.sand, margin: 0 }}>
            Nueva Reserva
          </h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: B.sand, fontSize: 22,
            cursor: "pointer", lineHeight: 1, padding: "2px 6px", borderRadius: 6,
          }}>×</button>
        </div>

        {/* form grid */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
          {/* nombre – full width */}
          <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Nombre del titular</label>
            <input
              style={inputStyle(errors.nombre)}
              value={form.nombre}
              onChange={e => set("nombre", e.target.value)}
              placeholder="Ej: Valentina Ospina"
            />
            {errors.nombre && <span style={{ fontSize: 11, color: B.danger }}>{errors.nombre}</span>}
          </div>

          {/* tipo */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Tipo de pase</label>
            <select style={inputStyle()} value={form.tipo} onChange={e => set("tipo", e.target.value)}>
              {PASADIAS.map(p => (
                <option key={p.tipo} value={p.tipo}>{p.tipo}</option>
              ))}
            </select>
          </div>

          {/* pax */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Pax</label>
            <input
              type="number" min={1} style={inputStyle(errors.pax)}
              value={form.pax}
              onChange={e => set("pax", Number(e.target.value))}
            />
            {errors.pax && <span style={{ fontSize: 11, color: B.danger }}>{errors.pax}</span>}
          </div>

          {/* salida */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Salida</label>
            <select style={inputStyle()} value={form.salida} onChange={e => set("salida", e.target.value)}>
              {SALIDAS.map(s => (
                <option key={s.id} value={s.id}>{s.id} — {s.hora} ({s.botes.join(", ")})</option>
              ))}
            </select>
          </div>

          {/* canal */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Canal</label>
            <select style={inputStyle()} value={form.canal} onChange={e => set("canal", e.target.value)}>
              {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* precio */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Precio total (COP)</label>
            <input
              type="number" min={0} style={inputStyle(errors.precio)}
              value={form.precio}
              onChange={e => set("precio", Number(e.target.value))}
            />
            {errors.precio && <span style={{ fontSize: 11, color: B.danger }}>{errors.precio}</span>}
          </div>

          {/* abono */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Abono (COP)</label>
            <input
              type="number" min={0} style={inputStyle(errors.abono)}
              value={form.abono}
              onChange={e => set("abono", Number(e.target.value))}
            />
            {errors.abono && <span style={{ fontSize: 11, color: B.danger }}>{errors.abono}</span>}
          </div>

          {/* notas – full width */}
          <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Notas</label>
            <textarea
              rows={3}
              style={{ ...inputStyle(), resize: "vertical", fontFamily: "inherit" }}
              value={form.notas}
              onChange={e => set("notas", e.target.value)}
              placeholder="Observaciones, peticiones especiales…"
            />
          </div>
        </div>

        {/* precio preview */}
        <div style={{
          background: B.navyLight,
          borderRadius: 8,
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 13, color: B.sand }}>Saldo pendiente</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: form.precio - form.abono > 0 ? B.warning : B.success }}>
            {COP(Math.max(0, form.precio - form.abono))}
          </span>
        </div>

        {/* actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            background: "none",
            border: `1px solid ${B.navyLight}`,
            borderRadius: 8,
            color: B.sand,
            padding: "9px 20px",
            fontSize: 14,
            cursor: "pointer",
            fontWeight: 600,
          }}>
            Cancelar
          </button>
          <button onClick={handleSave} style={{
            background: B.sky,
            border: "none",
            borderRadius: 8,
            color: B.navy,
            padding: "9px 24px",
            fontSize: 14,
            cursor: "pointer",
            fontWeight: 700,
          }}>
            Guardar reserva
          </button>
        </div>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function Reservas() {
  const isMobile = useMobile();
  const [reservas, setReservas]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [filterEstado, setFilter]   = useState("todos");
  const [showModal, setShowModal]   = useState(false);
  const [detalle, setDetalle]       = useState(null);

  const today = todayStr();

  const fetchReservas = useCallback(async () => {
    if (!supabase) {
      setReservas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", todayStr())
      .order("fecha", { ascending: false });
    if (!error && data) {
      setReservas(data.map(r => ({
        id:        r.id,
        fecha:     r.fecha,
        salida:    r.salida_id,
        tipo:      r.tipo,
        canal:     r.canal,
        nombre:    r.nombre,
        contacto:  r.contacto,
        pax:       r.pax,
        pax_a:     r.pax_a,
        pax_n:     r.pax_n,
        agencia:   r.agencia,
        precio_u:  r.precio_u,
        total:     r.total,
        abono:     r.abono,
        saldo:     r.saldo,
        estado:    r.estado,
        ep:        r.ep,
        ci:        r.ci,
        co:        r.co,
        extension: r.extension,
        ext_regreso: r.ext_regreso,
        notas:      r.notas,
        forma_pago: r.forma_pago,
        pasajeros:  r.pasajeros,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchReservas(); }, [fetchReservas]);

  const paxMap = paxPorSalida(reservas);

  const filtered = reservas.filter(r => {
    const matchSearch = r.nombre.toLowerCase().includes(search.toLowerCase()) ||
                        r.id.toLowerCase().includes(search.toLowerCase()) ||
                        r.tipo.toLowerCase().includes(search.toLowerCase());
    const matchEstado = filterEstado === "todos" || r.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const totalPax   = reservas.filter(r => r.estado !== "cancelado").reduce((s, r) => s + r.pax, 0);
  const totalAbono = reservas.filter(r => r.estado !== "cancelado").reduce((s, r) => s + r.abono, 0);
  const totalVenta = reservas.filter(r => r.estado !== "cancelado").reduce((s, r) => s + r.total, 0);

  const addReserva = async (form) => {
    if (!supabase) return;
    const row = {
      id:        `R-${Date.now()}`,
      fecha:     todayStr(),
      salida_id: form.salida,
      tipo:      form.tipo,
      canal:     form.canal,
      nombre:    form.nombre,
      contacto:  form.contacto || '',
      pax:       Number(form.pax),
      precio_u:  Number(form.precio),
      total:     Number(form.pax) * Number(form.precio),
      abono:     Number(form.abono) || 0,
      saldo:     (Number(form.pax) * Number(form.precio)) - (Number(form.abono) || 0),
      estado:    'pendiente',
      notas:     form.notas || '',
    };
    await supabase.from("reservas").insert(row);
    fetchReservas();
  };

  const toggleEstado = async (id) => {
    if (!supabase) return;
    const r = reservas.find(r => r.id === id);
    if (!r) return;
    const cycle = { pendiente: "confirmado", confirmado: "cancelado", cancelado: "pendiente" };
    const nextEstado = cycle[r.estado] || "pendiente";
    await supabase.from("reservas").update({ estado: nextEstado }).eq("id", id);
    fetchReservas();
  };

  const deleteReserva = async (id) => {
    if (!supabase) return;
    await supabase.from("reservas").delete().eq("id", id);
    fetchReservas();
  };

  // ── styles ──
  const cardStyle = {
    background: B.navyMid,
    border: `1px solid ${B.navyLight}`,
    borderRadius: 12,
    padding: "20px 24px",
  };

  const pillStyle = (active) => ({
    background: active ? B.sky : B.navyLight,
    color: active ? B.navy : B.sand,
    border: "none",
    borderRadius: 20,
    padding: "5px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    transition: "background 0.2s",
  });

  const thStyle = {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    color: B.sand,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    borderBottom: `1px solid ${B.navyLight}`,
    whiteSpace: "nowrap",
  };

  const tdStyle = {
    padding: "12px 14px",
    fontSize: 14,
    color: B.white,
    borderBottom: `1px solid ${B.navyLight}44`,
    verticalAlign: "middle",
  };

  return (
    <div style={{
      background: B.navy,
      minHeight: "100vh",
      padding: isMobile ? "0 0 60px" : "28px 28px 60px",
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      color: B.white,
      boxSizing: "border-box",
    }}>
      {/* ── page header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 16 : 28 }}>
        <h1 style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: isMobile ? 24 : 34,
          fontWeight: 800,
          color: B.sand,
          margin: 0,
          letterSpacing: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          Reservas
          {supabase && !loading && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#4CAF7D22", color: "#4CAF7D" }}>LIVE</span>
          )}
        </h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: B.sky, border: "none", borderRadius: 8, color: B.navy,
            padding: isMobile ? "10px 14px" : "10px 22px",
            fontSize: isMobile ? 13 : 15, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> {isMobile ? "Nueva" : "Nueva Reserva"}
        </button>
      </div>

      {/* ── summary kpis ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: isMobile ? 8 : 14, marginBottom: isMobile ? 16 : 24 }}>
        {[
          { label: "Total Pax hoy",   value: totalPax,           unit: "personas",  color: B.sky  },
          { label: "Total abonado",   value: COP(totalAbono),    unit: "",          color: B.success },
          { label: "Venta total",     value: COP(totalVenta),    unit: "",          color: B.sand },
        ].map(k => (
          <div key={k.label} style={{ ...cardStyle, padding: "16px 20px" }}>
            <div style={{ fontSize: 12, color: B.sand, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>
              {k.value}
            </div>
            {k.unit && <div style={{ fontSize: 12, color: B.sky, marginTop: 2 }}>{k.unit}</div>}
          </div>
        ))}
      </div>

      {/* ── departure board ── */}
      {!isMobile && <div style={{ marginBottom: 28 }}>
        <h2 style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 20,
          fontWeight: 700,
          color: B.sand,
          margin: "0 0 14px",
          letterSpacing: 0.5,
        }}>
          Tablero de Salidas
        </h2>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {SALIDAS.map(s => (
            <DepartureCard key={s.id} salida={s} paxCount={paxMap[s.id] || 0} />
          ))}
        </div>
      </div>

      }

      {/* ── reservations table ── */}
      <div style={isMobile ? {} : cardStyle}>
        {/* table header */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: isMobile ? 18 : 20, fontWeight: 700, color: B.sand, margin: 0 }}>
              Lista de Reservas <span style={{ fontSize: 13, fontWeight: 500, color: B.sky }}>({filtered.length})</span>
            </h2>
          </div>
          {/* search */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: B.sand, fontSize: 14, pointerEvents: "none" }}>⌕</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar reserva…"
              style={{ background: B.navyLight, border: `1px solid ${B.navyLight}`, borderRadius: 8, color: B.white, padding: "10px 12px 10px 30px", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          {/* filter pills */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {["todos", "confirmado", "pendiente", "cancelado"].map(e => (
              <button key={e} style={{ ...pillStyle(filterEstado === e), flexShrink: 0, fontSize: 12 }} onClick={() => setFilter(e)}>
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile card list */}
        {isMobile ? (
          loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: B.sand }}>Cargando reservas…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>🏝️</div>
              <div style={{ fontSize: 14, color: B.sand }}>No hay reservas</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(r => {
                const salida = SALIDAS.find(s => s.id === r.salida);
                const saldo = r.total - r.abono;
                return (
                  <div key={r.id} onClick={() => setDetalle(r)} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 16px", border: `1px solid ${B.navyLight}`, cursor: "pointer" }}>
                    {/* Row 1: nombre + badge + actions */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</div>
                        <div style={{ fontSize: 11, color: B.sky, marginTop: 1 }}>{r.id}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <StatusBadge estado={r.estado} />
                        <button onClick={e => { e.stopPropagation(); toggleEstado(r.id); }} title="Cambiar estado"
                          style={{ background: B.navyLight, border: "none", borderRadius: 8, color: B.sky, padding: "7px 10px", fontSize: 16, cursor: "pointer" }}>↻</button>
                        <button onClick={e => { e.stopPropagation(); deleteReserva(r.id); }} title="Eliminar"
                          style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 8, color: B.danger, padding: "7px 10px", fontSize: 14, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                    {/* Row 2: details */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: B.sand }}>{r.pax} pax</span>
                      <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: "rgba(255,255,255,0.6)" }}>{r.tipo}</span>
                      <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: B.sky }}>{r.salida}{salida ? ` · ${salida.hora}` : ""}</span>
                      <span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", color: "rgba(255,255,255,0.5)" }}>{r.canal}</span>
                    </div>
                    {/* Row 3: money */}
                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13 }}>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Total: </span><span style={{ fontWeight: 700 }}>{COP(r.total)}</span></div>
                      <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Abono: </span><span style={{ fontWeight: 700, color: B.success }}>{COP(r.abono)}</span></div>
                      {saldo > 0 && <div><span style={{ color: B.warning, fontWeight: 700 }}>Saldo: {COP(saldo)}</span></div>}
                    </div>
                    {r.notas && <div style={{ marginTop: 6, fontSize: 11, color: B.sand, opacity: 0.7 }}>{r.notas}</div>}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Desktop table */
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                <thead>
                  <tr>
                    {["#", "Nombre", "Tipo", "Pax", "Salida", "Canal", "Total", "Abono", "Estado", "Acciones"].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10} style={{ ...tdStyle, textAlign: "center", color: B.sand, padding: "32px 0" }}>Cargando reservas…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ ...tdStyle, textAlign: "center", padding: "48px 0" }}>
                        <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>🏝️</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: B.sand, marginBottom: 4 }}>No hay reservas para hoy</div>
                        <div style={{ fontSize: 13, color: B.sky }}>Las reservas que ingreses aparecerán aquí.</div>
                      </td>
                    </tr>
                  ) : filtered.map(r => {
                    const salida = SALIDAS.find(s => s.id === r.salida);
                    const saldo = r.total - r.abono;
                    return (
                      <tr key={r.id} onClick={() => setDetalle(r)} style={{ transition: "background 0.15s", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = B.navyLight + "55"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ ...tdStyle, color: B.sky, fontWeight: 700, fontSize: 13 }}>{r.id}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          <div>{r.nombre}</div>
                          {r.notas && <div style={{ fontSize: 11, color: B.sand, marginTop: 2, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notas}</div>}
                        </td>
                        <td style={{ ...tdStyle, color: B.sand, fontSize: 13 }}>{r.tipo}</td>
                        <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: B.sky }}>{r.pax}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700 }}>{r.salida}</div>
                          {salida && <div style={{ fontSize: 11, color: B.sky }}>{salida.hora}</div>}
                        </td>
                        <td style={tdStyle}><span style={{ background: B.navyLight, borderRadius: 6, padding: "2px 8px", fontSize: 12, color: B.sky, fontWeight: 600 }}>{r.canal}</span></td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: B.white }}>{COP(r.total)}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 700, color: B.success }}>{COP(r.abono)}</div>
                          {saldo > 0 && <div style={{ fontSize: 11, color: B.warning }}>Saldo: {COP(saldo)}</div>}
                        </td>
                        <td style={tdStyle}><StatusBadge estado={r.estado} /></td>
                        <td style={tdStyle} onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => toggleEstado(r.id)} title="Cambiar estado" style={{ background: B.navyLight, border: "none", borderRadius: 6, color: B.sky, padding: "5px 10px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>↻</button>
                            <button onClick={() => deleteReserva(r.id)} title="Eliminar" style={{ background: B.danger + "22", border: `1px solid ${B.danger}44`, borderRadius: 6, color: B.danger, padding: "5px 10px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div style={{ display: "flex", gap: 24, justifyContent: "flex-end", paddingTop: 14, borderTop: `1px solid ${B.navyLight}`, marginTop: 4, flexWrap: "wrap" }}>
                {[
                  { label: "Subtotal abonado", value: COP(filtered.reduce((s, r) => s + r.abono, 0)), color: B.success },
                  { label: "Subtotal venta",   value: COP(filtered.reduce((s, r) => s + r.total, 0)), color: B.sand    },
                ].map(f => (
                  <div key={f.label} style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: f.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{f.value}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── modals ── */}
      {showModal && <ReservaModal onClose={() => setShowModal(false)} onSave={addReserva} isMobile={isMobile} />}
      {detalle && <ReservaDetalle reserva={detalle} isMobile={isMobile} onClose={() => setDetalle(null)} onUpdated={() => { fetchReservas(); setDetalle(null); }} />}
    </div>
  );
}
