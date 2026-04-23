import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";

const B = {
  navy: "#0D1B3E", navyMid: "#172554", navyLight: "#1e293b",
  sky: "#8ECAE6", sand: "#C8B99A", white: "#F8FAFC",
  success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
  hotel: "#a78bfa",
};

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const TIPOS_CAMA = ["King", "Queen", "Doble", "Individual", "Twin", "Sofá cama", "Litera", "Cuna"];
const ESTADOS = [
  { key: "activa", label: "Activa", color: B.success },
  { key: "inactiva", label: "Inactiva", color: "rgba(255,255,255,0.3)" },
  { key: "mantenimiento", label: "Mantenimiento", color: B.warning },
];
const estadoColor = (e) => ESTADOS.find(x => x.key === e)?.color || B.success;

// ─── Matcher habitación → mesa Loggro ────────────────────────────────────
// Las habitaciones del hotel SOLO deben mapearse a mesas con prefijo "HB"
// (Hotel Beach). C*, R*, S*, X*, P* son mesas de otras áreas (playa, cabañas,
// piscina, etc.) y NO son habitaciones.
//
// Ejemplos válidos: "201" → "HB 201", "201" → "HB201", "1A" → "HB 1A"
function findMesaMatch(hab, mesas) {
  const numero = String(hab?.numero || "").trim().toUpperCase();
  if (!numero || !mesas || mesas.length === 0) return null;
  const normNum = numero.replace(/\s+/g, "");

  // Solo considerar mesas con prefijo "HB" — las demás no son habitaciones.
  const soloHB = mesas.filter(m => /^HB\b/i.test((m.nombre || "").trim()));

  const candidates = soloHB.map(m => {
    const nombre = String(m.nombre || "").trim().toUpperCase();
    // Remover el prefijo "HB" para comparar solo el número/código de habitación.
    const sinPrefijo = nombre.replace(/^HB\s*/i, "").trim();
    const sinPrefijoNorm = sinPrefijo.replace(/\s+/g, "");
    const tokens = nombre.split(/\s+/);
    const normNombre = nombre.replace(/\s+/g, "");

    let score = 0;
    // Match exacto contra la parte después de "HB" (ej: "201" === "201")
    if (sinPrefijoNorm === normNum) score = 100;
    // Match exacto del nombre completo sin espacios (ej: "HB201" === "HB201")
    else if (normNombre === normNum) score = 95;
    // Match exacto contra algún token (ej: "201" === token[1] "201")
    else if (tokens.includes(numero)) score = 90;
    // Prefix/suffix
    else if (sinPrefijoNorm.startsWith(normNum) || sinPrefijoNorm.endsWith(normNum)) score = 50;
    return { mesa: m, score };
  }).filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.mesa || null;
}

const EMPTY_CAT = {
  nombre: "", capacidad_incluida: 2, capacidad_maxima: 2,
  camas: [{ cantidad: 1, tipo: "King" }],
  descripcion: "",
  _cantidad: 1, _prefijo: "",
};

