import { useState, useEffect, useCallback } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";
import { getPuntosConfig } from "../lib/puntos";

const IS   = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS   = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const ISsm = { ...IS, padding: "8px 10px", fontSize: 12 };

const DIAS_SEMANA = [
  { val: 0, label: "Domingo" }, { val: 1, label: "Lunes" },  { val: 2, label: "Martes" },
  { val: 3, label: "Miércoles" }, { val: 4, label: "Jueves" }, { val: 5, label: "Viernes" },
  { val: 6, label: "Sábado" },
];
const PERIODOS = [
  { val: "diario",   label: "Por día",   icon: "☀️" },
  { val: "semanal",  label: "Por semana", icon: "📅" },
  { val: "mensual",  label: "Por mes",   icon: "🗓" },
];
const TIPOS = [
  { val: "acumulacion",  label: "Acumulación por lotes", icon: "🔄", desc: "Cada N pax → 1 premio repetido" },
  { val: "meta_pax",     label: "Meta de pasajeros",     icon: "👥", desc: "Al llegar a X pax en el período" },
  { val: "meta_revenue", label: "Meta de ventas",        icon: "💰", desc: "Al llegar a X pesos vendidos" },
  { val: "meta_reservas",label: "Meta de reservas",      icon: "📋", desc: "Al llegar a X reservas" },
  { val: "especial",     label: "Programa especial",     icon: "⭐", desc: "Sin meta cuantificable" },
];

// ── Helpers de período ───────────────────────────────────────────────────────
const fechaHoy = () => new Date().toISOString().slice(0, 10);

const rangoActual = (periodo) => {
  const hoy = new Date();
  const pad  = (n) => String(n).padStart(2, "0");
  if (periodo === "diario") {
    const d = fechaHoy();
    return { desde: d, hasta: d };
  }
  if (periodo === "semanal") {
    const dow  = hoy.getDay();          // 0=dom
    const lun  = new Date(hoy);
    lun.setDate(hoy.getDate() - ((dow + 6) % 7)); // lunes
    const dom  = new Date(lun);
    dom.setDate(lun.getDate() + 6);
    const fmt  = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    return { desde: fmt(lun), hasta: fmt(dom) };
  }
  // mensual
  return { desde: `${hoy.getFullYear()}-${pad(hoy.getMonth()+1)}-01`, hasta: fechaHoy() };
};

// Calcula progreso de acumulación para un incentivo dado un set de reservas
const calcAcum = (reservas, inc) => {
  const { desde, hasta } = rangoActual(inc.acum_periodo || "mensual");
  let filtered = (reservas || []).filter(r => r.fecha >= desde && r.fecha <= hasta);
  if (inc.acum_dia_semana !== null && inc.acum_dia_semana !== undefined) {
    filtered = filtered.filter(r => new Date(r.fecha + "T12:00:00").getDay() === inc.acum_dia_semana);
  }
  const totalPax     = filtered.reduce((s, r) => s + (r.pax || 0), 0);
  const cada         = inc.acum_cada_pax || 1;
  const bloques      = Math.floor(totalPax / cada);
  const resto        = totalPax % cada;
  const paxFalta     = cada - resto;
  const pct          = Math.round((resto / cada) * 100);
  return { totalPax, bloques, resto, paxFalta, pct, desde, hasta };
};

const fmtMeta = (tipo, val) => tipo === "meta_revenue" ? COP(val) : Number(val).toLocaleString();
const diasRestantes = (fin) => fin ? Math.max(0, Math.ceil((new Date(fin) - new Date(fechaHoy())) / 86400000)) : null;

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "18px 22px", flex: "1 1 180px", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MODAL CREAR / EDITAR INCENTIVO
// ════════════════════════════════════════════════════════
function IncentivModal({ aliados, incentivo, onClose, onSaved }) {
  const isEdit = !!incentivo;
  const [f, setF] = useState(incentivo ? {
    nombre: incentivo.nombre || "",
    tipo: incentivo.tipo || "acumulacion",
    aliado_id: incentivo.aliado_id || "__todas__",
    // meta
    meta_valor: incentivo.meta_valor || "",
    // acumulacion
    acum_cada_pax: incentivo.acum_cada_pax || "",
    acum_periodo: incentivo.acum_periodo || "semanal",
    acum_dia_semana: incentivo.acum_dia_semana ?? "__todos__",
    acum_beneficio_cant: incentivo.acum_beneficio_cant || 1,
    acum_beneficio_desc: incentivo.acum_beneficio_desc || "",
    // común
    beneficio: incentivo.beneficio || "",
    descripcion: incentivo.descripcion || "",
    fecha_inicio: incentivo.fecha_inicio || "",
    fecha_fin: incentivo.fecha_fin || "",
  } : {
    nombre: "", tipo: "acumulacion", aliado_id: "__todas__",
    meta_valor: "",
    acum_cada_pax: "", acum_periodo: "semanal", acum_dia_semana: "__todos__",
    acum_beneficio_cant: 1, acum_beneficio_desc: "",
    beneficio: "", descripcion: "", fecha_inicio: "", fecha_fin: "",
  });
  const [saving, setSaving] = useState(false);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!supabase || saving || !f.nombre.trim()) return;
    setSaving(true);
    const row = {
      nombre: f.nombre,
      tipo: f.tipo,
      aliado_id: f.aliado_id === "__todas__" ? null : f.aliado_id,
      meta_valor: Number(f.meta_valor) || 0,
      acum_cada_pax: f.tipo === "acumulacion" ? Number(f.acum_cada_pax) || null : null,
      acum_periodo: f.tipo === "acumulacion" ? f.acum_periodo : null,
      acum_dia_semana: f.tipo === "acumulacion" && f.acum_dia_semana !== "__todos__" ? Number(f.acum_dia_semana) : null,
      acum_beneficio_cant: f.tipo === "acumulacion" ? Number(f.acum_beneficio_cant) || 1 : null,
      acum_beneficio_desc: f.tipo === "acumulacion" ? f.acum_beneficio_desc || null : null,
      beneficio: f.beneficio || null,
      descripcion: f.descripcion || null,
      fecha_inicio: f.fecha_inicio || null,
      fecha_fin: f.fecha_fin || null,
      activo: true,
    };
    if (isEdit) {
      await supabase.from("b2b_incentivos").update(row).eq("id", incentivo.id);
    } else {
      await supabase.from("b2b_incentivos").insert({ id: `INC-${Date.now()}`, ...row });
    }
    setSaving(false);
    onSaved();
  };

  const tipoInfo = TIPOS.find(t => t.val === f.tipo);
  const periodoInfo = PERIODOS.find(p => p.val === f.acum_periodo);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 580, boxShadow: "0 20px 60px rgba(0,0,0,0.6)", maxHeight: "92vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{isEdit ? "Editar programa" : "Nuevo programa de incentivo"}</h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 22 }}>Define las reglas del programa. Se calcula automáticamente en tiempo real.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Nombre */}
          <div>
            <label style={LS}>Nombre del programa</label>
            <input value={f.nombre} onChange={e => upd("nombre", e.target.value)} placeholder="Ej: Reto Martes x4, Semana de Fuego..." style={IS} />
          </div>

          {/* Tipo */}
          <div>
            <label style={LS}>Tipo de programa</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {TIPOS.map(t => (
                <div key={t.val} onClick={() => upd("tipo", t.val)}
                  style={{ padding: "12px 14px", borderRadius: 10, border: `2px solid ${f.tipo === t.val ? B.sky : B.navyLight}`, background: f.tipo === t.val ? B.sky + "15" : B.navy, cursor: "pointer" }}>
                  <div style={{ fontSize: 16, marginBottom: 3 }}>{t.icon} <span style={{ fontSize: 13, fontWeight: f.tipo === t.val ? 700 : 500, color: f.tipo === t.val ? B.sky : B.white }}>{t.label}</span></div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Agencia */}
          <div>
            <label style={LS}>Aplica a</label>
            <select value={f.aliado_id} onChange={e => upd("aliado_id", e.target.value)} style={IS}>
              <option value="__todas__">🌐 Todas las agencias</option>
              {aliados.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>

          {/* ── ACUMULACIÓN ── */}
          {f.tipo === "acumulacion" && (
            <div style={{ background: B.navy, borderRadius: 12, padding: 18, border: `1px solid ${B.sky}33` }}>
              <div style={{ fontSize: 12, color: B.sky, fontWeight: 700, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>🔄 Regla de acumulación</div>

              {/* Período */}
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Período de conteo</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {PERIODOS.map(p => (
                    <button key={p.val} onClick={() => upd("acum_periodo", p.val)}
                      style={{ flex: 1, padding: "10px", borderRadius: 8, border: `2px solid ${f.acum_periodo === p.val ? B.sky : B.navyLight}`, background: f.acum_periodo === p.val ? B.sky + "15" : "transparent", color: f.acum_periodo === p.val ? B.sky : "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: f.acum_periodo === p.val ? 700 : 400, cursor: "pointer" }}>
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Día de semana */}
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Solo contar reservas de</label>
                <select value={String(f.acum_dia_semana)} onChange={e => upd("acum_dia_semana", e.target.value)} style={IS}>
                  <option value="__todos__">Todos los días</option>
                  {DIAS_SEMANA.map(d => <option key={d.val} value={String(d.val)}>{d.label}</option>)}
                </select>
              </div>

              {/* Regla: cada N pax */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={LS}>Cada cuántos pasajeros</label>
                  <input type="number" min="1" value={f.acum_cada_pax} onChange={e => upd("acum_cada_pax", e.target.value)} placeholder="Ej: 4, 10, 100" style={IS} />
                </div>
                <div>
                  <label style={LS}>Cantidad del premio</label>
                  <input type="number" min="1" value={f.acum_beneficio_cant} onChange={e => upd("acum_beneficio_cant", e.target.value)} placeholder="1" style={IS} />
                </div>
              </div>

              {/* Premio */}
              <div style={{ marginBottom: 8 }}>
                <label style={LS}>¿Qué se regala?</label>
                <input value={f.acum_beneficio_desc} onChange={e => upd("acum_beneficio_desc", e.target.value)}
                  placeholder="Ej: pasajero gratis, noche para 2 con desayuno, descuento 10%..." style={IS} />
              </div>

              {/* Preview de la regla */}
              {f.acum_cada_pax && f.acum_beneficio_desc && (
                <div style={{ marginTop: 14, padding: "12px 16px", background: B.sky + "15", borderRadius: 8, border: `1px solid ${B.sky}33`, fontSize: 13 }}>
                  <span style={{ color: B.sky }}>📌 Regla: </span>
                  Por cada <strong style={{ color: B.white }}>{f.acum_cada_pax} pasajeros</strong>
                  {f.acum_dia_semana !== "__todos__" ? <> los <strong style={{ color: B.sand }}>{DIAS_SEMANA.find(d => String(d.val) === String(f.acum_dia_semana))?.label}</strong></> : ""}
                  {" "}<strong style={{ color: B.white }}>({periodoInfo?.label?.toLowerCase()})</strong> →{" "}
                  <strong style={{ color: B.success }}>{f.acum_beneficio_cant} {f.acum_beneficio_desc}</strong>
                </div>
              )}
            </div>
          )}

          {/* ── META ── */}
          {["meta_pax","meta_revenue","meta_reservas"].includes(f.tipo) && (
            <div>
              <label style={LS}>Valor de la meta</label>
              <input type="number" value={f.meta_valor} onChange={e => upd("meta_valor", e.target.value)}
                placeholder={f.tipo === "meta_revenue" ? "5000000" : "50"} style={IS} />
            </div>
          )}

          {/* Fechas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Fecha inicio</label>
              <input type="date" value={f.fecha_inicio} onChange={e => upd("fecha_inicio", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Fecha fin</label>
              <input type="date" value={f.fecha_fin} onChange={e => upd("fecha_fin", e.target.value)} style={IS} />
            </div>
          </div>

          {/* Premio / descripción */}
          <div>
            <label style={LS}>{f.tipo === "acumulacion" ? "Nota adicional / condiciones" : "Premio al cumplir"}</label>
            <input value={f.beneficio} onChange={e => upd("beneficio", e.target.value)}
              placeholder={f.tipo === "acumulacion" ? "Válido solo para pasadías clásicas..." : "Bono $500.000, noche gratis..."} style={IS} />
          </div>
          <div>
            <label style={LS}>Descripción (opcional)</label>
            <textarea value={f.descripcion} onChange={e => upd("descripcion", e.target.value)}
              rows={2} style={{ ...IS, resize: "vertical" }} placeholder="Detalles del programa..." />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={saving || !f.nombre.trim()}
            style={{ flex: 2, padding: "11px", background: saving ? B.navyLight : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear programa"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// CARD DE INCENTIVO — muestra progreso según tipo
// ════════════════════════════════════════════════════════
function IncentivCard({ inc, aliados, progresoData, onEdit, onToggle, onDelete, compact = false }) {
  const tipoInfo  = TIPOS.find(t => t.val === inc.tipo) || TIPOS[4];
  const aliadoNom = inc.aliado_id ? aliados.find(a => a.id === inc.aliado_id)?.nombre : null;
  const dr        = diasRestantes(inc.fecha_fin);
  const vencido   = inc.fecha_fin && inc.fecha_fin < fechaHoy();

  const diaLabel  = inc.acum_dia_semana !== null && inc.acum_dia_semana !== undefined
    ? DIAS_SEMANA.find(d => d.val === inc.acum_dia_semana)?.label
    : null;
  const periodoLabel = PERIODOS.find(p => p.val === inc.acum_periodo)?.label || "";

  // ── Render acumulación ──────────────────────────────────
  const renderAcum = () => {
    const data = progresoData || {};
    // Si aplica a una agencia, data = { actual, bloques, resto, paxFalta, pct }
    // Si aplica a todas, data = { [aliadoId]: {...} }
    const entries = inc.aliado_id
      ? [{ nombre: aliadoNom || "—", d: data }]
      : aliados.map(a => ({ nombre: a.nombre, d: data[a.id] || {} })).filter(e => e.d.totalPax !== undefined);

    return (
      <div>
        {/* Regla resumida */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, background: B.sky + "22", color: B.sky, fontWeight: 600 }}>
            🔄 Cada {inc.acum_cada_pax} pax → {inc.acum_beneficio_cant} {inc.acum_beneficio_desc}
          </span>
          <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, background: B.sand + "22", color: B.sand }}>
            {PERIODOS.find(p => p.val === inc.acum_periodo)?.icon} {periodoLabel}
          </span>
          {diaLabel && (
            <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, background: B.warning + "22", color: B.warning }}>
              📌 Solo {diaLabel}s
            </span>
          )}
        </div>

        {/* Progreso por agencia */}
        {entries.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin datos en el período actual</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
          {entries.map(({ nombre, d }) => {
            if (!d || d.totalPax === undefined) return null;
            const cumplido = d.bloques > 0;
            return (
              <div key={nombre} style={{ background: B.navy, borderRadius: 10, padding: "12px 14px" }}>
                {!inc.aliado_id && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nombre}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{d.totalPax} pax enviados</span>
                  {d.bloques > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: B.success }}>🎁 ×{d.bloques} ganados</span>
                  )}
                </div>
                <div style={{ height: 8, background: B.navyLight, borderRadius: 4, overflow: "hidden", marginBottom: 5 }}>
                  <div style={{ height: "100%", width: `${d.pct || 0}%`, borderRadius: 4, background: `linear-gradient(90deg, ${B.sky}, ${B.sand})`, transition: "width 0.5s" }} />
                </div>
                <div style={{ fontSize: 11, color: d.paxFalta <= 2 ? B.warning : "rgba(255,255,255,0.35)" }}>
                  {d.paxFalta === inc.acum_cada_pax && d.bloques === 0
                    ? `${inc.acum_cada_pax} pax para el primer premio`
                    : `Faltan ${d.paxFalta} pax para el próximo`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Render meta ─────────────────────────────────────────
  const renderMeta = () => {
    const d  = progresoData || {};
    const pct = d.pct ?? null;
    const cumplido = pct >= 100;
    if (pct === null) return null;
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Progreso</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: cumplido ? B.success : B.sky }}>
            {fmtMeta(inc.tipo, d.actual)} / {fmtMeta(inc.tipo, inc.meta_valor)}
          </span>
        </div>
        <div style={{ height: 8, background: B.navy, borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 4, background: cumplido ? B.success : B.sky, transition: "width 0.5s" }} />
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "right" }}>{pct}%</div>
      </div>
    );
  };

  return (
    <div style={{
      background: B.navyMid, borderRadius: 14, padding: compact ? 16 : 22,
      border: `1px solid ${!inc.activo ? B.navyLight + "44" : inc.tipo === "acumulacion" ? B.sky + "33" : B.navyLight}`,
      opacity: inc.activo ? 1 : 0.5,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: inc.tipo === "acumulacion" ? B.sky + "22" : B.sand + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
          {tipoInfo.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{inc.nombre}</span>
            {!inc.activo && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.navyLight, color: "rgba(255,255,255,0.4)" }}>Inactivo</span>}
            {vencido && inc.activo && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.danger + "22", color: B.danger }}>Vencido</span>}
            {aliadoNom
              ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.sand + "22", color: B.sand }}>🏢 {aliadoNom}</span>
              : <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: B.sky + "22", color: B.sky }}>🌐 Todas</span>
            }
          </div>
          {inc.descripcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{inc.descripcion}</div>}
          <div style={{ display: "flex", gap: 12, marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.35)", flexWrap: "wrap" }}>
            {inc.fecha_inicio && <span>📅 {fmtFecha(inc.fecha_inicio)} → {fmtFecha(inc.fecha_fin)}</span>}
            {dr !== null && !vencido && inc.activo && <span style={{ color: dr <= 7 ? B.warning : "inherit" }}>⏱ {dr === 0 ? "Vence hoy" : `${dr}d`}</span>}
            {inc.beneficio && <span>📝 {inc.beneficio}</span>}
          </div>
        </div>
        {/* Acciones */}
        {(onEdit || onToggle || onDelete) && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {onEdit   && <button onClick={() => onEdit(inc)}   style={{ background: B.navyLight, color: B.sand, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>Editar</button>}
            {onToggle && <button onClick={() => onToggle(inc)} style={{ background: inc.activo ? B.warning + "22" : B.success + "22", color: inc.activo ? B.warning : B.success, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>{inc.activo ? "Pausar" : "Activar"}</button>}
            {onDelete && <button onClick={() => onDelete(inc)} style={{ background: B.danger + "22", color: B.danger, border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11, cursor: "pointer" }}>✕</button>}
          </div>
        )}
      </div>

      {/* Progreso */}
      {inc.tipo === "acumulacion" ? renderAcum() : renderMeta()}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB AGENCIAS
// ════════════════════════════════════════════════════════
function TabAgencias() {
  const [incentivos,   setIncentivos]   = useState([]);
  const [aliados,      setAliados]      = useState([]);
  const [progreso,     setProgreso]     = useState({});   // { incId: progresoData }
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [editando,     setEditando]     = useState(null);
  const [filtroAlias,  setFiltroAlias]  = useState("__todas__");
  const [filtroEst,    setFiltroEst]    = useState("activos");

  const fetchAll = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [incR, aliR] = await Promise.all([
      supabase.from("b2b_incentivos").select("*").order("created_at", { ascending: false }),
      supabase.from("aliados_b2b").select("id, nombre").eq("estado", "activo").order("nombre"),
    ]);
    const incs = incR.data || [];
    const als  = aliR.data || [];
    setIncentivos(incs);
    setAliados(als);

    // Calcular progreso por incentivo
    const prog = {};
    for (const inc of incs) {
      if (!inc.activo) continue;

      if (inc.tipo === "acumulacion") {
        const { desde, hasta } = rangoActual(inc.acum_periodo || "mensual");
        const targets = inc.aliado_id ? [inc.aliado_id] : als.map(a => a.id);
        if (inc.aliado_id) {
          const { data: res } = await supabase.from("reservas")
            .select("fecha, pax").eq("aliado_id", inc.aliado_id)
            .neq("estado", "cancelado").gte("fecha", desde).lte("fecha", hasta);
          prog[inc.id] = calcAcum(res || [], inc);
        } else {
          const map = {};
          for (const aid of targets) {
            const { data: res } = await supabase.from("reservas")
              .select("fecha, pax").eq("aliado_id", aid)
              .neq("estado", "cancelado").gte("fecha", desde).lte("fecha", hasta);
            map[aid] = calcAcum(res || [], inc);
          }
          prog[inc.id] = map;
        }
      } else if (["meta_pax","meta_revenue","meta_reservas"].includes(inc.tipo) && inc.fecha_inicio) {
        const aid = inc.aliado_id;
        const q = supabase.from("reservas").select("pax, total").neq("estado", "cancelado")
          .gte("fecha", inc.fecha_inicio).lte("fecha", inc.fecha_fin || fechaHoy());
        if (aid) q.eq("aliado_id", aid);
        const { data: res } = await q;
        const pax     = (res || []).reduce((s, r) => s + (r.pax || 0), 0);
        const revenue = (res || []).reduce((s, r) => s + (r.total || 0), 0);
        const reservas= (res || []).length;
        const actual  = inc.tipo === "meta_pax" ? pax : inc.tipo === "meta_revenue" ? revenue : reservas;
        prog[inc.id]  = { actual, pct: Math.min(100, Math.round((actual / (inc.meta_valor || 1)) * 100)) };
      }
    }
    setProgreso(prog);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleActivo = async (inc) => {
    await supabase.from("b2b_incentivos").update({ activo: !inc.activo }).eq("id", inc.id);
    fetchAll();
  };
  const eliminar = async (inc) => {
    if (!window.confirm(`¿Eliminar "${inc.nombre}"?`)) return;
    await supabase.from("b2b_incentivos").delete().eq("id", inc.id);
    fetchAll();
  };

  const activos   = incentivos.filter(i => i.activo);
  const incFilt   = incentivos
    .filter(i => filtroEst === "activos" ? i.activo : filtroEst === "inactivos" ? !i.activo : true)
    .filter(i => filtroAlias === "__todas__" ? true : (i.aliado_id === filtroAlias || i.aliado_id === null));

  const acumActivos = activos.filter(i => i.tipo === "acumulacion").length;
  const metaActivos = activos.filter(i => i.tipo !== "acumulacion" && i.tipo !== "especial").length;

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando incentivos...</div>;

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <KpiCard label="Programas activos" value={activos.length}   color={B.sky}     sub="en curso" />
        <KpiCard label="Acumulación"        value={acumActivos}     color={B.sand}    sub="por lotes" />
        <KpiCard label="Metas"              value={metaActivos}     color={B.success}  sub="puntuales" />
        <KpiCard label="Agencias"           value={aliados.length}  color={B.navyLight} sub="activas" />
      </div>

      {/* Filtros + nuevo */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <select value={filtroAlias} onChange={e => setFiltroAlias(e.target.value)} style={{ ...ISsm, width: "auto", minWidth: 180 }}>
          <option value="__todas__">Todas las agencias</option>
          {aliados.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {[["activos","Activos"],["inactivos","Inactivos"],["todos","Todos"]].map(([v,l]) => (
            <button key={v} onClick={() => setFiltroEst(v)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: filtroEst === v ? 700 : 400, background: filtroEst === v ? B.sky : B.navyMid, color: filtroEst === v ? B.navy : "rgba(255,255,255,0.5)" }}>{l}</button>
          ))}
        </div>
        <button onClick={() => fetchAll()} style={{ background: B.navyLight, color: "rgba(255,255,255,0.5)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>↺</button>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => { setEditando(null); setShowModal(true); }}
            style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            + Nuevo programa
          </button>
        </div>
      </div>

      {incFilt.length === 0 && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>No hay programas con estos filtros</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {incFilt.map(inc => (
          <IncentivCard
            key={inc.id}
            inc={inc}
            aliados={aliados}
            progresoData={progreso[inc.id]}
            onEdit={i => { setEditando(i); setShowModal(true); }}
            onToggle={toggleActivo}
            onDelete={eliminar}
          />
        ))}
      </div>

      {showModal && (
        <IncentivModal
          aliados={aliados}
          incentivo={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSaved={() => { setShowModal(false); setEditando(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB VENDEDORES (ranking + config AtolonLovers)
// ════════════════════════════════════════════════════════
function RankingList({ vends, vendedores, coinName, config, showHist, onClickRow, onAjuste, historialVen, modality }) {
  const MEDAL = ["🥇","🥈","🥉"];
  const copPorPunto = config?.cop_por_punto || 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {vends.length === 0 && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 32, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          No hay vendedores en este programa
        </div>
      )}
      {vends.map((v) => {
        const pos  = vends.findIndex(x => x.id === v.id);
        const open = showHist === v.id;
        const copVal = modality === "cop" ? Math.round(v.puntos * copPorPunto) : null;
        return (
          <div key={v.id}>
            <div onClick={() => onClickRow(v.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, background: open ? B.sky + "15" : B.navyMid, borderRadius: 10, padding: "11px 14px", border: `1px solid ${open ? B.sky + "44" : pos === 0 ? B.sand + "33" : B.navyLight + "44"}`, cursor: "pointer" }}>
              <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{MEDAL[pos] || `#${pos+1}`}</span>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: pos === 0 ? `linear-gradient(135deg,${B.sand},${B.sky})` : B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: pos === 0 ? B.navy : "rgba(255,255,255,0.7)", flexShrink: 0 }}>
                {v.nombre.split(" ").map(w=>w[0]).join("").slice(0,2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.nombre}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{v.aliado_nombre}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 20, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: pos === 0 ? B.sand : (modality === "cop" ? B.success : B.sky) }}>
                  {v.puntos.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{coinName}</div>
                {copVal !== null && copVal > 0 && (
                  <div style={{ fontSize: 11, color: B.success, fontWeight: 700 }}>≈ {COP(copVal)}</div>
                )}
              </div>
              <button onClick={e => { e.stopPropagation(); onAjuste(v); }}
                style={{ background: B.navyLight, color: B.sand, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>±</button>
            </div>
            {open && historialVen.length > 0 && (
              <div style={{ background: B.navyMid, borderRadius: "0 0 10px 10px", padding: "14px 16px", marginTop: -4, border: `1px solid ${B.sky}22`, borderTop: "none" }}>
                <div style={{ fontSize: 11, color: B.sand, marginBottom: 8 }}>Historial de {v.nombre}</div>
                <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
                  {historialVen.map(h => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${B.navyLight}22` }}>
                      <div>
                        <div style={{ fontSize: 12 }}>{h.concepto}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{new Date(h.created_at).toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"})}</div>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: h.tipo==="debito" ? B.danger : B.success }}>
                        {h.tipo==="debito" ? "−" : "+"}{h.puntos.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabVendedores() {
  const [subTab,       setSubTab]       = useState("premios");
  const [vendedores,   setVendedores]   = useState([]);
  const [config,       setConfig]       = useState(null);
  const [aliados,      setAliados]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [editCfg,      setEditCfg]      = useState(false);
  const [cfgForm,      setCfgForm]      = useState({});
  const [savingCfg,    setSavingCfg]    = useState(false);
  const [filtroAlias,  setFiltroAlias]  = useState("__todas__");
  const [ajusteModal,  setAjusteModal]  = useState(null);
  const [ajusteForm,   setAjusteForm]   = useState({ puntos: "", motivo: "", tipo: "credito" });
  const [savingAjuste, setSavingAjuste] = useState(false);
  const [historialVen, setHistorialVen] = useState([]);
  const [showHist,     setShowHist]     = useState(null);
  const [savingModal,  setSavingModal]  = useState({});  // { aliadoId: bool }

  const fetchAll = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [venR, aliR, cfgR, ptsR] = await Promise.all([
      supabase.from("b2b_usuarios").select("id, nombre, email, rol, aliado_id, activo").eq("activo", true).order("nombre"),
      supabase.from("aliados_b2b").select("id, nombre, modalidad_puntos").eq("estado", "activo").order("nombre"),
      supabase.from("b2b_puntos_config").select("*").eq("id", "default").single(),
      supabase.from("b2b_puntos_historial").select("vendedor_id, puntos"),
    ]);
    const als    = aliR.data || [];
    const ptsMap = {};
    (ptsR.data || []).forEach(p => { ptsMap[p.vendedor_id] = (ptsMap[p.vendedor_id] || 0) + p.puntos; });
    const vendFull = (venR.data || [])
      .filter(v => v.rol !== "admin")
      .map(v => {
        const al = als.find(a => a.id === v.aliado_id);
        return { ...v, aliado_nombre: al?.nombre || "—", aliado_modalidad: al?.modalidad_puntos || "premios", puntos: ptsMap[v.id] || 0 };
      })
      .sort((a, b) => b.puntos - a.puntos);
    setVendedores(vendFull);
    setAliados(als);
    setConfig(cfgR.data);
    setCfgForm(cfgR.data || {});
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveCfg = async () => {
    if (!supabase || savingCfg) return;
    setSavingCfg(true);
    await supabase.from("b2b_puntos_config").upsert({
      id: "default", activo: cfgForm.activo ?? true,
      nombre_puntos: cfgForm.nombre_puntos || "AtolonLovers",
      cop_por_punto:             Number(cfgForm.cop_por_punto) || 0,
      puntos_por_reserva:        Number(cfgForm.puntos_por_reserva) || 0,
      puntos_por_pax:            Number(cfgForm.puntos_por_pax) || 0,
      puntos_por_millon:         Number(cfgForm.puntos_por_millon) || 0,
      bonus_grupo_10_pax:        Number(cfgForm.bonus_grupo_10_pax) || 0,
      bonus_fin_semana:          Number(cfgForm.bonus_fin_semana) || 0,
      bonus_primera_reserva_mes: Number(cfgForm.bonus_primera_reserva_mes) || 0,
    });
    setSavingCfg(false); setEditCfg(false); fetchAll();
  };

  const toggleModalidad = async (al) => {
    const nueva = al.modalidad_puntos === "cop" ? "premios" : "cop";
    setSavingModal(p => ({ ...p, [al.id]: true }));
    await supabase.from("aliados_b2b").update({ modalidad_puntos: nueva }).eq("id", al.id);
    setSavingModal(p => ({ ...p, [al.id]: false }));
    fetchAll();
  };

  const fetchHistorial = async (vendedorId) => {
    if (!supabase) return;
    if (showHist === vendedorId) { setShowHist(null); return; }
    const { data } = await supabase.from("b2b_puntos_historial")
      .select("*").eq("vendedor_id", vendedorId)
      .order("created_at", { ascending: false }).limit(30);
    setHistorialVen(data || []);
    setShowHist(vendedorId);
  };

  const aplicarAjuste = async () => {
    if (!supabase || savingAjuste || !ajusteForm.puntos || !ajusteForm.motivo.trim()) return;
    setSavingAjuste(true);
    await supabase.from("b2b_puntos_historial").insert({
      id: `PTS-ADJ-${Date.now()}`, vendedor_id: ajusteModal.id, aliado_id: ajusteModal.aliado_id,
      puntos: Math.abs(Number(ajusteForm.puntos)), concepto: `Ajuste manual: ${ajusteForm.motivo}`, tipo: ajusteForm.tipo,
    });
    setSavingAjuste(false); setAjusteModal(null);
    setAjusteForm({ puntos: "", motivo: "", tipo: "credito" }); fetchAll();
  };

  const coinName  = config?.nombre_puntos || "AtolonLovers";
  const vendFilt  = vendedores.filter(v => filtroAlias === "__todas__" || v.aliado_id === filtroAlias);
  const vendPrem  = vendFilt.filter(v => v.aliado_modalidad !== "cop");
  const vendCOP   = vendFilt.filter(v => v.aliado_modalidad === "cop");
  const copPorPunto = config?.cop_por_punto || 0;
  const SUBTABS = [
    { key: "premios", label: "🎁 Premios", desc: "Agencias pequeñas — puntos canjeables por premios físicos" },
    { key: "cop",     label: "💵 COP",     desc: "Agencias grandes — puntos con valor en pesos colombianos" },
  ];

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando...</div>;

  const totalPuntos = vendedores.reduce((s,v)=>s+v.puntos,0);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <KpiCard label="Vendedores"       value={vendedores.length}                          color={B.sky}     sub="activos (sin admins)" />
        <KpiCard label={coinName}         value={totalPuntos.toLocaleString()}               color={B.sand}    sub="distribuidos total" />
        <KpiCard label="Prog. Premios"    value={aliados.filter(a=>a.modalidad_puntos!=="cop").length}  color={B.sky}    sub="agencias → 🎁 premios" />
        <KpiCard label="Prog. COP"        value={aliados.filter(a=>a.modalidad_puntos==="cop").length}  color={B.success} sub={`agencias → ${copPorPunto>0?COP(copPorPunto)+"/pt":"sin tarifa"}`} />
      </div>

      {/* Sub-tabs Premios / COP */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, background: B.navyMid, borderRadius: 12, padding: 4 }}>
        {SUBTABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={{ flex: 1, padding: "10px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: subTab === t.key ? 700 : 500, background: subTab === t.key ? (t.key === "cop" ? B.success : B.sky) : "transparent", color: subTab === t.key ? B.navy : "rgba(255,255,255,0.5)", transition: "all 0.15s" }}>{t.label}</button>
        ))}
      </div>

      {/* Info banner */}
      <div style={{ background: subTab === "cop" ? B.success + "15" : B.sky + "15", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "rgba(255,255,255,0.6)", border: `1px solid ${subTab === "cop" ? B.success + "33" : B.sky + "33"}` }}>
        {SUBTABS.find(t=>t.key===subTab)?.desc}
        {subTab === "cop" && copPorPunto > 0 && (
          <span style={{ marginLeft: 12, fontWeight: 700, color: B.success }}>
            1 {coinName} = {COP(copPorPunto)}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
        <div>
          {/* Filtro agencia */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <select value={filtroAlias} onChange={e => setFiltroAlias(e.target.value)} style={{ ...ISsm, width: "auto", minWidth: 180 }}>
              <option value="__todas__">Todas las agencias</option>
              {aliados.map(a => <option key={a.id} value={a.id}>{a.nombre} {a.modalidad_puntos === "cop" ? "💵" : "🎁"}</option>)}
            </select>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {subTab === "premios" ? vendPrem.length : vendCOP.length} vendedores
            </span>
          </div>

          <RankingList
            vends={subTab === "premios" ? vendPrem : vendCOP}
            vendedores={vendedores}
            coinName={coinName}
            config={config}
            showHist={showHist}
            onClickRow={fetchHistorial}
            onAjuste={v => setAjusteModal(v)}
            historialVen={historialVen}
            modality={subTab}
          />
        </div>

        {/* Panel derecho: config + modalidad por agencia */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Config AtolonLovers */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: B.sand }}>⚙ Reglas {coinName}</div>
              {!editCfg && <button onClick={() => setEditCfg(true)} style={{ background: B.navyLight, border: "none", borderRadius: 6, padding: "4px 10px", color: B.sand, fontSize: 11, cursor: "pointer" }}>Editar</button>}
            </div>
            {!editCfg ? (
              <div style={{ fontSize: 12, lineHeight: 2.2 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>Sistema</span><strong style={{ color: config?.activo ? B.success : B.danger }}>{config?.activo ? "Activo ✓" : "Inactivo"}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>💵 1 pt en COP</span><strong style={{ color: B.success }}>{copPorPunto > 0 ? COP(copPorPunto) : "—"}</strong></div>
                {[["Por reserva",config?.puntos_por_reserva,B.sky],["Por pax",config?.puntos_por_pax,B.sky],["Por millón",config?.puntos_por_millon,B.sky],["Bonus +10 pax",config?.bonus_grupo_10_pax,B.sand],["Bonus finde",config?.bonus_fin_semana,B.sand],["Bonus 1ª/mes",config?.bonus_primera_reserva_mes,B.sand]].map(([l,v,c])=>(
                  <div key={l} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "rgba(255,255,255,0.4)" }}>{l}</span><strong style={{ color: c }}>{v||0} pts</strong></div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={cfgForm.activo??true} onChange={e=>setCfgForm(f=>({...f,activo:e.target.checked}))}/><span style={{fontSize:12,color:B.sand}}>Sistema activo</span></div>
                <div><label style={{...LS,fontSize:10}}>Nombre moneda</label><input value={cfgForm.nombre_puntos||""} onChange={e=>setCfgForm(f=>({...f,nombre_puntos:e.target.value}))} style={ISsm}/></div>
                <div><label style={{...LS,fontSize:10}}>💵 Valor COP por punto (prog. COP)</label><input type="number" min="0" value={cfgForm.cop_por_punto||0} onChange={e=>setCfgForm(f=>({...f,cop_por_punto:+e.target.value}))} placeholder="500" style={ISsm}/></div>
                {[["puntos_por_reserva","Por reserva"],["puntos_por_pax","Por pax"],["puntos_por_millon","Por millón COP"],["bonus_grupo_10_pax","Bonus +10 pax"],["bonus_fin_semana","Bonus finde"],["bonus_primera_reserva_mes","Bonus 1ª/mes"]].map(([k,l])=>(
                  <div key={k}><label style={{...LS,fontSize:10}}>{l}</label><input type="number" value={cfgForm[k]||0} onChange={e=>setCfgForm(f=>({...f,[k]:+e.target.value}))} style={ISsm}/></div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={()=>setEditCfg(false)} style={{flex:1,padding:"7px",background:B.navyLight,border:"none",borderRadius:6,color:"rgba(255,255,255,0.5)",fontSize:11,cursor:"pointer"}}>Cancelar</button>
                  <button onClick={saveCfg} disabled={savingCfg} style={{flex:2,padding:"7px",background:B.success,border:"none",borderRadius:6,color:B.white,fontSize:11,fontWeight:700,cursor:"pointer"}}>{savingCfg?"Guardando...":"Guardar"}</button>
                </div>
              </div>
            )}
          </div>

          {/* Modalidad por agencia */}
          <div style={{ background: B.navyMid, borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.sand, marginBottom: 12 }}>🏢 Modalidad por agencia</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 10 }}>
              🎁 Premios = agencias pequeñas<br/>💵 COP = agencias grandes
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
              {aliados.map(al => {
                const esCOP     = al.modalidad_puntos === "cop";
                const guardando = savingModal[al.id];
                return (
                  <div key={al.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 8, background: B.navy, border: `1px solid ${esCOP ? B.success + "33" : B.sky + "22"}` }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{al.nombre}</div>
                    <button
                      onClick={() => toggleModalidad(al)}
                      disabled={!!guardando}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, background: esCOP ? B.success + "22" : B.sky + "22", color: esCOP ? B.success : B.sky }}>
                      {guardando ? "..." : esCOP ? "💵 COP" : "🎁 Premios"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Ajuste manual modal */}
      {ajusteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e=>e.target===e.currentTarget&&setAjusteModal(null)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 400 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Ajuste manual de puntos</h3>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{ajusteModal.nombre} · {ajusteModal.aliado_nombre}</div>
            <div style={{ fontSize: 11, marginBottom: 16, padding: "4px 10px", borderRadius: 6, background: ajusteModal.aliado_modalidad === "cop" ? B.success + "22" : B.sky + "22", color: ajusteModal.aliado_modalidad === "cop" ? B.success : B.sky, display: "inline-block" }}>
              {ajusteModal.aliado_modalidad === "cop" ? "💵 Programa COP" : "🎁 Programa Premios"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[["credito","➕ Sumar",B.success],["debito","➖ Restar",B.danger]].map(([t,l,c])=>(
                  <div key={t} onClick={()=>setAjusteForm(f=>({...f,tipo:t}))} style={{padding:"11px",borderRadius:10,border:`2px solid ${ajusteForm.tipo===t?c:B.navyLight}`,background:ajusteForm.tipo===t?c+"15":B.navy,cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:13,fontWeight:700,color:c}}>{l}</div>
                  </div>
                ))}
              </div>
              <div><label style={LS}>Puntos</label><input type="number" min="1" value={ajusteForm.puntos} onChange={e=>setAjusteForm(f=>({...f,puntos:e.target.value}))} placeholder="100" style={IS}/></div>
              {ajusteModal.aliado_modalidad === "cop" && ajusteForm.puntos && copPorPunto > 0 && (
                <div style={{ fontSize: 12, color: B.success, padding: "6px 10px", borderRadius: 6, background: B.success + "15" }}>
                  ≈ {COP(Math.round(Number(ajusteForm.puntos) * copPorPunto))} en COP
                </div>
              )}
              <div><label style={LS}>Motivo *</label><input value={ajusteForm.motivo} onChange={e=>setAjusteForm(f=>({...f,motivo:e.target.value}))} placeholder="Premio especial, corrección..." style={IS}/></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={()=>setAjusteModal(null)} style={{flex:1,padding:"10px",background:"none",border:`1px solid ${B.navyLight}`,borderRadius:8,color:"rgba(255,255,255,0.4)",fontSize:13,cursor:"pointer"}}>Cancelar</button>
              <button onClick={aplicarAjuste} disabled={savingAjuste||!ajusteForm.puntos||!ajusteForm.motivo.trim()} style={{flex:2,padding:"10px",background:ajusteForm.tipo==="credito"?B.success:B.danger,color:B.white,border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                {savingAjuste?"Aplicando...":`${ajusteForm.tipo==="credito"?"Sumar":"Restar"} ${ajusteForm.puntos||0} pts`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MÓDULO PRINCIPAL
// ════════════════════════════════════════════════════════
export default function Incentivos() {
  const [tab, setTab] = useState("agencias");
  const TABS = [
    { key: "agencias",   label: "🏢 Agencias",   desc: "Programas de acumulación y metas para agencias" },
    { key: "vendedores", label: "👤 Vendedores",  desc: "Ranking AtolonLovers y configuración de puntos" },
  ];
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 3 }}>Incentivos B2B</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{TABS.find(t=>t.key===tab)?.desc}</p>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 24, background: B.navyMid, borderRadius: 12, padding: 5 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: "11px 20px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: tab === t.key ? 700 : 500, background: tab === t.key ? B.sky : "transparent", color: tab === t.key ? B.navy : "rgba(255,255,255,0.5)", transition: "all 0.15s" }}>{t.label}</button>
        ))}
      </div>
      {tab === "agencias"   && <TabAgencias />}
      {tab === "vendedores" && <TabVendedores />}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// EXPORT para AgenciaPortal (vista de admin de la agencia)
// ════════════════════════════════════════════════════════
export { IncentivCard, calcAcum, rangoActual, PERIODOS, DIAS_SEMANA, fechaHoy };
