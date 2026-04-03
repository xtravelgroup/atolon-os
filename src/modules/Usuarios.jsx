import { useState, useEffect, useCallback } from "react";
import { B, fmtFecha } from "../brand";
import { supabase } from "../lib/supabase";

const IS   = { width: "100%", padding: "10px 14px", borderRadius: 8, background: B.navy, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS   = { fontSize: 11, color: B.sand, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const ISsm = { ...IS, padding: "8px 10px", fontSize: 12 };

const MODULOS = [
  // Comercial
  { key: "pasadias",      label: "Pasadías",      icon: "🏖" },
  { key: "reservas",      label: "Reservas",       icon: "⚓" },
  { key: "clientes",      label: "Clientes",       icon: "👤" },
  { key: "b2b",           label: "B2B",            icon: "🏢" },
  { key: "eventos",       label: "Eventos",        icon: "🎉" },
  { key: "upsells",       label: "Upsells",        icon: "⬆" },
  { key: "comercial",     label: "Comercial",      icon: "★" },
  // Operaciones
  { key: "checkin",       label: "Check-in",       icon: "✅" },
  { key: "muelle",        label: "Llegadas",       icon: "⚓" },
  { key: "staffing",      label: "Staffing",       icon: "👥" },
  { key: "floorplan",     label: "Floor Plan",     icon: "🗺" },
  { key: "menus",         label: "Menús",          icon: "🍽️" },
  // Marketing
  { key: "analitica",     label: "Analítica",      icon: "📊" },
  { key: "contenido",     label: "Contenido",      icon: "📢" },
  { key: "vip",           label: "Society",        icon: "✦" },
  // Finanzas
  { key: "financiero",    label: "Financiero",     icon: "💰" },
  { key: "presupuesto",   label: "Presupuesto",    icon: "📊" },
  { key: "activos",       label: "Activos",        icon: "🏗" },
  { key: "requisiciones", label: "Requisiciones",  icon: "🛒" },
  { key: "contratos",     label: "Contratos",      icon: "📄" },
  // Sistema
  { key: "configuracion", label: "Configuración",  icon: "⚙" },
  { key: "usuarios",      label: "Usuarios",       icon: "👥" },
];
const PERMS = [
  { key: "ver",      label: "Ver" },
  { key: "crear",    label: "Crear" },
  { key: "editar",   label: "Editar" },
  { key: "eliminar", label: "Eliminar" },
];
const AVATAR_COLORS = ["#8ECAE6","#4CAF7D","#C8B99A","#E8A020","#D64545","#F4C6D0","#7B61FF","#38BDF8"];

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ background: B.navyMid, borderRadius: 12, padding: "18px 22px", flex: "1 1 180px", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: B.sand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Avatar({ nombre, color, size = 36 }) {
  const initials = (nombre || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: color || B.navyLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, color: B.navy, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function RolBadge({ rol, roles }) {
  const r = roles.find(x => x.id === rol);
  if (!r) return null;
  return (
    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 8, background: (r.color || B.sky) + "22", color: r.color || B.sky, fontWeight: 600, border: `1px solid ${(r.color || B.sky)}44` }}>
      {r.nombre}
    </span>
  );
}

// ════════════════════════════════════════════════════════
// MODAL USUARIO
// ════════════════════════════════════════════════════════
function UsuarioModal({ usuario, roles, onClose, onSaved }) {
  const isEdit = !!usuario;
  const defaultMods = () => {
    if (isEdit) return usuario.modulos || [];
    const rol = roles.find(r => r.id === "operador");
    return rol ? Object.keys(rol.permisos || {}) : [];
  };

  const [f, setF] = useState({
    nombre:       usuario?.nombre       || "",
    email:        usuario?.email        || "",
    telefono:     usuario?.telefono     || "",
    rol_id:       usuario?.rol_id       || "operador",
    modulos:      defaultMods(),
    pin:          "",
    notas:        usuario?.notas        || "",
    activo:       usuario?.activo       ?? true,
    avatar_color: usuario?.avatar_color || AVATAR_COLORS[0],
  });
  const [saving, setSaving] = useState(false);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  const onRolChange = (rolId) => {
    upd("rol_id", rolId);
    const rol = roles.find(r => r.id === rolId);
    if (rol) {
      const mods = rol.permisos?.["*"] ? MODULOS.map(m => m.key) : Object.keys(rol.permisos || {});
      upd("modulos", mods);
    }
  };

  const toggleMod = (key) => {
    setF(p => ({
      ...p,
      modulos: p.modulos.includes(key)
        ? p.modulos.filter(k => k !== key)
        : [...p.modulos, key],
    }));
  };

  const guardar = async () => {
    if (!supabase || saving || !f.nombre.trim() || !f.email.trim()) return;
    setSaving(true);
    const row = {
      nombre:       f.nombre.trim(),
      email:        f.email.toLowerCase().trim(),
      telefono:     f.telefono.trim() || null,
      rol_id:       f.rol_id,
      modulos:      f.modulos,
      pin:          f.pin || null,
      notas:        f.notas || null,
      activo:       f.activo,
      avatar_color: f.avatar_color,
    };
    if (isEdit) {
      await supabase.from("usuarios").update(row).eq("id", usuario.id);
    } else {
      // Nuevo usuario: debe cambiar la clave Atolon123 en su primer ingreso
      await supabase.from("usuarios").insert({ id: `USR-${Date.now()}`, ...row, must_change_password: true });
    }
    setSaving(false);
    onSaved();
  };

  const rolSel = roles.find(r => r.id === f.rol_id);
  const esTotal = rolSel?.permisos?.["*"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 620, boxShadow: "0 20px 60px rgba(0,0,0,0.6)", maxHeight: "92vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{isEdit ? "Editar usuario" : "Nuevo usuario"}</h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>Configura el acceso y los permisos en Atolon OS.</p>

        {/* Avatar + info principal */}
        <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "flex-start" }}>
          <div>
            <label style={LS}>Color avatar</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {AVATAR_COLORS.map(c => (
                <div key={c} onClick={() => upd("avatar_color", c)}
                  style={{ width: 26, height: 26, borderRadius: 13, background: c, cursor: "pointer", border: f.avatar_color === c ? `3px solid #fff` : "3px solid transparent", boxSizing: "border-box" }} />
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <Avatar nombre={f.nombre || "?"} color={f.avatar_color} size={52} />
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={LS}>Nombre completo *</label>
              <input value={f.nombre} onChange={e => upd("nombre", e.target.value)} placeholder="Ej: María García" style={IS} />
            </div>
            <div>
              <label style={LS}>Email *</label>
              <input type="email" value={f.email} onChange={e => upd("email", e.target.value)} placeholder="maria@atolon.co" style={IS} />
            </div>
            <div>
              <label style={LS}>Teléfono</label>
              <input type="tel" value={f.telefono} onChange={e => upd("telefono", e.target.value)} placeholder="+57 300 000 0000" style={IS} />
            </div>
          </div>
        </div>

        {/* Rol */}
        <div style={{ marginBottom: 16 }}>
          <label style={LS}>Rol</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {roles.map(r => (
              <div key={r.id} onClick={() => onRolChange(r.id)}
                style={{ padding: "11px 14px", borderRadius: 10, border: `2px solid ${f.rol_id === r.id ? (r.color || B.sky) : B.navyLight}`, background: f.rol_id === r.id ? (r.color || B.sky) + "18" : B.navy, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: r.color || B.sky, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: f.rol_id === r.id ? 700 : 500, color: f.rol_id === r.id ? (r.color || B.sky) : "#fff" }}>{r.nombre}</span>
                </div>
                {r.descripcion && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, paddingLeft: 18 }}>{r.descripcion}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Módulos */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ ...LS, margin: 0 }}>Acceso a módulos</label>
            {esTotal
              ? <span style={{ fontSize: 11, color: B.danger, fontWeight: 700 }}>🔑 Acceso total (todos los módulos)</span>
              : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setF(p => ({ ...p, modulos: MODULOS.map(m => m.key) }))} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "none", background: B.navyLight, color: B.sand, cursor: "pointer" }}>Todos</button>
                  <button onClick={() => setF(p => ({ ...p, modulos: [] }))} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "none", background: B.navyLight, color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>Ninguno</button>
                </div>
              )
            }
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {MODULOS.map(m => {
              const checked = esTotal || f.modulos.includes(m.key);
              return (
                <div key={m.key} onClick={() => !esTotal && toggleMod(m.key)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: checked ? B.sky + "18" : B.navy, border: `1px solid ${checked ? B.sky + "44" : B.navyLight}`, cursor: esTotal ? "default" : "pointer", opacity: esTotal ? 0.7 : 1 }}>
                  <span style={{ fontSize: 14 }}>{m.icon}</span>
                  <span style={{ fontSize: 12, color: checked ? "#fff" : "rgba(255,255,255,0.45)", fontWeight: checked ? 600 : 400 }}>{m.label}</span>
                  {checked && !esTotal && <span style={{ marginLeft: "auto", fontSize: 10, color: B.sky }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* PIN y otros */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={LS}>PIN de acceso {isEdit ? "(dejar vacío para no cambiar)" : "(opcional)"}</label>
            <input type="password" value={f.pin} onChange={e => upd("pin", e.target.value)} placeholder="••••" style={IS} maxLength={8} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={f.activo} onChange={e => upd("activo", e.target.checked)} />
              <span style={{ fontSize: 13, color: f.activo ? B.success : "rgba(255,255,255,0.4)", fontWeight: 600 }}>{f.activo ? "Usuario activo" : "Usuario inactivo"}</span>
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={LS}>Notas internas (opcional)</label>
          <textarea value={f.notas} onChange={e => upd("notas", e.target.value)} rows={2} style={{ ...IS, resize: "vertical" }} placeholder="Área, cargo, observaciones..." />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={saving || !f.nombre.trim() || !f.email.trim()}
            style={{ flex: 2, padding: "11px", background: saving ? B.navyLight : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MODAL ROL
// ════════════════════════════════════════════════════════
function RolModal({ rol, onClose, onSaved }) {
  const isEdit = !!rol;
  const buildPerms = () => {
    if (!isEdit) {
      const p = {};
      MODULOS.forEach(m => { p[m.key] = { ver: false, crear: false, editar: false, eliminar: false }; });
      return p;
    }
    const p = {};
    MODULOS.forEach(m => {
      p[m.key] = { ver: false, crear: false, editar: false, eliminar: false, ...(rol.permisos?.[m.key] || {}) };
    });
    return p;
  };

  const [f, setF] = useState({
    nombre:      rol?.nombre      || "",
    descripcion: rol?.descripcion || "",
    color:       rol?.color       || AVATAR_COLORS[0],
    permisos:    buildPerms(),
  });
  const [saving, setSaving] = useState(false);

  const esSistema = rol?.es_sistema;
  const esTotal   = rol?.permisos?.["*"];

  const updPerm = (mod, perm, val) => {
    setF(p => ({
      ...p,
      permisos: { ...p.permisos, [mod]: { ...p.permisos[mod], [perm]: val } },
    }));
  };

  const toggleModAll = (mod, val) => {
    setF(p => ({
      ...p,
      permisos: { ...p.permisos, [mod]: { ver: val, crear: val, editar: val, eliminar: val } },
    }));
  };

  const togglePermAll = (perm, val) => {
    setF(p => {
      const np = { ...p.permisos };
      MODULOS.forEach(m => { np[m.key] = { ...np[m.key], [perm]: val }; });
      return { ...p, permisos: np };
    });
  };

  const guardar = async () => {
    if (!supabase || saving || !f.nombre.trim()) return;
    setSaving(true);
    const row = {
      nombre:      f.nombre.trim(),
      descripcion: f.descripcion || null,
      color:       f.color,
      permisos:    esTotal ? rol.permisos : f.permisos,
    };
    if (isEdit) {
      await supabase.from("roles").update(row).eq("id", rol.id);
    } else {
      const id = f.nombre.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + Date.now();
      await supabase.from("roles").insert({ id, ...row, es_sistema: false });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: B.navyMid, borderRadius: 16, padding: 32, width: 700, boxShadow: "0 20px 60px rgba(0,0,0,0.6)", maxHeight: "94vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{isEdit ? "Editar rol" : "Nuevo rol"}</h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 22 }}>Define qué puede hacer este rol en cada módulo del sistema.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={LS}>Nombre del rol *</label>
            <input value={f.nombre} onChange={e => setF(p => ({ ...p, nombre: e.target.value }))} disabled={esSistema} placeholder="Ej: Recepcionista" style={{ ...IS, opacity: esSistema ? 0.5 : 1 }} />
          </div>
          <div>
            <label style={LS}>Descripción</label>
            <input value={f.descripcion} onChange={e => setF(p => ({ ...p, descripcion: e.target.value }))} placeholder="Funciones del rol..." style={IS} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={LS}>Color del rol</label>
          <div style={{ display: "flex", gap: 8 }}>
            {AVATAR_COLORS.map(c => (
              <div key={c} onClick={() => setF(p => ({ ...p, color: c }))}
                style={{ width: 28, height: 28, borderRadius: 14, background: c, cursor: "pointer", border: f.color === c ? "3px solid #fff" : "3px solid transparent", boxSizing: "border-box" }} />
            ))}
          </div>
        </div>

        {/* Matriz de permisos */}
        {esTotal ? (
          <div style={{ background: B.danger + "15", borderRadius: 12, padding: "18px 20px", border: `1px solid ${B.danger}33`, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: B.danger, marginBottom: 4 }}>🔑 Acceso total</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Este rol tiene acceso completo a todos los módulos y no puede ser restringido.</div>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <label style={{ ...LS, margin: 0 }}>Permisos por módulo</label>
              <div style={{ display: "flex", gap: 6 }}>
                {PERMS.map(p => (
                  <button key={p.key} onClick={() => togglePermAll(p.key, true)}
                    style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "none", background: B.navyLight, color: B.sand, cursor: "pointer" }}>
                    Todo {p.label}
                  </button>
                ))}
                <button onClick={() => {
                  setF(p => {
                    const np = { ...p.permisos };
                    MODULOS.forEach(m => { np[m.key] = { ver: false, crear: false, editar: false, eliminar: false }; });
                    return { ...p, permisos: np };
                  });
                }} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "none", background: B.danger + "22", color: B.danger, cursor: "pointer" }}>
                  Limpiar todo
                </button>
              </div>
            </div>

            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "160px repeat(4, 1fr) 36px", gap: 4, marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>Módulo</div>
              {PERMS.map(p => (
                <div key={p.key} style={{ fontSize: 10, color: B.sand, textTransform: "uppercase", textAlign: "center" }}>{p.label}</div>
              ))}
              <div />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {MODULOS.map(m => {
                const mp    = f.permisos[m.key] || {};
                const allOn = PERMS.every(p => mp[p.key]);
                return (
                  <div key={m.key} style={{ display: "grid", gridTemplateColumns: "160px repeat(4, 1fr) 36px", gap: 4, padding: "8px 10px", borderRadius: 8, background: mp.ver ? B.navy : B.navy + "88", border: `1px solid ${mp.ver ? B.navyLight : "transparent"}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14 }}>{m.icon}</span>
                      <span style={{ fontSize: 12, color: mp.ver ? "#fff" : "rgba(255,255,255,0.35)", fontWeight: mp.ver ? 500 : 400 }}>{m.label}</span>
                    </div>
                    {PERMS.map(p => (
                      <div key={p.key} style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                        <div onClick={() => updPerm(m.key, p.key, !mp[p.key])}
                          style={{ width: 20, height: 20, borderRadius: 5, background: mp[p.key] ? (p.key === "eliminar" ? B.danger : B.success) : B.navyLight, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>
                          {mp[p.key] && <span style={{ fontSize: 11, color: "#fff" }}>✓</span>}
                        </div>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <button onClick={() => toggleModAll(m.key, !allOn)}
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, border: "none", background: allOn ? B.warning + "22" : B.sky + "22", color: allOn ? B.warning : B.sky, cursor: "pointer" }}>
                        {allOn ? "✕" : "✓"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {esSistema && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 16, padding: "8px 12px", background: B.navy, borderRadius: 8 }}>
            ℹ Este es un rol del sistema. Puedes editar sus permisos pero no eliminarlo.
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "none", border: `1px solid ${B.navyLight}`, borderRadius: 8, color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
          <button onClick={guardar} disabled={saving || !f.nombre.trim()}
            style={{ flex: 2, padding: "11px", background: saving ? B.navyLight : B.sky, color: B.navy, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear rol"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB USUARIOS
// ════════════════════════════════════════════════════════
function TabUsuarios({ roles, onRolesNeed }) {
  const [usuarios,   setUsuarios]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editando,   setEditando]   = useState(null);
  const [filtroRol,  setFiltroRol]  = useState("__todos__");
  const [filtroEst,  setFiltroEst]  = useState("activos");
  const [expandido,  setExpandido]  = useState(null);

  const fetchAll = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("usuarios").select("*").order("nombre");
    setUsuarios(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleActivo = async (u) => {
    await supabase.from("usuarios").update({ activo: !u.activo }).eq("id", u.id);
    fetchAll();
  };

  const eliminar = async (u) => {
    if (!window.confirm(`¿Eliminar usuario "${u.nombre}"? Esta acción no se puede deshacer.`)) return;
    await supabase.from("usuarios").delete().eq("id", u.id);
    fetchAll();
  };

  const activos = usuarios.filter(u => u.activo);
  const usFilt  = usuarios
    .filter(u => filtroEst === "activos" ? u.activo : filtroEst === "inactivos" ? !u.activo : true)
    .filter(u => filtroRol === "__todos__" ? true : u.rol_id === filtroRol);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando usuarios...</div>;

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <KpiCard label="Total usuarios"   value={usuarios.length}          color={B.sky}     sub="registrados" />
        <KpiCard label="Activos"          value={activos.length}           color={B.success}  sub="con acceso al sistema" />
        <KpiCard label="Super Admin"      value={usuarios.filter(u => u.rol_id === "super_admin").length} color={B.danger} sub="acceso total" />
        <KpiCard label="Operadores"       value={usuarios.filter(u => u.rol_id === "operador").length}    color={B.sand}   sub="acceso por módulos" />
      </div>

      {/* Filtros + nuevo */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <select value={filtroRol} onChange={e => setFiltroRol(e.target.value)} style={{ ...ISsm, width: "auto", minWidth: 160 }}>
          <option value="__todos__">Todos los roles</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {[["activos","Activos"],["inactivos","Inactivos"],["todos","Todos"]].map(([v,l]) => (
            <button key={v} onClick={() => setFiltroEst(v)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: filtroEst === v ? 700 : 400, background: filtroEst === v ? B.sky : B.navyMid, color: filtroEst === v ? B.navy : "rgba(255,255,255,0.5)" }}>{l}</button>
          ))}
        </div>
        <button onClick={() => fetchAll()} style={{ background: B.navyLight, color: "rgba(255,255,255,0.5)", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>↺</button>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => { setEditando(null); setShowModal(true); }}
            style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            + Nuevo usuario
          </button>
        </div>
      </div>

      {usFilt.length === 0 && (
        <div style={{ background: B.navyMid, borderRadius: 12, padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
          No hay usuarios con estos filtros.
        </div>
      )}

      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {usFilt.map(u => {
          const open = expandido === u.id;
          const userRol = roles.find(r => r.id === u.rol_id);
          const esTotal = userRol?.permisos?.["*"];
          const modsActivos = esTotal ? MODULOS : MODULOS.filter(m => (u.modulos || []).includes(m.key));
          return (
            <div key={u.id} style={{ background: B.navyMid, borderRadius: 12, border: `1px solid ${!u.activo ? B.navyLight + "44" : B.navyLight}`, opacity: u.activo ? 1 : 0.6 }}>
              {/* Fila principal */}
              <div onClick={() => setExpandido(open ? null : u.id)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer" }}>
                <Avatar nombre={u.nombre} color={u.avatar_color} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{u.nombre}</span>
                    {!u.activo && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: B.navyLight, color: "rgba(255,255,255,0.4)" }}>Inactivo</span>}
                    <RolBadge rol={u.rol_id} roles={roles} />
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{u.email}</div>
                </div>
                {/* Módulos mini-badges */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 280, justifyContent: "flex-end" }}>
                  {esTotal
                    ? <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: B.danger + "22", color: B.danger, fontWeight: 700 }}>🔑 Acceso total</span>
                    : modsActivos.slice(0, 5).map(m => (
                      <span key={m.key} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 6, background: B.navyLight, color: "rgba(255,255,255,0.55)" }}>{m.icon} {m.label}</span>
                    ))
                  }
                  {!esTotal && modsActivos.length > 5 && (
                    <span style={{ fontSize: 11, padding: "3px 7px", borderRadius: 6, background: B.navyLight, color: "rgba(255,255,255,0.35)" }}>+{modsActivos.length - 5} más</span>
                  )}
                </div>
                {/* Acciones */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditando(u); setShowModal(true); }}
                    style={{ background: B.navyLight, color: B.sand, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>Editar</button>
                  <button onClick={() => toggleActivo(u)}
                    style={{ background: u.activo ? B.warning + "22" : B.success + "22", color: u.activo ? B.warning : B.success, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>
                    {u.activo ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => eliminar(u)}
                    style={{ background: B.danger + "22", color: B.danger, border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11, cursor: "pointer" }}>✕</button>
                </div>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
              </div>

              {/* Expansión */}
              {open && (
                <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${B.navyLight}44` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: B.sand, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Módulos con acceso</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {esTotal
                          ? MODULOS.map(m => <span key={m.key} style={{ fontSize: 12, padding: "4px 9px", borderRadius: 6, background: B.danger + "18", color: B.danger }}>{m.icon} {m.label}</span>)
                          : modsActivos.length === 0
                            ? <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Sin módulos asignados</span>
                            : modsActivos.map(m => <span key={m.key} style={{ fontSize: 12, padding: "4px 9px", borderRadius: 6, background: B.navyLight, color: "rgba(255,255,255,0.7)" }}>{m.icon} {m.label}</span>)
                        }
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: B.sand, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Información</div>
                      <div style={{ fontSize: 12, lineHeight: 2, color: "rgba(255,255,255,0.55)" }}>
                        <div>📅 Creado: {u.created_at ? fmtFecha(u.created_at.slice(0, 10)) : "—"}</div>
                        {u.ultimo_acceso && <div>🟢 Último acceso: {new Date(u.ultimo_acceso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}</div>}
                        {u.notas && <div>📝 {u.notas}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <UsuarioModal
          usuario={editando}
          roles={roles}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSaved={() => { setShowModal(false); setEditando(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB ROLES
// ════════════════════════════════════════════════════════
function TabRoles({ roles, onRolesChange }) {
  const [userCount,  setUserCount]  = useState({});
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editando,   setEditando]   = useState(null);

  const fetchAll = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [rolesR, usersR] = await Promise.all([
      supabase.from("roles").select("*").order("created_at"),
      supabase.from("usuarios").select("rol_id, activo"),
    ]);
    onRolesChange(rolesR.data || []);
    const cnt = {};
    (usersR.data || []).forEach(u => { cnt[u.rol_id] = (cnt[u.rol_id] || 0) + (u.activo ? 1 : 0); });
    setUserCount(cnt);
    setLoading(false);
  }, [onRolesChange]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const eliminarRol = async (r) => {
    if (r.es_sistema) { alert("No puedes eliminar un rol del sistema."); return; }
    if (!window.confirm(`¿Eliminar el rol "${r.nombre}"?`)) return;
    await supabase.from("roles").delete().eq("id", r.id);
    fetchAll();
  };

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>Cargando roles...</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 24, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{roles.length} roles definidos</span>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => { setEditando(null); setShowModal(true); }}
            style={{ background: B.sky, color: B.navy, border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            + Nuevo rol
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
        {roles.map(r => {
          const esSistema = r.es_sistema;
          const esTotal   = r.permisos?.["*"];
          const modsCount = esTotal ? MODULOS.length : Object.values(r.permisos || {}).filter(p => p.ver).length;
          const uc        = userCount[r.id] || 0;
          return (
            <div key={r.id} style={{ background: B.navyMid, borderRadius: 14, padding: 22, border: `1px solid ${(r.color || B.sky)}33` }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: (r.color || B.sky) + "22", border: `2px solid ${(r.color || B.sky)}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                  {r.id === "super_admin" ? "🔑" : r.id === "admin" ? "👑" : r.id === "operador" ? "⚙" : r.id === "visor" ? "👁" : "🏷"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{r.nombre}</span>
                    {esSistema && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: B.navyLight, color: "rgba(255,255,255,0.4)" }}>sistema</span>}
                  </div>
                  {r.descripcion && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{r.descripcion}</div>}
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={() => { setEditando(r); setShowModal(true); }}
                    style={{ background: B.navyLight, color: B.sand, border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>Editar</button>
                  {!esSistema && (
                    <button onClick={() => eliminarRol(r)}
                      style={{ background: B.danger + "22", color: B.danger, border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11, cursor: "pointer" }}>✕</button>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, background: B.navy, borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: r.color || B.sky }}>{uc}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>usuarios activos</div>
                </div>
                <div style={{ flex: 1, background: B.navy, borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, color: esTotal ? B.danger : B.sand }}>{modsCount}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>módulos con acceso</div>
                </div>
              </div>

              {/* Permisos resumen */}
              {esTotal ? (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: B.danger + "15", border: `1px solid ${B.danger}22`, fontSize: 12, color: B.danger, fontWeight: 700 }}>
                  🔑 Acceso total — todos los módulos y acciones
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 6 }}>Vista previa de permisos</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {MODULOS.filter(m => r.permisos?.[m.key]?.ver).map(m => (
                      <span key={m.key} style={{ fontSize: 11, padding: "3px 7px", borderRadius: 5, background: B.navyLight, color: "rgba(255,255,255,0.6)" }}>
                        {m.icon} {m.label}
                      </span>
                    ))}
                    {MODULOS.filter(m => r.permisos?.[m.key]?.ver).length === 0 && (
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Sin módulos activos</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <RolModal
          rol={editando}
          onClose={() => { setShowModal(false); setEditando(null); }}
          onSaved={() => { setShowModal(false); setEditando(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// MÓDULO PRINCIPAL
// ════════════════════════════════════════════════════════
export default function Usuarios() {
  const [tab,   setTab]   = useState("usuarios");
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    if (supabase) {
      supabase.from("roles").select("*").order("created_at").then(({ data }) => setRoles(data || []));
    }
  }, []);

  const TABS = [
    { key: "usuarios", label: "👤 Usuarios",   desc: "Gestión de usuarios con acceso a Atolon OS" },
    { key: "roles",    label: "🔑 Roles",       desc: "Define roles y permisos por módulo del sistema" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 4 }}>Usuarios & Roles</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{TABS.find(t => t.key === tab)?.desc}</p>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 24, background: B.navyMid, borderRadius: 12, padding: 4 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex: 1, padding: "11px 20px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: tab === t.key ? 700 : 500, background: tab === t.key ? B.sky : "transparent", color: tab === t.key ? B.navy : "rgba(255,255,255,0.5)", transition: "all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "usuarios" && <TabUsuarios roles={roles} onRolesNeed={() => {}} />}
      {tab === "roles"    && <TabRoles roles={roles} onRolesChange={setRoles} />}
    </div>
  );
}