export default function HotelHabitaciones() {
  const [cats, setCats] = useState([]);
  const [habs, setHabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [catForm, setCatForm] = useState(null); // null | EMPTY_CAT | { ...cat } for edit
  const [editingHab, setEditingHab] = useState(null);
  const [habForm, setHabForm] = useState({});

  const [loggroMesas, setLoggroMesas] = useState([]);

  const load = async () => {
    setLoading(true);
    const [{ data: cData }, { data: hData }, { data: mData }] = await Promise.all([
      supabase.from("hotel_categorias").select("*").order("orden").order("nombre"),
      supabase.from("hotel_habitaciones").select("*").order("orden").order("numero"),
      supabase.from("loggro_mesas").select("loggro_id, nombre").eq("activa", true).order("nombre"),
    ]);
    setCats(cData || []);
    setHabs(hData || []);
    setLoggroMesas(mData || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const habsPorCat = useMemo(() => {
    const map = {};
    habs.forEach(h => {
      const k = h.categoria_id || h.categoria;
      if (!map[k]) map[k] = [];
      map[k].push(h);
    });
    return map;
  }, [habs]);

  const totalHabs = habs.length;
  const activas = habs.filter(h => h.estado === "activa").length;
  const mantenimiento = habs.filter(h => h.estado === "mantenimiento").length;

  const abrirNuevaCat = () => setCatForm({ ...EMPTY_CAT });
  const abrirEditCat = (c) => setCatForm({ ...c, _cantidad: 0, _prefijo: "" });

  const setCF = (k, v) => setCatForm(f => ({ ...f, [k]: v }));
  const setCama = (i, k, v) => setCatForm(f => ({ ...f, camas: f.camas.map((c, idx) => idx === i ? { ...c, [k]: v } : c) }));
  const addCama = () => setCatForm(f => ({ ...f, camas: [...(f.camas || []), { cantidad: 1, tipo: "Individual" }] }));
  const removeCama = (i) => setCatForm(f => ({ ...f, camas: f.camas.filter((_, idx) => idx !== i) }));

  const guardarCategoria = async () => {
    const nombre = (catForm.nombre || "").trim();
    if (!nombre) return alert("Nombre de categoría obligatorio");
    const payload = {
      nombre,
      capacidad_incluida: Number(catForm.capacidad_incluida) || 0,
      capacidad_maxima: Number(catForm.capacidad_maxima) || 0,
      camas: (catForm.camas || []).filter(c => c.tipo && Number(c.cantidad) > 0).map(c => ({ cantidad: Number(c.cantidad), tipo: c.tipo })),
      descripcion: catForm.descripcion || "",
      updated_at: new Date().toISOString(),
    };
    let catId = catForm.id;
    if (catId) {
      const { error } = await supabase.from("hotel_categorias").update(payload).eq("id", catId);
      if (error) return alert("Error: " + error.message);
    } else {
      const { data, error } = await supabase.from("hotel_categorias").insert(payload).select().single();
      if (error) return alert("Error: " + error.message);
      catId = data.id;
      // Crear habitaciones iniciales (con auto-mapeo a mesas de Loggro por número)
      const cant = Number(catForm._cantidad) || 0;
      if (cant > 0) {
        const prefijo = (catForm._prefijo || "").trim();
        const rows = Array.from({ length: cant }, (_, i) => {
          const numero = prefijo ? `${prefijo}${String(i + 1).padStart(2, "0")}` : String(i + 1);
          const match = findMesaMatch({ numero }, loggroMesas);
          return {
            categoria_id: catId, categoria: nombre,
            numero, loggro_mesa_id: match?.loggro_id || null,
            capacidad: payload.capacidad_incluida, estado: "activa", orden: i,
          };
        });
        await supabase.from("hotel_habitaciones").insert(rows);
      }
      setExpanded(prev => ({ ...prev, [catId]: true }));
    }
    setCatForm(null);
    load();
  };

  const eliminarCategoria = async (c) => {
    const n = (habsPorCat[c.id] || []).length;
    if (!confirm(`¿Eliminar "${c.nombre}" y sus ${n} habitaciones?`)) return;
    await supabase.from("hotel_habitaciones").delete().eq("categoria_id", c.id);
    await supabase.from("hotel_categorias").delete().eq("id", c.id);
    load();
  };

  const agregarHabitacion = async (c) => {
    const numero = prompt(`Número de la nueva habitación para "${c.nombre}":`);
    if (!numero) return;
    const maxOrden = Math.max(0, ...(habsPorCat[c.id] || []).map(h => h.orden || 0));
    const match = findMesaMatch({ numero }, loggroMesas);
    await supabase.from("hotel_habitaciones").insert({
      categoria_id: c.id, categoria: c.nombre, numero,
      loggro_mesa_id: match?.loggro_id || null,
      capacidad: c.capacidad_incluida, estado: "activa", orden: maxOrden + 1,
    });
    load();
  };

  const eliminarHabitacion = async (id) => {
    if (!confirm("¿Eliminar esta habitación?")) return;
    await supabase.from("hotel_habitaciones").delete().eq("id", id);
    load();
  };

  const iniciarEdicionHab = (h) => {
    setEditingHab(h.id);
    setHabForm({ numero: h.numero, notas: h.notas || "", estado: h.estado || "activa", loggro_mesa_id: h.loggro_mesa_id || "" });
  };
  const guardarHab = async () => {
    // Si no hay mesa seleccionada manualmente, intentar auto-match por número
    let mesaId = habForm.loggro_mesa_id || null;
    if (!mesaId && habForm.numero) {
      const match = findMesaMatch({ numero: habForm.numero }, loggroMesas);
      if (match) mesaId = match.loggro_id;
    }
    await supabase.from("hotel_habitaciones").update({
      numero: habForm.numero, notas: habForm.notas || "", estado: habForm.estado, loggro_mesa_id: mesaId,
      updated_at: new Date().toISOString(),
    }).eq("id", editingHab);
    setEditingHab(null);
    load();
  };
  const cambiarEstado = async (id, estado) => {
    await supabase.from("hotel_habitaciones").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  const camasLabel = (camas) => (camas || []).map(c => `${c.cantidad} ${c.tipo}`).join(", ") || "—";

  const imprimirQRs = (habsToPrint) => {
    if (!habsToPrint || habsToPrint.length === 0) return alert("No hay habitaciones activas");
    const origin = window.location.origin;
    const sorted = habsToPrint.slice().sort((a, b) => (a.numero || "").localeCompare(b.numero || ""));
    const cards = sorted.map(h => {
      const url = `${origin}/room/${h.numero}`;
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&bgcolor=ffffff&color=000000&margin=0&data=${encodeURIComponent(url)}`;
      const fileName = `QR-Hab-${h.numero}.png`;
      return `
        <div class="card">
          <div class="num">${h.numero}</div>
          <img src="${qrSrc}" alt="QR ${h.numero}" />
          <div class="actions">
            <a class="btn" href="${qrSrc}" download="${fileName}" target="_blank">⬇ Descargar PNG</a>
            <a class="btn secondary" href="${qrSrc}" target="_blank">🔗 Abrir</a>
          </div>
          <div class="url">${url}</div>
        </div>`;
    }).join("");

    const w = window.open("", "_blank");
    if (!w) return alert("Permite las ventanas emergentes");
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>QRs Habitaciones</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  body { background: #f5f5f0; padding: 24px; }
  h1 { text-align: center; margin-bottom: 8px; color: #0D1B3E; font-size: 22px; }
  .subtitle { text-align: center; color: #666; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; max-width: 1200px; margin: 0 auto; }
  .card {
    background: #fff; border-radius: 12px; padding: 16px; text-align: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .num { font-size: 32px; font-weight: 900; color: #0D1B3E; margin-bottom: 8px; letter-spacing: 1px; }
  .card img { width: 100%; max-width: 180px; height: auto; aspect-ratio: 1/1; }
  .actions { display: flex; gap: 6px; margin-top: 12px; justify-content: center; }
  .btn {
    padding: 7px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
    background: #0D1B3E; color: #fff; text-decoration: none; display: inline-block;
  }
  .btn.secondary { background: #e5e5e0; color: #0D1B3E; }
  .url { font-family: monospace; font-size: 10px; color: #999; margin-top: 10px; word-break: break-all; }
  .downloadAll { display: block; margin: 0 auto 20px; padding: 10px 20px; border-radius: 8px; background: #0D1B3E; color: #fff; border: none; font-size: 14px; font-weight: 700; cursor: pointer; }
</style>
</head><body>
  <h1>🔲 QRs de Habitaciones</h1>
  <div class="subtitle">${sorted.length} código${sorted.length !== 1 ? "s" : ""} · Cada QR abre el portal del huésped activo en esa habitación</div>
  <button class="downloadAll" onclick="downloadAll()">⬇ Descargar TODOS los QRs</button>
  <div class="grid">${cards}</div>
  <script>
    async function downloadAll() {
      const links = document.querySelectorAll('a.btn[download]');
      for (const a of links) {
        a.click();
        await new Promise(r => setTimeout(r, 400));
      }
    }
  </script>
</body></html>`);
    w.document.close();
  };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, letterSpacing: "0.02em" }}>🚪 Habitaciones</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Inventario del hotel por categoría</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={async () => {
            const sinMapear = habs.filter(h => !h.loggro_mesa_id).length;
            if (!confirm(`Auto-mapear habitaciones a mesas de Loggro por coincidencia de nombre.\n\n${sinMapear} habitaciones sin mapear actualmente.\n\n¿Re-mapear también las ya mapeadas (puede corregir errores)?`)) return;
            const reMap = confirm("Re-mapear TODAS (sí) o solo las sin mapear (no)?");
            let matches = 0, unchanged = 0, notFound = 0;
            for (const h of habs) {
              if (h.loggro_mesa_id && !reMap) { unchanged++; continue; }
              const match = findMesaMatch(h, loggroMesas);
              if (!match) { notFound++; continue; }
              if (match.loggro_id === h.loggro_mesa_id) { unchanged++; continue; }
              await supabase.from("hotel_habitaciones").update({ loggro_mesa_id: match.loggro_id }).eq("id", h.id);
              matches++;
            }
            alert(`✓ Mapeo completado\n\n${matches} cambiadas\n${unchanged} ya correctas\n${notFound} sin mesa de Loggro con nombre coincidente`);
            load();
          }} style={{ ...BTN(B.navyLight), color: B.sky, border: `1px solid ${B.sky}44`, fontSize: 12 }}>
            🔗 Auto-mapear Loggro
          </button>
          <button onClick={() => imprimirQRs(habs.filter(h => h.estado === "activa"))} style={{ ...BTN(B.navyLight), color: B.sand, border: `1px solid ${B.sand}44`, fontSize: 12 }}>
            🖨️ Imprimir QRs
          </button>
          <button onClick={abrirNuevaCat} style={BTN(B.hotel)}>+ Nueva categoría</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total habitaciones", valor: totalHabs, color: B.hotel },
          { label: "Activas", valor: activas, color: B.success },
          { label: "Mantenimiento", valor: mantenimiento, color: B.warning },
          { label: "Categorías", valor: cats.length, color: B.sky },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navy, borderRadius: 12, padding: "16px 20px", border: `1px solid ${B.navyLight}` }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, fontFamily: "'Barlow Condensed', sans-serif", marginTop: 4 }}>{k.valor}</div>
          </div>
        ))}
      </div>

      {/* ── Modal categoría ── */}
      {catForm && (
        <div onClick={() => setCatForm(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: B.navyMid, borderRadius: 14, padding: 28, maxWidth: 560, width: "100%", border: `1px solid ${B.hotel}44`, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>
              {catForm.id ? "Editar categoría" : "Nueva categoría"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={LS}>Nombre *</label>
                <input value={catForm.nombre} onChange={e => setCF("nombre", e.target.value)} style={IS} placeholder="Ej: Suite Deluxe, Villa Frente al Mar…" autoFocus />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LS}>Capacidad incluida *</label>
                  <input type="number" min="0" value={catForm.capacidad_incluida} onChange={e => setCF("capacidad_incluida", e.target.value)} style={IS} />
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Pax cubiertos en la tarifa base</div>
                </div>
                <div>
                  <label style={LS}>Capacidad máxima *</label>
                  <input type="number" min="0" value={catForm.capacidad_maxima} onChange={e => setCF("capacidad_maxima", e.target.value)} style={IS} />
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>Pax máximo permitido</div>
                </div>
              </div>

              {/* ── Camas ── */}
              <div>
                <label style={LS}>Distribución de camas</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(catForm.camas || []).map((c, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 8, alignItems: "center" }}>
                      <input type="number" min="1" value={c.cantidad} onChange={e => setCama(i, "cantidad", e.target.value)} style={IS} placeholder="Cant." />
                      <select value={c.tipo} onChange={e => setCama(i, "tipo", e.target.value)} style={{ ...IS, cursor: "pointer" }}>
                        {TIPOS_CAMA.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button onClick={() => removeCama(i)} style={{ ...BTN(B.danger + "33"), color: B.danger, padding: "6px 10px" }}>✕</button>
                    </div>
                  ))}
                  <button onClick={addCama} style={{ ...BTN(B.navyLight), alignSelf: "flex-start", border: `1px dashed ${B.hotel}` }}>+ Agregar cama</button>
                </div>
              </div>

              <div>
                <label style={LS}>Descripción</label>
                <textarea value={catForm.descripcion} onChange={e => setCF("descripcion", e.target.value)} rows={2}
                  style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} placeholder="Vista, amenities, m², etc." />
              </div>

              {!catForm.id && (
                <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 14 }}>
                  <div style={{ fontSize: 11, color: B.hotel, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                    Crear habitaciones iniciales
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={LS}>Cantidad</label>
                      <input type="number" min="0" value={catForm._cantidad} onChange={e => setCF("_cantidad", e.target.value)} style={IS} />
                    </div>
                    <div>
                      <label style={LS}>Prefijo (opc.)</label>
                      <input value={catForm._prefijo} onChange={e => setCF("_prefijo", e.target.value)} style={IS} placeholder="Ej: S, H-1" />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
                    {catForm._prefijo ? `Se numerarán ${catForm._prefijo}01, ${catForm._prefijo}02, …` : "Se numerarán 1, 2, 3, …"} — podrás editarlas después.
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setCatForm(null)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
              <button onClick={guardarCategoria} style={BTN(B.hotel)}>{catForm.id ? "Guardar" : "Crear categoría"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal edit habitación ── */}
      {editingHab && (
        <div onClick={() => setEditingHab(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: B.navyMid, borderRadius: 14, padding: 28, maxWidth: 440, width: "100%", border: `1px solid ${B.hotel}44` }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, fontFamily: "'Barlow Condensed', sans-serif" }}>Editar habitación</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={LS}>Número</label>
                <input value={habForm.numero} onChange={e => setHabForm({ ...habForm, numero: e.target.value })} style={IS} />
              </div>
              <div>
                <label style={LS}>Estado</label>
                <select value={habForm.estado} onChange={e => setHabForm({ ...habForm, estado: e.target.value })} style={{ ...IS, cursor: "pointer" }}>
                  {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Notas</label>
                <textarea value={habForm.notas} onChange={e => setHabForm({ ...habForm, notas: e.target.value })} rows={3}
                  style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} placeholder="Detalles particulares de esta habitación…" />
              </div>
              <div>
                <label style={LS}>Mesa Loggro (para Room Service)</label>
                <select value={habForm.loggro_mesa_id || ""} onChange={e => setHabForm({ ...habForm, loggro_mesa_id: e.target.value })}
                  style={{ ...IS, cursor: "pointer" }}>
                  <option value="">— Sin asignar —</option>
                  {loggroMesas.map(m => (
                    <option key={m.loggro_id} value={m.loggro_id}>{m.nombre}</option>
                  ))}
                </select>
                {habForm.numero && (() => {
                  const match = loggroMesas.find(m => (m.nombre || "").includes(habForm.numero));
                  if (match && match.loggro_id !== habForm.loggro_mesa_id) {
                    return (
                      <button onClick={() => setHabForm({ ...habForm, loggro_mesa_id: match.loggro_id })}
                        style={{ marginTop: 6, padding: "4px 10px", fontSize: 11, borderRadius: 6, border: `1px solid ${B.sky}55`, background: `${B.sky}11`, color: B.sky, cursor: "pointer" }}>
                        💡 Auto-match con "{match.nombre}"
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setEditingHab(null)} style={{ ...BTN(B.navyLight), border: `1px solid ${B.navyLight}` }}>Cancelar</button>
              <button onClick={guardarHab} style={BTN(B.success)}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista de categorías ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>Cargando…</div>
      ) : cats.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)", background: B.navy, borderRadius: 12, border: `1px dashed ${B.navyLight}` }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚪</div>
          <div style={{ fontSize: 14, marginBottom: 4 }}>Todavía no hay categorías.</div>
          <div style={{ fontSize: 12 }}>Crea una categoría para empezar.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cats.map(c => {
            const items = habsPorCat[c.id] || [];
            const isOpen = expanded[c.id];
            return (
              <div key={c.id} style={{ background: B.navy, borderRadius: 12, border: `1px solid ${B.navyLight}`, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", background: isOpen ? `${B.hotel}11` : "transparent" }}
                  onClick={() => setExpanded(prev => ({ ...prev, [c.id]: !isOpen }))}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 18, color: B.hotel, transform: isOpen ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>▸</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <span>🚪 {items.length} hab.</span>
                        <span>👥 {c.capacidad_incluida}{c.capacidad_maxima > c.capacidad_incluida ? ` (máx. ${c.capacidad_maxima})` : ""}</span>
                        <span>🛏 {camasLabel(c.camas)}</span>
                      </div>
                      {c.descripcion && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2, fontStyle: "italic" }}>{c.descripcion}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => agregarHabitacion(c)} style={{ ...BTN(B.navyLight), fontSize: 11, padding: "6px 10px" }}>+ Hab</button>
                    <button onClick={() => abrirEditCat(c)} style={{ ...BTN(B.navyLight), fontSize: 11, padding: "6px 10px" }}>✏️</button>
                    <button onClick={() => eliminarCategoria(c)} style={{ ...BTN(B.danger + "33"), color: B.danger, fontSize: 11, padding: "6px 10px" }}>🗑</button>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ padding: "10px 20px 20px", borderTop: `1px solid ${B.navyLight}` }}>
                    {items.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 20, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin habitaciones todavía. Usa "+ Hab" para agregar.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                        {items.map(h => (
                          <div key={h.id} style={{ background: B.navyLight, borderRadius: 10, padding: "12px 14px", borderLeft: `4px solid ${estadoColor(h.estado)}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>#{h.numero}</div>
                              <div style={{ display: "flex", gap: 2 }}>
                                <button onClick={() => imprimirQRs([h])} title="Imprimir QR" style={{ background: "transparent", border: "none", color: B.sand, cursor: "pointer", fontSize: 11 }}>🔲</button>
                                <button onClick={() => iniciarEdicionHab(h)} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: 11 }}>✏️</button>
                                <button onClick={() => eliminarHabitacion(h.id)} style={{ background: "transparent", border: "none", color: B.danger, cursor: "pointer", fontSize: 11 }}>✕</button>
                              </div>
                            </div>
                            <select value={h.estado || "activa"} onChange={e => cambiarEstado(h.id, e.target.value)} onClick={e => e.stopPropagation()}
                              style={{ width: "100%", background: "transparent", border: `1px solid ${estadoColor(h.estado)}55`, color: estadoColor(h.estado), borderRadius: 6, padding: "3px 6px", fontSize: 10, outline: "none", cursor: "pointer", appearance: "none", fontWeight: 700 }}>
                              {ESTADOS.map(e => <option key={e.key} value={e.key} style={{ background: B.navy }}>{e.label}</option>)}
                            </select>
                            {h.notas && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6, fontStyle: "italic" }}>{h.notas}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
