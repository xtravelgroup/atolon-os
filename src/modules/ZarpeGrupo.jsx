// ZarpeGrupo.jsx — Public page for group zarpe data collection
// Route: /zarpe-grupo?ev=EVT-xxx            → organizer fills all slots
// Route: /zarpe-grupo?ev=EVT-xxx&tok=TOKEN  → invitado fills their assigned slots

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg:        "#0D1B3E",
  bgCard:    "#162040",
  bgLight:   "#1C2B55",
  sand:      "#C8B99A",
  sky:       "#64B5F6",
  success:   "#34D399",
  danger:    "#F87171",
  warning:   "#FCD34D",
  text:      "#FFFFFF",
  textMid:   "rgba(255,255,255,0.6)",
  textLight: "rgba(255,255,255,0.35)",
  border:    "rgba(255,255,255,0.1)",
};

const IS = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`,
  color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box",
};

function qrUrl(data, size = 180) {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data)}&size=${size}x${size}&bgcolor=0D1B3E&color=C8B99A&margin=10&format=png`;
}

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return { ev: p.get("ev") || "", tok: p.get("tok") || "", mode: p.get("mode") || "" };
}

const NACS_KI = ["Colombiana","Americana","Mexicana","Ecuatoriana","Peruana","Española","Chilena","Brasileña","Argentina","Francesa","Alemana","Italiana","Venezolana","Uruguaya","Panameña","Otra"];


// Build full slot list from pasadias_org, excluding Impuesto Muelle
function buildSlots(pasadiasOrg) {
  const slots = [];
  (pasadiasOrg || []).forEach(p => {
    if (p.tipo === "Impuesto Muelle") return;
    const n = Number(p.personas) || 0;
    for (let i = 0; i < n; i++) {
      slots.push({ slot_id: `${p.id}-${i}`, tipo: p.tipo, idx: i + 1 });
    }
  });
  return slots;
}

function Wrap({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <img src="/atolon-logo-white.png" alt="Atolon Beach Club"
          style={{ height: 110, objectFit: "contain", display: "block", margin: "0 auto" }} />
      </div>
      <div style={{ width: "100%", maxWidth: 480 }}>{children}</div>
    </div>
  );
}

