import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabase";

const B = {
  navy: "#0D1B3E", navyMid: "#172554", navyLight: "#1e293b",
  sky: "#8ECAE6", sand: "#C8B99A", white: "#F8FAFC",
  success: "#22c55e", danger: "#ef4444", warning: "#f59e0b",
};

const BTN = (bg, color = "#fff") => ({ padding: "8px 14px", borderRadius: 8, border: "none", background: bg, color, cursor: "pointer", fontWeight: 700, fontSize: 12 });
const IS = { width: "100%", padding: "9px 12px", borderRadius: 8, background: B.navyLight, border: `1px solid ${B.navyLight}`, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };
const LS = { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

const CATEGORIAS = [
  "Seguridad", "Servicio", "Operaciones", "Onboarding",
  "Hotel", "A&B", "RRHH", "Mantenimiento", "Comercial", "Otro",
];

const uid = () => Math.random().toString(36).slice(2, 11);
const fmtFecha = (d) => d ? new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtHora = (d) => d ? new Date(d).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

function tipoFromFile(fname = "") {
  const ext = fname.split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return "pdf";
  if (["doc", "docx"].includes(ext)) return "docx";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "img";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  return ext || "archivo";
}

function iconoTipo(tipo) {
  if (tipo === "pdf") return "📕";
  if (tipo === "docx" || tipo === "doc") return "📄";
  if (tipo === "img") return "🖼️";
  if (tipo === "video") return "🎬";
  if (tipo === "link") return "🔗";
  return "📎";
}

export default function RHManuales() {
  const [manuales, setManuales] = useState([]);
  const [acuses, setAcuses] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("activos"); // activos | todos
  const [filtroCat, setFiltroCat] = useState("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [mR, aR, eR] = await Promise.all([
      supabase.from("rh_manuales").select("*").order("created_at", { ascending: false }),
      supabase.from("rh_manual_acuses").select("*").order("fecha_acuse", { ascending: false }),
      supabase.from("rh_empleados").select("id,nombres,apellidos,cargo,departamento_id").eq("activo", true).order("apellidos"),
    ]);
    setManuales(mR.data || []);
    setAcuses(aR.data || []);
    setEmpleados(eR.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const total = manuales.length;
  const activos = manuales.filter(m => m.activo).length;
  const requeridos = manuales.filter(m => m.requerido && m.activo).length;
  const totalAcuses = acuses.length;

  const acusesPorManual = useMemo(() => {
    const m = {};
    for (const a of acuses) (m[a.manual_id] = m[a.manual_id] || []).push(a);
    return m;
  }, [acuses]);

  const visibles = useMemo(() => {
    let list = manuales;
    if (tab === "activos") list = list.filter(m => m.activo);
    if (filtroCat) list = list.filter(m => m.categoria === filtroCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(m =>
        (m.titulo || "").toLowerCase().includes(q) ||
        (m.descripcion || "").toLowerCase().includes(q) ||
        (m.categoria || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [manuales, tab, filtroCat, search]);

  const editing = editId ? manuales.find(m => m.id === editId) : null;
  const opened = openId ? manuales.find(m => m.id === openId) : null;

  return (
    <div style={{ padding: 20, fontFamily: "'Inter', 'Segoe UI', sans-serif", color: "#fff", minHeight: "100vh", background: B.navy }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>📚 Manuales</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Documentos internos, protocolos y onboarding.</div>
        </div>
        <button onClick={() => setShowNew(true)} style={BTN(B.sky, B.navy)}>+ Nuevo manual</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { l: "Total", v: total, c: B.sky },
          { l: "Activos", v: activos, c: B.success },
          { l: "Requeridos", v: requeridos, c: B.warning },
          { l: "Acuses", v: totalAcuses, c: B.sand },
        ].map((k, i) => (
          <div key={i} style={{ background: B.navyMid, padding: 12, borderRadius: 10, borderLeft: `3px solid ${k.c}` }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.c }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Tabs + filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {[{ k: "activos", l: "Activos" }, { k: "todos", l: "Todos" }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ ...BTN(tab === t.k ? B.sky : B.navyMid, tab === t.k ? B.navy : "#fff") }}>
            {t.l}
          </button>
        ))}
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ ...IS, width: 180 }}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...IS, maxWidth: 260, flex: 1, minWidth: 180 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Cargando…</div>
      ) : visibles.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)", background: B.navyMid, borderRadius: 10 }}>
          No hay manuales. Crea el primero con “+ Nuevo manual”.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
          {visibles.map(m => {
            const n = (acusesPorManual[m.id] || []).length;
            const totalEmp = empleados.length || 1;
            const pct = Math.round((n / totalEmp) * 100);
            return (
              <div key={m.id} onClick={() => setOpenId(m.id)} style={{
                background: B.navyMid, padding: 14, borderRadius: 12, cursor: "pointer",
                borderTop: `3px solid ${m.activo ? B.sky : "rgba(255,255,255,0.1)"}`,
                transition: "transform 120ms",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 28 }}>{iconoTipo(m.tipo_archivo)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{m.titulo}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                      {m.categoria || "Sin categoría"} · v{m.version || "1.0"}
                    </div>
                  </div>
                </div>
                {m.descripcion && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {m.descripcion}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {m.requerido && <span style={{ fontSize: 10, background: B.warning, color: B.navy, padding: "2px 6px", borderRadius: 4, fontWeight: 800 }}>REQUERIDO</span>}
                  {!m.activo && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4 }}>Archivado</span>}
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}>
                    {n}/{totalEmp} acusaron ({pct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showNew || editing) && (
        <ManualModal
          manual={editing}
          onClose={() => { setShowNew(false); setEditId(null); }}
          onSaved={() => { setShowNew(false); setEditId(null); load(); }}
        />
      )}
      {opened && (
        <DetalleModal
          manual={opened}
          acuses={acusesPorManual[opened.id] || []}
          empleados={empleados}
          onClose={() => setOpenId(null)}
          onEdit={() => { setOpenId(null); setEditId(opened.id); }}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}

// ─── Modal Nuevo/Editar ─────────────────────────────────────────────────────
function ManualModal({ manual, onClose, onSaved }) {
  const [titulo, setTitulo] = useState(manual?.titulo || "");
  const [descripcion, setDescripcion] = useState(manual?.descripcion || "");
  const [categoria, setCategoria] = useState(manual?.categoria || "Operaciones");
  const [version, setVersion] = useState(manual?.version || "1.0");
  const [requerido, setRequerido] = useState(!!manual?.requerido);
  const [activo, setActivo] = useState(manual?.activo !== false);
  const [url, setUrl] = useState(manual?.url || "");
  const [urlNombre, setUrlNombre] = useState(manual?.url_nombre || "");
  const [tipo, setTipo] = useState(manual?.tipo_archivo || "");
  const [notas, setNotas] = useState(manual?.notas || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr("");
    try {
      const safe = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from("rh-manuales").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("rh-manuales").getPublicUrl(path);
      setUrl(pub.publicUrl);
      setUrlNombre(file.name);
      setTipo(tipoFromFile(file.name));
    } catch (e) {
      setErr("Error subiendo archivo: " + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!titulo.trim()) { setErr("Falta título"); return; }
    setSaving(true); setErr("");
    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      categoria,
      version,
      requerido,
      activo,
      url: url || null,
      url_nombre: urlNombre || null,
      tipo_archivo: tipo || (url ? "link" : null),
      notas: notas.trim() || null,
      updated_at: new Date().toISOString(),
    };
    let r;
    if (manual?.id) {
      r = await supabase.from("rh_manuales").update(payload).eq("id", manual.id);
    } else {
      const { data: s } = await supabase.auth.getUser();
      r = await supabase.from("rh_manuales").insert({
        id: "MAN-" + uid().toUpperCase(),
        ...payload,
        created_by: s?.user?.email || null,
      });
    }
    setSaving(false);
    if (r.error) { setErr(r.error.message); return; }
    onSaved();
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
        {manual ? "Editar manual" : "Nuevo manual"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Título *</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} style={IS} placeholder="Protocolo de evacuación, Manual de bienvenida…" />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Descripción</label>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} style={{ ...IS, minHeight: 70, resize: "vertical" }} />
        </div>
        <div>
          <label style={LS}>Categoría</label>
          <select value={categoria} onChange={e => setCategoria(e.target.value)} style={IS}>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={LS}>Versión</label>
          <input value={version} onChange={e => setVersion(e.target.value)} style={IS} placeholder="1.0" />
        </div>
        <div style={{ gridColumn: "1 / -1", background: B.navyLight, padding: 12, borderRadius: 8 }}>
          <label style={LS}>Archivo</label>
          {url ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{iconoTipo(tipo)}</span>
              <a href={url} target="_blank" rel="noreferrer" style={{ color: B.sky, fontSize: 13, textDecoration: "none", flex: 1, wordBreak: "break-all" }}>
                {urlNombre || url}
              </a>
              <button onClick={() => { setUrl(""); setUrlNombre(""); setTipo(""); }} style={BTN(B.danger)}>Quitar</button>
            </div>
          ) : null}
          <input type="file" onChange={handleFile} disabled={uploading}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm" style={{ color: "#fff", fontSize: 12 }} />
          {uploading && <div style={{ fontSize: 11, color: B.warning, marginTop: 6 }}>Subiendo…</div>}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
            También puedes pegar un link externo:
          </div>
          <input value={url} onChange={e => { setUrl(e.target.value); if (!urlNombre) setUrlNombre(e.target.value); setTipo("link"); }}
            placeholder="https://…" style={{ ...IS, marginTop: 6 }} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LS}>Notas internas</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} style={{ ...IS, minHeight: 50, resize: "vertical" }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={requerido} onChange={e => setRequerido(e.target.checked)} />
          Lectura requerida para todos
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
          Activo
        </label>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cancelar</button>
        <button onClick={save} disabled={saving || uploading} style={BTN(B.sky, B.navy)}>
          {saving ? "Guardando…" : (manual ? "Guardar cambios" : "Crear manual")}
        </button>
      </div>
    </Overlay>
  );
}

// ─── Modal Detalle ──────────────────────────────────────────────────────────
function DetalleModal({ manual, acuses, empleados, onClose, onEdit, onChanged }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [acusing, setAcusing] = useState("");
  const [err, setErr] = useState("");

  const acusadosIds = useMemo(() => new Set(acuses.map(a => a.empleado_id)), [acuses]);
  const pendientes = empleados.filter(e => !acusadosIds.has(e.id));
  const acusados = empleados.filter(e => acusadosIds.has(e.id));

  async function registrarAcuse(emp) {
    setAcusing(emp.id); setErr("");
    const r = await supabase.from("rh_manual_acuses").insert({
      id: "ACU-" + uid().toUpperCase(),
      manual_id: manual.id,
      empleado_id: emp.id,
      empleado_nombre: `${emp.nombres || ""} ${emp.apellidos || ""}`.trim(),
    });
    setAcusing("");
    if (r.error) { setErr(r.error.message); return; }
    onChanged();
  }

  async function eliminar() {
    if (manual.url) {
      // intentar borrar del bucket (path = última parte después del bucket)
      const match = manual.url.match(/rh-manuales\/(.+)$/);
      if (match) {
        await supabase.storage.from("rh-manuales").remove([match[1]]);
      }
    }
    const r = await supabase.from("rh_manuales").delete().eq("id", manual.id);
    if (r.error) { setErr(r.error.message); return; }
    onClose();
    onChanged();
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 34 }}>{iconoTipo(manual.tipo_archivo)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{manual.titulo}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
            {manual.categoria || "Sin categoría"} · v{manual.version || "1.0"} · creado {fmtFecha(manual.created_at)}
          </div>
        </div>
      </div>

      {manual.descripcion && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {manual.descripcion}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {manual.url && (
          <a href={manual.url} target="_blank" rel="noreferrer" style={{ ...BTN(B.sky, B.navy), textDecoration: "none" }}>
            📥 Abrir {manual.url_nombre ? `(${manual.url_nombre})` : ""}
          </a>
        )}
        <button onClick={onEdit} style={BTN(B.navyLight)}>✏️ Editar</button>
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} style={BTN("transparent", B.danger)}>🗑 Eliminar</button>
        ) : (
          <>
            <span style={{ fontSize: 12, color: B.danger, alignSelf: "center" }}>¿Seguro?</span>
            <button onClick={eliminar} style={BTN(B.danger)}>Sí, eliminar</button>
            <button onClick={() => setConfirmDel(false)} style={BTN(B.navyLight)}>Cancelar</button>
          </>
        )}
      </div>

      {manual.notas && (
        <div style={{ padding: 10, background: B.navyLight, borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>Notas internas</div>
          {manual.notas}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${B.navyLight}`, paddingTop: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>
          Acuses {manual.requerido && <span style={{ fontSize: 11, background: B.warning, color: B.navy, padding: "2px 6px", borderRadius: 4, marginLeft: 6 }}>REQUERIDO</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: B.success, fontWeight: 700, marginBottom: 6 }}>
              ✓ Acusaron ({acusados.length})
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", background: B.navyLight, borderRadius: 8, padding: 6 }}>
              {acusados.length === 0 ? (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", padding: 8, textAlign: "center" }}>—</div>
              ) : acusados.map(e => {
                const a = acuses.find(x => x.empleado_id === e.id);
                return (
                  <div key={e.id} style={{ padding: 6, fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontWeight: 600 }}>{e.nombres} {e.apellidos}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{fmtHora(a?.fecha_acuse)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: B.warning, fontWeight: 700, marginBottom: 6 }}>
              ⧗ Pendientes ({pendientes.length})
            </div>
            <div style={{ maxHeight: 220, overflowY: "auto", background: B.navyLight, borderRadius: 8, padding: 6 }}>
              {pendientes.length === 0 ? (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", padding: 8, textAlign: "center" }}>Todos acusaron ✓</div>
              ) : pendientes.map(e => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", padding: 6, fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.05)", gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{e.nombres} {e.apellidos}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{e.cargo || ""}</div>
                  </div>
                  <button onClick={() => registrarAcuse(e)} disabled={acusing === e.id}
                    style={{ ...BTN(B.success), padding: "4px 8px", fontSize: 10 }}>
                    {acusing === e.id ? "…" : "Marcar"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.15)", color: B.danger, borderRadius: 8, fontSize: 12 }}>{err}</div>}

      <div style={{ marginTop: 16, textAlign: "right" }}>
        <button onClick={onClose} style={BTN(B.navyLight)}>Cerrar</button>
      </div>
    </Overlay>
  );
}

// ─── Overlay genérico ───────────────────────────────────────────────────────
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
