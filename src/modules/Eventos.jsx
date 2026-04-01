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
    : { nombre: "", tipo: tiposOpt[0], fecha: "", pax: "", valor: "", aliado_id: "", vendedor: "", salidas_grupo: [], contacto: "", tel: "", email: "", empresa: "", nit: "", cargo: "", direccion: "", montaje: "", hora_ini: "", hora_fin: "", vencimiento: "", stage: "Consulta", notas: "", categoria });
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
      empresa:      form.empresa || "",
      nit:          form.nit || "",
      cargo:        form.cargo || "",
      direccion:    form.direccion || "",
      montaje:      form.montaje || "",
      hora_ini:     form.hora_ini || "",
      hora_fin:     form.hora_fin || "",
      vencimiento:  form.vencimiento || "",
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

          {/* Datos de cotización — solo para eventos */}
          {!isGrupo && (
            <>
              <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 16, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, fontWeight: 700 }}>Datos para cotización</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={LS}>Empresa / Cliente</label>
                      <input value={form.empresa} onChange={e => set("empresa", e.target.value)} style={IS} placeholder="Nombre de la empresa o cliente" />
                    </div>
                    <div>
                      <label style={LS}>NIT / Identificación</label>
                      <input value={form.nit} onChange={e => set("nit", e.target.value)} style={IS} placeholder="900123456-7" />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={LS}>Cargo del contacto</label>
                      <input value={form.cargo} onChange={e => set("cargo", e.target.value)} style={IS} placeholder="Gerente, Organizador..." />
                    </div>
                    <div>
                      <label style={LS}>Dirección</label>
                      <input value={form.direccion} onChange={e => set("direccion", e.target.value)} style={IS} placeholder="Dirección del cliente" />
                    </div>
                  </div>
                  <div>
                    <label style={LS}>Tipo de Montaje</label>
                    <input value={form.montaje} onChange={e => set("montaje", e.target.value)} style={IS} placeholder="Coctel, Cena, Auditorio..." />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={LS}>Hora Inicio</label>
                      <input value={form.hora_ini} onChange={e => set("hora_ini", e.target.value)} style={IS} placeholder="10:00" />
                    </div>
                    <div>
                      <label style={LS}>Hora Final</label>
                      <input value={form.hora_fin} onChange={e => set("hora_fin", e.target.value)} style={IS} placeholder="18:00" />
                    </div>
                    <div>
                      <label style={LS}>Vencimiento cotización</label>
                      <input type="date" value={form.vencimiento} onChange={e => set("vencimiento", e.target.value)} style={IS} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

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
function KanbanBoard({ items, isGrupo, onEdit, onBeo, onLink, onCotizar, aliados }) {
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
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {!isGrupo && (
                    <button onClick={e => { e.stopPropagation(); onBeo(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: B.navyLight, color: B.white, border: "none", cursor: "pointer" }}>Ver BEO</button>
                  )}
                  {!isGrupo && (
                    <button onClick={e => { e.stopPropagation(); onCotizar(ev); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: B.sand + "33", color: B.sand, border: `1px solid ${B.sand}44`, cursor: "pointer", fontWeight: 600 }}>📋 Cotizar</button>
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

// ─── Cotización Modal ──────────────────────────────────────────────────────────
const EMPTY_LINE = { concepto: "", cantidad: 1, noches: 1, valor_unit: 0, iva: 19 };

function calcLine(l) {
  const sub  = l.cantidad * (l.noches || 1) * l.valor_unit;
  const tax  = sub * (l.iva / 100);
  return { sub, tax, total: sub + tax };
}

const MENU_TIPOS = ["Menú de Banquetes", "Menú Restaurant", "Custom Menu"];

function SectionTable({ title, color, rows, setRows, showNoches = false, showMenuType = false }) {
  const [menuPicker, setMenuPicker] = useState(false);

  const addRow = (menu_tipo = "") => {
    setRows(r => [...r, { ...EMPTY_LINE, menu_tipo }]);
    setMenuPicker(false);
  };
  const upd = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const del = (i) => setRows(r => r.filter((_, j) => j !== i));

  const totals = rows.reduce((acc, l) => {
    const { sub, tax, total } = calcLine(l);
    return { sub: acc.sub + sub, tax: acc.tax + tax, total: acc.total + total };
  }, { sub: 0, tax: 0, total: 0 });

  const th = { padding: "8px 10px", fontSize: 11, fontWeight: 700, color: B.white, textTransform: "uppercase", letterSpacing: "0.05em", background: color, textAlign: "left" };
  const td = { padding: "6px 8px", fontSize: 12, borderBottom: `1px solid ${B.navyLight}` };
  const inp = (val, onChange, type = "text", w = "100%") => (
    <input type={type} value={val} onChange={onChange}
      style={{ width: w, background: "transparent", border: "none", color: B.white, fontSize: 12, outline: "none", padding: "2px 4px" }} />
  );

  return (
    <div style={{ marginBottom: 24, position: "relative" }}>
      <div style={{ background: color, padding: "10px 14px", borderRadius: "8px 8px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, color: B.white, fontSize: 14 }}>{title}</span>
        <button onClick={() => showMenuType ? setMenuPicker(p => !p) : addRow()}
          style={{ background: "rgba(255,255,255,0.2)", border: "none", color: B.white, borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>+ Agregar</button>
      </div>

      {/* Menu type picker */}
      {menuPicker && (
        <div style={{ background: B.navyMid, border: `1px solid ${B.navyLight}`, borderRadius: 10, padding: 16, marginBottom: 0, position: "absolute", right: 0, top: 42, zIndex: 10, boxShadow: "0 8px 24px #0006", minWidth: 280 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>Selecciona el tipo de menú:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {MENU_TIPOS.map(t => (
              <button key={t} onClick={() => addRow(t)}
                style={{ padding: "10px 16px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, cursor: "pointer", textAlign: "left", fontWeight: 600 }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", background: B.navyMid }}>
        <thead>
          <tr>
            <th style={{ ...th, background: color + "cc", width: showMenuType ? "30%" : "35%" }}>Concepto</th>
            {showMenuType && <th style={{ ...th, background: color + "cc", width: "14%" }}>Tipo Menú</th>}
            <th style={{ ...th, background: color + "cc", width: "8%", textAlign: "center" }}>Cant.</th>
            {showNoches && <th style={{ ...th, background: color + "cc", width: "8%", textAlign: "center" }}>Noches</th>}
            <th style={{ ...th, background: color + "cc", width: "15%", textAlign: "right" }}>Valor Unit.</th>
            <th style={{ ...th, background: color + "cc", width: "8%", textAlign: "center" }}>IVA %</th>
            <th style={{ ...th, background: color + "cc", width: "12%", textAlign: "right" }}>Subtotal</th>
            <th style={{ ...th, background: color + "cc", width: "12%", textAlign: "right" }}>Total</th>
            <th style={{ ...th, background: color + "cc", width: "4%" }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => {
            const { sub, total } = calcLine(l);
            return (
              <tr key={i}>
                <td style={td}>{inp(l.concepto, e => upd(i, "concepto", e.target.value))}</td>
                {showMenuType && (
                  <td style={td}>
                    <select value={l.menu_tipo || ""} onChange={e => upd(i, "menu_tipo", e.target.value)}
                      style={{ background: "transparent", border: "none", color: B.white, fontSize: 11, outline: "none", width: "100%", cursor: "pointer" }}>
                      <option value="">—</option>
                      {MENU_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                )}
                <td style={{ ...td, textAlign: "center" }}>{inp(l.cantidad, e => upd(i, "cantidad", Number(e.target.value)), "number", "60px")}</td>
                {showNoches && <td style={{ ...td, textAlign: "center" }}>{inp(l.noches, e => upd(i, "noches", Number(e.target.value)), "number", "60px")}</td>}
                <td style={{ ...td, textAlign: "right" }}>{inp(l.valor_unit, e => upd(i, "valor_unit", Number(e.target.value)), "number", "100px")}</td>
                <td style={{ ...td, textAlign: "center" }}>{inp(l.iva, e => upd(i, "iva", Number(e.target.value)), "number", "50px")}</td>
                <td style={{ ...td, textAlign: "right", color: B.sand }}>{COP(sub)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{COP(total)}</td>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => del(i)} style={{ background: "none", border: "none", color: B.danger, cursor: "pointer", fontSize: 14 }}>✕</button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={showNoches ? (showMenuType ? 9 : 8) : (showMenuType ? 8 : 7)} style={{ ...td, textAlign: "center", color: "rgba(255,255,255,0.3)", padding: 16 }}>Sin ítems — haz click en "+ Agregar"</td></tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={showNoches ? 5 : 4} style={{ padding: "8px 10px", fontSize: 12, color: B.sand, textAlign: "right", fontWeight: 600 }}>TOTAL {title.toUpperCase()}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: B.sand, fontSize: 12 }}>{COP(totals.sub)}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: B.white }}>{COP(totals.total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function CotizacionModal({ evento, aliados, onClose, onSaved }) {
  const saved  = evento.cotizacion_data || {};
  const [espacios,  setEspacios]  = useState(saved.espacios  || []);
  const [alimentos, setAlimentos] = useState(saved.alimentos || []);
  const [servicios, setServicios] = useState(saved.servicios || []);
  const [saving, setSaving] = useState(false);

  // Header data comes directly from the evento record
  const header = {
    empresa:     evento.empresa    || evento.contacto || "",
    nit:         evento.nit        || "",
    contacto:    evento.contacto   || "",
    cargo:       evento.cargo      || "",
    telefono:    evento.tel        || "",
    email:       evento.email      || "",
    direccion:   evento.direccion  || "",
    montaje:     evento.montaje    || "",
    hora_ini:    evento.hora_ini   || "",
    hora_fin:    evento.hora_fin   || "",
    vencimiento: evento.vencimiento|| "",
  };

  const sumSection = (rows) => rows.reduce((acc, l) => {
    const { sub, tax, total } = calcLine(l);
    return { sub: acc.sub + sub, tax: acc.tax + tax, total: acc.total + total };
  }, { sub: 0, tax: 0, total: 0 });

  const totEsp = sumSection(espacios);
  const totAli = sumSection(alimentos);
  const totSer = sumSection(servicios);
  const grandTotal = totEsp.total + totAli.total + totSer.total;

  const aliado = aliados.find(a => a.id === evento.aliado_id);

  async function guardar(marcarCotizado = false) {
    setSaving(true);
    const data = { espacios, alimentos, servicios };
    const upd  = { cotizacion_data: data };
    if (marcarCotizado) upd.stage = "Cotizado";
    await supabase.from("eventos").update(upd).eq("id", evento.id);
    setSaving(false);
    onSaved();
    if (marcarCotizado) onClose();
  }

  function imprimir() {
    guardar();
    setTimeout(() => window.print(), 400);
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #cotizacion-print { display: block !important; position: fixed; inset: 0; background: white; z-index: 99999; padding: 32px; color: #000; }
          #cotizacion-print table { page-break-inside: avoid; }
        }
        #cotizacion-print { display: none; }
      `}</style>

      {/* Printable area */}
      <div id="cotizacion-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, borderBottom: "3px solid #1E3566", paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#1E3566" }}>ATOLON</div>
            <div style={{ fontSize: 12, color: "#666" }}>Beach Club · Cartagena, Colombia</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1E3566" }}>COTIZACIÓN</div>
            <div style={{ fontSize: 12, color: "#666" }}>{evento.id}</div>
            <div style={{ fontSize: 12, color: "#666" }}>Fecha: {new Date().toLocaleDateString("es-CO")}</div>
            {header.vencimiento && <div style={{ fontSize: 12, color: "#666" }}>Vence: {header.vencimiento}</div>}
          </div>
        </div>

        {/* Event info grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", marginBottom: 20, fontSize: 12 }}>
          {[["EVENTO", evento.tipo], ["FECHA EVENTO", evento.fecha ? new Date(evento.fecha).toLocaleDateString("es-CO") : ""], ["EMPRESA / CLIENTE", header.empresa], ["NIT", header.nit], ["CONTACTO", header.contacto], ["CARGO", header.cargo], ["TELÉFONO", header.telefono], ["EMAIL", header.email], ["DIRECCIÓN", header.direccion], ["ALIADO B2B", aliado?.nombre || ""], ["TIPO DE MONTAJE", header.montaje], ["NÚM. PAX", evento.pax], ["HORA INICIO", header.hora_ini], ["HORA FINAL", header.hora_fin]].map(([k, v]) => v ? (
            <div key={k} style={{ borderBottom: "1px solid #eee", padding: "4px 0", display: "flex", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "#1E3566", minWidth: 140 }}>{k}:</span>
              <span>{v}</span>
            </div>
          ) : null)}
        </div>

        {/* Sections */}
        {[["ESPACIOS", "#1E3566", espacios, true], ["ALIMENTOS Y BEBIDAS", "#2E7D52", alimentos, false], ["OTROS SERVICIOS", "#7B4F12", servicios, false]].map(([title, color, rows, noches]) => rows.length > 0 && (
          <div key={title} style={{ marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: color, color: "white" }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", width: "35%" }}>{title}</th>
                  <th style={{ padding: "6px 8px", textAlign: "center", width: "8%" }}>CANT.</th>
                  {noches && <th style={{ padding: "6px 8px", textAlign: "center", width: "8%" }}>NOCHES</th>}
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "15%" }}>VALOR UNIT.</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "12%" }}>SUBTOTAL</th>
                  <th style={{ padding: "6px 8px", textAlign: "center", width: "8%" }}>IVA</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", width: "14%" }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l, i) => {
                  const { sub, tax, total } = calcLine(l);
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#f9f9f9" : "white" }}>
                      <td style={{ padding: "5px 8px" }}>{l.concepto}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center" }}>{l.cantidad}</td>
                      {noches && <td style={{ padding: "5px 8px", textAlign: "center" }}>{l.noches}</td>}
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>{COP(l.valor_unit)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>{COP(sub)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "center" }}>{l.iva}%</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{COP(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* Totals */}
        <div style={{ marginLeft: "auto", width: 320, borderTop: "2px solid #1E3566", paddingTop: 12, fontSize: 13 }}>
          {[["Total Espacios", totEsp.total], ["Total Alimentos & Bebidas", totAli.total], ["Total Otros Servicios", totSer.total]].map(([k, v]) => v > 0 && (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#444" }}>
              <span>{k}</span><span>{COP(v)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontWeight: 900, fontSize: 16, color: "#1E3566", borderTop: "1px solid #1E3566", marginTop: 6 }}>
            <span>TOTAL EVENTO</span><span>{COP(grandTotal)}</span>
          </div>
        </div>

        <div style={{ marginTop: 32, fontSize: 10, color: "#aaa", textAlign: "center" }}>
          Esta cotización es válida hasta {header.vencimiento || "—"}. Los precios están en COP e incluyen IVA donde aplica.
        </div>
      </div>

      {/* Modal UI */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "20px 0" }}>
        <div style={{ background: B.navy, borderRadius: 16, width: "90vw", maxWidth: 900, padding: 28, margin: "auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Cotización — {evento.nombre}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{evento.tipo} · {evento.fecha ? new Date(evento.fecha).toLocaleDateString("es-CO") : ""} · {evento.pax} pax</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>✕</button>
          </div>

          {/* Client info — read-only summary from evento */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em" }}>Datos del cliente</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Editables desde el evento ✏️</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 16px" }}>
              {[["Empresa", header.empresa], ["NIT", header.nit], ["Contacto", header.contacto], ["Cargo", header.cargo], ["Teléfono", header.telefono], ["Email", header.email], ["Dirección", header.direccion], ["Montaje", header.montaje], ["Hora inicio", header.hora_ini], ["Hora final", header.hora_fin], ["Vencimiento", header.vencimiento]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
                  <div style={{ fontSize: 13, color: v ? B.white : "rgba(255,255,255,0.2)" }}>{v || "—"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sections */}
          <SectionTable title="Espacios / Alojamiento" color="#1E3566" rows={espacios} setRows={setEspacios} showNoches />
          <SectionTable title="Alimentos y Bebidas"    color="#2E7D52" rows={alimentos} setRows={setAlimentos} showMenuType />
          <SectionTable title="Otros Servicios"        color="#7B4F12" rows={servicios} setRows={setServicios} />

          {/* Grand total */}
          <div style={{ background: B.navyMid, borderRadius: 10, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 32 }}>
            {[["Espacios", totEsp.total], ["Alimentos", totAli.total], ["Servicios", totSer.total]].map(([k, v]) => v > 0 && (
              <div key={k} style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{COP(v)}</div>
              </div>
            ))}
            <div style={{ textAlign: "right", borderLeft: `2px solid ${B.sand}`, paddingLeft: 24 }}>
              <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase" }}>Total Evento</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: B.sand }}>{COP(grandTotal)}</div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "11px 20px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={() => guardar(false)} disabled={saving} style={{ padding: "11px 20px", background: B.navyLight, color: B.white, border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
              {saving ? "Guardando..." : "💾 Guardar"}
            </button>
            <button onClick={imprimir} style={{ padding: "11px 20px", background: B.sky + "33", color: B.sky, border: `1px solid ${B.sky}44`, borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              🖨 Imprimir / PDF
            </button>
            <button onClick={() => guardar(true)} disabled={saving} style={{ flex: 1, padding: "11px", background: B.sand, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              ✓ Guardar y Marcar Cotizado
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Eventos() {
  const [todos,     setTodos]     = useState([]);
  const [salidas,   setSalidas]   = useState([]);
  const [aliados,   setAliados]   = useState([]);
  const [vendedores,setVendedores]= useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,        setTab]        = useState("evento");
  const [beo,        setBeo]        = useState(null);
  const [modal,      setModal]      = useState(null);
  const [linkEvt,    setLinkEvt]    = useState(null);
  const [cotizacion, setCotizacion] = useState(null);

  const fetchTodos = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [evtR, salR, aliR, vendR] = await Promise.all([
      supabase.from("eventos").select("*").order("fecha", { ascending: true }),
      supabase.from("salidas").select("id, hora, nombre").eq("activo", true).order("orden"),
      supabase.from("aliados_b2b").select("id, nombre, tipo").order("nombre"),
      supabase.from("usuarios").select("id, nombre").in("rol_id", ["ventas", "gerente_ventas"]).eq("activo", true).order("nombre"),
    ]);
    if (evtR.data) setTodos(evtR.data.map(e => ({
      id: e.id, nombre: e.nombre, tipo: e.tipo, fecha: e.fecha,
      pax: e.pax || 0, valor: e.valor || 0, stage: e.stage,
      contacto: e.contacto || "", tel: e.tel || "", email: e.email || "",
      notas: e.notas || "", categoria: e.categoria || "evento",
      salidas_grupo: e.salidas_grupo || [], aliado_id: e.aliado_id || "",
      vendedor: e.vendedor || "", cotizacion_data: e.cotizacion_data || {},
      empresa: e.empresa || "", nit: e.nit || "", cargo: e.cargo || "",
      direccion: e.direccion || "", montaje: e.montaje || "",
      hora_ini: e.hora_ini || "", hora_fin: e.hora_fin || "", vencimiento: e.vencimiento || "",
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

      <KanbanBoard items={items} isGrupo={isGrupo} aliados={aliados} onEdit={ev => setModal(ev)} onBeo={setBeo} onLink={setLinkEvt} onCotizar={setCotizacion} />

      {beo        && <BEOPreview evento={beo} onClose={() => setBeo(null)} />}
      {linkEvt    && <GrupoLink evento={linkEvt} onClose={() => setLinkEvt(null)} />}
      {cotizacion && <CotizacionModal evento={cotizacion} aliados={aliados} onClose={() => setCotizacion(null)} onSaved={fetchTodos} />}
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
