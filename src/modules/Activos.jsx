import { useState, useEffect, useCallback } from "react";
import { B, COP, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

const CATS = ["Todos", "Embarcacion", "Mobiliario", "Electronico", "Cocina", "Deportes", "Vehiculo"];

export default function Activos() {
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const fetchActivos = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("activos").select("*").order("nombre");
    if (!error && data) setActivos(data.map(a => ({ id: a.id, cat: a.cat, nombre: a.nombre, marca: a.marca || "", valor: a.valor || 0, compra: a.fecha_compra, estado: a.estado, area: a.area || "", deprec: a.deprec || 0, mantenimientos: a.mantenimientos || [] })));
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>Inventario de Activos</h2>
          {supabase && !loading && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>LIVE</span>}
        </div>
        <button style={{ background: B.sand, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>+ Nuevo Activo</button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Activos", val: activos.length, color: B.sky },
          { label: "Valor Total", val: COP(totalVal), color: B.sand },
          { label: "Depreciacion Acum.", val: COP(totalDeprec), color: B.danger },
          { label: "Valor Neto", val: COP(totalVal - totalDeprec), color: B.success },
        ].map(s => (
          <div key={s.label} style={{ background: B.navyMid, borderRadius: 12, padding: "16px 20px", flex: 1, borderLeft: `4px solid ${s.color}` }}>
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

      <div style={{ display: "grid", gridTemplateColumns: sel ? "1fr 320px" : "1fr", gap: 16 }}>
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${B.navyLight}` }}>
                {["ID", "Nombre", "Categoria", "Valor", "Deprec.", "Estado", "Area"].map(h => (
                  <th key={h} style={{ padding: "14px 12px", textAlign: "left", fontSize: 12, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} onClick={() => setSelected(a.id === selected ? null : a.id)}
                  style={{ borderBottom: `1px solid ${B.navyLight}`, cursor: "pointer", background: selected === a.id ? B.navyLight : "transparent" }}>
                  <td style={{ padding: "12px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{a.id}</td>
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
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>{sel.nombre}</h3>
            <div style={{ fontSize: 13, lineHeight: 2.2 }}>
              <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Marca:</span> {sel.marca}</div>
              <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Valor compra:</span> {COP(sel.valor)}</div>
              <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Fecha compra:</span> {fmtFecha(sel.compra)}</div>
              <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Depreciacion:</span> <span style={{ color: B.danger }}>{COP(sel.deprec)}</span></div>
              <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Valor neto:</span> <span style={{ color: B.success }}>{COP(sel.valor - sel.deprec)}</span></div>
              <div><span style={{ color: "rgba(255,255,255,0.5)" }}>Area:</span> {sel.area}</div>
            </div>
            <h4 style={{ fontSize: 14, color: B.sand, marginTop: 16, marginBottom: 8 }}>Mantenimientos</h4>
            {(sel.mantenimientos || []).length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin mantenimientos registrados</div>}
            {(sel.mantenimientos || []).map((m, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${B.navyLight}`, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{m.desc}</span><span style={{ color: B.sand }}>{COP(m.costo)}</span>
                </div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{m.fecha}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
