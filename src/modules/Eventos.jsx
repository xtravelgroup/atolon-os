import { useState, useEffect, useCallback } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

const STAGES       = ["Consulta", "Cotizado", "Confirmado", "Realizado"];
const TIPOS_EVT    = ["Matrimonio", "Cumpleaños", "Corporativo", "Despedida de Solteros", "Aniversario", "Grado", "Otro"];
const TIPOS_GRUPO  = ["VIP Pass", "Exclusive Pass", "Atolon Experience", "After Island"];
const SLUG_MAP     = { "VIP Pass": "vip-pass", "Exclusive Pass": "exclusive-pass", "Atolon Experience": "atolon-experience", "After Island": "after-island" };

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const stageColor = (s) => ({ Consulta: B.warning, Cotizado: B.sky, Confirmado: B.success, Realizado: "rgba(255,255,255,0.3)" }[s] || B.sand);

// ─── BEO Preview ─────────────────────────────────────────────────────────────
function BEOPreview({ evento, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.white, borderRadius: 16, padding: 40, width: 600, color: B.navy, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 24, borderBottom: `2px solid ${B.sand}`, paddingBottom: 20 }}>
          <h2 style={{ fontSize: 24, color: B.navy }}>BANQUET EVENT ORDER</h2>
          <div style={{ fontSize: 14, color: "#666", marginTop: 4 }}>Atolon Beach Club — Cartagena</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24, fontSize: 14 }}>
          <div><strong>Evento:</strong> {evento.nombre}</div>
          <div><strong>Tipo:</strong> {evento.tipo}</div>
          <div><strong>Fecha:</strong> {evento.fecha}</div>
          <div><strong>Pax:</strong> {evento.pax}</div>
          <div><strong>Contacto:</strong> {evento.contacto}</div>
          <div><strong>Valor:</strong> {COP(evento.valor)}</div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ color: B.navy, marginBottom: 8 }}>Servicios Incluidos</h4>
          <ul style={{ fontSize: 13, lineHeight: 2, paddingLeft: 20, color: "#444" }}>
            <li>Transporte ida y vuelta en embarcacion privada</li>
            <li>Uso exclusivo de zona asignada</li>
            <li>Servicio de bar premium (4 horas)</li>
            <li>Menu degustacion 3 tiempos</li>
            <li>DJ y sistema de sonido</li>
            <li>Decoracion tematica basica</li>
            <li>Coordinador de evento dedicado</li>
          </ul>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: B.navy, color: B.white, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Cerrar</button>
          <button style={{ flex: 1, padding: "12px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>Descargar PDF</button>
        </div>
      </div>
    </div>
  );
}