export default function ZarpeGrupo() {
  const { ev: eventoId, tok, mode } = getParams();
  const isKiosk = mode === "kiosk";

  const [evento,       setEvento]       = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [paxDict,      setPaxDict]      = useState({}); // slot_id → { nombre, identificacion, nacionalidad }
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  // Kiosk mode state
  const [kioskIdx,     setKioskIdx]     = useState(0); // index in emptySlots
  const [kioskDone,    setKioskDone]    = useState(false);
  const [kioskForm,    setKioskForm]    = useState({ nombre: "", identificacion: "", nacionalidad: "Colombiana" });

  useEffect(() => {
    if (!eventoId) { setError("Link inválido"); setLoading(false); return; }
    (async () => {
      const { data, error: err } = await supabase
        .from("eventos")
        .select("id, nombre, fecha, pasadias_org, zarpe_data, invitados_zarpe, salidas_grupo")
        .eq("id", eventoId)
        .single();
      if (err || !data) { setError("Grupo no encontrado"); setLoading(false); return; }
      setEvento(data);
      // Build paxDict from existing zarpe_data
      const dict = {};
      (data.zarpe_data || []).forEach(entry => {
        dict[entry.slot_id] = {
          nombre:         entry.nombre         || "",
          identificacion: entry.identificacion || "",
          nacionalidad:   entry.nacionalidad   || "",
        };
      });
      setPaxDict(dict);
      setLoading(false);
    })();
  }, [eventoId]);

  if (loading) return <Wrap><div style={{ textAlign: "center", color: C.textLight, padding: 60 }}>Cargando...</div></Wrap>;
  if (error)   return <Wrap><div style={{ textAlign: "center", color: C.danger, padding: 60 }}>{error}</div></Wrap>;

  const allSlots = buildSlots(evento.pasadias_org);

  // Determine which slots to show
  let mySlots = allSlots;
  let invitadoLabel = "";
  if (tok) {
    const inv = (evento.invitados_zarpe || []).find(i => i.tok === tok);
    if (!inv) return <Wrap><div style={{ textAlign: "center", color: C.danger, padding: 60 }}>Invitación no encontrada</div></Wrap>;
    mySlots = allSlots.filter(s => (inv.slot_ids || []).includes(s.slot_id));
    invitadoLabel = inv.label || "";
  }

  const setPax = (slot_id, field, value) =>
    setPaxDict(prev => ({
      ...prev,
      [slot_id]: {
        nombre: "", identificacion: "", nacionalidad: "",
        ...prev[slot_id],
        [field]: value,
      },
    }));

  // At least one slot must be filled; partial fills allowed (not all passengers may show up)
  const anyFilled = mySlots.some(s => {
    const d = paxDict[s.slot_id];
    return d?.nombre?.trim() && d?.identificacion?.trim();
  });

  const completados = allSlots.filter(s => paxDict[s.slot_id]?.nombre?.trim()).length;

  const guardar = async () => {
    if (!anyFilled) return;
    setSaving(true);
    const now = new Date().toISOString();
    // Merge mySlots into the full zarpe_data array — set checkin_at for filled slots
    const newZarpe = allSlots.map(s => {
      const d = paxDict[s.slot_id];
      const filled = d?.nombre?.trim() && d?.identificacion?.trim();
      return {
        slot_id:        s.slot_id,
        tipo:           s.tipo,
        idx:            s.idx,
        nombre:         d?.nombre         || "",
        identificacion: d?.identificacion || "",
        nacionalidad:   d?.nacionalidad   || "",
        checkin_at:     filled ? now : undefined,
      };
    });
    await supabase.from("eventos").update({ zarpe_data: newZarpe }).eq("id", eventoId);
    setSaving(false);
    setSaved(true);
  };

  const fechaDisplay = evento.fecha
    ? new Date(evento.fecha + "T12:00:00").toLocaleDateString("es-CO", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      })
    : "—";

  const salidas = [...(evento.salidas_grupo || [])].sort((a, b) => a.hora.localeCompare(b.hora));

  // ── Kiosk mode helpers
  const emptySlots = isKiosk ? allSlots.filter(s => !paxDict[s.slot_id]?.nombre?.trim()) : [];
  const kioskSlot  = emptySlots[kioskIdx] || null;
  const totalKiosk = emptySlots.length;

  const guardarKiosk = async () => {
    if (!kioskSlot || !kioskForm.nombre.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    // Load fresh zarpe_data from DB to avoid overwriting concurrent entries
    const { data: fresh } = await supabase.from("eventos").select("zarpe_data").eq("id", eventoId).single();
    const zarpeBySlot = Object.fromEntries((fresh?.zarpe_data || []).map(z => [z.slot_id, z]));
    zarpeBySlot[kioskSlot.slot_id] = {
      slot_id: kioskSlot.slot_id, tipo: kioskSlot.tipo, idx: kioskSlot.idx,
      nombre: kioskForm.nombre.trim(), identificacion: kioskForm.identificacion.trim(),
      nacionalidad: kioskForm.nacionalidad, checkin_at: now,
    };
    // Also persist all slots that already have data
    allSlots.forEach(s => { if (!zarpeBySlot[s.slot_id]) zarpeBySlot[s.slot_id] = { slot_id: s.slot_id, tipo: s.tipo, idx: s.idx }; });
    const newZarpe = Object.values(zarpeBySlot);
    await supabase.from("eventos").update({ zarpe_data: newZarpe }).eq("id", eventoId);
    // Update local paxDict so emptySlots recalculates
    setPaxDict(prev => ({ ...prev, [kioskSlot.slot_id]: { nombre: kioskForm.nombre.trim(), identificacion: kioskForm.identificacion.trim(), nacionalidad: kioskForm.nacionalidad } }));
    setSaving(false);
    // Advance: next idx (after paxDict update, emptySlots will shrink by 1 so idx stays or hits end)
    if (kioskIdx + 1 >= totalKiosk - 1) {
      setKioskDone(true);
    } else {
      setKioskIdx(i => i + 1);
      setKioskForm({ nombre: "", identificacion: "", nacionalidad: "Colombiana" });
    }
  };

  // ── Kiosk mode UI
  if (isKiosk) {
    if (kioskDone || (!kioskSlot && emptySlots.length === 0)) {
      return (
        <Wrap>
          <div style={{ background: C.bgCard, borderRadius: 18, padding: 32, textAlign: "center", border: `1px solid rgba(52,211,153,0.3)` }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.success, marginBottom: 8 }}>¡Listo!</div>
            <div style={{ fontSize: 14, color: C.textMid, lineHeight: 1.7, marginBottom: 6 }}>Datos registrados correctamente.<br />Ya puedes abordar cuando se indique.</div>
            <div style={{ fontSize: 13, color: C.textLight, marginTop: 12 }}>{evento.nombre}</div>
          </div>
        </Wrap>
      );
    }
    if (!kioskSlot) {
      return (
        <Wrap>
          <div style={{ background: C.bgCard, borderRadius: 18, padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>✅ Todos los datos completos</div>
            <div style={{ fontSize: 13, color: C.textMid }}>{evento.nombre}</div>
          </div>
        </Wrap>
      );
    }
    const totalFilled = allSlots.length - emptySlots.length;
    return (
      <Wrap>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Progreso */}
          <div style={{ background: C.bgCard, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{evento.nombre}</div>
              <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{fechaDisplay}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.sand }}>{totalFilled + 1}<span style={{ fontSize: 14, color: C.textLight, fontWeight: 400 }}>/{allSlots.length}</span></div>
              <div style={{ fontSize: 11, color: C.textLight }}>pasajeros</div>
            </div>
          </div>
          {/* Barra de progreso */}
          <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(totalFilled / allSlots.length) * 100}%`, background: C.sand, borderRadius: 2, transition: "width 0.4s" }} />
          </div>
          {/* Formulario del pasajero actual */}
          <div style={{ background: C.bgCard, borderRadius: 16, padding: 22, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.sand, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{kioskSlot.tipo}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>Pasajero {totalFilled + 1}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 6 }}>Nombre completo *</label>
                <input value={kioskForm.nombre} onChange={e => setKioskForm(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Como aparece en el documento" style={{ ...IS, fontSize: 16 }} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 6 }}>N° Identificación *</label>
                <input value={kioskForm.identificacion} onChange={e => setKioskForm(p => ({ ...p, identificacion: e.target.value }))}
                  placeholder="CC, Pasaporte..." style={{ ...IS, fontSize: 16 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: C.textMid, display: "block", marginBottom: 6 }}>Nacionalidad</label>
                <select value={kioskForm.nacionalidad} onChange={e => setKioskForm(p => ({ ...p, nacionalidad: e.target.value }))} style={{ ...IS, fontSize: 15 }}>
                  {NACS_KI.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <button onClick={guardarKiosk} disabled={saving || !kioskForm.nombre.trim()}
              style={{ width: "100%", marginTop: 22, padding: "16px", borderRadius: 12, border: "none",
                background: (!kioskForm.nombre.trim() || saving) ? "rgba(255,255,255,0.08)" : C.success,
                color: (!kioskForm.nombre.trim() || saving) ? C.textLight : "#0D1B3E",
                fontSize: 16, fontWeight: 800, cursor: kioskForm.nombre.trim() ? "pointer" : "default", transition: "all 0.2s" }}>
              {saving ? "Guardando..." : emptySlots.length <= 1 ? "✅ Finalizar" : "Continuar →"}
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: C.textLight }}>
            {emptySlots.length - 1 > 0 ? `${emptySlots.length - 1} pasajero${emptySlots.length - 1 > 1 ? "s" : ""} más después de este` : "Este es el último pasajero"}
          </div>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Header del grupo */}
        <div style={{ background: C.bgCard, borderRadius: 16, padding: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.sand, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            {tok ? `Zarpe — ${invitadoLabel || "Invitado"}` : "📋 Datos de zarpe grupal"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{evento.nombre}</div>
          <div style={{ fontSize: 13, color: C.textMid, textTransform: "capitalize", marginBottom: 12 }}>{fechaDisplay}</div>

          {salidas.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {salidas.map(s => (
                <span key={s.hora} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8,
                  background: C.sky + "22", border: `1px solid ${C.sky}44`, color: C.sky, fontWeight: 700 }}>
                  ⛵ {s.hora}
                </span>
              ))}
            </div>
          )}

          {/* Completion status — only show for organizer (no tok) */}
          {!tok && (
            <div style={{
              padding: "8px 12px", borderRadius: 8,
              background: completados === allSlots.length && allSlots.length > 0
                ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${completados === allSlots.length && allSlots.length > 0
                ? "rgba(52,211,153,0.3)" : C.border}`,
              fontSize: 13,
              color: completados === allSlots.length && allSlots.length > 0 ? C.success : C.textMid,
            }}>
              {completados === allSlots.length && allSlots.length > 0
                ? `✅ Todos los datos completos (${completados}/${allSlots.length})`
                : `📝 ${completados} de ${allSlots.length} pasajeros con datos`}
            </div>
          )}
        </div>

        {/* Instrucciones de embarque */}
        <div style={{ background: "#1A2E1A", borderRadius: 12, padding: 16,
          border: "1px solid rgba(52,211,153,0.15)", fontSize: 13,
          color: "rgba(255,255,255,0.75)", lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, color: C.success, marginBottom: 6 }}>🚢 Información de embarque</div>
          <div>📍 Muelle de La Bodeguita — Puerta 1</div>
          <div>⏰ Llegar 20 minutos antes de la salida</div>
          <div>💵 Impuesto de muelle: COP 18.000 (no incluido)</div>
          <div>🆔 Traer documento de identidad original</div>
          <div style={{ color: "#F87171", fontWeight: 600 }}>🚫 No se permite el ingreso de alimentos ni bebidas a Atolón Beach Club</div>
        </div>

        {/* ── Formulario de pasajeros ── */}
        {saved ? (
          <div style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.3)",
            borderRadius: 16, padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.success, marginBottom: 8 }}>¡Check-in completado!</div>
            <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.6, marginBottom: 20 }}>
              Datos de zarpe registrados y check-in confirmado.<br />
              Guarda este QR como comprobante de embarque.
            </div>
            <div style={{ display: "inline-block", padding: 12, background: "#0D1B3E",
              borderRadius: 16, border: `2px solid ${C.sand}`, marginBottom: 8 }}>
              <img
                src={qrUrl(`${window.location.origin}/zarpe-grupo?ev=${eventoId}${tok ? `&tok=${tok}` : ""}`, 160)}
                width={160} height={160} style={{ display: "block", borderRadius: 8 }}
                alt="QR Zarpe" />
            </div>
            <div style={{ fontSize: 11, color: C.textLight }}>{eventoId}</div>
            <button onClick={() => setSaved(false)}
              style={{ marginTop: 16, padding: "9px 24px", borderRadius: 8,
                background: "none", border: `1px solid ${C.border}`, color: C.textLight,
                fontSize: 12, cursor: "pointer" }}>
              Editar datos
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {mySlots.length === 0 && (
                <div style={{ textAlign: "center", color: C.textLight, padding: 32, fontSize: 14 }}>
                  No hay pasajeros asignados a este link.
                </div>
              )}
              {mySlots.map((s) => {
                const d = paxDict[s.slot_id] || {};
                const filled = d.nombre?.trim() && d.identificacion?.trim();
                return (
                  <div key={s.slot_id} style={{
                    background: C.bgCard, borderRadius: 14, padding: 16,
                    border: `1px solid ${filled ? "rgba(52,211,153,0.25)" : C.border}`,
                    transition: "border-color 0.2s",
                  }}>
                    <div style={{ fontSize: 11, color: C.sand, fontWeight: 700,
                      marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em",
                      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{s.tipo} — Pasajero {s.idx}</span>
                      {filled && <span style={{ color: C.success, fontSize: 13 }}>✓</span>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: C.textMid, display: "block", marginBottom: 4 }}>
                          Nombre completo *
                        </label>
                        <input
                          value={d.nombre || ""}
                          onChange={e => setPax(s.slot_id, "nombre", e.target.value)}
                          placeholder="Como aparece en el documento"
                          style={IS}
                        />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: C.textMid, display: "block", marginBottom: 4 }}>
                            N° identificación *
                          </label>
                          <input
                            value={d.identificacion || ""}
                            onChange={e => setPax(s.slot_id, "identificacion", e.target.value)}
                            placeholder="Cédula / Pasaporte"
                            style={IS}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.textMid, display: "block", marginBottom: 4 }}>
                            Nacionalidad
                          </label>
                          <input
                            value={d.nacionalidad || ""}
                            onChange={e => setPax(s.slot_id, "nacionalidad", e.target.value)}
                            placeholder="Colombiana"
                            style={IS}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {mySlots.length > 0 && (
              <button
                onClick={guardar}
                disabled={saving || !anyFilled}
                style={{
                  width: "100%", padding: "14px", borderRadius: 12, border: "none",
                  background: !anyFilled ? "rgba(200,185,154,0.18)" : C.sand,
                  color: !anyFilled ? C.textLight : C.bg,
                  fontSize: 15, fontWeight: 700,
                  cursor: !anyFilled ? "default" : "pointer",
                  transition: "all 0.2s",
                }}>
                {saving ? "Guardando..." : "Guardar datos del zarpe"}
              </button>
            )}
          </>
        )}

        <div style={{ textAlign: "center", fontSize: 11, color: C.textLight, paddingBottom: 32 }}>
          Atolon Beach Club · Cartagena de Indias · atolon.co
        </div>
      </div>
    </Wrap>
  );
}
