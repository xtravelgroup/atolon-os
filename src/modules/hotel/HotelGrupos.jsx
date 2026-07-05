// HotelGrupos — Grupos de reserva con tarifas contratadas + link público.
// Admin crea el grupo (rango fechas, tarifas por categoría, cupo, contacto),
// se genera un slug único y el link para compartir. Los miembros del grupo
// entrarán a /reservar-grupo/:slug para hacer su reserva (Fase B).

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { B } from "../../brand";

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" };

const slugify = (s) => (s || "")
  .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const shortId = () => Math.random().toString(36).slice(2, 8);
const COP = (n) => `$${(Number(n) || 0).toLocaleString("es-CO")}`;
const fmtFecha = (s) => s ? new Date(s + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "";

const publicLink = (slug) => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/reservar-grupo/${slug}`;
};

export default function HotelGrupos() {
  const [grupos, setGrupos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null); // null | "new" | grupo row
  const [filtroEstado, setFiltroEstado] = useState("activo");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [gR, cR] = await Promise.all([
      supabase.from("hotel_grupos").select("*, hotel_grupos_tarifas(*)").order("created_at", { ascending: false }),
      supabase.from("hotel_categorias").select("*").order("orden"),
    ]);
    setGrupos(gR.data || []);
    setCategorias(cR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const gruposFiltrados = useMemo(() => {
    const q = search.toLowerCase().trim();
    return grupos.filter(g => {
      if (filtroEstado && g.estado !== filtroEstado) return false;
      if (!q) return true;
      return `${g.nombre} ${g.slug} ${g.contacto_nombre || ""} ${g.contacto_email || ""}`.toLowerCase().includes(q);
    });
  }, [grupos, filtroEstado, search]);

  const eliminar = async (g) => {
    if (!confirm(`Eliminar grupo "${g.nombre}"? Las estancias vinculadas quedarán sin grupo pero se preservan.`)) return;
    const { error } = await supabase.from("hotel_grupos").delete().eq("id", g.id);
    if (error) return alert("Error: " + error.message);
    load();
  };

  const cerrarGrupo = async (g) => {
    const { error } = await supabase.from("hotel_grupos").update({ estado: "cerrado" }).eq("id", g.id);
    if (error) return alert("Error: " + error.message);
    load();
  };

  const copiarLink = async (slug) => {
    try {
      await navigator.clipboard.writeText(publicLink(slug));
      alert("Link copiado al portapapeles");
    } catch {
      prompt("Copia el link:", publicLink(slug));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 24, fontWeight: 800, color: B.white }}>
            🎟️ Grupos con tarifa contratada
          </h2>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
            Crea grupos (empresa/evento) con tarifas especiales, comparte el link y ellos reservan directo.
          </div>
        </div>
        <button onClick={() => setEditando("new")} style={BTN(B.hotel)}>+ Nuevo grupo</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ ...IS, width: 160 }}>
          <option value="">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="agotado">Agotados</option>
          <option value="vencido">Vencidos</option>
          <option value="cerrado">Cerrados</option>
        </select>
        <input placeholder="🔍 Buscar…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...IS, maxWidth: 300, flex: 1, minWidth: 200 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
      ) : gruposFiltrados.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 10 }}>
          Sin grupos {filtroEstado ? `en estado "${filtroEstado}"` : ""}. Crea el primero.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {gruposFiltrados.map(g => (
            <GrupoRow key={g.id} g={g} categorias={categorias} onEdit={() => setEditando(g)} onDelete={() => eliminar(g)} onCerrar={() => cerrarGrupo(g)} onCopy={() => copiarLink(g.slug)} />
          ))}
        </div>
      )}

      {editando && (
        <GrupoModal
          grupo={editando === "new" ? null : editando}
          categorias={categorias}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); load(); }}
        />
      )}
    </div>
  );
}

function GrupoRow({ g, categorias, onEdit, onDelete, onCerrar, onCopy }) {
  const [showTarifas, setShowTarifas] = useState(false);
  const tarifas = g.hotel_grupos_tarifas || [];
  const estadoColor = {
    activo: B.success, agotado: B.warning, vencido: "#94a3b8", cerrado: "#64748b",
  }[g.estado] || B.sky;
  const cupoLibre = g.cupo_habitaciones > 0 ? (g.cupo_habitaciones - (g.habitaciones_reservadas || 0)) : null;
  const linkVencido = g.link_expira_at && new Date(g.link_expira_at) < new Date();
  return (
    <div style={{ background: B.navyMid, borderRadius: 10, padding: "14px 16px", borderLeft: `4px solid ${estadoColor}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: B.white }}>{g.nombre}</div>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: estadoColor + "33", color: estadoColor, fontWeight: 700, textTransform: "uppercase" }}>
              {g.estado}
            </span>
            {linkVencido && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: B.danger + "33", color: B.danger, fontWeight: 700 }}>
                Link vencido
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
            📅 {fmtFecha(g.fecha_desde)} → {fmtFecha(g.fecha_hasta)}
            {" · "}
            🛏️ Cupo: {g.cupo_habitaciones > 0 ? `${g.habitaciones_reservadas || 0}/${g.cupo_habitaciones}` : "sin límite"}
            {cupoLibre !== null && cupoLibre <= 0 && <span style={{ color: B.warning, marginLeft: 6 }}>agotado</span>}
          </div>
          {g.contacto_nombre && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
              👤 {g.contacto_nombre}{g.contacto_email ? ` · ${g.contacto_email}` : ""}{g.contacto_telefono ? ` · ${g.contacto_telefono}` : ""}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onCopy} style={BTN(B.sky, B.navy)}>📋 Copiar link</button>
          <button onClick={() => setShowTarifas(v => !v)} style={BTN(B.navyLight)}>
            {showTarifas ? "▲ Tarifas" : `▼ ${tarifas.length} tarifa${tarifas.length !== 1 ? "s" : ""}`}
          </button>
          <button onClick={onEdit} style={BTN(B.navyLight)}>✎ Editar</button>
          {g.estado === "activo" && (
            <button onClick={onCerrar} style={BTN(B.warning + "44", B.warning)}>Cerrar</button>
          )}
          <button onClick={onDelete} style={BTN(B.danger + "33", B.danger)}>🗑</button>
        </div>
      </div>

      <div style={{ marginTop: 8, padding: "6px 10px", background: B.navy, borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {publicLink(g.slug)}
      </div>

      {showTarifas && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.navyLight}`, display: "grid", gap: 4 }}>
          {tarifas.length === 0 ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Sin tarifas por categoría.</div>
          ) : tarifas.map(t => {
            const cat = categorias.find(c => c.id === t.categoria_id);
            return (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: B.navy, borderRadius: 6, fontSize: 12 }}>
                <span style={{ color: B.white }}>{cat?.nombre || "—"}</span>
                <span style={{ fontWeight: 800, color: t.disponible ? B.success : "rgba(255,255,255,0.3)" }}>
                  {COP(t.precio_noche)}/noche {!t.disponible && "(no disponible)"}
                </span>
              </div>
            );
          })}
          {g.incluye && (
            <div style={{ fontSize: 11, color: B.sand, marginTop: 4, padding: "4px 8px" }}>
              🎁 Incluye: {g.incluye}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GrupoModal({ grupo, categorias, onClose, onSaved }) {
  const isEdit = !!grupo;
  const [f, setF] = useState({
    nombre: grupo?.nombre || "",
    descripcion: grupo?.descripcion || "",
    contacto_nombre: grupo?.contacto_nombre || "",
    contacto_email: grupo?.contacto_email || "",
    contacto_telefono: grupo?.contacto_telefono || "",
    fecha_desde: grupo?.fecha_desde || "",
    fecha_hasta: grupo?.fecha_hasta || "",
    cupo_habitaciones: grupo?.cupo_habitaciones ?? 0,
    link_expira_at: grupo?.link_expira_at ? grupo.link_expira_at.slice(0, 10) : "",
    estado: grupo?.estado || "activo",
    moneda: grupo?.moneda || "COP",
    incluye: grupo?.incluye || "",
    notas: grupo?.notas || "",
    slug: grupo?.slug || "",
  });
  // tarifas[categoria_id] = { precio_noche, disponible }
  const [tarifas, setTarifas] = useState(() => {
    const m = {};
    (grupo?.hotel_grupos_tarifas || []).forEach(t => {
      m[t.categoria_id] = { precio_noche: t.precio_noche, disponible: t.disponible !== false, id: t.id };
    });
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const setTarifa = (catId, k, v) => setTarifas(s => ({ ...s, [catId]: { ...(s[catId] || { disponible: true }), [k]: v } }));

  const guardar = async () => {
    setErr(null);
    if (!f.nombre.trim()) { setErr("Nombre requerido"); return; }
    if (!f.fecha_desde || !f.fecha_hasta) { setErr("Rango de fechas requerido"); return; }
    if (f.fecha_hasta < f.fecha_desde) { setErr("Fecha fin no puede ser antes que fecha inicio"); return; }
    const activas = Object.entries(tarifas).filter(([_, t]) => t && Number(t.precio_noche) > 0);
    if (activas.length === 0) { setErr("Define al menos una tarifa por categoría"); return; }

    setSaving(true);
    const slug = f.slug || `${slugify(f.nombre)}-${shortId()}`;
    const payload = {
      slug,
      nombre: f.nombre.trim(),
      descripcion: f.descripcion || null,
      contacto_nombre: f.contacto_nombre || null,
      contacto_email: f.contacto_email || null,
      contacto_telefono: f.contacto_telefono || null,
      fecha_desde: f.fecha_desde,
      fecha_hasta: f.fecha_hasta,
      cupo_habitaciones: Math.max(0, parseInt(f.cupo_habitaciones, 10) || 0),
      link_expira_at: f.link_expira_at ? `${f.link_expira_at}T23:59:59` : null,
      estado: f.estado,
      moneda: f.moneda || "COP",
      incluye: f.incluye || null,
      notas: f.notas || null,
      updated_at: new Date().toISOString(),
    };

    let grupoId = grupo?.id;
    if (isEdit) {
      const { error } = await supabase.from("hotel_grupos").update(payload).eq("id", grupo.id);
      if (error) { setSaving(false); setErr(error.message); return; }
    } else {
      const { data, error } = await supabase.from("hotel_grupos").insert(payload).select("id").single();
      if (error) { setSaving(false); setErr(error.message); return; }
      grupoId = data.id;
    }

    // Sync tarifas: borrar todas y volver a insertar las activas (simple para MVP).
    await supabase.from("hotel_grupos_tarifas").delete().eq("grupo_id", grupoId);
    const rows = activas.map(([catId, t]) => ({
      grupo_id: grupoId,
      categoria_id: catId,
      precio_noche: Number(t.precio_noche),
      disponible: t.disponible !== false,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("hotel_grupos_tarifas").insert(rows);
      if (error) { setSaving(false); setErr("Grupo guardado, error en tarifas: " + error.message); return; }
    }

    setSaving(false);
    onSaved();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px", overflowY: "auto" }}>
      <div style={{ background: B.navy, borderRadius: 14, padding: 22, width: "min(680px, 100%)", border: `1px solid ${B.navyLight}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", color: B.white }}>
            {isEdit ? "Editar grupo" : "Nuevo grupo"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={LS}>Nombre del grupo *</label>
            <input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={IS} placeholder="Ej: Empresa XYZ - Convención 2026" autoFocus />
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={LS}>Fecha desde *</label>
              <input type="date" value={f.fecha_desde} onChange={e => set("fecha_desde", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Fecha hasta *</label>
              <input type="date" value={f.fecha_hasta} onChange={e => set("fecha_hasta", e.target.value)} style={IS} />
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={LS}>Cupo habitaciones (0 = sin límite)</label>
              <input type="number" min={0} value={f.cupo_habitaciones} onChange={e => set("cupo_habitaciones", e.target.value)} style={IS} />
            </div>
            <div>
              <label style={LS}>Link vence el</label>
              <input type="date" value={f.link_expira_at} onChange={e => set("link_expira_at", e.target.value)} style={IS} />
            </div>
          </div>

          <div>
            <label style={LS}>Tarifas por categoría (marca solo las disponibles)</label>
            <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
              {categorias.length === 0 ? (
                <div style={{ padding: 12, background: B.navyMid, borderRadius: 6, fontSize: 12, color: B.warning }}>
                  Sin categorías de habitación. Créalas en Hotel &gt; Categorías primero.
                </div>
              ) : categorias.map(cat => {
                const t = tarifas[cat.id] || { precio_noche: "", disponible: false };
                return (
                  <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 8, background: B.navyMid, padding: "8px 10px", borderRadius: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", minWidth: 140 }}>
                      <input type="checkbox" checked={t.disponible !== false && (Number(t.precio_noche) > 0 || tarifas[cat.id] !== undefined)}
                        onChange={e => setTarifa(cat.id, "disponible", e.target.checked)} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: B.white }}>{cat.nombre}</span>
                    </label>
                    <input type="number" min={0} value={t.precio_noche || ""}
                      onChange={e => setTarifa(cat.id, "precio_noche", e.target.value)}
                      style={{ ...IS, flex: 1 }} placeholder="Precio por noche (COP)" />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label style={LS}>Contacto del grupo</label>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
              <input value={f.contacto_nombre} onChange={e => set("contacto_nombre", e.target.value)} style={IS} placeholder="Nombre" />
              <input type="email" value={f.contacto_email} onChange={e => set("contacto_email", e.target.value)} style={IS} placeholder="Email" />
              <input value={f.contacto_telefono} onChange={e => set("contacto_telefono", e.target.value)} style={IS} placeholder="Teléfono" />
            </div>
          </div>

          <div>
            <label style={LS}>Incluye (visible en el link)</label>
            <input value={f.incluye} onChange={e => set("incluye", e.target.value)} style={IS} placeholder="Ej: desayuno, wifi, parking" />
          </div>

          <div>
            <label style={LS}>Notas internas</label>
            <textarea value={f.notas} onChange={e => set("notas", e.target.value)} rows={2}
              style={{ ...IS, resize: "vertical" }} placeholder="Notas para el equipo (no visibles al cliente)" />
          </div>

          {isEdit && (
            <div style={{ padding: "8px 12px", background: B.navyMid, borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>
              Link: {publicLink(f.slug)}
            </div>
          )}
        </div>

        {err && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: B.danger + "22", color: B.danger, borderRadius: 6, fontSize: 12 }}>{err}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${B.navyLight}` }}>
          <button onClick={onClose} disabled={saving} style={BTN(B.navyLight)}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ ...BTN(B.hotel), opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
