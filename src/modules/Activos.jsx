import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";

const CATS_FORM = ["Embarcacion", "Mobiliario", "Electronico", "Cocina", "Deportes", "Vehiculo"];
const ESTADOS = ["bueno", "regular", "malo"];
const PROPIETARIOS = ["Naturalle Hotel", "Interop Colombia"];

export default function Activos() {
  const [activos, setActivos] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroArea, setFiltroArea] = useState("Todas");
  const [filtroCat, setFiltroCat] = useState("Todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [vista, setVista] = useState("areas"); // "areas" | "lista"

  const fetchAll = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [aR, arR] = await Promise.all([
      supabase.from("activos").select("*").order("nombre"),
      supabase.from("activos_areas").select("*").eq("activa", true).order("orden"),
    ]);
    setActivos((aR.data || []).map(a => ({
      id: a.id, cat: a.cat, nombre: a.nombre, marca: a.marca || "", modelo: a.modelo || "",
      serie: a.serie || "", valor: a.valor || 0, cantidad: Number(a.cantidad) || 1,
      compra: a.fecha_compra, estado: a.estado || "bueno",
      area: a.area || "", ubicacion: a.ubicacion || "", deprec: a.deprec || 0,
      propietario: a.propietario || "",
      notas: a.notas || "", foto_url: a.foto_url || null, fotos_urls: a.fotos_urls || [],
      mantenimientos: a.mantenimientos || [],
    })));
    setAreas(arR.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalUnits = activos.reduce((s, a) => s + (a.cantidad || 1), 0);
  const totalVal = activos.reduce((s, a) => s + a.valor * (a.cantidad || 1), 0);
  const totalDeprec = activos.reduce((s, a) => s + a.deprec * (a.cantidad || 1), 0);

  // Items filtrados (por área, categoría, búsqueda)
  const filtered = useMemo(() => {
    return activos.filter(a => {
      if (filtroArea !== "Todas" && a.area !== filtroArea) return false;
      if (filtroCat !== "Todos" && a.cat !== filtroCat) return false;
      if (search && !`${a.nombre} ${a.marca} ${a.ubicacion}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [activos, filtroArea, filtroCat, search]);

  // Agrupado por área (para vista "areas")
  const porArea = useMemo(() => {
    const groups = {};
    areas.forEach(a => { groups[a.nombre] = { area: a, items: [] }; });
    groups["__sin_area"] = { area: { nombre: "Sin asignar", color: "#94a3b8", icono: "❓" }, items: [] };
    filtered.forEach(act => {
      const k = (act.area && groups[act.area]) ? act.area : "__sin_area";
      groups[k].items.push(act);
    });
    return Object.values(groups).filter(g => g.items.length > 0);
  }, [filtered, areas]);

  const sel = activos.find(a => a.id === selected);

  const onEliminar = async (id) => {
    if (!confirm("¿Eliminar este activo? No se puede deshacer.")) return;
    await supabase.from("activos").delete().eq("id", id);
    setSelected(null);
    fetchAll();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Inventario de Activos</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowAreaForm(true)}
            style={{ background: "transparent", border: `1px solid ${B.sky}`, color: B.sky, borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            + Área
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>
            + Nuevo Activo
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Tipos de Activo", val: activos.length, color: B.sky },
          { label: "Unidades Totales", val: totalUnits, color: "#a78bfa" },
          { label: "Valor Total", val: COP(totalVal), color: B.sand },
          { label: "Valor Neto", val: COP(totalVal - totalDeprec), color: B.success },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs vista + filtros */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", background: B.navyMid, borderRadius: 8, padding: 3 }}>
          <button onClick={() => setVista("areas")}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: vista === "areas" ? B.sand : "transparent", color: vista === "areas" ? B.navy : "rgba(255,255,255,0.7)" }}>
            🗂 Por área
          </button>
          <button onClick={() => setVista("lista")}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
              background: vista === "lista" ? B.sand : "transparent", color: vista === "lista" ? B.navy : "rgba(255,255,255,0.7)" }}>
            📋 Lista
          </button>
        </div>
        <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13 }}>
          <option value="Todas">Todas las áreas</option>
          {areas.map(a => <option key={a.id} value={a.nombre}>{a.icono} {a.nombre}</option>)}
        </select>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13 }}>
          <option value="Todos">Todas las categorías</option>
          {CATS_FORM.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre, marca, ubicación..."
          style={{ flex: 1, minWidth: 200, padding: "8px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div>{activos.length === 0 ? "Sin activos registrados" : "Sin activos con esos filtros"}</div>
          {activos.length === 0 && <div style={{ fontSize: 12, marginTop: 6, color: "rgba(255,255,255,0.4)" }}>Click en "+ Nuevo Activo" para agregar el primero</div>}
        </div>
      ) : vista === "areas" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {porArea.map(g => (
            <div key={g.area.nombre} style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", borderLeft: `4px solid ${g.area.color || B.sky}` }}>
              <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: B.navy, borderBottom: `1px solid ${B.navyLight}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{g.area.icono}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: g.area.color || B.sand }}>{g.area.nombre}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>· {g.items.length} activo{g.items.length !== 1 ? "s" : ""}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: B.sand }}>{COP(g.items.reduce((s, x) => s + x.valor * (x.cantidad || 1), 0))}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, padding: 12 }}>
                {g.items.map(a => <ActivoCard key={a.id} a={a} selected={selected === a.id} onClick={() => setSelected(a.id === selected ? null : a.id)} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                {["📷", "Nombre", "Cant.", "Categoría", "Área", "Ubicación", "Valor Total", "Estado"].map(h => (
                  <th key={h} style={{ padding: "12px", textAlign: "left", fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} onClick={() => setSelected(a.id === selected ? null : a.id)}
                  style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", background: selected === a.id ? B.navyLight : "transparent" }}>
                  <td style={{ padding: "8px 12px" }}>
                    {a.foto_url
                      ? <img src={a.foto_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />
                      : <div style={{ width: 36, height: 36, borderRadius: 6, background: B.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "rgba(255,255,255,0.3)" }}>📦</div>
                    }
                  </td>
                  <td style={{ padding: "12px", fontSize: 13, fontWeight: 600 }}>{a.nombre}</td>
                  <td style={{ padding: "12px", fontSize: 13, fontWeight: 700, color: (a.cantidad || 1) > 1 ? "#a78bfa" : "rgba(255,255,255,0.7)" }}>×{a.cantidad || 1}</td>
                  <td style={{ padding: "12px", fontSize: 12 }}>{a.cat}</td>
                  <td style={{ padding: "12px", fontSize: 12 }}>{a.area || "—"}</td>
                  <td style={{ padding: "12px", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{a.ubicacion || "—"}</td>
                  <td style={{ padding: "12px", fontSize: 13 }}>{COP(a.valor * (a.cantidad || 1))}</td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, background: a.estado === "bueno" ? B.success + "22" : a.estado === "regular" ? B.warning + "22" : B.danger + "22", color: a.estado === "bueno" ? B.success : a.estado === "regular" ? B.warning : B.danger }}>{a.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Panel detalle */}
      {sel && <DetallePanel activo={sel} areas={areas} onClose={() => setSelected(null)}
        onEdit={() => { setEditing(sel); setShowForm(true); }}
        onDelete={() => onEliminar(sel.id)} />}

      {showForm && <ActivoFormModal activo={editing} areas={areas}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSaved={() => { setShowForm(false); setEditing(null); fetchAll(); }} />}

      {showAreaForm && <AreaFormModal areas={areas}
        onClose={() => setShowAreaForm(false)}
        onSaved={() => { setShowAreaForm(false); fetchAll(); }} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Card de activo (vista por áreas)
// ────────────────────────────────────────────────────────────────────────
function ActivoCard({ a, selected, onClick }) {
  const estadoColor = a.estado === "bueno" ? B.success : a.estado === "regular" ? B.warning : B.danger;
  return (
    <div onClick={onClick}
      style={{
        background: selected ? B.navyLight : B.navy,
        borderRadius: 10, overflow: "hidden", cursor: "pointer",
        border: `1px solid ${selected ? B.sand : B.navyLight}`,
      }}>
      {a.foto_url ? (
        <img src={a.foto_url} alt="" style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: 120, background: B.navyMid, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "rgba(255,255,255,0.2)" }}>📦</div>
      )}
      <div style={{ padding: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nombre}</span>
          {(a.cantidad || 1) > 1 && (
            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: "#a78bfa22", color: "#a78bfa", fontWeight: 800, whiteSpace: "nowrap" }}>×{a.cantidad}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>{a.cat}{a.marca ? ` · ${a.marca}` : ""}</div>
        {a.propietario && <div style={{ fontSize: 10, color: B.sand, marginBottom: 2 }}>🏛 {a.propietario}</div>}
        {a.ubicacion && <div style={{ fontSize: 11, color: B.sky }}>📍 {a.ubicacion}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: B.sand }}>
            {COP(a.valor * (a.cantidad || 1))}
            {(a.cantidad || 1) > 1 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}> ({COP(a.valor)} c/u)</span>}
          </span>
          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 8, background: estadoColor + "22", color: estadoColor }}>{a.estado}</span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Panel detalle (lateral o modal)
// ────────────────────────────────────────────────────────────────────────
function DetallePanel({ activo, onClose, onEdit, onDelete }) {
  const fotos = [activo.foto_url, ...(activo.fotos_urls || [])].filter(Boolean);
  const [fotoIdx, setFotoIdx] = useState(0);

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1300 }}>
      <div style={{ background: B.navyMid, borderRadius: 12, width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto", color: B.white, border: `1px solid ${B.navyLight}` }}>
        {/* Galería */}
        {fotos.length > 0 ? (
          <div style={{ position: "relative" }}>
            <img src={fotos[fotoIdx]} alt="" style={{ width: "100%", height: 280, objectFit: "cover", display: "block" }} />
            {fotos.length > 1 && (
              <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4 }}>
                {fotos.map((_, i) => (
                  <button key={i} onClick={() => setFotoIdx(i)}
                    style={{ width: 8, height: 8, borderRadius: 4, border: "none", background: fotoIdx === i ? B.sand : "rgba(255,255,255,0.4)", cursor: "pointer" }} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: "100%", height: 120, background: B.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: "rgba(255,255,255,0.2)" }}>📦</div>
        )}

        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{activo.nombre}</h3>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>

          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1, background: B.navy, padding: "8px 10px", borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Cantidad</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: (activo.cantidad || 1) > 1 ? "#a78bfa" : "#fff" }}>×{activo.cantidad || 1}</div>
              </div>
              <div style={{ flex: 1, background: B.navy, padding: "8px 10px", borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Valor total</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: B.sand }}>{COP(activo.valor * (activo.cantidad || 1))}</div>
              </div>
            </div>
            {activo.propietario && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>🏛 Propiedad de:</span> <strong style={{ color: B.sand }}>{activo.propietario}</strong></div>}
            {activo.area && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Área:</span> <strong>{activo.area}</strong></div>}
            {activo.ubicacion && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>📍 Ubicación:</span> <strong style={{ color: B.sky }}>{activo.ubicacion}</strong></div>}
            <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Categoría:</span> {activo.cat}</div>
            {activo.marca && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Marca:</span> {activo.marca}</div>}
            {activo.modelo && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Modelo:</span> {activo.modelo}</div>}
            {activo.serie && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Serie:</span> {activo.serie}</div>}
            <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Estado:</span> {activo.estado}</div>
            <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Valor unitario:</span> {COP(activo.valor)}</div>
            {activo.compra && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Fecha compra:</span> {fmtFecha(activo.compra)}</div>}
            <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Depreciación c/u:</span> <span style={{ color: B.danger }}>{COP(activo.deprec)}</span></div>
            <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Valor neto:</span> <span style={{ color: B.success }}>{COP((activo.valor - activo.deprec) * (activo.cantidad || 1))}</span></div>
            {activo.notas && <div style={{ marginTop: 10, padding: 10, background: B.navy, borderRadius: 6, fontSize: 12 }}>{activo.notas}</div>}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={onEdit}
              style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✏️ Editar</button>
            <button onClick={onDelete}
              style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${B.danger}`, background: B.danger + "22", color: B.danger, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🗑</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Form: crear / editar activo (con foto)
// ────────────────────────────────────────────────────────────────────────
function ActivoFormModal({ activo, areas, onClose, onSaved }) {
  const isEdit = !!activo;
  const [form, setForm] = useState({
    cat: activo?.cat || "Mobiliario",
    nombre: activo?.nombre || "",
    marca: activo?.marca || "",
    modelo: activo?.modelo || "",
    serie: activo?.serie || "",
    cantidad: activo?.cantidad || 1,
    valor: activo?.valor || 0,
    fecha_compra: activo?.compra || todayStr(),
    estado: activo?.estado || "bueno",
    area: activo?.area || (areas[0]?.nombre || ""),
    ubicacion: activo?.ubicacion || "",
    propietario: activo?.propietario || PROPIETARIOS[0],
    deprec: activo?.deprec || 0,
    notas: activo?.notas || "",
    foto_url: activo?.foto_url || null,
    fotos_urls: activo?.fotos_urls || [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputCam = useRef(null);
  const fileInputGal = useRef(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const subirFoto = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${activo?.id || "new"}_${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage.from("activos").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("activos").getPublicUrl(path);
      const url = pub.publicUrl;

      // Si no hay foto principal, esta será la principal. Sino, va al array
      if (!form.foto_url) {
        set("foto_url", url);
      } else {
        set("fotos_urls", [...form.fotos_urls, url]);
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setUploading(false);
    }
  };

  const quitarFoto = (url, esPrincipal) => {
    if (esPrincipal) {
      // Promover la primera secundaria a principal
      const next = form.fotos_urls[0] || null;
      const restantes = form.fotos_urls.slice(1);
      set("foto_url", next);
      set("fotos_urls", restantes);
    } else {
      set("fotos_urls", form.fotos_urls.filter(u => u !== url));
    }
  };

  const guardar = async () => {
    setError("");
    if (!form.nombre.trim()) return setError("El nombre es obligatorio");
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("activos").update({
          ...form,
          valor: Number(form.valor) || 0,
          deprec: Number(form.deprec) || 0,
          cantidad: Math.max(1, Number(form.cantidad) || 1),
          updated_at: new Date().toISOString(),
        }).eq("id", activo.id);
        if (error) throw error;
      } else {
        const id = `ACT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const { error } = await supabase.from("activos").insert({
          id,
          ...form,
          valor: Number(form.valor) || 0,
          deprec: Number(form.deprec) || 0,
          cantidad: Math.max(1, Number(form.cantidad) || 1),
          mantenimientos: [],
        });
        if (error) throw error;
      }
      onSaved();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const todasFotos = [form.foto_url, ...form.fotos_urls].filter(Boolean);

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 1300, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 12, width: "100%", maxWidth: 720, padding: 24, marginTop: 30, border: `1px solid ${B.navyLight}`, color: B.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{isEdit ? "Editar activo" : "Nuevo activo"}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        {/* Fotos */}
        <div style={{ marginBottom: 16 }}>
          <label style={LBL}>Fotos</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {todasFotos.map((url, i) => (
              <div key={i} style={{ position: "relative", width: 90, height: 90, borderRadius: 8, overflow: "hidden", border: i === 0 ? `2px solid ${B.sand}` : `1px solid ${B.navyLight}` }}>
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={() => quitarFoto(url, i === 0)}
                  style={{ position: "absolute", top: 2, right: 2, width: 22, height: 22, borderRadius: 11, border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                {i === 0 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: B.sand + "DD", color: B.navy, fontSize: 9, padding: "2px 4px", textAlign: "center", fontWeight: 700 }}>PRINCIPAL</div>}
              </div>
            ))}
            {todasFotos.length === 0 && (
              <div style={{ width: 90, height: 90, borderRadius: 8, background: B.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "rgba(255,255,255,0.2)" }}>📷</div>
            )}
          </div>
          <input ref={fileInputCam} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f); e.target.value = ""; }} />
          <input ref={fileInputGal} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={e => { const fs = Array.from(e.target.files || []); fs.forEach(subirFoto); e.target.value = ""; }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => fileInputCam.current?.click()} disabled={uploading}
              style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: uploading ? 0.5 : 1 }}>
              📷 Tomar foto
            </button>
            <button onClick={() => fileInputGal.current?.click()} disabled={uploading}
              style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${B.sand}`, background: B.sand + "22", color: B.sand, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: uploading ? 0.5 : 1 }}>
              📁 {uploading ? "Subiendo…" : "Galería / Archivos"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Nombre *</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={INP} placeholder="Ej: Mesa de madera comedor 8 puestos" autoFocus />
          </div>
          <div>
            <label style={LBL}>Categoría</label>
            <select value={form.cat} onChange={e => set("cat", e.target.value)} style={INP}>
              {CATS_FORM.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Área</label>
            <select value={form.area} onChange={e => set("area", e.target.value)} style={INP}>
              <option value="">— Sin asignar —</option>
              {areas.map(a => <option key={a.id} value={a.nombre}>{a.icono} {a.nombre}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>📍 Ubicación específica</label>
            <input value={form.ubicacion} onChange={e => set("ubicacion", e.target.value)} style={INP}
              placeholder="Ej: Habitación 5, Cuarto de máquinas, Bar exterior, Bodega norte" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>🏛 Propiedad de</label>
            <input list="propietarios-list" value={form.propietario} onChange={e => set("propietario", e.target.value)} style={INP}
              placeholder="Naturalle Hotel / Interop Colombia / otro..." />
            <datalist id="propietarios-list">
              {PROPIETARIOS.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div>
            <label style={LBL}>Marca</label>
            <input value={form.marca} onChange={e => set("marca", e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Modelo</label>
            <input value={form.modelo} onChange={e => set("modelo", e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Serie</label>
            <input value={form.serie} onChange={e => set("serie", e.target.value)} style={INP} />
          </div>
          <div>
            <label style={LBL}>Estado</label>
            <select value={form.estado} onChange={e => set("estado", e.target.value)} style={INP}>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Cantidad de unidades</label>
            <input type="number" min={1} value={form.cantidad} onChange={e => set("cantidad", Math.max(1, Number(e.target.value) || 1))} style={INP} />
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Ej: 50 sillas iguales → cantidad: 50</div>
          </div>
          <div>
            <label style={LBL}>Valor unitario (COP)</label>
            <input type="number" value={form.valor} onChange={e => set("valor", e.target.value)} style={INP} placeholder="$0" />
            {form.cantidad > 1 && Number(form.valor) > 0 && (
              <div style={{ fontSize: 10, color: B.sand, marginTop: 3 }}>Total: {COP(Number(form.valor) * Number(form.cantidad))}</div>
            )}
          </div>
          <div>
            <label style={LBL}>Fecha compra</label>
            <input type="date" value={form.fecha_compra} onChange={e => set("fecha_compra", e.target.value)} style={INP} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Depreciación acumulada (COP)</label>
            <input type="number" value={form.deprec} onChange={e => set("deprec", e.target.value)} style={INP} placeholder="$0" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Notas</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={3}
              style={{ ...INP, resize: "vertical", fontFamily: "inherit" }} placeholder="Observaciones, número de serie adicional, observaciones de instalación, etc." />
          </div>
        </div>

        {error && <div style={{ marginTop: 12, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={saving || uploading}
            style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 13, cursor: "pointer", fontWeight: 800, opacity: (saving || uploading) ? 0.6 : 1 }}>
            {saving ? "Guardando…" : isEdit ? "💾 Guardar cambios" : "+ Crear activo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Form: crear / editar área
// ────────────────────────────────────────────────────────────────────────
function AreaFormModal({ areas, onClose, onSaved }) {
  const [nombre, setNombre] = useState("");
  const [icono, setIcono] = useState("📍");
  const [color, setColor] = useState("#8ECAE6");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError("");
    if (!nombre.trim()) return setError("El nombre es obligatorio");
    if (areas.some(a => a.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
      return setError("Ya existe un área con ese nombre");
    }
    setSaving(true);
    try {
      const id = `AREA-${nombre.toUpperCase().replace(/[^A-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 30)}-${Date.now() % 10000}`;
      const { error } = await supabase.from("activos_areas").insert({
        id, nombre: nombre.trim(), icono, color,
        orden: (areas.length + 1) * 10,
      });
      if (error) throw error;
      onSaved();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 1310, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 12, width: "100%", maxWidth: 460, padding: 24, marginTop: 60, border: `1px solid ${B.navyLight}`, color: B.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>+ Nueva área</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div>
          <label style={LBL}>Nombre *</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} style={INP} placeholder="Ej: Spa, Piscina, Gym" autoFocus />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div>
            <label style={LBL}>Icono (emoji)</label>
            <input value={icono} onChange={e => setIcono(e.target.value)} style={{ ...INP, fontSize: 18 }} placeholder="📍" />
          </div>
          <div>
            <label style={LBL}>Color</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ ...INP, height: 38, padding: 4 }} />
          </div>
        </div>

        <div style={{ marginTop: 14, padding: 10, background: B.navy, borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
          Vista previa: <span style={{ color: color, fontWeight: 700 }}>{icono} {nombre || "Nombre"}</span>
        </div>

        {error && <div style={{ marginTop: 12, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={saving}
            style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 13, cursor: "pointer", fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "+ Crear área"}
          </button>
        </div>
      </div>
    </div>
  );
}

const INP = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LBL = { fontSize: 11, color: B.sand, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };
