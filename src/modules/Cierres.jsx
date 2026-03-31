import { useState, useEffect, useCallback } from "react";
import { B, SALIDAS, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

export default function Cierres() {
  const [cierres, setCierres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo: "total", fecha: "", motivo: "", salidas: [], mensaje: "", reubicar: true });

  const fetchCierres = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("cierres").select("*").order("fecha", { ascending: false });
    if (!error && data) setCierres(data.map(c => ({ id: c.id, tipo: c.tipo, fecha: c.fecha, motivo: c.motivo, salidas: c.salidas || [], activo: c.activo, creado: c.creado_por || "Admin", mensaje: c.mensaje_publico || "" })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchCierres(); }, [fetchCierres]);

  const toggle = async (id) => {
    const cierre = cierres.find(c => c.id === id);
    if (supabase) {
      await supabase.from("cierres").update({ activo: !cierre.activo }).eq("id", id);
      fetchCierres();
    } else {
      setCierres(p => p.map(c => c.id === id ? { ...c, activo: !c.activo } : c));
    }
  };

  const addCierre = async () => {
    if (!form.fecha || !form.motivo) return;
    const newC = { id: `C-${Date.now()}`, tipo: form.tipo, fecha: form.fecha, salidas: form.tipo === "total" ? SALIDAS.map(s => s.id) : form.salidas, motivo: form.motivo, mensaje_publico: form.mensaje, reubicar: form.reubicar, activo: true, creado_por: "Admin" };
    if (supabase) {
      await supabase.from("cierres").insert(newC);
      fetchCierres();
    } else {
      setCierres(p => [...p, { ...newC, creado: "Admin" }]);
    }
    setForm({ tipo: "total", fecha: "", motivo: "", salidas: [], mensaje: "", reubicar: true });
    setShowForm(false);
  };

  const toggleSalida = sid => {
    setForm(f => ({ ...f, salidas: f.salidas.includes(sid) ? f.salidas.filter(s => s !== sid) : [...f.salidas, sid] }));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Gestion de Cierres</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        <button onClick={() => setShowForm(true)} style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>
          + Nuevo Cierre
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Activos", val: cierres.filter(c => c.activo).length, color: B.danger },
          { label: "Proximos 7 dias", val: cierres.filter(c => c.activo).length, color: B.warning },
          { label: "Total registrados", val: cierres.length, color: B.sky },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", flex: 1, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
              {["ID", "Tipo", "Fecha", "Motivo", "Salidas", "Estado", "Acciones"].map(h => (
                <th key={h} style={{ padding: "14px 16px", textAlign: "left", fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cierres.map(c => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                <td style={{ padding: "14px 16px", fontSize: 13 }}>{c.id}</td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: c.tipo === "total" ? B.danger : B.warning, color: B.white }}>{c.tipo === "total" ? "Total" : "Parcial"}</span>
                </td>
                <td style={{ padding: "14px 16px", fontSize: 13 }}>{fmtFecha(c.fecha)}</td>
                <td style={{ padding: "14px 16px", fontSize: 13 }}>{c.motivo}</td>
                <td style={{ padding: "14px 16px", fontSize: 13 }}>{c.salidas.join(", ")}</td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: c.activo ? B.success : B.navyLight }}>{c.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <button onClick={() => toggle(c.id)} style={{ background: B.navyLight, color: B.white, border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    {c.activo ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 480 }}>
            <h3 style={{ marginBottom: 20, fontSize: 20 }}>Nuevo Cierre</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 4 }}>Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white }}>
                  <option value="total">Total (todo el dia)</option>
                  <option value="parcial">Parcial (salidas especificas)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 4 }}>Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white }} />
              </div>
              {form.tipo === "parcial" && (
                <div>
                  <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 4 }}>Salidas afectadas</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {SALIDAS.map(s => (
                      <div key={s.id} onClick={() => toggleSalida(s.id)} style={{
                        padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                        background: form.salidas.includes(s.id) ? B.sand : B.navy,
                        color: form.salidas.includes(s.id) ? B.navy : B.white,
                        border: `1px solid ${B.navyLight}`,
                      }}>{s.id} ({s.hora})</div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 4 }}>Motivo</label>
                <input value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Motivo del cierre" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: B.sand, display: "block", marginBottom: 4 }}>Mensaje publico (opcional)</label>
                <textarea value={form.mensaje} onChange={e => setForm(f => ({ ...f, mensaje: e.target.value }))} rows={2} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: B.white, resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button onClick={addCierre} style={{ flex: 1, background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "12px", fontWeight: 700, cursor: "pointer" }}>Crear Cierre</button>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, background: B.navyLight, color: B.white, border: "none", borderRadius: 8, padding: "12px", cursor: "pointer" }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
