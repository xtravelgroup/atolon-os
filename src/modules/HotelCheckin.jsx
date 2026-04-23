import React, { useState, useEffect, useCallback, useMemo } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { display: "block", fontSize: 11, color: B.sand, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });

const fmtDateTime = (s) => s ? new Date(s).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const todayISO = () => new Date().toISOString().slice(0, 16);

function nuevoCodigo() {
  return `HE-${Date.now().toString(36).toUpperCase()}`;
}

export default function HotelCheckin() {
  const [estancias, setEstancias] = useState([]);
  const [habs, setHabs] = useState([]);
  const [huespedes, setHuespedes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState("in_house"); // in_house | reservada | all

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [eR, hR, huR] = await Promise.all([
      supabase.from("hotel_estancias").select("*").order("check_in_at", { ascending: false }),
      supabase.from("hotel_habitaciones").select("id, numero, categoria, estado").eq("estado", "activa").order("numero"),
      supabase.from("hotel_huespedes").select("*").order("nombre"),
    ]);
    setEstancias(eR.data || []);
    setHabs(hR.data || []);
    setHuespedes(huR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const habMap = useMemo(() => Object.fromEntries(habs.map(h => [h.id, h])), [habs]);
  const hueMap = useMemo(() => Object.fromEntries(huespedes.map(h => [h.id, h])), [huespedes]);

  const inHouse = estancias.filter(e => e.estado === "in_house");
  const reservadas = estancias.filter(e => e.estado === "reservada");

  // Habitaciones libres (no in_house actualmente)
  const habsOcupadas = new Set(inHouse.map(e => e.habitacion_id));
  const habsLibres = habs.filter(h => !habsOcupadas.has(h.id));

  const hacerCheckout = async (estancia) => {
    if (!confirm(`Check-out de ${hueMap[estancia.huesped_id]?.nombre || "huésped"}?`)) return;
    await supabase.from("hotel_estancias").update({
      estado: "checked_out",
      check_out_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", estancia.id);
    load();
  };

  const hacerCheckinDesdeReserva = async (estancia) => {
    await supabase.from("hotel_estancias").update({
      estado: "in_house",
      check_in_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", estancia.id);
    load();
  };

  const eliminarEstancia = async (estancia) => {
    if (!confirm("¿Eliminar esta estancia?")) return;
    await supabase.from("hotel_estancias").delete().eq("id", estancia.id);
    load();
  };

  const listaActiva = tab === "in_house" ? inHouse : tab === "reservada" ? reservadas : estancias.slice(0, 50);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando…</div>;

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 16px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", margin: 0 }}>
          🗝️ Check-in / out
        </h1>
        <button onClick={() => setShowNew(true)} style={BTN(B.sky, B.navy)}>+ Nuevo Check-in</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { label: "En casa", value: inHouse.length, color: B.success },
          { label: "Reservadas", value: reservadas.length, color: B.sky },
          { label: "Habitaciones libres", value: habsLibres.length, color: B.sand },
          { label: "Total estancias", value: estancias.length, color: B.navyLight },
        ].map(k => (
          <div key={k.label} style={{ background: B.navyMid, borderRadius: 12, padding: "14px 20px", flex: "1 1 180px", borderLeft: `4px solid ${k.color}`, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {[
          { key: "in_house", label: `🏨 En casa (${inHouse.length})`, color: B.success },
          { key: "reservada", label: `📅 Reservadas (${reservadas.length})`, color: B.sky },
          { key: "all", label: "📋 Historial", color: B.sand },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 18px", borderRadius: 8, border: `1px solid ${tab === t.key ? t.color : B.navyLight}`,
            background: tab === t.key ? t.color + "22" : B.navyMid, color: tab === t.key ? t.color : "rgba(255,255,255,0.5)",
            cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Lista */}
      {listaActiva.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.25)", fontSize: 14, background: B.navyMid, borderRadius: 14 }}>
          Sin estancias en esta sección
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {listaActiva.map(e => {
            const hue = hueMap[e.huesped_id];
            const hab = habMap[e.habitacion_id];
            const noches = Math.max(1, Math.ceil(((new Date(e.check_out_at)) - (new Date(e.check_in_at))) / (1000 * 60 * 60 * 24)));
            return (
              <div key={e.id} style={{ background: B.navyMid, borderRadius: 14, padding: 18, border: `1px solid ${B.navyLight}`, borderLeft: `4px solid ${e.estado === "in_house" ? B.success : e.estado === "reservada" ? B.sky : "rgba(255,255,255,0.3)"}` }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{hue?.nombre || "Sin nombre"}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{e.codigo}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: B.sand, fontFamily: "'Barlow Condensed', sans-serif" }}>#{hab?.numero || "—"}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{hab?.categoria}</div>
                  </div>
                </div>

                {/* Fechas */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 10, fontSize: 11 }}>
                  <div>
                    <div style={{ color: B.sand, fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>Check-in</div>
                    <div style={{ fontWeight: 600 }}>{fmtDateTime(e.check_in_at)}</div>
                  </div>
                  <div>
                    <div style={{ color: B.sand, fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>Check-out</div>
                    <div style={{ fontWeight: 600 }}>{fmtDateTime(e.check_out_at)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: B.sand, fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>Noches</div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{noches}</div>
                  </div>
                </div>

                {/* Pax */}
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>
                  👥 {e.pax_adultos || 0} adulto{(e.pax_adultos||0)!==1?"s":""}
                  {e.pax_ninos > 0 && ` · ${e.pax_ninos} niño${e.pax_ninos!==1?"s":""}`}
                  {hue?.email && ` · ${hue.email}`}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {e.estado === "reservada" && (
                    <button onClick={() => hacerCheckinDesdeReserva(e)} style={{ ...BTN(B.success), flex: 1, fontSize: 11, padding: "6px 10px" }}>
                      → Check-in
                    </button>
                  )}
                  {e.estado === "in_house" && (
                    <>
                      <a href={`/m/${e.id}`} target="_blank" rel="noopener noreferrer" style={{ ...BTN(B.navyLight), color: B.sky, border: `1px solid ${B.sky}44`, fontSize: 11, padding: "6px 10px", textDecoration: "none", flex: 1, textAlign: "center" }}>
                        🛎️ Portal
                      </a>
                      <button onClick={() => hacerCheckout(e)} style={{ ...BTN(B.warning), fontSize: 11, padding: "6px 10px", flex: 1 }}>
                        Check-out
                      </button>
                    </>
                  )}
                  <button onClick={() => eliminarEstancia(e)} style={{ ...BTN(B.navyLight), color: B.danger, fontSize: 11, padding: "6px 10px" }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nuevo check-in */}
      {showNew && (
        <NuevoCheckinModal
          habsLibres={habsLibres}
          huespedes={huespedes}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL NUEVO CHECK-IN
// ═══════════════════════════════════════════════════════════════════════════
function NuevoCheckinModal({ habsLibres, huespedes, onClose, onSaved }) {
  const [form, setForm] = useState({
    habitacion_id: "",
    huesped_id: "",
    // Si crea huésped nuevo:
    nuevoHuesped: false,
    nombre: "",
    email: "",
    telefono: "",
    nacionalidad: "",
    documento: "",
    // Estancia
    check_in_at: todayISO(),
    check_out_at: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 16); })(),
    pax_adultos: 2,
    pax_ninos: 0,
    notas: "",
    estado: "in_house", // in_house para check-in ahora, reservada para futuro
  });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const huespedesFiltered = useMemo(() => {
    if (!search) return huespedes.slice(0, 20);
    const s = search.toLowerCase();
    return huespedes.filter(h =>
      (h.nombre || "").toLowerCase().includes(s) ||
      (h.email || "").toLowerCase().includes(s) ||
      (h.telefono || "").toLowerCase().includes(s)
    ).slice(0, 20);
  }, [huespedes, search]);

  const handleSave = async () => {
    if (!form.habitacion_id) return alert("Selecciona una habitación");
    if (!form.nuevoHuesped && !form.huesped_id) return alert("Selecciona o crea un huésped");
    if (form.nuevoHuesped && !form.nombre.trim()) return alert("Nombre del huésped es obligatorio");

    setSaving(true);
    try {
      let huesped_id = form.huesped_id;
      let huespedData = null;
      if (form.nuevoHuesped) {
        const { data, error } = await supabase.from("hotel_huespedes").insert({
          nombre: form.nombre.trim(),
          email: form.email || null,
          telefono: form.telefono || null,
          nacionalidad: form.nacionalidad || null,
          notas: form.documento ? `Doc: ${form.documento}` : null,
        }).select().single();
        if (error) throw error;
        huesped_id = data.id;
        huespedData = data;
      } else {
        const { data } = await supabase.from("hotel_huespedes").select().eq("id", huesped_id).single();
        huespedData = data;
      }

      const { error: errE } = await supabase.from("hotel_estancias").insert({
        codigo: nuevoCodigo(),
        habitacion_id: form.habitacion_id,
        huesped_id,
        check_in_at: new Date(form.check_in_at).toISOString(),
        check_out_at: new Date(form.check_out_at).toISOString(),
        pax_adultos: Number(form.pax_adultos) || 1,
        pax_ninos: Number(form.pax_ninos) || 0,
        estado: form.estado,
        notas: form.notas || null,
      });
      if (errE) throw errE;

      // ── Crear/actualizar cliente en Loggro (best-effort, no bloquea check-in) ──
      if (huespedData) {
        const yaEnLoggro = huespedData.preferencias?.loggro_client_id;
        try {
          const nombrePartes = (huespedData.nombre || "").split(" ");
          const nombre = nombrePartes[0] || huespedData.nombre;
          const apellido = nombrePartes.slice(1).join(" ");
          const docRaw = (huespedData.notas || "").match(/Doc:\s*(\S+)/i)?.[1] || form.documento;
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/loggro-sync/upsert-client`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              nombre, apellido,
              email: huespedData.email,
              telefono: huespedData.telefono,
              documento: docRaw,
              tipoDoc: huespedData.nacionalidad?.toLowerCase() === "colombiana" ? "CC" : "PS",
              ciudad: "Cartagena",
              notas: `Huésped Atolón · Hab ${form.habitacion_id}`,
              huesped_id,
              loggro_id: yaEnLoggro || null,
            }),
          });
        } catch (_e) {
          console.warn("No se pudo sincronizar huésped con Loggro:", _e);
        }
      }

      onSaved();
    } catch (err) {
      alert("Error: " + (err.message || err));
    }
    setSaving(false);
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 28, width: 560, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>🗝️ Nuevo Check-in</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: B.sand, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {/* Habitación */}
        <div style={{ marginBottom: 14 }}>
          <label style={LS}>Habitación</label>
          <select value={form.habitacion_id} onChange={e => set("habitacion_id", e.target.value)} style={{ ...IS, cursor: "pointer" }}>
            <option value="">— Seleccionar habitación —</option>
            {habsLibres.map(h => (
              <option key={h.id} value={h.id}>#{h.numero} — {h.categoria}</option>
            ))}
          </select>
          {habsLibres.length === 0 && <div style={{ fontSize: 11, color: B.warning, marginTop: 4 }}>⚠ Todas las habitaciones están ocupadas</div>}
        </div>

        {/* Huésped */}
        <div style={{ marginBottom: 14 }}>
          <label style={LS}>Huésped</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => set("nuevoHuesped", false)} style={{
              flex: 1, padding: "7px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: !form.nuevoHuesped ? B.sky + "22" : B.navy,
              border: `1px solid ${!form.nuevoHuesped ? B.sky : B.navyLight}`,
              color: !form.nuevoHuesped ? B.sky : "rgba(255,255,255,0.5)", cursor: "pointer",
            }}>Existente</button>
            <button onClick={() => set("nuevoHuesped", true)} style={{
              flex: 1, padding: "7px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: form.nuevoHuesped ? B.success + "22" : B.navy,
              border: `1px solid ${form.nuevoHuesped ? B.success : B.navyLight}`,
              color: form.nuevoHuesped ? B.success : "rgba(255,255,255,0.5)", cursor: "pointer",
            }}>+ Nuevo</button>
          </div>

          {!form.nuevoHuesped ? (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar huésped..." style={{ ...IS, marginBottom: 6, fontSize: 12 }} />
              <div style={{ maxHeight: 160, overflowY: "auto", background: B.navy, borderRadius: 8, border: `1px solid ${B.navyLight}` }}>
                {huespedesFiltered.length === 0 ? (
                  <div style={{ padding: 14, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Sin resultados</div>
                ) : huespedesFiltered.map(h => (
                  <div key={h.id} onClick={() => set("huesped_id", h.id)} style={{
                    padding: "8px 12px", cursor: "pointer", fontSize: 12,
                    background: form.huesped_id === h.id ? B.sky + "22" : "transparent",
                    borderBottom: `1px solid ${B.navyLight}`,
                  }}>
                    <div style={{ fontWeight: 600 }}>{h.nombre}</div>
                    {h.email && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{h.email}</div>}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LS}>Nombre completo *</label>
                <input value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Nombre y apellido" style={IS} autoFocus />
              </div>
              <div>
                <label style={LS}>Email</label>
                <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="correo@ejemplo.com" style={IS} />
              </div>
              <div>
                <label style={LS}>Teléfono</label>
                <input value={form.telefono} onChange={e => set("telefono", e.target.value)} placeholder="+57..." style={IS} />
              </div>
              <div>
                <label style={LS}>Nacionalidad</label>
                <input value={form.nacionalidad} onChange={e => set("nacionalidad", e.target.value)} placeholder="Colombiana" style={IS} />
              </div>
              <div>
                <label style={LS}>Documento</label>
                <input value={form.documento} onChange={e => set("documento", e.target.value)} placeholder="CC / Pasaporte" style={IS} />
              </div>
            </div>
          )}
        </div>

        {/* Fechas */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={LS}>Check-in</label>
            <input type="datetime-local" value={form.check_in_at} onChange={e => set("check_in_at", e.target.value)} style={IS} />
          </div>
          <div>
            <label style={LS}>Check-out</label>
            <input type="datetime-local" value={form.check_out_at} onChange={e => set("check_out_at", e.target.value)} style={IS} />
          </div>
          <div>
            <label style={LS}>Adultos</label>
            <input type="number" min="1" value={form.pax_adultos} onChange={e => set("pax_adultos", Number(e.target.value))} style={IS} />
          </div>
          <div>
            <label style={LS}>Niños</label>
            <input type="number" min="0" value={form.pax_ninos} onChange={e => set("pax_ninos", Number(e.target.value))} style={IS} />
          </div>
        </div>

        {/* Estado */}
        <div style={{ marginBottom: 14 }}>
          <label style={LS}>Estado</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => set("estado", "in_house")} style={{
              flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: form.estado === "in_house" ? B.success + "22" : B.navy,
              border: `1px solid ${form.estado === "in_house" ? B.success : B.navyLight}`,
              color: form.estado === "in_house" ? B.success : "rgba(255,255,255,0.5)",
            }}>🏨 Check-in ahora</button>
            <button onClick={() => set("estado", "reservada")} style={{
              flex: 1, padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: form.estado === "reservada" ? B.sky + "22" : B.navy,
              border: `1px solid ${form.estado === "reservada" ? B.sky : B.navyLight}`,
              color: form.estado === "reservada" ? B.sky : "rgba(255,255,255,0.5)",
            }}>📅 Solo reservar</button>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={LS}>Notas</label>
          <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2} placeholder="Notas opcionales..." style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={BTN(B.navyLight, "rgba(255,255,255,0.5)")}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={BTN(B.sky, B.navy)}>
            {saving ? "Guardando..." : "💾 Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
