import { useState, useEffect } from "react";
import { B, COP } from "../brand";
import { supabase } from "../lib/supabase";

const IS = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };

const BENEFICIOS = {
  coral:  { pct: 5,  camas: 2, personas: 2, color: "#f87171", label: "Coral Member",  icon: "🪸", desc: "Entry level – acceso base" },
  reef:   { pct: 8,  camas: 4, personas: 4, color: "#34d399", label: "Reef Member",   icon: "🐚", desc: "Cliente frecuente – upgrades y perks" },
  ocean:  { pct: 12, camas: 6, personas: 6, color: "#60a5fa", label: "Ocean Member",  icon: "🌊", desc: "Elite – experiencia completa" },
};

const CARD_GRADIENTS = {
  coral: "linear-gradient(135deg, #7f1d1d 0%, #450a0a 60%, #991b1b 100%)",
  reef:  "linear-gradient(135deg, #064e3b 0%, #022c22 60%, #065f46 100%)",
  ocean: "linear-gradient(135deg, #1e3a5f 0%, #0c1a35 60%, #1e40af 100%)",
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function genNumMembresia(count) {
  const year = new Date().getFullYear();
  const num = String(count + 1).padStart(3, "0");
  return `ATL-${year}-${num}`;
}

function NivelBadge({ nivel }) {
  const b = BENEFICIOS[nivel] || BENEFICIOS.coral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: b.color + "22", color: b.color, border: `1px solid ${b.color}55`,
    }}>
      {b.icon} {b.label}
    </span>
  );
}

function MembershipCard({ miembro }) {
  const b = BENEFICIOS[miembro.nivel] || BENEFICIOS.plata;
  const gradient = CARD_GRADIENTS[miembro.nivel] || CARD_GRADIENTS.coral;
  return (
    <div style={{
      background: gradient,
      borderRadius: 16,
      padding: "28px 32px",
      color: "#fff",
      position: "relative",
      overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      minHeight: 200,
    }}>
      {/* Decorative circles */}
      <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
      <div style={{ position: "absolute", bottom: -60, right: 40, width: 240, height: 240, borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, position: "relative" }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, opacity: 0.7, textTransform: "uppercase" }}>✦ ATOLÓN SOCIETY</div>
        <span style={{
          padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)",
          color: b.color, border: `1px solid ${b.color}88`,
        }}>
          {b.icon} {b.label.toUpperCase()}
        </span>
      </div>

      <div style={{ marginBottom: 20, position: "relative" }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 4 }}>
          {miembro.nombre}
        </div>
        <div style={{ fontSize: 13, opacity: 0.6, letterSpacing: 2 }}>{miembro.numero_membresia || "—"}</div>
      </div>

      <div style={{ display: "flex", gap: 32, position: "relative" }}>
        <div>
          <div style={{ fontSize: 10, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>PUNTOS DISPONIBLES</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif" }}>
            ◉ {(miembro.puntos_disponibles || 0).toLocaleString("es-CO")}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, opacity: 0.5, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>BENEFICIOS ACTIVOS</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            🛏 {b.camas} camas · 🍽 {b.personas} personas · 💰 {b.pct}% en puntos
          </div>
        </div>
      </div>
    </div>
  );
}

