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

const DOC_TIPOS = ["CC", "PS", "CE", "TI", "NIT"];
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—";
const nombreCompleto = (h) => `${h.nombre || ""} ${h.apellido || ""}`.trim() || "(sin nombre)";
const inicial = (h) => (h.nombre?.[0] || h.apellido?.[0] || "?").toUpperCase();

export default function HotelHuespedes() {
  const [huespedes, setHuespedes] = useState([]);
  const [estancias, setEstancias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos|vip|inhouse|blacklist
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [hR, eR] = await Promise.all([
      supabase.from("hotel_huespedes").select("*").order("created_at", { ascending: false }),
      supabase.from("hotel_estancias").select("id,huesped_id,codigo,check_in_at,check_out_at,estado,total"),
    ]);
    setHuespedes(hR.data || []);
    setEstancias(eR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const estanciasPorHuesped = useMemo(() => {
    const m = {};
    for (const e of estancias) (m[e.huesped_id] = m[e.huesped_id] || []).push(e);
    return m;
  }, [estancias]);

  const inhouseIds = useMemo(() => new Set(estancias.filter(e => e.estado === "in_house").map(e => e.huesped_id)), [estancias]);

  const total = huespedes.length;
  const vip = huespedes.filter(h => h.vip).length;
  const inhouse = inhouseIds.size;
  const mesActual = new Date().toISOString().slice(0, 7);
  const nuevosMes = huespedes.filter(h => (h.created_at || "").startsWith(mesActual)).length;

  const visibles = useMemo(() => {
    let list = huespedes;
    if (filtro === "vip") list = list.filter(h => h.vip);
    if (filtro === "inhouse") list = list.filter(h => inhouseIds.has(h.id));
    if (filtro === "blacklist") list = list.filter(h => h.blacklist);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(h =>
        nombreCompleto(h).toLowerCase().includes(q) ||
        (h.email || "").toLowerCase().includes(q) ||
        (h.documento || "").toLowerCase().includes(q) ||
        (h.telefono || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [huespedes, filtro, search, inhouseIds]);

  const editing = editId ? huespedes.find(h => h.id === editId) : null;
  const opened = openId ? huespedes.find(h => h.id === openId) : null;

  return (
    <div style={{ padding: 20, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#fff", minHeight: "100vh", background: B.navy }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>👥 Huéspedes</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Base de datos de huéspedes y historial de estancias.</div>
        </div>
        <button onClick={() => setShowNew(true)} style={BTN(B.hotel)}>+ Nuevo huésped</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Total", v: total, c: B.sky },
          { l: "In-house", v: inhouse, c: B.success },
          { l: "VIP", v: vip, c: B.warning },
          { l: "Nuevos (mes)", v: nuevosMes, c: B.sand },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navyMid, padding: 12, borderRadius: 10, borderLeft: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { k: "todos", l: "Todos" },
          { k: "inhouse", l: "In-house" },
          { k: "vip", l: "VIP" },
          { k: "blacklist", l: "Bloqueados" },
        ].map(t => (
          <button key={t.k} onClick={() => setFiltro(t.k)}
            style={BTN(filtro === t.k ? B.hotel : B.navyMid)}>{t.l}</button>
        ))}
        <input placeholder="Buscar por nombre, documento, email…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...IS, maxWidth: 300, flex: 1, minWidth: 200 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
      ) : visibles.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 10 }}>
          Sin huéspedes que coincidan.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
          {visibles.map(h => {
            const est = estanciasPorHuesped[h.id] || [];
            const enCasa = inhouseIds.has(h.id);
            return (
              <div key={h.id} onClick={() => setOpenId(h.id)} style={{
                background: B.navyMid, padding: 14, borderRadius: 10, cursor: "pointer",
                borderLeft: `3px solid ${h.blacklist ? B.danger : h.vip ? B.warning : enCasa ? B.success : "rgba(255,255,255,0.1)"}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: "50%",
                    background: h.vip ? B.warning : B.hotel, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 18,
                  }}>{inicial(h)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {nombreCompleto(h)}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {h.documento_tipo ? `${h.documento_tipo} ${h.documento || "—"}` : (h.email || h.telefono || "—")}
                    </div>
                  </div>
                  {h.vip && <span style={{ fontSize: 16 }}>⭐</span>}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.55)", flexWrap: "wrap" }}>
                  <span>🛏️ {est.length} estancia{est.length !== 1 ? "s" : ""}</span>
                  {enCasa && <span style={{ color: B.success, fontWeight: 700 }}>● In-house</span>}
                  {h.blacklist && <span style={{ color: B.danger, fontWeight: 700 }}>⛔ Bloqueado</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showNew || editing) && (
        <HuespedModal
          huesped={editing}
          onClose={() => { setShowNew(false); setEditId(null); }}
          onSaved={() => { setShowNew(false); setEditId(null); load(); }}
        />
      )}
      {opened && (
        <DetalleModal
          huesped={opened}
          estancias={estanciasPorHuesped[opened.id] || []}
          onClose={() => setOpenId(null)}
          onEdit={() => { setOpenId(null); setEditId(opened.id); }}
        />
      )}
    </div>
  );
}

function HuespedModal({ huesped, onClose, onSaved }) {
  const [f, setF] = useState({
    nombre: huesped?.nombre || "",
    apellido: huesped?.apellido || "",
    documento_tipo: huesped?.documento_tipo || "CC",
    documento: huesped?.documento || "",
    email: huesped?.email || "",
    telefono: huesped?.telefono || "",
    fecha_nacimiento: huesped?.fecha_nacimiento || "",
    nacionalidad: huesped?.nacionalidad || "",
    ciudad: huesped?.ciudad || "",
    direccion: huesped?.direccion || "",
    empresa: huesped?.empresa || "",
    vip: !!huesped?.vip,
    blacklist: !!huesped?.blacklist,
    notas: huesped?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    if (!f.nombre.trim()) { setErr("Falta nombre"); return; }
    setSaving(true); setErr("");
    const payload = {
      ...f,
      nombre: f.nombre.trim(),
      apellido: f.apellido.trim() || null,
      documento: f.documento.trim() || null,
      email: f.email.trim() || null,
      telefono: f.telefono.trim() || null,
      fecha_nacimiento: f.fecha_nacimiento || null,
      nacionalidad: f.nacionalidad.trim() || null,
      ciudad: f.ciudad.trim() || null,
      direccion: f.direccion.trim() || null,
      empresa: f.empresa.trim() || null,
      notas: f.notas.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const r = huesped
      ? await supabase.from("hotel_huespedes").update(payload).eq("id", huesped.id)
      : await supabase.from("hotel_huespedes").insert(payload);
    setSaving(false);
    if (r.error) { setErr(r.error.message); return; }
    onSaved();
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
        {huesped ? "Editar huésped" : "Nuevo huésped"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={LS}>Nombre *</label><input value={f.nombre} onChange={e => set("nombre", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Apellido</label><input value={f.apellido} onChange={e => set("apellido", e.target.value)} style={IS} /></div>
        <div>
          <label style={LS}>Documento</label>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={f.documento_tipo} onChange={e => set("documento_tipo", e.target.value)} style={{ ...IS, width: 80 }}>
              {DOC_TIPOS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input value={f.documento} onChange={e => set("documento", e.target.value)} style={IS} />
          </div>
        </div>
        <div><label style={LS}>Fecha de nacimiento</label><input type="date" value={f.fecha_nacimiento} onChange={e => set("fecha_nacimiento", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Email</label><input type="email" value={f.email} onChange={e => set("email", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Teléfono</label><input value={f.telefono} onChange={e => set("telefono", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Nacionalidad</label><input value={f.nacionalidad} onChange={e => set("nacionalidad", e.target.value)} style={IS} /></div>
        <div><label style={LS}>Ciudad</label><input value={f.ciudad} onChange={e => set("ciudad", e.target.value)} style={IS} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label style={LS}>Dirección</label><input value={f.direccion} onChange={e => set("direccion", e.target.value)} style={IS} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label style={LS}>Empresa</label><input value={f.empresa} onChange={e => set("empresa", e.target.value)} style={IS} /></div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Notas internas</label>
          <textarea value={f.notas} onChange={e => set("notas", e.target.value)} style={{ ...IS, minHeight: 60, resize: "vertical" }} />
        </div>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={f.vip} onChange={e => set("vip", e.target.checked)} />
          ⭐ VIP
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={f.blacklist} onChange={e => set("blacklist", e.target.checked)} />
          ⛔ Bloqueado
        </label>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
        <button onClick={save} disabled={saving} style={BTN(B.hotel)}>
          {saving ? "Guardando…" : (huesped ? "Guardar" : "Crear huésped")}
        </button>
      </div>
    </Overlay>
  );
}

function DetalleModal({ huesped, estancias, onClose, onEdit }) {
  const est = [...estancias].sort((a, b) => (b.check_in_at || "").localeCompare(a.check_in_at || ""));
  const totalGastado = est.reduce((s, e) => s + Number(e.total || 0), 0);

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: huesped.vip ? B.warning : B.hotel,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 24,
        }}>{inicial(huesped)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>
            {nombreCompleto(huesped)} {huesped.vip && "⭐"}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
            {huesped.documento_tipo ? `${huesped.documento_tipo} ${huesped.documento || "—"}` : ""}
            {huesped.nacionalidad ? ` · ${huesped.nacionalidad}` : ""}
            {huesped.empresa ? ` · ${huesped.empresa}` : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        {[
          ["Email", huesped.email],
          ["Teléfono", huesped.telefono],
          ["Ciudad", huesped.ciudad],
          ["Nacimiento", fmtFecha(huesped.fecha_nacimiento)],
          ["Dirección", huesped.direccion],
        ].filter(x => x[1]).map(([k, v]) => (
          <div key={k} style={{ background: B.navyLight, padding: 10, borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{k}</div>
            <div style={{ fontSize: 13 }}>{v}</div>
          </div>
        ))}
      </div>

      {huesped.notas && (
        <div style={{ padding: 10, background: B.navyLight, borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>Notas</div>
          {huesped.notas}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Historial de estancias ({est.length})</div>
          <div style={{ fontSize: 12, color: B.success }}>
            Total: ${Math.round(totalGastado).toLocaleString("es-CO")}
          </div>
        </div>
        {est.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Sin estancias</div>
        ) : (
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {est.map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", padding: 8, fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.05)", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{e.codigo}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                    {fmtFecha(e.check_in_at)} → {fmtFecha(e.check_out_at)}
                  </div>
                </div>
                <div style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: {
                  reservada: B.sky + "33", in_house: B.success + "33", checked_out: "rgba(255,255,255,0.1)", cancelada: B.danger + "33",
                }[e.estado] || "rgba(255,255,255,0.1)" }}>
                  {e.estado}
                </div>
                {e.total > 0 && <div style={{ fontWeight: 700 }}>${Math.round(e.total).toLocaleString("es-CO")}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cerrar</button>
        <button onClick={onEdit} style={BTN(B.hotel)}>✏️ Editar</button>
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
