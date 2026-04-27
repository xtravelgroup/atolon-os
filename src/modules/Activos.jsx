import { useState, useEffect, useCallback } from "react";
import { B, COP, fmtFecha, todayStr } from "../brand";
import { supabase } from "../lib/supabase";

const CATS = ["Todos", "Embarcacion", "Mobiliario", "Electronico", "Cocina", "Deportes", "Vehiculo"];
const CATS_FORM = CATS.filter(c => c !== "Todos");
const ESTADOS = ["bueno", "regular", "malo"];
const AREAS = ["Beach Club", "Hotel", "Cocina", "Bar", "Eventos", "Lavandería", "Mantenimiento", "Muelle", "Oficina", "Otro"];

export default function Activos() {
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchActivos = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("activos").select("*").order("nombre");
    if (!error && data) setActivos(data.map(a => ({ id: a.id, cat: a.cat, nombre: a.nombre, marca: a.marca || "", modelo: a.modelo || "", serie: a.serie || "", valor: a.valor || 0, compra: a.fecha_compra, estado: a.estado, area: a.area || "", deprec: a.deprec || 0, notas: a.notas || "", mantenimientos: a.mantenimientos || [] })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchActivos(); }, [fetchActivos]);

  const filtered = activos.filter(a => {
    if (filter !== "Todos" && a.cat !== filter) return false;
    if (search && !a.nombre.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalVal = activos.reduce((s, a) => s + a.valor, 0);
  const totalDeprec = activos.reduce((s, a) => s + a.deprec, 0);
  const sel = activos.find(a => a.id === selected);

  const onEliminar = async (id) => {
    if (!confirm("¿Eliminar este activo? No se puede deshacer.")) return;
    await supabase.from("activos").delete().eq("id", id);
    setSelected(null);
    fetchActivos();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Inventario de Activos</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}
        >+ Nuevo Activo</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Activos", val: activos.length, color: B.sky },
          { label: "Valor Total", val: COP(totalVal), color: B.sand },
          { label: "Depreciación Acum.", val: COP(totalDeprec), color: B.danger },
          { label: "Valor Neto", val: COP(totalVal - totalDeprec), color: B.success },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {CATS.map(c => (
          <button key={c} onClick={() => setFilter(c)} style={{
            padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12,
            background: filter === c ? B.sand : B.navyMid, color: filter === c ? B.navy : B.white,
          }}>{c}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar activo..."
          style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 8, background: B.navyMid, border: `1px solid ${B.navyLight}`, color: B.white, fontSize: 13, width: 220 }} />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "rgba(255,255,255,0.3)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
          <div>Sin activos registrados</div>
          <div style={{ fontSize: 12, marginTop: 6, color: "rgba(255,255,255,0.4)" }}>Click en "+ Nuevo Activo" para agregar el primero</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: sel ? "1fr 320px" : "1fr", gap: 16 }}>
          <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                  {["Nombre", "Categoría", "Valor", "Deprec.", "Estado", "Área"].map(h => (
                    <th key={h} style={{ padding: "14px 12px", textAlign: "left", fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} onClick={() => setSelected(a.id === selected ? null : a.id)}
                    style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", background: selected === a.id ? B.navyLight : "transparent" }}>
                    <td style={{ padding: "12px", fontSize: 13, fontWeight: 600 }}>{a.nombre}</td>
                    <td style={{ padding: "12px", fontSize: 12 }}>{a.cat}</td>
                    <td style={{ padding: "12px", fontSize: 13 }}>{COP(a.valor)}</td>
                    <td style={{ padding: "12px", fontSize: 13, color: B.danger }}>{COP(a.deprec)}</td>
                    <td style={{ padding: "12px" }}>
                      <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, background: a.estado === "bueno" ? B.success + "22" : a.estado === "regular" ? B.warning + "22" : B.danger + "22", color: a.estado === "bueno" ? B.success : a.estado === "regular" ? B.warning : B.danger }}>{a.estado}</span>
                    </td>
                    <td style={{ padding: "12px", fontSize: 12 }}>{a.area}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sel && (
            <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>{sel.nombre}</h3>
                <button onClick={() => setSelected(null)} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>×</button>
              </div>
              <div style={{ fontSize: 13, lineHeight: 2 }}>
                {sel.marca && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Marca:</span> {sel.marca}</div>}
                {sel.modelo && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Modelo:</span> {sel.modelo}</div>}
                {sel.serie && <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Serie:</span> {sel.serie}</div>}
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Categoría:</span> {sel.cat}</div>
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Valor compra:</span> {COP(sel.valor)}</div>
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Fecha compra:</span> {fmtFecha(sel.compra)}</div>
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Depreciación:</span> <span style={{ color: B.danger }}>{COP(sel.deprec)}</span></div>
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Valor neto:</span> <span style={{ color: B.success }}>{COP(sel.valor - sel.deprec)}</span></div>
                <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Área:</span> {sel.area}</div>
                {sel.notas && <div style={{ fontSize: 12, marginTop: 8, color: "rgba(255,255,255,0.7)" }}>{sel.notas}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => { setEditing(sel); setShowForm(true); }}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: `1px solid ${B.sky}`, background: B.sky + "22", color: B.sky, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ Editar
                </button>
                <button onClick={() => onEliminar(sel.id)}
                  style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${B.danger}`, background: B.danger + "22", color: B.danger, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  🗑 Eliminar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <ActivoFormModal
          activo={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); fetchActivos(); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// MODAL: Crear / Editar activo
// ────────────────────────────────────────────────────────────────────────
function ActivoFormModal({ activo, onClose, onSaved }) {
  const isEdit = !!activo;
  const [form, setForm] = useState({
    cat: activo?.cat || "Mobiliario",
    nombre: activo?.nombre || "",
    marca: activo?.marca || "",
    modelo: activo?.modelo || "",
    serie: activo?.serie || "",
    valor: activo?.valor || 0,
    fecha_compra: activo?.compra || todayStr(),
    estado: activo?.estado || "bueno",
    area: activo?.area || "Beach Club",
    deprec: activo?.deprec || 0,
    notas: activo?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    setError("");
    if (!form.nombre.trim()) return setError("El nombre es obligatorio");
    if (!form.cat) return setError("Selecciona una categoría");
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("activos").update({
          ...form,
          valor: Number(form.valor) || 0,
          deprec: Number(form.deprec) || 0,
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

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, zIndex: 1300, overflowY: "auto" }}>
      <div style={{ background: B.navyMid, borderRadius: 12, width: "100%", maxWidth: 640, padding: 24, marginTop: 30, border: `1px solid ${B.navyLight}`, color: B.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{isEdit ? "Editar activo" : "Nuevo activo"}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LBL}>Nombre *</label>
            <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={INP} placeholder="Ej: Mesa de madera comedor 8 puestos" autoFocus />
          </div>
          <div>
            <label style={LBL}>Categoría *</label>
            <select value={form.cat} onChange={e => set("cat", e.target.value)} style={INP}>
              {CATS_FORM.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Área</label>
            <select value={form.area} onChange={e => set("area", e.target.value)} style={INP}>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
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
            <label style={LBL}>Valor compra (COP)</label>
            <input type="number" value={form.valor} onChange={e => set("valor", e.target.value)} style={INP} placeholder="$0" />
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
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={3} style={{ ...INP, resize: "vertical", fontFamily: "inherit" }} placeholder="Observaciones, ubicación específica, etc." />
          </div>
        </div>

        {error && <div style={{ marginTop: 12, padding: 10, background: B.danger + "22", color: "#fca5a5", borderRadius: 6, fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${B.navyLight}`, background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: B.sand, color: B.navy, fontSize: 13, cursor: "pointer", fontWeight: 800, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : isEdit ? "💾 Guardar cambios" : "+ Crear activo"}
          </button>
        </div>
      </div>
    </div>
  );
}

const INP = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LBL = { fontSize: 11, color: B.sand, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 };