function NuevoMiembroModal({ onClose, onCreated, totalMiembros }) {
  const [form, setForm] = useState({ nombre: "", email: "", telefono: "", cedula: "", nivel: "coral" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.nombre.trim() || !form.email.trim()) { setError("Nombre y email son requeridos"); return; }
    setSaving(true); setError("");
    if (!supabase) { setError("Supabase no conectado"); setSaving(false); return; }
    const id = uid();
    const numero_membresia = genNumMembresia(totalMiembros);
    const { error: err } = await supabase.from("vip_miembros").insert({
      id, nombre: form.nombre.trim(), email: form.email.toLowerCase().trim(),
      telefono: form.telefono.trim() || null, cedula: form.cedula.trim() || null,
      nivel: form.nivel, numero_membresia,
    });
    if (err) { setError(err.message); setSaving(false); return; }
    onCreated();
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22 }}>Nuevo Miembro · Atolón Society</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={LS}>Nombre completo *</label><input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={IS} placeholder="Nombre del miembro" /></div>
          <div><label style={LS}>Email *</label><input value={form.email} onChange={e => set("email", e.target.value)} style={IS} placeholder="email@ejemplo.com" /></div>
          <div><label style={LS}>Teléfono</label><input value={form.telefono} onChange={e => set("telefono", e.target.value)} style={IS} placeholder="+57 300 000 0000" /></div>
          <div><label style={LS}>Cédula</label><input value={form.cedula} onChange={e => set("cedula", e.target.value)} style={IS} placeholder="1234567890" /></div>
          <div>
            <label style={LS}>Nivel</label>
            <select value={form.nivel} onChange={e => set("nivel", e.target.value)} style={{ ...IS, cursor: "pointer" }}>
              <option value="coral">🪸 Coral Member</option>
              <option value="reef">🐚 Reef Member</option>
              <option value="ocean">🌊 Ocean Member</option>
            </select>
          </div>
          {error && <div style={{ color: B.danger, fontSize: 13 }}>{error}</div>}
          <button onClick={handleCreate} disabled={saving} style={{ padding: "12px", background: saving ? B.navyLight : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: saving ? "default" : "pointer", marginTop: 8 }}>
            {saving ? "Creando..." : "Crear Miembro"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransaccionesTab({ miembro, onRefresh }) {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [validando, setValidando] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ tipo: "ganados", puntos: "", descripcion: "", monto_consumo: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("vip_transacciones").select("*").eq("miembro_id", miembro.id).order("created_at", { ascending: false });
    setTxs(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [miembro.id]);

  const validar = async (tx) => {
    setValidando(tx.id);
    const puntosAcreditar = tx.puntos || 0;
    await supabase.from("vip_transacciones").update({ validado: true }).eq("id", tx.id);
    await supabase.from("vip_miembros").update({
      puntos_disponibles: (miembro.puntos_disponibles || 0) + puntosAcreditar,
      puntos_totales: (miembro.puntos_totales || 0) + puntosAcreditar,
    }).eq("id", miembro.id);
    setValidando(null);
    load();
    onRefresh();
  };

  const addTx = async () => {
    if (!addForm.puntos) return;
    setSaving(true);
    const puntos = parseFloat(addForm.puntos);
    await supabase.from("vip_transacciones").insert({
      id: uid(), miembro_id: miembro.id, tipo: addForm.tipo,
      puntos, descripcion: addForm.descripcion || null,
      monto_consumo: addForm.monto_consumo ? parseFloat(addForm.monto_consumo) : null,
      validado: true,
    });
    // Update member points
    let newDisp = miembro.puntos_disponibles || 0;
    let newTotal = miembro.puntos_totales || 0;
    if (addForm.tipo === "ganados" || addForm.tipo === "ajuste") { newDisp += puntos; newTotal += puntos; }
    if (addForm.tipo === "canjeados") { newDisp -= puntos; }
    await supabase.from("vip_miembros").update({ puntos_disponibles: Math.max(0, newDisp), puntos_totales: Math.max(0, newTotal) }).eq("id", miembro.id);
    setSaving(false);
    setShowAdd(false);
    setAddForm({ tipo: "ganados", puntos: "", descripcion: "", monto_consumo: "" });
    load();
    onRefresh();
  };

  const tipoColor = { ganados: B.success, canjeados: B.danger, ajuste: B.warning };
  const tipoLabel = { ganados: "+ Ganados", canjeados: "- Canjeados", ajuste: "± Ajuste" };

  if (loading) return <div style={{ padding: 24, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Cargando...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{txs.length} transacciones</span>
        <button onClick={() => setShowAdd(s => !s)} style={{ padding: "8px 16px", background: B.navyLight, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, cursor: "pointer" }}>
          {showAdd ? "Cancelar" : "+ Agregar"}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: B.navy, borderRadius: 10, padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={LS}>Tipo</label>
              <select value={addForm.tipo} onChange={e => setAddForm(f => ({ ...f, tipo: e.target.value }))} style={{ ...IS }}>
                <option value="ganados">+ Ganados</option>
                <option value="canjeados">- Canjeados</option>
                <option value="ajuste">± Ajuste</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={LS}>Puntos</label>
              <input type="number" value={addForm.puntos} onChange={e => setAddForm(f => ({ ...f, puntos: e.target.value }))} style={IS} placeholder="0" />
            </div>
          </div>
          <div>
            <label style={LS}>Descripción</label>
            <input value={addForm.descripcion} onChange={e => setAddForm(f => ({ ...f, descripcion: e.target.value }))} style={IS} placeholder="Ej: Consumo restaurante" />
          </div>
          <div>
            <label style={LS}>Monto consumo (COP)</label>
            <input type="number" value={addForm.monto_consumo} onChange={e => setAddForm(f => ({ ...f, monto_consumo: e.target.value }))} style={IS} placeholder="0" />
          </div>
          <button onClick={addTx} disabled={saving} style={{ padding: "10px", background: B.success, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Guardando..." : "Registrar"}
          </button>
        </div>
      )}

      {txs.length === 0 ? (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "32px 0" }}>Sin transacciones aún</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {txs.map(tx => (
            <div key={tx.id} style={{
              background: B.navy, borderRadius: 10, padding: "14px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderLeft: `3px solid ${tipoColor[tx.tipo] || B.navyLight}`,
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tipoColor[tx.tipo] }}>{tipoLabel[tx.tipo]}: {tx.puntos?.toLocaleString("es-CO")} pts</span>
                  {!tx.validado && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.warning + "22", color: B.warning }}>Pendiente</span>
                  )}
                  {tx.validado && (
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: B.success + "22", color: B.success }}>Validado</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  {tx.descripcion || "—"}
                  {tx.monto_consumo ? ` · ${COP(tx.monto_consumo)}` : ""}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                  {new Date(tx.created_at).toLocaleString("es-CO")}
                </div>
              </div>
              {!tx.validado && tx.tipo === "ganados" && (
                <button onClick={() => validar(tx)} disabled={validando === tx.id} style={{
                  padding: "8px 14px", background: B.success, border: "none", borderRadius: 8,
                  color: "#fff", fontSize: 12, fontWeight: 700, cursor: validando ? "default" : "pointer", flexShrink: 0, marginLeft: 12,
                }}>
                  {validando === tx.id ? "..." : "✓ Validar"}
                </button>
              )}
              {tx.recibo_url && (
                <a href={tx.recibo_url} target="_blank" rel="noopener noreferrer" style={{ color: B.sky, fontSize: 12, marginLeft: 12, flexShrink: 0 }}>Ver recibo</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReservasTab({ miembro, onRefresh }) {
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("vip_reservas").select("*").eq("miembro_id", miembro.id).order("fecha", { ascending: false });
    setReservas(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [miembro.id]);

  const updateEstado = async (id, estado) => {
    setUpdatingId(id);
    await supabase.from("vip_reservas").update({ estado }).eq("id", id);
    setUpdatingId(null);
    load();
  };

  const estadoColor = { pendiente: B.warning, confirmada: B.success, cancelada: B.danger, completada: B.sky };
  const estadoLabel = { pendiente: "Pendiente", confirmada: "Confirmada", cancelada: "Cancelada", completada: "Completada" };

  if (loading) return <div style={{ padding: 24, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Cargando...</div>;

  return (
    <div>
      {reservas.length === 0 ? (
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", padding: "32px 0" }}>Sin reservas aún</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reservas.map(r => (
            <div key={r.id} style={{ background: B.navy, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                    {r.tipo === "restaurante" ? "🍽 Restaurante" : "🛏 Cama de Playa"}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
                    {r.fecha} {r.hora ? `· ${r.hora}` : ""} · {r.personas} persona{r.personas !== 1 ? "s" : ""}
                  </div>
                  {r.notas && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{r.notas}</div>}
                </div>
                <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: (estadoColor[r.estado] || B.navyLight) + "22", color: estadoColor[r.estado] || "rgba(255,255,255,0.5)" }}>
                  {estadoLabel[r.estado] || r.estado}
                </span>
              </div>
              {r.estado === "pendiente" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => updateEstado(r.id, "confirmada")} disabled={updatingId === r.id} style={{ flex: 1, padding: "7px", background: B.success, border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Confirmar</button>
                  <button onClick={() => updateEstado(r.id, "cancelada")} disabled={updatingId === r.id} style={{ flex: 1, padding: "7px", background: B.danger + "33", border: `1px solid ${B.danger}44`, borderRadius: 6, color: B.danger, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                </div>
              )}
              {r.estado === "confirmada" && (
                <button onClick={() => updateEstado(r.id, "completada")} disabled={updatingId === r.id} style={{ width: "100%", marginTop: 8, padding: "7px", background: B.sky + "33", border: `1px solid ${B.sky}44`, borderRadius: 6, color: B.sky, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Marcar completada</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailView({ miembro: initialMiembro, onBack, onRefreshList }) {
  const [miembro, setMiembro] = useState(initialMiembro);
  const [tab, setTab] = useState("transacciones");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: initialMiembro.nombre, telefono: initialMiembro.telefono || "", cedula: initialMiembro.cedula || "", nivel: initialMiembro.nivel });
  const [saving, setSaving] = useState(false);

  const refreshMiembro = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("vip_miembros").select("*").eq("id", miembro.id).single();
    if (data) { setMiembro(data); onRefreshList(); }
  };

  const saveEdit = async () => {
    setSaving(true);
    await supabase.from("vip_miembros").update({
      nombre: editForm.nombre.trim(),
      telefono: editForm.telefono.trim() || null,
      cedula: editForm.cedula.trim() || null,
      nivel: editForm.nivel,
    }).eq("id", miembro.id);
    setSaving(false);
    setEditing(false);
    refreshMiembro();
  };

  const toggleActivo = async () => {
    await supabase.from("vip_miembros").update({ activo: !miembro.activo }).eq("id", miembro.id);
    refreshMiembro();
  };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: B.sky, fontSize: 14, cursor: "pointer", marginBottom: 20, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        ← Miembros
      </button>

      <MembershipCard miembro={miembro} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
        {/* Left: datos del miembro */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Datos del Miembro</h3>
            <button onClick={() => setEditing(e => !e)} style={{ background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 6, color: "rgba(255,255,255,0.6)", fontSize: 12, padding: "5px 12px", cursor: "pointer" }}>
              {editing ? "Cancelar" : "Editar"}
            </button>
          </div>
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={LS}>Nombre</label><input value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} style={IS} /></div>
              <div><label style={LS}>Teléfono</label><input value={editForm.telefono} onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))} style={IS} /></div>
              <div><label style={LS}>Cédula</label><input value={editForm.cedula} onChange={e => setEditForm(f => ({ ...f, cedula: e.target.value }))} style={IS} /></div>
              <div>
                <label style={LS}>Nivel</label>
                <select value={editForm.nivel} onChange={e => setEditForm(f => ({ ...f, nivel: e.target.value }))} style={{ ...IS, cursor: "pointer" }}>
                  <option value="plata">🥈 Plata</option>
                  <option value="oro">🥇 Oro</option>
                  <option value="platino">💎 Platino</option>
                </select>
              </div>
              <button onClick={saveEdit} disabled={saving} style={{ padding: "10px", background: B.success, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["Email", miembro.email],
                ["Teléfono", miembro.telefono || "—"],
                ["Cédula", miembro.cedula || "—"],
                ["No. Membresía", miembro.numero_membresia || "—"],
                ["Nivel", <NivelBadge nivel={miembro.nivel} />],
                ["Puntos disponibles", (miembro.puntos_disponibles || 0).toLocaleString("es-CO")],
                ["Puntos totales", (miembro.puntos_totales || 0).toLocaleString("es-CO")],
                ["Miembro desde", new Date(miembro.created_at).toLocaleDateString("es-CO")],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${B.navyLight}`, paddingBottom: 8 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{label}</span>
                  <span style={{ fontSize: 13 }}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: acciones rápidas */}
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Acciones Rápidas</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: B.navy, borderRadius: 10, padding: "14px 16px" }}>
              <span style={{ fontSize: 13 }}>Estado del miembro</span>
              <button onClick={toggleActivo} style={{
                padding: "6px 16px", borderRadius: 20, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer",
                background: miembro.activo ? B.success + "22" : B.danger + "22",
                color: miembro.activo ? B.success : B.danger,
              }}>
                {miembro.activo ? "Activo" : "Inactivo"}
              </button>
            </div>
            <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Beneficios del nivel</div>
              <div style={{ fontSize: 13, lineHeight: 2, color: "rgba(255,255,255,0.8)" }}>
                <div>💰 {BENEFICIOS[miembro.nivel]?.pct}% del consumo en puntos</div>
                <div>🛏 Hasta {BENEFICIOS[miembro.nivel]?.camas} camas de playa</div>
                <div>🍽 Hasta {BENEFICIOS[miembro.nivel]?.personas} personas en restaurante</div>
              </div>
            </div>
            <div style={{ background: B.navy, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Equivalencia de puntos</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", color: B.sky }}>
                {COP((miembro.puntos_disponibles || 0) * 10)}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>1 punto = $10 COP en consumos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: "flex", gap: 2, background: B.navyMid, borderRadius: "12px 12px 0 0", padding: "4px 4px 0", width: "fit-content" }}>
          {["transacciones", "reservas"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 22px", border: "none", borderRadius: "8px 8px 0 0", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: tab === t ? B.navyLight : "transparent",
              color: tab === t ? "#fff" : "rgba(255,255,255,0.5)",
            }}>
              {t === "transacciones" ? "Transacciones" : "Reservas"}
            </button>
          ))}
        </div>
        <div style={{ background: B.navyMid, borderRadius: "0 12px 12px 12px", padding: 20 }}>
          {tab === "transacciones" && <TransaccionesTab miembro={miembro} onRefresh={refreshMiembro} />}
          {tab === "reservas" && <ReservasTab miembro={miembro} onRefresh={refreshMiembro} />}
        </div>
      </div>
    </div>
  );
}

export default function VIPAdmin() {
  const [miembros, setMiembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMiembro, setSelectedMiembro] = useState(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [stats, setStats] = useState({ total: 0, puntosCirculacion: 0, pendientesValidar: 0 });

  const loadMiembros = async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.from("vip_miembros").select("*").order("created_at", { ascending: false });
    setMiembros(data || []);
    setLoading(false);
  };

  const loadStats = async () => {
    if (!supabase) return;
    const [{ data: miembrosData }, { data: txPendientes }] = await Promise.all([
      supabase.from("vip_miembros").select("puntos_disponibles").eq("activo", true),
      supabase.from("vip_transacciones").select("id").eq("validado", false).eq("tipo", "ganados"),
    ]);
    const totalPuntos = (miembrosData || []).reduce((s, m) => s + (m.puntos_disponibles || 0), 0);
    setStats({
      total: (miembrosData || []).length,
      puntosCirculacion: totalPuntos,
      pendientesValidar: (txPendientes || []).length,
    });
  };

  useEffect(() => {
    loadMiembros();
    loadStats();
  }, []);

  const filtered = miembros.filter(m =>
    !search || m.nombre.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggleActivo = async (e, m) => {
    e.stopPropagation();
    await supabase.from("vip_miembros").update({ activo: !m.activo }).eq("id", m.id);
    loadMiembros();
    loadStats();
  };

  if (selectedMiembro) {
    return (
      <DetailView
        miembro={selectedMiembro}
        onBack={() => { setSelectedMiembro(null); loadMiembros(); loadStats(); }}
        onRefreshList={() => { loadMiembros(); loadStats(); }}
      />
    );
  }

  return (
    <div>
      {showNuevo && (
        <NuevoMiembroModal
          onClose={() => setShowNuevo(false)}
          onCreated={() => { loadMiembros(); loadStats(); }}
          totalMiembros={miembros.length}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>✦ Atolón Society</h2>
        <button onClick={() => setShowNuevo(true)} style={{ padding: "10px 20px", background: B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          + Nuevo miembro
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        {[
          { label: "Total Miembros", value: stats.total, color: B.sky },
          { label: "Puntos en Circulación", value: stats.puntosCirculacion.toLocaleString("es-CO"), color: B.success },
          { label: "Pendientes de Validar", value: stats.pendientesValidar, color: stats.pendientesValidar > 0 ? B.warning : "rgba(255,255,255,0.3)" },
        ].map(s => (
          <div key={s.label} style={{ flex: "1 1 200px", background: B.navyMid, borderRadius: 12, padding: "16px 20px", borderLeft: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>{loading ? "..." : s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Buscar por nombre o email..."
        style={{ ...IS, marginBottom: 16, maxWidth: 400 }}
      />

      {/* Members table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,0.3)" }}>Cargando miembros...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "rgba(255,255,255,0.3)" }}>
          {search ? "No se encontraron miembros" : "No hay miembros aún. Crea el primero."}
        </div>
      ) : (
        <div style={{ background: B.navyMid, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${B.navyLight}`, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 12, fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: 1 }}>
            <span>Miembro</span>
            <span>Nivel</span>
            <span>Puntos</span>
            <span>Estado</span>
            <span></span>
          </div>
          {filtered.map(m => (
            <div key={m.id} onClick={() => setSelectedMiembro(m)} style={{
              padding: "14px 20px", borderBottom: `1px solid ${B.navyLight}`,
              display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 12,
              alignItems: "center", cursor: "pointer", transition: "background 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = B.navyLight + "44"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{m.nombre}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{m.email}</div>
              </div>
              <div><NivelBadge nivel={m.nivel} /></div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{(m.puntos_disponibles || 0).toLocaleString("es-CO")}</div>
              <div>
                <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: m.activo ? B.success + "22" : B.danger + "22", color: m.activo ? B.success : B.danger }}>
                  {m.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
              <button onClick={e => toggleActivo(e, m)} style={{
                padding: "6px 12px", borderRadius: 6, border: `1px solid ${B.navyLight}`,
                background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer",
              }}>
                {m.activo ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