// ─── Link del grupo ───────────────────────────────────────────────────────────
function GrupoLink({ evento, onClose }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/booking?grupo=${evento.id}`;
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔗</div>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>Link de compra del grupo</h3>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
            Comparte este link con los participantes del grupo.<br />
            Cada uno entra y paga su pasadía de forma independiente.
          </div>
        </div>

        <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", marginBottom: 8, wordBreak: "break-all", fontSize: 13, color: B.sky, fontFamily: "monospace" }}>
          {url}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button onClick={copy} style={{ flex: 1, padding: "11px", background: copied ? B.success : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {copied ? "✓ Copiado!" : "📋 Copiar link"}
          </button>
          <button onClick={() => window.open(url, "_blank")} style={{ flex: 1, padding: "11px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            👁 Ver página
          </button>
        </div>

        <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px", fontSize: 13, lineHeight: 1.8, color: "rgba(255,255,255,0.5)" }}>
          <div>📅 <strong style={{ color: B.white }}>{fmtFecha(evento.fecha)}</strong></div>
          <div>🌴 <strong style={{ color: B.white }}>{evento.tipo}</strong></div>
          {(evento.salidas_grupo || []).length > 0 && (
            <div>⛵ <strong style={{ color: B.white }}>{[...(evento.salidas_grupo)].sort((a,b)=>a.hora.localeCompare(b.hora)).map(s => s.hora).join(" · ")}</strong></div>
          )}
          <div>👥 Cupos: <strong style={{ color: B.white }}>{evento.pax || "ilimitado"}</strong></div>
        </div>

        <button onClick={onClose} style={{ width: "100%", marginTop: 16, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cerrar</button>
      </div>
    </div>
  );
}

// ─── Modal crear/editar ───────────────────────────────────────────────────────
function EventoModal({ evento, categoria, salidas, aliados, vendedores, onClose, onSaved, onShowLink }) {
  const isEdit   = !!evento?.id;
  const isGrupo  = categoria === "grupo";
  const tiposOpt = isGrupo ? TIPOS_GRUPO : TIPOS_EVT;

  const [form, setForm]       = useState(isEdit
    ? { ...evento, pax: String(evento.pax || ""), valor: String(evento.valor || ""), aliado_id: evento.aliado_id || "", vendedor: evento.vendedor || "", salidas_grupo: evento.salidas_grupo || [] }
    : { nombre: "", tipo: tiposOpt[0], fecha: "", pax: "", valor: "", aliado_id: "", vendedor: "", salidas_grupo: [], contacto: "", tel: "", email: "", stage: "Consulta", notas: "", categoria });
  const [saving,      setSaving]      = useState(false);
  const [horaInput,   setHoraInput]   = useState("");
  const [aliadoSearch,setAliadoSearch]= useState("");
  const [aliadoOpen,  setAliadoOpen]  = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const aliadoSeleccionado = aliados.find(a => a.id === form.aliado_id);
  const aliadosFiltrados   = aliados.filter(a =>
    a.nombre.toLowerCase().includes(aliadoSearch.toLowerCase()) ||
    a.tipo.toLowerCase().includes(aliadoSearch.toLowerCase())
  );

  // Toggle existing salida on/off in salidas_grupo
  const toggleSalida = (s) => {
    setForm(f => {
      const exists = f.salidas_grupo.some(x => x.id === s.id);
      return { ...f, salidas_grupo: exists
        ? f.salidas_grupo.filter(x => x.id !== s.id)
        : [...f.salidas_grupo, { id: s.id, hora: s.hora }]
      };
    });
  };

  // Add a custom (manual) salida hour
  const addCustomHora = () => {
    const h = horaInput.trim();
    if (!h) return;
    // normalize to HH:MM
    const match = h.match(/^(\d{1,2}):?(\d{2})?$/);
    const hora = match ? `${match[1].padStart(2,"0")}:${match[2] || "00"}` : h;
    if (form.salidas_grupo.some(x => x.hora === hora)) { setHoraInput(""); return; }
    setForm(f => ({ ...f, salidas_grupo: [...f.salidas_grupo, { id: `custom-${hora}`, hora, custom: true }] }));
    setHoraInput("");
  };

  const removeSalida = (hora) => setForm(f => ({ ...f, salidas_grupo: f.salidas_grupo.filter(x => x.hora !== hora) }));

  const save = async () => {
    if (!supabase || !form.nombre.trim() || !form.fecha) return;
    setSaving(true);
    const payload = {
      nombre:       form.nombre.trim(),
      tipo:         form.tipo,
      fecha:        form.fecha,
      pax:          Number(form.pax) || 0,
      valor:        Number(form.valor) || 0,
      salidas_grupo: form.salidas_grupo,
      contacto:     form.contacto,
      tel:          form.tel,
      email:        form.email,
      stage:        form.stage,
      notas:        form.notas,
      categoria:    form.categoria || categoria,
      aliado_id:    form.aliado_id || null,
      vendedor:     form.vendedor || "",
    };
    let savedId = evento?.id;
    if (isEdit) {
      await supabase.from("eventos").update(payload).eq("id", evento.id);
    } else {
      savedId = `EVT-${Date.now()}`;
      await supabase.from("eventos").insert({ id: savedId, ...payload });
    }
    setSaving(false);
    await onSaved();
    onClose();
    if (isGrupo && !isEdit) onShowLink({ ...payload, id: savedId });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>
          {isEdit ? `Editar: ${evento.nombre}` : isGrupo ? "Nuevo Grupo Pasadía" : "Nuevo Evento"}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={LS}>{isGrupo ? "Nombre del grupo / empresa" : "Nombre del evento"}</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS}
              placeholder={isGrupo ? "Ej: Grupo Empresas XYZ" : "Ej: Matrimonio García & Pérez"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>{isGrupo ? "Tipo de pasadía" : "Tipo de evento"}</label>
              <select value={form.tipo} onChange={e => set("tipo", e.target.value)} style={IS}>
                {tiposOpt.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LS}>Stage</label>
              <select value={form.stage} onChange={e => set("stage", e.target.value)} style={IS}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Cupos máximos (0 = ilimitado)</label>
              <input type="number" value={form.pax} onChange={e => set("pax", e.target.value)} style={IS} placeholder="0" />
            </div>
          </div>

          {/* Salidas — solo para grupos */}
          {isGrupo && (
            <div>
              <label style={LS}>Horarios de salida</label>
              {/* Existing salidas checkboxes */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {salidas.map(s => {
                  const sel = form.salidas_grupo.some(x => x.id === s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggleSalida(s)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                        background: sel ? B.sky : B.navyLight, color: sel ? B.navy : "rgba(255,255,255,0.5)" }}>
                      {sel ? "✓ " : ""}Salida {s.hora}
                    </button>
                  );
                })}
              </div>
              {/* Custom hora input */}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={horaInput}
                  onChange={e => setHoraInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCustomHora()}
                  placeholder="Agregar hora manual: 14:00"
                  style={{ ...IS, flex: 1 }}
                />
                <button type="button" onClick={addCustomHora}
                  style={{ padding: "9px 16px", borderRadius: 8, background: B.sand, color: B.navy, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  + Agregar
                </button>
              </div>
              {/* Selected salidas chips */}
              {form.salidas_grupo.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {[...form.salidas_grupo].sort((a,b) => a.hora.localeCompare(b.hora)).map(s => (
                    <div key={s.hora} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 12px", borderRadius: 20, background: s.custom ? B.warning + "33" : B.sky + "33", border: `1px solid ${s.custom ? B.warning : B.sky}55`, fontSize: 12, fontWeight: 600, color: s.custom ? B.warning : B.sky }}>
                      ⛵ {s.hora}{s.custom ? " (manual)" : ""}
                      <button onClick={() => removeSalida(s.hora)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isGrupo && (
            <div>
              <label style={LS}>Valor estimado</label>
              <input type="number" value={form.valor} onChange={e => set("valor", e.target.value)} style={IS} placeholder="0" />
            </div>
          )}

          <div>
            <label style={LS}>Nombre del contacto / organizador</label>
            <input value={form.contacto} onChange={e => set("contacto", e.target.value)} style={IS} placeholder="Nombre del cliente o responsable" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LS}>Teléfono / WhatsApp</label>
              <input value={form.tel} onChange={e => set("tel", e.target.value)} style={IS} placeholder="+57 300 000 0000" />
            </div>
            <div>
              <label style={LS}>Email</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} style={IS} placeholder="correo@ejemplo.com" />
            </div>
          </div>

          {/* Aliado B2B — searchable */}
          <div style={{ position: "relative" }}>
            <label style={LS}>Aliado B2B (agencia / hotel / comisionista)</label>
            <div
              onClick={() => { setAliadoOpen(o => !o); setAliadoSearch(""); }}
              style={{ ...IS, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}
            >
              <span style={{ color: aliadoSeleccionado ? B.white : "rgba(255,255,255,0.3)" }}>
                {aliadoSeleccionado ? `${aliadoSeleccionado.nombre} — ${aliadoSeleccionado.tipo}` : "Sin aliado (directo)"}
              </span>
              <span style={{ opacity: 0.4 }}>▾</span>
            </div>
            {aliadoOpen && (
              <div style={{
                position: "absolute", zIndex: 100, top: "100%", left: 0, right: 0,
                background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 10,
                boxShadow: "0 8px 24px #0006", marginTop: 4, overflow: "hidden",
              }}>
                <input
                  autoFocus
                  value={aliadoSearch}
                  onChange={e => setAliadoSearch(e.target.value)}
                  placeholder="Buscar agencia, hotel, comisionista..."
                  style={{ width: "100%", padding: "10px 14px", background: B.navy, border: "none", borderBottom: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                />
                <div style={{ maxHeight: 220, overflowY: "auto" }}>
                  <div
                    onClick={() => { set("aliado_id", ""); setAliadoOpen(false); }}
                    style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, color: "rgba(255,255,255,0.4)", borderBottom: `1px solid ${B.navyLight}22` }}
                    onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >Sin aliado (directo)</div>
                  {aliadosFiltrados.map(a => (
                    <div key={a.id}
                      onClick={() => { set("aliado_id", a.id); setAliadoOpen(false); }}
                      style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, borderBottom: `1px solid ${B.navyLight}22` }}
                      onMouseEnter={e => e.currentTarget.style.background = B.navyLight}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ color: B.white, fontWeight: 600 }}>{a.nombre}</span>
                      <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8, fontSize: 11 }}>{a.tipo}</span>
                    </div>
                  ))}
                  {aliadosFiltrados.length === 0 && (
                    <div style={{ padding: "12px 14px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Sin resultados</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Vendedor */}
          <div>
            <label style={LS}>Vendedor responsable</label>
            <select value={form.vendedor} onChange={e => set("vendedor", e.target.value)} style={IS}>
              <option value="">Sin asignar</option>
              {vendedores.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
            </select>
          </div>

          <div>
            <label style={LS}>Notas</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2}
              style={{ ...IS, resize: "vertical" }} placeholder="Requerimientos especiales, observaciones..." />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={save} disabled={saving || !form.nombre.trim() || !form.fecha}
            style={{ flex: 2, padding: "11px", background: saving ? B.navyLight : B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {saving ? "Guardando..." : isGrupo && !isEdit ? "Crear y generar link →" : isEdit ? "Guardar cambios" : "Crear Evento"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban board ─────────────────────────────────────────────────────────────
function KanbanBoard({ items, isGrupo, onEdit, onBeo, onLink }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 16 }}>
      {STAGES.map(stage => (
        <div key={stage}>
          <div style={{ fontSize: 13, color: stageColor(stage), textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
            {stage} ({items.filter(e => e.stage === stage).length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.filter(e => e.stage === stage).map(ev => (
              <div key={ev.id} onClick={() => onEdit(ev)}
                style={{ background: B.navyMid, borderRadius: 12, padding: 16, cursor: "pointer", borderLeft: `3px solid ${stageColor(stage)}` }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{ev.nombre}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                  {ev.tipo} · {fmtFecha(ev.fecha)}
                  {(ev.salidas_grupo || []).length > 0 && ` · ⛵ ${[...ev.salidas_grupo].sort((a,b)=>a.hora.localeCompare(b.hora)).map(s=>s.hora).join(", ")}`}
                  {` · ${ev.pax || "∞"} pax`}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.sand, marginBottom: 6 }}>{ev.valor ? COP(ev.valor) : ""}</div>
                {ev.contacto && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{ev.contacto}</div>}
                {ev.aliado_id && <div style={{ fontSize: 11, color: B.sky, marginBottom: 4 }}>🤝 {aliados.find(a => a.id === ev.aliado_id)?.nombre || ev.aliado_id}</div>}
                {ev.vendedor && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>👤 {ev.vendedor}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  {!isGrupo && (
                    <button onClick={e => { e.stopPropagation(); onBeo(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: B.navyLight, color: B.white, border: "none", cursor: "pointer" }}>Ver BEO</button>
                  )}
                  {isGrupo && (
                    <button onClick={e => { e.stopPropagation(); onLink(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: B.sky + "33", color: B.sky, border: `1px solid ${B.sky}44`, cursor: "pointer" }}>🔗 Ver link</button>
                  )}
                </div>
              </div>
            ))}
            {items.filter(e => e.stage === stage).length === 0 && (
              <div style={{ borderRadius: 10, border: `1.5px dashed ${B.navyLight}`, padding: "20px 12px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
                Sin registros
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Eventos() {
  const [todos,     setTodos]     = useState([]);
  const [salidas,   setSalidas]   = useState([]);
  const [aliados,   setAliados]   = useState([]);
  const [vendedores,setVendedores]= useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,     setTab]     = useState("evento");
  const [beo,     setBeo]     = useState(null);
  const [modal,   setModal]   = useState(null);
  const [linkEvt, setLinkEvt] = useState(null);

  const fetchTodos = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [evtR, salR, aliR, vendR] = await Promise.all([
      supabase.from("eventos").select("*").order("fecha", { ascending: true }),
      supabase.from("salidas").select("id, hora, nombre").eq("activo", true).order("orden"),
      supabase.from("aliados_b2b").select("id, nombre, tipo").eq("activo", true).order("nombre"),
      supabase.from("usuarios").select("id, nombre").in("rol_id", ["ventas", "gerente_ventas"]).eq("activo", true).order("nombre"),
    ]);
    if (evtR.data) setTodos(evtR.data.map(e => ({
      id: e.id, nombre: e.nombre, tipo: e.tipo, fecha: e.fecha,
      pax: e.pax || 0, valor: e.valor || 0, stage: e.stage,
      contacto: e.contacto || "", tel: e.tel || "", email: e.email || "",
      notas: e.notas || "", categoria: e.categoria || "evento",
      salidas_grupo: e.salidas_grupo || [], aliado_id: e.aliado_id || "",
      vendedor: e.vendedor || "",
    })));
    if (salR.data) setSalidas(salR.data);
    if (aliR.data) setAliados(aliR.data);
    if (vendR.data) setVendedores(vendR.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);

  const items   = todos.filter(e => e.categoria === tab);
  const isGrupo = tab === "grupo";
  const TABS    = [
    { key: "evento", label: "🎉 Eventos" },
    { key: "grupo",  label: "👥 Grupos de Pasadías" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Eventos</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        <button onClick={() => setModal("new")}
          style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>
          + {isGrupo ? "Nuevo Grupo" : "Nuevo Evento"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: B.navyMid, borderRadius: 10, padding: 4, width: "fit-content" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "8px 20px", borderRadius: 7, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer",
              background: tab === t.key ? B.navy : "transparent",
              color: tab === t.key ? B.white : "rgba(255,255,255,0.45)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Pipeline Total", val: COP(items.reduce((s, e) => s + e.valor, 0)), color: B.sand },
          { label: "Confirmados",    val: items.filter(e => e.stage === "Confirmado").length, color: B.success },
          { label: "Por Cotizar",    val: items.filter(e => e.stage === "Consulta").length, color: B.warning },
          { label: "Pax Total",      val: items.reduce((s, e) => s + e.pax, 0), color: B.sky },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", flex: 1, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      <KanbanBoard items={items} isGrupo={isGrupo} onEdit={ev => setModal(ev)} onBeo={setBeo} onLink={setLinkEvt} />

      {beo     && <BEOPreview evento={beo} onClose={() => setBeo(null)} />}
      {linkEvt && <GrupoLink evento={linkEvt} onClose={() => setLinkEvt(null)} />}
      {modal   && (
        <EventoModal
          evento={modal === "new" ? null : modal}
          categoria={modal === "new" ? tab : modal.categoria}
          salidas={salidas}
          aliados={aliados}
          vendedores={vendedores}
          onClose={() => setModal(null)}
          onSaved={fetchTodos}
          onShowLink={setLinkEvt}
        />
      )}
    </div>
  );
}
