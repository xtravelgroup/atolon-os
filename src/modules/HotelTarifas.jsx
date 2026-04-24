import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";

const B = {
  navy: "#0D1B3E", navyMid: "#172554", navyLight: "#1e293b",
  sky: "#8ECAE6", sand: "#C8B99A", white: "#F8FAFC",
  success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
  hotel: "#a78bfa",
};

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const TIPOS = [
  { k: "rack",         l: "Rack",         c: B.sky },
  { k: "corporate",    l: "Corporate",    c: B.success },
  { k: "temporada",    l: "Temporada",    c: B.warning },
  { k: "promocional",  l: "Promocional",  c: B.sand },
  { k: "grupo",        l: "Grupo",        c: B.hotel },
  { k: "agencia",      l: "Agencia",      c: "#ec4899" },
];

const fmtCOP = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

export default function HotelTarifas() {
  const [tarifas, setTarifas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [tab, setTab] = useState("activas");

  const load = useCallback(async () => {
    setLoading(true);
    const [tR, cR] = await Promise.all([
      supabase.from("hotel_tarifas").select("*").order("precio_base", { ascending: true }),
      supabase.from("hotel_categorias").select("*").order("nombre"),
    ]);
    setTarifas(tR.data || []);
    setCategorias(cR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const total = tarifas.length;
  const activas = tarifas.filter(t => t.activo).length;
  const porTipo = useMemo(() => {
    const m = {};
    for (const t of tarifas.filter(x => x.activo)) m[t.tipo] = (m[t.tipo] || 0) + 1;
    return m;
  }, [tarifas]);

  const visibles = tab === "activas" ? tarifas.filter(t => t.activo) : tarifas;
  const agrupadas = useMemo(() => {
    const m = {};
    for (const t of visibles) (m[t.tipo || "otros"] = m[t.tipo || "otros"] || []).push(t);
    return m;
  }, [visibles]);

  const editing = editId ? tarifas.find(t => t.id === editId) : null;

  return (
    <div style={{ padding: 20, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#fff", minHeight: "100vh", background: B.navy }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>💲 Tarifas</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Planes tarifarios, temporadas y políticas de precios.</div>
        </div>
        <button onClick={() => setShowNew(true)} style={BTN(B.hotel, "#fff")}>+ Nueva tarifa</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Total", v: total, c: B.sky },
          { l: "Activas", v: activas, c: B.success },
          { l: "Rack", v: porTipo.rack || 0, c: B.sky },
          { l: "Temporada", v: porTipo.temporada || 0, c: B.warning },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navyMid, padding: 12, borderRadius: 10, borderLeft: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[{ k: "activas", l: "Activas" }, { k: "todas", l: "Todas" }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={BTN(tab === t.k ? B.hotel : B.navyMid, tab === t.k ? "#fff" : "#fff")}>{t.l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
      ) : visibles.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 10 }}>
          Sin tarifas. Crea la primera.
        </div>
      ) : TIPOS.filter(t => agrupadas[t.k]?.length).map(tipo => (
        <div key={tipo.k} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: tipo.c, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {tipo.l} · {agrupadas[tipo.k].length}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
            {agrupadas[tipo.k].map(t => (
              <div key={t.id} onClick={() => setEditId(t.id)} style={{
                background: B.navyMid, padding: 14, borderRadius: 10, cursor: "pointer",
                borderLeft: `4px solid ${t.color || tipo.c}`,
                opacity: t.activo ? 1 : 0.5,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.nombre}</div>
                  {!t.activo && <span style={{ fontSize: 9, background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4 }}>Inactiva</span>}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: t.color || tipo.c, marginTop: 6 }}>
                  {fmtCOP(t.precio_base)}<span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}> / noche</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {t.categoria && <span>🛏️ {t.categoria}</span>}
                  {t.incluye_desayuno && <span>☕ Desayuno</span>}
                  {t.min_noches > 1 && <span>Min {t.min_noches}n</span>}
                </div>
                {(t.vigencia_desde || t.vigencia_hasta) && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                    {t.vigencia_desde || "—"} → {t.vigencia_hasta || "—"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {(showNew || editing) && (
        <TarifaModal
          tarifa={editing}
          categorias={categorias}
          onClose={() => { setShowNew(false); setEditId(null); }}
          onSaved={() => { setShowNew(false); setEditId(null); load(); }}
        />
      )}
    </div>
  );
}

function TarifaModal({ tarifa, categorias, onClose, onSaved }) {
  const [f, setF] = useState({
    nombre: tarifa?.nombre || "",
    tipo: tarifa?.tipo || "rack",
    categoria: tarifa?.categoria || "",
    precio_base: tarifa?.precio_base || 0,
    incluye_desayuno: !!tarifa?.incluye_desayuno,
    incluye_impuestos: tarifa?.incluye_impuestos !== false,
    vigencia_desde: tarifa?.vigencia_desde || "",
    vigencia_hasta: tarifa?.vigencia_hasta || "",
    min_noches: tarifa?.min_noches || 1,
    color: tarifa?.color || "#8ECAE6",
    activo: tarifa?.activo !== false,
    notas: tarifa?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    if (!f.nombre.trim()) { setErr("Falta nombre"); return; }
    setSaving(true); setErr("");
    const payload = {
      ...f,
      nombre: f.nombre.trim(),
      categoria: f.categoria || null,
      vigencia_desde: f.vigencia_desde || null,
      vigencia_hasta: f.vigencia_hasta || null,
      precio_base: Number(f.precio_base) || 0,
      min_noches: Number(f.min_noches) || 1,
      notas: f.notas.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const r = tarifa
      ? await supabase.from("hotel_tarifas").update(payload).eq("id", tarifa.id)
      : await supabase.from("hotel_tarifas").insert(payload);
    setSaving(false);
    if (r.error) { setErr(r.error.message); return; }
    onSaved();
  }

  async function eliminar() {
    const r = await supabase.from("hotel_tarifas").delete().eq("id", tarifa.id);
    if (r.error) { setErr(r.error.message); return; }
    onSaved();
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
        {tarifa ? "Editar tarifa" : "Nueva tarifa"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Nombre *</label>
          <input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={IS} placeholder="Rack, Corporate, Temporada Alta…" />
        </div>
        <div>
          <label style={LS}>Tipo</label>
          <select value={f.tipo} onChange={e => set("tipo", e.target.value)} style={IS}>
            {TIPOS.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Categoría (opcional)</label>
          <select value={f.categoria} onChange={e => set("categoria", e.target.value)} style={IS}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Precio base (COP/noche) *</label>
          <input type="number" value={f.precio_base} onChange={e => set("precio_base", e.target.value)} style={IS} />
        </div>
        <div>
          <label style={LS}>Mín. noches</label>
          <input type="number" min="1" value={f.min_noches} onChange={e => set("min_noches", e.target.value)} style={IS} />
        </div>
        <div>
          <label style={LS}>Vigencia desde</label>
          <input type="date" value={f.vigencia_desde} onChange={e => set("vigencia_desde", e.target.value)} style={IS} />
        </div>
        <div>
          <label style={LS}>Vigencia hasta</label>
          <input type="date" value={f.vigencia_hasta} onChange={e => set("vigencia_hasta", e.target.value)} style={IS} />
        </div>
        <div>
          <label style={LS}>Color (UI)</label>
          <input type="color" value={f.color} onChange={e => set("color", e.target.value)} style={{ ...IS, height: 38, padding: 4 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={f.incluye_desayuno} onChange={e => set("incluye_desayuno", e.target.checked)} />
            Incluye desayuno
          </label>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={f.incluye_impuestos} onChange={e => set("incluye_impuestos", e.target.checked)} />
            Incluye impuestos
          </label>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={f.activo} onChange={e => set("activo", e.target.checked)} />
            Activa
          </label>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Notas</label>
          <textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} />
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between" }}>
        <div>
          {tarifa && (!confirmDel
            ? <button onClick={() => setConfirmDel(true)} style={BTN("transparent", B.danger)}>🗑 Eliminar</button>
            : <>
                <span style={{ fontSize: 12, color: B.danger, marginRight: 8 }}>¿Seguro?</span>
                <button onClick={eliminar} style={BTN(B.danger)}>Sí</button>
                <button onClick={() => setConfirmDel(false)} style={{ ...BTN(B.navyLight), marginLeft: 6 }}>No</button>
              </>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
          <button onClick={save} disabled={saving} style={BTN(B.hotel)}>
            {saving ? "Guardando…" : (tarifa ? "Guardar" : "Crear tarifa")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: B.navyMid, borderRadius: 14, padding: 22, width: "100%", maxWidth: 720,
        marginTop: 40, boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {children}
      </div>
    </div>
  );
}
